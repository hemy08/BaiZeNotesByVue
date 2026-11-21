/**
 * A2 全工作区搜索/替换 IPC 注册（2026-11-21，默认开启）
 *
 * 按 IPC-17 / 附录 B1 六步链路落在第 4 步：常量（ipc-channels.ts）→ 契约（shared/types/ipc.ts）
 * → 生成白名单（build/generate-preload-whitelist.js）→ **本模块 handler** → 渲染层调用 → 测试。
 *
 * 注册方式与既有文件类通道一致：
 * - `registerHandleOnce`（进程级幂等，窗口重建不重复注册）；
 * - `withSenderCheck(..., { kind: 'handle' })`（仅受信主窗口可调用，拒绝返回
 *   `UNTRUSTED_SENDER_RESULT` 错误对象）；
 * - 业务实现在 `main/utils/workspace-search.ts`：只信任 `appState.rootPath` 工作区根，
 *   失败返回结构化结果（不向渲染层抛堆栈）。
 */
import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { WorkspaceReplaceResult, WorkspaceSearchResult } from '../../shared/types/ipc'
import { withSenderCheck } from '../utils/ipc-security'
import { logger } from '../utils/logger'
import { replaceWorkspace, searchWorkspace } from '../utils/workspace-search'
import { ipcListenerManager } from './ipc-listener-manager'

/** 未预期异常时的搜索失败结构（安全失败，渲染层按 code 显示通用错误） */
function fallbackSearchResult(): WorkspaceSearchResult {
    return {
        ok: false,
        code: 'INTERNAL_ERROR',
        files: [],
        truncated: false,
        matchCount: 0,
        scannedFiles: 0
    }
}

/** 未预期异常时的替换失败结构 */
function fallbackReplaceResult(): WorkspaceReplaceResult {
    return { ok: false, code: 'INTERNAL_ERROR', files: [], totalReplacements: 0 }
}

/**
 * 注册工作区搜索/替换 IPC。
 *
 * @param _mainWindow 主窗口（sender 校验由 withSenderCheck 依据受信主窗口登记完成，
 *                    本模块不需要主动向渲染层发送消息，参数保留以对齐各域注册函数签名）
 * @param componentId 监听台账组件 ID（来源 registry 编排）
 */
export function registerWorkspaceSearchIpc(_mainWindow: BrowserWindow, componentId: string): void {
    // FILE.SEARCH_WORKSPACE：搜索 + Quick Open 文件清单（listFilesOnly 选项复用同一通道）
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.SEARCH_WORKSPACE,
        withSenderCheck(
            IPC.FILE.SEARCH_WORKSPACE,
            async (_event: Electron.IpcMainInvokeEvent, options: unknown) => {
                try {
                    return await searchWorkspace(options)
                } catch (error) {
                    // workspace-search 内部已兜底；这里防御未来实现改动导致的漏网异常
                    logger.error('[IPC] FILE.SEARCH_WORKSPACE 未预期异常：', error)
                    return fallbackSearchResult()
                }
            },
            { kind: 'handle' }
        ),
        componentId
    )

    // FILE.REPLACE_WORKSPACE：主进程重校验路径后重新读取并写盘
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.REPLACE_WORKSPACE,
        withSenderCheck(
            IPC.FILE.REPLACE_WORKSPACE,
            async (_event: Electron.IpcMainInvokeEvent, options: unknown) => {
                try {
                    return await replaceWorkspace(options)
                } catch (error) {
                    logger.error('[IPC] FILE.REPLACE_WORKSPACE 未预期异常：', error)
                    return fallbackReplaceResult()
                }
            },
            { kind: 'handle' }
        ),
        componentId
    )
}
