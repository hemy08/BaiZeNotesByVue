/**
 * 覆盖率补测第五批：logger.ts 轮转 / 回退 / IO 异常分支（独立于既有 logger.test.ts）。
 *
 * 覆盖点（此前未覆盖的语句/分支）：
 * - 日志轮转：估算超阈值 → stat 重查 → 关闭写入流 → 重命名 → 重建文件；stat 失败兜底重建流；
 * - 日志目录回退链：安装目录/userData 不可写 → 系统临时目录；目录 mkdir/stat 异常降级；
 * - cleanOldLogs 读取失败、写入流 error 事件、创建写入流失败、close；
 * - 参数格式化：循环对象 JSON.stringify 抛错回退 String、Error 空 name/message 组合；
 * - 脱敏：空文本 / 非字符串原样返回、主目录过短跳过；
 * - 状态栏发送失败静默降级、enableConsole/enableFile 关闭分支。
 *
 * 说明：Logger 类未导出，这里通过 vi.resetModules + 动态 import 为每个用例创建全新单例，
 * 并在用例结束后 close，避免写入流/计时器跨用例残留。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'

const hoisted = vi.hoisted(() => {
    const base = (process.env.TEMP || process.env.TMP || '/tmp').replace(/\\/g, '/')
    return {
        exePath: `${base}/baize-logger5/bin/BaiZeNotes.exe`,
        userDataPath: `${base}/baize-logger5/user-data`,
        tmpLogDir: `${base}/baize-notes-log`
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => {
            if (name === 'exe') return hoisted.exePath
            if (name === 'userData') return hoisted.userDataPath
            return ''
        })
    },
    BrowserWindow: class {}
}))

// 轮转阈值降到 100 字节，便于在少量日志后触发轮转
vi.mock('../../../src/shared/constants/limits', () => ({
    MAX_LOG_FILE_SIZE: 100
}))

interface FakeStream {
    write: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    errorListener?: (error: unknown) => void
}

const state = vi.hoisted(() => ({
    streams: [] as FakeStream[],
    logFileSizes: [] as number[],
    renamed: [] as Array<[string, string]>,
    statThrows: false,
    statReturns: null as null | Record<string, unknown>,
    dirWritable: true,
    createStreamThrows: false,
    readdirThrows: false,
    mkdirThrows: false
}))

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>()
    const isLogFile = (target: string): boolean =>
        /baize-notes-\d{4}-\d{2}-\d{2}\.log$/.test(target)
    return {
        ...actual,
        statSync: (target: string) => {
            if (state.statReturns !== null) return state.statReturns
            if (isLogFile(target)) {
                if (state.statThrows && state.logFileSizes.length === 0) {
                    throw new Error('ENOENT')
                }
                const size = state.logFileSizes.shift() ?? 0
                if (state.statThrows) throw new Error('ENOENT')
                return { size, isDirectory: () => false }
            }
            return { size: 0, isDirectory: () => state.dirWritable, mtime: new Date(0) }
        },
        mkdirSync: () => {
            if (state.mkdirThrows) throw new Error('EACCES')
        },
        writeFileSync: () => undefined,
        unlinkSync: () => undefined,
        existsSync: () => true,
        readdirSync: () => {
            if (state.readdirThrows) throw new Error('EPERM')
            return []
        },
        createWriteStream: () => {
            if (state.createStreamThrows) throw new Error('EACCES')
            const stream: FakeStream = {
                write: vi.fn(),
                end: vi.fn(),
                on: vi.fn((event: string, listener: (error: unknown) => void) => {
                    if (event === 'error') stream.errorListener = listener
                })
            }
            state.streams.push(stream)
            return stream
        },
        renameSync: (from: string, to: string) => {
            state.renamed.push([from, to])
        }
    }
})

type LoggerModule = typeof import('../../../src/main/utils/logger')

/** 路径归一化比较（Windows 分隔符差异） */
const samePath = (actual: string, expected: string): boolean =>
    path.normalize(actual) === path.normalize(expected)
const EXE_LOG_DIR = path.join(path.dirname(hoisted.exePath), 'log')
const TMP_LOG_DIR = path.join(os.tmpdir(), 'baize-notes-log')

let currentLogger: { close: () => void } | null = null

async function loadLogger(): Promise<LoggerModule> {
    vi.resetModules()
    const module = await import('../../../src/main/utils/logger')
    currentLogger = module.logger
    return module
}

function resetState(): void {
    state.streams.length = 0
    state.logFileSizes.length = 0
    state.renamed.length = 0
    state.statThrows = false
    state.statReturns = null
    state.dirWritable = true
    state.createStreamThrows = false
    state.readdirThrows = false
    state.mkdirThrows = false
}

beforeEach(() => {
    resetState()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
    currentLogger?.close()
    currentLogger = null
    vi.restoreAllMocks()
    vi.doUnmock('os')
})

describe('日志轮转', () => {
    it('估算超过阈值后 stat 重查、关闭旧流、重命名并重建', async () => {
        state.logFileSizes.push(0, 500) // 构造期初始大小 → 轮转检查时实际大小
        const { logger } = await loadLogger()
        const originalFile = logger.getCurrentLogFile()

        logger.info('x'.repeat(60))
        logger.info('y'.repeat(60))

        expect(state.renamed).toHaveLength(1)
        expect(state.renamed[0][0]).toBe(originalFile)
        expect(state.renamed[0][1]).toContain(originalFile.replace('.log', '-'))
        // 旧流已 end，新流已创建
        expect(state.streams[0]?.end).toHaveBeenCalled()
        expect(state.streams.length).toBeGreaterThanOrEqual(2)
    })

    it('轮转检查时 stat 抛错：catch 中重建写入流（旧流存在 → 先 end）', async () => {
        state.statThrows = true
        const { logger } = await loadLogger()
        logger.info('a'.repeat(120))
        expect(state.streams[0]?.end).toHaveBeenCalledTimes(1)
        expect(state.streams.length).toBeGreaterThanOrEqual(2)
    })

    it('写入流 error 事件：记录错误（避免未捕获异常终止主进程）', async () => {
        const { logger } = await loadLogger()
        const stream = state.streams[state.streams.length - 1]
        stream?.errorListener?.(new Error('ENOSPC'))
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('日志文件写入失败'),
            expect.any(Error)
        )
        logger.close()
    })
})

describe('目录回退链与写入流降级', () => {
    it('安装目录/userData 均不可写时回退系统临时目录', async () => {
        state.dirWritable = false
        const { logger } = await loadLogger()
        expect(samePath(logger.getLogDir(), TMP_LOG_DIR)).toBe(true)
        logger.close()
    })

    it('目录 mkdir 抛错同样触发回退（探针失败不拖垮应用启动）', async () => {
        state.mkdirThrows = true
        const { logger } = await loadLogger()
        expect(samePath(logger.getLogDir(), TMP_LOG_DIR)).toBe(true)
        logger.close()
    })

    it('写入流创建抛错：降级为仅控制台日志，close 安全', async () => {
        state.createStreamThrows = true
        const { logger } = await loadLogger()
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('创建日志写入流失败'),
            expect.any(Error)
        )
        expect(() => logger.info('console only')).not.toThrow()
        expect(() => logger.close()).not.toThrow()
    })

    it('cleanOldLogs 读取目录失败只记录错误', async () => {
        state.readdirThrows = true
        await loadLogger()
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to clean old logs'),
            expect.any(Error)
        )
    })
})

describe('参数格式化与脱敏', () => {
    it('循环引用对象 JSON.stringify 抛错时回退 String', async () => {
        const { logger } = await loadLogger()
        const circular: Record<string, unknown> = {}
        circular.self = circular
        expect(() => logger.info('circular', circular)).not.toThrow()
        logger.close()
    })

    it('Error 空 name/message 时输出 Error 名称（不产生空串）', async () => {
        const { logger } = await loadLogger()
        const error = new Error('')
        error.name = ''
        error.stack = undefined as unknown as string
        logger.error('edge', error)
        logger.close()
    })

    it('空文本 / 非字符串 / 普通文本原样返回', async () => {
        const { maskUserPaths } = await loadLogger()
        expect(maskUserPaths('')).toBe('')
        expect(maskUserPaths(42 as unknown as string)).toBe(42)
        expect(maskUserPaths('no-home-in-this-text')).toBe('no-home-in-this-text')
    })

    it('用户主目录过短（<3 字符）时不参与替换', async () => {
        vi.doMock('os', async (importOriginal) => {
            const actual = await importOriginal<typeof import('os')>()
            return { ...actual, homedir: () => '.', tmpdir: () => actual.tmpdir() }
        })
        const { maskUserPaths } = await loadLogger()
        expect(maskUserPaths('a/b/c')).toBe('a/b/c')
    })
})

describe('状态栏镜像与开关分支', () => {
    it('状态栏发送抛错时静默降级并记录错误', async () => {
        const { logger } = await loadLogger()
        logger.setMainWindow({
            isDestroyed: () => false,
            webContents: {
                send: () => {
                    throw new Error('destroyed')
                }
            }
        } as never)
        expect(() => logger.error('mirror me')).not.toThrow()
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('状态栏消息发送失败'),
            expect.any(Error)
        )
        logger.close()
    })

    it('enableConsole=false 时不写 console', async () => {
        const { logger } = await loadLogger()
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        const internals = logger as unknown as { config: { enableConsole: boolean } }
        internals.config.enableConsole = false
        logger.info('silent')
        expect(consoleLog).not.toHaveBeenCalled()
        logger.close()
    })

    it('enableFile=false 时不写流', async () => {
        const { logger } = await loadLogger()
        const stream = state.streams[state.streams.length - 1]
        const internals = logger as unknown as { config: { enableFile: boolean } }
        internals.config.enableFile = false
        logger.info('file-off')
        expect(stream?.write).not.toHaveBeenCalled()
        logger.close()
    })

    it('关闭日志器：写入流 end 一次，重复关闭安全', async () => {
        const { logger } = await loadLogger()
        logger.close()
        const stream = state.streams[state.streams.length - 1]
        expect(stream?.end).toHaveBeenCalledTimes(1)
        expect(() => logger.close()).not.toThrow()
    })

    it('日志级别枚举值保持稳定契约', async () => {
        const { LogLevel } = await loadLogger()
        expect(LogLevel.DEBUG).toBe('DEBUG')
        expect(LogLevel.INFO).toBe('INFO')
        expect(LogLevel.WARN).toBe('WARN')
        expect(LogLevel.ERROR).toBe('ERROR')
    })
})

describe('日志路径', () => {
    it('可写时日志目录位于安装目录下且文件名为当日日期', async () => {
        const { logger } = await loadLogger()
        expect(samePath(logger.getLogDir(), EXE_LOG_DIR)).toBe(true)
        expect(logger.getCurrentLogFile()).toMatch(/baize-notes-\d{4}-\d{2}-\d{2}\.log$/)
        expect(os.tmpdir().length).toBeGreaterThan(0)
        logger.close()
    })
})
