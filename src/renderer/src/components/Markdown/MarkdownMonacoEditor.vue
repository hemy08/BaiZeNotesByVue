<template>
    <div id="monaco-editor-container" ref="monacoEditorContainer" class="monaco-editor-container">
        <!-- FUN-09（editor-toggle-outline）：简易大纲下拉——
             从当前文档正则提取 ATX 标题行，点击项经 setPosition 跳转到对应行 -->
        <div v-if="isOutlineVisible" class="monaco-outline-popup" @click.stop @mousedown.stop>
            <div class="monaco-outline-title">{{ t('editorUi.monacoOutline.title') }}</div>
            <ul class="monaco-outline-list">
                <li
                    v-for="item in outlineItems"
                    :key="item.line"
                    class="monaco-outline-item"
                    :style="{ paddingLeft: 8 + (item.level - 1) * 14 + 'px' }"
                    :title="t('editorUi.monacoOutline.lineTitle', { line: item.line })"
                    @click="handleOutlineItemClick(item)"
                >
                    <span class="monaco-outline-level">H{{ item.level }}</span>
                    <span class="monaco-outline-text">{{ item.text }}</span>
                </li>
                <li v-if="outlineItems.length === 0" class="monaco-outline-empty">
                    {{ t('editorUi.monacoOutline.empty') }}
                </li>
            </ul>
        </div>
    </div>
</template>

<script setup lang="ts">
// 引入 Monaco Editor
// PF-03/CMP-28：先于一切 Monaco 使用引入 worker 注册与按需语言贡献
//（self.MonacoEnvironment.getWorker + editor.api 的 contributions/语言补齐）
import './monaco-worker-setup'
import { registerCustomLanguages } from './register-languages'
import * as monaco from 'monaco-editor'
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import EventBus from '../../common/event-bus/event-bus'
import * as editor from './hemy-editor'
import type { MarkdownTOC } from '../../../../shared/types'
import { IPC } from '../../../../shared/ipc-channels'
import { t } from '../../common/i18n'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { logger } from '../../common/logger'
import { toFileUrl } from '../../../../shared/utils/path'

// 定义 emit 函数
const emit = defineEmits(['update:code'])

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
    }
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
let markdownFoldingProviderRegistered = false
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
// payload 契约：{ line: number }（菜单侧 window.prompt 收集并已校验为正整数，此处再做防御性钳制）
const handleJumpToLine = (payload?: { line?: number }) => {
    if (!editorInstance) {
        return
    }
    const rawLine = payload?.line
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
}
const isOutlineVisible = ref(false)
const outlineItems = ref<OutlineItem[]>([])
// 大文件保护：最多扫描的行数（超出部分不进大纲）
const OUTLINE_MAX_SCAN_LINES = 100000
// ATX 标题正则（与折叠提供器一致）
const OUTLINE_HEADING_REGEX = /^(\s{0,3})(#{1,6})(?:[ \t]+)(.*)$/

function extractOutlineItems(): OutlineItem[] {
    const items: OutlineItem[] = []
    if (!editorInstance) {
        return items
    }
    const model = editorInstance.getModel()
    if (!model) {
        return items
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
        items.push({ line: i, level, text: text || t('editorUi.monacoOutline.emptyTitle') })
    }
    return items
}

function handleToggleOutline() {
    if (!editorInstance) {
        return
    }
    if (isOutlineVisible.value) {
        isOutlineVisible.value = false
        return
    }
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
        })

        editor.DidChange(editorInstance)
        editor.KeyMaps(editorInstance)
        editor.AddActions(editorInstance)

        // 初始化后立即布局，确保编辑器尺寸正确
        editorInstance.layout()

        // 延迟再次布局，确保DOM完全渲染后尺寸正确
        setTimeout(() => {
            if (editorInstance) {
                editorInstance.layout()
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

    // 注册 EventBus 监听器
    EventBus.$on(EVENT_BUS.MONACO_UPDATE_HEADER_FORMAT, handleUpdateContext)
    EventBus.$on(EVENT_BUS.MONACO_UPDATE_FONT_FORMAT, handleUpdateContext)
    EventBus.$on(EVENT_BUS.MONACO_INSERT_TEXT, handleInsertAfterCursor)
    EventBus.$on(EVENT_BUS.MONACO_LOCATE_TARGET_LINE, handleLocateTargetLine)
    EventBus.$on(EVENT_BUS.MONACO_RELAYOUT, handleRelayout)

    // FUN-09：编辑器菜单动作（事件名与菜单代理的契约固定，勿改）
    EventBus.$on(EVENT_BUS.EDITOR_TOGGLE_FOLD, handleToggleFold)
    EventBus.$on(EVENT_BUS.EDITOR_TRIGGER_FIND, handleTriggerFind)
    EventBus.$on(EVENT_BUS.EDITOR_JUMP_LINE, handleJumpToLine)
    EventBus.$on(EVENT_BUS.EDITOR_TOGGLE_OUTLINE, handleToggleOutline)
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
    // 1. 清理 EventBus 监听器
    EventBus.$off(EVENT_BUS.MONACO_UPDATE_HEADER_FORMAT, handleUpdateContext)
    EventBus.$off(EVENT_BUS.MONACO_UPDATE_FONT_FORMAT, handleUpdateContext)
    EventBus.$off(EVENT_BUS.MONACO_INSERT_TEXT, handleInsertAfterCursor)
    EventBus.$off(EVENT_BUS.MONACO_LOCATE_TARGET_LINE, handleLocateTargetLine)
    EventBus.$off(EVENT_BUS.MONACO_RELAYOUT, handleRelayout)

    // FUN-09：清理编辑器菜单动作监听器与大纲关闭监听
    EventBus.$off(EVENT_BUS.EDITOR_TOGGLE_FOLD, handleToggleFold)
    EventBus.$off(EVENT_BUS.EDITOR_TRIGGER_FIND, handleTriggerFind)
    EventBus.$off(EVENT_BUS.EDITOR_JUMP_LINE, handleJumpToLine)
    EventBus.$off(EVENT_BUS.EDITOR_TOGGLE_OUTLINE, handleToggleOutline)
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

    // 4. 完整清理 Monaco Editor
    if (editorInstance) {
        const model = editorInstance.getModel()
        if (model) {
            // 先分离模型，再销毁
            editorInstance.setModel(null)
            model.dispose()
        }
        editorInstance.dispose()
        editorInstance = null
    }

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
    background: var(--theme-card-background, #ffffff);
    color: var(--theme-text-color, #333333);
    border: 1px solid var(--theme-border-color, #00b0ff);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    font-size: 13px;
}

.monaco-outline-title {
    padding: 8px 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--theme-border-color, #e0e0e0);
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
