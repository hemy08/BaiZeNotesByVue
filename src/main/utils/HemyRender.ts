import { katexRenderMathInText } from './KatexRender'
import { MermaidRenderAllGraph } from './MermaidRender'

export async function HemyRender(mainWindow: Electron.BrowserWindow, text: string) {
  const katexRenderResult = katexRenderMathInText(text)
  try {
    const mermaidRenderResult = await MermaidRenderAllGraph(katexRenderResult)
    if (mermaidRenderResult) {
      mainWindow.webContents.send('pre-render-monaco-editor-content-result', mermaidRenderResult)
      console.log('HemyRender mermaidRenderResult', mermaidRenderResult)
    }
  } catch (error) {
    console.error(error)
  }
}
