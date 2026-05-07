/*************************************************************************************
 * @File        : ConfigDefined.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 配置文件资源路径定义（对应 resources/ 目录，不含后缀）
 *
 * 使用方式：
 *   const asset = await ResMgr.Load<cc.JsonAsset>(ConfigDefined.Game, cc.JsonAsset);
 *   const data = asset?.json;
 *************************************************************************************/

/** JSON 配置文件路径 */
export const ConfigDefined = {
    /** 游戏基础配置 */
    Game: "Config/game",
} as const;
