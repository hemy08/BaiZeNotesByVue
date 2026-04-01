import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'
import { getCurrentThemeStyles } from '../theme-config/theme-config'

let customMarkdownSheetDialog: Electron.BrowserWindow | null

export function ShowMarkdownSheetDialog(mainWindow: Electron.BrowserWindow) {
    if (customMarkdownSheetDialog) {
        digcom.ShowAlreadyExistDialog()
        return
    }
    createMarkdownSheetDialog(mainWindow)
}

// 创建一个自定义对话框的函数
function createMarkdownSheetDialog(mainWindow: Electron.BrowserWindow) {
    customMarkdownSheetDialog = new BrowserWindow({
        width: 530,
        height: 250,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '选择表格样式',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    if (!customMarkdownSheetDialog) {
        return
    }

    customMarkdownSheetDialog.setMenu(null)

    // 加载一个 HTML 文件作为对话框的内容
    customMarkdownSheetDialog.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(makeMdSheetDialogHtml())}`
    )

    // 发送主题样式
    customMarkdownSheetDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        customMarkdownSheetDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    // 当窗口关闭时，清除引用
    customMarkdownSheetDialog.on('closed', () => {
        ipcMain.removeListener('dialog-markdown-sheet-btn-insert', processMarkdownSheetInsert)
        ipcMain.removeListener('dialog-markdown-sheet-btn-cancel', processMarkdownSheetCancel)
        customMarkdownSheetDialog = null
    })

    // 显示窗口
    customMarkdownSheetDialog.show()

    function processMarkdownSheetInsert(_, sheetStyle) {
        let rowContent = '|'
        let titleContent = '|'
        const sheetCol = sheetStyle.col
        const sheetRow = sheetStyle.row
        const alignStyle = sheetStyle.align
        const alignMaps = {
            default: ' --- |',
            'left': ' :-- |',
            'center': ' :--: |',
            'right': ' --: |'
        }
        for (let i = 0; i < sheetCol; i++) {
            rowContent += '  |'
            titleContent += alignMaps[alignStyle]
        }

        rowContent += '\n'
        titleContent += '\n'

        let inputSheet = rowContent + titleContent
        for (let i = 0; i < sheetRow; i++) {
            inputSheet += rowContent
        }
        mainWindow.webContents.send('monaco-insert-text-block-templates', inputSheet)
        exitCustomDialog()
    }

    function processMarkdownSheetCancel() {
        exitCustomDialog()
    }

    function exitCustomDialog() {
        if (customMarkdownSheetDialog) {
            ipcMain.removeListener('dialog-markdown-sheet-btn-insert', processMarkdownSheetInsert)
            ipcMain.removeListener('dialog-markdown-sheet-btn-cancel', processMarkdownSheetCancel)
            customMarkdownSheetDialog.close()
            customMarkdownSheetDialog = null
        }
    }

    ipcMain.on('dialog-markdown-sheet-btn-insert', processMarkdownSheetInsert)
    ipcMain.on('dialog-markdown-sheet-btn-cancel', processMarkdownSheetCancel)
}

function createDivRowCol(doc: Document): HTMLElement {
    const eleDiv = doc.createElement('div')
    eleDiv.style.cssText = 'display: flex; flex-direction: column; gap: 16px;'

    const eleDivRow = doc.createElement('div')
    eleDivRow.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px;'
    const labelRow = doc.createElement('label')
    labelRow.className = 'label-style'
    labelRow.textContent = '行数'
    const inputRow = doc.createElement('input')
    inputRow.className = 'input-style'
    inputRow.id = 'sheet-row'
    inputRow.type = 'number'
    inputRow.value = '1'
    inputRow.min = '1'
    eleDivRow.appendChild(labelRow)
    eleDivRow.appendChild(inputRow)

    const eleDivCol = doc.createElement('div')
    eleDivCol.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px;'
    const labelCol = doc.createElement('label')
    labelCol.className = 'label-style'
    labelCol.textContent = '列数'
    const inputCol = doc.createElement('input')
    inputCol.className = 'input-style'
    inputCol.id = 'sheet-col'
    inputCol.type = 'number'
    inputCol.value = '1'
    inputCol.min = '1'
    eleDivCol.appendChild(labelCol)
    eleDivCol.appendChild(inputCol)

    eleDiv.appendChild(eleDivRow)
    eleDiv.appendChild(eleDivCol)
    return eleDiv
}

function createCheckBoxList(doc: Document): HTMLElement {
    const eleDiv = doc.createElement('div')
    eleDiv.id = 'checkbox-list'
    eleDiv.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 20px;'

    const alignOptions = [
        { value: 'default', label: '默认对齐' },
        { value: 'left', label: '左对齐' },
        { value: 'center', label: '居中对齐' },
        { value: 'right', label: '右对齐' }
    ]

    alignOptions.forEach(option => {
        const label = doc.createElement('label')
        label.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px 12px; border-radius: 6px; transition: all 0.2s;'
        const checkbox = doc.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.value = option.value
        if (option.value === 'default') {
            checkbox.checked = true
        }
        label.appendChild(checkbox)
        label.appendChild(doc.createTextNode(option.label))
        eleDiv.appendChild(label)
    })

    return eleDiv
}

function createButtonList(doc: Document): HTMLElement {
    const buttons: digcom.Button[] = [
        { id: 'insertButton', text: '插入' },
        { id: 'cancelButton', text: '取消' }
    ]

    const btnList = digcom.NewButtonList(doc, buttons)
    btnList.className = 'btn-style'
    return btnList
}

function createBodyDiv(doc: Document): HTMLElement {
    const eleDiv = doc.createElement('div')
    eleDiv.style.cssText = 'display: flex; flex-direction: column; gap: 24px; width: 100%; max-width: 600px;'

    // 创建左右布局容器
    const leftRightContainer = doc.createElement('div')
    leftRightContainer.style.cssText = 'display: flex; flex-direction: row; gap: 40px; align-items: flex-start;'

    // 左侧：行数和列数
    const leftSection = createDivRowCol(doc)
    leftRightContainer.appendChild(leftSection)

    // 右侧：对齐选项
    const rightSection = createCheckBoxList(doc)
    leftRightContainer.appendChild(rightSection)

    eleDiv.appendChild(leftRightContainer)

    const eleButtons = createButtonList(doc)
    eleDiv.appendChild(eleButtons)
    return eleDiv
}

function makeMdSheetDialogHtml(): string {
    const theme = getCurrentThemeStyles()

    // 创建一个空的HTML文档
    const htmlContent = `
    <!DOCTYPE html><html lang="zh"><head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>选择表格样式</title>
    </head><body></body></html>`
    const { document } = new JSDOM(htmlContent).window

    const ele_head_style = document.createElement('style')
    ele_head_style.textContent = `
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
    .title-bar { width: 100%; height: 40px; background: var(--title-bar-gradient); display: flex; justify-content: space-between; align-items: center; padding: 0 16px; -webkit-app-region: drag; }
    .title-bar-title { color: #fff; font-size: 14px; font-weight: 500; letter-spacing: 0.5px; }
    .close-btn { width: 32px; height: 32px; border: none; background: rgba(255,255,255,0.15); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; color: #fff; transition: all 0.2s; -webkit-app-region: no-drag; }
    .close-btn:hover { background: rgba(255,80,80,0.95); transform: scale(1.05); }
    .main-content { flex: 1; padding: 24px 28px; display: flex; flex-direction: column; }
    .label-style { min-width: 60px; color: var(--text-color); font-size: 13px; font-weight: 500; }
    .input-style { width: 120px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; color: var(--text-color); font-size: 13px; transition: all 0.2s; }
    .input-style:focus { border-color: var(--accent-color); outline: none; box-shadow: 0 0 0 3px rgba(100,150,255,0.1); }
    .btn-style { width: 100%; display: flex; justify-content: center; align-items: center; gap: 60px; margin-top: 8px; }
    button { padding: 10px 24px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); color: var(--text-color); font-size: 13px; cursor: pointer; transition: all 0.2s; font-weight: 500; }
    button:hover { background: var(--hover-bg); border-color: var(--accent-color); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    button:active { transform: translateY(0); }
    #checkbox-list label { color: var(--text-color); font-size: 13px; cursor: pointer; transition: all 0.2s; }
    #checkbox-list label:hover { color: var(--accent-color); }
    #checkbox-list input[type="checkbox"] { accent-color: var(--accent-color); width: 16px; height: 16px; cursor: pointer; }`

    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = '插入表格'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = 'x'
    closeBtn.id = 'close-dialog-btn'
    titleBar.appendChild(titleSpan)
    titleBar.appendChild(closeBtn)

    const mainContent = document.createElement('div')
    mainContent.className = 'main-content'

    const eleBodyDiv = createBodyDiv(document)
    mainContent.appendChild(eleBodyDiv)

    const ele_body_script = document.createElement('script')
    ele_body_script.textContent = `
    const { ipcRenderer } = require('electron');
    let sheetStyle = {
      row: 1,
      col: 1,
      align: 'default'
    };
    // 获取所有的复选框
    const checkboxes = document.querySelectorAll('#checkbox-list input[type="checkbox"]');
    checkboxes.forEach(function(checkbox) {
      checkbox.addEventListener('input', function() {
        if (this.checked) {
          sheetStyle.align = this.value
          checkboxes.forEach(function(other) {
            if (other !== this && other.checked) {
                other.checked = false
            }
          }.bind(this))
        }
      })
    })
    function updateSheetRow(event) {
      sheetStyle.row = event.target.value
    }
    function updateSheetCol(event) {
      sheetStyle.col = event.target.value
    }
    // 监听文本输入和样式输入的变化
    document.getElementById('sheet-row').addEventListener('input', updateSheetRow);
    document.getElementById('sheet-col').addEventListener('input', updateSheetCol);
    document.getElementById('insertButton').onclick = function() {
      ipcRenderer.send('dialog-markdown-sheet-btn-insert', sheetStyle)
    }
    document.getElementById('cancelButton').onclick = function() {
      ipcRenderer.send('dialog-markdown-sheet-btn-cancel')
    }
    document.getElementById('close-dialog-btn').onclick = function() {
      ipcRenderer.send('dialog-markdown-sheet-btn-cancel')
    }
    // 监听主题更新
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
    })`

    // 将<style>元素添加到<head>中
    document.head.appendChild(ele_head_style)
    document.body.appendChild(titleBar)
    document.body.appendChild(mainContent)
    document.body.appendChild(ele_body_script)

    return document.documentElement.outerHTML
}
