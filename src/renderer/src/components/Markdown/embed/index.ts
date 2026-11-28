/**
 * 1.5.7 LLM Wiki L4（T4.2）：嵌入 UI 对外入口（供宿主 / 命令面板与测试引用）。
 *
 * 集成方式（宿主 `SearchOverlayHost` 只做一步）：
 * ```ts
 * import { EmbedDialog, embedDialogState, closeEmbedDialogState } from '@renderer/components/Markdown/embed'
 * // 模板：<EmbedDialog :visible="embedDialogState.visible" @close="closeEmbedDialogState" />
 * ```
 * 打开入口：命令面板（`CommandPalette` emit `open-raw-embed`）→ 宿主调用
 * `openEmbedDialogState()`。嵌入为纯前端只读 + 插入动作：
 * - 文件清单来自既有目录树 IPC 事件（`FILE_MANAGER.FILE_SYSTEM_DATA`）；
 * - 预览复用既有 `FILE.READ_HTML` / `app://local` 协议；
 * - 插入复用既有 A8 `insertMarkdownAtSelection`。
 */
export { default as EmbedDialog } from './EmbedDialog.vue'
export {
    closeEmbedDialogState,
    embedDialogState,
    openEmbedDialogState,
    type EmbedDialogState
} from './embed-dialog-state'
export {
    EMBED_IMAGE_EXTENSIONS,
    EMBED_PREVIEW_MAX_CHARS,
    EMBED_TEXT_EXTENSIONS,
    buildEmbedMarkdownLink,
    classifyEmbedFile,
    countEmbedFilesByKind,
    decodeMarkdownPath,
    encodeMarkdownPath,
    escapeMarkdownLinkText,
    findFirstEmbedFile,
    getEmbedTitle,
    parseWorkspaceFileTree,
    relativePathFrom,
    toRelativeMarkdownPath,
    type EmbedFileEntry,
    type EmbedFileKind,
    type EmbedMarkdownLinkResult,
    type EmbedRawScanResult
} from './embed-data'
