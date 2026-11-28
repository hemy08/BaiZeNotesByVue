// @vitest-environment jsdom
/**
 * 1.5.7 体验微调（用户反馈批次 A5）：编辑区三态视图（`MarkdownEditComponent`）。
 *
 * 单一真源：`workspace-layout` 的 `currentWorkspaceLayout.viewMode`（与视图菜单 F9/F10/F11、
 * 布局 profile、菜单栏右侧三态按钮共用）；传统模式与 LLM Wiki 模式语义完全一致。
 *
 * 覆盖：
 * 1. LLM Wiki 模式三态渲染：edit = 仅编辑器、preview = 仅预览、edit-preview = 编辑器+预览并排
 *    （分隔条可拖动，两个窗格实例始终挂载，v-show 保留光标/滚动状态）；
 * 2. 单一真源外部变化（菜单栏三态按钮路径 / 视图菜单 IPC / 布局 profile）→ 编辑区布局联动；
 * 3. 工作区模式切换不重置用户已选视图（传统 ↔ LLM Wiki 三态语义一致）；
 * 4. 旧 LLM Wiki 专属「编辑区 tab」状态（localStorage `baize:llm-wiki:editor-tab`）不再消费；
 * 5. 编辑区右上角旧「编辑器 / 预览」分段控件已移除（三态入口在菜单栏右侧）；
 * 6. 既有清空/卸载行为与 AI 面板上下文同步不受影响。
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
    currentWorkspaceLayout,
    updateCurrentWorkspaceViewMode
} from '@renderer/components/Markdown/workspace-layout'
import {
    llmWikiEditorContext,
    resetLlmWikiEditorContextForTesting
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-context'
import { resetLlmWikiWorkbenchStateForTesting } from '../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench'
import {
    clearUntitledDraft,
    resetUntitledDraftForTesting,
    writeUntitledDraft,
    UNTITLED_DRAFT_STORAGE_KEY
} from '@renderer/components/Markdown/untitled-draft'
import { IPC } from '../../../src/shared/ipc-channels'

/** 旧 LLM Wiki 单栏工作台的编辑区 tab 持久化键（A5 起不再消费，仅用于回归断言） */
const LEGACY_LLM_WIKI_EDITOR_TAB_STORAGE_KEY = 'baize:llm-wiki:editor-tab'

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
    currentWorkspaceLayout.viewMode = 'edit-preview'
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
    currentWorkspaceLayout.viewMode = 'edit-preview'
    resetLlmWikiWorkbenchStateForTesting()
    resetLlmWikiEditorContextForTesting()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/**
 * 挂载编辑器编排层（等待异步子组件就绪）。
 * 挂载后通过 prop 注入确定的容器宽度（jsdom clientWidth 恒为 0，避免分栏百分比出现 NaN）。
 */
async function mountEditor(mode: 'traditional' | 'llm-wiki'): Promise<ReturnType<typeof mount>> {
    testWorkspaceModeState.llmWiki = mode === 'llm-wiki'
    host = document.createElement('div')
    host.style.width = '1000px'
    document.body.appendChild(host)
    wrapper = mount(MarkdownEditComponent, { attachTo: host })
    await new Promise<void>((resolve) => {
        setImmediate(resolve)
    })
    await wrapper.setProps({ editorPreviewWidth: '1000px' })
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

/** 解析内联百分比宽度（NaN/空 → NaN） */
function parsePercent(value: string): number {
    return Number.parseFloat(value)
}

describe('MarkdownEditComponent：三态视图（传统模式既有行为保留）', () => {
    it('默认 edit-preview：编辑器与预览并排可见，分隔条显示', async () => {
        await mountEditor('traditional')

        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(resizerElement().style.display).not.toBe('none')
        expect(editorElement().style.width).toBe('50%')
    })

    it('视图菜单 IPC 切换三态：单栏时隐藏对应窗格与分隔条，双栏恢复并排', async () => {
        await mountEditor('traditional')
        getIpcListener(IPC.VIEW.EDIT_MODE)({})
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('edit')
        expect(editorElement().style.display).not.toBe('none')
        expect(editorElement().style.width).toBe('100%')
        expect(previewElement().style.display).toBe('none')
        expect(resizerElement().style.display).toBe('none')

        getIpcListener(IPC.VIEW.PREVIEW_MODE)({})
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('preview')
        expect(editorElement().style.display).toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(previewElement().style.width).toBe('100%')
        expect(previewElement().style.left).toMatch(/^0(px)?$/)

        getIpcListener(IPC.VIEW.EDIT_PREVIEW_MODE)({})
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(resizerElement().style.display).not.toBe('none')
        expect(editorElement().style.width).toBe('50%')
    })
})

describe('MarkdownEditComponent：LLM Wiki 模式统一三态视图', () => {
    it('默认 edit-preview：编辑区内部并排（编辑器 + 预览），右侧 AI 面板布局不受影响', async () => {
        const mounted = await mountEditor('llm-wiki')

        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
        expect(editorElement().style.width).toBe('50%')
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(parsePercent(previewElement().style.width)).toBeCloseTo(49.6, 1)
        expect(parsePercent(previewElement().style.left)).toBeCloseTo(50.4, 1)
        // 双栏视图分隔条显示（编辑区内部可拖动；AI 面板 split 由 WorkSpace 负责）
        expect(resizerElement().style.display).not.toBe('none')
        // 两窗格实例均保持挂载（v-show 保留光标/滚动状态）
        expect(mounted.findComponent(MdMonacoEdit).exists()).toBe(true)
        expect(mounted.findComponent(MdPreview).exists()).toBe(true)
        expect(mounted.findComponent(MdPreview).props('active')).toBe(true)
    })

    it('edit：仅编辑器占满编辑区，预览隐藏但保持挂载，分隔条隐藏', async () => {
        const mounted = await mountEditor('llm-wiki')

        getIpcListener(IPC.VIEW.EDIT_MODE)({})
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('edit')
        expect(editorElement().style.width).toBe('100%')
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).toBe('none')
        expect(resizerElement().style.display).toBe('none')
        expect(mounted.findComponent(MdPreview).exists()).toBe(true)
        expect(mounted.findComponent(MdPreview).props('active')).toBe(false)
    })

    it('preview：仅预览占满编辑区，编辑器隐藏但实例保留', async () => {
        const mounted = await mountEditor('llm-wiki')

        getIpcListener(IPC.VIEW.PREVIEW_MODE)({})
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('preview')
        expect(editorElement().style.display).toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(previewElement().style.width).toBe('100%')
        expect(previewElement().style.left).toMatch(/^0(px)?$/)
        expect(mounted.findComponent(MdPreview).props('active')).toBe(true)
        expect(mounted.findComponent(MdMonacoEdit).exists()).toBe(true)
    })

    it('edit-preview：恢复并排、分隔条显示并可拖动调整编辑/预览比例', async () => {
        await mountEditor('llm-wiki')
        getIpcListener(IPC.VIEW.PREVIEW_MODE)({})
        await nextTick()

        getIpcListener(IPC.VIEW.EDIT_PREVIEW_MODE)({})
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(resizerElement().style.display).not.toBe('none')
        expect(editorElement().style.width).toBe('50%')

        // 拖动编辑区/预览分隔条：仅编辑器宽度变化，视图模式保持 edit-preview
        resizerElement().dispatchEvent(new MouseEvent('mousedown', { clientX: 400, bubbles: true }))
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 520 }))
        await nextTick()
        document.dispatchEvent(new MouseEvent('mouseup'))
        expect(parsePercent(editorElement().style.width)).toBeGreaterThan(50)
        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
    })

    it('单一真源外部变化（菜单栏三态按钮路径）→ 编辑区布局即时联动', async () => {
        await mountEditor('llm-wiki')

        // 工具条按钮只调用 updateCurrentWorkspaceViewMode；本组件 watch 同一真源应用布局
        updateCurrentWorkspaceViewMode('preview')
        await nextTick()
        expect(editorElement().style.display).toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(resizerElement().style.display).toBe('none')

        updateCurrentWorkspaceViewMode('edit')
        await nextTick()
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).toBe('none')

        updateCurrentWorkspaceViewMode('edit-preview')
        await nextTick()
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(resizerElement().style.display).not.toBe('none')
    })

    it('布局 profile 应用事件（非法 viewMode 缺省兜底 edit-preview）同样驱动三态', async () => {
        await mountEditor('llm-wiki')

        window.dispatchEvent(
            new CustomEvent('baize:workspace-layout:apply', {
                detail: {
                    id: 'custom-1',
                    name: '仅预览布局',
                    viewMode: 'preview',
                    resourceManagerVisible: true,
                    resourceManagerWidth: 300,
                    updatedAt: 1
                }
            })
        )
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('preview')
        expect(previewElement().style.display).not.toBe('none')

        // 损坏的 viewMode：回落默认「编辑+预览」，不抛错
        window.dispatchEvent(
            new CustomEvent('baize:workspace-layout:apply', {
                detail: {
                    id: 'broken',
                    name: '损坏布局',
                    viewMode: 'not-a-view-mode',
                    resourceManagerVisible: true,
                    resourceManagerWidth: 300,
                    updatedAt: 1
                }
            })
        )
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).not.toBe('none')
    })

    it('工作区模式切换不重置用户已选视图（传统 ↔ LLM Wiki 语义一致）', async () => {
        const mounted = await mountEditor('traditional')
        getIpcListener(IPC.VIEW.PREVIEW_MODE)({})
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('preview')

        // 传统 → LLM Wiki：仍为「仅预览」，不强制切回并排 / 编辑器
        testWorkspaceModeState.llmWiki = true
        await nextTick()
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('preview')
        expect(editorElement().style.display).toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(resizerElement().style.display).toBe('none')
        expect(mounted.findComponent(MdPreview).exists()).toBe(true)

        // LLM Wiki → 传统：视图保持，不重置
        testWorkspaceModeState.llmWiki = false
        await nextTick()
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('preview')
        expect(previewElement().style.display).not.toBe('none')
        expect(resizerElement().style.display).toBe('none')
    })

    it('LLM Wiki 模式下不再消费旧「编辑器 / 预览」tab 持久化状态', async () => {
        window.localStorage.setItem(LEGACY_LLM_WIKI_EDITOR_TAB_STORAGE_KEY, 'preview')
        await mountEditor('llm-wiki')

        // 旧 tab 键不再影响视图：统一真源仍为默认 edit-preview（编辑器与预览都可见）
        expect(editorElement().style.display).not.toBe('none')
        expect(previewElement().style.display).not.toBe('none')
        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
    })
})

describe('MarkdownEditComponent：编辑区右上角旧「编辑器 / 预览」分段控件已移除（体验微调 A5）', () => {
    it('llm-wiki 模式不再渲染右上角 dock / 分段按钮（三态切换入口在菜单栏右侧）', async () => {
        await mountEditor('llm-wiki')

        expect(document.querySelector('.llm-wiki-editor-tabs-dock')).toBeNull()
        expect(document.querySelector('.llm-wiki-editor-tabs')).toBeNull()
        // 两个窗格回到编辑区顶部无预留的既有布局
        expect(editorElement().style.top).toBe('')
        expect(editorElement().style.height).toBe('')
        expect(previewElement().style.top).toBe('')
    })

    it('传统模式同样无 dock/分段控件（DOM 与布局零变化）', async () => {
        await mountEditor('traditional')
        expect(document.querySelector('.llm-wiki-editor-tabs-dock')).toBeNull()
        expect(document.querySelector('.llm-wiki-editor-tabs')).toBeNull()
        expect(editorElement().style.top).toBe('')
    })

    it('静态契约：MarkdownEditComponent 只用统一三态真源；工具条不再承接图标按钮（已迁移菜单栏）', () => {
        const root = path.resolve(__dirname, '../../..')
        const editSource = fs.readFileSync(
            path.join(root, 'src/renderer/src/components/Markdown/MarkdownEditComponent.vue'),
            'utf8'
        )
        expect(editSource).not.toContain('LlmWikiEditorTabs')
        expect(editSource).not.toContain('llm-wiki-editor-tabs-dock')
        expect(editSource).not.toContain('llmWikiPaneOffsetStyle')
        // 旧 LLM Wiki 单栏 tab 状态已删除：不再引用 llm-wiki-workbench / setLlmWikiEditorTab
        expect(editSource).not.toContain('llm-wiki-workbench')
        expect(editSource).not.toContain('setLlmWikiEditorTab')
        expect(editSource).not.toContain('applyLlmWikiViewMode')
        // 统一三态真源：workspace-layout 的 viewMode + 外部变化 watch
        expect(editSource).toContain('currentWorkspaceLayout.viewMode')
        expect(editSource).toContain('updateCurrentWorkspaceViewMode')
        expect(editSource).toContain('resolveViewMode')

        // 1.5.7 体验修正（A6）：视图/模式切换按钮已从编辑工具条迁移到菜单栏右侧，
        // 工具条源码中不得残留旧入口（防止两个入口并存），格式按钮区自适应契约保留。
        const toolsSource = fs.readFileSync(
            path.join(root, 'src/renderer/src/components/Markdown/MarkdownEditToolsComponent.vue'),
            'utf8'
        )
        expect(toolsSource).not.toContain('data-workspace-view-mode-toggle')
        expect(toolsSource).not.toContain('data-workspace-mode-toggle')
        expect(toolsSource).not.toContain('id="workspace-view-mode-toggle"')
        expect(toolsSource).not.toContain('id="llm-workspace-mode-toggle"')
        expect(toolsSource).not.toContain('requestSwitchToLlmWiki')
        expect(toolsSource).not.toContain('switchToTraditional')
        expect(toolsSource).not.toContain('.toolbar-actions')
        const quickBlock = toolsSource.slice(toolsSource.indexOf('.toolbar-quick-access {'))
        expect(quickBlock).toContain('flex: 1 1 auto')
        expect(quickBlock).toContain('min-width: 0')

        // 菜单栏承接纯图标按钮：24 网格 / stroke 1.5 / currentColor（纯图标无文字），
        // 右侧区域不参与裁剪（flex 0 0 auto + margin-left:auto）。
        const menuBarSource = fs.readFileSync(
            path.join(root, 'src/renderer/src/components/MenuBar.vue'),
            'utf8'
        )
        expect(menuBarSource).toContain('data-workspace-view-mode-toggle="true"')
        expect(menuBarSource).toContain('data-workspace-mode-toggle="true"')
        expect(menuBarSource).toContain('id="workspace-view-mode-toggle"')
        expect(menuBarSource).toContain('id="llm-workspace-mode-toggle"')
        expect(menuBarSource).toContain(':data-view-mode="currentViewMode"')
        expect(menuBarSource).toContain('viewBox="0 0 24 24"')
        expect(menuBarSource).toContain('stroke-width="1.5"')
        expect(menuBarSource).toContain('stroke="currentColor"')
        const actionsBlock = menuBarSource.slice(menuBarSource.indexOf('.menu-bar-actions {'))
        expect(actionsBlock).toContain('flex: 0 0 auto')
        expect(actionsBlock).toContain('margin-left: auto')
        // 模式切换复用统一 composable（与系统设置同样处理）
        expect(menuBarSource).toContain('requestSwitchToLlmWiki')
        expect(menuBarSource).toContain('switchToTraditional')
        // 旧分段控件文件已删除（测试静态断言文件不存在）
        expect(
            fs.existsSync(
                path.join(root, 'src/renderer/src/components/llm-wiki/LlmWikiEditorTabs.vue')
            )
        ).toBe(false)
    })
})

describe('MarkdownEditComponent：既有清空/卸载行为回归（三态视图改动不影响）', () => {
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
