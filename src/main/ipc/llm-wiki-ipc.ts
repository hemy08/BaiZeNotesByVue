/**
 * 1.5.7 LLM Wiki L1：工作区初始化 IPC（主进程侧）
 *
 * 链路（IPC-17 六步）：
 *   1. 常量：`IPC.FILE.INITIALIZE_LLM_WIKI`（shared/ipc-channels.ts）；
 *   2. 契约：`InitializeLlmWikiResult` + IpcRequests / IpcResponses（shared/types/ipc.ts）；
 *   3. 白名单：build/generate-preload-whitelist.js 生成（禁止手改）；
 *   4. 主进程：本模块注册 handler → utils/llm-wiki-workspace.ts 执行初始化；
 *   5. 渲染层：菜单动作 / 命令面板 / 设置页经受限 ipcRenderer.invoke 调用；
 *   6. 测试：llm-wiki-ipc / llm-wiki-workspace 单测 + 通道/契约/白名单/注册门禁。
 *
 * 安全边界：
 * - 仅主窗口可信调用（withSenderCheck，`kind: 'handle'` 拒绝返回统一错误对象）；
 * - 渲染层不传任何参数，工作区根只取 `appState.rootPath`（主进程唯一真源）；
 * - 初始化服务内部再做根路径校验与「工作区根内」目标拼接，失败返回结构化结果。
 */
import { IPC } from '../../shared/ipc-channels'
import type { InitializeLlmWikiResult } from '../../shared/types/ipc'
import { appState } from '../utils/app-state'
import { withSenderCheck } from '../utils/ipc-security'
import {
    initializeLlmWikiWorkspace,
    LLM_WIKI_ERROR_NO_WORKSPACE
} from '../utils/llm-wiki-workspace'
import { ipcListenerManager } from './ipc-listener-manager'

/** 监听台账组件 ID（与各独立域模块口径一致：global-<domain>-ipc） */
export const LLM_WIKI_IPC_COMPONENT_ID = 'global-llm-wiki-ipc'

/**
 * `FILE.INITIALIZE_LLM_WIKI` 业务入口（导出便于单测直接断言）。
 *
 * @param rootPath 工作区根（生产由 handler 传 `appState.rootPath`；单测可注入）
 * @returns 结构化结果；无工作区返回 `{ success: false, error }`，不抛异常
 */
export async function initializeLlmWiki(
    rootPath: string | null | undefined = appState.rootPath
): Promise<InitializeLlmWikiResult> {
    if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
        return { success: false, error: LLM_WIKI_ERROR_NO_WORKSPACE }
    }
    return initializeLlmWikiWorkspace(rootPath)
}

/**
 * 注册 LLM Wiki 工作区初始化 IPC。
 *
 * @param componentId 监听台账组件 ID（来源 registry 编排；缺省用本域常量）
 */
export function registerLlmWikiIpc(componentId: string = LLM_WIKI_IPC_COMPONENT_ID): void {
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.INITIALIZE_LLM_WIKI,
        withSenderCheck(
            IPC.FILE.INITIALIZE_LLM_WIKI,
            // 无参 invoke：工作区根只取主进程持有的 appState.rootPath（不信任渲染层入参）
            async () => initializeLlmWiki(appState.rootPath),
            { kind: 'handle' }
        ),
        componentId
    )
}
