import { katexRenderMathInText } from './KatexRender'

export async function HemyRender(
  mainWindow: Electron.CrossProcessExports.BrowserWindow,
  text: string
) {
  const katexRenderResult = katexRenderMathInText(text)
  mainWindow.webContents.send('pre-render-monaco-editor-content-result', katexRenderResult)
}
