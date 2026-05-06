/*************************************************************************************
 * @File        : TimerMgr.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 全局定时器管理器（封装 cc.director.getScheduler，零常驻节点）
 *
 * 设计要点：
 *   1. 零节点：底层使用 cc.director.getScheduler()，不需要任何 cc.Node / cc.Component，
 *      框架运行时不会在节点树留下任何 "Driver" 节点
 *   2. 统一抽象：业务模块只依赖 TimerMgr，未来更换调度实现（如自研时间轮）零感知
 *   3. Owner 机制：可按 owner 一键取消其名下所有定时器，根治模块退出忘记 unschedule 的隐患
 *   4. 句柄机制：Once/Loop/EveryFrame 均返回 ITimerHandle，可独立取消并查询状态
 *   5. 与游戏暂停同步：底层走 director，cc.game.pause() 时整体暂停（与 mainLoop 一致）
 *   6. 调试友好：Dump() 一行打印所有在途定时器及其 owner，泄漏排查极其方便
 *
 * ── 用法示例 ────────────────────────────────────────────────────────────────────
 *
 * 【1. 一次性定时】
 *   const h = TimerMgr.Once(() => console.log('hello'), 2);
 *   h.Cancel();                          // 还没触发前可取消
 *
 * 【2. 周期定时】
 *   const h = TimerMgr.Loop(() => this.Tick(), 0.5, this);
 *
 * 【3. 每帧回调（替代 cc.Component.update）】
 *   const h = TimerMgr.EveryFrame(() => this.Update(), this);
 *
 * 【4. 模块销毁时一键清理】
 *   TimerMgr.CancelByOwner(this);        // 取消该 owner 名下所有定时器
 *
 * 【5. 调试：列出所有在途定时器】
 *   TimerMgr.Dump();
 *
 *************************************************************************************/

import { director, macro, Scheduler } from "cc";

export interface ITimerHandle {
    /** 取消定时器（已结束的 Once 或已取消的句柄无副作用） */
    Cancel(): void;
    /** 是否已结束（Once 已触发 / 已被取消） */
    readonly isDone: boolean;
}

const enum TimerType {
    Once = 1,
    Loop = 2,
    Frame = 3,
}

interface ITimerRecord {
    id: number;
    type: TimerType;
    /** 业务回调 */
    fn: () => void;
    /** 注册到 scheduler 的 wrapper 回调（unschedule 用） */
    wrapper: (dt: number) => void;
    /** scheduler 的 target（unschedule 用），TimerMgr 自己持有，业务无感知 */
    target: object;
    owner: object | null;
    done: boolean;
    /** 调试用描述（栈位置 / 类型） */
    desc: string;
}

class TimerTarget { }

class TimerHandle implements ITimerHandle {
    constructor(private readonly mRecord: ITimerRecord) { }
    Cancel(): void { TimerMgr.Cancel(this); }
    get isDone(): boolean { return this.mRecord.done; }
    get __record(): ITimerRecord { return this.mRecord; }
}

export class TimerMgr {
    private static mNextId = 1;
    private static readonly mRecords = new Map<number, ITimerRecord>();
    /**
     * 调试模式开关（默认关）。
     * 开启后 Once/Loop/EveryFrame 会捕获调用栈写入 desc，Dump() 才能显示注册位置。
     * new Error().stack 有一定开销，生产环境务必保持关闭。
     */
    private static mDebug = false;

    /**
     * 开启 / 关闭调试模式。
     * 开启后创建定时器时会捕获调用栈，Dump() 才能打印注册位置。
     * 建议仅在开发期间临时开启。
     */
    public static SetDebug(enabled: boolean): void {
        this.mDebug = enabled;
    }

    /**
     * 一次性定时器。
     * @param fn     回调函数
     * @param delay  延迟秒数（>=0）
     * @param owner  归属对象，传入后可被 CancelByOwner 批量清理
     */
    public static Once(fn: () => void, delay: number, owner: object | null = null): ITimerHandle {
        const safeDelay = Math.max(0, delay);
        return this.Schedule(TimerType.Once, fn, safeDelay, 0, owner);
    }

    /**
     * 周期定时器。
     * @param fn        回调函数
     * @param interval  周期秒数（>=0；0 表示每帧）
     * @param owner     归属对象
     * @param delay     首次触发的延迟秒数，默认 0
     */
    public static Loop(fn: () => void, interval: number, owner: object | null = null, delay: number = 0): ITimerHandle {
        const safeInterval = Math.max(0, interval);
        const safeDelay = Math.max(0, delay);
        return this.Schedule(TimerType.Loop, fn, safeInterval, safeDelay, owner);
    }

    /**
     * 每帧回调（替代 cc.Component.update）。
     * @param fn     回调函数
     * @param owner  归属对象
     */
    public static EveryFrame(fn: () => void, owner: object | null = null): ITimerHandle {
        return this.Schedule(TimerType.Frame, fn, 0, 0, owner);
    }

    /** 取消定时器（已结束的 Once 或已取消的句柄无副作用） */
    public static Cancel(handle: ITimerHandle | null | undefined): void {
        if (!handle) return;
        const record = (handle as TimerHandle).__record;
        if (!record || record.done) return;
        this.RemoveRecord(record);
    }

    /**
     * 取消指定 owner 名下所有定时器。
     * 模块销毁时调用，根治"忘记 unschedule"的内存/逻辑泄漏。
     */
    public static CancelByOwner(owner: object): number {
        if (!owner) return 0;
        let count = 0;
        const records: ITimerRecord[] = [];
        this.mRecords.forEach((r: ITimerRecord) => { if (r.owner === owner) records.push(r); });
        records.forEach((r: ITimerRecord) => { this.RemoveRecord(r); count++; });
        return count;
    }

    /** 当前在途定时器数量 */
    public static get pendingCount(): number {
        return this.mRecords.size;
    }

    /**
     * 调试：打印当前所有在途定时器（id / 类型 / owner / 注册位置）。
     */
    public static Dump(): void {
        if (!this.mRecords.size) {
            console.log("[TimerMgr] no pending timer.");
            return;
        }
        const lines: string[] = [`[TimerMgr] ${this.mRecords.size} pending timer(s):`];
        this.mRecords.forEach((r: ITimerRecord) => {
            const ownerName = r.owner ? (r.owner.constructor?.name ?? "Object") : "<none>";
            const typeName = r.type === TimerType.Once ? "Once" : r.type === TimerType.Loop ? "Loop" : "Frame";
            lines.push(`  #${r.id} [${typeName}] owner=${ownerName} ${r.desc}`);
        });
        console.log(lines.join("\n"));
    }

    /** 统一调度入口 */
    private static Schedule(type: TimerType, fn: () => void, interval: number, delay: number, owner: object | null): ITimerHandle {
        const id = this.mNextId++;
        const target = new TimerTarget();
        let record: ITimerRecord;
        const wrapper = (_dt: number) => {
            if (record.done) return;
            try {
                fn();
            } catch (e) {
                console.error(`[TimerMgr] timer #${record.id} callback error:`, e);
            }
            if (record.type === TimerType.Once) {
                this.RemoveRecord(record);
            }
        };

        record = {
            id, type, fn,
            wrapper,
            target, owner,
            done: false,
            desc: this.CaptureDesc(),
        };

        this.mRecords.set(id, record);

        const scheduler = this.GetScheduler();
        this.EnableSchedulerTarget(target);

        if (type === TimerType.Once) {
            // Once: repeat=0 => 触发 1 次；delay 用作"延迟 N 秒后触发"
            scheduler.schedule(record.wrapper, target, 0, 0, interval, false);
        } else if (type === TimerType.Loop) {
            // 无限重复：repeat = macro.REPEAT_FOREVER
            scheduler.schedule(record.wrapper, target, interval, macro.REPEAT_FOREVER, delay, false);
        } else {
            // EveryFrame：interval=0 即每帧触发
            scheduler.schedule(record.wrapper, target, 0, macro.REPEAT_FOREVER, 0, false);
        }

        return new TimerHandle(record);
    }

    /** 从 scheduler 注销并清理记录 */
    private static RemoveRecord(record: ITimerRecord): void {
        if (record.done) return;
        record.done = true;
        this.mRecords.delete(record.id);
        const scheduler = this.GetScheduler();
        // unschedule 失败（如 target 已清理）不应抛错，silent 处理
        try {
            scheduler.unschedule(record.wrapper, record.target);
        } catch (e) {
            // 极端情况下 scheduler 内部状态异常，记录但不影响业务
            console.warn(`[TimerMgr] unschedule timer #${record.id} warn:`, e);
        }
    }

    /** 获取全局调度器 */
    private static GetScheduler(): Scheduler {
        return director.getScheduler();
    }

    /** 为普通对象补齐调度器所需的内部 id，3.x 中该方法挂在 Scheduler 静态类上 */
    private static EnableSchedulerTarget(target: object): void {
        Scheduler.enableForTarget(target);
    }

    /**
     * 捕获调用栈第二层位置作为调试描述。
     * 仅在 mDebug=true 时执行，避免 new Error() 的栈序列化开销。
     */
    private static CaptureDesc(): string {
        if (!this.mDebug) return "";
        const stack = new Error().stack;
        if (!stack) return "";
        const lines = stack.split("\n");
        for (let i = 3; i < lines.length; i++) {
            const line = lines[i]?.trim();
            if (line && !line.includes("TimerMgr")) return `at ${line}`;
        }
        return "";
    }
}
