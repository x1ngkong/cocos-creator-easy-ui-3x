/*************************************************************************************
 * @File        : EventMgr.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 全局事件管理器（target 批量注销、安全派发）
 *
 * ── 用法速查 ─────────────────────────────────────────────────────────────────────
 *
 *   EventMgr.On<{ before: number; after: number }>(
 *       EventDefines.PLAYER.CoinChanged, this.OnCoinChanged, this,
 *   );
 *   EventMgr.Once(EventDefines.GAME.SceneEnter, this.OnFirstEnter, this);
 *   EventMgr.Emit(EventDefines.PLAYER.CoinChanged, { before: 100, after: 200 });
 *   EventMgr.Off(EventDefines.PLAYER.CoinChanged, this.OnCoinChanged, this);
 *   EventMgr.OffAll(this);   // onDestroy / OnClose 中调用，防止内存泄漏
 *
 *************************************************************************************/

import { EventId } from "./EventDefines";

interface IListenerNode {
    fn: (data: any) => void;
    target: any;
    once: boolean;
    /** 软删除：Emit 迭代期间被 Off 时置 true，迭代结束后批量 splice */
    removed: boolean;
}

export class EventMgr {
    private static readonly mListeners = new Map<EventId, IListenerNode[]>();

    /** 注册监听。同一 fn + target 重复注册时静默忽略。 */
    public static On<T = any>(event: EventId, fn: (data: T) => void, target?: any): void {
        const list = this.Ensure(event);
        if (list.some(n => !n.removed && n.fn === fn && n.target === target)) return;
        if (!target && fn.prototype !== undefined) {
            console.warn(`[EventMgr] On(${event}): fn 是普通函数但未传入 target，回调内 "this" 将为 undefined。`);
        }
        list.push({ fn: fn as any, target, once: false, removed: false });
    }

    /** 注册一次性监听，触发一次后自动移除。 */
    public static Once<T = any>(event: EventId, fn: (data: T) => void, target?: any): void {
        const list = this.Ensure(event);
        if (list.some(n => !n.removed && n.fn === fn && n.target === target)) return;
        list.push({ fn: fn as any, target, once: true, removed: false });
    }

    /**
     * 注销监听。
     * - `Off(event, fn, target)`：精确移除
     * - `Off(event, target)`：移除该 target 在此事件上的所有监听（第二参数非函数时自动识别）
     * - `Off(event)`：移除该事件全部监听
     */
    public static Off<T = any>(event: EventId, fnOrTarget?: ((data: T) => void) | any, target?: any): void {
        const list = this.mListeners.get(event);
        if (!list) return;

        let resolvedFn: ((data: any) => void) | undefined;
        let resolvedTarget: any;
        if (typeof fnOrTarget === "function") {
            resolvedFn = fnOrTarget as any;
            resolvedTarget = target;
        } else {
            resolvedTarget = fnOrTarget ?? target;
        }

        for (let i = list.length - 1; i >= 0; i--) {
            const n = list[i];
            if (n.removed) continue;
            if (resolvedFn && n.fn !== resolvedFn) continue;
            if (resolvedTarget && n.target !== resolvedTarget) continue;
            n.removed = true;
            list.splice(i, 1);
        }
        if (!list.length) this.mListeners.delete(event);
    }

    /** 移除 target 在所有事件上注册的全部监听。建议在 onDestroy / OnClose 中调用。 */
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

    /** 派发事件。快照迭代，回调内 On/Off 不影响本次派发。 */
    public static Emit<T = any>(event: EventId, data?: T): void {
        const list = this.mListeners.get(event);
        if (!list?.length) return;

        const snapshot = list.slice();
        for (const node of snapshot) {
            if (node.removed) continue;
            if (node.once) node.removed = true;
            try {
                node.fn.call(node.target, data);
            } catch (e) {
                console.error(`[EventMgr] Emit(${event}) error:`, e);
            }
        }

        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].removed) list.splice(i, 1);
        }
        if (!list.length) this.mListeners.delete(event);
    }

    /** 清除指定事件的全部监听；不传参数则清除所有事件。 */
    public static Clear(event?: EventId): void {
        if (event !== undefined) {
            this.mListeners.delete(event);
        }
        else {
            this.mListeners.clear();
        }
    }

    /** 查询指定事件是否存在监听者。 */
    public static HasListeners(event: EventId): boolean {
        return !!this.mListeners.get(event)?.length;
    }

    /** 确保事件存在监听列表 */
    private static Ensure(event: EventId): IListenerNode[] {
        let list = this.mListeners.get(event);
        if (!list) {
            list = [];
            this.mListeners.set(event, list);
        }
        return list;
    }
}
