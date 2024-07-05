import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'

let systemSettingDialog: Electron.BrowserWindow | null

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ShowSystemSettingDialog() {
  systemSettingDialog = new BrowserWindow({
    width: 450,
    height: 200,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: '重命名',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  systemSettingDialog.setMenu(null)

  const tempHtml = makeSystemSettingDialogHtml()
  // 加载一个 HTML 文件作为对话框的内容
  systemSettingDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)

  // 显示窗口
  systemSettingDialog.show()

  systemSettingDialog.on('closed', () => {
    systemSettingDialog = null
    ipcMain.removeListener('system-setting-apply', processApplySysSetting)
    ipcMain.removeListener('dialog-system-setting-cancel', () => {})
  })

  function exitSystemSettingDialog() {
    if (systemSettingDialog) {
      ipcMain.removeListener('dialog-system-setting-apply', processApplySysSetting)
      ipcMain.removeListener('dialog-system-setting-cancel', () => {})
      systemSettingDialog.close()
      systemSettingDialog = null
    }
  }

  function processApplySysSetting(
    _,
    SysSetting: {
      language: string
      resourceManager: string
      editorModel: string
    }
  ) {
    console.log('SysSetting', SysSetting)
  }

  ipcMain.on('dialog-system-setting-apply', processApplySysSetting)
  ipcMain.on('dialog-system-setting-cancel', () => {
    exitSystemSettingDialog()
  })
}

function createDivLabelList(doc: Document): HTMLDivElement {
  const eleDiv = doc.createElement('div')
  eleDiv.style.cssText =
    'margin-top: 10px; margin-left: 20px; display: flex; flex-direction: column;'
  const divLanguage = doc.createElement('div')
  divLanguage.style.cssText = 'margin: 5px'
  const divLanguageLabel = doc.createElement('label')
  divLanguageLabel.htmlFor = 'system-language'
  divLanguageLabel.textContent = '系统语言：'
  divLanguage.appendChild(divLanguageLabel)

  const divResMgr = doc.createElement('div')
  divResMgr.style.cssText = 'margin: 5px'
  const divResMgrLabel = doc.createElement('label')
  divResMgrLabel.htmlFor = 'system-resource-manager'
  divResMgrLabel.textContent = '资源管理器：'
  divResMgr.appendChild(divResMgrLabel)

  const divEditModel = doc.createElement('div')
  divEditModel.style.cssText = 'margin: 5px'
  const divEditModelLabel = doc.createElement('label')
  divEditModelLabel.htmlFor = 'system-editor-view-model'
  divEditModelLabel.textContent = '编辑器视图：'
  divEditModel.appendChild(divEditModelLabel)

  eleDiv.appendChild(divLanguage)
  eleDiv.appendChild(divResMgr)
  eleDiv.appendChild(divEditModel)

  return eleDiv
}

function createLanguageSelect(doc: Document): HTMLDivElement {
  const divLanSelect = doc.createElement('select')
  divLanSelect.style.cssText = 'margin: 5px'
  divLanSelect.id = 'system-language'
  divLanSelect.name = 'system-language'

  const divLanZhCn = doc.createElement('option')
  divLanZhCn.value = 'zh-cn'
  divLanZhCn.textContent = '简体中文(默认)'

  const divLanZhTw = doc.createElement('option')
  divLanZhTw.value = 'zh-tw'
  divLanZhTw.textContent = '繁體中文'

  const divLanEnUs = doc.createElement('option')
  divLanEnUs.value = 'en-us'
  divLanEnUs.textContent = 'English'

  divLanSelect.appendChild(divLanZhCn)
  divLanSelect.appendChild(divLanZhTw)
  divLanSelect.appendChild(divLanEnUs)

  return divLanSelect
}

function createResourceManager(doc: Document): HTMLDivElement {
  const divResSelect = doc.createElement('select')
  divResSelect.style.cssText = 'margin: 5px'
  divResSelect.id = 'system-resource-manager'
  divResSelect.name = 'system-resource-manager'

  const divResDisplay = doc.createElement('option')
  divResDisplay.value = 'default'
  divResDisplay.textContent = '显示(默认)'

  const divResHide = doc.createElement('option')
  divResHide.value = 'hide'
  divResHide.textContent = '隐藏'

  divResSelect.appendChild(divResDisplay)
  divResSelect.appendChild(divResHide)

  return divResSelect
}

function createEditorViewModel(doc: Document): HTMLDivElement {
  const divViewModel = doc.createElement('select')
  divViewModel.style.cssText = 'margin: 5px'
  divViewModel.id = 'system-editor-view-model'
  divViewModel.name = 'system-editor-view-model'

  const divEditPreview = doc.createElement('option')
  divEditPreview.value = 'default'
  divEditPreview.textContent = '编辑/预览模式(默认)'

  const divEditorModel = doc.createElement('option')
  divEditorModel.value = 'editor-model'
  divEditorModel.textContent = '编辑模式'

  const divPreviewModel = doc.createElement('option')
  divPreviewModel.value = 'preview-model'
  divPreviewModel.textContent = '预览模式'

  divViewModel.appendChild(divEditPreview)
  divViewModel.appendChild(divEditorModel)
  divViewModel.appendChild(divPreviewModel)

  return divViewModel
}

function createDivSelect(doc: Document): HTMLDivElement {
  const eleDiv = doc.createElement('div')
  eleDiv.style.cssText = 'margin-top: 15px;display: flex; flex-direction: column;'
  const eleLanSelect = createLanguageSelect(doc)
  const eleResMgr = createResourceManager(doc)
  const eleEditViewModel = createEditorViewModel(doc)
  eleDiv.appendChild(eleLanSelect)
  eleDiv.appendChild(eleResMgr)
  eleDiv.appendChild(eleEditViewModel)
  return eleDiv
}

function createSettingButtons(doc: Document): HTMLDivElement {
  const eleDiv = doc.createElement('div')
  eleDiv.className = 'btn-list-style'
  const eleDivConfirm = doc.createElement('button')
  eleDivConfirm.id = 'system-setting-apply'
  eleDivConfirm.style.cssText = 'width: 100px'
  eleDivConfirm.textContent = '应用'
  const eleDivCancel = doc.createElement('button')
  eleDivCancel.id = 'system-setting-cancel'
  eleDivCancel.style.cssText = 'width: 100px'
  eleDivCancel.textContent = '取消'
  eleDiv.appendChild(eleDivConfirm)
  eleDiv.appendChild(eleDivCancel)
  return eleDiv
}

function makeSystemSettingDialogHtml(): string {
  // 创建一个空的HTML文档
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>系统设置</title></head><body></body></html>`
  ).window

  const webDivStyle = document.createElement('style')
  webDivStyle.textContent = `
    .btn-list-style {width:400px;margin-top:10px; display:flex; justify-content:center;align-items:center;gap: 100px}`
  document.head.appendChild(webDivStyle)

  const eleDiv = document.createElement('div')
  eleDiv.style.cssText = 'display: flex; flex-direction: row; margin-left: 20px;'
  const eleDivLabel = createDivLabelList(document)
  const eleDivSelect = createDivSelect(document)
  const buttons = createSettingButtons(document)
  eleDiv.appendChild(eleDivLabel)
  eleDiv.appendChild(eleDivSelect)
  document.body.appendChild(eleDiv)
  document.body.appendChild(buttons)

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
