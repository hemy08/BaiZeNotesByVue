/**
 * 1.5.2 E6 今日日记 / 快速收件箱 —— 渲染层入口动作（命令面板与「工具」菜单共用）
 *
 * 职责边界：
 * - 只做「能力开关提示 / IPC 调用 / 失败原因文案」这三件事，不复制主进程的目录与模板逻辑；
 * - 渲染层只传 `kind` 白名单（daily / inbox），路径与文件名由主进程生成（防目录穿越）；
 * - 成功时主进程经既有打开链路把文件内容推送渲染层，本模块不额外处理打开；
 * - 失败经 `getConfigStore().showError/showWarning` 给出可见提示（LOG-08 禁止静默失败），
 *   并按 reason（no-workspace / invalid-kind / write-failed）映射中英文案。
 *
 * 调用方：
 * - `components/search/CommandPalette.vue`（命令面板 2 条命令，开关关闭时不注册）；
 * - `components/MenuBar/menu-actions.ts`（工具菜单 2 项，执行前检查 `featureDailyNotes`）。
 */
import { IPC } from '../../../shared/ipc-channels'
import type { DailyEntryKind } from '../../../shared/constants/daily-entries'
import type { OpenOrCreateEntryResult } from '../../../shared/types/ipc'
import { describeActionError } from './action-feedback'
import { t } from './i18n'
import { logger } from './logger'
import { getConfigStore } from './useConfigStore'

/**
 * 能力开关关闭时的统一提示（菜单动作执行前调用；命令面板按开关直接不注册入口）。
 */
export function showCaptureFeatureDisabled(): void {
    getConfigStore().showWarning(
        t('editorUi.dailyEntries.disabledTitle'),
        t('editorUi.dailyEntries.disabledMessage')
    )
}

/** 把主进程返回的结构化 reason 映射为已本地化的失败正文（未知 reason 回退通用文案） */
function describeEntryFailure(result: OpenOrCreateEntryResult | null | undefined): string {
    switch (result?.reason) {
        case 'no-workspace':
            return t('editorUi.dailyEntries.noWorkspace')
        case 'invalid-kind':
            return t('editorUi.dailyEntries.invalidKind')
        case 'write-failed':
            return t('editorUi.dailyEntries.writeFailed')
        default:
            return t('editorUi.dailyEntries.failedMessage')
    }
}

/**
 * 打开/创建今日日记或快速收件箱笔记（异步执行，不向调用方抛错）。
 *
 * @param kind 入口类型（daily = 今日日记；inbox = 快速收件箱）
 */
export function openOrCreateCaptureEntry(kind: DailyEntryKind): void {
    if (typeof window === 'undefined' || !window.electron?.ipcRenderer) {
        logger.error('[Capture] 受限 ipcRenderer 不可用，无法打开/创建日常记录入口')
        getConfigStore().showError(
            t('editorUi.dailyEntries.failedTitle'),
            t('editorUi.dailyEntries.unavailable')
        )
        return
    }
    const ipcRenderer = window.electron.ipcRenderer

    void ipcRenderer
        .invoke(IPC.FILE.OPEN_OR_CREATE_ENTRY, { kind })
        .then((raw: unknown) => {
            // 契约：ok=true 时主进程已经（或确认）写入并复用既有打开链路推送内容
            const result = raw as OpenOrCreateEntryResult | null | undefined
            if (result?.ok === true) {
                return
            }
            const message = describeEntryFailure(result)
            logger.error(`[Capture] 打开/创建日常记录失败（kind=${kind}）：`, result)
            getConfigStore().showError(t('editorUi.dailyEntries.failedTitle'), message)
        })
        .catch((error: unknown) => {
            logger.error('[Capture] 打开/创建日常记录 IPC 调用异常：', error)
            getConfigStore().showError(
                t('editorUi.dailyEntries.failedTitle'),
                t('editorUi.dailyEntries.invokeFailed', {
                    error: describeActionError(error, t('common.unknown'))
                })
            )
        })
}
