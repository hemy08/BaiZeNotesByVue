import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import * as Utils from '../utils/utils'
import * as digcom from './dialog_common'

let insertImageDialog: Electron.BrowserWindow | null

interface IMGFile {
  title: string
  href: string
  path: string
  content: string
  name: string
}

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ShowInsertImageDialog(mainWindow: Electron.BrowserWindow) {
  insertImageDialog = new BrowserWindow({
    width: 590,
    height: 240,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: '插入图片',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  insertImageDialog.setMenu(null)

  const tempHtml = makeInsertImageDialogHtml()
  // 加载一个 HTML 文件作为对话框的内容
  insertImageDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)

  // 显示窗口
  insertImageDialog.show()

  insertImageDialog.on('closed', () => {
    insertImageDialog = null
    ipcMain.removeListener('dialog-insert-image-btn-insert', processImageInsert)
    ipcMain.removeListener('dialog-insert-image-btn-cancel', () => {})
  })

  function exitInsertImageDialog() {
    if (insertImageDialog) {
      insertImageDialog.close()
      insertImageDialog = null
    }
  }

  function processImageInsert(_, imgFile: IMGFile) {
    let imgUrl = ''
    if (imgFile.content.length !== 0) {
      if (Utils.FileUtils.SaveImageDataToFile(imgFile.name, imgFile.content)) {
        imgUrl = '![' + imgFile.title + '](./images/' + imgFile.name + ')'
      }
    } else if (imgFile.path.length !== 0) {
      imgUrl = '![' + imgFile.title + '](' + imgFile.path + ')'
    } else if (imgFile.href.length !== 0) {
      imgUrl = '![' + imgFile.title + '](' + imgFile.href + ')'
    } else {
      imgUrl = ''
    }

    if (imgUrl.length !== 0) {
      mainWindow.webContents.send('monaco-insert-text-block-templates', imgUrl)
    }

    if (insertImageDialog) {
      insertImageDialog.close()
    }
  }

  ipcMain.on('dialog-insert-image-btn-insert', processImageInsert)
  ipcMain.on('dialog-insert-image-btn-cancel', () => {
    exitInsertImageDialog()
  })
}

function createImgTitleDiv(doc: Document): Element {
  const imgDivTitle = doc.createElement('div')
  imgDivTitle.id = 'image-title'
  const imgDivTitleLabel = doc.createElement('label')
  imgDivTitleLabel.id = 'image-title-label'
  imgDivTitleLabel.htmlFor = 'image-title-input'
  imgDivTitleLabel.textContent = '图片描述'
  const imgDivTitleInput = doc.createElement('input')
  imgDivTitleInput.id = 'image-title-input'
  imgDivTitleInput.type = 'text'
  imgDivTitleInput.placeholder = '请输入图片描述...'
  imgDivTitle.appendChild(imgDivTitleLabel)
  imgDivTitle.appendChild(imgDivTitleInput)
  return imgDivTitle
}

function createImgUrlDiv(doc: Document): Element {
  const imgDivUrl = doc.createElement('div')
  imgDivUrl.id = 'image-url'
  const imgDivUrlLabel = doc.createElement('label')
  imgDivUrlLabel.id = 'image-url-label'
  imgDivUrlLabel.htmlFor = 'image-url-input'
  imgDivUrlLabel.textContent = '图片路径'
  const imgDivUrlInput = doc.createElement('input')
  imgDivUrlInput.id = 'image-url-input'
  imgDivUrlInput.type = 'text'
  imgDivUrlInput.placeholder = '支持相对路径/绝对路径...'
  const imgDivUrlFileLabel = doc.createElement('label')
  imgDivUrlFileLabel.id = 'image-url-file-label'
  imgDivUrlFileLabel.htmlFor = 'image-url-file-input'
  imgDivUrlFileLabel.textContent = ' 选择文件 '
  const imgDivUrlFileInput = doc.createElement('input')
  imgDivUrlFileInput.id = 'image-url-file-input'
  imgDivUrlFileInput.type = 'file'
  imgDivUrlFileInput.accept = 'image/*'
  imgDivUrlFileInput.style.cssText = `display: none;`
  imgDivUrl.appendChild(imgDivUrlLabel)
  imgDivUrl.appendChild(imgDivUrlInput)
  imgDivUrl.appendChild(imgDivUrlFileLabel)
  imgDivUrl.appendChild(imgDivUrlFileInput)
  return imgDivUrl
}

function createImgHrefDiv(doc: Document): Element {
  const imgDivHref = doc.createElement('div')
  imgDivHref.id = 'image-title'
  const imgDivHrefLabel = doc.createElement('label')
  imgDivHrefLabel.id = 'image-href-label'
  imgDivHrefLabel.htmlFor = 'image-href-input'
  imgDivHrefLabel.textContent = '图片链接'
  const imgDivHrefInput = doc.createElement('input')
  imgDivHrefInput.id = 'image-href-input'
  imgDivHrefInput.type = 'text'
  imgDivHrefInput.placeholder = '请输入网络图片地址...'
  imgDivHref.appendChild(imgDivHrefLabel)
  imgDivHref.appendChild(imgDivHrefInput)
  return imgDivHref
}

function createImgButtonDiv(doc: Document): Element {
  const buttons: digcom.Button[] = [
    { id: 'insert-image', text: '应用', btnClass: 'image-button-style' },
    { id: 'cancelButton', text: '取消', btnClass: 'image-button-style' }
  ]

  const btnList = digcom.NewButtonList(doc, buttons)
  btnList.className = 'image-button-container-style'
  return btnList
}

function makeInsertImageDialogHtml(): string {
  // 创建一个空的HTML文档
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>插入图片</title></head><body></body></html>`
  ).window

  const webDivStyle = document.createElement('style')
  webDivStyle.textContent = `
    #image-components {margin: 5px;width: 560px}
    #image-components > div {margin: 15px;}
    #image-components input {margin-left: 10px;width: 350px;}
    .image-button-style {width: 100px;margin-top: 10px;}
    .image-button-container-style {width:500px;display:flex; justify-content:center;align-items: center;gap: 100px}
    #image-url-file-label {background-color: #f0f0f0;border: 1px solid #ccc;border-radius: 5px;margin: 2px;
        line-height: 25px;text-align: center;overflow: hidden;white-space: nowrap;text-overflow: ellipsis;cursor: pointer;}
    #image-url-file-input input[type="file"] {position: absolute;opacity: 0;cursor: pointer;}`

  const imgDiv = document.createElement('div')
  imgDiv.id = 'image-components'
  imgDiv.appendChild(createImgTitleDiv(document))
  imgDiv.appendChild(createImgUrlDiv(document))
  imgDiv.appendChild(createImgHrefDiv(document))
  imgDiv.appendChild(createImgButtonDiv(document))

  const imgDivScript = document.createElement('script')
  imgDivScript.textContent = `
    const { ipcRenderer } = require('electron');
    let imgFile = {
      title: '',
      href: '',
      path: '',
      content: ''
    }
    document.getElementById('image-url-file-input').addEventListener('change', function(e) {
      const image = e.target.files[0]
      if (image) {
        if (image.type.startsWith('image/')) {
          imgFile.href = ''
          imgFile.path = ''
          const reader = new FileReader();
          reader.onload = function(e) {
            imgFile.content = e.target.result
          }
          reader.readAsDataURL(image)
          imgFile.name = image.name
          document.getElementById('image-url-input').value = './images/' + image.name
          document.getElementById('image-href-input').value = ''
        }
      }
    })
    document.getElementById('image-title-input').addEventListener('input', function (e){
      imgFile.title = this.value
    })
    document.getElementById('image-href-input').addEventListener('input', function (e){
      imgFile.href = this.value
      imgFile.path = ''
      imgFile.content = ''
      document.getElementById('image-url-input').value = ''
    })
    document.getElementById('image-url-input').addEventListener('input', function (e){
      imgFile.path = this.value
      imgFile.content = ''
      imgFile.href = ''
      document.getElementById('image-href-input').value = ''
    })
    document.getElementById('insert-image').onclick = function(e) {
      ipcRenderer.send('dialog-insert-image-btn-insert', imgFile)
    }
    document.getElementById('cancel-image').onclick = function(e) {
      ipcRenderer.send('dialog-insert-image-btn-cancel')
    }`

  document.head.appendChild(webDivStyle)
  document.body.appendChild(imgDiv)
  document.body.appendChild(imgDivScript)

  return document.documentElement.outerHTML
}
