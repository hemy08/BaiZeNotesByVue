/**
 * 自动更新封装模块（FUN-10/CMP-21/ARC-16）
 * 基于 electron-updater 提供"帮助 → 检查更新"能力：
 * - 更新源按以下优先级解析（二者任一为 example.com 占位地址时仍判定为未配置）：
 *   ① 运行时可配置的 resources/config/update.json
 *      （{ "provider": "generic", "url": "https://..." }；打包后位于
 *      <安装目录>/resources/config/update.json，开发环境位于
 *      <项目根>/resources/config/update.json，路径统一经 getAppResourcesPath 解析）；
 *   ② electron-builder 生成的 app-update.yml（打包）或 dev-app-update.yml（开发）。
 * - 更新源 URL 为占位地址（example.com）或缺失时，诚实返回 not-configured，
 *   弹窗提示"未配置更新源"，绝不假装自动更新（CMP-21）；
 * - 检查到新版本后由 electron-updater 自动下载，下载完成弹窗询问是否重启安装；
 * - 全程 try/catch，异常一律转为用户可见提示，不向菜单分发层抛出。
 */

import { app, dialog, BrowserWindow } from 'electron'
import type { MessageBoxOptions, MessageBoxReturnValue } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as fs from 'fs'
import * as path from 'path'
import { getAppResourcesPath } from './app-paths'
import { logger } from './logger'
import { tMain } from './i18n'

/** 检查更新的结果状态 */
export type UpdateCheckResult =
    | { status: 'not-configured' }
    | { status: 'up-to-date'; version: string }
    | { status: 'update-available'; version: string }
    | { status: 'error'; message: string }

/** update.json 声明的更新源配置（ARC-16：当前仅支持 electron-builder 的 generic provider） */
export interface UpdateJsonConfig {
    provider: 'generic'
    url: string
}

/** 更新源解析来源：运行时 update.json 优先，未配置时回退 electron-builder 的 yml */
export type UpdateSourceOrigin = 'update.json' | 'app-update.yml'

/** 最终生效的更新源 */
export interface ResolvedUpdateSource extends UpdateJsonConfig {
    origin: UpdateSourceOrigin
}

/** 占位地址判定：example.com 为文档示例域名，绝不视作真实更新源 */
const PLACEHOLDER_HOST = 'example.com'

/** resources/config/update.json 相对应用资源目录的路径 */
const UPDATE_JSON_RELATIVE_PATH = path.join('config', 'update.json')

/** 防重入标志：一次只允许一个检查请求进行 */
let checking = false

/** 判断 URL 是否为空或仍为 example.com 占位地址 */
function isPlaceholderUrl(url: string): boolean {
    return url === '' || url.includes(PLACEHOLDER_HOST)
}

/**
 * AS-5：更新源 URL 信任校验（更新链路的完整性边界）。
 *
 * 只接受 https（拒绝明文 http：局域网 MITM 可替换 latest.yml 与安装包，
 * 当前产物无代码签名，等价于远程代码执行）；同时拒绝带 userinfo 的 URL
 * （`https://user:pass@host` 形态可做来源混淆）与非法 URL。
 *
 * 更新源只可能来自两处本地文件（均为运维/打包产物，渲染层无任何运行时改源入口）：
 * 1) resources/config/update.json —— 安装目录内、需要管理员写权限的配置文件；
 * 2) electron-builder 生成的 app-update.yml / dev-app-update.yml —— 打包默认值。
 */
export function isTrustedUpdateSourceUrl(url: unknown): boolean {
    if (typeof url !== 'string') {
        return false
    }
    const trimmed = url.trim()
    if (trimmed === '') {
        return false
    }
    try {
        const parsed = new URL(trimmed)
        if (parsed.protocol !== 'https:') {
            return false
        }
        if (parsed.username !== '' || parsed.password !== '') {
            return false
        }
        return parsed.hostname.length > 0
    } catch {
        return false
    }
}

/**
 * 读取 resources/config/update.json 中的更新源配置（ARC-16/FUN-10/CMP-21）。
 *
 * 打包后路径为 <安装目录>/resources/config/update.json（electron-builder
 * extraResources 的 config 目录），开发环境为 <项目根>/resources/config/update.json。
 * 文件缺失、JSON 损坏、字段缺失、provider 非 generic 或 url 非法时返回 null，
 * 由调用方回退到 electron-builder 生成的 app-update.yml。
 */
export function readUpdateJsonConfig(): UpdateJsonConfig | null {
    const filePath = path.join(getAppResourcesPath(), UPDATE_JSON_RELATIVE_PATH)
    try {
        if (!fs.existsSync(filePath)) {
            // 默认发行包不携带 update.json，属正常情况（回退 app-update.yml）
            return null
        }
        const text = fs.readFileSync(filePath, 'utf-8')
        const parsed: unknown = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object') {
            logger.warn('[auto-updater] update.json 内容不是 JSON 对象，回退 app-update.yml')
            return null
        }
        const record = parsed as Record<string, unknown>
        const provider = typeof record.provider === 'string' ? record.provider.trim() : ''
        const url = typeof record.url === 'string' ? record.url.trim() : ''
        if (provider !== 'generic') {
            logger.warn(
                `[auto-updater] update.json 的 provider "${provider}" 暂不支持（仅 generic），回退 app-update.yml`
            )
            return null
        }
        if (!isTrustedUpdateSourceUrl(url)) {
            logger.warn(
                '[auto-updater] update.json 的 url 缺失或不是合法 https 地址，回退 app-update.yml'
            )
            return null
        }
        return { provider: 'generic', url }
    } catch (error) {
        logger.warn(
            '[auto-updater] 读取 resources/config/update.json 失败，回退 app-update.yml:',
            error
        )
        return null
    }
}

/**
 * 从更新配置文件中解析 publish URL（FUN-10）。
 * 开发模式读取项目根目录的 dev-app-update.yml；
 * 打包后读取安装目录 resources/app-update.yml（electron-builder 构建时按 publish
 * 配置生成，位于 process.resourcesPath 而非 asar 内）。
 * @returns 解析出的更新源 URL；文件缺失或不可读时返回空字符串
 */
function resolveUpdateConfigUrl(): string {
    const candidates: string[] = []
    // 打包安装后 app-update.yml 位于 resources 根目录（与 app.asar 同级）
    if (typeof process.resourcesPath === 'string') {
        candidates.push(path.join(process.resourcesPath, 'app-update.yml'))
    }
    candidates.push(
        path.join(app.getAppPath(), 'app-update.yml'),
        path.join(app.getAppPath(), 'dev-app-update.yml')
    )
    for (const filePath of candidates) {
        try {
            const text = fs.readFileSync(filePath, 'utf-8')
            const match = text.match(/^\s*url:\s*["']?([^"'\r\n]+)/m)
            if (match) {
                return match[1].trim()
            }
        } catch {
            // 文件不存在或不可读，继续尝试下一个候选
        }
    }
    return ''
}

/**
 * 解析最终生效的更新源（ARC-16）：
 * resources/config/update.json 优先；未配置时回退 electron-builder 的
 * app-update.yml（打包）/ dev-app-update.yml（开发）。
 * @returns 解析结果；两处均未配置时返回 null
 */
export function resolveUpdateSource(): ResolvedUpdateSource | null {
    const jsonConfig = readUpdateJsonConfig()
    if (jsonConfig) {
        return { ...jsonConfig, origin: 'update.json' }
    }
    const ymlUrl = resolveUpdateConfigUrl()
    if (ymlUrl !== '') {
        // AS-5：打包默认值同样强制 https（dev-app-update.yml / app-update.yml 由构建配置生成，
        // 但本地文件可能被替换，这里统一做协议校验，非法源按“未配置”处理）
        if (!isTrustedUpdateSourceUrl(ymlUrl)) {
            logger.warn('[auto-updater] app-update.yml 中的更新源不是合法 https 地址，按未配置处理')
            return null
        }
        return { provider: 'generic', url: ymlUrl.trim(), origin: 'app-update.yml' }
    }
    return null
}

/**
 * 判断更新源是否可用（CMP-21）。
 * URL 为空、缺失或仍为 example.com 占位地址时视为未配置。
 */
export function isUpdateSourceConfigured(): boolean {
    const source = resolveUpdateSource()
    return source !== null && !isPlaceholderUrl(source.url)
}

/**
 * 等待更新下载完成或下载失败（FUN-10）。
 * autoDownload 为 true 时 checkForUpdates 只负责发起下载，
 * 下载结果通过 update-downloaded / error 事件异步到达。
 */
function waitForDownloadFinish(): Promise<'downloaded' | 'failed'> {
    return new Promise((resolve) => {
        const onDownloaded = (): void => {
            cleanup()
            resolve('downloaded')
        }
        const onError = (): void => {
            cleanup()
            resolve('failed')
        }
        const cleanup = (): void => {
            autoUpdater.removeListener('update-downloaded', onDownloaded)
            autoUpdater.removeListener('error', onError)
        }
        autoUpdater.on('update-downloaded', onDownloaded)
        autoUpdater.on('error', onError)
    })
}

/**
 * 执行一次更新检查（无 UI 副作用，便于独立测试）。
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
    // CMP-21：占位/缺失更新源时直接返回未配置，不发起虚假检查请求
    const source = resolveUpdateSource()
    if (!source || isPlaceholderUrl(source.url)) {
        return { status: 'not-configured' }
    }
    // AS-5：防御深度——真正注入 feed 前再校验一次（只接受 https，拒绝渲染层/本地文件注入 http 源）
    if (!isTrustedUpdateSourceUrl(source.url)) {
        logger.warn('[auto-updater] 更新源未通过 https 校验，已拒绝检查更新')
        return { status: 'not-configured' }
    }

    try {
        // ARC-16：update.json 声明的更新源需显式注入 electron-updater，
        // 否则其仍会读取 electron-builder 生成的 app-update.yml（例如仍为占位地址）。
        if (source.origin === 'update.json') {
            autoUpdater.setFeedURL({ provider: 'generic', url: source.url })
        }

        // 开发模式下 electron-updater 默认拒绝检查；显式打开开关以便配置真实
        // 更新源后可在 dev 环境联调（electron-updater 官方支持的行为，非假装更新）
        autoUpdater.forceDevUpdateConfig = true

        const downloadFinish = waitForDownloadFinish()
        const result = await autoUpdater.checkForUpdates()

        if (!result) {
            // null 表示服务端确认当前已是最新版本
            return { status: 'up-to-date', version: app.getVersion() }
        }

        const outcome = await downloadFinish
        if (outcome === 'failed') {
            return { status: 'error', message: tMain('mainMsg.update.downloadFailed') }
        }
        return { status: 'update-available', version: result.updateInfo.version }
    } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
}

/** 弹出更新结果对话框（统一入口，兼容有无父窗口） */
function showUpdateDialog(
    win: BrowserWindow | undefined,
    options: MessageBoxOptions
): Promise<MessageBoxReturnValue> {
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)
}

/**
 * 菜单"检查更新"入口：执行检查并弹出结果对话框（FUN-10）。
 * 结果分四类：未配置更新源 / 已是最新 / 发现新版本（询问重启安装） / 检查失败。
 */
export async function checkForUpdatesAndNotify(
    mainWindow: BrowserWindow | undefined
): Promise<void> {
    if (checking) {
        // 已有检查在进行中，忽略重复请求
        return
    }
    checking = true
    try {
        const result = await checkForUpdates()
        switch (result.status) {
            case 'not-configured':
                await showUpdateDialog(mainWindow, {
                    type: 'info',
                    title: tMain('mainMsg.update.title'),
                    message: tMain('mainMsg.update.notConfiguredMessage'),
                    detail: tMain('mainMsg.update.notConfiguredDetail')
                })
                break

            case 'up-to-date':
                await showUpdateDialog(mainWindow, {
                    type: 'info',
                    title: tMain('mainMsg.update.title'),
                    message: tMain('mainMsg.update.upToDateMessage'),
                    detail: tMain('mainMsg.update.upToDateDetail', { version: result.version })
                })
                break

            case 'update-available': {
                const choice = await showUpdateDialog(mainWindow, {
                    type: 'info',
                    title: tMain('mainMsg.update.title'),
                    message: tMain('mainMsg.update.availableMessage', { version: result.version }),
                    detail: tMain('mainMsg.update.availableDetail'),
                    buttons: [tMain('mainMsg.update.restartNow'), tMain('mainMsg.update.later')],
                    defaultId: 0,
                    cancelId: 1
                })
                if (choice.response === 0) {
                    // 重启并安装已下载的更新（electron-updater 标准流程）
                    autoUpdater.quitAndInstall()
                }
                break
            }

            case 'error':
                await showUpdateDialog(mainWindow, {
                    type: 'error',
                    title: tMain('mainMsg.update.title'),
                    message: tMain('mainMsg.update.failedMessage'),
                    detail: result.message
                })
                break
        }
    } catch (error) {
        // 兜底：任何异常都转为对话框提示，不向菜单分发层抛出
        try {
            await showUpdateDialog(mainWindow, {
                type: 'error',
                title: tMain('mainMsg.update.title'),
                message: tMain('mainMsg.update.failedMessage'),
                detail: error instanceof Error ? error.message : String(error)
            })
        } catch (dialogError) {
            logger.error('[auto-updater] 弹出更新结果对话框失败:', dialogError)
        }
    } finally {
        checking = false
    }
}
