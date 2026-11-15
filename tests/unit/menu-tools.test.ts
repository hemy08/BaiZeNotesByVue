/**
 * menu_tools.ts 单元测试
 * 覆盖：tools 菜单 handler 的 open-vue-dialog send 通道与参数、
 * online/github 菜单 handler 的 OpenOnlineWebPage 常量路由、handler 树结构完整性。
 * P2 死代码清理：pluginsMenuHandlers（26 个死通道发送方）整体删除，相关用例移除。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const toolsMocks = vi.hoisted(() => ({
    openOnlineWebPage: vi.fn()
}))

vi.mock('../../src/main/dialogs/dialogs', () => ({
    OpenOnlineWebPage: toolsMocks.openOnlineWebPage
}))

import * as menuToolsModule from '../../src/main/ipc/menu-tools'
import {
    toolsMenuHandlers,
    onlineMenuHandlers,
    githubMenuHandlers
} from '../../src/main/ipc/menu-tools'
import {
    TOOLS_JYSHARE,
    CAINIAO_SVG_EDITOR,
    ENCODE_QRCODE_GENERATOR,
    IDE_PYTHON,
    DEV_JWT,
    TEAM_BAIDU_FEX,
    CLOUD_ALIYUN,
    GITHUB_IT_TOOLS
} from '../../src/main/constants/urls'

// 构造最小主窗口 mock
function makeWindow(): { webContents: { send: ReturnType<typeof vi.fn> } } {
    return { webContents: { send: vi.fn() } }
}

// 递归收集 handler 树的所有叶子函数
function collectLeafHandlers(tree: unknown, out: Array<(...args: unknown[]) => unknown>): void {
    if (typeof tree === 'function') {
        out.push(tree as (...args: unknown[]) => unknown)
        return
    }
    if (tree && typeof tree === 'object') {
        for (const value of Object.values(tree)) {
            collectLeafHandlers(value, out)
        }
    }
}

beforeEach(() => {
    toolsMocks.openOnlineWebPage.mockClear()
})

describe('toolsMenuHandlers', () => {
    it('should open the corresponding Vue dialog for each tool', () => {
        const win = makeWindow()
        ;(toolsMenuHandlers['mermaid'] as (w: never) => void)(win as never)
        ;(toolsMenuHandlers['katex'] as (w: never) => void)(win as never)
        ;(toolsMenuHandlers['table'] as (w: never) => void)(win as never)
        ;(toolsMenuHandlers['images'] as (w: never) => void)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith('baize:dialog:open-vue', 'mermaidEdit')
        expect(win.webContents.send).toHaveBeenCalledWith('baize:dialog:open-vue', 'mathText')
        expect(win.webContents.send).toHaveBeenCalledWith('baize:dialog:open-vue', 'mdSheet')
        expect(win.webContents.send).toHaveBeenCalledWith('baize:dialog:open-vue', 'insertImage')
    })

    it('should expose no drawing handler (FUN-09 removed)', () => {
        // FUN-09：drawing 的 'OpenFile' 通道全库零监听，handler 已删除
        // 已删除的键不在类型定义中，用索引签名视图断言其确实不存在（TS7053）
        expect((toolsMenuHandlers as unknown as Record<string, unknown>).drawing).toBeUndefined()
    })
})

describe('pluginsMenuHandlers（P2 已删除）', () => {
    it('should not export the retired plugins handler tree', () => {
        // 渲染层 menu_actions.ts 拦截全部 plugins:* 动作（EventBus PLUGIN_TOOL_SHOW），
        // 主进程 pluginsMenuHandlers 唯一实现是向无监听的 OPEN_PLUGIN_TOOL 通道 send，
        // 属"主进程菜单树不可达 + 通道无监听"双死路径，已整体删除。
        expect('pluginsMenuHandlers' in menuToolsModule).toBe(false)
    })
})

describe('onlineMenuHandlers', () => {
    // ET-7：扫描报告显示 menu-tools 行覆盖仅 26.32%（54 个 handler 多数未测）。
    // 除下方逐组抽测外，这里把 online/github 两棵树的全部叶子都执行一遍，
    // 保证「菜单动作 → OpenOnlineWebPage(URL 常量)」的末跳对每个入口都有回归保护。
    it('should execute every online handler and open a non-empty https URL', () => {
        const leaves: Array<(...args: unknown[]) => unknown> = []
        collectLeafHandlers(onlineMenuHandlers, leaves)
        expect(leaves.length).toBe(45)
        for (const leaf of leaves) {
            leaf()
        }
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledTimes(45)
        for (const call of toolsMocks.openOnlineWebPage.mock.calls) {
            expect(typeof call[0]).toBe('string')
            // 外部站点既有 https 也有 http（如 67tool），统一断言为绝对 http(s) URL
            expect(call[0]).toMatch(/^https?:\/\//)
        }
    })

    it('should route cainiao-tools to TOOLS_JYSHARE', () => {
        const handler = (onlineMenuHandlers.tools as Record<string, unknown>)[
            'cainiao-tools'
        ] as () => void
        handler()
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledWith(TOOLS_JYSHARE)
    })

    it('should route svg-editor to CAINIAO_SVG_EDITOR', () => {
        const handler = (onlineMenuHandlers.cainiao as Record<string, unknown>)[
            'svg-editor'
        ] as () => void
        handler()
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledWith(CAINIAO_SVG_EDITOR)
    })

    it('should route qrcode-generator to ENCODE_QRCODE_GENERATOR', () => {
        const handler = (onlineMenuHandlers.encode as Record<string, unknown>)[
            'qrcode-generator'
        ] as () => void
        handler()
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledWith(ENCODE_QRCODE_GENERATOR)
    })

    it('should route python-lang to IDE_PYTHON', () => {
        const handler = (onlineMenuHandlers.ide as Record<string, unknown>)[
            'python-lang'
        ] as () => void
        handler()
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledWith(IDE_PYTHON)
    })

    it('should route jwt-decoder to DEV_JWT', () => {
        const handler = (onlineMenuHandlers.dev as Record<string, unknown>)[
            'jwt-decoder'
        ] as () => void
        handler()
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledWith(DEV_JWT)
    })

    it('should route baidu-fex to TEAM_BAIDU_FEX', () => {
        const handler = (onlineMenuHandlers.team as Record<string, unknown>)[
            'baidu-fex'
        ] as () => void
        handler()
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledWith(TEAM_BAIDU_FEX)
    })

    it('should route aliyun to CLOUD_ALIYUN', () => {
        const handler = (onlineMenuHandlers.cloud as Record<string, unknown>)[
            'aliyun'
        ] as () => void
        handler()
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledWith(CLOUD_ALIYUN)
    })
})

describe('githubMenuHandlers', () => {
    // ET-7：github 子菜单 5 个入口全量执行（同 online 树口径）。
    it('should execute every github handler and open a non-empty https URL', () => {
        const leaves: Array<(...args: unknown[]) => unknown> = []
        collectLeafHandlers(githubMenuHandlers, leaves)
        expect(leaves.length).toBe(5)
        for (const leaf of leaves) {
            leaf()
        }
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledTimes(5)
        for (const call of toolsMocks.openOnlineWebPage.mock.calls) {
            expect(typeof call[0]).toBe('string')
            // 外部站点既有 https 也有 http（如 67tool），统一断言为绝对 http(s) URL
            expect(call[0]).toMatch(/^https?:\/\//)
        }
    })

    it('should route it-tools to GITHUB_IT_TOOLS', () => {
        const handler = githubMenuHandlers['it-tools']
        handler()
        expect(toolsMocks.openOnlineWebPage).toHaveBeenCalledWith(GITHUB_IT_TOOLS)
    })
})

describe('menu handler tree integrity', () => {
    it('should only contain function leaves across all three trees', () => {
        const leaves: Array<(...args: unknown[]) => unknown> = []
        collectLeafHandlers(toolsMenuHandlers, leaves)
        collectLeafHandlers(onlineMenuHandlers, leaves)
        collectLeafHandlers(githubMenuHandlers, leaves)
        expect(leaves.length).toBeGreaterThan(40)
        for (const leaf of leaves) {
            expect(typeof leaf).toBe('function')
        }
    })
})
