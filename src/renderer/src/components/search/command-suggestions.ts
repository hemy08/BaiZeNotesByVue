/**
 * A9 命令面板 —— 空态「相关命令」建议（1.5.6 P2 批次 C / REQ-11）
 *
 * 设计约束（与开发规范对齐）：
 * - **纯函数**：命令清单 + 查询 + 翻译 + 使用历史 → 建议命令（最多 5 条），不依赖 Vue/DOM；
 *   组件只在「真实过滤结果为空」时调用，建议区与真实结果由组件在视觉/语义上明确区分。
 * - **不参与真实过滤/排序**：REQ-10 的 `filterPaletteCommands` 不受本模块影响，避免
 *   「建议」与「真实结果」混淆；建议项点击/回车仍走与真实命令相同的执行链路。
 * - **匹配来源**（需求：同义/关键词映射或最近命令的近似匹配）：
 *   1) 同义词/别名扩展（中英双语，如「存」→「保存 / save / 写入」）；
 *   2) 命令显示名 / 分类 / id / 关键词的子串包含；
 *   3) 最近使用命令的近似匹配（编辑距离 1 / 字符集相同 / 子序列兜底），并以使用历史加权。
 * - **噪声控制**：总得分低于 `PALETTE_SUGGESTION_MIN_SCORE` 不返回；英文停用词不参与匹配；
 *   无任何命中的查询返回空数组（组件退化为既有「没有匹配的命令」空态）。
 * - I18N-08：命令展示名只存 i18n 键，翻译经注入的 `translate` 解析，不缓存翻译结果。
 */

import type { PaletteCommand } from './command-registry'
import { compareCommandUsage, type CommandUsageMap } from './command-palette-storage'
import { isSubsequenceMatch } from './workspace-search-utils'

/** 建议区最多展示条数（需求：最多 5 条） */
export const PALETTE_SUGGESTION_LIMIT = 5

/** 建议最低得分阈值：低于该值视为「无关」，不展示（避免误导用户回车执行） */
export const PALETTE_SUGGESTION_MIN_SCORE = 15

/**
 * 查询词同义词 / 别名表（中英双语，小写）。
 * 键为「常见输入片段」：中文无空格，按 `query.includes(key)` 命中；英文按整词命中。
 * 只补「命令名与关键词表之外」的口语化/别名输入，命令自身的 keywords 仍由注册表提供。
 */
const QUERY_SYNONYM_MAP: Readonly<Record<string, readonly string[]>> = {
    // 文件
    存: ['保存', 'save', '写入'],
    保存: ['save', '写入'],
    写入: ['保存', 'save'],
    打开: ['open'],
    文件夹: ['folder', 'workspace', '工作区', '目录'],
    工作区: ['workspace', 'folder'],
    // 编辑
    查找: ['find', 'search', '搜索'],
    搜索: ['find', 'search', '查找'],
    寻找: ['find', 'search', '查找'],
    替换: ['replace'],
    跳转: ['goto', 'jump', 'line'],
    行号: ['goto', 'line', '跳转'],
    // 视图
    大纲: ['outline', 'toc', '目录'],
    目录: ['outline', 'toc', '大纲'],
    // 插入
    表格: ['table', 'insert', '插入'],
    公式: ['math', 'latex', '数学'],
    数学: ['math', 'latex', '公式'],
    图表: ['mermaid', 'diagram', '流程图'],
    流程图: ['mermaid', 'diagram', '图表'],
    插入: ['insert'],
    // 知识库
    属性: ['frontmatter', 'front-matter', 'property', 'meta'],
    元数据: ['frontmatter', 'property', 'meta', '属性'],
    标签: ['tag'],
    链接: ['link'],
    反链: ['backlink', '反向链接'],
    附件: ['attachment'],
    // 日常记录 / 捕获
    日记: ['daily', 'diary', 'journal', 'today'],
    收件箱: ['inbox', 'capture'],
    剪藏: ['clip', 'clipboard', 'capture'],
    剪贴板: ['clip', 'clipboard'],
    识别: ['ocr', 'image', '图片'],
    图片: ['ocr', 'image', 'picture'],
    // 面板自身 / 通用动作
    命令: ['command', 'palette', '面板'],
    面板: ['palette', 'command'],
    快速: ['quick', 'open'],
    新建: ['new', 'create', 'open']
}

/** 英文停用词：不参与建议匹配（避免 `not` / `the` 等命中 `note` 之类无关命令） */
const STOP_WORDS: ReadonlySet<string> = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'can',
    'do',
    'does',
    'for',
    'from',
    'had',
    'has',
    'have',
    'in',
    'into',
    'is',
    'it',
    'no',
    'not',
    'of',
    'on',
    'or',
    'that',
    'the',
    'this',
    'to',
    'was',
    'were',
    'will',
    'with'
])

/** 匹配权重（query = 用户原词；synonym = 同义扩展词；原词权重更高） */
const SCORE = {
    exactQuery: 40,
    exactSynonym: 26,
    prefixQuery: 32,
    prefixSynonym: 20,
    containsQuery: 26,
    containsSynonym: 16,
    reverseContainsQuery: 22,
    reverseContainsSynonym: 12,
    levenshteinQuery: 20,
    levenshteinSynonym: 10,
    anagramQuery: 22,
    anagramSynonym: 12,
    subsequenceQuery: 16,
    subsequenceSynonym: 8
} as const

/**
 * 最近使用加权：只要命令有使用记录就加一个固定分（不随次数变化）。
 * 次数/时间先后由 `compareCommandUsage` 在「同分」时比较（lastUsed 新者优先、count 大者优先），
 * 从而保证权重顺序「最近使用 > 使用频率」，而不是次数高的旧命令压过刚用过的命令。
 */
const RECENT_USAGE_BONUS = 12

/** 最近使用加权：有记录即加固定分（次数/时间序由排序比较器处理） */
function usageBonus(entry: { count: number } | undefined): number {
    return entry ? RECENT_USAGE_BONUS : 0
}

/**
 * 编辑距离（仅用于建议的近似匹配）：长度差 > 1 直接判为 2（不可能是「近似」）。
 * 输入均为小写短串（命令名/关键词），实现为两行滚动 DP，复杂度 O(m*n) 可忽略。
 */
function boundedLevenshtein(left: string, right: string): number {
    if (left === right) {
        return 0
    }
    if (Math.abs(left.length - right.length) > 1) {
        return 2
    }
    let previous = Array.from({ length: right.length + 1 }, (_item, index) => index)
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = new Array<number>(right.length + 1)
        current[0] = leftIndex
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
            current[rightIndex] = Math.min(
                (previous[rightIndex] ?? 0) + 1,
                (current[rightIndex - 1] ?? 0) + 1,
                (previous[rightIndex - 1] ?? 0) + substitutionCost
            )
        }
        previous = current
    }
    return previous[right.length] ?? left.length
}

/** 字符集是否完全相同（拼写字母顺序打乱的近似，如 tabel ↔ table） */
function isSameCharSet(left: string, right: string): boolean {
    if (left.length !== right.length || left.length < 4) {
        return false
    }
    return [...left].sort().join('') === [...right].sort().join('')
}

/**
 * 单个查询词与命令所有检索片段的最高得分（0 = 未命中）。
 * @param isQueryToken true = 用户原词（高权重），false = 同义扩展词（低权重）
 */
function scoreToken(term: string, candidates: readonly string[], isQueryToken: boolean): number {
    let best = 0
    for (const candidate of candidates) {
        if (candidate.length === 0) {
            continue
        }
        let score = 0
        if (candidate === term) {
            score = isQueryToken ? SCORE.exactQuery : SCORE.exactSynonym
        } else if (candidate.startsWith(term)) {
            score = isQueryToken ? SCORE.prefixQuery : SCORE.prefixSynonym
        } else if (candidate.includes(term)) {
            score = isQueryToken ? SCORE.containsQuery : SCORE.containsSynonym
        } else if (term.includes(candidate) && candidate.length >= 2) {
            score = isQueryToken ? SCORE.reverseContainsQuery : SCORE.reverseContainsSynonym
        } else if (
            term.length >= 4 &&
            candidate.length >= 3 &&
            boundedLevenshtein(term, candidate) <= 1
        ) {
            score = isQueryToken ? SCORE.levenshteinQuery : SCORE.levenshteinSynonym
        } else if (term.length >= 4 && isSameCharSet(term, candidate)) {
            score = isQueryToken ? SCORE.anagramQuery : SCORE.anagramSynonym
        } else if (term.length >= 3 && isSubsequenceMatch(candidate, term)) {
            score = isQueryToken ? SCORE.subsequenceQuery : SCORE.subsequenceSynonym
        }
        if (score > best) {
            best = score
        }
        if (best === (isQueryToken ? SCORE.exactQuery : SCORE.exactSynonym)) {
            return best
        }
    }
    return best
}

/** 归一化查询串：全角空格→半角、去首尾空白、转小写 */
function normalizeSuggestionQuery(query: string): string {
    return query
        .replace(/\u3000/g, ' ')
        .trim()
        .toLowerCase()
}

interface ExpandedToken {
    term: string
    /** 是否来自用户原词（否则为同义扩展词） */
    fromQuery: boolean
}

/** 拆分查询词并做同义词/别名扩展（原词与扩展词去重，原词优先保留） */
function expandQueryTokens(normalizedQuery: string): ExpandedToken[] {
    const seen = new Set<string>()
    const tokens: ExpandedToken[] = []
    const push = (rawTerm: string, fromQuery: boolean): void => {
        const term = rawTerm.trim().toLowerCase()
        if (term.length === 0 || seen.has(term)) {
            return
        }
        seen.add(term)
        tokens.push({ term, fromQuery })
    }
    // 英文按空白分词；中文无空格，整串作为一个原词参与包含匹配
    for (const rawToken of normalizedQuery.split(/\s+/)) {
        if (rawToken.length > 0 && !STOP_WORDS.has(rawToken)) {
            push(rawToken, true)
        }
    }
    for (const [alias, expansions] of Object.entries(QUERY_SYNONYM_MAP)) {
        if (normalizedQuery.includes(alias)) {
            for (const expansion of expansions) {
                push(expansion, false)
            }
        }
    }
    return tokens
}

/** 命令的可检索片段（翻译后的显示名 / 分类 / id / 关键词，统一小写） */
function buildCommandTokens(command: PaletteCommand, translate: (key: string) => string): string[] {
    return [
        translate(command.labelKey),
        translate(command.categoryKey),
        command.id,
        ...command.keywords
    ]
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length > 0)
}

/** 单条建议的评分结果（含原始顺序，用于稳定排序） */
interface ScoredSuggestion {
    command: PaletteCommand
    score: number
    order: number
}

/** 建议选项（组件渲染需要翻译函数与使用历史，均为注入依赖） */
export interface PaletteSuggestionOptions {
    /** i18n 翻译函数（命令名/分类名参与匹配） */
    translate: (key: string) => string
    /** 命令使用历史（最近使用命令可获近似匹配加权；缺省视为无历史） */
    usage?: CommandUsageMap
    /** 最多返回条数（默认 `PALETTE_SUGGESTION_LIMIT` = 5） */
    limit?: number
}

/**
 * 生成空态「相关命令」建议（REQ-11）：
 * 1. 空查询 / 仅空白 → 空数组（空查询走「最近使用 + 全量分组」，不展示建议）；
 * 2. 对每条命令按「原词 + 同义扩展词」对显示名/分类/id/关键词打分，取每词最高分求和；
 * 3. 命中过弱（低于阈值）或完全无命中 → 丢弃；
 * 4. 排序：得分倒序 → 最近使用/频率（`compareCommandUsage`）→ 注册顺序；
 * 5. 最多返回 `limit` 条（默认 5），不修改入参。
 */
export function suggestPaletteCommands(
    commands: readonly PaletteCommand[],
    query: string,
    options: PaletteSuggestionOptions
): PaletteCommand[] {
    const normalizedQuery = normalizeSuggestionQuery(query)
    if (normalizedQuery.length === 0) {
        return []
    }
    const tokens = expandQueryTokens(normalizedQuery)
    if (tokens.length === 0) {
        return []
    }
    const limit = Number.isFinite(options.limit)
        ? Math.max(0, Math.trunc(options.limit as number))
        : PALETTE_SUGGESTION_LIMIT

    const scored: ScoredSuggestion[] = []
    commands.forEach((command, order) => {
        const candidates = buildCommandTokens(command, options.translate)
        let total = 0
        let matchedTokens = 0
        for (const token of tokens) {
            const tokenScore = scoreToken(token.term, candidates, token.fromQuery)
            if (tokenScore > 0) {
                matchedTokens += 1
                total += tokenScore
            }
        }
        if (matchedTokens === 0) {
            return
        }
        total += usageBonus(options.usage?.[command.id])
        if (total < PALETTE_SUGGESTION_MIN_SCORE) {
            return
        }
        scored.push({ command, score: total, order })
    })

    scored.sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score
        }
        const usageCompare = compareCommandUsage(left.command.id, right.command.id, options.usage)
        if (usageCompare !== 0) {
            return usageCompare
        }
        return left.order - right.order
    })
    return scored.slice(0, limit).map((item) => item.command)
}
