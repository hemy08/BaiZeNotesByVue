import { ipcRenderer, ipcMain } from 'electron'

function MermaidRenderAllGraph(text: string): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  let result = text
  let match: RegExpExecArray | null = null
  const regex = /```mermaid([\s\S]*?)```/g
  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    // 获取匹配到的 LaTeX 字符串（去掉 $ 符号）
    const graphDesc = match[1]
    // 使用 KaTeX 渲染 LaTeX 字符串为 HTML
    let mermaidRenderSvgString = ''
    try {
      ipcRenderer.send('create-mermaid-render-frame', graphDesc)
      // eslint-disable-next-line no-inner-declarations
      function processMermaidRenderResult(_, svgData) {
        console.log('processCreateMermaidRenderFrame', text)
        mermaidRenderSvgString = svgData
      }
      ipcMain.on('mermaid-render-frame-svg-result', processMermaidRenderResult)
    } catch (error) {
      console.log('mermaidRenderAllGraph result = ', error)
      mermaidRenderSvgString = graphDesc
    }

    mermaidRenderSvgString =
      '<pre class="mermaid"><code>' + mermaidRenderSvgString + '</code></pre>'
    // 替换原始文本中的 $latex$ 为渲染后的 HTML
    // 注意：这里我们假设文本中不含有会破坏 HTML 的特殊字符
    result = result.replace(match[0], mermaidRenderSvgString)
  }

  return result
}

export { MermaidRenderAllGraph }
