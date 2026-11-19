/**
 * preview-block-utils.ts
 * Markdown 预览 4 个 markdown-it 块级插件的公共解析工具（无状态 / 参数化）。
 *
 * 背景（第 3 批组件化子任务 D）：
 * `preview-md-basic.ts` / `preview-md-blocks.ts` / `preview-md-media.ts` /
 * `preview-mkdocs-material.ts` 此前各自复制了一套行级解析 helper：
 * - `getLineText` / `canStartBlock` / `ensureEnv` / `collectIndentedBlockEnd` 共 2~3 份逐字相同；
 * - `isNestingTooDeep` 逻辑相同但 env 键不同（各插件用自己的 `ENV_*` 键，状态必须隔离）；
 * - `getDedentedContent` 存在 3 种「缩进口径」（见下方三个具名封装）；
 * - `remapTokenLineMaps` 只是形参不同（`Token[]` vs `StateBlock`）；
 * - `parseNestedContent` 只是 env 参数与 env 键不同。
 *
 * 收敛原则：
 * 1. 只抽「无状态公共逻辑」；各插件的 `ENV_*` 键与 token 类型保持模块私有，**不合并 env 状态**；
 * 2. 口径差异不强行统一：用「基础函数 + 具名封装」显式保留三种去缩进口径，
 *    插件 import 对应封装即可，避免把口径判断散落到各调用点；
 * 3. 函数入参尽量显式（嵌套深度键、缩进列），便于单测对旧实现做输入输出等价性断言。
 */
import type { Env, StateBlock, Token } from 'markdown-it'

/** 内容缩进阈值：与 markdown-it 缩进代码块判定一致（4 列，Tab 按 4 列展开） */
export const CONTENT_INDENT = 4

/** markdown-it maxNesting 默认值（与 markdown-it 选项缺省值一致，防御恶意深层嵌套栈溢出） */
export const DEFAULT_MAX_NESTING = 100

/**
 * 读取某一行的文本（去掉行首缩进标记部分）。
 * 说明：`state.src` 已由 markdown-it 把 CRLF 归一化为 LF，因此无需再做换行处理。
 */
export function getLineText(state: StateBlock, line: number): string {
    return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line])
}

/**
 * 读取某一行的原始文本（保留行首缩进，含 tShift 部分）。
 * 用于需要按「原始列位置」扫描的场景（如 media 插件的 grid 容器闭合标签扫描）。
 */
export function getRawLineText(state: StateBlock, line: number): string {
    return state.src.slice(state.bMarks[line], state.eMarks[line])
}

/**
 * 是否允许在此行起始一个自定义块。
 * 与 markdown-it 内置 block rule 的判定一致：相对当前块缩进（blkIndent）必须小于 4 列，
 * 否则该行属于缩进代码块，不应被当作 `???` / `!!!` / `///` 等自定义块头部。
 */
export function canStartBlock(state: StateBlock, line: number): boolean {
    return state.sCount[line] - state.blkIndent < CONTENT_INDENT
}

/**
 * 读取（必要时创建）当前解析的 env 对象。
 * 入参只要求含 `env` 字段：兼容 `StateBlock` / `StateCore` 以及测试中的最小状态对象。
 */
export function ensureEnv(state: { env: Env }): Env {
    if (!state.env) {
        state.env = {}
    }
    return state.env
}

/** 安全读取 env 上的数值型计数器（不存在或类型不符时回退 fallback，不抛异常） */
export function getEnvNumber(env: Env | undefined, key: string, fallback = 0): number {
    const value = env?.[key]
    return typeof value === 'number' ? value : fallback
}

/** 读取当前递归嵌套深度（各插件传入自己的 env 键，互不干扰） */
export function getNestingDepth(env: Env | undefined, depthKey: string): number {
    return getEnvNumber(env, depthKey, 0)
}

/**
 * 当前递归嵌套深度是否已超限（超限时自定义块回退为普通段落，避免栈溢出）。
 * 保留「调用时再读 state.env」的旧语义：不在检查阶段创建 env 对象。
 */
export function isNestingTooDeep(state: StateBlock, depthKey: string): boolean {
    const depth = getNestingDepth(state.env, depthKey)
    const maxNesting = state.md.options.maxNesting ?? DEFAULT_MAX_NESTING
    return depth >= maxNesting
}

/**
 * 收集「缩进内容块」结束行号：从 startLine + 1 起，空行或相对缩进 ≥4 列的行都属于块内容，
 * 遇到「非空且相对缩进 <4 列」的行即结束。
 * @returns 块结束后第一行的行号（endLine 表示到文末）
 */
export function collectIndentedBlockEnd(
    state: StateBlock,
    startLine: number,
    endLine: number
): number {
    let line = startLine + 1
    while (line < endLine) {
        if (state.isEmpty(line)) {
            line += 1
            continue
        }
        if (state.sCount[line] - state.blkIndent >= CONTENT_INDENT) {
            line += 1
            continue
        }
        break
    }
    return line
}

/**
 * 基础去缩进函数：取出 [beginLine, endLine) 行区间文本并按 indent 列去掉行首缩进。
 * `state.getLines()` 是 markdown-it 官方缩进工具：按列展开 Tab、行数与原文一一对应，
 * 因此递归解析后的 token.map 可以按行号整体平移回填。
 * @param indent 要裁掉的缩进列数（由调用方按所属语法口径计算）
 */
export function getDedentedContent(
    state: StateBlock,
    beginLine: number,
    endLine: number,
    indent: number
): string {
    if (endLine <= beginLine) {
        return ''
    }
    return state.getLines(beginLine, endLine, indent, false)
}

/**
 * 缩进口径 A：`!!!` admonition / `???` 折叠块的「缩进内容块」。
 * 内容相对当前容器缩进（blkIndent）再额外缩进 4 列，去缩进时两段一起裁掉。
 * 对应旧实现：basic / mkdocs-material 的 `getDedentedContent`。
 */
export function getIndentedBlockContent(
    state: StateBlock,
    beginLine: number,
    endLine: number
): string {
    return getDedentedContent(state, beginLine, endLine, state.blkIndent + CONTENT_INDENT)
}

/**
 * 缩进口径 B：`///` pymdownx 围栏块的内容。
 * 围栏块内容不像 `!!!` 那样额外要求 4 空格缩进，只裁掉容器缩进（blkIndent），
 * 块内保留的额外缩进（如 4 空格缩进代码块）原样交给递归解析。
 * 对应旧实现：preview-md-blocks 的 `getDedentedContent`。
 */
export function getFenceBlockContent(
    state: StateBlock,
    beginLine: number,
    endLine: number
): string {
    return getDedentedContent(state, beginLine, endLine, state.blkIndent)
}

/**
 * 缩进口径 C：`<div class="grid cards" markdown>` 容器内容。
 * 按容器开标签所在行（beginLine - 1）的缩进列去缩进；行号越界时回退 blkIndent
 * （`??` 仅对 undefined 生效，与旧实现一致）。
 * 对应旧实现：preview-md-media 的 `getDedentedContent`。
 */
export function getContainerBlockContent(
    state: StateBlock,
    beginLine: number,
    endLine: number
): string {
    const indent = state.sCount[beginLine - 1] ?? state.blkIndent
    return getDedentedContent(state, beginLine, endLine, indent)
}

/**
 * 把 [startIndex, ...) 新产出的 token.map 从「子文本相对行号」回填为整篇文档绝对行号。
 * 子文本与原文行一一对应（getLines 不增删行），因此整体平移 offset 即可。
 */
export function remapTokenLineMaps(
    tokens: Token[],
    startIndex: number,
    sourceStartLine: number
): void {
    for (let index = startIndex; index < tokens.length; index += 1) {
        const map = tokens[index].map
        if (map) {
            map[0] += sourceStartLine
            map[1] += sourceStartLine
        }
    }
}

/**
 * 块级递归解析：把去缩进后的 Markdown 内容解析为 token 追加到当前 token 流。
 * 内容 token 的源码行号会按 sourceStartLine 回填，保证目录/定位行号准确。
 *
 * 嵌套深度计数挂在 `state.env[depthKey]` 上：解析前后自增/还原，异常时也保证还原
 * （各插件传入自己的 `ENV_*` 键，计数互不干扰）。
 *
 * @param state 当前 block 状态
 * @param content 去缩进后的 Markdown 内容
 * @param sourceStartLine 内容第一行在整篇文档中的绝对行号（回填 token.map 用）
 * @param depthKey 本插件在 env 上的嵌套深度键名
 */
export function parseNestedContent(
    state: StateBlock,
    content: string,
    sourceStartLine: number,
    depthKey: string
): void {
    if (content.length === 0) {
        return
    }
    const env = ensureEnv(state)
    const tokenStart = state.tokens.length
    const depth = getNestingDepth(env, depthKey)
    env[depthKey] = depth + 1
    try {
        state.md.block.parse(content, state.md, state.env, state.tokens)
    } finally {
        env[depthKey] = depth
    }
    remapTokenLineMaps(state.tokens, tokenStart, sourceStartLine)
}
