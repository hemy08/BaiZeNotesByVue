// @vitest-environment jsdom
/**
 * 1.5.7 迁移批次：工作区模式切换 composable（迁移弹窗编排）。
 *
 * 覆盖：
 * 1. 弹窗状态：打开 / 取消 / 完成关闭 / busy 期间防重复；
 * 2. 完整切换链路：迁移（可选，`LLM_WIKI.MIGRATE`）→ 初始化 raw/ 与 wiki/ → 合并写系统配置
 *    （保留其它字段）→ 展开 AI 面板；调用顺序固定；
 * 3. 选择「不迁移」时跳过迁移调用；选择复制/移动时把 mode + formats 原样交给迁移动作；
 * 4. 迁移整批失败 / 初始化失败 / 写配置失败 / 异常 → 保持原模式并返回结构化失败（不抛异常）；
 * 5. 完成监听：成功才通知、取消订阅生效、监听器异常不影响切换结果；
 * 6. llm-wiki → traditional 直接写配置；测试复位接口。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    cancelWorkspaceModeSwitch,
    clearWorkspaceModeSwitchListenersForTesting,
    completeSwitchToLlmWiki,
    finishWorkspaceModeSwitch,
    onWorkspaceModeSwitchCompleted,
    requestSwitchToLlmWiki,
    resetWorkspaceModeSwitchForTesting,
    switchToTraditional,
    workspaceModeSwitchState
} from '../../../src/renderer/src/composables/useWorkspaceModeSwitch'
import {
    LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY,
    ensureLlmWikiAiPanelExpanded,
    llmWikiWorkbenchState,
    resetLlmWikiWorkbenchStateForTesting,
    setLlmWikiAiPanelCollapsed
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench'

const {
    initializeLlmWikiMock,
    runWorkspaceMigrationMock,
    reportActionFailureMock,
    describeActionErrorMock,
    loggerWarnMock
} = vi.hoisted(() => ({
    initializeLlmWikiMock: vi.fn(),
    runWorkspaceMigrationMock: vi.fn(),
    reportActionFailureMock: vi.fn(),
    describeActionErrorMock: vi.fn((error: unknown, fallback: string) => {
        if (error instanceof Error) {
            return error.message
        }
        return typeof error === 'string' && error.length > 0 ? error : fallback
    }),
    loggerWarnMock: vi.fn()
}))

vi.mock('@renderer/common/llm-wiki-actions', () => ({
    initializeLlmWiki: initializeLlmWikiMock
}))

vi.mock('@renderer/common/llm-wiki-migration-actions', () => ({
    runWorkspaceMigration: runWorkspaceMigrationMock
}))

vi.mock('@renderer/common/action-feedback', () => ({
    reportActionFailure: reportActionFailureMock,
    describeActionError: describeActionErrorMock
}))

vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: loggerWarnMock, error: vi.fn(), debug: vi.fn() }
}))

let calls: string[]
let readMock: ReturnType<typeof vi.fn>
let writeMock: ReturnType<typeof vi.fn>
let currentConfig: Record<string, unknown>

/** 成功迁移结果替身（copy 模式 2 个文件） */
function copyMigrationResult(): Record<string, unknown> {
    return {
        ok: true,
        mode: 'copy',
        moved: [],
        copied: [
            { path: 'C:/ws/a.md', relativePath: 'a.md', targetPath: 'C:/ws/raw/a.md', bytes: 10 },
            { path: 'C:/ws/b.md', relativePath: 'b.md', targetPath: 'C:/ws/raw/b.md', bytes: 20 }
        ],
        skipped: [],
        failed: [],
        logId: '20261128-120000-000'
    }
}

beforeEach(() => {
    resetWorkspaceModeSwitchForTesting()
    clearWorkspaceModeSwitchListenersForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    window.localStorage.clear()
    calls = []
    currentConfig = { language: 'zh-CN', workspaceMode: 'traditional', featureTabs: false }
    readMock = vi.fn(async (configName: string) => {
        calls.push(`read:${configName}`)
        return { ...currentConfig }
    })
    writeMock = vi.fn(async (configName: string, data: unknown) => {
        calls.push(`write:${configName}`)
        currentConfig = data as Record<string, unknown>
        return true
    })
    initializeLlmWikiMock.mockReset()
    initializeLlmWikiMock.mockImplementation(async () => {
        calls.push('initialize')
        return true
    })
    runWorkspaceMigrationMock.mockReset()
    runWorkspaceMigrationMock.mockImplementation(async (request: unknown) => {
        calls.push(`migrate:${JSON.stringify(request)}`)
        return copyMigrationResult()
    })
    reportActionFailureMock.mockReset()
    describeActionErrorMock.mockClear()
    loggerWarnMock.mockClear()
    vi.stubGlobal('api', { config: { read: readMock, write: writeMock } })
})

afterEach(() => {
    resetWorkspaceModeSwitchForTesting()
    clearWorkspaceModeSwitchListenersForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 取最后一次写配置的载荷（断言模式字段与其它字段保留） */
function lastWrittenConfig(): Record<string, unknown> {
    expect(writeMock).toHaveBeenCalled()
    return writeMock.mock.calls[writeMock.mock.calls.length - 1]![1] as Record<string, unknown>
}

describe('useWorkspaceModeSwitch：迁移弹窗状态', () => {
    it('requestSwitchToLlmWiki 打开弹窗；重复请求保持展开', () => {
        expect(workspaceModeSwitchState.visible).toBe(false)
        requestSwitchToLlmWiki()
        expect(workspaceModeSwitchState.visible).toBe(true)
        requestSwitchToLlmWiki()
        expect(workspaceModeSwitchState.visible).toBe(true)
    })

    it('busy 期间忽略打开请求（防重复提交）', () => {
        workspaceModeSwitchState.busy = true
        requestSwitchToLlmWiki()
        expect(workspaceModeSwitchState.visible).toBe(false)
    })

    it('表单阶段取消：关闭弹窗、不迁移、不初始化、不读写配置、不展开面板', () => {
        setLlmWikiAiPanelCollapsed(true)
        requestSwitchToLlmWiki()
        cancelWorkspaceModeSwitch()

        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(runWorkspaceMigrationMock).not.toHaveBeenCalled()
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(readMock).not.toHaveBeenCalled()
        expect(writeMock).not.toHaveBeenCalled()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
    })

    it('busy 期间取消 / 完成关闭均无效（切换进行中不能被关闭）', () => {
        workspaceModeSwitchState.visible = true
        workspaceModeSwitchState.busy = true
        cancelWorkspaceModeSwitch()
        finishWorkspaceModeSwitch()
        expect(workspaceModeSwitchState.visible).toBe(true)
    })

    it('结果阶段完成关闭：关闭弹窗但不重复执行迁移/初始化/写配置', async () => {
        requestSwitchToLlmWiki()
        await completeSwitchToLlmWiki({ mode: 'none', formats: [] })
        expect(workspaceModeSwitchState.visible).toBe(true)

        finishWorkspaceModeSwitch()
        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(runWorkspaceMigrationMock).not.toHaveBeenCalled()
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(writeMock).toHaveBeenCalledTimes(1)
    })
})

describe('useWorkspaceModeSwitch：完成切换（迁移 → 初始化 → 写配置）', () => {
    it('不迁移：仅初始化 + 合并写配置（workspaceMode=llm-wiki，保留其它字段）→ 展开面板', async () => {
        setLlmWikiAiPanelCollapsed(true)
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(outcome.switched).toBe(true)
        expect(outcome.migration).toBeUndefined()
        // 调用顺序：不迁移时跳过迁移，初始化先于读写配置
        expect(calls).toEqual(['initialize', 'read:system', 'write:system'])
        expect(currentConfig).toMatchObject({
            language: 'zh-CN',
            featureTabs: false,
            workspaceMode: 'llm-wiki'
        })
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('false')
        // 结果阶段由弹窗展示：保持打开、busy 复位
        expect(workspaceModeSwitchState.visible).toBe(true)
        expect(workspaceModeSwitchState.busy).toBe(false)
        expect(reportActionFailureMock).not.toHaveBeenCalled()
    })

    it('复制迁移：先迁移（mode/formats 原样传递）→ 初始化 → 写配置，结果透传', async () => {
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({
            mode: 'copy',
            formats: ['markdown', 'image']
        })

        expect(outcome.switched).toBe(true)
        expect(outcome.migration?.mode).toBe('copy')
        expect(outcome.migration?.copied).toHaveLength(2)
        expect(calls[0]).toBe('migrate:{"mode":"copy","formats":["markdown","image"]}')
        expect(calls[1]).toBe('initialize')
        expect(calls.slice(2)).toEqual(['read:system', 'write:system'])
    })

    it('移动迁移：迁移结果含 logId（结果页回滚入口据此启用）', async () => {
        runWorkspaceMigrationMock.mockResolvedValue({
            ...copyMigrationResult(),
            mode: 'move',
            copied: [],
            moved: [
                {
                    path: 'C:/ws/a.md',
                    relativePath: 'a.md',
                    targetPath: 'C:/ws/raw/a.md',
                    bytes: 10
                }
            ]
        })
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'move', formats: ['markdown'] })

        expect(outcome.switched).toBe(true)
        expect(outcome.migration?.mode).toBe('move')
        expect(outcome.migration?.logId).toBe('20261128-120000-000')
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
    })

    it('迁移整批失败（ok=false）：中止切换，不初始化、不写配置，原模式保留', async () => {
        runWorkspaceMigrationMock.mockResolvedValue({
            ok: false,
            mode: 'copy',
            moved: [],
            copied: [],
            skipped: [],
            failed: [],
            logId: null,
            error: '尚未打开工作区，无法扫描或迁移文件。'
        })
        setLlmWikiAiPanelCollapsed(true)
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'copy', formats: ['markdown'] })

        expect(outcome.switched).toBe(false)
        expect(outcome.error).toContain('尚未打开工作区')
        expect(outcome.migration?.ok).toBe(false)
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(writeMock).not.toHaveBeenCalled()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
    })

    it('初始化失败：保留迁移结果供展示/回滚，不写配置、不展开面板', async () => {
        initializeLlmWikiMock.mockImplementation(async () => {
            calls.push('initialize')
            return false
        })
        setLlmWikiAiPanelCollapsed(true)
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'copy', formats: ['markdown'] })

        expect(outcome.switched).toBe(false)
        expect(outcome.migration?.copied).toHaveLength(2)
        expect(outcome.error).toBeTruthy()
        expect(calls).toEqual(['migrate:{"mode":"copy","formats":["markdown"]}', 'initialize'])
        expect(writeMock).not.toHaveBeenCalled()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
    })

    it('写配置返回 false：保持原模式并弹错误提示（CFG-04 禁止静默失败），不展开面板', async () => {
        writeMock.mockResolvedValue(false)
        setLlmWikiAiPanelCollapsed(true)
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(outcome.switched).toBe(false)
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock.mock.calls[0]![0]).toMatchObject({
            title: expect.stringContaining('工作区模式切换失败'),
            message: expect.stringContaining('写入接口返回失败')
        })
        expect(workspaceModeSwitchState.busy).toBe(false)
    })

    it('读配置抛异常：弹错误提示、保持原模式、返回 false', async () => {
        readMock.mockRejectedValue(new Error('ipc unavailable'))
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(outcome.switched).toBe(false)
        expect(writeMock).not.toHaveBeenCalled()
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock.mock.calls[0]![0].message).toContain('ipc unavailable')
    })

    it('配置 API 不可用（非 Electron 环境）：弹错误提示且不写配置', async () => {
        vi.unstubAllGlobals()
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(outcome.switched).toBe(false)
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
    })

    it('无 window 的极端环境（typeof window === undefined）：安全降级为失败并提示', async () => {
        vi.stubGlobal('window', undefined)
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(outcome.switched).toBe(false)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(writeMock).not.toHaveBeenCalled()
    })

    it('迁移动作抛异常：捕获并返回结构化失败（不向调用方抛异常）', async () => {
        runWorkspaceMigrationMock.mockRejectedValue(new Error('ipc crashed'))
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'copy', formats: ['markdown'] })

        expect(outcome.switched).toBe(false)
        expect(outcome.error).toContain('ipc crashed')
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
    })

    it('并发提交防重复：busy 期间第二次调用直接返回失败，迁移/初始化只执行一次', async () => {
        requestSwitchToLlmWiki()
        const first = completeSwitchToLlmWiki({ mode: 'none', formats: [] })
        const second = completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        const secondOutcome = await second
        expect(secondOutcome.switched).toBe(false)
        expect(secondOutcome.error).toBeTruthy()
        await expect(first).resolves.toMatchObject({ switched: true })
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(writeMock).toHaveBeenCalledTimes(1)
    })
})

describe('useWorkspaceModeSwitch：完成监听', () => {
    it('切换成功才通知监听方；取消订阅后不再收到', async () => {
        const listener = vi.fn()
        const unsubscribe = onWorkspaceModeSwitchCompleted(listener)
        requestSwitchToLlmWiki()

        await completeSwitchToLlmWiki({ mode: 'none', formats: [] })
        expect(listener).toHaveBeenCalledTimes(1)
        expect(listener.mock.calls[0]![0]).toMatchObject({ switched: true })

        unsubscribe()
        finishWorkspaceModeSwitch()
        requestSwitchToLlmWiki()
        await completeSwitchToLlmWiki({ mode: 'none', formats: [] })
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('切换失败不通知监听方（设置页草稿保持原模式）', async () => {
        initializeLlmWikiMock.mockResolvedValue(false)
        const listener = vi.fn()
        onWorkspaceModeSwitchCompleted(listener)
        requestSwitchToLlmWiki()

        await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(listener).not.toHaveBeenCalled()
    })

    it('监听器抛异常不影响切换结果（记录 WARN 日志继续）', async () => {
        const throwing = vi.fn(() => {
            throw new Error('listener boom')
        })
        const healthy = vi.fn()
        onWorkspaceModeSwitchCompleted(throwing)
        onWorkspaceModeSwitchCompleted(healthy)
        requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(outcome.switched).toBe(true)
        expect(healthy).toHaveBeenCalledTimes(1)
        expect(loggerWarnMock).toHaveBeenCalled()
    })
})

describe('useWorkspaceModeSwitch：切换到传统模式', () => {
    it('直接读配置 + 合并写回 workspaceMode=traditional（无需确认、不动面板状态）', async () => {
        currentConfig = { language: 'zh-CN', workspaceMode: 'llm-wiki', featureTabs: true }

        await expect(switchToTraditional()).resolves.toBe(true)

        expect(calls).toEqual(['read:system', 'write:system'])
        expect(lastWrittenConfig()).toMatchObject({
            language: 'zh-CN',
            featureTabs: true,
            workspaceMode: 'traditional'
        })
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(runWorkspaceMigrationMock).not.toHaveBeenCalled()
        expect(reportActionFailureMock).not.toHaveBeenCalled()
    })

    it('写配置返回 false：弹错误提示并返回 false（保持 LLM Wiki 模式）', async () => {
        writeMock.mockResolvedValue(false)

        await expect(switchToTraditional()).resolves.toBe(false)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock.mock.calls[0]![0].title).toContain('工作区模式切换失败')
    })

    it('配置 API 读取抛异常（受限 API 被回收等极端情况）：安全降级为「不可用」并提示', async () => {
        Object.defineProperty(window, 'api', {
            configurable: true,
            get() {
                throw new Error('contextBridge unavailable')
            }
        })

        await expect(switchToTraditional()).resolves.toBe(false)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
    })
})

describe('useWorkspaceModeSwitch：测试复位接口', () => {
    it('resetWorkspaceModeSwitchForTesting 清除弹窗与 busy 状态', () => {
        workspaceModeSwitchState.visible = true
        workspaceModeSwitchState.busy = true

        resetWorkspaceModeSwitchForTesting()

        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(workspaceModeSwitchState.busy).toBe(false)
    })

    it('真实工作台状态模块可独立展开面板（未 mock 掉行为）', () => {
        setLlmWikiAiPanelCollapsed(true)
        ensureLlmWikiAiPanelExpanded()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
    })
})
