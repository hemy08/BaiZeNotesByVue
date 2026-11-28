/**
 * LLM Wiki 工作台 UI 状态（编辑区「编辑器 / 预览」tab、右侧 AI 面板折叠）。
 *
 * ## 背景（1.5.7 LLM Wiki L5）
 * `workspaceMode === 'llm-wiki'` 时工作台采用「左侧单栏编辑区 + 右侧 AI 面板」布局：
 * - 编辑区内部用 tab 在 Monaco 编辑器与 Markdown 预览之间切换（`v-show` 保留两实例状态）；
 * - 右侧 AI 面板可在窄窗口下折叠为 48px 侧栏。
 *
 * ## 边界
 * - 只存 UI 状态，不触达笔记内容、不新增 IPC、不写系统配置；
 * - localStorage 容错读取：键缺失/损坏/隐私模式不可用时回落默认值，绝不抛错；
 * - 状态为模块单例（与 `untitled-draft` / `workspace-layout` 等渲染层 UI 状态同口径）。
 */
import { reactive } from 'vue'

/** 编辑区 tab 标识 */
export type LlmWikiEditorTab = 'editor' | 'preview'

/** 编辑区 tab 的合法取值（枚举唯一真源；组件与测试共用） */
export const LLM_WIKI_EDITOR_TAB = {
    EDITOR: 'editor',
    PREVIEW: 'preview'
} as const satisfies Record<string, LlmWikiEditorTab>

/** 默认 tab：编辑器（用户进入 LLM Wiki 模式后先看到可编辑内容） */
export const DEFAULT_LLM_WIKI_EDITOR_TAB: LlmWikiEditorTab = LLM_WIKI_EDITOR_TAB.EDITOR

/** localStorage 键（版本化，便于以后清理不兼容旧状态） */
export const LLM_WIKI_EDITOR_TAB_STORAGE_KEY = 'baize:llm-wiki:editor-tab'
export const LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY = 'baize:llm-wiki:ai-panel-collapsed'

/** LLM Wiki 工作台 UI 状态（组件只读消费，写入统一走本模块函数） */
export interface LlmWikiWorkbenchState {
    /** 编辑区当前 tab（编辑器 / 预览） */
    editorTab: LlmWikiEditorTab
    /** 右侧 AI 面板是否折叠为侧栏（持久化；窄窗口自动折叠由 WorkSpace 计算，不写回本状态） */
    aiPanelCollapsed: boolean
}

/** 运行时状态单例（惰性从 localStorage 恢复） */
export const llmWikiWorkbenchState = reactive<LlmWikiWorkbenchState>({
    editorTab: DEFAULT_LLM_WIKI_EDITOR_TAB,
    aiPanelCollapsed: false
})

/** 是否已尝试从 localStorage 恢复（幂等，避免反复读取） */
let storageLoaded = false

/** 取 localStorage；不可用（隐私模式/权限受限）时返回 null */
function resolveStorage(): Storage | null {
    if (typeof window === 'undefined') {
        return null
    }
    try {
        return window.localStorage ?? null
    } catch {
        return null
    }
}

/** 容错读取字符串值：读取异常/不存在返回 null */
function readStoredValue(key: string): string | null {
    const storage = resolveStorage()
    if (!storage) {
        return null
    }
    try {
        return storage.getItem(key)
    } catch {
        return null
    }
}

/** 容错写入字符串值：配额不足/隐私模式时静默降级（内存状态仍生效） */
function writeStoredValue(key: string, value: string): void {
    const storage = resolveStorage()
    if (!storage) {
        return
    }
    try {
        storage.setItem(key, value)
    } catch {
        // 写入失败不打断交互：本次会话内状态仍正确，仅丢失跨会话恢复
    }
}

/** 归一化编辑区 tab：只接受 'preview'，其余（含未知/损坏值）回落 'editor' */
export function normalizeLlmWikiEditorTab(value: unknown): LlmWikiEditorTab {
    return value === LLM_WIKI_EDITOR_TAB.PREVIEW
        ? LLM_WIKI_EDITOR_TAB.PREVIEW
        : DEFAULT_LLM_WIKI_EDITOR_TAB
}

/** 惰性从 localStorage 恢复 UI 状态（幂等；组件 setup 期调用，保证首帧用上持久化值） */
export function ensureLlmWikiWorkbenchStateLoaded(): void {
    if (storageLoaded) {
        return
    }
    storageLoaded = true
    llmWikiWorkbenchState.editorTab = normalizeLlmWikiEditorTab(
        readStoredValue(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)
    )
    llmWikiWorkbenchState.aiPanelCollapsed =
        readStoredValue(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY) === 'true'
}

/** 切换编辑区 tab（写入内存状态并持久化；非法值归一化） */
export function setLlmWikiEditorTab(tab: LlmWikiEditorTab): void {
    ensureLlmWikiWorkbenchStateLoaded()
    const next = normalizeLlmWikiEditorTab(tab)
    if (llmWikiWorkbenchState.editorTab === next) {
        return
    }
    llmWikiWorkbenchState.editorTab = next
    writeStoredValue(LLM_WIKI_EDITOR_TAB_STORAGE_KEY, next)
}

/** 切换右侧 AI 面板折叠状态（持久化） */
export function toggleLlmWikiAiPanelCollapsed(): void {
    ensureLlmWikiWorkbenchStateLoaded()
    llmWikiWorkbenchState.aiPanelCollapsed = !llmWikiWorkbenchState.aiPanelCollapsed
    writeStoredValue(
        LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY,
        llmWikiWorkbenchState.aiPanelCollapsed ? 'true' : 'false'
    )
}

/** 仅供单元测试：重置模块状态与测试写入的 localStorage 键 */
export function resetLlmWikiWorkbenchStateForTesting(): void {
    storageLoaded = false
    llmWikiWorkbenchState.editorTab = DEFAULT_LLM_WIKI_EDITOR_TAB
    llmWikiWorkbenchState.aiPanelCollapsed = false
    const storage = resolveStorage()
    if (!storage) {
        return
    }
    try {
        storage.removeItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)
        storage.removeItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)
    } catch {
        // 测试环境存储异常忽略
    }
}
