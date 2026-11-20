// @vitest-environment jsdom
/**
 * MarkdownPreviewComponent 单跳渲染链路测试（PF-02）
 *
 * 覆盖：
 * 1. 预览组件不再订阅/发送 PRE_RENDER / POST_RENDER 主进程渲染通道，
 *    完整本地链路（PRE 变换 → PreMarkdownRender → md.render → POST 变换 → DOMPurify）
 *    渲染一次内容时 ipcRenderer.send / invoke 调用次数均为 0；
 * 2. KaTeX 公式、mkdocs-material 语法（!!! admonition / === tabbed set，由 markdown-it 插件
 *    解析）、图片/文件相对 URL 绝对化在组件输出 HTML 中生效（URL 依赖既有 USER_SELECT_FILE
 *    事件提供当前文件路径）；
 * 3. DOMPurify 消毒链路保持：恶意内联事件属性被剥离（CMP-15），且 tab 的
 *    input/label/checked/name/id 结构在消毒后仍保留（可交互）。
 *
 * 说明：mock hemy-editor-render 的渲染门面（MarkdownPreviewComponent 自「结构优化第 2 批
 * 2.2（H4）」起直接依赖渲染模块，不再经含 Monaco 的 hemy-editor 聚合桶，避免预览 chunk
 * 重新引入 Monaco）；组件自身用到的 markdown-it / katex / DOMPurify 均为真实实现。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const renderMocks = vi.hoisted(() => ({
    PreMarkdownRender: vi.fn(),
    PostMarkdownRender: vi.fn(),
    ParserMarkdownChapters: vi.fn()
}))

vi.mock('@renderer/components/Markdown/hemy-editor-render', () => renderMocks)

import MarkdownPreviewComponent from '@renderer/components/Markdown/MarkdownPreviewComponent.vue'
import {
    setPreviewActiveFilePath,
    setPreviewAllowRemoteImages
} from '@renderer/components/Markdown/preview-local-render'

beforeAll(async () => {
    // P1-8：KaTeX 改为按需动态加载（首次 import 触发模块 transform）。
    // 这里预热一次真实 katex 模块，避免 150/200ms 防抖窗口内首次 transform 抖动导致用例偶发失败。
    await import('katex')
})

const USER_SELECT_FILE_CHANNEL = 'baize:file:user-select-file'
const SYSTEM_SETTING_UPDATE_CHANNEL = 'baize:setting:updated'

/** 等待组件 150ms 预览防抖 + 异步渲染链路完成 */
async function waitForDebouncedRender(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200))
    await flushPromises()
}

describe('MarkdownPreviewComponent 预览单跳渲染（PF-02）', () => {
    let ipcRenderer: {
        on: ReturnType<typeof vi.fn>
        send: ReturnType<typeof vi.fn>
        invoke: ReturnType<typeof vi.fn>
        removeListener: ReturnType<typeof vi.fn>
    }
    let wrapper: ReturnType<typeof mount> | null = null

    beforeEach(() => {
        ipcRenderer = {
            on: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn(),
            removeListener: vi.fn()
        }
        // 与既有 Vue 组件测试一致：以 preload 暴露形态 stub 全局 electron
        vi.stubGlobal('electron', { ipcRenderer })
        // AS-9：预览挂载后会经 config:read('system') 读取远程图片策略；
        // 默认场景返回 null（无存储值），预览按安全默认（不加载远程图片）渲染
        vi.stubGlobal('api', {
            config: {
                read: vi.fn().mockResolvedValue(null),
                write: vi.fn().mockResolvedValue(true)
            }
        })
        // 模块级活动文件路径在用例间复位，避免上一个用例的路径串味
        setPreviewActiveFilePath(null)
        // AS-9：远程图片策略复位为安全默认（不加载远程图片），避免用例间串味
        setPreviewAllowRemoteImages(false)
        renderMocks.PreMarkdownRender.mockReset()
        renderMocks.PreMarkdownRender.mockImplementation(async (text: string) => text)
        renderMocks.PostMarkdownRender.mockReset()
        renderMocks.PostMarkdownRender.mockImplementation((text: string) => text)
        renderMocks.ParserMarkdownChapters.mockReset()
    })

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    function mountPreview(editorContent: string, active = true, activeFilePath = '') {
        wrapper = mount(MarkdownPreviewComponent, {
            props: { editorContent, active, activeFilePath },
            attachTo: document.body
        })
        return wrapper
    }

    /** 取出组件注册的 USER_SELECT_FILE 回调并模拟主进程下发当前文件路径 */
    function emitActiveFilePath(filePath: string) {
        const call = ipcRenderer.on.mock.calls.find((args) => args[0] === USER_SELECT_FILE_CHANNEL)
        expect(call, 'USER_SELECT_FILE 监听应已注册').toBeTruthy()
        ;(call![1] as (event: unknown, path: string) => void)(null, filePath)
    }

    it('should render locally without PRE_RENDER/POST_RENDER IPC round trips', async () => {
        const content = [
            '# 标题',
            '',
            '行内公式 $x^2$',
            '',
            '!!! note "提示"',
            '    这是内容',
            '',
            '=== "页甲"',
            '    第一页内容',
            '',
            '![alt](./img/a.png)',
            '',
            '[文档](./a.md)'
        ].join('\n')

        mountPreview(content)
        // 相对路径转换为 file:// 绝对 URL（FE-12）：file:// 协议既可通过 DOMPurify 默认 URI
        // 白名单（f|ht)tps? 分支），又能被浏览器正常解析（修复 Windows 盘符路径被剥离、图片不显示）
        emitActiveFilePath('/home/user/notes/file.md')
        await waitForDebouncedRender()

        const html = wrapper!.html()

        // KaTeX 在渲染层输出（真实 katex 实现）
        expect(html).toContain('class="katex"')
        // Material Admonitions / Tabbed Set 变换生效
        expect(html).toContain('admonition note')
        expect(html).toContain('tabbed-set tabbed-alternate')
        // 相对图片/文件链接已按当前活动文件绝对化
        expect(html).toContain('src="file:///home/user/notes/img/a.png"')
        expect(html).toContain('href="file:///home/user/notes/a.md"')

        // PF-02 核心证据：预览渲染不再有任何主进程渲染 IPC 调用
        expect(ipcRenderer.send).toHaveBeenCalledTimes(0)
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(0)
        // 只订阅既有 USER_SELECT_FILE 事件与 AS-9 的系统设置变更广播
        expect(ipcRenderer.on).toHaveBeenCalledTimes(2)
        expect(ipcRenderer.on.mock.calls.map((args) => args[0])).toEqual([
            USER_SELECT_FILE_CHANNEL,
            SYSTEM_SETTING_UPDATE_CHANNEL
        ])
        // 本地链路确实走过 PreMarkdownRender / PostMarkdownRender / 章节解析
        expect(renderMocks.PreMarkdownRender).toHaveBeenCalledTimes(1)
        expect(renderMocks.PostMarkdownRender).toHaveBeenCalledTimes(1)
        expect(renderMocks.ParserMarkdownChapters).toHaveBeenCalledTimes(1)
    })

    /**
     * TDZ 回归（P0 缺陷）：预览在「文件已打开之后」才挂载（启动恢复 / 异步 chunk 时序）时，
     * activeFilePath prop 首次渲染即为非空，setup 内 immediate watcher 会直接调用
     * updateMarkdownPreview；修复前 `let renderSequence = 0` 声明在 watchers 之后，
     * 渲染函数同步段执行 `++renderSequence` 会抛
     * `Cannot access 'renderSequence' before initialization`（未捕获 ReferenceError）。
     * 断言方式：不等待 150ms 防抖，immediate watcher 的补渲应在微任务内完成一次真实渲染。
     */
    it('should render on first mount when activeFilePath is already set (renderSequence TDZ regression)', async () => {
        mountPreview('# 首挂立即渲染', true, '/home/user/notes/startup-restore.md')
        await flushPromises()
        // 修复前：TDZ 异常中断本轮渲染，PreMarkdownRender 调用数为 0，预览保持空
        expect(renderMocks.PreMarkdownRender).toHaveBeenCalledTimes(1)
        expect(wrapper!.html()).toContain('首挂立即渲染')
    })

    it('should keep relative URLs untouched when no active file path was received', async () => {
        mountPreview('![alt](./img/a.png)')
        await waitForDebouncedRender()

        expect(wrapper!.html()).toContain('src="./img/a.png"')
        expect(ipcRenderer.send).toHaveBeenCalledTimes(0)
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(0)
    })

    it('should render mkdocs-material admonition/tabbed structure after DOMPurify', async () => {
        const content = [
            '!!! Success "位运算解法"',
            '',
            '    === "C异或"',
            '        ```c',
            '        int singleNumber(int* nums, int numsSize){ return 0; }',
            '        ```',
            '',
            '    === "Go异或"',
            '        ```go',
            '        func singleNumber(nums []int) int { return 0 }',
            '        ```'
        ].join('\n')

        mountPreview(content)
        await waitForDebouncedRender()

        const html = wrapper!.html()
        // admonition 卡片 + tab 结构（DOMPurify 后仍保留 radio/label/checked/name/id）
        expect(html).toContain('class="admonition success"')
        expect(html).toContain('admonition-title')
        expect(html).toContain('tabbed-set tabbed-alternate')
        expect(html).toContain('type="radio"')
        expect(html).toContain('name="__tabbed_1"')
        expect(html).toContain('id="__tabbed_1_1"')
        expect(html).toContain('checked')
        expect(html).toContain('for="__tabbed_1_1"')
        expect((html.match(/class="tabbed-block"/g) ?? []).length).toBe(2)
        // tab 内代码围栏经 highlight.js 高亮，裸 ``` 不再出现
        expect(html).toContain('hljs language-c')
        expect(html).toContain('hljs language-go')
        expect(html).not.toContain('```')
    })

    it('should prefetch cold highlight.js fence languages before render (first render highlighted)', async () => {
        // P1-8 后续：围栏冷门语言在渲染前异步预取（与 KaTeX 同一位置），首轮同步渲染即高亮，
        // 不存在「先转义、下一轮才高亮」的闪烁或半渲染。
        const content = ['```lua', 'local answer = 42', '```'].join('\n')

        mountPreview(content)
        await waitForDebouncedRender()

        const html = wrapper!.html()
        expect(html).toContain('hljs language-lua')
        expect(html).toContain('hljs-keyword')
        expect(html).not.toContain('```')
    })

    it('should sanitize rendered html with DOMPurify (CMP-15)', async () => {
        mountPreview('<img src="x" onerror="alert(1)"><script>alert(2)</script>')
        await waitForDebouncedRender()

        const html = wrapper!.html()
        expect(html).not.toContain('onerror')
        expect(html).not.toContain('<script>')
        expect(html).toContain('<img')
    })

    it('should unregister the active-file listener on unmount', async () => {
        const mounted = mountPreview('# 标题')
        await waitForDebouncedRender()
        mounted.unmount()
        wrapper = null

        expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
            USER_SELECT_FILE_CHANNEL,
            expect.any(Function)
        )
        // AS-9：系统设置变更监听同样在卸载时解绑
        expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
            SYSTEM_SETTING_UPDATE_CHANNEL,
            expect.any(Function)
        )
    })

    // ==================== P1/PF-2：隐藏跳过 / 内容未变跳过 / 大纲增量 ====================

    it('should skip the whole render pipeline while hidden and render once when activated', async () => {
        const mounted = mountPreview('# 隐藏时标题', false)

        // 隐藏状态：防抖到期也不执行任何渲染步骤
        await new Promise((resolve) => setTimeout(resolve, 250))
        await flushPromises()
        expect(renderMocks.PreMarkdownRender).toHaveBeenCalledTimes(0)
        expect(mounted.html()).not.toContain('隐藏时标题')

        // 变为可见：立即补渲一次（无需再等 150ms 防抖）
        await mounted.setProps({ active: true })
        await flushPromises()
        await new Promise((resolve) => setTimeout(resolve, 30))
        await flushPromises()

        expect(renderMocks.PreMarkdownRender).toHaveBeenCalledTimes(1)
        expect(mounted.html()).toContain('隐藏时标题')
    })

    it('should not re-render when content reverts to the last rendered content', async () => {
        const mounted = mountPreview('# 标题甲')
        await waitForDebouncedRender()
        expect(renderMocks.PreMarkdownRender).toHaveBeenCalledTimes(1)

        // 在防抖窗口内改回已渲染内容：待执行渲染被取消，整轮跳过
        await mounted.setProps({ editorContent: '# 标题乙' })
        await mounted.setProps({ editorContent: '# 标题甲' })
        await waitForDebouncedRender()

        expect(renderMocks.PreMarkdownRender).toHaveBeenCalledTimes(1)
        expect(mounted.html()).toContain('标题甲')
        expect(mounted.html()).not.toContain('标题乙')
    })

    it('should skip the second full parse for chapters when headings are unchanged (PF-2)', async () => {
        const mounted = mountPreview('# 标题\n\n正文甲')
        await waitForDebouncedRender()
        expect(renderMocks.ParserMarkdownChapters).toHaveBeenCalledTimes(1)

        // 仅正文变化（标题行号/内容不变）：不再执行第二次全文解析
        await mounted.setProps({ editorContent: '# 标题\n\n正文乙' })
        await waitForDebouncedRender()
        expect(renderMocks.ParserMarkdownChapters).toHaveBeenCalledTimes(1)
        expect(mounted.html()).toContain('正文乙')

        // 标题变化：触发一次大纲解析
        await mounted.setProps({ editorContent: '# 新标题\n\n正文乙' })
        await waitForDebouncedRender()
        expect(renderMocks.ParserMarkdownChapters).toHaveBeenCalledTimes(2)
    })

    // ==================== P2/PF-9：超大文档降级 ====================

    it('should degrade large documents: skip KaTeX/diagrams and show a one-time notice (PF-9)', async () => {
        // 超过 2 MiB 阈值（单段超长文本，markdown-it 解析成本低，测试仍很快）
        const hugeContent = '$x^2$ ' + 'a'.repeat(2 * 1024 * 1024 + 16)
        mountPreview(hugeContent)
        await waitForDebouncedRender()

        // 降级：跳过 KaTeX（公式保持原文）与图表渲染（PreMarkdownRender 收到 skipDiagrams）
        expect(renderMocks.PreMarkdownRender).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ skipDiagrams: true })
        )
        const html = wrapper!.html()
        expect(html).not.toContain('class="katex"')
        expect(html).toContain('$x^2$')
        // 预览顶部显示「文档过大，预览已简化」提示条（中英随语言，默认中文）
        expect(html).toContain('preview-degraded-notice')
        expect(html).toContain('文档过大，预览已简化')
    })

    it('should not degrade normal-size documents (PF-9)', async () => {
        mountPreview('# 标题\n\n行内公式 $x^2$')
        await waitForDebouncedRender()

        expect(renderMocks.PreMarkdownRender).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ skipDiagrams: false })
        )
        const html = wrapper!.html()
        expect(html).toContain('class="katex"')
        expect(html).not.toContain('preview-degraded-notice')
    })
})

/* ==================== AS-9：远程图片隐私开关（组件级） ====================
 * 覆盖：默认拦截远程图片并输出占位块（不保留原始 URL）；系统设置 allowRemoteImages=true
 * 时正常加载；运行期收到 system-setting-update 广播后即时按新策略重渲；本地/data 图片不受影响。
 */
describe('AS-9 远程图片隐私（MarkdownPreviewComponent）', () => {
    let ipcRenderer: {
        on: ReturnType<typeof vi.fn>
        send: ReturnType<typeof vi.fn>
        invoke: ReturnType<typeof vi.fn>
        removeListener: ReturnType<typeof vi.fn>
    }
    let wrapper: ReturnType<typeof mount> | null = null
    let configRead: ReturnType<typeof vi.fn>

    beforeEach(() => {
        ipcRenderer = {
            on: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn(),
            removeListener: vi.fn()
        }
        vi.stubGlobal('electron', { ipcRenderer })
        configRead = vi.fn().mockResolvedValue(null)
        vi.stubGlobal('api', {
            config: { read: configRead, write: vi.fn().mockResolvedValue(true) }
        })
        setPreviewActiveFilePath(null)
        setPreviewAllowRemoteImages(false)
        renderMocks.PreMarkdownRender.mockReset()
        renderMocks.PreMarkdownRender.mockImplementation(async (text: string) => text)
        renderMocks.PostMarkdownRender.mockReset()
        renderMocks.PostMarkdownRender.mockImplementation((text: string) => text)
        renderMocks.ParserMarkdownChapters.mockReset()
    })

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    function mountPreview(editorContent: string) {
        wrapper = mount(MarkdownPreviewComponent, {
            props: { editorContent },
            attachTo: document.body
        })
        return wrapper
    }

    /** 取出组件注册的 SYSTEM_SETTING_UPDATE 回调并模拟主进程广播 */
    function emitSystemSettingUpdate(setting: Record<string, unknown>): void {
        const call = ipcRenderer.on.mock.calls.find(
            (args) => args[0] === SYSTEM_SETTING_UPDATE_CHANNEL
        )
        expect(call, 'SYSTEM_SETTING_UPDATE 监听应已注册').toBeTruthy()
        ;(call![1] as (event: unknown, setting: unknown) => void)(null, setting)
    }

    /** 触发系统设置广播后的重渲染（updateMarkdownPreview 内部有多次 await） */
    async function waitForPolicyRerender(): Promise<void> {
        await flushPromises()
        await new Promise((resolve) => setTimeout(resolve, 30))
        await flushPromises()
    }

    it('should replace remote images with a placeholder by default (no requestable URL)', async () => {
        mountPreview('![pixel](https://tracking.example/pixel)')
        await waitForDebouncedRender()

        // 初始策略来自系统设置读取（唯一真源）
        expect(configRead).toHaveBeenCalledWith('system')

        const html = wrapper!.html()
        expect(html).toContain('remote-image-blocked')
        expect(html).not.toContain('<img')
        expect(html).not.toContain('https://tracking.example/pixel')
        expect(html).not.toContain('tracking.example')
        expect(html).toContain('远程图片已拦截')
    })

    it('should load remote images when allowRemoteImages=true is stored', async () => {
        configRead.mockResolvedValue({ allowRemoteImages: true })
        mountPreview('![pixel](https://tracking.example/pixel)')
        await waitForDebouncedRender()

        const html = wrapper!.html()
        expect(html).toContain('src="https://tracking.example/pixel"')
        expect(html).not.toContain('remote-image-blocked')
    })

    it('should re-render on system-setting-update when the switch is toggled', async () => {
        mountPreview('![pixel](https://tracking.example/pixel)')
        await waitForDebouncedRender()
        expect(wrapper!.html()).toContain('remote-image-blocked')

        // 开启：预览立即放行远程图片（无需重新打开文档/重启）
        emitSystemSettingUpdate({ allowRemoteImages: true })
        await waitForPolicyRerender()
        expect(wrapper!.html()).toContain('src="https://tracking.example/pixel"')
        expect(wrapper!.html()).not.toContain('remote-image-blocked')

        // 关闭：再次拦截，且原始 URL 从输出中消失
        emitSystemSettingUpdate({ allowRemoteImages: false })
        await waitForPolicyRerender()
        expect(wrapper!.html()).toContain('remote-image-blocked')
        expect(wrapper!.html()).not.toContain('tracking.example')
    })

    it('should keep local relative and data: URI images untouched', async () => {
        mountPreview('![local](./img/a.png)\n\n![data](data:image/png;base64,iVBORw0KGgo=)')
        await waitForDebouncedRender()

        const html = wrapper!.html()
        expect(html).toContain('src="./img/a.png"')
        expect(html).toContain('data:image/png;base64')
        expect(html).not.toContain('remote-image-blocked')
    })

    it('should not rewrite remote-looking text inside fenced code blocks', async () => {
        mountPreview('```html\n<img src="https://coding.example/sample.png">\n```')
        await waitForDebouncedRender()

        const html = wrapper!.html()
        // 代码块中的示例文本按转义文本展示（highlight.js 高亮为 hljs-tag），不是可执行 img，
        // 因此不产生占位块、也不存在会被请求的 img 标签
        expect(html).toContain('hljs-tag')
        expect(html).not.toContain('<img')
        expect(html).not.toContain('remote-image-blocked')
    })
})
