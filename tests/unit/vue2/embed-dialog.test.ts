// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L4：嵌入 raw/ 资料对话框单测（`components/Markdown/embed/EmbedDialog.vue`）。
 *
 * 覆盖：
 * 1. 打开即发送 RELOAD_FROM_DISK 并等待 FILE_SYSTEM_DATA 事件，解析 raw/ 文件清单；
 * 2. 文本只读预览复用 FILE.READ_HTML；图片以 app://local URL 缩略；
 * 3. 「插入到编辑器」复用 A8 insertMarkdownAtSelection，生成相对当前活动文件的 Markdown 引用；
 * 4. 无活动文件 / 无编辑器 / 不同磁盘的引导文案；
 * 5. 空态（无 raw/）、错误态（无工作区）、超时；
 * 6. 关闭按钮 emit close；visible=false 不发起 IPC；
 * 7. 加载防御分支：IPC 不可用（缺 invoke / send 抛错）、removeListener 抛错、旧 preload 无
 *    removeListener、刷新后过期目录树事件被忽略；
 * 8. 预览边界：超 2 万字符截断、非字符串结果 / 读取抛错 / IPC 不可用、快速切换文件时丢弃
 *    过期成功结果与过期失败；
 * 9. 插入 / 复制兜底：插入返回 false / 抛错、跨磁盘、无活动文件复制、剪贴板不可用 /
 *    写入抛错、复制反馈 1.5s 复位与切换文件清理计时器、重复点击选中项不重复预览。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import EmbedDialog from '@renderer/components/Markdown/embed/EmbedDialog.vue'
import { getActiveEditor } from '@renderer/common/active-editor'
import { insertMarkdownAtSelection } from '@renderer/components/Markdown/editor-paste-enhance'
import { documentHistoryState } from '@renderer/composables/useDocumentHistory'
import { t } from '@renderer/common/i18n'
import { IPC } from '../../../src/shared/ipc-channels'

// 插入链路的两个外部依赖用替身：只断言「调用了既有能力 + 参数正确」
vi.mock('@renderer/common/active-editor', () => ({
    getActiveEditor: vi.fn()
}))
vi.mock('@renderer/components/Markdown/editor-paste-enhance', () => ({
    insertMarkdownAtSelection: vi.fn(() => true)
}))

/** 目录树文件节点 */
function makeTreeFile(name: string, parentPath: string, extension: string) {
    return {
        id: `${parentPath}/${name}`,
        name,
        path: `${parentPath}/${name}`,
        type: 'file' as const,
        isDirectory: false,
        fileExtension: extension,
        children: []
    }
}

/** 目录树目录节点 */
function makeTreeFolder(name: string, parentPath: string, children: unknown[]) {
    return {
        id: `${parentPath}/${name}`,
        name,
        path: `${parentPath}/${name}`,
        type: 'folder' as const,
        isDirectory: true,
        fileExtension: '',
        children
    }
}

/** 工作区目录树：wiki/page.md + raw/ 下文本/图片/PDF 三个文件（按相对路径升序选中第一个文本） */
const TREE_WITH_RAW = [
    makeTreeFolder('ws', 'E:', [
        makeTreeFolder('wiki', 'E:/ws', [makeTreeFile('page.md', 'E:/ws/wiki', '.md')]),
        makeTreeFolder('raw', 'E:/ws', [
            makeTreeFile('a-source.md', 'E:/ws/raw', '.md'),
            makeTreeFile('b-image.png', 'E:/ws/raw', '.png'),
            makeTreeFile('c-report.pdf', 'E:/ws/raw', '.pdf')
        ])
    ])
]

/** 工作区目录树：没有 raw/ 目录 */
const TREE_WITHOUT_RAW = [
    makeTreeFolder('ws', 'E:', [
        makeTreeFolder('wiki', 'E:/ws', [makeTreeFile('page.md', 'E:/ws/wiki', '.md')])
    ])
]

/** 工作区目录树：raw/ 下两个文本 + 图片 + 其他（预览切换 / 过期结果 / 计时器清理用例） */
const TREE_WITH_TEXTS = [
    makeTreeFolder('ws', 'E:', [
        makeTreeFolder('wiki', 'E:/ws', [makeTreeFile('page.md', 'E:/ws/wiki', '.md')]),
        makeTreeFolder('raw', 'E:/ws', [
            makeTreeFile('a-source.md', 'E:/ws/raw', '.md'),
            makeTreeFile('b-note.md', 'E:/ws/raw', '.md'),
            makeTreeFile('c-image.png', 'E:/ws/raw', '.png'),
            makeTreeFile('d-report.pdf', 'E:/ws/raw', '.pdf')
        ])
    ])
]

/** 可手动结算的 Promise（模拟慢速 FILE.READ_HTML，验证过期预览结果被丢弃） */
function createDeferred<T>() {
    let resolve: (value: T) => void = () => undefined
    let reject: (reason?: unknown) => void = () => undefined
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
let on: ReturnType<typeof vi.fn>
let removeListener: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[] = []

/** 取最近一次注册的目录树事件监听器 */
function getTreeListener(): (event: unknown, payload: unknown) => void {
    const call = on.mock.calls
        .slice()
        .reverse()
        .find((item) => item[0] === IPC.FILE_MANAGER.FILE_SYSTEM_DATA)
    expect(call).toBeDefined()
    return call![1] as (event: unknown, payload: unknown) => void
}

/** 挂载对话框（默认 visible=true 触发目录树刷新请求） */
function mountEmbed(visible = true): VueWrapper {
    const wrapper = mount(EmbedDialog, {
        props: { visible },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
}

/** 打开对话框并下发指定目录树事件 */
async function mountWithTree(tree: unknown, visible = true): Promise<VueWrapper> {
    const wrapper = mountEmbed(visible)
    await flushPromises()
    getTreeListener()({}, JSON.stringify(tree))
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    invoke = vi.fn(async (channel: string) => {
        if (channel === IPC.FILE.READ_HTML) {
            return '# 原始资料\n\n正文内容'
        }
        return undefined
    })
    send = vi.fn()
    on = vi.fn()
    removeListener = vi.fn()
    vi.stubGlobal('electron', {
        ipcRenderer: { invoke, send, on, removeListener }
    })
    vi.mocked(getActiveEditor).mockReturnValue({ getModel: () => ({}) } as never)
    vi.mocked(insertMarkdownAtSelection).mockClear()
    documentHistoryState.activeFilePath = 'E:/ws/wiki/page.md'
})

afterEach(() => {
    for (const wrapper of wrappers) {
        wrapper.unmount()
    }
    wrappers = []
    document.body.innerHTML = ''
    documentHistoryState.activeFilePath = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe('EmbedDialog：raw/ 文件清单', () => {
    it('打开即发送 RELOAD_FROM_DISK 并等待目录树事件', async () => {
        mountEmbed()
        await flushPromises()
        expect(send).toHaveBeenCalledWith(IPC.FILE_MANAGER.RELOAD_FROM_DISK)
        expect(on).toHaveBeenCalledWith(IPC.FILE_MANAGER.FILE_SYSTEM_DATA, expect.any(Function))
    })

    it('解析 raw/ 清单：只列出 raw/ 下文件，按相对路径升序，默认选中第一个', async () => {
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        const items = wrapper.findAll('[data-testid="embed-file-item"]')
        expect(items).toHaveLength(3)
        expect(items.map((item) => item.attributes('data-file-path'))).toEqual([
            'E:/ws/raw/a-source.md',
            'E:/ws/raw/b-image.png',
            'E:/ws/raw/c-report.pdf'
        ])
        expect(items[0].classes()).toContain('is-selected')
        // 第一个是文本：自动加载 READ_HTML 预览
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.READ_HTML, 'E:/ws/raw/a-source.md')
        expect(wrapper.find('[data-testid="embed-preview-text"]').text()).toContain('正文内容')
    })

    it('选中图片时以 app://local URL 缩略（不调用 READ_HTML）', async () => {
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        invoke.mockClear()
        const imageItem = wrapper.findAll('[data-testid="embed-file-item"]')[1]
        await imageItem.trigger('click')
        await flushPromises()

        const image = wrapper.find('[data-testid="embed-preview-image"]')
        expect(image.exists()).toBe(true)
        // 图片经既有本地资源 URL（app://local 或 dev 下 file://）加载，不新增读取通道
        expect(image.attributes('src')).toMatch(/^(app:\/\/local\/|file:\/\/)/)
        expect(invoke).not.toHaveBeenCalledWith(IPC.FILE.READ_HTML, 'E:/ws/raw/b-image.png')
    })

    it('选中其他类型（PDF）展示「不支持内联预览」提示', async () => {
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.findAll('[data-testid="embed-file-item"]')[2].trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="embed-preview-other"]').exists()).toBe(true)
    })

    it('visible=false 不发送刷新请求', async () => {
        mountEmbed(false)
        await flushPromises()
        expect(send).not.toHaveBeenCalled()
    })
})

describe('EmbedDialog：插入 Markdown 引用', () => {
    it('插入到编辑器：复用 A8 insertMarkdownAtSelection 并生成相对当前文件的链接', async () => {
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-insert-btn"]').trigger('click')
        await flushPromises()

        expect(insertMarkdownAtSelection).toHaveBeenCalledWith(
            expect.anything(),
            '[a-source](../raw/a-source.md)'
        )
        const status = wrapper.find('[data-testid="embed-status"]')
        expect(status.exists()).toBe(true)
        expect(status.text()).toContain(t('editorUi.embedDialog.inserted'))
    })

    it('无活动文件时给出「请先打开 wiki/ 页面」引导，不调用插入', async () => {
        documentHistoryState.activeFilePath = ''
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-insert-btn"]').trigger('click')
        await flushPromises()
        expect(insertMarkdownAtSelection).not.toHaveBeenCalled()
        expect(wrapper.find('[data-testid="embed-status"]').text()).toContain(
            t('editorUi.embedDialog.noActiveFile')
        )
    })

    it('无可用编辑器时给出引导，不抛异常', async () => {
        vi.mocked(getActiveEditor).mockReturnValue(null)
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-insert-btn"]').trigger('click')
        await flushPromises()
        expect(insertMarkdownAtSelection).not.toHaveBeenCalled()
        expect(wrapper.find('[data-testid="embed-status"]').text()).toContain(
            t('editorUi.embedDialog.editorUnavailable')
        )
    })

    it('复制 Markdown：写入剪贴板（无可用编辑器时的兜底路径）', async () => {
        const writeText = vi.fn(async () => undefined)
        vi.stubGlobal('navigator', {
            ...navigator,
            clipboard: { writeText }
        })
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-copy-btn"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith('[a-source](../raw/a-source.md)')
        expect(wrapper.find('[data-testid="embed-copy-btn"]').text()).toContain(
            t('editorUi.embedDialog.copied')
        )
    })
})

describe('EmbedDialog：空态 / 错误态 / 关闭', () => {
    it('未初始化 raw/ 时展示空态引导', async () => {
        const wrapper = await mountWithTree(TREE_WITHOUT_RAW)
        expect(wrapper.find('[data-testid="embed-empty-raw"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-testid="embed-file-item"]')).toHaveLength(0)
    })

    it('无工作区（空目录树）展示无工作区引导', async () => {
        const wrapper = await mountWithTree([])
        expect(wrapper.find('[data-testid="embed-no-workspace"]').exists()).toBe(true)
    })

    it('目录树非法载荷展示错误态，可重试', async () => {
        const wrapper = mountEmbed()
        await flushPromises()
        getTreeListener()({}, '{not-json')
        await flushPromises()
        expect(wrapper.find('[data-testid="embed-error"]').exists()).toBe(true)
        send.mockClear()
        await wrapper.find('.btn-retry-embed').trigger('click')
        expect(send).toHaveBeenCalledWith(IPC.FILE_MANAGER.RELOAD_FROM_DISK)
    })

    it('等待目录树超时展示超时错误（可重试）', async () => {
        vi.useFakeTimers()
        const wrapper = mountEmbed()
        await vi.advanceTimersByTimeAsync(8100)
        expect(wrapper.find('[data-testid="embed-error"]').text()).toContain(
            t('editorUi.embedDialog.timeout')
        )
        expect(removeListener).toHaveBeenCalledWith(
            IPC.FILE_MANAGER.FILE_SYSTEM_DATA,
            expect.any(Function)
        )
    })

    it('关闭按钮 emit close', async () => {
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('.btn-close-embed').trigger('click')
        expect(wrapper.emitted('close')).toBeTruthy()
    })
})

describe('EmbedDialog：加载失败与监听清理防御分支', () => {
    it('ipcRenderer 缺少 invoke 时进入「主进程不可用」错误态', async () => {
        vi.stubGlobal('electron', { ipcRenderer: { on, send, removeListener } })
        const wrapper = mountEmbed()
        await flushPromises()

        const error = wrapper.find('[data-testid="embed-error"]')
        expect(error.exists()).toBe(true)
        expect(error.text()).toContain(t('editorUi.embedDialog.ipcUnavailable'))
        expect(send).not.toHaveBeenCalled()
    })

    it('发送刷新请求抛错时进入「主进程不可用」错误态', async () => {
        send.mockImplementation(() => {
            throw new Error('send failed')
        })
        const wrapper = mountEmbed()
        await flushPromises()

        expect(wrapper.find('[data-testid="embed-error"]').text()).toContain(
            t('editorUi.embedDialog.ipcUnavailable')
        )
    })

    it('移除目录树监听抛错时忽略异常并继续解析清单', async () => {
        removeListener.mockImplementation(() => {
            throw new Error('remove failed')
        })
        const wrapper = await mountWithTree(TREE_WITH_RAW)

        expect(wrapper.findAll('[data-testid="embed-file-item"]')).toHaveLength(3)
    })

    it('旧 preload 无 removeListener 时超时清理不抛错', async () => {
        vi.stubGlobal('electron', { ipcRenderer: { invoke, on, send } })
        vi.useFakeTimers()
        const wrapper = mountEmbed()
        await vi.advanceTimersByTimeAsync(8100)

        expect(wrapper.find('[data-testid="embed-error"]').text()).toContain(
            t('editorUi.embedDialog.timeout')
        )
    })

    it('刷新后旧监听事件不覆盖新一轮结果', async () => {
        const wrapper = mountEmbed(false)
        await flushPromises()

        // 第一轮加载：记录监听器后关闭（停止等待）
        await wrapper.setProps({ visible: true })
        await flushPromises()
        const staleListener = getTreeListener()
        await wrapper.setProps({ visible: false })
        await flushPromises()

        // 第二轮加载：产生新的加载序号与监听器
        await wrapper.setProps({ visible: true })
        await flushPromises()
        expect(wrapper.find('[data-testid="embed-loading"]').exists()).toBe(true)

        // 旧监听器回放（序号过期）→ 不改变本轮加载状态
        staleListener({}, JSON.stringify(TREE_WITH_RAW))
        await flushPromises()
        expect(wrapper.find('[data-testid="embed-loading"]').exists()).toBe(true)

        // 新监听器仍可正常完成加载
        getTreeListener()({}, JSON.stringify(TREE_WITH_RAW))
        await flushPromises()
        expect(wrapper.findAll('[data-testid="embed-file-item"]')).toHaveLength(3)
    })
})

describe('EmbedDialog：预览 IPC 边界与过期结果', () => {
    it('文本预览超过 2 万字符时截断并提示', async () => {
        invoke.mockImplementation(async (channel: string) =>
            channel === IPC.FILE.READ_HTML ? 'x'.repeat(20001) : undefined
        )
        const wrapper = await mountWithTree(TREE_WITH_RAW)

        expect(wrapper.find('[data-testid="embed-preview-text"]').text()).toHaveLength(20000)
        const truncated = wrapper.find('[data-testid="embed-preview-truncated"]')
        expect(truncated.exists()).toBe(true)
        expect(truncated.text()).toContain('20000')
    })

    it('读取结果不是字符串时展示预览失败提示', async () => {
        invoke.mockImplementation(async () => ({ bad: true }))
        const wrapper = await mountWithTree(TREE_WITH_RAW)

        expect(wrapper.find('[data-testid="embed-preview-error"]').text()).toContain(
            t('editorUi.embedDialog.previewFailed')
        )
    })

    it('读取预览抛错时展示预览失败提示', async () => {
        invoke.mockImplementation(async () => {
            throw new Error('read failed')
        })
        const wrapper = await mountWithTree(TREE_WITH_RAW)

        expect(wrapper.find('[data-testid="embed-preview-error"]').text()).toContain(
            t('editorUi.embedDialog.previewFailed')
        )
    })

    it('预览阶段主进程不可用时展示失败提示', async () => {
        const wrapper = await mountWithTree(TREE_WITH_TEXTS)
        // 目录树已加载后 IPC 失效（模拟 preload 缺失）
        vi.stubGlobal('electron', undefined)
        await wrapper.findAll('[data-testid="embed-file-item"]')[1].trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="embed-preview-error"]').text()).toContain(
            t('editorUi.embedDialog.ipcUnavailable')
        )
    })

    it('快速切换文件后丢弃过期的预览成功结果', async () => {
        const firstPreview = createDeferred<string>()
        let readCount = 0
        invoke.mockImplementation((channel: string) => {
            if (channel !== IPC.FILE.READ_HTML) {
                return Promise.resolve(undefined)
            }
            readCount += 1
            return readCount === 1 ? firstPreview.promise : Promise.resolve('第二个文件内容')
        })
        const wrapper = await mountWithTree(TREE_WITH_TEXTS)
        expect(wrapper.find('[data-testid="embed-preview-loading"]').exists()).toBe(true)

        await wrapper.findAll('[data-testid="embed-file-item"]')[1].trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="embed-preview-text"]').text()).toBe('第二个文件内容')

        // 第一个文件的慢速预览返回：序号过期，不覆盖当前内容
        firstPreview.resolve('过期内容')
        await flushPromises()
        expect(wrapper.find('[data-testid="embed-preview-text"]').text()).toBe('第二个文件内容')
    })

    it('切换文件后过期的预览失败不覆盖当前结果', async () => {
        const firstPreview = createDeferred<string>()
        let readCount = 0
        invoke.mockImplementation((channel: string) => {
            if (channel !== IPC.FILE.READ_HTML) {
                return Promise.resolve(undefined)
            }
            readCount += 1
            return readCount === 1 ? firstPreview.promise : Promise.resolve('第二个文件内容')
        })
        const wrapper = await mountWithTree(TREE_WITH_TEXTS)

        await wrapper.findAll('[data-testid="embed-file-item"]')[1].trigger('click')
        await flushPromises()
        firstPreview.reject(new Error('stale read failed'))
        await flushPromises()

        expect(wrapper.find('[data-testid="embed-preview-text"]').text()).toBe('第二个文件内容')
        expect(wrapper.find('[data-testid="embed-preview-error"]').exists()).toBe(false)
    })
})

describe('EmbedDialog：插入 / 复制失败兜底与计时器', () => {
    it('插入返回 false 时展示插入失败提示', async () => {
        vi.mocked(insertMarkdownAtSelection).mockReturnValueOnce(false)
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-insert-btn"]').trigger('click')
        await flushPromises()

        const status = wrapper.find('[data-testid="embed-status"]')
        expect(status.text()).toContain(t('editorUi.embedDialog.insertFailed'))
        expect(status.classes()).toContain('embed-hint--error')
    })

    it('插入抛错时展示插入失败提示', async () => {
        vi.mocked(insertMarkdownAtSelection).mockImplementationOnce(() => {
            throw new Error('insert boom')
        })
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-insert-btn"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="embed-status"]').text()).toContain(
            t('editorUi.embedDialog.insertFailed')
        )
    })

    it('活动文件位于不同磁盘时提示无法生成相对路径', async () => {
        documentHistoryState.activeFilePath = 'F:/other/page.md'
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-insert-btn"]').trigger('click')
        await flushPromises()

        expect(insertMarkdownAtSelection).not.toHaveBeenCalled()
        expect(wrapper.find('[data-testid="embed-status"]').text()).toContain(
            t('editorUi.embedDialog.differentDrive')
        )
    })

    it('无活动文件时复制给出「先打开页面」引导', async () => {
        documentHistoryState.activeFilePath = ''
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-copy-btn"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="embed-status"]').text()).toContain(
            t('editorUi.embedDialog.noActiveFile')
        )
    })

    it('剪贴板不可用时复制给出失败提示', async () => {
        vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-copy-btn"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="embed-status"]').text()).toContain(
            t('editorUi.embedDialog.copyFailed')
        )
    })

    it('写入剪贴板抛错时给出失败提示', async () => {
        const writeText = vi.fn(async () => {
            throw new Error('clipboard denied')
        })
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        await wrapper.find('[data-testid="embed-copy-btn"]').trigger('click')
        await flushPromises()

        expect(writeText).toHaveBeenCalled()
        expect(wrapper.find('[data-testid="embed-status"]').text()).toContain(
            t('editorUi.embedDialog.copyFailed')
        )
    })

    it('复制成功后 1.5s 复位「已复制」反馈（期间重复复制重置计时器）', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        const writeText = vi.fn(async () => undefined)
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        const copyButton = () => wrapper.find('[data-testid="embed-copy-btn"]')

        await copyButton().trigger('click')
        await flushPromises()
        expect(copyButton().text()).toContain(t('editorUi.embedDialog.copied'))

        // 计时器未到期前再次复制：清理旧计时器并重新计时
        await copyButton().trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(1500)
        await nextTick()
        expect(copyButton().text()).toContain(t('editorUi.embedDialog.copy'))
    })

    it('切换选中文件时清理复制反馈计时器', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        const writeText = vi.fn(async () => undefined)
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
        const wrapper = await mountWithTree(TREE_WITH_TEXTS)

        await wrapper.find('[data-testid="embed-copy-btn"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="embed-copy-btn"]').text()).toContain(
            t('editorUi.embedDialog.copied')
        )

        await wrapper.findAll('[data-testid="embed-file-item"]')[1].trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="embed-copy-btn"]').text()).toContain(
            t('editorUi.embedDialog.copy')
        )

        // 旧计时器已清理：推进 1.5s 不改变当前按钮文案
        await vi.advanceTimersByTimeAsync(1500)
        await nextTick()
        expect(wrapper.find('[data-testid="embed-copy-btn"]').text()).toContain(
            t('editorUi.embedDialog.copy')
        )
    })

    it('重复点击已选中文件不重复加载预览', async () => {
        const wrapper = await mountWithTree(TREE_WITH_RAW)
        invoke.mockClear()

        await wrapper.findAll('[data-testid="embed-file-item"]')[0].trigger('click')
        await flushPromises()
        expect(invoke).not.toHaveBeenCalled()
    })
})
