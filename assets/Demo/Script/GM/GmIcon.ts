/*************************************************************************************
 * @File        : GmIcon.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : GM 入口图标（Demo）
 *************************************************************************************/

import { _decorator } from "cc";
import { UIBase } from "../../../Framework/UI/UIBase";
import { UIManager } from "../../../Framework/UI/UIManager";
import { UIDefine } from "../../Defined/UIDefine";

const { ccclass } = _decorator;

@ccclass("GmIcon")
export class GmIcon extends UIBase {

    /**
     * 点击事件：打开 GM 面板。
     */
    public OnClickOpenGmIcon(): void {
        UIManager.Instance.Open(UIDefine.GmPanel);
    }
}

