/**
 * 跨进程共享的 LRU 缓存（第 1 批公共接口归位：src/shared/utils/lru-cache.ts）。
 *
 * 背景：项目内原有 4 份「Map 实现的手写 LRU」，逻辑同构（命中 delete+set 提升、
 * 写入前判断 size >= 上限并淘汰 keys().next() 最旧条目），仅容量上限不同：
 * - `src/main/renders/plantuml-local.ts:71,88,176-200`（PlantUML SVG 缓存，上限 50）；
 * - `src/renderer/src/components/Markdown/hemy-editor-render.ts:70-71,118-144`
 *   （mermaid SVG 缓存，上限 50）；
 * - `hemy-editor-render.ts:237,267-289`（PlantUML HTML 缓存，上限 50）；
 * - `src/renderer/src/components/Markdown/preview-local-render.ts:50-77`
 *   （KaTeX 渲染结果缓存，上限 200）。
 *
 * 与原实现的差异（以本类为准，原因如下）：
 * 1. 原实现用 `if (!cached)` 判断命中，值为空字符串时会被误判为未命中；本类用
 *    `Map.get() !== undefined` 判断（空字符串缓存可命中）。原四处缓存值均为非空 HTML/SVG，
 *    实际行为无差异；
 * 2. 原实现对「已存在键再次 set」不会提升 LRU 顺序（Map 原地覆盖保持旧插入位置）；
 *    本类先 delete 再 set，保持标准 LRU 语义。原四处调用均为「get 未命中 → 计算 → set」，
 *    不会走到该分支，实际行为无差异；
 * 3. 容量在构造时校验为正整数（原实现为模块常量，天然合法）。
 */

/**
 * 基于 `Map` 插入顺序实现的 LRU 缓存。
 *
 * `Map` 的迭代顺序为插入顺序：最近使用（get 命中或新 set）的键总在末尾，
 * `keys().next()` 即最久未使用键，超限时淘汰它。
 *
 * @typeParam V 缓存值类型
 */
export class LRUCache<V> {
    /** 容量上限（正整数，构造后不变） */
    private readonly maxEntries: number

    /** 底层存储：迭代顺序即 LRU 顺序（末尾最新） */
    private readonly store = new Map<string, V>()

    /**
     * @param max 容量上限（正整数；非正数/非整数抛 RangeError）
     */
    constructor(max: number) {
        if (!Number.isInteger(max) || max <= 0) {
            throw new RangeError('LRUCache 容量必须为正整数')
        }
        this.maxEntries = max
    }

    /** 当前缓存条目数 */
    get size(): number {
        return this.store.size
    }

    /**
     * 读取缓存。命中时把条目移到 `Map` 末尾（标记为最近使用）并返回值；
     * 未命中返回 `undefined`。
     *
     * 对齐四处原实现的 `getCached*`：`get` → `delete` → `set` 的组合。
     *
     * @param key 缓存键
     * @returns 命中值；未命中为 `undefined`（不支持把 `undefined` 作为缓存值）
     */
    get(key: string): V | undefined {
        const cached = this.store.get(key)
        if (cached === undefined) {
            return undefined
        }
        this.store.delete(key)
        this.store.set(key, cached)
        return cached
    }

    /**
     * 写入缓存。已存在键先删除再写入（更新值并提升为最近使用）；容量已满时
     * 先淘汰 `keys().next()` 最旧条目再写入，保证写入后 `size <= max`。
     *
     * 对齐四处原实现的 `setCached*`：`if (size >= MAX) { delete(keys().next()) }` → `set`。
     *
     * @param key 缓存键
     * @param value 缓存值
     */
    set(key: string, value: V): void {
        if (this.store.has(key)) {
            this.store.delete(key)
        } else if (this.store.size >= this.maxEntries) {
            const oldestKey = this.store.keys().next().value
            if (oldestKey !== undefined) {
                this.store.delete(oldestKey)
            }
        }
        this.store.set(key, value)
    }

    /**
     * 是否包含指定键（不改变 LRU 顺序，与原实现无对应方法但符合 `Map` 直觉）。
     *
     * @param key 缓存键
     */
    has(key: string): boolean {
        return this.store.has(key)
    }

    /** 清空缓存（对齐 plantuml-local.ts 的 clearPlantumlRenderCache 等清理入口） */
    clear(): void {
        this.store.clear()
    }
}
