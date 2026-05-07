/*************************************************************************************
 * @File        : GamePanelB.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 游戏全屏面板（Demo）
 *************************************************************************************/

import { _decorator, Label } from "cc";
import { AudioMgr } from "../../../Framework/Audio/AudioMgr";
import { UIBase } from "../../../Framework/UI/UIBase";
import { UIManager } from "../../../Framework/UI/UIManager";
import { BGMDefined } from "../../Defined/AudioDefined";
import { UIDefine } from "../../Defined/UIDefine";

const { ccclass, property } = _decorator;

@ccclass("GamePanelB")
export class GamePanelB extends UIBase {

    @property(Label)
    private mTitle: Label | null = null;

    @property(Label)
    private mContent: Label | null = null;

    /**
     * 生命周期：界面打开时触发。
     */
    protected OnOpen(data?: any): void {
        console.log("[FullScreen] GamePanelB OnOpen", data);
        this.mTitle.string = data.title;
        this.mContent.string = `${data.name}${data.msg}`;
    }

    /**
     * 生命周期：界面显示时触发
     */
    protected OnShow(data?: any): void {
        console.log("[FullScreen] GamePanelB OnShow", data);
        // 播放游戏背景音乐
        AudioMgr.PlayBGM(BGMDefined.Game);
    }

    /**
     * 生命周期：界面隐藏时触发
     */
    protected OnHide(): void {
        console.log("[FullScreen] GamePanelB OnHide");
    }

    /**
     * 生命周期：界面关闭时触发
     */
    protected OnClose(): void {
        console.log("[FullScreen] GamePanelB OnClose");
    }

    /**
     * 点击事件：关闭当前游戏面板，恢复下层全屏。
     */
    public OnClickBackLobby(): void {
        UIManager.Instance.Open(UIDefine.ConfirmPop, {
            title: "温馨提示",
            content: "确定要返回大厅吗？",
            submitCallback: () => {
                UIManager.Instance.Open(UIDefine.LobbyPanel);
                this.CloseSelf();
            },
            cancelCallback: () => {
            },
        });
    }
}