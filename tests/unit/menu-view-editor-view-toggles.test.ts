/**
 * task-49：视图菜单「显示行号 / 显示空白字符」切换的持久化与 INIT_SETTING 一致性
 *
 * 修复前：menu-view 只向渲染层发 EDITOR.UPDATE_OPTIONS 做内存态切换，Monaco 下一次
 * 收到 INIT_SETTING（设置保存 / 备份恢复等广播）或 GET_SETTING 兜底时，会按
 * editorSetting 里的旧配置重新 updateOptions，把用户刚切换的状态覆盖回去。
 * 修复后：切换时把新值写回 editorSetting 唯一真源，并广播携带新值的 INIT_SETTING。
 *
 * 本文件覆盖：
 * 1. 菜单切换 → 写回 editor 配置（lineNumbers / renderWhitespace 两个方向）；
 * 2. INIT_SETTING 广播携带最新值，渲染层按值应用后与用户选择一致（不回退）；
 * 3. 持久化失败时不影响本次会话的内存态切换（仅记录日志）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const toolkitState = vi.hoisted(() => ({ is: { dev: true } }))
vi.mock('@electron-toolkit/utils', () => ({ is: toolkitState.is }))

// menu-view 静态引用文件导入模块：用替身隔离文件系统 / Electron 依赖链
vi.mock('../../src/main/utils/file-utils/import', () => ({ InsertImportFormFile: vi.fn() }))

// editorSetting 唯一真源的最小内存替身（真实模块会静态带入 electron-store/config 链，
// 在无 Electron 运行时的测试环境不可加载；映射逻辑本身由 editor-setting.test.ts 覆盖）
const editorSettingState = vi.hoisted(() => ({
    store: { lineNumbers: 'on', renderWhitespace: 'all' } as Record<string, unknown>,
    failNext: false
}))
vi.mock('../../src/main/config/editor-setting', () => ({
    getEditorSetting: () => {
        if (editorSettingState.failNext) {
            throw new Error('editor-setting unavailable')
        }
        return editorSettingState.store
    },
    saveEditorSetting: (next: Record<string, unknown>) => {
        if (editorSettingState.failNext) {
            throw new Error('editor-setting unavailable')
        }
        editorSettingState.store = next
    }
}))

// 渲染层 updateEditorOptions 只做纯数据映射（INIT_SETTING 的处理实现），
// 运行时不需要真实 monaco 实例，mock 掉包入口避免加载完整 ESM 依赖。
vi.mock('monaco-editor', () => ({ editor: {} }))

import { IPC } from '../../src/shared/ipc-channels'
import { viewMenuHandlers } from '../../src/main/ipc/menu-view'
import { updateEditorOptions } from '../../src/renderer/src/components/Markdown/editor-option-maps'

interface ToggleWindow {
    webContents: {
        send: ReturnType<typeof vi.fn>
        toggleDevTools: ReturnType<typeof vi.fn>
    }
}

function makeWindow(): ToggleWindow {
    return { webContents: { send: vi.fn(), toggleDevTools: vi.fn() } }
}

function invokeViewToggle(
    action: 'toggle-line-number' | 'toggle-whitespace',
    win: ToggleWindow
): void {
    ;(viewMenuHandlers[action] as (w: never) => void)(win as never)
}

/** 取最后一次 INIT_SETTING 广播的负载 */
function lastInitSetting(win: ToggleWindow): Record<string, unknown> | undefined {
    const calls = win.webContents.send.mock.calls.filter(
        ([channel]) => channel === IPC.EDITOR.INIT_SETTING
    )
    return calls.length > 0 ? (calls[calls.length - 1][1] as Record<string, unknown>) : undefined
}

beforeEach(() => {
    toolkitState.is.dev = true
    editorSettingState.store = { lineNumbers: 'on', renderWhitespace: 'all' }
    editorSettingState.failNext = false
})

describe('viewMenuHandlers 视图开关持久化（task-49）', () => {
    it('should persist lineNumbers=off and broadcast it via INIT_SETTING', async () => {
        const win = makeWindow()
        invokeViewToggle('toggle-line-number', win)

        // 1) 即时内存态切换照旧（Monaco 立即响应）
        expect(win.webContents.send).toHaveBeenCalledWith(IPC.EDITOR.UPDATE_OPTIONS, 'lineNumbers')
        // 2) 新值写回 editor 配置唯一真源
        await vi.waitFor(() => {
            expect(editorSettingState.store.lineNumbers).toBe('off')
        })
        // 3) INIT_SETTING 携带最新值（后续任何一次广播都不会把状态覆盖回 'on'）
        await vi.waitFor(() => {
            expect(lastInitSetting(win)).toMatchObject({
                lineNumbers: 'off',
                renderWhitespace: 'all'
            })
        })
        // 4) 其余配置字段原样保留（写回是合并而非重建）
        expect(editorSettingState.store).toMatchObject({ renderWhitespace: 'all' })
    })

    it('should toggle lineNumbers back on when the persisted config is off', async () => {
        editorSettingState.store = { lineNumbers: 'off', renderWhitespace: 'none' }
        const win = makeWindow()
        invokeViewToggle('toggle-line-number', win)

        await vi.waitFor(() => {
            expect(editorSettingState.store.lineNumbers).toBe('on')
        })
        expect(lastInitSetting(win)).toMatchObject({
            lineNumbers: 'on',
            renderWhitespace: 'none'
        })
    })

    it.each([
        ['all', 'none'],
        ['none', 'all'],
        ['boundary', 'all'],
        ['selection', 'all']
    ])('should persist renderWhitespace from %s to %s', async (current, expected) => {
        editorSettingState.store = { lineNumbers: 'on', renderWhitespace: current }
        const win = makeWindow()
        invokeViewToggle('toggle-whitespace', win)

        expect(win.webContents.send).toHaveBeenCalledWith(
            IPC.EDITOR.UPDATE_OPTIONS,
            'renderWhitespace'
        )
        await vi.waitFor(() => {
            expect(editorSettingState.store.renderWhitespace).toBe(expected)
        })
        expect(lastInitSetting(win)).toMatchObject({
            lineNumbers: 'on',
            renderWhitespace: expected
        })
    })

    it('should apply the broadcast INIT_SETTING to the same state as the user toggle (no revert)', async () => {
        const win = makeWindow()
        // 两次切换按用户实际操作顺序执行（每次都等待落盘完成，避免并发动态 import 的测试竞态）
        invokeViewToggle('toggle-line-number', win)
        await vi.waitFor(() => {
            expect(editorSettingState.store.lineNumbers).toBe('off')
        })
        invokeViewToggle('toggle-whitespace', win)

        await vi.waitFor(() => {
            expect(lastInitSetting(win)).toMatchObject({
                lineNumbers: 'off',
                renderWhitespace: 'none'
            })
        })

        // 模拟渲染层 MarkdownMonacoEditor.handleUpdateEditorOptions：
        // INIT_SETTING 负载按值应用，最终状态与菜单切换一致（不会回退成旧配置 on/all）
        const fakeEditor = { updateOptions: vi.fn() }
        updateEditorOptions(fakeEditor as never, lastInitSetting(win) as Record<string, unknown>)
        expect(fakeEditor.updateOptions).toHaveBeenCalledTimes(1)
        expect(fakeEditor.updateOptions).toHaveBeenCalledWith({
            lineNumbers: 'off',
            renderWhitespace: 'none'
        })
    })

    it('should keep the in-session toggle and log a warning when persistence fails', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        editorSettingState.failNext = true
        const win = makeWindow()

        expect(() => invokeViewToggle('toggle-line-number', win)).not.toThrow()
        expect(win.webContents.send).toHaveBeenCalledWith(IPC.EDITOR.UPDATE_OPTIONS, 'lineNumbers')
        await vi.waitFor(() => {
            expect(warnSpy).toHaveBeenCalledWith(
                '[Menu] 视图开关持久化失败（本次切换仅在当前会话生效）:',
                expect.any(Error)
            )
        })
        expect(lastInitSetting(win)).toBeUndefined()
        warnSpy.mockRestore()
    })
})
