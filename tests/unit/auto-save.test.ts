import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import { Module } from 'node:module'

// CMP-30：自动保存状态栏提示经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// ============ electron 与外围依赖 mock ============
// 自动保存的定时回调会动态 require('./file-operations')，因此需要完整的 electron mock
const electronMocks = vi.hoisted(() => ({
    getAllWindows: vi.fn(),
    windowSend: vi.fn(),
    mainSend: vi.fn(),
    showMessageBoxSync: vi.fn(),
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn()
}))

vi.mock('electron', () => {
    class MockBrowserWindow {
        static getAllWindows = electronMocks.getAllWindows
        webContents = { send: electronMocks.windowSend }
    }
    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showMessageBoxSync: electronMocks.showMessageBoxSync,
            showSaveDialog: electronMocks.showSaveDialog,
            showOpenDialog: electronMocks.showOpenDialog
        },
        shell: { showItemInFolder: vi.fn() },
        clipboard: { writeText: vi.fn() },
        app: { getPath: () => '', getVersion: () => '1.0.0-test' },
        ipcMain: { on: () => {} }
    }
})

// 避免真实 logger 在模块加载时创建日志目录与写流
vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

// 避免 electron-store 实例化（ARC-11：file-operations 直接依赖 file-state-store）
vi.mock('../../src/main/utils/file-state-store', () => ({
    saveLastOpenedFile: vi.fn(),
    saveLastOpenedDirectory: vi.fn()
}))

import { appState } from '../../src/main/utils/app-state'
import {
    StartAutoSaveFileTime,
    StopAutoSaveFileTime,
    IsAutoSaveRunning
} from '../../src/main/utils/file-utils/auto-save'
// 显式导入被测的 file-operations，确保其真实模块已进入 vitest 模块图，
// 供桥接文件通过 __vitest_worker__.evaluatedModules 转发调用
import '../../src/main/utils/file-utils/file-operations'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let tmpDir = ''
let bridgePath = ''

// Node 内部私有解析钩子：@types/node 未公开声明 _resolveFilename，
// 测试需要临时改写它来把 CJS require 重定向到桥接文件，故用局部接口收口（TS2339）。
interface ModuleInternals {
    _resolveFilename(request: string, parent: NodeModule | null, ...rest: unknown[]): string
}

const moduleInternals = Module as unknown as ModuleInternals

let originalResolveFilename: ModuleInternals['_resolveFilename'] | null = null

// 桥接文件内容：源码 auto-save.ts 中 require('./file-operations') 走 Node 原生 CJS 解析，
// 在 vitest 下无法解析 .ts 源文件；这里把该请求重定向到临时桥接 .js，
// 桥接文件再从 vitest 模块图中取出真实的 file-operations 模块转发 SaveActiveFile 调用。
const bridgeCode = `
// 由 tests/unit/auto-save.test.ts 在临时目录生成并注册的桥接文件
const state = globalThis.__vitest_worker__
const modMap = state && state.evaluatedModules && state.evaluatedModules.idToModuleMap
let realExports = null
if (modMap) {
    for (const node of modMap.values()) {
        if (node && node.exports && typeof node.exports.SaveActiveFile === 'function') {
            realExports = node.exports
            break
        }
    }
}
if (!realExports) {
    throw new Error('[auto-save-test] bridge cannot find file-operations in the vitest module graph')
}
module.exports = {
    SaveActiveFile: function () {
        return Promise.resolve(realExports.SaveActiveFile())
    }
}
`

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-test-'))
    bridgePath = path.join(tmpDir, 'auto-save-bridge.js')
    await fs.writeFile(bridgePath, bridgeCode, 'utf8')

    // 仅拦截 auto-save.ts 发出的 './file-operations' 相对请求，其余解析原样透传
    originalResolveFilename = moduleInternals._resolveFilename
    moduleInternals._resolveFilename = function (
        this: unknown,
        request: string,
        parent: NodeModule | null,
        ...rest: unknown[]
    ) {
        if (
            request === './file-operations' &&
            parent &&
            typeof parent.filename === 'string' &&
            parent.filename.endsWith('auto-save.ts')
        ) {
            return bridgePath
        }
        return (originalResolveFilename as ModuleInternals['_resolveFilename']).call(
            this as never,
            request,
            parent,
            ...rest
        )
    }
})

afterAll(async () => {
    StopAutoSaveFileTime()
    if (originalResolveFilename) {
        moduleInternals._resolveFilename = originalResolveFilename
    }
    await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
    vi.clearAllMocks()
    StopAutoSaveFileTime()
    appState._resetForTesting()
    appState.mainWindow = {
        webContents: { send: electronMocks.mainSend }
    } as unknown as Electron.BrowserWindow
    electronMocks.getAllWindows.mockReturnValue([])
})

afterEach(() => {
    // 每个用例结束确保定时器被清理，避免泄漏到后续用例
    StopAutoSaveFileTime()
    appState._resetForTesting()
    // 若存在已进入保存流程的在途回调，重置后仍需窗口 mock，
    // 避免失败路径里 showErrorMessageBox 对 null 解引用产生噪音报错
    appState.mainWindow = {
        webContents: { send: electronMocks.mainSend }
    } as unknown as Electron.BrowserWindow
})

describe('StartAutoSaveFileTime / StopAutoSaveFileTime state', () => {
    it('should start with default interval and update state', () => {
        StartAutoSaveFileTime()
        expect(appState.saveFileInterval).toBe('30000')
        expect(appState.savingFile).toBe(true)
        expect(IsAutoSaveRunning()).toBe(true)

        StopAutoSaveFileTime()
        expect(IsAutoSaveRunning()).toBe(false)
        expect(appState.savingFile).toBe(false)
    })

    it('should restart when called twice and keep the latest interval', () => {
        StartAutoSaveFileTime(1000)
        StartAutoSaveFileTime(2000)
        expect(appState.saveFileInterval).toBe('2000')
        expect(IsAutoSaveRunning()).toBe(true)

        StopAutoSaveFileTime()
        expect(IsAutoSaveRunning()).toBe(false)
    })

    it('should not touch savingFile when stopping while not running', () => {
        appState.savingFile = true
        StopAutoSaveFileTime()
        expect(IsAutoSaveRunning()).toBe(false)
        expect(appState.savingFile).toBe(true)
    })
})

describe('auto-save behavior with real timers', () => {
    it('should save a dirty file to disk when the interval fires', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'auto.md')
        await fs.writeFile(filePath, 'v1', 'utf8')
        appState.currentActiveFile = {
            name: 'auto.md',
            path: filePath,
            type: 'file',
            content: 'v1',
            encoding: 'utf-8'
        }
        appState.markFileLoaded('v1')
        appState.syncFileContent('v2')

        StartAutoSaveFileTime(30)
        await sleep(300)
        StopAutoSaveFileTime()

        expect(await fs.readFile(filePath, 'utf8')).toBe('v2')
        expect(appState.isDirty()).toBe(false)
    })

    it('should not write when the active file is clean', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'clean.md')
        await fs.writeFile(filePath, 'v1', 'utf8')
        appState.currentActiveFile = {
            name: 'clean.md',
            path: filePath,
            type: 'file',
            content: 'v1',
            encoding: 'utf-8'
        }
        appState.markFileLoaded('v1')

        StartAutoSaveFileTime(30)
        await sleep(300)
        StopAutoSaveFileTime()

        expect(await fs.readFile(filePath, 'utf8')).toBe('v1')
    })

    it('should keep running and do nothing when no file is open', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'untouched.md')
        await fs.writeFile(filePath, 'keep', 'utf8')

        StartAutoSaveFileTime(30)
        await sleep(150)

        expect(IsAutoSaveRunning()).toBe(true)
        expect(await fs.readFile(filePath, 'utf8')).toBe('keep')
        StopAutoSaveFileTime()
    })

    it('should notify failure when saving to an invalid path fails', async () => {
        const filePath = path.join(tmpDir, 'missing-dir', 'auto.md')
        appState.currentActiveFile = {
            name: 'auto.md',
            path: filePath,
            type: 'file',
            content: 'x',
            encoding: 'utf-8'
        }
        appState.markFileLoaded('')
        appState.syncFileContent('x') // 置脏以触发保存

        StartAutoSaveFileTime(30)
        await sleep(300)
        StopAutoSaveFileTime()

        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })
})
