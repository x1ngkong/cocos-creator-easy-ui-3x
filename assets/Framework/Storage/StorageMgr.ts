/*************************************************************************************
 * @File        : StorageMgr.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 本地存储管理器（封装 cc.sys.localStorage，类型安全、前缀隔离）
 *
 * 设计要点：
 *   1. 前缀隔离：SetPrefix 设置 Key 命名空间，多账号/多存档场景无键冲突
 *   2. 类型安全：String / Number / Bool / Object 各自独立接口，杜绝隐式转换错误
 *   3. 默认值：所有 Get 方法支持 defaultValue，避免大量 ?? 散落在业务代码中
 *   4. JSON 安全：SetObject/GetObject 的 stringify/parse 均包含 try-catch 保护
 *
 * ── 用法速查 ─────────────────────────────────────────────────────────────────────
 *
 *   // 建议在游戏启动时设置前缀（通常为 appId 或玩家账号 ID）
 *   StorageMgr.SetPrefix("player_10086");
 *
 *   // 基础类型
 *   StorageMgr.SetNumber("coin", 999);
 *   const coin = StorageMgr.GetNumber("coin");           // 999
 *   const vip  = StorageMgr.GetBool("isVip", false);     // false（首次读取返回默认值）
 *
 *   // 对象（自动 JSON 序列化）
 *   StorageMgr.SetObject("settings", { bgm: true, sfx: false });
 *   const settings = StorageMgr.GetObject<{ bgm: boolean; sfx: boolean }>("settings");
 *
 *   // 判断 / 删除
 *   if (StorageMgr.Has("firstLaunch")) { ... }
 *   StorageMgr.Remove("firstLaunch");
 *
 *************************************************************************************/

import { sys } from "cc";

export class StorageMgr {
    /** Key 前缀（含尾部下划线），由 SetPrefix 维护 */
    private static mPrefix = "";

    /**
     * 设置 Key 前缀（建议在游戏启动时以玩家 ID 或 AppId 调用一次）。
     * 传空字符串则清除前缀。
     */
    public static SetPrefix(prefix: string): void {
        this.mPrefix = prefix ? `${prefix}_` : "";
    }

    /** 获取当前 Key 前缀（不含尾部下划线，主要用于调试） */
    public static GetPrefix(): string {
        return this.mPrefix.endsWith("_") ? this.mPrefix.slice(0, -1) : this.mPrefix;
    }

    /** 存储字符串 */
    public static SetString(key: string, value: string): void {
        sys.localStorage.setItem(this.BuildKey(key), value);
    }

    /** 读取字符串 */
    public static GetString(key: string, defaultValue: string = ""): string {
        const raw = sys.localStorage.getItem(this.BuildKey(key));
        return raw !== null ? raw : defaultValue;
    }

    /** 存储数字 */
    public static SetNumber(key: string, value: number): void {
        sys.localStorage.setItem(this.BuildKey(key), String(value));
    }

    /** 读取数字 */
    public static GetNumber(key: string, defaultValue: number = 0): number {
        const raw = sys.localStorage.getItem(this.BuildKey(key));
        if (raw === null) return defaultValue;
        const n = Number(raw);
        return isNaN(n) ? defaultValue : n;
    }

    /** 存储布尔值 */
    public static SetBool(key: string, value: boolean): void {
        sys.localStorage.setItem(this.BuildKey(key), value ? "1" : "0");
    }

    /** 读取布尔值 */
    public static GetBool(key: string, defaultValue: boolean = false): boolean {
        const raw = sys.localStorage.getItem(this.BuildKey(key));
        if (raw === null) return defaultValue;
        // 兼容 SetBool 写入的 "1"/"0" 以及外部直接写入的 "true"/"false"
        return raw === "1" || raw === "true";
    }

    /**
     * 存储对象（JSON 序列化）。
     * 序列化失败时仅打印 error，不会抛出异常，保证业务调用方稳定。
     */
    public static SetObject<T>(key: string, value: T): void {
        try {
            sys.localStorage.setItem(this.BuildKey(key), JSON.stringify(value));
        } catch (e) {
            console.error(`[StorageMgr] SetObject failed for key "${key}":`, e);
        }
    }

    /**
     * 读取对象（JSON 反序列化）。
     * Key 不存在或解析失败均返回 defaultValue（默认 null），不抛异常。
     */
    public static GetObject<T>(key: string, defaultValue: T | null = null): T | null {
        const raw = sys.localStorage.getItem(this.BuildKey(key));
        if (raw === null) return defaultValue;
        try {
            return JSON.parse(raw) as T;
        } catch (e) {
            console.warn(`[StorageMgr] GetObject parse failed for key "${key}", returning defaultValue.`);
            return defaultValue;
        }
    }

    /** 判断 Key 是否存在（含前缀） */
    public static Has(key: string): boolean {
        return sys.localStorage.getItem(this.BuildKey(key)) !== null;
    }

    /** 删除指定 Key（含前缀） */
    public static Remove(key: string): void {
        sys.localStorage.removeItem(this.BuildKey(key));
    }

    /** 构建 Key（含前缀） */
    private static BuildKey(key: string): string {
        return this.mPrefix + key;
    }
}
