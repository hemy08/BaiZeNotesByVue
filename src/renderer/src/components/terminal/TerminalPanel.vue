<template>
    <section
        class="terminal-panel"
        role="application"
        :aria-label="t('editorUi.terminalPanel.ariaLabel')"
        :data-terminal-state="status"
        data-terminal-panel
        @click="handleFocusTerminal"
    >
        <!-- 头部：标题 + 纯图标工具条（与 AI 面板头部同风格；按钮全部走 i18n 的无障碍名） -->
        <header class="terminal-panel-header">
            <h2 class="terminal-panel-title">{{ t('editorUi.terminalPanel.title') }}</h2>
            <button
                type="button"
                class="terminal-panel-icon-btn terminal-panel-restart"
                :title="t('editorUi.terminalPanel.restart')"
                :aria-label="t('editorUi.terminalPanel.restart')"
                :disabled="status === 'creating'"
                @click.stop="handleRestart"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                    <path d="M20 4v7h-7" />
                </svg>
            </button>
            <button
                type="button"
                class="terminal-panel-icon-btn terminal-panel-clear"
                :title="t('editorUi.terminalPanel.clear')"
                :aria-label="t('editorUi.terminalPanel.clear')"
                :disabled="status === 'creating'"
                @click.stop="handleClear"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M4 7h16" />
                    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    <path d="M6 7l1 13h10l1-13" />
                    <path d="M10 11v5M14 11v5" />
                </svg>
            </button>
            <button
                type="button"
                class="terminal-panel-icon-btn terminal-panel-copy"
                :title="t('editorUi.terminalPanel.copy')"
                :aria-label="t('editorUi.terminalPanel.copy')"
                :disabled="status === 'creating'"
                @click.stop="handleCopy"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M15 5H6a1 1 0 0 0-1 1v9" />
                </svg>
            </button>
            <button
                type="button"
                class="terminal-panel-icon-btn terminal-panel-paste"
                :title="t('editorUi.terminalPanel.paste')"
                :aria-label="t('editorUi.terminalPanel.paste')"
                :disabled="status !== 'ready'"
                @click.stop="handlePaste"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
                    <path
                        d="M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2"
                    />
                </svg>
            </button>
            <button
                type="button"
                class="terminal-panel-icon-btn terminal-panel-collapse"
                :title="t('editorUi.terminalPanel.collapse')"
                :aria-label="t('editorUi.terminalPanel.collapse')"
                @click.stop="emit('toggle-collapse')"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M9 6l6 6-6 6" />
                </svg>
            </button>
        </header>

        <!-- 状态行：运行目录 + shell 名（来自 TERMINAL.CREATE 返回；主进程未返回前显示占位） -->
        <div class="terminal-panel-meta" role="status" aria-live="polite">
            <span class="terminal-panel-meta-item" :title="cwdTitle">
                {{ t('editorUi.terminalPanel.cwdLabel') }}：{{ cwdDisplay }}
            </span>
            <span class="terminal-panel-meta-item" :title="shellTitle">
                {{ t('editorUi.terminalPanel.shellLabel') }}：{{ shellDisplay }}
            </span>
            <span v-if="statusNotice" class="terminal-panel-meta-notice" data-terminal-notice>
                {{ statusNotice }}
            </span>
        </div>

        <!-- 终端视图：xterm 挂载点（创建中/失败时由覆盖层给出可读原因与重试入口） -->
        <div class="terminal-panel-body">
            <div ref="hostRef" class="terminal-panel-host" data-terminal-host></div>
            <p
                v-if="status === 'creating'"
                class="terminal-panel-overlay terminal-panel-overlay--loading"
                role="status"
            >
                {{ loadingMessage }}
            </p>
            <div
                v-else-if="status === 'error'"
                class="terminal-panel-overlay terminal-panel-overlay--error"
                role="alert"
            >
                <p class="terminal-panel-error-message" data-terminal-error>
                    {{ t('editorUi.terminalPanel.createFailed', { error: errorMessageText }) }}
                </p>
                <button type="button" class="terminal-panel-retry" @click.stop="handleRestart">
                    {{ t('editorUi.terminalPanel.retry') }}
                </button>
            </div>
        </div>

        <!-- 进程退出提示（不遮挡最后输出）：重启按钮复用同一重启链路 -->
        <footer
            v-if="status === 'exited'"
            class="terminal-panel-exit"
            role="status"
            data-terminal-exit
        >
            <span class="terminal-panel-exit-message">{{ exitMessage }}</span>
            <button type="button" class="terminal-panel-exit-restart" @click.stop="handleRestart">
                {{ t('editorUi.terminalPanel.restartProcess') }}
            </button>
        </footer>
    </section>
</template>

<script setup lang="ts">
/**
 * 1.5.7 终端工具（阶段 B）：右侧终端面板（xterm + addon-fit）。
 *
 * ## 数据流
 * - 主进程 → 渲染层：`TERMINAL.DATA`（16ms 节流聚合）先进入本地缓冲，再按 16ms / 32 KiB
 *   批量 `term.write`（避免高频小事件逐条写 xterm）；
 * - 渲染层 → 主进程：`term.onData`（键盘输入）进入本地缓冲，按 16ms 聚合、单次
 *   `TERMINAL.WRITE` ≤ 4 KiB 分片（避免每次击键一次 invoke 风暴），粘贴大段文本时按
 *   8 KiB 阈值立即冲刷；
 * - 尺寸：ResizeObserver（容器宽高变化：窗口 resize / 分隔条拖拽 / 收起展开）→
 *   `FitAddon.fit()` → 尺寸变化时 `TERMINAL.RESIZE`；
 * - 生命周期：初始挂载创建会话；重启用「关旧会话 → reset → 重建」；退出后保留最后输出
 *   并显示退出码 + 重启入口；组件卸载（面板切换到 AI / 工作区销毁）→ 清定时器、摘监听、
 *   `TERMINAL.CLOSE` 回收 pty、`term.dispose()`；
 * - 主题：挂载时从根元素 CSS 变量派生 xterm 主题；监听 `useTheme` 的主题状态
 *   （`currentThemeStyles`，`applyThemeStyles` 写完 CSS 变量后更新）触发
 *   `term.options.theme` 热更新，与 AI 面板同样跟随主题切换。
 *
 * ## 边界
 * - 运行目录由主进程决定（当前打开的工作区根），本组件**不传路径**；
 * - 默认 shell = 系统命令提示符（不传 `shell` 字段，由主进程按平台解析）；
 * - 只消费阶段 A 已登记的 4 个 invoke + 2 个 event，不新增 IPC 通道。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import type { IDisposable, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { t } from '@renderer/common/i18n'
import { logger } from '@renderer/common/logger'
import { copyTextToClipboard } from '@renderer/common/clipboard'
import { useTheme } from '@renderer/composables/useTheme'
import { IPC } from '../../../../shared/ipc-channels'
import type {
    TerminalCreateResult,
    TerminalDataEventPayload,
    TerminalExitEventPayload,
    TerminalOperationResult
} from '../../../../shared/types/ipc'
import { readTerminalTheme } from './terminal-theme'

const emit = defineEmits<{
    /** 面板头部「收起」：由 WorkSpace 切换为「收起态 + 右侧边栏入口」 */
    (event: 'toggle-collapse'): void
}>()

/** 终端运行状态（data-terminal-state 供测试/E2E 断言） */
type TerminalStatus = 'creating' | 'ready' | 'exited' | 'error'
/** 复制/粘贴反馈状态（状态行 aria-live 播报，定时自动清除） */
type CopyStatus = 'idle' | 'copied' | 'empty' | 'failed' | 'pasteFailed'

/** 输出写入 xterm 的合并批次间隔（ms） */
const DATA_FLUSH_INTERVAL_MS = 16
/** 输出缓冲达到该字符数时立即写 xterm（高频输出不必等定时器） */
const DATA_FLUSH_THRESHOLD_CHARS = 32 * 1024
/** 键盘输入聚合间隔（ms；避免每次击键一次 IPC invoke） */
const INPUT_FLUSH_INTERVAL_MS = 16
/** 单次 `TERMINAL.WRITE` 最大字符数（契约上限 64 KiB，渲染层取 4 KiB 控制单条 IPC 体积） */
const INPUT_CHUNK_MAX_CHARS = 4 * 1024
/** 输入缓冲达到该字符数时立即冲刷（粘贴大段文本场景） */
const INPUT_FLUSH_THRESHOLD_CHARS = 8 * 1024
/** 创建会话响应返回前收到的输出最多缓存字符数（防止异常情况下无限增长） */
const PENDING_DATA_MAX_CHARS = 256 * 1024
/** 复制反馈自动清除延迟（ms） */
const COPY_STATUS_RESET_MS = 1600
/** 尺寸兜底值（容器尚未完成布局时 xterm 的初始列/行） */
const FALLBACK_COLS = 80
const FALLBACK_ROWS = 24
/** 尺寸合法区间（与 IPC 契约 1..500 对齐） */
const MIN_TERMINAL_DIMENSION = 1
const MAX_TERMINAL_DIMENSION = 500
/** 终端等宽字体（项目规格约定的代码字体栈；不使用 UI 主题色令牌） */
const TERMINAL_FONT_FAMILY = "'Cascadia Code', 'SF Mono', Monaco, Consolas, monospace"
const TERMINAL_FONT_SIZE = 13
const TERMINAL_SCROLLBACK = 5000

const hostRef = ref<HTMLDivElement | null>(null)
const status = ref<TerminalStatus>('creating')
const cwd = ref('')
const shellName = ref('')
const exitCode = ref<number | null>(null)
const errorMessage = ref('')
const copyStatus = ref<CopyStatus>('idle')

/** xterm 实例（非响应式：高频变更无需进入 Vue 响应系统） */
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
/** 当前 pty 会话 id（DATA/EXIT/WRITE/RESIZE/CLOSE 的唯一关联键） */
let sessionId: string | null = null
/** 上次已同步给主进程的尺寸（避免重复 RESIZE invoke） */
let lastSentCols = 0
let lastSentRows = 0
/** 输出缓冲（主进程 DATA → xterm） */
let outputBuffer = ''
let outputFlushTimer: ReturnType<typeof setTimeout> | null = null
/** 创建会话响应返回前到达的输出（id 尚不可比对，先缓存、建好后补写） */
let pendingOutput = ''
/** 创建会话响应返回前到达的退出事件 */
let pendingExitPayload: TerminalExitEventPayload | null = null
/** 输入缓冲（xterm onData → 主进程 WRITE） */
let inputBuffer = ''
let inputFlushTimer: ReturnType<typeof setTimeout> | null = null
/** 复制反馈自动清除计时器 */
let copyStatusTimer: ReturnType<typeof setTimeout> | null = null
/** 容器尺寸观察者（窗口 resize / 面板宽度拖拽 / 收起展开全部经此收敛） */
let resizeObserver: ResizeObserver | null = null
/** xterm 输入事件订阅（term.dispose 前显式释放，满足生命周期配对要求） */
let inputSubscription: IDisposable | null = null
/** 组件是否已卸载（异步链路晚到时不再写状态/发 IPC） */
let isUnmounted = false

/** t() 包装（模板与脚本共用；空值兜底为通用未知原因文案） */
const errorMessageText = computed(
    () => errorMessage.value || t('editorUi.terminalPanel.createFailedUnknown')
)

/** 运行目录展示（创建完成前显示占位，避免状态行高度跳动） */
const cwdDisplay = computed(() => cwd.value || t('editorUi.terminalPanel.cwdPending'))
const shellDisplay = computed(() => shellName.value || t('editorUi.terminalPanel.shellPending'))
const cwdTitle = computed(() => cwdDisplay.value)
const shellTitle = computed(() => shellDisplay.value)

/** 复制/粘贴反馈文案（状态行 aria-live 播报） */
const statusNotice = computed(() => {
    switch (copyStatus.value) {
        case 'copied':
            return t('editorUi.terminalPanel.copied')
        case 'empty':
            return t('editorUi.terminalPanel.copyEmpty')
        case 'failed':
            return t('editorUi.terminalPanel.copyFailed')
        case 'pasteFailed':
            return t('editorUi.terminalPanel.pasteFailed')
        default:
            return ''
    }
})

/** 进程退出提示（退出码未知时不显示 code，避免出现「code null」） */
const exitMessage = computed(() => {
    if (exitCode.value === null) {
        return t('editorUi.terminalPanel.exitedUnknown')
    }
    return t('editorUi.terminalPanel.exited', { code: exitCode.value })
})

/** 创建中提示：已有过会话（重启 / 退出后重试）时用「正在重启终端」文案 */
const loadingMessage = computed(() =>
    cwd.value ? t('editorUi.terminalPanel.restarting') : t('editorUi.terminalPanel.loading')
)

/** 取渲染层 IPC 通道（非 Electron 环境返回 null，调用方给可读失败提示） */
function getIpcRenderer(): Window['electron']['ipcRenderer'] | null {
    if (typeof window === 'undefined') {
        return null
    }
    return window.electron?.ipcRenderer ?? null
}

/** 尺寸夹取到契约区间（1..500），非有限数值回落兜底值 */
function clampTerminalDimension(value: number, fallback: number): number {
    if (!Number.isFinite(value)) {
        return fallback
    }
    return Math.min(MAX_TERMINAL_DIMENSION, Math.max(MIN_TERMINAL_DIMENSION, Math.round(value)))
}

/** 复制反馈定时器清理（幂等） */
function clearCopyStatusTimer(): void {
    if (copyStatusTimer !== null) {
        clearTimeout(copyStatusTimer)
        copyStatusTimer = null
    }
}

/** 设置复制/粘贴反馈，并在固定延迟后自动清除（状态行 aria-live 只播报短暂结果） */
function setCopyStatus(next: CopyStatus): void {
    copyStatus.value = next
    clearCopyStatusTimer()
    if (next === 'idle') {
        return
    }
    copyStatusTimer = setTimeout(() => {
        copyStatusTimer = null
        copyStatus.value = 'idle'
    }, COPY_STATUS_RESET_MS)
}

/** 输出缓冲定时器清理 */
function clearOutputFlushTimer(): void {
    if (outputFlushTimer !== null) {
        clearTimeout(outputFlushTimer)
        outputFlushTimer = null
    }
}

/** 输入缓冲定时器清理 */
function clearInputFlushTimer(): void {
    if (inputFlushTimer !== null) {
        clearTimeout(inputFlushTimer)
        inputFlushTimer = null
    }
}

/**
 * 主进程输出入队：达到阈值立即写 xterm，否则 16ms 合并后写。
 * `term.write` 内部自带渲染队列，这里合并的是「IPC 事件 → 写调用」的批次。
 */
function enqueueOutput(data: string): void {
    if (typeof data !== 'string' || data.length === 0) {
        return
    }
    outputBuffer += data
    if (outputBuffer.length >= DATA_FLUSH_THRESHOLD_CHARS) {
        flushOutputBuffer()
        return
    }
    if (outputFlushTimer === null) {
        outputFlushTimer = setTimeout(() => {
            outputFlushTimer = null
            flushOutputBuffer()
        }, DATA_FLUSH_INTERVAL_MS)
    }
}

/** 把输出缓冲一次性写进 xterm（组件已卸载/实例不存在时丢弃） */
function flushOutputBuffer(): void {
    clearOutputFlushTimer()
    if (outputBuffer.length === 0) {
        return
    }
    const chunk = outputBuffer
    outputBuffer = ''
    terminal?.write(chunk)
}

/** 创建会话完成前缓存的输出在建好后补写（走同一缓冲链路，保持节流语义） */
function flushPendingOutput(): void {
    if (pendingOutput.length === 0) {
        return
    }
    const chunk = pendingOutput
    pendingOutput = ''
    enqueueOutput(chunk)
}

/** 键盘输入入队：16ms 聚合、超阈值立即冲刷 */
function enqueueInput(data: string): void {
    if (typeof data !== 'string' || data.length === 0 || sessionId === null) {
        return
    }
    inputBuffer += data
    if (inputBuffer.length >= INPUT_FLUSH_THRESHOLD_CHARS) {
        flushInputBuffer()
        return
    }
    if (inputFlushTimer === null) {
        inputFlushTimer = setTimeout(() => {
            inputFlushTimer = null
            flushInputBuffer()
        }, INPUT_FLUSH_INTERVAL_MS)
    }
}

/** 输入缓冲按 ≤4 KiB 分片发送 `TERMINAL.WRITE`（会话已关闭/卸载时丢弃） */
function flushInputBuffer(): void {
    clearInputFlushTimer()
    const id = sessionId
    if (id === null) {
        inputBuffer = ''
        return
    }
    while (inputBuffer.length > 0) {
        const chunk = inputBuffer.slice(0, INPUT_CHUNK_MAX_CHARS)
        inputBuffer = inputBuffer.slice(INPUT_CHUNK_MAX_CHARS)
        void sendInputChunk(id, chunk)
    }
}

/** 发送单条输入分片（失败只记日志：终端输出/退出状态会给出最终结果） */
async function sendInputChunk(id: string, data: string): Promise<void> {
    const ipc = getIpcRenderer()
    if (!ipc) {
        return
    }
    try {
        const result = (await ipc.invoke(IPC.TERMINAL.WRITE, { id, data })) as
            TerminalOperationResult | undefined
        if (result && result.ok === false) {
            logger.warn('[Terminal] 终端输入写入失败:', result.error)
        }
    } catch (error) {
        logger.warn('[Terminal] 终端输入写入异常:', error)
    }
}

/** 主进程 `TERMINAL.DATA`：按会话 id 过滤后进入输出缓冲 */
function handleTerminalData(_event: unknown, payload: TerminalDataEventPayload): void {
    if (isUnmounted || !payload || typeof payload.data !== 'string') {
        return
    }
    // 会话创建响应尚未返回：输出事件与 invoke 响应是两条独立队列，先缓存、建好后补写
    if (sessionId === null) {
        if (pendingOutput.length < PENDING_DATA_MAX_CHARS) {
            pendingOutput = (pendingOutput + payload.data).slice(0, PENDING_DATA_MAX_CHARS)
        }
        return
    }
    if (payload.id !== sessionId) {
        return
    }
    enqueueOutput(payload.data)
}

/** 主进程 `TERMINAL.EXIT`：按会话 id 过滤后标记退出态（刷新最后输出 → 展示退出码） */
function handleTerminalExit(_event: unknown, payload: TerminalExitEventPayload): void {
    if (isUnmounted || !payload || typeof payload.id !== 'string') {
        return
    }
    if (sessionId === null) {
        pendingExitPayload = payload
        return
    }
    if (payload.id !== sessionId) {
        return
    }
    applyTerminalExit(payload)
}

/** 应用退出态：先冲刷输出（主进程保证 DATA 先于 EXIT），再更新状态 */
function applyTerminalExit(payload: TerminalExitEventPayload): void {
    flushOutputBuffer()
    sessionId = null
    exitCode.value = typeof payload.exitCode === 'number' ? payload.exitCode : null
    status.value = 'exited'
    clearInputFlushTimer()
    inputBuffer = ''
}

/**
 * 取出「创建响应返回前已到达」的退出事件（仅匹配当前会话 id；读取后清空）。
 * 独立成函数避免 TS 对模块级 `let` 的控制流收窄误判（闭包写入不会被流分析感知）。
 */
function takePendingExitForSession(id: string): TerminalExitEventPayload | null {
    const pending = pendingExitPayload
    pendingExitPayload = null
    if (!pending || pending.id !== id) {
        return null
    }
    return pending
}

/** 注册主进程事件监听（`on` 与卸载路径的 `removeListener` 严格配对） */
function registerIpcListeners(): void {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
        return
    }
    ipcRenderer.on(IPC.TERMINAL.DATA, handleTerminalData)
    ipcRenderer.on(IPC.TERMINAL.EXIT, handleTerminalExit)
}

/** 摘除主进程事件监听（与 registerIpcListeners 严格配对） */
function unregisterIpcListeners(): void {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
        return
    }
    ipcRenderer.removeListener(IPC.TERMINAL.DATA, handleTerminalData)
    ipcRenderer.removeListener(IPC.TERMINAL.EXIT, handleTerminalExit)
}

/** 按容器当前尺寸执行 fit 并返回夹取后的 cols/rows（xterm 尚未创建时用兜底尺寸） */
function fitTerminal(): { cols: number; rows: number } {
    if (!terminal) {
        return { cols: FALLBACK_COLS, rows: FALLBACK_ROWS }
    }
    try {
        fitAddon?.fit()
    } catch (error) {
        // 容器不可见（收起态）/ 尺寸为 0 时 fit 可能异常：沿用上次尺寸，不打断交互
        logger.warn('[Terminal] 终端尺寸计算失败，沿用上次尺寸:', error)
    }
    return {
        cols: clampTerminalDimension(terminal.cols, FALLBACK_COLS),
        rows: clampTerminalDimension(terminal.rows, FALLBACK_ROWS)
    }
}

/** 尺寸同步：尺寸变化才发 `TERMINAL.RESIZE`（会话未就绪时只更新本地记录，建会话时用新尺寸） */
async function syncTerminalSize(): Promise<void> {
    if (!terminal || isUnmounted) {
        return
    }
    const { cols, rows } = fitTerminal()
    if (cols === lastSentCols && rows === lastSentRows) {
        return
    }
    lastSentCols = cols
    lastSentRows = rows
    const id = sessionId
    if (id === null || status.value !== 'ready') {
        return
    }
    const ipc = getIpcRenderer()
    if (!ipc) {
        return
    }
    try {
        const result = (await ipc.invoke(IPC.TERMINAL.RESIZE, { id, cols, rows })) as
            TerminalOperationResult | undefined
        if (result && result.ok === false) {
            logger.warn('[Terminal] 终端尺寸同步失败:', result.error)
        }
    } catch (error) {
        logger.warn('[Terminal] 终端尺寸同步异常:', error)
    }
}

/** 容器尺寸变化回调（ResizeObserver / 无 ResizeObserver 环境的 window resize 兜底） */
function handleContainerResize(): void {
    void syncTerminalSize()
}

/** 挂载容器尺寸观察；不支持 ResizeObserver 的极简环境回退 window resize */
function attachResizeObserver(host: HTMLElement): void {
    if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
            handleContainerResize()
        })
        resizeObserver.observe(host)
        return
    }
    window.addEventListener('resize', handleContainerResize)
}

/** 摘除容器尺寸观察（幂等；window resize 兜底监听同样成对摘除） */
function detachResizeObserver(): void {
    if (resizeObserver !== null) {
        resizeObserver.disconnect()
        resizeObserver = null
    }
    window.removeEventListener('resize', handleContainerResize)
}

/** 主题切换后热更新 xterm 主题（背景/前景/光标/选区/ANSI 全部重新派生） */
function applyTerminalTheme(): void {
    if (!terminal) {
        return
    }
    const theme: ITheme = readTerminalTheme()
    terminal.options.theme = theme
}

/** 创建 xterm 实例并挂载到容器（只在首次挂载时调用；重启复用同一实例） */
function createTerminalInstance(): void {
    const host = hostRef.value
    if (!host) {
        return
    }
    const instance = new Terminal({
        cursorBlink: true,
        convertEol: false,
        fontFamily: TERMINAL_FONT_FAMILY,
        fontSize: TERMINAL_FONT_SIZE,
        scrollback: TERMINAL_SCROLLBACK,
        theme: readTerminalTheme()
    })
    const addon = new FitAddon()
    instance.loadAddon(addon)
    instance.open(host)
    terminal = instance
    fitAddon = addon
    inputSubscription = instance.onData((data) => {
        enqueueInput(data)
    })
    attachResizeObserver(host)
    // 首帧按容器实际尺寸 fit，创建会话时用该尺寸（避免以默认 80×24 建会话后再抖动一次）
    fitTerminal()
}

/** 创建会话失败：进入可读错误态（保留终端视图，提供「重试」按钮） */
function failSession(reason: string): void {
    inputBuffer = ''
    clearInputFlushTimer()
    errorMessage.value = reason
    status.value = 'error'
}

/** 调用 `TERMINAL.CLOSE` 回收 pty（失败只记日志：主进程会话上限/清理由主进程兜底） */
async function closeTerminalSession(id: string): Promise<void> {
    const ipc = getIpcRenderer()
    if (!ipc) {
        return
    }
    try {
        const result = (await ipc.invoke(IPC.TERMINAL.CLOSE, { id })) as
            TerminalOperationResult | undefined
        if (result && result.ok === false) {
            logger.warn('[Terminal] 关闭终端会话失败:', result.error)
        }
    } catch (error) {
        logger.warn('[Terminal] 关闭终端会话异常:', error)
    }
}

/**
 * 创建 pty 会话（默认 shell = 系统命令提示符；cwd 由主进程取当前工作区根）。
 * 失败/异常均落结构化错误态，不向用户抛异常。
 */
async function startSession(): Promise<void> {
    status.value = 'creating'
    errorMessage.value = ''
    exitCode.value = null
    pendingExitPayload = null
    pendingOutput = ''
    lastSentCols = 0
    lastSentRows = 0

    const { cols, rows } = fitTerminal()
    const ipc = getIpcRenderer()
    if (!ipc) {
        failSession(t('editorUi.terminalPanel.ipcUnavailable'))
        return
    }
    let result: TerminalCreateResult
    try {
        result = (await ipc.invoke(IPC.TERMINAL.CREATE, { cols, rows })) as TerminalCreateResult
    } catch (error) {
        logger.error('[Terminal] 创建终端会话异常:', error)
        failSession(t('editorUi.terminalPanel.createFailedUnknown'))
        return
    }
    if (isUnmounted) {
        // 组件在创建期间卸载：立刻回收刚创建的会话，避免主进程侧泄漏
        if (result && result.ok === true) {
            void closeTerminalSession(result.id)
        }
        return
    }
    if (!result || result.ok !== true) {
        failSession(result && typeof result.error === 'string' ? result.error : '')
        return
    }

    sessionId = result.id
    cwd.value = result.cwd
    shellName.value = result.shell
    lastSentCols = cols
    lastSentRows = rows
    status.value = 'ready'
    flushPendingOutput()
    // 会话在创建响应返回前已退出（罕见）：补应用退出事件，保证 UI 与主进程一致
    const pendingExit = takePendingExitForSession(sessionId)
    if (pendingExit) {
        applyTerminalExit(pendingExit)
        return
    }
    // 建好会话后按最新容器尺寸再校一次（创建期间窗口/面板可能变化）
    void syncTerminalSize()
    handleFocusTerminal()
}

/** 点击面板聚焦终端（xterm 键盘输入依赖其内部 textarea 焦点） */
function handleFocusTerminal(): void {
    terminal?.focus()
}

/** 清屏（只清可视区与滚动缓冲，不影响运行中的进程） */
function handleClear(): void {
    setCopyStatus('idle')
    terminal?.clear()
    handleFocusTerminal()
}

/** 复制终端选中内容（无选中时给出可读提示，不弹错误框） */
async function handleCopy(): Promise<void> {
    const selection = terminal?.getSelection() ?? ''
    if (selection.length === 0) {
        setCopyStatus('empty')
        return
    }
    const copied = await copyTextToClipboard(selection)
    setCopyStatus(copied ? 'copied' : 'failed')
}

/** 粘贴剪贴板文本到终端（经输入缓冲发送，保证与键盘输入同一条有序链路） */
async function handlePaste(): Promise<void> {
    if (sessionId === null) {
        return
    }
    try {
        const clipboard = navigator.clipboard
        if (!clipboard || typeof clipboard.readText !== 'function') {
            setCopyStatus('pasteFailed')
            return
        }
        const text = await clipboard.readText()
        if (typeof text !== 'string' || text.length === 0) {
            return
        }
        enqueueInput(text)
        flushInputBuffer()
        handleFocusTerminal()
    } catch (error) {
        logger.warn('[Terminal] 读取剪贴板失败:', error)
        setCopyStatus('pasteFailed')
    }
}

/**
 * 重启终端：关闭旧会话（若有）→ 清屏 reset → 重建会话。
 * 复用同一 xterm 实例（DOM/滚动条不重建），输出与输入缓冲全部清空，避免旧会话残留。
 */
async function handleRestart(): Promise<void> {
    if (status.value === 'creating') {
        return
    }
    const previousSessionId = sessionId
    sessionId = null
    clearOutputFlushTimer()
    outputBuffer = ''
    clearInputFlushTimer()
    inputBuffer = ''
    pendingOutput = ''
    pendingExitPayload = null
    if (previousSessionId !== null) {
        await closeTerminalSession(previousSessionId)
    }
    terminal?.reset()
    await startSession()
}

// 主题状态变化（useTheme.applyThemeStyles 写完 CSS 变量后更新 currentThemeStyles）→
// 重新派生 xterm 主题；watch 随组件卸载自动释放，不新增常驻订阅。
const themeApi = useTheme()
watch(themeApi.currentThemeStyles, () => {
    applyTerminalTheme()
})

onMounted(() => {
    registerIpcListeners()
    createTerminalInstance()
    void startSession()
})

onBeforeUnmount(() => {
    isUnmounted = true
    // 1) 定时器与缓冲：全部清理，卸载后不再写状态/发 IPC
    clearOutputFlushTimer()
    clearInputFlushTimer()
    clearCopyStatusTimer()
    outputBuffer = ''
    pendingOutput = ''
    inputBuffer = ''
    pendingExitPayload = null
    // 2) DOM/尺寸观察与主进程事件监听成对摘除（内存生命周期门禁要求）
    detachResizeObserver()
    unregisterIpcListeners()
    // 3) 回收 pty 会话（fire-and-forget：组件即将卸载，主进程按 id 幂等关闭）
    const activeSessionId = sessionId
    sessionId = null
    if (activeSessionId !== null) {
        void closeTerminalSession(activeSessionId)
    }
    // 4) xterm 资源释放（dispose 前先释放输入订阅，避免 dispose 后仍回调）
    inputSubscription?.dispose()
    inputSubscription = null
    terminal?.dispose()
    terminal = null
    fitAddon = null
})
</script>

<style scoped>
.terminal-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    color: var(--ui-text, var(--theme-text-color));
}

/* ---------------- 头部：标题 + 纯图标工具条（与 AI 面板头部同风格） ---------------- */
.terminal-panel-header {
    display: flex;
    flex: 0 0 auto;
    gap: 6px;
    align-items: center;
    padding: 8px var(--ui-pad, 12px);
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
}

.terminal-panel-title {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.terminal-panel-icon-btn {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    font-family: inherit;
    line-height: 1;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    cursor: pointer;
    background: transparent;
    border: var(--ui-hairline-width, 1px) solid transparent;
    border-radius: var(--ui-radius-sm, 2px);
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.terminal-panel-icon-btn svg {
    width: 16px;
    height: 16px;
}

.terminal-panel-icon-btn:hover:not(:disabled) {
    color: var(--ui-text, var(--theme-text-color));
    background: var(--ui-accent-soft, var(--theme-hover-background));
}

.terminal-panel-icon-btn:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.terminal-panel-icon-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

/* ---------------- 状态行：运行目录 / shell / 短暂操作反馈 ---------------- */
.terminal-panel-meta {
    display: flex;
    flex: 0 0 auto;
    gap: 12px;
    align-items: center;
    padding: 4px var(--ui-pad, 12px);
    overflow: hidden;
    font-size: 12px;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
}

.terminal-panel-meta-item {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.terminal-panel-meta-notice {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--ui-accent, var(--theme-accent-color));
}

/* ---------------- 终端视图：xterm 挂载点铺满剩余高度 ---------------- */
.terminal-panel-body {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}

.terminal-panel-host {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    padding: 4px 0 4px var(--ui-pad, 12px);
    overflow: hidden;
}

/* 创建中/失败覆盖层：只覆盖终端区域，头部工具条仍可操作（收起/重启） */
.terminal-panel-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: var(--ui-pad, 12px);
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    text-align: center;
    background-color: var(--ui-bg-sunken, var(--theme-background-color));
}

.terminal-panel-overlay--error {
    flex-direction: column;
}

.terminal-panel-error-message {
    margin: 0;
    color: var(--ui-danger, var(--theme-error-color));
}

.terminal-panel-retry,
.terminal-panel-exit-restart {
    flex: 0 0 auto;
    min-height: var(--ui-row-height, 28px);
    padding: 4px 16px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ui-text, var(--theme-text-color));
    cursor: pointer;
    background: var(--ui-accent-soft, var(--theme-hover-background));
    border: var(--ui-hairline-width, 1px) solid var(--ui-accent, var(--theme-accent-color));
    border-radius: var(--ui-radius-sm, 2px);
}

.terminal-panel-retry:focus-visible,
.terminal-panel-exit-restart:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

/* ---------------- 退出提示条：不遮挡最后输出 ---------------- */
.terminal-panel-exit {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
    align-items: center;
    padding: 6px var(--ui-pad, 12px);
    font-size: 12px;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    border-top: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
}

.terminal-panel-exit-message {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
