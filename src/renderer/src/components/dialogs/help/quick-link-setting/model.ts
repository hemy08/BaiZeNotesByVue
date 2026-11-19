/**
 * 快捷链接设置对话框 —— 数据模型 / 默认值 / 主进程项与对话框项的双向转换
 * （设置对话框二期拆分：从 QuickLinkSettingDialog.vue 抽出的纯数据与纯函数）
 *
 * 与 DOM / 响应式状态无关的部分全部收敛到本文件：
 * - 对话框可编辑项 `Link`（保留主进程原始项 `source`，保存时原样回写不可编辑字段）；
 * - 主进程读取失败时的兜底展示清单 `DEFAULT_LINKS`；
 * - `QuickLinkItem`（主进程唯一数据源）⇄ `Link`（对话框草稿）转换；
 * - IPC 返回值形状守卫 `isQuickLinkItem`。
 *
 * 响应式草稿 / 读写编排见 `./useQuickLinkSettingForm.ts`，列表与表单子组件见
 * 同目录 QuickLinkList.vue / QuickLinkForm.vue。
 */
import type { QuickLinkItem } from '../../../../../../shared/types'
import { t } from '../../../../common/i18n'

/** 对话框内可编辑的链接项 */
export interface Link {
    name: string
    url: string
    icon: string
    description: string
    /**
     * P1-FE-04：从主进程加载的原始 QuickLinkItem。
     * 保留对话框不可编辑的 id/enabled/position 以及 svg/img 图标类型，
     * 保存时未改动的字段原样回写，避免往返丢失。
     */
    source?: QuickLinkItem
}

/** 表单提交载荷（QuickLinkForm → 壳层 composable） */
export type QuickLinkDraft = Pick<Link, 'name' | 'url' | 'icon' | 'description'>

// 主进程读取失败时的兜底展示（正常情况下会被主进程 quickLinks 覆盖）
export const DEFAULT_LINKS: Link[] = [
    {
        name: 'GitHub',
        url: 'https://github.com',
        icon: '🐙',
        description: t('dialogRenderer.quickLink.defaultGitHubDesc')
    },
    {
        name: 'Google',
        url: 'https://google.com',
        icon: '🔍',
        description: t('dialogRenderer.quickLink.defaultGoogleDesc')
    },
    {
        name: 'Stack Overflow',
        url: 'https://stackoverflow.com',
        icon: '📚',
        description: t('dialogRenderer.quickLink.defaultStackOverflowDesc')
    }
]

/** 深拷贝链接清单（隔离壳层草稿与初始快照 / emit 载荷） */
export function cloneLinks(list: Link[]): Link[] {
    return JSON.parse(JSON.stringify(list)) as Link[]
}

/** 主进程 QuickLinkItem 在对话框内的展示图标（svg/img 无法在 2 字符输入框内编辑，用通用图标占位） */
export function getDisplayIcon(item: QuickLinkItem): string {
    return item.icon === 'svg' || item.icon === 'img' ? '🔗' : item.iconContent
}

/** 主进程 QuickLinkItem → 对话框 Link */
export function toDialogLink(item: QuickLinkItem): Link {
    return {
        name: item.name,
        url: item.path,
        icon: getDisplayIcon(item),
        description: '',
        source: item
    }
}

/** 主进程返回值形状校验（IPC 返回 unknown，防御异常数据） */
export function isQuickLinkItem(value: unknown): value is QuickLinkItem {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof (value as QuickLinkItem).name === 'string' &&
        typeof (value as QuickLinkItem).path === 'string'
    )
}

/** 对话框 Link → 主进程 QuickLinkItem（source 未改动时保留 id/enabled/position/原始图标） */
export function toQuickLinkItem(link: Link, index: number): QuickLinkItem {
    const source = link.source
    const samePath = source !== undefined && source.path === link.url
    const iconUnchanged = source !== undefined && samePath && getDisplayIcon(source) === link.icon
    return {
        id: source?.id || `quick-link-${index + 1}`,
        name: link.name,
        type: samePath ? source.type : 'url',
        path: link.url,
        // 'auto' 不是主进程图标白名单值：主进程按 iconContent 推断实际渲染分支（svg/img/emoji/text）
        icon: iconUnchanged ? source.icon : 'auto',
        iconContent: iconUnchanged ? source.iconContent : link.icon,
        enabled: source?.enabled ?? true,
        order: index + 1,
        position: source?.position ?? 'left'
    }
}
