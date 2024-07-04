// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars
export function getAppEditMenuItem(mainWindow: Electron.BrowserWindow) {
  const editMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '撤销',
      accelerator: 'ctrl+z',
      click: () => {
        mainWindow.webContents.send('monaco-editor-trigger-undo-redo', 'undo')
      }
    },
    {
      label: '恢复',
      accelerator: 'ctrl+y',
      click: () => {
        mainWindow.webContents.send('monaco-editor-trigger-undo-redo', 'redo')
      }
    },
    {
      type: 'separator'
    },
    {
      label: '拷贝',
      accelerator: 'ctrl+c',
      role: 'copy'
    },
    {
      label: '剪切',
      accelerator: 'ctrl+x',
      role: 'cut'
    },
    {
      label: '黏贴',
      accelerator: 'ctrl+v',
      role: 'paste'
    },
    {
      type: 'separator'
    },
    {
      label: '跳转到行',
      accelerator: 'ctrl+g',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '在文件中查找',
      accelerator: 'ctrl+f',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '在文件中替换',
      accelerator: 'ctrl+r',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  return {
    label: '编辑(E)',
    submenu: editMenuItems
  }
}
