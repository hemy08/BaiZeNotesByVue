/**
 * 路径工具模块
 * 提供路径解析、文件名提取等功能
 */

import { dialog } from 'electron'
import { FileItem } from '../../global-types'
import { appState } from '../app-state'

/**
 * 获取当前打开文件的目录路径
 * @returns 当前文件的目录路径，如果没有打开的文件则返回项目根路径
 */
export function GetCurrentFileDirectory(): string {
    const activeFile = appState.currentActiveFile
    if (activeFile && activeFile.path) {
        const filePath = activeFile.path
        const lastIndex = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
        return filePath.substring(0, lastIndex)
    }
    return appState.rootPath || ''
}

/**
 * 显示选择目录对话框
 * @param mainWindow 主窗口实例
 * @returns 选择的目录路径，如果取消则返回空字符串
 */
export async function SelectDirectory(mainWindow: Electron.BrowserWindow): Promise<string> {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
        return ''
    }
    return result.filePaths[0]
}

/**
 * 解析文件名（从完整路径中提取文件名）
 * @param filePath 完整的文件路径
 * @returns 文件名
 */
export function ParserFileName(filePath: string): string {
    const lastIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    if (lastIndex === -1) {
        return filePath
    }
    return filePath.slice(lastIndex + 1)
}

/**
 * 解析目录路径（从完整路径中提取目录部分）
 * @param fullName 完整的文件或目录路径
 * @returns 目录路径
 */
export function ParseDirectoryPath(fullName: string): string {
    if (fullName.lastIndexOf('.') === -1) {
        return fullName
    }
    const lastIndex1 = fullName.lastIndexOf('\\')
    const lastIndex2 = fullName.lastIndexOf('/')
    const lastIndex = Math.max(lastIndex1, lastIndex2)
    return fullName.substring(0, lastIndex)
}

/**
 * 构建文件树结构
 * @param rootPath 根路径
 * @param mdFiles 文件列表
 * @returns 文件树结构
 */
export function BuildFileTree(rootPath: string, mdFiles: FileItem[]): FileItem[] {
    const lastIndex = Math.max(rootPath.lastIndexOf('\\'), rootPath.lastIndexOf('/'))
    const directoryName = rootPath.substring(lastIndex + 1)

    const directory: FileItem = {
        name: directoryName,
        path: rootPath,
        type: 'folder',
        isDirectory: true,
        children: mdFiles.map((fileItem) => {
            return fileItem
        })
    }

    return [directory]
}
