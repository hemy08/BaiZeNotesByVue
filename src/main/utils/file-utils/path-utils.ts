/**
 * 路径工具模块
 * 提供路径解析、文件名提取等功能
 */

import { dialog } from 'electron'
// ARC-13：FileItem 已收敛到 src/shared/types/file.ts（唯一真源）
import type { FileItem } from '../../../shared/types'
import { appState } from '../app-state'
// 公共接口归位第 2 批：文件名/目录路径解析统一引用 shared/utils/path 真源
import { getBaseName, parseDirectoryPath } from '../../../shared/utils/path'
// P1-FE-06：目录选择对话框以系统设置的默认文件路径为起始位置
import { getSystemSetting } from '../../config/system-setting'

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
 * P1-FE-06：读取系统设置中的「默认文件保存路径」（defaultFilePath）。
 * 该设置项此前无任何消费方，现作为目录选择对话框的起始位置。
 * 读取失败（配置损坏等）不阻塞选择目录主流程，按未设置处理。
 */
function readDefaultFilePath(): string {
    try {
        const value = getSystemSetting().defaultFilePath
        return typeof value === 'string' ? value : ''
    } catch {
        return ''
    }
}

/**
 * 显示选择目录对话框
 * @param mainWindow 主窗口实例
 * @returns 选择的目录路径，如果取消则返回空字符串
 */
export async function SelectDirectory(mainWindow: Electron.BrowserWindow): Promise<string> {
    const options: Electron.OpenDialogOptions = {
        properties: ['openDirectory']
    }
    // P1-FE-06：优先从系统设置的默认文件路径开始浏览
    const defaultPath = readDefaultFilePath()
    if (defaultPath) {
        options.defaultPath = defaultPath
    }
    const result = await dialog.showOpenDialog(mainWindow, options)
    if (result.canceled || result.filePaths.length === 0) {
        return ''
    }
    return result.filePaths[0]
}

/**
 * 解析文件名（从完整路径中提取文件名）
 * 公共接口归位第 2 批：实现改为 shared/utils/path.getBaseName（同时识别 `/` 与 `\`，
 * 无分隔符时返回原字符串，与旧实现逐字等价）。
 * @param filePath 完整的文件路径
 * @returns 文件名
 */
export function ParserFileName(filePath: string): string {
    return getBaseName(filePath)
}

/**
 * 解析目录路径（从完整路径中提取目录部分）
 * 公共接口归位第 2 批：实现改为 shared/utils/path.parseDirectoryPath，并**保留**
 * 「整个路径无点号时原样返回」的历史特殊语义（shared 按原实现逐字对齐，不得顺手修正）。
 * @param fullName 完整的文件或目录路径
 * @returns 目录路径
 */
export function ParseDirectoryPath(fullName: string): string {
    return parseDirectoryPath(fullName)
}

/**
 * 构建文件树结构
 * @param rootPath 根路径
 * @param mdFiles 文件列表
 * @returns 文件树结构
 */
export function BuildFileTree(rootPath: string, mdFiles: FileItem[]): FileItem[] {
    // 公共接口归位第 2 批：目录名提取（取最后一段）改用 shared 的 getBaseName
    const directoryName = getBaseName(rootPath)

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
