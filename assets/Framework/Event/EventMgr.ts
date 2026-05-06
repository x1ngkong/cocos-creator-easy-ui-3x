/*************************************************************************************
 * @File        : EventMgr.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 全局事件管理器（优先级、target 批量注销、安全派发）
 *
 * 设计要点：
 *   1. 轻类型：事件 ID 为整数，数据类型由调用方在泛型中自行声明
 *   2. 优先级：同一事件的监听者按 priority DESC 排列，数值越大越先收到
 *   3. Once：一次性监听，触发后自动移除
 *   4. target 批量注销：OffAll(this) 一键移除某对象注册的所有监听，防止内存泄漏
 *   5. 安全派发：Emit 前先快照监听列表，避免回调内 Off/On 导致迭代错乱
 *   6. 重复守卫：同一 fn + target 组合不会被重复注册
 *
 * ── 用法速查 ─────────────────────────────────────────────────────────────────────
 *
 *   // 监听（在 onLoad / OnOpen 中注册，泛型标注数据类型）
 *   EventMgr.On<{ before: number; after: number }>(
 *       PlayerEvent.CoinChanged, this.OnCoinChanged, this,
 *   );
 *
 *   // 一次性监听
 *   EventMgr.Once(GameEvent.SceneEnter, this.OnFirstEnter, this);
 *
 *   // 派发（有数据）
 *   EventMgr.Emit(PlayerEvent.CoinChanged, { before: 100, after: 200 });
 *
 *   // 派发（无数据）
 *   EventMgr.Emit(GameEvent.Pause);
 *
 *   // 注销单个
 *   EventMgr.Off(PlayerEvent.CoinChanged, this.OnCoinChanged, this);
 *
 *   // 注销当前对象的所有监听（在 onDestroy / OnClose 中调用）
 *   EventMgr.OffAll(this);
 *
 *************************************************************************************/

import { EventId } from "./EventDefines";

// ─── 内部类型 ────────────────────────────────────────────────────────────────────

interface IListenerNode {
    fn: (data: any) => void;
    target: any;
    once: boolean;
    priority: number;
    /** 软删除标志：Off/OffAll 置为 true，Emit 迭代时跳过；彻底 splice 由 Emit/Off 异步完成 */
    removed: boolean;
}

export class EventMgr {
    /** 事件 ID → 监听者列表（按 priority DESC 排序） */
    private static readonly mListeners = new Map<EventId, IListenerNode[]>();

    // ─── 监听 ──────────────────────────────────────────────────────────────────

    /**
     * 注册监听。同一 fn + target 组合重复注册时静默忽略。
     * @param event    事件 ID（来自 EventDefines）
     * @param fn       回调函数，泛型 T 为数据类型
     * @param target   回调的 this 绑定对象，同时用于 OffAll 批量注销
     * @param priority 优先级，数值越大越先触发，默认 0
     */
    public static On<T = any>(
        event: EventId,
        fn: (data: T) => void,
        target?: any,
        priority = 0,
    ): void {
        this.AddListener(event, fn as (data: any) => void, target, false, priority);
    }

    /**
     * 注册一次性监听，触发一次后自动移除。
     * @param event  事件 ID（来自 EventDefines）
     * @param fn     回调函数，泛型 T 为数据类型
     * @param target 回调的 this 绑定对象
     */
    public static Once<T = any>(
        event: EventId,
        fn: (data: T) => void,
        target?: any,
    ): void {
        this.AddListener(event, fn as (data: any) => void, target, true, 0);
    }

    // ─── 注销 ──────────────────────────────────────────────────────────────────

    /**
     * 注销指定监听。
     * - 传入 fn + target：精确移除该监听
     * - 仅传入 target：移除该 target 在此事件上的所有监听
     * - 仅传入 event：移除该事件的全部监听（慎用）
     */
    public static Off<T = any>(
        event: EventId,
        fn?: (data: T) => void,
        target?: any,
    ): void {
        const list = this.mListeners.get(event);
        if (!list) return;

        for (let i = list.length - 1; i >= 0; i--) {
            const node = list[i];
            if (node.removed) continue;
            const fnMatch = !fn || node.fn === fn;
            const targetMatch = !target || node.target === target;
            if (!fnMatch || !targetMatch) continue;
            // 先置软删除，保证正在进行的 Emit 快照迭代能立即跳过；
            // 非迭代场景下同步 splice，避免积累墓碑节点
            node.removed = true;
            list.splice(i, 1);
        }

        if (!list.length) this.mListeners.delete(event);
    }

    /**
     * 移除指定 target 在所有事件上注册的全部监听。
     * 建议在 onDestroy / UIBase.OnClose 中调用，防止内存泄漏。
     */
    public static OffAll(target: any): void {
        if (!target) return;
        this.mListeners.forEach((list, event) => {
            for (let i = list.length - 1; i >= 0; i--) {
                if (list[i].target !== target) continue;
                list[i].removed = true;
                list.splice(i, 1);
            }
            if (!list.length) this.mListeners.delete(event);
        });
    }

    // ─── 派发 ──────────────────────────────────────────────────────────────────

    /**
     * 派发事件。
     * @param event 事件 ID（来自 EventDefines）
     * @param data  事件数据（无数据事件可省略）
     */
    public static Emit<T = any>(event: EventId, data?: T): void {
        const list = this.mListeners.get(event);
        if (!list || !list.length) return;

        // 快照：防止回调内 On / Off 影响本次迭代；回调中 Off 的节点会被标记 removed，
        // 在后续循环中跳过，保证「已 Off 的监听不会被本次 Emit 再次触发」
        const snapshot = list.slice();

        for (const node of snapshot) {
            if (node.removed) continue;
            if (node.once) node.removed = true;
            try {
                node.fn.call(node.target, data);
            } catch (e) {
                console.error(`[EventMgr] Listener error on event ${event}:`, e);
            }
        }

        // 批量移除本次迭代中 once 触发或被显式 Off 的节点
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].removed) list.splice(i, 1);
        }

        if (!list.length) this.mListeners.delete(event);
    }

    // ─── 工具 ──────────────────────────────────────────────────────────────────

    /**
     * 清除指定事件的全部监听。
     * 不传参数则清除所有事件（场景切换时可用）。
     */
    public static Clear(event?: EventId): void {
        if (event !== undefined) {
            this.mListeners.delete(event);
        } else {
            this.mListeners.clear();
        }
    }

    /** 查询指定事件是否存在监听者 */
    public static HasListeners(event: EventId): boolean {
        const list = this.mListeners.get(event);
        return !!list && list.length > 0;
    }

    /** 获取指定事件当前监听者数量（调试用） */
    public static GetListenerCount(event: EventId): number {
        return this.mListeners.get(event)?.length ?? 0;
    }

    // ─── 内部 ──────────────────────────────────────────────────────────────────

    private static AddListener(
        event: EventId,
        fn: (data: any) => void,
        target: any,
        once: boolean,
        priority: number,
    ): void {
        let list = this.mListeners.get(event);
        if (!list) {
            list = [];
            this.mListeners.set(event, list);
        }

        // 重复守卫：同一 fn + target 不重复注册。
        // 必须跳过 removed=true 的节点：Once 触发后节点仍暂留在 list 中（等 Emit 后批量 splice），
        // 若此时业务重新注册同一 fn+target，守卫会误命中已失效节点并 return，导致监听永远丢失。
        for (const node of list) {
            if (!node.removed && node.fn === fn && node.target === target) return;
        }

        const node: IListenerNode = { fn, target, once, priority, removed: false };

        // 按 priority DESC 插入，保持列表有序（通常监听数量少，线性插入即可）
        let insertIdx = list.length;
        for (let i = 0; i < list.length; i++) {
            if (priority > list[i].priority) {
                insertIdx = i;
                break;
            }
        }
        list.splice(insertIdx, 0, node);
    }
}
