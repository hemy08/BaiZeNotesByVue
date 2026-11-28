/**
 * 1.5.7 终端工具（阶段 A）：终端 IPC（主进程侧，domain=terminal，4 invoke）
 *
 * ## 链路（IPC-17 六步）
 * 1. 常量：`IPC.TERMINAL.CREATE / WRITE / RESIZE / CLOSE`（shared/ipc-channels.ts）；
 * 2. 契约：`TerminalCreateRequest / TerminalWriteRequest / TerminalResizeRequest /
 *    TerminalCloseRequest` 与三个返回结构 + IpcRequests / IpcResponses（shared/types/ipc.ts）；
 * 3. 白名单：build/generate-preload-whitelist.js 生成（禁止手改）；
 * 4. 主进程：本模块注册 handler（withSenderCheck + payload 校验）→ terminal/pty-manager.ts
 *    （node-pty 会话 / 输出节流 / 上限 / 清理）；
 * 5. 渲染层（阶段 B）：右侧边栏终端面板（xterm + addon-fit），与 AI 助手面板同布局；
 * 6. 测试：terminal-ipc / terminal-pty-manager + 通道命名/契约/白名单/注册门禁。
 *
 * ## 安全边界
 * - 四个通道全部 `handle` + `withSenderCheck`（仅主窗口可信；拒绝时返回既有统一拒绝对象）；
 * - **payload 全部在此校验**（普通对象 / id 非空字符串 / cols·rows 为 1..500 整数 /
 *   data 为 ≤64 KiB 字符串 / shell 属于白名单），非法 → `TERMINAL_INVALID_PAYLOAD`；
 * - **cwd 不接受渲染层传入**：由 pty-manager 只取主进程 `appState.rootPath`；
 * - 无工作区 → `TERMINAL_NO_WORKSPACE`；会话超上限 → `TERMINAL_LIMIT_REACHED`；
 * - 所有失败返回结构化结果（不向渲染层抛异常/堆栈）。
 */
import { IPC } from '../../shared/ipc-channels'
import type {
    TerminalCloseRequest,
    TerminalCreateRequest,
    TerminalCreateResult,
    TerminalOperationResult,
    TerminalResizeRequest,
    TerminalShell,
    TerminalWriteRequest
} from '../../shared/types/ipc'
import {
    createTerminalSession,
    closeTerminal,
    MAX_TERMINAL_WRITE_CHARS,
    resizeTerminal,
    TERMINAL_MAX_DIMENSION,
    TERMINAL_MIN_DIMENSION,
    writeTerminal
} from '../terminal/pty-manager'
import { withSenderCheck } from '../utils/ipc-security'
import { ipcListenerManager } from './ipc-listener-manager'

/** 监听台账组件 ID（与各独立域模块口径一致：global-<domain>-ipc） */
export const TERMINAL_IPC_COMPONENT_ID = 'global-terminal-ipc'

/** shell 白名单（payload 校验唯一真源；与 shared/types/ipc.ts TerminalShell 对齐） */
export const TERMINAL_SHELL_WHITELIST: readonly TerminalShell[] = ['cmd', 'powershell', 'bash']

/** payload 解析结果：成功携带已校验的强类型请求，失败携带中文可读原因 */
export type TerminalPayloadParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** 是否为普通对象载荷（数组 / null / 基本类型均不合法） */
function isPlainPayloadObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 校验终端尺寸（列/行）：1..500 的整数 */
function isValidTerminalDimension(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= TERMINAL_MIN_DIMENSION &&
        value <= TERMINAL_MAX_DIMENSION
    )
}

/** 校验会话 id：非空字符串（长度不设业务上限，仅防异常类型） */
function isValidTerminalId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0
}

/**
 * 校验 `TERMINAL.CREATE` 载荷。
 *
 * @param payload 渲染层实参（不信任）
 * @returns 合法 → 已校验请求；非法 → 中文原因
 */
export function parseTerminalCreatePayload(
    payload: unknown
): TerminalPayloadParseResult<TerminalCreateRequest> {
    if (!isPlainPayloadObject(payload)) {
        return { ok: false, error: '创建终端参数必须是对象' }
    }
    if (!isValidTerminalDimension(payload.cols) || !isValidTerminalDimension(payload.rows)) {
        return {
            ok: false,
            error: `终端尺寸必须是 ${TERMINAL_MIN_DIMENSION}~${TERMINAL_MAX_DIMENSION} 的整数`
        }
    }
    const shell = payload.shell
    if (shell !== undefined && !TERMINAL_SHELL_WHITELIST.includes(shell as TerminalShell)) {
        return { ok: false, error: '终端 shell 不在白名单（cmd / powershell / bash）' }
    }
    return {
        ok: true,
        value: {
            cols: payload.cols,
            rows: payload.rows,
            shell: shell as TerminalShell | undefined
        }
    }
}

/**
 * 校验 `TERMINAL.WRITE` 载荷。
 *
 * @returns 合法 → `{ id, data }`；非法 → 中文原因（data 上限 64 KiB）
 */
export function parseTerminalWritePayload(
    payload: unknown
): TerminalPayloadParseResult<TerminalWriteRequest> {
    if (!isPlainPayloadObject(payload)) {
        return { ok: false, error: '写入终端参数必须是对象' }
    }
    if (!isValidTerminalId(payload.id)) {
        return { ok: false, error: '终端会话 id 必须是非空字符串' }
    }
    if (typeof payload.data !== 'string') {
        return { ok: false, error: '终端输入数据必须是字符串' }
    }
    if (payload.data.length > MAX_TERMINAL_WRITE_CHARS) {
        return { ok: false, error: '终端输入单次不能超过 64 KiB' }
    }
    return { ok: true, value: { id: payload.id, data: payload.data } }
}

/**
 * 校验 `TERMINAL.RESIZE` 载荷。
 *
 * @returns 合法 → `{ id, cols, rows }`；非法 → 中文原因
 */
export function parseTerminalResizePayload(
    payload: unknown
): TerminalPayloadParseResult<TerminalResizeRequest> {
    if (!isPlainPayloadObject(payload)) {
        return { ok: false, error: '调整终端尺寸参数必须是对象' }
    }
    if (!isValidTerminalId(payload.id)) {
        return { ok: false, error: '终端会话 id 必须是非空字符串' }
    }
    if (!isValidTerminalDimension(payload.cols) || !isValidTerminalDimension(payload.rows)) {
        return {
            ok: false,
            error: `终端尺寸必须是 ${TERMINAL_MIN_DIMENSION}~${TERMINAL_MAX_DIMENSION} 的整数`
        }
    }
    return { ok: true, value: { id: payload.id, cols: payload.cols, rows: payload.rows } }
}

/**
 * 校验 `TERMINAL.CLOSE` 载荷。
 *
 * @returns 合法 → `{ id }`；非法 → 中文原因
 */
export function parseTerminalClosePayload(
    payload: unknown
): TerminalPayloadParseResult<TerminalCloseRequest> {
    if (!isPlainPayloadObject(payload)) {
        return { ok: false, error: '关闭终端参数必须是对象' }
    }
    if (!isValidTerminalId(payload.id)) {
        return { ok: false, error: '终端会话 id 必须是非空字符串' }
    }
    return { ok: true, value: { id: payload.id } }
}

/** 非法 payload 的统一失败结构（渲染层按 code 识别；error 可直接展示） */
function invalidPayload(error: string): {
    ok: false
    error: string
    code: 'TERMINAL_INVALID_PAYLOAD'
} {
    return { ok: false, error, code: 'TERMINAL_INVALID_PAYLOAD' }
}

/**
 * `TERMINAL.CREATE` 业务入口（导出便于单测直接断言）。
 *
 * @returns 成功 `{ ok:true, id, cwd, shell }`；非法 payload / 无工作区 / 超上限 / spawn 失败
 *          均返回结构化失败（不抛异常）
 */
export function terminalCreate(payload: unknown): TerminalCreateResult {
    const parsed = parseTerminalCreatePayload(payload)
    if (!parsed.ok) {
        return invalidPayload(parsed.error)
    }
    return createTerminalSession(parsed.value)
}

/** `TERMINAL.WRITE` 业务入口：校验 payload 后写入 pty stdin */
export function terminalWrite(payload: unknown): TerminalOperationResult {
    const parsed = parseTerminalWritePayload(payload)
    if (!parsed.ok) {
        return invalidPayload(parsed.error)
    }
    return writeTerminal(parsed.value.id, parsed.value.data)
}

/** `TERMINAL.RESIZE` 业务入口：校验 payload 后同步 pty 尺寸 */
export function terminalResize(payload: unknown): TerminalOperationResult {
    const parsed = parseTerminalResizePayload(payload)
    if (!parsed.ok) {
        return invalidPayload(parsed.error)
    }
    return resizeTerminal(parsed.value.id, parsed.value.cols, parsed.value.rows)
}

/** `TERMINAL.CLOSE` 业务入口：校验 payload 后 kill pty 并清理会话 */
export function terminalClose(payload: unknown): TerminalOperationResult {
    const parsed = parseTerminalClosePayload(payload)
    if (!parsed.ok) {
        return invalidPayload(parsed.error)
    }
    return closeTerminal(parsed.value.id)
}

/**
 * 注册终端 IPC（4 个 invoke 通道，全部仅主窗口可信）。
 *
 * @param componentId 监听台账组件 ID（来源 registry 编排；缺省用本域常量）
 */
export function registerTerminalIpc(componentId: string = TERMINAL_IPC_COMPONENT_ID): void {
    ipcListenerManager.registerHandleOnce(
        IPC.TERMINAL.CREATE,
        withSenderCheck(
            IPC.TERMINAL.CREATE,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) =>
                terminalCreate(payload),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.TERMINAL.WRITE,
        withSenderCheck(
            IPC.TERMINAL.WRITE,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => terminalWrite(payload),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.TERMINAL.RESIZE,
        withSenderCheck(
            IPC.TERMINAL.RESIZE,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) =>
                terminalResize(payload),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.TERMINAL.CLOSE,
        withSenderCheck(
            IPC.TERMINAL.CLOSE,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => terminalClose(payload),
            { kind: 'handle' }
        ),
        componentId
    )
}
