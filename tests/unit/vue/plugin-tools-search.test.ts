// @vitest-environment jsdom
/**
 * 1.5.6 批次 B：插件工具可发现性（REQ-04 面板搜索框 / REQ-05 最近使用 + 收藏）
 * 1.5.6 续：插件菜单「插件搜索」入口视图（1.5.6 新增，用户需求 2026-11-28）
 *
 * 覆盖两层：
 * 1. **纯逻辑**（`components/PluginTools/plugin-tools-search.ts`，可注入翻译与存储）：
 *    - 检索元数据由 manifest 派生：38 项全覆盖、中英名称/分类均可解析、关键词表无缺失；
 *    - 搜索匹配：中文名 / 英文关键词 / 分类名 / 短 id 均可命中；多 token AND；空查询返回空；
 *    - 最近使用：去重置顶、上限 20、非法 id 忽略；收藏：切换、上限 10 拒绝、增删结果；
 *    - localStorage 读取容错（JSON 损坏 / 非数组 / 非法元素 / 已下线工具 id / 上限截断）
 *      与写入失败降级（不抛错）。
 * 2. **组件接线**（`PluginTools.vue`，用真实 manifest action id 的桩组件替换 38 个懒加载工具）：
 *    - 默认视图分区顺序「收藏 → 最近使用 → 全部工具」；
 *    - 搜索框筛选 + 键盘 ↑/↓/Enter/Esc + 无结果空态 + 打开后清空搜索；
 *    - 收藏星标（工具行 / 工具条当前工具）不触发打开、写 localStorage、取消收藏；
 *    - 最近使用记录去重置顶、跨挂载保持；最小化态搜索框不渲染且搜索态清空；
 *    - 插件搜索入口视图（PLUGIN_SEARCH_SHOW）：内容区大搜索框自动聚焦、空白查询显示
 *      最近使用 ≤20 + 全部工具、无最近记录空态、输入过滤、Enter/点击跳转打开工具。
 *
 * 说明：单测只断言 DOM 状态与持久化结果；真实 Electron 下的搜索→打开→收藏 链路由
 * `e2e/plugin-tools-search.spec.ts` 覆盖（若本批未跑 E2E，会在交付报告中说明原因）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 桩组件挂载次数：用于断言「搜索/列表视图切换不会卸载当前工具实例」。
 * 通过 vi.hoisted 提前声明，保证 mock 工厂执行时可见。
 */
const STUB_MOUNT_STATE = vi.hoisted(() => ({ mounts: 0 }))

/**
 * 桩注册表：用 shared manifest 的真实 38 项 action id 替换 defineAsyncComponent，
 * 既避免 jsdom 加载真实工具 chunk，又让「搜索结果 = 可打开工具」链路走真实 id。
 * 顺序即注册表/菜单顺序（= manifest 展开顺序），最近使用上限 20 与键盘导航断言依赖该顺序。
 */
vi.mock('@renderer/components/PluginTools/plugin-tools-const', async () => {
    const { PLUGIN_TOOL_ACTION_IDS } =
        await import('../../../src/shared/constants/plugin-tools-manifest')
    // 测试桩组件：按 props 契约最小 mock，非产品组件
    const ToolStub = defineComponent({
        name: 'PluginToolStub',
        props: { workAreaWidth: { type: String, default: '' } },
        setup(props) {
            STUB_MOUNT_STATE.mounts += 1
            return () =>
                h('div', {
                    class: 'tool-stub',
                    'data-width': props.workAreaWidth
                })
        }
    })
    return {
        pluginTools: PLUGIN_TOOL_ACTION_IDS.map((id) => ({ id, component: ToolStub }))
    }
})

import PluginTools from '@renderer/components/PluginTools/PluginTools.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { setLocale } from '@renderer/common/i18n'
import { translate } from '../../../src/shared/i18n'
import {
    PLUGIN_TOOL_ACTION_IDS,
    PLUGIN_TOOL_ITEMS
} from '../../../src/shared/constants/plugin-tools-manifest'
import { PLUGIN_TOOL_ITEM_ICON_PATHS } from '@renderer/components/PluginTools/plugin-tools-icons'
import {
    PLUGIN_TOOL_SEARCH_SOURCES,
    PLUGIN_TOOL_SECTION_IDS,
    PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY,
    PLUGIN_TOOLS_FAVORITES_LIMIT,
    PLUGIN_TOOLS_FAVORITES_STORAGE_KEY,
    PLUGIN_TOOLS_RECENT_LIMIT,
    PLUGIN_TOOLS_RECENT_STORAGE_KEY,
    createPluginToolSearchEntry,
    getPluginToolIconPaths,
    getPluginToolSectionLabelKey,
    groupPluginToolEntriesBySection,
    normalizePluginToolSearchQuery,
    readPluginToolIds,
    recordRecentPluginToolId,
    resolvePluginToolSearchEntries,
    searchPluginTools,
    toggleCollapsedPluginToolGroup,
    toggleFavoritePluginToolId,
    writePluginToolIds,
    type PluginToolSearchEntry,
    type PluginToolsStorageLike
} from '@renderer/components/PluginTools/plugin-tools-search'

/** 桩注册表（38 项，顺序 = manifest 展开顺序；与 mock 工厂里注入的注册表一致） */
const STUB_ACTION_IDS = [...PLUGIN_TOOL_ACTION_IDS]

/** 仓库根目录（静态契约断言读取 PluginTools.vue 源码用） */
const REPO_ROOT = path.resolve(__dirname, '../../..')

const HASH_ID = 'baize:menu:plugins:encrypt:hash-text'
const TOKEN_ID = 'baize:menu:plugins:encrypt:token-generator'
const BASE64_ID = 'baize:menu:plugins:codec:base64-codec'
const IPV4_ID = 'baize:menu:plugins:net:ipv4-subnet-calculator'
const ASCII_ID = 'baize:menu:plugins:info:ascii-table'
const CALCULATOR_ID = 'baize:menu:plugins:misc:calculator'

/** 中文/英文检索条目（真实 manifest 元数据 + 测试 setupFiles 预载的双语词典） */
function resolveEntries(locale: 'zh-CN' | 'en-US'): PluginToolSearchEntry[] {
    return resolvePluginToolSearchEntries(
        PLUGIN_TOOL_SEARCH_SOURCES.map((source) => source.actionId),
        (key) => translate(key, locale)
    )
}

/** 内存 localStorage 替身（与 PluginToolsStorageLike 结构兼容） */
function createMemoryStorage(initial: Record<string, string> = {}) {
    const map = new Map<string, string>(Object.entries(initial))
    return {
        getItem(key: string): string | null {
            return map.has(key) ? (map.get(key) as string) : null
        },
        setItem(key: string, value: string): void {
            map.set(key, value)
        },
        removeItem(key: string): void {
            map.delete(key)
        }
    }
}

/** 读取 jsdom localStorage 里的 JSON 数组（断言持久化结果） */
function readStoredArray(key: string): string[] {
    const raw = window.localStorage.getItem(key)
    return raw === null ? [] : (JSON.parse(raw) as string[])
}

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

function mountPluginTools(pluginsAreaWidth = '820px'): VueWrapper {
    return track(
        mount(PluginTools, {
            props: { pluginsAreaWidth },
            attachTo: document.body
        }) as VueWrapper
    )
}

/** 当前渲染的分区顺序（需求契约：收藏 → 最近使用 → 全部工具） */
function renderedSectionKeys(wrapper: VueWrapper): Array<string | undefined> {
    return wrapper
        .findAll('[data-plugin-tool-section]')
        .map((section) => section.attributes('data-plugin-tool-section'))
}

/** 某分区内的工具 action id 顺序 */
function sectionToolIds(wrapper: VueWrapper, key: string): Array<string | undefined> {
    return wrapper
        .findAll(`[data-plugin-tool-section="${key}"] [data-tool-action-id]`)
        .map((item) => item.attributes('data-tool-action-id'))
}

/** 打开工具（走默认视图/搜索结果行按钮，与真实点击一致） */
async function clickToolRow(wrapper: VueWrapper, actionId: string): Promise<void> {
    const row = wrapper.find(`[data-tool-action-id="${actionId}"] .plugin-tool-item-main`)
    expect(row.exists(), `工具行应存在：${actionId}`).toBe(true)
    await row.trigger('click')
    await nextTick()
}

/** 通过菜单事件打开工具（真实链路：menu-actions → EventBus(PLUGIN_TOOL_SHOW)） */
async function showToolByMenu(actionId: string): Promise<void> {
    EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, actionId)
    await nextTick()
}

/** 通过菜单事件打开「插件搜索」入口视图（真实链路：menu-actions → EventBus(PLUGIN_SEARCH_SHOW)） */
async function showSearchEntryByMenu(): Promise<void> {
    EventBus.$emit(EVENT_BUS.PLUGIN_SEARCH_SHOW)
    await flushPromises()
    await nextTick()
}

beforeEach(() => {
    window.localStorage.clear()
    STUB_MOUNT_STATE.mounts = 0
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    document.body.innerHTML = ''
    window.localStorage.clear()
    setLocale('zh-CN')
})

// ==================== 纯逻辑：检索元数据与搜索匹配 ====================

describe('REQ-04 工具检索元数据（manifest 单一真源派生）', () => {
    it('38 项工具全覆盖、actionId 唯一、名称/分类 i18n key 中英均可解析', () => {
        expect(PLUGIN_TOOL_SEARCH_SOURCES).toHaveLength(38)
        const actionIds = PLUGIN_TOOL_SEARCH_SOURCES.map((source) => source.actionId)
        expect(new Set(actionIds).size).toBe(actionIds.length)
        expect(actionIds).toContain('baize:menu:plugins:encrypt:hash-text')

        for (const source of PLUGIN_TOOL_SEARCH_SOURCES) {
            expect(source.nameKey).toMatch(/^menu\.plugins\./)
            // 每个工具都有分类路径（8 分区至少 1 级），且每级都有 i18n 键
            expect(source.categoryLabelKeys.length).toBeGreaterThanOrEqual(1)
            for (const categoryKey of source.categoryLabelKeys) {
                expect(categoryKey).toMatch(/^menu\.plugins\.group\./)
            }
            for (const locale of ['zh-CN', 'en-US'] as const) {
                const resolved = translate(source.nameKey, locale)
                expect(resolved, `${locale} 缺少 ${source.nameKey}`).not.toBe(source.nameKey)
                for (const categoryKey of source.categoryLabelKeys) {
                    expect(
                        translate(categoryKey, locale),
                        `${locale} 缺少 ${categoryKey}`
                    ).not.toBe(categoryKey)
                }
            }
        }
    })

    it('38 项工具都配置了额外关键词（避免新增工具漏配导致只能按名称搜）', () => {
        for (const source of PLUGIN_TOOL_SEARCH_SOURCES) {
            expect(source.keywords.length, `${source.toolId} 缺少关键词`).toBeGreaterThan(0)
            for (const keyword of source.keywords) {
                expect(keyword.trim().length).toBeGreaterThan(0)
            }
        }
    })

    it('条目解析：中文名/分类与英文名/分类随语言切换', () => {
        const zhEntries = resolveEntries('zh-CN')
        const enEntries = resolveEntries('en-US')
        const zhHash = zhEntries.find(
            (entry) => entry.actionId === 'baize:menu:plugins:encrypt:hash-text'
        )
        const enHash = enEntries.find(
            (entry) => entry.actionId === 'baize:menu:plugins:encrypt:hash-text'
        )
        expect(zhHash?.name).toBe('哈希文本')
        expect(zhHash?.category).toBe('加解密插件')
        expect(enHash?.name).toBe('Hash Text')
        expect(enHash?.category).toBe('Encryption Plugins')
        // 检索串统一小写并包含短 id，保证英文/中文关键词均能命中
        expect(zhHash?.haystack).toContain('hash-text')
        expect(zhHash?.haystack).toContain('哈希')
    })
})

describe('REQ-04 搜索匹配（中英/分类/关键词/多 token）', () => {
    const zhEntries = resolveEntries('zh-CN')
    const enEntries = resolveEntries('en-US')

    function searchActionIds(entries: PluginToolSearchEntry[], query: string): string[] {
        return searchPluginTools(entries, query).map((entry) => entry.actionId)
    }

    it('空查询/纯空白查询返回空数组（由组件用「是否搜索中」区分默认视图）', () => {
        expect(searchPluginTools(zhEntries, '')).toEqual([])
        expect(searchPluginTools(zhEntries, '   ')).toEqual([])
        expect(normalizePluginToolSearchQuery('　哈希　')).toBe('哈希')
    })

    it('中文名称可定位：输入「哈希」命中哈希工具', () => {
        expect(searchActionIds(zhEntries, '哈希')).toContain('baize:menu:plugins:encrypt:hash-text')
    })

    it('英文名称/关键词可定位（中英关键词均可）', () => {
        expect(searchActionIds(enEntries, 'hash')).toContain('baize:menu:plugins:encrypt:hash-text')
        // 中文关键词表在 en-US 界面同样生效：输入「哈希」也能定位
        expect(searchActionIds(enEntries, '哈希')).toContain('baize:menu:plugins:encrypt:hash-text')
        // 工具 id 片段同样参与检索
        expect(searchActionIds(zhEntries, 'encrypt:hash')).toContain(
            'baize:menu:plugins:encrypt:hash-text'
        )
        // 算法别名关键词
        expect(searchActionIds(zhEntries, 'sha256')).toContain(
            'baize:menu:plugins:encrypt:hash-text'
        )
        expect(searchActionIds(zhEntries, 'base64')).toContain(
            'baize:menu:plugins:codec:base64-codec'
        )
    })

    it('分类名可定位：中文「加解密」命中 8 项加解密工具，中文「网络」命中网络工具', () => {
        const encryptMatches = searchPluginTools(zhEntries, '加解密')
        expect(encryptMatches).toHaveLength(8)
        expect(encryptMatches.every((entry) => entry.sectionId === 'encrypt')).toBe(true)
        expect(searchActionIds(zhEntries, '网络')).toContain(
            'baize:menu:plugins:net:ipv4-subnet-calculator'
        )
        expect(searchActionIds(enEntries, 'Encryption')).toContain(
            'baize:menu:plugins:encrypt:hash-text'
        )
    })

    it('多 token 为 AND 语义：两个 token 都要命中', () => {
        expect(searchActionIds(zhEntries, '网络 子网')).toContain(
            'baize:menu:plugins:net:ipv4-subnet-calculator'
        )
        expect(searchActionIds(zhEntries, '网络 base64')).toEqual([])
    })

    it('无匹配返回空数组（组件渲染空态）', () => {
        expect(searchPluginTools(zhEntries, '不存在的工具 zzz')).toEqual([])
    })
})

// ==================== 纯逻辑：最近使用 / 收藏 / 存储容错 ====================

describe('REQ-05 最近使用记录（去重置顶 / 上限 20）', () => {
    it('新打开置顶、重复打开去重置顶、最多保留 20 个（最旧淘汰）', () => {
        let ids: string[] = []
        const opened = Array.from(
            { length: PLUGIN_TOOLS_RECENT_LIMIT + 1 },
            (_, index) => `tool-${index}`
        )
        for (const id of opened) {
            ids = recordRecentPluginToolId(ids, id)
        }
        expect(ids).toHaveLength(PLUGIN_TOOLS_RECENT_LIMIT)
        expect(ids[0]).toBe(`tool-${PLUGIN_TOOLS_RECENT_LIMIT}`)
        expect(ids).not.toContain('tool-0')

        // 重复打开已存在项：去重置顶，长度不变、不产生重复
        const reopened = recordRecentPluginToolId(ids, 'tool-5')
        expect(reopened).toHaveLength(PLUGIN_TOOLS_RECENT_LIMIT)
        expect(reopened[0]).toBe('tool-5')
        expect(reopened.filter((id) => id === 'tool-5')).toHaveLength(1)
        // 非法 id 不改变列表
        expect(recordRecentPluginToolId(ids, '')).toEqual(ids)
        // 不修改入参
        expect(ids[0]).toBe(`tool-${PLUGIN_TOOLS_RECENT_LIMIT}`)
    })

    it('最近使用上限 20 / 收藏上限 10 常量口径（1.5.6 需求）', () => {
        expect(PLUGIN_TOOLS_RECENT_LIMIT).toBe(20)
        expect(PLUGIN_TOOLS_FAVORITES_LIMIT).toBe(10)
    })
})

describe('REQ-05 收藏（切换 / 上限 10 拒绝）', () => {
    it('收藏去重置顶、再次点击取消、上限 10 时拒绝新增', () => {
        let ids: readonly string[] = []
        ids = toggleFavoritePluginToolId(ids, 'a').ids
        ids = toggleFavoritePluginToolId(ids, 'b').ids
        expect(ids).toEqual(['b', 'a'])

        // 再次点击取消（不新增）
        const removed = toggleFavoritePluginToolId(ids, 'b')
        expect(removed.added).toBe(false)
        expect(removed.rejected).toBe(false)
        expect(removed.ids).toEqual(['a'])

        // 填满上限后拒绝第 11 个
        ids = []
        for (let index = 0; index < PLUGIN_TOOLS_FAVORITES_LIMIT; index += 1) {
            ids = toggleFavoritePluginToolId(ids, `tool-${index}`).ids
        }
        expect(ids).toHaveLength(PLUGIN_TOOLS_FAVORITES_LIMIT)
        const rejected = toggleFavoritePluginToolId(ids, 'overflow')
        expect(rejected.rejected).toBe(true)
        expect(rejected.added).toBe(false)
        expect(rejected.ids).toEqual(ids)
    })
})

describe('REQ-05 本机存储容错（JSON 损坏/非法值回退空，不新增 IPC）', () => {
    it('读取：缺失/损坏/非数组/非法元素/已下线 id/超上限 均正确回落', () => {
        const key = 'test:key'
        expect(readPluginToolIds(null, key)).toEqual([])

        const storage = createMemoryStorage()
        expect(readPluginToolIds(storage, key)).toEqual([])

        storage.setItem(key, '{not-json')
        expect(readPluginToolIds(storage, key)).toEqual([])

        storage.setItem(key, JSON.stringify({ ids: ['a'] }))
        expect(readPluginToolIds(storage, key)).toEqual([])

        storage.setItem(key, JSON.stringify(['a', 42, '', 'a', 'b']))
        expect(readPluginToolIds(storage, key)).toEqual(['a', 'b'])

        storage.setItem(key, JSON.stringify(['gone', 'keep']))
        expect(readPluginToolIds(storage, key, { validIds: new Set(['keep']), limit: 5 })).toEqual([
            'keep'
        ])

        storage.setItem(key, JSON.stringify(['a', 'b', 'c']))
        expect(readPluginToolIds(storage, key, { limit: 2 })).toEqual(['a', 'b'])
    })

    it('写入：正常往返；存储不可用/抛错时返回 false 而非抛异常', () => {
        const storage = createMemoryStorage()
        expect(writePluginToolIds(storage, 'test:key', ['a', 'b'])).toBe(true)
        expect(readPluginToolIds(storage, 'test:key')).toEqual(['a', 'b'])
        expect(writePluginToolIds(null, 'test:key', ['a'])).toBe(false)

        const brokenStorage: PluginToolsStorageLike = {
            getItem: () => null,
            setItem: () => {
                throw new Error('QuotaExceededError')
            }
        }
        expect(writePluginToolIds(brokenStorage, 'test:key', ['a'])).toBe(false)
    })
})

// ==================== 组件接线：默认视图 / 搜索 / 键盘 / 收藏 / 最小化 ====================

describe('REQ-05 面板默认视图（收藏 → 最近使用 → 全部工具）', () => {
    it('无激活工具时显示默认视图：全部工具 38 行（分区顺序 default 只有全部工具）', async () => {
        const wrapper = mountPluginTools()
        await nextTick()
        expect(wrapper.find('[data-plugin-tool-view="home"]').exists()).toBe(true)
        // 复用既有占位区 class（既有单测契约），但内容已是工具列表
        expect(wrapper.find('.plugin-tool-placeholder').exists()).toBe(true)
        expect(wrapper.find('[data-plugin-tool-section="all"]').exists()).toBe(true)
        expect(sectionToolIds(wrapper, 'all')).toEqual(STUB_ACTION_IDS)
        // 默认视图每行：图标 + 名称 + 分类 + 收藏星标
        const firstRow = wrapper.find(`[data-tool-action-id="${HASH_ID}"]`)
        expect(firstRow.find('.plugin-tool-item-icon').exists()).toBe(true)
        expect(firstRow.find('.plugin-tool-item-name').text()).toBe('哈希文本')
        expect(firstRow.find('.plugin-tool-item-category').text()).toBe('加解密插件')
        expect(firstRow.find('.plugin-tool-item-favorite').exists()).toBe(true)
    })

    it('分区顺序固定：收藏 → 最近使用 → 全部工具', async () => {
        window.localStorage.setItem(PLUGIN_TOOLS_FAVORITES_STORAGE_KEY, JSON.stringify([HASH_ID]))
        window.localStorage.setItem(PLUGIN_TOOLS_RECENT_STORAGE_KEY, JSON.stringify([BASE64_ID]))
        const wrapper = mountPluginTools()
        await nextTick()
        expect(renderedSectionKeys(wrapper)).toEqual(['favorites', 'recent', 'all'])
        expect(sectionToolIds(wrapper, 'favorites')).toEqual([HASH_ID])
        expect(sectionToolIds(wrapper, 'recent')).toEqual([BASE64_ID])
    })
})

describe('REQ-04 搜索框（过滤 / 键盘 / 空态 / 打开后清空）', () => {
    it('输入「哈希」只保留匹配工具并展示分类；清空后回到默认视图', async () => {
        const wrapper = mountPluginTools()
        const input = wrapper.find('.plugin-tools-search-input')
        expect(input.exists()).toBe(true)
        await input.setValue('哈希')
        await nextTick()

        expect(wrapper.find('[data-plugin-tool-view="search"]').exists()).toBe(true)
        expect(sectionToolIds(wrapper, 'search')).toEqual([HASH_ID])
        expect(
            wrapper.find('[data-plugin-tool-section="search"] .plugin-tool-section-title').text()
        ).toBe('找到 1 个工具')
        expect(wrapper.find('[data-plugin-tool-section="all"]').exists()).toBe(false)
        expect(input.attributes('aria-expanded')).toBe('true')

        await input.setValue('')
        await nextTick()
        expect(wrapper.find('[data-plugin-tool-view="search"]').exists()).toBe(false)
        expect(wrapper.find('[data-plugin-tool-view="home"]').exists()).toBe(true)
        expect(input.attributes('aria-expanded')).toBe('false')
    })

    it('无匹配时显示空态（含提示文案），回车不打开任何工具', async () => {
        const wrapper = mountPluginTools()
        const input = wrapper.find('.plugin-tools-search-input')
        await input.setValue('不存在的工具 zzz')
        await nextTick()
        expect(wrapper.find('.plugin-tool-search-empty').exists()).toBe(true)
        expect(wrapper.find('.plugin-tool-search-empty-title').text()).toBe('没有找到匹配的工具')
        expect(wrapper.find('.plugin-tool-search-empty-hint').text()).toContain('试试')

        await input.trigger('keydown', { key: 'Enter' })
        await nextTick()
        expect(wrapper.find('.plugin-tool-content').exists()).toBe(false)
    })

    it('键盘 ↑/↓ 循环移动高亮，Enter 打开高亮项并清空搜索', async () => {
        const wrapper = mountPluginTools()
        const input = wrapper.find('.plugin-tools-search-input')
        // 「plugins」命中所有工具（动作 id 前缀），顺序 = 注册表顺序
        await input.setValue('plugins')
        await nextTick()
        expect(
            wrapper.findAll('[data-plugin-tool-section="search"] [data-tool-action-id]')
        ).toHaveLength(STUB_ACTION_IDS.length)

        const activeId = (): string | undefined =>
            wrapper.find('.plugin-tool-item--active').attributes('data-tool-action-id')
        // 顺序 = 注册表顺序（manifest 展开顺序）：首个为令牌生成器，第二个为哈希文本
        expect(activeId()).toBe(TOKEN_ID)

        await input.trigger('keydown', { key: 'ArrowDown' })
        await nextTick()
        expect(activeId()).toBe(HASH_ID)
        await input.trigger('keydown', { key: 'ArrowUp' })
        await nextTick()
        expect(activeId()).toBe(TOKEN_ID)
        // 上移越界回绕到最后一个
        await input.trigger('keydown', { key: 'ArrowUp' })
        await nextTick()
        expect(activeId()).toBe(STUB_ACTION_IDS[STUB_ACTION_IDS.length - 1])

        await input.trigger('keydown', { key: 'Enter' })
        await nextTick()
        expect(wrapper.find('.plugin-tool-content').attributes('id')).toBe(
            `plugin-tool-${STUB_ACTION_IDS[STUB_ACTION_IDS.length - 1]}`
        )
        // 打开工具后清空搜索并回到工具内容
        expect((wrapper.find('.plugin-tools-search-input').element as HTMLInputElement).value).toBe(
            ''
        )
        expect(wrapper.find('[data-plugin-tool-view="search"]').exists()).toBe(false)
    })

    it('Esc 清空搜索并收起结果（恢复默认视图）', async () => {
        const wrapper = mountPluginTools()
        const input = wrapper.find('.plugin-tools-search-input')
        await input.setValue('哈希')
        await nextTick()
        await input.trigger('keydown', { key: 'Escape' })
        await nextTick()
        expect((input.element as HTMLInputElement).value).toBe('')
        expect(wrapper.find('[data-plugin-tool-view="search"]').exists()).toBe(false)
        expect(wrapper.find('.plugin-tool-search-empty').exists()).toBe(false)
        expect(wrapper.find('[data-plugin-tool-view="home"]').exists()).toBe(true)
    })

    it('搜索不卸载当前工具实例（避免打断工具内部内容），清空搜索后原工具立即恢复', async () => {
        const wrapper = mountPluginTools()
        await clickToolRow(wrapper, HASH_ID)
        expect(wrapper.find('.plugin-tool-content').attributes('id')).toBe(`plugin-tool-${HASH_ID}`)
        expect(STUB_MOUNT_STATE.mounts).toBe(1)

        // 输入搜索：工具内容仅隐藏（v-show），组件实例不销毁
        const input = wrapper.find('.plugin-tools-search-input')
        await input.setValue('base64')
        await nextTick()
        const content = wrapper.find('.plugin-tool-content')
        expect(content.exists()).toBe(true)
        expect(content.isVisible()).toBe(false)
        expect(wrapper.find('[data-plugin-tool-view="search"]').exists()).toBe(true)
        expect(STUB_MOUNT_STATE.mounts).toBe(1)

        // 清空搜索：原工具内容直接恢复（仍是同一个实例，不重新挂载）
        await input.setValue('')
        await nextTick()
        expect(wrapper.find('.plugin-tool-content').isVisible()).toBe(true)
        expect(wrapper.find('.plugin-tool-content').attributes('id')).toBe(`plugin-tool-${HASH_ID}`)
        expect(STUB_MOUNT_STATE.mounts).toBe(1)
    })

    it('搜索命中后点击行打开工具（清空搜索），最近使用同步记录', async () => {
        const wrapper = mountPluginTools()
        const input = wrapper.find('.plugin-tools-search-input')
        await input.setValue('base64')
        await nextTick()
        await clickToolRow(wrapper, BASE64_ID)
        expect(wrapper.find('.plugin-tool-content').attributes('id')).toBe(
            `plugin-tool-${BASE64_ID}`
        )
        expect(readStoredArray(PLUGIN_TOOLS_RECENT_STORAGE_KEY)).toEqual([BASE64_ID])
    })

    it('搜索用英文关键词同样可定位（en-US 界面切换后名称/分类随语言变化）', async () => {
        const wrapper = mountPluginTools()
        setLocale('en-US')
        await nextTick()
        const input = wrapper.find('.plugin-tools-search-input')
        await input.setValue('hash')
        await nextTick()
        expect(sectionToolIds(wrapper, 'search')).toEqual([HASH_ID])
        expect(wrapper.find('.plugin-tool-item-name').text()).toBe('Hash Text')
        expect(
            wrapper.find('[data-plugin-tool-section="search"] .plugin-tool-item-category').text()
        ).toBe('Encryption Plugins')
        // 切回中文后恢复
        setLocale('zh-CN')
        await nextTick()
        expect(wrapper.find('.plugin-tool-item-name').text()).toBe('哈希文本')
    })
})

describe('REQ-05 收藏（工具行 / 工具条星标 / 持久化 / 取消）', () => {
    it('点击工具行星标收藏但不打开工具，收藏分区置顶且写入 localStorage', async () => {
        const wrapper = mountPluginTools()
        await wrapper
            .find(`[data-tool-action-id="${HASH_ID}"] .plugin-tool-item-favorite`)
            .trigger('click')
        await nextTick()

        // 星标点击 stop 传播：仍停留在默认视图，不打开工具
        expect(wrapper.find('.plugin-tool-content').exists()).toBe(false)
        expect(wrapper.find('[data-plugin-tool-view="home"]').exists()).toBe(true)
        expect(readStoredArray(PLUGIN_TOOLS_FAVORITES_STORAGE_KEY)).toEqual([HASH_ID])

        expect(renderedSectionKeys(wrapper)[0]).toBe('favorites')
        expect(sectionToolIds(wrapper, 'favorites')).toEqual([HASH_ID])
        const favoriteStar = wrapper.find(
            `[data-plugin-tool-section="favorites"] [data-tool-action-id="${HASH_ID}"] .plugin-tool-item-favorite`
        )
        expect(favoriteStar.attributes('aria-pressed')).toBe('true')
        expect(favoriteStar.attributes('aria-label')).toBe('取消收藏')

        // 再次点击取消收藏：分区消失、存储清空
        await favoriteStar.trigger('click')
        await nextTick()
        expect(readStoredArray(PLUGIN_TOOLS_FAVORITES_STORAGE_KEY)).toEqual([])
        expect(wrapper.find('[data-plugin-tool-section="favorites"]').exists()).toBe(false)
    })

    it('收藏跨挂载保持（读 localStorage 初始化）', async () => {
        window.localStorage.setItem(PLUGIN_TOOLS_FAVORITES_STORAGE_KEY, JSON.stringify([ASCII_ID]))
        const wrapper = mountPluginTools()
        await nextTick()
        expect(sectionToolIds(wrapper, 'favorites')).toEqual([ASCII_ID])
    })

    it('打开工具后工具条显示当前工具星标：点击收藏/取消收藏并保持工具内容', async () => {
        const wrapper = mountPluginTools()
        await clickToolRow(wrapper, CALCULATOR_ID)
        const starButton = wrapper.find('.plugin-tools-favorite-btn')
        expect(starButton.exists()).toBe(true)
        expect(starButton.attributes('aria-pressed')).toBe('false')
        expect(starButton.attributes('aria-label')).toBe('收藏该工具')

        await starButton.trigger('click')
        await nextTick()
        expect(readStoredArray(PLUGIN_TOOLS_FAVORITES_STORAGE_KEY)).toEqual([CALCULATOR_ID])
        expect(wrapper.find('.plugin-tools-favorite-btn').attributes('aria-pressed')).toBe('true')
        // 工具内容不因收藏动作重建/丢失
        expect(wrapper.find('.plugin-tool-content').attributes('id')).toBe(
            `plugin-tool-${CALCULATOR_ID}`
        )

        await wrapper.find('.plugin-tools-favorite-btn').trigger('click')
        await nextTick()
        expect(readStoredArray(PLUGIN_TOOLS_FAVORITES_STORAGE_KEY)).toEqual([])
    })

    it('切换工具后收藏与最近状态保持（不因打开新工具重置）', async () => {
        const wrapper = mountPluginTools()
        await wrapper
            .find(`[data-tool-action-id="${HASH_ID}"] .plugin-tool-item-favorite`)
            .trigger('click')
        await nextTick()
        await clickToolRow(wrapper, BASE64_ID)
        await showToolByMenu(IPV4_ID)

        expect(wrapper.find('.plugin-tool-content').attributes('id')).toBe(`plugin-tool-${IPV4_ID}`)
        expect(readStoredArray(PLUGIN_TOOLS_FAVORITES_STORAGE_KEY)).toEqual([HASH_ID])
        // 最近使用：后打开的工具置顶
        expect(readStoredArray(PLUGIN_TOOLS_RECENT_STORAGE_KEY)).toEqual([IPV4_ID, BASE64_ID])

        await wrapper.find('.plugin-tools-home-btn').trigger('click')
        await nextTick()
        expect(renderedSectionKeys(wrapper)).toEqual(['favorites', 'recent', 'all'])
        expect(sectionToolIds(wrapper, 'favorites')).toEqual([HASH_ID])
        expect(sectionToolIds(wrapper, 'recent')).toEqual([IPV4_ID, BASE64_ID])
    })
})

describe('REQ-05 最近使用（面板记录 / 去重置顶 / 上限 20 / 跨挂载）', () => {
    it('打开工具即记录最近使用（去重置顶），面板默认视图可见最近分区', async () => {
        const wrapper = mountPluginTools()
        await clickToolRow(wrapper, HASH_ID)
        await showToolByMenu(BASE64_ID)
        await showToolByMenu(HASH_ID)
        expect(readStoredArray(PLUGIN_TOOLS_RECENT_STORAGE_KEY)).toEqual([HASH_ID, BASE64_ID])

        await wrapper.find('.plugin-tools-home-btn').trigger('click')
        await nextTick()
        expect(sectionToolIds(wrapper, 'recent')).toEqual([HASH_ID, BASE64_ID])
        // 最近分区在全部工具之前
        expect(renderedSectionKeys(wrapper)).toEqual(['recent', 'all'])
    })

    it('最近使用上限 20：连续打开全部 38 个工具后只保留最近 20 个（最旧的被淘汰）', async () => {
        const wrapper = mountPluginTools()
        for (const actionId of STUB_ACTION_IDS) {
            await showToolByMenu(actionId)
        }
        const stored = readStoredArray(PLUGIN_TOOLS_RECENT_STORAGE_KEY)
        expect(stored).toHaveLength(PLUGIN_TOOLS_RECENT_LIMIT)
        expect(stored).toEqual([...STUB_ACTION_IDS].reverse().slice(0, PLUGIN_TOOLS_RECENT_LIMIT))
        // 38 - 20 = 18 个最早打开的工具被淘汰
        expect(stored).not.toContain(STUB_ACTION_IDS[0])
        expect(stored).not.toContain(STUB_ACTION_IDS[17])
        expect(stored).toContain(STUB_ACTION_IDS[18])

        await wrapper.find('.plugin-tools-home-btn').trigger('click')
        await nextTick()
        expect(sectionToolIds(wrapper, 'recent')).toEqual(stored)
    })

    it('最近使用跨挂载保持（重新挂载仍从 localStorage 恢复）', async () => {
        window.localStorage.setItem(PLUGIN_TOOLS_RECENT_STORAGE_KEY, JSON.stringify([TOKEN_ID]))
        const wrapper = mountPluginTools()
        await nextTick()
        expect(sectionToolIds(wrapper, 'recent')).toEqual([TOKEN_ID])
    })
})

describe('REQ-04/05 与最小化状态互斥', () => {
    it('最小化后搜索框不渲染，还原后恢复；折叠时清空未提交的搜索', async () => {
        const wrapper = mountPluginTools()
        const searchInput = () => wrapper.find('.plugin-tools-search-input')
        expect(searchInput().exists()).toBe(true)

        await searchInput().setValue('哈希')
        await nextTick()
        expect(wrapper.find('[data-plugin-tool-view="search"]').exists()).toBe(true)

        // 最小化：搜索框 v-if 卸载（不可用/不显示），搜索状态清空
        await wrapper.findAll('.plugin-tools-control-btn')[0].trigger('click')
        await nextTick()
        expect(wrapper.find('#plugin-tools-container').classes()).toContain(
            'plugin-tools-container--minimized'
        )
        expect(searchInput().exists()).toBe(false)

        // 还原：搜索框回来且内容已清空（不残留折叠前的搜索态）
        await wrapper.findAll('.plugin-tools-control-btn')[0].trigger('click')
        await nextTick()
        expect(searchInput().exists()).toBe(true)
        expect((searchInput().element as HTMLInputElement).value).toBe('')
        expect(wrapper.find('[data-plugin-tool-view="home"]').exists()).toBe(true)
    })

    it('最小化时打开菜单工具会先还原面板（搜索框随正常态恢复）', async () => {
        const wrapper = mountPluginTools()
        await wrapper.findAll('.plugin-tools-control-btn')[0].trigger('click')
        await nextTick()
        expect(wrapper.find('.plugin-tools-search-input').exists()).toBe(false)

        await showToolByMenu(ASCII_ID)
        expect(wrapper.find('#plugin-tools-container').classes()).not.toContain(
            'plugin-tools-container--minimized'
        )
        expect(wrapper.find('.plugin-tools-search-input').exists()).toBe(true)
        expect(wrapper.find('.plugin-tool-content').attributes('id')).toBe(
            `plugin-tool-${ASCII_ID}`
        )
    })
})

// ==================== 1.5.6 插件搜索入口视图（菜单「插件 → 插件搜索」） ====================

describe('1.5.6 插件搜索入口视图（搜索界面 / 最近 20 / 跳转）', () => {
    it('菜单事件打开入口视图：内容区大搜索框自动聚焦，空白查询显示最近使用 + 全部工具', async () => {
        window.localStorage.setItem(
            PLUGIN_TOOLS_RECENT_STORAGE_KEY,
            JSON.stringify(STUB_ACTION_IDS.slice(0, 3))
        )
        const wrapper = mountPluginTools()
        await nextTick()
        await showSearchEntryByMenu()

        // 视图状态：入口视图（data 属性供 E2E/单测断言）
        expect(wrapper.find('[data-plugin-tool-view="search-entry"]').exists()).toBe(true)
        // 工作区（内容区）大搜索框存在并自动聚焦
        const entryInput = wrapper.find('.plugin-tools-entry-search-input')
        expect(entryInput.exists()).toBe(true)
        expect((entryInput.element as HTMLInputElement).value).toBe('')
        expect(document.activeElement).toBe(entryInput.element)
        // 入口视图下工具条搜索框隐藏（避免同屏两个搜索框）
        expect(wrapper.find('.plugin-tools-search-input').exists()).toBe(false)

        // 空白查询分区：最近使用（按存储顺序）→ 全部工具，不展示收藏分区
        expect(renderedSectionKeys(wrapper)).toEqual(['recent', 'all'])
        expect(sectionToolIds(wrapper, 'recent')).toEqual(STUB_ACTION_IDS.slice(0, 3))
        expect(sectionToolIds(wrapper, 'all')).toEqual(STUB_ACTION_IDS)
        expect(wrapper.find('.plugin-tool-search-entry-empty').exists()).toBe(false)
    })

    it('入口事件打开插件工作区（WORKSPACE_SHOW plugins）并还原最小化的面板', async () => {
        const wrapper = mountPluginTools()
        await nextTick()
        // 先最小化：入口事件应先把面板还原为 normal
        await wrapper.findAll('.plugin-tools-control-btn')[0].trigger('click')
        await nextTick()
        expect(wrapper.find('#plugin-tools-container').classes()).toContain(
            'plugin-tools-container--minimized'
        )

        const emitSpy = vi.spyOn(EventBus, '$emit')
        await showSearchEntryByMenu()
        // 与既有打开工具链路一致：切到插件工作区容器
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        expect(wrapper.find('#plugin-tools-container').classes()).not.toContain(
            'plugin-tools-container--minimized'
        )
        expect(wrapper.find('[data-plugin-tool-view="search-entry"]').exists()).toBe(true)
    })

    it('无最近记录时显示合理空态，同时仍展示全部工具（任何情况下都能选择）', async () => {
        const wrapper = mountPluginTools()
        await nextTick()
        await showSearchEntryByMenu()

        expect(wrapper.find('[data-plugin-tool-view="search-entry"]').exists()).toBe(true)
        const empty = wrapper.find('.plugin-tool-search-entry-empty')
        expect(empty.exists()).toBe(true)
        expect(empty.text()).toContain('暂无最近使用')
        expect(wrapper.find('[data-plugin-tool-section="recent"]').exists()).toBe(false)
        expect(sectionToolIds(wrapper, 'all')).toEqual(STUB_ACTION_IDS)
    })

    it('入口视图空白查询下最近使用分区最多显示 20 项（上限 20）', async () => {
        const wrapper = mountPluginTools()
        for (const actionId of STUB_ACTION_IDS) {
            await showToolByMenu(actionId)
        }
        await showSearchEntryByMenu()

        const recentIds = sectionToolIds(wrapper, 'recent')
        expect(recentIds).toHaveLength(PLUGIN_TOOLS_RECENT_LIMIT)
        expect(recentIds).toEqual(
            [...STUB_ACTION_IDS].reverse().slice(0, PLUGIN_TOOLS_RECENT_LIMIT)
        )
        expect(sectionToolIds(wrapper, 'all')).toEqual(STUB_ACTION_IDS)
    })

    it('入口视图输入即过滤，Enter 打开高亮工具、记录最近使用并退出入口视图', async () => {
        const wrapper = mountPluginTools()
        await nextTick()
        await showSearchEntryByMenu()
        const entryInput = wrapper.find('.plugin-tools-entry-search-input')
        await entryInput.setValue('哈希')
        await nextTick()

        expect(wrapper.find('[data-plugin-tool-view="search"]').exists()).toBe(true)
        expect(sectionToolIds(wrapper, 'search')).toEqual([HASH_ID])
        // 结果态下大搜索框保持挂载（不因 v-if 切换而丢焦点）
        expect(wrapper.find('.plugin-tools-entry-search-input').exists()).toBe(true)

        await entryInput.trigger('keydown', { key: 'Enter' })
        await nextTick()
        expect(wrapper.find('.plugin-tool-content').attributes('id')).toBe(`plugin-tool-${HASH_ID}`)
        expect(readStoredArray(PLUGIN_TOOLS_RECENT_STORAGE_KEY)).toEqual([HASH_ID])
        // 打开工具后退出入口视图，工具条搜索框恢复
        expect(wrapper.find('[data-plugin-tool-view="search-entry"]').exists()).toBe(false)
        expect(wrapper.find('.plugin-tools-search-input').exists()).toBe(true)
    })

    it('入口视图点击结果行打开工具（与搜索列表同一跳转链路）', async () => {
        const wrapper = mountPluginTools()
        await showSearchEntryByMenu()
        await wrapper.find('.plugin-tools-entry-search-input').setValue('base64')
        await nextTick()

        await clickToolRow(wrapper, BASE64_ID)
        expect(wrapper.find('.plugin-tool-content').attributes('id')).toBe(
            `plugin-tool-${BASE64_ID}`
        )
        expect(readStoredArray(PLUGIN_TOOLS_RECENT_STORAGE_KEY)).toEqual([BASE64_ID])
        expect(wrapper.find('.plugin-tools-search-input').exists()).toBe(true)
    })

    it('已打开工具时进入入口视图：工具内容仅隐藏（实例保留），点工具列表后退出', async () => {
        const wrapper = mountPluginTools()
        await clickToolRow(wrapper, CALCULATOR_ID)
        expect(STUB_MOUNT_STATE.mounts).toBe(1)

        await showSearchEntryByMenu()
        // 工具内容只隐藏不卸载：v-show，切回工具时内容不丢
        const toolContent = wrapper.find('.plugin-tool-content')
        expect(toolContent.exists()).toBe(true)
        expect(toolContent.isVisible()).toBe(false)
        expect(STUB_MOUNT_STATE.mounts).toBe(1)

        // 「工具列表」退出入口视图 → 默认视图，工具条搜索框恢复
        await wrapper.find('.plugin-tools-home-btn').trigger('click')
        await nextTick()
        expect(wrapper.find('[data-plugin-tool-view="home"]').exists()).toBe(true)
        expect(wrapper.find('.plugin-tools-search-input').exists()).toBe(true)
    })

    it('入口视图下最小化/返回编辑器既有行为不变（搜索状态与视图复位）', async () => {
        const wrapper = mountPluginTools()
        await showSearchEntryByMenu()
        expect(wrapper.find('[data-plugin-tool-view="search-entry"]').exists()).toBe(true)

        // 最小化：容器折叠、工具条搜索框仍不渲染；还原后入口视图保留
        const minimizeButton = wrapper.findAll('.plugin-tools-control-btn')[0]
        await minimizeButton.trigger('click')
        await nextTick()
        expect(wrapper.find('#plugin-tools-container').classes()).toContain(
            'plugin-tools-container--minimized'
        )
        await minimizeButton.trigger('click')
        await nextTick()
        expect(wrapper.find('[data-plugin-tool-view="search-entry"]').exists()).toBe(true)

        // 返回编辑器：退出入口视图并复位为默认视图（既有「返回编辑器」行为）
        await wrapper.find('#plugin-tool-close button').trigger('click')
        await nextTick()
        expect(wrapper.find('[data-plugin-tool-view="search-entry"]').exists()).toBe(false)
        expect(wrapper.find('[data-plugin-tool-view="home"]').exists()).toBe(true)
        expect(wrapper.find('.plugin-tools-search-input').exists()).toBe(true)
    })
})

// ==================== 1.5.6 批次 A：REQ-06 分类折叠（8 分组 / 持久化 / 检索互不干扰） ====================

describe('REQ-06 分类分组纯逻辑（manifest 派生 8 分类）', () => {
    it('38 项工具按 8 分类分组：组顺序/组名/组内计数与 manifest 一致，不丢行不重复', () => {
        const entries = resolveEntries('zh-CN')
        const groups = groupPluginToolEntriesBySection(entries)
        // 8 分类（分区）顺序 = 分区图标表声明顺序 = manifest 工具顺序
        expect(groups.map((group) => group.sectionId)).toEqual([...PLUGIN_TOOL_SECTION_IDS])
        expect(PLUGIN_TOOL_SECTION_IDS).toHaveLength(8)
        // 38 项按分区计数：加解密 8 / 编解码 5 / 格式转换 5 / 格式化 2 / 文本 3 / 小工具 3 / 网络 4 / 对照表 8
        expect(groups.map((group) => group.tools.length)).toEqual([8, 5, 5, 2, 3, 3, 4, 8])
        expect(groups.reduce((total, group) => total + group.tools.length, 0)).toBe(38)
        expect(groups.flatMap((group) => group.tools.map((tool) => tool.actionId))).toEqual(
            entries.map((entry) => entry.actionId)
        )
    })

    it('8 分类标题 i18n 键（复用菜单分组词条）中英均可解析，未知分类返回 undefined', () => {
        for (const sectionId of PLUGIN_TOOL_SECTION_IDS) {
            const labelKey = getPluginToolSectionLabelKey(sectionId)
            expect(labelKey, sectionId).toBeDefined()
            for (const locale of ['zh-CN', 'en-US'] as const) {
                const label = translate(labelKey as string, locale)
                expect(label, `${locale} 缺少 ${labelKey}`).not.toBe(labelKey)
                expect(label.trim().length).toBeGreaterThan(0)
            }
        }
        expect(getPluginToolSectionLabelKey('not-a-section')).toBeUndefined()
    })

    it('折叠纯函数：切换幂等、空 id 原样；存储读取容错只保留合法分类 id', () => {
        expect(toggleCollapsedPluginToolGroup([], 'encrypt')).toEqual(['encrypt'])
        expect(toggleCollapsedPluginToolGroup(['encrypt', 'net'], 'encrypt')).toEqual(['net'])
        // 空 sectionId（平铺伪分组/未知）不改变清单，也不修改入参
        const current = ['net']
        expect(toggleCollapsedPluginToolGroup(current, '')).toEqual(['net'])
        expect(current).toEqual(['net'])

        // 读取容错：缺失/损坏 JSON → 空；已下线/未知分类 id 被过滤；重复项去重
        expect(
            readPluginToolIds(createMemoryStorage(), PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY)
        ).toEqual([])
        const broken = createMemoryStorage({
            [PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY]: '{broken'
        })
        expect(readPluginToolIds(broken, PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY)).toEqual([])
        const storage = createMemoryStorage({
            [PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY]: JSON.stringify([
                'encrypt',
                'removed-section',
                'net',
                'encrypt'
            ])
        })
        expect(
            readPluginToolIds(storage, PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY, {
                validIds: new Set(PLUGIN_TOOL_SECTION_IDS)
            })
        ).toEqual(['encrypt', 'net'])
    })
})

describe('REQ-06 面板分类折叠（8 分组 / aria-expanded / localStorage 持久）', () => {
    /** 「全部工具」分区内的 8 个分类分组 */
    function groupNodes(wrapper: VueWrapper): DOMWrapper<Element>[] {
        return wrapper.findAll('[data-plugin-tool-section="all"] [data-plugin-tool-group]')
    }

    /** 读取 jsdom localStorage 中已折叠分类清单 */
    function storedCollapsedGroups(): string[] {
        const raw = window.localStorage.getItem(PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY)
        return raw === null ? [] : (JSON.parse(raw) as string[])
    }

    it('默认视图「全部工具」渲染 8 个分类分组：标题行含分类图标 + 分类名 + 折叠箭头', async () => {
        const wrapper = mountPluginTools()
        await nextTick()
        const groups = groupNodes(wrapper)
        expect(groups.map((group) => group.attributes('data-plugin-tool-group'))).toEqual([
            ...PLUGIN_TOOL_SECTION_IDS
        ])
        const firstGroup = groups[0]
        expect(firstGroup.find('.plugin-tool-group-name').text()).toBe('加解密插件')
        expect(firstGroup.find('.plugin-tool-group-toggle').attributes('aria-expanded')).toBe(
            'true'
        )
        expect(firstGroup.find('.plugin-tool-group-toggle').attributes('aria-controls')).toBe(
            'plugin-tool-group-list-encrypt'
        )
        // 分组标题显示分类图标（24 网格线框），行首显示工具图标
        expect(firstGroup.findAll('.plugin-tool-group-icon path').length).toBeGreaterThan(0)
        expect(firstGroup.find('.plugin-tool-group-chevron').exists()).toBe(true)
        // 8 组工具行合计仍为 38（既有「全部工具」行数与顺序不变）
        expect(sectionToolIds(wrapper, 'all')).toEqual(STUB_ACTION_IDS)
    })

    it('点击分类标题折叠/展开：aria-expanded 切换、行隐藏、状态写入 localStorage', async () => {
        const wrapper = mountPluginTools()
        await nextTick()
        const encryptGroup = (): DOMWrapper<Element> => groupNodes(wrapper)[0]

        expect(encryptGroup().find('[data-tool-action-id]').isVisible()).toBe(true)
        await encryptGroup().find('.plugin-tool-group-toggle').trigger('click')
        await nextTick()
        expect(encryptGroup().attributes('data-plugin-tool-group-collapsed')).toBe('true')
        expect(encryptGroup().find('.plugin-tool-group-toggle').attributes('aria-expanded')).toBe(
            'false'
        )
        // 折叠只隐藏行：DOM 保留（v-show），不影响其它分组
        expect(encryptGroup().find('[data-tool-action-id]').isVisible()).toBe(false)
        expect(groupNodes(wrapper)[1].find('[data-tool-action-id]').isVisible()).toBe(true)
        expect(storedCollapsedGroups()).toEqual(['encrypt'])

        // 再次点击 → 展开并清空持久化折叠状态
        await encryptGroup().find('.plugin-tool-group-toggle').trigger('click')
        await nextTick()
        expect(encryptGroup().find('.plugin-tool-group-toggle').attributes('aria-expanded')).toBe(
            'true'
        )
        expect(encryptGroup().find('[data-tool-action-id]').isVisible()).toBe(true)
        expect(storedCollapsedGroups()).toEqual([])
    })

    it('折叠状态跨挂载保持（读取 localStorage；未知分类 id 容错忽略）', async () => {
        window.localStorage.setItem(
            PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY,
            JSON.stringify(['net', 'removed-section'])
        )
        const wrapper = mountPluginTools()
        await nextTick()
        const groups = groupNodes(wrapper)
        expect(groups).toHaveLength(8)
        const collapsed = groups
            .filter((group) => group.attributes('data-plugin-tool-group-collapsed') === 'true')
            .map((group) => group.attributes('data-plugin-tool-group'))
        expect(collapsed).toEqual(['net'])
        const netGroup = groups.find(
            (group) => group.attributes('data-plugin-tool-group') === 'net'
        )
        expect(netGroup?.find('[data-tool-action-id]').isVisible()).toBe(false)
    })

    it('折叠状态不影响搜索过滤：全部分类折叠时搜索仍命中并展示平铺结果', async () => {
        window.localStorage.setItem(
            PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY,
            JSON.stringify([...PLUGIN_TOOL_SECTION_IDS])
        )
        const wrapper = mountPluginTools()
        await nextTick()
        const input = wrapper.find('.plugin-tools-search-input')
        await input.setValue('哈希')
        await nextTick()
        expect(wrapper.find('[data-plugin-tool-view="search"]').exists()).toBe(true)
        expect(sectionToolIds(wrapper, 'search')).toEqual([HASH_ID])
        // 搜索结果不分折叠（平铺）
        expect(
            wrapper.find('[data-plugin-tool-section="search"] [data-plugin-tool-group]').exists()
        ).toBe(false)
        // 清空查询回到默认视图：折叠状态仍保持
        await input.setValue('')
        await nextTick()
        const groups = groupNodes(wrapper)
        expect(
            groups.every((group) => group.attributes('data-plugin-tool-group-collapsed') === 'true')
        ).toBe(true)
    })

    it('插件搜索入口视图「全部工具」同样按 8 分类分组，输入过滤后切换为平铺结果', async () => {
        const wrapper = mountPluginTools()
        await nextTick()
        await showSearchEntryByMenu()
        expect(wrapper.find('[data-plugin-tool-view="search-entry"]').exists()).toBe(true)
        expect(groupNodes(wrapper)).toHaveLength(8)
        // 入口视图同样可折叠
        await groupNodes(wrapper)[0].find('.plugin-tool-group-toggle').trigger('click')
        await nextTick()
        expect(groupNodes(wrapper)[0].find('[data-tool-action-id]').isVisible()).toBe(false)

        const entryInput = wrapper.find('.plugin-tools-entry-search-input')
        await entryInput.setValue('base64-codec')
        await nextTick()
        expect(wrapper.find('[data-plugin-tool-view="search"]').exists()).toBe(true)
        expect(
            wrapper.find('[data-plugin-tool-section="search"] [data-plugin-tool-group]').exists()
        ).toBe(false)
        expect(sectionToolIds(wrapper, 'search')).toEqual([BASE64_ID])
    })
})

// ==================== 1.5.6 批次 A：REQ-06/15 每工具图标（38 项完整性 + 图标契约） ====================

describe('REQ-06 每工具图标（plugin-tools-icons.ts）', () => {
    it('38 项工具图标映射完整：键集合 = manifest 工具 id；每个工具至少 1 条 path', () => {
        const manifestToolIds = PLUGIN_TOOL_ITEMS.map((item) => item.id)
        expect(manifestToolIds).toHaveLength(38)
        expect(Object.keys(PLUGIN_TOOL_ITEM_ICON_PATHS).sort()).toEqual([...manifestToolIds].sort())
        for (const toolId of manifestToolIds) {
            const paths = PLUGIN_TOOL_ITEM_ICON_PATHS[toolId]
            expect(paths, `${toolId} 缺少图标`).toBeDefined()
            expect(paths.length, toolId).toBeGreaterThan(0)
            for (const pathData of paths) {
                // 纯路径数据：以 M 起笔，不得夹带 <svg>/fill/stroke/style（否则绕过 currentColor）
                expect(pathData, toolId).toMatch(/^M/)
                expect(pathData, toolId).not.toMatch(/<|fill=|stroke=|style=/)
                // 24 网格：路径数字不得越出 0~24（负数为相对指令的位移量，绝对值同样受限）
                for (const numeric of pathData.match(/-?\d+(?:\.\d+)?/g) ?? []) {
                    expect(
                        Math.abs(Number(numeric)),
                        `${toolId} 坐标越界: ${pathData}`
                    ).toBeLessThanOrEqual(24)
                }
            }
        }
        // 每工具图标互不重复（避免「38 个工具同一图标」式糊弄）
        const fingerprints = manifestToolIds.map((toolId) =>
            PLUGIN_TOOL_ITEM_ICON_PATHS[toolId].join('|')
        )
        expect(new Set(fingerprints).size).toBe(manifestToolIds.length)
    })

    it('检索条目使用每工具专属图标；manifest 未登记工具回退所属分类图标', () => {
        const entries = resolveEntries('zh-CN')
        const hashEntry = entries.find((entry) => entry.actionId === HASH_ID)
        expect(hashEntry?.iconPaths).toEqual(PLUGIN_TOOL_ITEM_ICON_PATHS['encrypt:hash-text'])
        // 不再退化为「同分类所有工具共用一个图标」
        const encryptEntries = entries.filter((entry) => entry.sectionId === 'encrypt')
        expect(new Set(encryptEntries.map((entry) => entry.iconPaths.join('|'))).size).toBe(
            encryptEntries.length
        )
        // 未知工具（未登记 manifest）：按 section 回退分类图标，不出现空图标
        const fallbackEntry = createPluginToolSearchEntry(undefined, 'unknown:tool', (key) => key)
        expect(fallbackEntry.iconPaths).toEqual(getPluginToolIconPaths('unknown'))
        expect(fallbackEntry.iconPaths.length).toBeGreaterThan(0)
    })

    it('PluginTools.vue 工具行/分组标题图标：24 网格 / fill none / stroke 1.5 / currentColor', () => {
        const source = fs.readFileSync(
            path.join(REPO_ROOT, 'src/renderer/src/components/PluginTools/PluginTools.vue'),
            'utf8'
        )
        for (const className of ['plugin-tool-item-icon', 'plugin-tool-group-icon']) {
            const svgTag = new RegExp(`<svg[^>]*class="${className}"[^>]*>`).exec(source)?.[0] ?? ''
            expect(svgTag, className).not.toBe('')
            expect(svgTag, className).toContain('viewBox="0 0 24 24"')
            expect(svgTag, className).toContain('fill="none"')
            expect(svgTag, className).toContain('stroke="currentColor"')
            expect(svgTag, className).toContain('stroke-width="1.5"')
            expect(svgTag, className).toContain('aria-hidden="true"')
        }
    })
})
