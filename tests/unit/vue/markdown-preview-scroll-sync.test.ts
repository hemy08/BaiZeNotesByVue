// @vitest-environment jsdom
/**
 * MarkdownPreviewComponent 滚动同步集成测试（1.5.0：编辑器 → 预览单向同步）。
 *
 * 覆盖用户确认方案中的预览侧行为：
 * 1. 目标应用：按 `data-source-line` 锚点（二分）滚动到对应块；
 * 2. 无锚点时按 ratio × 最大滚动距离兜底；
 * 3. 隐藏预览不同步（只记录目标，恢复可见后补上）；
 * 4. seq 去重：过期目标不得覆盖新位置；父组件清除目标（null）后 seq 基准复位；
 * 5. 内容重渲染后的 nextTick 重放最后目标（输入不把预览拉回顶部）；
 * 6. 空内容跳过，不产生无意义跳动。
 *
 * 说明：jsdom 无布局，测试通过 defineProperty 注入 scrollHeight/clientHeight，
 * 并给锚点元素注入「随容器 scrollTop 平移」的 getBoundingClientRect 桩，模拟真实滚动几何。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'

const renderMocks = vi.hoisted(() => ({
    PreMarkdownRender: vi.fn(),
    PostMarkdownRender: vi.fn(),
    ParserMarkdownChapters: vi.fn()
}))

vi.mock('@renderer/components/Markdown/hemy-editor-render', () => renderMocks)

import MarkdownPreviewComponent from '@renderer/components/Markdown/MarkdownPreviewComponent.vue'

interface IpcMock {
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
}

let ipcRenderer: IpcMock
let wrapper: VueWrapper | null = null
let host: HTMLDivElement | null = null
/** 当前测试注入几何的预览容器（原型级矩形桩按它换算锚点位置） */
let geometryContainer: HTMLElement | null = null
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

/** 预览内容：行号与锚点一一对应，便于断言映射精度 */
const SAMPLE_CONTENT = ['# 标题一', '', '正文一', '', '## 标题二', '', '正文二', ''].join('\n')

beforeEach(() => {
    renderMocks.PreMarkdownRender.mockReset()
    renderMocks.PreMarkdownRender.mockImplementation(async (text: string) => text)
    renderMocks.PostMarkdownRender.mockReset()
    renderMocks.PostMarkdownRender.mockImplementation((text: string) => text)
    renderMocks.ParserMarkdownChapters.mockReset()

    ipcRenderer = {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn().mockResolvedValue(''),
        removeListener: vi.fn()
    }
    vi.stubGlobal('electron', { ipcRenderer })
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue(null), write: vi.fn().mockResolvedValue(true) }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    host?.remove()
    host = null
    geometryContainer = null
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 等待 150ms 渲染防抖 + 异步渲染链路落定 + nextTick 重放 */
async function waitForPreview(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 240))
    await flushPromises()
    await flushPromises()
}

/** 取得预览滚动容器（根模板含顶层注释 -> 组件为 fragment root，必须按 id 取真实容器） */
function getContainer(): HTMLElement {
    const container = document.getElementById('markdown-preview-html')
    expect(container, '预览滚动容器应已渲染').not.toBeNull()
    return container as HTMLElement
}

/**
 * 注入预览几何：容器可滚动区域 1500px；每个 `[data-source-line]` 元素按源行号 × 100 定位，
 * 且 rect.top 随容器 scrollTop 平移（等价真实浏览器滚动后的可视位置）。
 *
 * 原型级桩的意义：预览 v-html 每轮渲染都会重建锚点元素，实例级 rect 桩会随重渲染失效，
 * 原型桩可在整轮用例内持续生效（覆盖「渲染完成 -> nextTick 重放」路径重新测量）。
 */
function installPreviewGeometry(container: HTMLElement): void {
    geometryContainer = container
    Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true })
    container.getBoundingClientRect = () =>
        ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect
    Element.prototype.getBoundingClientRect = function patchedRect(this: Element): DOMRect {
        const element = this as HTMLElement
        const rawLine = element.getAttribute?.('data-source-line')
        if (rawLine && geometryContainer) {
            const line = Number.parseInt(rawLine, 10)
            const top = line * 100 - geometryContainer.scrollTop
            return {
                top,
                left: 0,
                right: 0,
                bottom: top,
                width: 0,
                height: 0,
                x: 0,
                y: top
            } as DOMRect
        }
        return originalGetBoundingClientRect.call(this)
    }
}

/** 挂载预览并等待首轮渲染 */
async function mountPreview(
    props: Record<string, unknown> = {},
    extra: { attach?: boolean } = {}
): Promise<VueWrapper> {
    host = document.createElement('div')
    document.body.appendChild(host)
    wrapper = mount(MarkdownPreviewComponent, {
        props: { editorContent: SAMPLE_CONTENT, active: true, activeFilePath: '', ...props },
        attachTo: extra.attach === false ? undefined : host
    })
    await waitForPreview()
    return wrapper
}

/** 向预览派发一个同步目标（等价父组件 prop 更新） */
async function sendTarget(
    mounted: VueWrapper,
    target: { line: number; ratio: number; seq: number } | null
): Promise<void> {
    await mounted.setProps({ syncScrollTarget: target })
    await flushPromises()
}

describe('MarkdownPreviewComponent：编辑器 → 预览滚动同步', () => {
    it('按 data-source-line 锚点二分映射并写入 scrollTop（不做 smooth 动画）', async () => {
        const mounted = await mountPreview()
        const container = getContainer()
        installPreviewGeometry(container)

        await sendTarget(mounted, { line: 5, ratio: 0, seq: 1 })
        // 第 5 行是「## 标题二」：位置 = 5 × 100 = 500（= 锚点偏移），在 1500 可滚动范围内
        expect(container.scrollTop).toBe(500)

        // 源码行落在两个块之间：取最近的前一个块（第 3 行段落）
        await sendTarget(mounted, { line: 4, ratio: 0, seq: 2 })
        expect(container.scrollTop).toBe(300)

        // 目标行小于首行：无「≤ 目标行」的锚点 -> 走比例兜底（ratio 0 => 顶部）
        await sendTarget(mounted, { line: 1, ratio: 0, seq: 3 })
        expect(container.scrollTop).toBe(100)
    })

    it('无锚点时按 ratio × (scrollHeight - clientHeight) 比例兜底', async () => {
        const mounted = await mountPreview()
        const container = getContainer()
        // 模拟锚点缺失：清掉所有行号属性后再同步（首次同步时收集 -> 空锚点）
        for (const element of Array.from(container.querySelectorAll('[data-source-line]'))) {
            element.removeAttribute('data-source-line')
        }
        installPreviewGeometry(container)

        await sendTarget(mounted, { line: 99, ratio: 0.5, seq: 1 })
        expect(container.scrollTop).toBe(750) // 0.5 × 1500

        await sendTarget(mounted, { line: 99, ratio: 1, seq: 2 })
        expect(container.scrollTop).toBe(1500)
    })

    it('隐藏预览不同步；恢复可见后重放最后目标', async () => {
        const mounted = await mountPreview({ active: false })
        const container = getContainer()
        installPreviewGeometry(container)

        await sendTarget(mounted, { line: 5, ratio: 0, seq: 1 })
        expect(container.scrollTop).toBe(0)

        await mounted.setProps({ active: true })
        await waitForPreview()
        installPreviewGeometry(container)
        expect(container.scrollTop).toBe(500)
    })

    it('seq 去重：过期目标不覆盖新位置；目标清除后 seq 基准复位', async () => {
        const mounted = await mountPreview()
        const container = getContainer()
        installPreviewGeometry(container)

        await sendTarget(mounted, { line: 7, ratio: 0, seq: 5 })
        expect(container.scrollTop).toBe(700)

        // 旧目标晚到（seq 更小）必须被丢弃
        await sendTarget(mounted, { line: 1, ratio: 0, seq: 4 })
        expect(container.scrollTop).toBe(700)

        // 父组件清除目标（切换文件/隐藏预览）后，新文件 seq 从 1 开始也能应用
        await sendTarget(mounted, null)
        await sendTarget(mounted, { line: 3, ratio: 0, seq: 1 })
        expect(container.scrollTop).toBe(300)
    })

    it('内容重渲染后 nextTick 重放最后目标（输入不把预览拉回顶部）', async () => {
        const mounted = await mountPreview()
        const container = getContainer()
        installPreviewGeometry(container)

        await sendTarget(mounted, { line: 7, ratio: 0, seq: 2 })
        expect(container.scrollTop).toBe(700)

        // 模拟浏览器整篇替换 v-html 后滚动位置被重置
        container.scrollTop = 0
        // 追加正文触发重渲染（行号不变，锚点几何不变）
        await mounted.setProps({ editorContent: `${SAMPLE_CONTENT}\n追加正文\n` })
        await waitForPreview()
        installPreviewGeometry(container)
        expect(container.scrollTop).toBe(700)
    })

    it('空内容跳过：不写入 scrollTop，内容出现后重放目标', async () => {
        const mounted = await mountPreview({ editorContent: '' })
        const container = getContainer()
        installPreviewGeometry(container)

        await sendTarget(mounted, { line: 5, ratio: 0.5, seq: 1 })
        expect(container.scrollTop).toBe(0)

        await mounted.setProps({ editorContent: SAMPLE_CONTENT })
        await waitForPreview()
        installPreviewGeometry(container)
        expect(container.scrollTop).toBe(500)
    })

    it('挂载时已带目标：挂载前容器未就绪不报错，渲染完成后应用目标', async () => {
        // 模拟「编辑器先滚动、预览 chunk 后挂载」：初始 prop 就带目标（immediate watch 在
        // setup 阶段执行时 previewRoot 还没绑定，容器分支必须安全返回而不是抛错）
        const mounted = await mountPreview({
            syncScrollTarget: { line: 5, ratio: 0, seq: 1 }
        })
        const container = getContainer()
        installPreviewGeometry(container)

        // 触发一轮重渲染，让锚点缓存失效并在渲染完成后的 nextTick 重放目标
        await mounted.setProps({ editorContent: `${SAMPLE_CONTENT}\n\n补充段落\n` })
        await waitForPreview()
        installPreviewGeometry(container)
        expect(container.scrollTop).toBe(500)
    })
})
