/**
 * 1.5.7 终端工具（阶段 A）：主进程 pty 会话服务（node-pty）
 *
 * ## 职责
 * 管理右侧边栏终端的全部 pty 会话生命周期：创建 / 写入 / 调整尺寸 / 关闭 / 退出清理，
 * 并把 pty 输出节流聚合后经 `webContents.send`（sendToMainWindow）转发给渲染层。
 *
 * ## 链路（IPC-17 六步）
 * 1. 常量：`IPC.TERMINAL.CREATE / WRITE / RESIZE / CLOSE / DATA / EXIT`（shared/ipc-channels.ts）；
 * 2. 契约：`Terminal*` 类型 + IpcRequests / IpcResponses / IpcEvents（shared/types/ipc.ts）；
 * 3. 白名单：build/generate-preload-whitelist.js 生成（禁止手改）；
 * 4. 主进程：ipc/terminal-ipc.ts（registry 编排 + withSenderCheck + payload 校验）→ 本模块；
 * 5. 渲染层（阶段 B）：右侧边栏终端面板（xterm + addon-fit），与 AI 助手面板同布局；
 * 6. 测试：tests/unit/terminal-pty-manager.test.ts / terminal-ipc.test.ts +
 *    通道命名/契约/白名单/注册门禁。
 *
 * ## 安全边界
 * - **cwd 固定为 `appState.rootPath`**（用户当前打开的工具文件夹），本模块不接受调用方路径；
 * - shell 只接受白名单（cmd / powershell / bash），按平台解析为具体可执行文件；
 * - 会话数上限 8；pty 只由用户显式打开终端面板后经可信 IPC 创建；
 * - 输出事件按会话节流聚合（16ms 或 ≥8 KiB 立即发送），单条 ≤64 KiB，避免高频 IPC 刷屏；
 * - 日志只记录会话 id / 尺寸 / 退出码，**不记录终端输入输出内容**；
 * - 所有可预期失败返回结构化结果（不向 IPC 层抛异常导致主进程崩溃）。
 *
 * ## 退出清理
 * - 单会话退出（pty 进程结束）→ 先冲刷剩余输出，再发 `TERMINAL.EXIT` 并清理映射；
 * - 应用退出 / 主窗口销毁 → `disposeAllTerminalSessions()` 由 main/index.ts 的
 *   cleanupApp() 调用，kill 全部会话并清空节流定时器（幂等）。
 */
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import { spawn as ptySpawn } from 'node-pty'
import type { IPty } from 'node-pty'
// ARC-03：通道常量唯一真源
import { IPC } from '../../shared/ipc-channels'
import type {
    TerminalCreateRequest,
    TerminalCreateResult,
    TerminalOperationResult,
    TerminalShell
} from '../../shared/types/ipc'
import { appState, sendToMainWindow } from '../utils/app-state'
import { logger } from '../utils/logger'

/** 终端会话数上限（主进程硬限制；超出时拒绝创建并提示先关闭其他终端） */
export const MAX_TERMINAL_SESSIONS = 8

/** 单次写入数据长度上限（字符；64 KiB） */
export const MAX_TERMINAL_WRITE_CHARS = 64 * 1024

/** 单条输出事件数据长度上限（字符；64 KiB） */
export const MAX_TERMINAL_DATA_CHARS = 64 * 1024

/** 输出批量聚合阈值：缓冲达到该长度立即发送（否则等待 16ms 合并） */
export const TERMINAL_DATA_FLUSH_THRESHOLD = 8 * 1024

/** 输出节流窗口（毫秒）：窗口期内的多条 pty 输出合并为一条 IPC 事件 */
export const TERMINAL_DATA_FLUSH_INTERVAL_MS = 16

/** 终端尺寸合法下限（列/行） */
export const TERMINAL_MIN_DIMENSION = 1

/** 终端尺寸合法上限（列/行） */
export const TERMINAL_MAX_DIMENSION = 500

/**
 * 本模块只依赖 node-pty `IPty` 的这几个成员（便于单测注入轻量替身，
 * 避免测试环境加载原生模块）。
 */
export type TerminalPty = Pick<IPty, 'onData' | 'onExit' | 'write' | 'resize' | 'kill'>

/** `node-pty.spawn` 的入参（与真实签名结构兼容，供单测断言） */
export interface TerminalSpawnOptions {
    name: string
    cols: number
    rows: number
    cwd: string
    env: Record<string, string>
}

/** 单会话事件订阅（node-pty 的 IDisposable 最小形状） */
interface TerminalDisposable {
    dispose: () => void
}

/** 活跃 pty 会话（id 为渲染层关联 DATA/EXIT/WRITE 的唯一键） */
interface TerminalSession {
    readonly id: string
    readonly pty: TerminalPty
    readonly cwd: string
    readonly shell: string
    /** 节流窗口内待发送的输出（合并后一次 IPC 发送） */
    pendingData: string
    /** 节流定时器（null = 当前没有挂起的 flush） */
    flushTimer: ReturnType<typeof setTimeout> | null
    /** onData / onExit 订阅，用于关闭/退出时释放，避免事件回调泄漏 */
    disposables: TerminalDisposable[]
}

/**
 * 可注入依赖（生产缺省取 process / node-pty / appState；单测注入替身，
 * 不修改全局环境即可覆盖 Windows / macOS / spawn 失败等分支）。
 */
export interface TerminalManagerDeps {
    /** 平台（缺省 process.platform） */
    platform?: NodeJS.Platform
    /** 环境变量（缺省 process.env；用于 COMSPEC / SHELL 解析与子进程 env） */
    env?: NodeJS.ProcessEnv
    /** 可执行文件存在性探测（缺省 fs.existsSync；仅非 Windows 的 /bin/bash 回退使用） */
    exists?: (candidate: string) => boolean
    /** pty 创建函数（缺省 node-pty.spawn） */
    spawn?: (file: string, args: string[], options: TerminalSpawnOptions) => TerminalPty
    /** 会话 id 生成（缺省 `term-<uuid>`） */
    createId?: () => string
}

/** shell 解析所需的依赖子集 */
export type ShellResolveDeps = Pick<TerminalManagerDeps, 'platform' | 'env' | 'exists'>

/** 进程内活跃会话表（Map 插入顺序 = 创建顺序） */
const terminalSessions = new Map<string, TerminalSession>()

/** 缺省会话 id：`term-<uuid>`（无业务含义，仅用于关联请求与事件） */
const createTerminalId = (): string => `term-${randomUUID()}`

/** 缺省 pty 创建：直接转调 node-pty.spawn（模块级 import 便于打包器外部化原生依赖） */
const defaultSpawn = (file: string, args: string[], options: TerminalSpawnOptions): TerminalPty =>
    ptySpawn(file, args, options)

/** 把任意异常归一化为可读文本（不含调用方数据，仅错误自述） */
function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    return typeof error === 'string' ? error : '未知错误'
}

/**
 * 解析要启动的 shell 可执行文件（白名单按平台映射）。
 *
 * - Windows：`cmd`（缺省）= `COMSPEC` 或 `cmd.exe`；`powershell` = `powershell.exe`；
 *   `bash` 不属于 Windows 白名单 → 返回 null（由调用方按非法 payload 处理）；
 * - macOS / Linux：`bash`（缺省）= `/bin/bash`（不存在时回退 `SHELL`，再回退 `/bin/sh`）；
 *   `cmd` / `powershell` 不属于非 Windows 白名单 → 返回 null。
 *
 * @returns 可执行文件路径/命令；平台不支持所选 shell 时返回 null
 */
export function resolveShellPath(
    shell: TerminalShell | undefined,
    deps: ShellResolveDeps = {}
): string | null {
    const platform = deps.platform ?? process.platform
    const env = deps.env ?? process.env
    const exists = deps.exists ?? ((candidate: string) => fs.existsSync(candidate))

    if (platform === 'win32') {
        if (shell === 'powershell') {
            return 'powershell.exe'
        }
        if (shell === undefined || shell === 'cmd') {
            const comspec = typeof env.COMSPEC === 'string' ? env.COMSPEC.trim() : ''
            return comspec.length > 0 ? comspec : 'cmd.exe'
        }
        return null
    }

    if (shell === undefined || shell === 'bash') {
        if (exists('/bin/bash')) {
            return '/bin/bash'
        }
        const envShell = typeof env.SHELL === 'string' ? env.SHELL.trim() : ''
        if (envShell.length > 0) {
            return envShell
        }
        return '/bin/sh'
    }
    return null
}

/**
 * 构建子进程环境变量：继承主进程 env（只保留字符串值）+ 固定 TERM=xterm-256color。
 * 不做任何额外注入（不新增凭据/路径变量）。
 */
export function buildTerminalEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(base)) {
        if (typeof value === 'string') {
            env[key] = value
        }
    }
    env.TERM = 'xterm-256color'
    return env
}

/** 统计活跃终端会话数（诊断/单测断言清理用） */
export function getTerminalSessionCount(): number {
    return terminalSessions.size
}

/** 安全释放单条 pty 事件订阅（dispose 在会话已退出时可能抛错，吞掉避免污染事件循环） */
function safeDispose(disposable: TerminalDisposable): void {
    try {
        disposable.dispose()
    } catch {
        // 订阅已随进程退出释放：忽略重复 dispose 失败
    }
}

/** 安全 kill pty（进程可能已退出/已回收，kill 抛错不影响清理流程） */
function safeKill(pty: TerminalPty): void {
    try {
        pty.kill()
    } catch (error) {
        logger.warn('[Terminal] 终止终端进程失败（进程可能已退出）:', error)
    }
}

/** 取消挂起的节流定时器 */
function clearFlushTimer(session: TerminalSession): void {
    if (session.flushTimer !== null) {
        clearTimeout(session.flushTimer)
        session.flushTimer = null
    }
}

/**
 * 从会话表移除并释放全部订阅/定时器（不 kill 进程，由调用方决定）。
 * 幂等：会话已被移除时重复调用无副作用。
 */
function disposeSession(session: TerminalSession): void {
    terminalSessions.delete(session.id)
    clearFlushTimer(session)
    for (const disposable of session.disposables) {
        safeDispose(disposable)
    }
    session.disposables = []
    session.pendingData = ''
}

/**
 * 立即冲刷会话缓冲区：发送 `TERMINAL.DATA`（单条 ≤64 KiB，超长分片）。
 * 无待发送数据时为空操作；节流定时器同时取消（避免重复发送）。
 */
function flushTerminalData(session: TerminalSession): void {
    clearFlushTimer(session)
    let pending = session.pendingData
    session.pendingData = ''
    if (pending.length === 0) {
        return
    }
    while (pending.length > MAX_TERMINAL_DATA_CHARS) {
        const chunk = pending.slice(0, MAX_TERMINAL_DATA_CHARS)
        pending = pending.slice(MAX_TERMINAL_DATA_CHARS)
        sendToMainWindow(IPC.TERMINAL.DATA, { id: session.id, data: chunk })
    }
    sendToMainWindow(IPC.TERMINAL.DATA, { id: session.id, data: pending })
}

/**
 * pty 输出入队：达到 8 KiB 立即冲刷，否则挂 16ms 定时器合并发送。
 * 高频输出（如 `dir /s`）由此收敛为每 16ms 至多一条 IPC 事件。
 */
function enqueueTerminalData(session: TerminalSession, data: string): void {
    if (typeof data !== 'string' || data.length === 0) {
        return
    }
    session.pendingData += data
    if (session.pendingData.length >= TERMINAL_DATA_FLUSH_THRESHOLD) {
        flushTerminalData(session)
        return
    }
    if (session.flushTimer !== null) {
        return
    }
    session.flushTimer = setTimeout(() => {
        session.flushTimer = null
        flushTerminalData(session)
    }, TERMINAL_DATA_FLUSH_INTERVAL_MS)
}

/**
 * pty 退出：先冲刷退出前的剩余输出，再清理会话并向渲染层发送 `TERMINAL.EXIT`。
 * exitCode 缺失（异常退出）时按 null 上报，signal 仅在存在时携带。
 */
function handleTerminalExit(
    session: TerminalSession,
    event: { exitCode: number; signal?: number } | undefined
): void {
    // 顺序保证：输出先于 EXIT 到达渲染层，避免最后一行输出丢失
    flushTerminalData(session)
    disposeSession(session)
    const exitCode = typeof event?.exitCode === 'number' ? event.exitCode : null
    if (typeof event?.signal === 'number') {
        sendToMainWindow(IPC.TERMINAL.EXIT, {
            id: session.id,
            exitCode,
            signal: event.signal
        })
    } else {
        sendToMainWindow(IPC.TERMINAL.EXIT, { id: session.id, exitCode })
    }
    logger.info(
        `[Terminal] 终端会话已退出（id=${session.id} / exitCode=${
            exitCode === null ? 'unknown' : exitCode
        }）`
    )
}

/**
 * `TERMINAL.CREATE` 业务入口：创建 pty 会话。
 *
 * @param request 已由 IPC 层校验的请求（cols/rows 1..500；shell 白名单）
 * @param deps 可注入依赖（生产不传；单测注入平台/env/spawn 替身）
 * @returns 成功 `{ ok:true, id, cwd, shell }`；失败结构化（无工作区/超上限/spawn 失败）
 */
export function createTerminalSession(
    request: TerminalCreateRequest,
    deps: TerminalManagerDeps = {}
): TerminalCreateResult {
    if (terminalSessions.size >= MAX_TERMINAL_SESSIONS) {
        return {
            ok: false,
            code: 'TERMINAL_LIMIT_REACHED',
            error: `终端会话数量已达上限（${MAX_TERMINAL_SESSIONS} 个），请先关闭其他终端`
        }
    }

    // 安全口径：运行目录只取主进程持有的工作区根（渲染层不可指定）
    const cwd = typeof appState.rootPath === 'string' ? appState.rootPath.trim() : ''
    if (cwd.length === 0) {
        return {
            ok: false,
            code: 'TERMINAL_NO_WORKSPACE',
            error: '未打开工作区，无法确定终端运行目录'
        }
    }

    const shell = resolveShellPath(request.shell, deps)
    if (!shell) {
        return {
            ok: false,
            code: 'TERMINAL_INVALID_PAYLOAD',
            error: '当前平台不支持所选终端 shell'
        }
    }

    const spawnPty = deps.spawn ?? defaultSpawn
    let pty: TerminalPty
    try {
        pty = spawnPty(shell, [], {
            name: 'xterm-256color',
            cols: request.cols,
            rows: request.rows,
            cwd,
            env: buildTerminalEnv(deps.env ?? process.env)
        })
    } catch (error) {
        logger.error('[Terminal] 创建终端 pty 失败:', error)
        return {
            ok: false,
            code: 'TERMINAL_SPAWN_FAILED',
            error: `终端启动失败：${describeError(error)}`
        }
    }

    const session: TerminalSession = {
        id: (deps.createId ?? createTerminalId)(),
        pty,
        cwd,
        shell,
        pendingData: '',
        flushTimer: null,
        disposables: []
    }

    try {
        session.disposables.push(
            pty.onData((data) => {
                enqueueTerminalData(session, data)
            })
        )
        session.disposables.push(
            pty.onExit((event) => {
                handleTerminalExit(session, event)
            })
        )
    } catch (error) {
        // 订阅失败（pty 已退出等）：释放已注册订阅并 kill，按启动失败返回
        for (const disposable of session.disposables) {
            safeDispose(disposable)
        }
        session.disposables = []
        safeKill(pty)
        logger.error('[Terminal] 注册终端事件订阅失败:', error)
        return {
            ok: false,
            code: 'TERMINAL_SPAWN_FAILED',
            error: `终端启动失败：${describeError(error)}`
        }
    }

    terminalSessions.set(session.id, session)
    // 日志不含 cwd，也不含终端输入输出内容（仅会话 id 与初始尺寸）
    logger.info(
        `[Terminal] 已创建终端会话（id=${session.id} / cols=${request.cols} / rows=${request.rows}）`
    )
    return { ok: true, id: session.id, cwd, shell }
}

/**
 * `TERMINAL.WRITE` 业务入口：把用户输入写入 pty stdin。
 * 空字符串为合法输入（等价 no-op），长度上限由 IPC 层校验。
 */
export function writeTerminal(id: string, data: string): TerminalOperationResult {
    const session = terminalSessions.get(id)
    if (!session) {
        return { ok: false, code: 'TERMINAL_NOT_FOUND', error: '终端会话不存在或已关闭' }
    }
    try {
        session.pty.write(data)
        return { ok: true }
    } catch (error) {
        logger.warn(`[Terminal] 写入终端失败（id=${id}）:`, error)
        return {
            ok: false,
            code: 'TERMINAL_IO_FAILED',
            error: `写入终端失败：${describeError(error)}`
        }
    }
}

/**
 * `TERMINAL.RESIZE` 业务入口：同步 pty 尺寸（cols/rows 范围由 IPC 层校验）。
 */
export function resizeTerminal(id: string, cols: number, rows: number): TerminalOperationResult {
    const session = terminalSessions.get(id)
    if (!session) {
        return { ok: false, code: 'TERMINAL_NOT_FOUND', error: '终端会话不存在或已关闭' }
    }
    try {
        session.pty.resize(cols, rows)
        return { ok: true }
    } catch (error) {
        logger.warn(`[Terminal] 调整终端尺寸失败（id=${id}）:`, error)
        return {
            ok: false,
            code: 'TERMINAL_IO_FAILED',
            error: `调整终端尺寸失败：${describeError(error)}`
        }
    }
}

/**
 * `TERMINAL.CLOSE` 业务入口：kill pty 并清理会话（幂等：会话已关闭时返回 NOT_FOUND）。
 * 显式关闭由渲染层发起，服务端不再补发 `TERMINAL.EXIT`（渲染层自行移除面板）。
 */
export function closeTerminal(id: string): TerminalOperationResult {
    const session = terminalSessions.get(id)
    if (!session) {
        return { ok: false, code: 'TERMINAL_NOT_FOUND', error: '终端会话不存在或已关闭' }
    }
    let killError: unknown = null
    try {
        session.pty.kill()
    } catch (error) {
        killError = error
    }
    disposeSession(session)
    if (killError !== null) {
        logger.warn(`[Terminal] 关闭终端进程失败（id=${id}）:`, killError)
        return {
            ok: false,
            code: 'TERMINAL_IO_FAILED',
            error: `关闭终端进程失败：${describeError(killError)}`
        }
    }
    logger.info(`[Terminal] 已关闭终端会话（id=${id}）`)
    return { ok: true }
}

/**
 * 应用退出 / 主窗口销毁时的统一清理：kill 全部会话、清空节流定时器与订阅。
 * 幂等；无会话时为空操作。
 */
export function disposeAllTerminalSessions(): void {
    if (terminalSessions.size === 0) {
        return
    }
    const sessions = [...terminalSessions.values()]
    for (const session of sessions) {
        disposeSession(session)
        safeKill(session.pty)
    }
    logger.info(`[Terminal] 已清理全部终端会话（${sessions.length} 个）`)
}
