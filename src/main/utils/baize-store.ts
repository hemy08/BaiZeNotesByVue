/**
 * 白泽状态管理类
 * 使用 electron-store 进行持久化存储
 * 使用 LRU 缓存管理文件内容
 */

import Store from 'electron-store'

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
    editorSettings: Record<string, unknown>
    themeSettings: Record<string, unknown>
}

/**
 * 白泽状态管理类
 */
export class BaiZeStore {
    private store: Store<StoreSchema>
    private fileCache: Map<string, FileContent> = new Map()
    private readonly MAX_CACHE_SIZE = 50 // 最多缓存 50 个文件

    constructor() {
        this.store = new Store<StoreSchema>({
            name: 'app-state',
            defaults: {
                lastOpenedFile: null,
                lastOpenedDirectory: null,
                editorSettings: {},
                themeSettings: {}
            }
        })
    }

    // ========== 持久化状态管理 ==========

    getLastOpenedFile(): string | null {
        return this.store.get('lastOpenedFile')
    }

    setLastOpenedFile(path: string | null): void {
        this.store.set('lastOpenedFile', path)
    }

    getLastOpenedDirectory(): string | null {
        return this.store.get('lastOpenedDirectory')
    }

    setLastOpenedDirectory(path: string | null): void {
        this.store.set('lastOpenedDirectory', path)
    }

    getEditorSettings(): Record<string, unknown> {
        return this.store.get('editorSettings')
    }

    setEditorSettings(settings: Record<string, unknown>): void {
        this.store.set('editorSettings', settings)
    }

    getThemeSettings(): Record<string, unknown> {
        return this.store.get('themeSettings')
    }

    setThemeSettings(settings: Record<string, unknown>): void {
        this.store.set('themeSettings', settings)
    }

    // ========== 文件缓存管理 (LRU) ==========

    /**
     * 设置文件内容到缓存
     */
    setFileContent(path: string, content: string): void {
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
