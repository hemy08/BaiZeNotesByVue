/**
 * 基础文件操作模块
 * 提供文件保存、打开、创建、重命名、删除等基础功能
 */

import * as fs from 'fs'
import { shell, dialog, BrowserWindow } from 'electron'
import { FileItem } from '../../global-types'
import { configStore } from '../baize-store'
import { saveLastOpenedFile } from '../file-state'
import { logger } from '../logger'
import { ParserFileName, ParseDirectoryPath, BuildFileTree, GetCurrentFileDirectory, SelectDirectory } from './path-utils'
import * as fileExport from './export'
import { showErrorMessageBox } from './dialog-helpers'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')

// 大文件阈值 (5MB)
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024

// 重新加载时间
const reloadFromDiskTime = 500

/**
 * 文件属性接口
 */
export interface FileProperties {
    name: string
    path: string
    type: string
    content?: string
}

/**
 * 获取自动保存函数
 */
function getAutoSaveFunctions() {
    return require('./auto-save')
}

/**
 * 生成随机ID
 * @param maxLength 最大长度
 * @returns 随机ID字符串
 */
export function getMathRandom(maxLength: number): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < maxLength; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

/**
 * 保存当前激活的文件
 */
export async function SaveActiveFile(): Promise<void> {
    const curFile = global.current_active_file
    if (!curFile) {
        throw new Error('No active file')
    }
    try {
        await fs.promises.writeFile(curFile.path, curFile.content, 'utf-8')

        // 更新缓存
        configStore.setFileContent(curFile.path, curFile.content)

        logger.info('The file has been saved successfully', curFile.path)

        // 通知所有窗口
        const { BrowserWindow } = require('electron')
        BrowserWindow.getAllWindows().forEach((window: Electron.BrowserWindow) => {
            window.webContents.send('file-saved-success')
        })
    } catch (error: unknown) {
        logger.error('Failed to save the file', curFile.path, error)
        showErrorMessageBox(`Failed to save the file: ${(error as Error).message}`)
    }
}

/**
 * 另存为当前文件
 */
/**
 * 另存为功能
 * 支持多种格式：md、txt、word、html、json、pdf
 */
export async function SaveActiveFileAs(): Promise<void> {
    const curFile = global.current_active_file
    if (!curFile || !curFile.content) {
        showErrorMessageBox('当前没有活动文件可另存为')
        return
    }
    const currentContent = global.current_active_file?.content || ''

    // 显示另存为对话框
    const result = await dialog.showSaveDialog(global.MainWindow, {
        title: '另存为',
        defaultPath: curFile.name || 'untitled',
        filters: [
            { name: 'Markdown 文件', extensions: ['md'] },
            { name: 'Word 文档', extensions: ['docx'] },
            { name: '文本文件', extensions: ['txt'] },
            { name: 'HTML 文件', extensions: ['html', 'htm'] },
            { name: 'JSON 文件', extensions: ['json'] },
            { name: 'PDF 文件', extensions: ['pdf'] }
        ]
    })

    if (result.canceled || !result.filePath) {
        return
    }

    const filePath = result.filePath
    const ext = path.extname(filePath).toLowerCase()
    const content = curFile.content

    try {
        switch (ext) {
            case '.md':
            case '.txt':
                // 直接保存为文本文件
                fs.writeFileSync(filePath, content, 'utf-8')
                break

            case '.docx':
                // 导出为 Word 文档
                await fileExport.ToWord(currentContent, filePath)
                return

            case '.html':
            case '.htm':
                // 导出为 HTML 文件
                await fileExport.ToHtml(currentContent, filePath)
                return

            case '.json':
                // 导出为 JSON 文件
                await fileExport.ToJson(currentContent, filePath)
                return

            case '.pdf':
                // 导出为 PDF 文件
                await fileExport.ToPdf(currentContent, filePath)
                return

            default:
                showErrorMessageBox(`不支持的文件格式: ${ext}`)
                return
        }

        // 更新当前文件信息（仅对 md 和 txt）
        global.current_active_file = {
            name: path.basename(filePath),
            path: filePath,
            type: 'file',
            content: content
        }

        // 通知渲染进程
        global.MainWindow.webContents.send('open-vue-dialog', 'message', {
            title: '另存为成功',
            type: 'success',
            message: `文件已保存到: ${filePath}`
        })
    } catch (err) {
        logger.error('文件另存为失败', filePath, err)
        global.MainWindow.webContents.send('open-vue-dialog', 'message', {
            title: '另存为成功',
            type: 'error',
            message: `另存为失败: ${err}`
        })
    }
}

/**
 * 递归读取目录中的文件，并构建目录树
 * 支持的文件类型：.md, .png, .jpg, .jpeg, .svg, .pdf, .txt, .html
 * @param dirPath 目录路径
 * @param callback 回调函数，返回文件树结构
 */
export function TraverseDirectory(dirPath: string, callback: (fileItems: FileItem[]) => void): void {
    fs.readdir(dirPath, (err, files) => {
        if (err) {
            showErrorMessageBox('Failed to obtain directory list！')
            return
        }

        const items = files.map((file) => {
            const fullPath = path.join(dirPath, file)
            return {
                id: getMathRandom(8),
                name: file,
                path: fullPath,
                type: 'file',
                fileExtension: '',
                isDirectory: false,
                children: []
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
                                // 如果是目录，则递归调用
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
                                // 如果是支持的文件类型
                                item.type = 'file'
                                item.fileExtension = path.extname(item.name)
                                resolve(item)
                            } else {
                                // 对于不支持的文件类型，返回 null
                                resolve(null)
                            }
                        }
                    })
                })
            })
        )
            .then((resolvedItems) => {
                // 过滤掉不支持的文件类型（它们为 null）
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
                        // 对于文件，直接添加到树中
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

/**
 * 创建文件或文件夹
 * @param name 名称
 * @param dirPath 目录路径
 * @param isFolder 是否为文件夹
 * @param extension 文件扩展名
 */
export function CreateFileFolder(name: string, dirPath: string, isFolder: boolean, extension: string): void {
    let fullName = dirPath.replace('/', '\\') + '\\' + name
    if (isFolder) {
        if (!fs.existsSync(fullName)) {
            fs.mkdirSync(fullName, { recursive: true })
        } else {
            showErrorMessageBox(`${fullName} 已存在`)
        }
    } else {
        fullName = fullName + extension
        const lastIndex = name.lastIndexOf('.')
        let fileContent = ''
        if (lastIndex === -1) {
            fileContent = '# ' + name + '\r\n'
        } else {
            const fileHeader = name.substring(0, lastIndex)
            fileContent = '# ' + fileHeader + '\r\n'
        }
        fs.writeFileSync(fullName, fileContent)

        // 打开当前文件
        global.current_active_file = {
            name: name,
            path: fullName,
            type: 'file',
            content: fileContent
        }
        global.MainWindow.webContents.send('baize:notes:show-selected-file-context', fileContent)
    }

    // 重新加载文件资源管理器
    setTimeout(() => {
        const { StartAutoSaveFileTime } = getAutoSaveFunctions()
        StartAutoSaveFileTime()
        ReloadDirFromDisk()
    }, reloadFromDiskTime)
}

/**
 * 从磁盘重新加载目录
 */
export function ReloadDirFromDisk(): void {
    if (!global.RootPath) {
        return
    }
    TraverseDirectory(global.RootPath, (mdFiles) => {
        const fileTree = BuildFileTree(global.RootPath, mdFiles)
        global.mdFileTree = fileTree
        const { StartAutoSaveFileTime } = getAutoSaveFunctions()
        StartAutoSaveFileTime()
        global.MainWindow.webContents.send('baize:notes:resource:manager:file-system-data', JSON.stringify(fileTree))

        // 重新加载当前打开的文件内容
        if (global.current_active_file && global.current_active_file.path) {
            try {
                const fileContent = fs.readFileSync(global.current_active_file.path, 'utf-8')
                global.current_active_file.content = fileContent
                global.MainWindow.webContents.send('file-content-reloaded', {
                    path: global.current_active_file.path,
                    content: fileContent
                })
            } catch (err) {
                console.error('Failed to reload file content:', err)
            }
        }
    })
}

/**
 * 打开选定的文件
 * @param fileProperties 文件属性
 */
export function OpenSelectFile(fileProperties: FileProperties): void {
    // 在打开新文件前,保存当前文件
    const currentFile = global.current_active_file
    if (currentFile && currentFile.path && currentFile.path.endsWith('.md')) {
        try {
            fs.writeFileSync(currentFile.path, currentFile.content, 'utf-8')
            configStore.setFileContent(currentFile.path, currentFile.content)
            logger.info('The file has been saved automatically', currentFile.path)
        } catch (err) {
            logger.error('Failed to automatically save the file', currentFile.path, err)
        }
    }

    // 检测文件大小
    try {
        const stats = fs.statSync(fileProperties.path)
        const fileSize = stats.size

        if (fileSize > LARGE_FILE_THRESHOLD) {
            logger.warn('Open Large File ', `${(fileSize / 1024 / 1024).toFixed(2)}MB`, fileProperties.path)
            const result = dialog.showMessageBoxSync(global.MainWindow, {
                type: 'warning',
                title: 'Large File Warning',
                message: `file size is  ${(fileSize / 1024 / 1024).toFixed(2)}MB, May affect performance `,
                buttons: ['Continue', 'Cancel'],
                defaultId: 0
            })

            if (result === 1) {
                logger.info('user cancel large size file ', fileProperties.path)
                return
            }
        }
    } catch (err) {
        logger.error('check file size failed ', fileProperties.path, err)
    }

    logger.info('loading file ', fileProperties.path)

    const { StartAutoSaveFileTime } = getAutoSaveFunctions()
    StartAutoSaveFileTime()

    // 始终从磁盘读取文件内容，确保显示最新内容
    fs.readFile(fileProperties.path, 'utf8', (err, data) => {
        if (!err) {
            fileProperties.content = data
            global.current_active_file = fileProperties

            // 更新缓存
            configStore.setFileContent(fileProperties.path, data)

            if (data.length === 0) {
                data = '\r\n'
            }
            logger.info('File loaded successfully', fileProperties.path)
            global.MainWindow.webContents.send('baize:notes:show-selected-file-context', data)
            global.MainWindow.webContents.send('monaco-editor-user-select-file', fileProperties.path)
            saveLastOpenedFile(fileProperties.path)
        } else {
            logger.error('File loading failed', fileProperties.path, err)
        }
    })
}

/**
 * 打开文件对话框
 * @param mainWindow 主窗口
 */
export function OpenFile(mainWindow: BrowserWindow): void {
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
        })
}

/**
 * 创建文件
 * @param dirPath 目录路径
 * @param name 文件名
 * @param extension 扩展名
 */
export function CreateFile(dirPath: string, name: string, extension: string): void {
    const fullName = dirPath.replace('/', '\\') + '\\' + name + extension
    fs.writeFileSync(fullName, '')

    setTimeout(() => {
        ReloadDirFromDisk()
    }, reloadFromDiskTime)

    global.current_active_file = {
        name: name,
        path: fullName,
        type: 'file',
        content: '# ' + name
    }
    global.MainWindow.webContents.send('baize:notes:show-selected-file-context', '# ' + name)
}

/**
 * 打开目录对话框
 * @param mainWindow 主窗口
 */
export function OpenDirectory(mainWindow: BrowserWindow): void {
    dialog
        .showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        })
        .then((result) => {
            if (result.canceled) return

            // 清理编辑区域和预览区域
            mainWindow.webContents.send('clear-editor-and-preview')

            global.RootPath = result.filePaths[0]
            ReloadDirFromDisk()

            // 保存上次打开的目录
            const { saveLastOpenedDirectory } = require('../file-state')
            saveLastOpenedDirectory(result.filePaths[0])
        })
        .catch((err) => {
            showErrorMessageBox('Error opening directory dialog:' + err)
        })
}

/**
 * 获取选定的目录
 * @param mainWindow 主窗口
 * @param cb 回调函数
 */
export function GetSelectDir(mainWindow: BrowserWindow, cb: (path: string | null) => void): void {
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

/**
 * 创建目录
 * @param dirPath 目录路径
 * @param name 目录名
 */
export function CreateDirectory(dirPath: string, name: string): void {
    const fullName = dirPath.replace('/', '\\') + '\\' + name
    if (!fs.existsSync(fullName)) {
        fs.mkdirSync(fullName, { recursive: true })
    } else {
        showErrorMessageBox(`${fullName} 已存在`)
    }

    setTimeout(() => {
        ReloadDirFromDisk()
    }, reloadFromDiskTime)
}

/**
 * 重命名文件或文件夹
 * @param name 原名称
 * @param newName 新名称
 * @param isFile 是否为文件
 */
export function Rename(name: string, newName: string, isFile: boolean): void {
    RenameFileFolder(name, newName, isFile)
}

/**
 * 删除文件或文件夹
 * @param name 名称
 * @param isFile 是否为文件
 */
export function Delete(name: string, isFile: boolean): void {
    DeleteFileFolder(name, isFile)
}

/**
 * 重命名文件或文件夹（内部实现）
 * @param name 原名称
 * @param newName 新名称
 * @param isFile 是否为文件
 */
function RenameFileFolder(name: string, newName: string, isFile: boolean): void {
    const dirPath = ParseDirectoryPath(name)
    let newFullPath = ''
    if (!isFile) {
        newFullPath = dirPath.replace('/', '\\') + '\\' + newName
    } else {
        const extension = name.substring(name.lastIndexOf('.'))
        newFullPath = dirPath.replace('/', '\\') + '\\' + newName + extension
    }

    fs.renameSync(name, newFullPath)

    setTimeout(() => {
        ReloadDirFromDisk()
    }, reloadFromDiskTime)

    if (isFile) {
        const fileProperties: FileProperties = {
            name: ParserFileName(newFullPath),
            path: newFullPath,
            type: 'file',
            content: ''
        }
        OpenSelectFile(fileProperties)
    }
}

/**
 * 删除文件或文件夹（内部实现）
 * @param name 名称
 * @param isFile 是否为文件
 */
function DeleteFileFolder(name: string, isFile: boolean): void {
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

/**
 * 在资源管理器中显示文件位置
 * @param filePath 文件路径
 */
export function OpenFolderExplorer(filePath: string): void {
    if (filePath.lastIndexOf('.') === -1) {
        const lastIndex = Math.max(filePath.lastIndexOf('//'), filePath.lastIndexOf('\\'))
        const folderPath = filePath.substring(0, lastIndex)
        shell.showItemInFolder(folderPath)
    } else {
        shell.showItemInFolder(filePath)
    }
}

// 重新导出路径工具函数
export {
    ParserFileName,
    ParseDirectoryPath,
    GetCurrentFileDirectory,
    SelectDirectory
}

// 重新导出 RenameFileFolder（内部使用但需要被外部引用）
export { RenameFileFolder, DeleteFileFolder }
