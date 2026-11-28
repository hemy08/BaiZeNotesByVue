/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译队列渲染层运行时适配器。
 *
 * ## 职责
 * 把「渲染层可用的既有能力」装配成 `batch-compile-queue.ts` 的注入依赖：
 * - 目标清单：既有目录树事件（`FILE_MANAGER.RELOAD_FROM_DISK` 触发 → `FILE_SYSTEM_DATA`
 *   整树下发 → `common/batch-compile.ts` 纯函数解析），**不新增 IPC**；
 * - 读取既有 wiki 页面：既有文本读取通道 `FILE.READ_HTML`（主进程做 Path Guard +
 *   文本扩展名白名单）；
 * - AI 配置：既有 `AI.GET_CONFIG`（只读归一化，判断是否可用 + 默认模型是否远程）；
 * - 生成草案：既有 `AI.INGEST`（带 `rawPath` 指定本次编译的原始资料，仍不写盘）；
 * - 审批写盘：既有 `AI.APPLY_INGEST`（`approved=true`，主进程复核 wiki/ 目标与 raw 只读守卫）。
 *
 * ## 失败口径
 * - invoke 不可用/抛异常/返回结构非法：统一转结构化可读错误（不向 UI 抛堆栈）；
 * - 目录树等待超时（默认 8s）返回 `ok:false`，由对话框给出可重试提示。
 */
import type { AiDiffLine, AiIngestSuccess } from '../../../../shared/types/ai'
import { IPC } from '../../../../shared/ipc-channels'
import { normalizeAiStoredConfig } from '../../../../shared/constants/ai'
import { t } from '../../common/i18n'
import { logger } from '../../common/logger'
import {
    createBatchCompileRecordStore,
    parseBatchCompileWorkspaceTree,
    resolveBatchCompileLocalStorage,
    type BatchCompileRecordStorage
} from '../../common/batch-compile'
import type {
    BatchCompileAiConfig,
    BatchCompileApplyOutcome,
    BatchCompileDeps,
    BatchCompileIngestOutcome,
    BatchCompileTreeOutcome
} from './batch-compile-queue'

/** 等待目录树事件超时（ms；超时给出可重试错误，不阻塞对话框） */
export const BATCH_COMPILE_TREE_TIMEOUT_MS = 8_000

/** 受限 ipcRenderer 最小结构（与渲染层其它动作模块同款守卫，不直接依赖 Electron 类型） */
export interface BatchCompileRendererIpc {
    invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
    send?: (channel: string, ...args: unknown[]) => void
    on?: (channel: string, listener: (...args: unknown[]) => void) => void
    removeListener?: (channel: string, listener: (...args: unknown[]) => void) => void
}

/** 取 preload 暴露的受限 ipcRenderer；非 Electron 环境返回 null */
export function getBatchCompileRendererIpc(): BatchCompileRendererIpc | null {
    if (typeof window === 'undefined') {
        return null
    }
    const bridge = (window as { electron?: { ipcRenderer?: BatchCompileRendererIpc } }).electron
    const ipcRenderer = bridge?.ipcRenderer
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
        return null
    }
    return ipcRenderer
}

/** 解析默认 invoke（缺失/被裁剪时返回 null，调用方走结构化失败） */
function resolveDefaultInvoke():
    ((channel: string, ...args: unknown[]) => Promise<unknown>) | null {
    const ipc = getBatchCompileRendererIpc()
    if (!ipc || typeof ipc.invoke !== 'function') {
        return null
    }
    const invoke = ipc.invoke
    return (channel: string, ...args: unknown[]) => invoke.call(ipc, channel, ...args)
}

/** 是否为普通对象（运行时结构守卫） */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取可读字符串（空串/非字符串回落 undefined） */
function readText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** 结构化失败 → 可读文案（message 优先，其次 code，最后未知） */
function readFailureMessage(raw: unknown): string | null {
    if (!isRecord(raw) || raw.ok !== false) {
        return null
    }
    return readText(raw.message) ?? readText(raw.code) ?? t('common.unknown')
}

/**
 * 请求主进程重扫目录树并等待 `FILE_MANAGER.FILE_SYSTEM_DATA` 事件（复用既有通道）。
 *
 * @param ipc 可注入 ipcRenderer 替身（单测用；缺省取 preload）
 * @param timeoutMs 等待超时（缺省 8s）
 */
export async function loadBatchCompileWorkspaceTree(
    ipc: BatchCompileRendererIpc | null = getBatchCompileRendererIpc(),
    timeoutMs: number = BATCH_COMPILE_TREE_TIMEOUT_MS
): Promise<BatchCompileTreeOutcome> {
    if (ipc === null) {
        return { ok: false, error: t('editorUi.batchCompile.ipcUnavailable') }
    }
    const onFn = ipc.on
    const sendFn = ipc.send
    if (typeof onFn !== 'function' || typeof sendFn !== 'function') {
        return { ok: false, error: t('editorUi.batchCompile.ipcUnavailable') }
    }
    return new Promise<BatchCompileTreeOutcome>((resolve) => {
        let settled = false
        let timeout: ReturnType<typeof setTimeout> | null = null
        const finish = (outcome: BatchCompileTreeOutcome): void => {
            if (settled) {
                return
            }
            settled = true
            if (timeout !== null) {
                clearTimeout(timeout)
                timeout = null
            }
            try {
                ipc.removeListener?.(IPC.FILE_MANAGER.FILE_SYSTEM_DATA, listener)
            } catch (removeError) {
                logger.warn('[批量编译] 移除目录树监听失败（忽略）', removeError)
            }
            resolve(outcome)
        }
        const listener = (_event: unknown, payload: unknown): void => {
            const parsed = parseBatchCompileWorkspaceTree(payload)
            if (!parsed.ok) {
                finish({
                    ok: false,
                    error:
                        parsed.code === 'NO_WORKSPACE'
                            ? t('editorUi.batchCompile.noWorkspace')
                            : t('editorUi.batchCompile.invalidTree')
                })
                return
            }
            finish({ ok: true, tree: parsed.tree })
        }
        timeout = setTimeout(() => {
            timeout = null
            finish({ ok: false, error: t('editorUi.batchCompile.treeTimeout') })
        }, timeoutMs)
        try {
            onFn.call(ipc, IPC.FILE_MANAGER.FILE_SYSTEM_DATA, listener)
            sendFn.call(ipc, IPC.FILE_MANAGER.RELOAD_FROM_DISK)
        } catch (sendError) {
            logger.warn('[批量编译] 请求刷新目录树失败：', sendError)
            finish({ ok: false, error: t('editorUi.batchCompile.ipcUnavailable') })
        }
    })
}

/**
 * 读取文本文件（既有 `FILE.READ_HTML` 通道；主进程做 Path Guard + 扩展名白名单）。
 * @returns 文件内容；通道不可用/读取失败/返回非字符串 → null（调用方按「不可判定」处理）
 */
export async function readBatchCompileTextFile(
    absolutePath: string,
    invoke:
        ((channel: string, ...args: unknown[]) => Promise<unknown>) | null = resolveDefaultInvoke()
): Promise<string | null> {
    if (!invoke || typeof absolutePath !== 'string' || absolutePath.trim().length === 0) {
        return null
    }
    try {
        const raw = await invoke(IPC.FILE.READ_HTML, absolutePath)
        return typeof raw === 'string' ? raw : null
    } catch (error) {
        logger.warn('[批量编译] 读取文件失败：', absolutePath, error)
        return null
    }
}

/** 失败态 AI 配置（读取失败/未启用时的安全兜底） */
export function createEmptyBatchCompileAiConfig(readFailed = false): BatchCompileAiConfig {
    return {
        configured: false,
        readFailed,
        defaultModelId: null,
        defaultModelName: null,
        defaultModelRemote: false,
        hasLocalModel: false
    }
}

/**
 * 归一化 `AI.GET_CONFIG` 返回值 → 队列所需 AI 配置摘要。
 *
 * 口径：
 * - `configured = enabled && models.length>0 && 生效默认模型存在`（AI.INGEST 固定使用
 *   defaultModelId；快照缺省时按首个模型兜底，与主进程 resolveAiModel 的回落一致）；
 * - `defaultModelRemote`：生效默认模型的 provider === 'remote'（远程隐私提示依据）；
 * - `hasLocalModel`：是否存在本地模型（仅提示用户可切换默认模型；AI.INGEST 不支持按次指定）。
 */
export function normalizeBatchCompileAiConfigSnapshot(raw: unknown): BatchCompileAiConfig {
    if (!isRecord(raw)) {
        return createEmptyBatchCompileAiConfig()
    }
    const stored = normalizeAiStoredConfig(raw)
    const models = stored.models
    if (!stored.enabled || models.length === 0) {
        return createEmptyBatchCompileAiConfig()
    }
    const defaultModel = models.find((model) => model.id === stored.defaultModelId) ?? models[0]
    return {
        configured: defaultModel !== undefined,
        readFailed: false,
        defaultModelId: defaultModel?.id ?? null,
        defaultModelName: defaultModel
            ? defaultModel.name.trim().length > 0
                ? defaultModel.name
                : defaultModel.model
            : null,
        defaultModelRemote: defaultModel?.provider === 'remote',
        hasLocalModel: models.some((model) => model.provider === 'local')
    }
}

/** 读取 AI 配置摘要（既有 `AI.GET_CONFIG`；失败按未配置处理并标记 readFailed） */
export async function readBatchCompileAiConfig(
    invoke:
        ((channel: string, ...args: unknown[]) => Promise<unknown>) | null = resolveDefaultInvoke()
): Promise<BatchCompileAiConfig> {
    if (!invoke) {
        return createEmptyBatchCompileAiConfig(true)
    }
    try {
        const raw: unknown = await invoke(IPC.AI.GET_CONFIG)
        return normalizeBatchCompileAiConfigSnapshot(raw)
    } catch (error) {
        logger.warn('[批量编译] 读取 AI 配置失败，按未配置处理：', error)
        return createEmptyBatchCompileAiConfig(true)
    }
}

/** 运行时结构守卫：把 `AI.INGEST` diff 行收敛为合法行（非法项丢弃） */
function normalizeBatchCompileDiffLines(raw: unknown): AiDiffLine[] {
    if (!Array.isArray(raw)) {
        return []
    }
    const lines: AiDiffLine[] = []
    for (const item of raw) {
        if (!isRecord(item)) {
            continue
        }
        if (item.type !== 'add' && item.type !== 'del' && item.type !== 'context') {
            continue
        }
        if (typeof item.content !== 'string') {
            continue
        }
        lines.push({
            type: item.type,
            content: item.content,
            ...(typeof item.oldLine === 'number' ? { oldLine: item.oldLine } : {}),
            ...(typeof item.newLine === 'number' ? { newLine: item.newLine } : {})
        })
    }
    return lines
}

/** 运行时结构守卫：把 `AI.INGEST` 成功返回值收敛为 `AiIngestSuccess`（非法返回 null） */
export function normalizeBatchCompileIngestSuccess(raw: unknown): AiIngestSuccess | null {
    if (!isRecord(raw) || raw.ok !== true) {
        return null
    }
    if (
        typeof raw.draftPath !== 'string' ||
        raw.draftPath.length === 0 ||
        typeof raw.content !== 'string' ||
        typeof raw.sourcePath !== 'string' ||
        raw.sourcePath.length === 0
    ) {
        return null
    }
    return {
        ok: true,
        draftPath: raw.draftPath,
        content: raw.content,
        sourcePath: raw.sourcePath,
        diff: normalizeBatchCompileDiffLines(raw.diff),
        isUpdate: raw.isUpdate === true,
        diffTruncated: raw.diffTruncated === true,
        ...(typeof raw.model === 'string' && raw.model.trim().length > 0
            ? { model: raw.model.trim() }
            : {})
    }
}

/** 生成单个 raw 文件的 wiki 草案（`AI.INGEST` + `rawPath`；不写盘） */
export async function ingestBatchCompileRawFile(
    rawPath: string,
    invoke:
        ((channel: string, ...args: unknown[]) => Promise<unknown>) | null = resolveDefaultInvoke()
): Promise<BatchCompileIngestOutcome> {
    if (!invoke) {
        return { ok: false, error: t('editorUi.batchCompile.ipcUnavailable') }
    }
    try {
        const raw: unknown = await invoke(IPC.AI.INGEST, { rawPath })
        const failure = readFailureMessage(raw)
        if (failure !== null) {
            return { ok: false, error: failure }
        }
        const success = normalizeBatchCompileIngestSuccess(raw)
        if (success === null) {
            return { ok: false, error: t('editorUi.batchCompile.invalidIngestResult') }
        }
        return { ok: true, draft: success }
    } catch (error) {
        logger.error('[批量编译] AI 编译调用异常：', error)
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
}

/** 审批后写入 wiki 页面（`AI.APPLY_INGEST`，approved=true） */
export async function applyBatchCompileDraft(
    request: { draftPath: string; content: string },
    invoke:
        ((channel: string, ...args: unknown[]) => Promise<unknown>) | null = resolveDefaultInvoke()
): Promise<BatchCompileApplyOutcome> {
    if (!invoke) {
        return { ok: false, error: t('editorUi.batchCompile.ipcUnavailable') }
    }
    try {
        const raw: unknown = await invoke(IPC.AI.APPLY_INGEST, {
            draftPath: request.draftPath,
            content: request.content,
            approved: true
        })
        const failure = readFailureMessage(raw)
        if (failure !== null) {
            return { ok: false, error: failure }
        }
        if (!isRecord(raw) || raw.ok !== true) {
            return { ok: false, error: t('editorUi.batchCompile.invalidApplyResult') }
        }
        const writtenPath =
            typeof raw.draftPath === 'string' && raw.draftPath.length > 0
                ? raw.draftPath
                : request.draftPath
        return { ok: true, path: writtenPath }
    } catch (error) {
        logger.error('[批量编译] 写入 wiki 页面异常：', error)
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
}

/**
 * 创建默认运行时依赖（生产装配；对话框每次打开创建一份，关闭时随队列 dispose）。
 *
 * @param storageOverride 可选 localStorage 替身（单测注入）
 */
export function createDefaultBatchCompileDeps(
    storageOverride?: BatchCompileRecordStorage | null
): BatchCompileDeps {
    const storage =
        storageOverride === undefined ? resolveBatchCompileLocalStorage() : storageOverride
    return {
        now: () => Date.now(),
        loadWorkspaceTree: () => loadBatchCompileWorkspaceTree(),
        readText: (absolutePath) => readBatchCompileTextFile(absolutePath),
        readAiConfig: () => readBatchCompileAiConfig(),
        ingest: (rawPath) => ingestBatchCompileRawFile(rawPath),
        apply: (request) => applyBatchCompileDraft(request),
        records: createBatchCompileRecordStore(storage)
    }
}
