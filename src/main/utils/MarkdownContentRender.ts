import MarkdownIt from 'markdown-it'
import highlightjs from 'markdown-it-highlightjs'
import hljs from 'highlight.js'
import katex from '../lib/Katex/katex.mjs'

const md = MarkdownIt()
md.options.html = true
md.options.linkify = true
md.options.langPrefix = 'language-'
md.options.breaks = true
md.options.typographer = true
md.use(highlightjs, { inline: true, hljs: hljs })
md.options.highlight = function (str, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(str, {language: lang, ignoreIllegals:true}).value
    } catch (__) {
      return ''
    }
  }

  return ''
}

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
      console.error('LaTeX代码有误:', error)
      html = latex
    }

    if (isBlock) {
      html = '<div style="text-align: center;"><p>' + html + '</p></div>'
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

export function katexRenderMathInText(text: string): string {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  const result = renderMathBlockInText(text)
  return renderMathLineInText(result)
}

export function processMarkdownRender(mainWindow: Electron.BrowserWindow, data) {
  const htmlContent = md.render(data)
  mainWindow.webContents.send('markdown-rendered', katexRenderMathInText(htmlContent))
}
