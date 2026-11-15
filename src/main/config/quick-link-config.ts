/**
 * 快速链接配置管理模块
 * 用于管理NaviTab中的快速链接配置
 *
 * ARC-12：经 theme-config 导出的 createSafeConfigModule 工厂创建
 * （storageKey 模式：配置承载于 quick-link-config.json 的 quickLinks 键下）。
 */

import Store from 'electron-store'
import * as path from 'path'
import { getUserDataPath } from '../utils/app-paths'
import { createSafeConfigModule } from './theme-config'
// ARC-13：QuickLinkItem / QuickLinkConfig 已收敛到 src/shared/types/quick-link.ts（唯一真源），
// 此处仅 import type
import type { QuickLinkConfig, QuickLinkItem } from '../../shared/types'

// ARC-13：re-export 保持既有引用路径（config/index.ts、单测等）不变
// （P2：主进程 HTML 快速链接设置对话框 ShowQuickLinkSettingDialog 已删除，
// 渲染层 QuickLinkSettingDialog.vue 经 window.api.config 读写 quickLinks）
export type { QuickLinkConfig, QuickLinkItem }

// 默认快速链接配置
const defaultQuickLinks: QuickLinkItem[] = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        type: 'url',
        path: 'https://chat.deepseek.com/',
        icon: 'text',
        iconContent: 'DS',
        enabled: true,
        order: 1,
        position: 'left'
    },
    {
        id: 'wenxin',
        name: '文心一言',
        type: 'url',
        path: 'https://yiyan.baidu.com/',
        icon: 'text',
        iconContent: '文',
        enabled: true,
        order: 2,
        position: 'left'
    },
    {
        id: 'chatgpt',
        name: 'ChatGPT',
        type: 'url',
        path: 'https://chat.openai.com/',
        icon: 'text',
        iconContent: 'AI',
        enabled: true,
        order: 3,
        position: 'left'
    }
]

// 存储结构（ARC-04：rendererQuickLinks 承载渲染层 QuickLinkSettingDialog 历史
// 写入的 'quickLinks'/'quick-links' JSON——渲染层形状 {name,url,icon,description}，
// 与主进程 NaviTab 使用的 QuickLinkItem 形状并存于同一文件，互不覆盖）
interface QuickLinkStoreShape {
    quickLinks: QuickLinkConfig
    rendererQuickLinks?: Record<string, unknown>
}

// 渲染层快速链接项形状（QuickLinkSettingDialog 的 Link 类型）
export interface RendererQuickLink {
    name: string
    url: string
    icon: string
    description: string
}

// ============ P1-FE-04：快速链接设置数据源统一 ============
// 渲染层设置对话框改为经 IPC.QUICK_LINKS.SAVE 提交 QuickLinkItem 形状，
// 由主进程归一化/校验后写入 quickLinks 键（与 NaviTab 读取同源），
// 避免历史 rendererQuickLinks 与 quickLinks 两套形状并存、互不消费。

/** 单次保存允许的最大快捷链接数（防异常 payload 造成无界渲染/存储增长） */
const MAX_QUICK_LINKS = 50
/** 单个图标内容最大字符数（svg 标记/图片 URL 均在渲染层经 v-html/属性绑定使用） */
const MAX_ICON_CONTENT_LENGTH = 4096
/** QuickLinkItem.icon 约定的四种渲染分支 */
const QUICK_LINK_ICON_TYPES: readonly string[] = ['svg', 'img', 'emoji', 'text']

/** 归一化字符串字段：非字符串返回空串并去除首尾空白 */
function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

/**
 * 按图标内容推断渲染分支（设置对话框只提供 1~2 字符图标输入，
 * 标记/图片 URL/emoji/文字分别映射到 svg / img / emoji / text）。
 */
export function inferQuickLinkIconType(iconContent: string): QuickLinkItem['icon'] {
    const content = iconContent.trim()
    if (content === '') {
        return 'text'
    }
    if (/^<svg[\s>]/i.test(content)) {
        return 'svg'
    }
    if (
        /^(https?:|data:image\/|file:|\.{0,2}[\\/])/i.test(content) ||
        /\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(content)
    ) {
        return 'img'
    }
    // ASCII 短文本用渐变文字图标（text），含非 ASCII（emoji/中文）走 emoji 分支
    return /^[\x20-\x7E]{1,2}$/.test(content) ? 'text' : 'emoji'
}

/**
 * P1-FE-04：把渲染层提交的快捷链接 payload 归一化为 QuickLinkItem[]。
 *
 * 行为约定：
 * - 入参不是数组、或条数超过 MAX_QUICK_LINKS → 返回 null（由调用方返回错误对象）；
 * - 单个条目缺 name/path → 静默丢弃（与渲染层「名称/URL 必填」的表单校验一致）；
 * - id 缺失时按序号生成并去重（保证 NaviTab 的 v-for key 唯一）；
 * - order 按最终顺序重排，type/position 收敛到枚举值，enabled 缺省为 true；
 * - icon 非法时按 iconContent 推断，保证渲染分支可用。
 */
export function normalizeQuickLinkItems(input: unknown): QuickLinkItem[] | null {
    if (!Array.isArray(input) || input.length > MAX_QUICK_LINKS) {
        return null
    }
    const usedIds = new Set<string>()
    const normalized: QuickLinkItem[] = []
    for (const raw of input) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
            continue
        }
        const item = raw as Record<string, unknown>
        const name = normalizeText(item.name)
        const path = normalizeText(item.path)
        if (name === '' || path === '') {
            continue
        }
        const iconContent = normalizeText(item.iconContent).slice(0, MAX_ICON_CONTENT_LENGTH)
        const icon =
            typeof item.icon === 'string' && QUICK_LINK_ICON_TYPES.includes(item.icon)
                ? item.icon
                : inferQuickLinkIconType(iconContent)
        const baseId = normalizeText(item.id) || `quick-link-${normalized.length + 1}`
        let id = baseId
        let suffix = 2
        while (usedIds.has(id)) {
            id = `${baseId}-${suffix}`
            suffix += 1
        }
        usedIds.add(id)
        normalized.push({
            id,
            name,
            type: item.type === 'exe' ? 'exe' : 'url',
            path,
            icon,
            iconContent,
            enabled: item.enabled !== false,
            order: normalized.length + 1,
            position: item.position === 'right' ? 'right' : 'left'
        })
    }
    return normalized
}

// ARC-12：经共享工厂创建（延迟初始化 + 浅合并更新 + 损坏容错）
const quickLinkModule = createSafeConfigModule<QuickLinkStoreShape>({
    name: 'quick-link-config',
    filePath: path.join(getUserDataPath(), 'config', 'quick-link-config.json'),
    defaults: {
        quickLinks: {
            links: defaultQuickLinks
        }
    },
    storageKey: 'quickLinks'
})

// 获取存储实例（D-6/FUN-11：损坏时备份重建）
function getStore(): Store<QuickLinkStoreShape> {
    return quickLinkModule.getStore()
}

/**
 * 获取快速链接配置
 */
export function getQuickLinks(): QuickLinkItem[] {
    const s = getStore()
    const config = s.get('quickLinks') ?? { links: defaultQuickLinks }
    // 兼容旧数据：为没有 position 字段的链接添加默认值
    const links = config.links.map((link) => ({
        ...link,
        position: link.position || 'left'
    }))
    return links.sort((a, b) => a.order - b.order)
}

/**
 * 保存快速链接配置
 */
export function saveQuickLinks(links: QuickLinkItem[]): void {
    const s = getStore()
    s.set('quickLinks', { links })
}

/**
 * 添加快速链接
 */
export function addQuickLink(link: QuickLinkItem): void {
    const links = getQuickLinks()
    link.order = links.length + 1
    links.push(link)
    saveQuickLinks(links)
}

/**
 * 更新快速链接
 */
export function updateQuickLink(link: QuickLinkItem): void {
    const links = getQuickLinks()
    const index = links.findIndex((l) => l.id === link.id)
    if (index !== -1) {
        links[index] = link
        saveQuickLinks(links)
    }
}

/**
 * 删除快速链接
 */
export function deleteQuickLink(id: string): void {
    const links = getQuickLinks()
    const filteredLinks = links.filter((l) => l.id !== id)
    // 重新排序
    filteredLinks.forEach((link, index) => {
        link.order = index + 1
    })
    saveQuickLinks(filteredLinks)
}

/**
 * 重置为默认配置
 */
export function resetToDefault(): void {
    saveQuickLinks(defaultQuickLinks)
}

/**
 * ARC-04：读取渲染层快速链接配置（'quick-links'/'quickLinks' 配置经
 * config:read 路由到本函数，形状为渲染层 QuickLinkSettingDialog 的 links 数组）。
 */
export function getRendererQuickLinks(): RendererQuickLink[] | null {
    const s = getStore()
    const value = s.get('rendererQuickLinks')
    if (Array.isArray(value)) {
        return value as RendererQuickLink[]
    }
    if (
        value &&
        typeof value === 'object' &&
        Array.isArray((value as { links?: unknown[] }).links)
    ) {
        return (value as { links: RendererQuickLink[] }).links
    }
    return null
}

/**
 * ARC-04：写入渲染层快速链接配置（'quick-links'/'quickLinks' 配置经
 * config:write 路由到本函数；入参可能是 links 数组或 { links: [...] } 包裹）。
 */
export function saveRendererQuickLinks(data: unknown): void {
    const s = getStore()
    const normalized: Record<string, unknown> = Array.isArray(data)
        ? { links: data }
        : (data as Record<string, unknown>)
    s.set('rendererQuickLinks', normalized)
}
