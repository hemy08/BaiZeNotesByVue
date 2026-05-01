/**
 * 白泽状态管理类
 * 使用 electron-store 进行持久化存储
 * 使用 LRU 缓存管理文件内容
 */

import Store from 'electron-store'
import { getUserDataPath } from './app-paths'
import * as path from 'path'

// 文件内容缓存项
interface FileContent {
    content: string
    timestamp: number
    size: number
}

// Store 数据结构
interface StoreSchema {
    lastOpenedFile: string | null
    lastOpenedDirectory: string | null
}

class BaiZeStore {
    private store: Store<StoreSchema>
    private fileCache: Map<string, FileContent>
    private readonly MAX_CACHE_SIZE = 50 // 最大缓存文件数

    constructor() {
        // 获取用户数据目录
        const userDataPath = getUserDataPath()
        const configFilePath = path.join(userDataPath, 'config', 'baize-config.json')
        
        // 初始化 electron-store，指定配置文件路径
        this.store = new Store<StoreSchema>({
            name: 'baize-config',
            cwd: path.join(userDataPath, 'config'),
            defaults: {
                lastOpenedFile: null,
                lastOpenedDirectory: null
            }
        })
        
        // 初始化文件缓存
        this.fileCache = new Map()
        
        console.log(`[BaiZeStore] Store initialized at: ${configFilePath}`)
    }

    // ========== 持久化存储操作 ==========

    /**
     * 获取最后打开的文件路径
     */
    getLastOpenedFile(): string | null {
        return this.store.get('lastOpenedFile')
    }

    /**
     * 设置最后打开的文件路径
     */
    setLastOpenedFile(path: string): void {
        this.store.set('lastOpenedFile', path)
    }

    /**
     * 获取最后打开的目录路径
     */
    getLastOpenedDirectory(): string | null {
        return this.store.get('lastOpenedDirectory')
    }

    /**
     * 设置最后打开的目录路径
     */
    setLastOpenedDirectory(path: string): void {
        this.store.set('lastOpenedDirectory', path)
    }

    // ========== 文件缓存操作 ==========

    /**
     * 缓存文件内容
     */
    setFileContent(path: string, content: string): void {
        // 检查缓存是否已满
        if (this.fileCache.size >= this.MAX_CACHE_SIZE) {
            // 删除最旧的缓存
            const oldestKey = this.fileCache.keys().next().value!
            this.fileCache.delete(oldestKey)
            //console.log(`[BaiZeStore] Cache full, removed: ${oldestKey}`)
        }
        this.fileCache.set(path, {
            content,
            timestamp: Date.now(),
            size: content.length
        })
        //console.log(`[BaiZeStore] Cached file: ${path}, size: ${content.length}, cache size: ${this.fileCache.size}`)
    }

    /**
     * 从缓存获取文件内容
     */
    getFileContent(path: string): string | null {
        const cached = this.fileCache.get(path)
        if (cached) {
            //console.log(`[BaiZeStore] Cache hit: ${path}`)
            return cached.content
        }
        return null
    }

    /**
     * 检查文件是否在缓存中
     */
    hasFileContent(path: string): boolean {
        return this.fileCache.has(path)
    }

    /**
     * 从缓存中删除文件
     */
    deleteFileContent(path: string): boolean {
        return this.fileCache.delete(path)
    }

    /**
     * 清空文件缓存
     */
    clearCache(): void {
        this.fileCache.clear()
        console.log('[BaiZeStore] Cache cleared')
    }

    /**
     * 获取缓存统计信息
     */
    getCacheStats(): { size: number; capacity: number } {
        return {
            size: this.fileCache.size,
            capacity: this.MAX_CACHE_SIZE
        }
    }

    // ========== 调试和监控 ==========

    /**
     * 获取状态摘要（用于调试）
     */
    getStateSummary(): Record<string, unknown> {
        return {
            persistent: {
                lastOpenedFile: this.getLastOpenedFile(),
                lastOpenedDirectory: this.getLastOpenedDirectory()
            },
            cache: this.getCacheStats()
        }
    }
}

// 导出单例
export const configStore = new BaiZeStore()
