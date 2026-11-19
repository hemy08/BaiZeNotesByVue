/**
 * preview-md-blocks.ts
 * 批次 C：mkdocs 块语法（pymdownx.blocks `///`）/ 文件片段包含（snippets `--8<--`）/
 * tab 深链（#__tabbed_<setId>_<tabIndex>）三块能力的渲染层实现。
 *
 * 一、pymdownx.blocks（`///` 围栏块，mkdocs-material 9.x）
 *   ```markdown
 *   /// note
 *   内容（内部 Markdown 递归解析）
 *   ///
 *
 *   /// tip | 自定义标题
 *   内容
 *   ///
 *
 *   /// tabbed
 *   /// tab | 标签1
 *   内容
 *   ///
 *   /// tab | 标签2
 *   内容
 *   ///
 *   ///
 *
 *   /// details | 折叠标题
 *   内容
 *   ///
 *   ```
 *   - `///` 是「围栏式」块：内容不被缩进要求（与 `!!!` 的 4 空格缩进内容不同），
 *     以单独一行 `///` 结束；同名嵌套通过深度计数天然支持，代码围栏内的 `///` 不参与计数；
 *   - `note/tip/warning/danger/info/success/...` 等类型复用 `preview-mkdocs-material.ts`
 *     的 `mkdocs_admonition_open/close` token 渲染器 → 输出与 `!!!` 完全一致的
 *     `.admonition.<type> > p.admonition-title` 结构；
 *   - `tabbed` + 子 `tab` 复用 `mkdocs_tabs_open/tab_open/tab_close/tabs_close` token 渲染器
 *     → 输出与 `===` 完全一致的 radio/labels/content 结构（含第 3 节 tab 深链 id 约定）；
 *   - `details` 渲染 `<details class="admonition details"><summary>…</summary>`，
 *     复用既有 admonition.css 对 details/summary 的样式；
 *   - 未闭合/嵌套超限等异常一律返回 false 交回普通段落规则（优雅回退，不吞后续 Markdown）；
 *   - token.map 回填为整篇文档绝对行号（与 mkdocs-material 插件同一套 remap 方案）。
 *
 * 二、snippets（`--8<--` 文件片段包含）
 *   - 需要异步读文件，不能放在 markdown-it 同步 render 内，因此实现为独立纯函数
 *     `expandSnippetIncludes(markdown, activeFilePath, readFile, options)`，由预览组件在
 *     `md.render` 之前调用；readFile 注入点由调用方提供（主进程 IPC / 测试桩均可）；
 *   - 相对路径基于 activeFilePath 所在目录解析；行号区间 `path.md:10:20`（1-based、
 *     含端点、越界夹取）；递归深度上限 / 单文件与总大小上限 / 文本扩展名白名单 /
 *     目录穿越默认禁止（options.allowOutsideRoot 可显式放开）；展开内容按指令行缩进缩进；
 *   - 未展开（如直接 `md.render`）时由同步 block rule 渲染为占位段落，原文按普通文本
 *     显示、不抛异常（见 `MDX_SNIPPET_PLACEHOLDER`）。
 *
 * 三、tab 深链
 *   - 深链 id 约定与解析工具函数由 `preview-mkdocs-material.ts` 统一提供，本模块 re-export，
 *     方便根代理从「批次 C 模块」一处接线（渲染侧 id 由 tab 渲染器统一产出）。
 *
 * 依赖顺序：本插件复用 mkdocs-material 插件注册的 token 渲染器，必须在其之后 `.use()`
 *（`createPreviewMarkdownIt()` 中的装配顺序已保证）。单独使用本插件不会抛异常，但
 * `/// tabbed` / `/// note` 的 token 会退化为无 class 的 div（无样式）。
 */
import type MarkdownIt from 'markdown-it'
import type { Env, StateBlock } from 'markdown-it'
// 第 4 批 P3：snippets 默认告警输出收敛到渲染层统一日志出口（logger.warn 参数原样透传）
import { logger } from '../../common/logger'
// 块级解析公共 helper（第 3 批子任务 D 去重）：本模块使用缩进口径 B（仅裁容器缩进，见 preview-block-utils）
import {
    canStartBlock,
    ensureEnv,
    getEnvNumber,
    getFenceBlockContent,
    getLineText,
    isNestingTooDeep,
    parseNestedContent
} from './preview-block-utils'
import {
    createTabDeepLinkEnv,
    getTabTargetByHash,
    getTabbedLabelId,
    getTabbedPanelId,
    getTabbedRadioId,
    getTabbedSetAnchorId,
    MDX_TAB_DEEP_LINK_ENV_KEY,
    MKDOCS_ADMONITION_CLOSE,
    MKDOCS_ADMONITION_OPEN,
    MKDOCS_TAB_CLOSE,
    MKDOCS_TAB_OPEN,
    MKDOCS_TABS_CLOSE,
    MKDOCS_TABS_OPEN
} from './preview-mkdocs-material'
import type { TabDeepLinkTarget } from './preview-mkdocs-material'
import {
    getExtension,
    isPathWithin,
    normalizePathForCompare as normalizePathForCompareShared,
    normalizeSlashes
} from '../../../../shared/utils/path'
import { SNIPPET_SUPPORTED_EXTENSIONS } from '../../../../shared/constants/file-extensions'
import {
    PREVIEW_BLOCK_MAX_DEPTH,
    PREVIEW_BLOCK_MAX_SIZE,
    PREVIEW_BLOCK_TOTAL_MAX_SIZE
} from '../../../../shared/constants/limits'

/** markdown-it 实例类型（`MarkdownIt` 默认导出是构造器值，实例类型需用 InstanceType 表达） */
type MarkdownItInstance = InstanceType<typeof MarkdownIt>

/* tab 深链工具函数统一从 material 模块导出，批次 C 模块 re-export 便于根代理一处接线 */
export {
    createTabDeepLinkEnv,
    getTabTargetByHash,
    getTabbedLabelId,
    getTabbedPanelId,
    getTabbedRadioId,
    getTabbedSetAnchorId,
    MDX_TAB_DEEP_LINK_ENV_KEY
}
export type { TabDeepLinkTarget }

/* ============================== 一、pymdownx.blocks（///）语法约定 ============================== */

/**
 * 块起始行：`/// <type>` 或 `/// <type> | 标题`。
 * - 类型：字母开头，允许字母/数字/下划线/连字符（渲染时统一小写，作为 CSS class）；
 * - 标题：`|` 之后的任意文本（渲染时 escapeHtml），缺省用类型名；
 * - 与 pymdownx 一致，`///` 后必须有空白，避免把普通文本里的 `////` 误判为块。
 */
const BLOCK_OPEN_PATTERN = /^\/\/\/[ \t]+([A-Za-z][\w-]*)(?:[ \t]*\|[ \t]*(.*?))?[ \t]*$/

/** 块结束行：单独一行 `///`（允许尾随空白） */
const BLOCK_CLOSE_PATTERN = /^\/\/\/[ \t]*$/

/** 特殊块类型（其余类型统一按 admonition 渲染） */
const BLOCK_TYPE_TABBED = 'tabbed'
const BLOCK_TYPE_TAB = 'tab'
const BLOCK_TYPE_DETAILS = 'details'

/** 本模块自有的嵌套深度 env 键（与 material 插件的计数互不干扰） */
const ENV_BLOCK_DEPTH = '__mdxBlocksNestingDepth'
/** 本模块 tabbed set 自增计数器 env 键 */
const ENV_TABBED_SET_ID = '__mdxBlocksTabbedSetId'

/**
 * `/// tabbed` 的 setId 起始基数。
 *
 * markdown-it 的 tab radio 用 `name="__tabbed_<setId>"` 分组，同文档内 `===`（material 插件，
 * 从 1 自增）与 `/// tabbed`（本模块）必须使用互不重叠的 setId 才不会互相串组。
 * material 的计数器常量未导出（本任务只允许对其做最小定向修改），故本模块使用高位段
 * `100000+`：正常文档的 `===` 组数量远小于 10 万，radio name/id 实际不会冲突；
 * 若未来把两个计数器合并，只需把本常量改为与 material 计数器共享。
 */
const PYMDOWNX_TABBED_SET_ID_BASE = 100000

/* 本模块自有的 token 类型（admonition/tabbed 复用 material 插件 token，见文件头说明） */
/** `/// details` 折叠块（渲染为 `<details class="admonition details">`） */
export const MDX_DETAILS_OPEN = 'mdx_blocks_details_open'
export const MDX_DETAILS_CLOSE = 'mdx_blocks_details_close'
/** 未展开的 snippets 指令占位 token（同步渲染，按普通文本显示） */
export const MDX_SNIPPET_PLACEHOLDER = 'mdx_snippet_placeholder'

/* ============================== 二、块语法行级工具 ============================== */

/** 匹配块起始行；返回类型（保留原文大小写）与标题（可为空串），不匹配返回 null */
function matchBlockHeader(lineText: string): { type: string; title: string } | null {
    const match = BLOCK_OPEN_PATTERN.exec(lineText)
    if (!match) {
        return null
    }
    return { type: match[1], title: match[2] ?? '' }
}

/** 是否为块结束行（单独一行 `///`） */
function isBlockCloseLine(lineText: string): boolean {
    return BLOCK_CLOSE_PATTERN.test(lineText)
}

/** 分配下一个 `/// tabbed` 组序号（从 PYMDOWNX_TABBED_SET_ID_BASE + 1 开始） */
function nextPymdownxTabbedSetId(env: Env): number {
    const next = getEnvNumber(env, ENV_TABBED_SET_ID) + 1
    env[ENV_TABBED_SET_ID] = next
    return PYMDOWNX_TABBED_SET_ID_BASE + next
}

/* ============================== 三、围栏块结束行扫描 ============================== */

/** 围栏代码块状态（``` / ~~~，长度 ≥ 3；扫描 `///` 结束行时跳过代码围栏内容） */
interface FenceState {
    marker: string
    length: number
}

/** 块配对结果 */
interface BlockRange {
    /** 与起始行配对的 `///` 结束行行号 */
    closeLine: number
    /** 结束行的下一行（rule 推进 state.line 用） */
    nextLine: number
}

/** 判断一行（trim 后）是否开启围栏代码块 */
function matchFenceStart(trimmedLine: string): FenceState | null {
    const match = /^(`{3,}|~{3,})/.exec(trimmedLine)
    if (!match) {
        return null
    }
    return { marker: match[1][0], length: match[1].length }
}

/** 判断一行（trim 后）是否关闭当前围栏代码块 */
function isFenceCloseLine(trimmedLine: string, fence: FenceState): boolean {
    if (!trimmedLine.startsWith(fence.marker)) {
        return false
    }
    let end = 0
    while (end < trimmedLine.length && trimmedLine[end] === fence.marker) {
        end += 1
    }
    if (end < fence.length) {
        return false
    }
    return trimmedLine.slice(end).trim().length === 0
}

/**
 * 从 startLine 的 `///` 起始行出发，找到对应的 `///` 结束行。
 *
 * 采用「深度计数」配对：内容中出现的下一个合法 `/// <type>` 起始行使深度 +1，
 * 单独一行 `///` 使深度 -1，归零即配对成功。代码围栏（``` / ~~~）内部的行不参与计数，
 * 因此代码示例里的 `///` 不会提前结束外层块。
 *
 * @returns 配对结果；在 endLine 之前未闭合时返回 null（调用方回退为普通段落）
 */
function findBlockClose(state: StateBlock, startLine: number, endLine: number): BlockRange | null {
    let depth = 1
    let fence: FenceState | null = null
    for (let line = startLine + 1; line < endLine; line += 1) {
        const lineText = getLineText(state, line).trim()
        if (fence) {
            if (isFenceCloseLine(lineText, fence)) {
                fence = null
            }
            continue
        }
        const fenceStart = matchFenceStart(lineText)
        if (fenceStart) {
            fence = fenceStart
            continue
        }
        if (isBlockCloseLine(lineText)) {
            depth -= 1
            if (depth === 0) {
                return { closeLine: line, nextLine: line + 1 }
            }
            continue
        }
        if (matchBlockHeader(lineText)) {
            depth += 1
        }
    }
    return null
}

/* ============================== 四、内容提取与递归解析 ==============================
 * 去缩进（缩进口径 B：`///` 围栏内容只裁容器缩进）与递归解析统一由
 * `preview-block-utils.ts` 提供：getFenceBlockContent / parseNestedContent。
 */

/* ============================== 五、tabbed 子 tab 收集 ============================== */

/** `/// tabbed` 的子 tab 段（标签 + 去缩进内容 + 内容起始绝对行号） */
interface PymdownxTabSegment {
    label: string
    content: string
    contentStartLine: number
}

/**
 * 在 `/// tabbed` 的内容区间内收集顶层 `/// tab | 标签` 段。
 *
 * @returns 段列表；子 tab 未闭合（结构非法）时返回 null（调用方回退为普通段落）；
 *          未找到任何子 tab 时返回空数组
 */
function collectTabSegments(
    state: StateBlock,
    contentStartLine: number,
    contentEndLine: number
): PymdownxTabSegment[] | null {
    const segments: PymdownxTabSegment[] = []
    let line = contentStartLine
    while (line < contentEndLine) {
        if (!canStartBlock(state, line)) {
            line += 1
            continue
        }
        const header = matchBlockHeader(getLineText(state, line).trim())
        if (!header || header.type.toLowerCase() !== BLOCK_TYPE_TAB) {
            line += 1
            continue
        }
        const range = findBlockClose(state, line, contentEndLine)
        if (!range) {
            return null
        }
        segments.push({
            label: header.title.trim().length > 0 ? header.title.trim() : BLOCK_TYPE_TAB,
            // 缩进口径 B：/// 围栏内容只裁容器缩进（不额外要求 4 空格）
            content: getFenceBlockContent(state, line + 1, range.closeLine),
            contentStartLine: line + 1
        })
        line = range.nextLine
    }
    return segments
}

/* ============================== 六、pymdownx.blocks block rule ============================== */

/**
 * 输出一组 tabbed set token（与 material 插件 `===` 的 token 结构完全一致）：
 * `mkdocs_tabs_open(meta.labels)` → 每段 `mkdocs_tab_open(meta.index/setId)` → 内容 → close。
 */
function emitTabbedSet(
    state: StateBlock,
    startLine: number,
    range: BlockRange,
    segments: PymdownxTabSegment[],
    env: Env
): void {
    const setId = nextPymdownxTabbedSetId(env)
    const setOpenToken = state.push(MKDOCS_TABS_OPEN, 'div', 1)
    setOpenToken.block = true
    setOpenToken.map = [startLine, range.nextLine]
    setOpenToken.meta = { setId, labels: segments.map((segment) => segment.label) }
    segments.forEach((segment, index) => {
        const tabOpenToken = state.push(MKDOCS_TAB_OPEN, 'div', 1)
        tabOpenToken.block = true
        tabOpenToken.map = [segment.contentStartLine - 1, segment.contentStartLine - 1]
        tabOpenToken.meta = { index, setId }
        parseNestedContent(state, segment.content, segment.contentStartLine, ENV_BLOCK_DEPTH)
        const tabCloseToken = state.push(MKDOCS_TAB_CLOSE, 'div', -1)
        tabCloseToken.block = true
    })
    const setCloseToken = state.push(MKDOCS_TABS_CLOSE, 'div', -1)
    setCloseToken.block = true
    state.line = range.nextLine
}

/** 输出 admonition 结构的 token（复用 material 插件渲染器，保证与 `!!!` 结构一致） */
function emitAdmonition(
    state: StateBlock,
    startLine: number,
    range: BlockRange,
    type: string,
    title: string
): void {
    const content = getFenceBlockContent(state, startLine + 1, range.closeLine)
    const openToken = state.push(MKDOCS_ADMONITION_OPEN, 'div', 1)
    openToken.block = true
    openToken.map = [startLine, range.nextLine]
    openToken.meta = { type, title }
    parseNestedContent(state, content, startLine + 1, ENV_BLOCK_DEPTH)
    const closeToken = state.push(MKDOCS_ADMONITION_CLOSE, 'div', -1)
    closeToken.block = true
    state.line = range.nextLine
}

/** 输出 details 折叠块 token（`<details class="admonition details"><summary>`） */
function emitDetails(state: StateBlock, startLine: number, range: BlockRange, title: string): void {
    const content = getFenceBlockContent(state, startLine + 1, range.closeLine)
    const openToken = state.push(MDX_DETAILS_OPEN, 'details', 1)
    openToken.block = true
    openToken.map = [startLine, range.nextLine]
    openToken.meta = {
        type: BLOCK_TYPE_DETAILS,
        title: title.length > 0 ? title : BLOCK_TYPE_DETAILS
    }
    parseNestedContent(state, content, startLine + 1, ENV_BLOCK_DEPTH)
    const closeToken = state.push(MDX_DETAILS_CLOSE, 'details', -1)
    closeToken.block = true
    state.line = range.nextLine
}

/**
 * pymdownx.blocks block rule：识别 `/// <type> [| title]` … `///` 围栏块。
 *
 * 分支：
 * - `tabbed`：收集子 `tab` 段后输出一组 tabbed set（与 `===` 相同结构）；
 * - `tab`：作为独立块时输出只含一个 tab 的 tabbed set（结构保持可交互）；
 * - `details`：输出 `<details class="admonition details">` 折叠块；
 * - 其余类型：输出与 `!!!` 相同的 `.admonition.<type>` 提示块。
 */
function pymdownxBlockRule(
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
): boolean {
    if (!canStartBlock(state, startLine)) {
        return false
    }
    const header = matchBlockHeader(getLineText(state, startLine))
    if (!header) {
        return false
    }
    // 优雅回退：未闭合的 `///` 块不吞内容，整段交回普通段落规则按文本渲染
    const range = findBlockClose(state, startLine, endLine)
    if (!range) {
        return false
    }
    if (silent) {
        return true
    }
    // 嵌套计数使用本模块私有 env 键（与 material 插件计数隔离）
    if (isNestingTooDeep(state, ENV_BLOCK_DEPTH)) {
        return false
    }
    const blockType = header.type.toLowerCase()
    const title = header.title.trim()

    if (blockType === BLOCK_TYPE_TABBED) {
        const segments = collectTabSegments(state, startLine + 1, range.closeLine)
        if (segments === null || segments.length === 0) {
            // 子 tab 未闭合 / 没有合法子 tab：整体回退为普通段落，避免吞掉后续 Markdown
            return false
        }
        // tab 组序号计数器挂在 env 上（本模块特有），复用公共 ensureEnv 读取
        emitTabbedSet(state, startLine, range, segments, ensureEnv(state))
        return true
    }
    if (blockType === BLOCK_TYPE_TAB) {
        // 独立 `/// tab` 包成单 tab 的 tabbed set，保证结构与 `===` 一致
        emitTabbedSet(
            state,
            startLine,
            range,
            [
                {
                    label: title.length > 0 ? title : BLOCK_TYPE_TAB,
                    content: getFenceBlockContent(state, startLine + 1, range.closeLine),
                    contentStartLine: startLine + 1
                }
            ],
            ensureEnv(state)
        )
        return true
    }
    if (blockType === BLOCK_TYPE_DETAILS) {
        emitDetails(state, startLine, range, title)
        return true
    }
    emitAdmonition(state, startLine, range, header.type, header.title)
    return true
}

/* ============================== 七、snippets 指令解析（同步部分） ============================== */

/** snippets 指令标记 */
export const SNIPPET_INCLUDE_MARKER = '--8<--'

/**
 * 默认递归展开深度上限（防循环）。
 *
 * 迁移（渲染层公共接口归位）：数值真源改为 `src/shared/constants/limits.ts` 的
 * `PREVIEW_BLOCK_MAX_DEPTH`；本常量保留原导出名，既有 import（单测/调用方）零改动。
 */
export const SNIPPET_DEFAULT_MAX_DEPTH = PREVIEW_BLOCK_MAX_DEPTH
/**
 * 默认单文件大小上限（1 MiB）。
 *
 * 迁移（渲染层公共接口归位）：数值真源改为 `shared/constants/limits.PREVIEW_BLOCK_MAX_SIZE`
 * （shared 常量名按「预览块」语义命名，与原 SNIPPET_DEFAULT_MAX_FILE_BYTES 数值逐字一致）。
 */
export const SNIPPET_DEFAULT_MAX_FILE_BYTES = PREVIEW_BLOCK_MAX_SIZE
/**
 * 默认展开总大小上限（4 MiB；防止一次预览读入过多内容）。
 *
 * 迁移（渲染层公共接口归位）：数值真源改为
 * `shared/constants/limits.PREVIEW_BLOCK_TOTAL_MAX_SIZE`。
 */
export const SNIPPET_DEFAULT_MAX_TOTAL_BYTES = PREVIEW_BLOCK_TOTAL_MAX_SIZE

/**
 * 允许作为片段包含的文本扩展名白名单（小写，含点）。
 *
 * 迁移（渲染层公共接口归位）：清单真源改为
 * `shared/constants/file-extensions.SNIPPET_SUPPORTED_EXTENSIONS`（43 项，逐项对齐）；
 * 本常量保留原导出名，既有 import 零改动。
 */
export const SNIPPET_ALLOWED_EXTENSIONS: readonly string[] = SNIPPET_SUPPORTED_EXTENSIONS

/**
 * 单行 snippets 指令：
 * `--8<-- "relative/path.md"` / `--8<-- "relative/path.md:10:20"`。
 * 允许缩进（展开时按缩进应用到内容每行）；也兼容 pymdownx 的未加引号单 token 写法。
 */
const SNIPPET_LINE_PATTERN = /^([ \t]*)--8<--[ \t]+(.+?)[ \t]*$/

/** 解析后的片段引用目标 */
export interface SnippetIncludeTarget {
    /** 相对 active 文件目录的文件路径（保留原始写法） */
    path: string
    /** 起始行（1-based）；null 表示从文件开头 */
    startLine: number | null
    /** 结束行（1-based、含端点）；null 表示到文件末尾 */
    endLine: number | null
}

/** 解析后的 snippets 指令行 */
export interface SnippetIncludeLine {
    /** 指令行前导缩进（展开内容时应用到每一行） */
    indent: string
    /** 指令行原文（trim 后，占位渲染显示用） */
    rawText: string
    target: SnippetIncludeTarget
}

/**
 * 解析路径 + 可选行号区间。
 * 支持 `path`、`path:start`、`path:start:end`；引号写法支持路径含空格。
 */
function parseSnippetTarget(raw: string): SnippetIncludeTarget | null {
    let value = raw.trim()
    if (value.length === 0) {
        return null
    }
    const quote = value[0]
    if (quote === '"' || quote === "'") {
        const closing = value.indexOf(quote, 1)
        if (closing < 0) {
            return null
        }
        // 暂不支持 pymdownx 的「一行多个 include」写法：引号后还有内容视为非法指令
        if (value.slice(closing + 1).trim().length > 0) {
            return null
        }
        value = value.slice(1, closing).trim()
    } else if (/\s/.test(value)) {
        // 未加引号时路径不允许含空白
        return null
    }
    if (value.length === 0) {
        return null
    }
    let path = value
    let startLine: number | null = null
    let endLine: number | null = null
    const rangeMatch = /^(.*?):(\d+)(?::(\d+))?$/.exec(value)
    if (rangeMatch) {
        path = rangeMatch[1]
        startLine = Number(rangeMatch[2])
        endLine = rangeMatch[3] === undefined ? null : Number(rangeMatch[3])
    }
    if (path.length === 0) {
        return null
    }
    return { path, startLine, endLine }
}

/**
 * 解析一行 snippets 指令（同步纯函数，占位渲染与异步展开共用同一套语法判定）。
 * @returns 解析结果；不是合法指令时返回 null
 */
export function parseSnippetIncludeLine(line: string): SnippetIncludeLine | null {
    const match = SNIPPET_LINE_PATTERN.exec(line.replace(/\r$/, ''))
    if (!match) {
        return null
    }
    const target = parseSnippetTarget(match[2] ?? '')
    if (!target) {
        return null
    }
    return { indent: match[1] ?? '', rawText: line.trim(), target }
}

/** 该行是否为（合法的）snippets 指令行 */
export function isSnippetDirectiveLine(line: string): boolean {
    return parseSnippetIncludeLine(line) !== null
}

/* ============================== 八、snippets 路径与文本工具 ============================== */

/*
 * snippets 路径工具（迁移说明）。
 *
 * 原实现：
 * - `normalizeSlashes`（反斜杠 → `/`）；
 * - `normalizePathForCompare`（去尾部 `/`，盘符/UNC 路径自动小写后比较）；
 * - `isWithinDirectory`（candidate 等于 root 或位于 root 子树）；
 * - `getLowerExtension`（取最后一段文件名的小写扩展名，含点）。
 *
 * 迁移（渲染层公共接口归位）：以上四个函数改为复用 `src/shared/utils/path.ts` 的
 * `normalizeSlashes` / `normalizePathForCompare` / `isPathWithin` / `getExtension`。
 * 为保持行为零变化，本地薄壳保留原语义细节：
 * - Windows 大小写不敏感由「路径本身是否为盘符/UNC 形态」判定（与原实现一致；
 *   shared 版本要求显式传 `win32CaseInsensitive`，不读平台）；
 * - shared 额外做 `.`/`..` 词法折叠（安全增强；snippets 的 resolved 路径在
 *   `resolveSnippetPath` 中已折叠，实际输入无点段，比较结果不变）；
 * - shared `getExtension` 返回不含点的扩展名，本地 `getLowerExtension` 补回点以
 *   对齐白名单清单（43 项均带点）。
 */

/** 是否为绝对路径（盘符 / UNC / POSIX 根） */
function isAbsoluteSnippetPath(value: string): boolean {
    const normalized = normalizeSlashes(value)
    return (
        /^[A-Za-z]:\//.test(normalized) ||
        /^[A-Za-z]:$/.test(normalized) ||
        normalized.startsWith('//') ||
        normalized.startsWith('/')
    )
}

/** 取宿主目录（绝对文件路径所在目录）；`C:/a.md` → `C:`、`/a.md` → `/` */
function getDirectoryPath(filePath: string): string {
    const normalized = normalizeSlashes(filePath)
    const lastSlash = normalized.lastIndexOf('/')
    if (lastSlash < 0) {
        return ''
    }
    if (lastSlash === 0) {
        return '/'
    }
    return normalized.slice(0, lastSlash)
}

/**
 * 把相对片段路径解析为绝对路径（纯字符串折叠 `.` / `..`，兼容 Windows 盘符与 UNC）。
 *
 * @param baseDirectory active 文件所在目录（绝对路径）
 * @param relativePath 片段相对路径
 * @param allowOutsideRoot 为 true 时允许 `..` 越过 active 目录（默认 false）
 * @returns 绝对路径；非法路径 / 默认策略下越出根目录时返回 null
 */
function resolveSnippetPath(
    baseDirectory: string,
    relativePath: string,
    allowOutsideRoot: boolean
): string | null {
    const relative = normalizeSlashes(relativePath)
    if (isAbsoluteSnippetPath(relative)) {
        // 片段引用只接受相对路径（绝对路径视为越出根目录，除非显式放开）
        return null
    }
    const base = normalizeSlashes(baseDirectory)
    const combined = `${base.replace(/\/+$/, '')}/${relative}`
    const driveMatch = /^([A-Za-z]:)(\/.*)$/.exec(combined)
    const uncMatch = /^(\/\/[^/]+\/[^/]+)(\/.*)$/.exec(combined)
    const rootPrefix = driveMatch ? driveMatch[1] : uncMatch ? uncMatch[1] : ''
    const rest = driveMatch ? driveMatch[2] : uncMatch ? uncMatch[2] : combined
    const segments: string[] = []
    for (const segment of rest.split('/')) {
        if (segment.length === 0 || segment === '.') {
            continue
        }
        if (segment === '..') {
            if (segments.length > 0) {
                segments.pop()
            } else if (!allowOutsideRoot) {
                // 默认策略：`..` 越出 active 文件目录即拒绝（路径穿越防线）
                return null
            }
            continue
        }
        segments.push(segment)
    }
    const joined = segments.join('/')
    return rootPrefix.length > 0 ? `${rootPrefix}/${joined}` : `/${joined}`
}

/** 判断路径是否为 Windows 盘符 / UNC 形态（原实现按此形态自动启用大小写不敏感比较） */
function isWindowsStylePath(normalizedPath: string): boolean {
    return /^[A-Za-z]:/.test(normalizedPath) || normalizedPath.startsWith('//')
}

/**
 * 路径比较归一化（原语义：统一分隔符 + 去尾部 `/` + Windows 盘符/UNC 自动小写）。
 *
 * 迁移：底层复用 shared `normalizePathForCompare`（额外做 `.`/`..` 词法折叠），
 * 大小写不敏感标志由原实现自身的形态判定传入，保证同一输入得到相同比较键。
 */
function normalizePathForCompare(value: string): string {
    const normalized = normalizeSlashes(value).replace(/\/+$/, '')
    return normalizePathForCompareShared(normalized, isWindowsStylePath(normalized))
}

/** candidate 是否等于 rootDirectory 或位于其子树（词法比较） */
function isWithinDirectory(candidate: string, rootDirectory: string): boolean {
    const normalizedRoot = normalizePathForCompare(rootDirectory)
    // 保留原实现的空 root 分支（空 root 时以「candidate 是否绝对路径」判定；
    // shared isPathWithin 对空 root 只有空 child 返回 true，语义不同，故本地先行处理）
    if (normalizedRoot.length === 0) {
        return normalizePathForCompare(candidate).startsWith('/')
    }
    const rawRoot = normalizeSlashes(rootDirectory).replace(/\/+$/, '')
    return isPathWithin(candidate, rootDirectory, {
        win32CaseInsensitive: isWindowsStylePath(rawRoot)
    })
}

/** 取小写扩展名（含点，对齐白名单清单格式）；无扩展名返回空串 */
function getLowerExtension(filePath: string): string {
    const extension = getExtension(filePath)
    return extension.length > 0 ? `.${extension}` : ''
}

/** 统计 UTF-8 字节数（大小上限判定；TextEncoder 在浏览器与 Node 22 均可用） */
function countUtf8Bytes(value: string): number {
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(value).length
    }
    // 兜底（极老环境）：按 UTF-16 长度 × 2 保守估算
    return value.length * 2
}

/**
 * 按 1-based 行号区间截取文件内容。
 * 越界夹取：start 夹到 [1, 行数]，end 夹到 [1, 行数]；end < start 时返回空串；
 * `startLine === null` 表示全文；`endLine === null` 表示到文件末尾。
 */
function selectSnippetLines(
    content: string,
    startLine: number | null,
    endLine: number | null
): string {
    // 归一化换行并去掉末尾单个换行：避免把「文件结尾空行」当成最后一行，
    // 使 `:999:9999` 这类越界夹取落在最后一行实际内容上
    const normalized = content.replace(/\r\n?/g, '\n').replace(/\n$/, '')
    const lines = normalized.split('\n')
    if (startLine === null) {
        return normalized
    }
    const lineCount = lines.length
    const from = Math.min(Math.max(1, startLine), lineCount) - 1
    const to = endLine === null ? lineCount : Math.min(Math.max(1, endLine), lineCount)
    if (to <= from) {
        return ''
    }
    return lines.slice(from, to).join('\n')
}

/** 把指令行缩进应用到片段内容的每个非空行（保留片段自身的相对缩进） */
function applySnippetIndentation(content: string, indent: string): string {
    if (indent.length === 0 || content.length === 0) {
        return content
    }
    return content
        .split('\n')
        .map((line) => (line.length > 0 ? `${indent}${line}` : line))
        .join('\n')
}

/* ============================== 九、snippets 异步展开（对外纯函数） ============================== */

/** snippets 展开选项 */
export interface SnippetExpandOptions {
    /** 递归展开深度上限（默认 5；0 表示不展开任何片段） */
    maxDepth?: number
    /** 是否允许 `..` 越出 active 文件目录（默认 false：禁止路径穿越） */
    allowOutsideRoot?: boolean
    /** 单文件字节上限（默认 1 MiB） */
    maxFileBytes?: number
    /** 单次展开累计字节上限（默认 4 MiB） */
    maxTotalBytes?: number
    /** 文本扩展名白名单（默认 SNIPPET_ALLOWED_EXTENSIONS） */
    allowedExtensions?: readonly string[]
    /** 告警回调（默认 logger.warn；测试可注入 spy） */
    onWarn?: (message: string) => void
}

/** 展开过程中共享的可变上下文（总大小累计只在本函数调用内部存在，对外仍是纯函数语义） */
interface SnippetExpansionContext {
    baseDirectory: string
    readFile: (absPath: string) => Promise<string | null>
    maxDepth: number
    allowOutsideRoot: boolean
    maxFileBytes: number
    maxTotalBytes: number
    allowedExtensions: ReadonlySet<string>
    warn: (message: string) => void
    totalBytes: number
}

/** 取非负整数选项（非法值回退默认值） */
function resolveNonNegativeInteger(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : fallback
}

/** 构造展开上下文（选项归一化） */
function createSnippetExpansionContext(
    options: SnippetExpandOptions,
    activeDirectory: string,
    readFile: (absPath: string) => Promise<string | null>
): SnippetExpansionContext {
    const extensions =
        Array.isArray(options.allowedExtensions) && options.allowedExtensions.length > 0
            ? options.allowedExtensions
            : SNIPPET_ALLOWED_EXTENSIONS
    return {
        baseDirectory: activeDirectory,
        readFile,
        maxDepth: resolveNonNegativeInteger(options.maxDepth, SNIPPET_DEFAULT_MAX_DEPTH),
        allowOutsideRoot: options.allowOutsideRoot === true,
        maxFileBytes: resolveNonNegativeInteger(
            options.maxFileBytes,
            SNIPPET_DEFAULT_MAX_FILE_BYTES
        ),
        maxTotalBytes: resolveNonNegativeInteger(
            options.maxTotalBytes,
            SNIPPET_DEFAULT_MAX_TOTAL_BYTES
        ),
        allowedExtensions: new Set(extensions.map((extension) => extension.toLowerCase())),
        warn: typeof options.onWarn === 'function' ? options.onWarn : defaultSnippetWarning,
        totalBytes: 0
    }
}

/** 默认告警输出（logger.warn 便于用户/开发者定位失败原因；任务约定的失败不抛异常） */
function defaultSnippetWarning(message: string): void {
    logger.warn(`[mdx-snippets] ${message}`)
}

/** 全局指令行匹配（多行、逐行；`^`/`$` 按行锚定，match[0] 不含行尾换行符） */
const SNIPPET_LINE_PATTERN_GLOBAL = /^([ \t]*)--8<--[ \t]+(.+?)[ \t]*$/gm

/**
 * 展开单个片段引用。
 * @returns 替换文本；失败（越界/非文本/读失败/超限/循环）返回 null，调用方保留原指令行
 */
async function expandOneSnippet(
    target: SnippetIncludeTarget,
    indent: string,
    context: SnippetExpansionContext,
    depth: number,
    includeChain: readonly string[]
): Promise<string | null> {
    if (depth >= context.maxDepth) {
        context.warn(`片段递归深度超过上限（${context.maxDepth} 层），保留原文：${target.path}`)
        return null
    }
    const resolved = resolveSnippetPath(
        context.baseDirectory,
        target.path,
        context.allowOutsideRoot
    )
    if (resolved === null) {
        context.warn(`片段路径非法或越出当前文件目录，保留原文：${target.path}`)
        return null
    }
    if (!context.allowOutsideRoot && !isWithinDirectory(resolved, context.baseDirectory)) {
        context.warn(`片段路径越出当前文件目录（禁止路径穿越），保留原文：${target.path}`)
        return null
    }
    if (!context.allowedExtensions.has(getLowerExtension(resolved))) {
        context.warn(`片段文件扩展名不在文本白名单内，保留原文：${target.path}`)
        return null
    }
    const normalizedResolved = normalizePathForCompare(resolved)
    if (includeChain.some((included) => normalizePathForCompare(included) === normalizedResolved)) {
        context.warn(`片段包含存在循环引用，保留原文：${target.path}`)
        return null
    }
    let content: string | null
    try {
        content = await context.readFile(resolved)
    } catch {
        content = null
    }
    if (typeof content !== 'string') {
        context.warn(`片段文件读取失败或不存在，保留原文：${target.path}`)
        return null
    }
    const bytes = countUtf8Bytes(content)
    if (bytes > context.maxFileBytes) {
        context.warn(`片段文件超过单文件大小上限（${context.maxFileBytes} 字节）：${target.path}`)
        return null
    }
    if (context.totalBytes + bytes > context.maxTotalBytes) {
        context.warn(`片段展开总大小超过上限（${context.maxTotalBytes} 字节）：${target.path}`)
        return null
    }
    context.totalBytes += bytes
    const selected = selectSnippetLines(content, target.startLine, target.endLine)
    // 嵌套片段同样以 active 文件目录为根（与 pymdownx 的 base_path 语义一致）
    const expanded = await expandSnippetMarkdown(selected, context, depth + 1, [
        ...includeChain,
        resolved
    ])
    // 去掉末尾换行：指令行自身的行尾换行保留在原文拼接结果中，避免插入多余空行
    const trimmed = expanded.replace(/\r\n?/g, '\n').replace(/\n$/, '')
    return applySnippetIndentation(trimmed, indent)
}

/**
 * 逐行展开 markdown 中的 snippets 指令（保留指令行之外的原文逐字符不变）。
 * @param depth 当前展开层级（顶层 0）；includeChain 为当前递归链上的绝对路径（防循环）
 */
async function expandSnippetMarkdown(
    markdown: string,
    context: SnippetExpansionContext,
    depth: number,
    includeChain: readonly string[]
): Promise<string> {
    const matches = Array.from(markdown.matchAll(SNIPPET_LINE_PATTERN_GLOBAL))
    if (matches.length === 0) {
        return markdown
    }
    let result = ''
    let cursor = 0
    for (const match of matches) {
        const matchStart = match.index ?? 0
        result += markdown.slice(cursor, matchStart)
        cursor = matchStart + match[0].length
        const target = parseSnippetTarget(match[2] ?? '')
        if (!target) {
            // 非法指令（如未闭合引号/一行多个 include）：按原文保留并告警
            result += match[0]
            context.warn(`无法解析的片段指令，保留原文：${match[0].trim()}`)
            continue
        }
        const replacement = await expandOneSnippet(
            target,
            match[1] ?? '',
            context,
            depth,
            includeChain
        )
        result += replacement ?? match[0]
    }
    result += markdown.slice(cursor)
    return result
}

/**
 * 展开 Markdown 中的 `--8<-- "path"` 文件片段包含（异步纯函数）。
 *
 * 设计约束（批次 C 任务）：
 * 1. 异步读文件不在 markdown-it 同步 render 内完成，由预览组件在 `md.render` 之前调用；
 *    readFile 注入点由调用方提供（渲染层可注入主进程 `IPC.FILE.READ_HTML` 调用，见
 *    `preview-md-blocks-report` 的 IPC 调查报告；测试注入内存桩即可）；
 * 2. 相对路径基于 activeFilePath 所在目录解析；activeFilePath 为空 / 非绝对路径时
 *    不展开、原样返回（保证无活动文件场景零开销且不误伤普通文本）；
 * 3. 行号区间 `path.md:10:20`（1-based、含端点、越界夹取）；`path.md:10` 表示到末尾；
 * 4. 递归展开深度上限（默认 5 层）防循环：超限的行保留原文并 logger.warn；
 * 5. 仅允许文本扩展名；默认禁止 `..` 越出 active 目录（allowOutsideRoot 显式放开）；
 *    单文件（默认 1 MiB）与总展开量（默认 4 MiB）限流；
 * 6. 展开内容按指令行缩进逐行缩进（可直接放进 `!!!` / `/// tab` 的缩进内容中）。
 *
 * @param markdown 编辑器原始 Markdown 文本
 * @param activeFilePath 当前活动文件绝对路径（null / 相对路径时不展开）
 * @param readFile 文本读取注入点：绝对路径 → 内容（返回 null 表示读取失败/不存在）
 * @param options 展开选项（深度/大小/扩展名/越界策略/告警回调）
 * @returns 展开后的 Markdown（任何单个片段失败都保留原指令行，不抛异常）
 */
export async function expandSnippetIncludes(
    markdown: string,
    activeFilePath: string | null,
    readFile: (absPath: string) => Promise<string | null>,
    options: SnippetExpandOptions = {}
): Promise<string> {
    if (typeof markdown !== 'string' || markdown.length === 0) {
        return markdown
    }
    if (typeof readFile !== 'function') {
        return markdown
    }
    if (typeof activeFilePath !== 'string' || activeFilePath.trim().length === 0) {
        return markdown
    }
    if (!isAbsoluteSnippetPath(activeFilePath)) {
        return markdown
    }
    const baseDirectory = getDirectoryPath(activeFilePath.trim())
    if (baseDirectory.length === 0) {
        return markdown
    }
    const context = createSnippetExpansionContext(options, baseDirectory, readFile)
    return expandSnippetMarkdown(markdown, context, 0, [])
}

/* ============================== 十、snippets 同步占位渲染 ============================== */

/**
 * 未展开的 snippets 指令占位 block rule：
 * 片段展开发生在 `md.render` 之前，因此渲染阶段遇到的 `--8<--` 行都是未展开指令
 * （无活动文件 / 读取失败 / 直接调用 md.render）。这里把它们渲染为一个带 class 的
 * 段落（可见文本与原文一致、已 HTML 转义），保证「按普通文本显示且不报错」。
 */
function snippetPlaceholderBlockRule(
    state: StateBlock,
    startLine: number,
    _endLine: number,
    silent: boolean
): boolean {
    if (!canStartBlock(state, startLine)) {
        return false
    }
    const lineText = getLineText(state, startLine).replace(/\r$/, '')
    const include = parseSnippetIncludeLine(lineText)
    if (!include) {
        return false
    }
    if (silent) {
        return true
    }
    const token = state.push(MDX_SNIPPET_PLACEHOLDER, 'p', 0)
    token.block = true
    token.map = [startLine, startLine + 1]
    token.content = include.rawText
    token.meta = {
        path: include.target.path,
        startLine: include.target.startLine,
        endLine: include.target.endLine
    }
    state.line = startLine + 1
    return true
}

/* ============================== 十一、渲染规则 ============================== */

function registerRenderers(md: MarkdownItInstance): void {
    const escapeHtml = (value: string): string => md.utils.escapeHtml(value)

    md.renderer.rules[MDX_DETAILS_OPEN] = (tokens, idx) => {
        const meta = tokens[idx].meta ?? {}
        const rawType = typeof meta.type === 'string' ? meta.type : BLOCK_TYPE_DETAILS
        const type = rawType.length > 0 ? rawType.toLowerCase() : BLOCK_TYPE_DETAILS
        const rawTitle = typeof meta.title === 'string' ? meta.title : ''
        const title = rawTitle.length > 0 ? rawTitle : type
        return (
            `<details class="admonition ${escapeHtml(type)}">` +
            `<summary>${escapeHtml(title)}</summary>`
        )
    }
    md.renderer.rules[MDX_DETAILS_CLOSE] = () => '</details>\n'

    md.renderer.rules[MDX_SNIPPET_PLACEHOLDER] = (tokens, idx) => {
        const token = tokens[idx]
        const meta = token.meta ?? {}
        const targetPath = typeof meta.path === 'string' ? meta.path : ''
        const rawText = typeof token.content === 'string' ? token.content : ''
        const targetAttr =
            targetPath.length > 0 ? ` data-snippet-target="${escapeHtml(targetPath)}"` : ''
        return `<p class="mdx-snippet-placeholder"${targetAttr}>${escapeHtml(rawText)}</p>\n`
    }
}

/* ============================== 十二、插件入口 ============================== */

/**
 * 安装批次 C 扩展（pymdownx `///` 块 / snippets 占位渲染 / tab 深链工具）。
 *
 * 使用方式：`md.use(installMdxBlocksExtensions)`，必须装配在 `mkdocsMaterialPlugin`
 * 之后（复用其 admonition/tab token 渲染规则；`createPreviewMarkdownIt()` 已保证顺序）。
 *
 * 注：snippets 的文件读取是异步的，不在本插件内完成；本插件只负责
 * 「未展开指令的同步占位渲染」，异步展开由调用方在 `md.render` 前调用
 * `expandSnippetIncludes` 完成。
 */
export function installMdxBlocksExtensions(md: MarkdownItInstance): void {
    // 每次解析开始时复位本模块的计数器（同一次 md.render 内自增，跨 render 互不影响）
    md.core.ruler.before('normalize', 'mdx_blocks_env_reset', (state) => {
        if (!state.env) {
            return
        }
        state.env[ENV_TABBED_SET_ID] = 0
        state.env[ENV_BLOCK_DEPTH] = 0
    })

    // alt: [] —— 与 material 插件一致：自定义块不打断已有段落（指令前需单独成块），
    // 代码围栏等其他既有 block rule 仍优先匹配。
    md.block.ruler.before('paragraph', 'mdx_pymdownx_blocks', pymdownxBlockRule, { alt: [] })
    md.block.ruler.before('paragraph', 'mdx_snippet_placeholder', snippetPlaceholderBlockRule, {
        alt: []
    })

    registerRenderers(md)
}
