import { openOnlineWebPage } from './OpenOnlineWebPages'
import { showFontSelectDialog } from './ShowFontSelectDialog'
import { showMarkdownSheetDialog } from './ShowMdSheetDialog'
import { showMathTextDialog } from './ShowMathTextDialog'
import { showMermaidEditDialog } from './ShowMermaidEditDialog'
import { mermaidHandleGetRenderResult } from './OpenMermaidRenderFrame'
import { createAdmonitionDialog } from './ShowAdmonitionsDialog'
import { showCreateFileFolderDialog } from './showCreateDialog'

function OpenMermaidLiveEditor() {
  openOnlineWebPage('https://mermaid.live/edit')
}

function OpenPlantUmlOnline() {
  openOnlineWebPage('http://www.plantuml.com/plantuml/uml/')
}

function OpenPlantText() {
  openOnlineWebPage('https://www.planttext.com/')
}

function OpenJYShareOnline() {
  openOnlineWebPage('https://www.jyshare.com/')
}

function OpenSvgEditorOnline() {
  openOnlineWebPage('https://www.jyshare.com/more/svgeditor/')
}

function OpenShapeFlyDiagramOnline() {
  openOnlineWebPage('https://www.jyshare.com/more/shapefly-diagram/')
}

function OpenJYShareOfficeOnline() {
  openOnlineWebPage('https://www.jyshare.com/office/')
}

function OpenMindmapOnline() {
  openOnlineWebPage('https://www.mindline.cn/webapp')
}

function OpenDiagramsOnline() {
  openOnlineWebPage('https://app.diagrams.net/')
}

function OpenHtmlSheetCreateOnline() {
  openOnlineWebPage('https://www.jyshare.com/front-end/7688/')
}

export {
  OpenMermaidLiveEditor,
  OpenPlantUmlOnline,
  OpenPlantText,
  OpenJYShareOnline,
  OpenSvgEditorOnline,
  OpenShapeFlyDiagramOnline,
  OpenJYShareOfficeOnline,
  OpenMindmapOnline,
  OpenDiagramsOnline,
  OpenHtmlSheetCreateOnline,
  showFontSelectDialog,
  showMarkdownSheetDialog,
  showMathTextDialog,
  showMermaidEditDialog,
  mermaidHandleGetRenderResult,
  createAdmonitionDialog,
  showCreateFileFolderDialog
}

class jyShare {
  home() {
    openOnlineWebPage('https://www.jyshare.com/')
  }

  svgEditor() {
    openOnlineWebPage('https://www.jyshare.com/more/svgeditor/')
  }

  shapeFlyDiagram() {
    openOnlineWebPage('https://www.jyshare.com/more/shapefly-diagram/')
  }

  office() {
    openOnlineWebPage('https://www.jyshare.com/office/')
  }

}

class onlineWebPage {
  mermaidLiveEdit() {
    openOnlineWebPage('https://mermaid.live/edit')
  }

  plantumlServe() {
    openOnlineWebPage('http://www.plantuml.com/plantuml/uml/')
  }

  plantText() {
    openOnlineWebPage('https://www.planttext.com/')
  }

  mindLineWebapp() {
    openOnlineWebPage('https://www.mindline.cn/webapp')
  }

  diagramsNet() {
    openOnlineWebPage('https://app.diagrams.net/')
  }

  frontEnd() {
    openOnlineWebPage('https://www.jyshare.com/front-end/7688/')
  }
}

export class hemyDialog {
  mainWindow: Electron.BrowserWindow
  jy: jyShare
  web: onlineWebPage

  constructor(mainWindow: Electron.BrowserWindow) {
    this.mainWindow = mainWindow
    this.jy = new jyShare()
    this.web = new onlineWebPage()
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
