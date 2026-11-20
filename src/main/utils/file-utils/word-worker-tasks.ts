/**
 * Word 导入/导出任务的真实实现（主进程内转换 + worker 线程共用）
 *
 * P2-2（2026-11-20 性能扫描）：把原先直接写在 `import.ts` / `export.ts` 里的
 * mammoth + turndown（Word 导入）与 officegen（Word 导出）实现收敛到这里：
 * - `word-worker.ts`（worker 入口）调用本模块在独立线程执行；
 * - 主进程客户端在 worker 基础设施不可用时调用本模块降级为进程内转换，保证功能可用；
 * - 第三方库仍保持「首次真正执行转换时才 require」的 P1-7 惰性加载语义（模块求值阶段
 *   不进入主进程启动期 require 图，worker 线程同理不额外提前加载）。
 *
 * 本模块不 import electron，确保可被 worker 线程安全加载。
 */

import { createWriteStream } from 'node:fs'
import type { WriteStream } from 'node:fs'
import type {
    WordWorkerRequest,
    WordWorkerTaskResponse,
    WordWorkerTaskType
} from './word-worker-protocol'
import { WORD_WORKER_TASK } from './word-worker-protocol'

/* ============================================================================
 * 转换依赖的惰性加载（P1-7 语义保持：首次执行对应转换时才 require）
 * ========================================================================== */

/** mammoth 的 CJS API 类型（其 lib/index.d.ts 以 `export =` 暴露 Mammoth 实例） */
type MammothApi = typeof import('mammoth')

/** turndown 转换器的最小结构（turndown 无 TypeScript 类型声明） */
interface TurndownServiceLike {
    turndown(html: string): string
}

/** officegen 文档对象的最小结构（officegen 0.6.5 无 TypeScript 类型声明） */
interface OfficegenDocumentLike {
    createP(): { addText(text: string, options?: { bold?: boolean; fontSize?: number }): void }
    generate(stream: WriteStream): void
}

/** officegen 工厂函数（`require('officegen')` 的返回值） */
type OfficegenFactory = (type: 'docx' | 'pptx' | 'xlsx') => OfficegenDocumentLike

let mammothApi: MammothApi | null = null
let turndownConstructor: (new () => TurndownServiceLike) | null = null
let officegenFactory: OfficegenFactory | null = null

/** 按需加载 mammoth（Word 导入专用） */
function loadMammoth(): MammothApi {
    if (!mammothApi) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- P1-7/P2-2：worker 内首次 Word 导入时才 require，避免无谓的线程启动期加载；asar 内原生 import() 兼容性差，沿用惰性 require
        mammothApi = require('mammoth') as MammothApi
    }
    return mammothApi
}

/** 按需创建 turndown 转换器（Word 导入专用） */
function createTurndownService(): TurndownServiceLike {
    if (!turndownConstructor) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- turndown 无 TypeScript 类型声明，require 返回 any 是当前唯一无类型错误的加载方式
        turndownConstructor = require('turndown') as new () => TurndownServiceLike
    }
    return new turndownConstructor()
}

/** 按需加载 officegen（Word 导出专用） */
function loadOfficegen(): OfficegenFactory {
    if (!officegenFactory) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- officegen 无 TypeScript 类型声明；与改造前 ToWord 内 require 语义一致，仅首次 Word 导出时加载
        officegenFactory = require('officegen') as OfficegenFactory
    }
    return officegenFactory
}

/* ============================================================================
 * 转换实现（与 P2-2 改造前 import.ts / export.ts 内逻辑逐行一致）
 * ========================================================================== */

/**
 * docx/doc → Markdown：
 * mammoth 先转 HTML，再由 turndown 转 Markdown（与原 convertDocxToMarkdown 一致）。
 */
export async function convertDocxToMarkdownInProcess(file: string): Promise<string> {
    const mammoth = loadMammoth()
    const result = await mammoth.convertToHtml({ path: file })
    return createTurndownService().turndown(result.value)
}

/**
 * Markdown → docx 文件（与原 ToWord 一致）：
 * 按行识别 # / ## / ### 标题并加粗放大，其余非空行作为普通段落；officegen 以流写出。
 */
export async function exportMarkdownToWordInProcess(
    content: string,
    filePath: string
): Promise<void> {
    const officeGen = loadOfficegen()
    const docx = officeGen('docx')

    const lines = content.split('\n')
    lines.forEach((line) => {
        if (line.startsWith('# ')) {
            docx.createP().addText(line.substring(2), { bold: true, fontSize: 20 })
        } else if (line.startsWith('## ')) {
            docx.createP().addText(line.substring(3), { bold: true, fontSize: 18 })
        } else if (line.startsWith('### ')) {
            docx.createP().addText(line.substring(4), { bold: true, fontSize: 16 })
        } else if (line.trim().length > 0) {
            docx.createP().addText(line)
        }
    })

    return new Promise((resolve, reject) => {
        const stream = createWriteStream(filePath)
        docx.generate(stream)
        stream.on('close', resolve)
        stream.on('error', reject)
    })
}

/* ============================================================================
 * worker 任务分发
 * ========================================================================== */

/** 任务类型的中文文案（错误/日志可读性用；只做展示，不参与逻辑判断） */
const TASK_TYPE_LABEL: Record<WordWorkerTaskType, string> = {
    [WORD_WORKER_TASK.IMPORT]: 'Word 导入',
    [WORD_WORKER_TASK.EXPORT]: 'Word 导出'
}

/** 把任意抛出值归一化为非空错误文案（跨线程只能传字符串，且用户可见提示不应为空） */
function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message.trim() || error.name || '未知错误'
    }
    const text = String(error).trim()
    return text || '未知错误'
}

/**
 * 处理一条 worker 任务并返回应答（永不 reject：worker 内未捕获异常会终止线程，
 * 必须在此把业务错误转成 ok:false 应答，让主进程按既有错误语义提示用户）。
 *
 * 同时被 `word-worker.ts`（worker 线程）与单测直接调用；参数做运行时校验，
 * 防止消息损坏/版本不一致时把 undefined 当任务执行。
 */
export async function handleWordWorkerRequest(
    request: WordWorkerRequest
): Promise<WordWorkerTaskResponse> {
    const id = typeof request?.id === 'number' && Number.isFinite(request.id) ? request.id : -1
    try {
        switch (request?.type) {
            case WORD_WORKER_TASK.IMPORT: {
                if (typeof request.filePath !== 'string' || request.filePath.length === 0) {
                    return { id, ok: false, error: 'Word 导入任务缺少文件路径' }
                }
                const markdown = await convertDocxToMarkdownInProcess(request.filePath)
                return { id, ok: true, markdown }
            }
            case WORD_WORKER_TASK.EXPORT: {
                if (typeof request.content !== 'string' || request.content.length === 0) {
                    return { id, ok: false, error: 'Word 导出任务缺少文档内容' }
                }
                if (typeof request.filePath !== 'string' || request.filePath.length === 0) {
                    return { id, ok: false, error: 'Word 导出任务缺少目标路径' }
                }
                await exportMarkdownToWordInProcess(request.content, request.filePath)
                return { id, ok: true }
            }
            default:
                // 运行时仍可能出现损坏消息（类型系统之外的边界），给出明确失败而不是静默
                return {
                    id,
                    ok: false,
                    error: `不支持的 Word worker 任务类型：${String((request as { type?: unknown } | undefined)?.type)}`
                }
        }
    } catch (error) {
        const typeLabel =
            request && typeof request.type === 'string'
                ? (TASK_TYPE_LABEL[request.type] ?? String(request.type))
                : 'Word 转换'
        return { id, ok: false, error: `${typeLabel}失败：${toErrorMessage(error)}` }
    }
}
