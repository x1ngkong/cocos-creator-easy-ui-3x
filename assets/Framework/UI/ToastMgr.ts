/*************************************************************************************
 * @File        : ToastMgr.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : Toast 管理器（严格串行队列播放）
 *************************************************************************************/

import { TimerMgr } from "../Util/TimerMgr";
import { UIManager } from "./UIManager";

/** Toast 请求 */
interface IToastRequest {
    text: string;
    duration: number;
}

/**
 * Toast 串行队列管理器。
 * 任意时刻仅播放一条，后续请求按顺序排队，不丢失。
 */
export class ToastMgr {
    private static mToastUIId = "Toast";
    private static mDefaultDuration = 1.2;
    private static mInterval = 0.08;
    private static mMaxQueue = 100;

    private static readonly mQueue: IToastRequest[] = [];
    private static mIsPlaying = false;
    private static mToken = 0;

    /** 设置 Toast UI ID */
    public static SetToastUIId(uiId: string): void {
        if (uiId) this.mToastUIId = uiId;
    }

    /** 配置 Toast 参数 */
    public static Configure(duration: number, interval: number = 0.08, maxQueue: number = 100): void {
        this.mDefaultDuration = Math.max(0.1, duration);
        this.mInterval = Math.max(0, interval);
        this.mMaxQueue = Math.max(1, maxQueue);
    }

    /** 显示 Toast */
    public static Show(text: string, duration?: number): void {
        if (!text) return;
        if (this.mQueue.length >= this.mMaxQueue) {
            console.warn(`[ToastMgr] Queue overflow, drop: "${text}"`);
            return;
        }
        this.mQueue.push({
            text,
            duration: duration && duration > 0 ? duration : this.mDefaultDuration,
        });
        this.TryPlayNext();
    }

    /** 清空 Toast 队列 */
    public static ClearQueue(): void {
        this.mQueue.length = 0;
    }

    /** 停止并清空 Toast 队列 */
    public static StopAndClear(): void {
        this.mQueue.length = 0;
        this.mToken++;
        this.mIsPlaying = false;
        UIManager.Instance.Close(this.mToastUIId);
    }

    /**
     * 预加载 Toast 预制体（建议在游戏启动时调用一次）。
     * 预加载后 Open 内部命中缓存，不会有异步加载延迟。
     */
    public static Preload(): void {
        UIManager.Instance.Preload(this.mToastUIId);
    }

    /** 尝试播放下一个 Toast */
    private static TryPlayNext(): void {
        if (this.mIsPlaying) return;
        const next = this.mQueue.shift();
        if (!next) return;

        this.mIsPlaying = true;
        const token = ++this.mToken;

        UIManager.Instance.Open(this.mToastUIId, { text: next.text, duration: next.duration });

        TimerMgr.Once(() => {
            if (token !== this.mToken) return;
            UIManager.Instance.Close(this.mToastUIId);
            this.Finish(token, this.mInterval);
        }, next.duration, this);
    }

    /** 完成 Toast 播放 */
    private static Finish(token: number, delay: number): void {
        if (token !== this.mToken) return;
        this.mIsPlaying = false;
        TimerMgr.Once(() => {
            if (token !== this.mToken) return;
            this.TryPlayNext();
        }, delay, this);
    }
}
