/**
 * 1.5.2 E2：PDF 标注与摘录 IPC（2026-11-22）
 *
 * 链路（IPC-17 六步）：常量（`IPC.FILE.LOAD_PDF_ANNOTATIONS` / `SAVE_PDF_ANNOTATIONS`）→
 * 契约（`shared/types/pdf-annotations.ts` 类型 + `shared/types/ipc.ts` 三表登记）→
 * 生成白名单（build/generate-preload-whitelist.js）→ **本模块 handler** → 渲染层
 * `common/pdf-annotations-actions.ts`（ShowPdfEditor.vue 调用）→ 测试
 * （pdf-annotations / pdf-annotations-ipc / pdf-annotations-actions）。
 *
 * ## 数据位置与格式
 * - 侧车文件固定为 `<pdfPath>.annotations.json`（与 PDF 同目录），由**主进程**基于
 *   校验后的 PDF 路径生成，渲染层不能指定任意侧车路径；
 * - 内容为 UTF-8 JSON：`{ "version": 1, "annotations": PdfAnnotation[] }`
 *   （读取时也兼容历史/手工写入的裸数组）；归一化/序列化复用 shared 纯函数。
 *
 * ## 安全边界（SEC-07 / ARCH-05 / 三条硬红线）
 * - 入参 `pdfPath` 必须是非空**绝对路径**字符串且扩展名为 `.pdf`（不区分大小写）；
 * - PDF 路径与侧车路径都必须通过 Path Guard（`isPathAllowed`，含 realpath 逃逸校验），
 *   两道校验缺一不可——防止渲染层借通道读取/写入受信根外的任意 JSON；
 * - 读取容错：侧车缺失 / 空文件 / 非普通文件 / 超过大小上限 / JSON 损坏一律按
 *   「空数组 + WARN 日志」返回 ok=true（损坏的笔记标注不应阻塞 PDF 预览）；
 * - 写入原子性：先写 `<sidecar>.tmp` 再 `rename` 覆盖目标；任一步失败清理临时文件并
 *   返回结构化 `write-failed`（不向渲染层抛堆栈、不留下半写文件）；
 * - 保存前再归一化一次（字段裁剪/去重/上限），并校验序列化后大小不超过
 *   `PDF_ANNOTATIONS_FILE_MAX_BYTES`（10 MiB）。
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { BrowserWindow } from 'electron'
import {
    PDF_ANNOTATIONS_FILE_MAX_BYTES,
    buildPdfAnnotationsSidecarPath,
    normalizePdfAnnotations,
    serializePdfAnnotations
} from '../../shared/constants/pdf-annotations'
import { IPC } from '../../shared/ipc-channels'
import type {
    PdfAnnotation,
    PdfAnnotationsErrorCode,
    PdfAnnotationsLoadResult,
    PdfAnnotationsSaveResult
} from '../../shared/types/pdf-annotations'
import { withSenderCheck } from '../utils/ipc-security'
import { appState } from '../utils/app-state'
import { logger } from '../utils/logger'
// 1.5.7 LLM Wiki L1（T1.3）：llm-wiki 模式下 raw/ 只读——禁止在 raw/ 内写标注侧车文件
import { assertWorkspaceWritable, isPathAllowed, PathAccessDeniedError } from '../utils/security'
import { ipcListenerManager } from './ipc-listener-manager'

/** 侧车临时文件后缀（写入后 rename 覆盖目标；失败时清理） */
const SIDECAR_TMP_SUFFIX = '.tmp'

/** 路径解析结果（PDF 绝对路径 + 主进程生成的侧车路径） */
interface ResolvedPdfAnnotationPaths {
    /** 已 `path.resolve` 的 PDF 绝对路径 */
    pdfPath: string
    /** 侧车文件绝对路径（`<pdfPath>.annotations.json`） */
    sidecarPath: string
}

/** 路径校验结果：成功携带两条已校验路径，失败携带结构化错误码 */
type ResolvePathsResult =
    { ok: true; paths: ResolvedPdfAnnotationPaths } | { ok: false; error: PdfAnnotationsErrorCode }

/**
 * 解析并校验渲染层传入的 PDF 路径，生成主进程侧车路径并复核两者都在受信根内。
 *
 * 校验顺序（任一失败即返回对应错误码，不触达磁盘）：
 * 1. 非空字符串 + 绝对路径（拒绝相对路径/异常类型）；
 * 2. 扩展名 `.pdf`（不区分大小写）；
 * 3. PDF 路径通过 Path Guard；
 * 4. 侧车路径由 `buildPdfAnnotationsSidecarPath` 生成且同样通过 Path Guard。
 *
 * 导出以便单测直接覆盖校验矩阵（注册层只做透传）。
 */
export function resolvePdfAnnotationPaths(rawPdfPath: unknown): ResolvePathsResult {
    if (typeof rawPdfPath !== 'string') {
        return { ok: false, error: 'invalid-path' }
    }
    const trimmed = rawPdfPath.trim()
    if (trimmed.length === 0 || trimmed.includes('\0')) {
        return { ok: false, error: 'invalid-path' }
    }
    if (!path.isAbsolute(trimmed)) {
        return { ok: false, error: 'invalid-path' }
    }
    const pdfPath = path.resolve(trimmed)
    if (path.extname(pdfPath).toLowerCase() !== '.pdf') {
        return { ok: false, error: 'invalid-extension' }
    }
    if (!isPathAllowed(pdfPath)) {
        return { ok: false, error: 'path-denied' }
    }
    const sidecarPath = buildPdfAnnotationsSidecarPath(pdfPath)
    if (sidecarPath.length === 0) {
        return { ok: false, error: 'invalid-path' }
    }
    // 侧车与 PDF 同目录，正常情况下与 PDF 同属一个受信根；仍单独复核一次，
    // 防止未来侧车命名/位置调整后绕过 Path Guard 写入根外文件。
    if (!isPathAllowed(sidecarPath)) {
        return { ok: false, error: 'path-denied' }
    }
    return { ok: true, paths: { pdfPath, sidecarPath } }
}

/**
 * 读取并归一化侧车文件（容错核心）：
 *
 * - 文件不存在（ENOENT）→ 空数组；
 * - 非普通文件（目录/设备等）→ WARN + 空数组；
 * - 超过 `PDF_ANNOTATIONS_FILE_MAX_BYTES` → WARN + 空数组（不读入内存）；
 * - 空文件 → 空数组；JSON 解析失败 → WARN + 空数组（不崩溃）；
 * - 其余 IO 错误（权限等）向上抛出，由调用方返回 `read-failed`。
 *
 * @param sidecarPath 已通过 Path Guard 的侧车绝对路径
 * @returns 归一化后的标注数组
 */
async function readSidecarAnnotations(sidecarPath: string): Promise<PdfAnnotation[]> {
    let fileStat: Awaited<ReturnType<typeof fs.stat>>
    try {
        fileStat = await fs.stat(sidecarPath)
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return []
        }
        throw error
    }
    if (!fileStat.isFile()) {
        logger.warn('[IPC] PDF 标注侧车路径不是普通文件，已按空标注处理：', sidecarPath)
        return []
    }
    if (fileStat.size > PDF_ANNOTATIONS_FILE_MAX_BYTES) {
        logger.warn(
            '[IPC] PDF 标注侧车文件超过大小上限，已按空标注处理：',
            sidecarPath,
            `size=${fileStat.size}`,
            `max=${PDF_ANNOTATIONS_FILE_MAX_BYTES}`
        )
        return []
    }
    let rawText: string
    try {
        rawText = await fs.readFile(sidecarPath, 'utf8')
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            // stat 与 readFile 之间被删除：按缺失处理（正常竞态）
            return []
        }
        throw error
    }
    // 容忍外部编辑器写入的 UTF-8 BOM（JSON.parse 不认 BOM）
    const text = rawText.replace(/^\uFEFF/, '')
    if (text.trim().length === 0) {
        return []
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch (error) {
        logger.warn(
            '[IPC] PDF 标注侧车 JSON 损坏，已按空标注处理（不影响 PDF 预览）：',
            sidecarPath,
            error
        )
        return []
    }
    return normalizePdfAnnotations(parsed)
}

/**
 * `FILE.LOAD_PDF_ANNOTATIONS` 业务入口：读取 PDF 同目录侧车标注。
 *
 * 安全失败不抛异常：路径非法 / Path Guard 拒绝 / IO 失败返回 `ok=false + error`；
 * 侧车缺失或损坏属于容错路径，返回 `ok=true + 空数组`（详见 `readSidecarAnnotations`）。
 *
 * @param rawPdfPath 渲染层传入的 PDF 路径（任意类型，内部校验）
 * @returns 结构化结果（ok + annotations + 可选 error code）
 */
export async function loadPdfAnnotationsForPath(
    rawPdfPath: unknown
): Promise<PdfAnnotationsLoadResult> {
    const resolved = resolvePdfAnnotationPaths(rawPdfPath)
    if (!resolved.ok) {
        logger.warn('[IPC] 已拒绝读取 PDF 标注（路径校验失败）：', resolved.error)
        return { ok: false, annotations: [], error: resolved.error }
    }
    try {
        const annotations = await readSidecarAnnotations(resolved.paths.sidecarPath)
        return { ok: true, annotations }
    } catch (error) {
        logger.error('[IPC] 读取 PDF 标注侧车文件失败：', resolved.paths.sidecarPath, error)
        return { ok: false, annotations: [], error: 'read-failed' }
    }
}

/**
 * `FILE.SAVE_PDF_ANNOTATIONS` 业务入口：归一化后原子写入 PDF 同目录侧车文件。
 *
 * 写入流程：`normalize`（shared）→ `serialize`（稳定 JSON）→ 大小校验 →
 * 写 `<sidecar>.tmp` → `rename` 覆盖目标；失败清理 tmp 并返回 `write-failed`。
 *
 * @param rawPdfPath 渲染层传入的 PDF 路径（任意类型，内部校验）
 * @param rawAnnotations 渲染层传入的标注数组（任意类型；非数组返回 invalid-payload）
 * @returns 结构化结果（ok + 可选 error code）
 */
export async function savePdfAnnotationsForPath(
    rawPdfPath: unknown,
    rawAnnotations: unknown
): Promise<PdfAnnotationsSaveResult> {
    const resolved = resolvePdfAnnotationPaths(rawPdfPath)
    if (!resolved.ok) {
        logger.warn('[IPC] 已拒绝保存 PDF 标注（路径校验失败）：', resolved.error)
        return { ok: false, error: resolved.error }
    }
    if (!Array.isArray(rawAnnotations)) {
        logger.warn('[IPC] 已拒绝保存 PDF 标注：annotations 不是数组')
        return { ok: false, error: 'invalid-payload' }
    }
    const serialized = serializePdfAnnotations(rawAnnotations)
    const byteLength = Buffer.byteLength(serialized, 'utf8')
    if (byteLength > PDF_ANNOTATIONS_FILE_MAX_BYTES) {
        logger.warn(
            '[IPC] 已拒绝保存 PDF 标注：序列化后超过大小上限：',
            `bytes=${byteLength}`,
            `max=${PDF_ANNOTATIONS_FILE_MAX_BYTES}`
        )
        return { ok: false, error: 'too-large' }
    }
    const sidecarPath = resolved.paths.sidecarPath
    const tempPath = `${sidecarPath}${SIDECAR_TMP_SUFFIX}`
    // 1.5.7 LLM Wiki L1（T1.3）：llm-wiki 模式下 raw/ 只读，禁止在 raw/ 内写标注侧车文件
    try {
        assertWorkspaceWritable(appState.rootPath, sidecarPath)
    } catch (error) {
        if (error instanceof PathAccessDeniedError) {
            logger.warn(
                '[IPC] LLM Wiki 模式：已拒绝在 raw/ 只读目录写入 PDF 标注（T1.3）：',
                sidecarPath
            )
            return { ok: false, error: 'path-denied' }
        }
        throw error
    }
    try {
        await fs.writeFile(tempPath, serialized, 'utf8')
        await fs.rename(tempPath, sidecarPath)
        return { ok: true }
    } catch (error) {
        logger.error('[IPC] 写入 PDF 标注侧车文件失败：', sidecarPath, error)
        // 清理可能残留的临时文件（清理失败只告警，不覆盖主错误的用户可见提示）
        try {
            await fs.rm(tempPath, { force: true })
        } catch (cleanupError) {
            logger.warn('[IPC] 清理 PDF 标注临时文件失败：', tempPath, cleanupError)
        }
        return { ok: false, error: 'write-failed' }
    }
}

/**
 * 注册 PDF 标注与摘录 IPC（两个 invoke 通道）。
 *
 * @param _mainWindow 主窗口（sender 校验由 withSenderCheck 依据受信主窗口登记完成；
 *                    本模块不主动推送消息，参数保留以对齐各域注册函数签名）
 * @param componentId 监听台账组件 ID（来源 registry 编排）
 */
export function registerPdfAnnotationsIpc(_mainWindow: BrowserWindow, componentId: string): void {
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.LOAD_PDF_ANNOTATIONS,
        withSenderCheck(
            IPC.FILE.LOAD_PDF_ANNOTATIONS,
            async (_event: Electron.IpcMainInvokeEvent, pdfPath: unknown) =>
                loadPdfAnnotationsForPath(pdfPath),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.SAVE_PDF_ANNOTATIONS,
        withSenderCheck(
            IPC.FILE.SAVE_PDF_ANNOTATIONS,
            async (_event: Electron.IpcMainInvokeEvent, pdfPath: unknown, annotations: unknown) =>
                savePdfAnnotationsForPath(pdfPath, annotations),
            { kind: 'handle' }
        ),
        componentId
    )
}
