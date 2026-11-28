/**
 * LLM Wiki 工作台 UI 状态（编辑区「编辑器 / 预览」tab、右侧 AI 面板收起与宽度）。
 *
 * ## 背景（1.5.7 LLM Wiki L5 / 体验升级批次 A / 体验调整）
 * `workspaceMode === 'llm-wiki'` 时工作台采用「左侧单栏编辑区 + 右侧 AI 面板」布局：
 * - 编辑区内部用 tab 在 Monaco 编辑器与 Markdown 预览之间切换（`v-show` 保留两实例状态）；
 *   体验升级批次 A 起该分段控件悬浮于编辑区右上角（`MarkdownEditComponent` 负责定位）；
 * - 右侧 AI 面板的收起只由用户手动触发：收起后容器完全不占编辑区宽度，展开入口渲染在
 *   工作区右侧边栏（`WorkSpace.vue` 的 `#llm-ai-sidebar-entry`）；
 * - 编辑区与 AI 面板之间的 split 可拖动：面板宽度持久化在本模块（键
 *   `baize:llm-wiki:ai-panel-width`），布局层只做可用宽度夹取——**不为编辑区保留最小宽度**。
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

/**
 * AI 面板宽度约束（px）：拖拽分隔条 / 键盘微调 / 持久化恢复共用同一区间。
 * 窗口可用宽度不足时由布局层（`WorkSpace.vue`）再按「当前工作区可用宽度」二次夹取
 * （不为编辑区保留最小宽度，编辑区可被压到 0）。
 */
export const LLM_WIKI_AI_PANEL_WIDTH = {
    /** 展开态最小宽度 */
    MIN: 240,
    /** 默认宽度（双击分隔条 / 面板按钮恢复默认） */
    DEFAULT: 360,
    /** 展开态最大宽度 */
    MAX: 560
} as const

/** localStorage 键（版本化，便于以后清理不兼容旧状态） */
export const LLM_WIKI_EDITOR_TAB_STORAGE_KEY = 'baize:llm-wiki:editor-tab'
export const LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY = 'baize:llm-wiki:ai-panel-collapsed'
export const LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY = 'baize:llm-wiki:ai-panel-width'

/** LLM Wiki 工作台 UI 状态（组件只读消费，写入统一走本模块函数） */
export interface LlmWikiWorkbenchState {
    /** 编辑区当前 tab（编辑器 / 预览） */
    editorTab: LlmWikiEditorTab
    /** 右侧 AI 面板是否已由用户手动收起（持久化；收起后入口在右侧边栏，不占编辑区宽度） */
    aiPanelCollapsed: boolean
    /**
     * 右侧 AI 面板宽度（px）。
     * `null` = 用户尚未自定义宽度：布局层按窗口宽度分档取默认值（宽窗 360 / 窄窗 280）。
     */
    aiPanelWidth: number | null
}

/** 运行时状态单例（惰性从 localStorage 恢复） */
export const llmWikiWorkbenchState = reactive<LlmWikiWorkbenchState>({
    editorTab: DEFAULT_LLM_WIKI_EDITOR_TAB,
    aiPanelCollapsed: false,
    aiPanelWidth: null
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

/**
 * 把面板宽度夹取到合法区间 [MIN, MAX]。
 * 非有限数值回落默认宽度（持久化损坏值不打断布局）。
 */
export function clampLlmWikiAiPanelWidth(value: number): number {
    if (!Number.isFinite(value)) {
        return LLM_WIKI_AI_PANEL_WIDTH.DEFAULT
    }
    return Math.min(
        LLM_WIKI_AI_PANEL_WIDTH.MAX,
        Math.max(LLM_WIKI_AI_PANEL_WIDTH.MIN, Math.round(value))
    )
}

/**
 * 归一化持久化面板宽度：`null` = 无有效值（布局层按窗口分档默认值）。
 * 数字与数字字符串（localStorage 只能存字符串）都接受，越界值夹取到合法区间。
 */
export function normalizeLlmWikiAiPanelWidth(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? clampLlmWikiAiPanelWidth(value) : null
    }
    if (typeof value !== 'string' || value.trim() === '') {
        return null
    }
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? clampLlmWikiAiPanelWidth(parsed) : null
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
    llmWikiWorkbenchState.aiPanelWidth = normalizeLlmWikiAiPanelWidth(
        readStoredValue(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)
    )
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

/**
 * 设置 AI 面板宽度（拖拽结束 / 键盘微调 / 恢复默认时调用；夹取到合法区间并持久化）。
 * 拖动过程中的临时宽度由布局层本地状态承接，避免 mousemove 高频写 localStorage。
 */
export function setLlmWikiAiPanelWidth(width: number): void {
    ensureLlmWikiWorkbenchStateLoaded()
    const next = clampLlmWikiAiPanelWidth(width)
    if (llmWikiWorkbenchState.aiPanelWidth === next) {
        return
    }
    llmWikiWorkbenchState.aiPanelWidth = next
    writeStoredValue(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY, String(next))
}

/** 恢复 AI 面板默认宽度（双击分隔条 / 面板「恢复默认宽度」按钮） */
export function resetLlmWikiAiPanelWidth(): void {
    setLlmWikiAiPanelWidth(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
}

/** 仅供单元测试：重置模块状态与测试写入的 localStorage 键 */
export function resetLlmWikiWorkbenchStateForTesting(): void {
    storageLoaded = false
    llmWikiWorkbenchState.editorTab = DEFAULT_LLM_WIKI_EDITOR_TAB
    llmWikiWorkbenchState.aiPanelCollapsed = false
    llmWikiWorkbenchState.aiPanelWidth = null
    const storage = resolveStorage()
    if (!storage) {
        return
    }
    try {
        storage.removeItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)
        storage.removeItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)
        storage.removeItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)
    } catch {
        // 测试环境存储异常忽略
    }
}
