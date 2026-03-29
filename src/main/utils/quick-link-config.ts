/**
 * 快速链接配置管理模块
 * 用于管理NaviTab中的快速链接配置
 */

// @ts-ignore
import Store from 'electron-store'

// 快速链接项接口
export interface QuickLinkItem {
    id: string
    name: string
    type: 'url' | 'exe' // url: 网页链接, exe: 本地程序
    path: string // URL地址或本地程序路径
    icon: string // 图标类型: 'svg' | 'img' | 'emoji' | 'text'
    iconContent: string // SVG代码、图片URL、emoji或文字(1-2个字符)
    enabled: boolean // 是否启用
    order: number // 排序
}

// 快速链接配置接口
export interface QuickLinkConfig {
    links: QuickLinkItem[]
}

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
        order: 1
    },
    {
        id: 'wenxin',
        name: '文心一言',
        type: 'url',
        path: 'https://yiyan.baidu.com/',
        icon: 'text',
        iconContent: '文',
        enabled: true,
        order: 2
    },
    {
        id: 'chatgpt',
        name: 'ChatGPT',
        type: 'url',
        path: 'https://chat.openai.com/',
        icon: 'text',
        iconContent: 'AI',
        enabled: true,
        order: 3
    }
]

// 创建存储实例
// @ts-ignore
const store = new Store()

// 初始化默认配置
// @ts-ignore
if (!store.has('quickLinks')) {
    // @ts-ignore
    store.set('quickLinks', {
        links: defaultQuickLinks
    })
}

/**
 * 获取快速链接配置
 */
export function getQuickLinks(): QuickLinkItem[] {
    // @ts-ignore
    const config = store.get('quickLinks') as QuickLinkConfig
    return config.links.sort((a, b) => a.order - b.order)
}

/**
 * 保存快速链接配置
 */
export function saveQuickLinks(links: QuickLinkItem[]): void {
    // @ts-ignore
    store.set('quickLinks', { links })
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
