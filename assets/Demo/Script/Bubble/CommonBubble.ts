/*************************************************************************************
 * @File        : CommonBubble.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 通用气泡提示，支持背景自适应文字尺寸 + 屏幕边界回弹 + 点击外部关闭
 *
 * 调用方传入数据格式：
 *   message        : string   — 气泡文字
 *   worldBoundingBox: cc.Rect — 锚点（按钮）的世界空间包围盒，由 getBoundingBoxToWorld() 获取
 *
 * 定位策略（绝不遮挡锚点按钮）：
 *   垂直：优先下方（气泡顶 = 按钮底 + GAP），下方放不下则上方，都放不下则选空间更大一侧并夹边
 *   水平：气泡中心对齐按钮中心，夹边保证气泡完整在屏幕内
 *************************************************************************************/

import { _decorator, Label, Layout, math, Node, Rect, UIOpacity, UITransform, v2, v3 } from 'cc';
import { UIBase } from 'db://assets/Framework/UI/UIBase';
const { ccclass, property } = _decorator;

@ccclass('CommonBubble')
export class CommonBubble extends UIBase {
    @property(Node)
    private mBubbleBg: Node | null = null;

    @property(Label)
    private mMessageLabel: Label | null = null;

    private mAnchorBBox: Rect = new Rect(0, 0, 0, 0);

    protected OnOpen(data?: any): void {
        if (this.mBubbleBg) this.mBubbleBg.getComponent(UIOpacity).opacity = 0;
        if (this.mMessageLabel) this.mMessageLabel.string = data?.message ?? "";
        this.mAnchorBBox = data?.worldBoundingBox ?? new Rect(0, 0, 0, 0);
        this.scheduleOnce(this.RefreshLayout, 0);
    }

    protected OnClose(): void {
        this.unschedule(this.RefreshLayout);
    }

    // ─────────────────────────── 定位 ───────────────────────────

    private RefreshLayout(): void {
        if (!this.mBubbleBg) return;

        this.mBubbleBg.getComponent(Layout)?.updateLayout();
        this.mBubbleBg.getComponent(UIOpacity).opacity = 255;

        const GAP = 8;
        const bSize = this.mBubbleBg.getComponent(UITransform).contentSize;
        const halfBW = bSize.width * 0.5;
        const halfBH = bSize.height * 0.5;

        // ── 将按钮世界包围盒的中心转为 mBubbleBg 父节点本地坐标 ──
        // mBubbleBg.parent == this.node（prefab 根，在 Bubble_group 中居中无缩放）
        // 所以 convertToNodeSpaceAR 结果与 Bubble_group 本地坐标等价
        const bgParent = this.mBubbleBg.parent;
        const bbox = this.mAnchorBBox;
        const btnCenterW = v3(bbox.x + bbox.width * 0.5, bbox.y + bbox.height * 0.5, 0);
        const btnLocal = bgParent.getComponent(UITransform).convertToNodeSpaceAR(btnCenterW);
        // 按钮半高：getBoundingBoxToWorld 已含累积缩放，与 convertToNodeSpaceAR 同单位
        const btnHalfH = bbox.height * 0.5;

        // ── 屏幕边界（气泡中心可活动范围） ──
        // this.node.parent == Bubble_group，其 contentSize == 设计分辨率
        const groupSize = this.node.parent.getComponent(UITransform).contentSize;
        const minX = -groupSize.width * 0.5 + halfBW;
        const maxX = groupSize.width * 0.5 - halfBW;
        const minY = -groupSize.height * 0.5 + halfBH;
        const maxY = groupSize.height * 0.5 - halfBH;

        // ── 水平：对齐按钮中心，夹边 ──
        const cx = math.clamp(btnLocal.x, minX, maxX);

        // ── 垂直：y-up 坐标系，「下方」= 更小 y ──
        // 优先放按钮下方，放不下则上方，都放不下则夹边到空间更大的一侧
        const belowCY = btnLocal.y - btnHalfH - halfBH - GAP;
        const aboveCY = btnLocal.y + btnHalfH + halfBH + GAP;

        let cy: number;
        // 下方有位置
        if (belowCY >= minY) {
            cy = belowCY;
        }
        // 上方有位置
        else if (aboveCY <= maxY) {
            cy = aboveCY;
        }
        else {
            const spaceBelow = btnLocal.y - btnHalfH - minY;
            const spaceAbove = maxY - (btnLocal.y + btnHalfH);
            cy = math.clamp(spaceBelow >= spaceAbove ? belowCY : aboveCY, minY, maxY);
        }

        this.mBubbleBg.setPosition(cx, cy);
    }
}

