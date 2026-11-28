// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L3：AI 编译 diff 审批 UI 单测（`components/Markdown/llm-ingest-diff.vue`）
 *
 * 覆盖：
 * 1. 打开即调用 AI.INGEST 并渲染「来源 → 目标」元信息 + 新增行高亮 + 新建/更新标记；
 * 2. 确认应用：调用 AI.APPLY_INGEST（approved=true、回传 draftPath/content），成功后展示写入路径；
 * 3. 失败路径：结构化失败（AI_NOT_CONFIGURED）显示错误 + 配置引导，且不调用 APPLY；
 * 4. 取消/关闭：只 emit close，不写盘（不调用 APPLY_INGEST）；
 * 5. 渲染上限：diff 行数超限时只渲染前 800 行并提示截断；
 * 6. 未挂载/visible=false 时不发起 IPC。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import LlmIngestDiff from '@renderer/components/Markdown/llm-ingest-diff.vue'
import { t } from '@renderer/common/i18n'
import { IPC } from '../../../src/shared/ipc-channels'

/** 构造成功草案（diff：1 上下文 + 1 新增 + 1 删除） */
function makeIngestSuccess(overrides: Record<string, unknown> = {}) {
    return {
        ok: true,
        draftPath: 'wiki/source.md',
        sourcePath: 'raw/source.md',
        content: '---\ntitle: 测试\n---\n\n# 测试\n',
        isUpdate: false,
        diffTruncated: false,
        model: 'fake-model',
        diff: [
            { type: 'context', content: '---', oldLine: 1, newLine: 1 },
            { type: 'del', content: '旧内容', oldLine: 2 },
            { type: 'add', content: '新内容', newLine: 2 },
            { type: 'add', content: '# 测试', newLine: 3 }
        ],
        ...overrides
    }
}

let invoke: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[] = []

/** 挂载组件（默认 visible=true 触发一次 ingest） */
function mountDiff(visible = true): VueWrapper {
    const wrapper = mount(LlmIngestDiff, {
        props: { visible },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
}

beforeEach(() => {
    invoke = vi.fn(async (channel: string) => {
        if (channel === IPC.AI.INGEST) {
            return makeIngestSuccess()
        }
        if (channel === IPC.AI.APPLY_INGEST) {
            return { ok: true, draftPath: 'wiki/source.md', bytes: 100 }
        }
        return undefined
    })
    vi.stubGlobal('electron', { ipcRenderer: { invoke } })
})

afterEach(() => {
    for (const wrapper of wrappers) {
        wrapper.unmount()
    }
    wrappers = []
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
})

describe('LlmIngestDiff：草案与 diff 展示', () => {
    it('打开即调用 AI.INGEST（无参），渲染来源/目标/新增行/新建标记', async () => {
        const wrapper = mountDiff()
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(IPC.AI.INGEST, {})
        const meta = wrapper.find('[data-testid="ingest-meta"]')
        expect(meta.exists()).toBe(true)
        expect(meta.text()).toContain('raw/source.md')
        expect(meta.text()).toContain('wiki/source.md')
        // 新建页面标记 + 新增/删除行统计
        expect(wrapper.find('[data-testid="ingest-badge"]').text()).toContain('新建')
        expect(wrapper.findAll('.diff-line.is-add')).toHaveLength(2)
        expect(wrapper.findAll('.diff-line.is-del')).toHaveLength(1)
        expect(wrapper.find('[data-testid="ingest-apply-btn"]').exists()).toBe(true)
    })

    it('更新既有页面时显示「更新」标记', async () => {
        invoke.mockResolvedValue(makeIngestSuccess({ isUpdate: true }))
        const wrapper = mountDiff()
        await flushPromises()
        expect(wrapper.find('[data-testid="ingest-badge"]').text()).toContain('更新')
    })

    it('diff 行数超限时只渲染前 800 行并提示截断', async () => {
        const diff = Array.from({ length: 900 }, (_, index) => ({
            type: 'add' as const,
            content: `line-${index}`,
            newLine: index + 1
        }))
        invoke.mockResolvedValue(makeIngestSuccess({ diff }))
        const wrapper = mountDiff()
        await flushPromises()

        expect(wrapper.findAll('.diff-line')).toHaveLength(800)
        expect(wrapper.find('[data-testid="ingest-truncated"]').exists()).toBe(true)
    })

    it('visible=false 不发起 IPC 调用', async () => {
        mountDiff(false)
        await flushPromises()
        expect(invoke).not.toHaveBeenCalled()
    })
})

describe('LlmIngestDiff：审批应用', () => {
    it('确认应用：调用 AI.APPLY_INGEST（approved=true）并展示写入路径', async () => {
        const wrapper = mountDiff()
        await flushPromises()

        await wrapper.find('[data-testid="ingest-apply-btn"]').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(IPC.AI.APPLY_INGEST, {
            draftPath: 'wiki/source.md',
            content: '---\ntitle: 测试\n---\n\n# 测试\n',
            approved: true
        })
        const applied = wrapper.find('[data-testid="ingest-applied"]')
        expect(applied.exists()).toBe(true)
        expect(applied.text()).toContain('wiki/source.md')
        // 已应用后不再显示应用按钮（防重复写盘）
        expect(wrapper.find('[data-testid="ingest-apply-btn"]').exists()).toBe(false)
    })

    it('应用失败：显示内联失败原因且不标记已应用', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.AI.INGEST) {
                return makeIngestSuccess()
            }
            return { ok: false, code: 'AI_TARGET_NOT_ALLOWED', message: '目标路径非法' }
        })
        const wrapper = mountDiff()
        await flushPromises()
        await wrapper.find('[data-testid="ingest-apply-btn"]').trigger('click')
        await flushPromises()

        const error = wrapper.find('[data-testid="ingest-apply-error"]')
        expect(error.exists()).toBe(true)
        expect(error.text()).toContain('目标路径非法')
        expect(wrapper.find('[data-testid="ingest-applied"]').exists()).toBe(false)
    })

    it('取消/关闭：只 emit close，不调用 AI.APPLY_INGEST', async () => {
        const wrapper = mountDiff()
        await flushPromises()

        const closeButton = wrapper.find('.btn-cancel')
        await closeButton.trigger('click')

        expect(invoke).not.toHaveBeenCalledWith(IPC.AI.APPLY_INGEST, expect.anything())
        expect(wrapper.emitted('close')).toBeTruthy()
    })
})

describe('LlmIngestDiff：失败与引导', () => {
    it('未配置（AI_NOT_CONFIGURED）显示错误与设置引导', async () => {
        invoke.mockResolvedValue({
            ok: false,
            code: 'AI_NOT_CONFIGURED',
            message: 'AI 助手未启用'
        })
        const wrapper = mountDiff()
        await flushPromises()

        const error = wrapper.find('[data-testid="ingest-error"]')
        expect(error.exists()).toBe(true)
        expect(error.text()).toContain('AI 助手未启用')
        expect(error.text()).toContain('AI 助手')
        // 失败时不显示应用按钮
        expect(wrapper.find('[data-testid="ingest-apply-btn"]').exists()).toBe(false)
    })

    it('无工作区（AI_WORKSPACE_UNAVAILABLE）显示初始化引导', async () => {
        invoke.mockResolvedValue({
            ok: false,
            code: 'AI_WORKSPACE_UNAVAILABLE',
            message: '缺少 raw/ 目录'
        })
        const wrapper = mountDiff()
        await flushPromises()
        const error = wrapper.find('[data-testid="ingest-error"]')
        expect(error.text()).toContain('raw/')
        expect(error.text()).toContain('初始化')
    })

    it('IPC 抛异常时显示错误提示（不崩溃）', async () => {
        invoke.mockRejectedValue(new Error('IPC 通道不可用'))
        const wrapper = mountDiff()
        await flushPromises()
        expect(wrapper.find('[data-testid="ingest-error"]').exists()).toBe(true)
    })

    it('主进程返回非法结构（null / 缺字段）→ 显示未知错误（防御性守卫）', async () => {
        invoke.mockResolvedValue(null)
        const first = mountDiff()
        await flushPromises()
        expect(first.find('[data-testid="ingest-error"]').text()).toContain(
            t('editorUi.llmIngest.loadFailed', { error: '' }).replace(': ', '')
        )

        invoke.mockResolvedValue({ ok: true, draftPath: '', content: '', sourcePath: '' })
        const second = mountDiff()
        await flushPromises()
        expect(second.find('[data-testid="ingest-error"]').exists()).toBe(true)
    })

    it('结构化失败缺少 message 时回退展示 code，且未知 code 不显示引导', async () => {
        invoke.mockResolvedValue({ ok: false, code: 'AI_HTTP_ERROR' })
        const wrapper = mountDiff()
        await flushPromises()
        const error = wrapper.find('[data-testid="ingest-error"]')
        expect(error.text()).toContain('AI_HTTP_ERROR')
        // 未知 code 不显示「未配置/未初始化」引导（error-hint 不渲染）
        expect(error.find('.ingest-error-hint').exists()).toBe(false)
    })

    it('受限 ipcRenderer 不可用 → 显示不可用提示（不发起调用）', async () => {
        vi.stubGlobal('electron', undefined)
        const wrapper = mountDiff()
        await flushPromises()
        expect(invoke).not.toHaveBeenCalled()
        expect(wrapper.find('[data-testid="ingest-error"]').text()).toContain(
            t('editorUi.llmIngest.ipcUnavailable')
        )
    })

    it('应用写盘抛异常 → 显示失败原因（不崩溃）', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.AI.INGEST) {
                return makeIngestSuccess()
            }
            throw new Error('写入被拒绝')
        })
        const wrapper = mountDiff()
        await flushPromises()
        await wrapper.find('[data-testid="ingest-apply-btn"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="ingest-apply-error"]').text()).toContain('写入被拒绝')
    })

    it('应用进行中点击关闭被忽略（防关闭竞态）', async () => {
        let resolveApply: (value: unknown) => void = () => {}
        invoke.mockImplementation((channel: string) => {
            if (channel === IPC.AI.INGEST) {
                return Promise.resolve(makeIngestSuccess())
            }
            return new Promise((resolve) => {
                resolveApply = resolve
            })
        })
        const wrapper = mountDiff()
        await flushPromises()
        await wrapper.find('[data-testid="ingest-apply-btn"]').trigger('click')
        await flushPromises()

        // 写盘进行中：点击关闭不 emit close（避免请求悬挂/竞态）
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toBeFalsy()

        // 收尾：完成写盘，避免测试挂起
        resolveApply({ ok: true, draftPath: 'wiki/source.md', bytes: 10 })
        await flushPromises()
    })

    it('返回空对象（既非成功也非失败）→ 显示未知错误', async () => {
        invoke.mockResolvedValue({})
        const wrapper = mountDiff()
        await flushPromises()
        expect(wrapper.find('[data-testid="ingest-error"]').exists()).toBe(true)
    })

    it('diff 数组含非法项时只渲染合法行（防御性过滤）', async () => {
        invoke.mockResolvedValue(
            makeIngestSuccess({
                diff: [
                    { type: 'add', content: '合法行', newLine: 1 },
                    null,
                    { type: 'unknown', content: '非法类型' },
                    { type: 'context' }
                ]
            })
        )
        const wrapper = mountDiff()
        await flushPromises()
        expect(wrapper.findAll('.diff-line')).toHaveLength(1)
        expect(wrapper.find('.diff-line-content').text()).toBe('合法行')
    })

    it('草案与 diff 均为空时显示空态提示', async () => {
        invoke.mockResolvedValue(makeIngestSuccess({ content: '', diff: [] }))
        const wrapper = mountDiff()
        await flushPromises()
        expect(wrapper.findAll('.diff-line')).toHaveLength(0)
        expect(wrapper.text()).toContain(t('editorUi.llmIngest.empty'))
    })

    it('应用阶段受限 ipcRenderer 不可用 → 显示不可用提示', async () => {
        const wrapper = mountDiff()
        await flushPromises()
        // 生成成功后移除 electron 桩，模拟 preload 不可用
        vi.stubGlobal('electron', undefined)
        await wrapper.find('[data-testid="ingest-apply-btn"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="ingest-apply-error"]').text()).toContain(
            t('editorUi.llmIngest.ipcUnavailable')
        )
    })
})
