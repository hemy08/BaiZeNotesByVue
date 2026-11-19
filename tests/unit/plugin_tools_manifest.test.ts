/**
 * 插件工具 38 项单一 manifest 一致性测试（结构优化收尾 M3）
 *
 * 守护目标：`src/shared/constants/plugin-tools-manifest.ts` 是插件工具的唯一真源——
 *   ① 菜单（menu-config.ts 的 pluginsMenu）由 manifest 生成；
 *   ② 懒加载注册表（plugin-tools-const.ts 的 pluginTools）由 manifest 生成；
 *   ③ 名称 i18n key（zh-CN / en-US）在 manifest 中登记并在词典中存在。
 * 本文件锁死四者的一致性，防止再次出现「菜单有入口但注册表无组件」（死入口）或
 * 「注册表有组件但菜单无入口」（功能不可达，FE-17）的多段同步回归。
 *
 * 覆盖（对应任务验收）：
 * - 38 项覆盖 / id 无重复 / 组件模块路径无重复；
 * - 8 个分区数量与 38 项合计一致；
 * - 菜单动作集合与顺序 == manifest == 注册表（三处同序）；
 * - 菜单分组结构与 manifest 一致（空组保留在 manifest、渲染前被剪除）；
 * - i18n：全部组标签与工具名称在 zh-CN / en-US 词典中均存在（直接查词典，不依赖回退）；
 * - 懒加载表与 manifest 的 component 集合完全一致，且对应组件文件真实存在。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

import { MESSAGES, translate } from '../../src/shared/i18n'
import type { Locale } from '../../src/shared/i18n'
import {
    PLUGIN_TOOL_ACTION_IDS,
    PLUGIN_TOOL_ACTION_PREFIX,
    PLUGIN_TOOL_ITEMS,
    PLUGIN_TOOL_MENU,
    getPluginToolGroupLabelKey,
    getPluginToolMenuAction
} from '../../src/shared/constants/plugin-tools-manifest'
import type {
    PluginToolMenuGroup,
    PluginToolMenuNode
} from '../../src/shared/constants/plugin-tools-manifest'
import {
    pluginTools,
    pluginToolModuleKeys
} from '../../src/renderer/src/components/PluginTools/plugin-tools-const'
import { menuMap } from '../../src/renderer/src/components/MenuBar/menu-config'
import type { BaiZeMenuEntry } from '../../src/renderer/src/components/MenuBar/menu-config'

const ROOT = path.resolve(__dirname, '../..')
const PLUGIN_TOOLS_DIR = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'PluginTools')

/** 各分区（动作 id 的 section 段）期望数量：与 38 项合计一致 */
const SECTION_EXPECTATIONS: Readonly<Record<string, number>> = {
    encrypt: 8,
    net: 4,
    info: 8,
    codec: 5,
    convert: 5,
    misc: 3,
    text: 3,
    format: 2
}

/** 词典中是否存在指定点分键（直接查词典，避免 translate 的 zh-CN 回退掩盖 en-US 缺失） */
function hasMessage(locale: Locale, key: string): boolean {
    let node: unknown = MESSAGES[locale]
    for (const part of key.split('.')) {
        if (node === null || typeof node !== 'object') {
            return false
        }
        node = (node as Record<string, unknown>)[part]
    }
    return typeof node === 'string' && node.length > 0
}

/** 叶子节点（工具项）判定：组节点有 children，工具项有 component */
function isGroup(node: PluginToolMenuNode): node is PluginToolMenuGroup {
    return 'children' in node
}

/** manifest 组是否至少包含 1 个工具叶子（空组在菜单导出前会被 pruneEmptySubmenus 剪除） */
function hasToolLeaf(group: PluginToolMenuGroup): boolean {
    return group.children.some((child) => (isGroup(child) ? hasToolLeaf(child) : true))
}

/** 按渲染顺序收集「会被渲染的」菜单组 labelKey（跳过无叶子的空组） */
function collectManifestGroupLabelKeys(nodes: readonly PluginToolMenuNode[]): string[] {
    const labelKeys: string[] = []
    const walk = (list: readonly PluginToolMenuNode[]): void => {
        for (const node of list) {
            if (isGroup(node) && hasToolLeaf(node)) {
                labelKeys.push(getPluginToolGroupLabelKey(node.id))
                walk(node.children)
            }
        }
    }
    walk(nodes)
    return labelKeys
}

/** 收集渲染后的菜单树中的组 labelKey（有 submenu 的项即菜单组） */
function collectMenuGroupLabelKeys(items: BaiZeMenuEntry[]): string[] {
    const labelKeys: string[] = []
    const walk = (list: BaiZeMenuEntry[]): void => {
        for (const item of list) {
            if (item.submenu) {
                if (item.labelKey) {
                    labelKeys.push(item.labelKey)
                }
                walk(item.submenu)
            }
        }
    }
    walk(items)
    return labelKeys
}

/** 递归收集菜单树中的全部 menuAction（叶子项） */
function collectMenuActions(items: BaiZeMenuEntry[]): string[] {
    const actions: string[] = []
    const walk = (list: BaiZeMenuEntry[]): void => {
        for (const item of list) {
            if (item.menuAction) {
                actions.push(item.menuAction)
            }
            if (item.submenu) {
                walk(item.submenu)
            }
        }
    }
    walk(items)
    return actions
}

/** 「插件」顶层菜单（menuMap 已剪除空组） */
function getPluginsMenu(): BaiZeMenuEntry {
    const pluginsMenu = menuMap.value.find((item) => item.labelKey === 'menu.plugins.label')
    expect(pluginsMenu, '应存在「插件」顶层菜单').toBeDefined()
    return pluginsMenu!
}

describe('M3 插件工具单一 manifest 一致性', () => {
    describe('manifest 结构契约（38 项覆盖 / 无重复）', () => {
        it('应恰好登记 38 项工具，且菜单树叶子数一致', () => {
            expect(PLUGIN_TOOL_ITEMS).toHaveLength(38)
            expect(PLUGIN_TOOL_ACTION_IDS).toHaveLength(38)

            const leafCount = (nodes: readonly PluginToolMenuNode[]): number =>
                nodes.reduce((sum, node) => sum + (isGroup(node) ? leafCount(node.children) : 1), 0)
            expect(leafCount(PLUGIN_TOOL_MENU)).toBe(38)
        })

        it('工具 id 无重复、组件模块路径无重复且均以 .vue 结尾', () => {
            const ids = PLUGIN_TOOL_ITEMS.map((item) => item.id)
            expect(new Set(ids).size).toBe(ids.length)
            const components = PLUGIN_TOOL_ITEMS.map((item) => item.component)
            expect(new Set(components).size).toBe(components.length)
            for (const component of components) {
                expect(component.endsWith('.vue'), `组件应为 .vue：${component}`).toBe(true)
            }
        })

        it('id 命名遵循 <section>:<tool> 且动作 id 前缀统一', () => {
            for (const item of PLUGIN_TOOL_ITEMS) {
                expect(item.id).toMatch(
                    /^(encrypt|net|info|codec|convert|misc|text|format):[a-z0-9-]+$/
                )
                expect(getPluginToolMenuAction(item.id)).toBe(
                    `${PLUGIN_TOOL_ACTION_PREFIX}${item.id}`
                )
            }
            for (const actionId of PLUGIN_TOOL_ACTION_IDS) {
                expect(actionId.startsWith(PLUGIN_TOOL_ACTION_PREFIX)).toBe(true)
            }
        })

        it('8 个分区数量与 38 项合计一致', () => {
            for (const [section, expected] of Object.entries(SECTION_EXPECTATIONS)) {
                const count = PLUGIN_TOOL_ITEMS.filter((item) =>
                    item.id.startsWith(`${section}:`)
                ).length
                expect(count, `分区 ${section} 数量`).toBe(expected)
            }
            const total = Object.values(SECTION_EXPECTATIONS).reduce((sum, count) => sum + count, 0)
            expect(total).toBe(38)
        })

        it('分组标签 i18n key 由组 id 生成且组 id 唯一', () => {
            const groupIds: string[] = []
            const walk = (nodes: readonly PluginToolMenuNode[]): void => {
                for (const node of nodes) {
                    if (isGroup(node)) {
                        groupIds.push(node.id)
                        walk(node.children)
                    }
                }
            }
            walk(PLUGIN_TOOL_MENU)
            expect(new Set(groupIds).size).toBe(groupIds.length)
            for (const groupId of groupIds) {
                expect(getPluginToolGroupLabelKey(groupId)).toBe(`menu.plugins.group.${groupId}`)
            }
        })

        it('空组保留在 manifest 中（数据补齐后无需改菜单即可展示）', () => {
            const emptyGroupIds: string[] = []
            const walk = (nodes: readonly PluginToolMenuNode[]): void => {
                for (const node of nodes) {
                    if (isGroup(node)) {
                        if (!hasToolLeaf(node)) {
                            emptyGroupIds.push(node.id)
                        }
                        walk(node.children)
                    }
                }
            }
            walk(PLUGIN_TOOL_MENU)
            expect(emptyGroupIds.sort()).toEqual(['caseConvert', 'dataCommand', 'languageKeywords'])
        })
    })

    describe('菜单生成（menu-config 由 manifest 生成）', () => {
        it('插件菜单动作集合与顺序 == manifest == 注册表（三处同序）', () => {
            const menuActions = collectMenuActions(getPluginsMenu().submenu!)
            expect(menuActions).toEqual([...PLUGIN_TOOL_ACTION_IDS])
            expect(pluginTools.map((tool) => tool.id)).toEqual([...PLUGIN_TOOL_ACTION_IDS])
        })

        it('插件菜单动作唯一且全部以插件动作前缀开头', () => {
            const actions = collectMenuActions(getPluginsMenu().submenu!)
            expect(actions.length).toBe(38)
            expect(new Set(actions).size).toBe(actions.length)
            for (const action of actions) {
                expect(action.startsWith(PLUGIN_TOOL_ACTION_PREFIX)).toBe(true)
            }
        })

        it('菜单分组结构（层级与顺序）与 manifest 一致，空组不渲染', () => {
            const expectedGroupKeys = collectManifestGroupLabelKeys(PLUGIN_TOOL_MENU)
            const renderedGroupKeys = collectMenuGroupLabelKeys(getPluginsMenu().submenu!)
            expect(renderedGroupKeys).toEqual(expectedGroupKeys)
            // 3 个空组被 pruneEmptySubmenus 剪除，不渲染
            for (const emptyGroupId of ['languageKeywords', 'caseConvert', 'dataCommand']) {
                expect(renderedGroupKeys).not.toContain(getPluginToolGroupLabelKey(emptyGroupId))
            }
        })

        it('菜单为纯数据投影：无硬编码 label（全部走 labelKey）', () => {
            const walk = (items: BaiZeMenuEntry[]): void => {
                for (const item of items) {
                    expect(item.label).toBeUndefined()
                    expect(item.labelKey, '菜单项应使用 labelKey').toBeTruthy()
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(getPluginsMenu().submenu!)
        })
    })

    describe('名称 i18n 词条（zh-CN / en-US 均存在）', () => {
        it('38 项工具名称在中英词典中均可解析', () => {
            for (const item of PLUGIN_TOOL_ITEMS) {
                expect(
                    hasMessage('zh-CN', item.menuLabelKey),
                    `zh-CN 缺少 ${item.menuLabelKey}`
                ).toBe(true)
                expect(
                    hasMessage('en-US', item.menuLabelKey),
                    `en-US 缺少 ${item.menuLabelKey}`
                ).toBe(true)
            }
        })

        it('全部组标签（含空组）在中英词典中均可解析', () => {
            const walk = (nodes: readonly PluginToolMenuNode[]): void => {
                for (const node of nodes) {
                    if (isGroup(node)) {
                        const labelKey = getPluginToolGroupLabelKey(node.id)
                        expect(hasMessage('zh-CN', labelKey), `zh-CN 缺少 ${labelKey}`).toBe(true)
                        expect(hasMessage('en-US', labelKey), `en-US 缺少 ${labelKey}`).toBe(true)
                        walk(node.children)
                    }
                }
            }
            walk(PLUGIN_TOOL_MENU)
        })

        // 迁移自 menu_consts.test.ts（原 PluginGeneratorMaps 断言）：FE-28 硬编码标签收口
        it('FE-28：Token Generator / Hash Text 中英均可解析', () => {
            const tokenGenerator = PLUGIN_TOOL_ITEMS.find(
                (item) => item.id === 'encrypt:token-generator'
            )!
            const hashText = PLUGIN_TOOL_ITEMS.find((item) => item.id === 'encrypt:hash-text')!
            expect(tokenGenerator.menuLabelKey).toBe('menu.plugins.encrypt.tokenGenerator')
            expect(translate(tokenGenerator.menuLabelKey, 'zh-CN')).toBe('令牌生成器')
            expect(translate(tokenGenerator.menuLabelKey, 'en-US')).toBe('Token Generator')
            expect(hashText.menuLabelKey).toBe('menu.plugins.encrypt.hashText')
            expect(translate(hashText.menuLabelKey, 'zh-CN')).toBe('哈希文本')
            expect(translate(hashText.menuLabelKey, 'en-US')).toBe('Hash Text')
        })

        it('代表条目的中英渲染文案保持既定口径', () => {
            const resolved = (id: string, locale: Locale): string =>
                translate(PLUGIN_TOOL_ITEMS.find((item) => item.id === id)!.menuLabelKey, locale)
            expect(resolved('net:ipv4-subnet-calculator', 'zh-CN')).toBe('IPv4子网计算器')
            expect(resolved('net:ipv4-subnet-calculator', 'en-US')).toBe('IPv4 Subnet Calculator')
            expect(resolved('info:ascii-table', 'zh-CN')).toBe('ASCII码对照表')
            expect(resolved('info:ascii-table', 'en-US')).toBe('ASCII Table')
            // FE-17 补入口（原 menu-config 内联项）迁入 manifest 后文案不变
            expect(resolved('net:http-status-codes', 'zh-CN')).toBe('HTTP状态码对照表')
            expect(resolved('net:subnet-mask-map-table', 'en-US')).toBe('Subnet Mask Table')
            expect(resolved('info:numeric-case-table', 'zh-CN')).toBe('数字大小写对照表')
            expect(resolved('info:normal-font-style-table', 'zh-CN')).toBe('常见字体样式对照表')
        })
    })

    describe('懒加载注册表（plugin-tools-const 由 manifest 生成）', () => {
        it('注册表 38 项、id 与 manifest 动作 id 逐项一致', () => {
            expect(pluginTools).toHaveLength(38)
            expect(pluginTools.map((tool) => tool.id)).toEqual([...PLUGIN_TOOL_ACTION_IDS])
            for (const tool of pluginTools) {
                expect(tool.component).toBeDefined()
            }
        })

        it('懒加载表与 manifest 组件集合完全一致（38 项，无多无少）', () => {
            expect(pluginToolModuleKeys).toHaveLength(38)
            expect([...pluginToolModuleKeys].sort()).toEqual(
                PLUGIN_TOOL_ITEMS.map((item) => item.component).sort()
            )
        })

        it('每个 manifest 组件文件真实存在', () => {
            for (const item of PLUGIN_TOOL_ITEMS) {
                const componentPath = path.resolve(PLUGIN_TOOLS_DIR, item.component)
                expect(
                    fs.existsSync(componentPath),
                    `组件文件不存在：${item.component} → ${componentPath}`
                ).toBe(true)
            }
        })
    })
})
