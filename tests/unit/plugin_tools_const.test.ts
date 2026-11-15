// @vitest-environment jsdom
/**
 * pluginTools 注册表结构测试 + 插件菜单双向一致性校验（FE-16/FE-17）
 *
 * ET-20 修复（原注释已过时）：
 * - 原实现以「UUIDSGenerator.vue 等组件模板存在 v-model 与 value 绑定的编译错误，
 *   node 环境下无法编译」为由，对全部 19 个 .vue 组件做 vi.mock。
 * - 实测：该编译错误只出现在 vitest 默认 node 环境（SSR 编译路径下 Vue 编译器把
 *   「v-model 与静态 value 并存」判为 Error）；切到 jsdom 环境（与
 *   tests/unit/vue/encryption-tools.test.ts 挂载同一批组件的方式一致）后，19 个组件
 *   可真实编译导入，本文件只做常量表断言、不挂载组件，开销约 +0.4s。
 * - 因此删除 19 处 vi.mock，改为真实 import：组件路径/默认导出若被误改会在这里直接暴露，
 *   不再需要维护与组件清单同步的 mock 列表。
 */
import { describe, it, expect } from 'vitest'

import { pluginTools } from '../../src/renderer/src/components/PluginTools/plugin-tools-const'
// FE-16/FE-17：插件工具注册表 ↔ 插件菜单双向一致性校验（菜单数据不依赖 .vue 组件，可安全导入）
import { menuMap } from '../../src/renderer/src/components/MenuBar/menu-config'

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

    it('should contain 19 plugin tool entries', () => {
        expect(pluginTools.length).toBe(19)
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
            expect(tool.id).toMatch(/^baize:menu:plugins:(encrypt|net|info):[a-z0-9-]+$/)
        }
    })

    it('should register the expected number of entries per category', () => {
        // 加解密类：8 个；网络计算类：3 个；常用对照表类：8 个
        const encrypt = pluginTools.filter((tool) => tool.id.includes(':encrypt:'))
        const net = pluginTools.filter((tool) => tool.id.includes(':net:'))
        const info = pluginTools.filter((tool) => tool.id.includes(':info:'))
        expect(encrypt).toHaveLength(8)
        expect(net).toHaveLength(3)
        expect(info).toHaveLength(8)
    })

    it('should sample key plugin ids', () => {
        const ids = pluginTools.map((tool) => tool.id)
        expect(ids).toContain('baize:menu:plugins:encrypt:token-generator')
        expect(ids).toContain('baize:menu:plugins:encrypt:rsa-generator')
        expect(ids).toContain('baize:menu:plugins:net:ipv4-subnet-calculator')
        expect(ids).toContain('baize:menu:plugins:info:ascii-table')
        expect(ids).toContain('baize:menu:plugins:info:physical-constant-table')
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
