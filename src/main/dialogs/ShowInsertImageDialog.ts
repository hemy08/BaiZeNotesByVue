import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import * as Utils from '../utils/utils'
import * as digcom from './dialog_common'
import { getCurrentThemeStyles } from '../themes/theme-config'

let insertImageDialog: Electron.BrowserWindow | null

interface IMGFile {
    title: string
    href: string
    path: string
    content: string
    name: string
}

// 创建一个自定义对话框的函数
export function ShowInsertImageDialog(mainWindow: Electron.BrowserWindow) {
    if (insertImageDialog) {
        digcom.ShowAlreadyExistDialog()
        return
    }
    createInsertImageDialog(mainWindow)
}

function createInsertImageDialog(mainWindow: Electron.BrowserWindow) {
    insertImageDialog = new BrowserWindow({
        width: 600,
        height: 300,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '插入图片',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    if (!insertImageDialog) {
        return
    }

    insertImageDialog.setMenu(null)

    insertImageDialog.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(makeInsertImageDialogHtml())}`
    )

    // 发送主题样式
    insertImageDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        insertImageDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    insertImageDialog.on('closed', () => {
        ipcMain.removeListener('dialog-insert-image-btn-insert', processInsertImage)
        ipcMain.removeListener('dialog-insert-image-btn-cancel', processCancelImage)
        insertImageDialog = null
    })

    insertImageDialog.show()

    function processInsertImage(_, imgFile: IMGFile) {
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
        exitInsertImageDialog()
    }

    function processCancelImage() {
        exitInsertImageDialog()
    }

    function exitInsertImageDialog() {
        if (insertImageDialog) {
            ipcMain.removeListener('dialog-insert-image-btn-insert', processInsertImage)
            ipcMain.removeListener('dialog-insert-image-btn-cancel', processCancelImage)
            insertImageDialog.close()
            insertImageDialog = null
        }
    }

    ipcMain.on('dialog-insert-image-btn-insert', processInsertImage)
    ipcMain.on('dialog-insert-image-btn-cancel', processCancelImage)
}

function createImgTitleDiv(doc: Document): HTMLElement {
    const imgDivTitle = doc.createElement('div')
    imgDivTitle.id = 'image-title'
    const imgDivTitleLabel = doc.createElement('label')
    imgDivTitleLabel.id = 'image-title-label'
    imgDivTitleLabel.htmlFor = 'image-title-input'
    imgDivTitleLabel.textContent = '图片标题'
    const imgDivTitleInput = doc.createElement('input')
    imgDivTitleInput.id = 'image-title-input'
    imgDivTitleInput.type = 'text'
    imgDivTitleInput.placeholder = '请输入图片标题...'
    imgDivTitle.appendChild(imgDivTitleLabel)
    imgDivTitle.appendChild(imgDivTitleInput)
    return imgDivTitle
}

function createImgUrlDiv(doc: Document): HTMLElement {
    const imgDivUrl = doc.createElement('div')
    imgDivUrl.id = 'image-url'
    const imgDivUrlLabel = doc.createElement('label')
    imgDivUrlLabel.id = 'image-url-label'
    imgDivUrlLabel.htmlFor = 'image-url-input'
    imgDivUrlLabel.textContent = '图片路径'
    const imgDivUrlInput = doc.createElement('input')
    imgDivUrlInput.id = 'image-url-input'
    imgDivUrlInput.type = 'text'
    imgDivUrlInput.placeholder = '请输入图片路径...'
    imgDivUrl.appendChild(imgDivUrlLabel)
    imgDivUrl.appendChild(imgDivUrlInput)

    const imgDivUrlFile = doc.createElement('div')
    imgDivUrlFile.id = 'image-url-file-input'
    const imgDivUrlFileLabel = doc.createElement('label')
    imgDivUrlFileLabel.id = 'image-url-file-label'
    imgDivUrlFileLabel.textContent = '选择本地图片'
    const imgDivUrlFileInput = doc.createElement('input')
    imgDivUrlFileInput.type = 'file'
    imgDivUrlFileInput.accept = 'image/*'
    imgDivUrlFileLabel.appendChild(imgDivUrlFileInput)
    imgDivUrlFile.appendChild(imgDivUrlFileLabel)
    imgDivUrl.appendChild(imgDivUrlFile)

    return imgDivUrl
}

function createImgHrefDiv(doc: Document): HTMLElement {
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
        { id: 'cancel-image', text: '取消', btnClass: 'image-button-style' }
    ]

    const btnList = digcom.NewButtonList(doc, buttons)
    btnList.className = 'image-button-container-style'
    return btnList
}

function makeInsertImageDialogHtml(): string {
    const theme = getCurrentThemeStyles()

    // 创建一个空的HTML文档
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><title>插入图片</title></head><body></body></html>`
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
    .title-bar { width: 100%; height: 40px; background: var(--title-bar-gradient); display: flex; justify-content: space-between; align-items: center; padding: 0 16px; -webkit-app-region: drag; }
    .title-bar-title { color: #fff; font-size: 14px; font-weight: 500; letter-spacing: 0.5px; }
    .close-btn { width: 32px; height: 32px; border: none; background: rgba(255,255,255,0.15); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; color: #fff; transition: all 0.2s; -webkit-app-region: no-drag; }
    .close-btn:hover { background: rgba(255,80,80,0.95); transform: scale(1.05); }
    .main-content { flex: 1; padding: 24px 28px; display: flex; flex-direction: column; }
    #image-components { width: 100%; display: flex; flex-direction: column; gap: 20px; }
    #image-components > div { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    #image-components label { color: var(--text-color); font-size: 13px; min-width: 80px; font-weight: 500; }
    #image-components input[type="text"] { flex: 1; min-width: 200px; max-width: 400px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; color: var(--text-color); font-size: 13px; transition: all 0.2s; }
    #image-components input[type="text"]:focus { border-color: var(--accent-color); outline: none; box-shadow: 0 0 0 3px rgba(100,150,255,0.1); }
    #image-components input[type="text"]::placeholder { color: var(--secondary-text-color); opacity: 0.6; }
    .image-button-style { min-width: 100px; padding: 10px 28px; }
    .image-button-container-style { width: 100%; display: flex; justify-content: center; align-items: center; gap: 24px; margin-top: 8px; }
    #image-url-file-input { display: flex; align-items: center; }
    #image-url-file-label { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; line-height: 36px; text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; padding: 0 20px; color: var(--text-color); transition: all 0.2s; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
    #image-url-file-label:hover { background: var(--hover-bg); border-color: var(--accent-color); transform: translateY(-1px); }
    #image-url-file-label::before { content: "📁"; font-size: 14px; }
    #image-url-file-input input[type="file"] { position: absolute; opacity: 0; cursor: pointer; width: 0; height: 0; }
    button { padding: 10px 24px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); color: var(--text-color); font-size: 13px; cursor: pointer; transition: all 0.2s; font-weight: 500; }
    button:hover { background: var(--hover-bg); border-color: var(--accent-color); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    button:active { transform: translateY(0); }`

    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = '插入图片'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = 'x'
    closeBtn.id = 'close-dialog-btn'
    titleBar.appendChild(titleSpan)
    titleBar.appendChild(closeBtn)

    const mainContent = document.createElement('div')
    mainContent.className = 'main-content'

    const imgDiv = document.createElement('div')
    imgDiv.id = 'image-components'
    imgDiv.appendChild(createImgTitleDiv(document))
    imgDiv.appendChild(createImgUrlDiv(document))
    imgDiv.appendChild(createImgHrefDiv(document))
    imgDiv.appendChild(createImgButtonDiv(document))
    mainContent.appendChild(imgDiv)

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
    }
    document.getElementById('close-dialog-btn').onclick = function(e) {
      ipcRenderer.send('dialog-insert-image-btn-cancel')
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

    document.head.appendChild(webDivStyle)
    document.body.appendChild(titleBar)
    document.body.appendChild(mainContent)
    document.body.appendChild(imgDivScript)

    return document.documentElement.outerHTML
}
