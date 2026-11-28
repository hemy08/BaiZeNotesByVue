// @vitest-environment jsdom
/**
 * 1.5.7 体验微调（用户反馈批次 A4）：工作区模式切换确认对话框。
 *
 * 覆盖：
 * 1. 复用 BaseDialog 外壳 + 系统设置既有确认文案（标题/正文/取消/确认按钮）；
 * 2. 确认 → 初始化成功 → 写系统配置 → 展开 AI 面板 → 对话框状态关闭；
 * 3. 取消 / 右上角关闭 → 不初始化、不写配置；
 * 4. 初始化/切换进行中（busy）禁用两个按钮，防重复提交。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import {
    resetWorkspaceModeSwitchForTesting,
    workspaceModeSwitchState
} from '../../../src/renderer/src/composables/useWorkspaceModeSwitch'
import {
    llmWikiWorkbenchState,
    resetLlmWikiWorkbenchStateForTesting,
    setLlmWikiAiPanelCollapsed
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench'
import { t } from '../../../src/renderer/src/common/i18n'

const { initializeLlmWikiMock, reportActionFailureMock } = vi.hoisted(() => ({
    initializeLlmWikiMock: vi.fn(),
    reportActionFailureMock: vi.fn()
}))

vi.mock('@renderer/common/llm-wiki-actions', () => ({
    initializeLlmWiki: initializeLlmWikiMock
}))

vi.mock('@renderer/common/action-feedback', () => ({
    reportActionFailure: reportActionFailureMock,
    describeActionError: (error: unknown, fallback: string) =>
        error instanceof Error ? error.message : fallback
}))

import WorkspaceModeSwitchDialog from '../../../src/renderer/src/components/dialogs/simple/WorkspaceModeSwitchDialog.vue'

/** 对话框默认 <Teleport to="body">，测试里 stub 成内联渲染以便断言（与既有对话框测试一致） */
const teleportStub = { global: { stubs: { teleport: true } } }

let wrapper: ReturnType<typeof mount> | null = null
let readMock: ReturnType<typeof vi.fn>
let writeMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    resetWorkspaceModeSwitchForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    window.localStorage.clear()
    workspaceModeSwitchState.visible = true
    initializeLlmWikiMock.mockReset()
    initializeLlmWikiMock.mockResolvedValue(true)
    reportActionFailureMock.mockReset()
    readMock = vi.fn().mockResolvedValue({ language: 'zh-CN', workspaceMode: 'traditional' })
    writeMock = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('api', { config: { read: readMock, write: writeMock } })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    resetWorkspaceModeSwitchForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

function mountDialog(): ReturnType<typeof mount> {
    wrapper = mount(WorkspaceModeSwitchDialog, teleportStub)
    return wrapper
}

describe('WorkspaceModeSwitchDialog：结构与文案', () => {
    it('复用 BaseDialog 外壳与系统设置确认文案（标题/正文/取消/确认）', () => {
        const mounted = mountDialog()

        expect(mounted.find('.workspace-mode-switch-dialog').exists()).toBe(true)
        expect(mounted.find('.workspace-mode-switch-dialog .title-text').text()).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeConfirmTitle')
        )
        expect(mounted.find('.workspace-mode-switch-message').text()).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeConfirmMessage')
        )
        expect(mounted.find('.btn-cancel').text()).toBe(t('common.cancel'))
        expect(mounted.find('.btn-confirm').text()).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeConfirmOk')
        )
        // 说明文案经 aria-describedby 关联到对话框
        const messageId = mounted.find('.workspace-mode-switch-message').attributes('id')
        expect(messageId).toBeTruthy()
        expect(mounted.find('.workspace-mode-switch-dialog').attributes('aria-describedby')).toBe(
            messageId
        )
        // 模态确认框：点击遮罩不关闭（避免误触取消初始化）
        expect(mounted.find('.dialog-overlay').exists()).toBe(true)
    })
})

describe('WorkspaceModeSwitchDialog：确认 / 取消流程', () => {
    it('点击确认：初始化成功 → 写配置 → 展开 AI 面板 → 对话框状态关闭', async () => {
        setLlmWikiAiPanelCollapsed(true)
        const mounted = mountDialog()

        await mounted.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(readMock).toHaveBeenCalledWith('system')
        expect(writeMock).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ workspaceMode: 'llm-wiki' })
        )
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(workspaceModeSwitchState.busy).toBe(false)
    })

    it('点击确认但初始化失败：不写配置、保持原模式、对话框状态关闭', async () => {
        initializeLlmWikiMock.mockResolvedValue(false)
        const mounted = mountDialog()

        await mounted.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(writeMock).not.toHaveBeenCalled()
        expect(workspaceModeSwitchState.visible).toBe(false)
    })

    it('点击取消：不初始化、不写配置，关闭对话框状态', async () => {
        const mounted = mountDialog()

        await mounted.find('.btn-cancel').trigger('click')
        await flushPromises()

        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(writeMock).not.toHaveBeenCalled()
        expect(workspaceModeSwitchState.visible).toBe(false)
    })

    it('右上角关闭按钮 = 取消（不初始化、不写配置）', async () => {
        const mounted = mountDialog()

        await mounted.find('.close-btn').trigger('click')
        await flushPromises()

        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(writeMock).not.toHaveBeenCalled()
        expect(workspaceModeSwitchState.visible).toBe(false)
    })

    it('切换进行中（busy）两个按钮禁用，点击不触发重复初始化', async () => {
        workspaceModeSwitchState.busy = true
        const mounted = mountDialog()

        expect(mounted.find('.btn-cancel').attributes('disabled')).toBeDefined()
        expect(mounted.find('.btn-confirm').attributes('disabled')).toBeDefined()

        await mounted.find('.btn-confirm').trigger('click')
        await mounted.find('.btn-cancel').trigger('click')
        await flushPromises()

        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(workspaceModeSwitchState.visible).toBe(true)
        expect(workspaceModeSwitchState.busy).toBe(true)
    })
})
