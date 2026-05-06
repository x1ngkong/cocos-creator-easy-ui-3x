/*************************************************************************************
 * @File        : AudioMgr.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 音频管理器（BGM 单通道淡入淡出 + SFX 多通道播放）
 *************************************************************************************/

import { AudioClip, AudioSource, director, Node } from "cc";
import { ResMgr } from "../Res/ResMgr";
import { ITimerHandle, TimerMgr } from "../Util/TimerMgr";

export class AudioMgr {
    /** BGM 淡变步数 */
    private static readonly mFadeSteps = 20;

    /** BGM 音量 */
    private static mBgmVolume = 1.0;
    /** SFX 音量 */
    private static mSfxVolume = 1.0;
    /** BGM 是否静音 */
    private static mBgmMuted = false;
    /** SFX 是否静音 */
    private static mSfxMuted = false;

    /** 音频根节点 */
    private static mAudioRoot: Node | null = null;
    /** BGM 音频源 */
    private static mBgmSource: AudioSource | null = null;
    /** SFX 音频源 */
    private static mSfxSource: AudioSource | null = null;

    /** 当前目标 BGM 路径（PlayBGM 时立即设置，用于并发 stale 检查） */
    private static mBgmPath = "";
    /** 当前持有 ResMgr load 引用的 BGM 路径（需在停止或切换时 Release） */
    private static mBgmLoadedPath = "";
    /** 当前是否正在加载 BGM（防止同路径并发两次 PlayBGM 各自 doPlay，导致双重播放通道泄漏） */
    private static mBgmLoading = false;
    /** 是否正在淡出 */
    private static mFading = false;
    /** 当前正在运行的淡变定时器句柄，用于 StopFading 时精确取消 */
    private static mFadeHandle: ITimerHandle | null = null;

    /**
     * 播放 BGM（自动替换当前 BGM，默认循环）。
     * @param path       resources 下的资源路径，不含后缀
     * @param fadeOut    切换旧 BGM 的淡出时长（秒），0 表示立即停止
     * @param fadeIn     新 BGM 的淡入时长（秒），0 表示立即达到目标音量
     */
    public static PlayBGM(path: string, fadeOut: number = 0.3, fadeIn: number = 0.3): void {
        const bgmSource = this.GetBgmSource();
        if (this.mBgmPath === path && (bgmSource.playing || this.mBgmLoading)) return;
        this.mBgmPath = path;
        this.mBgmLoading = false;

        const doPlay = () => {
            this.mBgmLoading = true;
            ResMgr.Load<AudioClip>(path, AudioClip).then(clip => {
                if (this.mBgmPath === path) {
                    this.mBgmLoading = false;
                }

                if (!clip) {
                    if (this.mBgmLoadedPath) {
                        ResMgr.Release(this.mBgmLoadedPath);
                        this.mBgmLoadedPath = "";
                    }
                    if (this.mBgmPath === path) this.mBgmPath = "";
                    console.warn(`[AudioMgr] PlayBGM load failed: "${path}"`);
                    return;
                }
                if (this.mBgmPath !== path) {
                    ResMgr.Release(path);
                    return;
                }
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
            this.mFading = true;
            this.FadeVolume(bgmSource.volume, 0, fadeOut, () => {
                this.mFading = false;
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
        if (!bgmSource.playing && !this.mBgmPath && !this.mFading) return;

        this.mBgmPath = "";
        this.mBgmLoading = false;

        if (this.mBgmLoadedPath) {
            ResMgr.Release(this.mBgmLoadedPath);
            this.mBgmLoadedPath = "";
        }

        this.StopFading();

        if (!bgmSource.playing) return;

        if (fadeOut > 0) {
            this.mFading = true;
            this.FadeVolume(bgmSource.volume, 0, fadeOut, () => {
                this.mFading = false;
                bgmSource.stop();
            });
        } else {
            bgmSource.stop();
        }
    }

    /** 暂停 BGM（含正在淡出的旧 BGM） */
    public static PauseBGM(): void {
        this.GetBgmSource().pause();
    }

    /** 恢复 BGM（含正在淡出的旧 BGM） */
    public static ResumeBGM(): void {
        const source = this.GetBgmSource();
        if (source.clip) source.play();
    }

    /** 设置 BGM 音量（0 ~ 1） */
    public static SetBGMVolume(volume: number): void {
        this.mBgmVolume = Math.max(0, Math.min(1, volume));
        const source = this.GetBgmSource();
        if (!this.mBgmMuted) {
            source.volume = this.mBgmVolume;
        }
    }

    /** 静音 / 取消静音 BGM */
    public static MuteBGM(mute: boolean): void {
        if (this.mBgmMuted === mute) return;
        this.mBgmMuted = mute;
        this.GetBgmSource().volume = mute ? 0 : this.mBgmVolume;
    }

    /**
     * 播放音效（fire-and-forget）。
     * @param path    resources 下的资源路径，不含后缀
     * @param volume  音量（0 ~ 1），不传则使用全局 SFX 音量
     */
    public static PlaySFX(path: string, volume?: number): void {
        if (this.mSfxMuted) return;
        ResMgr.Load<AudioClip>(path, AudioClip).then(clip => {
            if (!clip) return;
            if (this.mSfxMuted) {
                ResMgr.Release(path);
                return;
            }
            const vol = Math.max(0, Math.min(1, volume ?? this.mSfxVolume));
            this.GetSfxSource().playOneShot(clip, vol);
            ResMgr.Release(path);
        });
    }

    /** 设置 SFX 全局音量（0 ~ 1） */
    public static SetSFXVolume(volume: number): void {
        this.mSfxVolume = Math.max(0, Math.min(1, volume));
    }

    /** 静音 / 取消静音 SFX */
    public static MuteSFX(mute: boolean): void {
        this.mSfxMuted = mute;
    }

    /** 全局静音 / 取消静音（同时控制 BGM 和 SFX） */
    public static SetMute(mute: boolean): void {
        this.MuteBGM(mute);
        this.MuteSFX(mute);
    }

    /** 停止所有音频（包含 BGM） */
    public static StopAll(): void {
        this.StopFading();
        const bgmSource = this.GetBgmSource();
        bgmSource.stop();
        bgmSource.clip = null;
        if (this.mBgmLoadedPath) {
            ResMgr.Release(this.mBgmLoadedPath);
            this.mBgmLoadedPath = "";
        }
        this.mBgmPath = "";
        this.mBgmLoading = false;
    }

    /** 预加载音频资源（提前缓存，播放时无延迟） */
    public static Preload(path: string): void {
        ResMgr.Preload(path, AudioClip);
    }

    /** 立即停止当前正在淡出的音频（若有），同时取消对应的调度 tick */
    private static StopFading(): void {
        if (this.mFadeHandle) {
            this.mFadeHandle.Cancel();
            this.mFadeHandle = null;
        }
        this.mFading = false;
    }

    /** BGM 音量渐变 */
    private static FadeVolume(from: number, to: number, duration: number, onComplete?: () => void): void {
        const source = this.GetBgmSource();
        if (duration <= 0) {
            source.volume = Math.max(0, Math.min(1, to));
            onComplete?.();
            return;
        }
        const steps = Math.max(1, Math.round(this.mFadeSteps * duration));
        const stepTime = duration / steps;
        const stepVol = (to - from) / steps;
        let current = from;
        let remaining = steps;

        let handle: ITimerHandle | null = null;
        const tick = () => {
            remaining--;
            current += stepVol;
            source.volume = Math.max(0, Math.min(1, current));
            if (remaining > 0) return;
            handle?.Cancel();
            if (this.mFadeHandle === handle) {
                this.mFadeHandle = null;
            }
            onComplete?.();
        };
        handle = TimerMgr.Loop(tick, stepTime, this);
        this.mFadeHandle = handle;
    }

    /** 获取 BGM 音频源 */
    private static GetBgmSource(): AudioSource {
        this.EnsureAudioRoot();
        return this.mBgmSource!;
    }

    /** 获取 SFX 音频源 */
    private static GetSfxSource(): AudioSource {
        this.EnsureAudioRoot();
        return this.mSfxSource!;
    }

    /** 确保音频根节点存在 */
    private static EnsureAudioRoot(): void {
        if (this.mAudioRoot && this.mAudioRoot.isValid) return;

        const node = new Node("AudioMgr");
        director.addPersistRootNode(node);

        this.mAudioRoot = node;
        this.mBgmSource = node.addComponent(AudioSource);
        this.mSfxSource = node.addComponent(AudioSource);
    }
}
