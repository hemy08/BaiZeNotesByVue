/**
 * B2/B1/B4 知识库查询对话框状态与纯查询辅助（1.5.1 本地知识库基座，2026-11-21）
 *
 * 与 A3 文档历史 / A4 Markdown lint / P0-8 写作风格检查同构：
 * 对话框由 `knowledge/index.ts` 的 `openKnowledgeDialog(mode)` 在独立 Vue 应用实例中
 * 挂载，显隐与当前查询视图（标签 / 链接问题 / 反向链接）放在模块单例里，供宿主与
 * 对话框共同消费（避免宿主 / 组件双向 prop 传递）。
 *
 * 边界：
 * - 本模块只依赖 Vue 的 reactive 与 `shared/types` 纯类型，不涉及 IPC / DOM / 日志，
 *   便于单测直接断言纯函数；
 * - 数据真源仍是主进程工作区索引快照（`FILE.GET_WORKSPACE_INDEX`），这里只做
 *   「快照 → 展示结构」的无副作用转换，不读磁盘、不重复解析 Markdown。
 */
import { reactive } from 'vue'
import type {
    WorkspaceIndexLinkIssue,
    WorkspaceIndexSnapshot
} from '../../../../../shared/types/workspace-index'

/** 知识库查询视图：标签（B2）/ 缺失与歧义链接（B1）/ 反向链接（B4） */
export type KnowledgeDialogMode = 'tags' | 'links' | 'backlinks'

/** 全部合法视图（稳定顺序，供入口校验与测试遍历） */
export const KNOWLEDGE_DIALOG_MODES: readonly KnowledgeDialogMode[] = ['tags', 'links', 'backlinks']

/** 知识库查询对话框状态 */
export interface KnowledgeDialogState {
    /** 显隐（由 openKnowledgeDialogState / closeKnowledgeDialogState 驱动） */
    visible: boolean
    /** 当前查询视图（打开入口传入；未知值归一化为 tags） */
    mode: KnowledgeDialogMode
}

/** 模块单例状态（对话框只读渲染，写操作走下方函数） */
export const knowledgeDialogState = reactive<KnowledgeDialogState>({
    visible: false,
    mode: 'tags'
})

/** 类型守卫：外部（菜单动作 / 命令面板）传入的字符串是否为合法视图 */
export function isKnowledgeDialogMode(value: unknown): value is KnowledgeDialogMode {
    return (
        typeof value === 'string' && (KNOWLEDGE_DIALOG_MODES as readonly string[]).includes(value)
    )
}

/** 打开知识库查询对话框（只切状态；宿主挂载由入口 index.ts 负责） */
export function openKnowledgeDialogState(mode: KnowledgeDialogMode): void {
    if (isKnowledgeDialogMode(mode)) {
        knowledgeDialogState.mode = mode
    }
    knowledgeDialogState.visible = true
}

/** 切换查询视图（对话框打开期间由入口/后续 UI 调用；不改变显隐） */
export function setKnowledgeDialogMode(mode: KnowledgeDialogMode): void {
    if (isKnowledgeDialogMode(mode)) {
        knowledgeDialogState.mode = mode
    }
}

/** 关闭知识库查询对话框（只切显隐，不销毁宿主） */
export function closeKnowledgeDialogState(): void {
    knowledgeDialogState.visible = false
}

/**
 * 从索引快照构建「缺失 / 歧义链接」展示清单（B1）。
 *
 * 数据来源优先级：
 * 1. 逐文件的 `links` 中 `status === 'missing' | 'ambiguous'` 的条目（含歧义，信息最全）；
 * 2. 旧版快照只提供 `missingLinks` 时，退化为按 missing 展示（防御主进程旧结构）。
 *
 * 顺序与快照确定：文件遍历顺序 + 文件内链接出现顺序；纯函数，不修改入参。
 */
export function buildKnowledgeLinkIssues(
    snapshot: WorkspaceIndexSnapshot | null
): WorkspaceIndexLinkIssue[] {
    if (snapshot === null) {
        return []
    }
    const issues: WorkspaceIndexLinkIssue[] = []
    for (const file of snapshot.files) {
        const links = Array.isArray(file.links) ? file.links : []
        for (const link of links) {
            if (link.status !== 'missing' && link.status !== 'ambiguous') {
                continue
            }
            issues.push({
                sourcePath: file.path,
                sourceRelativePath: file.relativePath,
                target: link.target,
                line: link.line,
                column: link.column,
                status: link.status
            })
        }
    }
    if (issues.length > 0 || !Array.isArray(snapshot.missingLinks)) {
        return issues
    }
    // 旧版快照兼容：files[].links 未携带问题时，用独立的 missingLinks 清单兜底
    return snapshot.missingLinks.map((missing) => ({
        sourcePath: missing.sourcePath,
        sourceRelativePath: missing.sourceRelativePath,
        target: missing.target,
        line: missing.line,
        column: missing.column,
        status: 'missing' as const
    }))
}
