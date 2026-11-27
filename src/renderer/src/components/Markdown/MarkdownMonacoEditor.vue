<template>
    <div id="monaco-editor-container" ref="monacoEditorContainer" class="monaco-editor-container">
        <!-- FUN-09（editor-toggle-outline）：简易大纲下拉——
             从当前文档正则提取 ATX 标题行，点击项经 setPosition 跳转到对应行。
             A10（outlinePlus，opt-in）：额外支持 setext 标题、层级缩进归一化与过滤输入框 -->
        <div v-if="isOutlineVisible" class="monaco-outline-popup" @click.stop @mousedown.stop>
            <div class="monaco-outline-title">{{ t('editorUi.monacoOutline.title') }}</div>
            <input
                v-if="flags.outlinePlus"
                v-model="outlineFilterText"
                class="monaco-outline-filter"
                type="search"
                :placeholder="t('editorUi.monacoOutline.filterPlaceholder')"
                :aria-label="t('editorUi.monacoOutline.filterPlaceholder')"
            />
            <ul class="monaco-outline-list">
                <li
                    v-for="item in visibleOutlineItems"
                    :key="item.line"
                    class="monaco-outline-item"
                    :style="{ paddingLeft: item.paddingLeft + 'px' }"
                    :title="t('editorUi.monacoOutline.lineTitle', { line: item.line })"
                    @click="handleOutlineItemClick(item)"
                >
                    <span class="monaco-outline-level">H{{ item.level }}</span>
                    <span class="monaco-outline-text">{{ item.text }}</span>
                </li>
                <li v-if="visibleOutlineItems.length === 0" class="monaco-outline-empty">
                    {{ t('editorUi.monacoOutline.empty') }}
                </li>
            </ul>
        </div>
        <!-- P0-6：选中文本气泡工具栏 + Slash 命令（编写体验开关，默认关闭；组件零监听当禁用） -->
        <EditorBubbleToolbar
            v-if="flags.writingBubble || flags.writingSlash"
            :editor="bubbleEditorRef"
            :bubble-enabled="flags.writingBubble"
            :slash-enabled="flags.writingSlash"
        />
    </div>
</template>

<script lang="ts">
// FUN-09（editor-toggle-fold）：markdown 折叠提供器属「应用级注册」——Monaco 语言
// 注册表是全局的，registerFoldingRangeProvider 每个应用只需注册一次。
// 注意：`<script setup>` 顶层变量是「每实例作用域」，把标记放在那里会导致编辑器
// 每次挂载都重复注册 provider（补测暴露的真实缺陷），故标记放模块作用域。
let markdownFoldingProviderRegistered = false
</script>

<script setup lang="ts">
// 引入 Monaco Editor
// PF-03/CMP-28：先于一切 Monaco 使用引入 worker 注册与按需语言贡献
//（self.MonacoEnvironment.getWorker + editor.api 的 contributions/语言补齐）
import './monaco-worker-setup'
import { registerCustomLanguages } from './register-languages'
import * as monaco from 'monaco-editor'
import { ref, onMounted, watch, onBeforeUnmount, computed, nextTick, shallowRef } from 'vue'
import EventBus from '../../common/event-bus/event-bus'
import * as editor from './hemy-editor'
import { GetInlineMarkdownFormats } from './hemy-editor-common'
import type { MarkdownTOC } from '../../../../shared/types'
import { IPC } from '../../../../shared/ipc-channels'
import { t } from '../../common/i18n'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { useEventBus } from '../../composables/useEventBus'
import { logger } from '../../common/logger'
import { toFileUrl } from '../../../../shared/utils/path'
// 1.5.1（可选能力开关）：A6 拼写检查 / A10 大纲增强按设置运行时切换（默认关闭）
import { useFeatureFlags } from '../../composables/useFeatureFlags'
import {
    OUTLINE_PLUS_DEFAULT_LIMITS,
    extractOutlinePlus,
    filterOutlineItems
} from './editor-outline-plus'
import { applyEditorSpellcheck, resolveSpellcheckLanguage } from './editor-spellcheck'
import { writingModeState } from './useWritingMode'
import { EditorBubbleToolbar } from './writing-bubble'
import {
    loadCursorSession,
    saveCursorSession,
    type EditorCursorSession
} from './editor-cursor-session'
import {
    recordSelectionStats,
    recordWritingStats,
    resetWritingStatsBaselineForFile
} from './useWritingSession'
// 1.5.0（编辑器 → 预览滚动同步）：锚点归一化纯函数（与预览侧同一模块，口径唯一）
import { ComputeEditorScrollAnchor, type EditorScrollAnchor } from './preview-scroll-sync'
// P1 性能基线：Monaco 编辑器就绪阶段标记（默认关闭，诊断开关下才输出）
import { PERF_MARK, perfMark, perfMeasure } from '../../common/perf'
// 1.5.2 E1：登记当前活动编辑器，供命令面板/工具菜单「剪藏并插入当前笔记」使用
import { clearActiveEditor, setActiveEditor } from '../../common/active-editor'

// 定义 emit 函数（sync-scroll：编辑器 → 预览单向滚动同步的触发端事件）
const emit = defineEmits(['update:code', 'sync-scroll'])

// M5：编辑器 9 个进程内事件订阅统一经 useEventBus 注册，卸载时自动清理
const { on: onEventBus } = useEventBus({ componentIdPrefix: 'MarkdownMonacoEditor' })

const props = defineProps({
    // 代码内容
    code: {
        type: String,
        default: 'test'
    },
    // 编辑器宽度
    editorAreaWidth: {
        type: String,
        default: '50%'
    },
    // 文件路径
    filePath: {
        type: String,
        default: ''
    }
})

const monacoEditorContainer = ref<HTMLElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null
/** 气泡工具栏使用 shallowRef 传递 Monaco 实例（避免 VNode 深度响应式代理） */
const bubbleEditorRef = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)

// 1.5.1 可选能力开关（A6/A7/A10；A8 为默认能力不受开关控制）
const { flags } = useFeatureFlags()

/* ==================== A6 拼写检查（opt-in，spellcheck） ====================
 * 不引入词典依赖：给 Monaco 实际输入 textarea 设置 spellcheck/lang，使用
 * Chromium / 操作系统自带拼写检查。开关变化、编辑器创建、延迟布局后各同步一次；
 * 关闭时恢复 spellcheck="false" 并移除 lang，不在关闭态保留开启属性。
 */
const spellcheckLanguage = resolveSpellcheckLanguage()

/** 按当前开关同步编辑器 textarea 的拼写检查属性（编辑器未就绪时安全跳过） */
function syncSpellcheckAttributes(): void {
    // 写作模式临时启用拼写检查（不修改系统能力开关）
    applyEditorSpellcheck(editorInstance, flags.spellcheck, spellcheckLanguage)
}

// A6：开关变化时即时切换（设置保存后主进程广播 -> useFeatureFlags 更新 -> 此处响应）
watch(
    () => [flags.spellcheck, writingModeState.enabled],
    () => syncSpellcheckAttributes()
)

/** A7/A8：AddActions 返回的显式释放句柄（原生 paste 监听等），卸载时统一 dispose */
const editorEnhanceDisposables: Array<{ dispose(): void } | undefined> = []

/* ==================== 写作模式（P0-1/2/4/5） ====================
 * 只影响呈现与编辑行为：
 * - 进入时保存当前编辑器选项并应用写作排版（字号/行高/隐藏行号等）；
 * - Typewriter：光标移动后把当前行稳定在视口中部；
 * - Focus：给当前段落加 decoration 高亮（CSS 在 WritingModeHost 全局样式中）；
 * - 光标/滚动/选区按文件路径写入 localStorage，切回文件时恢复。
 * 关闭写作模式后恢复进入前的选项；所有失败静默降级，不影响输入主链路。
 */
let savedWritingOptions: monaco.editor.IEditorOptions | null = null
let writingModeDecorations: monaco.editor.IEditorDecorationsCollection | null = null
let cursorSessionTimer: ReturnType<typeof setTimeout> | null = null
let writingStatsTimer: ReturnType<typeof setTimeout> | null = null
let writingModeFrameId: number | null = null
const writingModeDisposables: Array<{ dispose(): void } | undefined> = []
let writingListenersRegistered = false

function resolveLocalStorage(): Storage | null {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
        return null
    }
}

function captureCurrentEditorOptions(): monaco.editor.IEditorOptions {
    const raw = (editorInstance?.getRawOptions() ?? {}) as unknown as Record<string, unknown>
    return {
        fontSize: raw.fontSize as number,
        lineHeight: raw.lineHeight as number,
        lineNumbers: raw.lineNumbers as monaco.editor.LineNumbersType,
        minimap: raw.minimap as monaco.editor.IEditorMinimapOptions,
        folding: raw.folding as boolean,
        renderWhitespace: raw.renderWhitespace as 'none' | 'boundary' | 'selection' | 'all',
        renderLineHighlight: raw.renderLineHighlight as 'none' | 'gutter' | 'line' | 'all',
        glyphMargin: raw.glyphMargin as boolean,
        lineDecorationsWidth: raw.lineDecorationsWidth as number,
        padding: raw.padding as monaco.editor.IEditorPaddingOptions,
        wordWrap: raw.wordWrap as 'off' | 'on' | 'wordWrapColumn' | 'bounded',
        scrollBeyondLastLine: raw.scrollBeyondLastLine as boolean
    }
}

function applyWritingModeEditorOptions(): void {
    if (!editorInstance) return
    if (writingModeState.enabled) {
        if (savedWritingOptions === null) {
            savedWritingOptions = captureCurrentEditorOptions()
        }
        editorInstance.updateOptions({
            lineNumbers: 'off',
            minimap: { enabled: false },
            folding: false,
            renderWhitespace: 'none',
            renderLineHighlight:
                flags.writingFocus && writingModeState.focusParagraph ? 'none' : 'line',
            glyphMargin: false,
            lineDecorationsWidth: 0,
            wordWrap: 'on',
            scrollBeyondLastLine: true,
            ...(flags.writingTypography
                ? {
                      lineHeight: writingModeState.lineHeight,
                      fontSize: writingModeState.fontSize,
                      padding: { top: 32, bottom: 32 }
                  }
                : {})
        })
    } else if (savedWritingOptions !== null) {
        editorInstance.updateOptions(savedWritingOptions)
        savedWritingOptions = null
    }
}

/** 当前段落的行范围（空行/标题作为分隔；范围限制在文档内） */
function computeCurrentParagraphRange(): monaco.Range | null {
    if (!editorInstance) return null
    const model = editorInstance.getModel()
    const position = editorInstance.getPosition()
    if (!model || !position) return null
    const isBoundary = (lineNumber: number): boolean => {
        const text = model.getLineContent(lineNumber)
        return text.trim().length === 0 || /^\s{0,3}#{1,6}\s/.test(text)
    }
    let start = position.lineNumber
    while (start > 1 && !isBoundary(start - 1)) start -= 1
    let end = position.lineNumber
    while (end < model.getLineCount() && !isBoundary(end + 1)) end += 1
    return new monaco.Range(start, 1, end, model.getLineMaxColumn(end))
}

function updateWritingFocusDecoration(): void {
    if (!editorInstance) return
    if (!writingModeState.enabled || !flags.writingFocus || !writingModeState.focusParagraph) {
        writingModeDecorations?.clear()
        return
    }
    const range = computeCurrentParagraphRange()
    if (!range) {
        writingModeDecorations?.clear()
        return
    }
    if (!writingModeDecorations) {
        writingModeDecorations = editorInstance.createDecorationsCollection([])
    }
    writingModeDecorations.set([
        {
            range,
            options: {
                isWholeLine: true,
                className: 'writing-paragraph-focus'
            }
        }
    ])
}

/** Typewriter：把当前行放到视口垂直中部；rAF 合帧，避免连续键入时多次 reveal */
function scheduleTypewriterReveal(): void {
    if (
        !editorInstance ||
        !writingModeState.enabled ||
        !flags.writingTypewriter ||
        !writingModeState.typewriter
    ) {
        return
    }
    const position = editorInstance.getPosition()
    if (!position || writingModeFrameId !== null) return
    if (typeof requestAnimationFrame !== 'function') {
        editorInstance.revealLineInCenter(position.lineNumber, monaco.editor.ScrollType.Smooth)
        return
    }
    writingModeFrameId = requestAnimationFrame(() => {
        writingModeFrameId = null
        const current = editorInstance?.getPosition()
        if (
            !current ||
            !writingModeState.enabled ||
            !flags.writingTypewriter ||
            !writingModeState.typewriter
        ) {
            return
        }
        editorInstance?.revealLineInCenter(current.lineNumber, monaco.editor.ScrollType.Smooth)
    })
}

/** 按文件路径恢复光标/滚动/选区（内容 setModel 后异步等待一帧） */
function restoreCursorSessionForPath(filePath: string): void {
    if (!filePath || !flags.writingSessionRestore) return
    void nextTick(() => {
        setTimeout(() => {
            if (!editorInstance || props.filePath !== filePath) return
            const model = editorInstance.getModel()
            if (!model) return
            const session = loadCursorSession(resolveLocalStorage(), filePath)
            if (!session) return
            const lineNumber = Math.min(session.lineNumber, model.getLineCount())
            const column = Math.min(session.column, model.getLineMaxColumn(Math.max(1, lineNumber)))
            const selection = session.selection
                ? new monaco.Selection(
                      Math.min(session.selection.startLineNumber, model.getLineCount()),
                      Math.min(
                          session.selection.startColumn,
                          model.getLineMaxColumn(
                              Math.min(session.selection.startLineNumber, model.getLineCount())
                          )
                      ),
                      Math.min(session.selection.endLineNumber, model.getLineCount()),
                      Math.min(
                          session.selection.endColumn,
                          model.getLineMaxColumn(
                              Math.min(session.selection.endLineNumber, model.getLineCount())
                          )
                      )
                  )
                : null
            if (selection) {
                editorInstance.setSelection(selection)
            } else {
                editorInstance.setPosition({ lineNumber, column })
            }
            editorInstance.setScrollTop(Math.max(0, session.scrollTop))
        }, 0)
    })
}

/** 保存当前光标/滚动/选区会话（防抖；仅在有活动文件路径时写入） */
function saveCursorSessionNow(): void {
    if (!editorInstance || !props.filePath || !flags.writingSessionRestore) return
    const position = editorInstance.getPosition()
    if (!position) return
    const selection = editorInstance.getSelection()
    const session: EditorCursorSession = {
        lineNumber: position.lineNumber,
        column: position.column,
        scrollTop: editorInstance.getScrollTop(),
        selection:
            selection && !selection.isEmpty()
                ? {
                      startLineNumber: selection.startLineNumber,
                      startColumn: selection.startColumn,
                      endLineNumber: selection.endLineNumber,
                      endColumn: selection.endColumn
                  }
                : undefined
    }
    saveCursorSession(resolveLocalStorage(), props.filePath, session)
}

function scheduleWritingStats(): void {
    if (!flags.writingStats) return
    if (writingStatsTimer !== null) clearTimeout(writingStatsTimer)
    writingStatsTimer = setTimeout(() => {
        writingStatsTimer = null
        const model = editorInstance?.getModel()
        if (!model) return
        recordWritingStats(model.getValue(), props.filePath)
    }, 250)
}

function scheduleSaveCursorSession(): void {
    if (cursorSessionTimer !== null) clearTimeout(cursorSessionTimer)
    cursorSessionTimer = setTimeout(() => {
        cursorSessionTimer = null
        saveCursorSessionNow()
    }, 300)
}

/** 注册写作模式/光标恢复监听（编辑器创建后调用一次） */
function registerWritingModeListeners(): void {
    if (!editorInstance) return
    if (writingListenersRegistered) return
    if (!hasAnyWritingEditorFeature()) return
    writingListenersRegistered = true
    writingModeDisposables.push(
        editorInstance.onDidChangeCursorPosition(() => {
            updateWritingFocusDecoration()
            if (flags.writingStats) {
                const selection = editorInstance?.getSelection()
                const model = editorInstance?.getModel()
                if (selection && model && !selection.isEmpty()) {
                    recordSelectionStats(model.getValueInRange(selection))
                } else {
                    recordSelectionStats('')
                }
            }
            scheduleTypewriterReveal()
            scheduleSaveCursorSession()
        })
    )
    writingModeDisposables.push(
        editorInstance.onDidScrollChange(() => {
            scheduleSaveCursorSession()
        })
    )
    writingModeDisposables.push(
        editorInstance.onDidChangeModelContent(() => {
            updateWritingFocusDecoration()
            scheduleWritingStats()
            scheduleSaveCursorSession()
        })
    )
}

/** 是否需要为写作体验注册编辑器监听（全部关闭时零监听，保持旧行为） */
function hasAnyWritingEditorFeature(): boolean {
    return (
        (writingModeState.enabled && (flags.writingTypewriter || flags.writingFocus)) ||
        flags.writingStats ||
        flags.writingSessionRestore
    )
}

watch(
    () => [
        writingModeState.enabled,
        writingModeState.typewriter,
        writingModeState.focusParagraph,
        writingModeState.fontSize,
        writingModeState.lineHeight,
        flags.writingTypewriter,
        flags.writingFocus,
        flags.writingTypography,
        flags.writingStats,
        flags.writingSessionRestore
    ],
    () => {
        applyWritingModeEditorOptions()
        updateWritingFocusDecoration()
        scheduleTypewriterReveal()
        // 配置可能在编辑器创建后才从主进程加载完成：首次出现写作能力时补注册监听
        registerWritingModeListeners()
        if (flags.writingSessionRestore && props.filePath) {
            restoreCursorSessionForPath(props.filePath)
        }
    }
)

watch(
    () => props.filePath,
    (newPath) => {
        if (!newPath) return
        applyWritingModeEditorOptions()
        resetWritingStatsBaselineForFile(newPath)
        restoreCursorSessionForPath(newPath)
    }
)

/* ==================== 1.5.0 编辑器 → 预览单向滚动同步（触发端） ====================
 * 三条触发路径统一收敛为一个 `sync-scroll` 事件（父组件再补 seq 并透传给预览）：
 * 1. onDidScrollChange：滚轮/PageDown/大纲跳转/光标 reveal 等一切滚动 -> rAF 合帧，
 *    每帧最多发一次（取可见区首行 + scrollTop/scrollHeight 归一化比例）；
 * 2. onDidChangeModelContent：键入/回车会触发 Monaco 自动滚动，但滚动事件偶发早于
 *    重排完成 -> 150~200ms 尾随防抖后再发一次（连续输入只发最后一帧，不逐字符计算）；
 * 3. onDidChangeCursorPosition（reason=Explicit）：键盘/鼠标移动光标的兜底路径
 *    （Monaco 内部 reveal 不一定触发滚动事件），同样 rAF 合帧。
 * 只发轻量 { line, ratio }，不做任何 DOM/预览侧计算；卸载时取消帧/防抖并 dispose 订阅。
 */
/** 内容变化后的尾随防抖（150~200ms 区间）：覆盖输入导致的光标自动 reveal */
const SCROLL_SYNC_CONTENT_DEBOUNCE_MS = 180
/** rAF 合帧句柄（null = 无待执行帧） */
let scrollSyncFrameId: number | null = null
/** 内容变化尾随防抖计时器 */
let scrollSyncContentTimer: ReturnType<typeof setTimeout> | null = null
/** 编辑器事件订阅句柄（卸载时统一 dispose；单测桩可能不返回句柄，故按可空处理） */
const scrollSyncDisposables: Array<{ dispose(): void } | undefined> = []

/** 读取一次编辑器滚动锚点（可见区首行 + 滚动比例）；无实例/取不到可见区时返回 null */
function readEditorScrollAnchor(): EditorScrollAnchor | null {
    if (!editorInstance) {
        return null
    }
    const visibleRanges = editorInstance.getVisibleRanges()
    const startLine = visibleRanges.length > 0 ? visibleRanges[0].startLineNumber : 1
    const layoutInfo = editorInstance.getLayoutInfo()
    return ComputeEditorScrollAnchor(
        startLine,
        editorInstance.getScrollTop(),
        editorInstance.getScrollHeight(),
        layoutInfo ? layoutInfo.height : 0
    )
}

/** 立即发出一次同步锚点（取不到数据/计算异常时静默跳过，绝不影响编辑器主链路） */
function emitScrollSyncAnchor(): void {
    try {
        const anchor = readEditorScrollAnchor()
        if (!anchor) {
            return
        }
        emit('sync-scroll', anchor)
    } catch (error) {
        // 滚动同步属体验增强：编排/预览侧的失败不能反向影响编辑器输入与渲染
        logger.warn('[MarkdownMonacoEditor] 滚动同步锚点计算失败，已跳过本次同步:', error)
    }
}

/** 滚动事件触发：rAF 合帧（同一帧内多次滚动只发最后一次位置） */
function scheduleScrollSyncFromScroll(): void {
    if (scrollSyncFrameId !== null) {
        return
    }
    // 无 rAF 环境（单测/极旧运行时）退化为同步发出，保持事件语义
    if (typeof requestAnimationFrame !== 'function') {
        emitScrollSyncAnchor()
        return
    }
    scrollSyncFrameId = requestAnimationFrame(() => {
        scrollSyncFrameId = null
        emitScrollSyncAnchor()
    })
}

/** 内容变化触发：尾随防抖（连续输入只发最终位置，避免逐字符触发预览级计算） */
function scheduleScrollSyncFromContent(): void {
    if (scrollSyncContentTimer !== null) {
        clearTimeout(scrollSyncContentTimer)
    }
    scrollSyncContentTimer = setTimeout(() => {
        scrollSyncContentTimer = null
        emitScrollSyncAnchor()
    }, SCROLL_SYNC_CONTENT_DEBOUNCE_MS)
}

/** 取消未执行的滚动同步帧与防抖计时器（卸载时调用，幂等） */
function cancelScheduledScrollSync(): void {
    if (scrollSyncFrameId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(scrollSyncFrameId)
    }
    scrollSyncFrameId = null
    if (scrollSyncContentTimer !== null) {
        clearTimeout(scrollSyncContentTimer)
        scrollSyncContentTimer = null
    }
}

/** 注册滚动同步所需编辑器事件订阅（编辑器创建后调用一次） */
function registerScrollSyncListeners(): void {
    if (!editorInstance) {
        return
    }
    scrollSyncDisposables.push(
        editorInstance.onDidScrollChange(() => scheduleScrollSyncFromScroll())
    )
    // 光标变化兜底：仅处理显式原因（键盘/鼠标移动），内容回填等内部原因不触发
    scrollSyncDisposables.push(
        editorInstance.onDidChangeCursorPosition((event) => {
            if (event.reason === monaco.editor.CursorChangeReason.Explicit) {
                scheduleScrollSyncFromScroll()
            }
        })
    )
}

/**
 * 2026-11-20（编辑器底部光标不可见修复）：内容变化（回车/粘贴等）后，若光标落在
 * 视口最后一行且下方仍有行，把下一行也滚入视口，保证新行不贴状态栏（底部留一行）。
 * 仅做视口滚动，不改变光标位置/内容；rAF 合并连续键入。
 */
function revealCursorLineWithBreathingRoom(): void {
    if (!editorInstance) {
        return
    }
    const model = editorInstance.getModel()
    const position = editorInstance.getPosition()
    if (!model || !position) {
        return
    }
    const visibleRanges = editorInstance.getVisibleRanges()
    if (visibleRanges.length === 0) {
        return
    }
    const lastVisibleLine = visibleRanges[visibleRanges.length - 1].endLineNumber
    if (position.lineNumber < lastVisibleLine) {
        return
    }
    const targetLine = Math.min(position.lineNumber + 1, model.getLineCount())
    editorInstance.revealLineInCenterIfOutsideViewport(targetLine, monaco.editor.ScrollType.Smooth)
}

/* ==================== E10 Wiki 链接悬浮预览（1.5.1） ====================
 * 悬停 `[[target]]` / `[[target|alias]]` / `[[target#heading]]` 展示目标标题、
 * 相对路径、摘要与反链数量；数据源为工作区索引快照（复用既有 IPC，不新增通道）。
 *
 * 接线约束：
 * - 本模块按需动态 import（Monaco 已就绪后才加载），不增加首屏静态依赖；
 * - 文案在悬停时经 t() 求值（语言切换即时生效），解析/格式化逻辑全部在
 *   wiki-link-hover.ts；这里只做注册与释放；
 * - 任何失败（动态加载/注册）都静默降级，不影响编辑器主链路。
 */
/** hover provider 注册句柄（组件卸载时释放；null = 未注册/已释放） */
let wikiLinkHoverHandle: { dispose(): void } | null = null
/** 组件是否已卸载（动态 import 期间卸载时不再补注册） */
let wikiLinkHoverUnmounted = false

/** 动态加载并注册 Wiki 链接悬浮预览（编辑器创建后调用一次） */
async function setupWikiLinkHover(): Promise<void> {
    if (!editorInstance) {
        return
    }
    try {
        const { registerWikiLinkHover } = await import('./wiki-link-hover')
        if (wikiLinkHoverUnmounted || !editorInstance) {
            return
        }
        wikiLinkHoverHandle = registerWikiLinkHover(editorInstance, monaco, {
            labels: () => ({
                missing: t('editorUi.knowledge.statusMissing'),
                ambiguous: t('editorUi.knowledge.statusAmbiguous'),
                backlinks: (count: number) => t('editorUi.knowledge.summaryBacklinks', { count })
            })
        })
    } catch (error) {
        logger.warn('[E10] Wiki 链接悬浮预览注册失败，已跳过:', error)
    }
}

/* ==================== B1 Wiki 链接 Ctrl/Cmd+Click（1.5.1） ====================
 * 接线约束：
 * - 本模块按需动态 import（Monaco 已就绪后才加载），不增加首屏静态依赖；
 * - 宿主内部注册 `editor.onMouseDown`（仅 Ctrl/Cmd + 左键）与一个命令动作，
 *   普通点击不跳转；注册/动态加载失败静默降级，不影响编辑器主链路；
 * - 卸载时必须先 dispose 句柄（释放鼠标监听 / 命令 / 对话框宿主），再销毁 Monaco。
 */
/** B1 动作注册句柄（null = 未注册/已释放） */
let wikiLinkActionsHandle: { dispose(): void } | null = null
/** 组件是否已卸载（动态 import 期间卸载时不再补注册） */
let wikiLinkActionsUnmounted = false

/** 动态加载并注册 Wiki 链接 Ctrl/Cmd+Click 动作（编辑器创建后调用一次） */
async function setupWikiLinkActionsFeature(): Promise<void> {
    if (!editorInstance) {
        return
    }
    try {
        const { setupWikiLinkActions } = await import('./wiki-link-actions.index')
        if (wikiLinkActionsUnmounted || !editorInstance) {
            return
        }
        const handle = await setupWikiLinkActions(editorInstance, {
            // 源文件路径用于「相对源文件目录」解析阶段（与工作区索引同口径）
            getSourcePath: () => props.filePath
        })
        // setup 期间组件已卸载：立即释放，避免监听/命令悬挂
        if (wikiLinkActionsUnmounted) {
            handle?.dispose()
            return
        }
        wikiLinkActionsHandle = handle
    } catch (error) {
        logger.warn('[B1] Wiki 链接跳转注册失败，已跳过:', error)
    }
}

//let model: monaco.editor.ITextModel | null = null
//const registeredActions: string[] = []
//const registeredDecorations: string[] = []

// 定义 IPC 监听器处理函数（用于正确清理）
const handleInsertAfterCursorIPC = (_event: unknown, context: string) => {
    if (context && editorInstance) {
        editor.InsertAfterCursor(editorInstance, context)
    }
}

const handleInsertTextBlockTemplates = (_event: unknown, context: string) => {
    if (context && editorInstance) {
        editor.InsertAfterCursor(editorInstance, context)
    }
}

const handleUpdateOptions = (_event: unknown, option: string, newValue?: string | number) => {
    if (!editorInstance) {
        return
    }
    // CQ-1：MonacoEditorOpMaps 已按 MonacoEditorOpHandler 统一签名声明，可安全按字符串索引
    const applyOption = editor.OptMaps[option]
    if (applyOption) {
        applyOption(editorInstance, newValue)
    }
}

const handleTriggerUndoRedo = (_event: unknown, option: string) => {
    if (editorInstance) {
        editorInstance.trigger('keyboard', option, {})
    }
}

// 初始化编辑器 - 注册 IPC 监听器
window.electron.ipcRenderer.on(IPC.MONACO.AFTER_CURSOR, handleInsertAfterCursorIPC)
window.electron.ipcRenderer.on(IPC.MONACO.TEXT_BLOCK_TEMPLATES, handleInsertTextBlockTemplates)
window.electron.ipcRenderer.on(IPC.EDITOR.UPDATE_OPTIONS, handleUpdateOptions)
window.electron.ipcRenderer.on(IPC.MONACO.UNDO_REDO, handleTriggerUndoRedo)

// 监听代码内容变化（带值变化守卫，避免更新循环）
watch(
    () => props.code,
    (newCode) => {
        if (editorInstance) {
            // FE-13：空内容不再替换为 '# '——空文件应保持真正的空文档，
            // 否则外部把文件清空/打开空文件时会被注入 "# " 并触发脏标记。
            if (editorInstance.getValue() !== newCode) {
                editorInstance.setValue(newCode)
            }
        }
    }
)

/**
 * 本地文件路径 → Monaco model URI 字符串（统一 file:// 编码口径 + Uri.parse 兼容处理）。
 *
 * 迁移（渲染层公共接口归位）：原先三处直接 `` `file://${path}` `` 拼接（不归一化反斜杠、
 * 不编码中文/空格/#/?，与预览管线 toFileUrl 已分叉），现统一改用
 * `shared/utils/path.toFileUrl`。
 *
 * 回归发现（monaco-editor 0.57 `Uri.parse`）：shared 对 UNC 路径输出
 * `file:////server/share/...`（4 个斜杠，见 shared/utils/path.toFileUrl 注释）；
 * Monaco 要求「不含 authority 的 URI 的 path 不能以 // 开头」，会抛
 * `UriError: If a URI does not contain an authority component, ...`。
 * 原实现 `` `file://${'\\\\server\\share\\a.md'}` `` 恰好可被解析（整段落入 authority），
 * 因此统一后必须修掉该形态，否则网络共享路径切换文件会抛错。这里把 UNC 的 4 斜杠
 * 补成标准 `file://server/share/...`（仅作为 Monaco model 身份键，不参与文件系统访问；
 * 同一路径映射结果稳定，getModel/createModel 复用语义不变）。
 */
function toMonacoModelUrl(filePath: string): string {
    const fileUrl = toFileUrl(filePath)
    return fileUrl.startsWith('file:////') ? `file://${fileUrl.slice('file:////'.length)}` : fileUrl
}

// 监听文件路径变化,清理旧Model
// 迁移（渲染层公共接口归位）：model URI 统一改用 `shared/utils/path.toFileUrl`
// （经 toMonacoModelUrl 兼容处理），仍作为 model 的身份键使用，
// watch 的「旧路径销毁 / 新路径复用」语义不变。
watch(
    () => props.filePath,
    (newPath, oldPath) => {
        if (oldPath && editorInstance) {
            // 清理旧文件的 model
            const oldUri = monaco.Uri.parse(toMonacoModelUrl(oldPath))
            const oldModel = monaco.editor.getModel(oldUri)
            if (oldModel) {
                oldModel.dispose()
            }
        }

        if (newPath && editorInstance) {
            // 创建或获取新文件的 model
            const newUri = monaco.Uri.parse(toMonacoModelUrl(newPath))
            let newModel = monaco.editor.getModel(newUri)

            if (!newModel) {
                newModel = monaco.editor.createModel(props.code, 'markdown', newUri)
            }

            editorInstance.setModel(newModel)
        }
    }
)

// 监听父组件区域变化
watch(
    () => props.editorAreaWidth,
    () => {
        // 当父容器宽度变化时，只需要调用 layout() 让 Monaco 重新计算尺寸
        // 不需要设置容器宽度，因为容器始终是 100% 相对于父容器
        // PF-7：分栏拖拽期间该 props 每 mousemove 都变化，layout() 改为 rAF 合帧（每帧最多一次）
        scheduleMonacoLayout()
    }
)

/**
 * PF-7：Monaco layout 的 requestAnimationFrame 合帧器。
 * 分栏拖拽/窗口缩放会在一个事件循环内连续触发多次尺寸变化，逐次 layout() 属于全量重排，
 * 是拖拽卡顿的主要来源；改为「每帧最多 layout 一次」，最终尺寸仍由最后一次变化覆盖。
 * 无 rAF 环境（测试/极旧运行时）退化为立即 layout，保持既有行为。
 */
let layoutFrameId: number | null = null

function scheduleMonacoLayout(): void {
    if (!editorInstance) {
        return
    }
    if (typeof requestAnimationFrame !== 'function') {
        editorInstance.layout()
        return
    }
    if (layoutFrameId !== null) {
        return
    }
    layoutFrameId = requestAnimationFrame(() => {
        layoutFrameId = null
        editorInstance?.layout()
    })
}

/** PF-7：取消尚未执行的 layout 帧（组件卸载时调用） */
function cancelScheduledMonacoLayout(): void {
    if (layoutFrameId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(layoutFrameId)
    }
    layoutFrameId = null
}

const handleUpdateContext = (value: string) => {
    if (editorInstance) {
        editor.UpdateContext(editorInstance, value)
        // 格式命令执行后同步高亮状态（选区变化监听通常也会触发，这里保证一次即时更新）
        emitInlineFormatState()
    }
}

/** P0：把光标/选区的内联格式状态广播给工具栏 */
const emitInlineFormatState = () => {
    if (!editorInstance) {
        return
    }
    EventBus.$emit(EVENT_BUS.MONACO_FORMAT_STATE_CHANGED, GetInlineMarkdownFormats(editorInstance))
}

const handleRelayout = () => {
    // PF-7：重新布局同样合帧，避免与分栏拖拽/窗口 resize 的多次请求叠加
    scheduleMonacoLayout()
}

function handleEditCompResize() {
    if (editorInstance && monacoEditorContainer.value) {
        // PF-7：窗口尺寸变化可能连续触发，layout 合帧执行
        scheduleMonacoLayout()
    }
}

const handleInsertAfterCursor = (value: string) => {
    if (editorInstance) {
        editor.InsertAfterCursor(editorInstance, value)
    }
}

const handleUpdateEditorOptions = (_event: unknown, settings: Record<string, unknown>) => {
    if (editorInstance) {
        editor.updateEditorOptions(editorInstance, settings)
    }
}

const handleLocateTargetLine = (item: MarkdownTOC) => {
    if (editorInstance) {
        editorInstance.revealLines(
            item.lineNumber,
            item.lineNumber + 20,
            monaco.editor.ScrollType.Smooth
        )
    }
}

// ==================== FUN-09：编辑器菜单动作（事件名与菜单代理的契约固定，勿改） ====================

// FUN-09（editor-toggle-fold）配套：markdown 折叠提供器（模块级，整个应用只注册一次）。
// Monaco 内置 markdown 语言仅支持 <!-- #region --> 标记折叠；这里补充“ATX 标题层级 +
// 围栏代码块”折叠范围，使 foldAll / unfoldAll / foldLevel1~6 真正作用于标题与代码块。
// Monaco 会合并多个折叠提供器的结果（syntaxRangeProvider 收集全部 provider），与内置标记折叠不冲突。
// 大文件保护：只扫描前 N 行参与折叠，与 editor-options 的 foldingMaximumRegions（5000）呼应
const FOLD_SCAN_LINE_LIMIT = 20000
// ATX 标题：行首最多 3 个空格 + 1~6 个 # + 至少一个空白
const FOLD_HEADING_REGEX = /^(\s{0,3})(#{1,6})(?:[ \t]+)(.*)$/
// 围栏开启：3 个及以上 ` 或 ~（` 后可跟语言信息，~ 后按 CommonMark 不应有信息，此处宽松处理）
const FOLD_FENCE_OPEN_REGEX = /^\s*(`{3,}|~{3,})/

function registerMarkdownFoldingProvider(): void {
    if (markdownFoldingProviderRegistered) {
        return
    }
    markdownFoldingProviderRegistered = true

    monaco.languages.registerFoldingRangeProvider('markdown', {
        provideFoldingRanges(model) {
            const ranges: monaco.languages.FoldingRange[] = []
            const lineCount = model.getLineCount()
            const scanEnd = Math.min(lineCount, FOLD_SCAN_LINE_LIMIT)
            // 未闭合的标题（层级）/围栏（字符、最小长度）栈
            const headingStack: { line: number; level: number }[] = []
            const fenceStack: { line: number; char: string; minLen: number }[] = []

            // 新标题 level 出现时：关闭所有 level >= 它的开放标题，结束行 = 新标题行 - 1
            const closeHeadingsBefore = (line: number, level: number) => {
                // CQ-15：以"长度 > 0 + 取栈顶判断 level"作为循环条件，再弹出，避免对 pop() 结果
                // 使用非空断言；循环条件与原实现（length > 0 && 栈顶 level >= 新 level）等价。
                while (headingStack.length > 0) {
                    const top = headingStack[headingStack.length - 1]
                    if (top.level < level) {
                        break
                    }
                    headingStack.pop()
                    if (line - 1 > top.line) {
                        ranges.push({
                            start: top.line,
                            end: line - 1,
                            kind: monaco.languages.FoldingRangeKind.Region
                        })
                    }
                }
            }

            for (let i = 1; i <= scanEnd; i++) {
                const lineText = model.getLineContent(i)
                // 超长行不可能作为标题/围栏，跳过以保护扫描性能
                if (lineText.length > 512) {
                    continue
                }
                // 1) 围栏关闭优先（闭合行仅含同一字符的 3+ 个围栏符）
                if (fenceStack.length > 0) {
                    const top = fenceStack[fenceStack.length - 1]
                    const closeMatch = lineText.match(
                        top.char === '`' ? /^\s*`{3,}\s*$/ : /^\s*~{3,}\s*$/
                    )
                    if (closeMatch && closeMatch[0].trim().length >= top.minLen) {
                        fenceStack.pop()
                        if (i > top.line) {
                            ranges.push({
                                start: top.line,
                                end: i,
                                kind: monaco.languages.FoldingRangeKind.Region
                            })
                        }
                        continue
                    }
                }
                // 2) 标题
                const headingMatch = lineText.match(FOLD_HEADING_REGEX)
                if (headingMatch) {
                    const level = headingMatch[2].length
                    closeHeadingsBefore(i, level)
                    headingStack.push({ line: i, level })
                    continue
                }
                // 3) 围栏开启
                const fenceMatch = lineText.match(FOLD_FENCE_OPEN_REGEX)
                if (fenceMatch) {
                    const marker = fenceMatch[1]
                    fenceStack.push({ line: i, char: marker[0], minLen: marker.length })
                }
            }

            // 文件末尾：关闭所有未闭合的结构
            for (const top of headingStack) {
                if (scanEnd > top.line) {
                    ranges.push({
                        start: top.line,
                        end: scanEnd,
                        kind: monaco.languages.FoldingRangeKind.Region
                    })
                }
            }
            for (const top of fenceStack) {
                if (scanEnd > top.line) {
                    ranges.push({
                        start: top.line,
                        end: scanEnd,
                        kind: monaco.languages.FoldingRangeKind.Region
                    })
                }
            }

            // Monaco 要求折叠范围按起始行预排序（foldingRanges.js 文档约定）
            ranges.sort((a, b) => a.start - b.start || a.end - b.end)
            return ranges
        }
    })
}

// FUN-09（editor-toggle-fold）：折叠/展开全部代码块，或按标题层级折叠
// payload 契约（与菜单代理 r2-func-menu 同步）：
//   { mode: 'fold-all' } 全部折叠；{ mode: 'expand-all' } 全部展开；
//   { mode: 'fold-level', level: 1~6 } 折叠到指定标题层级；无 payload 时做整体切换
interface EditorFoldPayload {
    mode?: 'fold-all' | 'expand-all' | 'fold-level'
    level?: number
}
// 内部轻量访问：折叠控制器（editor.contrib.folding）暴露 getFoldingModel()，
// 其折叠模型带 regions（FoldingRegions，含 isCollapsed）。仅用于判断当前是否存在已折叠区域，
// 属 Monaco 未公开的内部 API——访问失败时降级为“全部折叠”（幂等、无害）。
interface FoldingRegionsLike {
    length: number
    isCollapsed(index: number): boolean
}
interface FoldingModelLike {
    regions: FoldingRegionsLike
}
interface FoldingControllerLike {
    getFoldingModel(): FoldingModelLike | Promise<FoldingModelLike>
}

async function hasAnyCollapsedRegion(): Promise<boolean> {
    if (!editorInstance) {
        return false
    }
    // CQ-15：getContribution 的泛型约束是 monaco 内部 IEditorContribution，而折叠控制器
    // 是编辑器内部私有实现（未导出类型），无法用公开类型精确表达；断言仅用于读取
    // getFoldingModel()，不改变运行时对象。
    const controller = editorInstance.getContribution(
        'editor.contrib.folding'
    ) as unknown as FoldingControllerLike | null
    if (!controller) {
        return false
    }
    try {
        const model = await controller.getFoldingModel()
        const regions = model?.regions
        if (!regions) {
            return false
        }
        for (let i = 0; i < regions.length; i++) {
            if (regions.isCollapsed(i)) {
                return true
            }
        }
    } catch {
        // 内部 API 变化时静默降级
    }
    return false
}

const handleToggleFold = async (payload?: EditorFoldPayload) => {
    if (!editorInstance) {
        return
    }
    const mode = payload?.mode
    if (mode === 'fold-all') {
        editorInstance.trigger('menu', 'editor.foldAll', null)
    } else if (mode === 'expand-all') {
        editorInstance.trigger('menu', 'editor.unfoldAll', null)
    } else if (mode === 'fold-level') {
        // Monaco 内建 editor.foldLevel1..7，菜单契约取值 1~6，这里钳制防御
        const level = Math.min(Math.max(Math.trunc(payload?.level ?? 1), 1), 7)
        editorInstance.trigger('menu', `editor.foldLevel${level}`, null)
    } else {
        // 无 payload：整体切换——已有折叠区则全部展开，否则全部折叠
        const hasCollapsed = await hasAnyCollapsedRegion()
        if (!editorInstance) {
            // await 期间组件可能已卸载
            return
        }
        editorInstance.trigger('menu', hasCollapsed ? 'editor.unfoldAll' : 'editor.foldAll', null)
    }
}

// FUN-09（editor-trigger-find）：打开 Monaco 查找（或替换）组件
// payload 契约：无 payload 打开查找；{ mode: 'replace' } 打开查找/替换
const handleTriggerFind = (payload?: { mode?: 'replace' }) => {
    if (!editorInstance) {
        return
    }
    const actionId =
        payload?.mode === 'replace' ? 'editor.action.startFindReplaceAction' : 'actions.find'
    const action = editorInstance.getAction(actionId)
    if (action) {
        action.run()
    } else {
        editorInstance.trigger('menu', actionId, null)
    }
    editorInstance.focus()
}

// FUN-09（editor-jump-line）：跳转到指定行（含行号范围校验：越界钳制到 [1, 总行数]）
// payload 契约：
// - `{ line: number }`：直接跳转（其他调用方/测试显式指定行号；越界钳制，非法值忽略）；
// - 无 payload：唤起 Monaco 自带「跳转到行」快捷输入（editor.action.gotoLine），
//   行号输入与校验由 Monaco 原生 UI 完成——菜单「编辑 → 跳转到行」的兜底路径，
//   替代原浏览器 window.prompt（alert/prompt 应用内化批次，事件名契约不变）。
const handleJumpToLine = (payload?: { line?: number }) => {
    if (!editorInstance) {
        return
    }
    const rawLine = payload?.line
    if (rawLine === undefined) {
        // 无行号：交给 Monaco 原生跳行快捷输入（Ctrl+G 同一入口，自带行号解析/范围校验）
        const action = editorInstance.getAction('editor.action.gotoLine')
        if (action) {
            action.run()
        } else {
            // 极旧 Monaco 版本无该 action 时用 trigger 兜底（同一 command id）
            editorInstance.trigger('menu', 'editor.action.gotoLine', null)
        }
        editorInstance.focus()
        return
    }
    if (typeof rawLine !== 'number' || !Number.isFinite(rawLine)) {
        return
    }
    const lineCount = editorInstance.getModel()?.getLineCount() ?? 0
    if (lineCount <= 0) {
        return
    }
    const targetLine = Math.min(Math.max(Math.trunc(rawLine), 1), lineCount)
    if (targetLine !== rawLine) {
        logger.warn(
            `[FUN-09] editor-jump-line 行号 ${rawLine} 越界（有效范围 1~${lineCount}），已钳制到 ${targetLine}`
        )
    }
    editorInstance.setPosition({ lineNumber: targetLine, column: 1 })
    editorInstance.revealLineInCenter(targetLine)
    editorInstance.focus()
}

// FUN-09（editor-toggle-outline）：显示/隐藏简易大纲下拉
interface OutlineItem {
    line: number
    level: number
    text: string
    /** 条目左内边距（px）：普通模式按 ATX 层级；A10 增强模式按归一化层级 */
    paddingLeft: number
}
const isOutlineVisible = ref(false)
const outlineItems = ref<OutlineItem[]>([])
// A10（outlinePlus，opt-in）：过滤输入框关键词（开关关闭时不渲染输入框）
const outlineFilterText = ref('')
// 大文件保护：最多扫描的行数（超出部分不进大纲）
const OUTLINE_MAX_SCAN_LINES = 100000
// ATX 标题正则（与折叠提供器一致）
const OUTLINE_HEADING_REGEX = /^(\s{0,3})(#{1,6})(?:[ \t]+)(.*)$/

/** 原实现的 ATX 层级缩进：首级 8px，每级 +14px */
function computeAtxOutlinePadding(level: number): number {
    return 8 + (level - 1) * 14
}

function extractOutlineItems(): OutlineItem[] {
    const items: OutlineItem[] = []
    if (!editorInstance) {
        return items
    }
    const model = editorInstance.getModel()
    if (!model) {
        return items
    }
    // A10：增强大纲（setext 标题 / 围栏内标题排除 / 层级缩进归一化 / 上限）
    if (flags.outlinePlus) {
        return extractOutlinePlus(
            {
                lineCount: model.getLineCount(),
                getLineContent: (lineNumber: number) => model.getLineContent(lineNumber)
            },
            t('editorUi.monacoOutline.emptyTitle'),
            {
                ...OUTLINE_PLUS_DEFAULT_LIMITS,
                maxScanLines: OUTLINE_MAX_SCAN_LINES
            }
        ).map((item) => ({
            line: item.line,
            level: item.level,
            text: item.text,
            paddingLeft: 8 + item.indent * 14
        }))
    }
    const scanEnd = Math.min(model.getLineCount(), OUTLINE_MAX_SCAN_LINES)
    for (let i = 1; i <= scanEnd; i++) {
        const lineText = model.getLineContent(i)
        if (lineText.length > 512) {
            continue
        }
        const match = lineText.match(OUTLINE_HEADING_REGEX)
        if (!match) {
            continue
        }
        const level = match[2].length
        // 去掉标题文本末尾的闭合 #（如 "## 标题 ##" → "标题"）
        const text = match[3].replace(/#+\s*$/, '').trim()
        items.push({
            line: i,
            level,
            text: text || t('editorUi.monacoOutline.emptyTitle'),
            paddingLeft: computeAtxOutlinePadding(level)
        })
    }
    return items
}

// A10：开关关闭时展示原始条目列表（与原实现一致）；开启时按关键词过滤
const visibleOutlineItems = computed(() => {
    if (!flags.outlinePlus) {
        return outlineItems.value
    }
    return filterOutlineItems(outlineItems.value, outlineFilterText.value)
})

// A10：开关在运行时切换时，若大纲打开则重新提取；同时清空过滤词
watch(
    () => flags.outlinePlus,
    () => {
        outlineFilterText.value = ''
        if (isOutlineVisible.value) {
            outlineItems.value = extractOutlineItems()
        }
    }
)

function handleToggleOutline() {
    if (!editorInstance) {
        return
    }
    if (isOutlineVisible.value) {
        isOutlineVisible.value = false
        return
    }
    outlineFilterText.value = ''
    outlineItems.value = extractOutlineItems()
    isOutlineVisible.value = true
}

function handleOutlineItemClick(item: OutlineItem) {
    isOutlineVisible.value = false
    if (!editorInstance) {
        return
    }
    editorInstance.setPosition({ lineNumber: item.line, column: 1 })
    editorInstance.revealLineInCenter(item.line)
    editorInstance.focus()
}

// 点击大纲下拉以外区域关闭大纲
function handleOutlineOutsideClick(event: MouseEvent) {
    if (!isOutlineVisible.value) {
        return
    }
    const target = event.target as HTMLElement | null
    if (target && !target.closest('.monaco-outline-popup')) {
        isOutlineVisible.value = false
    }
}

// Esc 关闭大纲
function handleOutlineEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOutlineVisible.value) {
        isOutlineVisible.value = false
    }
}

// P-2（PF-13）：window scroll 监听已移除——其 EventBus 事件无任何订阅者，纯浪费 CPU

onMounted(async () => {
    if (monacoEditorContainer.value) {
        monacoEditorContainer.value.style.width = '100%'
        monacoEditorContainer.value.style.height = '100%'

        // 创建模型

        // 注册自定义语言支持
        registerCustomLanguages()
        // FUN-09（editor-toggle-fold 配套）：注册 markdown 折叠提供器（围栏代码块 + ATX 标题）
        registerMarkdownFoldingProvider()
        /*model = monaco.editor.createModel(
            props.code,
            'markdown',
            monaco.Uri.parse(toMonacoModelUrl(props.filePath || 'untitled.md'))
        )*/

        editorInstance = monaco.editor.create(
            monacoEditorContainer.value,
            editor.Options,
            editor.Override
        )
        bubbleEditorRef.value = editorInstance
        // 1.5.2 E1：编辑器创建即登记为活动编辑器；获得焦点时更新（多编辑器场景取最近聚焦者）
        setActiveEditor(editorInstance)
        const focusDisposable = editorInstance.onDidFocusEditorText?.(() => {
            if (editorInstance) {
                setActiveEditor(editorInstance)
            }
        })
        if (focusDisposable && typeof focusDisposable.dispose === 'function') {
            editorEnhanceDisposables.push(focusDisposable)
        }
        const formatStateDisposable = editorInstance.onDidChangeCursorSelection?.(() => {
            emitInlineFormatState()
        })
        if (formatStateDisposable && typeof formatStateDisposable.dispose === 'function') {
            editorEnhanceDisposables.push(formatStateDisposable)
        }
        emitInlineFormatState()

        // 结构优化第 2 批 2.2（H4）：编辑器改为二级懒加载后，「打开文件 / 启动恢复」的
        // SHOW_SELECTED_FILE_CONTEXT 可能先于编辑器挂载到达（父组件已把内容写入 code prop）。
        // 创建后的模型初始值为空，这里补一次初始内容，避免懒加载窗口内打开的文件显示为空。
        if (props.code && editorInstance.getValue() !== props.code) {
            editorInstance.setValue(props.code)
        }

        editorInstance.onDidChangeModelContent(() => {
            const model = editorInstance?.getModel()
            if (!model) {
                return
            }
            // P1/PF-3：每次内容变化只取一次全文（父组件/预览复用同一变量），
            // 状态栏长度改用模型的 O(1) 长度查询，避免再对全文做一次取串/派生。
            const context = model.getValue()
            emit('update:code', context)
            EventBus.$emit(EVENT_BUS.STATUS_BAR_CONTEXT_LENGTH, model.getValueLength())
            scheduleWritingStats()
            // 1.5.0（滚动同步）：键入/回车会触发 Monaco 自动滚动，尾随防抖后再同步一次预览
            scheduleScrollSyncFromContent()
            // 2026-11-20（编辑器底部光标不可见修复）：内容变化（含回车）后，
            // 若光标落在视口最后一行且下面还有行，把下一行也滚入视口（底部留一行安全区）。
            // 写作模式 Typewriter 由光标居中接管，避免与底部留白 reveal 竞争。
            if (!(
                writingModeState.enabled &&
                flags.writingTypewriter &&
                writingModeState.typewriter
            )) {
                requestAnimationFrame(revealCursorLineWithBreathingRoom)
            }
        })

        // 1.5.0（滚动同步）：滚动/光标兜底两条订阅（内容变化在上一行回调内触发）
        registerScrollSyncListeners()

        // E10（Wiki 链接悬浮预览）：Monaco 就绪后按需动态加载并注册（不增加首屏依赖）
        void setupWikiLinkHover()

        // B1（Wiki 链接 Ctrl/Cmd+Click）：Monaco 就绪后按需动态加载并注册
        void setupWikiLinkActionsFeature()

        editor.DidChange(editorInstance)
        editor.KeyMaps(editorInstance)
        // A7/A8：AddActions 返回的显式句柄（原生 paste 监听等）随组件卸载释放
        const actionDisposables = editor.AddActions(editorInstance)
        if (actionDisposables) {
            editorEnhanceDisposables.push(...actionDisposables)
        }

        // A6：编辑器创建后按当前开关同步拼写检查属性（默认关闭 -> spellcheck=false）
        syncSpellcheckAttributes()
        // P0 写作模式/光标恢复：编辑器创建后注册监听、应用排版并恢复上次会话
        registerWritingModeListeners()
        applyWritingModeEditorOptions()
        if (props.filePath) {
            restoreCursorSessionForPath(props.filePath)
        }

        // 初始化后立即布局，确保编辑器尺寸正确
        editorInstance.layout()

        // P1 性能基线：Monaco 实例创建 + 首次 layout 完成即视为 editor-ready
        perfMark(PERF_MARK.EDITOR_READY)
        perfMeasure(PERF_MARK.EDITOR_READY)

        // 延迟再次布局，确保DOM完全渲染后尺寸正确
        setTimeout(() => {
            if (editorInstance) {
                editorInstance.layout()
                // A6：Monaco 可能在初始化/重排后重建输入 textarea，延迟再同步一次属性
                syncSpellcheckAttributes()
            }
        }, 100)

        // 主动请求编辑器配置，解决初始化时序问题
        // 主进程的 init-editor-setting 可能在 editorInstance 创建前就已发送
        try {
            const settings = await window.electron.ipcRenderer.invoke(IPC.EDITOR.GET_SETTING)
            if (settings && editorInstance) {
                editor.updateEditorOptions(editorInstance, settings)
            }
        } catch (e) {
            logger.warn('Failed to get editor setting on mount:', e)
        }
    }

    // 注册 EventBus 监听器（M5：useEventBus 统一注册，卸载时自动清理）
    onEventBus(EVENT_BUS.MONACO_UPDATE_HEADER_FORMAT, handleUpdateContext)
    onEventBus(EVENT_BUS.MONACO_UPDATE_FONT_FORMAT, handleUpdateContext)
    onEventBus(EVENT_BUS.MONACO_INSERT_TEXT, handleInsertAfterCursor)
    onEventBus(EVENT_BUS.MONACO_LOCATE_TARGET_LINE, handleLocateTargetLine)
    onEventBus(EVENT_BUS.MONACO_RELAYOUT, handleRelayout)

    // FUN-09：编辑器菜单动作（事件名与菜单代理的契约固定，勿改）
    onEventBus(EVENT_BUS.EDITOR_TOGGLE_FOLD, handleToggleFold)
    onEventBus(EVENT_BUS.EDITOR_TRIGGER_FIND, handleTriggerFind)
    onEventBus(EVENT_BUS.EDITOR_JUMP_LINE, handleJumpToLine)
    onEventBus(EVENT_BUS.EDITOR_TOGGLE_OUTLINE, handleToggleOutline)
    // FUN-09（editor-toggle-outline）配套：点击外部/Esc 关闭大纲下拉
    document.addEventListener('click', handleOutlineOutsideClick)
    document.addEventListener('keydown', handleOutlineEscape)

    // 注册 IPC 监听器
    // P2 死通道清理：原 EDITOR.SETTING_UPDATED 监听已删除——该通道唯一发送方是
    // 已删除的不可达 JSDOM 编辑器设置对话框；编辑器配置初始化/更新统一走
    // EDITOR.INIT_SETTING 与 EDITOR.UPDATE_OPTIONS。
    // 监听编辑器配置初始化
    window.electron.ipcRenderer.on(IPC.EDITOR.INIT_SETTING, handleUpdateEditorOptions)

    // 窗口事件监听（P-2/PF-13：scroll 监听已移除）
    window.addEventListener('resize', handleEditCompResize)
})

onBeforeUnmount(() => {
    // 1. EventBus 监听器已由 useEventBus 在 onBeforeUnmount 自动清理；
    //    这里只清理 DOM 监听与大纲关闭监听
    document.removeEventListener('click', handleOutlineOutsideClick)
    document.removeEventListener('keydown', handleOutlineEscape)

    // 2. 清理 IPC 监听器 - 使用具体的监听器函数引用
    window.electron.ipcRenderer.removeListener(IPC.MONACO.AFTER_CURSOR, handleInsertAfterCursorIPC)
    window.electron.ipcRenderer.removeListener(
        IPC.MONACO.TEXT_BLOCK_TEMPLATES,
        handleInsertTextBlockTemplates
    )
    window.electron.ipcRenderer.removeListener(IPC.EDITOR.UPDATE_OPTIONS, handleUpdateOptions)
    window.electron.ipcRenderer.removeListener(IPC.MONACO.UNDO_REDO, handleTriggerUndoRedo)
    window.electron.ipcRenderer.removeListener(IPC.EDITOR.INIT_SETTING, handleUpdateEditorOptions)

    // 3. 清理窗口事件监听器（P-2/PF-13：scroll 监听已移除）
    window.removeEventListener('resize', handleEditCompResize)

    // PF-7：取消未执行的 layout 合帧
    cancelScheduledMonacoLayout()

    // 1.5.0（滚动同步）：取消未执行的 rAF 合帧/尾随防抖，并 dispose 编辑器事件订阅
    cancelScheduledScrollSync()
    for (const disposable of scrollSyncDisposables) {
        disposable?.dispose()
    }
    scrollSyncDisposables.length = 0

    // A6：清除拼写检查开启态属性（编辑器即将销毁，不保留 spellcheck=true/lang）
    applyEditorSpellcheck(editorInstance, false, spellcheckLanguage)

    // A7/A8：释放 AddActions 返回的显式句柄（原生 paste 监听等；action 随 editor.dispose 释放）
    for (const disposable of editorEnhanceDisposables) {
        disposable?.dispose()
    }
    editorEnhanceDisposables.length = 0

    // E10（Wiki 链接悬浮预览）：标记卸载并释放 hover provider（幂等；须先于 Monaco 销毁）
    wikiLinkHoverUnmounted = true
    wikiLinkHoverHandle?.dispose()
    wikiLinkHoverHandle = null

    // B1（Wiki 链接 Ctrl/Cmd+Click）：标记卸载并释放动作句柄（监听/命令/对话框宿主）
    wikiLinkActionsUnmounted = true
    wikiLinkActionsHandle?.dispose()
    wikiLinkActionsHandle = null

    // 4. 完整清理 Monaco Editor
    if (editorInstance) {
        // 1.5.2 E1：编辑器销毁前先注销活动编辑器登记，避免剪藏动作向已销毁实例写入
        clearActiveEditor(editorInstance)
        const model = editorInstance.getModel()
        if (model) {
            // 先分离模型，再销毁
            editorInstance.setModel(null)
            model.dispose()
        }
        editorInstance.dispose()
        editorInstance = null
    }
    bubbleEditorRef.value = null

    // P0 写作模式/光标恢复：卸载前保存会话并释放监听/装饰器/计时器
    saveCursorSessionNow()
    if (cursorSessionTimer !== null) {
        clearTimeout(cursorSessionTimer)
        cursorSessionTimer = null
    }
    if (writingStatsTimer !== null) {
        clearTimeout(writingStatsTimer)
        writingStatsTimer = null
    }
    if (writingModeFrameId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(writingModeFrameId)
    }
    writingModeFrameId = null
    writingModeDecorations?.clear()
    writingModeDecorations = null
    for (const disposable of writingModeDisposables) {
        disposable?.dispose()
    }
    writingModeDisposables.length = 0

    // 5. 清理 Monaco 内部缓存（只清理未附加到编辑器的模型）
    monaco.editor.getModels().forEach((model) => {
        if (!model.isAttachedToEditor()) {
            model.dispose()
        }
    })
})
</script>

<style scoped>
.monaco-editor-container {
    height: 100%;
    width: 100%;
    overflow: auto;
    /* FUN-09（editor-toggle-outline）：容器作为大纲下拉的定位参照 */
    position: relative;
}

/* FUN-09（editor-toggle-outline）：简易大纲下拉 */
.monaco-outline-popup {
    position: absolute;
    top: 8px;
    right: 16px;
    z-index: 50;
    width: 260px;
    max-height: 60%;
    display: flex;
    flex-direction: column;
    background: var(--theme-card-background);
    color: var(--theme-text-color);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    font-size: 13px;
}

.monaco-outline-title {
    padding: 8px 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--theme-border-color);
}

/* A10（outlinePlus）：大纲过滤输入框（仅开关开启时渲染） */
.monaco-outline-filter {
    margin: 6px 8px 0;
    padding: 4px 8px;
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    background: var(--theme-card-background);
    color: var(--theme-text-color);
    font-size: 12px;
    outline: none;
}

.monaco-outline-filter:focus {
    border-color: var(--theme-accent-color);
}

.monaco-outline-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
}

.monaco-outline-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 3px 12px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
}

.monaco-outline-item:hover {
    background: rgba(0, 176, 255, 0.12);
}

.monaco-outline-level {
    flex: none;
    font-size: 11px;
    opacity: 0.6;
}

.monaco-outline-text {
    overflow: hidden;
    text-overflow: ellipsis;
}

.monaco-outline-empty {
    padding: 8px 12px;
    opacity: 0.6;
}
</style>
