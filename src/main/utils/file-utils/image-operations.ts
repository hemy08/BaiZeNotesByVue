/**
 * 图片操作模块
 * 提供图片保存、复制链接等功能
 */

import { promises as fs } from 'fs'
import { clipboard } from 'electron'
import { ParseDirectoryPath } from './path-utils'
import { showErrorMessageBox } from './dialog-helpers'
// 4.4（M2）：图片路径越界提示与 file-utils/shared 的 notifyPathAccessDenied 是同一条
// 文案/类型，原独立实现 notifyImagePathDenied 已删除，统一复用共享 helper
// （name 参数非法时复用 notifyInvalidFileName，状态栏文案与原实现逐字一致、日志更准确）。
import { notifyInvalidFileName, notifyPathAccessDenied } from './shared'
import { appState } from '../app-state'
import { tMain } from '../i18n'
// P1-AS-1：图片落盘同样受文件路径守卫约束（活动文件目录之外一律拒绝）
import { isPathAllowed, isSafeFileName } from '../security'
// 公共接口归位第 2 批：纯数字随机串迁移到 shared/utils/random（字符集与循环语义逐字对齐）
import { randomDigits } from '../../../shared/utils/random'
// 第 4 批 P3 清理：分隔符归一化复用 shared/utils/path.normalizeSlashes
//（FE-14：必须是全局替换，原 `replace('\\', '/')` 只替换首个反斜杠，嵌套目录会生成带反斜杠的链接）
import { normalizeSlashes } from '../../../shared/utils/path'

import path from 'path'

/**
 * 解析图片 Buffer
 * @param content Base64 图片内容
 * @returns 图片 Buffer 或 null
 */
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

/**
 * 创建 images 目录
 * @returns images 目录路径；未打开文件或创建失败时返回空字符串
 */
async function CreateImagesDir(): Promise<string> {
    // P2 非空断言治理：图片保存/插入可能在文件被关闭后异步到达，
    // 这里显式判空并早退，避免 currentActiveFile!.path 在 null 时抛 TypeError。
    const activeFile = appState.currentActiveFile
    if (!activeFile || !activeFile.path) {
        showErrorMessageBox(tMain('mainMsg.file.noFileOpen'))
        return ''
    }
    const curDir = ParseDirectoryPath(activeFile.path)
    const outDir = path.join(curDir, 'images')
    // P1-AS-1：图片目录必须位于受信范围（活动文件目录/工作区/临时目录/对话框选择路径）；
    // 活动文件目录由 security.ts 依据「活动文件本身已受信」派生，正常场景不会被拒。
    if (!isPathAllowed(outDir)) {
        notifyPathAccessDenied(outDir)
        return ''
    }
    try {
        await fs.access(outDir)
    } catch {
        try {
            await fs.mkdir(outDir, { recursive: true })
        } catch (err) {
            showErrorMessageBox(
                tMain('mainMsg.file.createImagesDirFailed', { path: outDir, error: String(err) })
            )
            return ''
        }
    }

    return outDir
}

/**
 * 保存图片文件
 * @param outFilePath 输出文件路径
 * @param base64Image Base64 图片内容
 * @returns 是否保存成功
 */
async function SaveImagesFile(outFilePath: string, base64Image: string): Promise<boolean> {
    // P1-AS-1：写入目标必须在受信范围内（文件名由调用方经白名单校验，这里再守一层）
    if (!isPathAllowed(outFilePath)) {
        notifyPathAccessDenied(outFilePath)
        return false
    }
    const imgBuffer = ParserImageBuffer(base64Image)
    if (imgBuffer === null) {
        showErrorMessageBox(tMain('mainMsg.file.imageFormatUnsupported'))
        return false
    }

    try {
        await fs.writeFile(outFilePath, imgBuffer)
    } catch (err) {
        showErrorMessageBox(tMain('mainMsg.file.saveImageFailed', { error: String(err) }))
        return false
    }

    return true
}

/**
 * 保存图片数据到文件
 * @param name 文件名
 * @param base64Image Base64 图片内容
 * @returns 是否保存成功
 */
export async function SaveImageDataToFile(name: string, base64Image: string): Promise<boolean> {
    if (!appState.currentActiveFile) {
        showErrorMessageBox(tMain('mainMsg.file.noFileOpen'))
        return false
    }
    // P1-AS-1：渲染层传入的 name 可能是 `..\\..\\x.png` 等路径片段，先做文件名白名单校验
    if (!isSafeFileName(name)) {
        notifyInvalidFileName(name)
        return false
    }

    const outDir = await CreateImagesDir()
    if (outDir.length === 0) {
        return false
    }

    const outFilePath = path.join(outDir, name)
    try {
        await fs.access(outFilePath)
        showErrorMessageBox(tMain('mainMsg.file.fileAlreadyExists', { name }))
        // FE-30：目标图片已存在时提示错误后应返回 false（原实现返回 true，
        // 调用方会把「未落盘」误判为保存成功；与 InsertImagesToFile 的空串语义对齐）。
        return false
    } catch {
        return await SaveImagesFile(outFilePath, base64Image)
    }
}

/**
 * 插入图片到文件
 * @param base64Image Base64 图片内容
 * @returns 保存的文件名
 */
export async function InsertImagesToFile(base64Image: string): Promise<string> {
    if (!appState.currentActiveFile) {
        showErrorMessageBox(tMain('mainMsg.file.noFileOpen'))
        return ''
    }

    const outDir = await CreateImagesDir()
    if (outDir.length === 0) {
        return ''
    }

    // 公共接口归位第 2 批：16 位纯数字随机文件名片段改由 shared 的 randomDigits 生成
    const fileName = randomDigits(16) + '.png'
    const outFilePath = path.join(outDir, fileName)
    try {
        await fs.access(outFilePath)
        showErrorMessageBox(tMain('mainMsg.file.fileAlreadyExists', { name: fileName }))
        return ''
    } catch {
        if ((await SaveImagesFile(outFilePath, base64Image)) === false) {
            return ''
        }
        return fileName
    }
}

/**
 * 复制相对路径到剪贴板
 * @param toPath 目标路径
 */
export function CopyRelativePath(toPath: string): void {
    if (!appState.currentActiveFile) {
        showErrorMessageBox(tMain('mainMsg.file.openFileFirst'))
        return
    }
    let relative = path.relative(appState.currentActiveFile.path, toPath)
    if (relative.startsWith('../') || relative.startsWith('..\\')) {
        relative = relative.substring(3)
    }
    relative = normalizeSlashes(relative)
    clipboard.writeText(relative)
}

/**
 * 复制文件链接到剪贴板
 * @param toPath 目标路径
 */
export function CopyFileLink(toPath: string): void {
    if (!appState.currentActiveFile) {
        showErrorMessageBox(tMain('mainMsg.file.openFileFirst'))
        return
    }
    let relative = path.relative(appState.currentActiveFile.path, toPath)
    if (relative.startsWith('../') || relative.startsWith('..\\')) {
        relative = relative.substring(3)
    }
    let fileLink = '[' + path.basename(toPath) + '](' + relative + ')'
    fileLink = normalizeSlashes(fileLink)
    clipboard.writeText(fileLink)
}

/**
 * 复制图片链接到剪贴板
 * @param toPath 目标路径
 */
export function CopyImageLink(toPath: string): void {
    if (!appState.currentActiveFile) {
        showErrorMessageBox(tMain('mainMsg.file.openFileFirst'))
        return
    }
    let relative = path.relative(appState.currentActiveFile.path, toPath)
    if (relative.startsWith('../') || relative.startsWith('..\\')) {
        relative = relative.substring(3)
    }
    let fileLink = '![' + path.basename(toPath) + '](' + relative + ')'
    fileLink = normalizeSlashes(fileLink)
    clipboard.writeText(fileLink)
}
