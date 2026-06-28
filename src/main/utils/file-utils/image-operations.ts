/**
 * 图片操作模块
 * 提供图片保存、复制链接等功能
 */

import { promises as fs } from 'fs'
import { clipboard } from 'electron'
import { ParseDirectoryPath } from './path-utils'
import { showErrorMessageBox } from './dialog-helpers'
import { appState } from '../app-state'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')

function getMathRandom(maxLength: number): string {
    let result = ''
    for (let i = 0; i < maxLength; i++) {
        result += Math.floor(Math.random() * 10)
    }
    return result
}

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
 * @returns images 目录路径
 */
async function CreateImagesDir(): Promise<string> {
    const curDir = ParseDirectoryPath(appState.currentActiveFile!.path)
    const outDir = path.join(curDir, 'images')
    try {
        await fs.access(outDir)
    } catch {
        try {
            await fs.mkdir(outDir, { recursive: true })
        } catch (err) {
            showErrorMessageBox(`${outDir} 不存在，创建目录失败，${err}`)
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
    const imgBuffer = ParserImageBuffer(base64Image)
    if (imgBuffer === null) {
        showErrorMessageBox(`解析文件格式失败，当前只支持*.png;*.jpg;*.jpeg;*.bmp;*gif;*.ico;`)
        return false
    }

    try {
        await fs.writeFile(outFilePath, imgBuffer)
    } catch (err) {
        showErrorMessageBox(`保存图像时出错: ${err}`)
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
        showErrorMessageBox(`未打开任何文件，请先打开一个文件`)
        return false
    }

    const outDir = await CreateImagesDir()
    if (outDir.length === 0) {
        return false
    }

    const outFilePath = path.join(outDir, name)
    try {
        await fs.access(outFilePath)
        showErrorMessageBox(`文件已经存在 ${name}`)
        return true
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
        showErrorMessageBox(`未打开任何文件，请先打开一个文件`)
        return ''
    }

    const outDir = await CreateImagesDir()
    if (outDir.length === 0) {
        return ''
    }

    const fileName = getMathRandom(16) + '.png'
    const outFilePath = path.join(outDir, fileName)
    try {
        await fs.access(outFilePath)
        showErrorMessageBox(`文件已经存在 ${fileName}`)
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
        showErrorMessageBox(`请先打开一个文件！`)
        return
    }
    let relative = path.relative(appState.currentActiveFile.path, toPath)
    if (relative.startsWith('../') || relative.startsWith('..\\')) {
        relative = relative.substring(3)
    }
    relative = relative.replace('\\', '/')
    clipboard.writeText(relative)
}

/**
 * 复制文件链接到剪贴板
 * @param toPath 目标路径
 */
export function CopyFileLink(toPath: string): void {
    if (!appState.currentActiveFile) {
        showErrorMessageBox(`请先打开一个文件！`)
        return
    }
    let relative = path.relative(appState.currentActiveFile.path, toPath)
    if (relative.startsWith('../') || relative.startsWith('..\\')) {
        relative = relative.substring(3)
    }
    let fileLink = '[' + path.basename(toPath) + '](' + relative + ')'
    fileLink = fileLink.replace('\\', '/')
    clipboard.writeText(fileLink)
}

/**
 * 复制图片链接到剪贴板
 * @param toPath 目标路径
 */
export function CopyImageLink(toPath: string): void {
    if (!appState.currentActiveFile) {
        showErrorMessageBox(`请先打开一个文件！`)
        return
    }
    let relative = path.relative(appState.currentActiveFile.path, toPath)
    if (relative.startsWith('../') || relative.startsWith('..\\')) {
        relative = relative.substring(3)
    }
    let fileLink = '![' + path.basename(toPath) + '](' + relative + ')'
    fileLink = fileLink.replace('\\', '/')
    clipboard.writeText(fileLink)
}
