/*************************************************************************************
 * @File        : LobbyPanel.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 大厅全屏面板（Demo）
 *************************************************************************************/

import { _decorator } from "cc";
import { AudioMgr } from "../../../Framework/Audio/AudioMgr";
import { UIBase } from "../../../Framework/UI/UIBase";
import { BGMDefined } from "../../Defined/AudioDefined";

const { ccclass } = _decorator;

@ccclass("LobbyPanel")
export class LobbyPanel extends UIBase {

    /** 生命周期：界面打开时触发 */
    protected OnOpen(data?: any): void {
        console.log("[LobbyPanel] OnOpen", data);
    }

    /** 生命周期：界面显示时触发 */
    protected OnShow(data?: any): void {
        // 播放大厅背景音乐
        AudioMgr.PlayBGM(BGMDefined.Lobby);
    }
}

