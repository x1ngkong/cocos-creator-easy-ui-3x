/*************************************************************************************
 * @File        : GamePanelA.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 游戏全屏面板（Demo）
 *************************************************************************************/

import { _decorator, EventTouch, Label, math, Node, NodeEventType, UITransform, Vec2, view } from "cc";
import { AudioMgr } from "../../../Framework/Audio/AudioMgr";
import { UIBase } from "../../../Framework/UI/UIBase";
import { UIManager } from "../../../Framework/UI/UIManager";
import { BGMDefined } from "../../Defined/AudioDefined";
import { UIDefine } from "../../Defined/UIDefine";

const { ccclass, property } = _decorator;

@ccclass("GamePanelA")
export class GamePanelA extends UIBase {

    @property(Label)
    private mTitle: Label | null = null;

    @property(Label)
    private mContent: Label | null = null;

    @property(Node)
    private mBubbleNode: Node | null = null;

    /** 本次触摸累计移动距离（超过阈值才视为拖拽） */
    private mMoveDis: number = 0;
    private mIsMove: boolean = false;

    protected OnOpen(data?: any): void {
        console.log("[FullScreen] GamePanelA OnOpen", data);
        this.mTitle.string = data?.title ?? "全屏界面 Panel A";
        this.mContent.string = `${data?.name ?? ""}${data?.msg ?? ""}`;
        this.RegisterBubbleTouchEvents();
    }

    protected OnClose(): void {
        console.log("[FullScreen] GamePanelA OnClose");
        this.UnregisterBubbleTouchEvents();
    }

    protected OnShow(data?: any): void {
        console.log("[FullScreen] GamePanelA OnShow", data);
        AudioMgr.PlayBGM(BGMDefined.Game);
    }

    protected OnHide(): void {
        console.log("[FullScreen] GamePanelA OnHide");
    }

    // ─────────────────────────── 触摸拖拽 ───────────────────────────

    private RegisterBubbleTouchEvents(): void {
        if (!this.mBubbleNode) return;
        this.mBubbleNode.on(NodeEventType.TOUCH_START, this.OnBubbleTouchStart, this);
        this.mBubbleNode.on(NodeEventType.TOUCH_MOVE, this.OnBubbleTouchMove, this);
        this.mBubbleNode.on(NodeEventType.TOUCH_END, this.OnBubbleTouchEnd, this);
        this.mBubbleNode.on(NodeEventType.TOUCH_CANCEL, this.OnBubbleTouchCancel, this);
    }

    private UnregisterBubbleTouchEvents(): void {
        if (!this.mBubbleNode) return;
        this.mBubbleNode.off(NodeEventType.TOUCH_START, this.OnBubbleTouchStart, this);
        this.mBubbleNode.off(NodeEventType.TOUCH_MOVE, this.OnBubbleTouchMove, this);
        this.mBubbleNode.off(NodeEventType.TOUCH_END, this.OnBubbleTouchEnd, this);
        this.mBubbleNode.off(NodeEventType.TOUCH_CANCEL, this.OnBubbleTouchCancel, this);
    }

    private OnBubbleTouchStart(): void {
        this.mMoveDis = 0;
        this.mIsMove = false;
    }

    private OnBubbleTouchMove(event: EventTouch): void {
        const delta = event.getDelta();
        this.mMoveDis += Vec2.len(delta);
        if (this.mMoveDis >= 10) this.mIsMove = true;
        if (!this.mIsMove) return;

        const uiTransform = this.mBubbleNode.getComponent(UITransform);
        const vis = view.getVisibleSize();
        const halfVW = vis.width * 0.5;
        const halfVH = vis.height * 0.5;
        const halfNW = uiTransform.contentSize.width * 0.5;
        const halfNH = uiTransform.contentSize.height * 0.5;

        const destX = this.mBubbleNode.x + delta.x;
        const destY = this.mBubbleNode.y + delta.y;

        this.mBubbleNode.x = math.clamp(destX, -halfVW + halfNW, halfVW - halfNW);
        this.mBubbleNode.y = math.clamp(destY, -halfVH + halfNH, halfVH - halfNH);
    }

    private OnBubbleTouchEnd(): void {
        if (!this.mIsMove) {
            this.OnClickShowBubble();
        }
        this.mIsMove = false;
        this.mMoveDis = 0;
    }

    private OnBubbleTouchCancel(): void {
        this.mIsMove = false;
        this.mMoveDis = 0;
    }

    // ─────────────────────────── 点击事件 ───────────────────────────

    public OnClickBackLobby(): void {
        UIManager.Instance.Open(UIDefine.LobbyPanel);
        this.CloseSelf();
    }

    public OnClickShowBubble(): void {
        if (!this.mBubbleNode) return;
        UIManager.Instance.Open(UIDefine.CommonBubble, {
            message: "这是一个气泡，目前在PanelA，祝你天天开心呀",
            worldBoundingBox: this.mBubbleNode.getComponent(UITransform).getBoundingBoxToWorld(),
        });
    }
}