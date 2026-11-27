/**
 * 未命名草稿保存确认框的宿主。
 *
 * 隔离成独立模块，由 request-open-file 在真正存在草稿时动态加载，
 * 避免普通文件打开/文件树渲染把对话框代码打进主路径。
 */
import { createApp } from 'vue'
import { logger } from '../../common/logger'
import UntitledDraftDialog from '../dialogs/simple/UntitledDraftDialog.vue'

export type UntitledDraftChoice = 'save' | 'discard' | 'cancel'

const HOST_ID = 'baize-untitled-draft-host'

/** 弹出三选一确认框；对话框关闭或挂载失败都会 resolve（不会悬挂） */
export function showUntitledDraftPrompt(): Promise<UntitledDraftChoice> {
    return new Promise((resolve) => {
        let settled = false
        const container = document.createElement('div')
        container.id = HOST_ID
        document.body.appendChild(container)

        const finish = (choice: UntitledDraftChoice): void => {
            if (settled) {
                return
            }
            settled = true
            try {
                app.unmount()
            } catch (error) {
                logger.warn('[UntitledDraft] 卸载确认框失败', error)
            }
            container.remove()
            resolve(choice)
        }

        const app = createApp(UntitledDraftDialog, {
            onSave: () => finish('save'),
            onDiscard: () => finish('discard'),
            onCancel: () => finish('cancel')
        })

        try {
            app.mount(container)
        } catch (error) {
            logger.error('[UntitledDraft] 挂载确认框失败', error)
            finish('cancel')
        }
    })
}
