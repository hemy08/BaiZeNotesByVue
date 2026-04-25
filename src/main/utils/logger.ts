/**
 * 白泽笔记日志模块
 * 支持文件日志和控制台日志
 */

import * as fs from 'fs'
import * as path from 'path'
import { app, BrowserWindow } from 'electron'

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

class Logger {
    private logDir: string
    private currentLogFile: string
    private config: LogConfig
    private writeStream: fs.WriteStream | null = null
    private mainWindow: BrowserWindow | null = null

    constructor(config: Partial<LogConfig> = {}) {
        this.config = { ...defaultConfig, ...config }
        
        // 获取日志目录路径 (exe同级目录)
        const exePath = app.getPath('exe')
        const exeDir = path.dirname(exePath)
        this.logDir = path.join(exeDir, 'log')
        
        // 确保日志目录存在
        this.ensureLogDir()
        
        // 初始化当前日志文件
        this.currentLogFile = this.getLogFileName()
        
        // 创建写入流
        this.createWriteStream()
        
        // 清理旧日志文件
        this.cleanOldLogs()
    }

    /**
     * 设置主窗口引用
     */
    setMainWindow(window: BrowserWindow): void {
        this.mainWindow = window
    }

    /**
     * 确保日志目录存在
     */
    private ensureLogDir(): void {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true })
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
        
        this.writeStream = fs.createWriteStream(this.currentLogFile, {
            flags: 'a', // 追加模式
            encoding: 'utf-8'
        })
    }

    /**
     * 检查并轮转日志文件
     */
    private checkLogRotation(): void {
        try {
            const stats = fs.statSync(this.currentLogFile)
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
                
                // 创建新的日志文件
                this.currentLogFile = this.getLogFileName()
                this.createWriteStream()
            }
        } catch (err) {
            // 文件不存在,创建新的
            this.createWriteStream()
        }
    }

    /**
     * 清理旧日志文件
     */
    private cleanOldLogs(): void {
        try {
            const files = fs.readdirSync(this.logDir)
                .filter(file => file.startsWith('baize-notes-') && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.logDir, file),
                    time: fs.statSync(path.join(this.logDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time) // 按时间降序

            // 删除超过最大数量的日志文件
            if (files.length > this.config.maxFiles) {
                files.slice(this.config.maxFiles).forEach(file => {
                    fs.unlinkSync(file.path)
                })
            }
        } catch (err) {
            console.error('Failed to clean old logs:', err)
        }
    }

    /**
     * 格式化日志消息
     */
    private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString()
        const argsStr = args.length > 0 ? ' ' + args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg)
                } catch {
                    return String(arg)
                }
            }
            return String(arg)
        }).join(' ') : ''
        
        return `[${timestamp}] [${level}] ${message}${argsStr}\n`
    }

    /**
     * 写入日志
     */
    private writeLog(level: LogLevel, message: string, ...args: any[]): void {
        const formattedMessage = this.formatMessage(level, message, ...args)
        
        // 输出到控制台
        if (this.config.enableConsole) {
            const consoleMethod = level === LogLevel.ERROR ? 'error' 
                : level === LogLevel.WARN ? 'warn' 
                : level === LogLevel.DEBUG ? 'debug' 
                : 'log'
            console[consoleMethod](formattedMessage.trim())
        }
        
        // 输出到文件
        if (this.config.enableFile && this.writeStream) {
            // 检查日志轮转
            this.checkLogRotation()
            
            this.writeStream.write(formattedMessage)
        }
        
        // 发送到状态栏console
        this.sendToStatusBar(level, message, ...args)
    }

    /**
     * 发送日志到状态栏console
     */
    private sendToStatusBar(level: LogLevel, message: string, ...args: any[]): void {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            return
        }
        
        // 映射日志级别到console类型
        const consoleType = level === LogLevel.ERROR ? 'error'
            : level === LogLevel.WARN ? 'warning'
            : level === LogLevel.INFO ? 'success'
            : 'info'
        
        // 构建显示消息
        const displayMessage = args.length > 0 
            ? `${message} ${args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg)
                    } catch {
                        return String(arg)
                    }
                }
                return String(arg)
            }).join(' ')}`
            : message
        
        // 发送到渲染进程
        this.mainWindow.webContents.send('status-bar-console-update', {
            message: displayMessage,
            type: consoleType
        })
    }

    /**
     * 调试日志
     */
    debug(message: string, ...args: any[]): void {
        this.writeLog(LogLevel.DEBUG, message, ...args)
    }

    /**
     * 信息日志
     */
    info(message: string, ...args: any[]): void {
        this.writeLog(LogLevel.INFO, message, ...args)
    }

    /**
     * 警告日志
     */
    warn(message: string, ...args: any[]): void {
        this.writeLog(LogLevel.WARN, message, ...args)
    }

    /**
     * 错误日志
     */
    error(message: string, ...args: any[]): void {
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
