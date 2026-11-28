/**
 * 1.5.7 LLM Wiki L3：AI ingest 提示词与草案归一化
 *
 * ## 提示词设计（计划 §5.2：提取 front matter/标签/摘要 → 生成 wiki/ 页面）
 * - system：限定角色（LLM Wiki 编译助手）与输出格式（仅输出一页 Markdown，含 YAML
 *   front matter；不输出解释/代码围栏），强调「只能基于原始资料、不得编造」；
 * - user：原始资料路径 + 可选标题/标签 + 正文（超长截断并明确标注）+ 目标路径；
 * - 所有提示词文案为中文常量（模型输入，不是界面 i18n 词条）。
 *
 * ## 草案归一化（模型输出不可完全信任）
 * - 去掉模型可能包裹的 ```markdown / ``` 围栏；
 * - 缺少 front matter 时按原始资料信息补齐（title/tags/source/status/created/updated）；
 * - 保证结尾换行、去掉多余首尾空行；
 * - **不写入磁盘**：本模块只做纯字符串处理（便于单测）。
 */
import type { AiChatMessage } from '../../shared/types/ai'
import { AI_INGEST_PROMPT_MAX_CHARS, AI_WIKI_DIR_NAME } from '../../shared/constants/ai'

/** ingest 提示词输入 */
export interface IngestPromptInput {
    /** 原始资料工作区相对路径（如 `raw/2026-11-28-来源.md`） */
    sourceRelativePath: string
    /** 原始资料正文（调用方已按大小上限截断） */
    rawContent: string
    /** 原始资料是否因大小上限被截断（提示模型不要臆测缺失部分） */
    rawTruncated: boolean
    /** 原始资料 front matter 中的标题（可选） */
    rawTitle?: string
    /** 原始资料 front matter 中的标签（可选） */
    rawTags?: string[]
    /** 计划写入的 wiki 页面相对路径（提示模型 source 字段应指向 raw/） */
    draftRelativePath: string
    /** 当天日期（YYYY-MM-DD；由调用方注入便于单测固定时间） */
    today: string
}

/** system 提示词（模型输入，保持中文；不参与界面 i18n） */
export const AI_INGEST_SYSTEM_PROMPT = [
    '你是一个严谨的「LLM Wiki 编译助手」，负责把原始资料（raw/）归纳为一页可读的结构化知识笔记。',
    '',
    '输出要求（必须严格遵守）：',
    '1. 只输出这一页 Markdown 笔记本身，不要输出任何解释、前言、结语或代码围栏；',
    '2. 笔记必须以 YAML front matter 开头，包含字段：title、tags（数组）、source（数组，指向 raw/ 下的原始资料）、status（固定 draft）、created、updated；',
    '3. front matter 之后是一个 H1 标题与结构化正文：摘要（1 段）、要点（有序/无序列表）、可选的「延伸阅读/相关问题」；',
    '4. 只能使用原始资料中出现的事实与结论；原始资料未覆盖的内容不要编造，必要时用「（原始资料未提及）」标注；',
    '5. 用中文撰写；专业术语可保留原文；',
    '6. 正文中引用原始资料时使用相对 Markdown 链接，例如 [来源](../raw/xxx.md)。'
].join('\n')

/** 把原始资料正文截断到提示词字符上限（保持首尾完整，尾部标注截断） */
export function clampPromptRawContent(rawContent: string): { content: string; truncated: boolean } {
    if (rawContent.length <= AI_INGEST_PROMPT_MAX_CHARS) {
        return { content: rawContent, truncated: false }
    }
    const marker = '\n\n…（原始资料过长，以上内容已截断；缺失部分请勿臆测）'
    const budget = Math.max(0, AI_INGEST_PROMPT_MAX_CHARS - marker.length)
    return { content: `${rawContent.slice(0, budget)}${marker}`, truncated: true }
}

/** 拼接 user 提示词（原始资料元信息 + 正文 + 目标路径） */
export function buildIngestUserPrompt(input: IngestPromptInput): string {
    const { content } = clampPromptRawContent(input.rawContent)
    const metaLines = [
        `原始资料路径（工作区相对）：${input.sourceRelativePath}`,
        `原始资料标题：${input.rawTitle ?? '（未提供）'}`,
        `原始资料标签：${input.rawTags && input.rawTags.length > 0 ? input.rawTags.join('、') : '（未提供）'}`,
        `计划写入的 wiki 页面路径：${input.draftRelativePath}`,
        `生成日期：${input.today}`,
        input.rawTruncated ? '注意：原始资料因过长已截断。' : ''
    ].filter((line) => line.length > 0)
    return [
        '请把下面这份原始资料编译为一页 LLM Wiki 笔记。',
        '',
        '【元信息】',
        ...metaLines,
        '',
        '【原始资料正文】',
        content
    ].join('\n')
}

/** 构造完整对话消息（system + user） */
export function buildIngestMessages(input: IngestPromptInput): AiChatMessage[] {
    return [
        { role: 'system', content: AI_INGEST_SYSTEM_PROMPT },
        { role: 'user', content: buildIngestUserPrompt(input) }
    ]
}

/** 去掉模型整体包裹的 markdown 代码围栏（``` / ```markdown） */
export function stripWrappingCodeFence(text: string): string {
    let result = text.trim()
    if (!result.startsWith('```')) {
        return result
    }
    const firstLineEnd = result.indexOf('\n')
    if (firstLineEnd < 0) {
        return result
    }
    const firstLine = result.slice(0, firstLineEnd).trim().toLowerCase()
    if (!/^```(?:markdown|md)?$/.test(firstLine)) {
        return result
    }
    result = result.slice(firstLineEnd + 1)
    const closingIndex = result.lastIndexOf('```')
    if (closingIndex >= 0) {
        result = result.slice(0, closingIndex)
    }
    return result.trim()
}

/** 是否为 Markdown 文件（apply 目标扩展名白名单） */
export function isMarkdownExtension(fileName: string): boolean {
    const lower = fileName.toLowerCase()
    return lower.endsWith('.md') || lower.endsWith('.markdown')
}

/** 生成 front matter 文本（与 L1 schema.md 模板中的示例字段一致） */
function buildFrontMatterBlock(params: {
    title: string
    tags: string[]
    sourceRelativePath: string
    today: string
}): string {
    const tagLines = params.tags.length > 0 ? params.tags.map((tag) => `  - ${tag}`) : []
    return [
        '---',
        `title: ${params.title}`,
        tagLines.length > 0 ? 'tags:' : 'tags: []',
        ...tagLines,
        'source:',
        `  - ${params.sourceRelativePath}`,
        'status: draft',
        `created: ${params.today}`,
        `updated: ${params.today}`,
        '---'
    ].join('\n')
}

/** 从 Markdown 正文中提取首个 H1 标题（去掉行内标记；无则返回空串） */
export function extractFirstHeading(text: string): string {
    for (const line of text.split(/\r?\n/)) {
        const match = /^ {0,3}#\s+(.+?)\s*#*\s*$/.exec(line)
        if (match) {
            return match[1].replace(/[*_`]/g, '').trim()
        }
    }
    return ''
}

/** 从工作区相对路径推导页面标题（去掉扩展名与目录，斜杠/下划线转空格） */
export function titleFromRelativePath(relativePath: string): string {
    const base = relativePath.split('/').pop() ?? relativePath
    const withoutExtension = base.replace(/\.(?:md|markdown|txt)$/i, '')
    const spaced = withoutExtension.replace(/[-_]+/g, ' ').trim()
    return spaced.length > 0 ? spaced : withoutExtension
}

/**
 * 归一化模型输出为可审批的 wiki 草案内容。
 *
 * - 去围栏 / 去首尾空白；
 * - 缺少 front matter 时补齐（title 取首个 H1，其次取原始资料文件名；source 指向 raw/）；
 * - 保证以单个换行结尾。
 */
export function normalizeDraftContent(params: {
    modelOutput: string
    sourceRelativePath: string
    rawTitle?: string
    rawTags?: string[]
    today: string
}): string {
    const stripped = stripWrappingCodeFence(params.modelOutput)
    // 去掉文首多余空行
    const content = stripped.replace(/^\s*\n/, '').trimEnd()
    const hasFrontMatter = content.startsWith('---\n') || content.startsWith('---\r\n')
    if (!hasFrontMatter) {
        const fallbackTitle =
            (params.rawTitle && params.rawTitle.trim().length > 0
                ? params.rawTitle.trim()
                : extractFirstHeading(content)) || titleFromRelativePath(params.sourceRelativePath)
        const frontMatter = buildFrontMatterBlock({
            title: fallbackTitle,
            tags: params.rawTags ?? [],
            sourceRelativePath: params.sourceRelativePath,
            today: params.today
        })
        const body = content.length > 0 ? `\n\n${content}` : `\n\n# ${fallbackTitle}`
        return `${frontMatter}${body}\n`
    }
    return `${content}\n`
}

/** 生成默认 wiki 页面相对路径（`wiki/<slug>.md`；slug 由原始资料文件名清洗而来） */
export function buildDefaultDraftRelativePath(sourceRelativePath: string): string {
    const base = sourceRelativePath.split('/').pop() ?? sourceRelativePath
    const withoutExtension = base.replace(/\.(?:md|markdown|txt)$/i, '')
    const slug = withoutExtension
        .replace(/[\s\u3000]+/g, '-')
        // 仅保留中英文/数字/连字符/下划线，其余替换为连字符（避免 Windows 非法文件名）
        .replace(/[^A-Za-z0-9\u4e00-\u9fff_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80)
    const safeSlug = slug.length > 0 ? slug : 'untitled'
    return `${AI_WIKI_DIR_NAME}/${safeSlug}.md`
}
