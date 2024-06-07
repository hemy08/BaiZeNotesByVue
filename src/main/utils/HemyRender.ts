import { katexRenderMathInText } from './KatexRender'
import { MermaidRenderAllGraph } from './MermaidRender'

export async function HemyRender(mainWindow: Electron.BrowserWindow, text: string) {
  const katexRenderResult = katexRenderMathInText(text)
  try {
    const mermaidRenderResult = await MermaidRenderAllGraph(katexRenderResult)
    if (mermaidRenderResult) {
      mainWindow.webContents.send('pre-render-monaco-editor-content-result', mermaidRenderResult)
    }
  } catch (error) {
    console.log(error)
  }
}
