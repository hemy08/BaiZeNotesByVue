// @vitest-environment jsdom
/**
 * A1 多标签 / 会话恢复：MarkdownEditComponent 接线集成测试（opt-in：featureTabs）。
 *
 * 覆盖：
 * 1. 默认关闭（flags.tabs=false）：不渲染标签栏、不注册关闭保存监听/快捷键、不读写 localStorage，
 *    打开文件后的既有单文档行为不变；
 * 2. 开启后：打开文件登记标签、脏标记、切换标签（先同步全文再复用打开链路）、
 *    关闭活动标签（先落盘再切走）、Ctrl+Tab / Ctrl+Shift+Tab / Ctrl+W 快捷键；
 * 3. 会话恢复：启动恢复标签列表 + 兜底打开上次活动标签；启动文件事件到达时取消兜底；
 *    会话数据损坏时静默降级；
 * 4. 运行中开关切换（设置保存后响应式生效）：即时显示/隐藏标签栏并撤销快捷键与存储副作用。
 *
 * 说明：Monaco / 预览依赖 DOM/worker，jsdom 下不可用，统一用桩组件替换；
 * 本文件只验证编排层接线（IPC 发送、标签状态、快捷键、localStorage）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@renderer/components/Markdown/MarkdownMonacoEditor.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试用 Monaco 桩组件（vi.mock 工厂内联定义）
        default: defineComponent({
            name: 'MdMonacoEditStub',
            props: {
                code: { type: String, default: '' },
                editorAreaWidth: { type: String, default: '50%' },
                filePath: { type: String, default: '' }
            },
            emits: ['update:code'],
            template: '<div class="monaco-stub" />'
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

/** 能力开关桩：可运行中翻转 tabs，驱动组件的响应式 watch */
const featureFlagState = vi.hoisted(() => ({
    flags: null as null | Record<string, boolean>
}))

vi.mock('@renderer/composables/useFeatureFlags', async () => {
    const { reactive } = await import('vue')
    const flags = reactive<Record<string, boolean>>({
        tabs: false,
        documentHistory: false,
        markdownLint: false,
        spellcheck: false,
        smartInput: false,
        outlinePlus: false
    })
    featureFlagState.flags = flags
    return {
        useFeatureFlags: () => ({
            flags,
            isFeatureEnabled: (id: string) => flags[id] === true
        }),
        initFeatureFlags: async () => undefined,
        refreshFeatureFlags: async () => undefined
    }
})

import MdMonacoEdit from '@renderer/components/Markdown/MarkdownMonacoEditor.vue'
import MarkdownEditComponent from '@renderer/components/Markdown/MarkdownEditComponent.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import {
    DOCUMENT_TABS_STORAGE_KEY,
    DOCUMENT_TABS_SESSION_VERSION
} from '@renderer/components/Markdown/useDocumentTabs'
import { IPC } from '../../../src/shared/ipc-channels'

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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    ipcRenderer = {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        removeListener: vi.fn()
    }
    vi.stubGlobal('electron', { ipcRenderer })
    window.localStorage.clear()
    if (featureFlagState.flags) {
        for (const key of Object.keys(featureFlagState.flags)) {
            featureFlagState.flags[key] = false
        }
    }
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    host?.remove()
    host = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    window.localStorage.clear()
})

/** 等待异步子组件（Monaco/预览桩）就绪 */
async function mountEditor(): Promise<ReturnType<typeof mount>> {
    host = document.createElement('div')
    host.style.width = '800px'
    document.body.appendChild(host)
    wrapper = mount(MarkdownEditComponent, { attachTo: host })
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

/** 是否存在某通道的监听注册 */
function hasIpcListener(channel: string): boolean {
    return ipcRenderer.on.mock.calls.some((args) => args[0] === channel)
}

/** 已发送的某通道载荷列表 */
function sentPayloads(channel: string): unknown[] {
    return ipcRenderer.send.mock.calls
        .filter(([sentChannel]) => sentChannel === channel)
        .map(([, payload]) => payload)
}

/** 模拟主进程「打开文件」：先内容、后活动文件路径（与新文件打开链路顺序一致） */
async function simulateOpenFile(path: string, content: string): Promise<void> {
    getIpcListener(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT)({}, content)
    getIpcListener(IPC.FILE.USER_SELECT_FILE)({}, path)
    await nextTick()
}

/** 模拟子 Monaco 编辑器上报内容变化 */
function emitCode(value: string): void {
    wrapper!.findComponent(MdMonacoEdit).vm.$emit('update:code', value)
}

/** 运行中翻转 featureTabs */
async function setTabsEnabled(value: boolean): Promise<void> {
    featureFlagState.flags!.tabs = value
    await nextTick()
}

/** 读取已持久化的会话 */
function readSession(): { paths: string[]; activePath: string } | null {
    const raw = window.localStorage.getItem(DOCUMENT_TABS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as { paths: string[]; activePath: string }) : null
}

describe('featureTabs 默认关闭：既有行为不变', () => {
    it('不渲染标签栏、不注册保存监听/快捷键、不读写 localStorage', async () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
        await mountEditor()

        expect(wrapper!.find('.document-tabs').exists()).toBe(false)
        expect(hasIpcListener(IPC.EVENTS.FILE_SAVED_SUCCESS)).toBe(false)

        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        expect(wrapper!.find('.document-tabs').exists()).toBe(false)
        expect(setItemSpy).not.toHaveBeenCalled()
        // 未命名草稿缓存会读写自己的键；这里只要求标签会话键不被读写
        expect(
            getItemSpy.mock.calls.filter(([key]) => key === DOCUMENT_TABS_STORAGE_KEY)
        ).toHaveLength(0)

        // Ctrl+Tab / Ctrl+W 不被拦截，也不发送打开文件 IPC
        const ctrlTab = new KeyboardEvent('keydown', {
            key: 'Tab',
            ctrlKey: true,
            cancelable: true
        })
        window.dispatchEvent(ctrlTab)
        expect(ctrlTab.defaultPrevented).toBe(false)
        const ctrlW = new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, cancelable: true })
        window.dispatchEvent(ctrlW)
        expect(ctrlW.defaultPrevented).toBe(false)
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([])
    })

    it('关闭态不显示标签栏类名（编辑区布局与单文档一致）', async () => {
        featureFlagState.flags!.tabs = true
        await mountEditor()
        await setTabsEnabled(false)
        const editor = document.getElementById('md-edit-component') as HTMLElement
        expect(editor.classList.contains('md-edit-component--tabs')).toBe(false)
        expect(wrapper!.find('.document-tabs').exists()).toBe(false)
    })
})

describe('featureTabs 开启：标签打开 / 脏标记 / 切换 / 关闭', () => {
    beforeEach(() => {
        featureFlagState.flags!.tabs = true
    })

    it('打开文件后显示标签并写入版本化会话', async () => {
        await mountEditor()
        expect(wrapper!.find('.document-tabs').exists()).toBe(false)

        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        const tabs = wrapper!.findAll('.document-tab')
        expect(tabs).toHaveLength(1)
        expect(tabs[0].text()).toContain('a.md')
        expect(tabs[0].classes()).toContain('is-active')
        expect(document.getElementById('md-edit-component')!.className).toContain(
            'md-edit-component--tabs'
        )

        const session = readSession()
        expect(session).toMatchObject({
            paths: ['C:/notes/a.md'],
            activePath: 'C:/notes/a.md'
        })
        expect(
            JSON.parse(window.localStorage.getItem(DOCUMENT_TABS_STORAGE_KEY) as string)
        ).toMatchObject({ version: DOCUMENT_TABS_SESSION_VERSION })
    })

    it('标签栏首次出现时补发 Monaco 重排通知（automaticLayout=false 下避免高度裁切）', async () => {
        await mountEditor()
        const emitSpy = vi.spyOn(EventBus, '$emit')
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        vi.advanceTimersByTime(200)
        const relayoutEmits = emitSpy.mock.calls.filter(
            (call) => call[0] === EVENT_BUS.MONACO_RELAYOUT
        )
        // 至少 2 条：内容装载重排 + 标签栏出现导致的容器高度变化重排
        expect(relayoutEmits.length).toBeGreaterThanOrEqual(2)
    })

    it('编辑内容显示脏标记，主进程保存成功后清除', async () => {
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        expect(wrapper!.find('.document-tab-dirty').exists()).toBe(false)

        emitCode('修改后的内容')
        await nextTick()
        expect(wrapper!.find('.document-tab-dirty').exists()).toBe(true)

        getIpcListener(IPC.EVENTS.FILE_SAVED_SUCCESS)()
        await nextTick()
        expect(wrapper!.find('.document-tab-dirty').exists()).toBe(false)
    })

    it('切换标签：先同步当前全文，再经既有 OPEN_SELECT_FILE 加载目标', async () => {
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        await simulateOpenFile('C:\\notes\\b.md', '内容B')
        expect(wrapper!.findAll('.document-tab')).toHaveLength(2)

        emitCode('B 的修改')
        await nextTick()
        ipcRenderer.send.mockClear()

        await wrapper!.findAll('.document-tab')[0].trigger('click')
        // 顺序：先 UPDATE 全文（主进程随后按既有行为自动保存），再 OPEN 目标文件
        expect(ipcRenderer.send.mock.calls.map(([channel]) => channel)).toEqual([
            IPC.FILE.UPDATE_SELECT_FILE_CONTENT,
            IPC.FILE.OPEN_SELECT_FILE
        ])
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual(['B 的修改'])
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([
            { name: 'a.md', path: 'C:/notes/a.md', type: 'file', content: '' }
        ])

        // 主进程确认打开 a（先内容后路径）
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        expect(wrapper!.findAll('.document-tab')[0].classes()).toContain('is-active')
    })

    it('切回落盘异常（磁盘内容与内存快照不同）的标签时用快照恢复并保持脏标记', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        await simulateOpenFile('C:\\notes\\b.md', '内容B')

        emitCode('B 的未保存修改')
        await nextTick()
        // 切到 a：切换确认后 b 进入非活动状态（快照保留在内存）
        await wrapper!.findAll('.document-tab')[0].trigger('click')
        await simulateOpenFile('C:\\notes\\a.md', '内容A')

        // 切回 b：磁盘内容仍为旧值 → 使用内存快照恢复
        await wrapper!.findAll('.document-tab')[1].trigger('click')
        getIpcListener(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT)({}, '内容B')
        getIpcListener(IPC.FILE.USER_SELECT_FILE)({}, 'C:\\notes\\b.md')
        await nextTick()

        expect(wrapper!.findComponent(MdMonacoEdit).props('code')).toBe('B 的未保存修改')
        const bTab = wrapper!.findAll('.document-tab')[1]
        expect(bTab.classes()).toContain('is-active')
        expect(bTab.find('.document-tab-dirty').exists()).toBe(true)
    })

    it('关闭活动脏标签：先保存落盘，再切到相邻标签后移除旧标签', async () => {
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        await simulateOpenFile('C:\\notes\\b.md', '内容B')
        emitCode('B 的未保存修改')
        await nextTick()
        ipcRenderer.send.mockClear()

        await wrapper!.findAll('.document-tab')[1].find('.document-tab-close').trigger('click')

        expect(sentPayloads(IPC.FILE.SAVE_TO_DISK)).toEqual(['B 的未保存修改'])
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([
            { name: 'a.md', path: 'C:/notes/a.md', type: 'file', content: '' }
        ])

        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        expect(wrapper!.findAll('.document-tab')).toHaveLength(1)
        expect(wrapper!.find('.document-tab').text()).toContain('a.md')
        // 只剩一个标签时关闭按钮禁用（主进程无法卸载当前文档）
        expect(wrapper!.find('.document-tab-close').attributes('disabled')).toBeDefined()
    })

    it('最后一个标签不可关闭：关闭按钮禁用且 Ctrl+W 不触发', async () => {
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')

        const closeButton = wrapper!.find('.document-tab-close')
        expect(closeButton.attributes('disabled')).toBeDefined()

        const ctrlW = new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, cancelable: true })
        window.dispatchEvent(ctrlW)
        expect(ctrlW.defaultPrevented).toBe(false)
        expect(wrapper!.findAll('.document-tab')).toHaveLength(1)
    })

    it('Ctrl+Tab / Ctrl+Shift+Tab 循环切换，Ctrl+W 关闭当前标签', async () => {
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        await simulateOpenFile('C:\\notes\\b.md', '内容B')
        ipcRenderer.send.mockClear()

        const ctrlTab = new KeyboardEvent('keydown', {
            key: 'Tab',
            ctrlKey: true,
            cancelable: true
        })
        window.dispatchEvent(ctrlTab)
        expect(ctrlTab.defaultPrevented).toBe(true)
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([
            { name: 'a.md', path: 'C:/notes/a.md', type: 'file', content: '' }
        ])
        await simulateOpenFile('C:\\notes\\a.md', '内容A')

        ipcRenderer.send.mockClear()
        const ctrlShiftTab = new KeyboardEvent('keydown', {
            key: 'Tab',
            ctrlKey: true,
            shiftKey: true,
            cancelable: true
        })
        window.dispatchEvent(ctrlShiftTab)
        expect(ctrlShiftTab.defaultPrevented).toBe(true)
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([
            { name: 'b.md', path: 'C:/notes/b.md', type: 'file', content: '' }
        ])
        await simulateOpenFile('C:\\notes\\b.md', '内容B')
        ipcRenderer.send.mockClear()

        const ctrlW = new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, cancelable: true })
        window.dispatchEvent(ctrlW)
        expect(ctrlW.defaultPrevented).toBe(true)
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([
            { name: 'a.md', path: 'C:/notes/a.md', type: 'file', content: '' }
        ])
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        expect(wrapper!.findAll('.document-tab')).toHaveLength(1)
    })

    it('对话框打开时快捷键让位（不拦截按键）', async () => {
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        await simulateOpenFile('C:\\notes\\b.md', '内容B')

        const dialog = document.createElement('div')
        dialog.setAttribute('aria-modal', 'true')
        document.body.appendChild(dialog)
        try {
            const ctrlTab = new KeyboardEvent('keydown', {
                key: 'Tab',
                ctrlKey: true,
                cancelable: true
            })
            window.dispatchEvent(ctrlTab)
            expect(ctrlTab.defaultPrevented).toBe(false)
        } finally {
            dialog.remove()
        }
    })

    it('快捷键边界：输入法组字中 / 带 Alt 修饰时让位；大写 Ctrl+W 可关闭', async () => {
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        await simulateOpenFile('C:\\notes\\b.md', '内容B')
        ipcRenderer.send.mockClear()

        // 输入法组字中：不抢占按键
        const composing = new KeyboardEvent('keydown', {
            key: 'Tab',
            ctrlKey: true,
            cancelable: true
        })
        Object.defineProperty(composing, 'isComposing', { value: true })
        window.dispatchEvent(composing)
        expect(composing.defaultPrevented).toBe(false)

        // 带 Alt 修饰：不属于标签快捷键
        const altTab = new KeyboardEvent('keydown', {
            key: 'Tab',
            ctrlKey: true,
            altKey: true,
            cancelable: true
        })
        window.dispatchEvent(altTab)
        expect(altTab.defaultPrevented).toBe(false)
        expect(ipcRenderer.send).not.toHaveBeenCalled()

        // 大写 W（CapsLock）同样关闭当前标签
        const upperW = new KeyboardEvent('keydown', {
            key: 'W',
            ctrlKey: true,
            cancelable: true
        })
        window.dispatchEvent(upperW)
        expect(upperW.defaultPrevented).toBe(true)
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([
            { name: 'a.md', path: 'C:/notes/a.md', type: 'file', content: '' }
        ])
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        expect(wrapper!.findAll('.document-tab')).toHaveLength(1)
    })

    it('主进程重读当前文件（FILE_CONTENT_RELOADED）以磁盘内容为准并清除脏标记', async () => {
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        emitCode('编辑中未保存')
        await nextTick()
        expect(wrapper!.find('.document-tab-dirty').exists()).toBe(true)

        getIpcListener(IPC.EVENTS.FILE_CONTENT_RELOADED)(
            {},
            {
                path: 'C:\\notes\\a.md',
                content: '磁盘最新内容'
            }
        )
        await nextTick()

        expect(wrapper!.findComponent(MdMonacoEdit).props('code')).toBe('磁盘最新内容')
        expect(wrapper!.find('.document-tab-dirty').exists()).toBe(false)
    })
})

describe('featureTabs：会话恢复', () => {
    it('启动恢复标签列表，并在无启动文件事件时兜底打开上次活动标签', async () => {
        featureFlagState.flags!.tabs = true
        window.localStorage.setItem(
            DOCUMENT_TABS_STORAGE_KEY,
            JSON.stringify({
                version: DOCUMENT_TABS_SESSION_VERSION,
                paths: ['C:/notes/a.md', 'C:/notes/b.md'],
                activePath: 'C:/notes/b.md'
            })
        )
        await mountEditor()

        expect(wrapper!.findAll('.document-tab')).toHaveLength(2)
        expect(wrapper!.findAll('.document-tab')[1].classes()).toContain('is-active')
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([])

        vi.advanceTimersByTime(1500)
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([
            { name: 'b.md', path: 'C:/notes/b.md', type: 'file', content: '' }
        ])
    })

    it('启动文件事件到达时取消兜底打开（避免重复打开）', async () => {
        featureFlagState.flags!.tabs = true
        window.localStorage.setItem(
            DOCUMENT_TABS_STORAGE_KEY,
            JSON.stringify({
                version: DOCUMENT_TABS_SESSION_VERSION,
                paths: ['C:/notes/a.md', 'C:/notes/b.md'],
                activePath: 'C:/notes/b.md'
            })
        )
        await mountEditor()
        await simulateOpenFile('C:\\notes\\b.md', '恢复内容')

        vi.advanceTimersByTime(5000)
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([])
        expect(wrapper!.findAll('.document-tab')).toHaveLength(2)
    })

    it('会话数据损坏时静默降级（不渲染标签、不抛错、不打开文件）', async () => {
        featureFlagState.flags!.tabs = true
        window.localStorage.setItem(DOCUMENT_TABS_STORAGE_KEY, '{broken-json')
        await mountEditor()

        expect(wrapper!.find('.document-tabs').exists()).toBe(false)
        vi.advanceTimersByTime(5000)
        expect(sentPayloads(IPC.FILE.OPEN_SELECT_FILE)).toEqual([])
    })
})

describe('featureTabs：运行中开关切换（设置保存后即时生效）', () => {
    it('开启后采纳当前文件并显示标签；关闭后撤销标签栏与快捷键且停止写存储', async () => {
        await mountEditor()
        await simulateOpenFile('C:\\notes\\a.md', '内容A')
        expect(wrapper!.find('.document-tabs').exists()).toBe(false)

        await setTabsEnabled(true)
        const restoredTabs = wrapper!.findAll('.document-tab')
        expect(restoredTabs).toHaveLength(1)
        expect(restoredTabs[0].text()).toContain('a.md')
        expect(hasIpcListener(IPC.EVENTS.FILE_SAVED_SUCCESS)).toBe(true)

        await setTabsEnabled(false)
        expect(wrapper!.find('.document-tabs').exists()).toBe(false)
        // 关闭时注销保存监听（on 调用记录是历史，需看 removeListener 是否成对摘除）
        expect(
            ipcRenderer.removeListener.mock.calls.some(
                ([channel]) => channel === IPC.EVENTS.FILE_SAVED_SUCCESS
            )
        ).toBe(true)

        // 关闭后：打开新文件不再登记标签、不再写会话；快捷键不再拦截
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        await simulateOpenFile('C:\\notes\\b.md', '内容B')
        expect(wrapper!.find('.document-tabs').exists()).toBe(false)
        expect(setItemSpy).not.toHaveBeenCalled()

        const ctrlTab = new KeyboardEvent('keydown', {
            key: 'Tab',
            ctrlKey: true,
            cancelable: true
        })
        window.dispatchEvent(ctrlTab)
        expect(ctrlTab.defaultPrevented).toBe(false)
    })
})
