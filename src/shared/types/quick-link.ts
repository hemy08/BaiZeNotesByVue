/**
 * 快速链接类型（ARC-13：主进程 / 渲染层唯一真源）
 *
 * 收敛前 QuickLinkItem / QuickLinkConfig 定义在 src/main/config/quick-link-config.ts，
 * 渲染层 NaviTab.vue 又各自复制了一份完全相同的 QuickLinkItem；现统一到本文件：
 * - 主进程 quick-link-config.ts 以 `import type` 引用并 re-export，
 *   config/index 与单测等既有 `from '../config/quick-link-config'` 路径不变
 *   （P2 起主进程 HTML 快速链接对话框 ShowQuickLinkSettingDialog 已删除，
 *   渲染层 QuickLinkSettingDialog.vue 经 window.api.config 读写 quickLinks）；
 * - 渲染层 NaviTab.vue 改为从 src/shared/types import type。
 */
export interface QuickLinkItem {
    id: string
    name: string
    type: 'url' | 'exe' // url: 网页链接, exe: 本地程序
    path: string // URL地址或本地程序路径
    icon: string // 图标类型: 'svg' | 'img' | 'emoji' | 'text'
    iconContent: string // SVG代码、图片URL、emoji或文字(1-2个字符)
    enabled: boolean // 是否启用
    order: number // 排序
    position: 'left' | 'right' // 显示位置: left=左侧NaviTab, right=右侧NaviTab
}

/** 快速链接配置（主进程 quick-link-config.json 的 quickLinks 键结构） */
export interface QuickLinkConfig {
    links: QuickLinkItem[]
}
