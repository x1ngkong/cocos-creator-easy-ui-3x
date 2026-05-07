/*************************************************************************************
 * @File        : GmPanel.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-07
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : GM 面板（Demo）
 *                覆盖演示：Toast / 全屏切换 / 弹窗队列 / StorageMgr / PoolMgr
 *************************************************************************************/

import { ToastMgr } from "../../../Framework/UI/ToastMgr";
import { UIBase } from "../../../Framework/UI/UIBase";
import { UIManager } from "../../../Framework/UI/UIManager";
import { AudioMgr } from "../../../Framework/Audio/AudioMgr";
import { EventMgr } from "../../../Framework/Event/EventMgr";
import { EventDefines } from "../../../Framework/Event/EventDefines";
import { StorageMgr } from "../../../Framework/Storage/StorageMgr";
import { StorageKeys } from "../../../Framework/Storage/StorageKeys";
import { PoolMgr } from "../../../Framework/Util/PoolMgr";
import { FrameLoader } from "../../../Framework/Util/FrameLoader";
import { UIDefine } from "../../Defined/UIDefine";
import { BGMDefined } from "../../Defined/AudioDefined";
import { _decorator, instantiate, isValid, Label, Node, Prefab } from "cc";

const { ccclass, property } = _decorator;

@ccclass("GmPanel")
export class GmPanel extends UIBase {

    /**
     * PoolMgr 演示：对象池测试预制体。
     * 编辑器中将任意简单节点 Prefab 拖入此槽，即可体验 Get / Put 流程。
     */
    @property(Prefab)
    private mPoolTestPrefab: Prefab | null = null;

    /**
     * PoolMgr 演示：对象池节点的挂载容器。
     * 编辑器中将一个空节点（作为容器）拖入此槽。
     */
    @property(Node)
    private mPoolContainer: Node | null = null;

    /**
     * FrameLoader 演示：分帧批量创建节点的挂载容器。
     * 编辑器中将一个空节点（作为容器）拖入此槽。
     */
    @property(Node)
    private mFrameContainer: Node | null = null;

    /**
     * PoolMgr 演示：实时显示"活跃 / 池中闲置"节点数量。
     * 编辑器中将一个 Label 节点拖入此槽。
     */
    @property(Label)
    private mPoolStatusLabel: Label | null = null;

    /**
     * FrameLoader 演示：实时显示"已完成 / 总数"进度。
     * 编辑器中将一个 Label 节点拖入此槽。
     */
    @property(Label)
    private mFrameStatusLabel: Label | null = null;

    /** 当前从池中取出的活跃节点列表（回收时遍历用） */
    private mActivePoolNodes: Node[] = [];

    /** AudioMgr 演示：本地追踪 BGM / SFX 静音状态与 BGM 音量 */
    private mBgmMuted = false;
    private mSfxMuted = false;
    private mBgmVolume = 1.0;
    private mBgmIsLobby = true;

    /** FrameLoader 演示：当前批量任务句柄（用于取消） */
    private mFrameBatch: ReturnType<typeof FrameLoader.AddBatch> | null = null;

    protected OnOpen(): void {
        // 订阅金币变化事件，用于演示 EventMgr（UIBase 关闭时自动 OffAll）
        EventMgr.On(EventDefines.PLAYER.CoinChanged, this.OnCoinChanged, this);
    }

    /**
     * 生命周期：面板关闭时将所有活跃池节点 Put 回池，并取消未完成的分帧任务。
     */
    protected OnClose(): void {
        // 取消未完成的分帧批量任务
        this.mFrameBatch?.Cancel();
        this.mFrameBatch = null;

        // 将活跃池节点全部回收
        if (this.mPoolTestPrefab) {
            for (const node of this.mActivePoolNodes) {
                if (isValid(node)) PoolMgr.Put(node);
            }
            this.mActivePoolNodes.length = 0;
        }
    }

    /***************************** Toast 测试 *****************************/

    /** 点击事件：推送单条 Toast */
    public OnClickSingleToast(): void {
        ToastMgr.Show("你好呀，祝你天天好心情~");
    }

    /** 点击事件：批量推送多条 Toast（串行队列依次显示） */
    public OnClickBatchToast(): void {
        ToastMgr.Show("第 1 条 Toast");
        ToastMgr.Show("第 2 条 Toast");
        ToastMgr.Show("第 3 条 Toast");
    }

    /** 点击事件：立即停止并清空 Toast 队列 */
    public OnClickStopToast(): void {
        ToastMgr.StopAndClear();
    }

    /***************************** 全屏界面 *****************************/

    /** 点击事件：打开全屏界面 A（ReShow 模式） */
    public OnClickOpenFullScreenA(): void {
        const msg = "这是一个全屏界面，目前在 PanelA\n\n嘿，看见粉色气泡了吗！\n你可以任意拖动它，点击它看看！\n气泡定位不会超出屏幕，不信你试试！";
        UIManager.Instance.Open(UIDefine.GamePanelA, { title: "全屏界面 Panel A", msg, name: "Danny" });
        this.CloseSelf();
    }

    /** 点击事件：打开全屏界面 B（ReCreate 模式，切换后 10s 销毁） */
    public OnClickOpenFullScreenB(): void {
        UIManager.Instance.Open(UIDefine.GamePanelB, { title: "全屏界面 Panel B", msg: "进入了游戏面板 B", name: "Alicia" });
        this.CloseSelf();
    }

    /** 点击事件：打开全屏界面 C（ReCreate 模式，切换后 15s 销毁） */
    public OnClickOpenFullScreenC(): void {
        UIManager.Instance.Open(UIDefine.GamePanelC, { title: "全屏界面 Panel C", msg: "进入了游戏面板 C", name: "Charlie" });
        this.CloseSelf();
    }

    /***************************** 弹窗队列 *****************************/

    /** 点击事件：同时推入弹窗 A、B、C（串行队列依次显示） */
    public OnClickOpenPopABC(): void {
        UIManager.Instance.Open(UIDefine.GamePopA, { title: "弹窗 A", content: "弹窗 B 和 C 已入队，关闭我后会依次出现！" });
        UIManager.Instance.Open(UIDefine.GamePopB, { title: "弹窗 B", content: "弹窗 B 来啦！" });
        UIManager.Instance.Open(UIDefine.GamePopC, { title: "弹窗 C", content: "弹窗 C 也来了" });
        this.CloseSelf();
    }

    /** 点击事件：弹窗 A 入队 */
    public OnClickOpenPopA(): void {
        UIManager.Instance.Open(UIDefine.GamePopA, { title: "弹窗 A", content: "弹窗 A 已加入队列" });
        this.CloseSelf();
    }

    /** 点击事件：弹窗 B 绕过队列立即打开（bypassQueue） */
    public OnClickOpenPopB(): void {
        UIManager.Instance.Open(UIDefine.GamePopB, { title: "弹窗 B", content: "弹窗 B 跳过队列，立即打开！" }, { bypassQueue: true });
        this.CloseSelf();
    }

    /** 点击事件：弹窗 C 绕过队列立即打开（bypassQueue） */
    public OnClickOpenPopC(): void {
        UIManager.Instance.Open(UIDefine.GamePopC, { title: "弹窗 C", content: "弹窗 C 跳过队列，立即打开！" }, { bypassQueue: true });
        ToastMgr.Show("弹窗 C 已立即打开");
        this.CloseSelf();
    }

    /***************************** StorageMgr 测试 *****************************/

    /**
     * 点击事件：金币 +100 并持久化到本地存储。
     * 重启 Demo 后金币不会丢失。
     */
    public OnClickStorageAddCoin(): void {
        const cur = StorageMgr.GetNumber(StorageKeys.PLAYER.Coin, 0);
        const next = cur + 100;
        StorageMgr.SetNumber(StorageKeys.PLAYER.Coin, next);
        ToastMgr.Show(`金币 +100，当前金币：${next}`);
    }

    /**
     * 点击事件：读取并展示当前本地存储的金币数值。
     */
    public OnClickStorageReadCoin(): void {
        const coin = StorageMgr.GetNumber(StorageKeys.PLAYER.Coin, 0);
        ToastMgr.Show(`本地存储金币：${coin}`);
    }

    /**
     * 点击事件：清除金币存储记录（模拟清档）。
     */
    public OnClickStorageClearCoin(): void {
        StorageMgr.Remove(StorageKeys.PLAYER.Coin);
        ToastMgr.Show("金币存档已清除，再次读取将返回默认值 0");
    }

    /**
     * 点击事件：存储/读取音量设置（演示 GetNumber / SetNumber）。
     * 实际项目在 SetBGMVolume 滑块变化时调用 SetNumber 存储即可。
     */
    public OnClickStorageSaveSettings(): void {
        const bgm = 0.8;
        const sfx = 0.5;
        StorageMgr.SetNumber(StorageKeys.SETTINGS.BGM, bgm);
        StorageMgr.SetNumber(StorageKeys.SETTINGS.SFX, sfx);
        ToastMgr.Show(`音量已保存：BGM=${bgm}  SFX=${sfx}`);
    }

    /***************************** PoolMgr 测试 *****************************/

    /**
     * 点击事件：从对象池取一个节点并挂到容器上。
     * 若池为空则自动 instantiate；若池中有闲置节点则直接复用。
     *
     * 使用前请在编辑器为 mPoolTestPrefab 和 mPoolContainer 赋值。
     */
    public OnClickPoolGet(): void {
        if (!this.mPoolTestPrefab || !this.mPoolContainer) {
            ToastMgr.Show("请在编辑器中为 mPoolTestPrefab 和 mPoolContainer 赋值");
            return;
        }
        const node = PoolMgr.Get(this.mPoolTestPrefab);
        node.parent = this.mPoolContainer;
        this.mActivePoolNodes.push(node);
        this.RefreshPoolLabel();
    }

    /**
     * 点击事件：将所有活跃节点一次性回收到对象池。
     * 回收后节点 active = false，可再次被 Get 取出复用。
     */
    public OnClickPoolPutAll(): void {
        if (!this.mPoolTestPrefab) return;
        for (const node of this.mActivePoolNodes) PoolMgr.Put(node);
        this.mActivePoolNodes.length = 0;
        this.RefreshPoolLabel();
    }

    /** 刷新 PoolMgr 状态标签（活跃数 / 池中闲置数） */
    private RefreshPoolLabel(): void {
        if (!this.mPoolStatusLabel || !this.mPoolTestPrefab) return;
        const idle = PoolMgr.GetSize(this.mPoolTestPrefab.name);
        this.mPoolStatusLabel.string = `活跃：${this.mActivePoolNodes.length}  |  池中：${idle}`;
    }

    /***************************** AudioMgr 测试 *****************************/

    /** 点击事件：在大厅 / 游戏 BGM 之间循环切换 */
    public OnClickBGMSwitch(): void {
        this.mBgmIsLobby = !this.mBgmIsLobby;
        const path = this.mBgmIsLobby ? BGMDefined.Lobby : BGMDefined.Game;
        AudioMgr.PlayBGM(path);
        ToastMgr.Show(`BGM → ${this.mBgmIsLobby ? "大厅" : "游戏"}`);
    }

    /** 点击事件：切换 BGM 静音状态 */
    public OnClickBGMMuteToggle(): void {
        this.mBgmMuted = !this.mBgmMuted;
        AudioMgr.MuteBGM(this.mBgmMuted);
        ToastMgr.Show(`BGM ${this.mBgmMuted ? "已静音" : "已取消静音"}`);
    }

    /** 点击事件：停止 BGM（0.3s 淡出） */
    public OnClickBGMStop(): void {
        AudioMgr.StopBGM();
        ToastMgr.Show("BGM 已停止");
    }

    /** 点击事件：暂停 BGM */
    public OnClickBGMPause(): void {
        AudioMgr.PauseBGM();
        ToastMgr.Show("BGM 已暂停");
    }

    /** 点击事件：恢复 BGM */
    public OnClickBGMResume(): void {
        AudioMgr.ResumeBGM();
        ToastMgr.Show("BGM 已恢复");
    }

    /** 点击事件：BGM 音量 +0.1 */
    public OnClickBGMVolUp(): void {
        this.mBgmVolume = Math.min(1, parseFloat((this.mBgmVolume + 0.1).toFixed(1)));
        AudioMgr.SetBGMVolume(this.mBgmVolume);
        StorageMgr.SetNumber(StorageKeys.SETTINGS.BGM, this.mBgmVolume);
        ToastMgr.Show(`BGM 音量：${this.mBgmVolume.toFixed(1)}`);
    }

    /** 点击事件：BGM 音量 -0.1 */
    public OnClickBGMVolDown(): void {
        this.mBgmVolume = Math.max(0, parseFloat((this.mBgmVolume - 0.1).toFixed(1)));
        AudioMgr.SetBGMVolume(this.mBgmVolume);
        StorageMgr.SetNumber(StorageKeys.SETTINGS.BGM, this.mBgmVolume);
        ToastMgr.Show(`BGM 音量：${this.mBgmVolume.toFixed(1)}`);
    }

    /***************************** EventMgr 测试 *****************************/

    /**
     * 点击事件：派发 CoinChanged 事件（演示 EventMgr 发布/订阅）。
     * GmPanel.OnOpen 中已注册监听，事件触发后 Toast 会显示变化详情。
     */
    public OnClickEventEmitCoin(): void {
        const before = StorageMgr.GetNumber(StorageKeys.PLAYER.Coin, 0);
        const after = before + 50;
        StorageMgr.SetNumber(StorageKeys.PLAYER.Coin, after);
        EventMgr.Emit(EventDefines.PLAYER.CoinChanged, { before, after });
    }

    /** 金币变化事件回调 */
    private OnCoinChanged(data: { before: number; after: number }): void {
        ToastMgr.Show(`金币变化：${data.before} → ${data.after}`);
    }

    /***************************** FrameLoader 测试 *****************************/

    /**
     * 点击事件：分帧批量创建 30 个节点（演示 FrameLoader 避免单帧卡顿）。
     * 需在编辑器中为 mFrameContainer 和 mPoolTestPrefab 赋值。
     */
    public OnClickFrameLoaderBatch(): void {
        if (!this.mFrameContainer || !this.mPoolTestPrefab) {
            ToastMgr.Show("请在编辑器中为 mFrameContainer 和 mPoolTestPrefab 赋值");
            return;
        }
        if (this.mFrameBatch && !this.mFrameBatch.isDone) {
            ToastMgr.Show("分帧任务进行中，请稍候…");
            return;
        }

        const prefab = this.mPoolTestPrefab;
        const container = this.mFrameContainer;
        const total = 30;
        const tasks = Array.from({ length: total }, (_, i) => () => {
            const node = instantiate(prefab);
            node.parent = container;
        });

        this.RefreshFrameLabel(0, total);
        this.mFrameBatch = FrameLoader.AddBatch(tasks, {
            priority: 1,
            onProgress: (done, all) => this.RefreshFrameLabel(done, all),
            onComplete: () => {
                this.RefreshFrameLabel(total, total);
                ToastMgr.Show(`分帧完成，共创建 ${total} 个节点`);
            },
        });
    }

    /** 点击事件：取消分帧任务并清空容器内所有子节点 */
    public OnClickFrameLoaderClear(): void {
        this.mFrameBatch?.Cancel();
        this.mFrameBatch = null;
        if (this.mFrameContainer) this.mFrameContainer.removeAllChildren();
        if (this.mFrameStatusLabel) this.mFrameStatusLabel.string = "已取消";
        ToastMgr.Show("分帧任务已取消，容器已清空");
    }

    /** 刷新 FrameLoader 进度标签（已创建 / 总数） */
    private RefreshFrameLabel(done: number, total: number): void {
        if (!this.mFrameStatusLabel) return;
        this.mFrameStatusLabel.string = `进度：${done} / ${total}`;
    }

    /***************************** 关闭 *****************************/

    /** 点击事件：关闭 GM 面板 */
    public OnClickClose(): void {
        this.CloseSelf();
    }
}