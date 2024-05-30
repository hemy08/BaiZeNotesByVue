import { app, dialog } from 'electron'
import * as fs from 'node:fs'

// eslint-disable-next-line no-unused-vars
export function getAppFileMenuItem(mainWindow: Electron.BrowserWindow) {
  const fileMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '新建文件(N)',
      accelerator: 'ctrl+n',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '新建文件夹(D)',
      accelerator: 'ctrl+d',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '从文件导入',
      submenu: [
        {
          label: 'World',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        },
        {
          label: 'Html',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        },
        {
          label: 'Json',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        },
        {
          label: 'Yaml',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        }
      ]
    },
    {
      type: 'separator'
    },
    {
      label: '打开文件',
      click: () => {
        console.log('openFile')
        dialog
          .showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Markdown Files', extensions: ['md'] }]
          })
          .then((result) => {
            if (result.canceled) return
            const filePath = result.filePaths[0]
            // 发送文件内容到渲染进程
            fs.readFile(filePath, 'utf8', (err, data) => {
              if (!err) {
                mainWindow.webContents.send('open-selected-file-content', data)
              } else {
                console.log('openFile failed', filePath, err, data)
              }
            })
          })
          .catch((err) => {
            console.error('Error reading file:', err)
            // event.reply('selected-file-content-error', err.message)
          })
      }
    },
    {
      label: '打开文件夹',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '导出',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '另存为',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '保存',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '保存所有',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '历史记录',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '从磁盘重新读取',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      role: 'quit',
      accelerator: 'f4',
      click: () => app.quit()
    }
  ]
  return {
    label: '文件(F)',
    enable: true,
    accelerator: 'alt+f',
    submenu: fileMenuItems
  }
}
