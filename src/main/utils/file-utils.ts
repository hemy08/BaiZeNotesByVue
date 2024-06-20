import * as fs from 'fs'
import { FileItem } from '../global-types'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')

function StartAutoSaveFileTime() {
  if (global.SavingFile) {
    setInterval(() => {
      saveActiveFile()
      // 在这里执行你的任务代码
    }, global.SaveFileInterval) // 每5秒执行一次
    global.SavingFile = true
  }
}

export function buildFileTree(rootPath: string, mdFiles: FileItem[]): FileItem[] {
  const lastIndex = Math.max(rootPath.lastIndexOf('\\'), rootPath.lastIndexOf('/'))
  const directoryName = rootPath.substring(lastIndex + 1)

  // 假设 mdFiles 包含了文件和目录，并且每个对象都有一个 isFile 属性
  const directory: FileItem = {
    name: directoryName,
    path: rootPath,
    type: 'folder', // 或者使用 isFile: false
    fileExtension: '',
    isDirectory: true, // 明确指定这是一个目录
    children: mdFiles.map((fileItem) => {
      return fileItem
    })
  }

  return [directory] // 返回文件树的根目录
}

// 递归读取目录中的 .md 文件
// 递归读取目录中的 .md 文件，并构建目录树
export function TraverseDirectory(dir: string, callback: (fileItems: FileItem[]) => void) {
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
        type: 'file',
        fileExtension: '.md',
        isDirectory: false, // 默认为文件
        children: [] // 初始化 children 为空数组
      } as FileItem
    })

    Promise.all(
      items.map((item: FileItem) => {
        return new Promise((resolve, reject) => {
          fs.lstat(item.path, (err, stats) => {
            if (err) {
              reject(err)
            } else {
              item.isDirectory = stats.isDirectory()

              if (item.isDirectory) {
                // 如果是目录，则递归调用 traverseDirectory
                TraverseDirectory(item.path, (subItems: FileItem[]) => {
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
                item.fileExtension = path.extname(item.name)
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
        const filteredItems: FileItem[] = resolvedItems.filter(Boolean) as FileItem[]

        // 构建完整的目录树
        const tree: FileItem[] = filteredItems.reduce((acc: FileItem[], item: FileItem) => {
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
        }, []) as FileItem[]

        // 调用回调并传入目录树
        callback(tree)
      })
      .catch((err) => {
        console.error(err)
      })
  })
}

export function CreateFileFolder(
  name: string,
  dirPath: string,
  isFolder: string,
  fileExtension: string
) {
  let fullName = dirPath.replace('/', '\\') + '\\' + name
  if (isFolder) {
    if (!fs.existsSync(fullName)) {
      fs.mkdirSync(fullName, { recursive: true })
    } else {
      alert(`${fullName} 已存在`)
    }
  } else {
    fullName = fullName + fileExtension
    // 使用 fs.writeFile 创建并写入文件
    fs.writeFile(fullName, '', (err) => {
      if (err) {
        alert(`${fullName} 失败 ${err}`)
      }
    })
  }

  // 重新加载文件资源管理器
  reloadDirectoryFromDisk()

  if (!isFolder) {
    // 打开当前文件
    global.__current_active_file = {
      name: name,
      path: fullName,
      type: 'file',
      content: ''
    }
    console.log('global.__current_active_file', global.__current_active_file)
    global.MainWindow.webContents.send('open-selected-file', '# ')
  }
}

export function reloadDirectoryFromDisk() {
  // 重新加载文件资源管理器
  TraverseDirectory(global.RootPath, (mdFiles) => {
    const fileTree = buildFileTree(global.RootPath, mdFiles)
    global.mdFileTree = fileTree
    // 设置定时任务
    StartAutoSaveFileTime()
    // 发送文件名列表到渲染进程
    global.MainWindow.webContents.send('file-system-data', JSON.stringify(fileTree))
  })
}

export function openSelectFile(mainWindow: Electron.BrowserWindow, fileProperties: FileProperties) {
  // 发送文件内容到渲染进程
  StartAutoSaveFileTime()
  fs.readFile(fileProperties.path, 'utf8', (err, data) => {
    if (!err) {
      fileProperties.content = data
      global.__current_active_file = fileProperties
      // console.log('openSelectFile', fileProperties)
      mainWindow.webContents.send('open-selected-file', data)
    } else {
      console.log('openFile failed', fileProperties.path, err, data)
    }
  })
}

export function saveActiveFile() {
  const curFile = global.__current_active_file
  // 文件存在，直接写入
  if (curFile != undefined) {
    fs.writeFile(curFile.path, curFile.content, (err) => {
      if (err) {
        console.log('写入文件时发生错误', err)
      }
    })
  } else {
    // 文件不存在，新建文件，写入，指定文件路径和文件名
    console.log('写入文件时发生错误, 文件不存在')
  }
}

export function saveActiveFileAs() {
  const curFile = global.__current_active_file
  if (curFile) {
    fs.writeFile(curFile.path, curFile.content, (err) => {
      console.log('error', err)
    })
  }
}
