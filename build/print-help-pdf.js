/**
 * Electron 内运行：将使用指导 HTML 打印为带书签的 PDF。
 *
 * 由 build/generate-help-docs.js 通过 Electron 可执行文件调用：
 *   electron.exe build/print-help-pdf.js <htmlPath> <pdfPath>
 *
 * 使用 Electron 内置 Chromium 的 printToPDF：
 * - generateDocumentOutline: true → PDF 书签（按 h1-h6 生成）；
 * - printBackground: true → 保留指南配色；
 * - CSS @page 控制 A4 与页边距。
 */
const fs = require('fs')
const { app, BrowserWindow } = require('electron')

const [htmlPath, pdfPath] = process.argv.slice(2)

if (!htmlPath || !pdfPath) {
    console.error('[help-pdf] 缺少 HTML/PDF 路径')
    app.exit(2)
} else {
    app.whenReady().then(async () => {
        let win = null
        try {
            win = new BrowserWindow({
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true
                }
            })
            await win.loadFile(htmlPath)
            const data = await win.webContents.printToPDF({
                pageSize: 'A4',
                // 帮助文档以正文/表格为主；不打印大面积背景色，减小 PDF 体积并提升纸张可读性
                printBackground: false,
                generateDocumentOutline: false
            })
            fs.mkdirSync(require('path').dirname(pdfPath), { recursive: true })
            fs.writeFileSync(pdfPath, data)
            console.log(`[help-pdf] PDF 生成：${pdfPath}`)
            app.exit(0)
        } catch (error) {
            console.error('[help-pdf] 生成失败：', error)
            app.exit(1)
        } finally {
            if (win && !win.isDestroyed()) win.destroy()
        }
    })
}
