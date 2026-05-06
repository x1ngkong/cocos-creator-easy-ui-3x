/*************************************************************************************
 * @File        : EventDefines.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 全局事件 ID 定义（整数自增、模块分组、Debug 名称映射）
 *
 * 设计说明：
 *   - 事件 ID 为整数，运行时比较开销最小，适合高频大量事件
 *   - 每个模块使用独立起始段（LOGIN=10000, PLAYER=11000...），
 *     段内新增事件只需追加，不影响其他模块的 ID，彻底规避中间插入导致偏移的问题
 *   - Debug 模式下维护 ID→名称反查表，方便日志调试
 *   - 数据结构由业务层在 On / Emit 的泛型中自行声明，此文件只定义事件 ID
 *
 * ── 新增事件 ─────────────────────────────────────────────────────────────────────
 *
 *   1. 在对应模块对象末尾追加一行（禁止中间插入）：
 *      NewEvent: EventDefines.Next("MODULE.NEW_EVENT"),
 *
 *   2. 新增模块：复制一个模块块，修改起始 ID（与现有模块段不重叠即可）
 *
 * ── 使用示例 ─────────────────────────────────────────────────────────────────────
 *
 *   // 监听
 *   EventMgr.On<{ before: number; after: number }>(
 *       EventDefines.PLAYER.CoinChanged,
 *       ({ before, after }) => { this.mLabel.string = String(after); },
 *       this,
 *   );
 *
 *   // 派发
 *   EventMgr.Emit(EventDefines.PLAYER.CoinChanged, { before: 100, after: 200 });
 *
 *   // 无数据事件
 *   EventMgr.Emit(EventDefines.GAME.Pause);
 *
 *   // Debug：根据 ID 查名称（仅 Debug 模式有效）
 *   EventDefines.GetName(EventDefines.PLAYER.CoinChanged); // "PLAYER.CoinChanged"
 *
 *************************************************************************************/

export type EventId = number & { readonly __eventId: never };

export class EventDefines {
    private static mNextId = 0;

    /** Debug 模式下的 ID → 名称反查表 */
    private static readonly mNameMap = new Map<EventId, string>();

    /** 分配下一个 EventId，Debug 模式同时记录名称 */
    private static Next(name: string): EventId {
        const id = this.mNextId++ as EventId;
        this.mNameMap.set(id, name);
        return id;
    }

    /** Debug 模式下根据事件 ID 查询可读名称，生产环境返回 ID 字符串 */
    public static GetName(id: EventId): string {
        return this.mNameMap.get(id) ?? String(id);
    }

    // -- UI（段：0 ~ 999）------------------------------------------------------

    static readonly UI = {
        PopupOpen: EventDefines.Next("UI.PopupOpen"),
        PopupClose: EventDefines.Next("UI.PopupClose"),
    };

    // -- 玩家（段：1000 ~ 1999）------------------------------------------------

    private static readonly mSegPlayer = (EventDefines.mNextId = 1000);

    static readonly PLAYER = {
        CoinChanged: EventDefines.Next("PLAYER.CoinChanged"),
        GemChanged: EventDefines.Next("PLAYER.GemChanged"),
        ExpChanged: EventDefines.Next("PLAYER.ExpChanged"),
        LevelUp: EventDefines.Next("PLAYER.LevelUp"),
        Login: EventDefines.Next("PLAYER.Login"),
        Logout: EventDefines.Next("PLAYER.Logout"),
    };

    // -- 游戏流程（段：2000 ~ 2999）--------------------------------------------

    private static readonly mSegGame = (EventDefines.mNextId = 2000);

    static readonly GAME = {
        SceneEnter: EventDefines.Next("GAME.SceneEnter"),
        SceneExit: EventDefines.Next("GAME.SceneExit"),
        Pause: EventDefines.Next("GAME.Pause"),
        Resume: EventDefines.Next("GAME.Resume"),
        Disconnect: EventDefines.Next("GAME.Disconnect"),
        Reconnect: EventDefines.Next("GAME.Reconnect"),
    };
}
