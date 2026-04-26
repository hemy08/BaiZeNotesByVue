import MarkdownIt from 'markdown-it'
import highlightjs from 'markdown-it-highlightjs'
import hljs from 'highlight.js'
import { katexRenderMathInText } from './KatexRender'

// 注册 PlantUML 语言支持
hljs.registerLanguage('plantuml', function(hljs) {
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
                begin: ':',
                end: ':',
                relevance: 10
            },
            {
                className: 'title',
                begin: '\\b(actor|participant|usecase|class|interface|enum|object|component|package|node|folder|frame|cloud|database|storage|agent|artifact|file|stack|queue|rectangle|card|circle|hexagon|entity|boundary|control)\\b',
                relevance: 10
            },
            {
                className: 'arrow',
                begin: '(-|\\.|\\||<|>|\\*|o|x|\\)|\\(|\\\\|\\/|\\\\\\\\|\\/\\/)+',
                relevance: 10
            }
        ]
    }
})

const materialMd = MarkdownIt()
materialMd.options.html = true
materialMd.options.linkify = true
materialMd.options.langPrefix = 'language-'
materialMd.options.breaks = true
materialMd.options.typographer = true
// eslint-disable-next-line @typescript-eslint/no-var-requires
materialMd.use(highlightjs, { inline: true, hljs: hljs })

function matchCodeBlock(lines: string[]): string[] {
    const codeBlocks: string[] = []
    const lineStr: string = lines[0].trim().replace(/^(t| {4})/, '')
    codeBlocks.push(lineStr)
    // 找到块的结尾，跳过这部分，从下一行开始
    for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i]
        // 以```作为代码块结束判断
        if (currentLine.trim().startsWith('```')) {
            codeBlocks.push(currentLine.trim())
            return codeBlocks
        }
        // 代码块内容不做去除空行和空白字符处理
        codeBlocks.push(currentLine)
    }
    return codeBlocks
}

// 对Admonitions块中的content进行渲染，支持行内公式、行内代码块
function materialAdmonitionsContentRender(contents: string[]): string {
    let renderResult = ''
    let normalTextLines: string[] = [] // 收集普通文本行

    // 遍历所有行
    for (let i = 0; i < contents.length; i++) {
        // 去掉行首的4个空格或者tab
        const currentLine = contents[i].replace(/^\t|^ {4}/, '')
        // 代码块，单独渲染，找到代码库的起始和结束位置
        if (currentLine.trim().startsWith('```')) {
            // 先渲染之前收集的普通文本
            if (normalTextLines.length > 0) {
                const combinedText = normalTextLines.join('\n')
                const katexRenderResult = katexRenderMathInText(combinedText)
                renderResult += materialMd.render(katexRenderResult)
                normalTextLines = []
            }
            // 从当前行的下一行开始，找到代码块全部内容，去掉行首的空格和tab
            const codeBlocks = matchCodeBlock(contents.slice(i))
            renderResult += '\n\n' + codeBlocks.join('\r\n') + '\n\n'
            i += codeBlocks.length - 1
        } else {
            // 收集普通文本行（包括标题、列表等）
            normalTextLines.push(currentLine.trim())
        }
    }

    // 渲染剩余的普通文本
    if (normalTextLines.length > 0) {
        const combinedText = normalTextLines.join('\n')
        const katexRenderResult = katexRenderMathInText(combinedText)
        renderResult += materialMd.render(katexRenderResult)
    }

    return renderResult
}

// 解析Admonitions块，得到type、title、content
function materialParserAdmonitions(text: string): {
    type: string
    title: string
    content: string
} {
    // 字符串按照行分割
    const lines = text.split(/\r?\n/)
    //console.log('lines', lines)
    // 第一行是type和title
    // 去掉两边的空白
    const firstLine = lines[0].trim()
    // 找到字符串的第一个双引号，双引号之前的是type
    const startIndex = text.indexOf('"')
    let typeStr
    let titleStr = ''
    if (startIndex != -1) {
        typeStr = firstLine.substring(0, startIndex).trim()
        // 去掉开头和结束的双引号
        titleStr = firstLine.substring(startIndex, firstLine.length - 1).trim()
    } else {
        // 只有类型，没有title
        typeStr = firstLine.trim()
    }
    // 内容项从第二行开始，遍历所有内容，每行内容前后加上<p></p>
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

export function materialAdmonitionsRender(text: string): string {
    let renderResult = text
    let match: RegExpExecArray | null = null
    // 匹配字符串中所有以!!!开始的内容（直到遇到另一个
    // !（图片、下一个块）、#（标题）、`（代码块）、=（内容选项卡）、
    // -、+（无序列表、行分隔符）、[（链接）、$(公式)、|（表格）、{（特殊块）、<（html语法）
    // :(icon，emojis)、*（加粗）、~（删除线）、>（引用）、\r?\n（空行）
    // 或者字符串的结尾）
    const regex = /!!!([\s\S]*?)(?=\n[!#`=\-+\[$|{<:*~>\S]|$)/g
    // 使用全局搜索来查找所有匹配项，匹配到的字符串，已经去掉了前缀和后缀
    while ((match = regex.exec(renderResult)) !== null) {
        // console.log('match[0]', match[0])
        // console.log('match[1]', match[1])
        const content = materialParserAdmonitions(match[1])
        // console.log('content', content)
        const renderHtml =
            `<div class="admonition ${content.type}">` +
            `<p class="admonition-title">${content.title}</p>` +
            `${content.content}</div>\n\n`
        renderResult = renderResult.replace(match[0], renderHtml)
        // console.log('renderHtml', renderHtml)
        // console.log('renderResult', renderResult)
    }

    return renderResult
}
export function materialAdmonitionsPostRender(text: string): string {
    return text
}
