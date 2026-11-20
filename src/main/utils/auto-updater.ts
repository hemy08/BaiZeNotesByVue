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
 * - 下载等待带 10 分钟超时（P2 F-05）：网络断流/下载停滞时不再永久挂起，超时转为
 *   明确的「下载超时」失败提示，checking 标志随 Promise 结束复位；
 * - 安装前置协调（P1 F-01）：安装前先处理未保存修改（保存成功/确认不保存才安装），
 *   取消或保存失败时**不**调用 quitAndInstall，应用保持运行，更新保持「已下载待安装」
 *   可重试；安装期间置 AppContext.update.installing，before-quit 不再重复弹框；
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
// 4.4（M2）：unknown 异常 → 用户可读文案统一归一化
import { toUserError } from './status-notify'
// P1-9（2026-11-20）：更新安装前置协调——安装前先处理未保存修改，取消/保存失败不安装。
// 依赖方向：utils → utils / app-context（叶子模块），不引入 config / ipc 反向依赖。
import { appState } from './app-state'
import { getAppContext } from '../app-context'
import { confirmUnsavedChangesClose } from './close-confirm'
import { SaveActiveFile } from './file-utils/file-operations'

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

/** 下载等待超时（P2 F-05）：10 分钟未收到 update-downloaded / error 视为下载超时 */
export const UPDATE_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

/**
 * 安装标志兜底复位时间（P1 F-01 防御深度）。
 *
 * electron-updater 的 quitAndInstall 在 install() 返回 false 时**不会**调用 app.quit
 * （安装器无法启动等异常场景），此时 AppContext.update.installing 会一直为 true，
 * 导致后续每次退出都跳过未保存确认（数据安全回归）。因此安装发起后启动一个
 * 30s 兜底计时器：应用若仍未退出则复位标志，恢复正常关闭确认协议。
 */
export const INSTALL_FLAG_SAFETY_RESET_MS = 30 * 1000

/**
 * 已下载待安装的更新版本（P1 F-01：安装前置确认取消/保存失败后的「可重试」状态）。
 *
 * - checkForUpdates 返回 update-available（即下载完成）时置位；
 * - 用户在安装前置确认框选择「取消」或保存失败时保留：下次「帮助 → 检查更新」
 *   直接走安装确认，无需重新检查/下载，恢复「已下载待安装」的可重试语义；
 * - quitAndInstall 成功发起后清空（应用即将退出，进程内状态不再有意义）。
 */
let pendingInstallVersion: string | null = null

/** 安装标志兜底复位计时器（unref：不阻止进程退出） */
let installFlagSafetyTimer: (ReturnType<typeof setTimeout> & { unref?: () => void }) | null = null

/** 清理安装标志兜底计时器 */
function clearInstallFlagSafetyTimer(): void {
    if (installFlagSafetyTimer !== null) {
        clearTimeout(installFlagSafetyTimer)
        installFlagSafetyTimer = null
    }
}

/**
 * 安装发起后启动兜底计时器：若应用在限定时间内仍未退出（quitAndInstall 未触发
 * app.quit 的异常路径），复位 update.installing，避免后续退出永久跳过未保存确认。
 */
function scheduleInstallFlagSafetyReset(): void {
    clearInstallFlagSafetyTimer()
    const timer = setTimeout(() => {
        installFlagSafetyTimer = null
        const context = getAppContext()
        if (context.update.installing) {
            logger.warn(
                '[auto-updater] 安装发起后应用未退出，复位安装中标志（避免后续退出跳过未保存确认）'
            )
            context.update.installing = false
        }
    }, INSTALL_FLAG_SAFETY_RESET_MS)
    // 主进程 Node 环境支持 unref；测试/其它实现缺失时按普通计时器处理
    timer.unref?.()
    installFlagSafetyTimer = timer
}

/** 取已下载待安装的更新版本（null = 当前没有待安装更新） */
export function getPendingInstallVersion(): string | null {
    return pendingInstallVersion
}

/**
 * 仅供单测：复位「已下载待安装」与安装中标志，保证用例隔离。
 * 生产路径无需调用（安装成功即退出；安装失败由 catch 复位 installing）。
 */
export function resetUpdateInstallStateForTesting(): void {
    pendingInstallVersion = null
    clearInstallFlagSafetyTimer()
    getAppContext().update.installing = false
}

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

/** 下载等待结果：完成 / 失败事件 / 超时（P2 F-05） */
type DownloadOutcome = 'downloaded' | 'failed' | 'timeout'

/** 下载等待器：Promise 之外额外提供 cancel()，供「无需等待」（已是最新）路径清理监听与计时器 */
interface DownloadWaiter {
    promise: Promise<DownloadOutcome>
    cancel: () => void
}

/**
 * 创建「等待更新下载完成」的监听器（FUN-10 / P2 F-05）。
 *
 * autoDownload 为 true 时 checkForUpdates 只负责发起下载，下载结果通过
 * update-downloaded / error 事件异步到达。网络断流/下载停滞时事件可能永不到达，
 * 因此在 timeoutMs 后主动超时并清理监听器，避免检查更新永久挂起（checking 标志
 * 不复位、后续「帮助 → 检查更新」被静默忽略）。
 */
function createDownloadWaiter(timeoutMs = UPDATE_DOWNLOAD_TIMEOUT_MS): DownloadWaiter {
    let settled = false
    let finish: (outcome: DownloadOutcome) => void = () => {}
    const promise = new Promise<DownloadOutcome>((resolve) => {
        let timeout: ReturnType<typeof setTimeout> | null = null
        function cleanup(): void {
            if (timeout !== null) {
                clearTimeout(timeout)
                timeout = null
            }
            autoUpdater.removeListener('update-downloaded', onDownloaded)
            autoUpdater.removeListener('error', onError)
        }
        function settle(outcome: DownloadOutcome): void {
            if (settled) {
                return
            }
            settled = true
            cleanup()
            resolve(outcome)
        }
        function onDownloaded(): void {
            settle('downloaded')
        }
        function onError(): void {
            settle('failed')
        }
        finish = settle
        autoUpdater.on('update-downloaded', onDownloaded)
        autoUpdater.on('error', onError)
        timeout = setTimeout(() => {
            logger.warn(`[auto-updater] 等待更新下载超时（${timeoutMs}ms），按下载失败处理`)
            settle('timeout')
        }, timeoutMs)
    })
    return {
        promise,
        cancel: () => {
            // 已 settle 时清理逻辑已执行；未 settle 说明本次检查无需等待下载结果
            if (!settled) {
                finish('failed')
            }
        }
    }
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

        // 先注册下载监听（事件可能在 checkForUpdates 返回前后任意时刻到达）
        const downloadWaiter = createDownloadWaiter()
        let result: Awaited<ReturnType<typeof autoUpdater.checkForUpdates>>
        try {
            result = await autoUpdater.checkForUpdates()
        } catch (error) {
            // 检查阶段失败：清理下载等待的监听器与超时计时器后原样抛出（外层统一转文案）
            downloadWaiter.cancel()
            throw error
        }

        if (!result) {
            // null 表示服务端确认当前已是最新版本：无需等待下载，清理等待器
            downloadWaiter.cancel()
            return { status: 'up-to-date', version: app.getVersion() }
        }

        const outcome = await downloadWaiter.promise
        if (outcome === 'timeout') {
            return { status: 'error', message: tMain('mainMsg.update.downloadTimeout') }
        }
        if (outcome === 'failed') {
            return { status: 'error', message: tMain('mainMsg.update.downloadFailed') }
        }
        return { status: 'update-available', version: result.updateInfo.version }
    } catch (error) {
        return { status: 'error', message: toUserError(error) }
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
 * 询问「立即重启安装 / 稍后」；用户选择安装时进入安装前置协调。
 *
 * 抽成独立函数：既用于刚检查到新版本，也用于「已下载待安装」的重试路径
 * （取消安装后再次点击「帮助 → 检查更新」无需重新检查/下载）。
 */
async function promptRestartAndInstall(
    mainWindow: BrowserWindow | undefined,
    version: string
): Promise<void> {
    const choice = await showUpdateDialog(mainWindow, {
        type: 'info',
        title: tMain('mainMsg.update.title'),
        message: tMain('mainMsg.update.availableMessage', { version }),
        detail: tMain('mainMsg.update.availableDetail'),
        buttons: [tMain('mainMsg.update.restartNow'), tMain('mainMsg.update.later')],
        defaultId: 0,
        cancelId: 1
    })
    if (choice.response === 0) {
        await installDownloadedUpdate(mainWindow)
    }
}

/**
 * 安装已下载更新前的协调（P1 F-01：更新安装 × 未保存关闭确认）。
 *
 * 1. dirty 时先弹「保存并关闭 / 不保存 / 取消」确认（本路径应用确实会退出安装，
 *    因此文案使用「关闭」而非托盘「隐藏」）；
 * 2. 保存成功 / 用户选择不保存 → 才调用 quitAndInstall；
 * 3. 用户取消 / 保存失败 → **不安装**，应用保持运行，pendingInstallVersion 保留，
 *    下次「检查更新」可重试；
 * 4. 安装前设置 AppContext.update.installing：安装路径 app.quit() 触发的
 *    before-quit 不再重复弹未保存确认（避免与 before-quit 协议叠加）。
 */
async function installDownloadedUpdate(mainWindow: BrowserWindow | undefined): Promise<void> {
    if (appState.isDirty()) {
        const choice = await confirmUnsavedChangesClose(mainWindow ?? null)
        if (choice === 'cancel') {
            // 用户取消：本次不安装，保持应用运行与「已下载待安装」状态（可重试）
            logger.info('[auto-updater] 用户取消安装更新，保留已下载的更新待后续重试')
            return
        }
        if (choice === 'save' && !(await SaveActiveFile())) {
            // 保存失败/另存为被取消：不安装，避免静默丢内容；更新保持待安装可重试
            logger.warn('[auto-updater] 安装前保存未保存修改失败，已取消本次安装')
            await showUpdateDialog(mainWindow, {
                type: 'error',
                title: tMain('mainMsg.update.title'),
                message: tMain('mainMsg.update.saveBeforeInstallFailedMessage'),
                detail: tMain('mainMsg.update.saveBeforeInstallFailedDetail')
            })
            return
        }
    }
    const context = getAppContext()
    // 专用标志：安装器拉起后 app.quit() 触发的 before-quit 据此跳过未保存确认
    context.update.installing = true
    try {
        // 保存完成/用户确认不保存后，才交给 electron-updater 拉起安装器并退出
        autoUpdater.quitAndInstall()
        pendingInstallVersion = null
        // 防御深度：若 app.quit 未按预期发生（安装器无法启动等），30s 后复位安装标志
        scheduleInstallFlagSafetyReset()
    } catch (error) {
        // quitAndInstall 同步失败（如安装器无法启动）→ 复位标志，保持应用运行并可重试
        context.update.installing = false
        throw error
    }
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
        // P1 F-01 重试路径：存在已下载待安装的更新时，直接进入安装询问，
        // 不重新检查/下载（取消安装或保存失败后更新仍处于「已下载待安装」状态）。
        if (pendingInstallVersion !== null) {
            await promptRestartAndInstall(mainWindow, pendingInstallVersion)
            return
        }
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

            case 'update-available':
                // 下载完成：登记「已下载待安装」状态，再询问是否立即安装
                pendingInstallVersion = result.version
                await promptRestartAndInstall(mainWindow, result.version)
                break

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
                detail: toUserError(error)
            })
        } catch (dialogError) {
            logger.error('[auto-updater] 弹出更新结果对话框失败:', dialogError)
        }
    } finally {
        checking = false
    }
}
