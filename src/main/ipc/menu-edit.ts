import { IPC } from '../../shared/ipc-channels'
export const editMenuHandlers = {
    undo: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.VIEW.UNDO_REDO, 'undo')
    },
    redo: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.VIEW.UNDO_REDO, 'redo')
    },
    // FUN-09：剪切/复制/粘贴复用既有 Monaco IPC 通道
    // （'baize:monaco:undo-redo'，渲染端 MarkdownMonacoEditor.vue 的
    // handleTriggerUndoRedo 直接 trigger Monaco 内建动作），与主进程剪贴板工具
    // （clipboard-operations.ts，仅面向文件树复制/剪切/粘贴、不触碰系统文本剪贴板）
    // 互不冲突。
    cut: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.VIEW.UNDO_REDO, 'editor.action.clipboardCutAction')
    },
    copy: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.VIEW.UNDO_REDO, 'editor.action.clipboardCopyAction')
    },
    paste: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.VIEW.UNDO_REDO, 'editor.action.clipboardPasteAction')
    }
    // FUN-09：以下 handler 已删除，动作由渲染层 menu_actions.ts 接管并 emit EventBus 事件
    // （事件名契约由 Monaco 代理实现监听）：
    // - 'go-line' → 'editor-jump-line'（payload { line }）
    // - 'find-in-file' → 'editor-trigger-find'
    // - 'replace-in-file' → 'editor-trigger-find'（payload { mode: 'replace' }）
    // 原实现 send 的 'editor-go-to-line'/'editor-find'/'editor-replace' 通道渲染端无任何监听。
    //
    // 'find-in-dir'/'replace-in-dir'（在文件中查找/替换）：跨文件全文检索需要主进程
    // 目录遍历与结果面板，本轮无法低成本实现，菜单项已在 menu_config.ts 隐藏
    // （A-4 模式，Roadmap：目录级全文检索）。
}
