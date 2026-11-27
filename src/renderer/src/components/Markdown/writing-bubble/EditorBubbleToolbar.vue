<template>
    <!--
        选中文本气泡工具栏（P0-6）：
        - 由父组件在 Monaco 编辑器创建后传入 `editor`，本组件自行监听选区/滚动/失焦；
        - 选区非空时显示浮动工具栏，位置 = 编辑器 DOM 视口位置 + getScrolledVisiblePosition；
        - `@mousedown.prevent` 阻止点击按钮时编辑器失焦，保证格式化作用于原选区；
        - 键盘：编辑器内按 Tab 进入工具栏（原生 button 可 Tab/Enter 操作），Esc 退出。
    -->
    <div
        v-if="bubbleVisible && bubbleEnabled"
        ref="bubbleRef"
        class="writing-bubble"
        :style="bubbleStyle"
        @focusout="handleBubbleFocusOut"
        @keydown="handleBubbleKeydown"
        @mousedown.prevent
    >
        <button
            v-for="button in bubbleButtons"
            :key="button.id"
            type="button"
            class="writing-bubble__btn"
            :class="`writing-bubble__btn--${button.id}`"
            :data-bubble-action="button.id"
            :title="t(button.labelKey)"
            :aria-label="t(button.labelKey)"
            @click="handleBubbleButtonClick(button)"
        >
            <span aria-hidden="true">{{ button.glyph }}</span>
        </button>
    </div>

    <!--
        Slash 命令菜单（P0-6）：与气泡工具栏互斥，同一时间只显示一个。
        键盘 ↑↓/Enter/Esc 由 Monaco onKeyDown（编辑器保持焦点）拦截，鼠标点击直接执行。
    -->
    <div
        v-if="slashVisible && slashEnabled"
        class="writing-slash"
        :style="slashStyle"
        @mousedown.prevent
    >
        <SlashCommandMenu
            :commands="filteredSlashCommands"
            :active-index="slashActiveIndex"
            @select="handleSlashSelect"
            @update:active-index="updateSlashActiveIndex"
        />
    </div>
</template>

<script setup lang="ts">
/**
 * 写作气泡工具栏 + Slash 命令菜单（P0-6）
 *
 * 设计要点：
 * 1. **零监听**：`editor` 为 null 不注册任何监听；编辑器实例切换/组件卸载时 dispose 全部
 *    Monaco 监听并移除 window resize 监听；
 * 2. **复用既有动作**：格式化走 `hemy-editor-common.UpdateContextFormat`，链接/表格/公式/
 *    图片/模板走 `menu-actions.HandleMenuAction` 既有菜单动作（打开既有对话框/EventBus 链），
 *    本组件不复制任何格式化或对话框实现；
 * 3. **互斥**：Slash 菜单打开时隐藏气泡工具栏；编辑器滚动/失焦/选区清空时全部隐藏；
 * 4. **输入法**：组合输入期间不触发/不显示菜单（onDidCompositionStart/End）；
 * 5. **定位**：`getDomNode().getBoundingClientRect()` + `getScrolledVisiblePosition()` 计算
 *    视口坐标（浮层 position: fixed），边界钳制与翻转见 bubble-position.ts 纯函数。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type * as monaco from 'monaco-editor'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import { moveListSelection } from '../../search/workspace-search-utils'
import {
    BUBBLE_BUTTONS,
    executeBubbleAction,
    type BubbleButtonDefinition
} from './writing-bubble-actions'
import {
    computeBubblePosition,
    computeBubbleToolbarSize,
    computeSlashMenuPosition,
    computeSlashMenuSize,
    type FloatingPosition,
    type LineRect,
    type Point,
    type ViewportSize
} from './bubble-position'
import { isInsideFencedCodeBlock, matchSlashTrigger } from './slash-trigger'
import {
    SLASH_COMMANDS,
    executeSlashCommand,
    filterSlashCommands,
    type SlashCommandDefinition
} from './slash-commands'
import SlashCommandMenu from './SlashCommandMenu.vue'

interface Props {
    /** Monaco 编辑器实例（父组件在编辑器创建后传入；null 表示未就绪，不注册监听） */
    editor: monaco.editor.IStandaloneCodeEditor | null
    /** 气泡工具栏开关（编写体验配置，默认关闭；父组件按配置传入） */
    bubbleEnabled?: boolean
    /** Slash 命令开关（编写体验配置，默认关闭；父组件按配置传入） */
    slashEnabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    bubbleEnabled: true,
    slashEnabled: true
})

/** Slash 触发位置（删除 `/query` 文本时使用；1 基行列，与 Monaco 一致） */
interface SlashTriggerPosition {
    lineNumber: number
    startColumn: number
}

/** 待删除的触发文本范围（结构兼容 Monaco IRange） */
interface SlashTriggerRange {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
}

/** 可释放对象（Monaco IDisposable 的结构子集） */
interface DisposableLike {
    dispose(): void
}

const bubbleButtons = BUBBLE_BUTTONS
/** 气泡工具栏尺寸由按钮数量推导（与样式常量保持一致，见 bubble-position.ts） */
const bubbleSize = computeBubbleToolbarSize(BUBBLE_BUTTONS.length)

const bubbleVisible = ref(false)
const bubbleStyle = ref<Record<string, string>>({ top: '0px', left: '0px' })
const bubbleRef = ref<HTMLElement | null>(null)

const slashVisible = ref(false)
const slashQuery = ref('')
const slashActiveIndex = ref(0)
const slashStyle = ref<Record<string, string>>({ top: '0px', left: '0px' })
const slashTrigger = ref<SlashTriggerPosition | null>(null)
const composing = ref(false)

/** 当前 query 过滤后的 Slash 命令（t 在 computed 中调用，切语言即时生效，I18N-08） */
const filteredSlashCommands = computed(() =>
    filterSlashCommands(SLASH_COMMANDS, slashQuery.value, t)
)

let disposables: DisposableLike[] = []
let windowResizeBound = false
/** 失焦延迟判定序号：焦点移入工具栏时取消隐藏（键盘 Tab 进入工具栏的场景） */
let blurCheckToken = 0

// ==================== 浮层显隐 ====================

/** 隐藏气泡工具栏 */
function hideBubble(): void {
    bubbleVisible.value = false
    bubbleStyle.value = { top: '0px', left: '0px' }
}

/** 隐藏 Slash 菜单并清空触发状态 */
function hideSlash(): void {
    slashVisible.value = false
    slashQuery.value = ''
    slashTrigger.value = null
    slashActiveIndex.value = 0
    slashStyle.value = { top: '0px', left: '0px' }
}

/** 同时隐藏两个浮层 */
function hideAll(): void {
    hideBubble()
    hideSlash()
}

/** 写 CSS 位置（浮层以 position: fixed 渲染，坐标为视口坐标） */
function toStyle(position: FloatingPosition): Record<string, string> {
    return { top: `${position.top}px`, left: `${position.left}px` }
}

// ==================== 编辑器数据读取 ====================

/** 编辑器 DOM 在视口中的位置（getBoundingClientRect 的 top/left） */
function getEditorRect(editor: monaco.editor.IStandaloneCodeEditor): Point | null {
    const domNode = editor.getDomNode()
    if (!domNode) return null
    const rect = domNode.getBoundingClientRect()
    return { top: rect.top, left: rect.left }
}

/** 指定行列相对编辑器左上角的可视位置（已扣除滚动量） */
function getLineRect(
    editor: monaco.editor.IStandaloneCodeEditor,
    lineNumber: number,
    column: number
): LineRect | null {
    const visiblePosition = editor.getScrolledVisiblePosition({ lineNumber, column })
    if (!visiblePosition) return null
    return {
        top: visiblePosition.top,
        left: visiblePosition.left,
        height: visiblePosition.height
    }
}

/** 当前窗口可视区尺寸 */
function getViewportSize(): ViewportSize {
    return { width: window.innerWidth, height: window.innerHeight }
}

// ==================== 气泡工具栏 ====================

/**
 * 根据当前选区刷新气泡工具栏：
 * 选区非空 + 编辑器有焦点 + 起始行可见时才显示；否则隐藏。
 */
function updateBubbleFromSelection(): void {
    if (!props.bubbleEnabled) {
        hideBubble()
        return
    }
    const editor = props.editor
    if (!editor) {
        hideBubble()
        return
    }
    // Slash 菜单与气泡工具栏互斥；输入法组合期间不显示
    if (slashVisible.value || composing.value) {
        hideBubble()
        return
    }
    const selection = editor.getSelection()
    if (!selection || selection.isEmpty()) {
        hideBubble()
        return
    }
    if (!editor.hasTextFocus()) {
        hideBubble()
        return
    }
    const editorRect = getEditorRect(editor)
    const lineRect = getLineRect(editor, selection.startLineNumber, selection.startColumn)
    if (!editorRect || !lineRect) {
        hideBubble()
        return
    }
    const position = computeBubblePosition({
        editorRect,
        lineRect,
        bubbleSize,
        viewport: getViewportSize()
    })
    if (!position) {
        hideBubble()
        return
    }
    bubbleStyle.value = toStyle(position)
    bubbleVisible.value = true
}

/** 点击气泡按钮：执行既有格式化/菜单动作，执行后按选区刷新位置 */
function handleBubbleButtonClick(button: BubbleButtonDefinition): void {
    const editor = props.editor
    if (!editor) return
    let handled: boolean
    try {
        handled = executeBubbleAction(editor, button)
    } catch (error) {
        logger.error('[写作气泡工具栏] 执行按钮动作失败：', error)
        hideBubble()
        return
    }
    if (!handled) return
    void nextTick(() => {
        if (props.editor) updateBubbleFromSelection()
    })
}

/** 工具栏内键盘：Esc 隐藏并归还编辑器焦点（Tab/Enter 由原生 button 处理） */
function handleBubbleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    hideAll()
    props.editor?.focus()
}

/** 焦点移出工具栏（且未移入工具栏内部）时隐藏气泡 */
function handleBubbleFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && bubbleRef.value?.contains(nextTarget)) return
    hideBubble()
}

// ==================== Slash 命令菜单 ====================

/**
 * 根据当前行文本与光标位置刷新 Slash 菜单：
 * 行首/空白后输入 `/` → 过滤命令；触发文本不合法/在代码块中/无匹配 → 隐藏。
 */
function updateSlashFromModel(): void {
    if (!props.slashEnabled) {
        hideSlash()
        return
    }
    const editor = props.editor
    if (!editor) {
        hideSlash()
        return
    }
    if (composing.value) {
        hideSlash()
        return
    }
    const position = editor.getPosition()
    const model = editor.getModel()
    if (!position || !model) {
        hideSlash()
        return
    }
    const lineText = model.getLineContent(position.lineNumber)
    const trigger = matchSlashTrigger(lineText, position.column)
    if (!trigger) {
        hideSlash()
        return
    }
    // 围栏代码块内不触发（行内代码已由 matchSlashTrigger 排除）
    if (isInsideFencedCodeBlock(model.getLinesContent(), position.lineNumber)) {
        hideSlash()
        return
    }
    const matched = filterSlashCommands(SLASH_COMMANDS, trigger.query, t)
    if (matched.length === 0) {
        hideSlash()
        return
    }
    const editorRect = getEditorRect(editor)
    const cursorRect = getLineRect(editor, position.lineNumber, position.column)
    if (!editorRect || !cursorRect) {
        hideSlash()
        return
    }
    const positionResult = computeSlashMenuPosition({
        editorRect,
        cursorRect,
        menuSize: computeSlashMenuSize(matched.length),
        viewport: getViewportSize()
    })
    if (!positionResult) {
        hideSlash()
        return
    }
    slashQuery.value = trigger.query
    slashTrigger.value = { lineNumber: position.lineNumber, startColumn: trigger.startColumn }
    slashStyle.value = toStyle(positionResult)
    if (slashActiveIndex.value < 0 || slashActiveIndex.value >= matched.length) {
        slashActiveIndex.value = 0
    }
    slashVisible.value = true
    // 互斥：菜单打开时隐藏气泡工具栏
    bubbleVisible.value = false
}

/** 计算待删除的 `/query` 范围（光标已离开触发行/被移到 `/` 之前时返回 null） */
function resolveSlashTriggerRange(): SlashTriggerRange | null {
    const editor = props.editor
    const trigger = slashTrigger.value
    if (!editor || !trigger) return null
    const position = editor.getPosition()
    if (!position || position.lineNumber !== trigger.lineNumber) return null
    if (position.column < trigger.startColumn) return null
    return {
        startLineNumber: trigger.lineNumber,
        startColumn: trigger.startColumn,
        endLineNumber: trigger.lineNumber,
        endColumn: position.column
    }
}

/** 执行一条 Slash 命令：先删除 `/query`，再走既有格式化/菜单动作 */
function runSlashCommand(command: SlashCommandDefinition): void {
    const editor = props.editor
    if (!editor) return
    const range = resolveSlashTriggerRange()
    if (range) {
        editor.executeEdits('writing-bubble', [{ range, text: '' }])
        editor.setPosition({ lineNumber: range.startLineNumber, column: range.startColumn })
    }
    hideSlash()
    try {
        executeSlashCommand(editor, command)
    } catch (error) {
        logger.error('[写作斜杠菜单] 执行命令失败：', error)
        return
    }
    void nextTick(() => {
        if (props.editor) updateBubbleFromSelection()
    })
}

/** 按当前过滤结果索引执行命令 */
function executeSlashByIndex(index: number): void {
    const command = filteredSlashCommands.value[index]
    if (!command) return
    runSlashCommand(command)
}

/** 命令项点击（子组件回传命令对象） */
function handleSlashSelect(command: SlashCommandDefinition): void {
    runSlashCommand(command)
}

/** 同步高亮项（鼠标悬停在菜单项上时由子组件回传） */
function updateSlashActiveIndex(index: number): void {
    const length = filteredSlashCommands.value.length
    if (length <= 0) {
        slashActiveIndex.value = 0
        return
    }
    slashActiveIndex.value = Math.min(Math.max(index, 0), length - 1)
}

/** 键盘 ↑↓ 循环移动高亮项 */
function moveSlashActive(delta: number): void {
    const length = filteredSlashCommands.value.length
    slashActiveIndex.value = moveListSelection(slashActiveIndex.value, delta, length)
}

/** 把键盘焦点移入气泡工具栏第一个按钮（Tab 进入工具栏） */
function focusFirstBubbleButton(): void {
    bubbleRef.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

// ==================== 编辑器监听 ====================

/** 选区变化：Slash 菜单打开时先按光标重算（光标移动可关闭菜单），再刷新气泡 */
function handleSelectionChange(): void {
    if (slashVisible.value) updateSlashFromModel()
    updateBubbleFromSelection()
}

/** 失焦：立即隐藏 Slash；气泡延迟到微任务判定，焦点移入工具栏时保留（键盘 Tab 进入） */
function handleEditorBlur(): void {
    hideSlash()
    blurCheckToken += 1
    const token = blurCheckToken
    queueMicrotask(() => {
        if (token !== blurCheckToken) return
        const activeElement = document.activeElement
        if (activeElement instanceof HTMLElement && bubbleRef.value?.contains(activeElement)) {
            return
        }
        hideBubble()
    })
}

/** 焦点回到编辑器：选区仍在时重新显示气泡 */
function handleEditorFocus(): void {
    updateBubbleFromSelection()
}

/** 滚动：浮层坐标失效，直接隐藏 */
function handleEditorScroll(): void {
    hideAll()
}

/** 输入法组合开始：期间不触发/不显示菜单 */
function handleCompositionStart(): void {
    composing.value = true
    hideAll()
}

/** 输入法组合结束：恢复后续触发判定（不当场弹出，等下一次输入事件） */
function handleCompositionEnd(): void {
    composing.value = false
    updateBubbleFromSelection()
}

/**
 * 编辑器键盘拦截：
 * 1. Slash 菜单打开时 ↑/↓ 循环选择、Enter 执行、Esc 关闭（阻止 Monaco 默认行为）；
 * 2. 无 Slash 时，气泡工具栏可见则 Tab 进入工具栏（不改变编辑器内 Tab 缩进行为的默认路径
 *    仅由「气泡可见」这一显式状态决定，Esc 可退出）。
 */
function handleEditorKeyDown(event: monaco.IKeyboardEvent): void {
    const key = event.browserEvent.key
    if (slashVisible.value) {
        if (key === 'ArrowDown') {
            event.preventDefault()
            event.stopPropagation()
            moveSlashActive(1)
            return
        }
        if (key === 'ArrowUp') {
            event.preventDefault()
            event.stopPropagation()
            moveSlashActive(-1)
            return
        }
        if (key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            executeSlashByIndex(slashActiveIndex.value)
            return
        }
        if (key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            hideSlash()
            return
        }
    }
    if (!bubbleVisible.value || key !== 'Tab' || event.shiftKey || event.ctrlKey) return
    if (event.altKey || event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    focusFirstBubbleButton()
}

/** 绑定编辑器实例的全部监听（每个监听都登记到 disposables，供卸载/切换实例时清理） */
function attachEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
    disposables.push(editor.onDidChangeCursorSelection(() => handleSelectionChange()))
    disposables.push(editor.onDidChangeModelContent(() => updateSlashFromModel()))
    disposables.push(editor.onDidScrollChange(() => handleEditorScroll()))
    disposables.push(editor.onDidBlurEditorWidget(() => handleEditorBlur()))
    disposables.push(editor.onDidFocusEditorWidget(() => handleEditorFocus()))
    disposables.push(editor.onDidCompositionStart(() => handleCompositionStart()))
    disposables.push(editor.onDidCompositionEnd(() => handleCompositionEnd()))
    disposables.push(editor.onKeyDown((event) => handleEditorKeyDown(event)))
    window.addEventListener('resize', hideAll)
    windowResizeBound = true
}

/** 释放全部监听并隐藏浮层（editor 置空、组件卸载、切换实例时调用） */
function detachEditor(): void {
    for (const disposable of disposables) {
        try {
            disposable.dispose()
        } catch {
            // 编辑器先于组件销毁时 dispose 可能抛错：清理流程不中断
        }
    }
    disposables = []
    if (windowResizeBound) {
        window.removeEventListener('resize', hideAll)
        windowResizeBound = false
    }
    blurCheckToken += 1
    composing.value = false
    hideAll()
}

watch(
    () => props.editor,
    (editor) => {
        detachEditor()
        if (editor) attachEditor(editor)
    },
    { immediate: true }
)

onBeforeUnmount(() => {
    detachEditor()
})

defineExpose({
    /** 供父组件主动隐藏浮层（如切换文件、打开对话框前） */
    hideAll,
    hideBubble,
    hideSlash
})
</script>

<style scoped>
/* 主题变量驱动（UI-01）；尺寸常量与 bubble-position.ts 的
   computeBubbleToolbarSize / computeSlashMenuSize 保持一致：
   按钮 26×26、间距 2、内边距 4、边框 1；Slash 菜单宽 240、最大高 240。 */
.writing-bubble {
    position: fixed;
    /* 高于 Monaco 编辑器内部浮层（≤50），低于应用对话框/菜单（9999+） */
    z-index: 100;
    display: flex;
    gap: 2px;
    box-sizing: border-box;
    padding: 4px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--card-bg, var(--bg-color));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.writing-bubble__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--text-color);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition: all 0.2s ease;
}

.writing-bubble__btn:hover {
    border-color: var(--border-color);
    background: var(--hover-bg, var(--theme-hover-background));
    color: var(--accent-color);
}

.writing-bubble__btn:focus-visible {
    outline: 2px solid var(--accent-color);
    outline-offset: 1px;
}

.writing-bubble__btn--italic {
    font-style: italic;
}

.writing-bubble__btn--deleteline {
    text-decoration: line-through;
}

.writing-bubble__btn--codeline {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 9px;
    font-weight: 500;
}

.writing-bubble__btn--link {
    font-size: 11px;
}

.writing-slash {
    position: fixed;
    z-index: 100;
    width: 240px;
}
</style>
