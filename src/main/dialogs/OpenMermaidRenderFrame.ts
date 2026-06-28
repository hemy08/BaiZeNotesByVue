import { ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'

let mermaidRenderResult: string | PromiseLike<string> // 假设这是一个全局变量

export async function HandleMermaidGetRenderResult(text: string): Promise<string> {
    CreateMermaidRenderFrame(text)
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            //console.log('mermaidHandleGetRenderResult setTimeout 11111')
            if (mermaidRenderResult != '') {
                // console.log('mermaidHandleGetRenderResult setTimeout 22222', mermaidRenderResult)
                resolve(mermaidRenderResult)
            } else {
                reject(new Error('Wait mermaid render result time out'))
            }
        }, 2000)
    })
}

export function CreateMermaidRenderFrame(graphDesc: string) {
    const existing = windowManager.getWindowByType('mermaid-render-frame')
    if (existing) {
        existing.close()
    }

    const mermaidRenderWindow = windowManager.createWindow('mermaid-render-frame', createDialogOptions({
        width: 800,
        height: 600,
        show: false,
        resizable: false,
        title: 'Mermaid Render'
    }), 'mermaid-render-frame', false)

    const mermaidFrame = createMermaidRenderHtmlContent(graphDesc)
    const tempHtml = mermaidFrame.documentElement.outerHTML

    // 加载一个 HTML 文件作为对话框的内容
    mermaidRenderWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)
    mermaidFrame.close()

    function processMermaidRenderResult(_, result: string) {
        mermaidRenderResult = result
        ipcMain.removeListener('dialog-mermaid-render-svg-result', processMermaidRenderResult)
    }

    ipcMain.on('dialog-mermaid-render-svg-result', processMermaidRenderResult)

    mermaidRenderWindow.on('closed', () => {
        ipcMain.removeListener('dialog-mermaid-render-svg-result', processMermaidRenderResult)
    })
}

export function updateMermaidWindowHtml(graphDesc: string) {
    const win = windowManager.getWindowByType('mermaid-render-frame')
    if (win && !win.isDestroyed()) {
        win.webContents.send('update-mermaid-render-graph', graphDesc)
    }
}

function createMermaidRenderHtmlContent(mermaidGraphDesc: string): Document {
    // 创建一个空的HTML文档
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><title>Mermaid Render</title></head><body></body></html>`
    ).window

    const ele_head_link = document.createElement('link')
    ele_head_link.rel = 'stylesheet'
    ele_head_link.href = 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.css'

    const ele_head_script = document.createElement('script')
    ele_head_script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js'

    const ele_body_mermaidGraph = document.createElement('div')
    ele_body_mermaidGraph.id = 'mermaidGraph'
    ele_body_mermaidGraph.className = 'mermaid'
    ele_body_mermaidGraph.textContent = mermaidGraphDesc

    const ele_body_script = document.createElement('script')
    ele_body_script.textContent =
        "    const ipcRenderer = window.electronAPI.ipcRenderer;\n" +
        '    mermaid.initialize({ startOnLoad: true });\n' +
        "    var graphDefinition = document.getElementById('mermaidGraph').textContent;\n" +
        "    mermaid.render('mermaidGraph', graphDefinition, svgObject => document.appendChild(svgObject));\n" +
        '    setTimeout(function() {\n' +
        "      var chartHtml = document.getElementById('mermaidGraph').outerHTML;\n" +
        "      ipcRenderer.send('dialog-mermaid-render-svg-result', chartHtml)\n" +
        '    }, 1000);\n'

    document.head.appendChild(ele_head_link)
    document.head.appendChild(ele_head_script)
    document.body.appendChild(ele_body_mermaidGraph)
    document.body.appendChild(ele_body_script)

    return document
}

export { createMermaidRenderHtmlContent }

/**
 * 关闭 Mermaid 渲染窗口
 */
export function closeMermaidRenderWindow(): void {
    const win = windowManager.getWindowByType('mermaid-render-frame')
    if (win && !win.isDestroyed()) {
        win.close()
    }
}

/**
 * 清理 Mermaid 渲染相关资源
 */
export function cleanupMermaidRender(): void {
    closeMermaidRenderWindow()
    ipcMain.removeAllListeners('dialog-mermaid-render-svg-result')
}
