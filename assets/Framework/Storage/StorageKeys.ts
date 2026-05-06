/*************************************************************************************
 * @File        : StorageKeys.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 本地存储 Key 常量定义（按模块分组，杜绝魔法字符串）
 *
 * 设计说明：
 *   - Key 为字符串常量，运行时值即为写入 localStorage 的实际 Key（含 StorageMgr 前缀后）
 *   - 按业务模块分组，新增 Key 只需在对应模块末尾追加，不影响其他模块
 *   - Key 值推荐使用 snake_case，与前缀拼接后易于在设备存储中识别
 *
 * ── 新增 Key ──────────────────────────────────────────────────────────────────────
 *
 *   1. 在对应模块对象末尾追加一行：
 *      NewProp: "new_prop",
 *
 *   2. 新增模块：复制一个模块块，修改分组名称
 *
 * ── 使用示例 ─────────────────────────────────────────────────────────────────────
 *
 *   StorageMgr.SetNumber(StorageKeys.PLAYER.Coin, 999);
 *   const coin = StorageMgr.GetNumber(StorageKeys.PLAYER.Coin);
 *
 *   StorageMgr.SetNumber(StorageKeys.SETTINGS.BGM, 0.8);
 *   const bgm = StorageMgr.GetNumber(StorageKeys.SETTINGS.BGM, 1.0);
 *
 *************************************************************************************/

export class StorageKeys {
    // -- 玩家数据 ---------------------------------------------------------------

    static readonly PLAYER = {
        Coin: "player_coin",
        Gem: "player_gem",
        Level: "player_level",
        Exp: "player_exp",
    };

    // -- 设置 -----------------------------------------------------------------

    static readonly SETTINGS = {
        BGM: "settings_bgm",
        SFX: "settings_sfx",
        Language: "settings_language",
    };

    // -- 游戏进度 -------------------------------------------------------------

    static readonly PROGRESS = {
        MaxStage: "progress_max_stage",
        LastStageId: "progress_last_stage_id",
    };

    // -- 系统 -----------------------------------------------------------------

    static readonly SYSTEM = {
        FirstLaunch: "sys_first_launch",
        LastLoginTime: "sys_last_login_time",
    };
}
