/*************************************************************************************
 * @File        : ButtonSFXPatch.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 全局按钮点击音效补丁，调用一次后所有 Button 自动播放点击音效
 *************************************************************************************/

import { Button, director, Node } from "cc";
import { AudioMgr } from "../Audio/AudioMgr";

const PATCHED_FLAG = "__sfxPatched__";
const SFX_DISABLED_FLAG = "__buttonSfxDisabled__";

type PatchedButtonPrototype = Button & {
    start?: () => void;
    [PATCHED_FLAG]?: boolean;
};

type ButtonSFXNode = Node & {
    [SFX_DISABLED_FLAG]?: boolean;
};

/**
 * 全局 patch Button，使所有按钮点击时自动播放指定音效。
 * 在应用启动时调用一次即可，后续新增的按钮也会自动生效。
 *
 * 重复调用安全：
 *   - 第一次调用：包裹原始 start，注册 click 监听
 *   - 后续调用：仅更新 sfxPath，不重复包裹 start
 *
 * 跳过某个按钮的方法：调用 SetButtonClickSFXEnabled(button.node, false)。
 *
 * @param sfxPath  resources 下的音效路径，不含后缀
 */
export function PatchButtonClickSFX(sfxPath: string): void {
    currentSfxPath = sfxPath;

    const proto = Button.prototype as PatchedButtonPrototype;
    if (!proto[PATCHED_FLAG]) {
        proto[PATCHED_FLAG] = true;

        const origStart = proto.start;
        proto.start = function (): void {
            origStart?.call(this);
            BindButtonClickSFX(this);
        };
    }

    BindExistingButtons();
}

let currentSfxPath: string = "";

/** 设置某个按钮节点是否播放全局点击音效 */
export function SetButtonClickSFXEnabled(node: Node, enabled: boolean): void {
    (node as ButtonSFXNode)[SFX_DISABLED_FLAG] = !enabled;
}

/** 按钮点击事件回调 */
function OnButtonClick(this: Button): void {
    if (!currentSfxPath) return;
    if ((this.node as ButtonSFXNode)[SFX_DISABLED_FLAG]) return;
    AudioMgr.PlaySFX(currentSfxPath);
}

/** 绑定按钮点击音效 */
function BindButtonClickSFX(button: Button): void {
    button.node.off(Button.EventType.CLICK, OnButtonClick, button);
    button.node.on(Button.EventType.CLICK, OnButtonClick, button);
}

/** 绑定现有按钮点击音效 */
function BindExistingButtons(): void {
    const scene = director.getScene();
    if (!scene) return;
    const buttons = scene.getComponentsInChildren(Button);
    buttons.forEach(button => BindButtonClickSFX(button));
}
