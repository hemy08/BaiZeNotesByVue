/**
 * Material 语法插入对话框 —— markdown 生成纯函数
 * （结构优化第 5 批 5.5：从 MaterialSyntaxDialog.vue 抽出的生成器目录）。
 *
 * 约束：全部为纯函数（仅依赖入参与常量，不读全局状态、不调 t()），
 * 因此底部预览与实际插入共用同一结果，保证「所见即所插」，也便于单测直接覆盖。
 * 生成规则与 15 项 mkdocs-material / pymdownx 语法一一对应（见 buildMaterialSyntaxSnippet 分派）。
 */

import type { MaterialSyntaxFeatureId } from '../../../../../../shared/constants/material-syntax'
import type { MaterialSyntaxForm } from './form'

/** 归一化换行，避免 CRLF 文本表单把 `\r` 带进插入内容 */
function normalizeNewlines(value: string): string {
    return value.replace(/\r\n/g, '\n')
}

/** 单行化（行内语法不允许换行，把换行折叠为空格） */
function toSingleLine(value: string): string {
    return value.replace(/\r?\n/g, ' ').trim()
}

/** 按行拆分并丢弃空行（任务列表 / 卡片列表等「每行一项」输入） */
function toFilledLines(value: string): string[] {
    return normalizeNewlines(value)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
}

/** 缩进块内容（折叠提示块要求内容每行缩进 4 空格，空行不产生尾随空格） */
function indentBlock(value: string): string {
    return normalizeNewlines(value)
        .split('\n')
        .map((line) => (line.trim().length > 0 ? `    ${line}` : ''))
        .join('\n')
}

/** 生成折叠提示块（collapsible）：`??? note "标题"` + 4 空格缩进内容；默认展开用 `???+` */
function buildCollapsible(form: MaterialSyntaxForm): string {
    const title = toSingleLine(form.collapsibleTitle)
    const marker = form.collapsibleExpanded ? '???+' : '???'
    const header = `${marker} ${form.collapsibleType}${title ? ` "${title.replace(/"/g, "'")}"` : ''}`
    const content = indentBlock(form.collapsibleContent)
    return content.trim().length > 0 ? `${header}\n${content}\n` : `${header}\n`
}

/** 生成任务列表（task-list）：每行 `- [ ] 项` / `- [x] 项` */
function buildTaskList(form: MaterialSyntaxForm): string {
    const items = toFilledLines(form.taskContent)
    if (items.length === 0) {
        return ''
    }
    const marker = form.taskCompleted ? 'x' : ' '
    return items.map((item) => `- [${marker}] ${item}`).join('\n')
}

/** 生成文本高亮（highlight）：`==文本==` */
function buildHighlight(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.highlightText)
    return text.length > 0 ? `==${text}==` : ''
}

/** 插入/删除标记的包裹符号（含 critic 标记） */
const INSERT_DELETE_MARKERS: Readonly<Record<string, { open: string; close: string }>> = {
    insert: { open: '^^', close: '^^' },
    delete: { open: '~~', close: '~~' },
    'critic-insert': { open: '{++', close: '++}' },
    'critic-delete': { open: '{--', close: '--}' },
    'critic-highlight': { open: '{==', close: '==}' },
    'critic-comment': { open: '{>>', close: '<<}' }
}

/** 生成插入/删除标记（insert-delete）：普通标记与 critic 标记共 6 种模式 */
function buildInsertDelete(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.insertDeleteText)
    const marker = INSERT_DELETE_MARKERS[form.insertDeleteMode] ?? INSERT_DELETE_MARKERS.insert
    if (text.length === 0 || !marker) {
        return ''
    }
    return `${marker.open}${text}${marker.close}`
}

/** 生成上标/下标（sup-sub）：`^文本^` / `~文本~` */
function buildSupSub(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.scriptText)
    if (text.length === 0) {
        return ''
    }
    const marker = form.scriptMode === 'sub' ? '~' : '^'
    return `${marker}${text}${marker}`
}

/** 生成键盘按键（keys）：`++ctrl+alt+del++` */
function buildKeys(form: MaterialSyntaxForm): string {
    const keys = toSingleLine(form.keysText)
    return keys.length > 0 ? `++${keys}++` : ''
}

/** 生成属性列表（attr-list）：按钮 / 行内 class / 段落或图片对齐 */
function buildAttrList(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.attrText)
    if (text.length === 0) {
        return ''
    }
    if (form.attrMode === 'inline') {
        const className = toSingleLine(form.attrClass) || 'highlight'
        return `${text}{ .${className} }`
    }
    if (form.attrMode === 'align') {
        const align = form.attrAlign || 'center'
        return `${text}{ align=${align} }`
    }
    const url = toSingleLine(form.attrUrl)
    return url.length > 0 ? `[${text}](${url}){ .md-button }` : ''
}

/** 生成脚注（footnote）：引用处 `文本[^1]` + 空行 + `[^1]: 内容` */
function buildFootnote(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.footnoteText)
    if (text.length === 0) {
        return ''
    }
    const contentLines = toFilledLines(form.footnoteContent)
    if (contentLines.length === 0) {
        return `${text}[^1]\n\n[^1]:`
    }
    // 脚注正文的续行需缩进 4 空格，才能与 `[^1]:` 定义保持同一段落
    const [firstLine, ...restLines] = contentLines
    const body = [firstLine, ...restLines.map((line) => `    ${line}`)].join('\n')
    return `${text}[^1]\n\n[^1]: ${body}`
}

/** 生成定义列表（definition-list）：`术语` + 换行 + `: 定义` */
function buildDefinitionList(form: MaterialSyntaxForm): string {
    const term = toSingleLine(form.definitionTerm)
    if (term.length === 0) {
        return ''
    }
    const definition = toSingleLine(form.definitionText)
    return definition.length > 0 ? `${term}\n: ${definition}` : `${term}\n:`
}

/** 单行卡片定义：`图标名|标题|描述`（图标可空；无竖线时整行视为标题） */
interface GridCardDefinition {
    icon: string
    title: string
    description: string
}

function parseGridCard(line: string): GridCardDefinition {
    const parts = line.split('|')
    if (parts.length === 1) {
        return { icon: '', title: parts[0].trim(), description: '' }
    }
    const [icon = '', title = '', ...descriptionParts] = parts
    return {
        icon: icon.trim(),
        title: title.trim(),
        description: descriptionParts.join('|').trim()
    }
}

/** 生成网格卡片（grid-cards）：`<div class="grid cards" markdown>` + 每张卡三行结构 */
function buildGridCards(form: MaterialSyntaxForm): string {
    const cards = toFilledLines(form.cardsText).map(parseGridCard)
    if (cards.length === 0) {
        return ''
    }
    const cardBlocks = cards.map((card) => {
        const iconPrefix = card.icon.length > 0 ? `:material-${card.icon}: ` : ''
        const lines = [`-   ${iconPrefix}**${card.title}**`]
        if (card.description.length > 0) {
            lines.push('', '    ---', '', `    ${card.description}`)
        }
        return lines.join('\n')
    })
    return `<div class="grid cards" markdown>\n\n${cardBlocks.join('\n\n')}\n\n</div>`
}

/** 归一化高亮行号：接受 `2 3` / `2,3` / `2，3` 等写法，输出空格分隔的数字串 */
function normalizeHighlightedLines(value: string): string {
    return value
        .split(/[\s,，]+/)
        .map((part) => part.trim())
        .filter((part) => /^\d+$/.test(part))
        .join(' ')
}

/** 生成代码块增强（code-block）：```lang linenums="1" hl_lines="2 3" title="xxx" */
function buildCodeBlock(form: MaterialSyntaxForm): string {
    const fence = '```'
    const language = toSingleLine(form.codeLang)
    const attributes: string[] = []
    if (form.codeLinenums) {
        attributes.push('linenums="1"')
    }
    const highlightedLines = normalizeHighlightedLines(form.codeHlLines)
    if (highlightedLines.length > 0) {
        attributes.push(`hl_lines="${highlightedLines}"`)
    }
    const title = toSingleLine(form.codeTitle)
    if (title.length > 0) {
        attributes.push(`title="${title.replace(/"/g, "'")}"`)
    }
    const info = [language, ...attributes].filter((part) => part.length > 0).join(' ')
    const opening =
        info.length > 0 && language.length === 0 ? `${fence} ${info}` : `${fence}${info}`
    const code = normalizeNewlines(form.codeContent).replace(/\n+$/, '')
    return `${opening}\n${code}\n${fence}`
}

/** 生成 Material 图标（icon）：`:material-<name>:`，可选追加文本；名称为空时返回空串（预览显示提示） */
function buildIcon(form: MaterialSyntaxForm): string {
    const rawName = toSingleLine(form.iconName)
        .replace(/^:?material-/, '')
        .replace(/:$/, '')
    if (rawName.length === 0) {
        return ''
    }
    const text = toSingleLine(form.iconText)
    return `:material-${rawName}:${text.length > 0 ? ` ${text}` : ''}`
}

/** 生成 pymdownx 块语法（blocks）：`/// note` 或 `/// note | 标题`，tabbed 走 `/// tab | 标签` */
function buildBlocks(form: MaterialSyntaxForm): string {
    const content = normalizeNewlines(form.blocksContent).trim()
    const type = form.blocksType || 'note'
    if (type === 'tabbed') {
        const label = toSingleLine(form.blocksTabLabel) || 'Tab'
        return ['/// tabbed', `/// tab | ${label}`, content, '///', '///'].join('\n')
    }
    const title = toSingleLine(form.blocksTitle)
    const header = title.length > 0 ? `/// ${type} | ${title}` : `/// ${type}`
    return [header, content, '///'].join('\n')
}

/** 生成文件片段（snippet）：`--8<-- "path"` 或 `--8<-- "path:start:end"` */
function buildSnippet(form: MaterialSyntaxForm): string {
    const path = toSingleLine(form.snippetPath)
    if (path.length === 0) {
        return ''
    }
    const startLine = toSingleLine(form.snippetStart)
    const endLine = toSingleLine(form.snippetEnd)
    const target =
        startLine.length > 0 && endLine.length > 0 ? `${path}:${startLine}:${endLine}` : path
    return `--8<-- "${target}"`
}

/** 归一化 tab 深链序号（1 基正整数，非法值回退默认） */
function normalizeTabIndex(value: string, fallback: number): number {
    const parsed = Number.parseInt(toSingleLine(value), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** 生成标签页深链（tab-link）：`[文本](#__tabbed_<set>_<tab>)`（set 默认 1、tab 默认 2） */
function buildTabLink(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.tabLinkText)
    if (text.length === 0) {
        return ''
    }
    const setId = normalizeTabIndex(form.tabLinkSet, 1)
    const tabIndex = normalizeTabIndex(form.tabLinkTab, 2)
    return `[${text}](#__tabbed_${setId}_${tabIndex})`
}

/**
 * 生成指定语法项的待插入 markdown（纯函数：仅依赖入参，便于单测与预览复用）。
 *
 * @param featureId 15 个功能项 id 之一
 * @param form 当前表单状态
 * @returns 待插入的 markdown 片段；无法生成时返回空串（插入按钮不产生空内容）
 */
export function buildMaterialSyntaxSnippet(
    featureId: MaterialSyntaxFeatureId,
    form: MaterialSyntaxForm
): string {
    switch (featureId) {
        case 'collapsible':
            return buildCollapsible(form)
        case 'task-list':
            return buildTaskList(form)
        case 'highlight':
            return buildHighlight(form)
        case 'insert-delete':
            return buildInsertDelete(form)
        case 'sup-sub':
            return buildSupSub(form)
        case 'keys':
            return buildKeys(form)
        case 'attr-list':
            return buildAttrList(form)
        case 'footnote':
            return buildFootnote(form)
        case 'definition-list':
            return buildDefinitionList(form)
        case 'grid-cards':
            return buildGridCards(form)
        case 'code-block':
            return buildCodeBlock(form)
        case 'icon':
            return buildIcon(form)
        case 'blocks':
            return buildBlocks(form)
        case 'snippet':
            return buildSnippet(form)
        case 'tab-link':
            return buildTabLink(form)
        default:
            return ''
    }
}
