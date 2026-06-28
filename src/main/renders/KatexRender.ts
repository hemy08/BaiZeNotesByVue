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
  return text.replace(regex, (match, latex, offset) => {
    const beforeChar = text[offset - 1]
    const afterChar = text[offset + match.length]
    if (beforeChar === '`' || afterChar === '`') {
      return match
    }
    if (!isBlock && latex.includes('\n')) {
      return match
    }
    let html = ''
    try {
      html = katex.renderToString(latex)
    } catch (error) {
      html = latex
    }
    if (isBlock) {
      html = '<div style="text-align: center;margin-top: 20px;margin-bottom: 20px"><p>' + html + '</p></div>'
    }
    return html
  })
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
  return text.replace(regex, (_, code) => {
    const mathBlocks = katex.renderToString(code)
    return '<div style="text-align: center;"><p>' + mathBlocks + '</p></div>'
  })
}

function katexRenderMathInText(text: string): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  // 公式块$$ $$
  let result = renderMathInText(text, /\$\$([^$]+)\$\$/g, true)
  // 行内公式$  $
  result = renderMathInText(result, /\$([^$]+)\$/g, false)
  // ```math   ```
  result = renderMathCodeBlock(result, /```math([\s\S]*?)```/g)
  result = renderMathCodeBlock(result, /```katex([\s\S]*?)```/g)
  result = renderMathCodeBlock(result, /```latex([\s\S]*?)```/g)
  return result
}

export { katexRenderToString, katexRenderMathInText }
