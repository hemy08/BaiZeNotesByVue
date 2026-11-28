/**
 * LLM Wiki 工作台 UI 状态（编辑区「编辑器 / 预览」tab、右侧 AI 面板收起与宽度）。
 *
 * ## 背景（1.5.7 LLM Wiki L5 / 体验升级批次 A / 体验调整 / 体验微调）
 * `workspaceMode === 'llm-wiki'` 时工作台采用「左侧单栏编辑区 + 右侧 AI 面板」布局：
 * - 编辑区内部用 tab 在 Monaco 编辑器与 Markdown 预览之间切换（`v-show` 保留两实例状态）；
 *   1.5.7 体验微调（用户反馈）起切换按钮从「编辑区右上角悬浮分段控件」迁移到
 *   编辑工具条右侧（`MarkdownEditToolsComponent.vue`，仅图标；原 `LlmWikiEditorTabs.vue` 已删除）；
 * - 右侧 AI 面板的收起只由用户手动触发：收起后容器完全不占编辑区宽度，展开入口渲染在
 *   工作区右侧边栏（`WorkSpace.vue` 的 `#llm-ai-sidebar-entry`；传统模式下该入口用于
 *   切换到 LLM Wiki 模式并展开面板）；
 * - 编辑区与 AI 面板之间的 split 可拖动：面板宽度持久化在本模块（键
 *   `baize:llm-wiki:ai-panel-width`）。体验微调起**无固定上下限**：面板宽度取值
 *   `[0, 当前工作区可用宽度 − 分隔条宽度]`，布局层只做可用宽度夹取
 *   （**不为编辑区保留最小宽度**，编辑区可被压到 0；面板也可缩到 0 但仍挂载）。
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
 * AI 面板宽度常量（px）。
 *
 * 1.5.7 体验微调（用户反馈「AI 面板宽度也不要限制，往左拖动一点距离后就拖不动了」）：
 * **移除固定上下限（原 MIN 240 / MAX 560）**，可拖范围改为
 * `[0, 当前工作区可用宽度 − 分隔条宽度]`（由布局层 `WorkSpace.vue` 按实时可用宽度夹取）：
 * - 往左拖：面板可占满整个工作区（编辑区宽度压到 0）；
 * - 往右拖：面板可缩到 0（编辑区占满；面板仍挂载、对话状态不丢，可再拖回）。
 *
 * 本模块只保存「用户想要的宽度」（非负整数），不感知窗口可用宽度；
 * 持久化值在挂载 / 窗口 resize 时由布局层按当前可用宽度夹取，不覆盖用户偏好。
 */
export const LLM_WIKI_AI_PANEL_WIDTH = {
    /** 默认宽度（双击分隔条 / 面板按钮恢复默认；可用宽度不足时由布局层夹到「可用宽度 − 分隔条」） */
    DEFAULT: 360
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
 * 归一化面板宽度：四舍五入为非负整数（0 合法 = 面板宽 0，仍保留挂载、可再拖回）。
 * 非有限数值（持久化损坏 / NaN）回落默认宽度，避免损坏值把布局打成 NaN。
 *
 * 注：1.5.7 体验微调已移除固定上下限（原 240 / 560）；实际可拖范围由布局层按
 * 「当前工作区可用宽度 − 分隔条宽度」夹取，本函数只做非负与整数归一化。
 */
export function clampLlmWikiAiPanelWidth(value: number): number {
    if (!Number.isFinite(value)) {
        return LLM_WIKI_AI_PANEL_WIDTH.DEFAULT
    }
    return Math.max(0, Math.round(value))
}

/**
 * 归一化持久化面板宽度：`null` = 无有效值（布局层按窗口分档默认值）。
 * 数字与数字字符串（localStorage 只能存字符串）都接受；负数归一化为 0，
 * 大整数保留为用户偏好（实际渲染宽度在挂载 / resize 时按可用宽度夹取）。
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

/**
 * 设置右侧 AI 面板折叠状态（持久化）。
 *
 * 供工作区模式切换复用：传统模式经右侧边栏入口 / 工具条按钮切换到 LLM Wiki 成功后，
 * 需要保证面板处于展开态（即使上次是收起状态）；无变化时不重复写 localStorage。
 */
export function setLlmWikiAiPanelCollapsed(collapsed: boolean): void {
    ensureLlmWikiWorkbenchStateLoaded()
    if (llmWikiWorkbenchState.aiPanelCollapsed === collapsed) {
        return
    }
    llmWikiWorkbenchState.aiPanelCollapsed = collapsed
    writeStoredValue(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false')
}

/** 确保右侧 AI 面板处于展开态（工作区模式切换到 LLM Wiki 后调用；幂等） */
export function ensureLlmWikiAiPanelExpanded(): void {
    setLlmWikiAiPanelCollapsed(false)
}

/** 切换右侧 AI 面板折叠状态（持久化） */
export function toggleLlmWikiAiPanelCollapsed(): void {
    ensureLlmWikiWorkbenchStateLoaded()
    setLlmWikiAiPanelCollapsed(!llmWikiWorkbenchState.aiPanelCollapsed)
}

/**
 * 设置 AI 面板宽度（拖拽结束 / 键盘微调 / 恢复默认时调用；归一化为非负整数并持久化）。
 * 可拖范围由布局层按「当前可用宽度 − 分隔条」夹取后再调用本函数（0 为合法值）；
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
