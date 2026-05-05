import { katexRenderMathInText } from './KatexRender'
import { materialAdmonitionsRender, materialAdmonitionsPostRender } from './MaterialRender'
import { tabbedSetRender } from './TabbedSetRender'
import { ParseDirectoryPath } from '../utils/file-utils'

/**
 * 文本片段接口
 * 用于表示文本的不同部分
 */
interface TextSegment {
    content: string
    isProtected: boolean
}

/**
 * 检查是否是需要保护的代码块起始行
 * 识别 ```text 或 ```markdown 开头的行
 */
function isProtectedBlockStart(line: string): boolean {
    const trimmedLine = line.trim()
    return trimmedLine.startsWith('```text') || trimmedLine.startsWith('```markdown')
}

/**
 * 检查是否是纯 ``` 行（用于结束代码块）
 */
function isPureCodeBlockEnd(line: string): boolean {
    return line.trim() === '```'
}

/**
 * 收集被保护的代码块内容
 * 支持嵌套的 ```other 代码块
 */
function collectProtectedBlock(lines: string[], startIndex: number): {
    blockContent: string
    nextIndex: number
} {
    const blockLines: string[] = [lines[startIndex]]
    let i = startIndex
    let depth = 1

    while (i < lines.length) {
        const currentLine = lines[i]
        blockLines.push(currentLine)

        if (currentLine.startsWith('```')) {
            if (!isPureCodeBlockEnd(currentLine)) {
                depth++
            } else {
                depth--
            }
            if (depth === 0) {
                break
            }
        }

        i++
    }

    return {
        blockContent: blockLines.join('\n'),
        nextIndex: i + 1
    }
}

/**
 * 将文本按照 ```text 和 ```markdown 块进行分割
 * 被这些代码块包围的内容标记为 isProtected，不会被渲染
 */
function splitByTextMarkdownBlocks(text: string): TextSegment[] {
    const segments: TextSegment[] = []
    const lines = text.split('\n')
    let currentContent = ''
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        if (isProtectedBlockStart(line)) {
            if (currentContent.length > 0) {
                segments.push({
                    content: currentContent,
                    isProtected: false
                })
                currentContent = ''
            }

            const { blockContent, nextIndex } = collectProtectedBlock(lines, i)
            segments.push({
                content: blockContent,
                isProtected: true
            })
            i = nextIndex
            continue
        }

        currentContent += (currentContent.length > 0 ? '\n' : '') + line
        i++
    }

    if (currentContent.length > 0) {
        segments.push({
            content: currentContent,
            isProtected: false
        })
    }

    return segments
}

/**
 * 对普通文本进行各种渲染处理
 * 依次执行：Material Admonitions、Tabbed Set、KaTeX、图片URL、文件URL
 */
function renderContent(text: string): string {
    let result = materialAdmonitionsRender(text)
    result = tabbedSetRender(result)
    result = katexRenderMathInText(result)
    result = preRenderImageUrlConvert(result)
    result = preRenderFileUrlConvert(result)
    return result
}

/**
 * 预渲染阶段 - 主要处理函数
 * 1. 分割文本，识别被保护的代码块
 * 2. 对非保护内容进行渲染
 * 3. 组合结果并发送
 */
export async function HemyRenderPre(
    mainWindow: Electron.CrossProcessExports.BrowserWindow,
    text: string
) {
    const segments = splitByTextMarkdownBlocks(text)

    const renderResult = segments
        .map(segment => {
            if (segment.isProtected) {
                return segment.content
            }
            return renderContent(segment.content)
        })
        .join('')

    mainWindow.webContents.send('pre-render-monaco-editor-content-result', renderResult)
}

/**
 * 后渲染阶段
 * 暂时只调用 Material Admonitions 的后处理
 */
export async function HemyRenderPost(
    mainWindow: Electron.CrossProcessExports.BrowserWindow,
    text: string
) {
    const renderResult = materialAdmonitionsPostRender(text)
    mainWindow.webContents.send('post-render-monaco-editor-content-result', renderResult)
}

/**
 * 转换文件URL为绝对路径
 */
function covertFileUrl(url: string): string {
    const file = global.current_active_file
    if (!file) {
        return url
    }

    if (url.indexOf(':') !== -1) {
        return url
    }

    if (url.startsWith('./')) {
        url = url.substring(2)
    }

    const fullPath = ParseDirectoryPath(file.path) + '\\' + url
    return fullPath.replace('\\', '/')
}

/**
 * 从图片标记中解析 alt 文本
 * ![alt](url)
 */
function parseAltText(text: string): string {
    const leftIndex = text.indexOf('[')
    const rightIndex = text.indexOf(']')
    if (rightIndex === leftIndex + 1) {
        return ''
    }
    return text.substring(leftIndex + 1, rightIndex)
}

/**
 * 预渲染 - 图片URL转换
 * 将相对路径的图片URL转换为绝对路径
 */
function preRenderImageUrlConvert(text: string): string {
    let renderResult = text
    let match: RegExpExecArray | null = null
    const regex = /!\[[^\]]*\]\(([^)]*)\)/g

    while ((match = regex.exec(renderResult)) !== null) {
        const imgSrc = covertFileUrl(match[1])
        const altText = parseAltText(match[0])
        const htmlContent =
            '<p><img style="width: auto; max-width: 900px; height: auto" src="' +
            imgSrc +
            '" alt="' +
            altText +
            '"></p>'
        renderResult = renderResult.replace(match[0], htmlContent)
    }

    return renderResult
}

/**
 * 预渲染 - 文件URL转换
 * 将非 http 开头的相对路径文件URL转换为绝对路径
 */
function preRenderFileUrlConvert(text: string): string {
    let renderResult = text
    let match: RegExpExecArray | null = null
    const regex = /\[[^\]]*\]\(([^)]*)\)/g

    while ((match = regex.exec(renderResult)) !== null) {
        if (!match[1].startsWith('http')) {
            const fileSrc = covertFileUrl(match[1])
            const altText = parseAltText(match[0])
            const htmlContent = '<a href="' + fileSrc + '">' + altText + '</a>'
            renderResult = renderResult.replace(match[0], htmlContent)
        }
    }

    return renderResult
}
