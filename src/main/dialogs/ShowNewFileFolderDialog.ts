import { BrowserWindow, ipcMain } from 'electron'
import { GetSelectDir, CreateFile, CreateDirectory } from '../utils/file-utils'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'

let customNewFileDialog: Electron.BrowserWindow | null

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ShowNewFileFolderDialog(isFile: boolean) {
  customNewFileDialog = new BrowserWindow({
    width: 650,
    height: 200,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: '新建文件/文件夹',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  customNewFileDialog.setMenu(null)

  const temphtml = makeNewFileFolderDialogHtml()
  // 加载一个 HTML 文件作为对话框的内容
  customNewFileDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(temphtml)}`)

  // 显示窗口
  customNewFileDialog.show()

  customNewFileDialog.on('closed', () => {
    customNewFileDialog = null
    ipcMain.removeListener('dialog-new-file-folder-show-select', processNewFileFolder)
    ipcMain.removeListener('dialog-new-file-folder-confirm', processNewFileFolderConfirm)
    ipcMain.removeListener('dialog-new-file-folder-cancel', exitCustomFontDialog)
  })

  function exitCustomFontDialog() {
    if (customNewFileDialog) {
      ipcMain.removeListener('dialog-new-file-folder-show-select', processNewFileFolder)
      ipcMain.removeListener('dialog-new-file-folder-confirm', processNewFileFolderConfirm)
      ipcMain.removeListener('dialog-new-file-folder-cancel', exitCustomFontDialog)
      customNewFileDialog.close()
      customNewFileDialog = null
    }
  }

  function processNewFileFolder(event) {
    if (customNewFileDialog) {
      GetSelectDir(customNewFileDialog, function (path) {
        if (path) {
          event.returnValue = path
        }
      })
    }
  }

  function processNewFileFolderConfirm(_, fileInfo: { name: string; path: string }) {
    if (isFile) {
      if (fileInfo.name.lastIndexOf('.') === -1) {
        CreateFile(fileInfo.path, fileInfo.name, '.md')
      } else {
        CreateFile(fileInfo.path, fileInfo.name, '')
      }
    } else {
      CreateDirectory(fileInfo.path, fileInfo.name)
    }
    exitCustomFontDialog()
  }

  ipcMain.on('dialog-new-file-folder-show-select', processNewFileFolder)
  ipcMain.on('dialog-new-file-folder-confirm', processNewFileFolderConfirm)
  ipcMain.on('dialog-new-file-folder-cancel', exitCustomFontDialog)
}

function createFileFolderName(doc: Document): HTMLDivElement {
  const eleDiv = doc.createElement('div')
  eleDiv.style.marginLeft = '15px'
  eleDiv.style.marginRight = '10px'
  eleDiv.style.marginTop = '5px'
  const eleDivInputLabel = doc.createElement('label')
  eleDivInputLabel.id = 'file-folder-name-label'
  eleDivInputLabel.htmlFor = 'file-folder-name'
  eleDivInputLabel.textContent = '文件/文件夹名称：'
  const eleDivInput = doc.createElement('input')
  eleDivInput.type = 'text'
  eleDivInput.id = 'file-folder-name'
  eleDivInput.style.cssText = 'width:400px;margin:5px'
  eleDivInput.placeholder = '请输入文件/文件夹名称，文件默认后缀为.md'
  eleDiv.appendChild(eleDivInputLabel)
  eleDiv.appendChild(eleDivInput)
  return eleDiv
}

function createFileFolderPath(doc: Document): HTMLDivElement {
  const eleDiv = doc.createElement('div')
  eleDiv.style.marginLeft = '15px'
  eleDiv.style.marginRight = '10px'
  eleDiv.style.marginTop = '5px'
  const eleDivPathLabel = doc.createElement('label')
  eleDivPathLabel.id = 'file-folder-path-label'
  eleDivPathLabel.htmlFor = 'file-folder-path'
  eleDivPathLabel.textContent = '文件/文件夹路径：'
  const eleDivPath = doc.createElement('input')
  eleDivPath.type = 'text'
  eleDivPath.id = 'file-folder-path'
  eleDivPath.style.cssText = 'width:400px;margin:5px'
  eleDivPath.placeholder = '请输入/选择文件或文件夹路径'
  eleDiv.appendChild(eleDivPathLabel)
  eleDiv.appendChild(eleDivPath)
  return eleDiv
}

function createFileFolderSelect(doc: Document): HTMLDivElement {
  const eleDiv = doc.createElement('div')
  eleDiv.style.marginLeft = '15px'
  eleDiv.style.marginRight = '10px'
  eleDiv.style.marginTop = '5px'
  const eleDivSelectLabel = doc.createElement('label')
  eleDivSelectLabel.id = 'file-folder-select-label'
  eleDivSelectLabel.htmlFor = 'file-folder-select'
  eleDivSelectLabel.textContent = '选择文件/文件夹路径：'
  const eleDivSelect = doc.createElement('button')
  eleDivSelect.id = 'file-folder-select'
  eleDivSelect.style.cssText = 'width: 350px;margin-left: 20px;'
  eleDivSelect.textContent = '选择文件/文件夹路径'
  eleDiv.appendChild(eleDivSelectLabel)
  eleDiv.appendChild(eleDivSelect)
  return eleDiv
}

function createButtons(doc: Document): HTMLElement {
  const buttons: digcom.Button[] = [
    { id: 'file-folder-confirm', text: '确定' },
    { id: 'file-folder-cancel', text: '取消' }
  ]

  const btnList = digcom.NewButtonList(doc, buttons)
  btnList.className = 'btn-list-style'
  return btnList
}

function makeNewFileFolderDialogHtml(): string {
  // 创建一个空的HTML文档
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>新建文件/文件夹</title></head><body></body></html>`
  ).window

  const webDivStyle = document.createElement('style')
  webDivStyle.textContent = `
    .btn-list-style {width:600px;margin-top:10px; display:flex; justify-content:center;align-items:center;gap: 200px}`

  const eleDiv = document.createElement('div')
  eleDiv.style.margin = '10px'
  const eleDivName = createFileFolderName(document)
  const eleDivPath = createFileFolderPath(document)
  const eleDivSelect = createFileFolderSelect(document)
  eleDiv.appendChild(eleDivName)
  eleDiv.appendChild(eleDivPath)
  eleDiv.appendChild(eleDivSelect)
  const eleButtons = createButtons(document)

  const eleDivScript = document.createElement('script')
  eleDivScript.textContent = `
    const { ipcRenderer } = require('electron');
    let newFileFolder = {
      name: '',
      path: ''
    }
    function updateFileFolderName(event) {
      newFileFolder.name = event.target.value
    }
    function updateFileFolderDir(event) {
      newFileFolder.path = event.target.value
    }
    document.getElementById('file-folder-name').addEventListener('input', updateFileFolderName)
    document.getElementById('file-folder-path').addEventListener('input', updateFileFolderDir)
    document.getElementById('file-folder-select').onclick = function(e) {
      const select = ipcRenderer.sendSync('dialog-new-file-folder-show-select')
      newFileFolder.path = select
      document.getElementById('file-folder-path').value = select
    }
    document.getElementById('file-folder-confirm').onclick = function(e) {
      ipcRenderer.send('dialog-new-file-folder-confirm', newFileFolder)
    }
    document.getElementById('file-folder-cancel').onclick = function(e) {
      ipcRenderer.send('dialog-new-file-folder-cancel')
    }`

  document.head.appendChild(webDivStyle)
  document.body.appendChild(eleDiv)
  document.body.appendChild(eleButtons)
  document.body.appendChild(eleDivScript)

  return document.documentElement.outerHTML
}
