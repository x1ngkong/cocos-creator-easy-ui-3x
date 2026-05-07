/*************************************************************************************
 * @File        : UIDefine.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : UI ID 常量定义，避免魔法字符串
 *************************************************************************************/

/**
 * 所有界面 ID
 */
export const UIDefine = {
    /** 大厅面板 */
    LobbyPanel: "LobbyPanel",
    /** 游戏面板 A */
    GamePanelA: "GamePanelA",
    /** 游戏面板 B */
    GamePanelB: "GamePanelB",
    /** 游戏面板 C */
    GamePanelC: "GamePanelC",
    /** 游戏弹窗 A */
    GamePopA: "GamePopA",
    /** 游戏弹窗 B */
    GamePopB: "GamePopB",
    /** 游戏弹窗 C */
    GamePopC: "GamePopC",
    /** 确认弹窗 */
    ConfirmPop: "ConfirmPop",
    /** 奖励弹窗 */
    RewardPop: "RewardPop",
    /** 通用气泡 */
    CommonBubble: "CommonBubble",
    /** 提示 */
    Toast: "Toast",
    /** GM 面板 */
    GmPanel: "GmPanel",
    /** GM 入口图标 */
    GmIcon: "GmIcon",
} as const;
