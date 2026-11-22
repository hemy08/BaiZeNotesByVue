/**
 * D2：文件关联 / 命令行打开文件（单实例打开链路）。
 *
 * 支持：
 * - Windows 安装包注册 .md/.markdown/.txt 关联；
 * - 双击文件启动主实例 / 二次启动通过 `second-instance` 把文件交给已有窗口；
 * - 只接受真实存在的普通文件与白名单扩展名；路径经既有 OpenSelectFile 链路读取。
 *
 * 说明：本模块只处理“打开文件”，不创建真正独立的多窗口；多窗口需要按窗口隔离
 * appState/IPC sender/菜单与未保存状态，属于独立架构改造（见报告 D2 评估）。
 */
import { promises as fs, statSync } from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { OpenSelectFile } from './file-utils/file-operations'
import { registerTrustedPath } from './security'
import { logger } from './logger'

const ASSOCIATED_FILE_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])

function isAssociatedFileExtension(filePath: string): boolean {
    return ASSOCIATED_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

/**
 * 从命令行参数中提取待打开的文件路径。
 * - 跳过 exe/脚本/开关（`-`/`--`）参数；
 * - 只接受白名单扩展名且磁盘上存在的普通文件；
 * - 多个候选取第一个（Windows 关联通常只传一个文件）。
 */
export function resolveFileAssociationArg(argv: readonly string[]): string | null {
    if (!Array.isArray(argv)) {
        return null
    }
    for (const raw of argv) {
        if (typeof raw !== 'string' || raw.length === 0 || raw.startsWith('-')) {
            continue
        }
        const candidate = path.resolve(raw)
        if (!isAssociatedFileExtension(candidate)) {
            continue
        }
        try {
            // 同步 stat 在启动早期一次性执行，避免异步竞态；只接受普通文件。
            const stat = statSync(candidate)
            if (stat.isFile()) {
                return candidate
            }
        } catch {
            // 参数不是现有文件（如应用路径/项目目录），继续找
        }
    }
    return null
}

/**
 * 打开命令行指定的关联文件：登记受信路径后复用现有 OpenSelectFile 读盘/下发链路。
 * 文件不存在或路径不是白名单扩展名时返回 false（不抛错）。
 */
export async function openAssociatedFile(filePath: string | null): Promise<boolean> {
    if (!filePath) {
        return false
    }
    const resolved = path.resolve(filePath)
    if (!isAssociatedFileExtension(resolved)) {
        return false
    }
    try {
        const stat = await fs.stat(resolved)
        if (!stat.isFile()) {
            return false
        }
    } catch {
        return false
    }
    try {
        registerTrustedPath(resolved)
        await OpenSelectFile({
            name: path.basename(resolved),
            path: resolved,
            type: 'file'
        })
        return true
    } catch (error) {
        logger.warn('[FileAssociation] 打开关联文件失败：', error)
        return false
    }
}

/**
 * 是否应处理命令行文件：
 * - 打包版：第二个参数即文件；
 * - 开发版：process.argv 包含 electron / 应用路径，resolveFileAssociationArg 会跳过非文件；
 * - `--no-sandbox` 等开关已在解析中跳过。
 */
export function getStartupAssociationFile(
    argv: readonly string[] = process.argv,
    isPackaged: boolean = app.isPackaged
): string | null {
    if (isPackaged) {
        return resolveFileAssociationArg(argv.slice(1))
    }
    return resolveFileAssociationArg(argv)
}
