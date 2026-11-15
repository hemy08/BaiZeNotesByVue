/**
 * 编辑器设置管理模块
 * 用于管理Monaco编辑器的配置
 * 基于 monaco.editor.IStandaloneEditorConstructionOptions 接口
 *
 * ARC-12：经 theme-config 导出的 createSafeConfigModule 工厂创建
 * （storageKey 模式：配置承载于 editor-setting.json 的 editorSetting 键下）。
 */

import * as path from 'path'
import { createSafeConfigModule } from './theme-config'
import { getUserDataPath } from '../utils/app-paths'
// ARC-13：EditorSetting 已收敛到 src/shared/types/editor.ts（唯一真源），此处仅 import type
import type { EditorSetting } from '../../shared/types'
import { tMain } from '../utils/i18n'

// ARC-13：re-export 保持既有引用路径（config/index.ts、单测等）不变
// （P2：主进程 HTML 编辑器设置对话框 ShowEditorSettingDialog 已删除，渲染层
// EditorSettingDialog.vue 经 IPC.EDITOR.GET_SETTING 读取本模块产出）
export type { EditorSetting }

// 默认编辑器配置
const defaultEditorSetting: EditorSetting = {
    // 基础显示配置
    // ========== 基础编辑配置 ==========
    readOnly: false,
    domReadOnly: false,
    emptySelectionClipboard: true,
    copyWithSyntaxHighlighting: true,
    multiCursorModifier: 'alt',
    multiCursorPaste: 'spread',
    fixedOverflowWidgets: false,
    ariaLabel: tMain('mainMsg.editor.ariaLabel'),
    ariaHeaderMessage: undefined,

    wordWrap: 'on',
    minimap: false,
    lineNumbers: 'on',
    fontSize: 15,
    fontFamily: 'Hack',
    fontWeight: 'normal',
    fontLigatures: false,
    fontVariations: false,
    lineHeight: 0, // 0表示自动
    letterSpacing: 0,
    tabSize: 4,
    insertSpaces: true,
    wordWrapColumn: 80,
    wordWrapBreakBeforeCharacters: false,
    wordWrapBreakAfterCharacters: false,
    wrappingIndent: 'none',
    wrappingStrategy: 'simple',
    indentSize: 'tabSize',
    detectIndentation: true,

    // 空白和折叠配置
    renderControlCharacters: false,
    renderWhitespace: 'all',
    folding: true,
    foldingStrategy: 'auto',
    showFoldingControls: 'mouseover',
    unfoldOnClickAfterEndOfLine: false,
    foldingImportsByDefault: false,
    foldingMaximumRegions: 5000,

    // 高亮和装饰配置
    renderLineHighlight: 'all',
    renderLineHighlightOnlyWhenFocus: false,
    selectOnLineNumbers: true,
    selectionHighlight: true,
    occurrencesHighlight: 'singleFile',
    glyphMargin: true,
    rangeHighlight: true,
    rulers: [],
    hover: {
        enabled: true,
        delay: 300,
        sticky: false
    },
    stickyTabStops: false,
    gotoLocation: {
        multiple: 'goto',
        multipleDefinitions: 'goto',
        multipleImplementations: 'goto',
        multipleReferences: 'goto',
        multipleTypeDefinitions: 'goto'
    },

    // 光标配置
    cursorStyle: 'line',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    cursorWidth: 0, // 0表示默认
    cursorSurroundingLines: 0,
    cursorSurroundingLinesStyle: 'default',
    cursorSurroundingLineColumns: 15,
    stopRenderingLineAfter: -1,

    // 滚动配置
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    mouseWheelScrollSensitivity: 1,
    fastScrollSensitivity: 5,
    scrollBeyondLastColumn: 0,
    scrollPredominantAxis: true,
    alwaysConsumeMouseWheel: true,
    hideHorizontalScrollbar: false,
    scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 14,
        horizontalScrollbarSize: 14,
        arrowSize: 11,
        useShadows: true,
        renderByPixels: true
    },

    // 自动完成和智能提示配置
    quickSuggestions: true,
    quickSuggestionsDelay: 10,
    acceptSuggestionOnEnter: 'on',
    acceptSuggestionOnCommitCharacter: true,
    wordBasedSuggestions: 'on',
    wordBasedSuggestionsOnlySameLanguage: false,
    horizontalScrollbarSize: 14,
    verticalScrollbarSize: 14,
    arrowSize: 11,
    useShadows: true,

    // 括号和引号配置
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoClosingComments: 'languageDefined',
    autoSurround: 'languageDefined',
    autoClosingOvertype: 'auto',
    autoIndent: 'advanced',
    autoIndentOnPaste: true,
    commentMultiLine: true,
    commentInline: true,
    matchBrackets: 'always',
    matchingBrackets: 'always',

    // 缩进指南配置
    guides: {
        indentation: true,
        bracketPairs: false,
        highlightActiveIndentation: true
    },

    // 括号对颜色化配置
    bracketPairColorization: {
        enabled: true
    },

    // 链接配置
    links: true,
    linkDetection: true,

    // 提示配置
    showAdjustSettingTip: true, // 默认显示提示

    // 颜色装饰器配置
    colorDecorators: true,

    // Unicode高亮配置
    unicodeHighlight: {
        nonBasicASCII: false,
        invisibleCharacters: true,
        ambiguousCharacters: false // 禁用易混淆字符高亮,避免全角/半角字符提示
    },

    // 粘性滚动配置
    stickyScroll: {
        enabled: false,
        maxLineCount: 5
    },

    // 性能配置
    largeFileOptimizations: true,
    maxTokenizationLineLength: 10000,

    // 其他配置
    dragAndDrop: false,
    editable: true,
    accessibilitySupport: 'auto',
    screenReaderAnnounceInlineSuggestions: true,

    // 编辑行为配置
    tabCompletion: 'off',
    snippetSuggestions: 'inline',
    suggestOnTriggerCharacters: true,
    suggestSelection: 'recentlyUsed',
    suggestFontSize: 0,
    suggestLineHeight: 0,
    suggestPreview: false,

    // 内联提示配置
    inlineSuggest: {
        enabled: false
    },

    // 参数提示配置
    parameterHints: {
        enabled: true,
        cycle: false
    },

    // 格式化配置
    formatOnPaste: false,
    formatOnType: false,

    // 查找配置
    find: {
        addExtraSpaceOnTop: true,
        autoFindInSelection: 'multiline',
        seedSearchStringFromSelection: 'selection',
        cursorMoveOnType: true,
        loop: true,
        globalFindClipboard: false,
        highlightFindMatches: true,
        highlightFindMatchColor: true,
        highlightFindMatchSize: 1
    },

    // 差异编辑器配置
    originalEditable: false,
    renderSideBySide: true,
    renderMarginRevertIcon: true,
    renderIndicators: true,
    ignoreTrimWhitespace: true,
    maxComputationTime: 60000,
    useInlineViewWhenSpaceIsLimited: false,
    compactMode: false,

    // 注释配置
    comments: {
        insertSpace: true,
        ignoreEmptyLines: true
    },

    // 括号配置
    renderFinalNewline: 'on',
    trimAutoWhitespace: true,

    // 代码透镜配置
    codeLens: false,
    codeLensFontFamily: '',
    codeLensFontSize: 0,

    // 行装饰配置
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 0, // 减小行号区域宽度，默认5改为3
    revealHorizontalRightPadding: 10,

    // 概览标尺配置
    overviewRulerBorder: false,
    overviewRulerLanes: 1,
    hideCursorInOverviewRuler: true,

    // 固定宽度配置
    maximizedScrollbar: false
}

// 存储结构类型：editor-setting.json 的键映射
// CQ-02：通过 createStore<T> 显式传泛型，替代此前的 6 处 @ts-ignore
// P1-FE-05：editorSetting 为唯一真源——渲染层 EditorSettingDialog 的配置经
// config:write('editor') 路由到本模块的映射函数，换算后写入同一 editorSetting 键，
// Monaco（EDITOR.GET_SETTING / INIT_SETTING）立即读到最新值。
// rendererEditorConfig 仅为历史版本（ARC-04 双轨时期）残留键，启动迁移时一次性
// 合并进 editorSetting 后删除，不再写入。
type EditorSettingSchema = {
    editorSetting?: EditorSetting
    rendererEditorConfig?: Record<string, unknown>
}

// ARC-12：经共享工厂创建（延迟初始化 + 浅合并更新 + 损坏容错）。
// 注意：defaults 保持空对象——与历史行为一致，默认值在首次访问时
// 由 getEditorSetting 写入存储（editor-setting.test 依赖该语义）。
const editorModule = createSafeConfigModule<EditorSettingSchema>({
    name: 'editor-setting',
    filePath: path.join(getUserDataPath(), 'config', 'editor-setting.json'),
    defaults: {},
    storageKey: 'editorSetting'
})

// 存储实例（延迟初始化）
function getStore(): ReturnType<typeof editorModule.getStore> {
    return editorModule.getStore()
}

/**
 * 获取编辑器设置
 * 首次访问时把默认值落盘（与历史行为一致，测试依赖"首次访问后存储中已存在该键"）。
 */
export function getEditorSetting(): EditorSetting {
    const s = getStore()
    if (!s.has('editorSetting')) {
        s.set('editorSetting', defaultEditorSetting)
    }
    return s.get('editorSetting') ?? defaultEditorSetting
}

/**
 * 保存编辑器设置
 */
export function saveEditorSetting(setting: EditorSetting): void {
    const s = getStore()
    s.set('editorSetting', setting)
}

/**
 * 重置为默认设置
 */
export function resetEditorSetting(): void {
    const s = getStore()
    s.set('editorSetting', defaultEditorSetting)
}

/**
 * 获取默认设置
 */
export function getDefaultEditorSetting(): EditorSetting {
    return defaultEditorSetting
}

// ============ P1-FE-05：渲染层编辑器设置对话框 ↔ Monaco 配置映射 ============

/**
 * 渲染层 EditorSettingDialog 字段 → 主进程 Monaco EditorSetting 的映射。
 *
 * 对话框字段是历史版本遗留的渲染层私有形状，与 Monaco 选项并非同名同义，
 * 这里只换算对话框真正可调且 Monaco 有对应项的字段：
 * - showLineNumbers(bool)      → lineNumbers('on'/'off')
 * - enableFolding(bool)        → folding
 * - enableAutoComplete(bool)   → quickSuggestions
 * - cursorStyle('blink')       → cursorBlinking；其余 cursorStyle 同名直传
 * - cursorWidth(1~5)           → cursorWidth
 * - fontSize                   → fontSize
 * - lineHeight（倍数，如 1.6） → lineHeight（像素 = fontSize × 倍数，四舍五入）
 *
 * 无 Monaco 对应项的对话框字段（实时预览/预览延迟/代码高亮/链接高亮/最大文件
 * 大小/渲染延迟/实验特性）不写入 EditorSetting——它们在 UI 上已标注「暂未实现」
 * 并禁用，避免「假开关」误导。
 *
 * 纯函数：不读写存储，便于单测。
 */
export function mapRendererSettingsToEditorSetting(
    data: Record<string, unknown>,
    base: EditorSetting
): EditorSetting {
    const next: EditorSetting = { ...base }

    // 字体大小：正数才覆盖（主进程不强行夹取，避免吞掉其它调用方的取值）
    const fontSize =
        typeof data.fontSize === 'number' && Number.isFinite(data.fontSize) && data.fontSize > 0
            ? Math.round(data.fontSize)
            : next.fontSize
    next.fontSize = fontSize

    // 行高：对话框以「倍数」表示，Monaco 需要像素；倍数非正时保持原值
    if (
        typeof data.lineHeight === 'number' &&
        Number.isFinite(data.lineHeight) &&
        data.lineHeight > 0
    ) {
        next.lineHeight = Math.max(1, Math.round(fontSize * data.lineHeight))
    }

    if (typeof data.showLineNumbers === 'boolean') {
        next.lineNumbers = data.showLineNumbers ? 'on' : 'off'
    }
    if (typeof data.enableFolding === 'boolean') {
        next.folding = data.enableFolding
    }
    if (typeof data.enableAutoComplete === 'boolean') {
        next.quickSuggestions = data.enableAutoComplete
    }
    if (data.cursorStyle === 'blink') {
        next.cursorBlinking = 'blink'
    } else if (
        data.cursorStyle === 'line' ||
        data.cursorStyle === 'block' ||
        data.cursorStyle === 'underline'
    ) {
        next.cursorStyle = data.cursorStyle
    }
    if (
        typeof data.cursorWidth === 'number' &&
        Number.isFinite(data.cursorWidth) &&
        data.cursorWidth >= 1
    ) {
        next.cursorWidth = Math.round(data.cursorWidth)
    }

    return next
}

/** 对话框行高倍数默认值（Monaco lineHeight=0 表示自动，此时回填该倍数） */
const DEFAULT_RENDERER_LINE_HEIGHT = 1.6
/** 对话框光标宽度默认值（Monaco cursorWidth=0 表示默认宽度） */
const DEFAULT_RENDERER_CURSOR_WIDTH = 2

/**
 * P1-FE-05：把主进程 EditorSetting 反算成渲染层对话框可回填的字段
 * （'editor' 配置经 config:read 路由到本函数，与 Monaco 读取同源）。
 * 与 mapRendererSettingsToEditorSetting 互逆（含默认值兜底）。
 */
export function getRendererEditorConfig(): Record<string, unknown> {
    const setting = getEditorSetting()
    const fontSize =
        typeof setting.fontSize === 'number' && setting.fontSize > 0 ? setting.fontSize : 15
    const lineHeight =
        typeof setting.lineHeight === 'number' && setting.lineHeight > 0
            ? Math.round((setting.lineHeight / fontSize) * 10) / 10
            : DEFAULT_RENDERER_LINE_HEIGHT
    const normalizedCursorStyle =
        setting.cursorStyle === 'line-thin'
            ? 'line'
            : setting.cursorStyle === 'block-outline'
              ? 'block'
              : setting.cursorStyle === 'underline-thin'
                ? 'underline'
                : setting.cursorStyle

    return {
        fontSize,
        lineHeight,
        showLineNumbers: setting.lineNumbers !== 'off',
        enableFolding: setting.folding !== false,
        enableAutoComplete:
            typeof setting.quickSuggestions === 'boolean' ? setting.quickSuggestions : true,
        cursorStyle: setting.cursorBlinking === 'blink' ? 'blink' : normalizedCursorStyle,
        cursorWidth:
            typeof setting.cursorWidth === 'number' && setting.cursorWidth >= 1
                ? setting.cursorWidth
                : DEFAULT_RENDERER_CURSOR_WIDTH
    }
}

/**
 * P1-FE-05：渲染层 EditorSettingDialog 保存入口（'editor' 配置经 config:write 路由到本函数）。
 * 映射后写回唯一真源 editorSetting，返回最新完整设置供调用方广播刷新 Monaco。
 */
export function applyRendererEditorConfig(data: Record<string, unknown>): EditorSetting {
    const next = mapRendererSettingsToEditorSetting(data, getEditorSetting())
    saveEditorSetting(next)
    return next
}

/**
 * P1-FE-05：历史遗留 rendererEditorConfig 键的一次性迁移——
 * 旧版本（ARC-04 双轨期）把对话框配置写到该键，Monaco 从未读取。
 * 启动迁移时若发现该键：映射合并进 editorSetting 后删除，避免旧数据丢失。
 */
export function migrateRendererEditorConfig(): void {
    const s = getStore()
    const legacy = s.get('rendererEditorConfig')
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
        applyRendererEditorConfig(legacy as Record<string, unknown>)
        s.delete('rendererEditorConfig')
    }
}
