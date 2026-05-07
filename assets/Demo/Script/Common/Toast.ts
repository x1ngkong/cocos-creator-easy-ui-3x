/*************************************************************************************
 * @File        : Toast.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : Toast 提示（Demo）
 *************************************************************************************/

import { _decorator, Label, tween, Tween, UIOpacity, Widget } from "cc";
import { UIBase } from "../../../Framework/UI/UIBase";

const { ccclass, property } = _decorator;

interface IToastData {
    text?: string;
    duration?: number;
}

@ccclass("Toast")
export class Toast extends UIBase {
    @property(Label)
    private mMessageLabel: Label | null = null;

    @property({ tooltip: "Toast 基准位置 Y（相对父节点）" })
    private mBaseY: number = 100;

    @property({ tooltip: "入场起始偏移（从下往上出现）" })
    private mEnterOffsetY: number = 60;

    @property({ tooltip: "退场上移距离" })
    private mExitMoveUpY: number = 40;

    @property({ tooltip: "入场动画时长（秒）" })
    private mEnterDuration: number = 0.18;

    @property({ tooltip: "退场动画时长（秒）" })
    private mExitDuration: number = 0.28;

    private mToastDuration = 1.0;

    /** 生命周期：显示时刷新内容并播放动画 */
    protected OnShow(data?: IToastData): void {
        this.ApplyToastData(data);
        this.NormalizeRootTransform();
        this.PlayToastTween();
    }

    /** 生命周期：隐藏/关闭时停止动画 */
    protected OnHide(): void {
        Tween.stopAllByTarget(this.node);
    }

    protected OnClose(): void {
        Tween.stopAllByTarget(this.node);
    }

    private ApplyToastData(data?: IToastData): void {
        if (!data) return;
        if (this.mMessageLabel && typeof data.text === "string") {
            this.mMessageLabel.string = data.text;
        }
        if (typeof data.duration === "number" && data.duration > 0) {
            this.mToastDuration = data.duration;
        }
    }

    /** 播放 Toast 动画：出现 -> 停留 -> 上移淡出 */
    private PlayToastTween(): void {
        const total = Math.max(0.06, this.mToastDuration);
        let enter = this.mEnterDuration;
        let exit = this.mExitDuration;
        let stay = 0;

        const minDuration = enter + exit;
        if (total < minDuration) {
            const scale = total / minDuration;
            enter *= scale;
            exit *= scale;
        } else {
            stay = total - minDuration;
        }

        const startY = this.mBaseY - this.mEnterOffsetY;
        const endY = this.mBaseY;
        const exitY = this.mBaseY + this.mExitMoveUpY;

        Tween.stopAllByTarget(this.node);
        this.node.getComponent(UIOpacity).opacity = 0;
        this.node.setPosition(0, startY);

        tween(this.node)
            .to(enter, { y: endY }, { easing: "sineOut" })
            .delay(stay)
            .to(exit, { y: exitY }, { easing: "sineIn" })
            .start();

        tween(this.node.getComponent(UIOpacity))
            .to(enter, { opacity: 255 }, { easing: "sineOut" })
            .delay(stay)
            .to(exit, { opacity: 0 }, { easing: "sineIn" })
            .start();
    }

    /** 归一化 Toast 根节点变换，避免受 prefab 绝对坐标或 Widget 约束影响 */
    private NormalizeRootTransform(): void {
        const widget = this.node.getComponent(Widget);
        if (widget && widget.enabled) {
            widget.enabled = false;
        }
        this.node.setPosition(0, this.mBaseY);
    }
}