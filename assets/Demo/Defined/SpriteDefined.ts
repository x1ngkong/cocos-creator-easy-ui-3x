/*************************************************************************************
 * @File        : SpriteDefined.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 图片 / 图集资源路径定义（对应 resources/ 目录，不含后缀）
 *
 * 使用方式：
 *   // 加载单张散图
 *   const bg = await ResMgr.Load<cc.SpriteFrame>(NoPack.Bg, cc.SpriteFrame);
 *
 *   // 加载自动图集中的某张图（路径为 "图集目录/图片名"）
 *   const btn = await ResMgr.Load<cc.SpriteFrame>(Atlas.BtnBlue, cc.SpriteFrame);
 *************************************************************************************/

/**
 * 散图路径（不参与图集打包，适合大图 / 背景图）。
 * 对应 resources/UI/Res/NoPack/ 目录。
 */
export const NoPack = {
    /** 通用背景 */
    Bg: "UI/Res/NoPack/bg",
    /** 弹窗背景 */
    BgPop: "UI/Res/NoPack/bg_pop",
    /** 游戏面板 A 背景 */
    PanelA: "UI/Res/NoPack/panelA",
    /** 游戏面板 B 背景 */
    PanelB: "UI/Res/NoPack/panelB",
} as const;

/**
 * 自动图集路径。
 * 对应 resources/UI/Res/Atlas/ 目录（AutoAtlas 打包后通过 SpriteFrame 加载）。
 */
export const Atlas = {
    /** 蓝色按钮 */
    BtnBlue: "UI/Res/Atlas/btn_blue",
    /** 橙色按钮 */
    BtnOrange: "UI/Res/Atlas/btn_orange",
    /** 红色按钮 */
    BtnRed: "UI/Res/Atlas/btn_red",
    /** 绿色按钮 */
    BtnGreen: "UI/Res/Atlas/btn_green",
    /** 关闭按钮 */
    BtnClose: "UI/Res/Atlas/btn_close",
    /** 返回主页按钮 */
    BtnHome: "UI/Res/Atlas/btn_home",
    /** 纯白填充图 */
    White: "UI/Res/Atlas/white",
    /** GM 图标 */
    GmIcon: "UI/Res/Atlas/gm_icon",
    /** Toast 背景 */
    BgToast: "UI/Res/Atlas/bg_toast",
} as const;
