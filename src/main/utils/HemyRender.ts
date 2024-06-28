import { katexRenderMathInText } from './KatexRender'
import { materialAdmonitionsRender, materialAdmonitionsPostRender } from './MaterialRender'
import { ParseDirectoryPath } from './file-utils'
// import { plantumlRender } from './PlantumlRender'

export async function HemyRenderPre(
  mainWindow: Electron.CrossProcessExports.BrowserWindow,
  text: string
) {
  let renderResult = materialAdmonitionsRender(text)
  renderResult = preRenderImageUrlConvert(renderResult)
  renderResult = preRenderFileUrlConvert(renderResult)
  renderResult = katexRenderMathInText(renderResult)
  mainWindow.webContents.send('pre-render-monaco-editor-content-result', renderResult)
}

export async function HemyRenderPost(
  mainWindow: Electron.CrossProcessExports.BrowserWindow,
  text: string
) {
  const renderResult = materialAdmonitionsPostRender(text)
  mainWindow.webContents.send('post-render-monaco-editor-content-result', renderResult)
}

function covertFileUrl(url: string): string {
  const file = global.current_active_file
  if (!file) {
    return url
  }

  // 如果输入的就是绝对路径，则不替换
  if (url.indexOf(':') !== -1) {
    return url
  }

  // 如果输入的就是绝对路径，则不替换
  if (url.startsWith('./')) {
    url = url.substring(2)
  }
  // 获取当前文件的路径，拼接imgUrl
  const fullPath = ParseDirectoryPath(file.path) + '\\' + url
  return fullPath.replace('\\', '/')
}

function parseAltText(text: string): string {
  const leftIndex = text.indexOf('[')
  const rightIndex = text.indexOf(']')
  if (rightIndex === leftIndex + 1) {
    return ''
  }
  return text.substring(leftIndex + 1, rightIndex)
}

function preRenderImageUrlConvert(text: string): string {
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /!\[[^\]]*\]\(([^)]*)\)/g
  while ((match = regex.exec(renderResult)) !== null) {
    // match[0] ![1111](images/20240602173139鏂囦欢绠＄悊鍣?png)
    // match[1] images/20240602173139鏂囦欢绠＄悊鍣?png
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

function preRenderFileUrlConvert(text: string): string {
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /\[[^\]]*\]\(([^)]*)\)/g
  while ((match = regex.exec(renderResult)) !== null) {
    // match[0] [1111](images/20240602173139鏂囦欢绠＄悊鍣?png)
    // match[1] images/20240602173139鏂囦欢绠＄悊鍣?png
    if (!match[1].startsWith('http')) {
      const fileSrc = covertFileUrl(match[1])
      const altText = parseAltText(match[0])
      const htmlContent = '<p><a href="' + fileSrc + '">' + altText + '</a></p>'
      renderResult = renderResult.replace(match[0], htmlContent)
    }
  }

  return renderResult
}
