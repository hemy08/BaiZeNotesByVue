/**
 * P0-B：自动保存开关通道（DIALOG.AUTO_SAVE_CHANGED）双端模式回归测试
 *
 * 背景：该通道主进程侧经 ipcListenerManager.registerHandleOnce（即 ipcMain.handle）注册，
 * 只有 ipcRenderer.invoke 才能触达；渲染层原先用 ipcRenderer.send → 切换开关静默失效。
 *
 * 本文件覆盖：
 * 1. 主进程侧：通道以 handle 方式注册（不是 on），handler 返回 { ok } 成功标志，
 *    并保持既有启停定时器 + 间隔兜底校验行为不变；
 * 2. 双端契约：源码级断言渲染层用 invoke、主进程用 registerHandleOnce，禁止回退为 send。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../..')

interface Registration {
    channel: string
    listener: (...args: never[]) => unknown
    kind: 'on' | 'handle'
}

// mock ipcListenerManager：用内存表替代真实 Electron ipcMain.handle/on 注册，
// 便于断言"注册成了 handle 还是 on"并直接取到 handler 调用。
const mocks = vi.hoisted(() => {
    const registrations: Registration[] = []
    return {
        registrations,
        registerHandleOnce: vi.fn((channel: string, listener: (...args: never[]) => unknown) => {
            registrations.push({ channel, listener, kind: 'handle' })
            return `handle:${channel}`
        }),
        registerOnce: vi.fn((channel: string, listener: (...args: never[]) => unknown) => {
            registrations.push({ channel, listener, kind: 'on' })
            return `on:${channel}`
        }),
        startAutoSaveFileTime: vi.fn(),
        stopAutoSaveFileTime: vi.fn()
    }
})

vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: {
        registerHandleOnce: mocks.registerHandleOnce,
        registerOnce: mocks.registerOnce,
        register: vi.fn()
    }
}))

vi.mock('../../src/main/ipc/menu-handle', () => ({ HandleBaiZeMenuAction: vi.fn() }))
vi.mock('../../src/main/config', () => ({ getMonacoThemeData: vi.fn(), getEditorSetting: vi.fn() }))
// P1-FE-04：handlers.ts 新增快捷链接保存 handler 后直接导入 quick-link-config；
// 本测试只覆盖自动保存通道，mock 掉该模块避免拉起 electron-store/theme-registry 依赖链
// （与上方 '../../src/main/config' barrel mock 保持同一隔离策略）。
vi.mock('../../src/main/config/quick-link-config', () => ({
    normalizeQuickLinkItems: vi.fn(() => []),
    saveQuickLinks: vi.fn()
}))
// tMain（状态栏错误提示）经系统设置读取语言，mock 掉避免拉起 electron-store 依赖链
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))
vi.mock('../../src/main/utils/file-utils', () => ({
    CreateFileFolder: vi.fn(),
    GetCurrentFileDirectory: vi.fn(),
    SelectDirectory: vi.fn(),
    StartAutoSaveFileTime: mocks.startAutoSaveFileTime,
    StopAutoSaveFileTime: mocks.stopAutoSaveFileTime,
    ReloadDirFromDisk: vi.fn(),
    OpenSelectFile: vi.fn(),
    ParserFileName: vi.fn(),
    ImportCreateNewFile: vi.fn()
}))
vi.mock('../../src/main/utils/file-state', () => ({ saveLastOpenedDirectory: vi.fn() }))
vi.mock('electron', () => ({
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    dialog: { showOpenDialog: vi.fn() }
}))

import { registerIpcHandlers } from '../../src/main/ipc/handlers'

const AUTO_SAVE_CHANNEL = 'baize:setting:auto-save-changed'

// P1/N-05：主进程 handler 统一校验发送方，测试桩需提供受信主窗口与事件 sender
const mainWindowStub = {
    webContents: { send: vi.fn() },
    isDestroyed: () => false
}
const trustedEvent = { sender: mainWindowStub.webContents }

function registerAndGetAutoSaveHandler(): (...args: never[]) => unknown {
    mocks.registrations.length = 0
    mocks.registerHandleOnce.mockClear()
    mocks.registerOnce.mockClear()
    mocks.startAutoSaveFileTime.mockClear()
    mocks.stopAutoSaveFileTime.mockClear()
    registerIpcHandlers(mainWindowStub as never)
    const registration = mocks.registrations.find((item) => item.channel === AUTO_SAVE_CHANNEL)
    expect(registration, `应注册 ${AUTO_SAVE_CHANNEL} 通道`).toBeDefined()
    return registration!.listener
}

describe('主进程 DIALOG.AUTO_SAVE_CHANGED handler 注册与返回语义', () => {
    let handler: (...args: never[]) => unknown

    beforeEach(() => {
        handler = registerAndGetAutoSaveHandler()
    })

    it('经 registerHandleOnce（ipcMain.handle）注册，且不额外注册 on 监听', () => {
        const registrations = mocks.registrations.filter(
            (item) => item.channel === AUTO_SAVE_CHANNEL
        )
        expect(registrations).toHaveLength(1)
        expect(registrations[0].kind).toBe('handle')
    })

    it('启用时按间隔启动定时器并返回 ok 成功标志', () => {
        const result = handler(
            trustedEvent as never,
            {
                autoSaveEnabled: true,
                autoSaveInterval: 10
            } as never
        )
        expect(mocks.startAutoSaveFileTime).toHaveBeenCalledWith(10000)
        expect(mocks.stopAutoSaveFileTime).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: true, autoSaveEnabled: true, autoSaveInterval: 10 })
    })

    it('禁用时停止定时器并返回 ok 成功标志', () => {
        const result = handler(trustedEvent as never, { autoSaveEnabled: false } as never)
        expect(mocks.stopAutoSaveFileTime).toHaveBeenCalled()
        expect(mocks.startAutoSaveFileTime).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: true, autoSaveEnabled: false })
    })

    it('间隔小于 5 或缺失时沿用 60 秒兜底（校验逻辑保持不变）', () => {
        const belowMin = handler(
            trustedEvent as never,
            {
                autoSaveEnabled: true,
                autoSaveInterval: 3
            } as never
        )
        expect(mocks.startAutoSaveFileTime).toHaveBeenCalledWith(60000)
        expect(belowMin).toEqual({ ok: true, autoSaveEnabled: true, autoSaveInterval: 60 })

        mocks.startAutoSaveFileTime.mockClear()
        const missing = handler(trustedEvent as never, { autoSaveEnabled: true } as never)
        expect(mocks.startAutoSaveFileTime).toHaveBeenCalledWith(60000)
        expect(missing).toEqual({ ok: true, autoSaveEnabled: true, autoSaveInterval: 60 })
    })

    it('非法 payload 不启停定时器，返回 ok:false 便于渲染层判断', () => {
        const result = handler(trustedEvent as never, undefined as never)
        expect(mocks.startAutoSaveFileTime).not.toHaveBeenCalled()
        expect(mocks.stopAutoSaveFileTime).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: false, reason: 'invalid-payload' })
    })

    it('P1/N-05：非主窗口 sender 的调用被拒绝且不启停定时器', () => {
        const result = handler(
            { sender: { id: 999 } } as never,
            {
                autoSaveEnabled: true,
                autoSaveInterval: 10
            } as never
        )
        expect(mocks.startAutoSaveFileTime).not.toHaveBeenCalled()
        expect(mocks.stopAutoSaveFileTime).not.toHaveBeenCalled()
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'untrusted-sender' }))
    })
})

describe('DIALOG.AUTO_SAVE_CHANGED 渲染层调用模式契约（源码级防回归）', () => {
    // ET-19 说明：这里保留 1 处源码级断言——渲染层「必须 invoke、不得退回 send」属于
    // 跨端调用模式契约，行为化验证需要挂载 SystemSettingDialog（jsdom + electronAPI mock），
    // 成本远高于收益；主进程侧「注册成 handle 而非 on」已由上方用例通过 mock 注册表
    // 行为化断言，因此删除原文件里重复的 handlers.ts 源码级断言。
    const rendererSource = fs.readFileSync(
        path.join(ROOT, 'src/renderer/src/components/dialogs/complex/SystemSettingDialog.vue'),
        'utf-8'
    )

    it('渲染层 handleAutoSaveChange 使用 invoke 且通道正确', () => {
        expect(rendererSource).toMatch(/ipcRenderer\.invoke\(\s*IPC\.DIALOG\.AUTO_SAVE_CHANGED/)
        // 防回归：不得再退回 send（send 消息进不了 ipcMain.handle 处理器）
        expect(rendererSource).not.toMatch(/ipcRenderer\.send\(\s*IPC\.DIALOG\.AUTO_SAVE_CHANGED/)
    })
})
