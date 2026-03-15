import { BrowserWindow, ipcMain } from 'electron'
import { getCurrentThemeStyles } from '../utils/theme-config'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'

let systemSettingDialog: Electron.BrowserWindow | null

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ShowSystemSettingDialog() {
    if (systemSettingDialog) {
        digcom.ShowAlreadyExistDialog()
        return
    }
    systemSettingDialog = new BrowserWindow({
        width: 500,
        height: 300,
        minimizable: false,
        maximizable: false,
        resizable: false,
        title: '系统设置',
        autoHideMenuBar: true,
        frame: false,
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
    // 发送主题样式
    const theme = getCurrentThemeStyles()
    systemSettingDialog?.webContents.send('baize-notes:init-theme-styles', theme)

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
        exitSystemSettingDialog()
    }

    ipcMain.on('dialog-system-setting-apply', processApplySysSetting)
    ipcMain.on('dialog-system-setting-cancel', () => {
        exitSystemSettingDialog()
    })
}

function createLanguageSelect(doc: Document): Element {
    const options: digcom.Option[] = [
        { value: 'zh-cn', text: '简体中文(默认)' },
        { value: 'zh-tw', text: '繁體中文' },
        { value: 'en-us', text: 'English(US)' }
    ]
    const divLanSelect = digcom.NewSelect(doc, options)
    divLanSelect.id = 'system-language'
    divLanSelect.name = 'system-language'
    return divLanSelect
}

function createResourceManager(doc: Document): HTMLElement {
    const options: digcom.Option[] = [
        { value: 'default', text: '显示(默认)' },
        { value: 'hide', text: '隐藏' }
    ]
    const divResManager = digcom.NewSelect(doc, options)
    divResManager.id = 'system-resource-manager'
    divResManager.name = 'system-resource-manager'
    return divResManager
}

function createEditorViewModel(doc: Document): HTMLElement {
    const options: digcom.Option[] = [
        { value: 'default', text: '编辑/预览模式(默认)' },
        { value: 'editor-preview-model', text: '编辑/预览模式' },
        { value: 'editor-model', text: '编辑模式' },
        { value: 'preview-model', text: '预览模式' }
    ]
    const divViewModel = digcom.NewSelect(doc, options)
    divViewModel.id = 'system-editor-view-model'
    divViewModel.name = 'system-editor-view-model'
    return divViewModel
}

function createPluginOpenModel(doc: Document): HTMLElement {
    const options: digcom.Option[] = [
        { value: 'default', text: '浏览器网页(默认)' },
        { value: 'browser', text: '浏览器网页' },
        { value: 'local-dialog', text: 'app对话框' }
    ]
    const divViewModel = digcom.NewSelect(doc, options)
    divViewModel.id = 'system-plugin-open-model'
    divViewModel.name = 'system-plugin-open-model'
    return divViewModel
}

function createSettingInputs(doc: Document): HTMLElement {
    const divEle = doc.createElement('div')
    divEle.style.cssText = 'display: flex; flex-direction: column; gap: 0;'

    // 第一行：系统语言
    const row1 = doc.createElement('div')
    row1.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'
    row1.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'system-language',
            text: '系\u00A0\u00A0统\u00A0\u00A0语\u00A0\u00A0\u00A0言：'
        })
    )
    row1.appendChild(createLanguageSelect(doc))
    divEle.appendChild(row1)

    // 第二行：资源管理器
    const row2 = doc.createElement('div')
    row2.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'
    row2.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'system-resource-manager',
            text: '资\u00A0源\u00A0管\u00A0理\u00A0器：'
        })
    )
    row2.appendChild(createResourceManager(doc))
    divEle.appendChild(row2)

    // 第三行：编辑器视图
    const row3 = doc.createElement('div')
    row3.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'
    row3.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'system-editor-view-model',
            text: '编\u00A0辑\u00A0器\u00A0视\u00A0图：'
        })
    )
    row3.appendChild(createEditorViewModel(doc))
    divEle.appendChild(row3)

    // 第四行：插件打开方式
    const row4 = doc.createElement('div')
    row4.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px;'
    row4.appendChild(
        digcom.NewLabelDiv(doc, {
            divClass: 'label-style',
            forHtml: 'system-plugin-open-model',
            text: '插件打开方式：'
        })
    )
    row4.appendChild(createPluginOpenModel(doc))
    divEle.appendChild(row4)

    return divEle
}

function createSettingButtons(doc: Document): HTMLElement {
    const eleDiv = doc.createElement('div')
    eleDiv.className = 'btn-list-style'
    eleDiv.appendChild(digcom.NewButton(doc, { id: 'system-setting-apply', text: '应用' }))
    eleDiv.appendChild(digcom.NewButton(doc, { id: 'system-setting-cancel', text: '取消' }))
    return eleDiv
}

function makeSystemSettingDialogHtml(): string {
    const theme = getCurrentThemeStyles()

    // 创建一个空的HTML文档
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><title>系统设置</title></head><body></body></html>`
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

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
            background-color: var(--bg-color);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .title-bar {
            width: 100%;
            height: 32px;
            background: var(--title-bar-gradient);
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 10px;
            -webkit-app-region: drag;
            flex-shrink: 0;
        }

        .title-bar-title {
            color: #fff;
            font-size: 13px;
            font-weight: 500;
        }

        .close-btn {
            width: 28px;
            height: 28px;
            border: none;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: #fff;
            transition: all 0.2s;
            -webkit-app-region: no-drag;
        }

        .close-btn:hover { background: rgba(255,100,100,0.9); }

        .main-content {
            flex: 1;
            padding: 15px 20px;
            display: flex;
            flex-direction: column;
        }

        .label-style {
            min-width: 80px;
            color: var(--text-color);
            font-size: 13px;
            font-weight: 500;
            text-align: right;
            display: flex;
            align-items: center;
            justify-content: flex-end;
        }

        select {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            font-size: 13px;
            background: var(--card-bg);
            color: var(--text-color);
            cursor: pointer;
            transition: all 0.2s;
        }

        select:focus {
            outline: none;
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(100,150,255,0.1);
        }

        select:hover {
            border-color: var(--accent-color);
        }

        .btn-list-style {
            margin-top: 15px;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 30px;
        }

        button {
            padding: 8px 24px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background: var(--card-bg);
            color: var(--text-color);
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
            font-weight: 500;
        }

        button:hover {
            background: var(--hover-bg);
            border-color: var(--accent-color);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        button:active {
            transform: translateY(0);
        }`
    document.head.appendChild(webDivStyle)

    // 创建标题栏
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'
    const title = document.createElement('span')
    title.className = 'title-bar-title'
    title.textContent = '系统设置'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = 'x'
    closeBtn.id = 'close-dialog-btn'
    titleBar.appendChild(title)
    titleBar.appendChild(closeBtn)
    document.body.appendChild(titleBar)

    // 创建主内容区域
    const mainContent = document.createElement('div')
    mainContent.className = 'main-content'

    // 创建设置输入区域
    mainContent.appendChild(createSettingInputs(document))

    // 创建按钮
    mainContent.appendChild(createSettingButtons(document))

    document.body.appendChild(mainContent)

    const eleScript = document.createElement('script')
    eleScript.textContent = `
    const { ipcRenderer } = require('electron');

    // 监听主题更新
    ipcRenderer.on('baize-notes:theme-updated', () => {
        location.reload();
    });

    let SystemSetting = {
      language:"zh-cn",
      resourceManager: "default",
      editorModel: 'default',
      pluginOpen: 'browser'
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
    document.getElementById('system-plugin-open-model').addEventListener('input', (event) => {
      SystemSetting.pluginOpen = event.target.value
    })
    document.getElementById('system-setting-apply').onclick = function(e) {
      ipcRenderer.send('dialog-system-setting-apply', SystemSetting)
    }
    document.getElementById('system-setting-cancel').onclick = function(e) {
      ipcRenderer.send('dialog-system-setting-cancel')
    }
    document.getElementById('close-dialog-btn').onclick = function(e) {
      ipcRenderer.send('dialog-system-setting-cancel')
    }`

    document.body.appendChild(eleScript)
    return document.documentElement.outerHTML
}
