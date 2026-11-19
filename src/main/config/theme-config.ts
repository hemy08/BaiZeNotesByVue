/**
 * 主题配置管理模块
 * 用于管理应用的主题设置
 */

import Store from 'electron-store'
import * as path from 'path'
import * as fs from 'fs'
import { createStore } from '../utils/store-factory'
import { getUserDataPath } from '../utils/app-paths'
import { logger } from '../utils/logger'
// ARC-13 / 第 2 批契约重构：主题领域类型（ThemeStyles / ThemeType / ThemeConfig /
// MonacoThemeType / ThemeListResult）已收敛到 src/shared/types/theme.ts（唯一真源），
// 此处仅 import type 并 re-export，保持既有 `import type { ThemeType } from '../config'`
// 等引用路径不变。
import type {
    MonacoThemeListItem,
    MonacoThemeType,
    ThemeConfig,
    ThemeListResult,
    ThemeStyles,
    ThemeType
} from '../../shared/types'
// Monaco 主题注册表（内置/磁盘主题元信息的实际实现）；本模块只做委托与共享类型 re-export
import { getAllMonacoThemes as registryGetAllMonacoThemes } from './theme-registry'
import type { MonacoThemeConfig } from './theme-registry'

// ARC-13：re-export 保持既有 `import type { ThemeStyles } from '../config'` 等引用路径不变
export type { MonacoThemeType, ThemeConfig, ThemeStyles, ThemeType }

export const themes: Record<ThemeType, ThemeStyles> = {
    baize: {
        name: '白泽紫韵',
        nameKey: 'themeNames.app.baize.name',
        description: '优雅的紫色渐变主题',
        descKey: 'themeNames.app.baize.description',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundColor: '#f5f0ff',
        cardBackground: '#ffffff',
        textColor: '#2d2d2d',
        secondaryTextColor: '#666666',
        borderColor: '#e0d4f0',
        accentColor: '#764ba2',
        buttonBackground: '#764ba2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f0e8ff'
    },
    warm: {
        name: '暖白温馨',
        nameKey: 'themeNames.app.warm.name',
        description: '温暖的米白色主题',
        descKey: 'themeNames.app.warm.description',
        titleBarGradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        backgroundColor: '#faf8f5',
        cardBackground: '#ffffff',
        textColor: '#3d3d3d',
        secondaryTextColor: '#777777',
        borderColor: '#e8e0d8',
        accentColor: '#e07a5f',
        buttonBackground: '#e07a5f',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5f0eb'
    },
    light: {
        name: '清新简约',
        nameKey: 'themeNames.app.light.name',
        description: '简洁明亮的浅色主题',
        descKey: 'themeNames.app.light.description',
        titleBarGradient: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 50%, #90caf9 100%)',
        backgroundColor: '#ffffff',
        cardBackground: '#f5f5f5',
        textColor: '#212121',
        secondaryTextColor: '#757575',
        borderColor: '#e0e0e0',
        accentColor: '#1976d2',
        buttonBackground: '#1976d2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f0f0f0'
    },
    lavender: {
        name: '薰衣草梦',
        nameKey: 'themeNames.app.lavender.name',
        description: '浅蓝浅紫渐变护眼主题',
        descKey: 'themeNames.app.lavender.description',
        titleBarGradient: 'linear-gradient(135deg, #b8c5e8 0%, #d4b8e8 100%)',
        backgroundColor: '#e8e4f8',
        cardBackground: '#f5f2fa',
        textColor: '#3a3550',
        secondaryTextColor: '#6a6580',
        borderColor: '#d0c8e8',
        accentColor: '#8b7ec8',
        buttonBackground: '#8b7ec8',
        buttonTextColor: '#ffffff',
        hoverBackground: '#ebe8f5'
    },
    coral: {
        name: '珊瑚暖阳',
        nameKey: 'themeNames.app.coral.name',
        description: '温暖的珊瑚色主题',
        descKey: 'themeNames.app.coral.description',
        titleBarGradient: 'linear-gradient(135deg, #ffb8a3 0%, #ff9a8b 100%)',
        backgroundColor: '#e8e4f8',
        cardBackground: '#f5f2fa',
        textColor: '#4a3530',
        secondaryTextColor: '#7a6555',
        borderColor: '#f5d8d0',
        accentColor: '#e07850',
        buttonBackground: '#e07850',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5e8e5'
    },
    mint: {
        name: '薄荷清风',
        nameKey: 'themeNames.app.mint.name',
        description: '清新的薄荷绿主题',
        descKey: 'themeNames.app.mint.description',
        titleBarGradient: 'linear-gradient(135deg, #a8e6cf 0%, #7fcdbb 100%)',
        backgroundColor: '#f0faf5',
        cardBackground: '#ffffff',
        textColor: '#2a4a3a',
        secondaryTextColor: '#5a7a6a',
        borderColor: '#c8e8d8',
        accentColor: '#3cb371',
        buttonBackground: '#3cb371',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e0f5ea'
    },
    sunset: {
        name: '日落余晖',
        nameKey: 'themeNames.app.sunset.name',
        description: '温暖的橙红渐变主题',
        descKey: 'themeNames.app.sunset.description',
        titleBarGradient: 'linear-gradient(135deg, #ffd89b 0%, #f9a86b 100%)',
        backgroundColor: '#fff8e8',
        cardBackground: '#fffbf0',
        textColor: '#4a3a2a',
        secondaryTextColor: '#7a6a5a',
        borderColor: '#f0e0c8',
        accentColor: '#e08840',
        buttonBackground: '#e08840',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5f0e8'
    },
    rose: {
        name: '玫瑰花园',
        nameKey: 'themeNames.app.rose.name',
        description: '浪漫的玫瑰粉主题',
        descKey: 'themeNames.app.rose.description',
        titleBarGradient: 'linear-gradient(135deg, #f5b7b1 0%, #ec7063 100%)',
        backgroundColor: '#fff0f0',
        cardBackground: '#fef5f5',
        textColor: '#4a2a2a',
        secondaryTextColor: '#7a5a5a',
        borderColor: '#f8d8d8',
        accentColor: '#c05050',
        buttonBackground: '#c05050',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f8e8e8'
    },
    dark: {
        name: '深邃夜空',
        nameKey: 'themeNames.app.dark.name',
        description: '护眼深色主题',
        descKey: 'themeNames.app.dark.description',
        titleBarGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        backgroundColor: '#fff0f0',
        cardBackground: '#1a1a2e',
        textColor: '#e0e0e0',
        secondaryTextColor: '#888888',
        borderColor: '#2a2a4a',
        accentColor: '#4fc3f7',
        buttonBackground: '#4fc3f7',
        buttonTextColor: '#1e1e1e',
        hoverBackground: '#252540'
    },
    deepdark: {
        name: '极简深黑',
        nameKey: 'themeNames.app.deepdark.name',
        description: '纯黑背景深色主题',
        descKey: 'themeNames.app.deepdark.description',
        titleBarGradient: 'linear-gradient(135deg, #1f1f1f 0%, #0a0a0a 100%)',
        backgroundColor: '#000000',
        cardBackground: '#121212',
        textColor: '#ffffff',
        secondaryTextColor: '#aaaaaa',
        borderColor: '#333333',
        accentColor: '#bb86fc',
        buttonBackground: '#bb86fc',
        buttonTextColor: '#000000',
        hoverBackground: '#1f1f1f'
    },
    icon: {
        name: '白泽图标',
        nameKey: 'themeNames.app.icon.name',
        description: '与白泽图标一致的紫粉渐变主题',
        descKey: 'themeNames.app.icon.description',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        backgroundColor: '#1a1625',
        cardBackground: '#2d2640',
        textColor: '#e8e0f8',
        secondaryTextColor: '#b8b0c8',
        borderColor: '#3d3560',
        accentColor: '#f093fb',
        buttonBackground: '#f093fb',
        buttonTextColor: '#1a1625',
        hoverBackground: '#352d50'
    },
    ocean: {
        name: '深海蔚蓝',
        nameKey: 'themeNames.app.ocean.name',
        description: '深邃的海洋蓝主题',
        descKey: 'themeNames.app.ocean.description',
        titleBarGradient: 'linear-gradient(135deg, #4a90a4 0%, #2a6070 100%)',
        backgroundColor: '#0a1a20',
        cardBackground: '#152530',
        textColor: '#d0e0e8',
        secondaryTextColor: '#809098',
        borderColor: '#2a4050',
        accentColor: '#40a0c0',
        buttonBackground: '#40a0c0',
        buttonTextColor: '#0a1a20',
        hoverBackground: '#203540'
    },
    forest: {
        name: '森林秘境',
        nameKey: 'themeNames.app.forest.name',
        description: '深邃的森林绿主题',
        descKey: 'themeNames.app.forest.description',
        titleBarGradient: 'linear-gradient(135deg, #4a7a50 0%, #2a5030 100%)',
        backgroundColor: '#f5f8f5',
        cardBackground: '#ffffff',
        textColor: '#1a1a1a',
        secondaryTextColor: '#4a4a4a',
        borderColor: '#d8e8d8',
        accentColor: '#50a050',
        buttonBackground: '#50a050',
        buttonTextColor: '#0a150a',
        hoverBackground: '#e8f5e9'
    },
    'eyecare-green': {
        name: '护眼绿洲',
        nameKey: 'themeNames.app.eyecare-green.name',
        description: '柔和的绿色护眼主题',
        descKey: 'themeNames.app.eyecare-green.description',
        titleBarGradient: 'linear-gradient(135deg, #a8e6cf 0%, #88d8b0 100%)',
        backgroundColor: '#e8f5e9',
        cardBackground: '#f1f8f2',
        textColor: '#2e4a2f',
        secondaryTextColor: '#5a7a5b',
        borderColor: '#c8e6c9',
        accentColor: '#4caf50',
        buttonBackground: '#4caf50',
        buttonTextColor: '#ffffff',
        hoverBackground: '#d4edda'
    },
    'eyecare-beige': {
        name: '护眼米黄',
        nameKey: 'themeNames.app.eyecare-beige.name',
        description: '温和的米黄色护眼主题',
        descKey: 'themeNames.app.eyecare-beige.description',
        titleBarGradient: 'linear-gradient(135deg, #f5e6d3 0%, #e8d5b7 100%)',
        backgroundColor: '#faf6f0',
        cardBackground: '#fff9f0',
        textColor: '#4a4035',
        secondaryTextColor: '#7a7065',
        borderColor: '#e5ddd0',
        accentColor: '#c9a66b',
        buttonBackground: '#c9a66b',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5efe5'
    },
    'eyecare-blue': {
        name: '护眼淡蓝',
        nameKey: 'themeNames.app.eyecare-blue.name',
        description: '舒适的淡蓝色护眼主题',
        descKey: 'themeNames.app.eyecare-blue.description',
        titleBarGradient: 'linear-gradient(135deg, #b8d4e8 0%, #9fc5d8 100%)',
        backgroundColor: '#f0f7fc',
        cardBackground: '#f5fafd',
        textColor: '#2c4a5e',
        secondaryTextColor: '#5a7a8e',
        borderColor: '#d0e4f0',
        accentColor: '#5c9ece',
        buttonBackground: '#5c9ece',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e0eff8'
    },
    'eyecare-pink': {
        name: '护眼樱粉',
        nameKey: 'themeNames.app.eyecare-pink.name',
        description: '柔和的樱花粉护眼主题',
        descKey: 'themeNames.app.eyecare-pink.description',
        titleBarGradient: 'linear-gradient(135deg, #ffd1dc 0%, #ffb6c1 100%)',
        backgroundColor: '#fff5f8',
        cardBackground: '#fffafb',
        textColor: '#4a2a35',
        secondaryTextColor: '#7a5a65',
        borderColor: '#f5d8e0',
        accentColor: '#e08090',
        buttonBackground: '#e08090',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f8e8ec'
    },
    'eyecare-amber': {
        name: '护眼琥珀',
        nameKey: 'themeNames.app.eyecare-amber.name',
        description: '温暖的琥珀色护眼主题',
        descKey: 'themeNames.app.eyecare-amber.description',
        titleBarGradient: 'linear-gradient(135deg, #ffe4b5 0%, #ffd9a0 100%)',
        backgroundColor: '#fffbf0',
        cardBackground: '#fffdf5',
        textColor: '#4a3a20',
        secondaryTextColor: '#7a6a50',
        borderColor: '#f0e5d0',
        accentColor: '#d4a050',
        buttonBackground: '#d4a050',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f8f0e0'
    },
    'eyecare-teal': {
        name: '护眼青瓷',
        nameKey: 'themeNames.app.eyecare-teal.name',
        description: '清雅的青瓷色护眼主题',
        descKey: 'themeNames.app.eyecare-teal.description',
        titleBarGradient: 'linear-gradient(135deg, #b2dfdb 0%, #80cbc4 100%)',
        backgroundColor: '#f0faf8',
        cardBackground: '#f5fcfa',
        textColor: '#2a4a45',
        secondaryTextColor: '#5a7a75',
        borderColor: '#c8e8e0',
        accentColor: '#26a69a',
        buttonBackground: '#26a69a',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e0f5f0'
    },
    'eyecare-lilac': {
        name: '护眼丁香',
        nameKey: 'themeNames.app.eyecare-lilac.name',
        description: '淡雅的丁香紫护眼主题',
        descKey: 'themeNames.app.eyecare-lilac.description',
        titleBarGradient: 'linear-gradient(135deg, #d8bfd8 0%, #c8a8c8 100%)',
        backgroundColor: '#faf5fa',
        cardBackground: '#fdf8fd',
        textColor: '#3a2a40',
        secondaryTextColor: '#6a5a70',
        borderColor: '#e8d8e8',
        accentColor: '#9a70a0',
        buttonBackground: '#9a70a0',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5e8f5'
    },
    'baize-text': {
        name: '白泽文字',
        nameKey: 'themeNames.app.baize-text.name',
        description: '紫粉渐变配金色文字深色主题',
        descKey: 'themeNames.app.baize-text.description',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        backgroundColor: '#1a1625',
        cardBackground: '#2d2640',
        textColor: '#e8e0f8',
        secondaryTextColor: '#b8b0c8',
        borderColor: '#3d3560',
        accentColor: '#ffd700',
        buttonBackground: '#764ba2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#352d50'
    },
    'baize-starry': {
        name: '白泽星空',
        nameKey: 'themeNames.app.baize-starry.name',
        description: '深蓝星空配金色主题',
        descKey: 'themeNames.app.baize-starry.description',
        titleBarGradient: 'linear-gradient(135deg, #0a1929 0%, #1a237e 50%, #283593 100%)',
        backgroundColor: '#0d1421',
        cardBackground: '#1a237e',
        textColor: '#e8e8e8',
        secondaryTextColor: '#b8b8b8',
        borderColor: '#2a3a5e',
        accentColor: '#ffd700',
        buttonBackground: '#ffd700',
        buttonTextColor: '#0a1929',
        hoverBackground: '#252e5e'
    },
    'baize-beast': {
        name: '白泽神兽',
        nameKey: 'themeNames.app.baize-beast.name',
        description: '紫粉渐变配白色神兽主题',
        descKey: 'themeNames.app.baize-beast.description',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        backgroundColor: '#f5f0fa',
        cardBackground: '#faf8ff',
        textColor: '#3d3d3d',
        secondaryTextColor: '#6d6d6d',
        borderColor: '#e0d8f0',
        accentColor: '#764ba2',
        buttonBackground: '#764ba2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f2e8f8'
    },
    'baize-clear': {
        name: '白泽清晰',
        nameKey: 'themeNames.app.baize-clear.name',
        description: '紫粉渐变配金色高对比主题',
        descKey: 'themeNames.app.baize-clear.description',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        backgroundColor: '#fffcf5',
        cardBackground: '#fffaf0',
        textColor: '#1a1a1a',
        secondaryTextColor: '#4a4a4a',
        borderColor: '#f0e8d8',
        accentColor: '#ffed4e',
        buttonBackground: '#764ba2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5f0ff'
    },
    'baize-data-light': {
        name: '白泽数据浅色',
        nameKey: 'themeNames.app.baize-data-light.name',
        description: '清新数据主题，青紫渐变，浅色背景',
        descKey: 'themeNames.app.baize-data-light.description',
        titleBarGradient: 'linear-gradient(135deg, #0EA5E9 0%, #8B5CF6 100%)',
        backgroundColor: '#F8FAFC',
        cardBackground: '#FFFFFF',
        textColor: '#1E293B',
        secondaryTextColor: '#64748B',
        borderColor: '#E2E8F0',
        accentColor: '#0EA5E9',
        buttonBackground: '#0EA5E9',
        buttonTextColor: '#FFFFFF',
        hoverBackground: '#F0F9FF'
    },
    'baize-mirror-light': {
        name: '白泽镜像浅色',
        nameKey: 'themeNames.app.baize-mirror-light.name',
        description: '科技镜像主题，透镜设计，纯净白色',
        descKey: 'themeNames.app.baize-mirror-light.description',
        titleBarGradient: 'linear-gradient(135deg, #8B5CF6 0%, #0EA5E9 100%)',
        backgroundColor: '#FFFFFF',
        cardBackground: '#F8FAFC',
        textColor: '#0F172A',
        secondaryTextColor: '#475569',
        borderColor: '#CBD5E1',
        accentColor: '#8B5CF6',
        buttonBackground: '#8B5CF6',
        buttonTextColor: '#FFFFFF',
        hoverBackground: '#F5F3FF'
    },
    'baize-data-dark': {
        name: '白泽数据深色',
        nameKey: 'themeNames.app.baize-data-dark.name',
        description: '数据科技主题，青紫光晕，深色背景',
        descKey: 'themeNames.app.baize-data-dark.description',
        titleBarGradient: 'linear-gradient(135deg, #00E0FF 0%, #6C5CE7 100%)',
        backgroundColor: '#020617',
        cardBackground: '#0F172A',
        textColor: '#E2E8F0',
        secondaryTextColor: '#94A3B8',
        borderColor: '#1E293B',
        accentColor: '#00E0FF',
        buttonBackground: '#00E0FF',
        buttonTextColor: '#020617',
        hoverBackground: '#1E293B'
    },
    'baize-mirror-dark': {
        name: '白泽镜像深色',
        nameKey: 'themeNames.app.baize-mirror-dark.name',
        description: '科技洞察主题，透镜光效，深邃夜空',
        descKey: 'themeNames.app.baize-mirror-dark.description',
        titleBarGradient: 'linear-gradient(135deg, #6C5CE7 0%, #00E0FF 100%)',
        backgroundColor: '#0B1120',
        cardBackground: '#111B33',
        textColor: '#F8FAFC',
        secondaryTextColor: '#CBD5E1',
        borderColor: '#1E3A5F',
        accentColor: '#6C5CE7',
        buttonBackground: '#6C5CE7',
        buttonTextColor: '#FFFFFF',
        hoverBackground: '#1E293B'
    }
}

/**
 * 安全创建 electron-store 实例（D-6/FUN-11，供 config 目录各配置文件复用）
 * 读取损坏时：把原文件改名备份为 <name>.json.corrupt-<时间戳>，再重建默认值。
 * @param name 存储文件名（不含扩展名）
 * @param defaults 默认值
 * @param filePath 配置文件完整路径（用于损坏备份）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron-store 的 Store<T> 约束为 Record<string, any>，接口类型（无索引签名）仅在 any 约束下满足（TS 对 Record<string, any> 有隐式索引签名特例），属第三方库类型边界
export function createConfigStoreSafely<T extends Record<string, any>>(
    name: string,
    defaults: T,
    filePath: string
): Store<T> {
    try {
        return createStore(name, defaults)
    } catch (err) {
        logger.error(`配置文件 ${name} 损坏，尝试备份并重建:`, err)
        try {
            if (fs.existsSync(filePath)) {
                const backupPath = `${filePath}.corrupt-${Date.now()}`
                fs.renameSync(filePath, backupPath)
                logger.warn(`损坏的配置文件已备份为: ${backupPath}`)
            }
        } catch (backupErr) {
            logger.error('备份损坏的配置文件失败:', backupErr)
        }
        return createStore(name, defaults)
    }
}

/**
 * ARC-12：共享配置模块工厂——把四个 config 模块（system-setting / theme-config /
 * editor-setting / quick-link-config）的初始化与更新策略收敛为同一实现：
 * - 创建：统一走 createConfigStoreSafely（损坏时备份重建，D-6/FUN-11）；
 * - 初始化：统一延迟初始化（需要立即建 store 的模块可自行调用 getStore()）；
 * - 更新：统一"浅合并"策略——只覆盖传入字段，绝不整体覆盖丢字段
 *   （修复 setTheme 历史缺陷：整体覆盖 themeConfig 会丢弃 separateEditorTheme/editorTheme）；
 * - 默认值：由 electron-store 的 defaults 注入 + 读取时兜底合并。
 *
 * @param options.name 存储文件名（不含扩展名）
 * @param options.filePath 配置文件完整路径（用于损坏备份）
 * @param options.defaults 默认值（整体形状）
 * @param options.storageKey 配置在 store 中的承载键；省略表示配置平铺在 store 根部
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 与 createConfigStoreSafely 相同的 electron-store 泛型约束边界
export function createSafeConfigModule<T extends Record<string, any>>(options: {
    name: string
    filePath: string
    defaults: T
    storageKey?: keyof T
}) {
    let store: Store<T> | null = null

    function getStore(): Store<T> {
        if (!store) {
            store = createConfigStoreSafely<T>(options.name, options.defaults, options.filePath)
        }
        return store
    }

    /** 读取完整配置（storageKey 模式读键值；平铺模式逐键合并默认值） */
    function getConfig(): T {
        const s = getStore()
        if (options.storageKey) {
            return (s.get(options.storageKey) ?? options.defaults[options.storageKey]) as T
        }
        const result: Record<string, unknown> = { ...options.defaults }
        // 注意：用闭包调用 s.get 保持 this 绑定
        const getField = (key: string): unknown => s.get(key as never)
        for (const key of Object.keys(options.defaults)) {
            const value = getField(key)
            if (value !== undefined) {
                result[key] = value
            }
        }
        return result as T
    }

    /** 合并写入配置：storageKey 模式在键内浅合并；平铺模式逐字段跳过 undefined */
    function updateConfig(partial: Partial<T>): void {
        const s = getStore()
        // 注意：必须用闭包调用 s.set（保持 this 绑定），不能把方法解构成裸函数
        const setField = (key: string, value: unknown): void => {
            s.set(key as never, value as never)
        }
        if (options.storageKey) {
            const key = options.storageKey as string
            const current = (s.get(key) ?? {}) as Record<string, unknown>
            setField(key, { ...current, ...(partial[key] as Record<string, unknown>) })
            return
        }
        for (const key of Object.keys(partial)) {
            const value = (partial as Record<string, unknown>)[key]
            if (value !== undefined) {
                setField(key, value)
            }
        }
    }

    return { getStore, getConfig, updateConfig }
}

// 存储结构：theme-config.json 在 themeConfig 键下承载主题配置
// 第 2 批：本接口原先在文件中重复定义两次（createConfigStoreSafely 前一处零引用副本），
// 已合并为唯一一处，供下方 themeModule 泛型使用。
interface ThemeStoreShape {
    themeConfig: ThemeConfig
}

// ARC-12：主题模块经共享工厂创建（延迟初始化 + 浅合并更新）
const themeModule = createSafeConfigModule<ThemeStoreShape>({
    name: 'theme-config',
    filePath: path.join(getUserDataPath(), 'config', 'theme-config.json'),
    defaults: {
        themeConfig: {
            currentTheme: 'baize',
            separateEditorTheme: false,
            editorTheme: 'vs'
        }
    },
    storageKey: 'themeConfig'
})

function getStore(): Store<ThemeStoreShape> {
    return themeModule.getStore()
}

/**
 * 全部应用主题（28 项，顺序即 `themes` 注册表定义顺序）。
 * 第 2 批：返回类型改用 shared 的 `ThemeListResult`（= ThemeListItem[]），
 * 与 IPC.THEME.GET_ALL_THEMES 的响应契约同一真源。
 */
export function getAllThemes(): ThemeListResult {
    return Object.entries(themes).map(([type, styles]) => ({
        type: type as ThemeType,
        styles
    }))
}

/** 默认回退主题（AS-4：存储中出现非法主题值时的兜底） */
export const DEFAULT_THEME_TYPE: ThemeType = 'baize'

/**
 * AS-4：是否为已知主题类型（currentTheme 枚举校验 + 存储值兜底的单一真源）。
 */
export function isKnownThemeType(value: unknown): value is ThemeType {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(themes, value)
}

/**
 * AS-4：把任意输入收敛为已知主题类型；未知值回退默认主题 'baize'。
 * 用于兜底历史损坏配置（如手工改坏 theme-config.json、旧版本写入非法值），
 * 避免 getCurrentThemeStyles() 返回 undefined 后在 HTML 对话框模板中抛 TypeError。
 */
export function normalizeThemeType(value: unknown): ThemeType {
    return isKnownThemeType(value) ? value : DEFAULT_THEME_TYPE
}

export function getCurrentTheme(): ThemeType {
    const s = getStore()
    const config = s.get('themeConfig')
    return normalizeThemeType(config?.currentTheme)
}

export function getCurrentThemeStyles(): ThemeStyles {
    return themes[getCurrentTheme()]
}

export function getThemeStylesByType(themeType: ThemeType): ThemeStyles {
    return themes[normalizeThemeType(themeType)]
}

/**
 * ARC-04：读取完整主题配置（渲染层 'theme' 配置经 config:read 路由到本函数，
 * 与主进程 store 同源）。
 */
export function getThemeConfig(): ThemeConfig {
    const s = getStore()
    return s.get('themeConfig')
}

/**
 * ARC-04：合并写入主题配置（渲染层 'theme' 配置经 config:write 路由到本函数）。
 * 只覆盖传入字段，保留 separateEditorTheme/editorTheme 等未传字段。
 */
export function setThemeConfig(partial: Partial<ThemeConfig>): void {
    // CQ-15：themeModule.updateConfig 的入参是 ThemeStoreShape 的递归 Partial，而
    // ThemeConfig 是"业务视图类型"（字段更宽/含派生项）；双重断言仅用于跨这两套
    // 类型声明，updateConfig 内部按字段浅合并，不会整体替换 store 结构。
    themeModule.updateConfig({ themeConfig: partial } as unknown as Partial<ThemeStoreShape>)
}

export function setTheme(theme: ThemeType): void {
    setThemeConfig({ currentTheme: theme })
}

export type { MonacoThemeConfig }

/**
 * 全部 Monaco 编辑器主题（内置 3 套 + 磁盘动态主题）。
 * 第 2 批：返回类型改用 shared 的 `MonacoThemeListItem[]`，
 * 与 IPC.THEME.GET_ALL_MONACO_THEMES 的响应契约同一真源；实现委托 theme-registry。
 */
export function getAllMonacoThemes(): MonacoThemeListItem[] {
    return registryGetAllMonacoThemes()
}

export function getSeparateEditorTheme(): boolean {
    const s = getStore()
    const config = s.get('themeConfig')
    return config.separateEditorTheme || false
}

export function setSeparateEditorTheme(separate: boolean): void {
    setThemeConfig({ separateEditorTheme: separate })
}

export function getMonacoTheme(): MonacoThemeType {
    const s = getStore()
    const config = s.get('themeConfig')
    return config.editorTheme || 'vs'
}

export function setMonacoTheme(theme: MonacoThemeType): void {
    setThemeConfig({ editorTheme: theme })
}
