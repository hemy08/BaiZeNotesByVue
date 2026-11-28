/**
 * 1.5.7 LLM Wiki L2 / 体验升级批次 C：MCP 只读桥 IPC（主进程侧，设置页状态/开关/端口/token）
 *
 * 链路（IPC-17 六步）：
 *   1. 常量：`IPC.MCP.GET_STATUS` / `IPC.MCP.SET_ENABLED`（shared/ipc-channels.ts）；
 *   2. 契约：`McpServerStatus` / `McpSetEnabledPayload` / `McpSetEnabledResult` +
 *      IpcRequests / IpcResponses（shared/types/ipc.ts）；
 *   3. 白名单：build/generate-preload-whitelist.js 生成（禁止手改）；
 *   4. 主进程：本模块注册 handler（withSenderCheck）→ mcp/server.ts 启停 HTTP 服务；
 *   5. 渲染层：system-setting/FeaturesPanel.vue「MCP 服务」分组；
 *   6. 测试：mcp-ipc（状态/开关/端口/token 重置/持久化/sender）+ 通道命名/契约/白名单/注册门禁。
 *
 * 多模型体验升级批次 C（MCP 可配置）：
 * - `SET_ENABLED` 支持 `port`（首选端口，1~65535；null/0 = 自动，优先 3847）与
 *   `regenerateToken`（强制重置 Bearer token，服务运行中则重启监听替换 token）；
 * - 首选端口持久化到 system-setting 的 `mcpPort`（仅偏好；服务 token 仍不落盘、
 *   不跨重启自动启动）；
 * - 端口变化 / token 重置均经 mcp/server.ts 的重启语义生效，客户端需重新配置 token。
 *
 * 安全边界：
 * - 仅主窗口可信调用（withSenderCheck，`kind: 'handle'` 拒绝返回统一错误对象）；
 * - `GET_STATUS` 返回的 token 只暴露给受信主窗口（渲染层进程内也不落 localStorage 等持久层）；
 * - `SET_ENABLED` 只接受 `{ enabled, port?, regenerateToken? }`，其余载荷结构化失败（不抛异常）；
 * - 启用状态与首选端口持久化到 system-setting（仅偏好，不持久化 token）；
 *   应用启动时 `reconcilePersistedMcpState()` 回落为 false 并记审计日志——token 不落盘，
 *   服务不跨重启自动启动（须用户重新显式启用，符合「默认关闭」安全口径）。
 */
import { app } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { McpServerStatus, McpSetEnabledResult } from '../../shared/types/ipc'
import { getSystemSetting, saveSystemSetting } from '../config/system-setting'
import { MCP_PORT_MAX, MCP_PORT_MIN } from '../mcp/constants'
import { getMcpServerStatus, startMcpServer, stopMcpServer } from '../mcp/server'
import { withSenderCheck } from '../utils/ipc-security'
import { logger } from '../utils/logger'
import { ipcListenerManager } from './ipc-listener-manager'

/** 监听台账组件 ID（与各独立域模块口径一致：global-<domain>-ipc） */
export const MCP_IPC_COMPONENT_ID = 'global-mcp-ipc'

/** `MCP.SET_ENABLED` 解析后的请求（port 为 undefined = 未提供，沿用已持久化偏好） */
interface McpSetEnabledRequest {
    enabled: boolean
    port: number | null | undefined
    regenerateToken: boolean
}

/** 取应用版本（serverInfo.version；非 Electron 测试环境回退 0.0.0） */
function readAppVersion(): string {
    try {
        const version = app?.getVersion()
        return typeof version === 'string' && version.length > 0 ? version : '0.0.0'
    } catch {
        return '0.0.0'
    }
}

/** 判断值是否为「纯对象」（不引入 shared 依赖，保持本模块可独立测试） */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 是否为合法的首选端口（1~65535 的整数；null/0 由调用方单独处理为「自动」） */
export function isValidMcpPort(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MCP_PORT_MIN &&
        value <= MCP_PORT_MAX
    )
}

/**
 * 校验首选端口载荷字段。
 *
 * @returns 成功：`{ ok:true, port }`，其中 undefined = 未提供（沿用持久化偏好）、
 * null = 自动选择；失败：`{ ok:false, error }` 可读原因。
 */
function readPreferredPort(
    value: unknown
): { ok: true; port: number | null | undefined } | { ok: false; error: string } {
    if (value === undefined) {
        return { ok: true, port: undefined }
    }
    if (value === null) {
        return { ok: true, port: null }
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        return {
            ok: false,
            error: `MCP 首选端口必须是整数或 null（0/null 表示自动选择，范围 ${MCP_PORT_MIN}~${MCP_PORT_MAX}）`
        }
    }
    if (value === 0) {
        return { ok: true, port: null }
    }
    if (value < MCP_PORT_MIN || value > MCP_PORT_MAX) {
        return {
            ok: false,
            error: `MCP 首选端口必须在 ${MCP_PORT_MIN}~${MCP_PORT_MAX} 之间（0/null 表示自动选择）`
        }
    }
    return { ok: true, port: value }
}

/**
 * 校验并解析 `MCP.SET_ENABLED` 载荷。
 *
 * @returns 成功返回解析对象；失败返回可读错误文案（调用方转结构化失败）
 */
function parseSetEnabledPayload(payload: unknown): McpSetEnabledRequest | string {
    if (!isRecord(payload)) {
        return 'MCP 启用状态参数非法（期望 { enabled: boolean, port?: number | null, regenerateToken?: boolean }）'
    }
    const enabled = payload.enabled
    if (typeof enabled !== 'boolean') {
        return 'MCP 启用状态参数非法（enabled 必须是布尔值）'
    }
    const portResult = readPreferredPort(payload.port)
    if (!portResult.ok) {
        return portResult.error
    }
    const regenerateToken = payload.regenerateToken
    if (regenerateToken !== undefined && typeof regenerateToken !== 'boolean') {
        return '重置 token 标记（regenerateToken）必须是布尔值'
    }
    return { enabled, port: portResult.port, regenerateToken: regenerateToken === true }
}

/** 持久化 MCP 启用偏好（失败只记日志，不回滚已成功的运行态） */
function persistMcpEnabled(enabled: boolean): void {
    try {
        saveSystemSetting({ mcpEnabled: enabled })
    } catch (error) {
        logger.warn('[MCP] 持久化 MCP 启用偏好失败：', error)
    }
}

/** 持久化 MCP 首选端口偏好（失败只记日志，不回滚已成功的运行态） */
function persistMcpPort(port: number | null): void {
    try {
        saveSystemSetting({ mcpPort: port })
    } catch (error) {
        logger.warn('[MCP] 持久化 MCP 首选端口失败：', error)
    }
}

/**
 * 读取已持久化的首选端口偏好（读取失败/非法值按「自动选择」处理）。
 *
 * 说明：config-schema 在渲染层写入时已做范围校验，此处防御历史脏数据/手改文件。
 */
function readPersistedMcpPort(): number | null {
    try {
        const raw = getSystemSetting().mcpPort
        return isValidMcpPort(raw) ? raw : null
    } catch (error) {
        logger.warn('[MCP] 读取 MCP 首选端口偏好失败，按自动选择处理：', error)
        return null
    }
}

/**
 * 启动时回落上次会话的「已启用」偏好，并归一化历史端口偏好。
 *
 * 原因：Bearer token 刻意不落盘（不引入 safeStorage 等新增密钥存储），进程重启后无法恢复
 * 鉴权凭据；若沿用持久化的 `mcpEnabled=true` 而不启动服务，会出现「设置显示已启用、
 * 实际未监听」的误导状态。因此启动时统一回落 false 并记审计日志，用户需在设置页重新启用
 * （重新启用会生成新 token）。首选端口 `mcpPort` **保留**（跨重启的端口偏好），非法值
 * 回落为 null（自动选择）。幂等、不抛异常。
 *
 * @returns 是否执行了任何回落/归一化（上次会话处于启用状态或端口偏好非法）
 */
export function reconcilePersistedMcpState(): boolean {
    try {
        const setting = getSystemSetting()
        let changed = false
        if (setting.mcpEnabled === true) {
            saveSystemSetting({ mcpEnabled: false })
            logger.info(
                '[MCP] 上次会话 MCP 服务处于启用状态；token 不落盘、不跨重启自动启动，已回落为关闭（需在设置页重新启用）'
            )
            changed = true
        }
        const rawPort = setting.mcpPort
        if (rawPort !== undefined && rawPort !== null && !isValidMcpPort(rawPort)) {
            saveSystemSetting({ mcpPort: null })
            logger.warn(`[MCP] 持久化的首选端口非法（${String(rawPort)}），已回落为自动选择`)
            changed = true
        }
        return changed
    } catch (error) {
        logger.warn('[MCP] 读取/回落 MCP 启用偏好失败：', error)
        return false
    }
}

/** 读取 MCP 服务实时状态（`MCP.GET_STATUS` 业务入口，导出便于单测） */
export function getMcpStatus(): McpServerStatus {
    return getMcpServerStatus()
}

/** 构造结构化失败（附实时状态，供设置页直接刷新展示） */
function buildSetEnabledFailure(error: string): McpSetEnabledResult {
    return { ok: false, error, status: getMcpStatus() }
}

/**
 * 启用/停用/重配 MCP 服务（`MCP.SET_ENABLED` 业务入口，导出便于单测）。
 *
 * - `enabled=true`：按首选端口启动 HTTP 服务（自动选端口 + 生成新 token）成功后才持久化；
 *   - `port` 未提供：沿用已持久化的 `mcpPort` 偏好；
 *   - `port=null/0`：自动选择（优先 3847），并把偏好清空为 null；
 *   - `regenerateToken=true`：服务运行中则重启监听替换 token（旧 token 立即失效）；
 * - `enabled=false`：停止服务并清空 token，持久化偏好 false；
 * - 启动失败：确保服务已停止并把偏好回落 false，返回 `{ ok:false, error, status }`；
 * - 所有失败均返回结构化结果，不向渲染层抛异常/堆栈。
 */
export async function setMcpEnabled(payload: unknown): Promise<McpSetEnabledResult> {
    const parsed = parseSetEnabledPayload(payload)
    if (typeof parsed === 'string') {
        return buildSetEnabledFailure(parsed)
    }
    try {
        if (!parsed.enabled) {
            const status = await stopMcpServer()
            persistMcpEnabled(false)
            return { ok: true, status }
        }
        const preferredPort = parsed.port !== undefined ? parsed.port : readPersistedMcpPort()
        const status = await startMcpServer({
            version: readAppVersion(),
            preferredPort,
            regenerateToken: parsed.regenerateToken
        })
        persistMcpEnabled(true)
        // 只有用户显式提交端口时才写回偏好（未提供 = 沿用原偏好，不重复落盘）
        if (parsed.port !== undefined) {
            persistMcpPort(parsed.port)
        }
        return { ok: true, status }
    } catch (error) {
        logger.error('[IPC] MCP 服务启停失败：', error)
        try {
            await stopMcpServer()
        } catch (stopError) {
            logger.warn('[IPC] MCP 服务启动失败后的清理停止也失败：', stopError)
        }
        persistMcpEnabled(false)
        return buildSetEnabledFailure(
            `MCP 服务${parsed.enabled ? '启动' : '停止'}失败：${
                error instanceof Error && error.message.length > 0 ? error.message : String(error)
            }`
        )
    }
}

/**
 * 注册 MCP 只读桥 IPC（两个 invoke 通道）。
 *
 * @param componentId 监听台账组件 ID（来源 registry 编排；缺省用本域常量）
 */
export function registerMcpIpc(componentId: string = MCP_IPC_COMPONENT_ID): void {
    // 启动阶段回落上次会话的启用偏好 + 归一化端口偏好（token 不落盘 → 不自动启动服务）
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
