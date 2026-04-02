import { BrowserWindow, ipcMain } from 'electron'
import { katexRenderToString } from '../renders/KatexRender'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'
import { getCurrentThemeStyles } from '../themes/theme-config'

let customMathTextDialog: Electron.BrowserWindow | null = null

export function ShowMathTextDialog(mainWindow: Electron.BrowserWindow) {
    if (customMathTextDialog) {
        digcom.ShowAlreadyExistDialog()
        return
    }
    createMathTextDialog(mainWindow)
}

const latexInit =
    'x(t) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty} \\left( a_n \\cos\\left(\\frac{2\\pi nt}{T}\\right) + b_n \\sin\\left(\\frac{2\\pi nt}{T}\\right) \\right)'

// 创建一个自定义对话框的函数
function createMathTextDialog(mainWindow: Electron.BrowserWindow) {
    customMathTextDialog = new BrowserWindow({
        width: 1280,
        height: 550,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '插入数学公式',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    if (!customMathTextDialog) {
        return
    }

    customMathTextDialog.setMenu(null)

    // 加载一个 HTML 文件作为对话框的内容
    customMathTextDialog.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(makeMathTextDialogHtml())}`
    )

    // 发送主题样式
    customMathTextDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        customMathTextDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    // 当窗口关闭时，清除引用
    customMathTextDialog.on('closed', () => {
        ipcMain.removeListener('dialog-math-line-text-btn-insert', processMathLineTextInsert)
        ipcMain.removeListener('dialog-math-block-text-btn-insert', processMathBlockTextInsert)
        ipcMain.removeListener('dialog-math-text-btn-cancel', () => {
            exitCustomFontDialog();
        })
        customMathTextDialog = null
    })

    // 显示窗口
    customMathTextDialog.show()

    function processMathLineTextInsert(_, mathText) {
        mainWindow.webContents.send('monaco-insert-text-block-templates', mathText + '\n')
        exitCustomFontDialog()
    }

    function processMathBlockTextInsert(_, mathText) {
        mainWindow.webContents.send('monaco-insert-text-block-templates', mathText + '\n')
        exitCustomFontDialog()
    }

    function processMathCodeBlockInsert(_, mathText) {
        mainWindow.webContents.send('monaco-insert-text-block-templates', mathText)
        exitCustomFontDialog()
    }

    function processMathTextCancel() {
        exitCustomFontDialog()
    }

    function exitCustomFontDialog() {
        if (customMathTextDialog) {
            ipcMain.removeListener('dialog-math-line-text-btn-insert', processMathLineTextInsert)
            ipcMain.removeListener('dialog-math-block-text-btn-insert', processMathBlockTextInsert)
            ipcMain.removeListener('dialog-math-math-text-btn-insert', processMathCodeBlockInsert)
            ipcMain.removeListener('dialog-math-katex-text-btn-insert', processMathCodeBlockInsert)
            ipcMain.removeListener('dialog-math-latex-text-btn-insert', processMathCodeBlockInsert)
            ipcMain.removeListener('dialog-math-text-btn-cancel', processMathTextCancel)
            customMathTextDialog.close()
            customMathTextDialog = null
        }
    }

    ipcMain.on('dialog-math-line-text-btn-insert', processMathLineTextInsert)
    ipcMain.on('dialog-math-block-text-btn-insert', processMathBlockTextInsert)
    ipcMain.on('dialog-math-math-text-btn-insert', processMathCodeBlockInsert)
    ipcMain.on('dialog-math-katex-text-btn-insert', processMathCodeBlockInsert)
    ipcMain.on('dialog-math-latex-text-btn-insert', processMathCodeBlockInsert)
    ipcMain.on('dialog-math-text-btn-cancel', processMathTextCancel)

    ipcMain.on('sync-katex-render-message', (event, arg) => {
        if (arg == '') {
            event.returnValue = katexRenderToString(latexInit)
        } else {
            event.returnValue = katexRenderToString(arg)
        }
    })
}

function createKatexPreview(doc: Document): HTMLElement {
    const eleDiv = doc.createElement('div')
    eleDiv.style.cssText = 'flex-direction:row'

    const divLabel = doc.createElement('div')
    const previewLabel = doc.createElement('label')
    previewLabel.style.cssText = 'width:10px;margin-left:20px;'
    previewLabel.textContent = '预览区域'
    divLabel.appendChild(previewLabel)

    const divPreview = doc.createElement('div')
    divPreview.style.cssText = 'font-size: 2em;overflow-wrap:break-word;word-break: break-all'
    divPreview.id = 'katex-preview'

    eleDiv.appendChild(divLabel)
    eleDiv.appendChild(divPreview)
    return eleDiv
}

function createKatexEditor(doc: Document): HTMLElement {
    const eleDiv = doc.createElement('div')
    eleDiv.style.cssText = 'margin-top:10px'

    const divLabel = doc.createElement('div')
    const inputLabel = doc.createElement('label')
    inputLabel.style.cssText = 'width:10px;margin-top:10px;margin-left:20px;'
    inputLabel.textContent = '公式编辑'
    divLabel.appendChild(inputLabel)

    const divTextArea = doc.createElement('div')
    const textArea = doc.createElement('textarea')
    textArea.className = 'text-input'
    textArea.id = 'textInput'
    textArea.placeholder = '输入 LaTeX 公式...'
    divTextArea.appendChild(textArea)

    eleDiv.appendChild(divLabel)
    eleDiv.appendChild(divTextArea)
    return eleDiv
}

function createKatexContainer(doc: Document): HTMLElement {
    const divContainer = doc.createElement('div')
    divContainer.id = 'katex-container'

    const titleBar = doc.createElement('div')
    titleBar.className = 'title-bar'

    const titleSpan = doc.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = '数学公式'

    const closeBtn = doc.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = 'x'
    closeBtn.id = 'close-dialog-btn'

    titleBar.appendChild(titleSpan)
    titleBar.appendChild(closeBtn)

    const mainContent = doc.createElement('div')
    mainContent.className = 'main-content'

    const previewDiv = createKatexPreview(doc)
    const editorDiv = createKatexEditor(doc)

    mainContent.appendChild(previewDiv)
    mainContent.appendChild(editorDiv)

    divContainer.appendChild(titleBar)
    divContainer.appendChild(mainContent)
    return divContainer
}

function createButtonList(doc: Document): HTMLElement {
    const buttons: digcom.Button[] = [
        { id: 'insert-math-line', text: '插入行内公式' },
        { id: 'insert-math-block', text: '插入公式块' },
        { id: 'insert-math-math', text: '插入Math' },
        { id: 'insert-math-katex', text: '插入Katex' },
        { id: 'insert-math-latex', text: '插入Latex' },
        { id: 'cancel-insert-math', text: '取消编辑' }
    ]

    const btnList = digcom.NewButtonList(doc, buttons)
    btnList.className = 'btn-list-style'
    return btnList
}

function makeMathTextDialogHtml(): string {
    const theme = getCurrentThemeStyles()

    // 创建一个空的HTML文档
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><title>数学公式编辑</title></head><body></body></html>`
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
    .title-bar { width: 100%; height: 36px; background: var(--title-bar-gradient); display: flex; justify-content: space-between; align-items: center; padding: 0 12px; -webkit-app-region: drag; }
    .title-bar-title { color: #fff; font-size: 14px; font-weight: 500; }
    .close-btn { width: 28px; height: 28px; border: none; background: rgba(255,255,255,0.2); border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff; transition: all 0.2s; -webkit-app-region: no-drag; }
    .close-btn:hover { background: rgba(255,100,100,0.9); }
    .main-content { flex: 1; padding: 15px 20px; display: flex; flex-direction: column; }
    #textInput { width: 100%; height: 100px; overflow-y: auto; margin-top: 10px; flex-direction: column; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; color: var(--text-color); font-size: 14px; font-family: "Fira Code", "Consolas", monospace; resize: none; outline: none; }
    #textInput:focus { border-color: var(--accent-color); }
    #katex-preview { width: 100%; height: 250px; display: flex; justify-content: center; align-items: center; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px; color: var(--text-color); }
    #katex-preview .katex { color: var(--text-color); }
    .btn-list-style { width: 100%; margin-top: 20px; display: flex; justify-content: center; align-items: center; gap: 15px; }
    .katex-html { position: absolute; left: -9999px; }
    label { color: var(--text-color); font-size: 13px; font-weight: 500; }
    button { padding: 8px 20px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--card-bg); color: var(--text-color); font-size: 13px; cursor: pointer; transition: all 0.2s; }
    button:hover { background: var(--hover-bg); border-color: var(--accent-color); }
    button.primary { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
    button.primary:hover { opacity: 0.9; }`
    document.head.appendChild(webDivStyle)

    const divContainer = createKatexContainer(document)
    document.body.appendChild(divContainer)

    const btnList = createButtonList(document)
    document.body.appendChild(btnList)

    const eleScript = document.createElement('script')
    eleScript.textContent = `
    const { ipcRenderer } = require('electron');
    const latexInit = '${latexInit.replace(/\\/g, '\\\\')}';
    let latexData = latexInit;

    // 初始化预览
    const result = ipcRenderer.sendSync('sync-katex-render-message', latexInit);
    document.getElementById("katex-preview").innerHTML = result;
    document.getElementById("textInput").value = latexInit;

    // 处理textInput的input事件，获取内容，渲染后进行显示
    function updateTextInput(event) {
      let inputText = event.target.value;
      let html = '';
      try {
        html = ipcRenderer.sendSync('sync-katex-render-message', inputText);
      } catch (error) {
        html = '<span style="color:red">公式语法错误</span>';
      }
      document.getElementById("katex-preview").innerHTML = html;
      latexData = event.target.value;
    }

    // 监控textInput的input事件
    document.getElementById('textInput').addEventListener('input', updateTextInput);

    document.getElementById('insert-math-line').onclick = function(e) {
      ipcRenderer.send('dialog-math-line-text-btn-insert', '$' + latexData + '$');
    };
    document.getElementById('insert-math-block').onclick = function(e) {
      ipcRenderer.send('dialog-math-block-text-btn-insert', '$$\\r\\n' + latexData + '\\r\\n$$\\r\\n');
    };
    document.getElementById('insert-math-math').onclick = function(e) {
      ipcRenderer.send('dialog-math-math-text-btn-insert', '~~~math\\r\\n' + latexData + '\\r\\n~~~\\r\\n');
    };
    document.getElementById('insert-math-katex').onclick = function(e) {
      ipcRenderer.send('dialog-math-katex-text-btn-insert', '~~~katex\\r\\n' + latexData + '\\r\\n~~~\\r\\n');
    };
    document.getElementById('insert-math-latex').onclick = function(e) {
      ipcRenderer.send('dialog-math-latex-text-btn-insert', '~~~latex\\r\\n' + latexData + '\\r\\n~~~\\r\\n');
    };
    document.getElementById('cancel-insert-math').onclick = function(e) {
      ipcRenderer.send('dialog-math-text-btn-cancel');
    };
    document.getElementById('close-dialog-btn').onclick = function(e) {
      ipcRenderer.send('dialog-math-text-btn-cancel');
    };

    // 监听主题更新
    ipcRenderer.on('baize-notes:theme-updated', function() {
      location.reload();
    });
    ipcRenderer.on('baize-notes:init-theme-styles', function(event, theme) {
      var root = document.documentElement;
      root.style.setProperty('--bg-color', theme.backgroundColor);
      root.style.setProperty('--card-bg', theme.cardBackground);
      root.style.setProperty('--text-color', theme.textColor);
      root.style.setProperty('--secondary-text-color', theme.secondaryTextColor);
      root.style.setProperty('--border-color', theme.borderColor);
      root.style.setProperty('--accent-color', theme.accentColor);
      root.style.setProperty('--hover-bg', theme.hoverBackground);
      root.style.setProperty('--title-bar-gradient', theme.titleBarGradient);
    });`

    document.body.appendChild(eleScript)
    return document.documentElement.outerHTML
}
