// @vitest-environment jsdom
/**
 * pluginTools 注册表结构测试 + 插件菜单双向一致性校验（FE-16/FE-17）
 *
 * M3（结构优化收尾）：注册表已改为由 shared/constants/plugin-tools-manifest.ts 的
 * PLUGIN_TOOL_ITEMS 生成（本文件不再包含 id/组件路径字面量），因此：
 * - 本文件继续锁死「注册表结构与分类数量」；
 * - manifest 的 38 项覆盖/无重复/菜单↔注册表顺序/i18n/组件懒加载表一致性
 *   统一由 tests/unit/plugin_tools_manifest.test.ts 守护。
 *
 * ET-20：本文件保持 jsdom 环境（与 tests/unit/vue/encryption-tools.test.ts 挂载同一批
 * 组件的方式一致）；当前用例只做常量表断言、不挂载组件，组件 import() 不会被触发。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

import { pluginTools } from '../../src/renderer/src/components/PluginTools/plugin-tools-const'
// FE-16/FE-17：插件工具注册表 ↔ 插件菜单双向一致性校验（菜单数据不依赖 .vue 组件，可安全导入）
import { menuMap } from '../../src/renderer/src/components/MenuBar/menu-config'
// M3：注册表唯一真源（38 项工具清单/组件模块路径）
import { PLUGIN_TOOL_ITEMS } from '../../src/shared/constants/plugin-tools-manifest'

const ROOT = path.resolve(__dirname, '../..')
const PLUGIN_TOOLS_DIR = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'PluginTools')

/** 递归收集菜单树中的所有 menuAction */
function collectMenuActions(items: unknown[]): string[] {
    const actions: string[] = []
    const walk = (list: unknown[]): void => {
        for (const item of list as Array<{ menuAction?: string; submenu?: unknown[] }>) {
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

describe('pluginTools', () => {
    it('should not be empty', () => {
        expect(pluginTools.length).toBeGreaterThan(0)
    })

    it('should contain 38 plugin tool entries', () => {
        expect(pluginTools.length).toBe(38)
    })

    it('should keep id and component fields complete', () => {
        for (const tool of pluginTools) {
            expect(tool.id.length).toBeGreaterThan(0)
            expect(tool.component).toBeDefined()
        }
    })

    it('should keep all ids unique', () => {
        const ids = pluginTools.map((tool) => tool.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('should follow the baize plugin id naming convention', () => {
        for (const tool of pluginTools) {
            expect(tool.id).toMatch(
                /^baize:menu:plugins:(encrypt|net|info|codec|convert|misc|text|format):[a-z0-9-]+$/
            )
        }
    })

    it('should register the expected number of entries per category', () => {
        // 加解密类：8；网络计算类：4（含正则测试）；常用对照表类：8；
        // 编解码类：5；格式转换类：5；常用小工具类：2；文本转换类：3；格式化类：2（1.3.5 jyshare 集成）
        const encrypt = pluginTools.filter((tool) => tool.id.includes(':encrypt:'))
        const net = pluginTools.filter((tool) => tool.id.includes(':net:'))
        const info = pluginTools.filter((tool) => tool.id.includes(':info:'))
        const codec = pluginTools.filter((tool) => tool.id.includes(':codec:'))
        const convert = pluginTools.filter((tool) => tool.id.includes(':convert:'))
        const misc = pluginTools.filter((tool) => tool.id.includes(':misc:'))
        const text = pluginTools.filter((tool) => tool.id.includes(':text:'))
        const format = pluginTools.filter((tool) => tool.id.includes(':format:'))
        expect(encrypt).toHaveLength(8)
        expect(net).toHaveLength(4)
        expect(info).toHaveLength(8)
        expect(codec).toHaveLength(5)
        expect(convert).toHaveLength(5)
        expect(misc).toHaveLength(3)
        expect(text).toHaveLength(3)
        expect(format).toHaveLength(2)
    })

    it('should sample key plugin ids', () => {
        const ids = pluginTools.map((tool) => tool.id)
        expect(ids).toContain('baize:menu:plugins:encrypt:token-generator')
        expect(ids).toContain('baize:menu:plugins:encrypt:rsa-generator')
        expect(ids).toContain('baize:menu:plugins:net:ipv4-subnet-calculator')
        expect(ids).toContain('baize:menu:plugins:info:ascii-table')
        expect(ids).toContain('baize:menu:plugins:info:physical-constant-table')
        expect(ids).toContain('baize:menu:plugins:codec:base64-codec')
        expect(ids).toContain('baize:menu:plugins:convert:color-convert')
        expect(ids).toContain('baize:menu:plugins:misc:calculator')
        // 2026-11-18（遗留清单 #9）：PDF 预览改走 pdf.js 后恢复注册
        expect(ids).toContain('baize:menu:plugins:misc:pdf-preview')
        expect(ids).toContain('baize:menu:plugins:text:chinese-text')
        expect(ids).toContain('baize:menu:plugins:format:json-tool')
        expect(ids).toContain('baize:menu:plugins:net:regex-tester')
    })
})

// FE-16/FE-17 回归防护：插件工具注册表（plugin-tools-const.ts）与渲染层插件菜单
// （menu-config.ts）必须双向一致——
// ① 已注册工具必须有菜单入口（否则功能不可达，FE-17）；
// ② 插件菜单动作必须映射到已注册工具（否则点击后 PluginTools.vue 只有"开发中"
//    占位、或被空组剪枝剔除，构成死入口，FE-16）。
describe('pluginTools ↔ 插件菜单一致性（FE-16/FE-17）', () => {
    const menuActions = collectMenuActions(menuMap.value)
    const pluginMenuActions = menuActions.filter((action) =>
        action.startsWith('baize:menu:plugins:')
    )
    const registeredIds = new Set(pluginTools.map((tool) => tool.id))

    it('should give every registered plugin tool a menu entry', () => {
        const missing = pluginTools
            .map((tool) => tool.id)
            .filter((id) => !pluginMenuActions.includes(id))
        expect(missing).toEqual([])
    })

    it('should map every plugin menu action to a registered tool', () => {
        const orphanActions = pluginMenuActions.filter((action) => !registeredIds.has(action))
        expect(orphanActions).toEqual([])
    })

    it('should keep plugin menu actions unique and non-empty', () => {
        expect(pluginMenuActions.length).toBeGreaterThan(0)
        expect(new Set(pluginMenuActions).size).toBe(pluginMenuActions.length)
    })
})

// 第 4 批 4.5（M6：重复资产清理）：未注册工具页清理守卫。
//
// 收敛前 PluginTools 下存在 7 个「已实现占位页、但既不在 plugin-tools-const 注册表、
// 也没有菜单入口」的 .vue 文件：6 个 NetWork 外链占位页（Ipv4AddrConvert /
// Ipv6UlaGenerator / MacAddrGenerator / MacAddrLookup / QrcodeGenerator /
// WifiQrcodeGenerator，均为「标题 + 一条 window.open 外链」）与 Tools/LatexEditor
// （JSDOM 时代迁移的空壳：静态模板无任何交互/渲染逻辑）。
// 它们属不可达死资源且与「在线工具」菜单的外链能力重复，本轮直接删除（不注册）：
// 注册需要菜单名 i18n 词条（src/shared 在本批写入范围之外），且这些页面本身无功能价值。
// 本守卫锁定删除结果，并防止未来再新增「未登记的任何工具页」。
describe('未注册工具页清理（第 4 批 4.5 / M6）', () => {
    /** 本轮删除的 7 个占位页（相对 PluginTools 目录） */
    const DELETED_PLACEHOLDER_PAGES = [
        'NetWork/Ipv4AddrConvert.vue',
        'NetWork/Ipv6UlaGenerator.vue',
        'NetWork/MacAddrGenerator.vue',
        'NetWork/MacAddrLookup.vue',
        'NetWork/QrcodeGenerator.vue',
        'NetWork/WifiQrcodeGenerator.vue',
        'Tools/LatexEditor.vue'
    ]

    it('7 个无注册/无菜单入口的占位工具页已删除', () => {
        for (const relativePage of DELETED_PLACEHOLDER_PAGES) {
            expect(
                fs.existsSync(path.join(PLUGIN_TOOLS_DIR, relativePage)),
                `应已删除：${relativePage}`
            ).toBe(false)
        }
    })

    it('PluginTools 下每个工具 .vue 都在 manifest 登记的工具组件中（无孤儿工具页）', () => {
        // 非「工具页」的两个历史文件：插件面板宿主壳 + 4 个 codec 薄封装共用的基件
        const NON_TOOL_PAGES = new Set(['PluginTools.vue', 'Codec/TextCodecTool.vue'])
        const registeredComponents = new Set(PLUGIN_TOOL_ITEMS.map((item) => item.component))

        const toolPages: string[] = []
        const walk = (dir: string): void => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, entry.name)
                if (entry.isDirectory()) {
                    walk(fullPath)
                } else if (entry.name.endsWith('.vue')) {
                    toolPages.push(path.relative(PLUGIN_TOOLS_DIR, fullPath).replace(/\\/g, '/'))
                }
            }
        }
        walk(PLUGIN_TOOLS_DIR)

        const orphans = toolPages.filter(
            (page) => !NON_TOOL_PAGES.has(page) && !registeredComponents.has(page)
        )
        expect(orphans).toEqual([])
    })
})
