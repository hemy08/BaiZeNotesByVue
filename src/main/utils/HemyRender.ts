import { katexRenderMathInText } from './KatexRender'
// import { plantumlRender } from './PlantumlRender'

export async function HemyRender(
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
  mainWindow.webContents.send('pre-render-monaco-editor-content-result', katexRenderResult)
}
