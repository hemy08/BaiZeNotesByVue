/**
 * preview-block-utils.ts 等价性单测（第 3 批组件化子任务 D）
 *
 * 背景：4 个 markdown-it 预览插件（preview-md-basic / preview-md-blocks /
 * preview-md-media / preview-mkdocs-material）各自复制了行级解析 helper，
 * 本测试在迁移为公共 helper 后锁定「同输入 → 同输出」：
 * 1. 测试内保留迁移前各插件实现的逐字副本（`ref*`），与公共版对真实 StateBlock
 *    逐项断言相等（含嵌套 blkIndent 状态）；
 * 2. 三种去缩进口径（`getIndentedBlockContent` / `getFenceBlockContent` /
 *    `getContainerBlockContent`）分别与其旧实现对照，并用具体输入锁定差异；
 * 3. `isNestingTooDeep` 旧签名差异（传 env vs 只传 state）与 env 键隔离；
 * 4. `parseNestedContent` 旧形参/env 键差异：token 流与 token.map 回填、嵌套深度
 *    自增与 finally 还原、空内容 no-op；
 * 5. `remapTokenLineMaps` 旧形参差异（Token[] vs StateBlock）。
 */
import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import type { Env, StateBlock, Token } from 'markdown-it'
import {
    CONTENT_INDENT,
    DEFAULT_MAX_NESTING,
    canStartBlock,
    collectIndentedBlockEnd,
    ensureEnv,
    getContainerBlockContent,
    getDedentedContent,
    getEnvNumber,
    getFenceBlockContent,
    getIndentedBlockContent,
    getLineText,
    getNestingDepth,
    getRawLineText,
    isNestingTooDeep,
    parseNestedContent,
    remapTokenLineMaps
} from '../../src/renderer/src/components/Markdown/preview-block-utils'
import { installMdxBasicExtensions } from '../../src/renderer/src/components/Markdown/preview-md-basic'
import { installMdxBlocksExtensions } from '../../src/renderer/src/components/Markdown/preview-md-blocks'
import { installMdxMediaExtensions } from '../../src/renderer/src/components/Markdown/preview-md-media'
import { mkdocsMaterialPlugin } from '../../src/renderer/src/components/Markdown/preview-mkdocs-material'

/** markdown-it 实例类型（`MarkdownIt` 默认导出是构造器值，实例类型用 InstanceType 表达） */
type MarkdownItInstance = InstanceType<typeof MarkdownIt>

/* ==========================================================================
 * 一、迁移前旧实现的逐字参照（仅供等价性对照，禁止改语义）
 * ========================================================================== */

/** 各插件迁移前使用的嵌套深度 env 键（与插件内 ENV_* 常量逐字一致） */
const REF_BASIC_DEPTH_KEY = '__mdxBasicNestingDepth'
const REF_BLOCKS_DEPTH_KEY = '__mdxBlocksNestingDepth'
const REF_MEDIA_DEPTH_KEY = '__mdxMediaNestingDepth'
const REF_MKDOCS_DEPTH_KEY = '__mkdocsMaterialNestingDepth'

/** 旧实现 1/3：basic / blocks / mkdocs 的 getLineText（逐字相同） */
function refGetLineText(state: StateBlock, line: number): string {
    return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line])
}

/** 旧实现：media 的 rawLine 读取（原先内联在 findGridCloseLine / gridCardsBlockRule 中） */
function refGetRawLineText(state: StateBlock, line: number): string {
    return state.src.slice(state.bMarks[line], state.eMarks[line])
}

/** 旧实现 1/3：basic / blocks / mkdocs 的 canStartBlock（逐字相同） */
function refCanStartBlock(state: StateBlock, line: number): boolean {
    return state.sCount[line] - state.blkIndent < 4
}

/** 旧实现 1/2：basic / mkdocs 的 collectIndentedBlockEnd（逐字相同） */
function refCollectIndentedBlockEnd(state: StateBlock, startLine: number, endLine: number): number {
    let line = startLine + 1
    while (line < endLine) {
        if (state.isEmpty(line)) {
            line += 1
            continue
        }
        if (state.sCount[line] - state.blkIndent >= 4) {
            line += 1
            continue
        }
        break
    }
    return line
}

/** 旧实现（缩进口径 A）：basic / mkdocs 的 getDedentedContent（blkIndent + 4） */
function refDedentByBlockIndentPlus4(
    state: StateBlock,
    beginLine: number,
    endLine: number
): string {
    if (endLine <= beginLine) {
        return ''
    }
    return state.getLines(beginLine, endLine, state.blkIndent + 4, false)
}

/** 旧实现（缩进口径 B）：blocks 的 getDedentedContent（只裁 blkIndent） */
function refDedentByBlockIndent(state: StateBlock, beginLine: number, endLine: number): string {
    if (endLine <= beginLine) {
        return ''
    }
    return state.getLines(beginLine, endLine, state.blkIndent, false)
}

/** 旧实现（缩进口径 C）：media 的 getDedentedContent（按容器开标签行缩进列） */
function refDedentByContainerLine(state: StateBlock, beginLine: number, endLine: number): string {
    if (endLine <= beginLine) {
        return ''
    }
    const indent = state.sCount[beginLine - 1] ?? state.blkIndent
    return state.getLines(beginLine, endLine, indent, false)
}

/** 旧实现：basic 的 isNestingTooDeep(state, env)（blocks / mkdocs 同形，键不同） */
function refIsNestingTooDeepWithEnv(state: StateBlock, env: Env, depthKey: string): boolean {
    const depth = typeof env[depthKey] === 'number' ? env[depthKey] : 0
    const maxNesting = state.md.options.maxNesting ?? 100
    return depth >= maxNesting
}

/** 旧实现：media 的 getNestingDepth(state)（只读 state.env） */
function refMediaNestingDepth(state: StateBlock): number {
    const depth = state.env?.[REF_MEDIA_DEPTH_KEY]
    return typeof depth === 'number' ? depth : 0
}

/** 旧实现：media 的 isNestingTooDeep(state)（只传 state） */
function refMediaIsNestingTooDeep(state: StateBlock): boolean {
    const maxNesting = state.md.options.maxNesting ?? 100
    return refMediaNestingDepth(state) >= maxNesting
}

/** 旧实现：basic 的 remapTokenLineMaps(tokens, startIndex, sourceStartLine) */
function refRemapTokenLineMaps(tokens: Token[], startIndex: number, sourceStartLine: number): void {
    for (let index = startIndex; index < tokens.length; index += 1) {
        const map = tokens[index].map
        if (map) {
            map[0] += sourceStartLine
            map[1] += sourceStartLine
        }
    }
}

/** 旧实现：basic 的 parseNestedBlockContent(state, content, sourceStartLine, env) */
function refBasicParseNestedBlockContent(
    state: StateBlock,
    content: string,
    sourceStartLine: number,
    env: Env
): void {
    if (content.length === 0) {
        return
    }
    const tokenStart = state.tokens.length
    const depth = typeof env[REF_BASIC_DEPTH_KEY] === 'number' ? env[REF_BASIC_DEPTH_KEY] : 0
    env[REF_BASIC_DEPTH_KEY] = depth + 1
    try {
        state.md.block.parse(content, state.md, state.env, state.tokens)
    } finally {
        env[REF_BASIC_DEPTH_KEY] = depth
    }
    refRemapTokenLineMaps(state.tokens, tokenStart, sourceStartLine)
}

/** 旧实现：blocks / mkdocs 的 parseNestedContent(state, content, sourceStartLine, env) */
function refParseNestedContentWithEnv(
    state: StateBlock,
    content: string,
    sourceStartLine: number,
    env: Env,
    depthKey: string
): void {
    if (content.length === 0) {
        return
    }
    const tokenStart = state.tokens.length
    const depth = typeof env[depthKey] === 'number' ? env[depthKey] : 0
    env[depthKey] = depth + 1
    try {
        state.md.block.parse(content, state.md, state.env, state.tokens)
    } finally {
        env[depthKey] = depth
    }
    refRemapTokenLineMaps(state.tokens, tokenStart, sourceStartLine)
}

/** 旧实现：media 的 parseNestedContent(state, content, sourceStartLine)（内部取 env 与键） */
function refMediaParseNestedContent(
    state: StateBlock,
    content: string,
    sourceStartLine: number
): void {
    if (content.length === 0) {
        return
    }
    const env = state.env
    const tokenStart = state.tokens.length
    const depth = refMediaNestingDepth(state)
    env[REF_MEDIA_DEPTH_KEY] = depth + 1
    try {
        state.md.block.parse(content, state.md, state.env, state.tokens)
    } finally {
        env[REF_MEDIA_DEPTH_KEY] = depth
    }
    refRemapTokenLineMaps(state.tokens, tokenStart, sourceStartLine)
}

/* ==========================================================================
 * 二、真实 StateBlock 捕获（读写分离：比较结果在解析过程中计算并保存）
 * ========================================================================== */

/** 对照记录：公共版输出 vs 旧实现输出 */
interface Comparison {
    label: string
    shared: unknown
    reference: unknown
}

/** 语义断言记录：公共版输出 vs 具体预期值（锁定缩进口径差异） */
interface SemanticCheck {
    label: string
    actual: unknown
    expected: unknown
}

/** 捕获结果 */
interface CapturedRun {
    comparisons: Comparison[]
    semantic: SemanticCheck[]
    nestedCaptured: boolean
}

/** 测试样例文档：含四级缩进内容、嵌套列表（触发 blkIndent > 0 的 tokenize）、围栏等 */
const SAMPLE_MARKDOWN = [
    '# 标题',
    '',
    '??? note "折叠提示"',
    '    第一行内容',
    '',
    '    第二行内容',
    '',
    '普通段落 **加粗**',
    '',
    '> 引用段落',
    '> 第二行',
    '',
    '1. 有序项',
    '   续行文本',
    '2. 第二项',
    '',
    '```js',
    'const value = 1',
    '```',
    ''
].join('\n')

/**
 * 用只含捕获规则的 markdown-it 解析样例文档：
 * - 顶层首个 block 状态（blkIndent = 0）与列表项内的嵌套状态（blkIndent > 0）各捕获一次；
 * - 所有 helper 对比都在规则回调内即时计算（此时 state 的行索引数组有效），
 *   避免解析结束后 markdown-it 还原/复用的干扰。
 */
function captureRealState(): CapturedRun {
    const md = new MarkdownIt({ html: true })
    const run: CapturedRun = { comparisons: [], semantic: [], nestedCaptured: false }
    let topCaptured = false

    md.block.ruler.before(
        'paragraph',
        'capture_preview_block_helpers',
        (state, startLine, endLine) => {
            const isNested = state.blkIndent > 0
            if (isNested ? run.nestedCaptured : topCaptured) {
                return false
            }
            if (isNested) {
                run.nestedCaptured = true
            } else {
                topCaptured = true
            }
            const prefix = `[blkIndent=${state.blkIndent}, line=${startLine}]`
            const rangeEnd = Math.min(startLine + 2, endLine)

            run.comparisons.push(
                {
                    label: `${prefix} getLineText`,
                    shared: getLineText(state, startLine),
                    reference: refGetLineText(state, startLine)
                },
                {
                    label: `${prefix} getRawLineText`,
                    shared: getRawLineText(state, startLine),
                    reference: refGetRawLineText(state, startLine)
                },
                {
                    label: `${prefix} canStartBlock`,
                    shared: canStartBlock(state, startLine),
                    reference: refCanStartBlock(state, startLine)
                },
                {
                    label: `${prefix} collectIndentedBlockEnd`,
                    shared: collectIndentedBlockEnd(state, startLine, endLine),
                    reference: refCollectIndentedBlockEnd(state, startLine, endLine)
                },
                {
                    label: `${prefix} 口径 A getIndentedBlockContent`,
                    shared: getIndentedBlockContent(state, startLine, rangeEnd),
                    reference: refDedentByBlockIndentPlus4(state, startLine, rangeEnd)
                },
                {
                    label: `${prefix} 口径 A getIndentedBlockContent (含空区间)`,
                    shared: getIndentedBlockContent(state, startLine, startLine),
                    reference: refDedentByBlockIndentPlus4(state, startLine, startLine)
                },
                {
                    label: `${prefix} 口径 B getFenceBlockContent`,
                    shared: getFenceBlockContent(state, startLine, rangeEnd),
                    reference: refDedentByBlockIndent(state, startLine, rangeEnd)
                },
                {
                    label: `${prefix} 口径 C getContainerBlockContent`,
                    shared: getContainerBlockContent(state, startLine, rangeEnd),
                    reference: refDedentByContainerLine(state, startLine, rangeEnd)
                },
                {
                    label: `${prefix} 口径 C getContainerBlockContent (开标签行)`,
                    shared: getContainerBlockContent(state, startLine + 1, rangeEnd),
                    reference: refDedentByContainerLine(state, startLine + 1, rangeEnd)
                },
                {
                    label: `${prefix} getDedentedContent(基础函数, indent=3)`,
                    shared: getDedentedContent(state, startLine, rangeEnd, 3),
                    reference: state.getLines(startLine, rangeEnd, 3, false)
                }
            )

            // 顶层状态额外锁定具体缩进口径（防止迁移时「统一过头」把三种口径合并）；
            // 注意：捕获规则位于 heading/paragraph 之后，首个可捕获行不一定是第 0 行，
            // 但此时 state 的行索引数组对整篇文档均有效，按固定行号断言即可。
            if (!isNested) {
                run.semantic.push(
                    {
                        label: 'getLineText 去掉行首缩进',
                        actual: getLineText(state, 3),
                        expected: '第一行内容'
                    },
                    {
                        label: 'getRawLineText 保留行首缩进',
                        actual: getRawLineText(state, 3),
                        expected: '    第一行内容'
                    },
                    {
                        label: 'canStartBlock 顶格行可起始块',
                        actual: canStartBlock(state, 2),
                        expected: true
                    },
                    {
                        label: 'canStartBlock 相对缩进 ≥4 不可起始块',
                        actual: canStartBlock(state, 3),
                        expected: false
                    },
                    {
                        label: '口径 A 去缩进（blkIndent + 4）',
                        actual: getIndentedBlockContent(state, 3, 6),
                        expected: '第一行内容\n\n第二行内容'
                    },
                    {
                        label: '口径 B 只裁容器缩进',
                        actual: getFenceBlockContent(state, 3, 6),
                        expected: '    第一行内容\n\n    第二行内容'
                    },
                    {
                        label: '口径 C 按开标签行缩进列（此处为 0）',
                        actual: getContainerBlockContent(state, 3, 6),
                        expected: '    第一行内容\n\n    第二行内容'
                    },
                    {
                        label: '口径 C beginLine=0 时回退 blkIndent',
                        actual: getContainerBlockContent(state, 0, 1),
                        expected: '# 标题'
                    },
                    {
                        label: 'collectIndentedBlockEnd 在首个非缩进行结束',
                        actual: collectIndentedBlockEnd(state, 2, 19),
                        expected: 7
                    },
                    {
                        label: 'getDedentedContent 空区间返回空串',
                        actual: getDedentedContent(state, 5, 5, 4),
                        expected: ''
                    }
                )
            }
            return false
        }
    )

    md.render(SAMPLE_MARKDOWN)
    return run
}

/** 三个去缩进口径在同一输入上必须产生不同结果（锁定「不合并口径」的迁移约束） */
describe('三种去缩进口径（迁移约束：不得合并为单一实现）', () => {
    it('getIndentedBlockContent / getFenceBlockContent 对同一段内容输出不同', () => {
        const run = captureRealState()
        const indented = run.semantic.find((item) => item.label.startsWith('口径 A'))
        const fenced = run.semantic.find((item) => item.label.startsWith('口径 B'))
        expect(indented?.actual).toBe('第一行内容\n\n第二行内容')
        expect(fenced?.actual).toBe('    第一行内容\n\n    第二行内容')
        expect(indented?.actual).not.toBe(fenced?.actual)
    })

    it('getContainerBlockContent 使用开标签行缩进列（媒体插件 grid 容器口径）', () => {
        const run = captureRealState()
        const container = run.semantic.find((item) => item.label.startsWith('口径 C 按开标签行'))
        expect(container?.actual).toBe('    第一行内容\n\n    第二行内容')
    })
})

/* ==========================================================================
 * 三、真实 StateBlock 上的等价性断言（公共版 vs 旧实现逐字副本）
 * ========================================================================== */

describe('行级 helper 与旧实现（真实 StateBlock）逐项等价', () => {
    it('顶层与列表嵌套状态（blkIndent > 0）均捕获且对照全部相等', () => {
        const run = captureRealState()
        // 顶层与嵌套列表状态各捕获一次
        expect(run.nestedCaptured).toBe(true)
        expect(run.comparisons.length).toBeGreaterThanOrEqual(20)
        for (const comparison of run.comparisons) {
            expect(comparison.shared, comparison.label).toEqual(comparison.reference)
        }
    })

    it('锁定具体缩进口径的语义断言全部通过', () => {
        const run = captureRealState()
        expect(run.semantic.length).toBeGreaterThanOrEqual(10)
        for (const check of run.semantic) {
            expect(check.actual, check.label).toEqual(check.expected)
        }
    })

    it('常量与 markdown-it 缩进代码块阈值 / 默认 maxNesting 一致', () => {
        expect(CONTENT_INDENT).toBe(4)
        expect(DEFAULT_MAX_NESTING).toBe(100)
    })
})

/* ==========================================================================
 * 四、ensureEnv / getEnvNumber / getNestingDepth
 * ========================================================================== */

describe('env 读取 helper', () => {
    it('ensureEnv 仅在 env 缺失时创建，已有 env 原样返回', () => {
        // 模拟旧 basic 的 { env: Env } 形参：env 可能为 undefined（运行时实际总会传入）
        const holder: { env: Env } = { env: undefined as unknown as Env }
        const created = ensureEnv(holder)
        expect(created).toEqual({})
        expect(ensureEnv(holder)).toBe(created)
        expect(holder.env).toBe(created)

        const existing: Env = { foo: 1 }
        expect(ensureEnv({ env: existing })).toBe(existing)
    })

    it('getEnvNumber 对缺失键 / 非数值回退 fallback', () => {
        expect(getEnvNumber(undefined, 'missing', 7)).toBe(7)
        expect(getEnvNumber({}, 'missing')).toBe(0)
        expect(getEnvNumber({ count: 3 }, 'count')).toBe(3)
        expect(getEnvNumber({ count: '3' }, 'count', 9)).toBe(9)
        expect(getEnvNumber({ count: Number.NaN }, 'count', 9)).toBe(Number.NaN)
    })

    it('getNestingDepth 等价于旧 media 的 getNestingDepth', () => {
        for (const value of [undefined, 0, 1, 99, 100]) {
            const state = createGuardState(
                value === undefined ? {} : { [REF_MEDIA_DEPTH_KEY]: value }
            )
            expect(getNestingDepth(state.env, REF_MEDIA_DEPTH_KEY)).toBe(
                refMediaNestingDepth(state)
            )
        }
    })
})

/* ==========================================================================
 * 五、isNestingTooDeep：签名差异与 env 键隔离
 * ========================================================================== */

/** 构造只含 env 与 md 的最小状态（isNestingTooDeep 只依赖这两项） */
function createGuardState(env: Env, maxNesting?: number): StateBlock {
    const md = new MarkdownIt()
    if (maxNesting !== undefined) {
        md.options.maxNesting = maxNesting
    }
    return { env, md } as unknown as StateBlock
}

describe('isNestingTooDeep 与旧签名（state, env）/（state）等价', () => {
    const depthKeys = [
        REF_BASIC_DEPTH_KEY,
        REF_BLOCKS_DEPTH_KEY,
        REF_MKDOCS_DEPTH_KEY,
        REF_MEDIA_DEPTH_KEY
    ]

    it('不同 env 键、不同深度下与旧实现结果一致', () => {
        for (const depthKey of depthKeys) {
            for (const depth of [0, 1, 98, 99, 100, 101]) {
                const env: Env = { [depthKey]: depth }
                const state = createGuardState(env)
                // 旧 basic/blocks/mkdocs 签名：(state, env)
                expect(isNestingTooDeep(state, depthKey)).toBe(
                    refIsNestingTooDeepWithEnv(state, env, depthKey)
                )
                // 旧 media 签名：(state)，只读 state.env
                expect(isNestingTooDeep(state, REF_MEDIA_DEPTH_KEY)).toBe(
                    refMediaIsNestingTooDeep(state)
                )
            }
        }
    })

    it('尊重 markdown-it options.maxNesting', () => {
        const env: Env = { [REF_BASIC_DEPTH_KEY]: 2 }
        expect(isNestingTooDeep(createGuardState(env, 2), REF_BASIC_DEPTH_KEY)).toBe(true)
        expect(isNestingTooDeep(createGuardState(env, 3), REF_BASIC_DEPTH_KEY)).toBe(false)
        expect(isNestingTooDeep(createGuardState(env), REF_BASIC_DEPTH_KEY)).toBe(false)
    })

    it('各插件 env 键互相隔离（不读取其它插件的深度计数）', () => {
        const env: Env = {
            [REF_BASIC_DEPTH_KEY]: DEFAULT_MAX_NESTING,
            [REF_BLOCKS_DEPTH_KEY]: 0,
            [REF_MEDIA_DEPTH_KEY]: 0,
            [REF_MKDOCS_DEPTH_KEY]: 0
        }
        const state = createGuardState(env)
        expect(isNestingTooDeep(state, REF_BASIC_DEPTH_KEY)).toBe(true)
        expect(isNestingTooDeep(state, REF_BLOCKS_DEPTH_KEY)).toBe(false)
        expect(isNestingTooDeep(state, REF_MEDIA_DEPTH_KEY)).toBe(false)
        expect(isNestingTooDeep(state, REF_MKDOCS_DEPTH_KEY)).toBe(false)
    })
})

/* ==========================================================================
 * 六、remapTokenLineMaps：旧形参差异（Token[] vs StateBlock）
 * ========================================================================== */

/** 构造只带 map 的 token（remap 只读写 map 字段） */
function createMappedTokens(maps: Array<[number, number] | null>): Token[] {
    return maps.map((map) => ({ map: map ? [...map] : null }) as unknown as Token)
}

describe('remapTokenLineMaps 与旧形参（Token[] / StateBlock）等价', () => {
    it('按 startIndex 起平移，无 map 的 token 保持不变', () => {
        const sharedTokens = createMappedTokens([[0, 1], [2, 3], null, [4, 5]])
        const refTokens = createMappedTokens([[0, 1], [2, 3], null, [4, 5]])
        remapTokenLineMaps(sharedTokens, 1, 10)
        refRemapTokenLineMaps(refTokens, 1, 10)
        expect(sharedTokens.map((token) => token.map)).toEqual(refTokens.map((token) => token.map))
        expect(sharedTokens[0].map).toEqual([0, 1])
        expect(sharedTokens[1].map).toEqual([12, 13])
        expect(sharedTokens[2].map).toBeNull()
        expect(sharedTokens[3].map).toEqual([14, 15])
    })

    it('startIndex 越界时不修改任何 token', () => {
        const tokens = createMappedTokens([[0, 1]])
        remapTokenLineMaps(tokens, 5, 100)
        expect(tokens[0].map).toEqual([0, 1])
    })
})

/* ==========================================================================
 * 七、parseNestedContent：旧形参 / env 键差异等价
 * ========================================================================== */

/** 构造递归解析用的最小状态：parseNestedContent 只依赖 env / tokens / md */
function createNestedParseHarness(): {
    md: MarkdownItInstance
    env: Env
    state: StateBlock
} {
    const md = new MarkdownIt({ html: true })
    const env: Env = {}
    return { md, env, state: { env, tokens: [], md } as unknown as StateBlock }
}

/** 序列化 token 流（类型/标签/巢层/content/map/markup，足以发现解析与行号回填差异） */
function summarizeTokens(tokens: Token[]): unknown[] {
    return tokens.map((token) => ({
        type: token.type,
        tag: token.tag,
        nesting: token.nesting,
        level: token.level,
        content: token.content,
        markup: token.markup,
        map: token.map ? [token.map[0], token.map[1]] : null
    }))
}

const NESTED_CONTENT = '## 小标题\n\n- 列表项\n- 第二项\n\n段落 **加粗**'
const NESTED_SOURCE_START_LINE = 7

describe('parseNestedContent 与 4 份旧实现等价（env 键保持隔离）', () => {
    it('与 basic 旧实现 parseNestedBlockContent 等价', () => {
        const sharedHarness = createNestedParseHarness()
        parseNestedContent(
            sharedHarness.state,
            NESTED_CONTENT,
            NESTED_SOURCE_START_LINE,
            REF_BASIC_DEPTH_KEY
        )
        expect(summarizeTokens(sharedHarness.state.tokens)).toEqual(
            summarizeTokens(
                renderNestedWithRef((state, env) =>
                    refBasicParseNestedBlockContent(
                        state,
                        NESTED_CONTENT,
                        NESTED_SOURCE_START_LINE,
                        env
                    )
                )
            )
        )
        expect(sharedHarness.env[REF_BASIC_DEPTH_KEY]).toBe(0)
    })

    it('与 blocks 旧实现 parseNestedContent 等价', () => {
        const sharedHarness = createNestedParseHarness()
        parseNestedContent(
            sharedHarness.state,
            NESTED_CONTENT,
            NESTED_SOURCE_START_LINE,
            REF_BLOCKS_DEPTH_KEY
        )
        expect(summarizeTokens(sharedHarness.state.tokens)).toEqual(
            summarizeTokens(
                renderNestedWithRef((state, env) =>
                    refParseNestedContentWithEnv(
                        state,
                        NESTED_CONTENT,
                        NESTED_SOURCE_START_LINE,
                        env,
                        REF_BLOCKS_DEPTH_KEY
                    )
                )
            )
        )
        expect(sharedHarness.env[REF_BLOCKS_DEPTH_KEY]).toBe(0)
    })

    it('与 mkdocs-material 旧实现 parseNestedContent 等价', () => {
        const sharedHarness = createNestedParseHarness()
        parseNestedContent(
            sharedHarness.state,
            NESTED_CONTENT,
            NESTED_SOURCE_START_LINE,
            REF_MKDOCS_DEPTH_KEY
        )
        expect(summarizeTokens(sharedHarness.state.tokens)).toEqual(
            summarizeTokens(
                renderNestedWithRef((state, env) =>
                    refParseNestedContentWithEnv(
                        state,
                        NESTED_CONTENT,
                        NESTED_SOURCE_START_LINE,
                        env,
                        REF_MKDOCS_DEPTH_KEY
                    )
                )
            )
        )
        expect(sharedHarness.env[REF_MKDOCS_DEPTH_KEY]).toBe(0)
    })

    it('与 media 旧实现 parseNestedContent 等价（旧形参少 env / 键内置）', () => {
        const sharedHarness = createNestedParseHarness()
        parseNestedContent(
            sharedHarness.state,
            NESTED_CONTENT,
            NESTED_SOURCE_START_LINE,
            REF_MEDIA_DEPTH_KEY
        )
        const refHarness = createNestedParseHarness()
        refMediaParseNestedContent(refHarness.state, NESTED_CONTENT, NESTED_SOURCE_START_LINE)
        expect(summarizeTokens(sharedHarness.state.tokens)).toEqual(
            summarizeTokens(refHarness.state.tokens)
        )
        expect(sharedHarness.env[REF_MEDIA_DEPTH_KEY]).toBe(0)
        expect(refHarness.env[REF_MEDIA_DEPTH_KEY]).toBe(0)
    })

    it('token.map 已按 sourceStartLine 回填为绝对行号', () => {
        const { state } = createNestedParseHarness()
        parseNestedContent(state, NESTED_CONTENT, NESTED_SOURCE_START_LINE, REF_BASIC_DEPTH_KEY)
        const mappedTokens = state.tokens.filter((token) => token.map)
        expect(mappedTokens.length).toBeGreaterThan(0)
        for (const token of mappedTokens) {
            expect(token.map![0]).toBeGreaterThanOrEqual(NESTED_SOURCE_START_LINE)
            expect(token.map![1]).toBeGreaterThanOrEqual(token.map![0])
        }
        // 首个子解析 token 从内容第一行（相对 0）平移为 sourceStartLine
        expect(state.tokens[0].map).toEqual([
            NESTED_SOURCE_START_LINE,
            NESTED_SOURCE_START_LINE + 1
        ])
    })

    it('空内容为 no-op：不产 token、不写 env 键', () => {
        const { env, state } = createNestedParseHarness()
        parseNestedContent(state, '', 5, REF_BASIC_DEPTH_KEY)
        expect(state.tokens).toHaveLength(0)
        expect(env).not.toHaveProperty(REF_BASIC_DEPTH_KEY)
    })

    it('子解析期间嵌套深度 +1，结束后还原', () => {
        const { md, env, state } = createNestedParseHarness()
        const observed: number[] = []
        md.block.ruler.before('paragraph', 'observe_nesting', (blockState) => {
            observed.push(getNestingDepth(blockState.env, REF_BLOCKS_DEPTH_KEY))
            return false
        })
        parseNestedContent(state, '段落内容', 3, REF_BLOCKS_DEPTH_KEY)
        expect(observed.length).toBeGreaterThan(0)
        for (const depth of observed) {
            expect(depth).toBe(1)
        }
        expect(env[REF_BLOCKS_DEPTH_KEY]).toBe(0)
    })

    it('子解析抛错时 finally 仍还原嵌套深度', () => {
        const { md, env, state } = createNestedParseHarness()
        md.block.ruler.before('paragraph', 'always_throw', () => {
            throw new Error('boom')
        })
        expect(() => parseNestedContent(state, '会抛错的内容', 0, REF_BASIC_DEPTH_KEY)).toThrow(
            'boom'
        )
        expect(env[REF_BASIC_DEPTH_KEY]).toBe(0)
    })

    it('嵌套计数从当前深度继续（支持递归文档结构）', () => {
        const { env, state } = createNestedParseHarness()
        env[REF_BASIC_DEPTH_KEY] = 3
        parseNestedContent(state, '段落内容', 0, REF_BASIC_DEPTH_KEY)
        expect(env[REF_BASIC_DEPTH_KEY]).toBe(3)
    })
})

/** 用独立 harness 执行一次旧实现，返回其 token 流（与共享版在相同初始条件下对照） */
function renderNestedWithRef(runRef: (state: StateBlock, env: Env) => void): Token[] {
    const refHarness = createNestedParseHarness()
    runRef(refHarness.state, refHarness.env)
    return refHarness.state.tokens
}

/* ==========================================================================
 * 八、插件装配后各模块 env 键保持不变（不合并 env 状态）
 * ========================================================================== */

describe('插件 env 键隔离（迁移约束：不合并 env 状态）', () => {
    it('4 个插件各自保留独立嵌套深度键，渲染后均复位为 0', () => {
        const md = new MarkdownIt({ html: true })
        md.use(installMdxBasicExtensions)
        md.use(mkdocsMaterialPlugin)
        md.use(installMdxBlocksExtensions)
        md.use(installMdxMediaExtensions)

        const env: Env = {}
        const source = [
            '??? note "折叠"',
            '    折叠内容',
            '',
            '/// note',
            '围栏内容',
            '///',
            '',
            '<div class="grid cards" markdown>',
            '- 卡片',
            '</div>',
            '',
            '!!! note',
            '    提示内容',
            '',
            '=== "标签"',
            '    标签内容',
            ''
        ].join('\n')
        const html = md.render(source, env)

        // 语法都被正确识别（避免「键存在但功能没生效」的假阳性）
        expect(html).toContain('<details')
        expect(html).toContain('围栏内容')
        expect(html).toContain('grid cards')
        expect(html).toContain('admonition')
        expect(html).toContain('tabbed-set')

        expect(env[REF_BASIC_DEPTH_KEY]).toBe(0)
        expect(env[REF_BLOCKS_DEPTH_KEY]).toBe(0)
        expect(env[REF_MEDIA_DEPTH_KEY]).toBe(0)
        expect(env[REF_MKDOCS_DEPTH_KEY]).toBe(0)
    })
})
