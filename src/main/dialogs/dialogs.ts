import { openOnlineWebPage } from './OpenOnlineWebPages'
import { showFontSelectDialog } from './ShowFontSelectDialog'
import { showMarkdownSheetDialog } from './ShowMdSheetDialog'
import { showMathTextDialog } from './ShowMathTextDialog'
import { showMermaidEditDialog } from './ShowMermaidEditDialog'

function OpenMermaidLiveEditor() {
  openOnlineWebPage('https://mermaid.live/edit')
}

function OpenPlantUmlOnline() {
  openOnlineWebPage('http://www.plantuml.com/plantuml/uml/')
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
  showMermaidEditDialog
}
