import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'

let customWebUrlDialog: Electron.BrowserWindow | null

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ShowWebUrlDialog(mainWindow: Electron.BrowserWindow) {
  customWebUrlDialog = new BrowserWindow({
    width: 630,
    height: 180,
    minimizable: false,
    maximizable: false,
    title: '重命名',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  customWebUrlDialog.setMenu(null)

  const tempHtml = makeWebUrlDialogHtml()
  // 加载一个 HTML 文件作为对话框的内容
  customWebUrlDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)

  // 显示窗口
  customWebUrlDialog.show()

  customWebUrlDialog.on('closed', () => {
    customWebUrlDialog = null
    ipcMain.removeListener('web-url-dialog-insert', processWebUrlDialogInsert)
    ipcMain.removeListener('web-url-dialog-cancel', () => {})
  })

  function exitCustomWebUrlDialog() {
    if (customWebUrlDialog) {
      customWebUrlDialog.close()
      customWebUrlDialog = null
    }
  }

  function processWebUrlDialogInsert(_, webLinks: string) {
    console.log('processWebUrlDialogInsert', webLinks)
    const webUrl = '[' + webLinks.title + '](' + webLinks.addr + ')'
    mainWindow.webContents.send('monaco-insert-text-block-templates', webUrl)
    if (customWebUrlDialog) {
      customWebUrlDialog.close()
    }
  }

  ipcMain.on('web-url-dialog-insert', processWebUrlDialogInsert)
  ipcMain.on('web-url-dialog-cancel', () => {
    exitCustomWebUrlDialog()
  })
}

function createWebUrlButtonList(doc: Document): Element {
  const eleButtons = doc.createElement('div')
  eleButtons.className = 'web-url-btn-style'
  const eleInsertButton = doc.createElement('button')
  eleInsertButton.id = 'insert-web-url'
  eleInsertButton.className = 'web-url-button'
  eleInsertButton.textContent = '插入'
  const eleCancelButton = doc.createElement('button')
  eleCancelButton.id = 'cancel-input'
  eleCancelButton.className = 'web-url-button'
  eleCancelButton.textContent = '取消'
  eleButtons.appendChild(eleInsertButton)
  eleButtons.appendChild(eleCancelButton)
  return eleButtons
}

function makeWebUrlDialogHtml(): string {
  // 创建一个空的HTML文档
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>插入网页链接</title></head><body></body></html>`
  ).window

  const webDivStyle = document.createElement('style')
  webDivStyle.textContent = `
    #web-url-components {margin: 5px;}
    #web-url-components > div {margin: 15px;}
    #web-url-components input {width: 460px;}
    .web-url-button {width: 100px;margin-top: 10px;}
    .web-url-btn-style {width:500px;display:flex; justify-content:center;align-items: center;gap: 100px}`

  const webDiv = document.createElement('div')
  webDiv.id = 'web-url-components'

  const webDivTitle = document.createElement('div')
  webDivTitle.id = 'web-url-title'
  const webDivTitleLabel = document.createElement('label')
  webDivTitleLabel.id = 'web-title-label'
  webDivTitleLabel.htmlFor = 'web-title-input'
  webDivTitleLabel.textContent = '地址描述：'
  const webDivTitleInput = document.createElement('input')
  webDivTitleInput.id = 'web-title-input'
  webDivTitleInput.type = 'text'
  webDivTitleInput.placeholder = '请输入地址描述...'
  webDivTitle.appendChild(webDivTitleLabel)
  webDivTitle.appendChild(webDivTitleInput)

  const webDivUrl = document.createElement('div')
  webDivUrl.id = 'web-url-addr'
  const webDivUrlLabel = document.createElement('label')
  webDivUrlLabel.id = 'web-addr-label'
  webDivUrlLabel.htmlFor = 'web-addr-input'
  webDivUrlLabel.textContent = '网站地址：'
  const webDivUrlInput = document.createElement('input')
  webDivUrlInput.id = 'web-addr-input'
  webDivUrlInput.type = 'text'
  webDivUrlInput.placeholder = '请输入http/https路径...'
  webDivUrl.appendChild(webDivUrlLabel)
  webDivUrl.appendChild(webDivUrlInput)

  webDiv.appendChild(webDivTitle)
  webDiv.appendChild(webDivUrl)

  const webDivButtons = createWebUrlButtonList(document)

  const webDivScript = document.createElement('script')
  webDivScript.textContent = `
    const { ipcRenderer } = require('electron');
    let webUrl = {
      title : '',
      addr : ''
    }
    // 监听文本输入和样式输入的变化
    document.getElementById('web-title-input').addEventListener('input', function() {
      console.log('image-title-input', this.value)
      webUrl.title = this.value
    })
    document.getElementById('web-addr-input').addEventListener('input', function() {
      console.log('image-url-addr-input', this.value)
      webUrl.addr = this.value
    })
    document.getElementById('insert-web-url').onclick = function() {
      ipcRenderer.send('web-url-dialog-insert', webUrl)
    }
    document.getElementById('cancel-input').onclick = function() {
      ipcRenderer.send('web-url-dialog-cancel')
    }`

  document.head.appendChild(webDivStyle)
  document.body.appendChild(webDiv)
  document.body.appendChild(webDivButtons)
  document.body.appendChild(webDivScript)

  return document.documentElement.outerHTML
}
