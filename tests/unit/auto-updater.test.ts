/**
 * auto-updater.ts 单元测试（ARC-16 / FUN-10 / CMP-21）
 *
 * 覆盖：
 * - resources/config/update.json 的读取与防御性校验（缺失 / JSON 损坏 / provider / url 非法）；
 * - 更新源优先级：update.json 优先，缺失时回退 electron-builder 的 dev-app-update.yml；
 * - example.com 占位地址仍判定为"未配置"，绝不假装自动更新；
 * - update.json 生效时经 autoUpdater.setFeedURL 显式注入更新源；
 * - 检查更新的结果状态（not-configured / up-to-date / update-available）；
 * - "检查更新"入口未配置时的诚实提示文案。
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
    version: '1.2.2',
    dialogShowMessageBox: vi.fn()
}))

vi.mock('electron', () => ({
    app: {
        getAppPath: () => electronState.appPath,
        getVersion: () => electronState.version,
        get isPackaged() {
            return false
        }
    },
    dialog: { showMessageBox: electronState.dialogShowMessageBox },
    BrowserWindow: class {}
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
    checkForUpdatesAndNotify
} from '../../src/main/utils/auto-updater'

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
    electronState.dialogShowMessageBox.mockReset()
    electronState.dialogShowMessageBox.mockResolvedValue({ response: 1 })

    updaterState.listeners.clear()
    updaterState.setFeedURL.mockReset()
    updaterState.checkForUpdates.mockReset()
    updaterState.quitAndInstall.mockReset()
    updaterState.on.mockClear()
    updaterState.removeListener.mockClear()
    updaterState.forceDevUpdateConfig = false

    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
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

        expect(electronState.dialogShowMessageBox).toHaveBeenCalledTimes(1)
        const options = electronState.dialogShowMessageBox.mock.calls[0][0] as {
            message: string
            detail: string
        }
        expect(options.message).toBe('未配置更新源')
        expect(options.detail).toContain('resources/config/update.json')
    })
})
