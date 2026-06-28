import { ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'
import { getCurrentThemeStyles } from '../config'
import { FontFamily } from '../utils/common'
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'

interface FontSelect {
    fontFamily: string
    fontSize: string
    fontColor: string
    fontBackGroundColor: string
    fontBold: boolean
    fontItalic: boolean
    fontUnderline: boolean
    fontDeleteLine: boolean
    textAlign: 'left' | 'center' | 'right' | 'justify'
    textInput: ''
}

export function ShowFontSelectDialog(mainWindow: Electron.BrowserWindow) {
    const existing = windowManager.getWindowByType('font-select-dialog')
    if (existing) {
        digcom.ShowAlreadyExistDialog()
        return
    }
    createFontSelectDialog(mainWindow)
}
// 创建一个自定义对话框的函数
function createFontSelectDialog(mainWindow: Electron.BrowserWindow) {
    const existing = windowManager.getWindowByType('font-select-dialog')
    if (existing) {
        digcom.ShowAlreadyExistDialog()
        return
    }

    const fontSelectDialog = windowManager.createWindow('font-select-dialog', createDialogOptions({
        width: 1280,
        height: 800,
        minWidth: 1000,
        minHeight: 600,
        minimizable: false,
        maximizable: true,
        resizable: true,
        title: '文字样式选择'
    }), 'font-select-dialog', true)

    if (!fontSelectDialog) {
        return
    }

    fontSelectDialog.setMenu(null)

    // 加载一个 HTML 文件作为对话框的内容
    fontSelectDialog.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(makeFontDialogHtml())}`
    )

    // 显示窗口
    fontSelectDialog.show()

    function exitFontSelectDialog() {
        const win = windowManager.getWindowByType('font-select-dialog')
        if (win) {
            ipcMain.removeListener(
                'dialog-user-font-select-btn-insert',
                processCustomFontDialogApply
            )
            ipcMain.removeListener('dialog-user-font-select-btn-cancel', () => {})
            win.close()
        }
    }

    function processCustomFontDialogApply(_, inputData: FontSelect) {
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

function createFontFamilySelect(doc: Document): HTMLElement {
    const FontFamilyDiv = digcom.NewSelect(doc, FontFamily)
    FontFamilyDiv.name = 'edit-font-family'
    FontFamilyDiv.id = 'edit-font-family'
    FontFamilyDiv.style.cssText = 'width: 200px; height: 32px;'
    return FontFamilyDiv
}

function createFontSizeSelect(doc: Document): HTMLElement {
    const options: digcom.Option[] = []
    for (let i = 5; i < 40; i++) {
        options.push({ value: `${i}pt`, optCss: 'font-size:18px' })
    }

    const FontSize = digcom.NewSelect(doc, options)
    FontSize.name = 'edit-font-size'
    FontSize.id = 'edit-font-size'
    FontSize.style.cssText = 'width: 200px; height: 32px;'
    return FontSize
}

// 注意：由于颜色列表是手动添加的，并且包含了一些重复的或相似的颜色以保持总数为52，
// 因此在实际应用中可能需要根据具体需求进行调整。
// 另外，'#FFFAFA' 在列表中出现了两次，这里是为了凑数，通常应该避免重复。
function createColorList(doc: Document): HTMLElement {
    const colorDiv = doc.createElement('div')
    colorDiv.style.cssText = 'margin: 4px 0;'

    // 标签和调色盘
    const labelRow = doc.createElement('div')
    labelRow.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'
    //const label = doc.createElement('label')
    //label.style.cssText = 'min-width: 80px; color: var(--text-color); font-size: 13px; font-weight: 500; text-align: right;'
    //label.textContent = '字体颜色：'
    //label.htmlFor = 'edit-font-color'
    labelRow.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'edit-font-color',
            text: '字体颜色：'
        })
    )
    //labelRow.appendChild(label)

    const colorInput = doc.createElement('input')
    colorInput.type = 'color'
    colorInput.id = 'edit-font-color'
    colorInput.style.cssText = 'width: 100px; height: 32px;'
    labelRow.appendChild(colorInput)
    colorDiv.appendChild(labelRow)

    // 颜色按钮（4行，每行16个）
    const buttonsDiv = doc.createElement('div')
    buttonsDiv.style.cssText = 'display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; margin-left: 92px;'
    digcom.CommonColors.forEach((color) => {
        const btn = doc.createElement('button')
        btn.className = 'color-button'
        btn.style.backgroundColor = color
        btn.style.padding = '0'
        btn.style.margin = '0'
        buttonsDiv.appendChild(btn)
    })
    colorDiv.appendChild(buttonsDiv)

    return colorDiv
}

function createBackgroundColorList(doc: Document): HTMLElement {
    const colorDiv = doc.createElement('div')
    colorDiv.style.cssText = 'margin: 4px 0;'

    // 标签和调色盘
    const labelRow = doc.createElement('div')
    labelRow.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'
    //const label = doc.createElement('label')
    //label.style.cssText = 'min-width: 80px; color: var(--text-color); font-size: 13px; font-weight: 500; text-align: right;'
    //label.textContent = '背景色：'
    //label.htmlFor = 'backgroundColor'
    //labelRow.appendChild(label)
    labelRow.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'backgroundColor',
            text: '背景色：'
        })
    )
    const colorBackInput = doc.createElement('input')
    colorBackInput.type = 'color'
    colorBackInput.id = 'backgroundColor'
    colorBackInput.style.cssText = 'width: 100px; height: 32px;'
    labelRow.appendChild(colorBackInput)
    colorDiv.appendChild(labelRow)

    // 颜色按钮（4行，每行16个）
    const buttonsDiv = doc.createElement('div')
    buttonsDiv.style.cssText = 'display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; margin-left: 92px;'
    digcom.CommonColors.forEach((color) => {
        const btn = doc.createElement('button')
        btn.className = 'background-color-button'
        btn.style.backgroundColor = color
        btn.style.padding = '0'
        btn.style.margin = '0'
        buttonsDiv.appendChild(btn)
    })
    colorDiv.appendChild(buttonsDiv)

    return colorDiv
}

function createInputs(doc: Document): HTMLElement {
    const divEle = doc.createElement('div')
    divEle.style.cssText = 'display: flex; flex-direction: column; gap: 0;'

    // 第一行：字体选择
    const row1 = doc.createElement('div')
    row1.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'
    //const fontLabel = doc.createElement('label')
    //fontLabel.style.cssText = 'min-width: 80px; color: var(--text-color); font-size: 13px; font-weight: 500; text-align: right;'
    //fontLabel.textContent = '选择字体：'
    //fontLabel.htmlFor = 'edit-font-family'
    row1.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'edit-font-family',
            text: '选择字体：'
        })
    )
    //row1.appendChild(fontLabel)
    row1.appendChild(createFontFamilySelect(doc))
    divEle.appendChild(row1)

    // 第二行：字号选择
    const row2 = doc.createElement('div')
    row2.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'
    //const sizeLabel = doc.createElement('label')
    //sizeLabel.style.cssText = 'min-width: 80px; color: var(--text-color); font-size: 13px; font-weight: 500; text-align: right;'
    //sizeLabel.textContent = '字体大小：'
    //sizeLabel.htmlFor = 'edit-font-size'
    row2.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'edit-font-size',
            text: '字体大小：'
        })
    )
    //row2.appendChild(sizeLabel)
    row2.appendChild(createFontSizeSelect(doc))
    divEle.appendChild(row2)

    return divEle
}

function createEditPreview(doc: Document): HTMLElement {
    const divEle = doc.createElement('div')
    divEle.style.cssText =
        'display: flex; flex-direction: column; gap: 16px; flex: 1; min-width: 0;'

    const divEditArea = doc.createElement('div')
    divEditArea.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'
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
            'width: 100%; height: 150px; overflow-y: auto; flex-shrink: 0;'
        )
    )
    divEle.appendChild(divEditArea)

    const divLine = doc.createElement('div')
    divLine.style.cssText =
        'height: 2px; background: var(--border-color); opacity: 0.3; flex-shrink: 0;'
    divEle.appendChild(divLine)

    const divPreArea = doc.createElement('div')
    divPreArea.style.cssText = 'display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0;'
    divPreArea.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'previewText',
            text: '效果预览：'
        })
    )
    const preview = doc.createElement('div')
    preview.id = 'preview-area'
    preview.style.cssText = 'width: 100%; flex: 1; overflow: auto; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; min-height: 0;'
    preview.innerHTML = '<p class="preview-text" id="previewText">这是一段预览文字。</p>'
    divPreArea.appendChild(preview)
    divEle.appendChild(divPreArea)
    return divEle
}

function createFontStyleButtons(doc: Document): HTMLElement {
    const div = doc.createElement('div')
    div.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'

    // 第一行：加粗、下划线
    const row = doc.createElement('div')
    row.style.cssText = 'display: flex; flex-direction: row; gap: 20px;'

    // 加粗按钮
    const boldBtn = doc.createElement('button')
    boldBtn.id = 'edit-font-bold'
    boldBtn.className = 'font-style-button'
    boldBtn.textContent = '加粗'
    boldBtn.style.cssText = 'padding: 8px 20px; min-width: 80px;'
    row.appendChild(boldBtn)

    // 下划线按钮
    const underlineBtn = doc.createElement('button')
    underlineBtn.id = 'edit-font-underline'
    underlineBtn.className = 'font-style-button'
    underlineBtn.textContent = '下划线'
    underlineBtn.style.cssText = 'padding: 8px 20px; min-width: 80px;'
    row.appendChild(underlineBtn)

    // 倾斜按钮
    const italicBtn = doc.createElement('button')
    italicBtn.id = 'edit-font-italic'
    italicBtn.className = 'font-style-button'
    italicBtn.textContent = '倾斜'
    italicBtn.style.cssText = 'padding: 8px 20px; min-width: 80px;'
    row.appendChild(italicBtn)

    // 删除线按钮
    const deletelineBtn = doc.createElement('button')
    deletelineBtn.id = 'edit-font-deleteline'
    deletelineBtn.className = 'font-style-button'
    deletelineBtn.textContent = '删除线'
    deletelineBtn.style.cssText = 'padding: 8px 20px; min-width: 80px;'
    row.appendChild(deletelineBtn)

    div.appendChild(row)
    return div
}

function createAlignSelect(doc: Document): HTMLElement {
    const divEle = doc.createElement('div')
    divEle.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'

    // 标签
    divEle.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'edit-align-select',
            text: '对齐方式：'
        })
    )
    //divEle.appendChild(label)

    // 下拉框
    const options: digcom.Option[] = [
        { value: 'left', text: '左对齐' },
        { value: 'center', text: '居中对齐' },
        { value: 'right', text: '右对齐' },
        { value: 'justify', text: '两端对齐' }
    ]

    const select = digcom.NewSelect(doc, options)
    select.id = 'edit-align-select'
    select.name = 'edit-align-select'
    select.style.cssText = 'width: 200px; height: 32px;'
    divEle.appendChild(select)

    return divEle
}

function createFontSizeColor(doc: Document): HTMLElement {
    const div = doc.createElement('div')
    div.style.cssText = 'display: flex; flex-direction: column; gap: 0;'

    // 字体、字号
    div.appendChild(createInputs(doc))
    // 对齐方式
    div.appendChild(createAlignSelect(doc))
    // 字体样式区域（加粗、倾斜、下划线、删除线）
    div.appendChild(createFontStyleButtons(doc))
    // 颜色选择区域
    div.appendChild(createColorList(doc))
    div.appendChild(createBackgroundColorList(doc))
    return div
}

function createBodyDiv(doc: Document): HTMLElement {
    const div = doc.createElement('div')
    div.style.cssText = 'display: flex; flex-direction: row; gap: 24px; width: 100%; flex: 1; min-height: 0;'

    // 左侧区域：固定宽度
    const leftPanel = doc.createElement('div')
    leftPanel.style.cssText = 'width: 420px; flex-shrink: 0; overflow-y: auto;'
    leftPanel.appendChild(createFontSizeColor(doc))
    div.appendChild(leftPanel)

    // 分隔线
    const divLine = doc.createElement('div')
    divLine.style.cssText =
        'width: 2px; background: var(--border-color); opacity: 0.3; flex-shrink: 0;'
    div.appendChild(divLine)

    // 右侧区域：自适应
    div.appendChild(createEditPreview(doc))
    return div
}

function createButtonList(doc: Document): HTMLElement {
    const buttons: digcom.Button[] = [
        { id: 'font-select-apply', text: '应用', btnCss: digcom.ButtonStyle },
        { id: 'font-select-cancel', text: '取消', btnCss: digcom.ButtonStyle }
    ]

    const btnList = digcom.NewButtonList(doc, buttons)
    btnList.style.cssText =
        'width:100%; display:flex; justify-content:center;align-items:center;gap: 400px; padding: 10px 0; flex-shrink: 0;'
    return btnList
}

function makeFontDialogHtml(): string {
    const theme = getCurrentThemeStyles()
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><title>特殊文字编辑</title></head><body></body></html>`
    ).window

    const webDivStyle = document.createElement('style')
    webDivStyle.textContent = `
    :root {
        --bg-color: ${theme.backgroundColor};
        --card-bg: ${theme.cardBackground};
        --text-color: ${theme.textColor};
        --secondary-text-color: ${theme.secondaryTextColor};
        --border-color: ${theme.borderColor};
        --accent-color: ${theme.accentColor};
        --hover-bg: ${theme.hoverBackground};
        --title-bar-gradient: ${theme.titleBarGradient};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif; background: var(--bg-color); min-height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    .title-bar { width: 100%; height: 40px; background: var(--title-bar-gradient); display: flex; justify-content: space-between; align-items: center; padding: 0 16px; -webkit-app-region: drag; flex-shrink: 0; }
    .title-bar-title { color: #fff; font-size: 14px; font-weight: 500; letter-spacing: 0.5px; }
    .close-btn { width: 32px; height: 32px; border: none; background: rgba(255,255,255,0.15); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; color: #fff; transition: all 0.2s; -webkit-app-region: no-drag; }
    .close-btn:hover { background: rgba(255,80,80,0.95); transform: scale(1.05); }
    .main-content { flex: 1; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; min-height: 0; }
    .label-style { min-width: 80px; color: var(--text-color); font-size: 13px; font-weight: 500; text-align: right; display: flex; align-items: center; justify-content: flex-end; }
    .input-style { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px; color: var(--text-color); font-size: 13px; transition: all 0.2s; }
    .input-style:focus { border-color: var(--accent-color); outline: none; box-shadow: 0 0 0 3px rgba(100,150,255,0.1); }
    .checkbox-style { width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-color); }
    .font-style-button { padding: 8px 20px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); color: var(--text-color); font-size: 13px; cursor: pointer; transition: all 0.2s; font-weight: 500; }
    .font-style-button:hover { background: var(--hover-bg); border-color: var(--accent-color); }
    .font-style-button.active { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
    .color-button { width: 20px; height: 20px; border: 1px solid var(--border-color); border-radius: 0; cursor: pointer; transition: all 0.2s; }
    .color-button:hover { transform: scale(1.1); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    .background-color-button { width: 20px; height: 20px; border: 1px solid var(--border-color); border-radius: 0; cursor: pointer; transition: all 0.2s; }
    .background-color-button:hover { transform: scale(1.1); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    button { padding: 10px 24px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); color: var(--text-color); font-size: 13px; cursor: pointer; transition: all 0.2s; font-weight: 500; }
    button:hover { background: var(--hover-bg); border-color: var(--accent-color); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    button:active { transform: translateY(0); }
    textarea { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; color: var(--text-color); font-size: 13px; resize: none; transition: all 0.2s; }
    textarea:focus { border-color: var(--accent-color); outline: none; box-shadow: 0 0 0 3px rgba(100,150,255,0.1); }
    select { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 12px; color: var(--text-color); font-size: 13px; cursor: pointer; }
    select:focus { border-color: var(--accent-color); outline: none; }
    input[type="color"] { border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; }`
    document.head.appendChild(webDivStyle)

    // 创建标题栏
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = '特殊文字编辑'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = 'x'
    closeBtn.id = 'close-dialog-btn'
    titleBar.appendChild(titleSpan)
    titleBar.appendChild(closeBtn)
    document.body.appendChild(titleBar)

    // 创建主内容区域
    const mainContent = document.createElement('div')
    mainContent.className = 'main-content'
    mainContent.appendChild(createBodyDiv(document))
    document.body.appendChild(mainContent)

    document.body.appendChild(createButtonList(document))

    const eleScript = document.createElement('script')
    eleScript.textContent = `
    const ipcRenderer = window.electronAPI.ipcRenderer
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
      const btn = event.target
      const isActive = btn.classList.contains('active')
      if (isActive) {
        btn.classList.remove('active')
        document.getElementById("previewText").style.fontWeight = 'normal'
        fontStyle.fontBold = false
      } else {
        btn.classList.add('active')
        document.getElementById("previewText").style.fontWeight = 'bold'
        fontStyle.fontBold = true
      }
    }
    function updateFontItalic(event) {
      const btn = event.target
      const isActive = btn.classList.contains('active')
      if (isActive) {
        btn.classList.remove('active')
        document.getElementById("previewText").style.fontStyle = 'normal'
        fontStyle.fontItalic = false
      } else {
        btn.classList.add('active')
        document.getElementById("previewText").style.fontStyle = 'italic'
        fontStyle.fontItalic = true
      }
    }
    function updateFontUnderline(event) {
      const btn = event.target
      const isActive = btn.classList.contains('active')
      if (isActive) {
        btn.classList.remove('active')
        const currentDecoration = document.getElementById("previewText").style.textDecoration
        document.getElementById("previewText").style.textDecoration = currentDecoration.replace('underline', '').trim()
        fontStyle.fontUnderline = false
      } else {
        btn.classList.add('active')
        document.getElementById("previewText").style.textDecoration += ' underline'
        fontStyle.fontUnderline = true
      }
    }
    function updateFontDeleteLine(event) {
      const btn = event.target
      const isActive = btn.classList.contains('active')
      if (isActive) {
        btn.classList.remove('active')
        const currentDecoration = document.getElementById("previewText").style.textDecoration
        document.getElementById("previewText").style.textDecoration = currentDecoration.replace('line-through', '').trim()
        fontStyle.fontDeleteLine = false
      } else {
        btn.classList.add('active')
        document.getElementById("previewText").style.textDecoration += ' line-through'
        fontStyle.fontDeleteLine = true
      }
    }
    function updateTextAlign(event) {
      fontStyle.textAlign = event.target.value
      document.getElementById("previewText").style.textAlign = event.target.value
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
    document.getElementById('edit-font-bold').addEventListener('click', updateFontBold)
    document.getElementById('edit-font-italic').addEventListener('click', updateFontItalic)
    document.getElementById('edit-font-underline').addEventListener('click', updateFontUnderline)
    document.getElementById('edit-font-deleteline').addEventListener('click', updateFontDeleteLine)
    document.getElementById('edit-align-select').addEventListener('change', updateTextAlign)
    document.getElementById('text-input-area').addEventListener('input', updateTextInput)
    document.getElementById('font-select-apply').onclick = function(e) {
      ipcRenderer.send('dialog-user-font-select-btn-insert', fontStyle)
    }
    document.getElementById('font-select-cancel').onclick = function(e) {
      ipcRenderer.send('dialog-user-font-select-btn-cancel')
    }
    document.getElementById('close-dialog-btn').onclick = function(e) {
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
    })
    // 监听主题更新，动态更新label颜色
    ipcRenderer.on('baize-notes:theme-updated', function() {
      location.reload()
    })
    ipcRenderer.on('baize-notes:init-theme-styles', function(event, theme) {
      var root = document.documentElement
      root.style.setProperty('--bg-color', theme.backgroundColor)
      root.style.setProperty('--card-bg', theme.cardBackground)
      root.style.setProperty('--text-color', theme.textColor)
      root.style.setProperty('--secondary-text-color', theme.secondaryTextColor)
      root.style.setProperty('--border-color', theme.borderColor)
      root.style.setProperty('--accent-color', theme.accentColor)
      root.style.setProperty('--hover-bg', theme.hoverBackground)
      root.style.setProperty('--title-bar-gradient', theme.titleBarGradient)
      // 更新所有label的颜色
      var labels = document.querySelectorAll('label')
      labels.forEach(function(label) {
        label.style.color = theme.textColor
      })
    })`
    document.body.appendChild(eleScript)
    return document.documentElement.outerHTML
}
