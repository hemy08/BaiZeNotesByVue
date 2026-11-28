// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L5 / T5.1：编辑区单栏切换（`MarkdownEditComponent`）。
 *
 * 覆盖：
 * 1. llm-wiki 模式：编辑/预览窗格保持挂载（v-show），同一时刻单栏占满编辑区、分隔条隐藏；
 * 2. tab 切换：两窗格显示状态互换、宽度/偏移切换为单栏口径（实例不重建）；
 * 3. 既有视图菜单 IPC（EDIT_MODE / PREVIEW_MODE / EDIT_PREVIEW_MODE）在单栏模式下的映射；
 * 4. 退回 traditional 模式恢复既有「编辑 + 预览并排」布局（分隔条/宽度复位）；
 * 5. 活动文件路径同步到 AI 面板上下文（文件名 chip 数据源）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import * as fs from 'fs'
import * as path from 'path'

// ============ 工作区模式 mock（测试内可切换 llm-wiki / traditional） ============
vi.mock('@renderer/composables/useWorkspaceMode', async () => {
    const { computed, reactive } = await import('vue')
    const state = reactive({ llmWiki: false })
    return {
        // 仅测试可见的开关（业务代码不消费）
        __testWorkspaceModeState: state,
        useWorkspaceMode: () => ({
            workspaceMode: computed(() => (state.llmWiki ? 'llm-wiki' : 'traditional')),
            isLlmWikiMode: computed(() => state.llmWiki)
        })
    }
})

// ============ 重型子组件桩（Monaco / 预览） ============
vi.mock('@renderer/components/Markdown/MarkdownMonacoEditor.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试用 Monaco 桩组件（vi.mock 工厂内联定义）
        default: defineComponent({
            name: 'MdMonacoEditStub',
            props: {
                code: { type: String, default: '' },
                editorAreaWidth: { type: String, default: '50%' }
            },
            emits: ['update:code', 'sync-scroll'],
            template: '<div class="monaco-stub">{{ code }}</div>'
        })
    }
})

vi.mock('@renderer/components/Markdown/MarkdownPreviewComponent.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试用预览桩组件（vi.mock 工厂内联定义）
        default: defineComponent({
            name: 'MdPreviewStub',
            props: {
                editorContent: { type: String, default: '' },
                active: { type: Boolean, default: true },
                activeFilePath: { type: String, default: '' }
            },
            template: '<div class="preview-stub" />'
        })
    }
})

import MdMonacoEdit from '@renderer/components/Markdown/MarkdownMonacoEditor.vue'
import MdPreview from '@renderer/components/Markdown/MarkdownPreviewComponent.vue'
import MarkdownEditComponent from '@renderer/components/Markdown/MarkdownEditComponent.vue'
import * as workspaceModeModule from '@renderer/composables/useWorkspaceMode'
import {
    LLM_WIKI_EDITOR_TAB_STORAGE_KEY,
    resetLlmWikiWorkbenchStateForTesting,
    setLlmWikiEditorTab
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench'
import {
    llmWikiEditorContext,
    resetLlmWikiEditorContextForTesting
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-context'
import { currentWorkspaceLayout } from '@renderer/components/Markdown/workspace-layout'
import {
    clearUntitledDraft,
    resetUntitledDraftForTesting,
    writeUntitledDraft,
    UNTITLED_DRAFT_STORAGE_KEY
} from '@renderer/components/Markdown/untitled-draft'
import { IPC } from '../../../src/shared/ipc-channels'

/** 测试用工作区模式开关（与 mock 工厂共享同一 reactive state） */
const testWorkspaceModeState = (
    workspaceModeModule as unknown as {
        __testWorkspaceModeState: { llmWiki: boolean }
    }
).__testWorkspaceModeState

type Listener = (event?: unknown, ...args: unknown[]) => void

interface IpcMock {
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
}

let ipcRenderer: IpcMock
let wrapper: ReturnType<typeof mount> | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
    testWorkspaceModeState.llmWiki = false
    window.localStorage.clear()
    resetLlmWikiWorkbenchStateForTesting()
    resetLlmWikiEditorContextForTesting()
    ipcRenderer = {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        removeListener: vi.fn()
    }
    vi.stubGlobal('electron', { ipcRenderer })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    host?.remove()
    host = null
    clearUntitledDraft()
    resetUntitledDraftForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    resetLlmWikiEditorContextForTesting()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 挂载编辑器编排层（等待异步子组件就绪） */
async function mountEditor(mode: 'traditional' | 'llm-wiki'): Promise<ReturnType<typeof mount>> {
    testWorkspaceModeState.llmWiki = mode === 'llm-wiki'
    host = document.createElement('div')
    host.style.width = '800px'
    document.body.appendChild(host)
    wrapper = mount(MarkdownEditComponent, {
        props: { editorPreviewWidth: '1000px' },
        attachTo: host
    })
    await new Promise<void>((resolve) => {
        setImmediate(resolve)
    })
    await nextTick()
    return wrapper
}

/** 取出组件注册的某个 IPC 监听回调 */
function getIpcListener(channel: string): Listener {
    const call = ipcRenderer.on.mock.calls.find((args) => args[0] === channel)
    expect(call, `${channel} 监听应已注册`).toBeTruthy()
    return call![1] as Listener
}

function editorElement(): HTMLElement {
    return document.getElementById('md-edit-component') as HTMLElement
}

function previewElement(): HTMLElement {
    return document.getElementById('md-preview') as HTMLElement
}

function resizerElement(): HTMLElement {
    return document.getElementById('resizer-md') as HTMLElement
}

describe('MarkdownEditComponent：LLM Wiki 单栏编辑区', () => {
    it('默认编辑器 tab：编辑器占满编辑区，预览隐藏但保持挂载，分隔条隐藏', async () => {
        const mounted = await mountEditor('llm-wiki')

        expect(editorElement().style.width).toBe('100%')
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).toBe('none')
        expect(resizerElement().style.display).toBe('none')
        // 两窗格实例均保持挂载（v-show 保留光标/滚动状态）
        expect(mounted.findComponent(MdMonacoEdit).exists()).toBe(true)
        expect(mounted.findComponent(MdPreview).exists()).toBe(true)
        expect(mounted.findComponent(MdPreview).props('active')).toBe(false)
    })

    it('切到预览 tab：预览占满编辑区，编辑器隐藏但实例保留', async () => {
        const mounted = await mountEditor('llm-wiki')

        setLlmWikiEditorTab('preview')
        await nextTick()
        await nextTick()

        expect(editorElement().style.display).toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(previewElement().style.width).toBe('100%')
        expect(previewElement().style.left).toMatch(/^0(px)?$/)
        expect(mounted.findComponent(MdPreview).props('active')).toBe(true)
        expect(mounted.findComponent(MdMonacoEdit).exists()).toBe(true)

        // 切回编辑器：预览隐藏、编辑器恢复可见（实例未重建）
        setLlmWikiEditorTab('editor')
        await nextTick()
        await nextTick()
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).toBe('none')
    })

    it('视图菜单 IPC 在单栏模式下映射为 tab 选择（双栏请求保留当前 tab）', async () => {
        await mountEditor('llm-wiki')
        const previewMode = getIpcListener(IPC.VIEW.PREVIEW_MODE)
        const editMode = getIpcListener(IPC.VIEW.EDIT_MODE)
        const editPreviewMode = getIpcListener(IPC.VIEW.EDIT_PREVIEW_MODE)

        previewMode()
        await nextTick()
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBe('preview')
        expect(currentWorkspaceLayout.viewMode).toBe('preview')

        editMode()
        await nextTick()
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBe('editor')
        expect(currentWorkspaceLayout.viewMode).toBe('edit')

        // 双栏请求在单栏工作台中没有并排可切换：保留当前 tab，不退回并排
        editPreviewMode()
        await nextTick()
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBe('editor')
        expect(resizerElement().style.display).toBe('none')
    })

    it('切回 traditional 模式恢复既有并排布局（分隔条显示、宽度复位）', async () => {
        const mounted = await mountEditor('llm-wiki')
        // 先切到预览 tab，验证退出后并排视图不受影响
        setLlmWikiEditorTab('preview')
        await nextTick()

        await mounted.setProps({ editorPreviewWidth: '1000px' })
        testWorkspaceModeState.llmWiki = false
        await nextTick()
        await nextTick()

        expect(editorElement().style.width).toBe('50%')
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(resizerElement().style.display).not.toBe('none')
        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
    })

    it('traditional 启动后切换到 llm-wiki：单栏布局即时生效（无需重挂载）', async () => {
        const mounted = await mountEditor('traditional')
        // 初始并排
        expect(editorElement().style.width).toBe('50%')
        expect(resizerElement().style.display).not.toBe('none')
        // 传统与 LLM Wiki 模式编辑区都不再渲染右上角切换 dock（1.5.7 体验微调：入口在工具条）
        expect(document.querySelector('.llm-wiki-editor-tabs-dock')).toBeNull()

        testWorkspaceModeState.llmWiki = true
        await nextTick()
        await nextTick()

        // 单栏：编辑器占满、分隔条与预览隐藏（默认编辑器 tab）
        expect(editorElement().style.width).toBe('100%')
        expect(resizerElement().style.display).toBe('none')
        expect(previewElement().style.display).toBe('none')
        expect(mounted.findComponent(MdPreview).exists()).toBe(true)
        expect(currentWorkspaceLayout.viewMode).toBe('edit')
        // 切换控件已迁移到编辑工具条右侧：编辑区不再为悬浮 dock 预留顶部安全间距
        expect(document.querySelector('.llm-wiki-editor-tabs-dock')).toBeNull()
        expect(editorElement().style.top).toBe('')
        expect(editorElement().style.height).toBe('')
    })

    it('traditional 模式下 tab 状态变化不改变并排布局（watch 提前返回）', async () => {
        await mountEditor('traditional')
        const viewModeBefore = currentWorkspaceLayout.viewMode

        setLlmWikiEditorTab('preview')
        await nextTick()
        await nextTick()

        // 传统模式不消费共享 tab 状态：并排布局与视图模式保持不变
        expect(resizerElement().style.display).not.toBe('none')
        expect(editorElement().style.width).toBe('50%')
        expect(currentWorkspaceLayout.viewMode).toBe(viewModeBefore)
    })
})

describe('MarkdownEditComponent：编辑区右上角旧「编辑器 / 预览」分段控件已移除（体验微调 A4）', () => {
    it('llm-wiki 模式不再渲染右上角 dock / 分段按钮（切换入口在编辑工具条右侧）', async () => {
        await mountEditor('llm-wiki')

        expect(document.querySelector('.llm-wiki-editor-tabs-dock')).toBeNull()
        expect(document.querySelector('.llm-wiki-editor-tabs')).toBeNull()
        // 两个窗格回到编辑区顶部无预留的既有布局（单栏时各自占满编辑区高度）
        expect(editorElement().style.top).toBe('')
        expect(editorElement().style.height).toBe('')
        expect(previewElement().style.top).toBe('')
        expect(previewElement().style.height).toBe('')
    })

    it('传统模式同样无 dock/分段控件（DOM 与布局零变化）', async () => {
        await mountEditor('traditional')
        expect(document.querySelector('.llm-wiki-editor-tabs-dock')).toBeNull()
        expect(document.querySelector('.llm-wiki-editor-tabs')).toBeNull()
        expect(editorElement().style.top).toBe('')
    })

    it('静态契约：MarkdownEditComponent 不再引用旧分段控件；工具条承接图标按钮', () => {
        const root = path.resolve(__dirname, '../../..')
        const editSource = fs.readFileSync(
            path.join(root, 'src/renderer/src/components/Markdown/MarkdownEditComponent.vue'),
            'utf8'
        )
        expect(editSource).not.toContain('LlmWikiEditorTabs')
        expect(editSource).not.toContain('llm-wiki-editor-tabs-dock')
        expect(editSource).not.toContain('llmWikiPaneOffsetStyle')

        const toolsSource = fs.readFileSync(
            path.join(root, 'src/renderer/src/components/Markdown/MarkdownEditToolsComponent.vue'),
            'utf8'
        )
        // 工具条右侧纯图标按钮：编辑器/预览切换 + 工作区模式快速切换
        expect(toolsSource).toContain('data-editor-view-toggle="true"')
        expect(toolsSource).toContain('data-workspace-mode-toggle="true"')
        expect(toolsSource).toContain('id="llm-editor-view-toggle"')
        expect(toolsSource).toContain('id="llm-workspace-mode-toggle"')
        // 图标：24 网格 / stroke 1.5 / currentColor（纯图标无文字）
        expect(toolsSource).toContain('viewBox="0 0 24 24"')
        expect(toolsSource).toContain('stroke-width="1.5"')
        expect(toolsSource).toContain('stroke="currentColor"')
        // 右侧区域不参与裁剪：flex 0 0 auto + margin-left:auto；左侧区可收缩
        const actionsBlock = toolsSource.slice(toolsSource.indexOf('.toolbar-actions {'))
        expect(actionsBlock).toContain('flex: 0 0 auto')
        expect(actionsBlock).toContain('margin-left: auto')
        const quickBlock = toolsSource.slice(toolsSource.indexOf('.toolbar-quick-access {'))
        expect(quickBlock).toContain('flex: 1 1 auto')
        expect(quickBlock).toContain('min-width: 0')
        // 模式切换复用统一 composable（与系统设置同样处理）
        expect(toolsSource).toContain('requestSwitchToLlmWiki')
        expect(toolsSource).toContain('switchToTraditional')
        // 旧分段控件文件已删除（测试静态断言文件不存在）
        expect(
            fs.existsSync(
                path.join(root, 'src/renderer/src/components/llm-wiki/LlmWikiEditorTabs.vue')
            )
        ).toBe(false)
    })
})

describe('MarkdownEditComponent：既有清空/卸载行为回归（LLM Wiki 改动不影响）', () => {
    it('CLEAR_EDITOR_PREVIEW 时恢复未命名草稿缓存（既有行为不变）', async () => {
        const mounted = await mountEditor('traditional')
        writeUntitledDraft('未命名草稿内容')

        getIpcListener(IPC.FILE.CLEAR_EDITOR_PREVIEW)({}, undefined)
        await nextTick()
        await nextTick()

        expect(mounted.findComponent(MdMonacoEdit).props('code')).toBe('未命名草稿内容')
        expect(mounted.findComponent(MdPreview).props('editorContent')).toBe('未命名草稿内容')
    })

    it('beforeunload 时立即落盘未命名草稿缓存（既有行为不变）', async () => {
        await mountEditor('traditional')
        writeUntitledDraft('beforeunload-草稿')

        expect(() => window.dispatchEvent(new Event('beforeunload'))).not.toThrow()
        const raw = window.localStorage.getItem(UNTITLED_DRAFT_STORAGE_KEY)
        expect(raw).toContain('beforeunload-草稿')
    })
})

describe('MarkdownEditComponent：AI 面板上下文同步', () => {
    it('活动文件路径（USER_SELECT_FILE）同步为上下文文件名', async () => {
        await mountEditor('llm-wiki')

        getIpcListener(IPC.FILE.USER_SELECT_FILE)({}, 'C:\\wiki\\raw\\索引.md')
        await nextTick()

        expect(llmWikiEditorContext.documentPath).toBe('C:\\wiki\\raw\\索引.md')
        expect(llmWikiEditorContext.documentName).toBe('索引.md')
    })
})
