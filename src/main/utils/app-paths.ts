/**
 * 应用路径管理工具
 * 统一管理应用的各种路径，包括用户配置目录
 */

import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs-extra'

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
        console.log(`[AppPaths] Created user data directory: ${userDataPath}`)
    }
    
    return userDataPath
}

/**
 * 获取应用资源目录路径
 * 打包后资源文件在安装目录下，与 resources.asar 同级
 */
export function getAppResourcesPath(): string {
    if (app.isPackaged) {
        // 打包后，资源文件在安装目录下
        // 例如：C:\Program Files\BaiZeNotes\config
        return path.dirname(app.getPath('exe'))
    } else {
        // 开发环境，使用项目目录下的 resources
        return path.join(app.getAppPath(), 'resources')
    }
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
    return path.join(getUserDataPath(), 'config')
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
    const subDirs = ['config', 'cache', 'logs']
    subDirs.forEach(dir => {
        const dirPath = path.join(userDataPath, dir)
        if (!fs.existsSync(dirPath)) {
            fs.ensureDirSync(dirPath)
            console.log(`[AppPaths] Created directory: ${dirPath}`)
        }
    })
    
    console.log(`[AppPaths] User data directory initialized: ${userDataPath}`)
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
