// @vitest-environment jsdom
/**
 * preview-scroll-sync.ts 单元测试（1.5.0：编辑器 → 预览滚动同步的纯计算层）。
 *
 * 覆盖：
 * 1. 编辑器滚动锚点归一化（行号/比例钳制、非法输入、内容不足一屏）；
 * 2. seq 去重判定（丢弃过期/重复目标）；
 * 3. 源行锚点收集（DOM 属性解析、非法行号/缺失测量能力过滤）；
 * 4. 锚点偏移测量（相对滚动容器内容顶部、排序、不可测量过滤）；
 * 5. 二分查找最近锚点（区间定位、边界、空集合）；
 * 6. scrollTop 解析（锚点优先、比例兜底、统一钳制）。
 */
import { describe, it, expect } from 'vitest'
import {
    CollectPreviewAnchorElements,
    ComputeEditorScrollAnchor,
    FindNearestPreviewAnchor,
    MeasurePreviewAnchorOffsets,
    ResolvePreviewScrollTop,
    ShouldApplyPreviewScrollTarget,
    type PreviewAnchorElement,
    type PreviewAnchorOffset,
    type PreviewScrollTarget
} from '../../src/renderer/src/components/Markdown/preview-scroll-sync'

/** 构造带 getBoundingClientRect 桩的元素（jsdom 无布局，需显式注入几何） */
function stubRect(element: HTMLElement, top: number): HTMLElement {
    element.getBoundingClientRect = () =>
        ({ top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top }) as DOMRect
    return element
}

/** 构造带指定源码行属性的元素 */
function anchorElement(line: string): HTMLElement {
    const element = document.createElement('p')
    element.setAttribute('data-source-line', line)
    return element
}

describe('ComputeEditorScrollAnchor：编辑器滚动锚点归一化', () => {
    it('正常输入按 scrollTop / (scrollHeight - viewportHeight) 计算比例', () => {
        expect(ComputeEditorScrollAnchor(42, 250, 1000, 500)).toEqual({ line: 42, ratio: 0.5 })
        expect(ComputeEditorScrollAnchor(1, 0, 1000, 500)).toEqual({ line: 1, ratio: 0 })
        expect(ComputeEditorScrollAnchor(120, 500, 1000, 500)).toEqual({ line: 120, ratio: 1 })
    })

    it('内容不足一屏时比例为 0；越界/非法输入被钳制', () => {
        expect(ComputeEditorScrollAnchor(5, 999, 100, 200)).toEqual({ line: 5, ratio: 0 })
        expect(ComputeEditorScrollAnchor(5, -50, 1000, 500)).toEqual({ line: 5, ratio: 0 })
        expect(ComputeEditorScrollAnchor(5, 99999, 1000, 500)).toEqual({ line: 5, ratio: 1 })
        expect(ComputeEditorScrollAnchor(Number.NaN, Number.NaN, Number.NaN, Number.NaN)).toEqual({
            line: 1,
            ratio: 0
        })
        // 行号取整且最小 1
        expect(ComputeEditorScrollAnchor(3.9, 0, 1000, 500)).toEqual({ line: 3, ratio: 0 })
        expect(ComputeEditorScrollAnchor(0, 0, 1000, 500)).toEqual({ line: 1, ratio: 0 })
    })
})

describe('ShouldApplyPreviewScrollTarget：seq 去重', () => {
    it('仅严格大于已应用 seq 的目标可应用', () => {
        expect(ShouldApplyPreviewScrollTarget(2, 1)).toBe(true)
        expect(ShouldApplyPreviewScrollTarget(1, 1)).toBe(false)
        expect(ShouldApplyPreviewScrollTarget(0, 1)).toBe(false)
        expect(ShouldApplyPreviewScrollTarget(Number.NaN, 0)).toBe(false)
        expect(ShouldApplyPreviewScrollTarget(1, 0)).toBe(true)
    })
})

describe('CollectPreviewAnchorElements：源行锚点收集', () => {
    it('按 DOM 顺序收集合法行号元素（升序由测量阶段负责）', () => {
        const root = document.createElement('div')
        const line3 = anchorElement('3')
        const line1 = anchorElement('1')
        root.appendChild(line3)
        root.appendChild(line1)
        root.appendChild(anchorElement('abc')) // 非数字忽略
        root.appendChild(anchorElement('0')) // 非法行号忽略
        root.appendChild(anchorElement('')) // 空串忽略
        root.appendChild(document.createElement('p')) // 无属性忽略

        const anchors = CollectPreviewAnchorElements(root)
        expect(anchors.map((anchor) => anchor.line)).toEqual([3, 1])
        expect(anchors[0].element).toBe(line3)
        expect(anchors[1].element).toBe(line1)
    })

    it('root 为空 / 无 querySelectorAll 时返回空数组', () => {
        expect(CollectPreviewAnchorElements(null)).toEqual([])
        expect(CollectPreviewAnchorElements(undefined)).toEqual([])
        expect(CollectPreviewAnchorElements({} as unknown as ParentNode)).toEqual([])
    })

    it('过滤无测量能力或读取不到属性的节点（防御脏 DOM / 非 HTMLElement）', () => {
        const fakeRoot = {
            querySelectorAll: () => [
                // 无 getBoundingClientRect：不是可测量元素
                { getAttribute: () => '1' },
                // 有测量能力但属性读取为 null
                { getBoundingClientRect: () => ({ top: 0 }), getAttribute: () => null }
            ]
        } as unknown as ParentNode
        expect(CollectPreviewAnchorElements(fakeRoot)).toEqual([])
    })
})

describe('MeasurePreviewAnchorOffsets：锚点偏移测量', () => {
    it('按「锚点 rect.top - 容器内容顶部」计算偏移并按行号升序排列', () => {
        const container = document.createElement('div')
        stubRect(container, 100)
        container.scrollTop = 50
        const line2 = stubRect(anchorElement('2'), 150)
        const line5 = stubRect(anchorElement('5'), 300)
        const anchors: PreviewAnchorElement[] = [
            { line: 5, element: line5 },
            { line: 2, element: line2 }
        ]

        const offsets = MeasurePreviewAnchorOffsets(container, anchors)
        expect(offsets).toEqual([
            { line: 2, top: 100 },
            { line: 5, top: 250 }
        ])
    })

    it('同一行号按 top 升序稳定排列；非法几何锚点被丢弃', () => {
        const container = document.createElement('div')
        stubRect(container, 0)
        const low = stubRect(anchorElement('3'), 40)
        const high = stubRect(anchorElement('3'), 80)
        const broken = document.createElement('p')
        broken.setAttribute('data-source-line', '4')
        broken.getBoundingClientRect = () => ({ top: Number.NaN }) as DOMRect

        const offsets = MeasurePreviewAnchorOffsets(container, [
            { line: 3, element: high },
            { line: 4, element: broken },
            { line: 3, element: low }
        ])
        expect(offsets.map((offset) => offset.top)).toEqual([40, 80])
    })

    it('容器缺少测量能力 / 锚点列表为空时返回空数组', () => {
        expect(
            MeasurePreviewAnchorOffsets({} as HTMLElement, [
                { line: 1, element: document.createElement('p') }
            ])
        ).toEqual([])
        const container = document.createElement('div')
        stubRect(container, 0)
        expect(MeasurePreviewAnchorOffsets(container, [])).toEqual([])
    })
})

describe('FindNearestPreviewAnchor：二分查找最近块', () => {
    const anchors: PreviewAnchorOffset[] = [
        { line: 1, top: 0 },
        { line: 5, top: 100 },
        { line: 9, top: 200 }
    ]

    it('返回源码行号 ≤ 目标行的最近锚点', () => {
        expect(FindNearestPreviewAnchor(anchors, 3)?.line).toBe(1)
        expect(FindNearestPreviewAnchor(anchors, 5)?.line).toBe(5)
        expect(FindNearestPreviewAnchor(anchors, 8)?.line).toBe(5)
        expect(FindNearestPreviewAnchor(anchors, 9)?.line).toBe(9)
        expect(FindNearestPreviewAnchor(anchors, 100)?.line).toBe(9)
    })

    it('目标行小于首行 / 空集合 / 非法行号返回 null（走比例兜底）', () => {
        expect(FindNearestPreviewAnchor(anchors, 0)).toBeNull()
        expect(FindNearestPreviewAnchor([], 3)).toBeNull()
        expect(FindNearestPreviewAnchor(anchors, Number.NaN)).toBeNull()
    })
})

describe('ResolvePreviewScrollTop：scrollTop 解析', () => {
    const anchors: PreviewAnchorOffset[] = [
        { line: 1, top: 0 },
        { line: 5, top: 100 }
    ]

    it('命中锚点时使用锚点偏移，并钳制到可滚动范围', () => {
        const target: PreviewScrollTarget = { line: 6, ratio: 0.9, seq: 1 }
        expect(ResolvePreviewScrollTop(anchors, target, 500)).toBe(100)
        // 锚点偏移超过最大滚动距离 -> 钳制到底部
        expect(ResolvePreviewScrollTop(anchors, target, 50)).toBe(50)
    })

    it('锚点偏移为负（目标块在可视区上方）时钳制到 0', () => {
        expect(
            ResolvePreviewScrollTop([{ line: 1, top: -40 }], { line: 2, ratio: 0, seq: 1 }, 500)
        ).toBe(0)
    })

    it('无锚点（空内容/骨架/注入失败）时按 ratio × 最大滚动距离兜底', () => {
        expect(ResolvePreviewScrollTop([], { line: 10, ratio: 0.5, seq: 1 }, 400)).toBe(200)
        expect(ResolvePreviewScrollTop([], { line: 10, ratio: 2, seq: 1 }, 400)).toBe(400)
        expect(ResolvePreviewScrollTop([], { line: 10, ratio: -1, seq: 1 }, 400)).toBe(0)
        expect(ResolvePreviewScrollTop([], { line: 10, ratio: Number.NaN, seq: 1 }, 400)).toBe(0)
    })

    it('最大滚动距离非法时统一返回 0', () => {
        expect(ResolvePreviewScrollTop([], { line: 10, ratio: 1, seq: 1 }, Number.NaN)).toBe(0)
        expect(ResolvePreviewScrollTop([], { line: 10, ratio: 1, seq: 1 }, -100)).toBe(0)
    })

    it('锚点偏移非法（NaN）时回落 0', () => {
        expect(
            ResolvePreviewScrollTop(
                [{ line: 1, top: Number.NaN }],
                { line: 2, ratio: 1, seq: 1 },
                100
            )
        ).toBe(0)
    })
})
