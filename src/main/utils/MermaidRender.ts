/*import mermaid from 'mermaid'
import type { MermaidConfig, RenderResult } from 'mermaid'
import zenuml from '@mermaid-js/mermaid-zenuml'

const init = mermaid.registerExternalDiagrams([zenuml])

export const HemyMermaidRender = async (
  config: MermaidConfig,
  code: string,
  id: string
): Promise<RenderResult> => {
  await init

  // Should be able to call this multiple times without any issues.
  mermaid.initialize(config)
  return await mermaid.render(id, code)
}

export const HemyMermaidParse = async (code: string): Promise<unknown> => {
  return await mermaid.parse(code)
}*/

import { mermaidHandleGetRenderResult } from '../dialogs/dialogs'

async function waitAsyncRenderResult(text: string): Promise<string> {
  try {
    //if (awaitRenderPromise) {
    return await mermaidHandleGetRenderResult(text)
    //}
  } catch (error) {
    console.log('mermaidHandleGetRenderResult error', error)
    return text
  }
}

async function MermaidRenderAllGraph(text: string): Promise<string> {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /```mermaid([\s\S]*?)```/g
  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    // 获取匹配到的 LaTeX 字符串（去掉 $ 符号）
    const graphDesc = match[1]
    // 使用 KaTeX 渲染 LaTeX 字符串为 HTML
    let mermaidRenderSvgString = ''
    try {
      //if (asyncResult) {
      mermaidRenderSvgString = await waitAsyncRenderResult(graphDesc)
      //}
    } catch (error) {
      console.log('waitAsyncRenderResult error', error)
      mermaidRenderSvgString = graphDesc
    }
    console.log('mermaidRenderSvgString error', mermaidRenderSvgString)
    mermaidRenderSvgString =
      '<pre class="mermaid"><code>' + mermaidRenderSvgString + '</code></pre>'
    // 替换原始文本中的 $latex$ 为渲染后的 HTML
    // 注意：这里我们假设文本中不含有会破坏 HTML 的特殊字符
    renderResult = renderResult.replace(match[0], mermaidRenderSvgString)
  }

  return renderResult
}

export { MermaidRenderAllGraph }
