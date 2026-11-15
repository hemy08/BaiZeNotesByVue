// @vitest-environment jsdom
/**
 * P1-FE-02 / P1-FE-03：BaiZeNotes.vue 对话框事件接线集成测试。
 *
 * 背景（out/full-scan/func-errors.md）：
 * - FE-02：FontSelectDialog 只在 apply 时 emit('apply', html)，但父组件 BaiZeNotes.vue
 *   没有绑定 @apply → 特殊文字插入完全无效；
 * - FE-03：InsertImageDialog「本地文件 → 浏览」只 emit('browseFile')，父组件没绑定
 *   → 本地路径永远为空、插入按钮禁用。
 *
 * 本测试挂载真实的 BaiZeNotes.vue（仅 stub 掉 Monaco 重型依赖与工作区子组件），
 * 通过真实的对话框组件验证：
 * 1. 特殊文字「插入」→ apply → EventBus MONACO_INSERT_TEXT（编辑器插入链路），窗口保持打开；
 *    「确定」只关闭窗口、不再重复插入（避免与「插入」按钮重复插入）；
 * 2. 插入图片「浏览」→ invoke('baize:file:select-image') → 路径回填 → 插入相对引用；
 * 3. 取消选择时不回填、不插入。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

// Monaco 在 jsdom 下不需要真实实例；BaiZeNotes 只用到 defineTheme/setTheme
vi.mock('monaco-editor', () => ({
    editor: { defineTheme: vi.fn(), setTheme: vi.fn() }
}))
// 工作区/菜单/状态栏与本次对话框接线无关，stub 掉避免加载整棵组件树
vi.mock('@renderer/components/WorkSpaceArea/WorkSpace.vue', () => ({
    default: { name: 'WorkSpace', template: '<div class="workspace-stub" />' }
}))
vi.mock('@renderer/components/StatusBar.vue', () => ({
    default: { name: 'StatusBar', template: '<div class="status-bar-stub" />' }
}))
vi.mock('@renderer/components/MenuBar.vue', () => ({
    default: { name: 'MenuBar', template: '<div class="menu-bar-stub" />' }
}))

import BaiZeNotes from '@renderer/components/BaiZeNotes.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { getConfigStore } from '@renderer/common/useConfigStore'
import type { DialogName } from '@renderer/common/useConfigStore'

const invokeMock = vi.fn()
type InvokeArgs = [channel: string, ...args: unknown[]]

let wrapper: VueWrapper | null = null

beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(null)
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn(),
            removeListener: vi.fn(),
            send: vi.fn(),
            invoke: (...args: InvokeArgs) => invokeMock(...args)
        }
    })
    // HelpAboutDialog 等对话框在 onMounted 里读取 window.api（配置 + 版本信息），
    // 全部用轻量桩隔离，避免真实 IPC/electron-store 依赖与无用 stderr。
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue(null) },
        app: {
            getVersion: vi.fn().mockResolvedValue({
                appVersion: '0.0.0-test',
                electronVersion: '0.0.0',
                chromeVersion: '0.0.0',
                nodeVersion: '0.0.0',
                vueVersion: '0.0.0',
                viteVersion: '0.0.0',
                typescriptVersion: '0.0.0',
                monacoEditorVersion: '0.0.0',
                markdownItVersion: '0.0.0'
            })
        }
    })
    // 对话框单例状态复位，避免用例间相互污染
    const store = getConfigStore()
    store.hideDialog('fontSelect')
    store.hideDialog('insertImage')
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

async function mountShell(): Promise<VueWrapper> {
    wrapper = mount(BaiZeNotes, {
        attachTo: document.body,
        // 对话框内部使用 <Teleport to="body">，stub 后内容内联渲染便于查找
        global: { stubs: { teleport: true } }
    })
    await flushPromises()
    return wrapper
}

/**
 * PF-6：对话框聚合入口改为 defineAsyncComponent 懒加载（首次可见时才动态 import 组件）。
 * 打开对话框后需要等待动态 import（Vite 模块运行器为真实异步 I/O）与异步组件挂载完成，
 * 测试里统一用该辅助函数：先等可见性生效，再等对话框根节点出现在 DOM 中。
 */
async function openDialog(name: DialogName): Promise<void> {
    getConfigStore().showDialog(name)
    // 1) 父组件 visible 变化 → 包装组件首次渲染异步子组件（此时显示「加载中…」占位）
    await flushPromises()
    // 2) 等待动态 import 完成后的异步组件挂载（对话框根节点出现）
    await vi.waitFor(
        () => {
            expect(document.querySelector('.dialog-overlay, .dialog-container')).not.toBeNull()
        },
        { timeout: 3000, interval: 10 }
    )
    await flushPromises()
    await nextTick()
}

describe('P1-FE-02 特殊文字插入接线', () => {
    it('emits MONACO_INSERT_TEXT only on 插入 click, and 确定 closes without inserting', async () => {
        const shell = await mountShell()
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await openDialog('fontSelect')

        // 按钮文案：取消 / 插入 / 确定
        expect(shell.find('.btn-insert').text()).toBe('插入')
        expect(shell.find('.btn-confirm').text()).toBe('确定')

        await shell.find('.text-input-area').setValue('你好世界')
        // 加粗按钮（.font-style-btn 第一项）→ 生成 <b> 片段
        await shell.findAll('.font-style-btn')[0].trigger('click')
        await shell.find('.btn-insert').trigger('click')
        await flushPromises()

        expect(emitSpy).toHaveBeenCalledWith(
            EVENT_BUS.MONACO_INSERT_TEXT,
            expect.stringContaining('你好世界')
        )
        const payload = emitSpy.mock.calls.find(
            ([eventName]) => eventName === EVENT_BUS.MONACO_INSERT_TEXT
        )?.[1] as string
        expect(payload).toContain('<b>')
        expect(payload).toContain('font-family:')
        // 「插入」不关闭窗口，可继续调整/再次插入
        expect(getConfigStore().dialogs.fontSelect.visible).toBe(true)

        // 「确定」只关闭窗口，不触发第二次插入
        const insertCallsBeforeConfirm = emitSpy.mock.calls.filter(
            ([eventName]) => eventName === EVENT_BUS.MONACO_INSERT_TEXT
        ).length
        await shell.find('.btn-confirm').trigger('click')
        await flushPromises()
        const insertCallsAfterConfirm = emitSpy.mock.calls.filter(
            ([eventName]) => eventName === EVENT_BUS.MONACO_INSERT_TEXT
        ).length
        expect(insertCallsAfterConfirm).toBe(insertCallsBeforeConfirm)
        expect(getConfigStore().dialogs.fontSelect.visible).toBe(false)
    })
})

describe('P1-FE-03 本地图片插入接线', () => {
    it('browses a local image via IPC, fills the path back and inserts the copied relative src', async () => {
        const shell = await mountShell()
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === 'baize:file:select-image') {
                return {
                    canceled: false,
                    filePath: 'C:/pics/logo.png',
                    imageSrc: './images/logo-x1.png'
                }
            }
            return null
        })
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await openDialog('insertImage')

        // 未选择前插入按钮禁用
        expect(shell.find('.btn-confirm').attributes('disabled')).toBeDefined()

        await shell.find('.browse-btn').trigger('click')
        await flushPromises()

        // 父组件经新增通道拉起系统图片选择框
        expect(invokeMock).toHaveBeenCalledWith('baize:file:select-image')
        // 路径已回填到只读输入框，插入按钮可用
        const input = shell.find('.path-input-wrapper input').element as HTMLInputElement
        expect(input.value).toBe('C:/pics/logo.png')
        expect(shell.find('.btn-confirm').attributes('disabled')).toBeUndefined()

        await shell.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(emitSpy).toHaveBeenCalledWith(
            EVENT_BUS.MONACO_INSERT_TEXT,
            '![image](./images/logo-x1.png)'
        )
    })

    it('keeps the local path empty when the image picker is canceled', async () => {
        const shell = await mountShell()
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === 'baize:file:select-image') {
                return { canceled: true, filePath: null, imageSrc: null }
            }
            return null
        })

        await openDialog('insertImage')

        await shell.find('.browse-btn').trigger('click')
        await flushPromises()

        const input = shell.find('.path-input-wrapper input').element as HTMLInputElement
        expect(input.value).toBe('')
        expect(shell.find('.btn-confirm').attributes('disabled')).toBeDefined()
    })

    it('clears the picked local image after closing so the next open starts empty', async () => {
        const shell = await mountShell()
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === 'baize:file:select-image') {
                return {
                    canceled: false,
                    filePath: 'C:/pics/logo.png',
                    imageSrc: './images/logo-x1.png'
                }
            }
            return null
        })

        await openDialog('insertImage')
        await shell.find('.browse-btn').trigger('click')
        await flushPromises()
        expect((shell.find('.path-input-wrapper input').element as HTMLInputElement).value).toBe(
            'C:/pics/logo.png'
        )

        // 取消关闭 → 再次打开：选择结果已清空，避免旧文件的相对引用误插到新文件
        await shell.find('.btn-cancel').trigger('click')
        await flushPromises()
        await openDialog('insertImage')

        expect((shell.find('.path-input-wrapper input').element as HTMLInputElement).value).toBe('')
        expect(shell.find('.btn-confirm').attributes('disabled')).toBeDefined()
    })
})
