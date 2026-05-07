/*************************************************************************************
 * @File        : Main.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : Demo 主入口，负责注册 UI 与拉起初始界面
 *************************************************************************************/

import { UIManager } from "../../Framework/UI/UIManager";
import { ToastMgr } from "../../Framework/UI/ToastMgr";
import { PatchButtonClickSFX } from "../../Framework/UI/ButtonSFXPatch";
import { AudioMgr } from "../../Framework/Audio/AudioMgr";
import { StorageMgr } from "../../Framework/Storage/StorageMgr";
import { StorageKeys } from "../../Framework/Storage/StorageKeys";
import { SFXDefined } from "../Defined/AudioDefined";
import { UIDefine } from "../Defined/UIDefine";
import { _decorator, Component } from "cc";
import { RegisterAllUI } from "./Common/RegisterAllUI";

const { ccclass } = _decorator;

@ccclass("Main")
export class Main extends Component {

    /**
     * Cocos 生命周期：场景启动入口。
     * 说明：方法名为引擎约定，不改为大写。
     */
    protected start(): void {
        this.InitDemo();
    }

    /**
     * 初始化 Demo：注册 UI，并打开首屏与 GM 图标。
     */
    private InitDemo(): void {
        // 本地存储前缀（以 Demo 为命名空间）
        StorageMgr.SetPrefix("demo");

        // 全局按钮点击音效（仅需调用一次）
        PatchButtonClickSFX(SFXDefined.Click);

        // 从存储中恢复音量设置（首次运行使用默认值 1.0）
        AudioMgr.SetBGMVolume(StorageMgr.GetNumber(StorageKeys.SETTINGS.BGM, 0.5));
        AudioMgr.SetSFXVolume(StorageMgr.GetNumber(StorageKeys.SETTINGS.SFX, 0.5));

        // 注册 UI
        RegisterAllUI();

        // 配置 Toast
        ToastMgr.Preload();
        ToastMgr.SetToastUIId(UIDefine.Toast);
        ToastMgr.Configure(1.0, 0.08);
        ToastMgr.Show("欢迎体验 Demo，愿你天天开心！");

        // 打开首屏与 GM 图标
        UIManager.Instance.Open(UIDefine.LobbyPanel);
        UIManager.Instance.Open(UIDefine.GmIcon);
    }
}

