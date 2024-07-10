import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'

let customMarkdownSheetDialog: Electron.BrowserWindow | null

export function ShowMarkdownSheetDialog(mainWindow: Electron.BrowserWindow) {
  createMarkdownSheetDialog(mainWindow)
}

// 创建一个自定义对话框的函数
function createMarkdownSheetDialog(mainWindow: Electron.BrowserWindow) {
  customMarkdownSheetDialog = new BrowserWindow({
    width: 530,
    height: 180,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: '表格样式选择',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  if (!customMarkdownSheetDialog) {
    return
  }

  customMarkdownSheetDialog.setMenu(null)

  const tempHtml = makeMdSheetDialogHtml()
  // 加载一个 HTML 文件作为对话框的内容
  customMarkdownSheetDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)

  // 当窗口关闭时，清除引用
  customMarkdownSheetDialog.on('closed', () => {
    customMarkdownSheetDialog = null
    ipcMain.removeListener('dialog-markdown-sheet-btn-insert', processMarkdownSheetInsert)
    ipcMain.removeListener('dialog-markdown-sheet-btn-cancel', () => {})
  })

  // 显示窗口
  customMarkdownSheetDialog.show()

  function exitCustomFontDialog() {
    if (customMarkdownSheetDialog) {
      ipcMain.removeListener('dialog-markdown-sheet-btn-insert', processMarkdownSheetInsert)
      ipcMain.removeListener('dialog-markdown-sheet-btn-cancel', () => {})
      customMarkdownSheetDialog.close()
      customMarkdownSheetDialog = null
    }
  }

  function processMarkdownSheetInsert(_, sheetData) {
    let rowContent = '|'
    let titleContent = '|'
    const sheetCol = sheetData.col
    const sheetRow = sheetData.row
    const alignStyle = sheetData.align
    const alignMaps = {
      default: ' --- |',
      'align-left': ' :-- |',
      'align-center': ' :--: |',
      'align-right': ' --: |'
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
    exitCustomFontDialog()
  }

  ipcMain.on('dialog-markdown-sheet-btn-insert', processMarkdownSheetInsert)

  ipcMain.on('dialog-markdown-sheet-btn-cancel', () => {
    exitCustomFontDialog()
  })
}

function insertElementRow(doc: Document, div: Element) {
  // <div class="label-style"></div>
  const ele_div_label_row = doc.createElement('div')
  ele_div_label_row.className = 'label-style'

  // <label for="sheet-row">行数：</label>
  const ele_label_row = doc.createElement('label')
  ele_label_row.htmlFor = 'sheet-row'
  ele_label_row.textContent = '行数：'
  // <div class="label-style"><label for="sheet-row">行：</label></div>
  ele_div_label_row.appendChild(ele_label_row)

  // <div class="input-style"></div>
  const ele_div_input_row = doc.createElement('div')
  ele_div_input_row.className = 'input-style'
  // <input type="text" id="sheet-row" style="width: 100px">
  const ele_input_row = doc.createElement('input')
  ele_input_row.id = 'sheet-row'
  ele_input_row.type = 'text'
  ele_input_row.style.width = '100px'
  ele_input_row.placeholder = '请输入数字'
  // <div class="input-style"><input type="text" id="sheet-row" style="width: 100px"></div>
  ele_div_input_row.appendChild(ele_input_row)
  div.appendChild(ele_div_label_row)
  div.appendChild(ele_div_input_row)
}

function insertElementCol(doc: Document, div: Element) {
  // <div class="label-style"></div>
  const ele_div_label_col = doc.createElement('div')
  ele_div_label_col.className = 'label-style'
  // <label for="sheet-col">列：</label>
  const ele_label_col = doc.createElement('label')
  ele_label_col.htmlFor = 'sheet-col'
  ele_label_col.textContent = '列数：'
  // <div class="label-style"><label for="sheet-col">列：</label></div>
  ele_div_label_col.appendChild(ele_label_col)

  // <div class="input-style"></div>
  const ele_div_input_col = doc.createElement('div')
  ele_div_input_col.className = 'input-style'
  // <input type="text" id="sheet-col" style="width: 100px">
  const ele_input_col = doc.createElement('input')
  ele_input_col.id = 'sheet-col'
  ele_input_col.type = 'text'
  ele_input_col.style.width = '100px'
  ele_input_col.placeholder = '请输入数字'
  // <div class="input-style"><input type="text" id="sheet-col" style="width: 100px"></div>
  ele_div_input_col.appendChild(ele_input_col)
  div.appendChild(ele_div_label_col)
  div.appendChild(ele_div_input_col)
}

function createDivRowCol(doc: Document): Element {
  // <div class="label-style"><label for="sheet-row">单元格数</label>
  const ele_div_label_head = doc.createElement('div')
  ele_div_label_head.className = 'label-style'
  const ele_label_head = doc.createElement('label')
  ele_label_head.textContent = '单元格数'
  ele_div_label_head.appendChild(ele_label_head)

  // <div style="margin-top: 10px; margin-left: 20px; width: 2px; display: flex;"></div>
  const ele_div_margin = doc.createElement('div')
  ele_div_margin.id = 'number-of-cells'
  ele_div_margin.style.cssText = `margin-top: 10px; margin-left: 20px; width: 2px; display: flex;`

  const ele_row_col = doc.createElement('div')
  ele_row_col.id = 'body-div'
  ele_row_col.style.cssText = `display: flex; flex-direction: row; width: 450px`
  ele_row_col.appendChild(ele_div_label_head)
  insertElementRow(doc, ele_row_col)
  ele_row_col.appendChild(ele_div_margin)
  insertElementCol(doc, ele_row_col)
  return ele_row_col
}

function createCheckBox(doc: Document, id: string, name: string, value: string): Element {
  const eleDiv = doc.createElement('div')
  const eleDivInput = doc.createElement('input')
  eleDivInput.id = id
  eleDivInput.type = 'checkbox'
  eleDivInput.name = name
  eleDivInput.value = value
  const eleDivLabel = doc.createElement('label')
  eleDivLabel.htmlFor = id
  eleDivLabel.textContent = name
  eleDiv.appendChild(eleDivInput)
  eleDiv.appendChild(eleDivLabel)

  return eleDiv
}

function createCheckBoxList(doc: Document): Element {
  const eleBoxes = doc.createElement('div')
  eleBoxes.id = 'checkbox-container'
  eleBoxes.style.cssText = `display: flex; flex-direction: row; width: 450px;justify-content:center;align-items: center;flex: 1`

  const ele_box_div_label = doc.createElement('div')
  ele_box_div_label.className = 'label-style'
  const ele_box_label = doc.createElement('label')
  ele_box_label.textContent = '对齐方式'
  ele_box_div_label.appendChild(ele_box_label)

  const eleBoxDefault = createCheckBox(doc, 'checkbox-default', '默认', 'default')
  const eleBoxAlignLeft = createCheckBox(doc, 'checkbox-align-left', '左对齐', 'align-left')
  const eleBoxAlignCenter = createCheckBox(doc, 'checkbox-align-center', '居中对齐', 'align-center')
  const eleBoxAlignRight = createCheckBox(doc, 'checkbox-align-right', '右对齐', 'align-right')
  const ele_div_boxes = doc.createElement('div')
  ele_div_boxes.id = 'checkbox-list'
  ele_div_boxes.style.cssText = `display:flex;flex: 1;gap: 30px;margin-top: 15px`
  ele_div_boxes.appendChild(eleBoxDefault)
  ele_div_boxes.appendChild(eleBoxAlignLeft)
  ele_div_boxes.appendChild(eleBoxAlignCenter)
  ele_div_boxes.appendChild(eleBoxAlignRight)
  eleBoxes.appendChild(ele_box_div_label)
  eleBoxes.appendChild(ele_div_boxes)

  return eleBoxes
}

function createButtonList(doc: Document): Element {
  const buttons: digcom.Button[] = [
    { id: 'insertButton', text: '应用', btnClass: 'color-button' },
    { id: 'cancelButton', text: '取消', btnClass: 'color-button' }
  ]

  const btnList = digcom.NewButtonList(doc, buttons)
  btnList.className = 'btn-style'
  return btnList
}

function createBodyDiv(doc: Document): Element {
  // <div style="display: flex; flex-direction: column; margin-left: 20px; width: 500px">
  const eleDiv = doc.createElement('div')
  eleDiv.style.cssText = `display: flex; flex-direction: column; margin-left: 20px; width: 450px`

  const eleBodyDivRowCol = createDivRowCol(doc)
  const eleBoxes = createCheckBoxList(doc)
  const eleButtons = createButtonList(doc)
  eleDiv.appendChild(eleBodyDivRowCol)
  eleDiv.appendChild(eleBoxes)
  eleDiv.appendChild(eleButtons)
  return eleDiv
}

function makeMdSheetDialogHtml(): string {
  // 创建一个空的HTML文档
  const htmlContent = `
    <!DOCTYPE html><html lang="zh"><head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>选择表格样式</title>
    </head><body></body></html>`
  const { document } = new JSDOM(htmlContent).window

  const ele_head_style = document.createElement('style')
  ele_head_style.textContent = `
  .label-style {width: 80px;margin-top: 12px;text-align: center;}
  .input-style  {width: 100px;margin-top: 10px;}
  .color-button {width: 80px;margin-top: 20px;}
  .btn-style {width:450px;display:flex; justify-content:center;align-items: center;gap: 200px}`

  const eleBodyDiv = createBodyDiv(document)

  const ele_body_script = document.createElement('script')
  ele_body_script.textContent = `
    const { ipcRenderer } = require('electron');
    let sheetStyle = {
      row:1,
      col:1,
      align:'default'
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
    }`

  // 将<style>元素添加到<head>中
  document.head.appendChild(ele_head_style)
  document.body.appendChild(eleBodyDiv)
  document.body.appendChild(ele_body_script)

  return document.documentElement.outerHTML
}
