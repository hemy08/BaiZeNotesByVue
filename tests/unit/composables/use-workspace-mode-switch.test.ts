// @vitest-environment jsdom
/**
 * 1.5.7 体验微调（用户反馈批次 A4）：工作区模式快速切换 composable。
 *
 * 覆盖两处入口共用的切换链路：
 * 1. traditional → llm-wiki：确认对话框状态 → 初始化 raw/ 与 wiki/ → 合并写系统配置
 *    （保留其它字段）→ 展开 AI 面板 → 关闭对话框；调用顺序与系统设置页一致；
 * 2. 取消 / 关闭：不初始化、不写配置、不展开面板；
 * 3. 初始化失败 / 写配置返回 false / 抛异常 / 配置 API 不可用：保持原模式并给出可见错误提示；
 * 4. llm-wiki → traditional：直接读配置 + 写回（不需要确认）；
 * 5. 并发确认防重复提交、模块单例状态复位。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    cancelWorkspaceModeSwitch,
    confirmSwitchToLlmWiki,
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

const { initializeLlmWikiMock, reportActionFailureMock, describeActionErrorMock } = vi.hoisted(
    () => ({
        initializeLlmWikiMock: vi.fn(),
        reportActionFailureMock: vi.fn(),
        describeActionErrorMock: vi.fn((error: unknown, fallback: string) => {
            if (error instanceof Error) {
                return error.message
            }
            return typeof error === 'string' && error.length > 0 ? error : fallback
        })
    })
)

vi.mock('@renderer/common/llm-wiki-actions', () => ({
    initializeLlmWiki: initializeLlmWikiMock
}))

vi.mock('@renderer/common/action-feedback', () => ({
    reportActionFailure: reportActionFailureMock,
    describeActionError: describeActionErrorMock
}))

let calls: string[]
let readMock: ReturnType<typeof vi.fn>
let writeMock: ReturnType<typeof vi.fn>
let currentConfig: Record<string, unknown>

beforeEach(() => {
    resetWorkspaceModeSwitchForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    window.localStorage.clear()
    calls = []
    currentConfig = {
        language: 'zh-CN',
        workspaceMode: 'traditional',
        featureTabs: false
    }
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
    reportActionFailureMock.mockReset()
    describeActionErrorMock.mockClear()
    vi.stubGlobal('api', { config: { read: readMock, write: writeMock } })
})

afterEach(() => {
    resetWorkspaceModeSwitchForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 取最后一次写配置的载荷（断言模式字段与其它字段保留） */
function lastWrittenConfig(): Record<string, unknown> {
    expect(writeMock).toHaveBeenCalled()
    return writeMock.mock.calls[writeMock.mock.calls.length - 1]![1] as Record<string, unknown>
}

describe('useWorkspaceModeSwitch：传统 → LLM Wiki 确认对话框状态', () => {
    it('requestSwitchToLlmWiki 打开确认对话框；重复请求保持展开', () => {
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

    it('取消切换：关闭对话框、不初始化、不读写配置、不展开面板', () => {
        setLlmWikiAiPanelCollapsed(true)
        requestSwitchToLlmWiki()
        cancelWorkspaceModeSwitch()

        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(readMock).not.toHaveBeenCalled()
        expect(writeMock).not.toHaveBeenCalled()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
    })

    it('busy 期间取消无效（切换进行中不能被关闭/中断）', () => {
        workspaceModeSwitchState.visible = true
        workspaceModeSwitchState.busy = true
        cancelWorkspaceModeSwitch()
        expect(workspaceModeSwitchState.visible).toBe(true)
    })
})

describe('useWorkspaceModeSwitch：确认切换到 LLM Wiki', () => {
    it('初始化成功 → 合并写配置（workspaceMode=llm-wiki，保留其它字段）→ 展开面板 → 关闭对话框', async () => {
        setLlmWikiAiPanelCollapsed(true)
        requestSwitchToLlmWiki()

        await expect(confirmSwitchToLlmWiki()).resolves.toBe(true)

        // 调用顺序与系统设置页一致：先初始化，成功后才读写配置
        expect(calls).toEqual(['initialize', 'read:system', 'write:system'])
        expect(currentConfig).toMatchObject({
            language: 'zh-CN',
            featureTabs: false,
            workspaceMode: 'llm-wiki'
        })
        // 切换成功后 AI 面板处于展开态（清掉用户上次收起偏好并持久化）
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('false')
        // 对话框关闭、busy 复位
        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(workspaceModeSwitchState.busy).toBe(false)
        expect(reportActionFailureMock).not.toHaveBeenCalled()
    })

    it('读配置返回 null 时按最小载荷 { workspaceMode } 写入（配置不存在/首次启动）', async () => {
        readMock.mockResolvedValue(null)
        requestSwitchToLlmWiki()

        await expect(confirmSwitchToLlmWiki()).resolves.toBe(true)
        expect(lastWrittenConfig()).toEqual({ workspaceMode: 'llm-wiki' })
    })

    it('初始化失败：不写配置、不展开面板、关闭对话框并返回 false（保持原模式）', async () => {
        initializeLlmWikiMock.mockImplementation(async () => {
            calls.push('initialize')
            return false
        })
        setLlmWikiAiPanelCollapsed(true)
        requestSwitchToLlmWiki()

        await expect(confirmSwitchToLlmWiki()).resolves.toBe(false)

        expect(calls).toEqual(['initialize'])
        expect(writeMock).not.toHaveBeenCalled()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(workspaceModeSwitchState.busy).toBe(false)
        // 初始化失败提示由 initializeLlmWiki 负责，本 composable 不重复弹框
        expect(reportActionFailureMock).not.toHaveBeenCalled()
    })

    it('写配置返回 false：保持原模式并弹错误提示（CFG-04 禁止静默失败），不展开面板', async () => {
        writeMock.mockResolvedValue(false)
        setLlmWikiAiPanelCollapsed(true)
        requestSwitchToLlmWiki()

        await expect(confirmSwitchToLlmWiki()).resolves.toBe(false)

        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock.mock.calls[0]![0]).toMatchObject({
            title: expect.stringContaining('工作区模式切换失败'),
            message: expect.stringContaining('写入接口返回失败')
        })
        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(workspaceModeSwitchState.busy).toBe(false)
    })

    it('读配置抛异常：弹错误提示、保持原模式、返回 false', async () => {
        readMock.mockRejectedValue(new Error('ipc unavailable'))
        requestSwitchToLlmWiki()

        await expect(confirmSwitchToLlmWiki()).resolves.toBe(false)

        expect(writeMock).not.toHaveBeenCalled()
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock.mock.calls[0]![0].message).toContain('ipc unavailable')
        expect(workspaceModeSwitchState.visible).toBe(false)
    })

    it('写配置抛异常：弹错误提示并返回 false', async () => {
        writeMock.mockRejectedValue(new Error('disk full'))
        requestSwitchToLlmWiki()

        await expect(confirmSwitchToLlmWiki()).resolves.toBe(false)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock.mock.calls[0]![0].message).toContain('disk full')
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
    })

    it('配置 API 不可用（非 Electron 环境）：弹错误提示且不调用初始化后的写配置', async () => {
        vi.unstubAllGlobals()
        requestSwitchToLlmWiki()

        await expect(confirmSwitchToLlmWiki()).resolves.toBe(false)

        // 初始化已执行（raw/wiki 幂等创建），但配置不可用 → 不写配置并提示
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(workspaceModeSwitchState.visible).toBe(false)
    })

    it('并发确认防重复提交：busy 期间第二次确认直接返回 false，初始化只执行一次', async () => {
        requestSwitchToLlmWiki()
        const first = confirmSwitchToLlmWiki()
        const second = confirmSwitchToLlmWiki()

        await expect(second).resolves.toBe(false)
        await expect(first).resolves.toBe(true)
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(writeMock).toHaveBeenCalledTimes(1)
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

    it('无 window 的极端环境（typeof window === undefined）读写安全降级', async () => {
        vi.stubGlobal('window', undefined)

        await expect(confirmSwitchToLlmWiki()).resolves.toBe(false)
        expect(reportActionFailureMock).toHaveBeenCalledTimes(1)
        expect(writeMock).not.toHaveBeenCalled()
    })
})

describe('useWorkspaceModeSwitch：测试复位接口', () => {
    it('resetWorkspaceModeSwitchForTesting 清除对话框与 busy 状态', () => {
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
