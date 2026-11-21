// @vitest-environment jsdom
/**
 * A1 多标签栏组件（DocumentTabs.vue）渲染与事件测试。
 *
 * 覆盖：
 * 1. 标签渲染（名称 / role=tablist/tab / 活动态 aria-selected 与 tabindex）；
 * 2. 脏标记仅在脏标签显示；
 * 3. 点击标签、Enter/Space 键盘激活 → select 事件；
 * 4. 点击关闭按钮 → close 事件（不冒泡触发 select）；最后一个标签关闭按钮禁用；
 * 5. 竖向滚轮转横向滚动；活动标签变化时滚动到可见区域（scrollIntoView 存在时）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DocumentTabs from '@renderer/components/Markdown/DocumentTabs.vue'
import { t } from '@renderer/common/i18n'
import type { DocumentTab } from '@renderer/components/Markdown/useDocumentTabs'

/** 构造标签测试数据 */
function createTab(path: string, dirty = false): DocumentTab {
    const name = path.slice(path.lastIndexOf('/') + 1)
    return { path, name, dirty, snapshot: null, snapshotDirty: false }
}

let wrapper: ReturnType<typeof mount> | null = null

beforeEach(() => {
    wrapper = null
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('DocumentTabs：渲染与可访问性', () => {
    it('渲染 tablist 与全部标签，活动标签 aria-selected/tabindex 正确', () => {
        wrapper = mount(DocumentTabs, {
            props: {
                tabs: [createTab('C:/notes/a.md'), createTab('C:/notes/b.md')],
                activePath: 'C:/notes/b.md'
            }
        })

        const list = wrapper.find('.document-tabs')
        expect(list.exists()).toBe(true)
        expect(list.attributes('role')).toBe('tablist')
        expect(list.attributes('aria-label')).toBe(t('common.file'))

        const tabs = wrapper.findAll('.document-tab')
        expect(tabs).toHaveLength(2)
        expect(tabs[0].text()).toContain('a.md')
        expect(tabs[0].attributes('role')).toBe('tab')
        expect(tabs[0].attributes('aria-selected')).toBe('false')
        expect(tabs[0].attributes('tabindex')).toBe('-1')
        expect(tabs[1].attributes('aria-selected')).toBe('true')
        expect(tabs[1].attributes('tabindex')).toBe('0')
        expect(tabs[1].classes()).toContain('is-active')
        // 完整路径作为 title（数据不翻译）
        expect(tabs[1].attributes('title')).toBe('C:/notes/b.md')
    })

    it('仅脏标签显示脏标记', () => {
        wrapper = mount(DocumentTabs, {
            props: {
                tabs: [createTab('C:/a.md', true), createTab('C:/b.md', false)],
                activePath: 'C:/a.md'
            }
        })
        const dirtyMarks = wrapper.findAll('.document-tab-dirty')
        expect(dirtyMarks).toHaveLength(1)
        expect(dirtyMarks[0].attributes('aria-hidden')).toBe('true')
    })

    it('关闭按钮 aria-label 走既有 i18n 词条；canClose=false 时禁用', async () => {
        wrapper = mount(DocumentTabs, {
            props: {
                tabs: [createTab('C:/a.md')],
                activePath: 'C:/a.md',
                canClose: false
            }
        })
        const closeButton = wrapper.find('.document-tab-close')
        expect(closeButton.attributes('aria-label')).toBe(t('common.close'))
        expect(closeButton.attributes('disabled')).toBeDefined()

        await wrapper.setProps({ canClose: true })
        expect(wrapper.find('.document-tab-close').attributes('disabled')).toBeUndefined()
    })

    it('switching=true 时活动标签带等待态类名', () => {
        wrapper = mount(DocumentTabs, {
            props: {
                tabs: [createTab('C:/a.md')],
                activePath: 'C:/a.md',
                switching: true
            }
        })
        expect(wrapper.find('.document-tab').classes()).toContain('is-switching')
    })
})

describe('DocumentTabs：用户交互', () => {
    it('点击标签发出 select 事件', async () => {
        wrapper = mount(DocumentTabs, {
            props: {
                tabs: [createTab('C:/a.md'), createTab('C:/b.md')],
                activePath: 'C:/a.md'
            }
        })
        await wrapper.findAll('.document-tab')[1].trigger('click')
        expect(wrapper.emitted('select')).toEqual([['C:/b.md']])
    })

    it('Enter / Space 键盘激活标签', async () => {
        wrapper = mount(DocumentTabs, {
            props: {
                tabs: [createTab('C:/a.md')],
                activePath: 'C:/a.md'
            }
        })
        const tab = wrapper.find('.document-tab')
        await tab.trigger('keydown', { key: 'Enter' })
        await tab.trigger('keydown', { key: ' ' })
        const emitted = wrapper.emitted('select')
        expect(emitted).toHaveLength(2)
    })

    it('点击关闭按钮只发出 close 事件（不冒泡触发 select）', async () => {
        wrapper = mount(DocumentTabs, {
            props: {
                tabs: [createTab('C:/a.md'), createTab('C:/b.md')],
                activePath: 'C:/a.md'
            }
        })
        await wrapper.findAll('.document-tab-close')[1].trigger('click')
        expect(wrapper.emitted('close')).toEqual([['C:/b.md']])
        expect(wrapper.emitted('select')).toBeUndefined()
    })

    it('竖向滚轮转为横向滚动', async () => {
        wrapper = mount(DocumentTabs, {
            props: {
                tabs: [createTab('C:/a.md'), createTab('C:/b.md')],
                activePath: 'C:/a.md'
            }
        })
        const list = wrapper.find('.document-tabs').element as HTMLElement
        expect(list.scrollLeft).toBe(0)
        await wrapper.find('.document-tabs').trigger('wheel', { deltaY: 24, deltaX: 6 })
        expect(list.scrollLeft).toBe(30)
    })

    it('活动标签变化时滚动到可见区域（scrollIntoView 可用时）', async () => {
        const scrollIntoView = vi.fn()
        ;(
            window.HTMLElement.prototype as unknown as { scrollIntoView?: () => void }
        ).scrollIntoView = scrollIntoView
        try {
            wrapper = mount(DocumentTabs, {
                props: {
                    tabs: [createTab('C:/a.md'), createTab('C:/b.md')],
                    activePath: 'C:/a.md'
                },
                attachTo: document.body
            })
            await wrapper.setProps({ activePath: 'C:/b.md' })
            await nextTick()
            await nextTick()
            expect(scrollIntoView).toHaveBeenCalled()
        } finally {
            delete (window.HTMLElement.prototype as unknown as { scrollIntoView?: () => void })
                .scrollIntoView
        }
    })

    it('scrollIntoView 不可用时静默跳过（不抛错）', async () => {
        wrapper = mount(DocumentTabs, {
            props: {
                tabs: [createTab('C:/a.md'), createTab('C:/b.md')],
                activePath: 'C:/a.md'
            }
        })
        await wrapper.setProps({ activePath: 'C:/b.md' })
        await nextTick()
        await nextTick()
        expect(wrapper.findAll('.document-tab')).toHaveLength(2)
    })
})
