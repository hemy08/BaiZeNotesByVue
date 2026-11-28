/**
 * 1.5.7 终端工具（阶段 A）：主进程 pty 会话服务单测（src/main/terminal/pty-manager.ts）
 *
 * 覆盖：
 * 1. shell 白名单解析（Windows COMSPEC/cmd.exe/powershell；macOS·Linux /bin/bash 与
 *    SHELL 回退；跨平台不支持的 shell → null）；
 * 2. 子进程 env（继承字符串值 + 固定 TERM=xterm-256color）；
 * 3. 创建会话：spawn 参数（shell/args/name/cols/rows/cwd/env）、返回结构、默认 id、
 *    cwd 只取 appState.rootPath、无工作区失败、会话上限 8、spawn/订阅失败结构化返回；
 * 4. 写入/尺寸：成功透传、会话不存在、pty 抛错 → 结构化 IO 失败；
 * 5. 输出节流：16ms 合并、≥8 KiB 立即发送、单条 ≤64 KiB 分片、空输出忽略；
 * 6. 退出：先冲刷剩余输出再发 EXIT、exitCode/signal、清理订阅与会话；
 * 7. 关闭：kill + 清理、幂等 NOT_FOUND、kill 抛错仍清理；
 * 8. disposeAll：kill 全部会话、清空节流定时器、幂等；
 * 9. 安全：日志只含会话 id/尺寸/退出码，不含终端输入输出内容。
 *
 * 说明：node-pty 为原生模块，本文件通过 vi.mock 注入替身（永不加载原生绑定）；
 * pty 替身由 deps.spawn 注入，不依赖真实子进程。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Mock } from 'vitest'

/** node-pty 原生模块替身（默认 spawn；大部分用例经 deps.spawn 注入替身） */
const nodePtyMock = vi.hoisted(() => ({ spawn: vi.fn() }))

/** app-state / logger 替身（pty-manager 不直接依赖 electron，仅经这两个门面） */
const stateMock = vi.hoisted(() => ({
    rootPath: '',
    sendToMainWindow: vi.fn((channel: string, ...args: unknown[]) => {
        // 参数在断言中读取；这里仅记录
        void channel
        void args
        return true
    }),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
    loggerDebug: vi.fn()
}))

vi.mock('node-pty', () => ({ spawn: nodePtyMock.spawn }))

vi.mock('../../src/main/utils/app-state', () => ({
    appState: {
        get rootPath(): string {
            return stateMock.rootPath
        },
        set rootPath(value: string) {
            stateMock.rootPath = value
        }
    },
    sendToMainWindow: stateMock.sendToMainWindow
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: {
        info: stateMock.loggerInfo,
        warn: stateMock.loggerWarn,
        error: stateMock.loggerError,
        debug: stateMock.loggerDebug
    }
}))

import { IPC } from '../../src/shared/ipc-channels'
import type { TerminalCreateRequest } from '../../src/shared/types/ipc'
import {
    buildTerminalEnv,
    closeTerminal,
    createTerminalSession,
    disposeAllTerminalSessions,
    getTerminalSessionCount,
    MAX_TERMINAL_DATA_CHARS,
    MAX_TERMINAL_SESSIONS,
    resolveShellPath,
    resizeTerminal,
    TERMINAL_DATA_FLUSH_INTERVAL_MS,
    TERMINAL_DATA_FLUSH_THRESHOLD,
    writeTerminal,
    type TerminalManagerDeps,
    type TerminalSpawnOptions
} from '../../src/main/terminal/pty-manager'

type PtyDataListener = (data: string) => void
type PtyExitListener = (event: { exitCode: number; signal?: number }) => void

/** 轻量 pty 替身：记录订阅、写入/尺寸/kill 调用，并可主动触发 data/exit 事件 */
interface FakePty {
    onData: (listener: PtyDataListener) => { dispose: () => void }
    onExit: (listener: PtyExitListener) => { dispose: () => void }
    write: (data: string) => void
    resize: (cols: number, rows: number) => void
    kill: () => void
    dataListeners: PtyDataListener[]
    exitListeners: PtyExitListener[]
    writeSpy: Mock<(data: string) => void>
    resizeSpy: Mock<(cols: number, rows: number) => void>
    killSpy: Mock<() => void>
    emitData: (data: string) => void
    emitExit: (event?: { exitCode: number; signal?: number }) => void
}

function createFakePty(): FakePty {
    const dataListeners: PtyDataListener[] = []
    const exitListeners: PtyExitListener[] = []
    const writeSpy = vi.fn<(data: string) => void>()
    const resizeSpy = vi.fn<(cols: number, rows: number) => void>()
    const killSpy = vi.fn<() => void>()
    return {
        onData: (listener) => {
            dataListeners.push(listener)
            return {
                dispose: () => {
                    const index = dataListeners.indexOf(listener)
                    if (index >= 0) {
                        dataListeners.splice(index, 1)
                    }
                }
            }
        },
        onExit: (listener) => {
            exitListeners.push(listener)
            return {
                dispose: () => {
                    const index = exitListeners.indexOf(listener)
                    if (index >= 0) {
                        exitListeners.splice(index, 1)
                    }
                }
            }
        },
        write: writeSpy,
        resize: resizeSpy,
        kill: killSpy,
        dataListeners,
        exitListeners,
        writeSpy,
        resizeSpy,
        killSpy,
        emitData: (data) => {
            for (const listener of [...dataListeners]) {
                listener(data)
            }
        },
        emitExit: (event) => {
            // node-pty 的 exit 事件恒带对象；这里允许显式传 undefined 覆盖异常分支
            const payload = event as unknown as { exitCode: number; signal?: number }
            for (const listener of [...exitListeners]) {
                listener(payload)
            }
        }
    }
}

/** 创建 spawn 替身（返回固定 pty 桩） */
function makeSpawnSpy(pty: FakePty) {
    return vi.fn<(file: string, args: string[], options: TerminalSpawnOptions) => FakePty>(
        () => pty
    )
}

type SpawnSpy = ReturnType<typeof makeSpawnSpy>

/**
 * 创建会话的公共依赖：Windows + 固定 id + 注入 spawn 替身。
 * 返回 deps 与 spawnSpy（便于断言 spawn 参数）。
 */
function makeDeps(
    pty: FakePty,
    overrides: Partial<TerminalManagerDeps> = {}
): { deps: TerminalManagerDeps; spawnSpy: SpawnSpy } {
    const spawnSpy = makeSpawnSpy(pty)
    const deps: TerminalManagerDeps = {
        platform: 'win32',
        env: { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' },
        createId: () => 'term-test-1',
        spawn: spawnSpy,
        ...overrides
    }
    return { deps, spawnSpy }
}

/** 默认创建参数（120x30） */
function makeRequest(overrides: Partial<TerminalCreateRequest> = {}): TerminalCreateRequest {
    return { cols: 120, rows: 30, ...overrides }
}

/** 取 sendToMainWindow 的第 index 次调用参数（通道 + 载荷） */
function sentCall(index: number): { channel: string; payload: Record<string, unknown> } {
    const call = stateMock.sendToMainWindow.mock.calls[index]
    expect(call, `sendToMainWindow 第 ${index} 次调用不存在`).toBeDefined()
    const [channel, payload] = call as [string, Record<string, unknown>]
    return { channel, payload }
}

/** 顺序递增的会话 id 生成器 */
function makeSequentialIds(prefix: string): () => string {
    let next = 0
    return () => `${prefix}${next++}`
}

beforeEach(() => {
    vi.clearAllMocks()
    stateMock.rootPath = ''
})

afterEach(() => {
    // 用例失败时也要清理残留会话/定时器（避免跨用例污染）
    disposeAllTerminalSessions()
    vi.useRealTimers()
    vi.clearAllMocks()
    stateMock.rootPath = ''
})

describe('resolveShellPath：shell 白名单按平台解析', () => {
    it('should use COMSPEC as the default Windows command prompt', () => {
        expect(
            resolveShellPath(undefined, {
                platform: 'win32',
                env: { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' }
            })
        ).toBe('C:\\Windows\\System32\\cmd.exe')
    })

    it('should fall back to cmd.exe when COMSPEC is missing or blank', () => {
        expect(resolveShellPath(undefined, { platform: 'win32', env: {} })).toBe('cmd.exe')
        expect(resolveShellPath('cmd', { platform: 'win32', env: { COMSPEC: '   ' } })).toBe(
            'cmd.exe'
        )
        expect(resolveShellPath('cmd', { platform: 'win32', env: { COMSPEC: 'cmd.exe' } })).toBe(
            'cmd.exe'
        )
    })

    it('should resolve powershell.exe on Windows', () => {
        expect(resolveShellPath('powershell', { platform: 'win32', env: {} })).toBe(
            'powershell.exe'
        )
    })

    it('should reject bash on Windows (not part of the Windows whitelist)', () => {
        expect(resolveShellPath('bash', { platform: 'win32', env: {} })).toBeNull()
    })

    it('should use /bin/bash by default on macOS and Linux', () => {
        for (const platform of ['darwin', 'linux'] as const) {
            expect(resolveShellPath(undefined, { platform, exists: () => true })).toBe('/bin/bash')
            expect(resolveShellPath('bash', { platform, exists: () => true })).toBe('/bin/bash')
        }
    })

    it('should fall back to SHELL then /bin/sh when /bin/bash is missing', () => {
        expect(
            resolveShellPath(undefined, {
                platform: 'darwin',
                env: { SHELL: '/usr/local/bin/fish' },
                exists: () => false
            })
        ).toBe('/usr/local/bin/fish')
        expect(
            resolveShellPath(undefined, { platform: 'linux', env: {}, exists: () => false })
        ).toBe('/bin/sh')
    })

    it('should reject Windows shells on macOS/Linux', () => {
        expect(resolveShellPath('cmd', { platform: 'linux' })).toBeNull()
        expect(resolveShellPath('powershell', { platform: 'darwin' })).toBeNull()
    })
})

describe('buildTerminalEnv：子进程环境变量', () => {
    it('should inherit string values and force TERM=xterm-256color', () => {
        const env = buildTerminalEnv({
            PATH: '/usr/bin',
            EMPTY: undefined,
            TERM: 'dumb'
        })
        expect(env.PATH).toBe('/usr/bin')
        expect(env.EMPTY).toBeUndefined()
        expect(env.TERM).toBe('xterm-256color')
    })
})

describe('createTerminalSession：创建 pty 会话', () => {
    it('should spawn the resolved shell with xterm-256color and fixed cwd=rootPath', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        const { deps, spawnSpy } = makeDeps(pty)

        const result = createTerminalSession(makeRequest(), deps)

        expect(result).toEqual({
            ok: true,
            id: 'term-test-1',
            cwd: 'E:\\workspace',
            shell: 'C:\\Windows\\System32\\cmd.exe'
        })
        expect(spawnSpy).toHaveBeenCalledTimes(1)
        expect(spawnSpy).toHaveBeenCalledWith('C:\\Windows\\System32\\cmd.exe', [], {
            name: 'xterm-256color',
            cols: 120,
            rows: 30,
            cwd: 'E:\\workspace',
            env: expect.objectContaining({ TERM: 'xterm-256color' })
        })
        expect(getTerminalSessionCount()).toBe(1)
        // 安全口径：创建日志只记会话 id / 尺寸，不记录工作区路径
        expect(stateMock.loggerInfo).toHaveBeenCalledWith(expect.stringContaining('term-test-1'))
        expect(stateMock.loggerInfo.mock.calls.flat().join(' ')).not.toContain('E:\\workspace')
    })

    it('should support powershell with caller-provided rows/cols', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        const { deps, spawnSpy } = makeDeps(pty)

        const result = createTerminalSession(
            makeRequest({ cols: 80, rows: 24, shell: 'powershell' }),
            deps
        )

        expect(result.ok).toBe(true)
        expect(result.ok && result.shell).toBe('powershell.exe')
        expect(spawnSpy.mock.calls[0]?.[0]).toBe('powershell.exe')
        expect(spawnSpy.mock.calls[0]?.[2]).toMatchObject({ cols: 80, rows: 24 })
    })

    it('should fail with TERMINAL_NO_WORKSPACE when no workspace is open', () => {
        const pty = createFakePty()
        const { deps, spawnSpy } = makeDeps(pty)

        const result = createTerminalSession(makeRequest(), deps)

        expect(result).toMatchObject({ ok: false, code: 'TERMINAL_NO_WORKSPACE' })
        expect(spawnSpy).not.toHaveBeenCalled()
        expect(getTerminalSessionCount()).toBe(0)
    })

    it('should trim the workspace root before spawning', () => {
        stateMock.rootPath = '  E:\\workspace  '
        const { deps } = makeDeps(createFakePty())

        const result = createTerminalSession(makeRequest(), deps)

        expect(result.ok && result.cwd).toBe('E:\\workspace')
    })

    it('should use node-pty.spawn by default (no injected spawn)', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        nodePtyMock.spawn.mockReturnValue(pty)

        const result = createTerminalSession(makeRequest(), {
            platform: 'win32',
            env: { COMSPEC: 'cmd.exe' },
            createId: () => 'term-default-spawn'
        })

        expect(result.ok).toBe(true)
        expect(nodePtyMock.spawn).toHaveBeenCalledTimes(1)
        expect(nodePtyMock.spawn.mock.calls[0]?.[0]).toBe('cmd.exe')
    })

    it('should generate a term-<uuid> id by default', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        const spawnSpy = makeSpawnSpy(pty)

        const result = createTerminalSession(makeRequest(), {
            platform: 'win32',
            env: { COMSPEC: 'cmd.exe' },
            spawn: spawnSpy
        })

        expect(result.ok).toBe(true)
        expect(result.ok && result.id).toMatch(/^term-[0-9a-f-]{36}$/)
    })

    it('should reject a shell that is not supported on the platform', () => {
        stateMock.rootPath = 'E:\\workspace'
        const { deps } = makeDeps(createFakePty(), {
            platform: 'linux',
            env: {},
            exists: () => true
        })

        const result = createTerminalSession(makeRequest({ shell: 'powershell' }), deps)

        expect(result).toMatchObject({ ok: false, code: 'TERMINAL_INVALID_PAYLOAD' })
        expect(getTerminalSessionCount()).toBe(0)
    })

    it('should return TERMINAL_SPAWN_FAILED when node-pty.spawn throws', () => {
        stateMock.rootPath = 'E:\\workspace'
        const { deps } = makeDeps(createFakePty(), {
            spawn: () => {
                throw new Error('spawn failed hard')
            }
        })

        const result = createTerminalSession(makeRequest(), deps)

        expect(result).toMatchObject({ ok: false, code: 'TERMINAL_SPAWN_FAILED' })
        expect(result.ok === false && result.error).toContain('spawn failed hard')
        expect(stateMock.loggerError).toHaveBeenCalled()
        expect(getTerminalSessionCount()).toBe(0)
    })

    it('should clean up and fail when event subscription registration throws', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        pty.onData = () => {
            throw new Error('subscribe failed')
        }
        const { deps } = makeDeps(pty)

        const result = createTerminalSession(makeRequest(), deps)

        expect(result).toMatchObject({ ok: false, code: 'TERMINAL_SPAWN_FAILED' })
        expect(pty.killSpy).toHaveBeenCalled()
        expect(getTerminalSessionCount()).toBe(0)
    })

    it('should enforce the session limit of 8', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        const { deps } = makeDeps(pty, { createId: makeSequentialIds('term-limit-') })

        for (let index = 0; index < MAX_TERMINAL_SESSIONS; index++) {
            expect(createTerminalSession(makeRequest(), deps).ok).toBe(true)
        }
        const rejected = createTerminalSession(makeRequest(), deps)

        expect(rejected).toMatchObject({ ok: false, code: 'TERMINAL_LIMIT_REACHED' })
        expect(getTerminalSessionCount()).toBe(MAX_TERMINAL_SESSIONS)
    })
})

describe('writeTerminal / resizeTerminal：会话输入与尺寸', () => {
    it('should write user input to the pty stdin', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        const result = writeTerminal('term-test-1', 'dir\r')

        expect(result).toEqual({ ok: true })
        expect(pty.writeSpy).toHaveBeenCalledWith('dir\r')
    })

    it('should return TERMINAL_NOT_FOUND for an unknown session', () => {
        expect(writeTerminal('missing', 'x')).toMatchObject({
            ok: false,
            code: 'TERMINAL_NOT_FOUND'
        })
        expect(resizeTerminal('missing', 80, 24)).toMatchObject({
            ok: false,
            code: 'TERMINAL_NOT_FOUND'
        })
    })

    it('should return structured IO failure when pty.write throws', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        pty.writeSpy.mockImplementation(() => {
            throw new Error('pipe closed')
        })
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        const result = writeTerminal('term-test-1', 'x')

        expect(result).toMatchObject({ ok: false, code: 'TERMINAL_IO_FAILED' })
        expect(result.error).toContain('pipe closed')
    })

    it('should forward resize dimensions to the pty', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        const result = resizeTerminal('term-test-1', 200, 50)

        expect(result).toEqual({ ok: true })
        expect(pty.resizeSpy).toHaveBeenCalledWith(200, 50)
    })

    it('should return structured IO failure when pty.resize throws', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        pty.resizeSpy.mockImplementation(() => {
            throw new Error('resize rejected')
        })
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        const result = resizeTerminal('term-test-1', 200, 50)

        expect(result).toMatchObject({ ok: false, code: 'TERMINAL_IO_FAILED' })
        expect(result.error).toContain('resize rejected')
    })
})

describe('终端输出节流：DATA 事件聚合', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        stateMock.rootPath = 'E:\\workspace'
    })

    it('should coalesce small output chunks within the 16ms window', () => {
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitData('a')
        pty.emitData('b')
        pty.emitData('c')
        expect(stateMock.sendToMainWindow).not.toHaveBeenCalled()

        vi.advanceTimersByTime(TERMINAL_DATA_FLUSH_INTERVAL_MS)

        expect(stateMock.sendToMainWindow).toHaveBeenCalledTimes(1)
        expect(sentCall(0)).toEqual({
            channel: IPC.TERMINAL.DATA,
            payload: { id: 'term-test-1', data: 'abc' }
        })
        // 已发送后不应再重复发送
        vi.advanceTimersByTime(TERMINAL_DATA_FLUSH_INTERVAL_MS * 4)
        expect(stateMock.sendToMainWindow).toHaveBeenCalledTimes(1)
    })

    it('should flush immediately when the pending buffer reaches the 8 KiB threshold', () => {
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitData('x'.repeat(TERMINAL_DATA_FLUSH_THRESHOLD))

        expect(stateMock.sendToMainWindow).toHaveBeenCalledTimes(1)
        expect(sentCall(0).payload.data).toHaveLength(TERMINAL_DATA_FLUSH_THRESHOLD)
        vi.advanceTimersByTime(TERMINAL_DATA_FLUSH_INTERVAL_MS)
        expect(stateMock.sendToMainWindow).toHaveBeenCalledTimes(1)
    })

    it('should split a single DATA event so each payload is at most 64 KiB', () => {
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitData('y'.repeat(MAX_TERMINAL_DATA_CHARS + 10))

        expect(stateMock.sendToMainWindow).toHaveBeenCalledTimes(2)
        expect(sentCall(0).payload.data).toHaveLength(MAX_TERMINAL_DATA_CHARS)
        expect(sentCall(1).payload.data).toHaveLength(10)
    })

    it('should ignore empty output chunks', () => {
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitData('')
        // 非字符串输出（防御性：node-pty 类型保证 string，异常桩不应导致崩溃）
        pty.emitData(123 as unknown as string)
        vi.advanceTimersByTime(TERMINAL_DATA_FLUSH_INTERVAL_MS)

        expect(stateMock.sendToMainWindow).not.toHaveBeenCalled()
    })

    it('should schedule a new flush window for data after a previous flush', () => {
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitData('one')
        vi.advanceTimersByTime(TERMINAL_DATA_FLUSH_INTERVAL_MS)
        pty.emitData('two')
        vi.advanceTimersByTime(TERMINAL_DATA_FLUSH_INTERVAL_MS)

        expect(stateMock.sendToMainWindow).toHaveBeenCalledTimes(2)
        expect(sentCall(1).payload.data).toBe('two')
    })

    it('should never log terminal output content', () => {
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitData('secret-token-value')
        vi.advanceTimersByTime(TERMINAL_DATA_FLUSH_INTERVAL_MS)

        const logText = JSON.stringify([
            ...stateMock.loggerInfo.mock.calls,
            ...stateMock.loggerWarn.mock.calls,
            ...stateMock.loggerError.mock.calls
        ])
        expect(logText).not.toContain('secret-token-value')
    })
})

describe('pty 退出：EXIT 事件与清理', () => {
    it('should flush pending output then emit EXIT with exitCode', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitData('bye')
        pty.emitExit({ exitCode: 0 })

        expect(stateMock.sendToMainWindow).toHaveBeenCalledTimes(2)
        expect(sentCall(0)).toEqual({
            channel: IPC.TERMINAL.DATA,
            payload: { id: 'term-test-1', data: 'bye' }
        })
        expect(sentCall(1)).toEqual({
            channel: IPC.TERMINAL.EXIT,
            payload: { id: 'term-test-1', exitCode: 0 }
        })
        expect(getTerminalSessionCount()).toBe(0)
        // 会话已清理：后续写入返回 NOT_FOUND
        expect(writeTerminal('term-test-1', 'x')).toMatchObject({
            ok: false,
            code: 'TERMINAL_NOT_FOUND'
        })
    })

    it('should include the POSIX signal when present', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitExit({ exitCode: 1, signal: 15 })

        expect(sentCall(0).payload).toEqual({ id: 'term-test-1', exitCode: 1, signal: 15 })
    })

    it('should report exitCode null when the pty exit event has no code', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitExit(undefined)

        expect(sentCall(0).payload).toEqual({ id: 'term-test-1', exitCode: null })
    })

    it('should dispose listeners on exit so late output is ignored', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitExit({ exitCode: 0 })
        expect(pty.dataListeners).toHaveLength(0)
        expect(pty.exitListeners).toHaveLength(0)
        expect(() => pty.emitData('late-data')).not.toThrow()
        expect(stateMock.sendToMainWindow).toHaveBeenCalledTimes(1)
    })
})

describe('closeTerminal：显式关闭', () => {
    it('should kill the pty and remove the session', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        const result = closeTerminal('term-test-1')

        expect(result).toEqual({ ok: true })
        expect(pty.killSpy).toHaveBeenCalledTimes(1)
        expect(getTerminalSessionCount()).toBe(0)
        expect(closeTerminal('term-test-1')).toMatchObject({
            ok: false,
            code: 'TERMINAL_NOT_FOUND'
        })
        // 显式关闭由渲染层发起：服务端不再补发 EXIT（监听已释放）
        expect(stateMock.sendToMainWindow).not.toHaveBeenCalled()
    })

    it('should still clean up when kill throws', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        pty.killSpy.mockImplementation(() => {
            throw new Error('kill failed')
        })
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        const result = closeTerminal('term-test-1')

        expect(result).toMatchObject({ ok: false, code: 'TERMINAL_IO_FAILED' })
        expect(result.error).toContain('kill failed')
        expect(getTerminalSessionCount()).toBe(0)
    })

    it('should tolerate a throwing dispose() while cleaning up listeners', () => {
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        // node-pty 订阅在进程已退出等极端场景下 dispose 可能抛错：清理必须不受影响
        pty.onData = () => ({
            dispose: () => {
                throw new Error('already disposed')
            }
        })
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        expect(() => closeTerminal('term-test-1')).not.toThrow()
        expect(getTerminalSessionCount()).toBe(0)
    })
})

describe('disposeAllTerminalSessions：应用退出清理', () => {
    it('should kill every session and clear the registry', () => {
        stateMock.rootPath = 'E:\\workspace'
        const ptys = [createFakePty(), createFakePty(), createFakePty()]
        let spawnIndex = 0
        const { deps } = makeDeps(ptys[0], {
            spawn: () => ptys[spawnIndex++],
            createId: makeSequentialIds('term-dispose-')
        })
        expect(createTerminalSession(makeRequest(), deps).ok).toBe(true)
        expect(createTerminalSession(makeRequest(), deps).ok).toBe(true)
        expect(createTerminalSession(makeRequest(), deps).ok).toBe(true)

        disposeAllTerminalSessions()

        expect(getTerminalSessionCount()).toBe(0)
        for (const pty of ptys) {
            expect(pty.killSpy).toHaveBeenCalledTimes(1)
        }
        // 幂等：无会话再调用不抛错、不重复 kill
        expect(() => disposeAllTerminalSessions()).not.toThrow()
        for (const pty of ptys) {
            expect(pty.killSpy).toHaveBeenCalledTimes(1)
        }
    })

    it('should clear pending flush timers so no DATA is sent after disposal', () => {
        vi.useFakeTimers()
        stateMock.rootPath = 'E:\\workspace'
        const pty = createFakePty()
        createTerminalSession(makeRequest(), makeDeps(pty).deps)

        pty.emitData('pending-output')
        expect(stateMock.sendToMainWindow).not.toHaveBeenCalled()

        disposeAllTerminalSessions()
        vi.advanceTimersByTime(TERMINAL_DATA_FLUSH_INTERVAL_MS * 4)

        expect(stateMock.sendToMainWindow).not.toHaveBeenCalled()
        expect(pty.killSpy).toHaveBeenCalled()
    })
})
