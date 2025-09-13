import * as dialogs from '../dialogs/dialogs'

// eslint-disable-next-line no-unused-vars
export function getAppToolsMenuItem(
    mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
    const ToolsMenuConfig: Array<{ label: string; click?: () => void }> = [
        { label: 'Mermaid绘图', click: () => dialogs.ShowMermaidEditDialog(mainWindow) },
        {
            label: '公式编辑器',
            click: () => mainWindow.webContents.send('plugin-tools-show', 'latex')
        },
        { label: '电子表格 ...待开发', click: () => mainWindow.webContents.send('OpenFile', null) },
        { label: '配图制作 ...待开发', click: () => mainWindow.webContents.send('OpenFile', null) },
        { label: '绘图工具 ...待开发', click: () => mainWindow.webContents.send('OpenFile', null) },
        { label: 'xxxx ...待开发', click: () => mainWindow.webContents.send('OpenFile', null) }
    ]

    const toolsMenuItems: Electron.MenuItemConstructorOptions[] = ToolsMenuConfig.map((item) => ({
        label: item.label,
        click: item.click
    }))
    return {
        label: '工具(T)',
        enabled: true,
        accelerator: 'alt+t',
        submenu: toolsMenuItems
    }
}
