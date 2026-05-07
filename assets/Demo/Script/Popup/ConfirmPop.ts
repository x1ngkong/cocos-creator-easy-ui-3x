/*************************************************************************************
 * @File        : ConfirmPop.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 确认弹窗（Demo）
 *************************************************************************************/

import { _decorator, Label } from "cc";
import { UIBase } from "../../../Framework/UI/UIBase";

const { ccclass, property } = _decorator;

@ccclass("ConfirmPop")
export class ConfirmPop extends UIBase {

    @property(Label)
    private mTitleLabel: Label | null = null;

    @property(Label)
    private mContentLabel: Label | null = null;

    private mSubmitCallback: () => void = () => { };
    private mCancelCallback: () => void = () => { };

    /**
     * 生命周期：弹窗打开时触发。
     */
    protected OnOpen(data?: any): void {
        console.log("[ConfirmPop] OnOpen", data);
        this.mTitleLabel.string = data?.title ?? "温馨提示";
        this.mContentLabel.string = data?.content ?? "";
        this.mSubmitCallback = data?.submitCallback;
        this.mCancelCallback = data?.cancelCallback;
    }

    /**
     * 点击事件：确认并关闭弹窗。
     */
    public OnClickConfirm(): void {
        this.mSubmitCallback?.();
        this.CloseSelf();
    }

    /**
     * 点击事件：取消并关闭弹窗。
     */
    public OnClickCancel(): void {
        this.mCancelCallback?.();
        this.CloseSelf();
    }
}

