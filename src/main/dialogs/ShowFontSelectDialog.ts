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
    width: 830,
    height: 530,
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
    fontBefore += `font-family='${inputData.fontFamily}';`
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
    { forHtml: 'fontFamily', text: '选择字体：', divCss: labelStyle },
    { forHtml: 'fontSize', text: '字体大小：', divCss: labelStyle },
    { forHtml: 'fontColor', text: '字体颜色：', divCss: labelStyle },
    { forHtml: 'fontColor', text: '', divCss: 'height: 60px' },
    { forHtml: 'backgroundColor', text: '背\u00A0\u00A0景\u00A0\u00A0色：', divCss: labelStyle },
    { forHtml: 'backgroundColor', text: '', divCss: 'height: 60px' },
    {
      forHtml: 'fontBold',
      text: '加\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0粗：',
      divCss: labelStyle
    },
    {
      forHtml: 'fontItalic',
      text: '倾\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0斜：',
      divCss: labelStyle
    },
    { forHtml: 'fontUnderline', text: '下\u00A0\u00A0划\u00A0\u00A0线：', divCss: labelStyle },
    { forHtml: 'fontDeleteLine', text: '删\u00A0\u00A0除\u00A0\u00A0线：', divCss: labelStyle }
  ]

  const LabelList = digcom.NewLabelList(doc, labels)
  LabelList.style.cssText =
    'margin-top: 10px; margin-left: 20px; display: flex; flex-direction: column;'
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
  FontFamily.name = 'editor-font-family'
  FontFamily.id = 'editor-font-family'

  const DivEle = doc.createElement('div')
  DivEle.className = 'input-style'
  DivEle.appendChild(FontFamily)
  return DivEle
}

function createFontSizeSelect(doc: Document): HTMLElement {
  const options: digcom.Option[] = []
  for (let i = 5; i < 40; i++) {
    options.push({ value: `${i}pt` })
  }

  const FontSize = digcom.NewSelect(doc, options)
  FontSize.name = 'editor-font-size'
  FontSize.id = 'editor-font-size'

  const DivEle = doc.createElement('div')
  DivEle.className = 'input-style'
  DivEle.style.cssText = 'width: 40px'
  DivEle.appendChild(FontSize)
  return DivEle
}

const colors = [
  '#FFFFFF',
  '#000000',
  '#FF00FF',
  '#0000FF',
  '#0184bb',
  '#4078f2',
  '#00FFFF',
  '#FF0000',
  '#228B22',
  '#00FF00',
  '#ADFF2F',
  '#f0dc4e',
  '#FFFF00',
  '#986801',
  '#c18401',
  '#e45649'
]

function createColorList(doc: Document): HTMLElement {
  const colorButtons: digcom.Button[] = []
  colors.forEach((color) => {
    colorButtons.push({
      id: 'color-button',
      text: '',
      btnCss: `background-color: ${color};border: none;padding: 5;`,
      btnClass: 'color-button'
    })
  })
  const colorDiv = doc.createElement('div')
  colorDiv.className = 'input-style'
  const colorInput = doc.createElement('input')
  colorInput.type = 'color'
  colorInput.id = 'fontColor'
  colorInput.style.cssText = 'width: 160px'
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
      btnCss: `background-color: ${color};border: none;padding: 5;`,
      btnClass: 'color-button'
    })
  })
  const colorDiv = doc.createElement('div')
  colorDiv.className = 'input-style'
  const colorBackInput = doc.createElement('input')
  colorBackInput.type = 'color'
  colorBackInput.id = 'backgroundColor'
  colorBackInput.style.cssText = 'width: 160px'
  colorDiv.appendChild(colorBackInput)
  colorDiv.appendChild(digcom.NewButtonList(doc, colorBackButtons))
  return colorDiv
}

function createInputs(doc: Document): HTMLElement {
  const divEle = doc.createElement('div')
  divEle.style.cssText = 'margin-top: 10px;display: flex; flex-direction: column;'
  divEle.appendChild(createFontFamilySelect(doc))
  divEle.appendChild(createFontSizeSelect(doc))
  divEle.appendChild(createColorList(doc))
  divEle.appendChild(createBackgroundColorList(doc))
  divEle.appendChild(digcom.NewCheckBox(doc, 'input-style', 'fontBold'))
  divEle.appendChild(digcom.NewCheckBox(doc, 'input-style', 'fontItalic'))
  divEle.appendChild(digcom.NewCheckBox(doc, 'input-style', 'fontUnderline'))
  divEle.appendChild(digcom.NewCheckBox(doc, 'input-style', 'fontDeleteLine'))
  return divEle
}

function createEditPreview(doc: Document): HTMLElement {
  const divEle = doc.createElement('div')
  divEle.style.cssText =
    'margin-top: 10px; margin-left: 20px; display: flex; flex-direction: column;'

  const divEditArea = doc.createElement('div')
  divEditArea.appendChild(
    digcom.NewLabelDiv(doc, { divClass: 'label-style', forHtml: 'textInput', text: '编辑区域：' })
  )
  divEditArea.appendChild(
    digcom.NewTextArea(doc, 'textInput', 'width: 400px;height: 140px;overflow-y: auto;')
  )
  divEle.appendChild(divEditArea)

  const divLine = doc.createElement('div')
  divLine.style.cssText =
    'margin-top: 10px; height:2px; color:white; width:350px; display: flex; background-color: black'
  divEle.appendChild(divLine)

  const divPreArea = doc.createElement('div')
  divPreArea.style.cssText = 'margin-top: 10px'
  divPreArea.appendChild(
    digcom.NewLabelDiv(doc, { divClass: 'label-style', forHtml: 'previewText', text: '效果预览：' })
  )
  const preview = doc.createElement('div')
  preview.id = 'preview-area'
  preview.style.cssText = 'width: 400px;height: 140px; overflow:auto;'
  preview.innerHTML = '<p class="preview-text" id="previewText">这是一段预览文字。</p>'
  divPreArea.appendChild(preview)
  divEle.appendChild(divPreArea)
  return divEle
}

function createBodyDiv(doc: Document): HTMLElement {
  const div = doc.createElement('div')
  div.style.cssText = 'display: flex; flex-direction: row; margin-left: 20px;'
  div.appendChild(createLabelList(doc))
  div.appendChild(createInputs(doc))
  const divLine = doc.createElement('div')
  divLine.style.cssText =
    'margin-top: 10px; margin-left: 20px; width:2px; color:white; height:370px; display: flex; background-color: black'
  div.appendChild(divLine)
  div.appendChild(createEditPreview(doc))
  return div
}

function makeFontDialogHtml(): string {
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>特殊文字编辑</title></head><body></body></html>`
  ).window

  const webDivStyle = document.createElement('style')
  webDivStyle.textContent = `
    .label-style {width: 100px;margin-top: 12px;text-align: center;}
    .input-style {width: 170px;margin-top: 10px;}
    .color-button {width: 18px;height: 18px;margin-top: 10px;border-width:1px;}`
  document.head.appendChild(webDivStyle)

  const divBody = createBodyDiv(document)
  document.body.appendChild(divBody)

  const eleScript = document.createElement('script')
  eleScript.textContent = `
    const { ipcRenderer } = require('electron');
    let SystemSetting = {
      language:"zh-cn",
      resourceManager: "default",
      editorModel: 'default'
    };
    document.getElementById('system-language').addEventListener('input', (event) => {
      SystemSetting.language = event.target.value
    })
    document.getElementById('system-resource-manager').addEventListener('input', (event) => {
      SystemSetting.resourceManager = event.target.value
    })
    document.getElementById('system-editor-view-model').addEventListener('input', (event) => {
      SystemSetting.editorModel = event.target.value
    })
    document.getElementById('system-setting-apply').onclick = function(e) {
      ipcRenderer.send('dialog-system-setting-apply', SystemSetting)
    }
    document.getElementById('system-setting-cancel').onclick = function(e) {
      ipcRenderer.send('dialog-system-setting-cancel')
    }`

  document.body.appendChild(eleScript)
  return document.documentElement.outerHTML
}

/*
const CustomFontDialogHtml =
  '<!DOCTYPE html>\n' +
  '<html lang="zh">\n' +
  '  <head>\n' +
  '    <meta charset="UTF-8">\n' +
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  '    <title>文字样式选择</title>\n' +
  '    <style>\n' +
  '      .label-style {\n' +
  '        width: 100px;\n' +
  '        margin-top: 12px;\n' +
  '        text-align: center;\n' +
  '      }\n' +
  '      .input-style  {\n' +
  '        width: 170px;\n' +
  '        margin-top: 10px;\n' +
  '      }\n' +
  '      .color-button {\n' +
  '        width: 10px;\n' +
  '        height: 15px;\n' +
  '        margin-top: 10px;\n' +
  '      }\n' +
  '    </style>\n' +
  '  </head>\n' +
  '  <body>\n' +
  '  <div style="display: flex; flex-direction: row; margin-left: 20px;">\n' +
  '    <div style="margin-top: 10px; margin-left: 20px; display: flex; flex-direction: column;">\n' +
  '      <div class="label-style"><label for="fontFamily">选择字体：</label></div>\n' +
  '      <div class="label-style"><label for="fontSize">字体大小：</label></div>\n' +
  '      <div class="label-style"><label for="fontColor">字体颜色：</label></div>\n' +
  '      <div class="label-style" style="height: 40px"><label for="fontColor"></label></div>\n' +
  '      <div class="label-style"><label for="backgroundColor">背&nbsp;&nbsp;景&nbsp;色：</label></div>\n' +
  '      <div class="label-style" style="height: 40px"><label for="backgroundColor"></label></div>\n' +
  '      <div class="label-style"><label for="fontBold">加&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;粗：</label></div>\n' +
  '      <div class="label-style"><label for="fontItalic">倾&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;斜：</label></div>\n' +
  '      <div class="label-style"><label for="fontUnderline">下&nbsp;&nbsp;划&nbsp;线：</label></div>\n' +
  '      <div class="label-style"><label for="fontDeleteLine">删&nbsp;&nbsp;除&nbsp;线：</label></div>\n' +
  '    </div>\n' +
  '    <div style="margin-top: 10px;display: flex; flex-direction: column;">\n' +
  '      <div class="input-style">\n' +
  '        <select name="editor-font" id="fontFamily">\n' +
  '          <option value="Arial" style="font-family: \'Arial\'">Arial</option>\n' +
  '          <option value="Cascadia Code" style="font-family: \'Cascadia Code\'">Cascadia Code</option>\n' +
  '          <option value="Consolas" style="font-family: \'Consolas\'">Consolas</option>\n' +
  '          <option value="DejaVu Sans Mono" style="font-family: \'DejaVu Sans Mono\'">DejaVuSans Mono</option>\n' +
  '          <option value="Fira Code" style="font-family: \'Droid Sans\'">Droid Sans</option>\n' +
  '          <option value="Fira Code" style="font-family: \'Fira Sans\'">Fira Sans</option>\n' +
  '          <option value="Fira Code" style="font-family: \'Fira Code\'">Fira Code</option>\n' +
  '          <option value="Hack" style="font-family: \'Hack\'">Hack</option>\n' +
  '          <option value="Hack" style="font-family: \'Helvetica Neue\'">Helvetica Neue</option>\n' +
  '          <option value="Hack" style="font-family: \'Inter\'">Inter</option>\n' +
  '          <option value="JetBrains Mono" style="font-family: \'JetBrains Mono\'">JetBrains Mono</option>\n' +
  '          <option value="Menlo" style="font-family: \'Menlo\'">Menlo</option>\n' +
  '          <option value="SimHei" style="font-family: \'Roboto\'">Roboto</option>\n' +
  '          <option value="SimHei" style="font-family: \'Oxygen\'">Oxygen</option>\n' +
  '          <option value="SimHei" style="font-family: \'sans-serif\'">sans-serif</option>\n' +
  '          <option value="SimHei" style="font-family: \'Segoe UI\'">Segoe UI</option>\n' +
  '          <option value="SimHei" style="font-family: \'SimHei\'">SimHei</option>\n' +
  '          <option value="Source Code Pro" style="font-family: \'Source Code Pro\'">Source Code Pro</option>\n' +
  '          <option value="SimHei" style="font-family: \'Ubuntu\'">Ubuntu</option>\n' +
  '          <option value="Ubuntu Mono" style="font-family: \'Ubuntu Mono\'">Ubuntu Mono</option>\n' +
  '        </select>\n' +
  '      </div>\n' +
  '      <div class="input-style" style="width: 40px">\n' +
  '        <select name="editor-font-size" id="fontSize">\n' +
  '          <option value="5pt">5pt</option>\n' +
  '          <option value="6pt">6pt</option>\n' +
  '          <option value="7pt">7pt</option>\n' +
  '          <option value="8pt">8pt</option>\n' +
  '          <option value="9pt">9pt</option>\n' +
  '          <option value="10pt">10pt</option>\n' +
  '          <option value="11pt">11pt</option>\n' +
  '          <option value="12pt">12pt</option>\n' +
  '          <option value="13pt">13pt</option>\n' +
  '          <option value="14pt">14pt</option>\n' +
  '          <option value="15pt">15pt</option>\n' +
  '          <option value="16pt">16pt</option>\n' +
  '          <option value="17pt">17pt</option>\n' +
  '          <option value="18pt">18pt</option>\n' +
  '          <option value="19pt">19pt</option>\n' +
  '          <option value="20pt">20pt</option>\n' +
  '          <option value="21pt">21pt</option>\n' +
  '          <option value="22pt">22pt</option>\n' +
  '          <option value="23pt">23pt</option>\n' +
  '          <option value="24pt">24pt</option>\n' +
  '          <option value="25pt">25pt</option>\n' +
  '          <option value="26pt">26pt</option>\n' +
  '          <option value="27pt">27pt</option>\n' +
  '          <option value="28pt">28pt</option>\n' +
  '          <option value="29pt">29pt</option>\n' +
  '          <option value="30pt">30pt</option>\n' +
  '          <option value="31pt">31pt</option>\n' +
  '          <option value="32pt">32pt</option>\n' +
  '          <option value="33pt">33pt</option>\n' +
  '        </select>\n' +
  '      </div>\n' +
  '      <div class="input-style"><input type="color" id="fontColor" style="width: 160px">\n' +
  '        <div>\n' +
  '          <button class="color-button" style="background-color: #FFFFFF;" onClick="setColor(\'#ffffff\')"></button>\n' +
  '          <button class="color-button" style="background-color: #000000;" onClick="setColor(\'#000000\')"></button>\n' +
  '          <button class="color-button" style="background-color: #FF00FF;" onClick="setColor(\'#FF00FF\')"></button>\n' +
  '          <button class="color-button" style="background-color: #0000FF;" onClick="setColor(\'#0000FF\')"></button>\n' +
  '          <button class="color-button" style="background-color: #0184bb;" onClick="setColor(\'#0184bb\')"></button>\n' +
  '          <button class="color-button" style="background-color: #4078f2;" onClick="setColor(\'#4078f2\')"></button>\n' +
  '          <button class="color-button" style="background-color: #00FFFF;" onClick="setColor(\'#00FFFF\')"></button>\n' +
  '          <button class="color-button" style="background-color: #FF0000;" onClick="setColor(\'#FF0000\')"></button>\n' +
  '          <button class="color-button" style="background-color: #228B22;" onClick="setColor(\'#228B22\')"></button>\n' +
  '          <button class="color-button" style="background-color: #00FF00;" onClick="setColor(\'#00FF00\')"></button>\n' +
  '          <button class="color-button" style="background-color: #ADFF2F;" onClick="setColor(\'#ADFF2F\')"></button>\n' +
  '          <button class="color-button" style="background-color: #f0dc4e;" onClick="setColor(\'#f0dc4e\')"></button>\n' +
  '          <button class="color-button" style="background-color: #FFFF00;" onClick="setColor(\'#FFFF00\')"></button>\n' +
  '          <button class="color-button" style="background-color: #986801;" onClick="setColor(\'#986801\')"></button>\n' +
  '          <button class="color-button" style="background-color: #c18401;" onClick="setColor(\'#c18401\')"></button>\n' +
  '          <button class="color-button" style="background-color: #e45649;" onClick="setColor(\'#e45649\')"></button>\n' +
  '        </div>\n' +
  '      </div>\n' +
  '      <div class="input-style"><input type="color" id="backgroundColor" style="width: 160px">\n' +
  '        <div>\n' +
  '          <button class="color-button" style="background-color: #FFFFFF;" onClick="setBackGroundColor(\'#ffffff\')"></button>\n' +
  '          <button class="color-button" style="background-color: #000000;" onClick="setBackGroundColor(\'#000000\')"></button>\n' +
  '          <button class="color-button" style="background-color: #FF00FF;" onClick="setBackGroundColor(\'#FF00FF\')"></button>\n' +
  '          <button class="color-button" style="background-color: #0000FF;" onClick="setBackGroundColor(\'#0000FF\')"></button>\n' +
  '          <button class="color-button" style="background-color: #0184bb;" onClick="setBackGroundColor(\'#0184bb\')"></button>\n' +
  '          <button class="color-button" style="background-color: #4078f2;" onClick="setBackGroundColor(\'#4078f2\')"></button>\n' +
  '          <button class="color-button" style="background-color: #00FFFF;" onClick="setBackGroundColor(\'#00FFFF\')"></button>\n' +
  '          <button class="color-button" style="background-color: #FF0000;" onClick="setBackGroundColor(\'#FF0000\')"></button>\n' +
  '          <button class="color-button" style="background-color: #228B22;" onClick="setBackGroundColor(\'#228B22\')"></button>\n' +
  '          <button class="color-button" style="background-color: #00FF00;" onClick="setBackGroundColor(\'#00FF00\')"></button>\n' +
  '          <button class="color-button" style="background-color: #ADFF2F;" onClick="setBackGroundColor(\'#ADFF2F\')"></button>\n' +
  '          <button class="color-button" style="background-color: #f0dc4e;" onClick="setBackGroundColor(\'#f0dc4e\')"></button>\n' +
  '          <button class="color-button" style="background-color: #FFFF00;" onClick="setBackGroundColor(\'#FFFF00\')"></button>\n' +
  '          <button class="color-button" style="background-color: #986801;" onClick="setBackGroundColor(\'#986801\')"></button>\n' +
  '          <button class="color-button" style="background-color: #c18401;" onClick="setBackGroundColor(\'#c18401\')"></button>\n' +
  '          <button class="color-button" style="background-color: #e45649;" onClick="setBackGroundColor(\'#e45649\')"></button>\n' +
  '        </div>\n' +
  '      </div>\n' +
  '      <div class="input-style"><input type="checkbox" id="fontBold"></div>\n' +
  '      <div class="input-style"><input type="checkbox" id="fontItalic"></div>\n' +
  '      <div class="input-style"><input type="checkbox" id="fontUnderline"></div>\n' +
  '      <div class="input-style"><input type="checkbox" id="fontDeleteLine"></div>\n' +
  '    </div>\n' +
  '    <div style="margin-top: 10px; margin-left: 20px; width:2px; color:white; height:370px; display: flex; background-color: black"></div>\n' +
  '    <div style="margin-top: 10px; margin-left: 20px; display: flex; flex-direction: column;">\n' +
  '      <div>\n' +
  '        <div class="label-style"><label for="textInput">编辑区域：</label></div>\n' +
  '        <textarea id="textInput" style="width: 400px;height: 140px;overflow-y: auto;"></textarea>\n' +
  '      </div>\n' +
  '      <div style="margin-top: 10px; height:2px; color:white; width:350px; display: flex; background-color: black"></div>\n' +
  '      <div style="margin-top: 10px">\n' +
  '        <div class="label-style"><label for="previewText">效果预览：</label></div>\n' +
  '        <div id="preview-area" style="width: 400px;height: 140px; overflow:auto;">\n' +
  '          <p class="preview-text" id="previewText">这是一段预览文字。</p>\n' +
  '        </div>\n' +
  '      </div>\n' +
  '    </div>\n' +
  '  </div>\n' +
  '  <button id="applyButton" onClick="sendUserInputFontStyle()" style="width: 125px;margin-top: 30px;margin-left: 100px;">应用</button>\n' +
  '  <button id="cancelButton" onClick="sendDialogCancelFontStyle()" style="width: 125px;margin-top: 30px;margin-left: 300px;">取消</button>\n' +
  '  <script>\n' +
  "    const { ipcRenderer } = require('electron');\n" +
  '    let fontStyle = {\n' +
  '      fontFamily:"Arial",\n' +
  '      fontSize: "15pt",\n' +
  '      fontColor: "#000000",\n' +
  '      fontBackGroundColor:"#FFFFFF",\n' +
  '      fontBold: false,\n' +
  '      fontItalic: false,\n' +
  '      fontUnderline:false,\n' +
  '      fontDeleteLine:false,\n' +
  "      textInput: ''\n" +
  '    };\n' +
  '\n' +
  '    function updateFontFamily(event) {\n' +
  '      fontStyle.fontFamily = event.target.value\n' +
  '      document.getElementById("previewText").style.fontFamily = event.target.value\n' +
  '    }\n' +
  '    function updateFontSize(event) {\n' +
  '      fontStyle.fontSize = event.target.value\n' +
  '      document.getElementById("previewText").style.fontSize = event.target.value\n' +
  '    }\n' +
  '    function updateFontColor(event) {\n' +
  '      fontStyle.fontColor = event.target.value\n' +
  '      document.getElementById("previewText").style.color = event.target.value\n' +
  '    }\n' +
  '    function updateBackgroundColor(event) {\n' +
  '      fontStyle.fontBackGroundColor = event.target.value\n' +
  '      document.getElementById("previewText").style.backgroundColor = event.target.value\n' +
  '    }\n' +
  '    function updateFontBold(event) {\n' +
  '      if (event.target.checked) {\n' +
  '        document.getElementById("previewText").style.fontWeight = \'bold\';\n' +
  '        fontStyle.fontBold = true\n' +
  '      }\n' +
  '    }\n' +
  '    function updateFontItalic(event) {\n' +
  '      if (event.target.checked) {\n' +
  '        document.getElementById("previewText").style.fontStyle = \'italic\';\n' +
  '        fontStyle.fontItalic = true\n' +
  '      }\n' +
  '    }\n' +
  '    function updateFontUnderline(event) {\n' +
  '      if (event.target.checked) {\n' +
  '        document.getElementById("previewText").style.textDecoration += \' underline\';\n' +
  '        fontStyle.fontUnderline = true\n' +
  '      }\n' +
  '    }\n' +
  '    function updateFontDeleteLine(event) {\n' +
  '      if (event.target.checked) {\n' +
  '        document.getElementById("previewText").style.textDecoration += \' line-through\';\n' +
  '        fontStyle.fontDeleteLine = true\n' +
  '      }\n' +
  '    }\n' +
  '    function updateTextInput(event) {\n' +
  '      document.getElementById("previewText").textContent = event.target.value\n' +
  '      fontStyle.textInput = event.target.value.replace(/\\r?\\n/g,"\\n<br>")\n' +
  '    }\n' +
  '    // 监听文本输入和样式输入的变化\n' +
  "    document.getElementById('fontFamily').addEventListener('input', updateFontFamily);\n" +
  "    document.getElementById('fontSize').addEventListener('input', updateFontSize);\n" +
  "    document.getElementById('fontColor').addEventListener('input', updateFontColor);\n" +
  "    document.getElementById('backgroundColor').addEventListener('input', updateBackgroundColor);\n" +
  "    document.getElementById('fontBold').addEventListener('input', updateFontBold);\n" +
  "    document.getElementById('fontItalic').addEventListener('input', updateFontItalic);\n" +
  "    document.getElementById('fontUnderline').addEventListener('input', updateFontUnderline);\n" +
  "    document.getElementById('fontDeleteLine').addEventListener('input', updateFontDeleteLine);\n" +
  "    document.getElementById('textInput').addEventListener('input', updateTextInput);\n" +
  '\n' +
  '    function sendUserInputFontStyle() {\n' +
  "      ipcRenderer.send('dialog-user-font-select-btn-insert', fontStyle);\n" +
  '    }\n' +
  '    function sendDialogCancelFontStyle() {\n' +
  "      ipcRenderer.send('dialog-user-font-select-btn-cancel');\n" +
  '    }\n' +
  '    function setColor(color) {\n' +
  '      fontStyle.fontColor = color\n' +
  "      document.getElementById('fontColor').value = color;\n" +
  '      document.getElementById("previewText").style.color = color\n' +
  '    }\n' +
  '    function setBackGroundColor(color) {\n' +
  '      fontStyle.fontBackGroundColor = color\n' +
  "      document.getElementById('backgroundColor').value = color\n" +
  "      document.getElementById('previewText').style.backgroundColor = color;\n" +
  '    }\n' +
  '  </script>\n' +
  '  </body>\n' +
  '</html>\n'
*/
