/**
 * Electron Store 工厂函数
 * 统一创建 Store 实例，确保所有配置文件都存储在用户目录下
 */

import Store from 'electron-store'
import { getUserDataPath } from './app-paths'
import * as path from 'path'

/**
 * 创建统一配置的 Store 实例
 * @param name 存储文件名称
 * @param defaults 默认值
 */
export function createStore<T extends Record<string, unknown>>(
    name: string,
    defaults: T
): Store<T> {
    const userDataPath = getUserDataPath()
    const configDir = path.join(userDataPath, 'config')
    
    return new Store<T>({
        name,
        cwd: configDir,
        defaults
    })
}
