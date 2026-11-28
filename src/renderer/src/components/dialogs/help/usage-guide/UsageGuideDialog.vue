<template>
    <BaseDialog
        :visible="state.visible"
        :title="t('menu.help.guide')"
        width="min(980px, 94vw)"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="usage-guide-body">
            <!-- 父页面代理搜索（iframe 无 allow-scripts，页面内搜索脚本不执行，见脚本注释）：
                 加载中/加载失败只显示状态提示，不渲染搜索框（避免死输入框）。 -->
            <div class="usage-guide-toolbar">
                <p v-if="frameStatus === 'loading'" class="usage-guide-status" role="status">
                    {{ t('dialogRenderer.usageGuide.loading') }}
                </p>
                <div v-else-if="frameStatus === 'ready'" class="usage-guide-search">
                    <div class="usage-guide-search-field">
                        <svg
                            class="usage-guide-search-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <circle cx="11" cy="11" r="6"></circle>
                            <path d="M16 16l5 5"></path>
                        </svg>
                        <input
                            :id="searchInputId"
                            v-model="query"
                            class="usage-guide-search-input"
                            type="search"
                            role="combobox"
                            autocomplete="off"
                            spellcheck="false"
                            :placeholder="t('dialogRenderer.usageGuide.searchPlaceholder')"
                            :aria-label="t('dialogRenderer.usageGuide.searchAriaLabel')"
                            :aria-expanded="resultsOpen ? 'true' : 'false'"
                            :aria-controls="resultsId"
                            :aria-activedescendant="activeOptionId"
                            @focus="handleSearchFocus"
                            @keydown="handleSearchKeydown"
                        />
                        <button
                            v-if="hasQuery"
                            type="button"
                            class="usage-guide-search-clear"
                            :title="t('dialogRenderer.usageGuide.searchClear')"
                            :aria-label="t('dialogRenderer.usageGuide.searchClear')"
                            @click="clearSearch"
                        >
                            ×
                        </button>
                    </div>
                    <p class="usage-guide-search-meta" role="status" aria-live="polite">
                        {{ metaText }}
                    </p>
                    <ul
                        v-if="resultsOpen"
                        :id="resultsId"
                        class="usage-guide-search-results"
                        role="listbox"
                        :aria-label="t('dialogRenderer.usageGuide.searchResults')"
                    >
                        <li
                            v-for="(result, index) in results"
                            :id="optionId(index)"
                            :key="result.section.id || result.section.order"
                            class="usage-guide-search-result"
                            :class="{ 'is-active': index === activeIndex }"
                            role="option"
                            :aria-selected="index === activeIndex ? 'true' : 'false'"
                            @mouseenter="activeIndex = index"
                            @mousedown.prevent
                            @click="activateResult(index)"
                        >
                            <span class="usage-guide-search-result-title">
                                <template
                                    v-for="(segment, segmentIndex) in splitResultText(
                                        result.section.title
                                    )"
                                    :key="`t-${segmentIndex}`"
                                >
                                    <mark v-if="segment.hit">{{ segment.text }}</mark>
                                    <template v-else>{{ segment.text }}</template>
                                </template>
                            </span>
                            <span v-if="result.snippet" class="usage-guide-search-result-snippet">
                                <template
                                    v-for="(segment, segmentIndex) in splitResultText(
                                        result.snippet
                                    )"
                                    :key="`s-${segmentIndex}`"
                                >
                                    <mark v-if="segment.hit">{{ segment.text }}</mark>
                                    <template v-else>{{ segment.text }}</template>
                                </template>
                            </span>
                        </li>
                    </ul>
                </div>
                <p v-else class="usage-guide-status usage-guide-status--error" role="alert">
                    {{ failureText }}
                </p>
            </div>
            <iframe
                ref="iframeRef"
                class="usage-guide-frame"
                :src="guideUrl"
                :title="t('menu.help.guide')"
                sandbox="allow-same-origin"
                referrerpolicy="no-referrer"
                @load="handleFrameLoad"
            ></iframe>
        </div>
        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-usage-guide-close"
                @click="handleClose"
            >
                {{ t('common.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 帮助 → 使用指导：iframe 承载随安装包分发的本地 HTML 指南，父页面代理应用内搜索。
 *
 * ## 安全边界（不得放宽）
 * - iframe sandbox 仍只有 `allow-same-origin`，**禁止**加 `allow-scripts`（两者同时出现会让
 *   同源文档以父窗口身份执行脚本，属沙箱逃逸风险，SEC-12 明令禁止）；
 * - 搜索/定位/高亮全部由父页面完成：利用 allow-same-origin 使 iframe 同源，父页面只读
 *   `contentDocument` 建立索引，用纯 DOM 操作滚动标题与插入 mark，不向 iframe 注入脚本、
 *   不新增 CSP 例外、不新增 IPC；
 * - 地址来自当前入口页同源的 public 资源，不读取用户任意文件、不走 file://；
 * - 指南 HTML 生成链与内容真源（build/generate-help-docs.js、docs/help/usage-guide.md）由
 *   生成脚本维护，本组件只读渲染，不修改真源。
 *
 * ## 为什么 iframe 内搜索不生效
 * 生成 HTML 自带悬浮目录 + 内文搜索（内联脚本）；浏览器/在线/PDF 链路脚本可执行，而应用内
 * iframe 无 allow-scripts → 内联脚本不执行，搜索框按渐进增强约定保持隐藏（不会出现死搜索框）。
 * 因此由本组件补一层父页面代理搜索，与 iframe 内静态目录共存（目录锚点跳转不需要脚本）。
 *
 * ## 交互
 * - iframe load 后读取 main 内 h2/h3 与正文建立索引（加载中/失败/无可索引章节均降级提示）；
 * - 输入关键词按章节标题 + 正文过滤并显示摘要；↑/↓ 选择、Enter 定位、Esc 清空；
 * - 定位：iframe 内滚动到章节标题并临时高亮命中词（约 2.6s 后自动清除）、结果列表收起；
 * - 关闭对话框/重新打开/iframe 重新加载时清理索引、搜索词与高亮定时器。
 */
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import BaseDialog from '../../BaseDialog.vue'
import { t } from '../../../../common/i18n'
import { logger } from '../../../../common/logger'
import {
    closeUsageGuideDialogState,
    getUsageGuideUrl,
    usageGuideDialogState
} from './usage-guide-state'
import {
    USAGE_GUIDE_HIGHLIGHT_MS,
    buildUsageGuideIndex,
    clearUsageGuideHighlights,
    highlightUsageGuideSection,
    queryUsageGuideSections,
    readUsageGuideFrame,
    scrollUsageGuideToSection,
    splitUsageGuideText,
    type UsageGuideSearchOutcome,
    type UsageGuideSection,
    type UsageGuideTextSegment
} from './usage-guide-search'

const state = usageGuideDialogState
const guideUrl = computed(() => getUsageGuideUrl())

/**
 * iframe 内容状态：
 * - loading：尚未收到 load（不渲染搜索框）；
 * - ready：已读取文档并建立章节索引（渲染搜索框）；
 * - unavailable：读不到同源文档（加载失败/跨源），降级提示；
 * - unindexed：文档可读但没有 h2/h3 章节（内容异常），降级提示。
 */
type FrameStatus = 'loading' | 'ready' | 'unavailable' | 'unindexed'

/** iframe 加载超时：超时仍未收到 load 视为不可用（本地资源正常应远小于该值） */
const FRAME_LOAD_TIMEOUT_MS = 12000

const iframeRef = ref<HTMLIFrameElement | null>(null)
const frameStatus = ref<FrameStatus>('loading')
const sections = ref<UsageGuideSection[]>([])
const query = ref('')
const activeIndex = ref(-1)
const resultsDismissed = ref(false)
const instanceId = useId()
const searchInputId = `usage-guide-search-input-${instanceId}`
const resultsId = `usage-guide-search-results-${instanceId}`

/** 本次命中的结果集合（查询词变化即重算；纯函数，不触发额外 DOM 读写） */
const outcome = computed<UsageGuideSearchOutcome>(() =>
    queryUsageGuideSections(sections.value, query.value)
)
const results = computed(() => outcome.value.results)
const ready = computed(() => frameStatus.value === 'ready')
const hasQuery = computed(() => query.value.trim().length > 0)
/** 结果列表是否展开：加载就绪 + 有关键词 + 未因定位而收起 */
const resultsOpen = computed(() => ready.value && hasQuery.value && !resultsDismissed.value)
const activeOptionId = computed(() =>
    resultsOpen.value && activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined
)

/** 搜索状态文案（aria-live 播报：匹配数 / 截断提示 / 无结果） */
const metaText = computed(() => {
    if (!ready.value || !hasQuery.value) return ''
    const { total } = outcome.value
    if (total === 0) return t('dialogRenderer.usageGuide.searchEmpty')
    if (total > results.value.length) {
        return t('dialogRenderer.usageGuide.searchMatchesCapped', {
            count: total,
            limit: results.value.length
        })
    }
    return t('dialogRenderer.usageGuide.searchMatches', { count: total })
})

/** 加载失败/内容不可用时的降级提示 */
const failureText = computed(() => {
    if (frameStatus.value === 'unavailable') return t('dialogRenderer.usageGuide.unavailable')
    if (frameStatus.value === 'unindexed') return t('dialogRenderer.usageGuide.noIndex')
    return ''
})

/** 命中高亮 mark（由 clearHighlights 统一清理，避免残留黄色高亮） */
let highlightMarks: HTMLElement[] = []
/** 高亮自动清除计时器（window.setTimeout 返回数字句柄；null 表示无计时器） */
let highlightTimer: number | null = null
/** iframe 加载超时计时器（同上） */
let loadTimer: number | null = null

function optionId(index: number): string {
    return `${resultsId}-option-${index}`
}

/** 结果标题/摘要按命中词分段（父页面文本插值渲染 mark，不拼 HTML） */
function splitResultText(text: string): UsageGuideTextSegment[] {
    return splitUsageGuideText(text, outcome.value.terms)
}

/** 清除 iframe 内的命中高亮与计时器（幂等） */
function clearHighlights(): void {
    if (highlightTimer !== null) {
        window.clearTimeout(highlightTimer)
        highlightTimer = null
    }
    if (highlightMarks.length > 0) {
        clearUsageGuideHighlights(highlightMarks)
        highlightMarks = []
    }
}

function clearLoadTimer(): void {
    if (loadTimer !== null) {
        window.clearTimeout(loadTimer)
        loadTimer = null
    }
}

/** 开始加载计时：仅 loading 态超时才降级，正常 load 会提前清掉计时器 */
function startLoadTimer(): void {
    clearLoadTimer()
    loadTimer = window.setTimeout(() => {
        loadTimer = null
        if (frameStatus.value === 'loading') {
            frameStatus.value = 'unavailable'
        }
    }, FRAME_LOAD_TIMEOUT_MS)
}

/** 清空关键词、结果与高亮（Esc / 清除按钮 / 重新加载） */
function clearSearch(): void {
    query.value = ''
    resultsDismissed.value = false
    activeIndex.value = -1
    clearHighlights()
}

/**
 * 读取 iframe 文档并建立索引（读取异常/无章节时返回空数组，由调用方降级为提示，
 * 不抛错、不改 sandbox）。
 */
function readGuideSections(doc: Document): UsageGuideSection[] {
    try {
        return buildUsageGuideIndex(doc)
    } catch (error) {
        logger.warn('[UsageGuide] 读取使用指导 iframe 内容失败，应用内搜索降级', error)
        return []
    }
}

/**
 * iframe load：读取同源文档建立索引。
 * 读取失败/无章节时只降级为提示，不抛错、不改 sandbox。
 */
function handleFrameLoad(): void {
    clearLoadTimer()
    clearHighlights()
    query.value = ''
    resultsDismissed.value = false
    activeIndex.value = -1
    const frame = readUsageGuideFrame(iframeRef.value)
    if (!frame.contentDocument) {
        sections.value = []
        frameStatus.value = 'unavailable'
        return
    }
    const nextSections = readGuideSections(frame.contentDocument)
    if (nextSections.length === 0) {
        sections.value = []
        frameStatus.value = 'unindexed'
        return
    }
    sections.value = nextSections
    frameStatus.value = 'ready'
}

/** 输入框获得焦点：重新展开已收起的搜索结果（关键词仍在，便于继续调整） */
function handleSearchFocus(): void {
    resultsDismissed.value = false
}

/**
 * 搜索框键盘：
 * - Esc：有关键词时只清空搜索（阻止冒泡，不关闭对话框）；无关键词时交给 BaseDialog 关闭；
 * - ↑/↓：在结果间循环移动选中项；
 * - Enter：定位当前选中结果（无选中时取第一条）。
 */
function handleSearchKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return
    if (event.key === 'Escape') {
        if (!hasQuery.value) return
        event.preventDefault()
        event.stopPropagation()
        clearSearch()
        return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const count = results.value.length
        if (!resultsOpen.value || count === 0) return
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        activeIndex.value = (activeIndex.value + step + count) % count
        return
    }
    if (event.key === 'Enter') {
        if (!resultsOpen.value || results.value.length === 0) return
        event.preventDefault()
        activateResult(activeIndex.value >= 0 ? activeIndex.value : 0)
    }
}

/**
 * 定位到第 index 条结果：滚动 iframe 内章节标题 + 临时高亮命中词，并收起结果列表
 * （保留关键词，聚焦输入框后可再次展开）。
 */
function activateResult(index: number): void {
    const result = results.value[index]
    if (!result) return
    const frame = readUsageGuideFrame(iframeRef.value)
    if (!frame.contentDocument) return
    clearHighlights()
    scrollUsageGuideToSection(result.section, frame)
    highlightMarks = highlightUsageGuideSection(
        frame.contentDocument,
        result.section,
        outcome.value.terms
    )
    if (highlightMarks.length > 0) {
        highlightTimer = window.setTimeout(() => {
            highlightTimer = null
            clearHighlights()
        }, USAGE_GUIDE_HIGHLIGHT_MS)
    }
    activeIndex.value = index
    resultsDismissed.value = true
}

function handleClose(): void {
    closeUsageGuideDialogState()
}

/** 结果列表变化时重置选中项（保证 ↑/↓ 从第一条开始） */
watch(
    results,
    (nextResults) => {
        activeIndex.value = nextResults.length > 0 ? 0 : -1
    },
    { immediate: true }
)

/** 关键词变化时重新展开结果（用户继续输入时不需要先点输入框） */
watch(query, () => {
    resultsDismissed.value = false
})

/**
 * 显隐驱动：打开时重置为加载中并开始超时计时（iframe 由 BaseDialog 重新挂载，load 会重建索引）；
 * 关闭时清理索引、搜索词、高亮与计时器，避免宿主复用残留旧文档元素引用。
 */
watch(
    () => state.visible,
    (visible) => {
        clearHighlights()
        query.value = ''
        resultsDismissed.value = false
        activeIndex.value = -1
        sections.value = []
        frameStatus.value = 'loading'
        if (visible) {
            startLoadTimer()
        } else {
            clearLoadTimer()
        }
    },
    { immediate: true }
)

onBeforeUnmount(() => {
    clearLoadTimer()
    clearHighlights()
})
</script>

<style scoped>
.usage-guide-body {
    width: 100%;
    min-height: 68vh;
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
    background: var(--bg-primary);
}

/* 顶部工具条：搜索框所在行；层级高于 iframe，结果下拉可覆盖在正文之上 */
.usage-guide-toolbar {
    position: relative;
    z-index: var(--ui-z-dropdown);
    flex: 0 0 auto;
    padding: 8px 16px;
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border);
    background: var(--ui-surface);
}

.usage-guide-status {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-text-secondary);
}

.usage-guide-status--error {
    color: var(--ui-danger);
}

.usage-guide-search {
    position: relative;
}

.usage-guide-search-field {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--ui-control-height, 32px);
    box-sizing: border-box;
    padding: 0 8px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border);
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg-elevated);
    transition:
        border-color var(--ui-duration-fast) var(--ui-ease-standard),
        box-shadow var(--ui-duration-fast) var(--ui-ease-standard);
}

.usage-guide-search-field:focus-within {
    border-color: var(--ui-accent);
    box-shadow: var(--ui-focus-shadow);
}

.usage-guide-search-icon {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    color: var(--ui-text-tertiary);
}

.usage-guide-search-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ui-text);
    font-size: var(--ui-font-size, 13px);
    line-height: 1.5;
    outline: none;
}

.usage-guide-search-clear {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    color: var(--ui-text-tertiary);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
}

.usage-guide-search-clear:hover {
    background: var(--ui-accent-soft);
    color: var(--ui-text);
}

.usage-guide-search-meta {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--ui-text-tertiary);
}

.usage-guide-search-results {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: var(--ui-z-dropdown);
    margin: 0;
    padding: 4px;
    max-height: 46vh;
    overflow: auto;
    list-style: none;
    background: var(--ui-bg-elevated);
    border: var(--ui-hairline-width, 1px) solid var(--ui-border);
    border-radius: var(--ui-radius-md, 4px);
    box-shadow: var(--ui-shadow-2);
}

.usage-guide-search-result {
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--ui-radius-sm, 2px);
    color: var(--ui-text);
    cursor: pointer;
}

.usage-guide-search-result:hover,
.usage-guide-search-result.is-active {
    background: var(--ui-accent-soft);
}

.usage-guide-search-result-title {
    display: block;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.5;
}

.usage-guide-search-result-snippet {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--ui-text-secondary);
    word-break: break-word;
}

.usage-guide-search-result mark {
    padding: 0 2px;
    border-radius: 2px;
    background: var(--ui-selection);
    color: inherit;
}

.usage-guide-frame {
    flex: 1 1 auto;
    width: 100%;
    min-height: 68vh;
    border: 0;
    display: block;
    background: var(--ui-bg-elevated);
}

.btn-usage-guide-close {
    min-width: 88px;
}
</style>
