/**
 * logger.ts 单元测试
 * 覆盖：日志目录/文件名、文件写入格式、控制台输出级别映射、
 * 状态栏消息发送与级别映射（AS-11：仅 WARN/ERROR 镜像）、已销毁窗口跳过、旧日志清理、
 * AS-11 目录回退（安装目录不可写 → userData/logs）与用户主目录脱敏
 * 说明：Logger 类未导出且轮转阈值固定为 10MB，日志轮转路径不在本文件覆盖
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const loggerState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        exePath: `${base}/baize-vitest-logger/bin/BaiZeNotes.exe`,
        userDataPath: `${base}/baize-vitest-logger/user-data`
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => {
            if (name === 'exe') return loggerState.exePath
            if (name === 'userData') return loggerState.userDataPath
            return ''
        })
    },
    BrowserWindow: class {}
}))

const EXE_DIR = path.dirname(loggerState.exePath)
const LOG_DIR = path.join(EXE_DIR, 'log')
const USER_DATA_LOG_DIR = path.join(loggerState.userDataPath, 'logs')

async function loadLogger() {
    return await import('../../src/main/utils/logger')
}

describe('logger', () => {
    beforeEach(() => {
        vi.resetModules()
        fs.rmSync(EXE_DIR, { recursive: true, force: true })
        fs.rmSync(loggerState.userDataPath, { recursive: true, force: true })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('file setup', () => {
        it('should create the log directory next to the executable', async () => {
            const { logger } = await loadLogger()
            expect(logger.getLogDir()).toBe(LOG_DIR)
            expect(fs.existsSync(LOG_DIR)).toBe(true)
            expect(fs.statSync(LOG_DIR).isDirectory()).toBe(true)
        })

        it('should name the current log file by today date', async () => {
            const { logger } = await loadLogger()
            const currentFile = logger.getCurrentLogFile()
            expect(path.dirname(currentFile)).toBe(LOG_DIR)
            expect(path.basename(currentFile)).toMatch(/^baize-notes-\d{4}-\d{2}-\d{2}\.log$/)
            // createWriteStream 打开文件是异步的，稍等后文件应存在
            await new Promise((resolve) => setTimeout(resolve, 60))
            expect(fs.existsSync(currentFile)).toBe(true)
        })

        // AS-11：安装目录不可写时回退 userData/logs，避免模块加载期抛错阻止应用启动
        it('should fall back to userData/logs when the install directory is not writable', async () => {
            // 用普通文件占住 <exeDir>/log，使安装目录下的日志目录无法创建
            fs.mkdirSync(EXE_DIR, { recursive: true })
            fs.writeFileSync(LOG_DIR, 'occupied', 'utf-8')

            const { logger } = await loadLogger()
            expect(logger.getLogDir()).toBe(USER_DATA_LOG_DIR)
            expect(fs.existsSync(USER_DATA_LOG_DIR)).toBe(true)
            expect(fs.statSync(USER_DATA_LOG_DIR).isDirectory()).toBe(true)
        })
    })

    describe('log writing', () => {
        it('should write formatted lines with level, message and stringified args', async () => {
            const { logger } = await loadLogger()
            logger.info('hello', { a: 1 })
            logger.error('boom')
            logger.close()
            // 等待写入流 flush
            await new Promise((resolve) => setTimeout(resolve, 80))
            // ET-19 澄清：这里 readFileSync 读的是 logger 运行期写出的日志文件（被测行为
            // 的产物），不是源码文本；属于行为断言，不随源码排版变化。
            const content = fs.readFileSync(logger.getCurrentLogFile(), 'utf-8')
            expect(content).toContain('[INFO] hello {"a":1}')
            expect(content).toContain('[ERROR] boom')
        })

        it('should keep Error message/stack instead of serializing it as {} (CQ-10)', async () => {
            const { logger } = await loadLogger()
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            logger.error('save failed', new Error('disk full'))
            logger.close()
            await new Promise((resolve) => setTimeout(resolve, 80))

            const content = fs.readFileSync(logger.getCurrentLogFile(), 'utf-8')
            // 主进程 console → logger 迁移后，原 console.error('xxx', err) 的错误信息不得丢失
            expect(content).toContain('[ERROR] save failed Error: disk full')
            expect(content).not.toContain('[ERROR] save failed {}')
            // 控制台双写镜像同样保留错误信息
            expect(consoleError).toHaveBeenCalledWith(
                expect.stringContaining('save failed Error: disk full')
            )
        })

        it('should map levels to console methods', async () => {
            const { logger, LogLevel } = await loadLogger()
            const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {})
            const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

            logger.debug('d')
            logger.info('i')
            logger.warn('w')
            logger.error('e')

            expect(consoleDebug).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] d'))
            expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('[INFO] i'))
            expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('[WARN] w'))
            expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('[ERROR] e'))
            expect(LogLevel.DEBUG).toBe('DEBUG')
        })
    })

    // AS-11：用户主目录脱敏（日志落盘与状态栏镜像都不出现完整本机路径）
    describe('user path masking (AS-11)', () => {
        it('should replace the user home directory with ~ in file logs', async () => {
            const { logger } = await loadLogger()
            const secretPath = path.join(os.homedir(), 'notes', 'secret.md')
            logger.info(`opened ${secretPath}`)
            logger.close()
            await new Promise((resolve) => setTimeout(resolve, 80))

            const content = fs.readFileSync(logger.getCurrentLogFile(), 'utf-8')
            expect(content).not.toContain(os.homedir())
            expect(content).toContain('~')
            expect(content).toContain('secret.md')
        })

        it('should mask the home directory in status bar messages', async () => {
            const { logger } = await loadLogger()
            const send = vi.fn()
            logger.setMainWindow({ isDestroyed: () => false, webContents: { send } } as never)
            const secretPath = path.join(os.homedir(), 'notes', 'secret.md')

            logger.error(`failed ${secretPath}`)

            const payload = send.mock.calls[0][1] as { message: string }
            expect(payload.message).not.toContain(os.homedir())
            expect(payload.message).toContain('~')
        })
    })

    // P3-7：敏感值脱敏（口令/令牌/API Key/私钥不入日志；文件/控制台/状态栏统一掩码）
    describe('sensitive value masking (P3-7)', () => {
        it('should mask key=value and JSON-keyed secrets', async () => {
            const { maskSensitiveData } = await loadLogger()

            expect(maskSensitiveData('password=hunter2')).toBe('password=***')
            expect(maskSensitiveData('login failed: pwd=topsecret, retry=2')).toBe(
                'login failed: pwd=***, retry=2'
            )
            expect(maskSensitiveData('{"token":"abc123","user":"alice"}')).toBe(
                '{"token":***,"user":"alice"}'
            )
            expect(maskSensitiveData("api_key: 'sk-raw-value'")).toBe('api_key: ***')
            expect(maskSensitiveData('apiKey=xyz client_secret=s3cr3t')).toBe(
                'apiKey=*** client_secret=***'
            )
        })

        it('should mask bearer/basic credentials and PEM private key blocks', async () => {
            const { maskSensitiveData } = await loadLogger()

            const authorization = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'
            expect(maskSensitiveData(authorization)).not.toContain('eyJhbGciOiJIUzI1NiJ9')
            expect(maskSensitiveData('Basic dXNlcjpwYXNz')).toBe('Basic ***')

            const pem =
                '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----'
            const maskedPem = maskSensitiveData(pem)
            expect(maskedPem).toBe('[PRIVATE KEY REDACTED]')
            expect(maskedPem).not.toContain('MIIEowIBAAKCAQEA')
        })

        it('should keep ordinary log text unchanged (no over-masking)', async () => {
            const { maskSensitiveData } = await loadLogger()

            // 仅字段名紧跟 :/= 才掩码，正文中的普通单词不误伤
            expect(maskSensitiveData('the token count is 3')).toBe('the token count is 3')
            expect(maskSensitiveData('secret sauce recipe')).toBe('secret sauce recipe')
            expect(maskSensitiveData('')).toBe('')
        })

        it('should not write secrets into the log file', async () => {
            const { logger } = await loadLogger()
            logger.info('login', { password: 'hunter2', token: 'tok-123456' })
            logger.close()
            await new Promise((resolve) => setTimeout(resolve, 80))

            const content = fs.readFileSync(logger.getCurrentLogFile(), 'utf-8')
            expect(content).not.toContain('hunter2')
            expect(content).not.toContain('tok-123456')
            expect(content).toContain('***')
        })

        it('should mask secrets in status bar messages', async () => {
            const { logger } = await loadLogger()
            const send = vi.fn()
            logger.setMainWindow({ isDestroyed: () => false, webContents: { send } } as never)

            logger.error('auth failed password=hunter2')

            const payload = send.mock.calls[0][1] as { message: string }
            expect(payload.message).not.toContain('hunter2')
            expect(payload.message).toContain('password=***')
        })
    })

    describe('status bar messages', () => {
        it('should mirror WARN/ERROR to the status bar with mapped types (AS-11)', async () => {
            const { logger } = await loadLogger()
            const send = vi.fn()
            logger.setMainWindow({ isDestroyed: () => false, webContents: { send } } as never)

            logger.info('ok')
            logger.warn('careful')
            logger.error('bad')
            logger.debug('trace')

            // AS-11：DEBUG/INFO 不再镜像到状态栏，避免内部调试信息进入 UI 可见面
            expect(send).not.toHaveBeenCalledWith('baize:status-bar:update', {
                message: 'ok',
                type: 'success'
            })
            expect(send).not.toHaveBeenCalledWith('baize:status-bar:update', {
                message: 'trace',
                type: 'info'
            })
            expect(send).toHaveBeenCalledTimes(2)
            expect(send).toHaveBeenCalledWith('baize:status-bar:update', {
                message: 'careful',
                type: 'warning'
            })
            expect(send).toHaveBeenCalledWith('baize:status-bar:update', {
                message: 'bad',
                type: 'error'
            })
        })

        it('should include stringified args in the status bar message', async () => {
            const { logger } = await loadLogger()
            const send = vi.fn()
            logger.setMainWindow({ isDestroyed: () => false, webContents: { send } } as never)
            logger.error('fail', { code: 1 }, 'extra')
            expect(send).toHaveBeenCalledWith('baize:status-bar:update', {
                message: 'fail {"code":1} extra',
                type: 'error'
            })
        })

        it('should mirror an Error argument to the status bar as a single line without stack (CQ-10)', async () => {
            const { logger } = await loadLogger()
            const send = vi.fn()
            logger.setMainWindow({ isDestroyed: () => false, webContents: { send } } as never)
            logger.error('保存失败', new Error('disk full'))
            expect(send).toHaveBeenCalledWith('baize:status-bar:update', {
                message: '保存失败 Error: disk full',
                type: 'error'
            })
        })

        it('should not send to a destroyed window', async () => {
            const { logger } = await loadLogger()
            const send = vi.fn()
            logger.setMainWindow({ isDestroyed: () => true, webContents: { send } } as never)
            logger.error('ignored')
            expect(send).not.toHaveBeenCalled()
        })
    })

    describe('old log cleanup', () => {
        it('should remove old log files beyond maxFiles on startup', async () => {
            // 预置 7 个带旧时间戳的日志文件（含今天的文件名，但 mtime 是过去时间）
            fs.mkdirSync(LOG_DIR, { recursive: true })
            const oldDates = [
                '2020-01-01',
                '2020-01-02',
                '2020-01-03',
                '2020-01-04',
                '2020-01-05',
                '2020-01-06'
            ]
            const today = new Date().toISOString().split('T')[0]
            const names = [...oldDates, today]
            names.forEach((date, index) => {
                const file = path.join(LOG_DIR, `baize-notes-${date}.log`)
                fs.writeFileSync(file, 'x', 'utf-8')
                // mtime 递增：越靠后越新
                const mtime = new Date(2020, 0, 1 + index, 12, 0, 0)
                fs.utimesSync(file, mtime, mtime)
            })

            await loadLogger()
            // 刷新今天文件的 mtime（构造器会在清理前创建今天的文件，其 mtime 为当前时间）
            const files = fs
                .readdirSync(LOG_DIR)
                .filter((f) => f.startsWith('baize-notes-') && f.endsWith('.log'))
            // maxFiles=5：超过部分按 mtime 升序删除最旧的
            expect(files.length).toBeLessThanOrEqual(5)
            expect(files).toContain(`baize-notes-${today}.log`)
            // 最旧的两个日期文件应被清理
            expect(files).not.toContain('baize-notes-2020-01-01.log')
            expect(files).not.toContain('baize-notes-2020-01-02.log')
        })
    })
})
