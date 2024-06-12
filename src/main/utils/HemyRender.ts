import { katexRenderMathInText } from './KatexRender'
import { materialAdmonitionsRender, materialAdmonitionsPostRender} from './MaterialRender'
// import { plantumlRender } from './PlantumlRender'

export async function HemyRenderPre(
  mainWindow: Electron.CrossProcessExports.BrowserWindow,
  text: string
) {
  const katexRenderResult = katexRenderMathInText(text)
  // const plantumlRenderResult = plantumlRender(katexRenderResult)
  /*try {
    const plantumlRenderResult = await plantumlRender(katexRenderResult)
    if (plantumlRenderResult) {
      mainWindow.webContents.send('pre-render-monaco-editor-content-result', plantumlRenderResult)
    }
  } catch (error) {
    console.error(error)
  }*/
  const materialRenderResult = materialAdmonitionsRender(katexRenderResult)
  mainWindow.webContents.send('pre-render-monaco-editor-content-result', materialRenderResult)
}

export async function HemyRenderPost(
  mainWindow: Electron.CrossProcessExports.BrowserWindow,
  text: string
) {
  const materialRenderResult = materialAdmonitionsPostRender(text)
  mainWindow.webContents.send('post-render-monaco-editor-content-result', materialRenderResult)
}
