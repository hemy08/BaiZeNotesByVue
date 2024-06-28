import * as fs from 'fs'
import { FileItem } from '../global-types'
import { dialog, clipboard } from 'electron'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')

function StartAutoSaveFileTime() {
  if (global.SavingFile) {
    setInterval(() => {
      SaveActiveFile()
      // 在这里执行你的任务代码
    }, global.SaveFileInterval) // 每5秒执行一次
    global.SavingFile = true
  }
}

export function BuildFileTree(rootPath: string, mdFiles: FileItem[]): FileItem[] {
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

export function CreateFileFolder(name: string, path: string, isFolder: boolean, extension: string) {
  let fullName = path.replace('/', '\\') + '\\' + name
  if (isFolder) {
    if (!fs.existsSync(fullName)) {
      fs.mkdirSync(fullName, { recursive: true })
    } else {
      dialog.showErrorBox('出错啦!!!', `${fullName} 已存在`)
    }
  } else {
    fullName = fullName + extension
    // 使用 fs.writeFile 创建并写入文件
    fs.writeFileSync(fullName, '# ' + name + '\r\n')
  }

  // 重新加载文件资源管理器
  ReloadDirFromDisk()

  if (!isFolder) {
    // 打开当前文件
    global.current_active_file = {
      name: name,
      path: fullName,
      type: 'file',
      content: '# ' + name + '\r\n'
    }
    //console.log('global.current_active_file', global.current_active_file)
    global.MainWindow.webContents.send('show-selected-file-context', '# ' + name)
  }
}

export function ReloadDirFromDisk() {
  if (!global.RootPath) {
    return
  }
  // 重新加载文件资源管理器
  TraverseDirectory(global.RootPath, (mdFiles) => {
    const fileTree = BuildFileTree(global.RootPath, mdFiles)
    global.mdFileTree = fileTree
    // 设置定时任务
    StartAutoSaveFileTime()
    // 发送文件名列表到渲染进程
    global.MainWindow.webContents.send('file-system-data', JSON.stringify(fileTree))
  })
}

export function OpenSelectFile(fileProperties: FileProperties) {
  // 发送文件内容到渲染进程
  StartAutoSaveFileTime()
  fs.readFile(fileProperties.path, 'utf8', (err, data) => {
    if (!err) {
      fileProperties.content = data
      global.current_active_file = fileProperties
      if (data.length === 0) {
        data = '\r\n'
      }
      // console.log('OpenSelectFile', fileProperties)
      global.MainWindow.webContents.send('show-selected-file-context', data)
    } else {
      console.log('openFile failed', fileProperties.path, err, data)
    }
  })
}

export function SaveActiveFile() {
  const curFile = global.current_active_file
  // 文件存在，直接写入
  if (curFile != undefined) {
    fs.writeFileSync(curFile.path, curFile.content)
  } else {
    // 文件不存在，新建文件，写入，指定文件路径和文件名
    console.log('写入文件时发生错误, 文件不存在')
  }
}

export function SaveActiveFileAs() {
  const curFile = global.current_active_file
  if (curFile) {
    fs.writeFileSync(curFile.path, curFile.content)
  }
}

export function ParseDirectoryPath(fullName: string): string {
  if (fullName.lastIndexOf('.') === -1) {
    return fullName
  }
  const lastIndex1 = fullName.lastIndexOf('\\')
  const lastIndex2 = fullName.lastIndexOf('/')
  const lastIndex = Math.max(lastIndex1, lastIndex2)
  return fullName.substring(0, lastIndex)
}

export function RenameFileFolder(name: string, newName: string) {
  const path = ParseDirectoryPath(name)
  let newFullPath = ''
  // 目录
  if (name.lastIndexOf('.') === -1) {
    newFullPath = path.replace('/', '\\') + '\\' + newName
  } else {
    const extension = name.substring(name.lastIndexOf('.'))
    newFullPath = path.replace('/', '\\') + '\\' + newName + extension
  }

  fs.renameSync(name, newFullPath)

  // 重新加载文件资源管理器
  ReloadDirFromDisk()

  // console.log('newFullPath', newFullPath)
  if (newFullPath.lastIndexOf('.') !== -1) {
    const fileProperties: FileProperties = {
      name: ParserFileName(newFullPath),
      path: newFullPath,
      type: 'file',
      content: ''
    }
    // console.log('fileProperties', fileProperties)
    OpenSelectFile(fileProperties)
  }
}

export function DeleteFileFolder(name: string) {
  // 文件、目录，如果是目录，
  if (name.lastIndexOf('.') === -1) {
    fs.rm(name, { recursive: true }, (err) => {
      if (!err) {
        console.log(err)
      }
    })
  } else {
    fs.unlinkSync(name)
  }

  // 重新加载文件资源管理器
  ReloadDirFromDisk()
}

export function ParserFileName(filePath: string): string {
  const lastIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastIndex === -1) {
    // 如果没有找到'/'或'\\'，则整个字符串就是文件名（或路径错误）
    return filePath
  }
  return filePath.slice(lastIndex + 1)
}

export function ParseDir(fullName: string): string {
  if (fullName.lastIndexOf('.') === -1) {
    return fullName
  }
  const lastIndex1 = fullName.lastIndexOf('\\')
  const lastIndex2 = fullName.lastIndexOf('/')
  const lastIndex = Math.max(lastIndex1, lastIndex2)
  return fullName.substring(0, lastIndex)
}

export function OpenFile(mainWindow: Electron.BrowserWindow) {
  dialog
    .showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown Files', extensions: ['md'] }]
    })
    .then((result) => {
      if (result.canceled) return
      const fileProperties: FileProperties = {
        name: ParserFileName(result.filePaths[0]),
        path: result.filePaths[0],
        type: 'file',
        content: ''
      }
      OpenSelectFile(fileProperties)
    })
    .catch((err) => {
      console.error('Error reading file:', err)
      // event.reply('selected-file-content-error', err.message)
    })
}

export function CreateFile(path: string, name: string, extension: string) {
  const fullName = path.replace('/', '\\') + '\\' + name + extension
  // 使用 fs.writeFile 创建并写入文件
  fs.writeFileSync(fullName, '')

  // 重新加载文件资源管理器
  ReloadDirFromDisk()

  // 打开当前文件
  global.current_active_file = {
    name: name,
    path: fullName,
    type: 'file',
    content: '# ' + name
  }
  //console.log('global.current_active_file', global.current_active_file)
  global.MainWindow.webContents.send('show-selected-file-context', '# ' + name)
}

export function OpenDir(mainWindow: Electron.BrowserWindow) {
  dialog
    .showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    .then((result) => {
      if (result.canceled) return
      global.RootPath = result.filePaths[0]
      ReloadDirFromDisk()
    })
    .catch((err) => {
      console.error('Error opening directory dialog:', err)
    })
}

export function CreateFolder(path: string, name: string) {
  const fullName = path.replace('/', '\\') + '\\' + name
  if (!fs.existsSync(fullName)) {
    fs.mkdirSync(fullName, { recursive: true })
  } else {
    dialog.showErrorBox('出错啦!!!', `${fullName} 已存在`)
  }

  // 重新加载文件资源管理器
  ReloadDirFromDisk()
}

export function Rename(name: string, newName: string) {
  RenameFileFolder(name, newName)
}

export function Delete(name: string) {
  DeleteFileFolder(name)
}

function ParserImageBuffer(content: string): Buffer | null {
  const supportImages = [
    { prefix: 'data:image/png;base64,', reg: /^data:image\/png;base64,/ },
    { prefix: 'data:image/jpeg;base64,', reg: /^data:image\/jpeg;base64,/ },
    { prefix: 'data:image/gif;base64,', reg: /^data:image\/gif;base64,/ },
    { prefix: 'data:image/bmp;base64,', reg: /^data:image\/bmp;base64,/ },
    { prefix: 'data:image/x-icon;base64,', reg: /^data:image\/x-icon;base64,/ }
  ]
  for (const item of supportImages) {
    if (content.startsWith(item.prefix)) {
      const newContent = content.replace(item.reg, '')
      return Buffer.from(newContent, 'base64')
    }
  }

  return null
}

function CreateImagesDir(): string {
  // 定义输出文件的路径
  const curDir = ParseDirectoryPath(global.current_active_file.path)
  const outDir = path.join(curDir, 'images')
  if (!fs.existsSync(outDir)) {
    // 如果目录不存在，则创建它
    try {
      // Node.js v10.12.0+ 支持递归创建目录
      fs.mkdirSync(outDir, { recursive: true })
    } catch (err) {
      dialog.showErrorBox('出错啦!!!', `${outDir} 不存在，创建目录失败，${err}`)
      return ''
    }
  }

  return outDir
}

function SaveImagesFile(outFilePath: string, base64Image: string): boolean {
  // 解码 base64 字符串
  const imgBuffer = ParserImageBuffer(base64Image)
  if (imgBuffer === null) {
    dialog.showErrorBox(
      '出错啦!!!',
      `解析文件格式失败，当前只支持*.png;*.jpg;*.jpeg;*.bmp;*gif;*.ico;`
    )
    return false
  }

  try {
    fs.writeFileSync(outFilePath, imgBuffer, 'binary') // 'binary' 参数在这里是可选的，因为 Buffer 已经是二进制数据
  } catch (err) {
    dialog.showErrorBox('出错啦!!!', `保存图像时出错: ${err}`)
    return false
  }

  return true
}

export function SaveImageDataToFile(name: string, base64Image: string) {
  // console.log('SaveImageDataToFile', base64Image.substring(0, 512))
  if (!global.current_active_file) {
    dialog.showErrorBox('出错啦!!!', `未打开任何文件，请先打开一个文件`)
    return false
  }

  const outDir = CreateImagesDir()
  if (outDir.length === 0) {
    return false
  }

  const outFilePath = path.join(outDir, name)
  if (fs.existsSync(outFilePath)) {
    // 目录下文件已经存在，直接返回
    dialog.showErrorBox('出错啦!!!', `文件已经存在 ${name}`)
    return true
  }
  return SaveImagesFile(outFilePath, base64Image)
}

function getImageFileName(): string {
  let result = ''
  for (let i = 0; i < 16; i++) {
    result += Math.floor(Math.random() * 10) // 生成0到9之间的随机数
  }
  return result
}

export function InsertImagesToFile(base64Image: string): string {
  // console.log('InsertImagesToFile', base64Image.substring(0, 512))
  if (!global.current_active_file) {
    dialog.showErrorBox('出错啦!!!', `未打开任何文件，请先打开一个文件`)
    return ''
  }

  const outDir = CreateImagesDir()
  if (outDir.length === 0) {
    return ''
  }

  const fileName = getImageFileName() + '.png'
  const outFilePath = path.join(outDir, fileName)
  if (fs.existsSync(outFilePath)) {
    // 目录下文件已经存在，直接返回
    dialog.showErrorBox('出错啦!!!', `文件已经存在 ${fileName}`)
    return ''
  }

  if (SaveImagesFile(outFilePath, base64Image) === false) {
    return ''
  }
  return fileName
}

export async function CopyRelativePath(toPath: string) {
  let relative = path.relative(global.current_active_file.path, toPath)
  if (relative.startsWith('../') || relative.startsWith('..\\')) {
    relative = relative.substring(3)
  }
  relative = relative.replace('\\', '/')
  await clipboard.writeText(relative)
}

export async function CopyFileLink(toPath: string) {
  let relative = path.relative(global.current_active_file.path, toPath)
  if (relative.startsWith('../') || relative.startsWith('..\\')) {
    relative = relative.substring(3)
  }
  let fileLink = '[' + ParserFileName(toPath) + '](' + relative + ')'
  fileLink = fileLink.replace('\\', '/')
  await clipboard.writeText(fileLink)
}

export async function CopyImageLink(toPath: string) {
  let relative = path.relative(global.current_active_file.path, toPath)
  if (relative.startsWith('../') || relative.startsWith('..\\')) {
    relative = relative.substring(3)
  }
  let fileLink = '![' + ParserFileName(toPath) + '](' + relative + ')'
  fileLink = fileLink.replace('\\', '/')
  await clipboard.writeText(fileLink)
}

export function CopyCutFileFolderFrom(node: string) {
  global.CopyCutFrom = node
}
