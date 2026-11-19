/**
 * handlers.ts（IPC 处理器）单元测试
 * 覆盖：on/handle 注册的通道名称全集、窗口控制（minimize/maximize 切换/bounds/move/set-size）、
 * 菜单动作转发、打开特定文件夹、欢迎页打开目录/文件、导入新建、创建文件/文件夹、
 * 当前文件路径/目录选择、系统信息、monaco 主题/编辑器设置、自动保存开关 payload 处理、
 * 主窗口 set/get、ipc/index 的 re-export（仅保留真实消费方）
 * （P2：WINDOW.UNMAXIMIZE 死通道与 THEME.DIALOG_BROADCAST_THEME 主题广播监听已删除）
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
// 2026-11-19（P0 修复）：欢迎页/主界面状态（CLOSE 快速关闭与数据安全回归测试）
import {
    isWelcomeScreenVisible,
    markMainViewEntered,
    resetWelcomeState
} from '../../src/main/ipc/welcome-state'

// CMP-30：IPC 异常状态栏提示经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

const electronMocks = vi.hoisted(() => {
    const onMap = new Map<string, Array<(...args: never[]) => void>>()
    const handleMap = new Map<string, (...args: never[]) => unknown>()
    return {
        on: vi.fn((channel: string, listener: (...args: never[]) => void) => {
            const arr = onMap.get(channel) ?? []
            arr.push(listener)
            onMap.set(channel, arr)
        }),
        handle: vi.fn((channel: string, listener: (...args: never[]) => unknown) => {
            handleMap.set(channel, listener)
        }),
        removeListener: vi.fn(),
        getAllWindows: vi.fn((): never[] => []),
        showOpenDialog: vi.fn(),
        onMap,
        handleMap
    }
})

vi.mock('electron', () => ({
    ipcMain: {
        on: electronMocks.on,
        handle: electronMocks.handle,
        removeListener: electronMocks.removeListener
    },
    BrowserWindow: { getAllWindows: electronMocks.getAllWindows },
    dialog: { showOpenDialog: electronMocks.showOpenDialog }
}))

const handlerDeps = vi.hoisted(() => ({
    handleBaiZeMenuAction: vi.fn(),
    getMonacoThemeData: vi.fn(),
    getEditorSetting: vi.fn(),
    createFileFolder: vi.fn(),
    getCurrentFileDirectory: vi.fn(),
    selectDirectory: vi.fn(),
    startAutoSaveFileTime: vi.fn(),
    stopAutoSaveFileTime: vi.fn(),
    reloadDirFromDisk: vi.fn(),
    openSelectFile: vi.fn(),
    parserFileName: vi.fn(),
    importCreateNewFile: vi.fn(),
    saveLastOpenedDirectory: vi.fn(),
    // 「文件」菜单最近文件：主进程 file-state 存储读取（异常容错分支单独 mock 抛错）
    getRecentFiles: vi.fn()
}))

vi.mock('../../src/main/ipc/menu-handle', () => ({
    HandleBaiZeMenuAction: handlerDeps.handleBaiZeMenuAction
}))

vi.mock('../../src/main/config', () => ({
    getMonacoThemeData: handlerDeps.getMonacoThemeData,
    getEditorSetting: handlerDeps.getEditorSetting
}))

vi.mock('../../src/main/utils/file-utils', () => ({
    CreateFileFolder: handlerDeps.createFileFolder,
    GetCurrentFileDirectory: handlerDeps.getCurrentFileDirectory,
    SelectDirectory: handlerDeps.selectDirectory,
    StartAutoSaveFileTime: handlerDeps.startAutoSaveFileTime,
    StopAutoSaveFileTime: handlerDeps.stopAutoSaveFileTime,
    ReloadDirFromDisk: handlerDeps.reloadDirFromDisk,
    OpenSelectFile: handlerDeps.openSelectFile,
    ParserFileName: handlerDeps.parserFileName,
    ImportCreateNewFile: handlerDeps.importCreateNewFile
}))

vi.mock('../../src/main/utils/file-state', () => ({
    saveLastOpenedDirectory: handlerDeps.saveLastOpenedDirectory,
    getRecentFiles: handlerDeps.getRecentFiles
}))

// 「文件」菜单最近文件夹：主进程读取 recent-folders 裸 JSON 配置（configManager.readConfig）；
// mock 掉避免拉起 electron app.getPath/electron-store 依赖链。
const configManagerDeps = vi.hoisted(() => ({
    readConfig: vi.fn()
}))
vi.mock('../../src/main/config/config-manager', () => ({
    configManager: { readConfig: configManagerDeps.readConfig }
}))

// 「文件」菜单最近文件夹：打开动作复用 startup-restore 的目录打开实现（WELCOME_ENTER_MAIN
// 时序在 startup-restore.test.ts 覆盖），此处只断言委托关系，mock 掉避免加载文件存储依赖链。
const startupRestoreDeps = vi.hoisted(() => ({
    openDirectoryInMainView: vi.fn()
}))
vi.mock('../../src/main/utils/startup-restore', () => startupRestoreDeps)

// P1-FE-04：快捷链接保存 handler 依赖的主进程配置模块（归一化 + 落盘）
const quickLinkDeps = vi.hoisted(() => ({
    normalizeQuickLinkItems: vi.fn((value: unknown) => value),
    saveQuickLinks: vi.fn()
}))

vi.mock('../../src/main/config/quick-link-config', () => ({
    normalizeQuickLinkItems: quickLinkDeps.normalizeQuickLinkItems,
    saveQuickLinks: quickLinkDeps.saveQuickLinks
}))

import { registerIpcHandlers, setMainWindow, getMainWindow } from '../../src/main/ipc/handlers'
import * as ipcIndex from '../../src/main/ipc/index'
import { ipcListenerManager } from '../../src/main/ipc/ipc-listener-manager'
import { appState } from '../../src/main/utils/app-state'
// P1-AS-1 交接：欢迎页对话框选择路径需登记为受信路径（task-13/task-15）
import {
    clearTrustedPathsForTesting,
    getTrustedPathsForTesting
} from '../../src/main/utils/security'

// 构造最小主窗口 mock：覆盖 handlers.ts 实际调用的 BrowserWindow 成员。
// 不再整体 `as never`，否则 `win.xxx` 访问在类型侧全变成 never（TS2339）。
function makeWindow() {
    return {
        minimize: vi.fn(),
        maximize: vi.fn(),
        unmaximize: vi.fn(),
        close: vi.fn(),
        isMaximized: vi.fn(() => false),
        isDestroyed: vi.fn(() => false),
        getBounds: vi.fn(() => ({ x: 1, y: 2, width: 100, height: 200 })),
        getSize: vi.fn(() => [100, 200]),
        getPosition: vi.fn(() => [7, 8]),
        setBounds: vi.fn(),
        webContents: { send: vi.fn() }
    }
}

/**
 * 从 ipcMain mock 中取出的监听器：生产端签名各异（事件对象/可变 payload），
 * 测试统一以 unknown[] 调用，返回 unknown 交由断言处理。
 */
type AnyFn = (...args: unknown[]) => unknown

// P1/N-05：主进程高风险 handler 统一校验发送方，事件桩需携带受信主窗口 webContents
function makeEvent() {
    return { sender: win.webContents }
}

function getOnHandler(channel: string): AnyFn {
    const listener = electronMocks.onMap.get(channel)?.[0]
    expect(listener, `应注册 on 通道 ${channel}`).toBeDefined()
    return listener as unknown as AnyFn
}

function getHandleHandler(channel: string): AnyFn {
    const listener = electronMocks.handleMap.get(channel)
    expect(listener, `应注册 handle 通道 ${channel}`).toBeDefined()
    return listener as unknown as AnyFn
}

// 模块加载时已不再注册 dialog-broadcast-theme 监听器（P2 随主题设置 JSDOM
// 对话框删除，DIALOG_BROADCAST_THEME 通道双端移除）。

let win: ReturnType<typeof makeWindow>

/**
 * AS-2：工作区根目录校验用例需要真实存在且为目录的路径
 * （旧用例里的 D:\notes 在多数机器上并不存在，校验后会走拒绝分支）。
 */
let tempBase: string
let validWorkspace: string
let existingFilePath: string
// P1-FE-03：插入图片「本地文件」浏览用例需要真实存在的图片文件（复制源）
let existingImagePath: string
// Windows 系统目录（存在时用于 AS-2「系统目录拒绝」用例；非 Windows 平台自动跳过）
const WINDOWS_SYSTEM_ROOT = process.env.SystemRoot ?? process.env.WINDIR

beforeAll(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-ipc-handlers-'))
    validWorkspace = path.join(tempBase, 'workspace')
    fs.mkdirSync(validWorkspace)
    existingFilePath = path.join(tempBase, 'note.md')
    fs.writeFileSync(existingFilePath, '# note')
    // 最小 PNG 头（复制逻辑只做二进制拷贝，不解析图片内容）
    existingImagePath = path.join(tempBase, 'logo.png')
    fs.writeFileSync(
        existingImagePath,
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
})

afterAll(() => {
    fs.rmSync(tempBase, { recursive: true, force: true })
})

/** webContents.send 的 mock 形状（用于断言 IPC 发送顺序/时序） */
interface SendMock {
    (channel: string, ...args: unknown[]): void
    mock: {
        calls: Array<[string, ...unknown[]]>
        invocationCallOrder: number[]
    }
}

function getSendMock(): SendMock {
    return (win as unknown as { webContents: { send: SendMock } }).webContents.send
}

beforeEach(() => {
    win = makeWindow()
    // 清空捕获，仅统计本次 registerIpcHandlers 的注册
    electronMocks.onMap.clear()
    electronMocks.handleMap.clear()
    electronMocks.on.mockClear()
    electronMocks.handle.mockClear()
    electronMocks.getAllWindows.mockReset()
    electronMocks.getAllWindows.mockReturnValue([])
    electronMocks.showOpenDialog.mockReset()
    for (const mock of Object.values(handlerDeps)) {
        mock.mockClear()
    }
    quickLinkDeps.normalizeQuickLinkItems.mockClear()
    quickLinkDeps.normalizeQuickLinkItems.mockImplementation((value: unknown) => value)
    quickLinkDeps.saveQuickLinks.mockClear()
    configManagerDeps.readConfig.mockReset()
    configManagerDeps.readConfig.mockResolvedValue(null)
    startupRestoreDeps.openDirectoryInMainView.mockReset()
    startupRestoreDeps.openDirectoryInMainView.mockResolvedValue(undefined)
    appState._resetForTesting()
    // 2026-11-19（P0 修复）：欢迎页状态按用例复位（CLOSE 快速关闭分支依赖）
    resetWelcomeState()
    // P1-AS-1 交接：清空运行期受信路径登记，避免用例间相互污染
    clearTrustedPathsForTesting()
    registerIpcHandlers(win as never)
})

describe('registerIpcHandlers channel registration', () => {
    it('should register all expected on channels', () => {
        const channels = [...electronMocks.onMap.keys()].sort()
        expect(channels).toEqual(
            [
                'baize:menu:action',
                'baize:file:open-specific-folder',
                'baize:file:welcome-open-directory',
                'baize:file:welcome-open-file',
                'baize:window:close',
                'baize:window:maximize',
                'baize:window:minimize',
                'baize:window:move',
                'baize:window:set-size',
                'baize:window:toggle-maximize'
            ].sort()
        )
    })

    it('should register all expected handle channels', () => {
        const channels = [...electronMocks.handleMap.keys()].sort()
        expect(channels).toEqual(
            [
                'baize:file:create-entry',
                'baize:file:get-current-path',
                'baize:editor:get-setting',
                'baize:file:import',
                'baize:theme:load-monaco',
                'baize:file:open-recent',
                'baize:file:recent-list',
                'baize:file:select-directory',
                'baize:file:select-image',
                'baize:system:get-info',
                'baize:setting:auto-save-changed',
                'baize:quick-links:save',
                'baize:window:get-bounds',
                'baize:window:is-maximized'
            ].sort()
        )
    })
})

describe('window close fast path (P0 关闭延迟/数据安全)', () => {
    it('should set the quitting flag and close immediately on the welcome screen', async () => {
        resetWelcomeState()
        appState.currentActiveFile = null
        await getOnHandler('baize:window:close')(makeEvent())
        expect(win.close).toHaveBeenCalled()
        expect(appState.isQuitting).toBe(true)
    })

    it('should keep the flush protocol once the main view has been entered with an active file', async () => {
        resetWelcomeState()
        markMainViewEntered()
        appState.currentActiveFile = {
            name: 'a.md',
            path: path.join(tempBase, 'a.md'),
            type: 'file',
            content: 'dirty'
        } as never
        await getOnHandler('baize:window:close')(makeEvent())
        expect(win.close).toHaveBeenCalled()
        // 未置退出标志：close 拦截继续走 FLUSH_CONTENT → 脏则保存（数据安全）
        expect(appState.isQuitting).toBe(false)
    })
})

describe('window control handlers', () => {
    it('should minimize the window on window-minimize', () => {
        getOnHandler('baize:window:minimize')(makeEvent())
        expect(win.minimize).toHaveBeenCalled()
    })

    it('should maximize and unmaximize on window-toggle-maximize', () => {
        const handler = getOnHandler('baize:window:toggle-maximize')
        win.isMaximized.mockReturnValue(true)
        handler(makeEvent())
        expect(win.unmaximize).toHaveBeenCalled()
        expect(win.maximize).not.toHaveBeenCalled()

        win.isMaximized.mockReturnValue(false)
        handler(makeEvent())
        expect(win.maximize).toHaveBeenCalled()
    })

    it('should return the window bounds on window-get-bounds', () => {
        expect(getHandleHandler('baize:window:get-bounds')(makeEvent())).toEqual({
            x: 1,
            y: 2,
            width: 100,
            height: 200
        })
    })

    it('should reject the query once the window has been destroyed', () => {
        // AS-6：窗口销毁后 sender 信任判定即失效（isTrustedSender 检查 isDestroyed），
        // handle 通道返回统一拒绝对象而不是继续读取窗口属性。
        win.isDestroyed.mockReturnValue(true)
        expect(getHandleHandler('baize:window:get-bounds')(makeEvent())).toEqual(
            expect.objectContaining({ ok: false, code: 'untrusted-sender' })
        )
        expect(getHandleHandler('baize:window:is-maximized')(makeEvent())).toEqual(
            expect.objectContaining({ ok: false, code: 'untrusted-sender' })
        )
    })

    it('should move the window preserving its size', () => {
        getOnHandler('baize:window:move')(makeEvent(), 5, 6)
        expect(win.setBounds).toHaveBeenCalledWith({ x: 5, y: 6, width: 100, height: 200 })
    })

    it('should resize the window preserving its position', () => {
        getOnHandler('baize:window:set-size')(makeEvent(), 300, 400)
        expect(win.setBounds).toHaveBeenCalledWith({ x: 7, y: 8, width: 300, height: 400 })
    })

    // AS-6：窗口 bounds 数值范围校验——NaN/字符串/超大值不应用到窗口
    it('should ignore invalid window coordinates (AS-6)', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const handler = getOnHandler('baize:window:move')
        for (const [x, y] of [
            [Number.NaN, 0],
            [0, Number.POSITIVE_INFINITY],
            ['5', '6'],
            [10_000_000, 0],
            [0, -10_000_000],
            [1.5, 2]
        ]) {
            handler(makeEvent(), x, y)
        }
        expect(win.setBounds).not.toHaveBeenCalled()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    it('should ignore invalid window sizes (AS-6)', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const handler = getOnHandler('baize:window:set-size')
        for (const [width, height] of [
            [0, 100],
            [-10, 100],
            [100_000, 100],
            [Number.NaN, 100],
            ['300', 400]
        ]) {
            handler(makeEvent(), width, height)
        }
        expect(win.setBounds).not.toHaveBeenCalled()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    it('should swallow setBounds errors instead of throwing (AS-6)', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        win.setBounds.mockImplementation(() => {
            throw new Error('setBounds exploded')
        })
        expect(() => getOnHandler('baize:window:move')(makeEvent(), 5, 6)).not.toThrow()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    // AS-6：WINDOW.* 通道补 sender 校验
    it('should reject untrusted senders on window control channels (AS-6)', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const foreign = { sender: { id: 999 } }
        getOnHandler('baize:window:minimize')(foreign)
        getOnHandler('baize:window:move')(foreign, 5, 6)
        const bounds = getHandleHandler('baize:window:get-bounds')(foreign)
        expect(win.minimize).not.toHaveBeenCalled()
        expect(win.setBounds).not.toHaveBeenCalled()
        expect(bounds).toEqual(expect.objectContaining({ ok: false, code: 'untrusted-sender' }))
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })
})

describe('menu action forwarding', () => {
    it('should forward baize-notes:menu-action to the menu handler', () => {
        getOnHandler('baize:menu:action')(makeEvent(), 'baize:menu:file:save')
        expect(handlerDeps.handleBaiZeMenuAction).toHaveBeenCalledWith('baize:menu:file:save', win)
    })
})

describe('folder and file open handlers', () => {
    it('should switch root path and reload for open-specific-folder', async () => {
        handlerDeps.reloadDirFromDisk.mockResolvedValue(undefined)
        // AS-2：校验需要真实存在的目录（原用例的 D:\notes 在多数机器上不存在）
        await getOnHandler('baize:file:open-specific-folder')(makeEvent(), validWorkspace)
        expect(win.webContents.send).toHaveBeenCalledWith('baize:file:clear-editor-preview')
        expect(appState.rootPath).toBe(validWorkspace)
        expect(handlerDeps.reloadDirFromDisk).toHaveBeenCalled()
        expect(handlerDeps.saveLastOpenedDirectory).toHaveBeenCalledWith(validWorkspace)
        // 2026-11-19（P0 修复）：欢迎页「最近文件夹」进入主界面后必须标记——
        // 否则关闭时会被误判为欢迎页而跳过 flush/脏保存
        expect(isWelcomeScreenVisible()).toBe(false)
    })

    it('should do nothing when the welcome directory dialog is canceled', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
        await getOnHandler('baize:file:welcome-open-directory')(makeEvent())
        expect(win.webContents.send).not.toHaveBeenCalled()
        expect(handlerDeps.reloadDirFromDisk).not.toHaveBeenCalled()
    })

    it('should enter the main view after choosing a welcome directory', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: ['D:\\notes']
        })
        handlerDeps.reloadDirFromDisk.mockResolvedValue(undefined)
        await getOnHandler('baize:file:welcome-open-directory')(makeEvent())
        expect(appState.rootPath).toBe('D:\\notes')
        expect(win.webContents.send).toHaveBeenCalledWith('baize:file:welcome-enter-main', {
            type: 'directory',
            path: 'D:\\notes'
        })
    })

    it('should open a selected welcome file with parsed name and empty content', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: ['C:\\docs\\a.md']
        })
        handlerDeps.parserFileName.mockReturnValue('a.md')
        handlerDeps.openSelectFile.mockResolvedValue(undefined)
        await getOnHandler('baize:file:welcome-open-file')(makeEvent())
        expect(handlerDeps.openSelectFile).toHaveBeenCalledWith({
            name: 'a.md',
            path: 'C:\\docs\\a.md',
            type: 'file',
            content: ''
        })
        expect(win.webContents.send).toHaveBeenCalledWith('baize:file:welcome-enter-main', {
            type: 'file',
            path: 'C:\\docs\\a.md'
        })
    })
})

describe('FE-01 welcome flow data event ordering', () => {
    function findCallIndex(channel: string): number {
        return getSendMock().mock.calls.findIndex(([callChannel]) => callChannel === channel)
    }

    it('should send WELCOME_ENTER_MAIN before CLEAR_EDITOR_PREVIEW and the directory data event', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [validWorkspace]
        })
        // 模拟真实 ReloadDirFromDisk 内部发送 FILE_SYSTEM_DATA 目录树数据事件
        handlerDeps.reloadDirFromDisk.mockImplementation(async () => {
            getSendMock()('baize:fs:file-system-data', '[]')
        })

        await getOnHandler('baize:file:welcome-open-directory')(makeEvent())

        const enterMainIndex = findCallIndex('baize:file:welcome-enter-main')
        const clearPreviewIndex = findCallIndex('baize:file:clear-editor-preview')
        const dataIndex = findCallIndex('baize:fs:file-system-data')

        // FE-01：主界面切换通知必须先于所有渲染层数据事件，否则监听器尚未注册即丢事件
        expect(enterMainIndex).toBeGreaterThanOrEqual(0)
        expect(clearPreviewIndex).toBeGreaterThan(enterMainIndex)
        expect(dataIndex).toBeGreaterThan(enterMainIndex)
        // 目录遍历/数据读取本身也必须发生在 WELCOME_ENTER_MAIN 投递之后
        const enterMainOrder = getSendMock().mock.invocationCallOrder[enterMainIndex]
        expect(handlerDeps.reloadDirFromDisk.mock.invocationCallOrder[0]).toBeGreaterThan(
            enterMainOrder
        )
        // handler 结束时数据事件已投递（setImmediate 延迟被 await，不是 fire-and-forget）
        expect(dataIndex).toBeGreaterThanOrEqual(0)
    })

    it('should send WELCOME_ENTER_MAIN before the welcome file content events', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: ['C:\\docs\\a.md']
        })
        handlerDeps.parserFileName.mockReturnValue('a.md')
        // 模拟真实 OpenSelectFile 内部发送文件内容与路径数据事件
        handlerDeps.openSelectFile.mockImplementation(async () => {
            getSendMock()('baize:fs:show-selected-file-context', '# content')
            getSendMock()('baize:file:user-select-file', 'C:\\docs\\a.md')
        })

        await getOnHandler('baize:file:welcome-open-file')(makeEvent())

        const enterMainIndex = findCallIndex('baize:file:welcome-enter-main')
        const fileContextIndex = findCallIndex('baize:fs:show-selected-file-context')
        const userSelectIndex = findCallIndex('baize:file:user-select-file')

        // FE-01：编辑器内容/路径事件必须晚于主界面挂载通知
        expect(enterMainIndex).toBeGreaterThanOrEqual(0)
        expect(fileContextIndex).toBeGreaterThan(enterMainIndex)
        expect(userSelectIndex).toBeGreaterThan(enterMainIndex)
        const enterMainOrder = getSendMock().mock.invocationCallOrder[enterMainIndex]
        expect(handlerDeps.openSelectFile.mock.invocationCallOrder[0]).toBeGreaterThan(
            enterMainOrder
        )
    })

    it('should keep the recent-folder path working (welcome hidden before IPC)', async () => {
        // 「最近文件夹」入口由 App.vue 先隐藏欢迎页再发送 IPC；主进程不应额外发送
        // WELCOME_ENTER_MAIN（主界面已切换），数据事件时序保持原样。
        handlerDeps.reloadDirFromDisk.mockImplementation(async () => {
            getSendMock()('baize:fs:file-system-data', '[]')
        })
        await getOnHandler('baize:file:open-specific-folder')(makeEvent(), validWorkspace)
        expect(findCallIndex('baize:file:welcome-enter-main')).toBe(-1)
        expect(findCallIndex('baize:fs:file-system-data')).toBeGreaterThanOrEqual(0)
        expect(appState.rootPath).toBe(validWorkspace)
        expect(handlerDeps.reloadDirFromDisk).toHaveBeenCalledTimes(1)
    })
})

describe('welcome dialog trust registration (AS-1 handoff)', () => {
    it('should register the welcome-selected file path as a trusted path', async () => {
        const selectedFile = path.join(tempBase, 'welcome-note.md')
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [selectedFile]
        })
        handlerDeps.parserFileName.mockReturnValue('welcome-note.md')
        handlerDeps.openSelectFile.mockResolvedValue(undefined)

        await getOnHandler('baize:file:welcome-open-file')(makeEvent())

        // 单文件可能位于工作区外（首次启动无 rootPath），必须由对话框登记为受信路径
        expect(getTrustedPathsForTesting().files).toContain(selectedFile)
    })

    it('should register the welcome-selected directory as a trusted directory', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [validWorkspace]
        })
        handlerDeps.reloadDirFromDisk.mockResolvedValue(undefined)

        await getOnHandler('baize:file:welcome-open-directory')(makeEvent())

        expect(getTrustedPathsForTesting().directories).toContain(validWorkspace)
    })
})

describe('AS-2 workspace root validation (open-specific-folder)', () => {
    let consoleWarn: ReturnType<typeof vi.spyOn>
    let consoleError: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleWarn.mockRestore()
        consoleError.mockRestore()
    })

    function expectRootRejected(): void {
        expect(handlerDeps.reloadDirFromDisk).not.toHaveBeenCalled()
        expect(handlerDeps.saveLastOpenedDirectory).not.toHaveBeenCalled()
        expect(appState.rootPath).toBe('')
        const sentChannels = getSendMock().mock.calls.map(([channel]) => channel)
        // 不得触发目录遍历后的数据事件（无 FILE_SYSTEM_DATA / 清空预览）
        expect(sentChannels).not.toContain('baize:fs:file-system-data')
        expect(sentChannels).not.toContain('baize:file:clear-editor-preview')
        // 通过状态栏提示拒绝原因
        expect(win.webContents.send).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
        // 安全日志保留（console.warn 记录拒绝原因）
        expect(consoleWarn).toHaveBeenCalled()
    }

    it('should reject a non-existent directory', async () => {
        await getOnHandler('baize:file:open-specific-folder')(
            makeEvent(),
            path.join(tempBase, 'missing-dir')
        )
        expectRootRejected()
    })

    it('should reject a file path (must be a directory)', async () => {
        await getOnHandler('baize:file:open-specific-folder')(makeEvent(), existingFilePath)
        expectRootRejected()
    })

    it('should reject a filesystem drive root', async () => {
        const driveRoot = path.parse(tempBase).root
        await getOnHandler('baize:file:open-specific-folder')(makeEvent(), driveRoot)
        expectRootRejected()
    })

    it('should reject the user home directory and the user root directory', async () => {
        const handler = getOnHandler('baize:file:open-specific-folder')
        await handler(makeEvent(), os.homedir())
        expectRootRejected()
        // 用户目录根（Windows: C:\Users / POSIX: /home）同样视为危险根
        const usersRoot = path.dirname(os.homedir())
        if (usersRoot !== os.homedir() && usersRoot !== path.parse(usersRoot).root) {
            await handler(makeEvent(), usersRoot)
            expectRootRejected()
        }
    })

    it('should reject UNC share roots / device paths', async () => {
        await getOnHandler('baize:file:open-specific-folder')(makeEvent(), '\\\\server\\share')
        expectRootRejected()
    })

    it('should reject relative paths and empty values', async () => {
        const handler = getOnHandler('baize:file:open-specific-folder')
        await handler(makeEvent(), 'relative/folder')
        expectRootRejected()
        await handler(makeEvent(), '')
        expectRootRejected()
        await handler(makeEvent(), undefined)
        expectRootRejected()
    })

    it.skipIf(!WINDOWS_SYSTEM_ROOT)(
        'should reject the Windows system directory and its subtree',
        async () => {
            await getOnHandler('baize:file:open-specific-folder')(
                makeEvent(),
                WINDOWS_SYSTEM_ROOT as string
            )
            expectRootRejected()
            await getOnHandler('baize:file:open-specific-folder')(
                makeEvent(),
                path.join(WINDOWS_SYSTEM_ROOT as string, 'System32')
            )
            expectRootRejected()
        }
    )

    it('should accept a valid existing directory and keep the recent-folder flow working', async () => {
        await getOnHandler('baize:file:open-specific-folder')(makeEvent(), validWorkspace)
        expect(appState.rootPath).toBe(validWorkspace)
        expect(handlerDeps.reloadDirFromDisk).toHaveBeenCalledTimes(1)
        expect(handlerDeps.saveLastOpenedDirectory).toHaveBeenCalledWith(validWorkspace)
        expect(win.webContents.send).toHaveBeenCalledWith('baize:file:clear-editor-preview')
        // 合法目录不应产生错误提示
        const errorSends = getSendMock().mock.calls.filter(
            ([channel]) => channel === 'baize:status-bar:update'
        )
        expect(errorSends).toHaveLength(0)
    })
})

describe('async IPC error fallback (CQ-05)', () => {
    it('should log and notify the status bar when open-specific-folder reload fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        handlerDeps.reloadDirFromDisk.mockRejectedValueOnce(new Error('reload failed'))
        // AS-2：必须是真实存在的目录才能进入 reload 分支（原 D:\notes 会被校验拒绝）
        await getOnHandler('baize:file:open-specific-folder')(makeEvent(), validWorkspace)
        expect(consoleError).toHaveBeenCalled()
        expect(win.webContents.send).toHaveBeenCalledWith('baize:status-bar:update', {
            message: expect.stringContaining('reload failed'),
            type: 'error'
        })
        consoleError.mockRestore()
    })

    it('should log and notify the status bar when the welcome directory dialog fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        electronMocks.showOpenDialog.mockRejectedValueOnce(new Error('dialog broken'))
        await getOnHandler('baize:file:welcome-open-directory')(makeEvent())
        expect(consoleError).toHaveBeenCalled()
        expect(win.webContents.send).toHaveBeenCalledWith('baize:status-bar:update', {
            message: expect.stringContaining('dialog broken'),
            type: 'error'
        })
        consoleError.mockRestore()
    })

    it('should rethrow and log handle errors for import-new-file', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        handlerDeps.importCreateNewFile.mockRejectedValueOnce(new Error('import failed'))
        await expect(getHandleHandler('baize:file:import')(makeEvent(), 'content')).rejects.toThrow(
            'import failed'
        )
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })

    it('should rethrow and log handle errors for create-file-folder', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        handlerDeps.createFileFolder.mockRejectedValueOnce(new Error('create failed'))
        await expect(
            getHandleHandler('baize:file:create-entry')(makeEvent(), 'n', 'D:\\dir', true, 'md')
        ).rejects.toThrow('create failed')
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })
})

describe('file operation handlers', () => {
    it('should delegate import-new-file and return its result', async () => {
        handlerDeps.importCreateNewFile.mockResolvedValue('imported')
        await expect(getHandleHandler('baize:file:import')(makeEvent(), 'content')).resolves.toBe(
            'imported'
        )
        expect(handlerDeps.importCreateNewFile).toHaveBeenCalledWith(win, 'content')
    })

    it('should create a file/folder and report success', async () => {
        handlerDeps.createFileFolder.mockResolvedValue(undefined)
        await expect(
            getHandleHandler('baize:file:create-entry')(makeEvent(), 'n', 'D:\\dir', true, 'md')
        ).resolves.toEqual({ success: true })
        expect(handlerDeps.createFileFolder).toHaveBeenCalledWith('n', 'D:\\dir', true, 'md')
    })

    it('should return the current file directory', () => {
        handlerDeps.getCurrentFileDirectory.mockReturnValue('D:\\dir')
        expect(getHandleHandler('baize:file:get-current-path')(makeEvent())).toBe('D:\\dir')
    })

    it('should delegate select-directory to SelectDirectory', async () => {
        handlerDeps.selectDirectory.mockResolvedValue('D:\\picked')
        await expect(getHandleHandler('baize:file:select-directory')(makeEvent())).resolves.toBe(
            'D:\\picked'
        )
        expect(handlerDeps.selectDirectory).toHaveBeenCalledWith(win)
    })
})

// 「文件」菜单 → 最近文件 / 最近文件夹（RECENT_LIST / OPEN_RECENT）
// 覆盖：列表读取与 20 项截断、异常容错、参数校验、最近列表白名单拒绝、
// 文件走 OpenSelectFile、文件夹走 AS-2 校验 + 复用目录打开实现、异常转失败结果。
describe('recent files/folders menu handlers', () => {
    function recentListHandler(): AnyFn {
        return getHandleHandler('baize:file:recent-list')
    }

    function openRecentHandler(): AnyFn {
        return getHandleHandler('baize:file:open-recent')
    }

    function makeRecentFiles(count: number): string[] {
        return Array.from({ length: count }, (_, index) => `C:\\notes\\recent-${index}.md`)
    }

    function makeRecentFolders(count: number): string[] {
        return Array.from({ length: count }, (_, index) => `C:\\workspace\\recent-${index}`)
    }

    describe('RECENT_LIST', () => {
        it('should return recent files and folders capped at 20 entries', async () => {
            handlerDeps.getRecentFiles.mockReturnValue(makeRecentFiles(25))
            configManagerDeps.readConfig.mockResolvedValue(makeRecentFolders(25))

            const result = await recentListHandler()(makeEvent())

            expect(configManagerDeps.readConfig).toHaveBeenCalledWith('recent-folders')
            expect(result).toEqual({
                files: makeRecentFiles(25).slice(0, 20),
                folders: makeRecentFolders(25).slice(0, 20)
            })
        })

        it('should ignore non-string entries in the recent-folders config', async () => {
            handlerDeps.getRecentFiles.mockReturnValue([])
            configManagerDeps.readConfig.mockResolvedValue([validWorkspace, 42, null, '', 'D:\\x'])

            const result = await recentListHandler()(makeEvent())

            expect(result).toEqual({ files: [], folders: [validWorkspace, 'D:\\x'] })
        })

        it('should tolerate broken recent storage (empty lists, no throw)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            handlerDeps.getRecentFiles.mockImplementation(() => {
                throw new Error('fileState store broken')
            })
            configManagerDeps.readConfig.mockRejectedValue(new Error('recent-folders read failed'))

            await expect(recentListHandler()(makeEvent())).resolves.toEqual({
                files: [],
                folders: []
            })
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should reject untrusted senders', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const result = await recentListHandler()({ sender: { id: 999 } })
            expect(result).toEqual(expect.objectContaining({ ok: false, code: 'untrusted-sender' }))
            consoleWarn.mockRestore()
        })
    })

    describe('OPEN_RECENT', () => {
        it('should reject malformed payloads (kind/path validation)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const handler = openRecentHandler()
            const invalidPayloads: unknown[] = [
                undefined,
                null,
                'not-an-object',
                { kind: 'directory', path: existingFilePath },
                { kind: 'file', path: '' },
                { kind: 'file', path: 42 },
                { kind: 'file', path: `C:\\${'x'.repeat(4096)}` },
                { kind: 'folder' }
            ]

            for (const payload of invalidPayloads) {
                const result = await handler(makeEvent(), payload)
                expect(result, `payload=${JSON.stringify(payload)}`).toEqual(
                    expect.objectContaining({ ok: false })
                )
            }
            expect(handlerDeps.openSelectFile).not.toHaveBeenCalled()
            expect(startupRestoreDeps.openDirectoryInMainView).not.toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should reject a file path that is not in the current recent list (whitelist)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            handlerDeps.getRecentFiles.mockReturnValue([existingFilePath])

            const result = await openRecentHandler()(makeEvent(), {
                kind: 'file',
                path: path.join(tempBase, 'not-in-recent-list.md')
            })

            expect(result).toEqual(expect.objectContaining({ ok: false }))
            expect((result as { message?: string }).message).toContain('最近列表已变化')
            expect(handlerDeps.openSelectFile).not.toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should open a recent file through OpenSelectFile with parsed name', async () => {
            handlerDeps.getRecentFiles.mockReturnValue([existingFilePath])
            handlerDeps.parserFileName.mockReturnValue('note.md')
            handlerDeps.openSelectFile.mockResolvedValue(undefined)

            const result = await openRecentHandler()(makeEvent(), {
                kind: 'file',
                path: existingFilePath
            })

            expect(result).toEqual({ ok: true })
            expect(handlerDeps.openSelectFile).toHaveBeenCalledWith({
                name: 'note.md',
                path: existingFilePath,
                type: 'file',
                content: ''
            })
        })

        it('should reject a recent file that no longer exists on disk', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const goneFile = path.join(tempBase, 'gone.md')
            handlerDeps.getRecentFiles.mockReturnValue([goneFile])

            const result = await openRecentHandler()(makeEvent(), {
                kind: 'file',
                path: goneFile
            })

            expect(result).toEqual(expect.objectContaining({ ok: false }))
            expect(handlerDeps.openSelectFile).not.toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should validate the workspace root and reuse the directory open chain for folders', async () => {
            configManagerDeps.readConfig.mockResolvedValue([validWorkspace])
            startupRestoreDeps.openDirectoryInMainView.mockResolvedValue(undefined)

            const result = await openRecentHandler()(makeEvent(), {
                kind: 'folder',
                path: validWorkspace
            })

            expect(result).toEqual({ ok: true })
            // 「最近文件夹」复用启动恢复的目录打开实现（WELCOME_ENTER_MAIN 时序由该模块负责）
            expect(startupRestoreDeps.openDirectoryInMainView).toHaveBeenCalledWith(
                win,
                validWorkspace
            )
        })

        it('should reject a recent folder that fails the workspace root check', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const goneFolder = path.join(tempBase, 'gone-folder')
            configManagerDeps.readConfig.mockResolvedValue([goneFolder])

            const result = await openRecentHandler()(makeEvent(), {
                kind: 'folder',
                path: goneFolder
            })

            expect(result).toEqual(expect.objectContaining({ ok: false }))
            expect((result as { message?: string }).message).toContain('工作目录')
            expect(startupRestoreDeps.openDirectoryInMainView).not.toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should reject a folder that is not in the current recent list (whitelist)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            configManagerDeps.readConfig.mockResolvedValue([validWorkspace])

            const result = await openRecentHandler()(makeEvent(), {
                kind: 'folder',
                path: path.join(tempBase, 'other-workspace')
            })

            expect(result).toEqual(expect.objectContaining({ ok: false }))
            expect(startupRestoreDeps.openDirectoryInMainView).not.toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should convert unexpected errors into a failure result with status bar hint', async () => {
            handlerDeps.getRecentFiles.mockReturnValue([existingFilePath])
            handlerDeps.parserFileName.mockReturnValue('note.md')
            handlerDeps.openSelectFile.mockRejectedValue(new Error('open exploded'))
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

            const result = await openRecentHandler()(makeEvent(), {
                kind: 'file',
                path: existingFilePath
            })

            expect(result).toEqual(
                expect.objectContaining({
                    ok: false,
                    message: expect.stringContaining('open exploded')
                })
            )
            expect(win.webContents.send).toHaveBeenCalledWith(
                'baize:status-bar:update',
                expect.objectContaining({ type: 'error' })
            )
            consoleError.mockRestore()
            consoleWarn.mockRestore()
        })

        it('should reject untrusted senders without opening anything', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            handlerDeps.getRecentFiles.mockReturnValue([existingFilePath])

            const result = await openRecentHandler()(
                { sender: { id: 999 } },
                { kind: 'file', path: existingFilePath }
            )

            expect(result).toEqual(expect.objectContaining({ ok: false, code: 'untrusted-sender' }))
            expect(handlerDeps.openSelectFile).not.toHaveBeenCalled()
            consoleWarn.mockRestore()
        })
    })
})

describe('misc handlers', () => {
    it('should return the OS info string', () => {
        expect(getHandleHandler('baize:system:get-info')(makeEvent())).toBe(
            `${os.type()} ${os.arch()} ${os.release()}`
        )
    })

    it('should delegate load-monaco-theme to getMonacoThemeData', () => {
        handlerDeps.getMonacoThemeData.mockReturnValue({ base: 'vs-dark' })
        expect(getHandleHandler('baize:theme:load-monaco')(makeEvent(), 'vs-dark')).toEqual({
            base: 'vs-dark'
        })
        expect(handlerDeps.getMonacoThemeData).toHaveBeenCalledWith('vs-dark')
    })

    it('should delegate get-editor-setting to getEditorSetting', () => {
        handlerDeps.getEditorSetting.mockReturnValue({ fontSize: 14 })
        expect(getHandleHandler('baize:editor:get-setting')(makeEvent())).toEqual({ fontSize: 14 })
    })

    // AS-6：查询类 handle 通道补 sender 校验
    it('should reject untrusted senders on query channels (AS-6)', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const foreign = { sender: { id: 999 } }
        const results = [
            getHandleHandler('baize:system:get-info')(foreign),
            getHandleHandler('baize:theme:load-monaco')(foreign, 'vs-dark'),
            getHandleHandler('baize:editor:get-setting')(foreign),
            getHandleHandler('baize:file:get-current-path')(foreign)
        ]
        for (const result of results) {
            expect(result).toEqual(expect.objectContaining({ ok: false, code: 'untrusted-sender' }))
        }
        expect(handlerDeps.getMonacoThemeData).not.toHaveBeenCalled()
        expect(handlerDeps.getEditorSetting).not.toHaveBeenCalled()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })
})

describe('auto save setting handler', () => {
    it('should start the auto save timer with the payload interval', () => {
        getHandleHandler('baize:setting:auto-save-changed')(makeEvent(), {
            autoSaveEnabled: true,
            autoSaveInterval: 10
        })
        expect(handlerDeps.startAutoSaveFileTime).toHaveBeenCalledWith(10000)
    })

    it('should default to 60 seconds when the interval is missing', () => {
        getHandleHandler('baize:setting:auto-save-changed')(makeEvent(), { autoSaveEnabled: true })
        expect(handlerDeps.startAutoSaveFileTime).toHaveBeenCalledWith(60000)
    })

    it('should default to 60 seconds when the interval is below 5', () => {
        getHandleHandler('baize:setting:auto-save-changed')(makeEvent(), {
            autoSaveEnabled: true,
            autoSaveInterval: 3
        })
        expect(handlerDeps.startAutoSaveFileTime).toHaveBeenCalledWith(60000)
    })

    it('should stop the auto save timer when disabled', () => {
        getHandleHandler('baize:setting:auto-save-changed')(makeEvent(), { autoSaveEnabled: false })
        expect(handlerDeps.stopAutoSaveFileTime).toHaveBeenCalled()
        expect(handlerDeps.startAutoSaveFileTime).not.toHaveBeenCalled()
    })

    it('should ignore invalid payloads', () => {
        const handler = getHandleHandler('baize:setting:auto-save-changed')
        handler(makeEvent() as never, undefined)
        handler(makeEvent() as never, 'not-an-object')
        expect(handlerDeps.startAutoSaveFileTime).not.toHaveBeenCalled()
        expect(handlerDeps.stopAutoSaveFileTime).not.toHaveBeenCalled()
    })
})

describe('P1-FE-04 quick links save handler', () => {
    function makeItem(overrides: Record<string, unknown> = {}) {
        return {
            id: 'github',
            name: 'GitHub',
            type: 'url',
            path: 'https://github.com',
            icon: 'text',
            iconContent: 'G',
            enabled: true,
            order: 1,
            position: 'left',
            ...overrides
        }
    }

    it('should persist normalized quick links and broadcast UPDATED', async () => {
        const normalized = [makeItem()]
        quickLinkDeps.normalizeQuickLinkItems.mockReturnValue(normalized)

        const result = await getHandleHandler('baize:quick-links:save')(makeEvent(), [
            makeItem({ order: 99 })
        ])

        // 主进程以归一化结果为准：排序/形状由 normalizeQuickLinkItems 统一
        expect(quickLinkDeps.normalizeQuickLinkItems).toHaveBeenCalledWith([
            makeItem({ order: 99 })
        ])
        expect(quickLinkDeps.saveQuickLinks).toHaveBeenCalledWith(normalized)
        // 保存成功后向主窗口广播 UPDATED（NaviTab 据此即时刷新）
        expect(win.webContents.send).toHaveBeenCalledWith('baize:quick-links:updated', normalized)
        expect(result).toEqual({ ok: true, links: normalized })
    })

    it('should reject invalid payloads without persisting or broadcasting', async () => {
        quickLinkDeps.normalizeQuickLinkItems.mockReturnValue(null)

        const result = await getHandleHandler('baize:quick-links:save')(makeEvent(), 'not-an-array')

        expect(result).toEqual({ ok: false, reason: 'invalid-payload' })
        expect(quickLinkDeps.saveQuickLinks).not.toHaveBeenCalled()
        expect(win.webContents.send).not.toHaveBeenCalled()
    })

    it('should keep the saved result when broadcasting fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const normalized = [makeItem()]
        quickLinkDeps.normalizeQuickLinkItems.mockReturnValue(normalized)
        win.webContents.send.mockImplementation(() => {
            throw new Error('webContents destroyed')
        })

        const result = await getHandleHandler('baize:quick-links:save')(makeEvent(), [makeItem()])

        expect(quickLinkDeps.saveQuickLinks).toHaveBeenCalledWith(normalized)
        expect(result).toEqual({ ok: true, links: normalized })
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })

    it('should reject untrusted senders', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = await getHandleHandler('baize:quick-links:save')({ sender: { id: 999 } }, [
            makeItem()
        ])
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'untrusted-sender' }))
        expect(quickLinkDeps.saveQuickLinks).not.toHaveBeenCalled()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })
})

describe('P1-FE-03 select image handler', () => {
    interface SelectImageResultLike {
        canceled: boolean
        filePath: string | null
        imageSrc: string | null
    }

    const imagesDirectory = (): string => path.join(validWorkspace, 'images')

    /** 构造「已打开工作区内笔记」场景（复制目标 images/ 受工作区根保护） */
    function prepareActiveFile(): void {
        appState.rootPath = validWorkspace
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(validWorkspace, 'note.md'),
            type: 'file'
        }
    }

    async function callSelectImage(): Promise<SelectImageResultLike> {
        const result = await getHandleHandler('baize:file:select-image')(makeEvent())
        return result as SelectImageResultLike
    }

    beforeEach(() => {
        // 每个用例从干净的 images/ 开始，避免同名/残留文件互相干扰
        fs.rmSync(imagesDirectory(), { recursive: true, force: true })
    })

    it('should open the system dialog filtered to image files', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [existingImagePath]
        })
        prepareActiveFile()

        await callSelectImage()

        expect(electronMocks.showOpenDialog).toHaveBeenCalledWith(
            win,
            expect.objectContaining({
                properties: ['openFile'],
                filters: [
                    expect.objectContaining({
                        extensions: expect.arrayContaining(['png', 'jpg', 'jpeg', 'gif', 'webp'])
                    })
                ]
            })
        )
    })

    it('should return the selected path, copy it into images/ and register it as trusted', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [existingImagePath]
        })
        prepareActiveFile()

        const result = await callSelectImage()

        expect(result.canceled).toBe(false)
        expect(result.filePath).toBe(existingImagePath)
        // 返回可直接写入 Markdown 的相对引用（复制成功时不再使用绝对路径）
        expect(result.imageSrc).toMatch(/^\.\/images\/.+\.png$/)
        const copiedPath = path.join(
            imagesDirectory(),
            (result.imageSrc as string).replace(/^\.\/images\//, '')
        )
        expect(fs.existsSync(copiedPath)).toBe(true)
        expect(fs.readFileSync(copiedPath)).toEqual(fs.readFileSync(existingImagePath))
        // 系统对话框返回的路径必须登记为受信，路径守卫才会放行后续文件操作
        expect(getTrustedPathsForTesting().files).toContain(existingImagePath)
    })

    it('should report cancel without copying or registering trust', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
        prepareActiveFile()

        const result = await callSelectImage()

        expect(result).toEqual({ canceled: true, filePath: null, imageSrc: null })
        expect(fs.existsSync(imagesDirectory())).toBe(false)
        expect(getTrustedPathsForTesting().files).not.toContain(existingImagePath)
    })

    it('should fall back to the absolute path when no file is open', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [existingImagePath]
        })
        appState._resetForTesting()
        // 结构优化第 2 批 2.4（M1）：_resetForTesting 会整体复位 AppContext（含主窗口），
        // 本用例只关心「无活动文件」状态，复位后需重新登记受信主窗口（sender 校验依据）。
        setMainWindow(win as never)

        const result = await callSelectImage()

        expect(result.filePath).toBe(existingImagePath)
        expect(result.imageSrc).toBe(existingImagePath)
        expect(fs.existsSync(imagesDirectory())).toBe(false)
    })

    it('should fall back to the absolute path when images/ is outside the trusted roots', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [existingImagePath]
        })
        appState.rootPath = validWorkspace
        // 活动文件位于工作区/临时目录之外：images/ 写入必须被路径守卫拒绝并回退
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(process.cwd(), 'untrusted-workspace', 'note.md'),
            type: 'file'
        }

        const result = await callSelectImage()

        expect(result.imageSrc).toBe(existingImagePath)
        expect(fs.existsSync(path.join(process.cwd(), 'untrusted-workspace', 'images'))).toBe(false)
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    it('should reject untrusted senders without opening the dialog', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = await getHandleHandler('baize:file:select-image')({ sender: { id: 999 } })

        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'untrusted-sender' }))
        expect(electronMocks.showOpenDialog).not.toHaveBeenCalled()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    it('should log and rethrow dialog errors to the invoke caller', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        electronMocks.showOpenDialog.mockRejectedValueOnce(new Error('dialog broken'))

        await expect(getHandleHandler('baize:file:select-image')(makeEvent())).rejects.toThrow(
            'dialog broken'
        )
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })
})

describe('P1/N-05 sender authorization', () => {
    const foreignEvent = { sender: { id: 999 } }

    it('should reject menu actions from an untrusted sender', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        getOnHandler('baize:menu:action')(foreignEvent, 'baize:menu:file:save')
        expect(handlerDeps.handleBaiZeMenuAction).not.toHaveBeenCalled()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    it('should reject file open/import/write channels from an untrusted sender', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        await getOnHandler('baize:file:open-specific-folder')(foreignEvent, 'D:\\\\evil')
        await getOnHandler('baize:file:welcome-open-directory')(foreignEvent)
        await getOnHandler('baize:file:welcome-open-file')(foreignEvent)
        const importResult = await getHandleHandler('baize:file:import')(foreignEvent, 'content')
        const createResult = await getHandleHandler('baize:file:create-entry')(
            foreignEvent,
            'n',
            'D:\\\\dir',
            true,
            'md'
        )
        expect(handlerDeps.reloadDirFromDisk).not.toHaveBeenCalled()
        expect(handlerDeps.saveLastOpenedDirectory).not.toHaveBeenCalled()
        expect(handlerDeps.openSelectFile).not.toHaveBeenCalled()
        expect(handlerDeps.importCreateNewFile).not.toHaveBeenCalled()
        expect(handlerDeps.createFileFolder).not.toHaveBeenCalled()
        // handle 通道统一返回错误对象（invoke 调用方可判别，不执行落盘）
        expect(importResult).toEqual(
            expect.objectContaining({ ok: false, code: 'untrusted-sender' })
        )
        expect(createResult).toEqual(
            expect.objectContaining({ ok: false, code: 'untrusted-sender' })
        )
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    it('should accept the registered main window sender for high-risk channels', () => {
        getOnHandler('baize:menu:action')(makeEvent(), 'baize:menu:file:save')
        expect(handlerDeps.handleBaiZeMenuAction).toHaveBeenCalledWith('baize:menu:file:save', win)
    })
})

describe('P1/C-04 IPC listener inventory', () => {
    it('should track guarded on/handle channels in the listener inventory', () => {
        const inventory = ipcListenerManager.getInventory()
        const onChannels = [
            'baize:menu:action',
            'baize:file:open-specific-folder',
            'baize:file:welcome-open-directory',
            'baize:file:welcome-open-file'
        ]
        const handleChannels = [
            'baize:file:import',
            'baize:file:create-entry',
            'baize:file:select-directory',
            'baize:setting:auto-save-changed'
        ]
        for (const channel of onChannels) {
            const entry = inventory.find((item) => item.channel === channel)
            expect(entry, `台账应包含 on 通道 ${channel}`).toMatchObject({
                kind: 'on',
                persistent: true
            })
            expect(entry?.components).toContain('global-ipc-handlers')
        }
        for (const channel of handleChannels) {
            const entry = inventory.find((item) => item.channel === channel)
            expect(entry, `台账应包含 handle 通道 ${channel}`).toMatchObject({
                kind: 'handle',
                persistent: true
            })
            expect(entry?.components).toContain('global-ipc-handlers')
        }
    })

    it('should clean up non-persistent component listeners via cleanupAll', () => {
        ipcListenerManager.register('baize:test:component-channel', vi.fn(), 'p1-test-component')
        expect(
            ipcListenerManager
                .getInventory()
                .some((item) => item.channel === 'baize:test:component-channel')
        ).toBe(true)
        ipcListenerManager.cleanupAll()
        expect(
            ipcListenerManager
                .getInventory()
                .some((item) => item.channel === 'baize:test:component-channel')
        ).toBe(false)
        // persistent（进程级）注册按 MEM-10 设计保留，但仍可在台账中查到
        expect(
            ipcListenerManager.getInventory().some((item) => item.channel === 'baize:menu:action')
        ).toBe(true)
    })
})

describe('main window tracking', () => {
    it('should set and get the current main window', () => {
        const tracked = makeWindow()
        setMainWindow(tracked as never)
        expect(getMainWindow()).toBe(tracked)
    })
})

describe('ipc/index re-exports', () => {
    it('should re-export the handlers module functions consumed by main/index.ts', () => {
        expect(ipcIndex.registerIpcHandlers).toBe(registerIpcHandlers)
        expect(ipcIndex.setMainWindow).toBe(setMainWindow)
    })

    it('should not re-export dead symbols (A-5/ARC-15)', () => {
        // getMainWindow 无任何 src 消费方；HandleBaiZeMenuAction 由 handlers.ts 直接
        // import，均属死 re-export，已清理
        expect('getMainWindow' in ipcIndex).toBe(false)
        expect('HandleBaiZeMenuAction' in ipcIndex).toBe(false)
    })
})
