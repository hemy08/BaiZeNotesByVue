/**
 * 图片操作模块
 * 提供图片保存、复制链接等功能
 */

import * as fs from 'fs'
import { clipboard } from 'electron'
import { ParseDirectoryPath } from './path-utils'
import { showErrorMessageBox } from './dialog-helpers'

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
function CreateImagesDir(): string {
    const curDir = ParseDirectoryPath(global.current_active_file.path)
    const outDir = path.join(curDir, 'images')
    if (!fs.existsSync(outDir)) {
        try {
            fs.mkdirSync(outDir, { recursive: true })
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
function SaveImagesFile(outFilePath: string, base64Image: string): boolean {
    const imgBuffer = ParserImageBuffer(base64Image)
    if (imgBuffer === null) {
        showErrorMessageBox(`解析文件格式失败，当前只支持*.png;*.jpg;*.jpeg;*.bmp;*gif;*.ico;`)
        return false
    }

    try {
        fs.writeFileSync(outFilePath, imgBuffer, 'binary')
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
export function SaveImageDataToFile(name: string, base64Image: string): boolean {
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
        showErrorMessageBox(`文件已经存在 ${name}`)
        return true
    }
    return SaveImagesFile(outFilePath, base64Image)
}

/**
 * 插入图片到文件
 * @param base64Image Base64 图片内容
 * @returns 保存的文件名
 */
export function InsertImagesToFile(base64Image: string): string {
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
        showErrorMessageBox(`文件已经存在 ${fileName}`)
        return ''
    }

    if (SaveImagesFile(outFilePath, base64Image) === false) {
        return ''
    }
    return fileName
}

/**
 * 复制相对路径到剪贴板
 * @param toPath 目标路径
 */
export function CopyRelativePath(toPath: string): void {
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

/**
 * 复制文件链接到剪贴板
 * @param toPath 目标路径
 */
export function CopyFileLink(toPath: string): void {
    if (!global.current_active_file) {
        showErrorMessageBox(`请先打开一个文件！`)
        return
    }
    let relative = path.relative(global.current_active_file.path, toPath)
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
    if (!global.current_active_file) {
        showErrorMessageBox(`请先打开一个文件！`)
        return
    }
    let relative = path.relative(global.current_active_file.path, toPath)
    if (relative.startsWith('../') || relative.startsWith('..\\')) {
        relative = relative.substring(3)
    }
    let fileLink = '![' + path.basename(toPath) + '](' + relative + ')'
    fileLink = fileLink.replace('\\', '/')
    clipboard.writeText(fileLink)
}
