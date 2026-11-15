/**
 * 白泽笔记日志模块
 * 支持文件日志和控制台日志
 *
 * AS-11（P3）日志安全加固：
 * 1. 日志目录回退链：<安装目录>/log（历史行为）→ app.getPath('userData')/logs →
 *    系统临时目录。安装目录对普通用户不可写时（如安装在 C:\Program Files），
 *    不再因 mkdir/writeStream 抛错而拖垮应用启动；目录可写性用探针文件实测。
 * 2. 日志内容脱敏：用户主目录（os.homedir()）替换为 `~`，避免日志文件泄露
 *    完整本机路径（用户名/文档目录结构）。
 * 3. 状态栏镜像收敛：仅 WARN/ERROR 镜像到渲染层状态栏（DEBUG/INFO 只落盘/控制台），
 *    减少内部调试信息进入 UI 可见面。
 * 4. 写入流错误兜底：createWriteStream 的 error 事件必须消费，否则磁盘满/权限
 *    变化时 Node 会以未捕获异常终止主进程。
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { app, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'

// 日志级别
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

// 日志配置
interface LogConfig {
    maxFileSize: number // 单个日志文件最大大小 (字节)
    maxFiles: number // 最多保留的日志文件数量
    enableConsole: boolean // 是否输出到控制台
    enableFile: boolean // 是否输出到文件
}

// 默认配置
const defaultConfig: LogConfig = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    enableConsole: true,
    enableFile: true
}

/** AS-11：用户主目录（脱敏基准；启动早期 os.homedir 即可用，失败时为空串表示不脱敏） */
const USER_HOME_DIR: string = (() => {
    try {
        return os.homedir()
    } catch {
        return ''
    }
})()

/** 转义正则元字符（用户主目录可能含 `.`、`(` 等字符） */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * AS-11：日志文本脱敏——把用户主目录替换为 `~`（大小写不敏感，兼容 `/` 与 `\` 写法）。
 * 纯函数、不抛异常；主目录不可用时原样返回。
 */
export function maskUserPaths(text: string): string {
    if (USER_HOME_DIR === '' || typeof text !== 'string' || text.length === 0) {
        return text
    }
    const variants = new Set<string>([
        USER_HOME_DIR,
        USER_HOME_DIR.replace(/\\/g, '/'),
        USER_HOME_DIR.replace(/\//g, '\\')
    ])
    let masked = text
    for (const variant of variants) {
        if (variant.length < 3) {
            continue
        }
        try {
            masked = masked.replace(new RegExp(escapeRegExp(variant), 'gi'), '~')
        } catch {
            // 正则构造失败（极端路径字符）时保持原文，脱敏失败不应丢日志
        }
    }
    return masked
}

class Logger {
    private logDir: string
    private currentLogFile: string
    private config: LogConfig
    private writeStream: fs.WriteStream | null = null
    private mainWindow: BrowserWindow | null = null
    // P-4（PF-12）：缓存当前日志文件大小，轮转检查不再每次 statSync
    private currentFileSize = 0
    // 自上次 stat 检查以来累计写入的字节数（用于估算当前文件大小）
    private bytesSinceLastStat = 0

    constructor(config: Partial<LogConfig> = {}) {
        this.config = { ...defaultConfig, ...config }

        // AS-11：按回退链选择可写日志目录（安装目录 → userData/logs → 临时目录）
        this.logDir = this.resolveLogDir()

        // 确保日志目录存在（resolveLogDir 已探针验证；这里兜底并吞掉异常）
        this.ensureLogDir()

        // 初始化当前日志文件
        this.currentLogFile = this.getLogFileName()

        // 创建写入流
        this.createWriteStream()

        // 清理旧日志文件
        this.cleanOldLogs()
    }

    /** 读取 Electron 可执行文件所在目录；app 未就绪/测试桩缺失时返回 null */
    private resolveExecutableDir(): string | null {
        try {
            const electronApp = app as Partial<typeof app> | undefined
            if (electronApp && typeof electronApp.getPath === 'function') {
                const exePath = electronApp.getPath('exe')
                if (typeof exePath === 'string' && exePath.length > 0) {
                    return path.dirname(exePath)
                }
            }
        } catch {
            // app 未就绪或测试桩未提供 getPath：走下一级回退
        }
        return null
    }

    /** 读取 Electron userData 目录；不可用时返回 null（启动早期可能拿不到） */
    private resolveUserDataDir(): string | null {
        try {
            const electronApp = app as Partial<typeof app> | undefined
            if (electronApp && typeof electronApp.getPath === 'function') {
                const userDataPath = electronApp.getPath('userData')
                if (typeof userDataPath === 'string' && userDataPath.length > 0) {
                    return userDataPath
                }
            }
        } catch {
            // 同上：回退到临时目录
        }
        return null
    }

    /**
     * AS-11：目录可写性探针——mkdir + 写/删探针文件，均成功才认为可写。
     * 仅做同步短 IO（构造期一次），不会在日志热路径重复。
     */
    private ensureDirWritable(dir: string): boolean {
        try {
            fs.mkdirSync(dir, { recursive: true })
            if (!fs.statSync(dir).isDirectory()) {
                return false
            }
            const probeFile = path.join(dir, `.write-probe-${process.pid}-${Date.now()}`)
            fs.writeFileSync(probeFile, '')
            fs.unlinkSync(probeFile)
            return true
        } catch {
            return false
        }
    }

    /**
     * AS-11：解析日志目录（安装目录不可写时回退 userData/logs，最后回退系统临时目录）。
     * 所有候选都不可写时返回临时目录路径（后续 ensureLogDir/createWriteStream 仍会兜底容错）。
     */
    private resolveLogDir(): string {
        const candidates: string[] = []
        const exeDir = this.resolveExecutableDir()
        if (exeDir !== null) {
            candidates.push(path.join(exeDir, 'log'))
        }
        const userDataDir = this.resolveUserDataDir()
        if (userDataDir !== null) {
            candidates.push(path.join(userDataDir, 'logs'))
        }
        candidates.push(path.join(os.tmpdir(), 'baize-notes-log'))

        for (const candidate of candidates) {
            if (this.ensureDirWritable(candidate)) {
                return candidate
            }
        }
        return path.join(os.tmpdir(), 'baize-notes-log')
    }

    /**
     * 设置主窗口引用
     */
    setMainWindow(window: BrowserWindow): void {
        this.mainWindow = window
    }

    /**
     * 确保日志目录存在（AS-11：失败只记录，不再让模块加载期抛错阻止应用启动）
     */
    private ensureLogDir(): void {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true })
            }
        } catch (error) {
            console.error('[Logger] 创建日志目录失败（日志文件功能将降级）:', error)
        }
    }

    /**
     * 获取日志文件名 (按日期)
     */
    private getLogFileName(): string {
        const now = new Date()
        const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
        return path.join(this.logDir, `baize-notes-${dateStr}.log`)
    }

    /**
     * 创建写入流
     */
    private createWriteStream(): void {
        if (this.writeStream) {
            this.writeStream.end()
        }

        try {
            this.writeStream = fs.createWriteStream(this.currentLogFile, {
                flags: 'a', // 追加模式
                encoding: 'utf-8'
            })
            // AS-11：必须消费 error 事件——磁盘满/权限变化时避免未捕获异常终止主进程
            this.writeStream.on('error', (error) => {
                console.error('[Logger] 日志文件写入失败（不影响主流程）:', error)
                this.writeStream = null
            })
        } catch (error) {
            // 目录不可写等同步异常：降级为仅控制台日志，不阻断应用
            console.error('[Logger] 创建日志写入流失败（日志文件功能将降级）:', error)
            this.writeStream = null
            return
        }

        // P-4（PF-12）：仅在打开文件时读取一次实际大小作为缓存基准，
        // 之后的轮转检查按累计写入字节数估算，不再每条日志 statSync
        try {
            this.currentFileSize = fs.statSync(this.currentLogFile).size
        } catch {
            this.currentFileSize = 0
        }
        this.bytesSinceLastStat = 0
    }

    /**
     * 检查并轮转日志文件
     */
    private checkLogRotation(): void {
        // P-4（PF-12）：缓存大小 + 累计写入字节数未超阈值时直接返回，不做磁盘 stat
        if (this.currentFileSize + this.bytesSinceLastStat < this.config.maxFileSize) {
            return
        }
        try {
            // 仅当估算超过阈值时才重查实际文件大小
            const stats = fs.statSync(this.currentLogFile)
            this.currentFileSize = stats.size
            this.bytesSinceLastStat = 0
            if (stats.size >= this.config.maxFileSize) {
                // 关闭当前写入流
                if (this.writeStream) {
                    this.writeStream.end()
                    this.writeStream = null
                }

                // 重命名当前日志文件
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
                const rotatedFile = this.currentLogFile.replace('.log', `-${timestamp}.log`)
                fs.renameSync(this.currentLogFile, rotatedFile)

                // 创建新的日志文件（createWriteStream 会重建大小缓存基准）
                this.currentLogFile = this.getLogFileName()
                this.createWriteStream()
            }
        } catch {
            // 文件不存在,创建新的
            this.createWriteStream()
        }
    }

    /**
     * 清理旧日志文件
     */
    private cleanOldLogs(): void {
        try {
            const files = fs
                .readdirSync(this.logDir)
                .filter((file) => file.startsWith('baize-notes-') && file.endsWith('.log'))
                .map((file) => ({
                    name: file,
                    path: path.join(this.logDir, file),
                    time: fs.statSync(path.join(this.logDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time) // 按时间降序

            // 删除超过最大数量的日志文件
            if (files.length > this.config.maxFiles) {
                files.slice(this.config.maxFiles).forEach((file) => {
                    fs.unlinkSync(file.path)
                })
            }
        } catch (err) {
            console.error('Failed to clean old logs:', err)
        }
    }

    /**
     * CQ-10：日志参数格式化——迁移自 console.error/warn 的调用点常把 Error 对象作为
     * 第二实参（如 `logger.error('保存失败', err)`）。直接 JSON.stringify(Error) 只会
     * 得到 `{}`，会丢失 message/stack，因此这里显式保留：
     * - 文件/控制台：优先输出完整 stack（含 message），无 stack 时退化为 `Name: message`；
     * - 状态栏（includeStack=false）：只输出一行 `Name: message`，避免把堆栈刷进 UI。
     * 普通对象仍走 JSON.stringify（失败时 String 兜底），与历史日志格式保持兼容。
     */
    private formatLogArg(arg: unknown, options: { includeStack?: boolean } = {}): string {
        if (arg instanceof Error) {
            const name = arg.name || 'Error'
            const message = arg.message || ''
            const stack = arg.stack
            if (options.includeStack !== false && typeof stack === 'string' && stack.length > 0) {
                return stack
            }
            return message ? `${name}: ${message}` : name
        }
        if (typeof arg === 'object' && arg !== null) {
            try {
                return JSON.stringify(arg)
            } catch {
                return String(arg)
            }
        }
        return String(arg)
    }

    /**
     * 格式化日志消息（AS-11：用户主目录脱敏后再输出/落盘）
     */
    private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
        const timestamp = new Date().toISOString()
        const argsStr =
            args.length > 0 ? ' ' + args.map((arg) => this.formatLogArg(arg)).join(' ') : ''

        return `${maskUserPaths(`[${timestamp}] [${level}] ${message}${argsStr}`)}\n`
    }

    /**
     * 写入日志
     *
     * CQ-10 双写契约（主进程 console → logger 统一迁移的兼容前提）：
     * WARN/ERROR 同时写入文件 AND 调用对应 console.warn/console.error（单行格式化文本，
     * 保留级别/时间戳/脱敏），因此迁移前依赖 `expect(console.error/warn).toHaveBeenCalled()`
     * 的既有测试断言仍然成立；DEBUG/INFO 同样镜像控制台，但不进状态栏（AS-11）。
     */
    private writeLog(level: LogLevel, message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage(level, message, ...args)

        // 输出到控制台（双写之一：与文件日志并行，保持 console 可见性/测试断言兼容）
        if (this.config.enableConsole) {
            const consoleMethod =
                level === LogLevel.ERROR
                    ? 'error'
                    : level === LogLevel.WARN
                      ? 'warn'
                      : level === LogLevel.DEBUG
                        ? 'debug'
                        : 'log'
            console[consoleMethod](formattedMessage.trim())
        }

        // 输出到文件
        if (this.config.enableFile && this.writeStream) {
            // P-4（PF-12）：先累计本次写入字节数（估算大小），再检查日志轮转
            this.bytesSinceLastStat += Buffer.byteLength(formattedMessage, 'utf-8')
            this.checkLogRotation()

            // 轮转失败时 createWriteStream 可能已把流置空，重新判空避免 TypeError
            if (this.writeStream) {
                this.writeStream.write(formattedMessage)
            }
        }

        // 发送到状态栏console（AS-11：仅 WARN/ERROR 镜像，DEBUG/INFO 不进 UI）
        this.sendToStatusBar(level, message, ...args)
    }

    /**
     * 发送日志到状态栏console
     */
    private sendToStatusBar(level: LogLevel, message: string, ...args: unknown[]): void {
        // AS-11：状态栏只镜像错误/警告；DEBUG 与 INFO 仅落盘与控制台
        if (level !== LogLevel.WARN && level !== LogLevel.ERROR) {
            return
        }
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            return
        }

        // 映射日志级别到console类型
        const consoleType = level === LogLevel.ERROR ? 'error' : 'warning'

        // 构建显示消息（AS-11：同样脱敏用户主目录；CQ-10：Error 只取单行 message，不刷堆栈）
        const displayMessage =
            args.length > 0
                ? `${message} ${args.map((arg) => this.formatLogArg(arg, { includeStack: false })).join(' ')}`
                : message

        // 发送到渲染进程
        try {
            this.mainWindow.webContents.send(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: maskUserPaths(displayMessage),
                type: consoleType
            })
        } catch (error) {
            // 窗口销毁竞态：状态栏不可用时静默降级，不影响日志主流程
            console.error('[Logger] 状态栏消息发送失败:', error)
        }
    }

    /**
     * 调试日志
     */
    debug(message: string, ...args: unknown[]): void {
        this.writeLog(LogLevel.DEBUG, message, ...args)
    }

    /**
     * 信息日志
     */
    info(message: string, ...args: unknown[]): void {
        this.writeLog(LogLevel.INFO, message, ...args)
    }

    /**
     * 警告日志
     */
    warn(message: string, ...args: unknown[]): void {
        this.writeLog(LogLevel.WARN, message, ...args)
    }

    /**
     * 错误日志
     */
    error(message: string, ...args: unknown[]): void {
        this.writeLog(LogLevel.ERROR, message, ...args)
    }

    /**
     * 关闭日志器
     */
    close(): void {
        if (this.writeStream) {
            this.writeStream.end()
            this.writeStream = null
        }
    }

    /**
     * 获取日志目录路径
     */
    getLogDir(): string {
        return this.logDir
    }

    /**
     * 获取当前日志文件路径
     */
    getCurrentLogFile(): string {
        return this.currentLogFile
    }
}

// 导出单例
export const logger = new Logger()
