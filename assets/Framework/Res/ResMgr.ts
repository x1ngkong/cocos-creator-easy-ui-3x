/*************************************************************************************
 * @File        : ResMgr.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 资源管理器（Promise 加载、并发去重、引用计数、空闲 GC）
 *
 * 生命周期：
 *   Load  →  refCount++，记录 lastUsed
 *   使用中  →  refCount > 0，永不被 GC 回收
 *   Release →  refCount--，归零后进入「冷却态」（资源仍在缓存）
 *   冷却中  →  refCount = 0，GC 每隔 gcInterval 秒扫描
 *   GC 命中 →  距最后使用超过 idleTimeout 秒，从缓存释放
 *
 * 核心特性：
 *   1. Promise 化 API，支持 async/await
 *   2. 并发去重：同路径同时发起多次加载，只产生一次实际请求
 *   3. 引用计数：每个 Load 调用方独立计数，N 个并发 Load → refCount = N
 *   4. 空闲超时：冷却态资源超过 idleTimeout 秒未被访问，自动释放
 *   5. 批量加载：LoadBatch 并发加载，支持整体进度回调
 *   6. Get 同步获取：命中缓存自动刷新最后访问时间
 *************************************************************************************/

import { Asset, AssetManager, assetManager, Constructor } from "cc";
import { ITimerHandle, TimerMgr } from "../Util/TimerMgr";

// ─── 内部类型 ────────────────────────────────────────────────────────────────────

export interface IResTask {
    /** 资源路径 */
    path: string;
    /** 资源类型 */
    type: Constructor<Asset>;
    /** 资源所在 bundle，默认 resources */
    bundleName?: string;
}

export interface IBundleTask {
    /** bundle 名称 */
    bundleName: string;
}

export class ResMgr {
    private static readonly mDefaultBundleName = "resources";
    /** 已加载资源缓存（refCount > 0 为活跃态，= 0 为冷却态） */
    private static readonly mCache = new Map<string, Asset>();
    /** 引用计数 */
    private static readonly mRefCount = new Map<string, number>();
    /** 最后访问时间戳（ms），用于 GC 判断冷却态资源是否超时 */
    private static readonly mLastUsed = new Map<string, number>();
    /**
     * 正在进行的加载 Promise（并发去重）。
     * 存储的是「原始 Promise」，不携带任何引用计数副作用；
     * 每个调用方通过 WrapWithIncrement 各自追加计数逻辑。
     */
    private static readonly mPending = new Map<string, Promise<Asset | null>>();
    /** 已加载 bundle 缓存 */
    private static readonly mBundleCache = new Map<string, AssetManager.Bundle>();
    /** 正在加载中的 bundle Promise（并发去重） */
    private static readonly mBundlePending = new Map<string, Promise<AssetManager.Bundle | null>>();
    /** bundle 版本号；ReleaseBundle 后递增，用于丢弃旧的在途加载回调 */
    private static readonly mBundleGeneration = new Map<string, number>();

    /** 冷却态资源的空闲超时（秒），超过后 GC 释放；默认 60s */
    private static mIdleTimeout = 60;
    /** GC 扫描间隔（秒） */
    private static readonly mGcInterval = 30;
    /** GC 定时器句柄（首次 Load 成功时启动一次，进程内不再重置） */
    private static mGcTimer: ITimerHandle | null = null;
    /** 是否允许自动 GC（默认 true；调用 SetGcEnabled(false) 可关闭） */
    private static mGcEnabled = true;
    /** 是否打印 GC 调试日志（默认 false，按需通过 SetGcLog 开启） */
    private static mGcLog = false;
    /**
     * 全局版本号；每次 ReleaseAll 自增。
     * 在途加载的回调通过比对版本号判断结果是否已过期，防止污染新状态。
     */
    private static mGeneration = 0;

    /**
     * 设置冷却态资源的空闲超时（秒）。
     * refCount 归零后，超过此秒数未被访问的资源将在下次 GC 时释放。
     * 最小值 5s，默认 60s。
     */
    public static SetIdleTimeout(seconds: number): void {
        this.mIdleTimeout = Math.max(5, seconds);
    }

    /**
     * 启用或禁用自动 GC（默认启用）。
     * 关闭后 EnsureGcTimer 不再启动新定时器；同时取消当前正在运行的 GC 定时器。
     */
    public static SetGcEnabled(enabled: boolean): void {
        this.mGcEnabled = enabled;
        if (!enabled && this.mGcTimer && !this.mGcTimer.isDone) {
            this.mGcTimer.Cancel();
            this.mGcTimer = null;
        }
    }

    /** 开启或关闭 GC 调试日志（默认关闭，线上请勿开启）。 */
    public static SetGcLog(enabled: boolean): void {
        this.mGcLog = enabled;
    }

    /**
     * 加载单个资源。
     * - 缓存命中（含冷却态）→ 直接返回，refCount++ 并刷新访问时间
     * - 正在加载中 → 共享同一底层 Promise，各调用方独立计数
     * - 未加载 → 发起新请求，完成后写入缓存
     */
    public static Load<T extends Asset>(path: string, type: Constructor<T>, bundleName: string = this.mDefaultBundleName): Promise<T | null> {
        return this.LoadFromBundle(bundleName, path, type);
    }

    /**
     * 从指定 bundle 加载单个资源。
     * - bundle 会先通过 LoadBundle 并发去重加载
     * - 缓存 key 包含 bundleName，避免不同 bundle 下同路径资源互相覆盖
     */
    public static LoadFromBundle<T extends Asset>(bundleName: string, path: string, type: Constructor<T>): Promise<T | null> {
        const key = this.BuildResKey(bundleName, path);
        const cached = this.mCache.get(key);
        if (cached) {
            this.mRefCount.set(key, (this.mRefCount.get(key) ?? 0) + 1);
            this.mLastUsed.set(key, Date.now());
            return Promise.resolve(cached as T);
        }

        const pending = this.mPending.get(key);
        if (pending) return this.WrapWithIncrement<T>(key, pending);

        const gen = this.mGeneration;
        const bundleGen = this.GetBundleGeneration(bundleName);
        const basePromise = this.LoadBundle(bundleName).then(bundle => {
            if (!bundle) {
                this.DeletePendingIfCurrent(key, basePromise);
                return null;
            }
            return new Promise<Asset | null>(resolve => {
                bundle.load(path, type, (err: Error | null, asset: T | null) => {
                    this.DeletePendingIfCurrent(key, basePromise);

                    if (err || !asset) {
                        console.error(`[ResMgr] Load failed: "${key}"`, err);
                        resolve(null);
                        return;
                    }

                    if (this.mGeneration !== gen || this.GetBundleGeneration(bundleName) !== bundleGen) {
                        assetManager.releaseAsset(asset);
                        resolve(null);
                        return;
                    }

                    // 3.x 资源释放依赖引用计数，缓存持有一份引擎引用。
                    asset.addRef();
                    this.mCache.set(key, asset);
                    this.mRefCount.set(key, 0);
                    this.mLastUsed.set(key, Date.now());
                    this.EnsureGcTimer();
                    resolve(asset);
                });
            });
        });

        this.mPending.set(key, basePromise);
        return this.WrapWithIncrement<T>(key, basePromise);
    }

    /**
     * 批量加载多个资源，并发执行，支持整体进度回调。
     * @returns 与 tasks 顺序对应的资源数组（失败项为 null）
     */
    public static LoadBatch(
        tasks: IResTask[],
        onProgress?: (completed: number, total: number) => void,
    ): Promise<Array<Asset | null>> {
        if (!tasks.length) return Promise.resolve([]);
        let completed = 0;
        const total = tasks.length;
        return Promise.all(
            tasks.map(task =>
                this.Load(task.path, task.type, task.bundleName).then(asset => {
                    onProgress?.(++completed, total);
                    return asset;
                }),
            ),
        );
    }

    /**
     * 预加载（非阻塞）。
     * 将资源写入缓存，refCount 维持为 0（冷却态）。
     * 后续 Load / Get 命中缓存时无异步延迟；若长时间无访问，GC 自动回收。
     */
    public static Preload<T extends Asset>(path: string, type: Constructor<T>, bundleName: string = this.mDefaultBundleName): void {
        this.PreloadFromBundle(bundleName, path, type);
    }

    /** 预加载指定 bundle 内的资源 */
    public static PreloadFromBundle<T extends Asset>(bundleName: string, path: string, type: Constructor<T>): void {
        const key = this.BuildResKey(bundleName, path);
        if (this.mCache.has(key) || this.mPending.has(key)) return;
        this.LoadFromBundle(bundleName, path, type).then(asset => {
            if (!asset) return;
            this.Deref(key);
        });
    }

    /**
     * 同步获取已缓存资源，命中时刷新最后访问时间（延缓 GC 回收）。
     * 不改变引用计数，通常配合 Preload 使用。
     */
    public static Get<T extends Asset>(path: string, bundleName: string = this.mDefaultBundleName): T | null {
        const key = this.BuildResKey(bundleName, path);
        const asset = this.mCache.get(key) as T ?? null;
        if (asset) this.mLastUsed.set(key, Date.now());
        return asset;
    }

    /** 手动增加引用计数，同时刷新访问时间 */
    public static Retain(path: string, bundleName: string = this.mDefaultBundleName): void {
        const key = this.BuildResKey(bundleName, path);
        if (!this.mCache.has(key)) return;
        this.mRefCount.set(key, (this.mRefCount.get(key) ?? 0) + 1);
        this.mLastUsed.set(key, Date.now());
    }

    /**
     * 释放一次引用。
     * 引用归零后资源进入冷却态（仍留在缓存），由 GC 在超时后回收。
     */
    public static Release(path: string, bundleName: string = this.mDefaultBundleName): void {
        const key = this.BuildResKey(bundleName, path);
        if (!this.mCache.has(key)) {
            console.warn(`[ResMgr] Release: "${key}" is not in cache, possible over-release.`);
            return;
        }
        this.Deref(key);
    }

    /**
     * 立即释放所有缓存资源（场景切换时调用）。
     * 同时使所有在途加载结果失效，防止旧回调污染新状态。
     */
    public static ReleaseAll(): void {
        this.mGeneration++;
        this.mPending.clear();
        this.mBundlePending.clear();
        this.mCache.forEach(asset => assetManager.releaseAsset(asset));
        this.mCache.clear();
        this.mRefCount.clear();
        this.mLastUsed.clear();
        if (this.mGcTimer) {
            this.mGcTimer.Cancel();
            this.mGcTimer = null;
        }
    }

    /******************************* Bundle *******************************/

    /**
     * 加载 bundle。
     * 同一 bundleName 并发调用只会触发一次 assetManager.loadBundle。
     */
    public static LoadBundle(bundleName: string): Promise<AssetManager.Bundle | null> {
        const cached = this.mBundleCache.get(bundleName);
        if (cached) return Promise.resolve(cached);

        const pending = this.mBundlePending.get(bundleName);
        if (pending) return pending;

        const gen = this.GetBundleGeneration(bundleName);
        const promise = new Promise<AssetManager.Bundle | null>(resolve => {
            assetManager.loadBundle(bundleName, (err: Error | null, bundle: AssetManager.Bundle) => {
                this.mBundlePending.delete(bundleName);
                if (err || !bundle) {
                    console.error(`[ResMgr] LoadBundle failed: "${bundleName}"`, err);
                    resolve(null);
                    return;
                }
                if (this.GetBundleGeneration(bundleName) !== gen) {
                    assetManager.removeBundle(bundle);
                    resolve(null);
                    return;
                }
                this.mBundleCache.set(bundleName, bundle);
                resolve(bundle);
            });
        });

        this.mBundlePending.set(bundleName, promise);
        return promise;
    }

    /** 批量加载 bundle，返回顺序与 tasks 一致 */
    public static LoadBundleBatch(
        tasks: IBundleTask[],
        onProgress?: (completed: number, total: number) => void,
    ): Promise<Array<AssetManager.Bundle | null>> {
        if (!tasks.length) return Promise.resolve([]);
        let completed = 0;
        const total = tasks.length;
        return Promise.all(
            tasks.map(task =>
                this.LoadBundle(task.bundleName).then(bundle => {
                    onProgress?.(++completed, total);
                    return bundle;
                }),
            ),
        );
    }

    /** 同步获取已加载 bundle */
    public static GetBundle(bundleName: string): AssetManager.Bundle | null {
        return this.mBundleCache.get(bundleName) ?? assetManager.getBundle(bundleName) ?? null;
    }

    /**
     * 移除指定 bundle。
     * @param releaseAssets 是否同时释放本 ResMgr 缓存中该 bundle 的资源，默认 true
     */
    public static ReleaseBundle(bundleName: string, releaseAssets = true): void {
        const bundle = this.GetBundle(bundleName);
        this.BumpBundleGeneration(bundleName);
        this.mBundlePending.delete(bundleName);
        if (releaseAssets) this.ReleaseBundleAssets(bundleName);
        this.mBundleCache.delete(bundleName);
        if (bundle) assetManager.removeBundle(bundle);
    }

    /**
     * 扫描并释放所有「冷却态且超过空闲超时」的资源。
     * 由 TimerMgr 定时器自动调用，也可手动触发。
     */
    public static GC(): void {
        const now = Date.now();
        const expired: string[] = [];

        this.mCache.forEach((_, path) => {
            if ((this.mRefCount.get(path) ?? 0) > 0) return;
            const idle = (now - (this.mLastUsed.get(path) ?? 0)) / 1000;
            if (idle >= this.mIdleTimeout) expired.push(path);
        });

        if (!expired.length) return;

        expired.forEach(path => {
            const asset = this.mCache.get(path);
            this.mCache.delete(path);
            this.mRefCount.delete(path);
            this.mLastUsed.delete(path);
            if (asset) assetManager.releaseAsset(asset);
        });
        if (this.mGcLog) console.log(`[ResMgr] GC released ${expired.length} idle resource(s):`, expired);
    }

    /******************************* 查询 *******************************/

    /** 是否缓存中存在指定资源 */
    public static Has(path: string): boolean {
        return this.mCache.has(this.BuildResKey(this.mDefaultBundleName, path));
    }

    /** 是否缓存中存在指定 bundle 内的指定资源 */
    public static HasInBundle(bundleName: string, path: string): boolean {
        return this.mCache.has(this.BuildResKey(bundleName, path));
    }

    /** 获取指定资源当前引用计数 */
    public static GetRefCount(path: string, bundleName: string = this.mDefaultBundleName): number {
        return this.mRefCount.get(this.BuildResKey(bundleName, path)) ?? 0;
    }

    /** 获取冷却态（refCount=0）资源列表，用于调试 */
    public static GetIdleList(): string[] {
        const result: string[] = [];
        this.mCache.forEach((_, path) => {
            if ((this.mRefCount.get(path) ?? 0) === 0) result.push(path);
        });
        return result;
    }

    /**
     * 将一个底层 Promise 包装为「落地后自动 refCount++」的新 Promise。
     * mPending 中只存储原始 Promise，每个调用方各自包装，
     * 从而保证 N 个并发调用方 → 最终 refCount = N。
     */
    private static async WrapWithIncrement<T extends Asset>(
        key: string,
        base: Promise<Asset | null>,
    ): Promise<T | null> {
        return base.then(asset => {
            if (!asset || !this.mCache.has(key)) return null;
            this.mRefCount.set(key, (this.mRefCount.get(key) ?? 0) + 1);
            this.mLastUsed.set(key, Date.now());
            return asset as T;
        });
    }

    /** 减少引用计数；归零后进入冷却态，不立即释放 */
    private static Deref(path: string): void {
        const current = this.mRefCount.get(path) ?? 0;
        if (current <= 0) return;
        this.mRefCount.set(path, current - 1);
    }

    /** 构建资源缓存 key */
    private static BuildResKey(bundleName: string, path: string): string {
        return `${bundleName}:${path}`;
    }

    /** 释放指定 bundle 内的所有资源 */
    private static ReleaseBundleAssets(bundleName: string): void {
        const prefix = `${bundleName}:`;
        const keys: string[] = [];
        this.mCache.forEach((_, key) => {
            if (key.startsWith(prefix)) keys.push(key);
        });
        keys.forEach(key => {
            const asset = this.mCache.get(key);
            this.mCache.delete(key);
            this.mRefCount.delete(key);
            this.mLastUsed.delete(key);
            if (asset) assetManager.releaseAsset(asset);
        });
    }

    /** 获取指定 bundle 当前版本号 */
    private static GetBundleGeneration(bundleName: string): number {
        return this.mBundleGeneration.get(bundleName) ?? 0;
    }

    /** 递增指定 bundle 版本号 */
    private static BumpBundleGeneration(bundleName: string): void {
        this.mBundleGeneration.set(bundleName, this.GetBundleGeneration(bundleName) + 1);
    }

    /** 仅清理当前加载 Promise，避免旧回调误删后续重试产生的新 pending */
    private static DeletePendingIfCurrent(key: string, pending: Promise<Asset | null>): void {
        if (this.mPending.get(key) === pending) this.mPending.delete(key);
    }

    /** 确保 GC 定时器已启动（首次 Load 成功时触发，进程内仅启动一次） */
    private static EnsureGcTimer(): void {
        if (!this.mGcEnabled) return;
        if (this.mGcTimer && !this.mGcTimer.isDone) return;
        this.mGcTimer = TimerMgr.Loop(() => this.GC(), this.mGcInterval, this);
    }
}
