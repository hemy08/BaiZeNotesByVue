/**
 * 路径工具模块
 * 提供路径解析、文件名提取等功能
 */

import { dialog } from 'electron'
import { dirname } from 'path'
// ARC-13：FileItem 已收敛到 src/shared/types/file.ts（唯一真源）
import type { FileItem } from '../../../shared/types'
import { appState } from '../app-state'
// 公共接口归位第 2 批：文件名/目录路径解析统一引用 shared/utils/path 真源
import { getBaseName, parseDirectoryPath } from '../../../shared/utils/path'
// P1-FE-06：目录选择对话框以系统设置的默认文件路径为起始位置
// 结构优化 1.1（H1）：系统设置读取改为注入（main/index.ts 启动早期注入 config 实现），
// utils 不再静态 import config，消除 utils → config 反向依赖。
import { getSystemSettingFromProvider } from '../providers'

/**
 * 获取当前打开文件的目录路径
 * 第 4 批 P3 清理：原手写 `Math.max(lastIndexOf('\\'), lastIndexOf('/')) + substring`
 * 统一改用 Node `path.dirname`。Windows 下对 `\` 与 `/` 混合分隔符的结果与旧实现一致；
 * 仅「完全无分隔符」的输入由旧实现的空串变为 `.`——活动文件路径恒为分隔符完整的
 * 绝对路径，该分支不会出现在真实调用中。
 * @returns 当前文件的目录路径，如果没有打开的文件则返回项目根路径
 */
export function GetCurrentFileDirectory(): string {
    const activeFile = appState.currentActiveFile
    if (activeFile && activeFile.path) {
        return dirname(activeFile.path)
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
        const value = getSystemSettingFromProvider().defaultFilePath
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
 * 构建文件树结构（把目录扫描结果包装成单根目录节点）。
 *
 * 第 2 批契约重构：shared `FileItem` 已把 `id` / `fileExtension` 收紧为必填
 * （主进程整树下发的节点契约），根节点也必须携带这两个字段：
 * - `id`：由调用方传入与子节点同源的稳定 id（directory-tree.buildStableItemId，
 *   保证同一路径两次扫描的整树 JSON 逐字节一致，PF-4 去重才能生效）；
 * - `fileExtension`：根节点不是文件，固定空字符串（与文件夹节点口径一致）。
 *
 * @param rootPath 根路径（工作区目录绝对路径）
 * @param mdFiles 文件列表（目录扫描结果）
 * @param rootId 根节点的稳定 id（路径派生的 FNV-1a base36 字符串）
 * @returns 文件树结构（单根节点）
 */
export function BuildFileTree(rootPath: string, mdFiles: FileItem[], rootId: string): FileItem[] {
    // 公共接口归位第 2 批：目录名提取（取最后一段）改用 shared 的 getBaseName
    const directoryName = getBaseName(rootPath)

    const directory: FileItem = {
        id: rootId,
        name: directoryName,
        path: rootPath,
        type: 'folder',
        isDirectory: true,
        fileExtension: '',
        children: mdFiles.map((fileItem) => {
            return fileItem
        })
    }

    return [directory]
}
