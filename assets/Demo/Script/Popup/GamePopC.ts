/*************************************************************************************
 * @File        : RewardPop.ts
 * @Author      : xingkong6
 * @Date        : 2026-04-15
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 游戏弹窗 C（Demo）
 *************************************************************************************/

import { UIBase } from "../../../Framework/UI/UIBase";
import { _decorator, Label } from "cc";

const { ccclass, property } = _decorator;

@ccclass("GamePopC")
export class GamePopC extends UIBase {

    @property(Label)
    private mTitle: Label | null = null;

    @property(Label)
    private mContent: Label | null = null;

    /**
     * 生命周期：弹窗打开时触发。
     */
    protected OnOpen(data?: any): void {
        console.log("[GamePopC] OnOpen", data);
        this.mTitle.string = data?.title ?? "弹窗 C";
        this.mContent.string = data?.content ?? "";
    }

    /**
     * 点击事件：关闭弹窗。
     */
    public OnClickClose(): void {
        this.CloseSelf();
    }
}