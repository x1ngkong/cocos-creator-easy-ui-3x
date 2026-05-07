/*************************************************************************************
 * @File        : RegisterAllUI.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 业务侧批量注册 UI 配置（示例工程）
 *************************************************************************************/

import { UIGroupType, UIRecoverMode } from "../../../Framework/UI/UIDefines";
import { UIRegistry } from "../../../Framework/UI/UIRegistry";
import { BubblePrefab, FullScreenPrefab, GameMasterPrefab, PopupPrefab, ToastPrefab } from "../../Defined/PrefabDefined";
import { UIDefine } from "../../Defined/UIDefine";

/**
 * 注册本工程全部 UI 配置。
 * 说明：路径均为 resources 相对路径，且不带扩展名。
 */
export function RegisterAllUI(): void {
    UIRegistry.BatchRegister([
        {
            /** 大厅面板 [全屏] 常驻，切换时直接恢复显示 */
            id: UIDefine.LobbyPanel,
            prefabPath: FullScreenPrefab.LobbyPanel,
            group: UIGroupType.FullScreen,
            recoverMode: UIRecoverMode.ReShow,
        },
        {
            /** 游戏面板 A [全屏] 大场景，切换后 5s 销毁，切回时重建 */
            id: UIDefine.GamePanelA,
            prefabPath: FullScreenPrefab.GamePanelA,
            group: UIGroupType.FullScreen,
            recoverMode: UIRecoverMode.ReShow
        },
        {
            /** 游戏面板 B [全屏] 大场景，切换后 10s 销毁，切回时重建 */
            id: UIDefine.GamePanelB,
            prefabPath: FullScreenPrefab.GamePanelB,
            group: UIGroupType.FullScreen,
            recoverMode: UIRecoverMode.ReCreate,
            destroyDelaySeconds: 10,
        },
        {
            /** 游戏面板 C [全屏] 大场景，切换后 15s 销毁，切回时重建 */
            id: UIDefine.GamePanelC,
            prefabPath: FullScreenPrefab.GamePanelC,
            group: UIGroupType.FullScreen,
            recoverMode: UIRecoverMode.ReCreate,
            destroyDelaySeconds: 15,
        },
        {
            /** 游戏弹窗 A [弹窗] */
            id: UIDefine.GamePopA,
            prefabPath: PopupPrefab.GamePopA,
            group: UIGroupType.Popup,
        },
        {
            /** 游戏弹窗 B [弹窗] */
            id: UIDefine.GamePopB,
            prefabPath: PopupPrefab.GamePopB,
            group: UIGroupType.Popup,
        },
        {
            /** 游戏弹窗 C [弹窗] */
            id: UIDefine.GamePopC,
            prefabPath: PopupPrefab.GamePopC,
            group: UIGroupType.Popup,
        },
        {
            /** 确认弹窗 [弹窗] */
            id: UIDefine.ConfirmPop,
            prefabPath: PopupPrefab.ConfirmPop,
            group: UIGroupType.Popup,
            queueable: true,
            popupUseMask: true,
        },
        {
            /** 通用气泡 [气泡] */
            id: UIDefine.CommonBubble,
            prefabPath: BubblePrefab.CommonBubble,
            group: UIGroupType.Bubble,
        },
        {
            /** Toast 提示 */
            id: UIDefine.Toast,
            prefabPath: ToastPrefab.Toast,
            group: UIGroupType.Toast,
        },
        {
            /** GM 入口图标 [GM面板] */
            id: UIDefine.GmIcon,
            prefabPath: GameMasterPrefab.GmIcon,
            group: UIGroupType.GameMaster,
        },
        {
            /** GM 面板 [GM面板] */
            id: UIDefine.GmPanel,
            prefabPath: GameMasterPrefab.GmPanel,
            group: UIGroupType.GameMaster,
        },
    ]);
}