/*************************************************************************************
 * @File        : PoolMgr.ts
 * @Author      : xingkong6
 * @Date        : 2026-05-06
 * @License     : Copyright (c) 2026 xingkong6. Internal use only, no redistribution or resale.
 * @Description : 节点对象池（按 Key 分组，超限自动销毁，防止内存膨胀）
 *
 * 设计要点：
 *   1. 轻接口：Get / Put 两个核心方法，零侵入业务代码
 *   2. Key 策略：默认用 prefab.name 作为 Key；同名 Prefab 可手动传 key 区分
 *   3. 超限保护：每个 Key 有独立上限（默认 20），超出直接销毁，不无限囤积
 *   4. 无效节点过滤：Get 出栈时跳过已被外部 destroy() 的节点，保证取出的节点有效
 *   5. 安全 Put：未经 Get 创建的节点（无 __poolKey）发出警告后直接销毁，避免静默错误
 *
 * ── 用法速查 ─────────────────────────────────────────────────────────────────────
 *
 *   // 从池中取一个节点（池空时自动 instantiate）
 *   const node = PoolMgr.Get(this.bulletPrefab);
 *   node.parent = this.node;
 *   node.setPosition(x, y);
 *
 *   // 回收节点（自动 active=false、removeFromParent）
 *   PoolMgr.Put(node);
 *
 *   // 为某个 Key 设置自定义上限
 *   PoolMgr.SetMaxSize("Bullet", 50);
 *
 *   // 场景结束时清理全部池（或只清理某个 Key）
 *   PoolMgr.Clear();
 *   PoolMgr.Clear("Bullet");
 *
 *************************************************************************************/

import { instantiate, isValid, Node, Prefab } from "cc";

const POOL_KEY_PROP = "__poolKey";

type PoolNode = Node & Record<string, string | undefined>;

export class PoolMgr {
    /** Key → 空闲节点列表 */
    private static readonly mPools = new Map<string, Node[]>();
    /** Key → 自定义最大容量 */
    private static readonly mMaxSizes = new Map<string, number>();
    /** 默认每个 Key 的最大容量 */
    private static readonly mDefaultMaxSize = 20;

    /**
     * 从池中取一个节点；池为空时自动 instantiate。
     * 取出的节点 active = true，并记录归属 Key 以便 Put 时回收。
     * @param prefab  节点来源 Prefab
     * @param key     池 Key（默认 prefab.name；同名 Prefab 场景请手动指定唯一 Key）
     */
    public static Get(prefab: Prefab, key?: string): Node {
        const poolKey = key ?? prefab.name;
        const pool = this.mPools.get(poolKey);

        let node: Node | null = null;
        while (pool && pool.length > 0) {
            const candidate = pool.pop()!;
            if (isValid(candidate)) {
                node = candidate;
                break;
            }
        }

        if (!node) {
            node = instantiate(prefab);
        }

        (node as PoolNode)[POOL_KEY_PROP] = poolKey;
        node.active = true;
        return node;
    }

    /**
     * 将节点回收到池中。
     * 节点必须由 PoolMgr.Get() 创建（内部持有 __poolKey），否则发出警告并直接销毁。
     * 回收时自动 active = false 并从父节点移除，无需业务手动处理。
     */
    public static Put(node: Node): void {
        if (!isValid(node)) return;

        const poolKey = (node as PoolNode)[POOL_KEY_PROP];
        if (!poolKey) {
            console.warn("[PoolMgr] Put: node has no pool key. Only nodes created by PoolMgr.Get() can be recycled. Destroying instead.");
            node.destroy();
            return;
        }

        const maxSize = this.mMaxSizes.get(poolKey) ?? this.mDefaultMaxSize;
        let pool = this.mPools.get(poolKey);
        if (!pool) {
            pool = [];
            this.mPools.set(poolKey, pool);
        }

        if (pool.length >= maxSize) {
            node.destroy();
            return;
        }

        node.active = false;
        if (node.parent) node.removeFromParent();
        pool.push(node);
    }

    /**
     * 为指定 Key 设置对象池最大容量（默认 20）。
     * 超出容量的回收节点将被直接销毁。
     */
    public static SetMaxSize(key: string, maxSize: number): void {
        this.mMaxSizes.set(key, Math.max(1, maxSize));
    }

    /** 获取当前池中空闲节点数量（调试用） */
    public static GetSize(key: string): number {
        return this.mPools.get(key)?.length ?? 0;
    }

    /**
     * 销毁并清空指定 Key 的对象池；不传 Key 则清空全部。
     * 场景切换或模块卸载时调用，释放内存。
     */
    public static Clear(key?: string): void {
        if (key !== undefined) {
            this.DestroyPool(key);
            this.mPools.delete(key);
        } else {
            this.mPools.forEach((_, k) => this.DestroyPool(k));
            this.mPools.clear();
        }
    }

    /** 销毁池子 */
    private static DestroyPool(key: string): void {
        const pool = this.mPools.get(key);
        if (!pool) return;
        pool.forEach(n => { if (isValid(n)) n.destroy(); });
        pool.length = 0;
    }
}
