/*************************************************************************************
 * @File        : UIDefines.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : UI 框架通用类型与配置定义
 *************************************************************************************/

/** UI 分组类型 */
export enum UIGroupType {
    /** 全屏界面 */
    FullScreen = "FullScreen",
    /** 弹窗界面 */
    Popup = "Popup",
    /** 气泡界面 */
    Bubble = "Bubble",
    /** 引导界面 */
    Guide = "Guide",
    /** 提示界面 */
    Toast = "Toast",
    /** GM 界面 */
    GameMaster = "GameMaster",
}

/** 界面恢复模式 */
export enum UIRecoverMode {
    /** 重新显示 */
    ReShow = "ReShow",
    /** 重新创建 */
    ReCreate = "ReCreate",
}

/** UI 分组配置 */
export interface UIGroupConfig {
    /** 分组 zIndex */
    zIndex: number;
    /** 是否启用串行队列，默认 false，Popup 分组应设为 true */
    useQueue?: boolean;
}

/** UI 配置基础字段（所有分组共用） */
interface IBaseUIConfig {
    /** UI ID */
    id: string;
    /** UI 预制体路径 */
    prefabPath: string;
    /** UI 分组类型（作为判别字段） */
    group: UIGroupType;
}

/** 全屏界面配置 */
export interface IFullScreenConfig extends IBaseUIConfig {
    /** UI 分组类型（作为判别字段） */
    group: UIGroupType.FullScreen;
    /**
     * 被其他全屏覆盖后的恢复策略，默认 ReShow。
     * - ReShow：保留节点，切回时直接激活（适合常驻界面）
     * - ReCreate：覆盖后延时销毁（见 destroyDelaySeconds），切回时重建（适合大场景界面）
     */
    recoverMode?: UIRecoverMode;
    /** recoverMode = ReCreate 时，被覆盖后延时销毁的等待秒数，默认 0（立即销毁） */
    destroyDelaySeconds?: number;
}

/** 弹窗界面配置 */
export interface IPopupConfig extends IBaseUIConfig {
    /** UI 分组类型（作为判别字段） */
    group: UIGroupType.Popup;
    /** 是否参与串行队列，默认 true */
    queueable?: boolean;
    /** 是否使用通用黑色遮罩，默认 true */
    popupUseMask?: boolean;
}

/** 气泡界面配置 */
export interface IBubbleConfig extends IBaseUIConfig {
    group: UIGroupType.Bubble;
}

/** 引导界面配置 */
export interface IGuideConfig extends IBaseUIConfig {
    group: UIGroupType.Guide;
}

/** 提示界面配置 */
export interface IToastConfig extends IBaseUIConfig {
    group: UIGroupType.Toast;
}

/** GM 界面配置 */
export interface IGameMasterConfig extends IBaseUIConfig {
    group: UIGroupType.GameMaster;
}

/** UI 配置（按 group 字段判别，TypeScript 自动收窄到对应子类型） */
export type UIConfig =
    | IFullScreenConfig
    | IPopupConfig
    | IBubbleConfig
    | IGuideConfig
    | IToastConfig
    | IGameMasterConfig;


/** 打开 UI 的附加选项 */
export interface UIOpenOptions {
    /** 是否跳过队列，默认 false */
    bypassQueue?: boolean;
}
