/**
 * 写作气泡工具栏 / Slash 命令菜单（P0-6）——对外统一出口
 *
 * 父组件挂载示例（编辑器创建后传入实例）：
 * ```vue
 * <EditorBubbleToolbar :editor="editorInstance" />
 * ```
 * - `editor` 为 null 时不注册任何监听（编辑器未就绪安全）；
 * - 编辑器实例变化/组件卸载时自动释放全部 Monaco 监听与 window 监听；
 * - 组件不 emit 事件、不写配置、不新增 IPC，动作全部复用既有格式化/菜单链路。
 */

export { default as EditorBubbleToolbar } from './EditorBubbleToolbar.vue'
export { default as SlashCommandMenu } from './SlashCommandMenu.vue'

export {
    BUBBLE_BUTTONS,
    executeBubbleAction,
    type BubbleButtonDefinition,
    type BubbleButtonKind,
    type BubbleFormatStyle
} from './writing-bubble-actions'

export {
    SLASH_COMMANDS,
    executeSlashCommand,
    filterSlashCommands,
    type SlashCommandDefinition,
    type SlashFormatStyle
} from './slash-commands'

export { isInsideFencedCodeBlock, matchSlashTrigger, type SlashTrigger } from './slash-trigger'

export {
    BUBBLE_BUTTON_GAP,
    BUBBLE_BUTTON_SIZE,
    BUBBLE_PANEL_BORDER,
    BUBBLE_PANEL_PADDING,
    FLOATING_GAP,
    SLASH_MENU_EXTRA_HEIGHT,
    SLASH_MENU_ITEM_HEIGHT,
    SLASH_MENU_MAX_HEIGHT,
    SLASH_MENU_WIDTH,
    VIEWPORT_MARGIN,
    clampValue,
    computeBubblePosition,
    computeBubbleToolbarSize,
    computeSlashMenuPosition,
    computeSlashMenuSize,
    resolveGap,
    resolveMargin,
    type BubblePositionInput,
    type FloatingPlacement,
    type FloatingPosition,
    type LineRect,
    type Point,
    type Size,
    type SlashMenuPositionInput,
    type ViewportSize
} from './bubble-position'
