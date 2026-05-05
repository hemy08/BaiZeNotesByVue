/**
 * KatexRender.ts
 * KaTeX 数学公式渲染器
 * 支持渲染：
 * 1. 行内公式：$...$
 * 2. 块级公式：$$...$$
 * 3. 代码块公式：```math...```、```katex...```、```latex...```
 */

import katex from 'katex'

/**
 * 使用正则表达式渲染文本中的数学公式
 * @param text 原始文本
 * @param regex 匹配公式的正则表达式
 * @param isBlock 是否为块级公式
 * @returns 渲染后的文本
 */
function renderMathInText(text: string, regex: RegExp, isBlock: boolean): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  let result = text
  let match: RegExpExecArray | null = null

  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    // 获取匹配到的 LaTeX 字符串（去掉 $ 符号）
    const latex = match[1]
    
    // 检查公式前后是否有反引号，有则跳过渲染
    const beforeChar = text[match.index - 1]
    const afterChar = text[match.index + match[0].length]
    if (beforeChar === '`' || afterChar === '`') {
      continue
    }
    
    if (!isBlock) {
      // 行内公式，如果有换行符，则不渲染，放在有些代码内部有单个的$
      if (match[1].lastIndexOf('\n') !== -1) {
        continue
      }
    }
    // 使用 KaTeX 渲染 LaTeX 字符串为 HTML
    let html = ''
    try {
      html = katex.renderToString(latex)
    } catch (error) {
      html = latex
    }

    if (isBlock) {
      html =
        '<div style="text-align: center;margin-top: 20px;margin-bottom: 20px"><p>' +
        html +
        '</p></div>'
    }
    // 替换原始文本中的 $latex$ 为渲染后的 HTML
    // 注意：这里我们假设文本中不含有会破坏 HTML 的特殊字符
    result = result.replace(match[0], html)
  }

  return result
}

/**
 * 将 LaTeX 文本直接渲染为 HTML 字符串
 * @param text LaTeX 文本
 * @returns HTML 字符串
 */
function katexRenderToString(text: string): string {
  let html = ''
  try {
    html = katex.renderToString(text)
  } catch (error) {
    html = text
  }

  return html
}

function renderMathCodeBlock(text: string, regex: RegExp): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  let renderResult = text
  let match: RegExpExecArray | null = null
  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    const mathBlocks = katex.renderToString(match[1])
    // console.log('result ```math', regex, match[1])
    renderResult = renderResult.replace(
      match[0],
      '<div style="text-align: center;"><p>' + mathBlocks + '</p></div>'
    )
  }

  return renderResult
}

function katexRenderMathInText(text: string): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  // 公式块$$ $$
  let result = renderMathInText(text, /\$\$([^$]+)\$\$/g, true)
  // 行内公式$  $
  result = renderMathInText(result, /\$([^$]+)\$/g, false)
  // ```math   ```
  result = renderMathCodeBlock(result, /```math([\s\S]*?)```/g)
  //console.log('result ```math', result)
  // ```katex   ```
  result = renderMathCodeBlock(result, /```katex([\s\S]*?)```/g)
  //console.log('result ```katex', result)
  // ```latex   ```
  result = renderMathCodeBlock(result, /```latex([\s\S]*?)```/g)
  return result
}

export { katexRenderToString, katexRenderMathInText }
