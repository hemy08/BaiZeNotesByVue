// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars
export function getAppViewMenuItem(mainWindow: Electron.BrowserWindow) {
  const viewMenuCollapseExpand: Electron.MenuItemConstructorOptions[] = [
    {
      label: '一级标题',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '二级标题',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '三级标题',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '四级标题',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  const viewMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '编辑模式',
      accelerator: 'f9',
      click: () => {
        mainWindow.webContents.send('markdown-edit-model', null)
      }
    },
    {
      label: '预览模式',
      accelerator: 'f10',
      click: () => {
        mainWindow.webContents.send('markdown-preview-model', null)
      }
    },
    {
      label: '编辑/预览模式',
      accelerator: 'f11',
      click: () => {
        mainWindow.webContents.send('markdown-edit-preview-model', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '显示/隐藏资源管理器',
      click: () => {
        mainWindow.webContents.send('menu-view-hide-display-res-manager', null)
      }
    },
    {
      label: '显示/隐藏行号',
      click: () => {
        mainWindow.webContents.send('menu-view-update-monaco-editor-option', 'lineNumbers')
      }
    },
    {
      label: '显示/隐藏空白字符',
      click: () => {
        mainWindow.webContents.send('menu-view-update-monaco-editor-option', 'renderWhitespace')
      }
    },
    {
      label: '显示/隐藏文章大纲',
      click: () => {
        mainWindow.webContents.send('menu-view-hide-display-res-manager', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '折叠/展开标题 ...待开发',
      submenu: viewMenuCollapseExpand
    }
  ]
  return {
    label: '视图(V)',
    enable: true,
    accelerator: 'alt+v',
    submenu: viewMenuItems
  }
}
