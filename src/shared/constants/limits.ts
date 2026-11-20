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

/* ==================== 六、Markdown 预览分级降级（渲染进程，P2-1） ==================== */

/**
 * 大文档「简化档」估算字节阈值（256KiB）：达到后预览跳过 KaTeX 公式、mermaid/PlantUML
 * 图表与 hljs 冷门语言按需预取，只保留基础 Markdown 渲染 + DOMPurify 消毒。
 *
 * P2-1（大文档预览性能）：原 PF-9 阈值 2MiB / 5 万行过晚——实测 200KB 文档单轮
 * DOMPurify 已约 200ms、1MB 约 900ms（jsdom），而 2MiB 以下完全无保护；下调到 256KiB，
 * 覆盖 200KB~1MB 的常见长笔记档位。数值真源在本文件，渲染层只读取不复制。
 *
 * 进程 / 用途：渲染进程 / Markdown 预览降级判定（preview-large-doc.ts）。
 */
export const PREVIEW_DEGRADE_FILE_SIZE = 256 * 1024

/**
 * 大文档「简化档」行数阈值（1 万行）：与字节阈值任一命中即进入简化档。
 * 行数档位覆盖「短行多、字节数不高」的长文档（如密集列表/表格）。
 */
export const PREVIEW_DEGRADE_LINES = 10_000

/**
 * 大文档「渐进档」估算字节阈值（512KiB）：达到后在简化档基础上再启用
 * 「分块 DOMPurify + 首块先显示 + 逐块补全」的渐进渲染（preview-sanitize.ts），
 * 让 1MB 级文档的首屏内容不必等待整篇消毒完成。
 */
export const PREVIEW_PROGRESSIVE_FILE_SIZE = 512 * 1024

/**
 * 大文档「渐进档」行数阈值（2 万行）：与字节阈值任一命中即进入渐进档。
 */
export const PREVIEW_PROGRESSIVE_LINES = 20_000

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
