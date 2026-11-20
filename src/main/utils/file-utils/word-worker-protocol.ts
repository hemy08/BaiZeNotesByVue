/**
 * Word 导入/导出 worker 协议（主进程 ↔ Node worker 线程）
 *
 * P2-2（2026-11-20 性能扫描）：Word 导入（mammoth + turndown）与 Word 导出（officegen）
 * 此前在主进程同步执行，实测 118KB docx 导入 109ms、1MB 文本导出 76ms，期间主进程事件
 * 循环被占用，所有窗口 UI/IPC/菜单/定时器停摆。改为在 `worker_threads` 中执行：
 * - 本文件只放「可结构化克隆」的消息结构，不依赖 electron / 第三方库，供主进程客户端
 *   与 worker 入口共用（worker 内无 Electron API，必须保持纯 Node）；
 * - 任务输入输出均为普通对象：文件路径、Markdown 文本（字符串），由 Node 的结构化克隆
 *   算法在两端传递，不额外引入序列化格式。
 */

/** worker 支持的任务类型（与 worker 入口、任务实现一一对应） */
export const WORD_WORKER_TASK = {
    /** docx/doc → Markdown（导入/插入 Word 文件） */
    IMPORT: 'wordImport',
    /** Markdown → docx 文件（导出 Word） */
    EXPORT: 'wordExport'
} as const

/** 任务类型字面量联合（`as const` 派生，新增任务时类型检查会强制同步处理分支） */
export type WordWorkerTaskType = (typeof WORD_WORKER_TASK)[keyof typeof WORD_WORKER_TASK]

/** 任务：docx 文件 → Markdown 文本 */
export interface WordWorkerImportRequest {
    id: number
    type: typeof WORD_WORKER_TASK.IMPORT
    /** 已由主进程完成受信路径校验的 docx/doc 绝对路径 */
    filePath: string
}

/** 任务：Markdown 文本 → docx 文件 */
export interface WordWorkerExportRequest {
    id: number
    type: typeof WORD_WORKER_TASK.EXPORT
    /** 待导出 Markdown 全文 */
    content: string
    /** 已由主进程登记为受信的导出目标绝对路径 */
    filePath: string
}

/** 主进程 → worker 的任务消息 */
export type WordWorkerRequest = WordWorkerImportRequest | WordWorkerExportRequest

/**
 * worker → 主进程的任务应答（成功/失败均走同一结构，避免错误对象跨线程传递的
 * 序列化兼容性问题；失败时主进程按 `error` 文案构造面向用户的错误）。
 */
export interface WordWorkerTaskResponse {
    /** 与请求 id 对应（非法请求无法解析 id 时为 -1，客户端按协议错误处理） */
    id: number
    ok: boolean
    /** 仅 wordImport 成功时携带：转换得到的 Markdown 全文 */
    markdown?: string
    /** 失败时的错误文案（worker 内 Error.message，已做 String 归一化） */
    error?: string
}
