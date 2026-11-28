/**
 * 1.5.2 E6/E1 今日日记 / 快速收件箱 / 剪藏 IPC（2026-11-22）
 *
 * 链路（IPC-17 六步）：常量（`IPC.FILE.OPEN_OR_CREATE_ENTRY`）→ 契约
 * （`shared/types/ipc.ts` 的 `OpenOrCreateEntry*` + IpcRequests/IpcResponses）→ 生成白名单
 * （build/generate-preload-whitelist.js）→ **本模块 handler** → 渲染层
 * `common/capture-actions.ts`（E6）/ `common/clip-capture-actions.ts`（E1）→ 测试
 * （daily-entries / clip-capture / capture-ipc / capture-actions / clip-capture-actions）。
 *
 * ## 能力语义
 * - `kind = 'daily'`：在工作区根下 `<root>/diary/YYYY-MM-DD.md` 打开或创建「今日日记」，
 *   不存在则创建（front matter `title/date/createdAt/source: diary` + `# 标题`）；
 * - `kind = 'inbox'`：在 `<root>/inbox/YYYY-MM-DD-HHmmss.md` 创建「快速收件箱」笔记
 *   （front matter `date/createdAt/source: inbox`）；
 * - `kind = 'clip'`（1.5.2 E1，**不新增 IPC 通道**）：在 `<root>/inbox/YYYY-MM-DD-HHmmss-clip.md`
 *   创建剪藏笔记（front matter `date/createdAt/source: clip/title[+sourceUrl]` + 剪藏正文）；
 * - 目录不存在自动递归创建；文件已存在时**直接打开、绝不覆盖**。
 *
 * ## 安全边界（SEC-07 / SEC-09）
 * - 工作区根**只取** `appState.rootPath`；渲染层载荷只有 kind（+ clip 的正文/标题/来源），
 *   不能传任意路径/目录/文件名；
 * - 目录名由 shared/constants/daily-entries.ts（daily/inbox）与 shared/constants/clip-capture.ts
 *   （clip）的白名单常量生成，文件名由主进程按本地日期时间生成；kind 非白名单值返回 `invalid-kind`；
 * - 剪藏正文按 `CLIP_CONTENT_MAX_BYTES` 校验 UTF-8 字节数（超限 `content-too-large`），
 *   标题剥离控制字符/截断，来源 URL 仅接受绝对 http/https（front matter 由 shared 纯函数转义）；
 * - 非 clip 载荷即使携带 content/title/sourceUrl 也**一律忽略**（不读取、不落盘）；
 * - 写入前对工作区根做 realpath，并用 `path.resolve` + `path.relative` 复核目标文件
 *   **必须位于根内**（防符号链接/junction 与异常拼接逃逸）；文件不存在时无需 realpath；
 * - 新建文件用 `fs.open(filePath, 'wx')`（独占创建）从根上保证「不覆盖已有文件」；
 * - 业务失败一律返回结构化 `{ ok: false, reason }`，不向渲染层抛堆栈。
 *
 * ## 打开动作（复用既有链路，不新增第二套打开机制）
 * 写入/确认存在后调用 `file-utils` 的 `OpenSelectFile`——即 `IPC.FILE.OPEN_SELECT_FILE`
 * 链路复用的「主进程读取文件并把内容经既有 EVENTS 通道（SHOW_SELECTED_FILE_CONTEXT /
 * USER_SELECT_FILE）发给渲染层」实现，渲染层无需再关心打开细节。
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { BrowserWindow } from 'electron'
import {
    CLIP_CAPTURE_DIR,
    CLIP_CONTENT_MAX_BYTES,
    clipEntryFileName,
    clipEntryTemplate,
    sanitizeClipSourceUrl,
    sanitizeClipTitle,
    utf8ByteLength,
    type ClipNotePayload
} from '../../shared/constants/clip-capture'
import {
    DAILY_ENTRY_DIRECTORIES,
    buildEntryFileName,
    buildEntryTemplate
} from '../../shared/constants/daily-entries'
import { IPC } from '../../shared/ipc-channels'
import type { OpenOrCreateEntryKind, OpenOrCreateEntryResult } from '../../shared/types/ipc'
import { appState } from '../utils/app-state'
import { OpenSelectFile } from '../utils/file-utils/index'
import { withSenderCheck } from '../utils/ipc-security'
// 1.5.7 LLM Wiki L1（T1.3）：llm-wiki 模式下 raw/ 只读——日记/收件箱/剪藏不得写入 raw/
import { assertWorkspaceWritable, PathAccessDeniedError } from '../utils/security'
import { logger } from '../utils/logger'
import { withHandleErrorLog } from './handle-error-log'
import { ipcListenerManager } from './ipc-listener-manager'

/** daily/inbox/clip 之外的一级目录名不可能出现；路径复核失败按写盘失败返回（防御性分支） */
const PATH_DENIED_REASON = 'write-failed' as const

/**
 * 校验 target 是否位于 root 内（root 本身不算「在根内」，避免把根目录当文件写）。
 *
 * 说明：入参约定均为已 `path.resolve` 的绝对路径；仅用于本模块的防御性复核与单测。
 */
export function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
    const relative = path.relative(rootPath, targetPath)
    if (relative.length === 0) {
        return false
    }
    return !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * 从渲染层载荷中提取 kind 白名单；非法载荷返回 null。
 *
 * 1.5.2 E1：kind 白名单扩展 `clip`（剪藏到新笔记），仍是同一 IPC 通道、不新增通道。
 */
function extractEntryKind(payload: unknown): OpenOrCreateEntryKind | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null
    }
    const kind = (payload as { kind?: unknown }).kind
    if (kind === 'daily' || kind === 'inbox' || kind === 'clip') {
        return kind
    }
    return null
}

/**
 * 提取并归一化剪藏载荷（**仅 kind='clip' 调用**）。
 *
 * - content：非字符串/缺省 → 空正文（模板写占位内容）；字符串按 UTF-8 字节数校验上限；
 * - title：剥离控制字符 + 截断（shared 纯函数）；
 * - sourceUrl：仅保留绝对 http/https（shared 纯函数），其余忽略；
 * - 非 clip 载荷不会调用本函数，因此 content/title/sourceUrl 在 daily/inbox 下被忽略。
 */
function extractClipPayload(payload: unknown): {
    contentTooLarge: boolean
    clip: ClipNotePayload
} {
    const source = payload as { content?: unknown; title?: unknown; sourceUrl?: unknown }
    const rawContent = source.content
    const clip: ClipNotePayload = {
        content: typeof rawContent === 'string' ? rawContent : '',
        title: sanitizeClipTitle(source.title),
        sourceUrl: sanitizeClipSourceUrl(source.sourceUrl)
    }
    return {
        contentTooLarge:
            typeof rawContent === 'string' && utf8ByteLength(rawContent) > CLIP_CONTENT_MAX_BYTES,
        clip
    }
}

/**
 * `FILE.OPEN_OR_CREATE_ENTRY` 业务入口：打开或创建今日日记 / 快速收件箱 / 剪藏笔记。
 *
 * @param payload 渲染层载荷（只接受 `{ kind: 'daily' | 'inbox' | 'clip' }`；
 *                kind='clip' 时附带可选 content/title/sourceUrl，其余 kind 忽略这些字段）
 * @param now 当前时间（仅供单测注入固定值；生产不传，取本机当前时间）
 * @returns 结构化结果：ok=true 携带 created / filePath；失败返回结构化 reason
 */
export async function openOrCreateCaptureEntry(
    payload: unknown,
    now: Date = new Date()
): Promise<OpenOrCreateEntryResult> {
    const kind = extractEntryKind(payload)
    if (kind === null) {
        return { ok: false, reason: 'invalid-kind' }
    }

    // 目录 / 文件名 / 模板均为主进程按白名单常量生成：
    // - clip 走剪藏专用目录与文件名（inbox/...-clip.md，正文来自载荷）；
    // - daily/inbox 走 E6 既有实现；三者共用同一套路径复核与独占创建逻辑。
    // 剪藏正文超限（content-too-large）在此快速失败、不触达磁盘；非 clip 载荷即使携带
    // content/title/sourceUrl 也不会进入 clip 分支（被忽略）。
    let directoryName: string
    let fileName: string | null
    let templateContent: string
    if (kind === 'clip') {
        const extracted = extractClipPayload(payload)
        if (extracted.contentTooLarge) {
            logger.warn(
                '[IPC] 剪藏：正文超过上限，已拒绝写入（上限字节数：',
                CLIP_CONTENT_MAX_BYTES,
                '）'
            )
            return { ok: false, reason: 'content-too-large' }
        }
        directoryName = CLIP_CAPTURE_DIR
        fileName = clipEntryFileName(now)
        templateContent = clipEntryTemplate(now, extracted.clip)
    } else {
        directoryName = DAILY_ENTRY_DIRECTORIES[kind]
        fileName = buildEntryFileName(kind, now)
        templateContent = buildEntryTemplate(kind, now)
    }
    if (!fileName) {
        return { ok: false, reason: 'invalid-kind' }
    }

    const rootPath = appState.rootPath
    if (!rootPath) {
        return { ok: false, reason: 'no-workspace' }
    }

    // 写入前先解析工作区根的真实物理路径，后续 resolve/relative 均基于真实根：
    // 根存在但不可解析（权限/网络盘离线等）时无法保证不越界，按写盘失败返回。
    let realRootPath: string
    try {
        realRootPath = await fs.realpath(rootPath)
    } catch (error) {
        logger.error('[IPC] 日常记录：工作区根 realpath 失败：', rootPath, error)
        return { ok: false, reason: 'write-failed' }
    }

    const directoryPath = path.resolve(realRootPath, directoryName)
    const filePath = path.resolve(directoryPath, fileName)
    if (
        !isPathInsideRoot(realRootPath, directoryPath) ||
        !isPathInsideRoot(realRootPath, filePath)
    ) {
        // 目录名/文件名均为代码常量，正常不可达；仍保留复核防止未来改动引入目录穿越。
        logger.error('[IPC] 日常记录：目标路径越出工作区根，已拒绝：', filePath)
        return { ok: false, reason: PATH_DENIED_REASON }
    }
    // 1.5.7 LLM Wiki L1（T1.3）：llm-wiki 模式下 raw/ 只读——目标目录/文件不得位于 raw/
    try {
        assertWorkspaceWritable(realRootPath, directoryPath)
        assertWorkspaceWritable(realRootPath, filePath)
    } catch (error) {
        if (error instanceof PathAccessDeniedError) {
            logger.warn('[IPC] LLM Wiki 模式：已拒绝在 raw/ 只读目录创建笔记（T1.3）：', filePath)
            return { ok: false, reason: PATH_DENIED_REASON }
        }
        throw error
    }

    try {
        await fs.mkdir(directoryPath, { recursive: true })
    } catch (error) {
        logger.error('[IPC] 日常记录：创建目录失败：', directoryPath, error)
        return { ok: false, reason: 'write-failed' }
    }

    let created = false
    try {
        // 'wx'：独占创建，文件已存在直接抛 EEXIST —— 从系统调用层保证「绝不覆盖」。
        const handle = await fs.open(filePath, 'wx')
        try {
            await handle.writeFile(templateContent, 'utf8')
        } finally {
            await handle.close()
        }
        created = true
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') {
            logger.error('[IPC] 日常记录：写入笔记文件失败：', filePath, error)
            return { ok: false, reason: 'write-failed' }
        }
        // 已存在：直接打开，不覆盖（created=false）
    }

    // 打开动作复用既有「主进程读取并通知渲染层」链路（OpenSelectFile）。
    // 打开失败不回滚已创建的文件：文件已落盘即视为创建成功，失败细节由既有链路
    // 自行向状态栏提示（这里只补日志，不向渲染层抛异常）。
    try {
        await OpenSelectFile({
            name: fileName,
            path: filePath,
            type: 'file'
        })
    } catch (error) {
        logger.warn('[IPC] 日常记录：已写入文件但打开失败：', filePath, error)
    }

    return { ok: true, created, filePath }
}

/**
 * 注册日常记录 / 剪藏 IPC（单 invoke 通道）。
 *
 * @param _mainWindow 主窗口（sender 校验由 withSenderCheck 依据受信主窗口登记完成；
 *                    本模块不主动推送消息，参数保留以对齐各域注册函数签名）
 * @param componentId 监听台账组件 ID（来源 registry 编排）
 */
export function registerCaptureIpc(_mainWindow: BrowserWindow, componentId: string): void {
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.OPEN_OR_CREATE_ENTRY,
        withSenderCheck(
            IPC.FILE.OPEN_OR_CREATE_ENTRY,
            withHandleErrorLog(
                IPC.FILE.OPEN_OR_CREATE_ENTRY,
                async (_event: Electron.IpcMainInvokeEvent, payload: unknown) =>
                    openOrCreateCaptureEntry(payload)
            ),
            { kind: 'handle' }
        ),
        componentId
    )
}
