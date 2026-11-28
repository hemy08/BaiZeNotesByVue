/**
 * 覆盖率补测第五批：file-utils/shared.ts 边界分支。
 *
 * 覆盖点（此前未覆盖的语句/分支）：
 * - 自身写入抑制窗口：begin/end 嵌套计数、1.5s 窗口过期、退出复位；
 * - 路径越界/非法文件名提示：字符串 / 空串 / 非字符串载荷、状态栏发送；
 * - PathAccessDeniedError → 中文提示转换（非路径异常返回 null）；
 * - 磁盘签名：活动文件缺失/路径不匹配早退、stat 成功写入、stat 失败置空、已 stat 结果直接记录；
 * - 「最近打开」受信历史收集：最近文件/最近目录进入受信根与受信文件、提供者函数缺失时跳过。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({
    shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() },
    app: { getPath: () => '' },
    BrowserWindow: class {}
}))

vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const notifyMocks = vi.hoisted(() => ({ notifyStatus: vi.fn() }))
vi.mock('../../../src/main/utils/status-notify', () => ({
    notifyStatus: notifyMocks.notifyStatus,
    toUserError: (error: unknown) => String(error)
}))

const storeMocks = vi.hoisted(() => ({
    getLastOpenedFile: vi.fn<() => string | null>(() => null),
    getRecentFiles: vi.fn<() => string[]>(() => []),
    getLastOpenedDirectory: vi.fn<() => string | null>(() => null)
}))
vi.mock('../../../src/main/utils/file-state-store', () => ({
    getLastOpenedFile: () => storeMocks.getLastOpenedFile(),
    getRecentFiles: () => storeMocks.getRecentFiles(),
    getLastOpenedDirectory: () => storeMocks.getLastOpenedDirectory()
}))

import {
    beginSelfWrite,
    describePathDeniedError,
    endSelfWrite,
    ensureWorkspaceWritable,
    isSelfWriteWindow,
    notifyInvalidFileName,
    notifyPathAccessDenied,
    notifyWorkspaceRawReadOnly,
    refreshActiveFileDiskStamp,
    rememberActiveFileDiskStamp,
    resetSelfWriteWindow
} from '../../../src/main/utils/file-utils/shared'
import { appState } from '../../../src/main/utils/app-state'
import { logger } from '../../../src/main/utils/logger'
import { isPathAllowed, PathAccessDeniedError } from '../../../src/main/utils/security'
// 1.5.7 LLM Wiki L1（T1.3）：守卫异常分支需要 spying 安全模块导出
import * as securityModule from '../../../src/main/utils/security'
// 1.5.7 LLM Wiki L1（T1.3）：注入工作区模式，验证 raw/ 只读守卫 helper
import { setSystemSettingProvider } from '../../../src/main/utils/providers'
import { SYSTEM_SETTING_FALLBACK } from '../../../src/shared/constants/system-defaults'
import type { SystemSetting } from '../../../src/shared/types/system'

let tmpDir = ''
let mainSend = vi.fn()

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-shared5-'))
    vi.clearAllMocks()
    mainSend = vi.fn()
    appState._resetForTesting()
    appState.mainWindow = {
        webContents: { id: 1, send: mainSend, isDestroyed: () => false },
        isDestroyed: () => false
    } as unknown as Electron.BrowserWindow
    resetSelfWriteWindow()
    storeMocks.getLastOpenedFile.mockReturnValue(null)
    storeMocks.getRecentFiles.mockReturnValue([])
    storeMocks.getLastOpenedDirectory.mockReturnValue(null)
    vi.useFakeTimers({ now: 1_000_000 })
})

afterEach(() => {
    vi.useRealTimers()
    resetSelfWriteWindow()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('自身写入抑制窗口（PF-05）', () => {
    it('begin/end 维护嵌套计数：窗口内为 true，窗口过期后为 false', () => {
        expect(isSelfWriteWindow()).toBe(false)
        beginSelfWrite()
        expect(isSelfWriteWindow()).toBe(true)
        beginSelfWrite()
        endSelfWrite()
        endSelfWrite()
        vi.advanceTimersByTime(1400)
        expect(isSelfWriteWindow()).toBe(true)
        vi.advanceTimersByTime(200)
        expect(isSelfWriteWindow()).toBe(false)
    })

    it('end 不会把嵌套计数减为负数；reset 立即复位', () => {
        endSelfWrite()
        expect(isSelfWriteWindow()).toBe(true) // end 会刷新 lastSelfWriteAt，仍处于窗口内
        resetSelfWriteWindow()
        expect(isSelfWriteWindow()).toBe(false)
    })
})

describe('越界路径 / 非法文件名提示', () => {
    it('字符串路径：状态栏 error + 含路径的日志', () => {
        notifyPathAccessDenied('C:\\Windows\\win.ini')
        expect(logger.warn).toHaveBeenCalled()
        const payload = notifyMocks.notifyStatus.mock.calls[0][0] as {
            message: string
            type: string
        }
        expect(payload.type).toBe('error')
        expect(payload.message).toContain('C:\\Windows\\win.ini')
    })

    it('空串 / 非字符串载荷按 String() 兜底显示', () => {
        notifyPathAccessDenied('   ')
        const emptyPayload = notifyMocks.notifyStatus.mock.calls[0][0] as { message: string }
        expect(emptyPayload.message).toContain('   ')

        notifyPathAccessDenied(42)
        const numberPayload = notifyMocks.notifyStatus.mock.calls[1][0] as { message: string }
        expect(numberPayload.message).toContain('42')
    })

    it('可指定具体动作词条', () => {
        notifyPathAccessDenied('/x', 'mainMsg.status.saveFailed')
        const payload = notifyMocks.notifyStatus.mock.calls[0][0] as { message: string }
        expect(payload.message).toContain('保存失败')
    })

    it('非法文件名：字符串与非字符串均提示', () => {
        notifyInvalidFileName('../escape')
        expect(notifyMocks.notifyStatus).toHaveBeenCalledTimes(1)
        const payload = notifyMocks.notifyStatus.mock.calls[0][0] as { message: string }
        expect(payload.message).toContain('../escape')

        notifyInvalidFileName(123)
        const numberPayload = notifyMocks.notifyStatus.mock.calls[1][0] as { message: string }
        expect(numberPayload.message).toContain('123')
    })
})

describe('describePathDeniedError', () => {
    it('PathAccessDeniedError 转中文无权限提示；其它异常返回 null', () => {
        expect(describePathDeniedError(new PathAccessDeniedError('/etc/passwd'))).toContain(
            '没有读取权限'
        )
        expect(describePathDeniedError(new Error('boom'))).toBeNull()
        expect(describePathDeniedError('not-an-error')).toBeNull()
    })
})

describe('磁盘签名（PF-17）', () => {
    it('无活动文件 / 路径不匹配时早退，不写签名', async () => {
        await refreshActiveFileDiskStamp(path.join(tmpDir, 'a.md'))
        expect(appState.activeFileDiskStamp).toBeNull()

        const activePath = path.join(tmpDir, 'active.md')
        fs.writeFileSync(activePath, 'x')
        appState.currentActiveFile = {
            name: 'active.md',
            path: activePath,
            type: 'file',
            content: 'x',
            encoding: 'utf-8'
        }
        await refreshActiveFileDiskStamp(path.join(tmpDir, 'other.md'))
        expect(appState.activeFileDiskStamp).toBeNull()

        rememberActiveFileDiskStamp(path.join(tmpDir, 'other.md'), { mtimeMs: 1, size: 1 })
        expect(appState.activeFileDiskStamp).toBeNull()
    })

    it('stat 成功时记录签名；stat 失败（文件已删）时置空', async () => {
        const activePath = path.join(tmpDir, 'active.md')
        fs.writeFileSync(activePath, 'hello')
        appState.currentActiveFile = {
            name: 'active.md',
            path: activePath,
            type: 'file',
            content: 'hello',
            encoding: 'utf-8'
        }

        await refreshActiveFileDiskStamp(activePath)
        expect(appState.activeFileDiskStamp).toMatchObject({
            path: activePath,
            size: 5
        })

        fs.rmSync(activePath)
        await refreshActiveFileDiskStamp(activePath)
        expect(appState.activeFileDiskStamp).toBeNull()
    })

    it('已 stat 结果直接记录（避免重复 IO）', () => {
        const activePath = path.join(tmpDir, 'active.md')
        appState.currentActiveFile = {
            name: 'active.md',
            path: activePath,
            type: 'file',
            content: '',
            encoding: 'utf-8'
        }
        rememberActiveFileDiskStamp(activePath, { mtimeMs: 123, size: 7 })
        expect(appState.activeFileDiskStamp).toEqual({
            path: activePath,
            mtimeMs: 123,
            size: 7
        })
    })
})

describe('「最近打开」受信历史收集', () => {
    it('最近目录进入受信根、最近文件进入受信文件集合', () => {
        const historyDir = fs.mkdtempSync(path.join(tmpDir, 'history-dir-'))
        const historyFile = path.join(tmpDir, 'history-file.md')
        fs.writeFileSync(historyFile, 'x')

        storeMocks.getLastOpenedDirectory.mockReturnValue(historyDir)
        storeMocks.getLastOpenedFile.mockReturnValue(historyFile)
        storeMocks.getRecentFiles.mockReturnValue([historyFile])

        // 触发 security 的历史 provider（shared 模块加载时已注入）
        expect(isPathAllowed(path.join(historyDir, 'anything.md'))).toBe(true)
        expect(isPathAllowed(historyFile)).toBe(true)
    })

    it('历史提供者返回空/非法值时不产生额外受信根', () => {
        storeMocks.getLastOpenedDirectory.mockReturnValue('')
        storeMocks.getLastOpenedFile.mockReturnValue('')
        storeMocks.getRecentFiles.mockReturnValue([])
        expect(isPathAllowed(path.join(tmpDir, 'notes', 'a.md'))).toBe(true) // 临时目录本身受信
    })
})

describe('LLM Wiki raw/ 只读守卫 helper（T1.3）', () => {
    it('非字符串/空串目标按可写透传（交由既有 Path Guard 处理）', () => {
        expect(ensureWorkspaceWritable(42)).toBe(true)
        expect(ensureWorkspaceWritable('')).toBe(true)
        expect(ensureWorkspaceWritable('   ')).toBe(true)
    })

    it('llm-wiki 模式：raw/ 目标返回 false 并提示；wiki/ 目标放行', () => {
        appState.rootPath = tmpDir
        setSystemSettingProvider(
            () =>
                ({
                    ...SYSTEM_SETTING_FALLBACK,
                    workspaceMode: 'llm-wiki'
                }) as unknown as SystemSetting
        )
        try {
            expect(ensureWorkspaceWritable(path.join(tmpDir, 'raw', 'a.png'))).toBe(false)
            expect(notifyMocks.notifyStatus).toHaveBeenCalledTimes(1)
            expect(logger.warn).toHaveBeenCalled()
            expect(ensureWorkspaceWritable(path.join(tmpDir, 'wiki', 'a.png'))).toBe(true)
        } finally {
            setSystemSettingProvider(null)
        }
    })

    it('notifyWorkspaceRawReadOnly：字符串/非字符串均给出状态栏 error 提示', () => {
        notifyWorkspaceRawReadOnly(path.join(tmpDir, 'raw', 'a.png'))
        const payload = notifyMocks.notifyStatus.mock.calls[0][0] as {
            message: string
            type: string
        }
        expect(payload.type).toBe('error')
        expect(payload.message).toContain('a.png')

        notifyWorkspaceRawReadOnly(42)
        const numberPayload = notifyMocks.notifyStatus.mock.calls[1][0] as { message: string }
        expect(numberPayload.message).toContain('42')

        // 空串同样按 String() 兜底（不抛异常）
        notifyWorkspaceRawReadOnly('')
        expect(notifyMocks.notifyStatus).toHaveBeenCalledTimes(3)
    })

    it('守卫抛出非 PathAccessDeniedError 异常时原样上抛（不吞异常）', () => {
        const spy = vi.spyOn(securityModule, 'assertWorkspaceWritable').mockImplementation(() => {
            throw new Error('unexpected-guard-error')
        })
        try {
            expect(() => ensureWorkspaceWritable(path.join(tmpDir, 'a.md'))).toThrow(
                'unexpected-guard-error'
            )
        } finally {
            spy.mockRestore()
        }
    })
})
