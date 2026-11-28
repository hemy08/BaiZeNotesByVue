// @vitest-environment jsdom
/**
 * 1.5.7 迁移批次：工作区模式切换 composable（迁移弹窗编排）。
 *
 * 覆盖：
 * 1. 弹窗状态：打开 / 取消 / 完成关闭 / busy 期间防重复；
 * 2. 请求切换（M3 已初始化直切）：已初始化 → 不弹窗、直接 completeSwitchToLlmWiki
 *    （mode:none + silent 初始化）并展示轻量 Toast 成功提示（非模态）；未初始化 / 状态检测
 *    失败（null/抛错）→ 保守弹窗；检测期间连点防重；直切失败 → 可见错误提示；
 * 3. 完整切换链路：迁移（可选，`LLM_WIKI.MIGRATE`）→ 初始化 raw/ 与 wiki/（成功模态框缺省
 *    抑制，结果由弹窗结果页承载）→ 合并写系统配置（保留其它字段）→ 展开 AI 面板；调用顺序固定；
 * 4. 选择「不迁移」时跳过迁移调用；选择复制/移动时把 mode + formats 原样交给迁移动作；
 * 5. 迁移整批失败 / 初始化失败 / 写配置失败 / 异常 → 保持原模式并返回结构化失败（不抛异常）；
 * 6. 完成监听：成功才通知、取消订阅生效、监听器异常不影响切换结果；
 * 7. llm-wiki → traditional 直接写配置并 Toast 轻提示；失败仍错误对话框；测试复位接口。
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
import { getConfigStore } from '../../../src/renderer/src/common/useConfigStore'
import { t } from '../../../src/renderer/src/common/i18n'

const {
    initializeLlmWikiMock,
    runWorkspaceMigrationMock,
    getStatusMock,
    showToastMock,
    reportActionFailureMock,
    describeActionErrorMock,
    loggerWarnMock
} = vi.hoisted(() => ({
    initializeLlmWikiMock: vi.fn(),
    runWorkspaceMigrationMock: vi.fn(),
    getStatusMock: vi.fn(),
    showToastMock: vi.fn(),
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
    runWorkspaceMigration: runWorkspaceMigrationMock,
    getLlmWikiWorkspaceStatus: getStatusMock
}))

vi.mock('@renderer/common/action-feedback', () => ({
    reportActionFailure: reportActionFailureMock,
    describeActionError: describeActionErrorMock
}))

// 1.5.7 体验优化：成功提示由全局模态对话框改为轻量 Toast（mock 掉以断言展示参数）
vi.mock('@renderer/common/toast', () => ({
    showToast: showToastMock
}))

vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: loggerWarnMock, error: vi.fn(), debug: vi.fn() }
}))

/** 全局配置 store 单例（断言「直切成功不再弹模态对话框」） */
const configStore = getConfigStore()

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
    getStatusMock.mockReset()
    // 缺省：未初始化（首次切换 → 弹迁移弹窗，与既有用例的弹窗流程一致）
    getStatusMock.mockResolvedValue({
        initialized: false,
        hasRaw: false,
        hasWiki: false,
        hasSchema: false
    })
    showToastMock.mockReset()
    reportActionFailureMock.mockReset()
    describeActionErrorMock.mockClear()
    loggerWarnMock.mockClear()
    // 断言「成功路径不再弹模态对话框」：每条用例从无弹窗状态开始
    configStore.hideDialog('message')
    vi.stubGlobal('api', { config: { read: readMock, write: writeMock } })
})

afterEach(() => {
    resetWorkspaceModeSwitchForTesting()
    clearWorkspaceModeSwitchListenersForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    configStore.hideDialog('message')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 取最后一次写配置的载荷（断言模式字段与其它字段保留） */
function lastWrittenConfig(): Record<string, unknown> {
    expect(writeMock).toHaveBeenCalled()
    return writeMock.mock.calls[writeMock.mock.calls.length - 1]![1] as Record<string, unknown>
}

describe('useWorkspaceModeSwitch：迁移弹窗状态', () => {
    it('requestSwitchToLlmWiki（未初始化）打开弹窗；重复请求保持展开', async () => {
        expect(workspaceModeSwitchState.visible).toBe(false)
        await requestSwitchToLlmWiki()
        expect(workspaceModeSwitchState.visible).toBe(true)
        await requestSwitchToLlmWiki()
        expect(workspaceModeSwitchState.visible).toBe(true)
        expect(completeSwitchToLlmWiki).toBeTypeOf('function')
    })

    it('busy 期间忽略打开请求（防重复提交）', async () => {
        workspaceModeSwitchState.busy = true
        await requestSwitchToLlmWiki()
        expect(workspaceModeSwitchState.visible).toBe(false)
        // busy 时连状态检测都不发起（不浪费 IPC）
        expect(getStatusMock).not.toHaveBeenCalled()
    })

    it('表单阶段取消：关闭弹窗、不迁移、不初始化、不读写配置、不展开面板', async () => {
        setLlmWikiAiPanelCollapsed(true)
        await requestSwitchToLlmWiki()
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
        await requestSwitchToLlmWiki()
        await completeSwitchToLlmWiki({ mode: 'none', formats: [] })
        expect(workspaceModeSwitchState.visible).toBe(true)

        finishWorkspaceModeSwitch()
        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(runWorkspaceMigrationMock).not.toHaveBeenCalled()
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(writeMock).toHaveBeenCalledTimes(1)
    })
})

describe('useWorkspaceModeSwitch：已初始化工作区直接切换（M3 + 1.5.7 Toast）', () => {
    beforeEach(() => {
        getStatusMock.mockResolvedValue({
            initialized: true,
            hasRaw: true,
            hasWiki: true,
            hasSchema: true
        })
    })

    it('已初始化 → 不弹迁移弹窗；直切（silent 初始化）成功后用轻量 Toast 提示、不弹模态框', async () => {
        setLlmWikiAiPanelCollapsed(true)

        await requestSwitchToLlmWiki()

        // 不弹迁移弹窗
        expect(workspaceModeSwitchState.visible).toBe(false)
        // 直接走正常切换：不迁移、初始化幂等（silent 抑制「已初始化」模态框）+ 写配置 + 展开面板
        expect(runWorkspaceMigrationMock).not.toHaveBeenCalled()
        expect(calls).toEqual(['initialize', 'read:system', 'write:system'])
        expect(initializeLlmWikiMock).toHaveBeenCalledWith({ silent: true })
        expect(currentConfig).toMatchObject({ workspaceMode: 'llm-wiki' })
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        // 轻量 Toast（非模态）：标题 + 含手动编译引导的正文 + success 类型
        expect(showToastMock).toHaveBeenCalledTimes(1)
        const [message, options] = showToastMock.mock.calls[0]! as [
            string,
            { type: string; title: string; duration?: number; id?: string }
        ]
        expect(options.type).toBe('success')
        expect(options.title).toBe(t('editorUi.llmWikiPanel.switchAlreadyInitializedTitle'))
        expect(options.duration).toBeGreaterThan(0)
        expect(options.id).toBeTruthy()
        expect(message).toBe(t('editorUi.llmWikiPanel.switchAlreadyInitializedMessage'))
        expect(message).toContain('AI 编译')
        expect(message).toContain('批量编译')
        // 不再弹全局模态对话框（体验优化核心断言）
        expect(configStore.dialogs.messageDialog.visible).toBe(false)
        expect(reportActionFailureMock).not.toHaveBeenCalled()
        expect(workspaceModeSwitchState.busy).toBe(false)
    })

    it('已初始化但直切失败（初始化失败）→ 不弹窗、给可见错误提示、保持原模式', async () => {
        initializeLlmWikiMock.mockResolvedValue(false)
        setLlmWikiAiPanelCollapsed(true)

        await requestSwitchToLlmWiki()

        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(writeMock).not.toHaveBeenCalled()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(showToastMock).not.toHaveBeenCalled()
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock.mock.calls[0]![0]).toMatchObject({
            title: t('editorUi.llmWikiPanel.workspaceModeSwitchFailedTitle')
        })
    })

    it('状态检测抛异常 → 保守弹窗（不误判为已初始化）', async () => {
        getStatusMock.mockRejectedValue(new Error('status boom'))

        await requestSwitchToLlmWiki()

        expect(workspaceModeSwitchState.visible).toBe(true)
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(showToastMock).not.toHaveBeenCalled()
        expect(loggerWarnMock).toHaveBeenCalled()
    })

    it('状态检测返回 null（通道不可用/结构非法）→ 保守弹窗', async () => {
        getStatusMock.mockResolvedValue(null)

        await requestSwitchToLlmWiki()

        expect(workspaceModeSwitchState.visible).toBe(true)
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
    })

    it('未初始化 → 弹迁移弹窗，不执行初始化/写配置', async () => {
        getStatusMock.mockResolvedValue({
            initialized: false,
            hasRaw: false,
            hasWiki: true,
            hasSchema: false
        })

        await requestSwitchToLlmWiki()

        expect(workspaceModeSwitchState.visible).toBe(true)
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(writeMock).not.toHaveBeenCalled()
        expect(showToastMock).not.toHaveBeenCalled()
    })

    it('检测窗口内连点：只发起一次检测与一次直切（防重复初始化/写配置/Toast）', async () => {
        const first = requestSwitchToLlmWiki()
        const second = requestSwitchToLlmWiki()
        await Promise.all([first, second])

        expect(getStatusMock).toHaveBeenCalledTimes(1)
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(writeMock).toHaveBeenCalledTimes(1)
        expect(showToastMock).toHaveBeenCalledTimes(1)
    })

    it('检测返回前其它入口已进入 busy：不再重复直切（让既有流程继续）', async () => {
        getStatusMock.mockImplementation(async () => {
            workspaceModeSwitchState.busy = true
            return { initialized: true, hasRaw: true, hasWiki: true, hasSchema: true }
        })

        await requestSwitchToLlmWiki()

        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(showToastMock).not.toHaveBeenCalled()
    })
})

describe('useWorkspaceModeSwitch：完成切换（迁移 → 初始化 → 写配置）', () => {
    it('不迁移：仅初始化 + 合并写配置（workspaceMode=llm-wiki，保留其它字段）→ 展开面板', async () => {
        setLlmWikiAiPanelCollapsed(true)
        await requestSwitchToLlmWiki()

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
        // 结果阶段由弹窗展示：保持打开、busy 复位；成功结果由结果页内联承载，
        // 初始化成功模态框缺省抑制（silent 缺省 true），避免弹窗上再叠一个成功对话框
        expect(workspaceModeSwitchState.visible).toBe(true)
        expect(workspaceModeSwitchState.busy).toBe(false)
        expect(initializeLlmWikiMock).toHaveBeenCalledWith({ silent: true })
        expect(reportActionFailureMock).not.toHaveBeenCalled()
        // 弹窗内联结果页已反馈成功，不额外弹 Toast（避免重复提示）
        expect(showToastMock).not.toHaveBeenCalled()
    })

    it('显式 silent:false：恢复初始化成功的模态提示（供无结果 UI 的入口复用）', async () => {
        await requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki(
            { mode: 'none', formats: [] },
            { silent: false }
        )

        expect(outcome.switched).toBe(true)
        expect(initializeLlmWikiMock).toHaveBeenCalledWith({ silent: false })
    })

    it('复制迁移：先迁移（mode/formats 原样传递）→ 初始化 → 写配置，结果透传', async () => {
        await requestSwitchToLlmWiki()

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
        await requestSwitchToLlmWiki()

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
        await requestSwitchToLlmWiki()

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
        await requestSwitchToLlmWiki()

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
        await requestSwitchToLlmWiki()

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
        await requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(outcome.switched).toBe(false)
        expect(writeMock).not.toHaveBeenCalled()
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock.mock.calls[0]![0].message).toContain('ipc unavailable')
    })

    it('配置 API 不可用（非 Electron 环境）：弹错误提示且不写配置', async () => {
        vi.unstubAllGlobals()
        await requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(outcome.switched).toBe(false)
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
    })

    it('无 window 的极端环境（typeof window === undefined）：安全降级为失败并提示', async () => {
        vi.stubGlobal('window', undefined)
        await requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(outcome.switched).toBe(false)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(writeMock).not.toHaveBeenCalled()
    })

    it('迁移动作抛异常：捕获并返回结构化失败（不向调用方抛异常）', async () => {
        runWorkspaceMigrationMock.mockRejectedValue(new Error('ipc crashed'))
        await requestSwitchToLlmWiki()

        const outcome = await completeSwitchToLlmWiki({ mode: 'copy', formats: ['markdown'] })

        expect(outcome.switched).toBe(false)
        expect(outcome.error).toContain('ipc crashed')
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
    })

    it('并发提交防重复：busy 期间第二次调用直接返回失败，迁移/初始化只执行一次', async () => {
        await requestSwitchToLlmWiki()
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
        await requestSwitchToLlmWiki()

        await completeSwitchToLlmWiki({ mode: 'none', formats: [] })
        expect(listener).toHaveBeenCalledTimes(1)
        expect(listener.mock.calls[0]![0]).toMatchObject({ switched: true })

        unsubscribe()
        finishWorkspaceModeSwitch()
        await requestSwitchToLlmWiki()
        await completeSwitchToLlmWiki({ mode: 'none', formats: [] })
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('切换失败不通知监听方（设置页草稿保持原模式）', async () => {
        initializeLlmWikiMock.mockResolvedValue(false)
        const listener = vi.fn()
        onWorkspaceModeSwitchCompleted(listener)
        await requestSwitchToLlmWiki()

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
        await requestSwitchToLlmWiki()

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
        // 1.5.7 体验优化：成功切换用轻量 Toast 提示（info 类型、非模态），不弹对话框
        expect(showToastMock).toHaveBeenCalledTimes(1)
        expect(showToastMock).toHaveBeenCalledWith(
            t('editorUi.llmWikiPanel.switchToTraditionalSuccess'),
            expect.objectContaining({ type: 'info' })
        )
        expect(configStore.dialogs.messageDialog.visible).toBe(false)
    })

    it('写配置返回 false：弹错误提示并返回 false（保持 LLM Wiki 模式，不弹成功 Toast）', async () => {
        writeMock.mockResolvedValue(false)

        await expect(switchToTraditional()).resolves.toBe(false)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock.mock.calls[0]![0].title).toContain('工作区模式切换失败')
        expect(showToastMock).not.toHaveBeenCalled()
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
        expect(showToastMock).not.toHaveBeenCalled()
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
