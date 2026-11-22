/**
 * B1 Wiki 链接动作对话框状态与展示辅助（1.5.1 本地知识库基座，2026-11-22）
 *
 * 与 A3 文档历史 / A4 Markdown lint / B2 知识库查询同构：对话框由宿主入口
 * `wiki-link-actions.index.ts` 在独立 Vue 应用实例中挂载，显隐与当前请求（歧义候选 /
 * 缺失页创建计划 / 创建被阻止 / 动作错误）放在模块单例里，供宿主与对话框共同消费
 * （避免宿主 / 组件双向 prop 传递）。
 *
 * 边界：
 * - 本模块只依赖 Vue 的 reactive 与 `wiki-link-actions.ts` 的纯类型，不涉及 IPC / DOM，
 *   纯展示辅助函数可直接单测；
 * - 所有候选与计划数据均来自 `wiki-link-actions.ts`（索引快照派生），这里不做路径判断、
 *   不读磁盘、不重复解析 Markdown。
 */
import { reactive } from 'vue'
import type {
    WikiLinkCandidate,
    WikiLinkCreateRejectReason,
    WikiLinkCreationPlan
} from './wiki-link-actions'

/** 对话框形态：歧义选择 / 缺失确认 / 创建被阻止 / 动作错误 */
export type WikiLinkActionDialogKind = 'ambiguous' | 'missing' | 'blocked' | 'error'

/** 对话框失败原因（与创建拒绝原因共用一部分；UI 据此映射中文兜底文案） */
export type WikiLinkActionDialogReason =
    WikiLinkCreateRejectReason | 'no-workspace' | 'index-error' | 'open-failed'

/** 一次对话框请求的完整数据（宿主写入，对话框只读渲染） */
export interface WikiLinkActionDialogRequest {
    /** 对话框形态 */
    kind: WikiLinkActionDialogKind
    /** 链接原文（含 `[[` `]]`，用于回显） */
    raw: string
    /** 清洗后的链接目标 */
    target: string
    /** 链接所在行（1-based） */
    line: number
    /** 链接所在列（1-based） */
    column: number
    /** 歧义候选（kind=ambiguous；按索引解析顺序） */
    candidates?: WikiLinkCandidate[]
    /** 缺失页创建计划（kind=missing） */
    plan?: WikiLinkCreationPlan
    /** 失败/阻止原因（kind=blocked|error） */
    reason?: WikiLinkActionDialogReason
    /** 缺失的目标目录相对路径（reason=directory-missing） */
    missingDirectory?: string
    /** 已存在的目标文件路径（reason=already-exists） */
    existingFilePath?: string
    /** 补充错误信息（kind=error；如主进程异常 message） */
    message?: string
}

/** 对话框状态（模块单例；写操作统一走下方函数） */
export interface WikiLinkActionDialogState {
    /** 显隐（由 open/close 驱动） */
    visible: boolean
    /** 当前请求（关闭后清空） */
    request: WikiLinkActionDialogRequest | null
    /** 是否有 IPC 动作进行中（创建/打开期间禁用按钮，防重复提交） */
    busy: boolean
    /** 当前请求内的错误提示（空串 = 无错误） */
    error: string
}

/** 候选展示项（标题 + 相对路径；相对路径用于区分同名文件） */
export interface WikiLinkCandidateDisplayItem {
    /** 文件绝对路径（点击打开时传回） */
    path: string
    /** 展示标题（缺失时回退相对路径） */
    title: string
    /** 相对工作区根的展示路径 */
    relativePath: string
}

/** 模块单例状态（对话框只读渲染，写操作走下方函数） */
export const wikiLinkActionDialogState = reactive<WikiLinkActionDialogState>({
    visible: false,
    request: null,
    busy: false,
    error: ''
})

/** 打开对话框并重置临时状态（busy/error 归零，避免上一次请求残留） */
export function openWikiLinkActionDialogState(request: WikiLinkActionDialogRequest): void {
    wikiLinkActionDialogState.request = request
    wikiLinkActionDialogState.busy = false
    wikiLinkActionDialogState.error = ''
    wikiLinkActionDialogState.visible = true
}

/** 关闭对话框（只切显隐并清空请求；宿主不销毁） */
export function closeWikiLinkActionDialogState(): void {
    wikiLinkActionDialogState.visible = false
    wikiLinkActionDialogState.request = null
    wikiLinkActionDialogState.busy = false
    wikiLinkActionDialogState.error = ''
}

/** 设置 busy（创建/打开进行中，防重复点击） */
export function setWikiLinkActionDialogBusy(busy: boolean): void {
    wikiLinkActionDialogState.busy = busy === true
}

/** 设置当前请求内的错误提示（空串清除） */
export function setWikiLinkActionDialogError(error: string): void {
    wikiLinkActionDialogState.error = typeof error === 'string' ? error : ''
}

/**
 * 把解析候选转换为对话框展示项。
 *
 * - 过滤非法/空路径项；
 * - 按绝对路径（大小写不敏感）去重，保持索引顺序；
 * - 标题缺失时回退相对路径，保证每行都有可读文案；
 * - 相对路径统一 `/` 分隔（与工作区索引展示口径一致）。
 *
 * @param candidates 解析候选（可为空/undefined）
 * @returns 可直接渲染的展示项（不修改入参）
 */
export function buildWikiLinkCandidateItems(
    candidates: readonly WikiLinkCandidate[] | null | undefined
): WikiLinkCandidateDisplayItem[] {
    if (!Array.isArray(candidates)) {
        return []
    }
    const seen = new Set<string>()
    const items: WikiLinkCandidateDisplayItem[] = []
    for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') {
            continue
        }
        const path = typeof candidate.path === 'string' ? candidate.path : ''
        if (path.length === 0) {
            continue
        }
        const key = path.replace(/\\/g, '/').toLowerCase()
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        const relativePath =
            typeof candidate.relativePath === 'string'
                ? candidate.relativePath.replace(/\\/g, '/')
                : ''
        const title =
            typeof candidate.title === 'string' && candidate.title.length > 0
                ? candidate.title
                : relativePath
        items.push({ path, title, relativePath })
    }
    return items
}
