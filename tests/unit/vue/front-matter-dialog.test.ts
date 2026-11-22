// @vitest-environment jsdom
/**
 * A5 FrontMatterDialog.vue 组件契约测试（jsdom + @vue/test-utils）
 *
 * 覆盖：
 * - 打开即读取内容桥并解析现有 front matter（固定字段 + 自定义 key，数组以逗号分隔展示）；
 * - 无 front matter 创建提示、无活动文档空态、读取失败错误态 + 重试、加载占位、已保存内容兜底提示；
 * - 保存：固定字段 / 数组字段 / 自定义标量（数字、布尔）/ 自定义数组 / 移除自定义 key；
 * - 无 front matter 且全部为空不插入空块；清空已有 front matter 移除块；内容无变化不写回；
 * - BOM 与 CRLF 换行风格保留、正文逐字保留；
 * - 取消关闭不写回、重新打开重新读取；
 * - 对外入口 openFrontMatterDialog / closeFrontMatterDialog / disposeFrontMatterHost。
 *
 * 内容桥通过 `setActiveMarkdownContentProvider()` 注入（与 writing-style-dialog.test.ts 同法），
 * 写回断言基于既有 EventBus `MONACO_REPLACE_TEXT`。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import EventBus from '../../../src/renderer/src/common/event-bus/event-bus'
import { EVENT_BUS } from '../../../src/renderer/src/common/event-bus/event-bus-events'
import {
    disposeDocumentHistoryFeature,
    documentHistoryState,
    setActiveMarkdownContentProvider
} from '../../../src/renderer/src/composables/useDocumentHistory'
import { frontMatterDialogState } from '../../../src/renderer/src/components/Markdown/front-matter/front-matter-dialog-state'
import FrontMatterDialog from '../../../src/renderer/src/components/Markdown/front-matter/FrontMatterDialog.vue'
import {
    closeFrontMatterDialog,
    disposeFrontMatterHost,
    openFrontMatterDialog
} from '../../../src/renderer/src/components/Markdown/front-matter'
import { parseFrontMatter } from '../../../src/shared/utils/front-matter'

/** BaseDialog 默认 Teleport 到 body；stub 成内联渲染便于断言与清理 */
const mountOptions = { global: { stubs: { teleport: true } }, attachTo: document.body }

/** 宿主入口挂载的容器 id（与 index.ts 保持一致） */
const HOST_SELECTOR = '#baize-front-matter-host'

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

/** 设置内容 provider 并打开对话框（内容串 / null=无活动文档） */
async function prepareDialog(content: string | null): Promise<VueWrapper> {
    setActiveMarkdownContentProvider(content === null ? null : () => content)
    frontMatterDialogState.visible = true
    const wrapper = track(mount(FrontMatterDialog, mountOptions))
    await flushPromises()
    await nextTick()
    return wrapper
}

/** 读取固定字段输入框的值 */
function fieldValue(wrapper: VueWrapper, field: string): string {
    return (wrapper.find(`[data-field="${field}"]`).element as HTMLInputElement).value
}

/** 读取自定义属性输入框的值 */
function customFieldValue(wrapper: VueWrapper, key: string): string {
    return (wrapper.find(`[data-field="custom:${key}"]`).element as HTMLInputElement).value
}

/** 取最近一次 MONACO_REPLACE_TEXT 写回载荷（未写回返回 undefined） */
function capturedReplacePayload(emitSpy: { mock: { calls: unknown[][] } }): string | undefined {
    const call = emitSpy.mock.calls.find((item) => item[0] === EVENT_BUS.MONACO_REPLACE_TEXT)
    return call?.[1] as string | undefined
}

/** 断言保存后通过既有 EventBus 写回，并返回新的 Markdown */
function expectReplaceEmitted(emitSpy: { mock: { calls: unknown[][] } }): string {
    const payload = capturedReplacePayload(emitSpy)
    expect(payload).toBeDefined()
    return payload as string
}

beforeEach(() => {
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn(),
            removeListener: vi.fn(),
            invoke: vi.fn().mockResolvedValue(null)
        }
    })
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue(null), write: vi.fn() }
    })
    disposeDocumentHistoryFeature()
    documentHistoryState.activeFilePath = ''
    setActiveMarkdownContentProvider(null)
    frontMatterDialogState.visible = false
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

afterEach(async () => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    disposeFrontMatterHost()
    await nextTick()
    disposeDocumentHistoryFeature()
    vi.unstubAllGlobals()
    frontMatterDialogState.visible = false
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

describe('渲染与读取', () => {
    it('打开即解析并渲染固定字段与已有自定义属性', async () => {
        const wrapper = await prepareDialog(
            [
                '---',
                'title: 旧标题',
                'date: 2024-05-01',
                'tags: [a, b]',
                'status: draft',
                'summary: 摘要内容',
                'aliases:',
                '  - 别名1',
                '  - 别名2',
                'weight: 3',
                'draft: true',
                '---',
                '# 正文'
            ].join('\n')
        )

        expect(wrapper.find('.dialog-container').exists()).toBe(true)
        expect(fieldValue(wrapper, 'title')).toBe('旧标题')
        expect(fieldValue(wrapper, 'date')).toBe('2024-05-01')
        expect(fieldValue(wrapper, 'tags')).toBe('a, b')
        expect(fieldValue(wrapper, 'status')).toBe('draft')
        expect(fieldValue(wrapper, 'summary')).toBe('摘要内容')
        expect(fieldValue(wrapper, 'aliases')).toBe('别名1, 别名2')
        expect(customFieldValue(wrapper, 'weight')).toBe('3')
        expect(customFieldValue(wrapper, 'draft')).toBe('true')
        // 固定字段不重复出现在自定义属性区
        const customKeys = wrapper.findAll('.fm-custom-key').map((node) => node.text())
        expect(customKeys).toEqual(['weight', 'draft'])
        expect(wrapper.find('.fm-hint').text()).toContain('front matter')
        expect(wrapper.find('.fm-path').text()).toContain('当前编辑器')
    })

    it('无 front matter 时展示创建提示，字段为空', async () => {
        const wrapper = await prepareDialog('# 只有正文\n\n正文段落')

        expect(wrapper.find('.fm-form').exists()).toBe(true)
        expect(wrapper.find('.fm-hint').text()).toContain('没有 front matter')
        expect(fieldValue(wrapper, 'title')).toBe('')
        expect(fieldValue(wrapper, 'tags')).toBe('')
        expect(wrapper.findAll('.fm-custom-row')).toHaveLength(0)
        expect(wrapper.find('.fm-custom-empty').text()).toContain('没有其他自定义属性')
    })

    it('无活动文档时展示空态并禁用保存', async () => {
        const wrapper = await prepareDialog(null)

        expect(wrapper.find('.fm-form').exists()).toBe(false)
        expect(wrapper.find('.fm-placeholder--empty').text()).toContain('没有可编辑的 Markdown')
        expect(wrapper.find('.btn-save').attributes('disabled')).toBeDefined()
    })

    it('读取失败时展示错误态，重试后恢复编辑', async () => {
        documentHistoryState.activeFilePath = 'C:\\notes\\error.md'
        // 内容桥兜底链路（window.electron.ipcRenderer）抛错 → readActiveMarkdownContent 拒绝
        vi.stubGlobal('electron', {
            get ipcRenderer(): never {
                throw new Error('bridge broken')
            }
        })
        frontMatterDialogState.visible = true
        const wrapper = track(mount(FrontMatterDialog, mountOptions))
        await flushPromises()
        await nextTick()

        expect(wrapper.find('.fm-placeholder--error').exists()).toBe(true)
        expect(wrapper.find('.fm-placeholder--error').text()).toContain('读取当前文档内容失败')
        expect(wrapper.find('.btn-save').attributes('disabled')).toBeDefined()

        // 修复内容桥后重试（重试优先命中注入的内容提供者）
        setActiveMarkdownContentProvider(() => '---\ntitle: 重试成功\n---\n正文')
        await wrapper.find('.fm-retry').trigger('click')
        await flushPromises()
        await nextTick()

        expect(wrapper.find('.fm-placeholder--error').exists()).toBe(false)
        expect(wrapper.find('.fm-form').exists()).toBe(true)
        expect(fieldValue(wrapper, 'title')).toBe('重试成功')
    })

    it('读取期间展示加载占位', async () => {
        let resolveContent: ((value: string) => void) | undefined
        const pending = new Promise<string>((resolve) => {
            resolveContent = resolve
        })
        setActiveMarkdownContentProvider(() => pending)
        frontMatterDialogState.visible = true
        const wrapper = track(mount(FrontMatterDialog, mountOptions))
        await nextTick()

        expect(wrapper.find('.fm-placeholder').text()).toContain('正在读取')
        expect(wrapper.find('.fm-form').exists()).toBe(false)

        resolveContent!('---\ntitle: 异步完成\n---\n正文')
        await flushPromises()
        await nextTick()
        expect(fieldValue(wrapper, 'title')).toBe('异步完成')
    })

    it('编辑器未就绪（回退已保存内容）时展示来源提示', async () => {
        documentHistoryState.activeFilePath = 'C:\\notes\\saved.md'
        vi.stubGlobal('electron', {
            ipcRenderer: {
                on: vi.fn(),
                removeListener: vi.fn(),
                invoke: vi.fn().mockResolvedValue('---\ntitle: 已保存标题\n---\n正文')
            }
        })
        setActiveMarkdownContentProvider(null)
        frontMatterDialogState.visible = true
        const wrapper = track(mount(FrontMatterDialog, mountOptions))
        await flushPromises()
        await nextTick()

        expect(wrapper.find('.fm-source-hint').text()).toContain('编辑器未就绪')
        expect(wrapper.find('.fm-path').text()).toContain('saved.md')
        expect(fieldValue(wrapper, 'title')).toBe('已保存标题')
    })
})

describe('保存与写回', () => {
    it('编辑固定字段与数组字段后保存：经 EventBus 写回并关闭对话框', async () => {
        const wrapper = await prepareDialog('正文内容')
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.find('[data-field="title"]').setValue('新标题')
        await wrapper.find('[data-field="date"]').setValue('2024-06-01')
        await wrapper.find('[data-field="tags"]').setValue('a, b')
        await wrapper.find('[data-field="status"]').setValue('done')
        await wrapper.find('[data-field="summary"]').setValue('摘要')
        // 中文逗号同样作为数组分隔符
        await wrapper.find('[data-field="aliases"]').setValue('x，y')
        await wrapper.find('.btn-save').trigger('click')
        await flushPromises()

        const newMarkdown = expectReplaceEmitted(emitSpy)
        expect(newMarkdown.startsWith('---\n')).toBe(true)
        const parsed = parseFrontMatter(newMarkdown)
        expect(parsed.present).toBe(true)
        expect(parsed.data.title).toBe('新标题')
        expect(parsed.data.date).toBe('2024-06-01')
        expect(parsed.data.tags).toEqual(['a', 'b'])
        expect(parsed.data.status).toBe('done')
        expect(parsed.data.summary).toBe('摘要')
        expect(parsed.data.aliases).toEqual(['x', 'y'])
        // tags/aliases 为 string[]（构建期即数组）
        expect(parsed.keyOrder).toEqual(['title', 'date', 'tags', 'status', 'summary', 'aliases'])
        expect(parsed.body).toBe('正文内容')
        expect(frontMatterDialogState.visible).toBe(false)
    })

    it('无 front matter 且所有字段为空时保存不插入空块、不写回', async () => {
        const wrapper = await prepareDialog('正文内容')
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.find('.btn-save').trigger('click')
        await flushPromises()

        expect(capturedReplacePayload(emitSpy)).toBeUndefined()
        expect(frontMatterDialogState.visible).toBe(false)
    })

    it('清空已有 front matter 的全部字段后保存会移除 front matter 块', async () => {
        const wrapper = await prepareDialog('---\ntitle: 旧标题\ntags:\n  - a\n---\n正文内容')
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.find('[data-field="title"]').setValue('')
        await wrapper.find('[data-field="tags"]').setValue('')
        await wrapper.find('.btn-save').trigger('click')
        await flushPromises()

        const newMarkdown = expectReplaceEmitted(emitSpy)
        expect(newMarkdown).toBe('正文内容')
        expect(parseFrontMatter(newMarkdown).present).toBe(false)
        expect(frontMatterDialogState.visible).toBe(false)
    })

    it('内容无变化时保存不写回（仅关闭对话框）', async () => {
        const wrapper = await prepareDialog('---\ntitle: 旧标题\n---\n正文内容')
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.find('.btn-save').trigger('click')
        await flushPromises()

        expect(capturedReplacePayload(emitSpy)).toBeUndefined()
        expect(frontMatterDialogState.visible).toBe(false)
    })

    it('自定义标量属性编辑后保留数字 / 布尔类型', async () => {
        const wrapper = await prepareDialog(
            ['---', 'weight: 3', 'draft: true', 'note: hello', '---', '正文内容'].join('\n')
        )
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.find('[data-field="custom:weight"]').setValue('4')
        await wrapper.find('[data-field="custom:draft"]').setValue('false')
        await wrapper.find('.btn-save').trigger('click')
        await flushPromises()

        const parsed = parseFrontMatter(expectReplaceEmitted(emitSpy))
        expect(parsed.data.weight).toBe(4)
        expect(typeof parsed.data.weight).toBe('number')
        expect(parsed.data.draft).toBe(false)
        expect(typeof parsed.data.draft).toBe('boolean')
        expect(parsed.data.note).toBe('hello')
    })

    it('自定义数组属性以逗号分隔编辑，保存为数组', async () => {
        const wrapper = await prepareDialog(
            ['---', 'categories:', '  - x', '  - y', '---', '正文内容'].join('\n')
        )
        const emitSpy = vi.spyOn(EventBus, '$emit')

        expect(customFieldValue(wrapper, 'categories')).toBe('x, y')
        await wrapper.find('[data-field="custom:categories"]').setValue('x, y, z')
        await wrapper.find('.btn-save').trigger('click')
        await flushPromises()

        const parsed = parseFrontMatter(expectReplaceEmitted(emitSpy))
        expect(parsed.data.categories).toEqual(['x', 'y', 'z'])
    })

    it('移除自定义属性后保存不再写入该键', async () => {
        const wrapper = await prepareDialog(
            ['---', 'title: 标题', 'foo: bar', '---', '正文内容'].join('\n')
        )
        const emitSpy = vi.spyOn(EventBus, '$emit')

        expect(wrapper.findAll('.fm-custom-row')).toHaveLength(1)
        await wrapper.find('.fm-custom-row[data-key="foo"] .fm-custom-remove').trigger('click')
        expect(wrapper.findAll('.fm-custom-row')).toHaveLength(0)
        await wrapper.find('.btn-save').trigger('click')
        await flushPromises()

        const parsed = parseFrontMatter(expectReplaceEmitted(emitSpy))
        expect(parsed.data.title).toBe('标题')
        expect(Object.prototype.hasOwnProperty.call(parsed.data, 'foo')).toBe(false)
    })

    it('保存时保留原有键顺序与正文/BOM/CRLF 换行风格', async () => {
        const wrapper = await prepareDialog(
            '\uFEFF---\r\ncustomFirst: x\r\ntitle: 旧标题\r\n---\r\n正文内容\r\n'
        )
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.find('[data-field="title"]').setValue('新标题')
        await wrapper.find('.btn-save').trigger('click')
        await flushPromises()

        const newMarkdown = expectReplaceEmitted(emitSpy)
        expect(newMarkdown.startsWith('\uFEFF---\r\n')).toBe(true)
        const parsed = parseFrontMatter(newMarkdown)
        // 原有自定义键位置保留在固定字段之前
        expect(parsed.keyOrder).toEqual(['customFirst', 'title'])
        expect(parsed.data.title).toBe('新标题')
        expect(parsed.data.customFirst).toBe('x')
        expect(parsed.body).toBe('正文内容\r\n')
    })
})

describe('关闭与重新打开', () => {
    it('取消按钮关闭对话框且不写回', async () => {
        const wrapper = await prepareDialog('---\ntitle: 旧标题\n---\n正文内容')
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.find('[data-field="title"]').setValue('未保存的标题')
        await wrapper.find('.btn-cancel').trigger('click')

        expect(frontMatterDialogState.visible).toBe(false)
        expect(capturedReplacePayload(emitSpy)).toBeUndefined()
    })

    it('重新打开会重新读取当前内容并丢弃上次未保存编辑', async () => {
        let content = '---\ntitle: 第一次\n---\n正文内容'
        setActiveMarkdownContentProvider(() => content)
        frontMatterDialogState.visible = true
        const wrapper = track(mount(FrontMatterDialog, mountOptions))
        await flushPromises()
        await nextTick()
        expect(fieldValue(wrapper, 'title')).toBe('第一次')

        await wrapper.find('[data-field="title"]').setValue('未保存的编辑')
        await wrapper.find('.btn-cancel').trigger('click')
        // 等待关闭的显隐 watcher 处理完（同一 tick 内先关再开不会触发重新读取）
        await nextTick()
        frontMatterDialogState.visible = true
        content = '---\ntitle: 第二次\n---\n正文内容'
        await flushPromises()
        await nextTick()

        expect(wrapper.find('.fm-form').exists()).toBe(true)
        expect(fieldValue(wrapper, 'title')).toBe('第二次')
    })
})

describe('对外入口 openFrontMatterDialog', () => {
    it('首次调用挂载宿主并打开；关闭不重建；dispose 清理后可重新打开', async () => {
        setActiveMarkdownContentProvider(() => '---\ntitle: 宿主标题\n---\n正文内容')

        expect(await openFrontMatterDialog()).toBe(true)
        await flushPromises()
        await nextTick()
        expect(frontMatterDialogState.visible).toBe(true)
        expect(document.querySelectorAll(HOST_SELECTOR)).toHaveLength(1)
        // 动态 import 的对话框宿主直接挂到 body，BaseDialog 再 Teleport 到 body
        const titleInput = document.querySelector<HTMLInputElement>('[data-field="title"]')
        expect(titleInput?.value).toBe('宿主标题')

        closeFrontMatterDialog()
        expect(frontMatterDialogState.visible).toBe(false)
        expect(await openFrontMatterDialog()).toBe(true)
        // 关闭只切显隐，不重新 createApp / 追加容器
        expect(document.querySelectorAll(HOST_SELECTOR)).toHaveLength(1)

        disposeFrontMatterHost()
        expect(document.querySelectorAll(HOST_SELECTOR)).toHaveLength(0)
        expect(frontMatterDialogState.visible).toBe(false)

        // dispose 后再次打开会重新挂载（幂等可重入）
        setActiveMarkdownContentProvider(() => '---\ntitle: 重新挂载\n---\n正文')
        expect(await openFrontMatterDialog()).toBe(true)
        await flushPromises()
        await nextTick()
        expect(document.querySelectorAll(HOST_SELECTOR)).toHaveLength(1)
        const reloadedInput = document.querySelector<HTMLInputElement>('[data-field="title"]')
        expect(reloadedInput?.value).toBe('重新挂载')
        disposeFrontMatterHost()
    })

    it('无 document 环境（宿主无法挂载）时返回 false 且不抛错', async () => {
        const savedDocument = globalThis.document
        vi.stubGlobal('document', undefined)
        try {
            expect(await openFrontMatterDialog()).toBe(false)
        } finally {
            vi.stubGlobal('document', savedDocument)
        }
        expect(frontMatterDialogState.visible).toBe(false)
        expect(document.querySelectorAll(HOST_SELECTOR)).toHaveLength(0)
    })
})
