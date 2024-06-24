import mermaid from 'mermaid'
import MarkdownIt from 'markdown-it'
import EventBus from '../../event-bus'

function generateRandomNumberString(length: number): string {
  let result = ''
  const characters = '0123456789'
  const charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

function removeMermaidDiv(mermaidId: string) {
  const divElement = document.getElementById('d' + mermaidId)
  if (divElement) {
    divElement.remove()
  }
}

async function mermaidRender(graphDefinition: string): Promise<string> {
  const mermaidId = 'mermaid' + generateRandomNumberString(10)
  try {
    const renderSvg = await mermaid.render(mermaidId, graphDefinition)
    // 删除mermaid.render过程中增加的div
    removeMermaidDiv(mermaidId)
    return Promise.resolve(
      '<div><pre class="mermaid"><code style="height: auto;display: flex">' +
        renderSvg.svg +
        '</code></pre></div>'
    )
  } catch (error) {
    console.log('mermaidRender error', error)
  }
  removeMermaidDiv(mermaidId)
  return ''
}

export async function preRenderMermaidProc(text: string): Promise<string> {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /```mermaid([\s\S]*?)```/g
  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    const renderedSvg = await mermaidRender(match[1])
    renderResult = renderResult.replace(match[0], renderedSvg)
  }

  return renderResult
}

export function PreMarkdownRender(text: string): Promise<string> {
  return preRenderMermaidProc(text)
}

interface markdownTOC {
  level: string
  text: string
  lineNumber: number
}

export function ParserMarkdownChapters(md: MarkdownIt, text: string) {
  // 提取大纲
  const headings: markdownTOC[] = []
  const mdTokens = md.parse(text, [])
  console.log('markdown-it tokens', mdTokens)
  mdTokens.forEach((token) => {
    if (token.type === 'heading_open') {
      const healing: markdownTOC = {
        level: token.tag,
        text: '',
        lineNumber: 0
      }

      if (token.map) {
        healing.lineNumber = token.map[1]
      }

      let nextToken = mdTokens[mdTokens.indexOf(token) + 1]
      while (nextToken && nextToken.type !== 'heading_close') {
        if (nextToken.type === 'inline' && nextToken.children) {
          nextToken.children.forEach((child) => {
            if (child.type === 'text') {
              healing.text += child.content
            }
          })
        }
        nextToken = mdTokens[mdTokens.indexOf(nextToken) + 1]
      }

      headings.push(healing)
    }
  })
  EventBus.$emit('monaco-editor-chapters', headings)
}

export function PostMarkdownRender(text: string): string {
  return text
}
