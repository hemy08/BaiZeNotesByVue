/**
 * preview-scroll-sync.ts
 * 编辑器 → 预览「单向」滚动同步的共享类型与纯计算（不依赖 Vue / Electron）。
 *
 * 背景（1.5.0 分栏模式体验修复）：
 * 分栏编辑预览模式下，编辑区滚动（滚轮 / 键盘 / 输入触发光标自动 reveal / 大纲跳转）
 * 时预览区不会跟随，用户需要手动在两侧来回找位置。本模块承载同步链路的**两端纯计算**：
 *
 * 1. 编辑器侧：由 Monaco 的可见区首行 + 滚动条比例归一化出 {@link EditorScrollAnchor}
 *    （见 {@link ComputeEditorScrollAnchor}）；
 * 2. 父组件侧：给每个目标分配单调递增的 seq（{@link PreviewScrollTarget}），预览侧用
 *    {@link ShouldApplyPreviewScrollTarget} 丢弃过期/重复目标，避免快速滚动时旧目标晚到覆盖新位置；
 * 3. 预览侧：收集并测量 `[data-source-line]` 锚点（{@link CollectPreviewAnchorElements} /
 *    {@link MeasurePreviewAnchorOffsets}），二分查找「源码行 ≤ 编辑器首行」的最近块
 *    （{@link FindNearestPreviewAnchor}），换算为滚动容器的 scrollTop
 *    （{@link ResolvePreviewScrollTop}）；无锚点/测量失效时按滚动比例兜底。
 *
 * 约定：
 * - 源行号统一 1 起始（与 Monaco `getVisibleRanges()[0].startLineNumber` 一致）；
 * - 比例 ratio ∈ [0, 1]，0 表示顶部、1 表示底部；
 * - 所有函数对非法输入（NaN / Infinity / 负值）做防御并钳制，绝不抛异常——
 *   滚动同步属于体验增强，任何异常都不得影响预览渲染主链路。
 */

/** 预览 HTML 中承载「Markdown 源行号」的属性名（注入与读取的唯一真源） */
export const PREVIEW_SOURCE_LINE_ATTRIBUTE = 'data-source-line'

/** 编辑器滚动快照：可见区首行 + 滚动条归一化比例 */
export interface EditorScrollAnchor {
    /** 可见区首行行号（1 起始，与 Monaco 行号一致） */
    line: number
    /** 滚动比例 0~1（0 顶部，1 底部；内容不足一屏时为 0） */
    ratio: number
}

/** 父组件编排后的预览同步目标（seq 单调递增） */
export interface PreviewScrollTarget extends EditorScrollAnchor {
    /** 目标序号：预览侧只应用比「已应用 seq」更大的目标，用于丢弃过期目标 */
    seq: number
}

/** 预览锚点元素（源码行号 + DOM 元素） */
export interface PreviewAnchorElement {
    /** 源行号（1 起始） */
    line: number
    element: HTMLElement
}

/** 预览锚点相对滚动容器内容顶部的偏移（px） */
export interface PreviewAnchorOffset {
    /** 源行号（1 起始，升序） */
    line: number
    /** 相对滚动容器内容顶部的偏移（px，可能为负 = 在可视区上方） */
    top: number
}

/**
 * 由 Monaco 可见区首行与滚动指标计算同步锚点。
 *
 * @param startLine 可见区首行行号（1 起始；取不到时传 1）
 * @param scrollTop 编辑器当前 scrollTop
 * @param scrollHeight 编辑器内容总高度
 * @param viewportHeight 编辑器可视区高度
 * @returns 归一化后的锚点（非法输入钳制为顶部/第 1 行）
 */
export function ComputeEditorScrollAnchor(
    startLine: number,
    scrollTop: number,
    scrollHeight: number,
    viewportHeight: number
): EditorScrollAnchor {
    const normalizedLine = Number.isFinite(startLine) ? Math.max(1, Math.floor(startLine)) : 1
    const normalizedScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0
    const normalizedScrollHeight = Number.isFinite(scrollHeight) ? Math.max(0, scrollHeight) : 0
    const normalizedViewportHeight = Number.isFinite(viewportHeight)
        ? Math.max(0, viewportHeight)
        : 0
    const maxScrollTop = Math.max(0, normalizedScrollHeight - normalizedViewportHeight)
    const ratio =
        maxScrollTop > 0 ? Math.min(1, Math.max(0, normalizedScrollTop / maxScrollTop)) : 0
    return { line: normalizedLine, ratio }
}

/**
 * 是否应把同步目标应用到预览：seq 必须为有限数且严格大于已应用 seq。
 * 同一目标被重放（seq 相等）或旧目标晚到（seq 更小）都返回 false。
 */
export function ShouldApplyPreviewScrollTarget(targetSeq: number, lastAppliedSeq: number): boolean {
    return Number.isFinite(targetSeq) && targetSeq > lastAppliedSeq
}

/**
 * 收集预览容器内所有源行锚点元素（DOM 顺序，不做测量）。
 *
 * 说明：
 * - 锚点由 markdown-it 源行插件注入到块级元素属性上，代码围栏 / 原始 HTML 块另由
 *   零高度锚点标记 <span data-source-line> 承载（见 preview-source-anchor.ts）；
 * - 行号属性缺失/非法/小于 1 的元素直接忽略（防御脏 DOM 与用户手写属性）；
 * - 返回顺序不保证按行号升序，测量阶段统一排序。
 *
 * @param root 预览滚动容器（或任意祖先节点）；null/undefined 返回空数组
 */
export function CollectPreviewAnchorElements(
    root: ParentNode | null | undefined
): PreviewAnchorElement[] {
    if (!root || typeof root.querySelectorAll !== 'function') {
        return []
    }
    const nodes = root.querySelectorAll(`[${PREVIEW_SOURCE_LINE_ATTRIBUTE}]`)
    const anchors: PreviewAnchorElement[] = []
    for (let index = 0; index < nodes.length; index += 1) {
        const element = nodes[index] as HTMLElement
        // 测试环境 / 极端 DOM 下可能不是 HTMLElement，缺少测量能力的一律跳过
        if (typeof element.getBoundingClientRect !== 'function') {
            continue
        }
        const rawLine = element.getAttribute(PREVIEW_SOURCE_LINE_ATTRIBUTE)
        if (rawLine === null) {
            continue
        }
        const line = Number.parseInt(rawLine, 10)
        if (!Number.isFinite(line) || line < 1) {
            continue
        }
        anchors.push({ line, element })
    }
    return anchors
}

/**
 * 测量锚点相对滚动容器「内容顶部」的偏移。
 *
 * 公式：`锚点 rect.top - 容器 rect.top + 容器 scrollTop`。
 * 不使用 `offsetTop`：预览 DOM 由 v-html 与分块追加混合生成，offsetParent 链不保证
 * 指向滚动容器（可能被 position/transform 的祖先截断），boundingClientRect 差值更稳。
 *
 * @param container 预览滚动容器
 * @param anchors 锚点元素列表
 * @returns 按行号升序的偏移列表；无法测量的锚点丢弃
 */
export function MeasurePreviewAnchorOffsets(
    container: HTMLElement,
    anchors: readonly PreviewAnchorElement[]
): PreviewAnchorOffset[] {
    if (!container || typeof container.getBoundingClientRect !== 'function') {
        return []
    }
    const containerRect = container.getBoundingClientRect()
    const containerScrollTop = Number.isFinite(container.scrollTop) ? container.scrollTop : 0
    const contentTop = containerRect.top - containerScrollTop
    const offsets: PreviewAnchorOffset[] = []
    for (const anchor of anchors) {
        const rect = anchor.element.getBoundingClientRect()
        if (!rect || !Number.isFinite(rect.top)) {
            continue
        }
        const top = rect.top - contentTop
        if (!Number.isFinite(top)) {
            continue
        }
        offsets.push({ line: anchor.line, top })
    }
    // 行号升序；同一行号按文档位置（top 升序）稳定排列
    offsets.sort((left, right) => left.line - right.line || left.top - right.top)
    return offsets
}

/**
 * 二分查找「源码行号 ≤ sourceLine」的最近锚点（等价于区间定位：找最后一个满足条件的块）。
 *
 * 复杂度 O(log n)；anchors 必须按 line 升序（{@link MeasurePreviewAnchorOffsets} 已保证）。
 *
 * @param anchors 已测量并排序的锚点
 * @param sourceLine 编辑器可见区首行（1 起始）
 * @returns 命中的锚点；无任何锚点行号 ≤ sourceLine 时返回 null（调用方走比例兜底）
 */
export function FindNearestPreviewAnchor(
    anchors: readonly PreviewAnchorOffset[],
    sourceLine: number
): PreviewAnchorOffset | null {
    if (anchors.length === 0 || !Number.isFinite(sourceLine)) {
        return null
    }
    let low = 0
    let high = anchors.length - 1
    let found = -1
    while (low <= high) {
        const mid = (low + high) >> 1
        if (anchors[mid].line <= sourceLine) {
            found = mid
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    return found === -1 ? null : anchors[found]
}

/**
 * 计算预览滚动容器应设置的 scrollTop。
 *
 * 优先级：
 * 1. 命中锚点 → 锚点偏移（滚动到对应块顶部）；
 * 2. 无锚点（内容为空/大文档骨架/植入失败）→ `ratio × 最大滚动距离` 比例兜底；
 * 3. 结果统一钳制到 [0, maxScrollTop]，非法输入回落 0。
 *
 * @param anchors 已测量的锚点（升序）
 * @param target 同步目标（line 1 起始；ratio 0~1）
 * @param maxScrollTop 容器最大可滚动距离（scrollHeight - clientHeight，负值按 0 处理）
 */
export function ResolvePreviewScrollTop(
    anchors: readonly PreviewAnchorOffset[],
    target: PreviewScrollTarget,
    maxScrollTop: number
): number {
    const limit = Number.isFinite(maxScrollTop) ? Math.max(0, maxScrollTop) : 0
    const anchor = FindNearestPreviewAnchor(anchors, target.line)
    let desired: number
    if (anchor !== null) {
        desired = anchor.top
    } else {
        const ratio = Number.isFinite(target.ratio) ? Math.min(1, Math.max(0, target.ratio)) : 0
        desired = ratio * limit
    }
    if (!Number.isFinite(desired)) {
        return 0
    }
    return Math.min(limit, Math.max(0, desired))
}
