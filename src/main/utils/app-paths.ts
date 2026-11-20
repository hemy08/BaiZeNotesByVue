/**
 * 应用路径管理工具
 * 统一管理应用的各种路径，包括用户配置目录
 *
 * P3-7（安全剩余项）：明文备份/配置/日志均落在 `~/.baizenotes` 下。POSIX 平台在
 * 创建数据根目录时尽力收紧为 `0o700`（仅当前用户可读写/进入），备份文件再收紧为
 * `0o600`；Windows 的访问控制由 ACL 表达（Node fs.chmod 只能切换只读位、无法收紧
 * ACL），因此跳过并在文档/报告中说明依赖用户配置目录的默认 ACL。
 */

import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs-extra'

// CQ-11：配置目录名统一常量 —— config-manager.ts 与 config-backup.ts 等
// 均引用此处，避免 'config' 段在多处散落（存储行为不变：目录名仍为 config）。
export const CONFIG_DIR_NAME = 'config'

/** P3-7：应用数据根目录 POSIX 权限（仅所有者可读写/进入） */
export const USER_DATA_DIR_MODE = 0o700

/** P3-7：明文备份文件 POSIX 权限（仅所有者可读写） */
export const BACKUP_FILE_MODE = 0o600

/**
 * P3-7：是否应用 POSIX 权限位收紧。
 *
 * Windows 不适用 chmod 语义（仅写权限位有效，无法收紧 ACL）；依赖 `%USERPROFILE%`
 * 的默认 ACL（当前用户 + SYSTEM/Administrators）。非 Windows 平台返回 true。
 */
export function shouldApplyPosixPermissionHardening(
    platform: NodeJS.Platform = process.platform
): boolean {
    return platform !== 'win32'
}

/**
 * P3-7：尽力收紧单个路径的权限位（同步版，供启动期/同步路径使用）。
 * 平台不适用、路径不存在或文件系统不支持时返回 false，绝不抛错（权限收紧不能
 * 阻断应用启动或备份主流程）。
 */
export function hardenPathPermissionsSync(
    targetPath: string,
    mode: number,
    platform: NodeJS.Platform = process.platform
): boolean {
    if (!shouldApplyPosixPermissionHardening(platform)) {
        return false
    }
    try {
        fs.chmodSync(targetPath, mode)
        return true
    } catch {
        return false
    }
}

/**
 * P3-7：尽力收紧单个路径的权限位（异步版，供备份等异步 IO 链路使用）。
 * 语义与 `hardenPathPermissionsSync` 一致：失败安全降级，不抛错。
 */
export async function hardenPathPermissions(
    targetPath: string,
    mode: number,
    platform: NodeJS.Platform = process.platform
): Promise<boolean> {
    if (!shouldApplyPosixPermissionHardening(platform)) {
        return false
    }
    try {
        await fs.chmod(targetPath, mode)
        return true
    } catch {
        return false
    }
}

/**
 * 获取用户配置目录路径
 * 在用户目录下创建 .baizenotes 目录
 */
export function getUserDataPath(): string {
    // 在用户目录下创建 .baizenotes 目录
    const userHome = app.getPath('home') // 用户主目录
    const userDataPath = path.join(userHome, '.baizenotes')

    // 确保目录存在
    if (!fs.existsSync(userDataPath)) {
        fs.ensureDirSync(userDataPath)
    }

    // P3-7：目录已存在时也收紧权限（历史安装可能为 0o755）；失败安全降级
    hardenPathPermissionsSync(userDataPath, USER_DATA_DIR_MODE)

    return userDataPath
}

/**
 * 获取应用资源目录路径
 * 打包后资源文件在 process.resourcesPath 目录下（extraResources 复制目标）
 */
export function getAppResourcesPath(): string {
    if (app.isPackaged) {
        // 打包后，extraResources 复制到 process.resourcesPath 目录下
        // 例如：C:\Program Files\BaiZeNotes\resources\
        return process.resourcesPath
    } else {
        // 开发环境，使用项目目录下的 resources
        return path.join(app.getAppPath(), 'resources')
    }
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
    return path.join(getUserDataPath(), CONFIG_DIR_NAME)
}

/**
 * 获取图标文件路径
 */
export function getIconPath(): string {
    if (app.isPackaged) {
        // 打包后，图标在安装目录的 icon 子目录下
        return path.join(getAppResourcesPath(), 'icon')
    } else {
        // 开发环境
        return path.join(app.getAppPath(), 'resources', 'icon')
    }
}

/**
 * 获取主题文件路径
 */
export function getThemesPath(): string {
    if (app.isPackaged) {
        // 打包后，主题在安装目录的 themes 子目录下
        return path.join(getAppResourcesPath(), 'themes')
    } else {
        // 开发环境
        return path.join(app.getAppPath(), 'resources', 'themes')
    }
}

/**
 * 获取 KaTeX 文件路径
 */
export function getKatexPath(): string {
    if (app.isPackaged) {
        return path.join(getAppResourcesPath(), 'katex')
    } else {
        return path.join(app.getAppPath(), 'resources', 'katex')
    }
}

/**
 * 获取 Mermaid 文件路径
 */
export function getMermaidPath(): string {
    if (app.isPackaged) {
        return path.join(getAppResourcesPath(), 'mermaid')
    } else {
        return path.join(app.getAppPath(), 'resources', 'mermaid')
    }
}

/**
 * 获取 PlantUML 文件路径
 */
export function getPlantumlPath(): string {
    if (app.isPackaged) {
        return path.join(getAppResourcesPath(), 'plantuml')
    } else {
        return path.join(app.getAppPath(), 'resources', 'plantuml')
    }
}

/**
 * 初始化用户数据目录结构
 */
export function initUserDataDirectory(): void {
    const userDataPath = getUserDataPath()

    // 创建必要的子目录
    const subDirs = [CONFIG_DIR_NAME, 'cache', 'logs']
    subDirs.forEach((dir) => {
        const dirPath = path.join(userDataPath, dir)
        if (!fs.existsSync(dirPath)) {
            fs.ensureDirSync(dirPath)
        }
    })
}

/**
 * 获取应用路径信息（用于调试）
 */
export function getAppPathsInfo(): Record<string, string> {
    return {
        userData: getUserDataPath(),
        appResources: getAppResourcesPath(),
        config: getConfigPath(),
        icon: getIconPath(),
        themes: getThemesPath(),
        katex: getKatexPath(),
        mermaid: getMermaidPath(),
        plantuml: getPlantumlPath(),
        exe: app.getPath('exe'),
        home: app.getPath('home')
    }
}
