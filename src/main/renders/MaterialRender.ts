/**
 * MaterialRender.ts
 * Material Design 风格的 Markdown 渲染器
 * 主要功能：
 * 1. 支持 Admonitions（提示块）：!!! note/warning/tip/info 等语法
 * 2. 支持代码块语法高亮
 * 3. 支持 Tabbed Set（标签页）语法
 */

import MarkdownIt from 'markdown-it'
import highlightjs from 'markdown-it-highlightjs'
import hljs from 'highlight.js'

// 注册 PlantUML 语言支持（用于代码块高亮）
hljs.registerLanguage('plantuml', function (hljs) {
    return {
        name: 'PlantUML',
        keywords: {
            keyword: 'actor participant usecase class interface enum object component package node folder frame cloud database storage agent artifact file stack queue rectangle card circle hexagon entity agent boundary control participant actor',
            built_in: 'extends implements returns trigger activate deactivate destroy create note left right center top bottom over of as hide show skinparam skinparamparam style stereotype abstract class interface enum annotation circle circle_short form param return field member method static abstract final private protected public package void int string boolean char byte short long float double true false null new this super if else switch case default for while do break continue return throw try catch finally synchronized volatile transient native strictfp assert goto const instanceof enum class interface extends implements import package public protected private static final abstract native synchronized volatile transient strictfp void boolean char byte short int long float double true false null new this super'
        },
        contains: [
            hljs.COMMENT("'", '\n'),
            hljs.COMMENT('/"', '/'),
            {
                className: 'string',
                begin: '"',
                end: '"',
                relevance: 0
            },
            {
                className: 'symbol',
                begin: '\\w+:',
                relevance: 0
            },
            {
                className: 'title',
                begin: '\\b(actor|participant|usecase|class|interface|enum|object|component|package|node|folder|frame|cloud|database|storage|agent|artifact|file|stack|queue|rectangle|card|circle|hexagon|entity|boundary|control)\\b',
                relevance: 10
            }
        ]
    }
})

const materialMd = new MarkdownIt().use(highlightjs, {
    // 自定义语法高亮函数，支持的语言会正常高亮，不支持的返回空字符串
    highlight: function (str: string, lang: string): string {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang }).value
            } catch (__) {
                console.warn(`Highlight.js error for language '${lang}':`, __)
            }
        }
        return ''  // 不支持的语言返回空字符串，代码块将显示为普通文本
    }
})

/**
 * 匹配代码块内容
 * @param contents 文本行数组
 * @returns 代码块的所有行
 */
function matchCodeBlock(contents: string[]): string[] {
    const codeBlocks: string[] = []
    let codeBlockStart = false
    for (let i = 0; i < contents.length; i++) {
        const currentLine = contents[i].replace(/^\t|^ {4}/, '')
        codeBlocks.push(currentLine)
        if (currentLine.trim().startsWith('```')) {
            if (codeBlockStart) {
                break
            } else {
                codeBlockStart = true
            }
        }
    }
    return codeBlocks
}

/**
 * 匹配 Tabbed Set 块
 * Tabbed Set 是一种特殊的 Markdown 语法，以 === "标签名" 开头
 * @param contents 文本行数组
 * @returns Tabbed Set 块的所有行
 */
function matchTabbedSetBlock(contents: string[]): string[] {
    const tabbedBlocks: string[] = []
    let i = 0

    while (i < contents.length) {
        const currentLine = contents[i]
        const trimmedLine = currentLine.trim()

        // 如果是 === 开头的行，添加到结果中
        if (trimmedLine.match(/^===\s+"/)) {
            tabbedBlocks.push(trimmedLine)
            i++
            // 收集该标签下的所有缩进内容
            while (i < contents.length) {
                const nextLine = contents[i]
                // 如果是空行，添加并继续
                if (nextLine.trim() === '') {
                    tabbedBlocks.push('')
                    i++
                }
                // 如果是缩进行（以空格或tab开头），去除缩进后添加
                else if (nextLine.startsWith(' ') || nextLine.startsWith('\t')) {
                    const processedLine = nextLine.replace(/^\t|^ {4}/, '')
                    tabbedBlocks.push(processedLine)
                    i++
                }
                // 如果遇到下一个 === 标记，停止当前标签的收集
                else if (nextLine.trim().match(/^===\s+"/)) {
                    break
                }
                // 其他情况停止
                else {
                    break
                }
            }
        }
        // 如果是空行，跳过
        else if (trimmedLine === '') {
            i++
        }
        // 其他情况停止
        else {
            break
        }
    }

    return tabbedBlocks
}

/**
 * 渲染 Admonitions 内容
 * 处理普通文本行、代码块和 Tabbed Set 块
 * @param contents 内容行数组
 * @returns 渲染后的 HTML 字符串
 */
function materialAdmonitionsContentRender(contents: string[]): string {
    let renderResult = ''
    let normalTextLines: string[] = [] // 收集普通文本行

    // 跳过开头的空行
    let startIndex = 0
    while (startIndex < contents.length && contents[startIndex].trim() === '') {
        startIndex++
    }

    // 遍历所有行
    for (let i = startIndex; i < contents.length; i++) {
        // 去掉行首的4个空格或者tab
        const currentLine = contents[i].replace(/^\t|^ {4}/, '')

        // 代码块，单独渲染
        if (currentLine.trim().startsWith('```')) {
            // 先渲染之前收集的普通文本
            if (normalTextLines.length > 0) {
                const combinedText = normalTextLines.join('\n')
                renderResult += materialMd.render(combinedText)
                normalTextLines = []
            }
            // 从当前行的下一行开始，找到代码块全部内容
            const codeBlocks = matchCodeBlock(contents.slice(i))
            renderResult += '\n\n' + codeBlocks.join('\r\n') + '\n\n'
            i += codeBlocks.length - 1
        }
        // Tabbed Set 块（=== 开头），跳过渲染
        else if (currentLine.trim().match(/^===\s+"/)) {
            // 先渲染之前收集的普通文本
            if (normalTextLines.length > 0) {
                const combinedText = normalTextLines.join('\n')
                renderResult += materialMd.render(combinedText)
                normalTextLines = []
            }
            // 收集整个 tabbed set 块
            const tabbedBlocks = matchTabbedSetBlock(contents.slice(i))
            renderResult += '\n' + tabbedBlocks.join('\n') + '\n'
            i += tabbedBlocks.length - 1
        }
        else {
            // 收集普通文本行（包括标题、列表等）
            normalTextLines.push(currentLine.trim())
        }
    }

    // 渲染剩余的普通文本
    if (normalTextLines.length > 0) {
        const combinedText = normalTextLines.join('\n')
        renderResult += materialMd.render(combinedText)
    }

    return renderResult
}

/**
 * 解析 Admonitions 块
 * 解析 !!!type "title" 格式，提取类型、标题和内容
 * @param text Admonitions 块的文本内容
 * @returns 解析后的 type、title 和 content
 */
function materialParserAdmonitions(text: string): {
    type: string
    title: string
    content: string
} {
    // 字符串按照行分割
    const lines = text.split(/\r?\n/)
    // 第一行是type和title
    // 去掉两边的空白
    const firstLine = lines[0].trim()
    // 找到字符串的第一个双引号，双引号之前的是type
    const startIndex = firstLine.indexOf('"')
    let typeStr
    let titleStr = ''
    if (startIndex != -1) {
        typeStr = firstLine.substring(0, startIndex).trim()
        // 去掉两侧双引号或单引号
        titleStr = firstLine.substring(startIndex).trim().replace(/^["']|["']$/g, '')
    } else {
        // 只有类型，没有title
        typeStr = firstLine.trim()
    }
    // 内容项从第二行开始
    let contentStr
    if (lines.length >= 2) {
        contentStr = materialAdmonitionsContentRender(lines.slice(1))
    } else {
        contentStr = 'undefined'
    }

    return {
        type: typeStr.toLowerCase(),
        title: titleStr,
        content: contentStr
    }
}

/**
 * Material Admonitions 预渲染
 * 将 !!!type "title" 格式转换为 HTML 的 admonition div
 * @param text 原始 Markdown 文本
 * @returns 渲染后的文本
 */
export function materialAdmonitionsRender(text: string): string {
    let renderResult = text
    let match: RegExpExecArray | null = null
    // 匹配字符串中所有以!!!开始的内容
    const regex = /!!!([\s\S]*?)(?=\n[!#`=\-+\[$|{<:*~>\S]|$)/
    // 使用全局搜索来查找所有匹配项
    while ((match = regex.exec(renderResult)) !== null) {
        const content = materialParserAdmonitions(match[1])
        const renderHtml =
            `<div class="admonition ${content.type}">` +
            `<p class="admonition-title">${content.title}</p>` +
            `${content.content}</div>\n`
        renderResult = renderResult.replace(match[0], renderHtml)
    }
    return renderResult
}

export function materialAdmonitionsPostRender(text: string): string {
    return text
}
