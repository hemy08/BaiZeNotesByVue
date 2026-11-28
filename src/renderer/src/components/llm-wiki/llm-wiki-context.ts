/**
 * LLM Wiki 工作台「编辑器上下文」共享状态。
 *
 * ## 背景（1.5.7 LLM Wiki L5）
 * 右侧 AI 面板的「上下文引用 chips」需要展示当前文档名与（未来的）选中文本。
 * 这些信息由编辑器编排层（`components/Markdown/MarkdownEditComponent.vue`）在既有
 * `IPC.FILE.USER_SELECT_FILE` 监听里维护，AI 面板经 props 消费——本条链路**不新增 IPC、
 * 不改变既有文件打开契约**，只是把渲染层已经拿到的活动文件路径同步到 UI 状态。
 *
 * ## 边界
 * - 纯渲染层 UI 状态，不持久化、不写配置、不参与业务判定；
 * - L3 批次接入流式 AI 时，选中文本可由编辑器侧调用 `setLlmWikiSelectionText` 更新；
 *   本批次仅预留接口（无来源时 AI 面板显示无选区空态）。
 */
import { reactive } from 'vue'

/** 编辑器上下文（AI 面板上下文 chips 的数据源） */
export interface LlmWikiEditorContextState {
    /** 当前活动文件绝对路径（空 = 未打开文件） */
    documentPath: string
    /** 当前活动文件名（由路径派生，仅用于展示） */
    documentName: string
    /** 当前选中的文本（空 = 无选区；L3 批次接入编辑器选区同步） */
    selectionText: string
}

/** 运行时上下文单例（组件只读消费，写入统一走本模块函数） */
export const llmWikiEditorContext = reactive<LlmWikiEditorContextState>({
    documentPath: '',
    documentName: '',
    selectionText: ''
})

/**
 * 从文件路径派生展示用文件名（同时兼容 Windows `\` 与 POSIX `/`）。
 * 末尾分隔符会被忽略；空路径返回空串。
 */
export function resolveDocumentName(path: string): string {
    if (typeof path !== 'string') {
        return ''
    }
    const trimmed = path.replace(/[\\/]+$/, '')
    if (trimmed.length === 0) {
        return ''
    }
    const segments = trimmed.split(/[\\/]/)
    return segments[segments.length - 1] ?? ''
}

/** 更新当前活动文档（非字符串输入按「无活动文件」处理） */
export function setLlmWikiActiveDocument(path: unknown): void {
    const nextPath = typeof path === 'string' ? path : ''
    if (nextPath === llmWikiEditorContext.documentPath) {
        return
    }
    llmWikiEditorContext.documentPath = nextPath
    llmWikiEditorContext.documentName = resolveDocumentName(nextPath)
}

/** 更新当前选中文本（空串/非字符串 = 无选区） */
export function setLlmWikiSelectionText(text: unknown): void {
    const nextText = typeof text === 'string' ? text : ''
    if (nextText === llmWikiEditorContext.selectionText) {
        return
    }
    llmWikiEditorContext.selectionText = nextText
}

/** 仅供单元测试：重置上下文状态 */
export function resetLlmWikiEditorContextForTesting(): void {
    llmWikiEditorContext.documentPath = ''
    llmWikiEditorContext.documentName = ''
    llmWikiEditorContext.selectionText = ''
}
