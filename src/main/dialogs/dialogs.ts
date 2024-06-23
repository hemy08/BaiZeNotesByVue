import { openOnlineWebPage } from './OpenOnlineWebPages'
import { showFontSelectDialog } from './ShowFontSelectDialog'
import { showMarkdownSheetDialog } from './ShowMdSheetDialog'
import { showMathTextDialog } from './ShowMathTextDialog'
import { showMermaidEditDialog } from './ShowMermaidEditDialog'
import { mermaidHandleGetRenderResult } from './OpenMermaidRenderFrame'
import { createAdmonitionDialog } from './ShowAdmonitionsDialog'
import { showCreateFileFolderDialog } from './showCreateDialog'


export {
  openOnlineWebPage,
  showFontSelectDialog,
  showMarkdownSheetDialog,
  showMathTextDialog,
  showMermaidEditDialog,
  mermaidHandleGetRenderResult,
  createAdmonitionDialog,
  showCreateFileFolderDialog
}

export class hemyDialog {
  mainWindow: Electron.BrowserWindow

  constructor(mainWindow: Electron.BrowserWindow) {
    this.mainWindow = mainWindow
  }

  selectFont() {
    showFontSelectDialog(this.mainWindow)
  }

  markdownSheet() {
    showMarkdownSheetDialog(this.mainWindow)
  }

  mathKatex() {
    showMathTextDialog(this.mainWindow)
  }

  mermaidLocalEdit() {
    showMermaidEditDialog(this.mainWindow)
  }

  getMermaidRender(text: string): Promise<string> {
    return mermaidHandleGetRenderResult(text)
  }

  admonition() {
    createAdmonitionDialog(this.mainWindow)
  }

  createFileFolder(): Electron.BrowserWindow {
    return showCreateFileFolderDialog()
  }
}

export const webAppDialogs = {
  mermaidWeb: { label: 'Mermaid在线编辑器', link: 'https://mermaid.live/edit' },
  plantTextWeb: { label: 'PlantText编辑器', link: 'https://www.planttext.com/' },
  mindline: { label: '在线思维导图工具', link: 'https://www.mindline.cn/webapp' },
  diagrams: { label: '在线流程图绘制', link: 'https://app.diagrams.net/' },
  plantumlWeb: { label: 'PlantUml 网页服务器', link: 'http://www.plantuml.com/plantuml/uml/' },
  jyShare: { label: '菜鸟工具首页', link: 'https://www.jyshare.com/' },
  jySvgEditor: { label: '菜鸟SVG图片编辑器', link: 'https://www.jyshare.com/more/svgeditor/' },
  jyShapeFlyDiagram: { label: '菜鸟绘图工具', link: 'https://www.jyshare.com/more/shapefly-diagram/' },
  jyOffice: { label: '菜鸟在线办公工具大全', link: 'https://www.jyshare.com/office/' },
  jyFrontEnd: { label: '菜鸟在线表格生成', link: 'https://www.jyshare.com/front-end/7688/' },
}
