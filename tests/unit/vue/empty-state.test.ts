// @vitest-environment jsdom
/**
 * 空态统一组件单测（视觉升级 P1-B2 / T11）
 *
 * 覆盖：6 变体完整且插图路径互不重复、主标题/描述/主按钮渲染与事件、
 * compact 尺寸、读屏状态区域（role=status）开关、未知变体回落插图。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '@renderer/components/common/ui/EmptyState.vue'
import {
    EMPTY_STATE_ILLUSTRATIONS,
    EMPTY_STATE_VARIANTS,
    isKnownEmptyStateVariant
} from '@renderer/components/common/ui/empty-state-variants'

/** 6 变体：空文件 / 无搜索 / 无标签 / 无附件 / 无标注 / 未启用 */
describe('EmptyState 变体数据', () => {
    it('6 个变体齐全且每个至少有 1 条插图路径', () => {
        expect(EMPTY_STATE_VARIANTS).toEqual([
            'empty-file',
            'no-search',
            'no-tags',
            'no-attachments',
            'no-annotations',
            'not-enabled'
        ])
        for (const variant of EMPTY_STATE_VARIANTS) {
            const paths = EMPTY_STATE_ILLUSTRATIONS[variant]
            expect(Array.isArray(paths)).toBe(true)
            expect(paths.length).toBeGreaterThan(0)
            for (const pathData of paths) {
                expect(typeof pathData).toBe('string')
                expect(pathData.length).toBeGreaterThan(0)
            }
        }
    })

    it('不同变体的插图路径集合互不重复', () => {
        const serialized = EMPTY_STATE_VARIANTS.map((variant) =>
            EMPTY_STATE_ILLUSTRATIONS[variant].join('|')
        )
        expect(new Set(serialized).size).toBe(EMPTY_STATE_VARIANTS.length)
    })

    it('isKnownEmptyStateVariant 只接受 6 个合法值', () => {
        expect(isKnownEmptyStateVariant('no-search')).toBe(true)
        expect(isKnownEmptyStateVariant('unknown')).toBe(false)
        expect(isKnownEmptyStateVariant(null)).toBe(false)
        expect(isKnownEmptyStateVariant(1)).toBe(false)
    })
})

describe('EmptyState 渲染', () => {
    it('渲染主标题与 24 网格 SVG，默认可被读屏播报', () => {
        const wrapper = mount(EmptyState, {
            props: { variant: 'no-search', title: '没有匹配结果' }
        })
        const root = wrapper.find('.empty-state')
        expect(root.classes()).toContain('empty-state--no-search')
        expect(wrapper.find('.empty-state__title').text()).toBe('没有匹配结果')
        expect(wrapper.find('.empty-state__description').exists()).toBe(false)
        expect(wrapper.find('.empty-state__action').exists()).toBe(false)
        expect(root.attributes('role')).toBe('status')
        const svg = wrapper.find('svg')
        expect(svg.attributes('viewBox')).toBe('0 0 24 24')
        expect(svg.attributes('stroke-width')).toBe('1.5')
        expect(wrapper.find('.empty-state__illustration').attributes('aria-hidden')).toBe('true')
        expect(wrapper.findAll('svg path').length).toBe(
            EMPTY_STATE_ILLUSTRATIONS['no-search'].length
        )
    })

    it('描述与主按钮按需渲染，点击主按钮触发 action 事件', async () => {
        const wrapper = mount(EmptyState, {
            props: {
                variant: 'empty-file',
                title: '还没有打开文件',
                description: '从左侧文件树选择或新建一个笔记',
                actionLabel: '新建笔记'
            }
        })
        expect(wrapper.find('.empty-state__description').text()).toBe(
            '从左侧文件树选择或新建一个笔记'
        )
        await wrapper.find('.empty-state__action').trigger('click')
        expect(wrapper.emitted('action')).toHaveLength(1)
    })

    it('compact 尺寸只改变留白，不改变结构与语义', () => {
        const wrapper = mount(EmptyState, {
            props: { variant: 'no-tags', title: '暂无标签', size: 'compact' }
        })
        expect(wrapper.find('.empty-state').classes()).toContain('empty-state--compact')
    })

    it('announce=false 时不渲染 role=status（嵌入 listbox 等受控容器场景）', () => {
        const wrapper = mount(EmptyState, {
            props: { variant: 'not-enabled', title: '该功能未启用', announce: false }
        })
        expect(wrapper.find('.empty-state').attributes('role')).toBeUndefined()
    })

    it('未知变体安全回落到空文件插图', () => {
        const wrapper = mount(EmptyState, {
            // 模拟外部传入非法变体（运行期防御）
            props: { variant: 'missing-variant' as never, title: '占位' }
        })
        expect(wrapper.findAll('svg path').length).toBe(
            EMPTY_STATE_ILLUSTRATIONS['empty-file'].length
        )
    })
})
