import * as fs from 'fs'
import * as mammoth from 'mammoth'
import csv from 'csv-parser'
import { detect } from 'jschardet'
import { FileItem } from '../global-types'
import { clipboard, dialog, shell } from 'electron'
import { configStore } from './baize-store'
// @ts-ignore
import { ShowImportOptionDialog }  from'../dialogs/ShowImportOptionDialog'
// @ts-ignore
import { ShowSuccessDialog } from "../dialogs/ShowSuccessDialog";
import { saveLastOpenedFile, saveLastOpenedDirectory } from './file-state'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fsExtra = require('fs-extra')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TurndownService = require('turndown')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const iconv = require('iconv-lite')

const reloadFromDiskTime = 100

function getMathRandom(maxLength: number): string {
  let result = ''
  for (let i = 0; i < maxLength; i++) {
    result += Math.floor(Math.random() * 10) // 生成0到9之间的随机数
  }
  return result
}

// 自动保存定时器
let autoSaveTimer: NodeJS.Timeout | null = null

/**
 * 启动文件自动保存
 * @param interval 保存间隔时间（毫秒），默认10秒
 */
export function StartAutoSaveFileTime(interval: number = 30000): void {
  // 如果已经在运行，先停止
  if (autoSaveTimer) {
    StopAutoSaveFileTime()
  }

  // 设置保存间隔
  global.SaveFileInterval = interval.toString()
  global.SavingFile = true

  // console.log(`auto save files: ${interval}ms`)

  // 启动定时器
  autoSaveTimer = setInterval(() => {
    // 只有当文件有修改时才保存
    if (global.current_active_file && global.current_active_file.content) {
      // console.log('auto save files:', global.current_active_file.path)
      SaveActiveFile()
    }
  }, interval)
}

/**
 * 停止文件自动保存
 */
export function StopAutoSaveFileTime(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
    global.SavingFile = false
    //console.log('stop auto save timer')
  }
}

/**
 * 检查自动保存是否正在运行
 */
export function IsAutoSaveRunning(): boolean {
  return autoSaveTimer !== null
}

export function showErrorMessageBox(message: string) {
  dialog.showMessageBox({
    title: `错误！`,
    type: 'info',
    message: '出错啦',
    detail: message,
    noLink: true,
    buttons: ['确定']
  })
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
      showErrorMessageBox('获取目录列表失败！')
      return
    }
    const items = files.map((file) => {
      const fullPath = path.join(dir, file)
      return {
        id: getMathRandom(8),
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
                path.extname(item.name) === '.jpg' ||
                path.extname(item.name) === '.jpeg' ||
                path.extname(item.name) === '.svg' ||
                path.extname(item.name) === '.pdf' ||
                path.extname(item.name) === '.txt' ||
                path.extname(item.name) === '.html'
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
            showErrorMessageBox(`${fullName} 已存在`)
        }
    } else {
        fullName = fullName + extension
        let lastIndex = name.lastIndexOf('.')
        let fileHeader = name.substring(0, lastIndex)
        let fileContent = '# ' + fileHeader + '\r\n'
        // 使用 fs.writeFile 创建并写入文件
        fs.writeFileSync(fullName, fileContent)

        // 打开当前文件
        global.current_active_file = {
            name: name,
            path: fullName,
            type: 'file',
            content: fileContent
        }
        //console.log('global.current_active_file', global.current_active_file)
        global.MainWindow.webContents.send('show-selected-file-context', fileContent)
    }

    // 重新加载文件资源管理器
    setTimeout(() => {
    ReloadDirFromDisk()
    }, reloadFromDiskTime)
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

  // 先尝试从缓存获取文件内容
  let cachedContent = configStore.getFileContent(fileProperties.path)

  if (cachedContent !== null) {
    // 使用缓存的内容
    fileProperties.content = cachedContent
    global.current_active_file = fileProperties
    if (cachedContent.length === 0) {
      cachedContent = '\r\n'
    }
    //console.log('OpenSelectFile (cached)', fileProperties.path)
    global.MainWindow.webContents.send('show-selected-file-context', cachedContent)
    global.MainWindow.webContents.send('monaco-editor-user-select-file', fileProperties.path)
    saveLastOpenedFile(fileProperties.path)
  } else {
    // 从磁盘读取文件
    fs.readFile(fileProperties.path, 'utf8', (err, data) => {
      if (!err) {
        fileProperties.content = data
        global.current_active_file = fileProperties

        // 缓存文件内容
        configStore.setFileContent(fileProperties.path, data)

        if (data.length === 0) {
          data = '\r\n'
        }
        //console.log('OpenSelectFile', fileProperties.path)
        global.MainWindow.webContents.send('show-selected-file-context', data)
        global.MainWindow.webContents.send('monaco-editor-user-select-file', fileProperties.path)
        saveLastOpenedFile(fileProperties.path)
      } else {
        console.error('openFile failed', fileProperties.path, err, data)
      }
    })
  }
}

export async function SaveActiveFile() {
    const curFile = global.current_active_file
    if (!curFile) {
        throw new Error('No active file')
    }
    try {
        await fs.promises.writeFile(curFile.path, curFile.content, 'utf-8')

        // 更新缓存
        configStore.setFileContent(curFile.path, curFile.content)

        // 通知所有窗口
        const { BrowserWindow } = require('electron')
        BrowserWindow.getAllWindows().forEach((window: Electron.BrowserWindow) => {
            window.webContents.send('file-saved-success')
        })
    } catch (error: unknown) {
        console.error('Save file failed:', error)
        showErrorMessageBox(`保存失败: ${(error as Error).message}`)
    }
}

export function SaveActiveFileAs() {
  const curFile = global.current_active_file
  if (curFile) {
    fs.writeFileSync(curFile.path, curFile.content)
  }
}

export function RenameFileFolder(name: string, newName: string, isFile: boolean) {
  const path = ParseDirectoryPath(name)
  let newFullPath = ''
  // 目录
  if (!isFile) {
    newFullPath = path.replace('/', '\\') + '\\' + newName
  } else {
    const extension = name.substring(name.lastIndexOf('.'))
    newFullPath = path.replace('/', '\\') + '\\' + newName + extension
  }

  fs.renameSync(name, newFullPath)

  // 重新加载文件资源管理器
  setTimeout(() => {
    ReloadDirFromDisk()
  }, reloadFromDiskTime)

  // console.log('newFullPath', newFullPath)
  if (isFile) {
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

export function DeleteFileFolder(name: string, isFile: boolean) {
  // 文件、目录，如果是目录，
  if (!isFile) {
    fs.rm(name, { recursive: true }, (err) => {
      if (err) {
        showErrorMessageBox(err.message)
      }
    })
  } else {
    fs.unlinkSync(name)
  }

  setTimeout(() => {
    ReloadDirFromDisk()
  }, reloadFromDiskTime)
}

export function ParserFileName(filePath: string): string {
  const lastIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastIndex === -1) {
    // 如果没有找到'/'或'\\'，则整个字符串就是文件名（或路径错误）
    return filePath
  }
  return filePath.slice(lastIndex + 1)
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
  setTimeout(() => {
    ReloadDirFromDisk()
  }, reloadFromDiskTime)

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

export function OpenDirectory(mainWindow: Electron.BrowserWindow) {
  dialog
    .showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    .then((result) => {
      if (result.canceled) return
      global.RootPath = result.filePaths[0]
      ReloadDirFromDisk()

      // 保存上次打开的目录
      saveLastOpenedDirectory(result.filePaths[0])
    })
    .catch((err) => {
      showErrorMessageBox('Error opening directory dialog:' + err)
    })
}

export function GetSelectDir(
  mainWindow: Electron.BrowserWindow,
  cb: (path: string | null) => void
) {
  dialog
    .showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    .then((result) => {
      if (result.canceled) {
        cb(null)
      } else {
        cb(result.filePaths[0])
      }
    })
    .catch((err) => {
      showErrorMessageBox('Error opening directory dialog:' + err)
      cb(null)
    })
}

export function CreateDirectory(path: string, name: string) {
  const fullName = path.replace('/', '\\') + '\\' + name
  if (!fs.existsSync(fullName)) {
    fs.mkdirSync(fullName, { recursive: true })
  } else {
    showErrorMessageBox(`${fullName} 已存在`)
  }

  setTimeout(() => {
    ReloadDirFromDisk()
  }, reloadFromDiskTime)
}

export function Rename(name: string, newName: string, isFile: boolean) {
  RenameFileFolder(name, newName, isFile)
}

export function Delete(name: string, isFile: boolean) {
  DeleteFileFolder(name, isFile)
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
      showErrorMessageBox(`${outDir} 不存在，创建目录失败，${err}`)
      return ''
    }
  }

  return outDir
}

function SaveImagesFile(outFilePath: string, base64Image: string): boolean {
  // 解码 base64 字符串
  const imgBuffer = ParserImageBuffer(base64Image)
  if (imgBuffer === null) {
    showErrorMessageBox(`解析文件格式失败，当前只支持*.png;*.jpg;*.jpeg;*.bmp;*gif;*.ico;`)
    return false
  }

  try {
    fs.writeFileSync(outFilePath, imgBuffer, 'binary') // 'binary' 参数在这里是可选的，因为 Buffer 已经是二进制数据
  } catch (err) {
    showErrorMessageBox(`保存图像时出错: ${err}`)
    return false
  }

  return true
}

export function SaveImageDataToFile(name: string, base64Image: string) {
  // console.log('SaveImageDataToFile', base64Image.substring(0, 512))
  if (!global.current_active_file) {
    showErrorMessageBox(`未打开任何文件，请先打开一个文件`)
    return false
  }

  const outDir = CreateImagesDir()
  if (outDir.length === 0) {
    return false
  }

  const outFilePath = path.join(outDir, name)
  if (fs.existsSync(outFilePath)) {
    // 目录下文件已经存在，直接返回
    showErrorMessageBox(`文件已经存在 ${name}`)
    return true
  }
  return SaveImagesFile(outFilePath, base64Image)
}

export function InsertImagesToFile(base64Image: string): string {
  // console.log('InsertImagesToFile', base64Image.substring(0, 512))
  if (!global.current_active_file) {
    showErrorMessageBox(`未打开任何文件，请先打开一个文件`)
    return ''
  }

  const outDir = CreateImagesDir()
  if (outDir.length === 0) {
    return ''
  }

  const fileName = getMathRandom(16) + '.png'
  const outFilePath = path.join(outDir, fileName)
  if (fs.existsSync(outFilePath)) {
    // 目录下文件已经存在，直接返回
    showErrorMessageBox(`文件已经存在 ${fileName}`)
    return ''
  }

  if (SaveImagesFile(outFilePath, base64Image) === false) {
    return ''
  }
  return fileName
}

export function CopyRelativePath(toPath: string) {
  if (!global.current_active_file) {
    showErrorMessageBox(`请先打开一个文件！`)
    return
  }
  let relative = path.relative(global.current_active_file.path, toPath)
  if (relative.startsWith('../') || relative.startsWith('..\\')) {
    relative = relative.substring(3)
  }
  relative = relative.replace('\\', '/')
  clipboard.writeText(relative)
}

export function CopyFileLink(toPath: string) {
  if (!global.current_active_file) {
    showErrorMessageBox(`请先打开一个文件！`)
    return
  }
  let relative = path.relative(global.current_active_file.path, toPath)
  if (relative.startsWith('../') || relative.startsWith('..\\')) {
    relative = relative.substring(3)
  }
  let fileLink = '[' + ParserFileName(toPath) + '](' + relative + ')'
  fileLink = fileLink.replace('\\', '/')
  clipboard.writeText(fileLink)
}

export function CopyImageLink(toPath: string) {
  if (!global.current_active_file) {
    showErrorMessageBox(`请先打开一个文件！`)
    return
  }
  let relative = path.relative(global.current_active_file.path, toPath)
  if (relative.startsWith('../') || relative.startsWith('..\\')) {
    relative = relative.substring(3)
  }
  let fileLink = '![' + ParserFileName(toPath) + '](' + relative + ')'
  fileLink = fileLink.replace('\\', '/')
  clipboard.writeText(fileLink)
}

export function FileManagerContextMenuCopy(fromPath: string, isFile: boolean) {
  global.srcDirCopyCut = fromPath
  global.isCopyOrCut = 'copy'
  global.isCopyCutFile = isFile
}

export function FileManagerContextMenuCut(fromPath: string, isFile: boolean) {
  global.srcDirCopyCut = fromPath
  global.isCopyOrCut = 'cut'
  global.isCopyCutFile = isFile
}

export async function FileManagerContextMenuPaste(toPath: string, isFile: string) {
  if (isFile) {
    showErrorMessageBox(`目标不是一个目录！`)
    return
  }

  const src = global.srcDirCopyCut
  if (src.length === 0) {
    showErrorMessageBox(`未拷贝/剪切源文件！`)
    return
  }

  if (src === toPath) {
    showErrorMessageBox(`源路径和目标路径相同！`)
    return
  }

  // 先在目标目录中创建一个与原目录同名文件夹，返回进行拷贝
  const lastIndex = Math.max(src.lastIndexOf('\\'), src.lastIndexOf('//'))
  const srcName = src.substring(lastIndex)
  const destPath = path.join(toPath, srcName)
  if (fs.existsSync(destPath)) {
    showErrorMessageBox(`文件/文件夹已经存在！\r\n` + destPath)
    return
  }

  try {
    await fsExtra.copy(src, destPath, { recursive: true })
  } catch (err) {
    showErrorMessageBox((err as Error).message)
    return
  }

  // 如果是剪切动作，需要删除原目录
  if (global.isCopyOrCut === 'cut') {
    try {
      await fsExtra.remove(src)
    } catch (err) {
      showErrorMessageBox((err as Error).message)
      return
    }
  }

  setTimeout(() => {
    global.srcDirCopyCut = ''
    global.isCopyOrCut = ''
    ReloadDirFromDisk()
  }, reloadFromDiskTime)

  // 防止重新加载时，前面操作还没有完成，这里设置100ms的定时器处理
  setTimeout(() => {
    // 如果是剪切动作，需要删除原目录
    if (global.isCopyOrCut === 'cut') {
      fsExtra.remove(src)
    }
    global.srcDirCopyCut = ''
    global.isCopyOrCut = ''
    ReloadDirFromDisk()
  }, reloadFromDiskTime)
}

export function OpenFolderExplorer(path: string) {
  if (path.lastIndexOf('.') === -1) {
    const lastIndex = Math.max(path.lastIndexOf('//'), path.lastIndexOf('\\'))
    const folderPath = path.substring(0, lastIndex)
    shell.showItemInFolder(folderPath)
  } else {
    shell.showItemInFolder(path)
  }
}

const InsertImportFrom = {
  word: {
    name: 'Word Files',
    extensions: ['doc', 'docx'],
    importReader: convertDocxToMarkdown,
    insertReader: convertDocxToMarkdown,
    argStart: '',
    argEnd: ''
  },
  html: {
    name: 'HTML Files',
    extensions: ['html', 'htm', 'mhtml'],
    importReader: convertHtmlToMarkdown,
    insertReader: convertHtmlToMarkdown,
    argStart: '',
    argEnd: ''
  },
  excel: {
    name: 'Sheet Files',
    extensions: ['xls', 'xlsx'],
    importReader: ReadFile,
    insertReader: ReadFile,
    argStart: '```text\r\n',
    argEnd: '\r\n```\r\n'
  },
  csv: {
    name: 'Sheet Files',
    extensions: ['csv'],
    importReader: convertCsvToMarkdown,
    insertReader: convertCsvToMarkdown,
    argStart: '\r\n',
    argEnd: '\r\n'
  },
  json: {
    name: 'Json Files',
    extensions: ['json'],
    importReader: formatJsonString,
    insertReader: formatJsonString,
    argStart: '```json\r\n',
    argEnd: '\r\n```\r\n'
  },
  text: {
    name: 'Text Files',
    extensions: ['txt', 'log', 'ini'],
    importReader: ReadFile,
    insertReader: ReadFile,
    argStart: '```text\r\n',
    argEnd: '\r\n```\r\n'
  },
  yaml: {
    name: 'YAML Files',
    extensions: ['yaml', 'yml'],
    importReader: ReadFile,
    insertReader: ReadFile,
    argStart: '```yaml\r\n',
    argEnd: '\r\n```\r\n'
  },
  xml: {
    name: 'XML Files',
    extensions: ['xml'],
    importReader: ReadFile,
    insertReader: ReadFile,
    argStart: '```xml\r\n',
    argEnd: '\r\n```\r\n'
  }
}

function convertDocxToMarkdown(file: string): Promise<string> {
  return mammoth
    .convertToHtml({ path: file })
    .then((result) => {
      const turndownService = new TurndownService()
      return turndownService.turndown(result.value)
    })
    .catch((error) => {
      throw error
    })
}

async function ReadFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

async function convertHtmlToMarkdown(file: string): Promise<string> {
  try {
    const htmlContent = await ReadFile(file)
    const turndownService = new TurndownService()
    return turndownService.turndown(htmlContent)
  } catch (error) {
    showErrorMessageBox('Error converting HTML to Markdown:' + error)
    return 'convert failed'
  }
}

function csvStringParser(csvData: string, resolve, reject) {
  const headers: string[] = []
  const rows: { [key: string]: string }[] = []
  const csvParser = csv()
  csvParser.on('headers', (headerRow) => {
    headers.push(...Object.keys(headerRow))
  })
  csvParser.on('data', (row: { [key: string]: string }) => {
    rows.push(row)
  })
  csvParser.on('end', () => {
    // 构建Markdown表格
    console.log('headers', headers)
    let markdownTable = `| ${headers.join('| ')} |\n| ${headers.map(() => '---').join('| ')} |\n`

    rows.forEach((row) => {
      const rowString = Object.values(row)
        .map((value) => `| ${value} `)
        .join('')
      markdownTable += `| ${rowString} |\n`
    })

    resolve(markdownTable)
  })
  csvParser.on('error', reject)
  csvParser.write(csvData)
  csvParser.end()
}

async function convertCsvToMarkdown(csvFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(csvFile, (err, buffer) => {
      if (err) {
        reject(err)
        return
      }
      const detectCode = detect(buffer)
      const utf8String = iconv.decode(buffer, detectCode.encoding)
      console.log('buffer', buffer)
      console.log('detectCode', detectCode)
      csvStringParser(utf8String, resolve, reject)
    })
  })
}

function formatterJson(obj: unknown, indentLevel = 0, indent = 2): string {
  let result = ''
  const indentStr = ' '.repeat(indentLevel * indent)

  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (result !== '') {
        result += ',\n'
      }
      result += indentStr + indentStr + formatterJson(item, indentLevel + 1)
    })
    return '[' + result + (result ? '\n' + indentStr : '') + ']'
  } else if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj)
    keys.forEach((key) => {
      if (result !== '') {
        result += ',\n'
      }
      result += indentStr + '"' + key + '": ' + formatterJson(obj[key], indentLevel + 1)
    })
    return '{' + result + (result ? '\n' + indentStr : '') + '}'
  } else {
    return JSON.stringify(obj)
  }
}

async function formatJsonString(filePath: string): Promise<string> {
  const jsonStr = await ReadFile(filePath)
  try {
    // 解析JSON字符串为JavaScript对象
    const parsed = JSON.parse(jsonStr) as never
    return formatterJson(parsed)
  } catch (error) {
    console.error('Invalid JSON:', error)
    return jsonStr // 或者可以返回一个错误消息
  }
}

export async function InsertImportFormFile(
  mainWindow: Electron.BrowserWindow,
  fileType: string,
  isImport: boolean
) {
  const model = InsertImportFrom[fileType]
  if (!model) {
    showErrorMessageBox(
      '暂不支持当前格式的文件。\r\n' +
        '当前支持*.txt、*.json、*.yaml、*.yml、*.csv、*.ini、*.doc、*.docx、*.html、*.htm、*.xls、*.xlsx'
    )
    return
  }

  // 选择要导入的文件
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: model.name, extensions: model.extensions }]
  })

  if (result.canceled) return

  const file = result.filePaths[0]
  const readerFn = model.importReader

  try {
    const context = await readerFn(file)
    const content = model.argStart + context + model.argEnd

    if (isImport) {
      // 显示导入选项对话框
      ShowImportOptionDialog(mainWindow, async (option: string, filePath?: string) => {
        switch (option) {
          case 'replace':
            // 替换当前内容
            mainWindow.webContents.send('show-selected-file-context', content)
            break

          case 'newfile':
            // 新建文件
            if (filePath) {
              // 保存内容到新文件
              fs.writeFileSync(filePath, content, 'utf-8')
              // 打开新文件
              const { OpenSelectFile } = require('./file-utils')
              OpenSelectFile(mainWindow, filePath, path.basename(filePath))
            }
            break

          case 'insert':
            // 插入到当前位置
            mainWindow.webContents.send('monaco-editor-insert-after-cursor', content)
            break
        }
      })
    } else {
      // 直接插入到当前位置
      mainWindow.webContents.send('monaco-editor-insert-after-cursor', content)
    }
  } catch (err) {
    showErrorMessageBox('导入文件失败: ' + err)
  }
}

export async function ExportToFile(mainWindow: Electron.BrowserWindow, fileType: string) {
  // 获取当前编辑器内容
  const currentContent = global.current_active_file?.content || ''

  if (!currentContent) {
    showErrorMessageBox('当前没有内容可导出')
    return
  }

  // 根据文件类型选择导出方式
  const exporters = {
    word: exportToWord,
    json: exportToJson,
    xml: exportToXml,
    yaml: exportToYaml,
    html: exportToHtml,
    pdf: exportToPdf
  }

  const exporter = exporters[fileType]
  if (!exporter) {
    showErrorMessageBox(`暂不支持导出为 ${fileType} 格式`)
    return
  }

  try {
    await exporter(mainWindow, currentContent)
  } catch (error) {
    showErrorMessageBox(`导出失败: ${error}`)
  }
}

/**
 * 导出为 Word 文档
 */
async function exportToWord(mainWindow: Electron.BrowserWindow, content: string) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出为 Word 文档',
    defaultPath: 'untitled.docx',
    filters: [{ name: 'Word 文档', extensions: ['docx'] }]
  })

  if (result.canceled || !result.filePath) return

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const officegen = require('officegen')
  const docx = officegen('docx')

  // 将 Markdown 转换为纯文本（简化处理）
  const lines = content.split('\n')
  lines.forEach((line) => {
    // 处理标题
    if (line.startsWith('# ')) {
      docx.createP().addText(line.substring(2), { bold: true, font_size: 24 })
    } else if (line.startsWith('## ')) {
      docx.createP().addText(line.substring(3), { bold: true, font_size: 20 })
    } else if (line.startsWith('### ')) {
      docx.createP().addText(line.substring(4), { bold: true, font_size: 18 })
    } else if (line.trim()) {
      // 普通段落
      docx.createP().addText(line)
    }
  })

  const stream = fs.createWriteStream(result.filePath)
  docx.generate(stream)

  stream.on('close', () => {
      showInfoMessageBox(`导出成功: ${result.filePath}`)
  })
}

/**
 * 导出为 JSON 文件
 */
async function exportToJson(mainWindow: Electron.BrowserWindow, content: string) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出为 JSON 文件',
    defaultPath: 'untitled.json',
    filters: [{ name: 'JSON 文件', extensions: ['json'] }]
  })

  if (result.canceled || !result.filePath) return

  // 将内容转换为 JSON 对象
  const jsonContent = {
    content: content,
    metadata: {
      exportedAt: new Date().toISOString(),
      version: '1.0.2',
      type: 'markdown'
    }
  }

  fs.writeFileSync(result.filePath, JSON.stringify(jsonContent, null, 2), 'utf-8')
  showInfoMessageBox(`导出成功: ${result.filePath}`)
}

/**
 * 导出为 XML 文件
 */
async function exportToXml(mainWindow: Electron.BrowserWindow, content: string) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出为 XML 文件',
    defaultPath: 'untitled.xml',
    filters: [{ name: 'XML 文件', extensions: ['xml'] }]
  })

  if (result.canceled || !result.filePath) return

  // 将内容转换为 XML 格式
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <exportedAt>${new Date().toISOString()}</exportedAt>
    <version>1.0.2</version>
    <type>markdown</type>
  </metadata>
  <content><![CDATA[${content}]]></content>
</document>`

  fs.writeFileSync(result.filePath, xmlContent, 'utf-8')
  showInfoMessageBox(`导出成功: ${result.filePath}`)
}

/**
 * 导出为 YAML 文件
 */
async function exportToYaml(mainWindow: Electron.BrowserWindow, content: string) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出为 YAML 文件',
    defaultPath: 'untitled.yaml',
    filters: [{ name: 'YAML 文件', extensions: ['yaml', 'yml'] }]
  })

  if (result.canceled || !result.filePath) return

  // 将内容转换为 YAML 格式
  const yamlContent = `content: |
${content
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
metadata:
  exportedAt: ${new Date().toISOString()}
  version: 1.0.2
  type: markdown`

  fs.writeFileSync(result.filePath, yamlContent, 'utf-8')
  showInfoMessageBox(`导出成功: ${result.filePath}`)
}

/**
 * 导出为 HTML 文件
 */
async function exportToHtml(mainWindow: Electron.BrowserWindow, content: string) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出为 HTML 文件',
    defaultPath: 'untitled.html',
    filters: [{ name: 'HTML 文件', extensions: ['html', 'htm'] }]
  })

  if (result.canceled || !result.filePath) return

  // 使用 markdown-it 将 Markdown 转换为 HTML
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const MarkdownIt = require('markdown-it')
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true
  })

  const htmlContent = md.render(content)

  // 生成完整的 HTML 文档
  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>白泽笔记导出</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
    }
    pre {
      background-color: #f4f4f4;
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
    }
    blockquote {
      border-left: 4px solid #ddd;
      margin: 0;
      padding-left: 1em;
      color: #666;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f4f4f4;
    }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`

  fs.writeFileSync(result.filePath, fullHtml, 'utf-8')
  showInfoMessageBox(`导出成功: ${result.filePath}`)
}

/**
 * 导出为 PDF 文件
 */
async function exportToPdf(mainWindow: Electron.BrowserWindow, content: string) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出为 PDF 文件',
    defaultPath: 'untitled.pdf',
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
  })

  if (result.canceled || !result.filePath) return

  // 使用 markdown-it 将 Markdown 转换为 HTML
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const MarkdownIt = require('markdown-it')
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true
  })

  const htmlContent = md.render(content)

  // 生成完整的 HTML 文档
  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>白泽笔记导出</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
    }
    pre {
      background-color: #f4f4f4;
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
    }
    blockquote {
      border-left: 4px solid #ddd;
      margin: 0;
      padding-left: 1em;
      color: #666;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f4f4f4;
    }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`

  // 创建一个隐藏的窗口来打印 PDF
  const printWindow = new (require('electron').BrowserWindow)({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // 加载 HTML 内容
  printWindow.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(fullHtml)
  )

  // 等待页面加载完成后打印
  printWindow.webContents.on('did-finish-load', () => {
    // 使用 Electron 的打印功能生成 PDF
    const pdfOptions = {
      pageSize: 'A4',
      printBackground: true,
      marginsType: 1 // 0: default, 1: none, 2: minimum
    }

    printWindow.webContents.printToPDF(pdfOptions).then((data) => {
      fs.writeFileSync(result.filePath!, data)
      printWindow.close()
      showInfoMessageBox(`导出成功: ${result.filePath}`)
    }).catch((error) => {
      printWindow.close()
      showErrorMessageBox(`PDF 导出失败: ${error}`)
    })
  })
}

/**
 * 显示信息对话框
 */
function showInfoMessageBox(message: string) {
    ShowSuccessDialog('导出成功', message)
}
