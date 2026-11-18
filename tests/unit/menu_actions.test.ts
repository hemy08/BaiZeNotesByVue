import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// mock 依赖：配置 store 与事件总线；window.electron.ipcRenderer 通过 stubGlobal 提供
const { showDialogMock, emitMock } = vi.hoisted(() => ({
    showDialogMock: vi.fn(),
    emitMock: vi.fn()
}))

vi.mock('@renderer/common/useConfigStore', () => ({
    getConfigStore: () => ({ showDialog: showDialogMock })
}))

vi.mock('@renderer/common/event-bus/event-bus', () => ({
    default: { $emit: emitMock }
}))

import { HandleMenuAction } from '../../src/renderer/src/components/MenuBar/menu-actions'
import { menuMap } from '../../src/renderer/src/components/MenuBar/menu-config'
import * as Templates from '@renderer/common/templates'

const ipcSend = vi.fn()
const ipcInvoke = vi.fn()
const promptMock = vi.fn()
// 「文件」菜单 → 最近文件/最近文件夹：打开最近项经 window.api.file.openRecent（invoke 主进程）
const openRecentMock = vi.fn()

beforeEach(() => {
    showDialogMock.mockReset()
    emitMock.mockReset()
    ipcSend.mockReset()
    ipcInvoke.mockReset()
    promptMock.mockReset()
    openRecentMock.mockReset()
    openRecentMock.mockResolvedValue({ ok: true })
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

        it('should open table insert dialog', () => {
            // A-2/ARC-07：菜单实际 id 为 insert:md-table，由渲染层直接接管
            HandleMenuAction('baize:menu:insert:md-table')
            expect(showDialogMock).toHaveBeenCalledWith('mdSheet')
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

        it('should emit editor-jump-line with the prompted line number', () => {
            promptMock.mockReturnValue('42')
            HandleMenuAction('baize:menu:edit:go-line')
            expect(emitMock).toHaveBeenCalledWith('editor-jump-line', { line: 42 })
        })

        it('should not emit editor-jump-line for an invalid line number', () => {
            promptMock.mockReturnValue('abc')
            HandleMenuAction('baize:menu:edit:go-line')
            expect(emitMock).not.toHaveBeenCalled()
        })

        it('should not emit editor-jump-line when the prompt is cancelled', () => {
            promptMock.mockReturnValue(null)
            HandleMenuAction('baize:menu:edit:go-line')
            expect(emitMock).not.toHaveBeenCalled()
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
})
