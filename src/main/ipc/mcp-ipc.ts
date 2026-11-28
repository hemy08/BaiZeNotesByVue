/**
 * 1.5.7 LLM Wiki L2：MCP 只读桥 IPC（主进程侧，设置页状态/开关）
 *
 * 链路（IPC-17 六步）：
 *   1. 常量：`IPC.MCP.GET_STATUS` / `IPC.MCP.SET_ENABLED`（shared/ipc-channels.ts）；
 *   2. 契约：`McpServerStatus` / `McpSetEnabledPayload` / `McpSetEnabledResult` +
 *      IpcRequests / IpcResponses（shared/types/ipc.ts）；
 *   3. 白名单：build/generate-preload-whitelist.js 生成（禁止手改）；
 *   4. 主进程：本模块注册 handler（withSenderCheck）→ mcp/server.ts 启停 HTTP 服务；
 *   5. 渲染层：system-setting/FeaturesPanel.vue「MCP 服务」分组；
 *   6. 测试：mcp-ipc（状态/开关/持久化/sender）+ 通道命名/契约/白名单/注册门禁。
 *
 * 安全边界：
 * - 仅主窗口可信调用（withSenderCheck，`kind: 'handle'` 拒绝返回统一错误对象）；
 * - `GET_STATUS` 返回的 token 只暴露给受信主窗口（渲染层进程内也不落 localStorage 等持久层）；
 * - `SET_ENABLED` 只接受 `{ enabled: boolean }`，其余载荷返回结构化失败（不抛异常）；
 * - 启用状态持久化到 system-setting 的 `mcpEnabled`（仅偏好，不持久化 token）；
 *   应用启动时 `reconcilePersistedMcpState()` 回落为 false 并记审计日志——token 不落盘，
 *   服务不跨重启自动启动（须用户重新显式启用，符合「默认关闭」安全口径）。
 */
import { app } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { McpServerStatus, McpSetEnabledResult } from '../../shared/types/ipc'
import { getSystemSetting, saveSystemSetting } from '../config/system-setting'
import { getMcpServerStatus, startMcpServer, stopMcpServer } from '../mcp/server'
import { withSenderCheck } from '../utils/ipc-security'
import { logger } from '../utils/logger'
import { ipcListenerManager } from './ipc-listener-manager'

/** 监听台账组件 ID（与各独立域模块口径一致：global-<domain>-ipc） */
export const MCP_IPC_COMPONENT_ID = 'global-mcp-ipc'

/** 取应用版本（serverInfo.version；非 Electron 测试环境回退 0.0.0） */
function readAppVersion(): string {
    try {
        const version = app?.getVersion()
        return typeof version === 'string' && version.length > 0 ? version : '0.0.0'
    } catch {
        return '0.0.0'
    }
}

/** 持久化 MCP 启用偏好（失败只记日志，不回滚已成功的运行态） */
function persistMcpEnabled(enabled: boolean): void {
    try {
        saveSystemSetting({ mcpEnabled: enabled })
    } catch (error) {
        logger.warn('[MCP] 持久化 MCP 启用偏好失败：', error)
    }
}

/**
 * 启动时回落上次会话的「已启用」偏好。
 *
 * 原因：Bearer token 刻意不落盘（不引入 safeStorage 等新增密钥存储），进程重启后无法恢复
 * 鉴权凭据；若沿用持久化的 `mcpEnabled=true` 而不启动服务，会出现「设置显示已启用、
 * 实际未监听」的误导状态。因此启动时统一回落 false 并记审计日志，用户需在设置页重新启用
 * （重新启用会生成新 token）。幂等、不抛异常。
 *
 * @returns 是否执行了回落（上次会话处于启用状态）
 */
export function reconcilePersistedMcpState(): boolean {
    try {
        if (getSystemSetting().mcpEnabled !== true) {
            return false
        }
        saveSystemSetting({ mcpEnabled: false })
        logger.info(
            '[MCP] 上次会话 MCP 服务处于启用状态；token 不落盘、不跨重启自动启动，已回落为关闭（需在设置页重新启用）'
        )
        return true
    } catch (error) {
        logger.warn('[MCP] 读取/回落 MCP 启用偏好失败：', error)
        return false
    }
}

/** 读取 MCP 服务实时状态（`MCP.GET_STATUS` 业务入口，导出便于单测） */
export function getMcpStatus(): McpServerStatus {
    return getMcpServerStatus()
}

/** 是否为「{ enabled: boolean }」形态的启用状态载荷 */
function readSetEnabledPayload(payload: unknown): boolean | null {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return null
    }
    const enabled = (payload as { enabled?: unknown }).enabled
    return typeof enabled === 'boolean' ? enabled : null
}

/**
 * 启用/停用 MCP 服务（`MCP.SET_ENABLED` 业务入口，导出便于单测）。
 *
 * - enabled=true：启动 HTTP 服务（自动选端口 + 生成新 token）成功后才持久化偏好 true；
 * - enabled=false：停止服务并清空 token，持久化偏好 false；
 * - 启动失败：确保服务已停止并把偏好回落 false，返回 `{ ok:false, error, status }`；
 * - 所有失败均返回结构化结果，不向渲染层抛异常/堆栈。
 */
export async function setMcpEnabled(payload: unknown): Promise<McpSetEnabledResult> {
    const enabled = readSetEnabledPayload(payload)
    if (enabled === null) {
        return {
            ok: false,
            error: 'MCP 启用状态参数非法（期望 { enabled: boolean }）',
            status: getMcpStatus()
        }
    }
    try {
        if (enabled) {
            const status = await startMcpServer({ version: readAppVersion() })
            persistMcpEnabled(true)
            return { ok: true, status }
        }
        const status = await stopMcpServer()
        persistMcpEnabled(false)
        return { ok: true, status }
    } catch (error) {
        logger.error('[IPC] MCP 服务启停失败：', error)
        try {
            await stopMcpServer()
        } catch (stopError) {
            logger.warn('[IPC] MCP 服务启动失败后的清理停止也失败：', stopError)
        }
        persistMcpEnabled(false)
        return {
            ok: false,
            error: `MCP 服务${enabled ? '启动' : '停止'}失败：${
                error instanceof Error && error.message.length > 0 ? error.message : String(error)
            }`,
            status: getMcpStatus()
        }
    }
}

/**
 * 注册 MCP 只读桥 IPC（两个 invoke 通道）。
 *
 * @param componentId 监听台账组件 ID（来源 registry 编排；缺省用本域常量）
 */
export function registerMcpIpc(componentId: string = MCP_IPC_COMPONENT_ID): void {
    // 启动阶段回落上次会话的启用偏好（token 不落盘 → 不自动启动服务）
    reconcilePersistedMcpState()
    ipcListenerManager.registerHandleOnce(
        IPC.MCP.GET_STATUS,
        withSenderCheck(
            IPC.MCP.GET_STATUS,
            // 无参 invoke：只返回实时状态；token 仅对受信主窗口可见（sender 校验在包装器内）
            async () => getMcpStatus(),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.MCP.SET_ENABLED,
        withSenderCheck(
            IPC.MCP.SET_ENABLED,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => setMcpEnabled(payload),
            { kind: 'handle' }
        ),
        componentId
    )
}
