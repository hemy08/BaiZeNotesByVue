/**
 * 帮助 → 使用指导 宿主入口：首次打开时动态挂载独立 Vue 应用，
 * 关闭只切显隐；编辑器/主界面卸载时释放。
 */
import { createApp, type App } from 'vue'
import { logger } from '../../../../common/logger'
import UsageGuideDialog from './UsageGuideDialog.vue'
import { closeUsageGuideDialogState, openUsageGuideDialogState } from './usage-guide-state'

/** 宿主容器 id */
export const USAGE_GUIDE_HOST_ID = 'baize-usage-guide-host'

let hostApp: App | null = null
let hostContainer: HTMLElement | null = null
let disposeGeneration = 0

async function ensureHost(): Promise<boolean> {
    if (hostApp !== null) return true
    if (typeof document === 'undefined') return false
    const generation = disposeGeneration
    try {
        if (generation !== disposeGeneration || typeof document === 'undefined') return false
        const container = document.createElement('div')
        container.id = USAGE_GUIDE_HOST_ID
        document.body.appendChild(container)
        const app = createApp(UsageGuideDialog)
        app.mount(container)
        hostApp = app
        hostContainer = container
        return true
    } catch (error) {
        logger.error('[UsageGuide] 挂载使用指导宿主失败', error)
        disposeUsageGuideHost()
        return false
    }
}

/** 打开使用指导（挂载失败返回 false，不抛错） */
export async function openUsageGuideDialog(): Promise<boolean> {
    if (!(await ensureHost())) return false
    openUsageGuideDialogState()
    return true
}

/** 关闭使用指导（保留宿主，便于再次打开） */
export function closeUsageGuideDialog(): void {
    closeUsageGuideDialogState()
}

/** 释放宿主（幂等；再次打开会重新挂载） */
export function disposeUsageGuideHost(): void {
    closeUsageGuideDialogState()
    disposeGeneration += 1
    if (hostApp !== null) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[UsageGuide] 卸载使用指导宿主失败', error)
        }
        hostApp = null
    }
    if (hostContainer !== null) {
        hostContainer.remove()
        hostContainer = null
    }
}
