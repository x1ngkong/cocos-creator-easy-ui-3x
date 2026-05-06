/*************************************************************************************
 * @File        : FrameLoader.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 分帧任务调度器（时间片驱动、优先级最大堆、批量进度追踪）
 *
 * 设计要点：
 *   1. 时间预算（Time-slicing）：每帧执行任务直到消耗 budgetMs 毫秒，精准控制帧耗时
 *      相比"每帧 N 个任务"，能自适应任务轻重，不浪费剩余时间也不超出预算
 *   2. 优先级最大堆：严格按 priority DESC、插入顺序 ASC 调度，O(log n) 插入/弹出
 *   3. 批量追踪：AddBatch 返回 IFrameBatch 句柄，统一监听进度与完成事件
 *   4. 取消支持：IFrameTask / IFrameBatch 均可随时 Cancel()
 *   5. 全局暂停/恢复：Pause() / Resume() 控制整个调度器
 *   6. TimerMgr.EveryFrame 驱动：依附引擎调度器，零常驻节点，与 cc.game 暂停同步
 *   7. 安全上限：mMaxPerFrame 作为保底限制，防止极端情况下帧内无限循环
 *
 * ── 用法示例 ────────────────────────────────────────────────────────────────────
 *
 * 【1. 单个任务】
 *   分帧实例化一个预制体，完成后回调：
 *
 *   const task = FrameLoader.Add(() => {
 *       const node = cc.instantiate(this.mPrefab);
 *       node.parent = this.node;
 *   });
 *   task.onComplete = () => console.log('节点已创建');
 *
 *   // 需要时可取消（若任务尚未执行）
 *   task.Cancel();
 *
 * 【2. 批量任务 + 进度条】
 *   分帧创建列表格子，实时更新进度，全部完成后收尾：
 *
 *   const batch = FrameLoader.AddBatch(
 *       this.mDataList.map(data => () => this.CreateCell(data)),
 *       {
 *           priority: 1,
 *           onProgress: (done, total) => {
 *               this.mProgressBar.progress = done / total;
 *           },
 *           onComplete: () => {
 *               this.mProgressBar.node.active = false;
 *               console.log('列表加载完毕');
 *           },
 *       }
 *   );
 *
 *   // 场景切换时整批取消
 *   batch.Cancel();
 *
 * 【3. 优先级调度】
 *   高优先级任务（如玩家可见区域）先于低优先级任务（如背景装饰）执行：
 *
 *   FrameLoader.AddBatch(visibleItems.map(i => () => this.Spawn(i)), { priority: 10 });
 *   FrameLoader.AddBatch(bgItems.map(i => () => this.Spawn(i)),      { priority:  0 });
 *
 * 【4. 全局配置（建议在游戏入口处设置一次）】
 *
 *   FrameLoader.SetBudgetMs(4);     // 每帧最多消耗 4ms，默认值
 *   FrameLoader.SetMaxPerFrame(200); // 单帧任务数安全上限，默认值
 *
 * 【5. 过场动画期间暂停，动画结束后恢复】
 *
 *   FrameLoader.Pause();
 *   // ... 播放过场动画 ...
 *   FrameLoader.Resume();
 *
 *************************************************************************************/

import { ITimerHandle, TimerMgr } from "./TimerMgr";

// ─── 公开接口 ────────────────────────────────────────────────────────────────────

/** 单个任务句柄 */
export interface IFrameTask {
    /** 取消任务（若已执行则无效） */
    Cancel(): void;
    /** 是否已结束（执行完毕或已取消） */
    readonly isDone: boolean;
    /** 任务执行完毕后触发（取消不触发）；可在 Add 后立即赋值 */
    onComplete: (() => void) | null;
}

/** 批量任务句柄 */
export interface IFrameBatch {
    /** 取消批量中所有尚未执行的任务 */
    Cancel(): void;
    /** 已成功执行的任务数 */
    readonly completed: number;
    /** 提交的总任务数 */
    readonly total: number;
    /** 是否已全部结束（已执行 + 已取消 = total） */
    readonly isDone: boolean;
}

/** 批量任务选项 */
export interface IFrameBatchOptions {
    /** 优先级（数值越大越先执行），默认 0 */
    priority?: number;
    /** 每完成一个任务时触发（取消不触发） */
    onProgress?: (completed: number, total: number) => void;
    /** 全部任务执行完毕时触发（若全部被取消则不触发） */
    onComplete?: () => void;
}

// ─── 内部类型 ────────────────────────────────────────────────────────────────────

/** 任务节点 */
interface ITaskNode {
    /** 任务函数 */
    fn: () => void;
    /** 优先级（数值越大越先执行），默认 0 */
    priority: number;
    /** 插入序，同优先级时保证 FIFO */
    order: number;
    /** 是否已取消 */
    cancelled: boolean;
    /** 是否已执行 */
    done: boolean;
    /** 任务执行完毕后触发（取消不触发）；可在 Add 后立即赋值 */
    onComplete: (() => void) | null;
    /** 所属批量上下文，无则为 null */
    batch: BatchContext | null;
}


/** 批量任务上下文 */
class BatchContext {
    public mCompleted = 0;
    public mSkipped = 0;
    public readonly mTotal: number;
    private readonly mOnProgress: ((c: number, t: number) => void) | null;
    private readonly mOnComplete: (() => void) | null;
    private mCompleteNotified = false;

    constructor(
        total: number,
        onProgress?: (c: number, t: number) => void,
        onComplete?: () => void,
    ) {
        this.mTotal = total;
        this.mOnProgress = onProgress ?? null;
        this.mOnComplete = onComplete ?? null;
    }

    get isDone(): boolean {
        return this.mCompleted + this.mSkipped >= this.mTotal;
    }

    NotifyDone(): void {
        this.mCompleted++;
        this.mOnProgress?.(this.mCompleted, this.mTotal);
        this.TryNotifyComplete();
    }

    NotifySkipped(): void {
        this.mSkipped++;
        this.TryNotifyComplete();
    }

    private TryNotifyComplete(): void {
        if (this.mCompleteNotified || !this.isDone || this.mCompleted <= 0) return;
        this.mCompleteNotified = true;
        this.mOnComplete?.();
    }
}

/** 单个任务实现类 */
class FrameTaskHandle implements IFrameTask {
    constructor(private readonly mNode: ITaskNode) { }

    /** 取消任务（若已执行则无效） */
    Cancel(): void {
        if (this.mNode.done || this.mNode.cancelled) return;
        this.mNode.cancelled = true;
        this.mNode.done = true;
    }

    /** 是否已结束（执行完毕或已取消） */
    get isDone(): boolean {
        return this.mNode.done || this.mNode.cancelled;
    }

    /** 任务执行完毕后触发（取消不触发）；可在 Add 后立即赋值 */
    get onComplete(): (() => void) | null {
        return this.mNode.onComplete;
    }

    /** 任务执行完毕后触发（取消不触发）；可在 Add 后立即赋值 */
    set onComplete(fn: (() => void) | null) {
        this.mNode.onComplete = fn;
    }
}

/** 批量任务实现类 */
class FrameBatchHandle implements IFrameBatch {
    constructor(
        private readonly mNodes: ITaskNode[],
        private readonly mCtx: BatchContext | null,
    ) { }

    /** 取消批量中所有尚未执行的任务 */
    Cancel(): void {
        this.mNodes.forEach(n => {
            if (!n.done && !n.cancelled) {
                n.cancelled = true;
                n.done = true;
                n.batch?.NotifySkipped();
            }
        });
    }

    /** 已成功执行的任务数 */
    get completed(): number { return this.mCtx?.mCompleted ?? 0; }
    /** 提交的总任务数 */
    get total(): number { return this.mCtx?.mTotal ?? 0; }
    /** 是否已全部结束（已执行 + 已取消 = total） */
    get isDone(): boolean { return this.mCtx?.isDone ?? true; }
}

// ─── 主类 ─────────────────────────────────────────────────────────────────────────

export class FrameLoader {
    /** 每帧时间预算（毫秒），默认 4ms（约占 60fps 帧时长 16.7ms 的 1/4） */
    private static mBudgetMs = 4;
    /**
     * 每帧执行任务数上限，默认 200。
     * 仅作保底防护；正常情况由时间预算控制。
     */
    private static mMaxPerFrame = 200;
    private static mPaused = false;
    /** 优先级最大堆 */
    private static readonly mHeap: ITaskNode[] = [];
    private static mOrder = 0;
    /** 每帧驱动定时器句柄（首次任务提交时启动一次，进程内常驻） */
    private static mDriver: ITimerHandle | null = null;

    /**
     * 设置每帧时间预算（毫秒）。
     * 推荐值：2 ~ 6ms（视目标帧率与任务复杂度调整）。
     */
    public static SetBudgetMs(ms: number): void {
        this.mBudgetMs = Math.max(1, ms);
    }

    /** 设置每帧任务数安全上限，防止极端情况下帧内过量执行。 */
    public static SetMaxPerFrame(n: number): void {
        this.mMaxPerFrame = Math.max(1, n);
    }

    /** 暂停调度（不清空队列） */
    public static Pause(): void { this.mPaused = true; }

    /** 恢复调度 */
    public static Resume(): void { this.mPaused = false; }

    /**
     * 清空所有待执行任务（已执行的不受影响）。
     * 未执行的任务会向所属 BatchContext 发送 NotifySkipped，
     * 确保批量句柄的进度状态正确结束，不会永久卡在未完成状态。
     */
    public static Clear(): void {
        while (this.mHeap.length) {
            const node = this.HeapPop();
            if (!node.cancelled && !node.done) {
                node.cancelled = true;
                node.batch?.NotifySkipped();
            }
        }
    }

    /** 当前待执行任务数 */
    public static get pendingCount(): number { return this.mHeap.length; }

    /**
     * 提交单个分帧任务。
     * @param fn        任务函数
     * @param priority  优先级，数值越大越先执行，默认 0
     * @returns         任务句柄，可用于取消或监听完成
     *
     * @example
     * const task = FrameLoader.Add(() => cc.instantiate(prefab));
     * task.onComplete = () => console.log('节点已创建');
     */
    public static Add(fn: () => void, priority: number = 0): IFrameTask {
        const node: ITaskNode = {
            fn, priority, order: this.mOrder++,
            cancelled: false, done: false,
            onComplete: null, batch: null,
        };
        this.HeapPush(node);
        this.EnsureDriver();
        return new FrameTaskHandle(node);
    }

    /**
     * 批量提交分帧任务，统一监听进度与完成。
     * @param fns     任务函数数组
     * @param options 批量选项（优先级、进度回调、完成回调）
     * @returns       批量句柄，可用于整体取消或查询进度
     *
     * @example
     * FrameLoader.AddBatch(
     *   items.map(item => () => this.CreateCell(item)),
     *   {
     *     priority: 1,
     *     onProgress: (c, t) => progressBar.progress = c / t,
     *     onComplete: () => console.log('列表加载完毕'),
     *   }
     * );
     */
    public static AddBatch(fns: Array<() => void>, options?: IFrameBatchOptions): IFrameBatch {
        if (!fns.length) {
            options?.onComplete?.();
            return new FrameBatchHandle([], null);
        }

        const priority = options?.priority ?? 0;
        const ctx = new BatchContext(fns.length, options?.onProgress, options?.onComplete);
        const nodes: ITaskNode[] = fns.map(fn => ({
            fn, priority, order: this.mOrder++,
            cancelled: false, done: false,
            onComplete: null, batch: ctx,
        }));
        nodes.forEach(n => this.HeapPush(n));
        this.EnsureDriver();
        return new FrameBatchHandle(nodes, ctx);
    }

    /** 执行任务 */
    public static Tick(): void {
        if (this.mPaused || !this.mHeap.length) return;

        const deadline = this.Now() + this.mBudgetMs;
        let executed = 0;

        while (this.mHeap.length && executed < this.mMaxPerFrame) {
            if (executed > 0 && this.Now() >= deadline) break;

            const node = this.HeapPop();

            if (node.cancelled) {
                if (!node.done) {
                    node.done = true;
                    node.batch?.NotifySkipped();
                }
                continue;
            }

            try {
                node.fn();
            } catch (e) {
                console.error(`[FrameLoader] Task error (priority=${node.priority}):`, e);
            }

            node.done = true;
            node.onComplete?.();
            node.batch?.NotifyDone();
            executed++;
        }

        if (!this.mHeap.length) {
            this.mDriver?.Cancel();
            this.mDriver = null;
        }
    }

    /** 将节点插入堆中 */
    private static HeapPush(node: ITaskNode): void {
        this.mHeap.push(node);
        this.SiftUp(this.mHeap.length - 1);
    }

    /** 从堆中弹出节点 */
    private static HeapPop(): ITaskNode {
        const top = this.mHeap[0];
        const last = this.mHeap.pop()!;
        if (this.mHeap.length > 0) {
            this.mHeap[0] = last;
            this.SiftDown(0);
        }
        return top;
    }

    /** 判断 a 是否应排在 b 之前（高优先级优先；同优先级则先入先出） */
    private static Before(a: ITaskNode, b: ITaskNode): boolean {
        if (a.priority !== b.priority) return a.priority > b.priority;
        return a.order < b.order;
    }

    /** 上浮节点 */
    private static SiftUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.Before(this.mHeap[i], this.mHeap[parent])) {
                this.Swap(i, parent);
                i = parent;
            } else {
                break;
            }
        }
    }

    /** 下沉节点 */
    private static SiftDown(i: number): void {
        const n = this.mHeap.length;
        while (true) {
            let top = i;
            const l = 2 * i + 1;
            const r = 2 * i + 2;
            if (l < n && this.Before(this.mHeap[l], this.mHeap[top])) top = l;
            if (r < n && this.Before(this.mHeap[r], this.mHeap[top])) top = r;
            if (top === i) break;
            this.Swap(i, top);
            i = top;
        }
    }

    /** 交换节点 */
    private static Swap(a: number, b: number): void {
        const tmp = this.mHeap[a];
        this.mHeap[a] = this.mHeap[b];
        this.mHeap[b] = tmp;
    }

    /** 高精度时间戳（毫秒），兼容不支持 performance 的环境 */
    private static Now(): number {
        return (typeof performance !== "undefined" && performance.now)
            ? performance.now()
            : Date.now();
    }

    /** 确保每帧驱动已初始化（首次任务提交时启动） */
    private static EnsureDriver(): void {
        if (this.mDriver && !this.mDriver.isDone) return;
        this.mDriver = TimerMgr.EveryFrame(() => this.Tick(), this);
    }
}
