/**
 * 文件 / 内容大小上限与预览阈值共享常量（公共接口归位第 1 批 1.13）。
 *
 * 只收敛「跨进程可能共用、语义稳定」的数值；进程私有且无复用价值的阈值仍保留在
 * 各自模块，注释中标注来源行号，便于后续迁移时逐项比对（本批次不改任何使用方）。
 * 全部数值与来源文件逐字对齐，禁止在此自行放大 / 缩小（会改变既有行为）。
 */

/* ==================== 一、文件读取（主进程） ==================== */

/**
 * READ_BINARY 单文件大小上限（128MB）：防止超大文件一次性读入主 / 渲染进程造成卡顿或 OOM。
 * 进程 / 用途：主进程 / IPC 读取二进制文件。
 * 来源：`src/main/utils/utils.ts:47-48`（模块私有常量，未导出）。
 */
export const MAX_READ_BINARY_SIZE = 128 * 1024 * 1024

/* ==================== 二、文件编码 / 流式读取（主进程） ==================== */

/**
 * 大文件阈值（5MB）：文件打开 / 重载时超过该阈值改走流式分块读取 + 流式解码（PF-10）。
 * 进程 / 用途：主进程 / 文件编码探测与自适应读取。
 * 来源：`src/main/utils/file-utils/file-encoding.ts:21-22`（源码导出名 `LARGE_FILE_THRESHOLD`）。
 */
export const MAX_FILE_ENCODING_SIZE = 5 * 1024 * 1024

/* ==================== 三、自动备份（主进程） ==================== */

/**
 * 单文件备份大小上限（20MB）：超过则跳过该文件并记日志。
 * 进程 / 用途：主进程 / 自动备份（工作区递归备份）。
 * 来源：`src/main/utils/auto-backup.ts:67-68`（源码导出名 `AUTO_BACKUP_MAX_FILE_BYTES`）。
 */
export const MAX_AUTO_BACKUP_FILE_SIZE = 20 * 1024 * 1024

/* ==================== 四、日志（主进程） ==================== */

/**
 * 单个日志文件最大大小（10MB）：超过后滚动到下一份日志文件。
 * 进程 / 用途：主进程 / 文件日志写入。
 * 来源：`src/main/utils/logger.ts:40-41`（`defaultConfig.maxFileSize`，模块私有）。
 */
export const MAX_LOG_FILE_SIZE = 10 * 1024 * 1024

/* ==================== 五、图片 Base64（渲染进程） ==================== */

/**
 * 图片大小上限（20MB，与 jyshare 原版一致）：图片转 Base64 / Base64 转图片的通用上限。
 * 进程 / 用途：渲染进程 / 插件工具「图片 Base64」编解码。
 * 来源：`src/renderer/src/components/PluginTools/Codec/ImageBase64.vue:68-69`
 * （源码名 `MAX_IMAGE_BYTES`；同文件 :75 由它派生的 Base64 文本长度预检上限不在本文件重复定义）。
 */
export const MAX_IMAGE_BASE64_SIZE = 20 * 1024 * 1024

/* ==================== 六、Markdown 预览降级（渲染进程，PF-9） ==================== */

/**
 * 超大文档估算字节阈值（2MiB）：达到后预览跳过 KaTeX / mermaid / PlantUML 渲染并提示。
 * 进程 / 用途：渲染进程 / Markdown 预览超大文档降级判定。
 * 来源：`src/renderer/src/components/Markdown/preview-local-render.ts:444-445`
 * （源码导出名 `PREVIEW_LARGE_DOC_BYTE_THRESHOLD`）。
 */
export const PREVIEW_MAX_FILE_SIZE = 2 * 1024 * 1024

/**
 * 超大文档行数阈值（5 万行）：与字节阈值任一命中即触发预览降级。
 * 进程 / 用途：渲染进程 / Markdown 预览超大文档降级判定。
 * 来源：`src/renderer/src/components/Markdown/preview-local-render.ts:446-447`
 * （源码导出名 `PREVIEW_LARGE_DOC_LINE_THRESHOLD`）。
 */
export const PREVIEW_MAX_LINES = 50000

/* ==================== 七、Markdown snippets 片段包含（渲染进程） ==================== */

/**
 * 单个片段文件大小上限（1MiB）：`--8<--` 包含的单个文件超过则拒绝展开。
 * 进程 / 用途：渲染进程 / Markdown 预览 snippets 展开。
 * 来源：`src/renderer/src/components/Markdown/preview-md-blocks.ts:518-519`
 * （源码导出名 `SNIPPET_DEFAULT_MAX_FILE_BYTES`）。
 */
export const PREVIEW_BLOCK_MAX_SIZE = 1024 * 1024

/**
 * 一次预览展开片段的总大小上限（4MiB）：防止一次预览读入过多内容。
 * 进程 / 用途：渲染进程 / Markdown 预览 snippets 展开。
 * 来源：`src/renderer/src/components/Markdown/preview-md-blocks.ts:520-521`
 * （源码导出名 `SNIPPET_DEFAULT_MAX_TOTAL_BYTES`）。
 */
export const PREVIEW_BLOCK_TOTAL_MAX_SIZE = 4 * 1024 * 1024

/**
 * 片段递归展开深度上限（5 层）：防止循环引用无限展开。
 * 进程 / 用途：渲染进程 / Markdown 预览 snippets 展开。
 * 来源：`src/renderer/src/components/Markdown/preview-md-blocks.ts:516-517`
 * （源码导出名 `SNIPPET_DEFAULT_MAX_DEPTH`）。
 */
export const PREVIEW_BLOCK_MAX_DEPTH = 5
