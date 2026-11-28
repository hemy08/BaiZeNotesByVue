import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// mock 依赖：配置 store 与事件总线；window.electron.ipcRenderer 通过 stubGlobal 提供
const {
    showDialogMock,
    emitMock,
    captureOpenMock,
    captureDisabledMock,
    clipNoteMock,
    clipEditorMock,
    clipDisabledMock,
    ocrInsertMock,
    ocrCopyMock,
    ocrDisabledMock,
    featureFlagsMock
} = vi.hoisted(() => ({
    showDialogMock: vi.fn(),
    emitMock: vi.fn(),
    // 1.5.2 E6：日常记录入口动作与能力开关（菜单动作执行前的开关校验）
    captureOpenMock: vi.fn(),
    captureDisabledMock: vi.fn(),
    // 1.5.2 E1：剪贴板剪藏入口动作与能力开关
    clipNoteMock: vi.fn(),
    clipEditorMock: vi.fn(),
    clipDisabledMock: vi.fn(),
    // 1.5.2 E3：图片 OCR 入口动作与能力开关
    ocrInsertMock: vi.fn(),
    ocrCopyMock: vi.fn(),
    ocrDisabledMock: vi.fn(),
    featureFlagsMock: { dailyNotes: false, clipCapture: false, imageOcr: false } as Record<
        string,
        boolean
    >
}))

vi.mock('@renderer/common/useConfigStore', () => ({
    getConfigStore: () => ({ showDialog: showDialogMock })
}))

vi.mock('@renderer/common/event-bus/event-bus', () => ({
    default: { $emit: emitMock }
}))

vi.mock('@renderer/common/capture-actions', () => ({
    openOrCreateCaptureEntry: captureOpenMock,
    showCaptureFeatureDisabled: captureDisabledMock
}))

vi.mock('@renderer/common/clip-capture-actions', () => ({
    captureClipToNote: clipNoteMock,
    captureClipToEditor: clipEditorMock,
    showClipCaptureFeatureDisabled: clipDisabledMock
}))

vi.mock('@renderer/common/ocr-actions', () => ({
    ocrClipboardToEditor: ocrInsertMock,
    ocrClipboardToClipboard: ocrCopyMock,
    showImageOcrFeatureDisabled: ocrDisabledMock
}))

vi.mock('@renderer/composables/useFeatureFlags', () => ({
    useFeatureFlags: () => ({
        flags: featureFlagsMock,
        isFeatureEnabled: (id: string) => featureFlagsMock[id] === true
    })
}))

import { HandleMenuAction } from '../../src/renderer/src/components/MenuBar/menu-actions'
import {
    menuMap,
    INITIALIZE_LLM_WIKI_MENU_ACTION,
    PLUGIN_SEARCH_MENU_ACTION
} from '../../src/renderer/src/components/MenuBar/menu-config'
import {
    GRAPH_DIALOG_MENU_ACTION,
    closeGraphDialogState,
    graphDialogState
} from '../../src/renderer/src/components/Graph/graph-dialog-state'
import {
    AI_ASSISTANT_DIALOG_MENU_ACTION,
    aiAssistantDialogState,
    closeAiAssistantDialogState
} from '../../src/renderer/src/components/dialogs/complex/ai-assistant-dialog-state'
import { translate } from '../../src/shared/i18n'
import * as Templates from '@renderer/common/templates'

const ipcSend = vi.fn()
const ipcInvoke = vi.fn()
const promptMock = vi.fn()
// 「文件」菜单 → 最近文件/最近文件夹：打开最近项经 window.api.file.openRecent（invoke 主进程）
const openRecentMock = vi.fn()

beforeEach(() => {
    showDialogMock.mockReset()
    emitMock.mockReset()
    captureOpenMock.mockReset()
    captureDisabledMock.mockReset()
    clipNoteMock.mockReset()
    clipEditorMock.mockReset()
    clipDisabledMock.mockReset()
    ocrInsertMock.mockReset()
    ocrCopyMock.mockReset()
    ocrDisabledMock.mockReset()
    featureFlagsMock.dailyNotes = false
    featureFlagsMock.clipCapture = false
    featureFlagsMock.imageOcr = false
    ipcSend.mockReset()
    ipcInvoke.mockReset()
    promptMock.mockReset()
    openRecentMock.mockReset()
    openRecentMock.mockResolvedValue({ ok: true })
    // 1.5.7 体验微调：模块级对话框显隐状态跨用例复位
    closeAiAssistantDialogState()
    vi.stubGlobal('window', {
        electron: { ipcRenderer: { send: ipcSend, invoke: ipcInvoke } },
        api: { file: { recentList: vi.fn(), openRecent: openRecentMock } },
        prompt: promptMock
    })
})

afterEach(() => {
    vi.unstubAllGlobals()
})

// 等待微任务队列清空（用于 file:new 的 Promise.then 回调）
function flushMicrotasks(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('HandleMenuAction', () => {
    describe('dialog actions', () => {
        it('should open theme settings dialog', () => {
            HandleMenuAction('baize:menu:setting:theme')
            expect(showDialogMock).toHaveBeenCalledWith('themeSettings')
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should open editor settings dialog', () => {
            // A-2/ARC-07：菜单实际 id 为 setting:monaco-editor，由渲染层直接接管
            HandleMenuAction('baize:menu:setting:monaco-editor')
            expect(showDialogMock).toHaveBeenCalledWith('editorSettings')
        })

        it('should open system settings dialog', () => {
            HandleMenuAction('baize:menu:setting:system')
            expect(showDialogMock).toHaveBeenCalledWith('systemSettings')
        })

        it('should open quick links dialog', () => {
            // A-2/ARC-07：菜单实际 id 为 setting:quick-link，由渲染层直接接管
            HandleMenuAction('baize:menu:setting:quick-link')
            expect(showDialogMock).toHaveBeenCalledWith('quickLinks')
        })

        it('should open math insert dialog', () => {
            HandleMenuAction('baize:menu:insert:math')
            expect(showDialogMock).toHaveBeenCalledWith('mathText')
        })

        it('should route table insertion to the unified table editor', async () => {
            // A-2/ARC-07：菜单实际 id 为 insert:md-table，由渲染层直接接管
            HandleMenuAction('baize:menu:insert:md-table')
            await new Promise((resolve) => setTimeout(resolve, 80))
            expect(showDialogMock).not.toHaveBeenCalledWith('mdSheet')
        })

        it('should open about dialog', () => {
            HandleMenuAction('baize:menu:help:about')
            expect(showDialogMock).toHaveBeenCalledWith('helpAbout')
        })

        it('should open import option dialog', () => {
            HandleMenuAction('baize:menu:file:import')
            expect(showDialogMock).toHaveBeenCalledWith('importOption')
        })

        // P1/C-06：contact 动作 id 与 menu-config 实际下发值统一，渲染层 Vue
        // HelpContactUsDialog 生效（不再漏到主进程的 JSDOM 联系对话框）
        it('should open the Vue contact dialog for the actual menu action id', () => {
            HandleMenuAction('baize:menu:help:contact-us')
            expect(showDialogMock).toHaveBeenCalledWith('helpContact')
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should keep the legacy contact action id as an alias', () => {
            HandleMenuAction('baize:menu:help:contact')
            expect(showDialogMock).toHaveBeenCalledWith('helpContact')
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should intercept every contact action declared in menu-config (C-06 regression)', () => {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (item.menuAction) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)
            const contactActions = actions.filter((action) => action.includes('help:contact'))
            expect(contactActions).toEqual(['baize:menu:help:contact-us'])
            for (const action of contactActions) {
                showDialogMock.mockReset()
                HandleMenuAction(action)
                expect(showDialogMock).toHaveBeenCalledWith('helpContact')
                expect(ipcSend).not.toHaveBeenCalled()
            }
        })
    })

    // mkdocs-material 扩展语法插入（15 项）：menu-config 的 Material 子组中除既有
    // material:admonition（继续走主进程 Vue 对话框链路）外的 15 个动作，均应由渲染层
    // 精确拦截并打开 materialSyntax 对话框，第二参 { preset: featureId } 指明语法类型。
    describe('material syntax actions', () => {
        const MATERIAL_FEATURE_IDS = [
            'collapsible',
            'task-list',
            'highlight',
            'insert-delete',
            'sup-sub',
            'keys',
            'attr-list',
            'footnote',
            'definition-list',
            'grid-cards',
            'code-block',
            'icon',
            'blocks',
            'snippet',
            'tab-link'
        ]

        it.each(MATERIAL_FEATURE_IDS)(
            'should open materialSyntax dialog with preset %s',
            (featureId) => {
                HandleMenuAction(`baize:menu:insert:material:${featureId}`)
                expect(showDialogMock).toHaveBeenCalledTimes(1)
                expect(showDialogMock).toHaveBeenCalledWith('materialSyntax', { preset: featureId })
                expect(emitMock).not.toHaveBeenCalled()
                expect(ipcSend).not.toHaveBeenCalled()
            }
        )

        it('should keep the legacy material admonition action on the main-process path', () => {
            HandleMenuAction('baize:menu:insert:material:admonition')
            expect(showDialogMock).not.toHaveBeenCalled()
            expect(emitMock).not.toHaveBeenCalled()
            expect(ipcSend).toHaveBeenCalledWith(
                'baize:menu:action',
                'baize:menu:insert:material:admonition'
            )
        })

        // 精确匹配：仅前缀相同但 featureId 带后缀的动作不得被拦截（防止误吞未来新增动作）
        it('should only intercept exact material syntax action ids', () => {
            HandleMenuAction('baize:menu:insert:material:collapsible:extra')
            expect(showDialogMock).not.toHaveBeenCalled()
            expect(ipcSend).toHaveBeenCalledWith(
                'baize:menu:action',
                'baize:menu:insert:material:collapsible:extra'
            )
        })

        // 三处一致性：menu-config 下发的每个 material 动作（除 admonition）都被渲染层接管，
        // 且 preset 与动作 id 的 <featureId> 段一致。
        it('should intercept every material action declared in menu-config', () => {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (item.menuAction) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)

            const materialActions = actions.filter(
                (action) =>
                    action.startsWith('baize:menu:insert:material:') &&
                    action !== 'baize:menu:insert:material:admonition'
            )
            expect(materialActions).toHaveLength(15)
            for (const action of materialActions) {
                ipcSend.mockReset()
                showDialogMock.mockReset()
                emitMock.mockReset()
                HandleMenuAction(action)
                expect(showDialogMock).toHaveBeenCalledWith('materialSyntax', {
                    preset: action.slice('baize:menu:insert:material:'.length)
                })
                expect(ipcSend).not.toHaveBeenCalled()
            }
        })
    })

    describe('file new action', () => {
        it('should pass current file path as default directory on success', async () => {
            ipcInvoke.mockResolvedValue('C:\\docs\\note.md')
            HandleMenuAction('baize:menu:file:new')
            await flushMicrotasks()
            expect(ipcInvoke).toHaveBeenCalledWith('baize:file:get-current-path')
            expect(showDialogMock).toHaveBeenCalledWith('createFileFolder', {
                dirPath: 'C:\\docs\\note.md'
            })
        })

        it('should fall back to empty dirPath when invoke rejects', async () => {
            ipcInvoke.mockRejectedValue(new Error('no file open'))
            HandleMenuAction('baize:menu:file:new')
            await flushMicrotasks()
            expect(showDialogMock).toHaveBeenCalledWith('createFileFolder', { dirPath: '' })
        })
    })

    describe('plugin actions', () => {
        it('should emit plugin-tools-show for plugin menu actions', () => {
            HandleMenuAction('baize:menu:plugins:encrypt:token-generator')
            expect(emitMock).toHaveBeenCalledWith(
                'plugin-tools-show',
                'baize:menu:plugins:encrypt:token-generator'
            )
            expect(showDialogMock).not.toHaveBeenCalled()
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should emit plugin-tools-show for net plugin actions', () => {
            HandleMenuAction('baize:menu:plugins:net:ipv4-subnet-calculator')
            expect(emitMock).toHaveBeenCalledWith(
                'plugin-tools-show',
                'baize:menu:plugins:net:ipv4-subnet-calculator'
            )
        })

        // 1.5.6「插件 → 插件搜索」：动作 id 也以插件前缀开头，必须在通用前缀拦截之前
        // 精确命中并发 PLUGIN_SEARCH_SHOW（打开面板搜索入口视图），不能误发工具显示事件。
        it('should emit plugin-search-show for the plugin search entry (not a tool action)', () => {
            HandleMenuAction(PLUGIN_SEARCH_MENU_ACTION)
            expect(emitMock).toHaveBeenCalledTimes(1)
            expect(emitMock).toHaveBeenCalledWith('plugin-search-show')
            // 不得被当作工具动作（'...:search' 不在 38 项注册表中，会形成死入口/脏最近记录）
            expect(emitMock).not.toHaveBeenCalledWith(
                'plugin-tools-show',
                PLUGIN_SEARCH_MENU_ACTION
            )
            expect(showDialogMock).not.toHaveBeenCalled()
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('menu-config 声明的插件搜索动作均被渲染层拦截（菜单树 ↔ 动作分发一致）', () => {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (item.menuAction?.startsWith('baize:menu:plugins:search')) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)
            expect(actions).toEqual([PLUGIN_SEARCH_MENU_ACTION])

            for (const action of actions) {
                emitMock.mockReset()
                ipcSend.mockReset()
                HandleMenuAction(action)
                expect(emitMock).toHaveBeenCalledWith('plugin-search-show')
                expect(ipcSend).not.toHaveBeenCalled()
            }
        })
    })

    describe('template actions', () => {
        it('should emit insert-text for mermaid template actions', () => {
            const template = Templates.Mermaid.find(
                (item) => item.menuAction === 'baize:menu:insert:mermaid:flowchart'
            )
            HandleMenuAction('baize:menu:insert:mermaid:flowchart')
            expect(emitMock).toHaveBeenCalledWith(
                'baize:notes:monaco-editor:insert-text',
                template?.context
            )
        })

        it('should emit insert-text with undefined context for unknown mermaid actions', () => {
            HandleMenuAction('baize:menu:insert:mermaid:not-exist')
            expect(emitMock).toHaveBeenCalledWith(
                'baize:notes:monaco-editor:insert-text',
                undefined
            )
        })

        it('should emit insert-text for textblock template actions', () => {
            const template = Templates.TextBlock.find(
                (item) => item.menuAction === 'baize:menu:insert:textblock:blockcode'
            )
            HandleMenuAction('baize:menu:insert:textblock:blockcode')
            expect(emitMock).toHaveBeenCalledWith(
                'baize:notes:monaco-editor:insert-text',
                template?.context
            )
        })

        it('should emit monaco-editor-use-template for writing template actions', () => {
            const template = Templates.Writing.find(
                (item) => item.menuAction === 'baize:menu:insert:writing:leetcode'
            )
            HandleMenuAction('baize:menu:insert:writing:leetcode')
            expect(emitMock).toHaveBeenCalledWith(
                'baize:monaco-editor-use-template',
                template?.context
            )
        })

        it('should emit insert-text for plantuml template actions', () => {
            const template = Templates.PlantUML.find(
                (item) => item.menuAction === 'baize:menu:insert:plantuml:basic'
            )
            HandleMenuAction('baize:menu:insert:plantuml:basic')
            expect(emitMock).toHaveBeenCalledWith(
                'baize:notes:monaco-editor:insert-text',
                template?.context
            )
        })
    })

    // 「文件」菜单 → 最近文件/最近文件夹（MenuBar.vue 打开菜单时按最近列表动态生成动作）
    // 动作 id：baize:menu:file:recent-file:<encodeURIComponent(path)> / recent-folder:...
    describe('recent files/folders actions', () => {
        const recentFile = 'C:\\docs\\最近笔记 a.md'
        const recentFolder = 'D:\\工作区\\项目'

        it('should invoke openRecent with the decoded file path (not forward to MENU.ACTION)', async () => {
            HandleMenuAction(`baize:menu:file:recent-file:${encodeURIComponent(recentFile)}`)
            expect(openRecentMock).toHaveBeenCalledWith({ kind: 'file', path: recentFile })
            await flushMicrotasks()
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should invoke openRecent with the decoded folder path', async () => {
            HandleMenuAction(`baize:menu:file:recent-folder:${encodeURIComponent(recentFolder)}`)
            expect(openRecentMock).toHaveBeenCalledWith({ kind: 'folder', path: recentFolder })
            await flushMicrotasks()
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should not send a renderer→main status bar message on open failure (main process reports)', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
            openRecentMock.mockResolvedValue({
                ok: false,
                message: '最近列表已变化，目标不存在'
            })
            HandleMenuAction(`baize:menu:file:recent-file:${encodeURIComponent(recentFile)}`)
            await flushMicrotasks()
            // 用户可见提示由主进程 failRecentOpen 经 STATUS_BAR_UPDATE（M→R）下发；
            // 渲染层不再反向 send（该方向无主进程监听，2026-11-18 随死通道清理删除）
            expect(ipcSend).not.toHaveBeenCalled()
            expect(warnSpy).toHaveBeenCalled()
            warnSpy.mockRestore()
        })

        it('should not report anything when opening succeeds', async () => {
            openRecentMock.mockResolvedValue({ ok: true })
            HandleMenuAction(`baize:menu:file:recent-folder:${encodeURIComponent(recentFolder)}`)
            await flushMicrotasks()
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should swallow invoke rejections without throwing', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            openRecentMock.mockRejectedValue(new Error('ipc broken'))
            expect(() =>
                HandleMenuAction(`baize:menu:file:recent-file:${encodeURIComponent(recentFile)}`)
            ).not.toThrow()
            await flushMicrotasks()
            expect(consoleError).toHaveBeenCalled()
            consoleError.mockRestore()
        })

        it('should ignore malformed encoded paths', () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            HandleMenuAction('baize:menu:file:recent-file:%E0%A4%A')
            expect(openRecentMock).not.toHaveBeenCalled()
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should not intercept lookalike actions (prefix must be exact)', () => {
            HandleMenuAction('baize:menu:file:recent-other:abc')
            expect(openRecentMock).not.toHaveBeenCalled()
            expect(ipcSend).toHaveBeenCalledWith(
                'baize:menu:action',
                'baize:menu:file:recent-other:abc'
            )
        })
    })

    describe('fallback actions', () => {
        it('should forward unknown actions to the main process via IPC', () => {
            HandleMenuAction('baize:menu:file:save')
            expect(ipcSend).toHaveBeenCalledWith('baize:menu:action', 'baize:menu:file:save')
            expect(showDialogMock).not.toHaveBeenCalled()
            expect(emitMock).not.toHaveBeenCalled()
        })

        // task-50：AI 导航动作与 online:* 一致——渲染层没有任何 ai:* 前缀拦截分支，
        // 必须原样经 IPC.MENU.ACTION 交主进程 menu-handle.ts 的 ai 子树处理（未新增 IPC 通道）。
        it('should forward every AI navigation action to the main process (not intercepted)', () => {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (item.menuAction?.startsWith('baize:menu:ai:')) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)

            expect(actions).toHaveLength(70)
            for (const action of actions) {
                ipcSend.mockReset()
                showDialogMock.mockReset()
                emitMock.mockReset()
                HandleMenuAction(action)
                expect(showDialogMock).not.toHaveBeenCalled()
                expect(emitMock).not.toHaveBeenCalled()
                expect(ipcSend).toHaveBeenCalledWith('baize:menu:action', action)
            }
        })
    })

    describe('editor interaction actions (FUN-09)', () => {
        it('should emit editor-toggle-fold with fold-all mode', () => {
            HandleMenuAction('baize:menu:view:fold:all-fold')
            expect(emitMock).toHaveBeenCalledWith('editor-toggle-fold', { mode: 'fold-all' })
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should emit editor-toggle-fold with expand-all mode', () => {
            HandleMenuAction('baize:menu:view:fold:all-expand')
            expect(emitMock).toHaveBeenCalledWith('editor-toggle-fold', { mode: 'expand-all' })
        })

        it('should emit editor-toggle-fold with fold-level mode and parsed level', () => {
            HandleMenuAction('baize:menu:view:fold:level3')
            expect(emitMock).toHaveBeenCalledWith('editor-toggle-fold', {
                mode: 'fold-level',
                level: 3
            })
        })

        it('should emit editor-toggle-outline for the outline toggle', () => {
            HandleMenuAction('baize:menu:view:toggle-outline')
            expect(emitMock).toHaveBeenCalledWith('editor-toggle-outline')
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should emit editor-trigger-find without payload for find-in-file', () => {
            HandleMenuAction('baize:menu:edit:find-in-file')
            expect(emitMock).toHaveBeenCalledWith('editor-trigger-find')
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should emit editor-trigger-find with replace mode for replace-in-file', () => {
            HandleMenuAction('baize:menu:edit:replace-in-file')
            expect(emitMock).toHaveBeenCalledWith('editor-trigger-find', { mode: 'replace' })
        })

        // alert/prompt 应用内化批次：菜单「跳转到行」不再使用 window.prompt 收集行号，
        // 改为发无 payload 事件，由编辑器唤起 Monaco 原生「跳转到行」快捷输入
        //（editor.action.gotoLine，自带行号输入与校验）；菜单动作语义与可用性不变。
        it('should emit editor-jump-line without payload for the menu fallback path', () => {
            HandleMenuAction('baize:menu:edit:go-line')
            expect(emitMock).toHaveBeenCalledWith('editor-jump-line')
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should not use the browser window.prompt for go-line', () => {
            HandleMenuAction('baize:menu:edit:go-line')
            expect(promptMock).not.toHaveBeenCalled()
        })

        it('should insert the mermaid basic framework for the mermaid drawing tool', () => {
            const template = Templates.Mermaid.find(
                (item) => item.menuAction === 'baize:menu:insert:mermaid:basic'
            )
            HandleMenuAction('baize:menu:tools:drawing:mermaid')
            expect(emitMock).toHaveBeenCalledWith(
                'baize:notes:monaco-editor:insert-text',
                template?.context
            )
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('should insert the plantuml basic framework for the plantuml drawing tool', () => {
            const template = Templates.PlantUML.find(
                (item) => item.menuAction === 'baize:menu:insert:plantuml:basic'
            )
            HandleMenuAction('baize:menu:tools:drawing:plantuml')
            expect(emitMock).toHaveBeenCalledWith(
                'baize:notes:monaco-editor:insert-text',
                template?.context
            )
        })
    })

    // 1.5.2 E6：工具菜单 → 今日日记 / 快速收件箱（可选能力 featureDailyNotes，默认关闭）
    describe('daily entries actions (E6)', () => {
        /** 递归收集菜单树中 E6 动作 id */
        function collectCaptureActions(): string[] {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (
                        item.menuAction === 'baize:menu:tools:daily-note' ||
                        item.menuAction === 'baize:menu:tools:inbox-capture'
                    ) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)
            return actions
        }

        it('开关关闭时提示开启，不调用主进程通道（不产生任何文件行为）', () => {
            HandleMenuAction('baize:menu:tools:daily-note')
            HandleMenuAction('baize:menu:tools:inbox-capture')

            expect(captureDisabledMock).toHaveBeenCalledTimes(2)
            expect(captureOpenMock).not.toHaveBeenCalled()
            expect(ipcSend).not.toHaveBeenCalled()
            expect(showDialogMock).not.toHaveBeenCalled()
        })

        it('开关开启后分别以 daily / inbox 调用统一入口，不转发 MENU.ACTION', () => {
            featureFlagsMock.dailyNotes = true

            HandleMenuAction('baize:menu:tools:daily-note')
            HandleMenuAction('baize:menu:tools:inbox-capture')

            expect(captureDisabledMock).not.toHaveBeenCalled()
            expect(captureOpenMock).toHaveBeenNthCalledWith(1, 'daily')
            expect(captureOpenMock).toHaveBeenNthCalledWith(2, 'inbox')
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('menu-config 声明的日常记录动作均在渲染层被拦截（菜单树 ↔ 动作分发一致）', () => {
            const actions = collectCaptureActions()
            expect(actions).toEqual([
                'baize:menu:tools:daily-note',
                'baize:menu:tools:inbox-capture'
            ])

            featureFlagsMock.dailyNotes = true
            for (const action of actions) {
                captureOpenMock.mockReset()
                ipcSend.mockReset()
                HandleMenuAction(action)
                expect(captureOpenMock).toHaveBeenCalledTimes(1)
                expect(ipcSend).not.toHaveBeenCalled()
            }
        })
    })

    // 1.5.2 E1：工具菜单 → 剪贴板剪藏（新笔记 / 插入当前笔记，可选能力 featureClipCapture 默认关闭）
    describe('clip capture actions (E1)', () => {
        /** 递归收集菜单树中 E1 动作 id */
        function collectClipActions(): string[] {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (
                        item.menuAction === 'baize:menu:tools:clip-to-note' ||
                        item.menuAction === 'baize:menu:tools:clip-to-editor'
                    ) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)
            return actions
        }

        it('开关关闭时提示开启，不读取剪贴板/不调用剪藏入口', () => {
            HandleMenuAction('baize:menu:tools:clip-to-note')
            HandleMenuAction('baize:menu:tools:clip-to-editor')

            expect(clipDisabledMock).toHaveBeenCalledTimes(2)
            expect(clipNoteMock).not.toHaveBeenCalled()
            expect(clipEditorMock).not.toHaveBeenCalled()
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('开关开启后分别调用「新笔记 / 插入当前笔记」入口，不转发 MENU.ACTION', () => {
            featureFlagsMock.clipCapture = true

            HandleMenuAction('baize:menu:tools:clip-to-note')
            HandleMenuAction('baize:menu:tools:clip-to-editor')

            expect(clipDisabledMock).not.toHaveBeenCalled()
            expect(clipNoteMock).toHaveBeenCalledTimes(1)
            expect(clipEditorMock).toHaveBeenCalledTimes(1)
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('menu-config 声明的剪藏动作均在渲染层被拦截（菜单树 ↔ 动作分发一致）', () => {
            const actions = collectClipActions()
            expect(actions).toEqual([
                'baize:menu:tools:clip-to-note',
                'baize:menu:tools:clip-to-editor'
            ])

            featureFlagsMock.clipCapture = true
            for (const action of actions) {
                clipNoteMock.mockReset()
                clipEditorMock.mockReset()
                ipcSend.mockReset()
                HandleMenuAction(action)
                expect(clipNoteMock.mock.calls.length + clipEditorMock.mock.calls.length).toBe(1)
                expect(ipcSend).not.toHaveBeenCalled()
            }
        })
    })

    // 1.5.2 E3：工具菜单 → 图片 OCR（插入当前笔记 / 复制到剪贴板，可选能力 featureImageOcr 默认关闭）
    describe('image OCR actions (E3)', () => {
        /** 递归收集菜单树中 E3 动作 id */
        function collectOcrActions(): string[] {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (
                        item.menuAction === 'baize:menu:tools:ocr-insert' ||
                        item.menuAction === 'baize:menu:tools:ocr-copy'
                    ) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)
            return actions
        }

        it('开关关闭时提示开启，不读取剪贴板/不调用 OCR 入口/不转发主进程', () => {
            HandleMenuAction('baize:menu:tools:ocr-insert')
            HandleMenuAction('baize:menu:tools:ocr-copy')

            expect(ocrDisabledMock).toHaveBeenCalledTimes(2)
            expect(ocrInsertMock).not.toHaveBeenCalled()
            expect(ocrCopyMock).not.toHaveBeenCalled()
            expect(ipcSend).not.toHaveBeenCalled()
            expect(showDialogMock).not.toHaveBeenCalled()
        })

        it('开关开启后分别调用「插入当前笔记 / 复制到剪贴板」入口，不转发 MENU.ACTION', () => {
            featureFlagsMock.imageOcr = true

            HandleMenuAction('baize:menu:tools:ocr-insert')
            HandleMenuAction('baize:menu:tools:ocr-copy')

            expect(ocrDisabledMock).not.toHaveBeenCalled()
            expect(ocrInsertMock).toHaveBeenCalledTimes(1)
            expect(ocrCopyMock).toHaveBeenCalledTimes(1)
            expect(ipcSend).not.toHaveBeenCalled()
        })

        it('menu-config 声明的 OCR 动作均在渲染层被拦截（菜单树 ↔ 动作分发一致）', () => {
            const actions = collectOcrActions()
            expect(actions).toEqual(['baize:menu:tools:ocr-insert', 'baize:menu:tools:ocr-copy'])

            featureFlagsMock.imageOcr = true
            for (const action of actions) {
                ocrInsertMock.mockReset()
                ocrCopyMock.mockReset()
                ipcSend.mockReset()
                HandleMenuAction(action)
                expect(ocrInsertMock.mock.calls.length + ocrCopyMock.mock.calls.length).toBe(1)
                expect(ipcSend).not.toHaveBeenCalled()
            }
        })
    })

    // 1.5.7 LLM Wiki L1：文件 → 初始化 LLM Wiki（渲染层精确拦截 → 主进程白名单 invoke 通道）
    describe('initialize LLM Wiki action (L1)', () => {
        /** 递归收集菜单树中「初始化 LLM Wiki」动作 id */
        function collectInitializeActions(): string[] {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (item.menuAction === INITIALIZE_LLM_WIKI_MENU_ACTION) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)
            return actions
        }

        it('精确拦截：invoke 白名单通道，不转发主进程 MENU.ACTION，成功提示可见', async () => {
            ipcInvoke.mockResolvedValue({ success: true })
            HandleMenuAction(INITIALIZE_LLM_WIKI_MENU_ACTION)
            await flushMicrotasks()

            expect(ipcInvoke).toHaveBeenCalledTimes(1)
            expect(ipcInvoke).toHaveBeenCalledWith('baize:file:initialize-llm-wiki')
            // 不向主进程转发 IPC.MENU.ACTION（主进程无该菜单动作处理器）
            expect(ipcSend).not.toHaveBeenCalled()
            expect(showDialogMock).toHaveBeenCalledWith('success', {
                title: translate('menu.file.initializeLlmWiki', 'zh-CN'),
                message: translate(
                    'dialogRenderer.systemSetting.features.workspaceModeInitSuccess',
                    'zh-CN'
                )
            })
        })

        it('主进程返回 success=false：展示含原因的失败提示，不抛异常', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            const reason = '尚未打开工作区，无法初始化 LLM Wiki。'
            ipcInvoke.mockResolvedValue({ success: false, error: reason })
            HandleMenuAction(INITIALIZE_LLM_WIKI_MENU_ACTION)
            await flushMicrotasks()

            expect(ipcSend).not.toHaveBeenCalled()
            expect(errorSpy).toHaveBeenCalled()
            expect(showDialogMock).toHaveBeenCalledWith('error', {
                title: translate('menu.file.initializeLlmWiki', 'zh-CN'),
                message: translate(
                    'dialogRenderer.systemSetting.features.workspaceModeInitFailed',
                    'zh-CN',
                    { error: reason }
                )
            })
        })

        it('menu-config 声明的初始化动作与拦截常量一致（菜单树 ↔ 动作分发单真源）', () => {
            expect(collectInitializeActions()).toEqual([INITIALIZE_LLM_WIKI_MENU_ACTION])
            // 动作 id 沿用 baize:<domain>:<name> 三段式（不占用 baize:menu: 前缀）
            expect(INITIALIZE_LLM_WIKI_MENU_ACTION).toBe('baize:file:initialize-llm-wiki')
            expect(INITIALIZE_LLM_WIKI_MENU_ACTION).not.toContain('baize:menu:')
        })
    })

    // 1.5.7 LLM Wiki L4：视图 → 关系图谱（纯渲染层对话框，不转发主进程 MENU.ACTION）
    describe('relationship graph action (L4)', () => {
        it('精确拦截：只切渲染层对话框状态，不转发 MENU.ACTION、不弹其他对话框', () => {
            closeGraphDialogState()
            HandleMenuAction(GRAPH_DIALOG_MENU_ACTION)
            expect(graphDialogState.visible).toBe(true)
            expect(ipcSend).not.toHaveBeenCalled()
            expect(showDialogMock).not.toHaveBeenCalled()
            // 关闭后可再次打开（幂等切换显隐）
            closeGraphDialogState()
            expect(graphDialogState.visible).toBe(false)
            HandleMenuAction(GRAPH_DIALOG_MENU_ACTION)
            expect(graphDialogState.visible).toBe(true)
            closeGraphDialogState()
        })

        it('menu-config 声明的图谱动作与拦截常量一致（菜单树 ↔ 动作分发单真源）', () => {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (item.menuAction === GRAPH_DIALOG_MENU_ACTION) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)
            expect(actions).toEqual([GRAPH_DIALOG_MENU_ACTION])
            expect(GRAPH_DIALOG_MENU_ACTION).toBe('baize:menu:view:graph')
        })
    })

    // 1.5.7 体验微调（用户反馈 2026-11-28）：设置 → AI 助手（纯渲染层独立对话框）
    describe('AI assistant action (1.5.7 user feedback)', () => {
        it('精确拦截：只切渲染层对话框状态，不转发 MENU.ACTION、不弹其它对话框', () => {
            closeAiAssistantDialogState()
            HandleMenuAction(AI_ASSISTANT_DIALOG_MENU_ACTION)
            expect(aiAssistantDialogState.visible).toBe(true)
            expect(ipcSend).not.toHaveBeenCalled()
            expect(showDialogMock).not.toHaveBeenCalled()
            expect(emitMock).not.toHaveBeenCalled()
            // 关闭后可再次打开（幂等切显隐）
            closeAiAssistantDialogState()
            expect(aiAssistantDialogState.visible).toBe(false)
            HandleMenuAction(AI_ASSISTANT_DIALOG_MENU_ACTION)
            expect(aiAssistantDialogState.visible).toBe(true)
            closeAiAssistantDialogState()
        })

        it('menu-config 声明的 AI 助手动作与拦截常量一致（菜单树 ↔ 动作分发单真源）', () => {
            const actions: string[] = []
            const walk = (items: unknown[]): void => {
                for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
                    if (item.menuAction === AI_ASSISTANT_DIALOG_MENU_ACTION) {
                        actions.push(item.menuAction)
                    }
                    if (item.submenu) {
                        walk(item.submenu)
                    }
                }
            }
            walk(menuMap.value)
            expect(actions).toEqual([AI_ASSISTANT_DIALOG_MENU_ACTION])
            expect(AI_ASSISTANT_DIALOG_MENU_ACTION).toBe('baize:menu:setting:ai-assistant')
        })
    })
})
