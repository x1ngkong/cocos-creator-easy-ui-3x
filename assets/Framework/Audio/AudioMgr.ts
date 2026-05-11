/*************************************************************************************
 * @File        : AudioMgr.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 音频管理器（BGM 单通道淡入淡出 + SFX 多通道并发）
 *
 * SFX 通道池：
 *   - 默认 3 个独立 AudioSource 通道并发播放
 *   - 有空闲通道时直接占用；全满时抢占剩余时长最短的通道
 *   - SetSFXChannelCount 可在运行时动态调整通道数
 *************************************************************************************/

import { AudioClip, AudioSource, director, Node } from "cc";
import { ResMgr } from "../Res/ResMgr";
import { ITimerHandle, TimerMgr } from "../Util/TimerMgr";

/** SFX 播放通道 */
interface ISfxChannel {
    source: AudioSource;
    /** 当前播放的资源路径；空字符串表示空闲 */
    path: string;
    /** 预计播放结束时间戳（Date.now()/1000），0 表示空闲 */
    endAt: number;
}

export class AudioMgr {
    private static mBgmVolume = 1.0;
    private static mSfxVolume = 1.0;
    private static mBgmMuted = false;
    private static mSfxMuted = false;

    private static mAudioRoot: Node | null = null;
    private static mBgmSource: AudioSource | null = null;
    /** SFX 通道池 */
    private static mSfxChannels: ISfxChannel[] = [];
    /** SFX 最大并发通道数（默认 3） */
    private static mSfxChannelCount = 3;

    private static mBgmPath = "";
    private static mBgmLoadedPath = "";
    private static mBgmLoading = false;
    private static mFadeHandle: ITimerHandle | null = null;

    // ─── BGM ──────────────────────────────────────────────────────────────────

    /**
     * 播放 BGM（自动替换当前 BGM，默认循环）。
     * @param path    resources 下的资源路径，不含后缀
     * @param fadeOut 旧 BGM 淡出时长（秒），0 表示立即停止
     * @param fadeIn  新 BGM 淡入时长（秒），0 表示立即达到目标音量
     */
    public static PlayBGM(path: string, fadeOut = 0.3, fadeIn = 0.3): void {
        const bgmSource = this.GetBgmSource();
        if (this.mBgmPath === path && (bgmSource.playing || this.mBgmLoading)) return;
        this.mBgmPath = path;
        this.mBgmLoading = false;

        const doPlay = () => {
            this.mBgmLoading = true;
            ResMgr.Load<AudioClip>(path, AudioClip).then(clip => {
                if (this.mBgmPath === path) this.mBgmLoading = false;

                if (!clip) {
                    if (this.mBgmLoadedPath) {
                        ResMgr.Release(this.mBgmLoadedPath);
                        this.mBgmLoadedPath = "";
                    }
                    if (this.mBgmPath === path) this.mBgmPath = "";
                    console.warn(`[AudioMgr] PlayBGM load failed: "${path}"`);
                    return;
                }

                // 加载期间目标已切换，丢弃本次结果
                if (this.mBgmPath !== path) {
                    ResMgr.Release(path);
                    return;
                }

                // 释放旧 BGM 的引用
                if (this.mBgmLoadedPath && this.mBgmLoadedPath !== path) {
                    ResMgr.Release(this.mBgmLoadedPath);
                }

                const source = this.GetBgmSource();
                this.mBgmLoadedPath = path;
                source.stop();
                source.clip = clip;
                source.loop = true;
                source.volume = (this.mBgmMuted || fadeIn > 0) ? 0 : this.mBgmVolume;
                source.play();

                if (!this.mBgmMuted && fadeIn > 0) {
                    this.FadeVolume(0, this.mBgmVolume, fadeIn);
                }
            });
        };

        if (bgmSource.playing && fadeOut > 0) {
            this.StopFading();
            this.FadeVolume(bgmSource.volume, 0, fadeOut, () => {
                bgmSource.stop();
                doPlay();
            });
        } else {
            this.StopFading();
            bgmSource.stop();
            doPlay();
        }
    }

    /** 停止 BGM */
    public static StopBGM(fadeOut = 0.3): void {
        const bgmSource = this.GetBgmSource();
        if (!bgmSource.playing && !this.mBgmPath && !this.mFadeHandle) return;

        this.mBgmPath = "";
        this.mBgmLoading = false;

        if (this.mBgmLoadedPath) {
            ResMgr.Release(this.mBgmLoadedPath);
            this.mBgmLoadedPath = "";
        }

        this.StopFading();

        if (!bgmSource.playing) return;

        if (fadeOut > 0) {
            this.FadeVolume(bgmSource.volume, 0, fadeOut, () => {
                bgmSource.stop();
            });
        } else {
            bgmSource.stop();
        }
    }

    /** 暂停 BGM */
    public static PauseBGM(): void { this.GetBgmSource().pause(); }

    /** 恢复 BGM */
    public static ResumeBGM(): void {
        const source = this.GetBgmSource();
        if (source.clip) source.play();
    }

    /** 设置 BGM 音量（0 ~ 1） */
    public static SetBGMVolume(volume: number): void {
        this.mBgmVolume = Math.max(0, Math.min(1, volume));
        if (!this.mBgmMuted) this.GetBgmSource().volume = this.mBgmVolume;
    }

    /** 静音 / 取消静音 BGM */
    public static MuteBGM(mute: boolean): void {
        if (this.mBgmMuted === mute) return;
        this.mBgmMuted = mute;
        this.GetBgmSource().volume = mute ? 0 : this.mBgmVolume;
    }

    // ─── SFX ──────────────────────────────────────────────────────────────────

    /**
     * 设置 SFX 最大并发通道数（默认 3，最小 1）。
     * - 若音频根节点尚未初始化，仅记录配置，首次播放时生效
     * - 已初始化后调用：立即停止所有 SFX 并重建通道池
     */
    public static SetSFXChannelCount(count: number): void {
        count = Math.max(1, Math.floor(count));
        if (this.mSfxChannelCount === count) return;
        this.mSfxChannelCount = count;
        if (!this.mAudioRoot?.isValid) return;

        this.StopAllSFX();
        while (this.mSfxChannels.length < count) {
            this.mSfxChannels.push({ source: this.mAudioRoot.addComponent(AudioSource), path: "", endAt: 0 });
        }
        while (this.mSfxChannels.length > count) {
            const ch = this.mSfxChannels.pop()!;
            ch.source.destroy();
        }
    }

    /**
     * 播放音效（fire-and-forget）。
     * 自动占用空闲通道；全满时抢占剩余时长最短的通道。
     * @param path   resources 下的资源路径，不含后缀
     * @param volume 音量（0 ~ 1），不传则使用全局 SFX 音量
     */
    public static PlaySFX(path: string, volume?: number): void {
        if (this.mSfxMuted) return;
        ResMgr.Load<AudioClip>(path, AudioClip).then(clip => {
            if (!clip) return;
            if (this.mSfxMuted) { ResMgr.Release(path); return; }

            const vol = Math.max(0, Math.min(1, volume ?? this.mSfxVolume));
            const ch = this.AcquireSfxChannel();
            ch.source.stop();
            ch.source.clip = clip;
            ch.source.loop = false;
            ch.source.volume = vol;
            ch.source.play();

            const duration = clip.getDuration?.() ?? 5;
            ch.path = path;
            ch.endAt = Date.now() / 1000 + duration;
            // 播放结束后延迟 0.1s 再释放，避免引擎异步尾部被截断
            TimerMgr.Once(() => {
                ch.path = "";
                ch.endAt = 0;
                ResMgr.Release(path);
            }, duration + 0.1, ch.source);
        });
    }

    /** 立即停止所有 SFX 通道并释放资源引用 */
    public static StopAllSFX(): void {
        for (const ch of this.mSfxChannels) {
            if (!ch.path) continue;
            TimerMgr.CancelByOwner(ch.source);
            ResMgr.Release(ch.path);
            ch.path = "";
            ch.endAt = 0;
            ch.source.stop();
        }
    }

    /** 设置 SFX 全局音量（0 ~ 1） */
    public static SetSFXVolume(volume: number): void {
        this.mSfxVolume = Math.max(0, Math.min(1, volume));
    }

    /** 静音 / 取消静音 SFX */
    public static MuteSFX(mute: boolean): void { this.mSfxMuted = mute; }

    // ─── 全局 ──────────────────────────────────────────────────────────────────

    /** 全局静音 / 取消静音（同时控制 BGM 和 SFX） */
    public static SetMute(mute: boolean): void { this.MuteBGM(mute); this.MuteSFX(mute); }

    /** 停止所有音频（BGM + 全部 SFX 通道） */
    public static StopAll(): void {
        this.StopBGM(0);
        this.StopAllSFX();
    }

    /** 预加载音频资源（提前缓存，播放时无延迟） */
    public static Preload(path: string): void { ResMgr.Preload(path, AudioClip); }

    // ─── 私有 ──────────────────────────────────────────────────────────────────

    /**
     * 获取一个可用的 SFX 通道。
     * 优先找空闲（未在播放 或 endAt 已过）；全满时抢占 endAt 最小的通道。
     */
    private static AcquireSfxChannel(): ISfxChannel {
        this.EnsureAudioRoot();
        const now = Date.now() / 1000;

        // 找第一个空闲通道（含已到 endAt 但定时器还未触发的）
        const idle = this.mSfxChannels.find(c => !c.source.playing || c.endAt <= now);
        if (idle) {
            if (idle.path) {
                // endAt 已过但定时器未触发时，手动提前释放
                TimerMgr.CancelByOwner(idle.source);
                ResMgr.Release(idle.path);
                idle.path = "";
            }
            return idle;
        }

        // 全满：抢占剩余时长最短（endAt 最小）的通道
        const victim = this.mSfxChannels.reduce((a, b) => a.endAt < b.endAt ? a : b);
        TimerMgr.CancelByOwner(victim.source);
        ResMgr.Release(victim.path);
        victim.path = "";
        victim.source.stop();
        return victim;
    }

    /** 停止 BGM 淡入淡出 */
    private static StopFading(): void {
        this.mFadeHandle?.Cancel();
        this.mFadeHandle = null;
    }

    /** 线性插值淡变 BGM 音量，基于实际流逝时间，不依赖步数计算 */
    private static FadeVolume(from: number, to: number, duration: number, onComplete?: () => void): void {
        const source = this.GetBgmSource();
        if (duration <= 0) {
            source.volume = Math.max(0, Math.min(1, to));
            onComplete?.();
            return;
        }
        const startTime = Date.now();
        this.mFadeHandle = TimerMgr.Loop(() => {
            const t = Math.min(1, (Date.now() - startTime) / (duration * 1000));
            source.volume = Math.max(0, Math.min(1, from + (to - from) * t));
            if (t >= 1) {
                this.mFadeHandle?.Cancel();
                this.mFadeHandle = null;
                onComplete?.();
            }
        }, 0.05, this);
    }

    /** 获取 BGM AudioSource */
    private static GetBgmSource(): AudioSource {
        this.EnsureAudioRoot();
        return this.mBgmSource!;
    }

    /** 确保音频根节点存在（含热重载后静态引用丢失时复用已有持久节点） */
    private static EnsureAudioRoot(): void {
        if (this.mAudioRoot?.isValid) return;

        this.mAudioRoot = this.FindOrCreatePersistNode("AudioMgr");
        this.mBgmSource = this.GetOrAddSource(this.mAudioRoot, 0);
        this.mSfxChannels = Array.from({ length: this.mSfxChannelCount }, (_, i) => ({
            source: this.GetOrAddSource(this.mAudioRoot!, i + 1),
            path: "",
            endAt: 0,
        }));
    }

    /** 在持久节点列表中查找同名节点，找不到则新建并注册为持久节点 */
    private static FindOrCreatePersistNode(name: string): Node {
        const pMap = (director as any)._persistRootNodes as Map<string, Node> | undefined;
        if (pMap) {
            for (const node of pMap.values()) {
                if (node.name === name && node.isValid) return node;
            }
        }
        const node = new Node(name);
        director.addPersistRootNode(node);
        return node;
    }

    /** 获取节点上第 index 个 AudioSource，不足时追加 */
    private static GetOrAddSource(node: Node, index: number): AudioSource {
        const all = node.getComponents(AudioSource);
        return all[index] ?? node.addComponent(AudioSource);
    }
}
