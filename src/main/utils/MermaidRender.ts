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

// 存储mermaid字符和svg的隐射关系，单个文档存储，如果文档保存，则清空
const mermaidToSvgMap: Map<string, string> = new Map()

function storeMermaidMapping(mermaidCode: string, svgString: string): void {
  mermaidToSvgMap.set(mermaidCode, svgString);
}

function querySvgByMermaidCode(mermaidCode: string): string | undefined {
  return mermaidToSvgMap.get(mermaidCode)
}

async function waitAsyncRenderResult(text: string): Promise<string> {
  try {
    return await mermaidHandleGetRenderResult(text)
  } catch (error) {
    console.log('mermaidHandleGetRenderResult error', error)
    return text
  }
}

async function MermaidRenderAllGraph(text: string): Promise<string> {
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /```mermaid([\s\S]*?)```/g
  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    const graphDesc = match[1]
    let mermaidRenderSvgString = ''
    // 从已经存储的map中获取
    const mapSvg = querySvgByMermaidCode(graphDesc)
    if (mapSvg != undefined) {
      //console.log('querySvgByMermaidCode success', graphDesc.substring(0, 100))
      mermaidRenderSvgString = mapSvg
    } else {
      try {
        mermaidRenderSvgString = await waitAsyncRenderResult(graphDesc)
        storeMermaidMapping(graphDesc, mermaidRenderSvgString)
      } catch (error) {
        //console.log('waitAsyncRenderResult error', error)
        mermaidRenderSvgString = graphDesc
      }
    }
    mermaidRenderSvgString =
      '<pre class="mermaid"><code>' + mermaidRenderSvgString + '</code></pre>'
    renderResult = renderResult.replace(match[0], mermaidRenderSvgString)
  }

  return renderResult
}

export { MermaidRenderAllGraph }
