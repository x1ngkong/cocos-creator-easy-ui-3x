/*************************************************************************************
 * @File        : AudioDefined.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 音频资源路径定义（对应 resources/ 目录，不含后缀）
 *
 * 使用方式：
 *   AudioMgr.PlayBGM(BGMDefined.Lobby);
 *   AudioMgr.PlaySFX(SFXDefined.Click);
 *************************************************************************************/

/**
 * 背景音乐路径（循环播放，同一时刻仅播放一首）。
 * 对应 resources/Audio/BGM/ 目录。
 */
export const BGMDefined = {
    /** 大厅背景音乐 */
    Lobby: "Audio/BGM/bgm_lobby",
    /** 游戏背景音乐 */
    Game: "Audio/BGM/bgm_game",
} as const;

/**
 * 音效路径（单次播放，允许多个同时播放）。
 * 对应 resources/Audio/SFX/ 目录。
 */
export const SFXDefined = {
    /** 通用点击音效 */
    Click: "Audio/SFX/btn_click",
} as const;
