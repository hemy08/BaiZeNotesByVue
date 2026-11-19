/**
 * menu_handle.ts 单元测试
 * 覆盖：菜单动作解析与分发（顶层/深层路径）、未知动作告警、
 * A-2/ARC-07 已剔除 handler 不再路由、handler 抛错捕获
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const menuMocks = vi.hoisted(() => ({
    fileNewFile: vi.fn(),
    fileSave: vi.fn(),
    fileImportWord: vi.fn(),
    editUndo: vi.fn(),
    viewEditMode: vi.fn(),
    viewToggleWhitespace: vi.fn(),
    insertMdTable: vi.fn(),
    insertWebLink: vi.fn(),
    insertFromFileJson: vi.fn(),
    toolsMermaid: vi.fn(),
    onlineCainiaoTools: vi.fn(),
    aiChatgpt: vi.fn(),
    githubItTools: vi.fn(),
    helpAbout: vi.fn(),
    helpReleaseNotesV130: vi.fn(),
    helpReleaseNotesV122: vi.fn()
}))

vi.mock('../../src/main/ipc/menu-file', () => ({
    fileMenuHandlers: {
        'new-file': menuMocks.fileNewFile,
        save: menuMocks.fileSave,
        import: { word: menuMocks.fileImportWord }
    },
    codingMenuHandlers: {
        encoding: { utf8: vi.fn() },
        switch: { utf8: vi.fn() }
    }
}))

vi.mock('../../src/main/ipc/menu-edit', () => ({
    editMenuHandlers: { undo: menuMocks.editUndo }
}))

// P2：settingMenuHandlers / 'special-text' / plugins 子树已从主进程菜单树删除
vi.mock('../../src/main/ipc/menu-view', () => ({
    viewMenuHandlers: {
        'edit-mode': menuMocks.viewEditMode,
        'toggle-whitespace': menuMocks.viewToggleWhitespace
    },
    insertMenuHandlers: {
        'md-table': menuMocks.insertMdTable,
        'web-link': menuMocks.insertWebLink,
        'from-file': { json: menuMocks.insertFromFileJson }
    }
}))

vi.mock('../../src/main/ipc/menu-tools', () => ({
    toolsMenuHandlers: { mermaid: menuMocks.toolsMermaid },
    onlineMenuHandlers: { tools: { 'cainiao-tools': menuMocks.onlineCainiaoTools } },
    aiMenuHandlers: { hot: { chatgpt: menuMocks.aiChatgpt } },
    githubMenuHandlers: { 'it-tools': menuMocks.githubItTools }
}))

vi.mock('../../src/main/ipc/menu-help', () => ({
    helpMenuHandlers: {
        about: menuMocks.helpAbout,
        'release-notes': {
            'v1.3.0': menuMocks.helpReleaseNotesV130,
            'v1.2.2': menuMocks.helpReleaseNotesV122
        }
    }
}))

// FE-08：错误上报的翻译经动态 import('../utils/i18n.js') 加载（延迟加载避免
// 主进程启动早期拉入 config 链）。单测替换为桩：默认返回带参数的文案，
// 需要时再模拟翻译模块抛错，以覆盖「原始错误文案兜底」的 catch 分支。
const i18nMocks = vi.hoisted(() => ({ tMain: vi.fn() }))

vi.mock('../../src/main/utils/i18n.js', () => ({ tMain: i18nMocks.tMain }))

import { HandleBaiZeMenuAction } from '../../src/main/ipc/menu-handle'

function makeWindow(): Record<string, unknown> {
    return {}
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    for (const mock of Object.values(menuMocks)) {
        mock.mockClear()
    }
    i18nMocks.tMain.mockReset()
    i18nMocks.tMain.mockImplementation((key: string, params?: Record<string, string | number>) =>
        params?.message != null ? `${key}：${params.message}` : key
    )
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
})

describe('HandleBaiZeMenuAction routing', () => {
    it('should route a top-level file action to its handler with the window', () => {
        const win = makeWindow()
        HandleBaiZeMenuAction('baize:menu:file:new-file', win as never)
        expect(menuMocks.fileNewFile).toHaveBeenCalledWith(win)
        expect(menuMocks.fileSave).not.toHaveBeenCalled()
    })

    it('should route a versioned release-notes action', () => {
        HandleBaiZeMenuAction('baize:menu:help:release-notes:v1.2.2', {} as never)
        expect(menuMocks.helpReleaseNotesV122).toHaveBeenCalled()
    })

    it('should route the v1.3.0 release-notes action', () => {
        HandleBaiZeMenuAction('baize:menu:help:release-notes:v1.3.0', {} as never)
        expect(menuMocks.helpReleaseNotesV130).toHaveBeenCalled()
    })

    it('should route online and github actions', () => {
        HandleBaiZeMenuAction('baize:menu:online:tools:cainiao-tools', {} as never)
        HandleBaiZeMenuAction('baize:menu:github:it-tools', {} as never)
        expect(menuMocks.onlineCainiaoTools).toHaveBeenCalled()
        expect(menuMocks.githubItTools).toHaveBeenCalled()
    })

    // task-50：AI 导航域深度为 3（ai:<group>:<tool-id>），复用同一 IPC.MENU.ACTION 通道，
    // menu-handle 的 ai 子树按路径命中（未新增通道/未改解析器）。
    it('should route ai domain actions', () => {
        HandleBaiZeMenuAction('baize:menu:ai:hot:chatgpt', {} as never)
        expect(menuMocks.aiChatgpt).toHaveBeenCalled()
    })

    it('should route view toggle and from-file nested actions', () => {
        const win = makeWindow()
        HandleBaiZeMenuAction('baize:menu:view:toggle-whitespace', win as never)
        HandleBaiZeMenuAction('baize:menu:insert:from-file:json', win as never)
        expect(menuMocks.viewToggleWhitespace).toHaveBeenCalledWith(win)
        expect(menuMocks.insertFromFileJson).toHaveBeenCalledWith(win)
    })
})

describe('HandleBaiZeMenuAction fallbacks', () => {
    it('should warn for actions without the baize:menu: prefix', () => {
        HandleBaiZeMenuAction('not-a-menu-action', {} as never)
        expect(warnSpy).toHaveBeenCalled()
        expect(Object.values(menuMocks).some((mock) => mock.mock.calls.length > 0)).toBe(false)
    })

    it('should warn for unknown submenu actions', () => {
        HandleBaiZeMenuAction('baize:menu:file:not-exist', {} as never)
        expect(warnSpy).toHaveBeenCalledWith('Unknown menu action: ', 'baize:menu:file:not-exist')
        expect(menuMocks.fileNewFile).not.toHaveBeenCalled()
    })

    it('should not route the removed monaco-editor setting handler (ARC-07)', () => {
        HandleBaiZeMenuAction('baize:menu:setting:monaco-editor', {} as never)
        expect(warnSpy).toHaveBeenCalled()
    })

    it('should not route the removed quick-link setting handler (ARC-07)', () => {
        HandleBaiZeMenuAction('baize:menu:setting:quick-link', {} as never)
        expect(warnSpy).toHaveBeenCalled()
    })

    it('should not route the removed md-table insert handler (ARC-07)', () => {
        HandleBaiZeMenuAction('baize:menu:insert:md-table', {} as never)
        expect(menuMocks.insertMdTable).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
    })

    it('should not route the removed web-link insert handler (ARC-07)', () => {
        HandleBaiZeMenuAction('baize:menu:insert:web-link', {} as never)
        expect(menuMocks.insertWebLink).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
    })

    it('should warn for the retired setting:theme/system tree (P2 死代码清理)', () => {
        // 渲染层 menu_actions.ts 对全部 setting:* 动作优先拦截并打开 Vue 对话框，
        // 主进程 setting 子树（含对应 JSDOM 对话框）在本轮整体删除。
        HandleBaiZeMenuAction('baize:menu:setting:theme', {} as never)
        HandleBaiZeMenuAction('baize:menu:setting:system', {} as never)
        expect(warnSpy).toHaveBeenCalledTimes(2)
    })

    it('should warn for the retired plugins tree (P2 死代码清理)', () => {
        // 渲染层拦截全部 plugins:* 动作（EventBus PLUGIN_TOOL_SHOW），
        // 主进程 pluginsMenuHandlers 子树（唯一实现是死通道 send）已删除。
        HandleBaiZeMenuAction('baize:menu:plugins:encrypt:token-generator', {} as never)
        expect(warnSpy).toHaveBeenCalledWith(
            'Unknown menu action: ',
            'baize:menu:plugins:encrypt:token-generator'
        )
    })
})

describe('HandleBaiZeMenuAction error handling', () => {
    it('should catch and log handler exceptions without rethrowing', () => {
        menuMocks.fileNewFile.mockImplementation(() => {
            throw new Error('handler boom')
        })
        expect(() => HandleBaiZeMenuAction('baize:menu:file:new-file', {} as never)).not.toThrow()
        expect(errorSpy).toHaveBeenCalledWith(
            'Error executing menu action: ',
            'baize:menu:file:new-file',
            ', error: ',
            expect.any(Error)
        )
    })

    // FE-08：async 菜单 handler 的 rejected promise 必须被消费（原实现只 try/catch 同步异常，
    // 主进程会出现未处理 Promise 拒绝且无用户提示）；失败经状态栏通道提示，错误信息用原始文案兜底
    it('should consume async handler rejections and report them through the status bar (FE-08)', async () => {
        const send = vi.fn()
        const win = { webContents: { send }, isDestroyed: () => false }
        menuMocks.fileSave.mockRejectedValue(new Error('disk boom'))

        HandleBaiZeMenuAction('baize:menu:file:save', win as never)

        await vi.waitFor(() => {
            expect(send).toHaveBeenCalledWith(
                'baize:status-bar:update',
                expect.objectContaining({
                    type: 'error',
                    message: expect.stringContaining('disk boom')
                })
            )
        })
        expect(errorSpy).toHaveBeenCalledWith(
            'Error executing menu action: ',
            'baize:menu:file:save',
            ', error: ',
            expect.any(Error)
        )
    })

    it('should warn for an empty action string', () => {
        HandleBaiZeMenuAction('', {} as never)
        expect(warnSpy).toHaveBeenCalled()
    })
})

/**
 * ET-7：路由边界与 FE-08 错误上报的剩余分支。
 * menu-handle 的行覆盖此前 75.44%：findHandler 的「末段是子树」「叶子后还有多余段」
 * 两类失败路径，以及错误上报中的非 Error 值、"No active file" 专用文案、
 * 状态栏发送本身抛错（不得再抛）等兜底路径从未执行。
 */
describe('HandleBaiZeMenuAction 路由边界（ET-7）', () => {
    it('should route a nested import action to its leaf handler', () => {
        const win = makeWindow()
        HandleBaiZeMenuAction('baize:menu:file:import:word', win as never)
        expect(menuMocks.fileImportWord).toHaveBeenCalledWith(win)
    })

    it('should warn when the action ends at a submenu node instead of a handler', () => {
        HandleBaiZeMenuAction('baize:menu:file', {} as never)
        expect(warnSpy).toHaveBeenCalledWith('Unknown menu action: ', 'baize:menu:file')
    })

    it('should warn when a handler leaf is followed by extra path segments', () => {
        HandleBaiZeMenuAction('baize:menu:file:new-file:extra', {} as never)
        expect(warnSpy).toHaveBeenCalledWith(
            'Unknown menu action: ',
            'baize:menu:file:new-file:extra'
        )
        expect(menuMocks.fileNewFile).not.toHaveBeenCalled()
    })
})

describe('HandleBaiZeMenuAction 错误上报兜底（FE-08 / ET-7）', () => {
    it('should stringify non-Error rejections and fall back to the raw message when i18n fails', async () => {
        // 翻译模块抛错 → catch 分支回退到原始错误文案（不能因翻译失败丢失错误信息）
        i18nMocks.tMain.mockImplementation(() => {
            throw new Error('i18n down')
        })
        menuMocks.fileSave.mockRejectedValue('string boom')
        const send = vi.fn()
        const win = { webContents: { send }, isDestroyed: () => false }
        HandleBaiZeMenuAction('baize:menu:file:save', win as never)
        await vi.waitFor(() => {
            expect(send).toHaveBeenCalledWith(
                'baize:status-bar:update',
                expect.objectContaining({ type: 'error', message: 'string boom' })
            )
        })
    })

    it('should use the dedicated no-active-file i18n key for "No active file" errors', async () => {
        menuMocks.fileSave.mockRejectedValue(new Error('No active file'))
        const send = vi.fn()
        const win = { webContents: { send }, isDestroyed: () => false }
        HandleBaiZeMenuAction('baize:menu:file:save', win as never)
        await vi.waitFor(() => {
            expect(send).toHaveBeenCalledWith(
                'baize:status-bar:update',
                expect.objectContaining({
                    type: 'error',
                    message: 'mainMsg.status.noActiveFileSave'
                })
            )
        })
    })

    it('should fall back to the raw no-active-file message when i18n fails', async () => {
        i18nMocks.tMain.mockImplementation(() => {
            throw new Error('i18n down')
        })
        menuMocks.fileSave.mockRejectedValue(new Error('No active file'))
        const send = vi.fn()
        const win = { webContents: { send }, isDestroyed: () => false }
        HandleBaiZeMenuAction('baize:menu:file:save', win as never)
        await vi.waitFor(() => {
            expect(send).toHaveBeenCalledWith(
                'baize:status-bar:update',
                expect.objectContaining({ type: 'error', message: 'No active file' })
            )
        })
    })

    it('should not rethrow when reporting through the status bar itself fails', async () => {
        menuMocks.fileSave.mockRejectedValue(new Error('disk boom'))
        const send = vi.fn(() => {
            throw new Error('ipc channel dead')
        })
        const win = { webContents: { send }, isDestroyed: () => false }
        expect(() => HandleBaiZeMenuAction('baize:menu:file:save', win as never)).not.toThrow()
        await vi.waitFor(() => {
            // 4.4：发送失败由统一 helper 记日志（logger.error → console.error），不得再抛
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('状态栏消息发送失败'))
        })
    })

    it('should skip the status bar report for a destroyed window', async () => {
        menuMocks.fileSave.mockRejectedValue(new Error('disk boom'))
        const send = vi.fn()
        const win = { webContents: { send }, isDestroyed: () => true }
        HandleBaiZeMenuAction('baize:menu:file:save', win as never)
        // 等动态 import(i18n) → 上报链路完全落空后再断言未发送
        await new Promise((resolve) => setTimeout(resolve, 25))
        expect(send).not.toHaveBeenCalled()
    })
})
