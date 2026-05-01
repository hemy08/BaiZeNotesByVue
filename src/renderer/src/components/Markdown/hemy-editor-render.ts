import mermaid from 'mermaid'
import MarkdownIt from 'markdown-it'
import EventBus from '../../event-bus'
import { MarkdownTOC } from '../../../../main/global-types'

function genRandomNumString(length: number): string {
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
  const mermaidId = 'mermaid' + genRandomNumString(10)
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

/**
 * 并发限制的批量执行函数
 * @param tasks 任务数组
 * @param concurrency 并发限制数量
 * @returns 结果数组
 */
async function limitConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = []
  const executing: Promise<void>[] = []

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    const promise = task().then((result) => {
      results[i] = result
      const index = executing.indexOf(promise)
      if (index > -1) {
        executing.splice(index, 1)
      }
    })

    executing.push(promise)

    if (executing.length >= concurrency) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

export async function preRenderMermaidProc(text: string): Promise<string> {
  // 正则表达式匹配 mermaid 代码块
  const regex = /```mermaid([\s\S]*?)```/g
  const matches: { full: string; code: string }[] = []
  let match: RegExpExecArray | null

  // 收集所有匹配项
  while ((match = regex.exec(text)) !== null) {
    matches.push({ full: match[0], code: match[1] })
  }

  // 如果没有匹配项，直接返回原文
  if (matches.length === 0) {
    return text
  }

  // 并发限制的并行渲染（限制并发数为3，避免Mermaid内部全局状态竞争）
  // Mermaid 11.x版本支持一定程度的并行，但需要限制并发数
  const MERMAID_CONCURRENCY_LIMIT = 3

  const renderTasks = matches.map((m) => () => mermaidRender(m.code))
  const renderResults = await limitConcurrency(renderTasks, MERMAID_CONCURRENCY_LIMIT)

  // 替换结果
  let result = text
  matches.forEach((m, i) => {
    result = result.replace(m.full, renderResults[i])
  })

  return result
}

export function PreMarkdownRender(text: string): Promise<string> {
  return preRenderMermaidProc(text)
}

export function ParserMarkdownChapters(md: MarkdownIt, text: string) {
  // 提取大纲
  const headings: MarkdownTOC[] = []
  const mdTokens = md.parse(text, [])
  // console.log('markdown-it tokens', mdTokens)
  mdTokens.forEach((token) => {
    if (token.type === 'heading_open') {
      const healing: MarkdownTOC = {
        id: genRandomNumString(10),
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
