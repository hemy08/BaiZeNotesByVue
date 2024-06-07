import katex from '../../renderer/src/lib/Katex/katex.mjs'

function renderMathInText(text: string, regex: RegExp, isBlock: boolean): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  let result = text
  let match: RegExpExecArray | null = null

  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    // 获取匹配到的 LaTeX 字符串（去掉 $ 符号）
    const latex = match[1]
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

function renderMathLineInText(text: string): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  const regex = /\$([^$]+)\$/g

  return renderMathInText(text, regex, false)
}

function renderMathBlockInText(text: string): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  const regex = /\$\$([^$]+)\$\$/g

  return renderMathInText(text, regex, true)
}

function katexRenderToString(text: string): string {
  let html = ''
  try {
    html = katex.renderToString(text)
  } catch (error) {
    html = text
  }

  return html
}

function katexRenderMathInText(text: string): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  const result = renderMathBlockInText(text)
  return renderMathLineInText(result)
}

export {
  katexRenderToString,
  katexRenderMathInText
}
