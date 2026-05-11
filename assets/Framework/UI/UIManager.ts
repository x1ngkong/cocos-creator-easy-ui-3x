/*************************************************************************************
 * @File        : UIManager.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 通用 UI 管理器（分组、全屏切换、延时销毁、弹窗队列）
 *************************************************************************************/

import { BlockInputEvents, Color, find, Graphics, instantiate, isValid, Node, Prefab, tween, Tween, UIOpacity, UITransform, Vec3 } from "cc";
import { UIBase } from "./UIBase";
import { UIRegistry } from "./UIRegistry";
import { UIConfig, UIGroupConfig, UIGroupType, UIOpenOptions, UIRecoverMode } from "./UIDefines";
import { ResMgr } from "../Res/ResMgr";
import { ITimerHandle, TimerMgr } from "../Util/TimerMgr";

/** 打开 UI 请求 */
interface IUIOpenRequest {
    uiId: string;
    data?: any;
    /** 保留原始 options，供弹窗从队列打开时继承非 bypassQueue 选项 */
    options?: UIOpenOptions;
}

/** UI 记录 */
interface IUIRecord {
    uiId: string;
    config: UIConfig;
    node: Node;
    ui: UIBase | null;
    visible: boolean;
    /** 上次打开数据 */
    lastOpenData?: any;
    /** 延时销毁定时器句柄，可随时取消 */
    destroyTimer: ITimerHandle | null;
    /** 仅队列托管的弹窗关闭时才推进队列，防止 bypassQueue 竞态 */
    isQueueManaged: boolean;
}

/** UI 管理器 */
export class UIManager {
    private static mInstance: UIManager | null = null;
    private static readonly mRootPath = "Canvas/UIGroupRoot";
    private static readonly mPopupMaskNodeName = "PopupMask";
    private static readonly mPopupMaskOpacity = 160;
    private static readonly mPopupEnterScaleFrom = 0.92;
    private static readonly mPopupEnterDuration = 0.18;
    /** 遮罩填充色缓存，避免每次重绘 new Color */
    private static readonly mMaskFillColor = new Color(0, 0, 0, UIManager.mPopupMaskOpacity);
    /** 分组根节点映射 */
    private readonly mGroupRoots = new Map<UIGroupType, Node>();
    /** 分组栈映射 */
    private readonly mGroupStacks = new Map<UIGroupType, string[]>();
    /** UI 记录映射 */
    private readonly mRecordMap = new Map<string, IUIRecord>();
    /** 弹窗队列 */
    private readonly mPopupQueue: IUIOpenRequest[] = [];
    /** 异步加载中的 uiId 计数，Close 在无 record 时可标记取消 */
    private readonly mPendingOpens = new Map<string, number>();
    /** 每个 uiId 当前 Open 请求版本，用于区分同 uiId 并发打开 */
    private readonly mOpenVersions = new Map<string, number>();
    /** 已取消到哪个 Open 请求版本，避免一次取消被并发请求提前消费 */
    private readonly mCancelledOpenVersions = new Map<string, number>();

    /** 队列托管的弹窗是否正在展示中（等待关闭后推进队列） */
    private mHasQueueManagedPopup = false;
    private mRootReady = false;
    private mPopupMaskNode: Node | null = null;
    /** 上次绘制遮罩时的画布尺寸，尺寸不变则跳过 Graphics 重绘 */
    private mLastMaskContentSize = { w: -1, h: -1 };

    /** 分组配置映射 */
    private readonly mGroupConfigMap = new Map<UIGroupType, UIGroupConfig>([
        [UIGroupType.FullScreen, { zIndex: 100 }],
        [UIGroupType.Popup, { zIndex: 200, useQueue: true }],
        [UIGroupType.Bubble, { zIndex: 300 }],
        [UIGroupType.Guide, { zIndex: 400 }],
        [UIGroupType.GameMaster, { zIndex: 500 }],
        [UIGroupType.Toast, { zIndex: 600 }],
    ]);

    /** 单例实例 */
    public static get Instance(): UIManager {
        if (!this.mInstance) this.mInstance = new UIManager();
        return this.mInstance;
    }

    /** 注册或覆盖分组配置，可在任意时机调用 */
    public RegisterGroupConfig(group: UIGroupType, config: UIGroupConfig): void {
        this.mGroupConfigMap.set(group, config);
        if (this.mRootReady) {
            this.EnsureGroupRoot(group);
            this.SortGroupRoots();
        }
    }

    /** 打开 UI（同步入口）。弹窗组自动排队，关闭当前弹窗后自动开启下一个 */
    public Open(uiId: string, data?: any, options?: UIOpenOptions): void {
        this.OpenAsync(uiId, data, options).catch(err => {
            console.error(`[UIManager] Open "${uiId}" failed:`, err);
        });
    }

    /** 打开 UI（异步入口）。返回实际打开的 UI；排队弹窗仅入队并返回 null */
    public async OpenAsync(uiId: string, data?: any, options?: UIOpenOptions): Promise<UIBase | null> {
        this.EnsureRoot();
        if (!this.mRootReady) return null;

        const config = UIRegistry.Get(uiId);
        if (!config) {
            console.error(`[UIManager] Open: config not found for "${uiId}"`);
            return null;
        }

        if (this.ShouldQueueOpen(config, options)) {
            this.mPopupQueue.push({ uiId, data, options });
            this.TryOpenNextPopup();
            return null;
        }

        return this.OpenImmediate(uiId, data);
    }

    /** 关闭 UI */
    public Close(uiId: string): void {
        const record = this.mRecordMap.get(uiId);
        if (!record) {
            this.CancelPendingOpen(uiId);
            return;
        }

        this.ClearDestroyTimer(record);

        const stack = this.GetStack(record.config.group);
        const idx = stack.indexOf(uiId);
        if (idx >= 0) stack.splice(idx, 1);

        this.mRecordMap.delete(uiId);
        try {
            record.ui?.__OnClose();
        } catch (e) {
            console.error(`[UIManager] OnClose("${uiId}") error:`, e);
        }
        this.DestroyRecordNode(record);

        if (record.config.group === UIGroupType.FullScreen) {
            this.RecoverUnderFullScreen();
        }

        if (record.config.group === UIGroupType.Popup) {
            if (record.isQueueManaged) {
                this.mHasQueueManagedPopup = false;
            }
            this.TryOpenNextPopup();
            this.RefreshPopupMask();
        }
    }

    /** 关闭指定分组的栈顶部 UI */
    public CloseTop(group: UIGroupType): void {
        const stack = this.GetStack(group);
        if (stack.length) this.Close(stack[stack.length - 1]);
    }

    /**
     * 关闭指定分组内所有已打开的 UI。
     * 若为 Popup 分组，同时清空弹窗队列并取消所有该分组内正在异步加载的 Open 请求。
     * 常用于强制退出弹窗流程或清空某一层级。
     */
    public CloseGroup(group: UIGroupType): void {
        if (group === UIGroupType.Popup) {
            this.mPopupQueue.length = 0;
            this.mHasQueueManagedPopup = false;
        }

        this.mPendingOpens.forEach((_, uiId) => {
            const config = UIRegistry.Get(uiId);
            if (config?.group === group) this.CancelPendingOpen(uiId);
        });

        const stack = this.GetStack(group);
        const ids = stack.slice();
        for (const uiId of ids) this.Close(uiId);
    }

    /**
     * 关闭所有已打开的 UI，并清空弹窗队列。
     * 常用于场景切换、登出、重连等需要重置 UI 状态的时机。
     * - 仅关闭，不销毁缓存的预制体（由 ResMgr GC 决定）
     * - 会触发每个 UI 的 OnClose 回调
     */
    public CloseAll(): void {
        this.mPopupQueue.length = 0;
        this.mPendingOpens.forEach((_, uiId) => this.CancelPendingOpen(uiId));

        const ids = Array.from(this.mRecordMap.keys());
        for (const uiId of ids) this.Close(uiId);

        this.mPendingOpens.forEach((_, uiId) => this.CancelPendingOpen(uiId));
        this.mHasQueueManagedPopup = false;
    }

    /** 预加载 UI 预制体（提前装入 ResMgr 缓存，Open 时无加载延迟） */
    public Preload(uiId: string): void {
        const config = UIRegistry.Get(uiId);
        if (!config) {
            console.error(`[UIManager] Preload: config not found for "${uiId}"`);
            return;
        }
        ResMgr.Preload(config.prefabPath, Prefab);
    }

    /** 判断指定 UI 是否已打开 */
    public HasOpened(uiId: string): boolean {
        return this.mRecordMap.has(uiId);
    }

    /** 获取已打开 UI 的组件引用，未打开返回 null */
    public GetUI<T extends UIBase = UIBase>(uiId: string): T | null {
        return (this.mRecordMap.get(uiId)?.ui as T) ?? null;
    }

    /** 确保根节点已初始化 */
    private EnsureRoot(): void {
        if (this.mRootReady) return;
        this.InitRoot();
    }

    /** 初始化根节点 */
    private InitRoot(): void {
        let root = find(UIManager.mRootPath);
        if (!root) {
            const canvas = find("Canvas");
            if (!canvas) {
                console.error("[UIManager] Canvas not found.");
                return;
            }
            root = new Node("UIGroupRoot");
            root.parent = canvas;
            this.MatchParent(root, canvas);
        }
        this.mGroupConfigMap.forEach((_, group) => this.EnsureGroupRoot(group, root!));
        this.SortGroupRoots();
        this.mRootReady = true;
    }

    /** 确保分组根节点已初始化 */
    private EnsureGroupRoot(group: UIGroupType, root?: Node): Node {
        const existing = this.mGroupRoots.get(group);
        if (existing && isValid(existing)) return existing;

        const parent = root || find(UIManager.mRootPath);
        if (!parent) throw new Error("[UIManager] UIGroupRoot not ready.");

        const cfg = this.mGroupConfigMap.get(group);
        if (!cfg) throw new Error(`[UIManager] Group config missing: ${group}`);

        let node = parent.getChildByName(group);
        if (!node) {
            node = new Node(group);
            node.parent = parent;
            this.MatchParent(node, parent);
        }

        this.mGroupRoots.set(group, node);
        this.SortGroupRoots();

        if (group === UIGroupType.Popup) {
            this.EnsurePopupMaskNode(node);
            this.RefreshPopupMask();
        }

        return node;
    }

    private async OpenImmediate(uiId: string, data?: any, queueManaged: boolean = false): Promise<UIBase | null> {
        const config = UIRegistry.Get(uiId);
        if (!config) {
            console.error(`[UIManager] OpenImmediate: config not found for "${uiId}"`);
            return null;
        }

        const existing = this.mRecordMap.get(uiId);
        if (existing) {
            if (queueManaged) existing.isQueueManaged = true;
            existing.lastOpenData = data;
            if (!existing.visible) {
                if (existing.config.group === UIGroupType.FullScreen) {
                    this.HideCurrentFullScreen();
                    const fsStack = this.GetStack(UIGroupType.FullScreen);
                    const fsIdx = fsStack.indexOf(uiId);
                    if (fsIdx >= 0 && fsIdx !== fsStack.length - 1) {
                        fsStack.splice(fsIdx, 1);
                        fsStack.push(uiId);
                    }
                }
                existing.ui?.__OnOpen(data);
                this.ShowRecord(existing, data);
            } else if (existing.ui) {
                this.BringToTop(existing);
                existing.ui.__OnOpen(data);
                existing.ui.__OnShow(data);
                if (existing.config.group === UIGroupType.Popup) {
                    this.PlayPopupOpenTween(existing);
                    this.RefreshPopupMask();
                }
            }

            return existing.ui;
        }

        const openVersion = this.BeginPendingOpen(uiId);
        let prefab: Prefab | null = null;
        try {
            prefab = await this.LoadPrefab(config.prefabPath);
        } finally {
            this.EndPendingOpen(uiId);
        }

        if (this.IsOpenCancelled(uiId, openVersion)) {
            if (prefab) ResMgr.Release(config.prefabPath);
            return null;
        }
        if (!prefab) return null;

        const race = this.mRecordMap.get(uiId);
        if (race) {
            ResMgr.Release(config.prefabPath);
            if (queueManaged) race.isQueueManaged = true;
            race.lastOpenData = data;
            if (!race.visible) {
                race.ui?.__OnOpen(data);
                this.ShowRecord(race, data);
            } else if (race.ui) {
                this.BringToTop(race);
                race.ui.__OnOpen(data);
                race.ui.__OnShow(data);
            }
            return race.ui;
        }

        let node: Node;
        try {
            node = instantiate(prefab);
        } catch (e) {
            ResMgr.Release(config.prefabPath);
            throw e;
        }
        node.active = false;
        const ui = node.getComponent(UIBase);
        if (!ui) {
            console.error(`[UIManager] Open "${uiId}" failed: prefab must have UIBase component.`);
            node.destroy();
            ResMgr.Release(config.prefabPath);
            return null;
        }

        if (config.group === UIGroupType.FullScreen) this.HideCurrentFullScreen();

        const groupRoot = this.EnsureGroupRoot(config.group);
        ui.__Bind(uiId, this);
        node.parent = groupRoot;

        const record: IUIRecord = {
            uiId, config, node, ui,
            visible: true,
            lastOpenData: data,
            destroyTimer: null,
            isQueueManaged: queueManaged,
        };

        this.mRecordMap.set(uiId, record);
        this.GetStack(config.group).push(uiId);
        node.active = true;

        this.BringToTop(record);

        if (isValid(ui)) {
            ui.__OnOpen(data);
            ui.__OnShow(data);
        }

        if (record.config.group === UIGroupType.Popup) {
            this.PlayPopupOpenTween(record);
            this.RefreshPopupMask();
        }

        return ui;
    }

    /** 将 UI 置于栈顶部 */
    private BringToTop(record: IUIRecord): void {
        if (record.node.parent) {
            record.node.setSiblingIndex(record.node.parent.children.length - 1);
        }
    }

    /** 隐藏当前全屏界面 */
    private HideCurrentFullScreen(): void {
        const stack = this.GetStack(UIGroupType.FullScreen);
        if (!stack.length) return;
        const top = this.mRecordMap.get(stack[stack.length - 1]);
        if (top?.visible) this.HideRecord(top);
    }

    /** 恢复当前全屏界面 */
    private RecoverUnderFullScreen(): void {
        const stack = this.GetStack(UIGroupType.FullScreen);
        if (!stack.length) return;

        const under = this.mRecordMap.get(stack[stack.length - 1]);
        if (!under || under.visible) return;

        if (under.config.group !== UIGroupType.FullScreen) return;
        if ((under.config.recoverMode ?? UIRecoverMode.ReShow) === UIRecoverMode.ReCreate) {
            const cachedData = under.lastOpenData;
            this.ClearDestroyTimer(under);
            this.mRecordMap.delete(under.uiId);
            stack.pop();
            try {
                under.ui?.__OnClose();
            } catch (e) {
                console.error(`[UIManager] OnClose("${under.uiId}") error:`, e);
            }
            this.DestroyRecordNode(under);
            this.OpenImmediate(under.uiId, cachedData).catch(err => {
                console.error(`[UIManager] Recover ReCreate "${under.uiId}" failed:`, err);
            });
            return;
        }

        this.ShowRecord(under, under.lastOpenData);
    }

    /** 隐藏 UI 记录 */
    private HideRecord(record: IUIRecord): void {
        if (!record.visible || !isValid(record.node)) return;
        record.visible = false;
        record.node.active = false;
        record.ui?.__OnHide();
        this.StopPopupTween(record.node);

        if (record.config.group === UIGroupType.Popup) {
            this.RefreshPopupMask();
        }

        if (record.config.group !== UIGroupType.FullScreen) return;
        if ((record.config.recoverMode ?? UIRecoverMode.ReShow) !== UIRecoverMode.ReCreate) return;

        this.ClearDestroyTimer(record);

        const delay = record.config.destroyDelaySeconds ?? 0;
        if (delay <= 0) {
            this.TryDestroyIfStillHidden(record.uiId);
            return;
        }

        record.destroyTimer = TimerMgr.Once(() => this.TryDestroyIfStillHidden(record.uiId), delay, this);
    }

    /** 显示 UI 记录 */
    private ShowRecord(record: IUIRecord, data?: any): void {
        if (!isValid(record.node)) return;
        this.ClearDestroyTimer(record);
        record.visible = true;
        record.node.active = true;
        this.BringToTop(record);
        record.ui?.__OnShow(data);

        if (record.config.group === UIGroupType.Popup) {
            this.PlayPopupOpenTween(record);
            this.RefreshPopupMask();
        }
    }

    /** 尝试销毁仍隐藏的 UI */
    private TryDestroyIfStillHidden(uiId: string): void {
        const record = this.mRecordMap.get(uiId);
        if (!record || record.visible) return;

        const stack = this.GetStack(record.config.group);
        const idx = stack.indexOf(uiId);
        if (idx >= 0) stack.splice(idx, 1);

        this.mRecordMap.delete(uiId);
        try {
            record.ui?.__OnClose();
        } catch (e) {
            console.error(`[UIManager] OnClose("${uiId}") error:`, e);
        }
        this.DestroyRecordNode(record);

        if (record.config.group === UIGroupType.Popup) {
            this.RefreshPopupMask();
        }
    }

    /** 销毁 UI 节点并释放其打开时持有的预制体引用 */
    private DestroyRecordNode(record: IUIRecord): void {
        this.StopPopupTween(record.node);
        if (isValid(record.node)) record.node.destroy();
        ResMgr.Release(record.config.prefabPath);
    }

    /** 清除销毁定时器 */
    private ClearDestroyTimer(record: IUIRecord): void {
        if (!record.destroyTimer) return;
        record.destroyTimer.Cancel();
        record.destroyTimer = null;
    }

    /** 判断是否应该排队打开 UI */
    private ShouldQueueOpen(config: UIConfig, options?: UIOpenOptions): boolean {
        if (options?.bypassQueue) return false;
        if (config.group !== UIGroupType.Popup) return false;
        if (config.queueable === false) return false;
        if (!this.mGroupConfigMap.get(UIGroupType.Popup)?.useQueue) return false;
        return true;
    }

    /** 标记一次异步 Open 开始，并返回本次请求版本 */
    private BeginPendingOpen(uiId: string): number {
        const version = (this.mOpenVersions.get(uiId) ?? 0) + 1;
        this.mOpenVersions.set(uiId, version);
        this.mPendingOpens.set(uiId, (this.mPendingOpens.get(uiId) ?? 0) + 1);
        return version;
    }

    /** 标记一次异步 Open 结束 */
    private EndPendingOpen(uiId: string): void {
        const count = (this.mPendingOpens.get(uiId) ?? 0) - 1;
        if (count > 0) {
            this.mPendingOpens.set(uiId, count);
        } else {
            this.mPendingOpens.delete(uiId);
        }
    }

    /** 判断指定版本的 Open 是否已被取消 */
    private IsOpenCancelled(uiId: string, openVersion: number): boolean {
        return (this.mCancelledOpenVersions.get(uiId) ?? 0) >= openVersion;
    }

    /**
     * 取消"异步加载中"的 Open 请求（由 Close 在 uiId 尚未建立 record 时触发）。
     * 同时清空 popup 队列中同 uiId 的排队，防止取消后被连环打开。
     */
    private CancelPendingOpen(uiId: string): void {
        this.mCancelledOpenVersions.set(uiId, this.mOpenVersions.get(uiId) ?? 0);
        for (let i = this.mPopupQueue.length - 1; i >= 0; i--) {
            if (this.mPopupQueue[i].uiId === uiId) {
                this.mPopupQueue.splice(i, 1);
            }
        }
    }

    /** 尝试打开下一个弹窗 */
    private TryOpenNextPopup(): void {
        if (this.mHasQueueManagedPopup || !this.mPopupQueue.length) return;

        const popupStack = this.GetStack(UIGroupType.Popup);
        const hasVisiblePopup = popupStack.some(id => this.mRecordMap.get(id)?.visible);
        if (hasVisiblePopup) return;
        const req = this.mPopupQueue.shift()!;
        this.mHasQueueManagedPopup = true;
        this.OpenImmediate(req.uiId, req.data, true)
            .then((ui) => {
                if (!ui && !this.mRecordMap.has(req.uiId)) {
                    this.mHasQueueManagedPopup = false;
                    this.TryOpenNextPopup();
                }
            })
            .catch((err) => {
                console.error(`[UIManager] TryOpenNextPopup error for "${req.uiId}":`, err);
                this.mHasQueueManagedPopup = false;
                this.TryOpenNextPopup();
            });
    }

    /** 获取指定分组的栈 */
    private GetStack(group: UIGroupType): string[] {
        let stack = this.mGroupStacks.get(group);
        if (!stack) { stack = []; this.mGroupStacks.set(group, stack); }
        return stack;
    }

    /** 加载预制体（通过 ResMgr，自动并发去重与缓存） */
    private LoadPrefab(path: string): Promise<Prefab | null> {
        return ResMgr.Load<Prefab>(path, Prefab);
    }

    /** 确保通用弹窗遮罩节点存在 */
    private EnsurePopupMaskNode(popupRoot?: Node): Node {
        const root = popupRoot || this.EnsureGroupRoot(UIGroupType.Popup);
        if (this.mPopupMaskNode && isValid(this.mPopupMaskNode)) {
            if (this.mPopupMaskNode.parent !== root) this.mPopupMaskNode.parent = root;
            return this.mPopupMaskNode;
        }

        let mask = root.getChildByName(UIManager.mPopupMaskNodeName);
        if (!mask) {
            mask = new Node(UIManager.mPopupMaskNodeName);
            mask.parent = root;
            this.MatchParent(mask, root);
            mask.addComponent(BlockInputEvents);
            mask.addComponent(Graphics);
        }
        mask.active = false;
        this.mPopupMaskNode = mask;
        return mask;
    }

    /** 刷新通用弹窗遮罩可见性、透明度和层级 */
    private RefreshPopupMask(): void {
        const popupRoot = this.EnsureGroupRoot(UIGroupType.Popup);
        const maskNode = this.EnsurePopupMaskNode(popupRoot);
        const popupStack = this.GetStack(UIGroupType.Popup);

        let topPopup: IUIRecord | null = null;
        for (let i = popupStack.length - 1; i >= 0; i--) {
            const record = this.mRecordMap.get(popupStack[i]);
            if (!record || !record.visible) continue;
            topPopup = record;
            break;
        }

        if (!topPopup || !isValid(topPopup.node)) {
            maskNode.active = false;
            return;
        }

        if (!this.GetPopupMaskEnabled(topPopup.config)) {
            maskNode.active = false;
            return;
        }

        maskNode.active = true;
        maskNode.parent = popupRoot;
        this.MatchParent(maskNode, popupRoot);

        const popupIndex = topPopup.node.getSiblingIndex();
        maskNode.setSiblingIndex(Math.max(0, popupIndex - 1));

        this.RedrawPopupMask(maskNode);
    }

    /** 绘制黑色遮罩 */
    private RedrawPopupMask(maskNode: Node): void {
        const size = this.GetUITransform(maskNode).contentSize;
        if (size.width === this.mLastMaskContentSize.w && size.height === this.mLastMaskContentSize.h) return;
        this.mLastMaskContentSize.w = size.width;
        this.mLastMaskContentSize.h = size.height;
        const graphics = maskNode.getComponent(Graphics) || maskNode.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = UIManager.mMaskFillColor;
        graphics.rect(-size.width * 0.5, -size.height * 0.5, size.width, size.height);
        graphics.fill();
    }

    /** 获取 Popup 是否启用遮罩 */
    private GetPopupMaskEnabled(config: UIConfig): boolean {
        if (config.group !== UIGroupType.Popup) return false;
        return config.popupUseMask !== false;
    }

    /** 播放 Popup 入场动画 */
    private PlayPopupOpenTween(record: IUIRecord): void {
        if (!isValid(record.node) || !record.visible || !record.node.active) return;

        const targetScale = record.node.scale.clone();
        const enterScaleFrom = UIManager.mPopupEnterScaleFrom;
        const enterDuration = UIManager.mPopupEnterDuration;
        const opacity = this.GetOpacity(record.node);

        this.StopPopupTween(record.node);
        opacity.opacity = 0;
        record.node.setScale(
            targetScale.x * enterScaleFrom,
            targetScale.y * enterScaleFrom,
            targetScale.z,
        );

        tween(record.node)
            .to(enterDuration, { scale: targetScale }, { easing: "backOut" })
            .start();
        tween(opacity)
            .to(enterDuration, { opacity: 255 })
            .start();
    }

    /** 停止 Popup 入场动画 */
    private StopPopupTween(node: Node): void {
        Tween.stopAllByTarget(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
    }

    /** 匹配父节点大小 */
    private MatchParent(node: Node, parent: Node): void {
        const transform = this.GetUITransform(node);
        const parentTransform = parent.getComponent(UITransform);
        if (parentTransform) {
            transform.setContentSize(parentTransform.contentSize);
        }
        transform.setAnchorPoint(0.5, 0.5);
        node.setPosition(0, 0, 0);
    }

    /** 获取 UITransform */
    private GetUITransform(node: Node): UITransform {
        return node.getComponent(UITransform) || node.addComponent(UITransform);
    }

    /** 获取 UIOpacity */
    private GetOpacity(node: Node): UIOpacity {
        return node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
    }

    /** 排序分组根节点 */
    private SortGroupRoots(): void {
        const sorted = Array.from(this.mGroupRoots.entries())
            .sort((a, b) => (this.mGroupConfigMap.get(a[0])?.zIndex ?? 0) - (this.mGroupConfigMap.get(b[0])?.zIndex ?? 0));
        sorted.forEach(([, node], index) => {
            if (isValid(node)) node.setSiblingIndex(index);
        });
    }
}
