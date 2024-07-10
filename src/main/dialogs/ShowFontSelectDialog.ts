import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'

let fontSelectDialog: Electron.BrowserWindow | null

export function ShowFontSelectDialog(mainWindow: Electron.BrowserWindow) {
  createFontSelectDialog(mainWindow)
}
// 创建一个自定义对话框的函数
function createFontSelectDialog(mainWindow: Electron.BrowserWindow) {
  fontSelectDialog = new BrowserWindow({
    width: 930,
    height: 600,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: '文字样式选择',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  if (!fontSelectDialog) {
    return
  }

  fontSelectDialog.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  fontSelectDialog.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(makeFontDialogHtml())}`
  )

  // 当窗口关闭时，清除引用
  fontSelectDialog.on('closed', () => {
    fontSelectDialog = null
    ipcMain.removeListener('dialog-user-font-select-btn-insert', processCustomFontDialogApply)
    ipcMain.removeListener('dialog-user-font-select-btn-cancel', () => {})
  })

  // 显示窗口
  fontSelectDialog.show()

  function exitFontSelectDialog() {
    if (fontSelectDialog) {
      ipcMain.removeListener('dialog-user-font-select-btn-insert', processCustomFontDialogApply)
      ipcMain.removeListener('dialog-user-font-select-btn-cancel', () => {})
      fontSelectDialog.close()
      fontSelectDialog = null
    }
  }

  function processCustomFontDialogApply(_, inputData) {
    let htmlContext = inputData.textInput
    const fontBold = '<b>'
    const fontItalic = '<i>'
    const fontUnderline = '<u>'
    const fontDeleteLine = '<s>'
    htmlContext = '\r\n' + htmlContext + '\r\n'
    if (inputData.fontBold) {
      htmlContext = fontBold + htmlContext + '</b>'
    }
    if (inputData.fontItalic) {
      htmlContext = fontItalic + htmlContext + '</i>'
    }
    if (inputData.fontUnderline) {
      htmlContext = fontUnderline + htmlContext + '</u>'
      if (inputData.fontDeleteLine) {
        htmlContext = fontDeleteLine + htmlContext + '</s>'
      }
    } else {
      if (inputData.fontDeleteLine) {
        htmlContext = fontUnderline + htmlContext + '</s>'
      }
    }
    let fontBefore = '<span style="'
    fontBefore += `font-size: ${inputData.fontSize}; `
    fontBefore += `color: ${inputData.fontColor}; `
    fontBefore += `background-color: ${inputData.fontBackGroundColor}; `
    fontBefore += `font-family: '${inputData.fontFamily}';`
    fontBefore += `text-align: ${inputData.textAlign};`
    fontBefore += `display: block;`
    fontBefore += '">' + htmlContext
    htmlContext = fontBefore + '</span>\n'
    mainWindow.webContents.send('monaco-insert-text-block-templates', htmlContext)
    exitFontSelectDialog()
  }
  ipcMain.on('dialog-user-font-select-btn-insert', processCustomFontDialogApply)

  ipcMain.on('dialog-user-font-select-btn-cancel', () => {
    exitFontSelectDialog()
  })
}

function createLabelList(doc: Document): HTMLElement {
  const labelStyle = 'width: 100px;margin: 5px;text-align: right;'
  const labels: digcom.Label[] = [
    { forHtml: 'edit-font-family', text: '选择字体：', divCss: labelStyle },
    { forHtml: 'edit-font-size', text: '字体大小：', divCss: labelStyle },
    { forHtml: 'edit-font-color', text: '字体颜色：', divCss: labelStyle },
    { forHtml: 'edit-font-color', text: '', divCss: 'height: 105px' },
    { forHtml: 'backgroundColor', text: '背\u00A0\u00A0景\u00A0\u00A0色：', divCss: labelStyle },
    { forHtml: 'backgroundColor', text: '', divCss: 'height: 100px' }
  ]

  const LabelList = digcom.NewLabelList(doc, labels)
  LabelList.style.cssText = 'margin-top: 10px; display: flex; flex-direction: column;'
  return LabelList
}

function createFontFamilySelect(doc: Document): HTMLElement {
  const options: digcom.Option[] = [
    { value: 'Arial', optCss: "font-family: 'Arial'" },
    { value: 'Cascadia Code', optCss: "font-family: 'Cascadia Code'" },
    { value: 'Consolas', optCss: "font-family: 'Consolas'" },
    { value: 'DejaVu Sans Mono', optCss: "font-family: 'DejaVu Sans Mono'" },
    { value: 'Droid Sans', optCss: "font-family: 'Droid Sans'" },
    { value: 'Fira Sans', optCss: "font-family: 'Fira Sans'" },
    { value: 'Fira Code', optCss: "font-family: 'Fira Code'" },
    { value: 'Hack', optCss: "font-family: 'Hack'" },
    { value: 'Helvetica Neue', optCss: "font-family: 'Helvetica Neue'" },
    { value: 'Inter', optCss: "font-family: 'Inter'" },
    { value: 'JetBrains Mono', optCss: "font-family: 'JetBrains Mono'" },
    { value: 'Menlo', optCss: "font-family: 'Menlo'" },
    { value: 'Roboto', optCss: "font-family: 'Roboto'" },
    { value: 'Oxygen', optCss: "font-family: 'Oxygen'" },
    { value: 'sans-serif', optCss: "font-family: 'sans-serif'" },
    { value: 'Segoe UI', optCss: "font-family: 'Segoe UI'" },
    { value: 'SimHei', optCss: "font-family: 'SimHei'" },
    { value: 'Source Code Pro', optCss: "font-family: 'Source Code Pro'" },
    { value: 'Ubuntu', optCss: "font-family: 'Ubuntu'" },
    { value: 'Ubuntu Mono', optCss: "font-family: 'Ubuntu Mono'" }
  ]

  const FontFamily = digcom.NewSelect(doc, options)
  FontFamily.name = 'edit-font-family'
  FontFamily.id = 'edit-font-family'

  const DivEle = doc.createElement('div')
  DivEle.className = 'input-style'
  DivEle.style.cssText = 'width:250px;margin-top: 15px;'
  DivEle.appendChild(FontFamily)
  return DivEle
}

function createFontSizeSelect(doc: Document): HTMLElement {
  const options: digcom.Option[] = []
  for (let i = 5; i < 40; i++) {
    options.push({ value: `${i}pt` })
  }

  const FontSize = digcom.NewSelect(doc, options)
  FontSize.name = 'edit-font-size'
  FontSize.id = 'edit-font-size'

  const DivEle = doc.createElement('div')
  DivEle.className = 'input-style'
  DivEle.style.cssText = 'width: 80px;margin-top: 15px;'
  DivEle.appendChild(FontSize)
  return DivEle
}

const colors = [
  '#000000', // 黑色
  '#333333', // 更深的灰色
  '#404040', // 深灰色
  '#000080', // 海军蓝
  '#0000FF', // 海军蓝
  '#00FF00', // 暗绿色
  '#009900', // 暗绿色
  '#004400', // 暗绿色
  '#808000', // 橄榄绿
  '#FF0000', // 暗红色
  '#BB0000', // 暗红色
  '#8B0000', // 暗红色
  '#008080', // 水绿色
  '#ADD8E6', // 浅蓝色
  '#DDA0DD', // 浅紫色
  '#90EE90', // 浅绿色
  '#8FBC8F', // 老花色
  '#D2691E', // 巧克力色
  '#CD853F', // 棕色
  '#DEB887', // 枯叶色
  '#F08080', // 浅珊瑚色
  '#E9967A', // 土黄色
  '#FFA07A', // 浅橙色
  '#FFA500', // 橙色
  '#FFD700', // 金色
  '#FADEAD', // 浅肉色
  '#FFB6C1', // 浅粉红色
  '#9932CC', // 中紫色
  '#EE82EE', // 淡紫色
  '#800080', // 紫色
  '#6A5ACD', // 亮紫色
  '#483D8B', // 暗紫色
  '#00CED1', // 暗青色
  '#00FFFF', // 青色
  '#00BFFF', // 天蓝色
  '#1E90FF', // 多瑙河蓝
  '#008B8B', // 暗青色
  '#32CD32', // 翠绿
  '#ADFF2F', // 鲜绿色
  '#F0FFF0', // 蜜糖色
  '#FFFAFA', // 乳白色
  '#E0FFFF', // 浅青色
  '#FFFF00', // 黄色
  '#F0E68C', // 浅米色
  '#CCCCCC', // 另一种中灰色
  '#808080', // 中灰色
  '#696969', // 深灰色变种
  '#87CEFA', // 浅蓝色
  '#6495ED', // 亮蓝色
  '#1DA1F2', // Twitter蓝
  '#3B5998', // Facebook蓝
  '#0077B5' // LinkedIn蓝
]

// 注意：由于颜色列表是手动添加的，并且包含了一些重复的或相似的颜色以保持总数为52，
// 因此在实际应用中可能需要根据具体需求进行调整。
// 另外，'#FFFAFA' 在列表中出现了两次，这里是为了凑数，通常应该避免重复。
function createColorList(doc: Document): HTMLElement {
  const colorButtons: digcom.Button[] = []
  colors.forEach((color) => {
    colorButtons.push({
      id: 'color-button',
      text: '',
      btnCss: `background-color: ${color};border: none;padding: 5;margin-top: 5px;`,
      btnClass: 'color-button'
    })
  })
  const colorDiv = doc.createElement('div')
  colorDiv.className = 'input-style'
  const colorInput = doc.createElement('input')
  colorInput.type = 'color'
  colorInput.id = 'edit-font-color'
  colorInput.style.cssText = 'width: 230px;margin-top: 5px;'
  colorDiv.appendChild(colorInput)
  colorDiv.appendChild(digcom.NewButtonList(doc, colorButtons))
  return colorDiv
}

function createBackgroundColorList(doc: Document): HTMLElement {
  const colorBackButtons: digcom.Button[] = []
  colors.forEach((color) => {
    colorBackButtons.push({
      id: 'background-color-button',
      text: '',
      btnCss: `background-color: ${color};border: none;padding: 5;margin-top: 10px;`,
      btnClass: 'background-color-button'
    })
  })
  const colorDiv = doc.createElement('div')
  colorDiv.className = 'input-style'
  const colorBackInput = doc.createElement('input')
  colorBackInput.type = 'color'
  colorBackInput.id = 'backgroundColor'
  colorBackInput.style.cssText = 'width: 230px;margin-top: 10px;'
  colorDiv.appendChild(colorBackInput)
  colorDiv.appendChild(digcom.NewButtonList(doc, colorBackButtons))
  return colorDiv
}

function createInputs(doc: Document): HTMLElement {
  const divEle = doc.createElement('div')
  divEle.style.cssText = 'display: flex; flex-direction: column;'
  divEle.appendChild(createFontFamilySelect(doc))
  divEle.appendChild(createFontSizeSelect(doc))
  divEle.appendChild(createColorList(doc))
  divEle.appendChild(createBackgroundColorList(doc))
  return divEle
}

function createEditPreview(doc: Document): HTMLElement {
  const divEle = doc.createElement('div')
  divEle.style.cssText =
    'margin-top: 5px; margin-left: 20px; display: flex; flex-direction: column;'

  const divEditArea = doc.createElement('div')
  divEditArea.appendChild(
    digcom.NewLabelDiv(doc, {
      divClass: 'label-style',
      forHtml: 'text-input-area',
      text: '编辑区域：'
    })
  )
  divEditArea.appendChild(
    digcom.NewTextArea(
      doc,
      'text-input-area',
      'width: 440px;height: 150px;overflow-y: auto;margin-top:10px'
    )
  )
  divEle.appendChild(divEditArea)

  const divLine = doc.createElement('div')
  divLine.style.cssText =
    'margin-top: 10px; height:2px; color:white; width:440px; display: flex; background-color: black'
  divEle.appendChild(divLine)

  const divPreArea = doc.createElement('div')
  divPreArea.style.cssText = 'margin-top: 5px'
  divPreArea.appendChild(
    digcom.NewLabelDiv(doc, { divClass: 'label-style', forHtml: 'previewText', text: '效果预览：' })
  )
  const preview = doc.createElement('div')
  preview.id = 'preview-area'
  preview.style.cssText = 'width: 440px;height: 250px; overflow:auto;'
  preview.innerHTML = '<p class="preview-text" id="previewText">这是一段预览文字。</p>'
  divPreArea.appendChild(preview)
  divEle.appendChild(divPreArea)
  return divEle
}

function createFontStyle1(doc: Document): HTMLElement {
  const labelStyle = 'width: 100px;margin: 5px;text-align: right;'
  const labels: digcom.Label[] = [
    {
      forHtml: 'edit-font-bold',
      text: '加\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0粗：',
      divCss: labelStyle
    },
    {
      forHtml: 'edit-font-italic',
      text: '倾\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0斜：',
      divCss: labelStyle
    },
    {
      forHtml: 'edit-font-underline',
      text: '下\u00A0\u00A0划\u00A0\u00A0线：',
      divCss: labelStyle
    },
    {
      forHtml: 'edit-font-deleteline',
      text: '删\u00A0\u00A0除\u00A0\u00A0线：',
      divCss: labelStyle
    }
  ]

  const LabelList = digcom.NewLabelList(doc, labels)
  LabelList.style.cssText = 'margin-top: 10px; display: flex; flex-direction: column;'
  return LabelList
}

function createFontStyleBox1(doc: Document): HTMLElement {
  const divEle = doc.createElement('div')
  divEle.style.cssText = 'margin: 7px;display: flex; flex-direction: column;'
  divEle.appendChild(digcom.NewCheckBox(doc, 'checkbox-style', 'edit-font-bold'))
  divEle.appendChild(digcom.NewCheckBox(doc, 'checkbox-style', 'edit-font-italic'))
  divEle.appendChild(digcom.NewCheckBox(doc, 'checkbox-style', 'edit-font-underline'))
  divEle.appendChild(digcom.NewCheckBox(doc, 'checkbox-style', 'edit-font-deleteline'))
  return divEle
}

function createFontStyle2(doc: Document): HTMLElement {
  const labelStyle = 'width: 100px;margin: 5px;text-align: right;'
  const labels: digcom.Label[] = [
    { forHtml: 'edit-align-left', text: '左\u00A0对\u00A0\u00A0齐：', divCss: labelStyle },
    { forHtml: 'edit-align-center', text: '居中对齐：', divCss: labelStyle },
    { forHtml: 'edit-align-right', text: '右\u00A0对\u00A0\u00A0齐：', divCss: labelStyle },
    { forHtml: 'edit-align-justify', text: '两端对齐：', divCss: labelStyle }
  ]

  const LabelList = digcom.NewLabelList(doc, labels)
  LabelList.style.cssText =
    'margin-top: 10px;margin-left: 40px; display: flex; flex-direction: column;'
  return LabelList
}

function createFontStyleBox2(doc: Document): HTMLElement {
  const divEle = doc.createElement('div')
  divEle.style.cssText = 'margin: 7px;display: flex; flex-direction: column;'
  divEle.appendChild(digcom.NewCheckBox(doc, 'checkbox-style', 'edit-align-left'))
  divEle.appendChild(digcom.NewCheckBox(doc, 'checkbox-style', 'edit-align-center'))
  divEle.appendChild(digcom.NewCheckBox(doc, 'checkbox-style', 'edit-align-right'))
  divEle.appendChild(digcom.NewCheckBox(doc, 'checkbox-style', 'edit-align-justify'))
  return divEle
}

function createFontStyle(doc: Document): HTMLElement {
  const div = doc.createElement('div')
  div.style.cssText = 'display: flex; flex-direction: row;'
  div.appendChild(createFontStyle1(doc))
  div.appendChild(createFontStyleBox1(doc))
  div.appendChild(createFontStyle2(doc))
  div.appendChild(createFontStyleBox2(doc))
  return div
}

function createFontSizeColor(doc: Document): HTMLElement {
  const divRow = doc.createElement('div')
  divRow.style.cssText = 'display: flex; flex-direction: row;'
  divRow.appendChild(createLabelList(doc))
  divRow.appendChild(createInputs(doc))
  const div = doc.createElement('div')
  div.style.cssText = 'display: flex; flex-direction: column;'
  div.appendChild(divRow)
  div.appendChild(createFontStyle(doc))
  return div
}

function createBodyDiv(doc: Document): HTMLElement {
  const div = doc.createElement('div')
  div.style.cssText = 'display: flex; flex-direction: row;margin-left: 20px;'
  div.appendChild(createFontSizeColor(doc))
  const divLine = doc.createElement('div')
  divLine.style.cssText =
    'margin-top: 10px; margin-left: 20px; width:2px; color:white; height:460px; display: flex; background-color: black'
  div.appendChild(divLine)
  div.appendChild(createEditPreview(doc))
  return div
}

function createButtonList(doc: Document): HTMLElement {
  const buttons: digcom.Button[] = [
    { id: 'font-select-apply', text: '应用', btnCss: 'width: 125px;margin-top: 10px' },
    { id: 'font-select-cancel', text: '取消', btnCss: 'width: 125px;margin-top: 10px' }
  ]

  const btnList = digcom.NewButtonList(doc, buttons)
  btnList.style.cssText =
    'width:900px;margin-top:5px; display:flex; justify-content:center;align-items:center;gap: 200px'
  return btnList
}

function makeFontDialogHtml(): string {
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>特殊文字编辑</title></head><body></body></html>`
  ).window

  const webDivStyle = document.createElement('style')
  webDivStyle.textContent = `
    .label-style {width: 100px;margin-top: 5px;text-align: center;}
    .input-style {width: 250px;margin-top: 5px;}
    .checkbox-style {margin-top: 11px;margin-left:5px}
    .color-button {width: 18px;height: 18px;border-width:1px;}
    .background-color-button {width: 18px;height: 18px;border-width:1px;}`
  document.head.appendChild(webDivStyle)
  const divBody = createBodyDiv(document)
  document.body.appendChild(divBody)
  document.body.appendChild(createButtonList(document))

  const eleScript = document.createElement('script')
  eleScript.textContent = `
    const { ipcRenderer } = require('electron')
    let fontStyle = {
      fontFamily:"Arial",
      fontSize: "15pt",
      fontColor: "#000000",
      fontBackGroundColor:"#FFFFFF",
      fontBold: false,
      fontItalic: false,
      fontUnderline:false,
      fontDeleteLine:false,
      textAlign: 'left',
      textInput: ''
    }
    function updateFontFamily(event) {
      fontStyle.fontFamily = event.target.value
      document.getElementById("previewText").style.fontFamily = event.target.value
    }
    function updateFontSize(event) {
      fontStyle.fontSize = event.target.value
      document.getElementById("previewText").style.fontSize = event.target.value
    }
    function updateFontColor(event) {
      fontStyle.fontColor = event.target.value
      document.getElementById("previewText").style.color = event.target.value
    }
    function updateBackgroundColor(event) {
      fontStyle.fontBackGroundColor = event.target.value
      document.getElementById("previewText").style.backgroundColor = event.target.value
    }
    function updateFontBold(event) {
      if (event.target.checked) {
        document.getElementById("previewText").style.fontWeight = 'bold';
        fontStyle.fontBold = true
      }
    }
    function updateFontItalic(event) {
      if (event.target.checked) {
        document.getElementById("previewText").style.fontStyle = 'italic';
        fontStyle.fontItalic = true
      }
    }
    function updateFontUnderline(event) {
      if (event.target.checked) {
        document.getElementById("previewText").style.textDecoration += ' underline';
        fontStyle.fontUnderline = true
      }
    }
    function updateFontDeleteLine(event) {
      if (event.target.checked) {
        document.getElementById("previewText").style.textDecoration += ' line-through';
        fontStyle.fontDeleteLine = true
      }
    }
    function updateAlignLeft(event) {
      if (event.target.checked) {
        document.getElementById("previewText").style.textAlign = 'left';
        fontStyle.textAlign = 'left'
      }
    }
    function updateAlignCenter(event) {
      if (event.target.checked) {
        document.getElementById("previewText").style.textAlign = 'center'
        fontStyle.textAlign = 'center'
      }
    }
    function updateAlignRight(event) {
      if (event.target.checked) {
        document.getElementById("previewText").style.textAlign = 'right'
        fontStyle.textAlign = 'right'
      }
    }
    function updateAlignJustify(event) {
      if (event.target.checked) {
        document.getElementById("previewText").style.textAlign = 'justify'
        fontStyle.textAlign = 'justify'
      }
    }
    function updateTextInput(event) {
      const inputText = event.target.value
      document.getElementById("previewText").innerText = inputText
      fontStyle.textInput = inputText
    }
    // 监听文本输入和样式输入的变化
    document.getElementById('edit-font-family').addEventListener('input', updateFontFamily)
    document.getElementById('edit-font-size').addEventListener('input', updateFontSize)
    document.getElementById('edit-font-color').addEventListener('input', updateFontColor)
    document.getElementById('backgroundColor').addEventListener('input', updateBackgroundColor)
    document.getElementById('edit-font-bold').addEventListener('input', updateFontBold)
    document.getElementById('edit-font-italic').addEventListener('input', updateFontItalic)
    document.getElementById('edit-font-underline').addEventListener('input', updateFontUnderline)
    document.getElementById('edit-font-deleteline').addEventListener('input', updateFontDeleteLine)
    document.getElementById('edit-align-left').addEventListener('input', updateAlignLeft)
    document.getElementById('edit-align-center').addEventListener('input', updateAlignCenter)
    document.getElementById('edit-align-right').addEventListener('input', updateAlignRight)
    document.getElementById('edit-align-justify').addEventListener('input', updateAlignJustify)
    document.getElementById('text-input-area').addEventListener('input', updateTextInput)
    document.getElementById('font-select-apply').onclick = function(e) {
      ipcRenderer.send('dialog-user-font-select-btn-insert', fontStyle)
    }
    document.getElementById('font-select-cancel').onclick = function(e) {
      ipcRenderer.send('dialog-user-font-select-btn-cancel')
    }
    const buttons = document.querySelectorAll('.color-button')
    buttons.forEach((button) => {
      const color = button.style.backgroundColor || '#000000';
      button.onclick = () => {
        fontStyle.fontColor = color
        document.getElementById('edit-font-color').value = color;
        document.getElementById("previewText").style.color = color
      }
    })
    const backButtons = document.querySelectorAll('.background-color-button')
    backButtons.forEach((button) => {
      const color = button.style.backgroundColor || '#000000';
      button.onclick = () => {
        fontStyle.fontBackGroundColor = color
        document.getElementById('backgroundColor').value = color;
        document.getElementById("previewText").style.backgroundColor = color
      }
    })`
  document.body.appendChild(eleScript)
  return document.documentElement.outerHTML
}
