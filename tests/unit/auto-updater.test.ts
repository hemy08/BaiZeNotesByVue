/**
 * auto-updater.ts 单元测试（ARC-16 / FUN-10 / CMP-21）
 *
 * 覆盖：
 * - resources/config/update.json 的读取与防御性校验（缺失 / JSON 损坏 / provider / url 非法）；
 * - 更新源优先级：update.json 优先，缺失时回退 electron-builder 的 dev-app-update.yml；
 * - example.com 占位地址仍判定为"未配置"，绝不假装自动更新；
 * - update.json 生效时经 autoUpdater.setFeedURL 显式注入更新源；
 * - 检查更新的结果状态（not-configured / up-to-date / update-available）；
 * - "检查更新"入口未配置时的诚实提示文案；
 * - P2 F-05：下载等待超时（10 分钟）→ 明确的「下载超时」失败状态并清理监听；
 * - P1 F-01：安装前置协调（未保存修改 save / discard / cancel 三分支、保存失败不安装、
 *   安装期间置 update.installing、取消后保留「已下载待安装」可重试）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// CMP-30：更新提示经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

const electronState = vi.hoisted(() => ({
    appPath: '',
    version: '1.2.2'
}))

vi.mock('electron', () => ({
    app: {
        getAppPath: () => electronState.appPath,
        getVersion: () => electronState.version,
        get isPackaged() {
            return false
        }
    },
    BrowserWindow: class {}
}))

/**
 * 2026-11-21（应用内消息/确认对话框通用服务）：更新结果提示改走 showAppMessageBox，
 * 这里注入替身断言「文案/按钮/父窗口/选择语义」接线（服务自身行为由
 * tests/unit/app-message-box.test.ts 覆盖）。
 */
const appMessageMocks = vi.hoisted(() => ({
    showAppMessageBox: vi.fn()
}))
vi.mock('../../src/main/utils/app-message-box', () => appMessageMocks)

/**
 * P1 F-01：安装前置协调依赖的 app-state / close-confirm / SaveActiveFile 全部以 mock 隔离
 * （真实实现分别由 app-state / close-confirm / file-operations 单测覆盖）。
 */
const installMocks = vi.hoisted(() => ({
    isDirty: vi.fn(() => false),
    confirmUnsavedChangesClose: vi.fn(),
    saveActiveFile: vi.fn()
}))

vi.mock('../../src/main/utils/app-state', () => ({
    appState: { isDirty: installMocks.isDirty }
}))

vi.mock('../../src/main/utils/close-confirm', () => ({
    confirmUnsavedChangesClose: installMocks.confirmUnsavedChangesClose
}))

vi.mock('../../src/main/utils/file-utils/file-operations', () => ({
    SaveActiveFile: installMocks.saveActiveFile
}))

const updaterState = vi.hoisted(() => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    return {
        listeners,
        setFeedURL: vi.fn(),
        checkForUpdates: vi.fn(),
        quitAndInstall: vi.fn(),
        forceDevUpdateConfig: false,
        on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
            const arr = listeners.get(event) ?? []
            arr.push(listener)
            listeners.set(event, arr)
        }),
        removeListener: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
            const arr = listeners.get(event) ?? []
            listeners.set(
                event,
                arr.filter((item) => item !== listener)
            )
        }),
        emit(event: string): void {
            for (const listener of listeners.get(event) ?? []) {
                listener()
            }
        }
    }
})

vi.mock('electron-updater', () => ({ autoUpdater: updaterState }))

import {
    readUpdateJsonConfig,
    resolveUpdateSource,
    isUpdateSourceConfigured,
    checkForUpdates,
    checkForUpdatesAndNotify,
    getPendingInstallVersion,
    isTrustedUpdateSourceUrl,
    resetUpdateInstallStateForTesting,
    UPDATE_DOWNLOAD_TIMEOUT_MS,
    INSTALL_FLAG_SAFETY_RESET_MS
} from '../../src/main/utils/auto-updater'
import { getAppContext } from '../../src/main/app-context'

/** 每个用例独立的应用根目录（模拟开发模式 app.getAppPath()） */
let appRoot = ''
/** resources/config 目录 */
let resourcesConfigDir = ''

/** 写入 resources/config/update.json */
function writeUpdateJson(content: string): void {
    fs.writeFileSync(path.join(resourcesConfigDir, 'update.json'), content, 'utf-8')
}

/** 写入项目根 dev-app-update.yml（模拟 electron-builder 回退源） */
function writeDevUpdateYml(url: string): void {
    fs.writeFileSync(
        path.join(appRoot, 'dev-app-update.yml'),
        `provider: generic\nurl: ${url}\n`,
        'utf-8'
    )
}

beforeEach(() => {
    appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-auto-updater-'))
    resourcesConfigDir = path.join(appRoot, 'resources', 'config')
    fs.mkdirSync(resourcesConfigDir, { recursive: true })
    electronState.appPath = appRoot
    electronState.version = '1.2.2'
    // 更新结果提示默认选择「立即重启安装」（仅显式声明的用例改变选择）
    appMessageMocks.showAppMessageBox.mockReset()
    appMessageMocks.showAppMessageBox.mockResolvedValue({ choiceId: 'restart', canceled: false })

    updaterState.listeners.clear()
    updaterState.setFeedURL.mockReset()
    updaterState.checkForUpdates.mockReset()
    updaterState.quitAndInstall.mockReset()
    updaterState.on.mockClear()
    updaterState.removeListener.mockClear()
    updaterState.forceDevUpdateConfig = false

    // P1 F-01：安装前置协调默认「无未保存修改」，确认框返回取消（仅显式声明的用例改变）
    installMocks.isDirty.mockReset()
    installMocks.isDirty.mockReturnValue(false)
    installMocks.confirmUnsavedChangesClose.mockReset()
    installMocks.confirmUnsavedChangesClose.mockResolvedValue('cancel')
    installMocks.saveActiveFile.mockReset()
    installMocks.saveActiveFile.mockResolvedValue(true)
    // 模块级「已下载待安装」/安装中标志复位，保证用例隔离
    resetUpdateInstallStateForTesting()

    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete (process as { resourcesPath?: string }).resourcesPath
    fs.rmSync(appRoot, { recursive: true, force: true })
})

describe('readUpdateJsonConfig', () => {
    it('should return null when update.json is missing', () => {
        expect(readUpdateJsonConfig()).toBeNull()
    })

    it('should parse a valid generic update.json', () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        expect(readUpdateJsonConfig()).toEqual({
            provider: 'generic',
            url: 'https://updates.baize.test/app/'
        })
    })

    it('should reject broken JSON / unsupported provider / invalid url', () => {
        writeUpdateJson('{ 这不是合法 JSON')
        expect(readUpdateJsonConfig()).toBeNull()

        writeUpdateJson('{ "provider": "github", "url": "https://updates.baize.test/app/" }')
        expect(readUpdateJsonConfig()).toBeNull()

        writeUpdateJson('{ "provider": "generic", "url": "ftp://updates.baize.test/app/" }')
        expect(readUpdateJsonConfig()).toBeNull()

        writeUpdateJson('{ "provider": "generic" }')
        expect(readUpdateJsonConfig()).toBeNull()
    })

    it('should resolve the packaged-config path under resources/config', () => {
        // 路径由 getAppResourcesPath 统一解析：开发环境 = <appPath>/resources
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        expect(fs.existsSync(path.join(resourcesConfigDir, 'update.json'))).toBe(true)
        expect(readUpdateJsonConfig()).not.toBeNull()
    })
})

describe('resolveUpdateSource / isUpdateSourceConfigured', () => {
    it('should prefer update.json over dev-app-update.yml', () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        writeDevUpdateYml('https://fallback.baize.test/app/')
        expect(resolveUpdateSource()).toEqual({
            provider: 'generic',
            url: 'https://updates.baize.test/app/',
            origin: 'update.json'
        })
        expect(isUpdateSourceConfigured()).toBe(true)
    })

    it('should fall back to dev-app-update.yml when update.json is missing', () => {
        writeDevUpdateYml('https://fallback.baize.test/app/')
        expect(resolveUpdateSource()).toEqual({
            provider: 'generic',
            url: 'https://fallback.baize.test/app/',
            origin: 'app-update.yml'
        })
        expect(isUpdateSourceConfigured()).toBe(true)
    })

    it('should fall back to <resourcesPath>/app-update.yml in a packaged app', () => {
        const resourcesRoot = path.join(appRoot, 'installed-resources')
        fs.mkdirSync(resourcesRoot, { recursive: true })
        fs.writeFileSync(
            path.join(resourcesRoot, 'app-update.yml'),
            'provider: generic\nurl: https://packaged.baize.test/app/\n',
            'utf-8'
        )
        ;(process as { resourcesPath?: string }).resourcesPath = resourcesRoot

        expect(resolveUpdateSource()).toEqual({
            provider: 'generic',
            url: 'https://packaged.baize.test/app/',
            origin: 'app-update.yml'
        })
    })

    it('should still treat example.com placeholder as not configured (CMP-21)', () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://example.com/auto-updates" }')
        writeDevUpdateYml('https://example.com/auto-updates')
        expect(isUpdateSourceConfigured()).toBe(false)
    })

    it('should report not configured when nothing is configured', () => {
        expect(resolveUpdateSource()).toBeNull()
        expect(isUpdateSourceConfigured()).toBe(false)
    })

    // AS-5：更新链路只接受 https 源（http 明文可被 LAN MITM 替换 latest.yml/安装包）
    it('should reject a plain http update.json source (AS-5)', () => {
        writeUpdateJson('{ "provider": "generic", "url": "http://updates.baize.test/app/" }')
        expect(readUpdateJsonConfig()).toBeNull()
        expect(resolveUpdateSource()).toBeNull()
        expect(isUpdateSourceConfigured()).toBe(false)
    })

    it('should reject a plain http app-update.yml fallback source (AS-5)', () => {
        writeDevUpdateYml('http://fallback.baize.test/app/')
        expect(resolveUpdateSource()).toBeNull()
        expect(isUpdateSourceConfigured()).toBe(false)
    })

    it('should reject update sources containing credentials (AS-5)', () => {
        writeUpdateJson(
            '{ "provider": "generic", "url": "https://user:pass@updates.baize.test/app/" }'
        )
        expect(readUpdateJsonConfig()).toBeNull()
    })

    it('should prefer a valid https update.json over an invalid http yml (AS-5)', () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        writeDevUpdateYml('http://fallback.baize.test/app/')
        expect(isUpdateSourceConfigured()).toBe(true)
        expect(resolveUpdateSource()?.origin).toBe('update.json')
    })
})

describe('checkForUpdates', () => {
    it('should return not-configured without touching electron-updater', async () => {
        await expect(checkForUpdates()).resolves.toEqual({ status: 'not-configured' })
        expect(updaterState.checkForUpdates).not.toHaveBeenCalled()
    })

    // AS-5：http 源在检查入口即被拒绝，绝不注入 feed（防止明文更新通道）
    it('should reject an http-only update source without touching electron-updater (AS-5)', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "http://updates.baize.test/app/" }')
        writeDevUpdateYml('http://fallback.baize.test/app/')

        await expect(checkForUpdates()).resolves.toEqual({ status: 'not-configured' })
        expect(updaterState.setFeedURL).not.toHaveBeenCalled()
        expect(updaterState.checkForUpdates).not.toHaveBeenCalled()
    })

    it('should inject the update.json source via setFeedURL and report up-to-date', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        updaterState.checkForUpdates.mockResolvedValue(null)

        await expect(checkForUpdates()).resolves.toEqual({
            status: 'up-to-date',
            version: '1.2.2'
        })
        expect(updaterState.setFeedURL).toHaveBeenCalledWith({
            provider: 'generic',
            url: 'https://updates.baize.test/app/'
        })
        expect(updaterState.forceDevUpdateConfig).toBe(true)
    })

    it('should report update-available after the update is downloaded', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        updaterState.checkForUpdates.mockImplementation(async () => {
            // 下载完成事件在 checkForUpdates 返回后异步到达
            queueMicrotask(() => updaterState.emit('update-downloaded'))
            return { updateInfo: { version: '1.3.0' } }
        })

        await expect(checkForUpdates()).resolves.toEqual({
            status: 'update-available',
            version: '1.3.0'
        })
    })

    it('should not inject feed URL when the fallback yml source is used', async () => {
        writeDevUpdateYml('https://fallback.baize.test/app/')
        updaterState.checkForUpdates.mockResolvedValue(null)

        await expect(checkForUpdates()).resolves.toEqual({
            status: 'up-to-date',
            version: '1.2.2'
        })
        expect(updaterState.setFeedURL).not.toHaveBeenCalled()
    })
})

describe('checkForUpdatesAndNotify', () => {
    it('should honestly prompt not-configured and point to update.json', async () => {
        await checkForUpdatesAndNotify(undefined)

        expect(appMessageMocks.showAppMessageBox).toHaveBeenCalledTimes(1)
        const options = appMessageMocks.showAppMessageBox.mock.calls[0][0] as {
            message: string
            detail: string
        }
        expect(options.message).toBe('未配置更新源')
        expect(options.detail).toContain('resources/config/update.json')
    })
})

// ---------------------------------------------------------------------------
// P2 F-05：下载等待超时
// ---------------------------------------------------------------------------

describe('download timeout (P2 F-05)', () => {
    it('should time out waiting for the download and report a dedicated message', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        updaterState.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.3.0' } })
        vi.useFakeTimers()

        const pending = checkForUpdates()
        await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_TIMEOUT_MS)

        await expect(pending).resolves.toEqual({
            status: 'error',
            message: '新版本下载超时，请检查网络后重试'
        })
        // 超时后监听器与计时器已清理（避免事件监听/计时器累积）
        expect(updaterState.listeners.get('update-downloaded') ?? []).toHaveLength(0)
        expect(updaterState.listeners.get('error') ?? []).toHaveLength(0)
    })

    it('should not report a timeout once the download finishes normally', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        updaterState.checkForUpdates.mockImplementation(async () => {
            queueMicrotask(() => updaterState.emit('update-downloaded'))
            return { updateInfo: { version: '1.3.0' } }
        })
        vi.useFakeTimers()

        const pending = checkForUpdates()
        await vi.advanceTimersByTimeAsync(0)
        await expect(pending).resolves.toEqual({ status: 'update-available', version: '1.3.0' })
        // 已正常结束：再推进 10 分钟也不应产生任何副作用/未清理计时器
        await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_TIMEOUT_MS)
        expect(updaterState.listeners.get('update-downloaded') ?? []).toHaveLength(0)
    })

    it('should clean up the download waiter when the app is already up to date', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        updaterState.checkForUpdates.mockResolvedValue(null)

        await expect(checkForUpdates()).resolves.toEqual({
            status: 'up-to-date',
            version: '1.2.2'
        })
        // 「已是最新」无需等待下载：监听器已清理，不残留 10 分钟计时器/事件监听
        expect(updaterState.listeners.get('update-downloaded') ?? []).toHaveLength(0)
        expect(updaterState.listeners.get('error') ?? []).toHaveLength(0)
    })
})

// ---------------------------------------------------------------------------
// P1 F-01：更新安装 × 未保存关闭确认的前置协调
// ---------------------------------------------------------------------------

/** 让「检查更新」返回 update-available（下载完成事件在 checkForUpdates 返回后到达） */
function mockUpdateAvailable(): void {
    writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
    updaterState.checkForUpdates.mockImplementation(async () => {
        queueMicrotask(() => updaterState.emit('update-downloaded'))
        return { updateInfo: { version: '1.3.0' } }
    })
}

/** 取最近一次应用内消息框参数 */
function lastMessageOptions(): {
    message?: string
    detail?: string
    buttons?: Array<{ id: string; label: string }>
} {
    const calls = appMessageMocks.showAppMessageBox.mock.calls
    return (calls[calls.length - 1]?.[0] ?? {}) as {
        message?: string
        detail?: string
        buttons?: Array<{ id: string; label: string }>
    }
}

describe('install coordination with unsaved changes (P1 F-01)', () => {
    beforeEach(() => {
        mockUpdateAvailable()
        // 第一层对话框「立即重启安装 / 稍后」默认选择安装（beforeEach 已设默认 restart）
    })

    it('should install directly when the active file is clean', async () => {
        await checkForUpdatesAndNotify(undefined)

        expect(installMocks.confirmUnsavedChangesClose).not.toHaveBeenCalled()
        expect(updaterState.quitAndInstall).toHaveBeenCalledTimes(1)
        // 安装前置位专用标志：before-quit 不再重复弹未保存确认
        expect(getAppContext().update.installing).toBe(true)
        expect(getPendingInstallVersion()).toBeNull()
    })

    it('should save first and then install when the user chooses save', async () => {
        installMocks.isDirty.mockReturnValue(true)
        installMocks.confirmUnsavedChangesClose.mockResolvedValue('save')
        installMocks.saveActiveFile.mockResolvedValue(true)

        await checkForUpdatesAndNotify(undefined)

        expect(installMocks.confirmUnsavedChangesClose).toHaveBeenCalledTimes(1)
        expect(installMocks.saveActiveFile).toHaveBeenCalledTimes(1)
        expect(updaterState.quitAndInstall).toHaveBeenCalledTimes(1)
        expect(getAppContext().update.installing).toBe(true)
    })

    it('should install without saving when the user discards changes', async () => {
        installMocks.isDirty.mockReturnValue(true)
        installMocks.confirmUnsavedChangesClose.mockResolvedValue('discard')

        await checkForUpdatesAndNotify(undefined)

        expect(installMocks.saveActiveFile).not.toHaveBeenCalled()
        expect(updaterState.quitAndInstall).toHaveBeenCalledTimes(1)
        expect(getPendingInstallVersion()).toBeNull()
    })

    it('should NOT install and keep the update pending when the user cancels', async () => {
        installMocks.isDirty.mockReturnValue(true)
        installMocks.confirmUnsavedChangesClose.mockResolvedValue('cancel')

        await checkForUpdatesAndNotify(undefined)

        // 取消：安装器绝不启动，应用保持运行，更新回到「已下载待安装」
        expect(updaterState.quitAndInstall).not.toHaveBeenCalled()
        expect(installMocks.saveActiveFile).not.toHaveBeenCalled()
        expect(getAppContext().update.installing).toBe(false)
        expect(getPendingInstallVersion()).toBe('1.3.0')
    })

    it('should NOT install and notify when saving before install fails', async () => {
        installMocks.isDirty.mockReturnValue(true)
        installMocks.confirmUnsavedChangesClose.mockResolvedValue('save')
        installMocks.saveActiveFile.mockResolvedValue(false)

        await checkForUpdatesAndNotify(undefined)

        expect(updaterState.quitAndInstall).not.toHaveBeenCalled()
        expect(getAppContext().update.installing).toBe(false)
        // 保存失败：保留「已下载待安装」可重试，并给出明确错误提示
        expect(getPendingInstallVersion()).toBe('1.3.0')
        expect(lastMessageOptions().message).toBe('保存未完成的修改失败，本次更新安装已取消')
    })

    it('should keep the update pending when the user chooses later', async () => {
        appMessageMocks.showAppMessageBox.mockResolvedValue({ choiceId: 'later', canceled: true })

        await checkForUpdatesAndNotify(undefined)

        expect(updaterState.quitAndInstall).not.toHaveBeenCalled()
        expect(getPendingInstallVersion()).toBe('1.3.0')
    })

    it('should retry the pending update without a new network check', async () => {
        // 第一次：取消安装 → 保留待安装状态
        installMocks.isDirty.mockReturnValue(true)
        installMocks.confirmUnsavedChangesClose.mockResolvedValue('cancel')
        await checkForUpdatesAndNotify(undefined)
        expect(updaterState.checkForUpdates).toHaveBeenCalledTimes(1)

        // 第二次「帮助 → 检查更新」：直接进入安装询问，不重新检查/下载
        installMocks.isDirty.mockReturnValue(false)
        appMessageMocks.showAppMessageBox.mockClear()
        appMessageMocks.showAppMessageBox.mockResolvedValue({
            choiceId: 'restart',
            canceled: false
        })
        await checkForUpdatesAndNotify(undefined)

        expect(updaterState.checkForUpdates).toHaveBeenCalledTimes(1)
        expect(updaterState.quitAndInstall).toHaveBeenCalledTimes(1)
        expect(getPendingInstallVersion()).toBeNull()
    })

    it('should reset the installing flag and report an error when quitAndInstall throws', async () => {
        updaterState.quitAndInstall.mockImplementation(() => {
            throw new Error('installer failed')
        })

        await checkForUpdatesAndNotify(undefined)

        expect(getAppContext().update.installing).toBe(false)
        expect(lastMessageOptions().message).toBe('检查更新失败')
        expect(lastMessageOptions().detail).toContain('installer failed')
        // 安装失败仍保留已下载更新，可重试
        expect(getPendingInstallVersion()).toBe('1.3.0')
    })

    // 防御深度：quitAndInstall 未触发 app.quit（安装器无法启动等）时，安装标志必须兜底复位，
    // 否则后续每次退出都会跳过未保存确认（数据安全回归）。
    it('should reset the installing flag if the app does not quit after triggering install', async () => {
        vi.useFakeTimers()

        const pending = checkForUpdatesAndNotify(undefined)
        await vi.advanceTimersByTimeAsync(0)
        await pending
        expect(updaterState.quitAndInstall).toHaveBeenCalledTimes(1)
        expect(getAppContext().update.installing).toBe(true)

        await vi.advanceTimersByTimeAsync(INSTALL_FLAG_SAFETY_RESET_MS)
        expect(getAppContext().update.installing).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// 覆盖率补测第五批（fix-cov5）：auto-updater 剩余边界分支
// ---------------------------------------------------------------------------

describe('isTrustedUpdateSourceUrl 边界（AS-5）', () => {
    it('非字符串 / 空串 / 空白串一律拒绝', () => {
        expect(isTrustedUpdateSourceUrl(undefined)).toBe(false)
        expect(isTrustedUpdateSourceUrl(42)).toBe(false)
        expect(isTrustedUpdateSourceUrl('')).toBe(false)
        expect(isTrustedUpdateSourceUrl('   ')).toBe(false)
    })

    it('非 https / 含 userinfo / 非法 URL 拒绝，合法 https 通过', () => {
        expect(isTrustedUpdateSourceUrl('http://updates.baize.test/app/')).toBe(false)
        expect(isTrustedUpdateSourceUrl('https://user:pass@updates.baize.test/')).toBe(false)
        expect(isTrustedUpdateSourceUrl('not a url')).toBe(false)
        expect(isTrustedUpdateSourceUrl('https://updates.baize.test/app/')).toBe(true)
    })
})

describe('readUpdateJsonConfig 非对象内容兜底', () => {
    it('JSON 标量 / 数组 / null 均回退 app-update.yml（返回 null 并告警）', () => {
        writeUpdateJson('null')
        expect(readUpdateJsonConfig()).toBeNull()
        writeUpdateJson('[1,2,3]')
        expect(readUpdateJsonConfig()).toBeNull()
        writeUpdateJson('"https://updates.baize.test/"')
        expect(readUpdateJsonConfig()).toBeNull()
    })
})

describe('checkForUpdates 失败与下载失败事件', () => {
    it('检查阶段抛错时清理下载监听并返回 error 状态', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        updaterState.checkForUpdates.mockRejectedValue(new Error('network down'))

        await expect(checkForUpdates()).resolves.toEqual({
            status: 'error',
            message: expect.stringContaining('network down')
        })
        // 等待器已取消：不残留下载监听器
        expect(updaterState.listeners.get('update-downloaded') ?? []).toHaveLength(0)
        expect(updaterState.listeners.get('error') ?? []).toHaveLength(0)
    })

    it('下载过程 error 事件 → 下载失败状态（先到先得，后续事件忽略）', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        updaterState.checkForUpdates.mockImplementation(async () => {
            queueMicrotask(() => {
                updaterState.emit('error')
                // 已 settle 后到达的 update-downloaded 不应改写结果（settle 防重入）
                updaterState.emit('update-downloaded')
            })
            return { updateInfo: { version: '1.3.0' } }
        })

        await expect(checkForUpdates()).resolves.toEqual({
            status: 'error',
            message: '新版本下载失败，请检查网络后重试'
        })
    })
})

describe('checkForUpdatesAndNotify 结果对话框分支', () => {
    it('已是最新版本时弹「已是最新」提示', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        updaterState.checkForUpdates.mockResolvedValue(null)

        await checkForUpdatesAndNotify(undefined)

        const options = lastMessageOptions()
        expect(options.message).toBe('已是最新版本')
        expect(options.detail).toContain('1.2.2')
    })

    it('检查失败（error 状态）时弹「检查更新失败」提示', async () => {
        writeUpdateJson('{ "provider": "generic", "url": "https://updates.baize.test/app/" }')
        updaterState.checkForUpdates.mockRejectedValue(new Error('boom'))

        await checkForUpdatesAndNotify(undefined)

        const options = lastMessageOptions()
        expect(options.message).toBe('检查更新失败')
        expect(options.detail).toContain('boom')
    })

    it('传入主窗口时以窗口为父窗口展示应用内消息框', async () => {
        const mainWindow = {} as Electron.BrowserWindow
        await checkForUpdatesAndNotify(mainWindow)
        expect(appMessageMocks.showAppMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({ message: '未配置更新源', parentWindow: mainWindow })
        )
    })

    it('检查进行中时重复请求被忽略（checking 防重入）', async () => {
        let resolveMessage: (value: { choiceId: string; canceled: boolean }) => void = () =>
            undefined
        appMessageMocks.showAppMessageBox.mockReturnValue(
            new Promise<{ choiceId: string; canceled: boolean }>((resolve) => {
                resolveMessage = resolve
            })
        )

        const first = checkForUpdatesAndNotify(undefined)
        await Promise.resolve()
        // 第一次仍停留在结果提示：第二次请求直接返回、不重复弹框
        await expect(checkForUpdatesAndNotify(undefined)).resolves.toBeUndefined()
        expect(appMessageMocks.showAppMessageBox).toHaveBeenCalledTimes(1)

        resolveMessage({ choiceId: 'ok', canceled: false })
        await first
    })

    it('结果提示自身抛错时静默兜底，不向上抛出', async () => {
        appMessageMocks.showAppMessageBox.mockRejectedValue(new Error('dialog destroyed'))
        await expect(checkForUpdatesAndNotify(undefined)).resolves.toBeUndefined()
        // 外层 catch 再次尝试错误提示，同样失败但不抛
        expect(appMessageMocks.showAppMessageBox).toHaveBeenCalledTimes(2)
    })
})

describe('安装标志兜底计时器（P1 F-01 防御深度）', () => {
    it('应用已退出（installing 已复位）时兜底计时器不重复复位', async () => {
        vi.useFakeTimers()
        mockUpdateAvailable()

        const pending = checkForUpdatesAndNotify(undefined)
        await vi.advanceTimersByTimeAsync(0)
        await pending
        expect(getAppContext().update.installing).toBe(true)

        // 模拟应用已在兜底期限前退出：标志已复位，计时器到点不应再告警/改写
        getAppContext().update.installing = false
        await vi.advanceTimersByTimeAsync(INSTALL_FLAG_SAFETY_RESET_MS)
        expect(getAppContext().update.installing).toBe(false)
    })
})
