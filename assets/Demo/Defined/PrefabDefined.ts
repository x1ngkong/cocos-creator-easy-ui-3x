/*************************************************************************************
 * @File        : PrefabDefined.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : UI 预制体资源路径定义（对应 resources/ 目录，不含后缀）
 *************************************************************************************/

/** 全屏界面预制体路径 */
export const FullScreenPrefab = {
    /** 大厅面板 */
    LobbyPanel: "UI/Prefab/FullScreen/LobbyPanel",
    /** 游戏面板 A */
    GamePanelA: "UI/Prefab/FullScreen/GamePanelA",
    /** 游戏面板 B */
    GamePanelB: "UI/Prefab/FullScreen/GamePanelB",
    /** 游戏面板 C */
    GamePanelC: "UI/Prefab/FullScreen/GamePanelC",
} as const;

/** 弹窗预制体路径 */
export const PopupPrefab = {
    /** 游戏弹窗 A */
    GamePopA: "UI/Prefab/Popup/GamePopA",
    /** 游戏弹窗 B */
    GamePopB: "UI/Prefab/Popup/GamePopB",
    /** 游戏弹窗 C */
    GamePopC: "UI/Prefab/Popup/GamePopC",
    /** 二次确认弹窗 */
    ConfirmPop: "UI/Prefab/Popup/ConfirmPop",
    /** 奖励弹窗 */
    RewardPop: "UI/Prefab/Popup/RewardPop",
} as const;

/** 气泡预制体路径 */
export const BubblePrefab = {
    /** 通用气泡提示 */
    CommonBubble: "UI/Prefab/Bubble/CommonBubble",
} as const;

/** 提示预制体路径 */
export const ToastPrefab = {
    /** Toast 提示 */
    Toast: "UI/Prefab/Toast/Toast",
} as const;

/** GM 工具预制体路径 */
export const GameMasterPrefab = {
    /** GM 面板 */
    GmPanel: "UI/Prefab/GameMaster/GmPanel",
    /** GM 图标入口 */
    GmIcon: "UI/Prefab/GameMaster/GmIcon",
} as const;
