/*************************************************************************************
 * @File        : UIBase.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : UI 基类，提供统一生命周期与自关闭能力
 *************************************************************************************/

import { _decorator, Component } from "cc";
import { EventMgr } from "../Event/EventMgr";

const { ccclass } = _decorator;

interface IUIManagerLike {
    Close(uiId: string): void;
}

@ccclass("UIBase")
export class UIBase extends Component {
    /** 当前界面的 ID，子类可读用于日志 */
    protected mUIId: string = "";
    /** 框架内部持有，子类通过 CloseSelf() 关闭当前界面 */
    private mUIManagerRef: IUIManagerLike | null = null;

    /** 框架内部绑定，请勿手动调用 */
    public __Bind(uiId: string, uiManagerRef: IUIManagerLike): void {
        this.mUIId = uiId;
        this.mUIManagerRef = uiManagerRef;
    }

    /** 框架内部调用，请勿手动调用 */
    public __OnOpen(data?: any): void {
        this.OnOpen(data);
    }

    /** 框架内部调用，请勿手动调用 */
    public __OnClose(): void {
        try {
            this.OnClose();
        } finally {
            EventMgr.OffAll(this);
        }
    }

    /** 框架内部调用，请勿手动调用 */
    public __OnShow(data?: any): void {
        this.OnShow(data);
    }

    /** 框架内部调用，请勿手动调用 */
    public __OnHide(): void {
        this.OnHide();
    }

    /************************* 以下为生命周期回调，子类可重写 *************************/

    /** 生命周期：打开时触发 */
    protected OnOpen(data?: any): void { }
    /** 生命周期：关闭时触发 */
    protected OnClose(): void { }
    /** 生命周期：显示时触发 */
    protected OnShow(data?: any): void { }
    /** 生命周期：隐藏时触发 */
    protected OnHide(): void { }

    /************************* 以上为生命周期回调，子类可重写 *************************/

    /** 主动关闭当前界面 */
    public CloseSelf(): void {
        if (this.mUIManagerRef && this.mUIId) {
            this.mUIManagerRef.Close(this.mUIId);
        }
    }
}
