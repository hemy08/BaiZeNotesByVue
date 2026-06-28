/**
 * 导入选项对话框
 * 让用户选择导入方式：替换当前内容、新建文件、插入到当前位置
 */

import { dialog, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../config'
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'

export type ImportOption = 'replace' | 'newfile' | 'insert'

/**
 * 显示导入选项对话框
 */
export function ShowImportOptionDialog(
    mainWindow: Electron.BrowserWindow,
    onConfirm: (option: ImportOption, filePath?: string) => void
) {
    const existing = windowManager.getWindowByType('import-option-dialog')
    if (existing) {
        existing.focus()
        return
    }

    const importOptionDialog = windowManager.createWindow('import-option-dialog', createDialogOptions({
        width: 500,
        height: 400,
        minimizable: false,
        maximizable: false,
        resizable: false,
        title: '导入选项',
        parent: mainWindow,
        modal: true
    }), 'import-option-dialog', true)

    importOptionDialog.setMenu(null)

    const html = makeImportOptionHtml()
    importOptionDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    importOptionDialog.show()

    // 发送主题样式
    importOptionDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        importOptionDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    // 监听用户选择
    importOptionDialog.webContents.on('did-finish-load', () => {
        // 导入选项确认
        importOptionDialog?.webContents.executeJavaScript(`
            window.confirmImport = function(option) {
                window.electronAPI.ipcRenderer.send('import-option-confirm', option);
            };
        `)
    })

    // 处理用户选择
    ipcMain.once('import-option-confirm', async (_event: any, option: ImportOption) => {
        let filePath: string | undefined

        if (option === 'newfile') {
            // 如果选择新建文件，弹出保存对话框
            const result = await dialog.showSaveDialog(mainWindow, {
                title: '选择文件保存位置',
                defaultPath: 'untitled.md',
                filters: [{ name: 'Markdown 文件', extensions: ['md'] }]
            })

            if (result.canceled) {
                // 用户取消，关闭对话框
                windowManager.getWindowByType('import-option-dialog')?.close()
                return
            }

            filePath = result.filePath
        }

        // 关闭对话框
        windowManager.getWindowByType('import-option-dialog')?.close()

        // 调用回调函数
        onConfirm(option, filePath)
    })
}

/**
 * 生成导入选项对话框HTML
 */
function makeImportOptionHtml(): string {
    const theme = getCurrentThemeStyles()

    // language=HTML
    const { document } = new JSDOM(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>导入选项</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
            background: ${theme.backgroundColor};
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            user-select: none;
        }

        .title-bar {
            width: 100%;
            height: 32px;
            background: ${theme.titleBarGradient};
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 15px;
            -webkit-app-region: drag;
        }

        .title-text {
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

        .close-btn:hover {
            background: rgba(255,100,100,0.9);
        }

        .container {
            flex: 1;
            padding: 20px;
            display: flex;
            flex-direction: column;
        }

        .header {
            text-align: center;
            margin-bottom: 20px;
        }

        .header h2 {
            font-size: 18px;
            color: ${theme.textColor};
            margin-bottom: 8px;
        }

        .header p {
            font-size: 13px;
            color: ${theme.secondaryTextColor};
        }

        .options {
            display: flex;
            flex-direction: column;
            gap: 12px;
            flex: 1;
        }

        .option-card {
            background: ${theme.cardBackground};
            border: 2px solid ${theme.borderColor};
            border-radius: 8px;
            padding: 15px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .option-card:hover {
            border-color: ${theme.accentColor};
            transform: translateX(5px);
        }

        .option-card.selected {
            border-color: ${theme.accentColor};
            background: ${theme.cardBackground}dd;
        }

        .option-icon {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: ${theme.accentColor}22;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            flex-shrink: 0;
        }

        .option-content {
            flex: 1;
        }

        .option-title {
            font-size: 14px;
            font-weight: 600;
            color: ${theme.textColor};
            margin-bottom: 4px;
        }

        .option-desc {
            font-size: 12px;
            color: ${theme.secondaryTextColor};
        }

        .footer {
            padding: 15px 20px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            border-top: 1px solid ${theme.borderColor};
            background: ${theme.cardBackground};
        }

        .btn {
            padding: 8px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        }

        .btn-cancel {
            background: ${theme.borderColor};
            color: ${theme.textColor};
        }

        .btn-cancel:hover {
            background: ${theme.borderColor}dd;
        }

        .btn-confirm {
            background: ${theme.accentColor};
            color: #fff;
        }

        .btn-confirm:hover {
            opacity: 0.9;
        }

        .btn-confirm:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="title-bar">
        <span class="title-text">导入选项</span>
        <button class="close-btn" onclick="window.close()">x</button>
    </div>

    <div class="container">
        <div class="header">
            <h2>选择导入方式</h2>
            <p>请选择如何处理导入的内容</p>
        </div>

        <div class="options">
            <div class="option-card" onclick="selectOption('replace')" data-option="replace">
                <div class="option-icon">🔄</div>
                <div class="option-content">
                    <div class="option-title">替换当前内容</div>
                    <div class="option-desc">清空当前编辑区，使用导入的内容替换</div>
                </div>
            </div>

            <div class="option-card" onclick="selectOption('newfile')" data-option="newfile">
                <div class="option-icon">📄</div>
                <div class="option-content">
                    <div class="option-title">新建文件</div>
                    <div class="option-desc">创建新文件并导入内容（需要选择保存位置）</div>
                </div>
            </div>

            <div class="option-card" onclick="selectOption('insert')" data-option="insert">
                <div class="option-icon">📝</div>
                <div class="option-content">
                    <div class="option-title">插入到当前位置</div>
                    <div class="option-desc">在当前光标位置插入导入的内容</div>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
        <button class="btn btn-cancel" onclick="window.close()">取消</button>
        <button class="btn btn-confirm" id="confirmBtn" onclick="confirmSelection()" disabled>确定</button>
    </div>

    <script>
        const ipcRenderer = window.electronAPI.ipcRenderer
        let selectedOption = null

        function selectOption(option) {
            selectedOption = option

            // 更新选中状态
            document.querySelectorAll('.option-card').forEach(card => {
                card.classList.remove('selected')
            })
            document.querySelector('[data-option="' + option + '"]').classList.add('selected')

            // 启用确认按钮
            document.getElementById('confirmBtn').disabled = false
        }

        function confirmSelection() {
            if (selectedOption) {
                ipcRenderer.send('import-option-confirm', selectedOption)
            }
        }

        // 监听主题更新
        ipcRenderer.on('baize-notes:theme-updated', () => {
            location.reload()
        })
    </script>
</body>
</html>`
    ).window

    return document.documentElement.outerHTML
}
