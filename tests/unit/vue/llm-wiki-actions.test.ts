// @vitest-environment jsdom
/**
 * 渲染层入口动作 `common/llm-wiki-actions.ts` 单测（1.5.7 LLM Wiki L1）
 *
 * 覆盖点：
 * 1. 成功：invoke 白名单通道 `baize:file:initialize-llm-wiki`，展示成功提示并返回 true；
 * 2. 主进程失败（success=false + error）：展示含原因的失败提示并返回 false；
 * 3. 失败但无 error 字段：回退通用「未知」文案；
 * 4. 非对象/非法返回：按失败处理（结构守卫）；
 * 5. 受限 ipcRenderer 不可用：不抛异常，展示「环境不支持」提示；
 * 6. invoke 抛异常：错误详情去掉 Electron 包装前缀后展示；
 * 7. 1.5.7 体验优化：`silent: true` 成功不弹模态提示（供模式直切复用），失败仍弹错误提示。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initializeLlmWiki } from '@renderer/common/llm-wiki-actions'
import { getConfigStore } from '@renderer/common/useConfigStore'
import { t } from '@renderer/common/i18n'

const store = getConfigStore()

/** 断言最近一条消息对话框（showAppSuccess/showAppError 均走 useConfigStore.showDialog） */
function messageDialog() {
    return store.dialogs.messageDialog
}

let invoke: ReturnType<typeof vi.fn>

beforeEach(() => {
    invoke = vi.fn().mockResolvedValue({ success: true })
    vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    store.hideDialog('message')
})

afterEach(() => {
    store.hideDialog('message')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('initializeLlmWiki：渲染层入口动作', () => {
    it('成功：调用白名单通道并展示成功提示，返回 true', async () => {
        const ok = await initializeLlmWiki()

        expect(ok).toBe(true)
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke).toHaveBeenCalledWith('baize:file:initialize-llm-wiki')
        expect(messageDialog().visible).toBe(true)
        expect(messageDialog().type).toBe('success')
        expect(messageDialog().title).toBe(t('menu.file.initializeLlmWiki'))
        expect(messageDialog().message).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeInitSuccess')
        )
    })

    it('主进程返回 success=false：展示含原因的失败提示，返回 false', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const reason = '尚未打开工作区，无法初始化 LLM Wiki。'
        invoke.mockResolvedValue({ success: false, error: reason })

        const ok = await initializeLlmWiki()

        expect(ok).toBe(false)
        expect(errorSpy).toHaveBeenCalled()
        expect(messageDialog().visible).toBe(true)
        expect(messageDialog().type).toBe('error')
        expect(messageDialog().message).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeInitFailed', { error: reason })
        )
    })

    it('silent: true 成功：不弹模态提示（供模式直切后用 Toast 反馈），仍返回 true', async () => {
        const ok = await initializeLlmWiki({ silent: true })

        expect(ok).toBe(true)
        expect(invoke).toHaveBeenCalledWith('baize:file:initialize-llm-wiki')
        expect(messageDialog().visible).toBe(false)
    })

    it('silent: true 失败：错误提示仍弹出（silent 只抑制成功模态框，失败必须可见）', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const reason = '磁盘空间不足'
        invoke.mockResolvedValue({ success: false, error: reason })

        const ok = await initializeLlmWiki({ silent: true })

        expect(ok).toBe(false)
        expect(errorSpy).toHaveBeenCalled()
        expect(messageDialog().visible).toBe(true)
        expect(messageDialog().type).toBe('error')
        expect(messageDialog().message).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeInitFailed', { error: reason })
        )
    })

    it('失败且无 error 字段（返回 undefined）：回退「未知」文案', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockResolvedValue(undefined)

        const ok = await initializeLlmWiki()

        expect(ok).toBe(false)
        expect(errorSpy).toHaveBeenCalled()
        expect(messageDialog().message).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeInitFailed', {
                error: t('common.unknown')
            })
        )
    })

    it('受限 ipcRenderer 不可用：展示环境不支持提示，不抛异常', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.stubGlobal('window', { electron: undefined })

        const ok = await initializeLlmWiki()

        expect(ok).toBe(false)
        expect(invoke).not.toHaveBeenCalled()
        expect(errorSpy).toHaveBeenCalled()
        expect(messageDialog().type).toBe('error')
        expect(messageDialog().message).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeInitUnavailable')
        )
    })

    it('invoke 抛异常：归一化错误详情后展示失败提示', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValue(
            new Error(
                "Error invoking remote method 'baize:file:initialize-llm-wiki': Error: 通道不可用"
            )
        )

        const ok = await initializeLlmWiki()

        expect(ok).toBe(false)
        expect(errorSpy).toHaveBeenCalled()
        expect(messageDialog().type).toBe('error')
        expect(messageDialog().message).toContain('通道不可用')
        expect(messageDialog().message).not.toContain('Error invoking remote method')
    })
})
