/**
 * 1.5.7 终端工具（阶段 B）：右侧终端面板 UI 状态。
 *
 * ## 背景（用户需求）
 * 在工具的右侧边栏增加终端工具，默认打开系统命令提示符（Windows `cmd.exe`，由主进程
 * `pty-manager` 解析），运行目录 = 当前工具打开的文件夹（主进程 `appState.rootPath`，
 * 渲染层不传路径）。面板的展示/布局方式与 AI 助手面板一致：右侧停靠、宽度可拖动 /
 * 键盘微调 / 双击复位、可收起回右侧边栏入口。
 *
 * ## 状态边界
 * - 只存**渲染层 UI 状态**（可见 / 收起 / 宽度 / 当前右侧面板），不触达笔记内容、
 *   不新增 IPC、不写系统配置；
 * - **宽度持久化**（`baize:terminal:panel-width`，localStorage 容错）；
 *   `visible` / `collapsed` / `active` 为会话内状态，**不持久化**——终端面板打开会启动
 *   真实子进程（pty），不应在每次启动应用时自动拉起命令提示符；
 * - 右侧同一时刻只显示一个面板（AI 助手 / 终端）：`active` 是唯一互斥真源。
 *   打开终端只把 `active` 切到 `terminal`，**不改写** AI 面板的持久化收起/宽度状态
 *   （AI 面板组件保持挂载、对话状态不丢，切回后原样恢复）；打开 AI 反之。
 *
 * ## 与 AI 面板状态的关系
 * AI 面板状态仍在 `components/llm-wiki/llm-wiki-workbench`（跨模式持久化），本模块只
 * 通过 `active` 决定「右侧由谁占据」，两层状态互不复制、互不改写。
 */
import { reactive } from 'vue'

/**
 * 终端面板宽度常量（px）。
 *
 * 与 AI 面板一致：默认 360；可拖范围 = `[0, 当前工作区可用宽度 − 分隔条宽度]`
 * （由布局层 `WorkSpace.vue` 按实时可用宽度夹取，本模块只保存非负整数用户偏好）。
 */
export const TERMINAL_PANEL_WIDTH = {
    /** 默认宽度（双击分隔条恢复默认；可用宽度不足时由布局层夹到「可用宽度 − 分隔条」） */
    DEFAULT: 360
} as const

/** localStorage 键（版本化，便于以后清理不兼容旧状态） */
export const TERMINAL_PANEL_WIDTH_STORAGE_KEY = 'baize:terminal:panel-width'

/** 右侧面板标识：同一时刻右侧只显示其中一个（AI 助手 / 终端） */
export type RightSidePanel = 'ai' | 'terminal'

/** 右侧终端面板 UI 状态（组件只读消费，写入统一走本模块函数） */
export interface TerminalPanelState {
    /** 终端面板是否已打开（会话/组件已挂载；关闭后卸载终端组件并回收 pty） */
    visible: boolean
    /** 终端面板是否收起（收起后回右侧边栏入口；面板仍挂载，运行中的会话不丢失） */
    collapsed: boolean
    /** 终端面板宽度（px；非负整数，持久化） */
    width: number
    /** 当前占据右侧的面板（互斥真源；打开终端 = 'terminal'，打开 AI = 'ai'） */
    active: RightSidePanel
}

/** 运行时状态单例（惰性从 localStorage 恢复宽度） */
export const terminalPanelState = reactive<TerminalPanelState>({
    visible: false,
    collapsed: false,
    width: TERMINAL_PANEL_WIDTH.DEFAULT,
    active: 'ai'
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

/**
 * 归一化面板宽度：四舍五入为非负整数（0 合法 = 面板宽 0 但仍挂载，可再拖回）。
 * 损坏值（NaN/Infinity/非数字字符串）回落默认宽度，避免损坏持久化值把布局打成 NaN。
 */
export function normalizeTerminalPanelWidth(value: unknown): number {
    if (typeof value === 'number') {
        return Number.isFinite(value)
            ? Math.max(0, Math.round(value))
            : TERMINAL_PANEL_WIDTH.DEFAULT
    }
    if (typeof value !== 'string' || value.trim() === '') {
        return TERMINAL_PANEL_WIDTH.DEFAULT
    }
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : TERMINAL_PANEL_WIDTH.DEFAULT
}

/** 惰性从 localStorage 恢复 UI 状态（幂等；组件 setup 期调用，保证首帧用上持久化宽度） */
export function ensureTerminalPanelStateLoaded(): void {
    if (storageLoaded) {
        return
    }
    storageLoaded = true
    terminalPanelState.width = normalizeTerminalPanelWidth(
        readStoredValue(TERMINAL_PANEL_WIDTH_STORAGE_KEY)
    )
}

/**
 * 打开终端面板（右侧边栏入口 / 重新展开收起态共用）：
 * - `visible=true`（挂载终端组件、创建 pty 会话）；
 * - `collapsed=false`（展开）；
 * - `active='terminal'`（右侧互斥切到终端；AI 面板容器隐藏但保持挂载与持久化状态）。
 */
export function openTerminalPanel(): void {
    ensureTerminalPanelStateLoaded()
    terminalPanelState.visible = true
    terminalPanelState.collapsed = false
    terminalPanelState.active = 'terminal'
}

/**
 * 关闭终端面板：卸载终端组件（组件卸载链路负责 `TERMINAL.CLOSE` 回收 pty）。
 * 若当前占据右侧的是终端，则右侧回落给 AI 面板（AI 面板按自身状态决定是否显示）。
 */
export function closeTerminalPanel(): void {
    ensureTerminalPanelStateLoaded()
    terminalPanelState.visible = false
    terminalPanelState.collapsed = false
    if (terminalPanelState.active === 'terminal') {
        terminalPanelState.active = 'ai'
    }
}

/**
 * 切换终端面板收起态（面板头部「收起」按钮）：
 * - 收起：面板隐藏、回右侧边栏入口，**会话保持运行**（组件仍挂载）；
 * - 展开：重新显示并确保右侧显示终端（`active='terminal'`）；
 * - 面板尚未打开时等价于打开（入口点击复用同一路径）。
 */
export function toggleTerminalCollapsed(): void {
    ensureTerminalPanelStateLoaded()
    if (!terminalPanelState.visible) {
        openTerminalPanel()
        return
    }
    const nextCollapsed = !terminalPanelState.collapsed
    terminalPanelState.collapsed = nextCollapsed
    if (!nextCollapsed) {
        terminalPanelState.active = 'terminal'
    }
}

/**
 * 设置终端面板宽度（拖拽结束 / 键盘微调 / 恢复默认时调用；归一化为非负整数并持久化）。
 * 可拖范围由布局层按「当前可用宽度 − 分隔条」夹取后再调用本函数（0 为合法值）；
 * 拖动过程中的临时宽度由布局层本地状态承接，避免 mousemove 高频写 localStorage。
 */
export function setTerminalPanelWidth(width: number): void {
    ensureTerminalPanelStateLoaded()
    const next = normalizeTerminalPanelWidth(width)
    if (terminalPanelState.width === next) {
        return
    }
    terminalPanelState.width = next
    writeStoredValue(TERMINAL_PANEL_WIDTH_STORAGE_KEY, String(next))
}

/** 恢复终端面板默认宽度（双击分隔条） */
export function resetTerminalPanelWidth(): void {
    setTerminalPanelWidth(TERMINAL_PANEL_WIDTH.DEFAULT)
}

/**
 * 右侧面板互斥切换助手（AI 面板 / 终端面板）。
 *
 * - `'terminal'`：等价于打开终端（可见 + 展开 + active=terminal）；
 * - `'ai'`：只把右侧交还 AI 面板（active='ai'），**不改写** AI 的收起/宽度持久化状态，
 *   也不关闭终端会话状态之外的任何渲染层状态（终端组件由布局层按 active 卸载并回收）。
 *
 * 说明：AI 面板的可见性真源仍是 `llm-wiki-workbench`（收起态持久化），本函数只负责
 * 「谁占据右侧」；布局层会同时要求 AI 面板自身处于展开态，保证切回后立即可见。
 */
export function activateRightPanel(panel: RightSidePanel): void {
    ensureTerminalPanelStateLoaded()
    if (panel === 'terminal') {
        openTerminalPanel()
        return
    }
    terminalPanelState.active = 'ai'
}

/** 仅供单元测试：重置模块状态与测试写入的 localStorage 键 */
export function resetTerminalPanelStateForTesting(): void {
    storageLoaded = false
    terminalPanelState.visible = false
    terminalPanelState.collapsed = false
    terminalPanelState.width = TERMINAL_PANEL_WIDTH.DEFAULT
    terminalPanelState.active = 'ai'
    const storage = resolveStorage()
    if (!storage) {
        return
    }
    try {
        storage.removeItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)
    } catch {
        // 测试环境存储异常忽略
    }
}
