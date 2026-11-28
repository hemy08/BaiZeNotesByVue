/**
 * config-manager.ts 单元测试
 * 覆盖：CONFIG_DIR、读写行为、非法配置名防护（路径逃逸）、
 * 损坏 JSON 容错、目录不可写容错、IPC 处理器注册与路由
 * （P2：CONFIG.DELETE / CONFIG.LIST / CONFIG.ENSURE_DIR 三个死通道及其
 * deleteConfig/listConfigs 实现已删除，对应用例同步移除）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs-extra'

// 测试临时目录（与 electron mock 中保持一致，需放入 vi.hoisted 供 mock 工厂访问）
const hoisted = vi.hoisted(() => {
    return {
        tmpRoot: `${process.env.TEMP || process.env.TMP || '/tmp'}/baize-vitest-config-manager`,
        // 批次 A：#3 开机自启动——OS 登录项实际状态（读取时校正 system.autoStart 显示值）
        loginItem: { openAtLogin: false },
        setLoginItemSettings: vi.fn(),
        getLoginItemSettings: vi.fn(() => hoisted.loginItem)
    }
})

const ipcHandlers = vi.hoisted(() => ({
    map: new Map<string, (...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
            ipcHandlers.map.set(channel, fn)
        })
    },
    app: {
        getPath: vi.fn(() => hoisted.tmpRoot),
        // 批次 A：#3 开机自启动的系统登录项 API
        setLoginItemSettings: hoisted.setLoginItemSettings,
        getLoginItemSettings: hoisted.getLoginItemSettings
    },
    BrowserWindow: { getAllWindows: vi.fn(() => []) }
}))

// ARC-04：config-manager 现在导入 theme-config → theme-registry →
// @electron-toolkit/utils（ESM），未 mock 会真实加载 electron 导致测试崩溃
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

// 配置 store 模块使用内存替身（真实 electron-store 为 ESM 且外部化加载真实 electron）
vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})

// config-manager 的 system/theme 路由导入 file-utils/auto-save 与 logger，
// 两者在模块加载时创建定时器/日志目录，用桩替换保证测试环境干净
vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

// 批次 B：minimizeToTray / useSystemTheme 的主进程副作用模块单独 mock——
// 托盘创建细节由 tray.test.ts 覆盖，系统主题跟随细节由 system-theme.test.ts 覆盖，
// 本文件只验证 config-manager 的调用触发关系（互斥语义落在真实 system store 上）。
vi.mock('../../src/main/utils/tray', () => ({
    ensureTrayCreated: vi.fn()
}))

vi.mock('../../src/main/config/system-theme', () => ({
    applySystemThemeNow: vi.fn()
}))

// 2026-11-19 主题广播收敛：config-manager 的 broadcastThemeConfig 不再自行遍历
// BrowserWindow，改为调用唯一广播实现。本文件只验证「是否走统一函数」及其载荷
// （buildThemeBroadcastPayload 保留真实纯函数实现）；窗口遍历/容错细节由
// theme-broadcast.test.ts 覆盖。
// 2026-11-20（P1-1）：广播实现从 ipc/theme-broadcast 迁到中性层 utils/theme-broadcast。
const broadcastMocks = vi.hoisted(() => ({
    broadcast: vi.fn()
}))

vi.mock('../../src/main/utils/theme-broadcast', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/main/utils/theme-broadcast')>()
    return { ...actual, broadcastThemeToAllWindows: broadcastMocks.broadcast }
})

// 批次 C #8/#9：自动备份定时器同步单独 mock——备份细节由 auto-backup.test.ts 覆盖，
// 本文件只验证 config-manager 保存路径的调用触发关系
vi.mock('../../src/main/utils/auto-backup', () => ({
    syncAutoBackupTimer: vi.fn()
}))

import {
    configManager,
    ensureApprovedWorkspaceRootsInitialized,
    recordRecentFolder,
    registerConfigIpcHandlers,
    resetWorkspaceApprovalSeedForTesting
} from '../../src/main/config/config-manager'
import { ensureTrayCreated } from '../../src/main/utils/tray'
import { applySystemThemeNow } from '../../src/main/config/system-theme'
import { syncAutoBackupTimer } from '../../src/main/utils/auto-backup'
// 2026-11-19：主题广播收敛后的统一广播函数（模块被 mock，仅替换发送端）
import { broadcastThemeToAllWindows } from '../../src/main/utils/theme-broadcast'
// P1-1：config 层经依赖倒置的 provider 调用 IPC 注册台账——单测注入真实台账实现，
// 使 registerConfigIpcHandlers 仍真实注册到 ipcMain（electron mock 捕获），行为不变。
import { setIpcHandleRegistrar } from '../../src/main/utils/ipc-registration'
import { ipcListenerManager } from '../../src/main/ipc/ipc-listener-manager'
import { setTrustedMainWindow, resetTrustedSenderRegistry } from '../../src/main/utils/ipc-security'
import { appState } from '../../src/main/utils/app-state'
import { IPC } from '../../src/shared/ipc-channels'
import { FakeStore } from './helpers/fake-store'
import { logger } from '../../src/main/utils/logger'
// 批次 A：#4 最近文件列表数量——file-state-store 的最近文件存取
import {
    getRecentFiles,
    saveLastOpenedDirectory,
    saveLastOpenedFile
} from '../../src/main/utils/file-state-store'
// P1-1（工作区受信根来源收敛）：受信根集合/播种/写入断言
import {
    getApprovedWorkspaceRootsForTesting,
    resetWorkspaceApprovalsForTesting
} from '../../src/main/utils/workspace-approval'
import { normalizePathForCompare } from '../../src/shared/utils/path'
import * as os from 'os'

// P1/N-05：config:read / config:write 统一校验发送方，测试桩提供受信主窗口与事件。
// 结构优化第 2 批 2.4（M1）：受信主窗口与 appState.mainWindow 同源（AppContext），
// 配置写入的 applySystemSettings 会向该窗口 webContents 注入字体 CSS/广播设置更新，
// 因此桩需提供 send/insertCSS（与真实 BrowserWindow 的最小形状一致）。
const trustedMainWindow = {
    webContents: { id: 1, send: vi.fn(), insertCSS: vi.fn() },
    isDestroyed: () => false
}
const trustedEvent = { sender: trustedMainWindow.webContents }
const foreignEvent = { sender: { id: 999 } }

const CONFIG_DIR = path.join(hoisted.tmpRoot, 'config')

describe('config-manager', () => {
    beforeEach(() => {
        fs.rmSync(hoisted.tmpRoot, { recursive: true, force: true })
        ipcHandlers.map.clear()
        hoisted.loginItem.openAtLogin = false
        hoisted.setLoginItemSettings.mockClear()
        hoisted.getLoginItemSettings.mockClear()
        hoisted.getLoginItemSettings.mockImplementation(() => hoisted.loginItem)
        // 结构优化第 2 批 2.4（M1）：appState._resetForTesting 会整体复位 AppContext
        // （含受信主窗口/受信工作区根），因此必须先复位 appState 再登记受信主窗口，顺序不可交换。
        appState._resetForTesting()
        // P1-1：受信根播种 Promise 按用例复位（否则用例间共享已播种结果）
        resetWorkspaceApprovalSeedForTesting()
        resetWorkspaceApprovalsForTesting()
        resetTrustedSenderRegistry()
        setTrustedMainWindow(trustedMainWindow as never)
        // P1-1：注入真实 IPC 注册台账（config 已不直接 import ipc 层，注册能力经 provider 注入；
        // 生产环境由 ipc/registry.registerPreWindowIpc 在注册前完成同一注入）
        setIpcHandleRegistrar(ipcListenerManager)
        // 清空内存 store，保证 ARC-04 路由测试之间互不影响
        FakeStore.resetAll()
        // 批次 B：清理托盘/系统主题副作用 mock 的调用记录
        vi.mocked(ensureTrayCreated).mockClear()
        vi.mocked(applySystemThemeNow).mockClear()
        // 2026-11-19：主题广播收敛——清理统一广播函数调用记录
        vi.mocked(broadcastThemeToAllWindows).mockClear()
        // 批次 C：清理自动备份定时器同步 mock 的调用记录
        vi.mocked(syncAutoBackupTimer).mockClear()
    })

    describe('CONFIG_DIR', () => {
        it('should be the config subdirectory of userData', () => {
            expect(configManager.CONFIG_DIR).toBe(CONFIG_DIR)
        })
    })

    describe('readConfig / writeConfig roundtrip', () => {
        it('should return null for a missing config', async () => {
            await expect(configManager.readConfig('missing')).resolves.toBeNull()
        })

        it('should roundtrip main-process-written bare-JSON data including unicode', async () => {
            // P1-1：recent-folders 为主进程专属写入（渲染层 config:write 一律拒绝），
            // 主进程内部维护入口 writeConfigFromMainProcess 仍可正常落盘/读取
            const data = ['白泽笔记', 'another-folder']
            await expect(
                configManager.writeConfigFromMainProcess('recent-folders', data)
            ).resolves.toBe(true)
            await expect(configManager.readConfig('recent-folders')).resolves.toEqual(data)
        })

        it('should overwrite an existing config', async () => {
            await configManager.writeConfig('show-welcome', true)
            await configManager.writeConfig('show-welcome', false)
            await expect(configManager.readConfig('show-welcome')).resolves.toBe(false)
        })

        it('should return null when the JSON file is corrupted', async () => {
            await fs.ensureDir(CONFIG_DIR)
            await fs.writeFile(path.join(CONFIG_DIR, 'bad.json'), '{ not valid json', 'utf-8')
            await expect(configManager.readConfig('bad')).resolves.toBeNull()
        })

        it('should return false when the config directory cannot be created', async () => {
            // 让 config 目录位置被普通文件占用，ensureDir 必然失败
            await fs.ensureDir(hoisted.tmpRoot)
            await fs.writeFile(CONFIG_DIR, 'i am a file', 'utf-8')
            await expect(configManager.writeConfig('show-welcome', true)).resolves.toBe(false)
            await expect(configManager.readConfig('show-welcome')).resolves.toBeNull()
        })
    })

    describe('config name validation (path traversal guard)', () => {
        const invalidNames = ['../evil', 'a/b', 'a\\b', '', 'a.b', 'my config', '.hidden']

        it('should reject invalid names for read/write', async () => {
            for (const name of invalidNames) {
                await expect(
                    configManager.readConfig(name),
                    `read ${JSON.stringify(name)}`
                ).resolves.toBeNull()
                await expect(
                    configManager.writeConfig(name, { a: 1 }),
                    `write ${JSON.stringify(name)}`
                ).resolves.toBe(false)
            }
        })

        it('should not create files outside the config directory for traversal names', async () => {
            await configManager.writeConfig('../evil', { a: 1 })
            expect(await fs.pathExists(path.join(hoisted.tmpRoot, 'evil.json'))).toBe(false)
            expect(await fs.pathExists(path.join(CONFIG_DIR, 'evil.json'))).toBe(false)
        })
    })

    describe('IPC handler registration', () => {
        it('should register the two expected channels (P2：删除 3 个死通道)', () => {
            registerConfigIpcHandlers()
            for (const channel of ['baize:config:read', 'baize:config:write']) {
                expect(ipcHandlers.map.has(channel), channel).toBe(true)
            }
            for (const removed of [
                'baize:config:delete',
                'baize:config:list',
                'baize:config:ensure-dir'
            ]) {
                expect(ipcHandlers.map.has(removed), removed).toBe(false)
            }
        })

        it('should route write/read through the registered handlers', async () => {
            registerConfigIpcHandlers()
            const write = ipcHandlers.map.get('baize:config:write')!
            const read = ipcHandlers.map.get('baize:config:read')!

            await expect(write(trustedEvent, 'show-welcome', true)).resolves.toBe(true)
            await expect(read(trustedEvent, 'show-welcome')).resolves.toBe(true)
        })

        it('P1/N-05：非主窗口 sender 的配置读写被拒绝且不执行读写', async () => {
            registerConfigIpcHandlers()
            const write = ipcHandlers.map.get('baize:config:write')!
            const read = ipcHandlers.map.get('baize:config:read')!
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const writeResult = await write(foreignEvent, 'ipc-config', { hello: 'world' })
            const readResult = await read(foreignEvent, 'ipc-config')
            expect(writeResult).toEqual(
                expect.objectContaining({ ok: false, code: 'untrusted-sender' })
            )
            expect(readResult).toEqual(
                expect.objectContaining({ ok: false, code: 'untrusted-sender' })
            )
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should reject invalid names through the IPC handlers', async () => {
            registerConfigIpcHandlers()
            const write = ipcHandlers.map.get('baize:config:write')!
            const read = ipcHandlers.map.get('baize:config:read')!
            await expect(write(trustedEvent, '../escape', { a: 1 })).resolves.toBe(false)
            await expect(read(trustedEvent, '../escape')).resolves.toBeNull()
        })
    })

    describe('ARC-04 store-backed config routing', () => {
        it('should route system config to the main store instead of a bare system.json', async () => {
            registerConfigIpcHandlers()
            const write = ipcHandlers.map.get('baize:config:write')!
            const read = ipcHandlers.map.get('baize:config:read')!

            await expect(
                write(trustedEvent, 'system', {
                    autoSaveEnabled: false,
                    autoSaveInterval: 120,
                    fontFamily: 'Consolas',
                    language: 'en',
                    recentFilesCount: 15
                })
            ).resolves.toBe(true)

            const stored = (await read(trustedEvent, 'system')) as Record<string, unknown>
            expect(stored).toBeTruthy()
            expect(stored.autoSaveEnabled).toBe(false)
            expect(stored.autoSaveInterval).toBe(120)
            expect(stored.fontFamily).toBe('Consolas')
            expect(stored.language).toBe('en')
            // ARC-04：渲染层扩展字段一并持久化到主 store
            expect(stored.recentFilesCount).toBe(15)
            // 不再产生裸 JSON system.json
            expect(await fs.pathExists(path.join(CONFIG_DIR, 'system.json'))).toBe(false)
        })

        it('should read system defaults from the main store when nothing saved yet', async () => {
            registerConfigIpcHandlers()
            const read = ipcHandlers.map.get('baize:config:read')!
            const stored = (await read(trustedEvent, 'system')) as Record<string, unknown>
            // 2026-11-20：自动保存默认关闭（opt-in）
            expect(stored.autoSaveEnabled).toBe(false)
            expect(stored.autoSaveInterval).toBe(60)
            expect(stored.fontFamily).toContain('Microsoft YaHei')
            // AS-9：远程图片隐私开关默认关闭（安全默认）
            expect(stored.allowRemoteImages).toBe(false)
        })

        // P1-FE-06：已接通消费方的设置（语言/菜单栏形态）在写 system 配置后必须广播，
        // 渲染层 i18n（setLocale）与菜单形态（menuBarStyle）才能即时生效。
        it('broadcasts system settings to the main window after writing (language/menuBarStyle live apply)', async () => {
            registerConfigIpcHandlers()
            const write = ipcHandlers.map.get('baize:config:write')!
            const send = vi.fn()
            // M1：appState.mainWindow 与受信主窗口同源（AppContext），sender 校验按
            // webContents 对象/id 严格匹配——桩的 id 必须与 trustedEvent.sender 一致。
            appState.mainWindow = {
                isDestroyed: () => false,
                webContents: { id: 1, send }
            } as never

            await expect(
                write(trustedEvent, 'system', { language: 'en-US', menuBarStyle: 'windows-native' })
            ).resolves.toBe(true)

            expect(send).toHaveBeenCalledWith(
                IPC.SETTING.SYSTEM_SETTING_UPDATE,
                expect.objectContaining({ language: 'en-US', menuBarStyle: 'windows-native' })
            )
            appState.mainWindow = null
        })

        // AS-9：远程图片隐私开关保存后立即落盘并随 system-setting-update 广播，
        // 预览层（MarkdownPreviewComponent）据此即时拦截/放行远程图片（无需重启）。
        it('persists allowRemoteImages and broadcasts it after writing (AS-9)', async () => {
            registerConfigIpcHandlers()
            const write = ipcHandlers.map.get('baize:config:write')!
            const read = ipcHandlers.map.get('baize:config:read')!
            const send = vi.fn()
            // M1：appState.mainWindow 与受信主窗口同源（AppContext），sender 校验按
            // webContents 对象/id 严格匹配——桩的 id 必须与 trustedEvent.sender 一致。
            appState.mainWindow = {
                isDestroyed: () => false,
                webContents: { id: 1, send }
            } as never

            await expect(write(trustedEvent, 'system', { allowRemoteImages: true })).resolves.toBe(
                true
            )

            const stored = (await read(trustedEvent, 'system')) as Record<string, unknown>
            expect(stored.allowRemoteImages).toBe(true)
            expect(send).toHaveBeenCalledWith(
                IPC.SETTING.SYSTEM_SETTING_UPDATE,
                expect.objectContaining({ allowRemoteImages: true })
            )

            // 关闭同样即时生效（广播 false）
            send.mockClear()
            await expect(write(trustedEvent, 'system', { allowRemoteImages: false })).resolves.toBe(
                true
            )
            expect(send).toHaveBeenCalledWith(
                IPC.SETTING.SYSTEM_SETTING_UPDATE,
                expect.objectContaining({ allowRemoteImages: false })
            )
            appState.mainWindow = null
        })

        it('should route theme config to the main store and keep unset fields (ARC-05)', async () => {
            registerConfigIpcHandlers()
            const write = ipcHandlers.map.get('baize:config:write')!
            const read = ipcHandlers.map.get('baize:config:read')!

            await expect(write(trustedEvent, 'theme', { currentTheme: 'dark' })).resolves.toBe(true)
            const stored = (await read(trustedEvent, 'theme')) as Record<string, unknown>
            expect(stored.currentTheme).toBe('dark')
            // 未传字段保留默认值（浅合并，不丢字段）
            expect(stored.separateEditorTheme).toBe(false)
            expect(stored.editorTheme).toBe('vs')
            // 不再产生裸 JSON theme.json
            expect(await fs.pathExists(path.join(CONFIG_DIR, 'theme.json'))).toBe(false)
            // 2026-11-19 广播收敛：主题写入后的广播统一经 ipc/theme-broadcast 的唯一实现，
            // 载荷由 buildThemeBroadcastPayload 组装为 shared ThemeUpdateData 契约形态
            expect(vi.mocked(broadcastThemeToAllWindows)).toHaveBeenCalledTimes(1)
            expect(vi.mocked(broadcastThemeToAllWindows).mock.calls[0][0]).toEqual({
                themeStyles: expect.objectContaining({ name: '深邃夜空' }),
                monacoTheme: 'vs',
                separateEditorTheme: false
            })
        })
    })

    describe('migrateLegacyConfigFiles (ARC-04)', () => {
        it('should merge legacy system.json into the main store once and mark it migrated', async () => {
            await fs.ensureDir(CONFIG_DIR)
            await fs.writeFile(
                path.join(CONFIG_DIR, 'system.json'),
                JSON.stringify({ autoSaveEnabled: false, autoSaveInterval: 90, language: 'en' }),
                'utf-8'
            )

            // 注册 IPC 时自动执行迁移
            registerConfigIpcHandlers()

            // 旧文件被改名标记（保留数据、只迁移一次）
            expect(await fs.pathExists(path.join(CONFIG_DIR, 'system.json'))).toBe(false)
            expect(await fs.pathExists(path.join(CONFIG_DIR, 'system.json.legacy-migrated'))).toBe(
                true
            )

            const read = ipcHandlers.map.get('baize:config:read')!
            const stored = (await read(trustedEvent, 'system')) as Record<string, unknown>
            expect(stored.autoSaveEnabled).toBe(false)
            expect(stored.autoSaveInterval).toBe(90)
            expect(stored.language).toBe('en')
        })

        it('should not re-migrate after the legacy file has been marked', async () => {
            await fs.ensureDir(CONFIG_DIR)
            // 只放已标记文件，无 system.json → 迁移为无操作，且不破坏已标记文件
            await fs.writeFile(
                path.join(CONFIG_DIR, 'system.json.legacy-migrated'),
                JSON.stringify({ autoSaveEnabled: false }),
                'utf-8'
            )
            registerConfigIpcHandlers()
            expect(await fs.pathExists(path.join(CONFIG_DIR, 'system.json.legacy-migrated'))).toBe(
                true
            )
            expect(
                await fs.pathExists(
                    path.join(CONFIG_DIR, 'system.json.legacy-migrated.legacy-migrated')
                )
            ).toBe(false)
        })

        it('P1-FE-05：旧裸 editor.json 映射合并进主进程 editorSetting（不再双轨）', async () => {
            await fs.ensureDir(CONFIG_DIR)
            await fs.writeFile(
                path.join(CONFIG_DIR, 'editor.json'),
                JSON.stringify({
                    fontSize: 19,
                    lineHeight: 1.5,
                    showLineNumbers: false,
                    enableFolding: false
                }),
                'utf-8'
            )

            registerConfigIpcHandlers()

            expect(await fs.pathExists(path.join(CONFIG_DIR, 'editor.json'))).toBe(false)
            expect(await fs.pathExists(path.join(CONFIG_DIR, 'editor.json.legacy-migrated'))).toBe(
                true
            )

            const read = ipcHandlers.map.get('baize:config:read')!
            const stored = (await read(trustedEvent, 'editor')) as Record<string, unknown>
            expect(stored.fontSize).toBe(19)
            expect(stored.lineHeight).toBe(1.5)
            expect(stored.showLineNumbers).toBe(false)
            expect(stored.enableFolding).toBe(false)
        })
    })

    // P1-FE-05：'editor' 配置读写与 Monaco 唯一真源 editorSetting 同源，保存后广播刷新
    describe('P1-FE-05 editor config single-source routing', () => {
        function readChannel() {
            return ipcHandlers.map.get('baize:config:read')!
        }
        function writeChannel() {
            return ipcHandlers.map.get('baize:config:write')!
        }

        it('routes editor writes into the main editorSetting and reads back the dialog shape', async () => {
            registerConfigIpcHandlers()

            await expect(
                writeChannel()(trustedEvent, 'editor', {
                    fontSize: 18,
                    lineHeight: 1.5,
                    showLineNumbers: false,
                    enableFolding: false,
                    enableAutoComplete: false,
                    cursorStyle: 'block',
                    cursorWidth: 3,
                    autoSave: false,
                    autoSaveInterval: 120
                })
            ).resolves.toBe(true)

            const stored = (await readChannel()(trustedEvent, 'editor')) as Record<string, unknown>
            expect(stored.fontSize).toBe(18)
            expect(stored.lineHeight).toBe(1.5)
            expect(stored.showLineNumbers).toBe(false)
            expect(stored.enableFolding).toBe(false)
            expect(stored.enableAutoComplete).toBe(false)
            expect(stored.cursorStyle).toBe('block')
            expect(stored.cursorWidth).toBe(3)

            // 对话框中的自动保存字段并入系统设置（主进程自动保存定时器的唯一来源）
            const system = (await readChannel()(trustedEvent, 'system')) as Record<string, unknown>
            expect(system.autoSaveEnabled).toBe(false)
            expect(system.autoSaveInterval).toBe(120)

            // 唯一真源：不再产生 rendererEditorConfig 双轨键
            expect(FakeStore.data.get('editor-setting')?.has('rendererEditorConfig')).toBe(false)
        })

        it('broadcasts the latest editor setting to the main window after saving', async () => {
            registerConfigIpcHandlers()
            const send = vi.fn()
            // M1：appState.mainWindow 与受信主窗口同源（AppContext），sender 校验按
            // webContents 对象/id 严格匹配——桩的 id 必须与 trustedEvent.sender 一致。
            appState.mainWindow = {
                isDestroyed: () => false,
                webContents: { id: 1, send }
            } as never

            await expect(
                writeChannel()(trustedEvent, 'editor', { fontSize: 22, cursorWidth: 4 })
            ).resolves.toBe(true)

            expect(send).toHaveBeenCalledWith(
                IPC.EDITOR.INIT_SETTING,
                expect.objectContaining({ fontSize: 22, cursorWidth: 4 })
            )
            appState.mainWindow = null
        })
    })

    // P1-FE-06：'backup' 配置名承载备份/恢复命令（复用既有 CONFIG 通道，不新增 IPC 通道）
    describe('P1-FE-06 config backup command routing', () => {
        const STORE_CONFIG_DIR = path.join(hoisted.tmpRoot, '.baizenotes', 'config')

        function readChannel() {
            return ipcHandlers.map.get('baize:config:read')!
        }
        function writeChannel() {
            return ipcHandlers.map.get('baize:config:write')!
        }

        async function seedConfigFiles(): Promise<void> {
            await fs.ensureDir(STORE_CONFIG_DIR)
            await fs.writeJson(path.join(STORE_CONFIG_DIR, 'systemSetting.json'), {
                autoSaveEnabled: false,
                autoSaveInterval: 120
            })
            await fs.writeJson(path.join(STORE_CONFIG_DIR, 'editor-setting.json'), {
                editorSetting: { fontSize: 21, cursorWidth: 3 }
            })
        }

        it('creates a backup and lists it through config:read', async () => {
            await seedConfigFiles()
            registerConfigIpcHandlers()

            await expect(
                writeChannel()(trustedEvent, 'backup', { action: 'create', keep: 5 })
            ).resolves.toBe(true)

            const state = (await readChannel()(trustedEvent, 'backup')) as {
                backups: { name: string; fileCount: number }[]
                latest: string | null
            }
            expect(state.backups).toHaveLength(1)
            expect(state.latest).toBe(state.backups[0].name)
            expect(state.backups[0].fileCount).toBe(2)
            expect(
                await fs.pathExists(
                    path.join(hoisted.tmpRoot, '.baizenotes', 'config-backups', state.latest!)
                )
            ).toBe(true)
        })

        it('restores a backup and re-applies the values into the stores', async () => {
            await seedConfigFiles()
            registerConfigIpcHandlers()
            await writeChannel()(trustedEvent, 'backup', { action: 'create', keep: 5 })
            const state = (await readChannel()(trustedEvent, 'backup')) as { latest: string }

            // 恢复前把配置目录改坏：恢复后应回到备份内容
            await fs.writeJson(path.join(STORE_CONFIG_DIR, 'systemSetting.json'), {
                autoSaveEnabled: true,
                autoSaveInterval: 30
            })
            await fs.writeJson(path.join(STORE_CONFIG_DIR, 'editor-setting.json'), {
                editorSetting: { fontSize: 99 }
            })

            await expect(
                writeChannel()(trustedEvent, 'backup', { action: 'restore', name: state.latest })
            ).resolves.toBe(true)

            const system = (await readChannel()(trustedEvent, 'system')) as Record<string, unknown>
            expect(system.autoSaveEnabled).toBe(false)
            expect(system.autoSaveInterval).toBe(120)

            const editor = (await readChannel()(trustedEvent, 'editor')) as Record<string, unknown>
            expect(editor.fontSize).toBe(21)
            expect(editor.cursorWidth).toBe(3)
        })

        it('rejects path-traversal / unknown / missing backup names', async () => {
            registerConfigIpcHandlers()
            await expect(
                writeChannel()(trustedEvent, 'backup', { action: 'restore', name: '../evil' })
            ).resolves.toBe(false)
            await expect(
                writeChannel()(trustedEvent, 'backup', {
                    action: 'restore',
                    name: 'config-backup-20990101-000000'
                })
            ).resolves.toBe(false)
            await expect(
                writeChannel()(trustedEvent, 'backup', { action: 'drop-everything' })
            ).resolves.toBe(false)
            await expect(writeChannel()(trustedEvent, 'backup', null)).resolves.toBe(false)
        })

        it('prunes old backups down to the requested keep count', async () => {
            await seedConfigFiles()
            registerConfigIpcHandlers()
            await writeChannel()(trustedEvent, 'backup', { action: 'create', keep: 1 })
            await writeChannel()(trustedEvent, 'backup', { action: 'create', keep: 1 })

            const state = (await readChannel()(trustedEvent, 'backup')) as {
                backups: { name: string }[]
            }
            expect(state.backups).toHaveLength(1)
        })
    })

    // AS-4：配置写入白名单 + 字段级 schema 校验
    describe('AS-4 config write whitelist and schema validation', () => {
        let consoleWarn: ReturnType<typeof vi.spyOn>

        beforeEach(() => {
            consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            registerConfigIpcHandlers()
        })

        afterEach(() => {
            consoleWarn.mockRestore()
        })

        function readChannel() {
            return ipcHandlers.map.get('baize:config:read')!
        }
        function writeChannel() {
            return ipcHandlers.map.get('baize:config:write')!
        }

        it('rejects unknown config names (write whitelist)', async () => {
            registerConfigIpcHandlers()
            await expect(writeChannel()(trustedEvent, 'evil-config', { a: 1 })).resolves.toBe(false)
            await expect(writeChannel()(trustedEvent, 'roundtrip', { title: 'x' })).resolves.toBe(
                false
            )
            // 未知名称不落盘
            expect(await fs.pathExists(path.join(CONFIG_DIR, 'evil-config.json'))).toBe(false)
        })

        it('rejects non-object system payloads without throwing', async () => {
            registerConfigIpcHandlers()
            for (const payload of ['string', 42, null, undefined, [1, 2]]) {
                await expect(writeChannel()(trustedEvent, 'system', payload)).resolves.toBe(false)
            }
        })

        it('rejects a CSS-injection fontFamily and keeps the stored value unchanged', async () => {
            await writeChannel()(trustedEvent, 'system', { fontFamily: 'Consolas' })
            const injected = 'x; } body { background: url("https://attacker/t.png") } /*'
            await expect(
                writeChannel()(trustedEvent, 'system', { fontFamily: injected })
            ).resolves.toBe(false)

            const stored = (await readChannel()(trustedEvent, 'system')) as Record<string, unknown>
            expect(stored.fontFamily).toBe('Consolas')
        })

        it('accepts a safe font family list and drops control characters', async () => {
            await expect(
                writeChannel()(trustedEvent, 'system', {
                    fontFamily: '"Microsoft YaHei", -apple-system, "Segoe UI", sans-serif'
                })
            ).resolves.toBe(true)
            const stored = (await readChannel()(trustedEvent, 'system')) as Record<string, unknown>
            expect(stored.fontFamily).toContain('Microsoft YaHei')
        })

        it('clamps out-of-range numeric system settings instead of rejecting', async () => {
            await expect(
                writeChannel()(trustedEvent, 'system', {
                    fontSize: 999,
                    autoSaveInterval: 1,
                    recentFilesCount: 10_000,
                    // P3 对齐：schema 上限与 UI（1~72 / 1~10）一致
                    backupInterval: 720,
                    backupCount: 50
                })
            ).resolves.toBe(true)

            const stored = (await readChannel()(trustedEvent, 'system')) as Record<string, unknown>
            expect(stored.fontSize).toBeLessThanOrEqual(72)
            expect(stored.autoSaveInterval).toBeGreaterThanOrEqual(5)
            expect(stored.recentFilesCount).toBeLessThanOrEqual(100)
            expect(stored.backupInterval).toBeLessThanOrEqual(72)
            expect(stored.backupCount).toBeLessThanOrEqual(10)
        })

        it('drops unknown system fields (no arbitrary key pollution)', async () => {
            await expect(
                writeChannel()(trustedEvent, 'system', { language: 'zh-CN', evilKey: 'payload' })
            ).resolves.toBe(true)
            const stored = (await readChannel()(trustedEvent, 'system')) as Record<string, unknown>
            expect(stored.evilKey).toBeUndefined()
            expect(stored.language).toBe('zh-CN')
        })

        it('rejects an unknown currentTheme and keeps the previous theme', async () => {
            await writeChannel()(trustedEvent, 'theme', { currentTheme: 'dark' })
            await expect(
                writeChannel()(trustedEvent, 'theme', { currentTheme: 'no-such-theme' })
            ).resolves.toBe(false)
            const stored = (await readChannel()(trustedEvent, 'theme')) as Record<string, unknown>
            expect(stored.currentTheme).toBe('dark')
        })

        it('rejects an unsafe editorTheme but accepts a safe monaco theme id', async () => {
            await expect(
                writeChannel()(trustedEvent, 'theme', { editorTheme: 'vs-dark' })
            ).resolves.toBe(true)
            await expect(
                writeChannel()(trustedEvent, 'theme', { editorTheme: '../../evil' })
            ).resolves.toBe(false)
        })

        // 2026-11-28 用户反馈「编辑器主题设置不生效」回归：磁盘主题名允许空格/括号，
        // 此前 THEME_ID_PATTERN 只允许 [A-Za-z0-9_-]，21 个真实主题在写盘时被整包拒绝。
        it('accepts real disk monaco theme names (spaces / parentheses) in theme writes', async () => {
            for (const editorTheme of ['All Hallows Eve', 'MagicWB (Amiga)', 'GitHub Dark']) {
                await expect(
                    writeChannel()(trustedEvent, 'theme', {
                        separateEditorTheme: true,
                        editorTheme
                    }),
                    editorTheme
                ).resolves.toBe(true)
            }
            const stored = (await readChannel()(trustedEvent, 'theme')) as Record<string, unknown>
            expect(stored.separateEditorTheme).toBe(true)
            expect(stored.editorTheme).toBe('GitHub Dark')
        })

        it('clamps editor numeric fields and drops unknown editor fields', async () => {
            await expect(
                writeChannel()(trustedEvent, 'editor', {
                    fontSize: 500,
                    cursorWidth: 99,
                    lineHeight: 0.01,
                    unknownEditorField: true
                })
            ).resolves.toBe(true)
            const stored = (await readChannel()(trustedEvent, 'editor')) as Record<string, unknown>
            expect(stored.fontSize).toBeLessThanOrEqual(72)
            expect(stored.cursorWidth).toBeLessThanOrEqual(10)
            expect(stored.lineHeight).toBeGreaterThanOrEqual(0.5)
            expect(stored.unknownEditorField).toBeUndefined()
        })

        it('rejects malformed quick-links payloads and drops invalid entries', async () => {
            await expect(writeChannel()(trustedEvent, 'quickLinks', 'not-an-array')).resolves.toBe(
                false
            )
            await expect(
                writeChannel()(trustedEvent, 'quickLinks', {
                    links: [
                        { name: 'GitHub', url: 'https://github.com', icon: '🐙', description: '' },
                        { name: '', url: 'https://evil.test' },
                        { name: 'NoUrl', url: '' }
                    ]
                })
            ).resolves.toBe(true)
            const stored = (await readChannel()(trustedEvent, 'quickLinks')) as Array<{
                name: string
            }>
            expect(stored).toHaveLength(1)
            expect(stored[0].name).toBe('GitHub')
        })

        it('rejects renderer writes to main-process-only recent-folders (P1-1)', async () => {
            // 渲染层可经 config:write 触达的 IPC 通道必须拒绝（否则 XSS 可写入任意目录，
            // 再从「最近文件夹」入口合法打开，来源收敛失效）
            await expect(
                writeChannel()(trustedEvent, 'recent-folders', ['C:\\secrets'])
            ).resolves.toBe(false)
            await expect(
                configManager.writeConfig('recent-folders', ['C:\\secrets'])
            ).resolves.toBe(false)
            await expect(configManager.readConfig('recent-folders')).resolves.toBeNull()

            // 主进程专属写入入口仍走 AS-4 schema 校验（非数组拒绝、非法条目丢弃）
            await expect(
                configManager.writeConfigFromMainProcess('recent-folders', { folders: [] })
            ).resolves.toBe(false)
            await expect(
                configManager.writeConfigFromMainProcess('recent-folders', [
                    'C:\\notes',
                    42,
                    '',
                    'D:\\work'
                ])
            ).resolves.toBe(true)
            await expect(configManager.readConfig('recent-folders')).resolves.toEqual([
                'C:\\notes',
                'D:\\work'
            ])
        })
    })

    describe('系统设置补充实现批次 A', () => {
        it('autoStart=true 写入后调用 setLoginItemSettings({ openAtLogin: true })', async () => {
            await configManager.writeConfig('system', { autoStart: true })
            expect(hoisted.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
        })

        it('autoStart=false 写入后调用 setLoginItemSettings({ openAtLogin: false })', async () => {
            await configManager.writeConfig('system', { autoStart: false })
            expect(hoisted.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false })
        })

        it('读取 system 时用 OS 实际登录项状态校正 autoStart 显示值', async () => {
            // store 中保存 true，但 OS 实际是 false（如用户手动取消/API 未生效）
            await configManager.writeConfig('system', { autoStart: true })
            hoisted.loginItem.openAtLogin = false
            const stored = (await configManager.readConfig('system')) as Record<string, unknown>
            expect(stored.autoStart).toBe(false)

            hoisted.loginItem.openAtLogin = true
            const stored2 = (await configManager.readConfig('system')) as Record<string, unknown>
            expect(stored2.autoStart).toBe(true)
        })

        it('recentFilesCount 变更后即时裁剪 fileState 最近文件存量列表', async () => {
            // 默认保留 10 条：先写入 12 条 → 10 条
            for (let i = 0; i < 12; i++) {
                saveLastOpenedFile(`/f${i}.md`)
            }
            expect(getRecentFiles()).toHaveLength(10)

            // 改为 5 条：保存系统设置后立即裁剪存量
            await configManager.writeConfig('system', { recentFilesCount: 5 })
            const recent = getRecentFiles()
            expect(recent).toHaveLength(5)
            expect(recent[0]).toBe('/f11.md')
        })

        it('recentFilesCount 变更后即时裁剪 recent-folders.json 存量', async () => {
            const folders = Array.from({ length: 12 }, (_, i) => `C:\\notes\\dir${i}`)
            await configManager.writeConfigFromMainProcess('recent-folders', folders)
            expect(await configManager.readConfig('recent-folders')).toHaveLength(10)

            await configManager.writeConfig('system', { recentFilesCount: 5 })
            const stored = (await configManager.readConfig('recent-folders')) as unknown as string[]
            expect(stored).toHaveLength(5)
            expect(stored[0]).toBe('C:\\notes\\dir0')
        })

        it('recent-folders 写入侧按 recentFilesCount 截断', async () => {
            await configManager.writeConfig('system', { recentFilesCount: 6 })
            const folders = Array.from({ length: 12 }, (_, i) => `D:\\work\\dir${i}`)
            await configManager.writeConfigFromMainProcess('recent-folders', folders)
            const stored = (await configManager.readConfig('recent-folders')) as unknown as string[]
            expect(stored).toHaveLength(6)
        })
    })

    // P1-1（工作区受信根来源收敛）：recent-folders 主进程专属写入 + 启动播种受信根
    describe('P1-1 工作区受信根来源收敛', () => {
        /** 受信根比较键（与 utils/workspace-approval 内部一致：realpath + 平台归一化） */
        function approvalKey(dirPath: string): string {
            return normalizePathForCompare(fs.realpathSync(dirPath), process.platform === 'win32')
        }

        /** 创建真实临时目录（受信根播种/记录均要求绝对路径） */
        function makeDir(name: string): string {
            const dir = path.join(hoisted.tmpRoot, name)
            fs.ensureDirSync(dir)
            return dir
        }

        it('recordRecentFolder 去重置顶并按 recentFilesCount 截断（主进程写入）', async () => {
            await configManager.writeConfig('system', { recentFilesCount: 5 })
            const dirs = Array.from({ length: 6 }, (_, index) => makeDir(`recent-${index}`))
            for (const dir of dirs) {
                await recordRecentFolder(dir)
            }
            // 最近打开的置顶、只保留 5 条（第 6 条 dirs[5] 最新，最旧 dirs[0] 被淘汰）
            const stored = (await configManager.readConfig('recent-folders')) as unknown as string[]
            expect(stored).toEqual([...dirs].reverse().slice(0, 5))

            // 再次打开已存在项：去重置顶，不产生重复
            await recordRecentFolder(dirs[2])
            const deduplicated = (await configManager.readConfig(
                'recent-folders'
            )) as unknown as string[]
            expect(deduplicated[0]).toBe(dirs[2])
            expect(deduplicated.filter((entry) => entry === dirs[2])).toHaveLength(1)
            expect(deduplicated).toHaveLength(5)
        })

        it('recordRecentFolder 忽略非法路径（空串/相对路径）', async () => {
            await recordRecentFolder('')
            await recordRecentFolder('relative/folder')
            await recordRecentFolder(null)
            await expect(configManager.readConfig('recent-folders')).resolves.toBeNull()
        })

        it('ensureApprovedWorkspaceRootsInitialized 用主进程持久化历史播种受信根', async () => {
            const recentDir = makeDir('persisted-recent')
            const lastDir = makeDir('persisted-last')
            const dangerousDir = os.homedir()
            // 主进程持久化来源：recent-folders（含危险/相对路径条目）+ fileState.lastOpenedDirectory
            await configManager.writeConfigFromMainProcess('recent-folders', [
                recentDir,
                dangerousDir,
                'relative/folder'
            ])
            saveLastOpenedDirectory(lastDir)

            await ensureApprovedWorkspaceRootsInitialized()

            const approvedKeys = getApprovedWorkspaceRootsForTesting()
            expect(approvedKeys).toContain(approvalKey(recentDir))
            expect(approvedKeys).toContain(approvalKey(lastDir))
            // 危险根/相对路径不进入受信集合（黑名单作为来源收敛之后的第二道防线）
            expect(approvedKeys).not.toContain(approvalKey(dangerousDir))
            expect(approvedKeys).toHaveLength(2)
        })

        it('ensureApprovedWorkspaceRootsInitialized 幂等且可复位（单测隔离）', async () => {
            const recentDir = makeDir('idempotent-recent')
            await configManager.writeConfigFromMainProcess('recent-folders', [recentDir])

            const first = ensureApprovedWorkspaceRootsInitialized()
            const second = ensureApprovedWorkspaceRootsInitialized()
            expect(first).toBe(second)
            await first
            expect(getApprovedWorkspaceRootsForTesting()).toHaveLength(1)

            // 复位后再次播种（AppContext 受信根由其它用例复位，这里只复位播种 Promise）
            resetWorkspaceApprovalSeedForTesting()
            await ensureApprovedWorkspaceRootsInitialized()
            expect(getApprovedWorkspaceRootsForTesting()).toHaveLength(1)
        })
    })

    describe('系统设置补充实现批次 B', () => {
        it('minimizeToTray=true 写入后立即确保托盘已创建（即时生效）', async () => {
            await configManager.writeConfig('system', { minimizeToTray: true })
            expect(vi.mocked(ensureTrayCreated)).toHaveBeenCalledTimes(1)

            // 再次保存（如对话框每次点「确定」全量写）不重复触发非幂等问题——
            // tray.ts 内部单例防护，此处仅保证调用关系稳定
            await configManager.writeConfig('system', { minimizeToTray: true })
            expect(vi.mocked(ensureTrayCreated)).toHaveBeenCalledTimes(2)
        })

        it('minimizeToTray=false 写入不创建托盘（关闭时不销毁已有托盘）', async () => {
            await configManager.writeConfig('system', { minimizeToTray: false })
            expect(vi.mocked(ensureTrayCreated)).not.toHaveBeenCalled()
        })

        it('useSystemTheme=true 写入后立即按系统主题应用一次', async () => {
            await configManager.writeConfig('system', { useSystemTheme: true })
            expect(vi.mocked(applySystemThemeNow)).toHaveBeenCalledTimes(1)
        })

        it('useSystemTheme=false 写入不触发系统主题应用', async () => {
            await configManager.writeConfig('system', { useSystemTheme: false })
            expect(vi.mocked(applySystemThemeNow)).not.toHaveBeenCalled()
        })

        it('手动切换主题（theme 写入携带 currentTheme）自动关闭 useSystemTheme（互斥）', async () => {
            await configManager.writeConfig('system', { useSystemTheme: true })
            const storedBefore = (await configManager.readConfig('system')) as Record<
                string,
                unknown
            >
            expect(storedBefore.useSystemTheme).toBe(true)

            await configManager.writeConfig('theme', { currentTheme: 'rose' })

            const storedAfter = (await configManager.readConfig('system')) as Record<
                string,
                unknown
            >
            expect(storedAfter.useSystemTheme).toBe(false)
        })

        it('仅写 editorTheme / separateEditorTheme 不关闭 useSystemTheme', async () => {
            await configManager.writeConfig('system', { useSystemTheme: true })
            await configManager.writeConfig('theme', { editorTheme: 'vs-light' })
            await configManager.writeConfig('theme', { separateEditorTheme: true })

            const stored = (await configManager.readConfig('system')) as Record<string, unknown>
            expect(stored.useSystemTheme).toBe(true)
        })
    })

    describe('系统设置补充实现批次 C（自动备份）', () => {
        // P1-2：保存动作只调用 syncAutoBackupTimer 重启定时器，不立即执行备份
        // （"不立即执行"由 auto-backup 模块保证，见 auto-backup.test.ts）
        it('enableAutoBackup=true 写入后同步定时器（仅重启调度，不立即执行）', async () => {
            await configManager.writeConfig('system', { enableAutoBackup: true })
            expect(vi.mocked(syncAutoBackupTimer)).toHaveBeenCalledTimes(1)
        })

        it('enableAutoBackup=false 写入后同步定时器（停止调度）', async () => {
            await configManager.writeConfig('system', { enableAutoBackup: false })
            expect(vi.mocked(syncAutoBackupTimer)).toHaveBeenCalledTimes(1)
        })

        it('backupInterval 变更后同步定时器（按新间隔重启）', async () => {
            await configManager.writeConfig('system', { backupInterval: 48 })
            expect(vi.mocked(syncAutoBackupTimer)).toHaveBeenCalledTimes(1)
        })

        it('写入与自动备份无关的字段不触发定时器同步', async () => {
            await configManager.writeConfig('system', { fontSize: 14 })
            await configManager.writeConfig('system', { autoSaveEnabled: true })
            expect(vi.mocked(syncAutoBackupTimer)).not.toHaveBeenCalled()
        })
    })

    describe('覆盖率补测第五批：配置异常分支与历史兼容', () => {
        it('读取系统登录项抛错时回退 store 中的 autoStart 值', async () => {
            await configManager.writeConfigFromMainProcess('recent-folders', [])
            hoisted.getLoginItemSettings.mockImplementationOnce(() => {
                throw new Error('dev mode unavailable')
            })
            const system = (await configManager.readConfig('system')) as Record<string, unknown>
            expect(system.autoStart).toBe(false)
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('读取开机自启动状态失败'),
                expect.any(Error)
            )
        })

        it('应用开机自启动设置抛错时只告警、不影响写入成功', async () => {
            hoisted.setLoginItemSettings.mockImplementationOnce(() => {
                throw new Error('permission denied')
            })
            await expect(configManager.writeConfig('system', { autoStart: true })).resolves.toBe(
                true
            )
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('应用开机自启动设置失败'),
                expect.any(Error)
            )
        })

        it('recent-folders 非数组时最近文件夹裁剪直接返回', async () => {
            await configManager.writeConfigFromMainProcess('recent-folders', [])
            fs.writeJsonSync(path.join(CONFIG_DIR, 'recent-folders.json'), { not: 'array' })
            await expect(
                configManager.writeConfig('system', { recentFilesCount: 5 })
            ).resolves.toBe(true)
            const written = fs.readJsonSync(path.join(CONFIG_DIR, 'recent-folders.json')) as unknown
            expect(written).toEqual({ not: 'array' })
        })

        it('recent-folders 超出保留数量时就地裁剪', async () => {
            const folders = Array.from({ length: 10 }, (_, index) => `E:/notes/${index}`)
            fs.ensureDirSync(CONFIG_DIR)
            fs.writeJsonSync(path.join(CONFIG_DIR, 'recent-folders.json'), folders)
            await configManager.writeConfig('system', { recentFilesCount: 5 })
            const written = fs.readJsonSync(
                path.join(CONFIG_DIR, 'recent-folders.json')
            ) as string[]
            expect(written).toHaveLength(5)
            expect(written[0]).toBe('E:/notes/0')
        })

        it('最近文件夹 JSON 损坏时裁剪只告警不阻断写入', async () => {
            fs.ensureDirSync(CONFIG_DIR)
            fs.writeFileSync(path.join(CONFIG_DIR, 'recent-folders.json'), '{broken', 'utf-8')
            await expect(
                configManager.writeConfig('system', { recentFilesCount: 6 })
            ).resolves.toBe(true)
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('裁剪最近文件夹列表失败'),
                expect.any(Error)
            )
        })

        it('quick-links / quickLinks 读取均路由到快速链接配置', async () => {
            await expect(configManager.readConfig('quick-links')).resolves.toBeDefined()
            await expect(configManager.readConfig('quickLinks')).resolves.toBeDefined()
        })

        it('最近文件夹历史读取损坏时按空列表处理并继续置顶写入', async () => {
            fs.ensureDirSync(CONFIG_DIR)
            fs.writeFileSync(path.join(CONFIG_DIR, 'recent-folders.json'), '{broken', 'utf-8')
            await recordRecentFolder('E:/notes/safe')
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error reading config recent-folders'),
                expect.any(Error)
            )
            const written = fs.readJsonSync(
                path.join(CONFIG_DIR, 'recent-folders.json')
            ) as string[]
            expect(written).toEqual([path.resolve('E:/notes/safe')])
        })

        it('最近文件夹写入失败时告警且不抛出', async () => {
            fs.ensureDirSync(CONFIG_DIR)
            // 目标路径被同名目录占位：writeJson 抛 EISDIR → writeConfig 返回 false
            fs.ensureDirSync(path.join(CONFIG_DIR, 'recent-folders.json'))
            await expect(recordRecentFolder('E:/notes/safe')).resolves.toBeUndefined()
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('写入最近文件夹历史失败'),
                path.resolve('E:/notes/safe')
            )
        })

        it('旧 theme.json 迁移进主进程主题 store 并改名标记', async () => {
            fs.ensureDirSync(CONFIG_DIR)
            fs.writeJsonSync(path.join(CONFIG_DIR, 'theme.json'), {
                currentTheme: 'rose',
                separateEditorTheme: true,
                editorTheme: 'vs-dark'
            })
            registerConfigIpcHandlers()
            expect(fs.existsSync(path.join(CONFIG_DIR, 'theme.json.legacy-migrated'))).toBe(true)
            const stored = (await configManager.readConfig('theme')) as Record<string, unknown>
            expect(stored.currentTheme).toBe('rose')
        })

        it('旧 quickLinks.json 迁移进快速链接配置并改名标记', async () => {
            fs.ensureDirSync(CONFIG_DIR)
            fs.writeJsonSync(path.join(CONFIG_DIR, 'quickLinks.json'), {
                links: [{ name: '旧链接', url: 'https://old.example/' }]
            })
            registerConfigIpcHandlers()
            expect(fs.existsSync(path.join(CONFIG_DIR, 'quickLinks.json.legacy-migrated'))).toBe(
                true
            )
            const stored = (await configManager.readConfig('quick-links')) as unknown as Array<{
                name?: string
            }>
            expect(stored[0]?.name).toBe('旧链接')
        })

        it('旧配置损坏时记录错误并保留原文件（可人工修复）', async () => {
            fs.ensureDirSync(CONFIG_DIR)
            fs.writeFileSync(path.join(CONFIG_DIR, 'system.json'), '{broken', 'utf-8')
            registerConfigIpcHandlers()
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('迁移旧配置 system.json 失败'),
                expect.any(Error)
            )
            expect(fs.existsSync(path.join(CONFIG_DIR, 'system.json'))).toBe(true)
        })
    })
})
