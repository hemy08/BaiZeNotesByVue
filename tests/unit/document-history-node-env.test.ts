/**
 * A3 文档历史组合式函数「无 DOM 环境」降级单测（node 环境）
 *
 * 覆盖任务对 renderer-only MVP 的底线要求：在无 window/document 的运行环境
 * （node 单测、极早期启动阶段）调用内容桥/历史能力不得抛错，一律安全降级。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    disposeDocumentHistoryFeature,
    documentHistoryState,
    loadActiveDocumentHistory,
    openFileHistoryDialog,
    readActiveMarkdownContent,
    setActiveMarkdownContentProvider
} from '../../src/renderer/src/composables/useDocumentHistory'
import { useFeatureFlags } from '../../src/renderer/src/composables/useFeatureFlags'

beforeEach(() => {
    disposeDocumentHistoryFeature()
    setActiveMarkdownContentProvider(null)
    useFeatureFlags().flags.documentHistory = false
})

afterEach(() => {
    disposeDocumentHistoryFeature()
    setActiveMarkdownContentProvider(null)
})

describe('无 DOM 环境安全降级', () => {
    it('内容桥无 provider/无编辑器/无路径时返回空文档', async () => {
        await expect(readActiveMarkdownContent()).resolves.toEqual({
            content: '',
            source: 'empty'
        })
    })

    it('注入 provider 时仍可读取内容（不依赖 DOM）', async () => {
        setActiveMarkdownContentProvider(() => '# 内容')
        await expect(readActiveMarkdownContent()).resolves.toEqual({
            content: '# 内容',
            source: 'editor'
        })
    })

    it('历史对话框/加载在无 window 环境安全降级', async () => {
        expect(await openFileHistoryDialog()).toBe(false)
        await loadActiveDocumentHistory()
        expect(documentHistoryState.status).toBe('idle')
    })
})
