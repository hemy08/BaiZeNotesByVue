import {app, dialog} from 'electron'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')
import * as fs from 'fs'

// eslint-disable-next-line no-unused-vars
export function getAppFileMenuItem(mainWindow: Electron.BrowserWindow) {
  const fileMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '新建文件(N)  ...待开发',
      accelerator: 'ctrl+n',
      click: () => {
        shouOpenDirectoryDialog(mainWindow)
      }
    },
    {
      label: '新建文件夹(D) ...待开发',
      accelerator: 'ctrl+d',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '从文件导入 ...待开发',
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
        shouOpenSelectFileDialog(mainWindow)
      }
    },
    {
      label: '打开文件夹',
      click: () => {
        shouOpenDirectoryDialog(mainWindow)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '导出 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '另存为 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '保存 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '保存所有 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '历史记录 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '从磁盘重新读取 ...待开发',
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

function shouOpenDirectoryDialog(mainWindow: Electron.BrowserWindow) {
  dialog
    .showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    .then((result) => {
      if (result.canceled) return

      const dirPath = result.filePaths[0]

      traverseDirectory(dirPath, (mdFiles) => {
        // 发送文件名列表到渲染进程
        mainWindow.webContents.send('file-system-data', JSON.stringify(mdFiles))
      })
    })
    .catch((err) => {
      console.error('Error opening directory dialog:', err)
    })
}

// 递归读取目录中的 .md 文件
// 递归读取目录中的 .md 文件，并构建目录树
function traverseDirectory(dir, callback) {
  fs.readdir(dir, (err, files) => {
    if (err) {
      console.error(err)
      return
    }

    const items = files.map((file) => {
      const fullPath = path.join(dir, file)
      return {
        name: file,
        path: fullPath,
        isDirectory: false, // 默认为文件
        children: [] // 初始化 children 为空数组
      }
    })

    Promise.all(
      items.map((item) => {
        return new Promise((resolve, reject) => {
          fs.lstat(item.path, (err, stats) => {
            if (err) {
              reject(err)
            } else {
              item.isDirectory = stats.isDirectory()

              if (item.isDirectory) {
                // 如果是目录，则递归调用 traverseDirectory
                traverseDirectory(item.path, (subItems) => {
                  item.children = subItems
                  item.type = 'folder'
                  resolve(item)
                })
              } else if (
                path.extname(item.name) === '.md' ||
                path.extname(item.name) === '.png' ||
                path.extname(item.name) === '.jpg'
              ) {
                // 如果是 .md 文件，则直接解析
                item.type = 'file'
                resolve(item)
              } else {
                // 对于非 .md 文件，我们不需要它，所以简单地解析
                resolve(null)
              }
            }
          })
        })
      })
    )
      .then((resolvedItems) => {
        // 过滤掉非 .md 文件和目录（它们为 null）
        const filteredItems = resolvedItems.filter(Boolean)

        // 构建完整的目录树
        const tree = filteredItems.reduce((acc, item) => {
          if (item.isDirectory) {
            // 如果目录已经在树中，则添加其子项
            const existingDir = acc.find((dir) => dir.path === item.path)
            if (existingDir) {
              existingDir.children = existingDir.children.concat(item.children)
            } else {
              acc.push(item)
            }
          } else {
            // 对于文件，直接添加到树中（假设它们总是添加到顶层目录）
            acc.push(item)
          }
          return acc
        }, [])

        // 调用回调并传入目录树
        callback(tree)
      })
      .catch((err) => {
        console.error(err)
      })
  })
}

function shouOpenSelectFileDialog(mainWindow: Electron.BrowserWindow) {
  dialog
    .showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown Files', extensions: ['md'] }]
    })
    .then((result) => {
      if (result.canceled) return
      const filePath = result.filePaths[0]
      // 发送文件内容到渲染进程
      openAndSendSelectFileContent(mainWindow, filePath)
    })
    .catch((err) => {
      console.error('Error reading file:', err)
      // event.reply('selected-file-content-error', err.message)
    })
}

export function openAndSendSelectFileContent(mainWindow, filePath) {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (!err) {
      mainWindow.webContents.send('open-selected-file-content', data)
    } else {
      console.log('openFile failed', filePath, err, data)
    }
  })
}
