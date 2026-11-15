/**
 * file-state.ts 单元测试
 * 覆盖：上次打开文件/目录的存取与清除、最近文件列表的去重/上限/删除/清空、
 * restoreLastOpenedFile 的存在/缺失/异常分支、resetFileState、损坏配置备份重建
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import { appState } from '../../src/main/utils/app-state'

const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: { userData: `${base}/baize-vitest-file-state/user-data` } as Record<string, string>
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => electronState.paths[name])
    },
    BrowserWindow: class {}
}))

vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})

const fileUtilsMocks = vi.hoisted(() => ({
    ReloadDirFromDisk: vi.fn(async () => {}),
    OpenSelectFile: vi.fn(async () => {})
}))

vi.mock('../../src/main/utils/file-utils/index', () => fileUtilsMocks)

import { FakeStore } from './helpers/fake-store'
import {
    saveLastOpenedFile,
    getLastOpenedFile,
    clearLastOpenedFile,
    saveLastOpenedDirectory,
    getLastOpenedDirectory,
    clearLastOpenedDirectory,
    getRecentFiles,
    clearRecentFiles,
    removeRecentFile,
    restoreLastOpenedFile,
    resetFileState
} from '../../src/main/utils/file-state'
import { setRecentFilesLimitProvider, trimRecentFiles } from '../../src/main/utils/file-state-store'
import {
    clampRecentFilesLimit,
    DEFAULT_RECENT_FILES_LIMIT
} from '../../src/shared/constants/recent-files'

const USER_DATA = electronState.paths.userData

describe('file-state', () => {
    beforeEach(() => {
        FakeStore.resetAll()
        appState._resetForTesting()
        fileUtilsMocks.ReloadDirFromDisk.mockClear()
        fileUtilsMocks.OpenSelectFile.mockClear()
        fileUtilsMocks.ReloadDirFromDisk.mockResolvedValue(undefined)
        fileUtilsMocks.OpenSelectFile.mockResolvedValue(undefined)
        fs.rmSync(USER_DATA, { recursive: true, force: true })
        fs.mkdirSync(USER_DATA, { recursive: true })
        // 批次 A：恢复默认保留条数（system-setting 未加载时提供者保持默认）
        setRecentFilesLimitProvider(() => DEFAULT_RECENT_FILES_LIMIT)
    })

    describe('last opened file', () => {
        it('should default to null', () => {
            expect(getLastOpenedFile()).toBeNull()
        })

        it('should save and return the last opened file', () => {
            saveLastOpenedFile('/notes/a.md')
            expect(getLastOpenedFile()).toBe('/notes/a.md')
        })

        it('should clear the last opened file', () => {
            saveLastOpenedFile('/notes/a.md')
            clearLastOpenedFile()
            expect(getLastOpenedFile()).toBeNull()
        })
    })

    describe('last opened directory', () => {
        it('should default to null', () => {
            expect(getLastOpenedDirectory()).toBeNull()
        })

        it('should save and return the last opened directory', () => {
            saveLastOpenedDirectory('/notes')
            expect(getLastOpenedDirectory()).toBe('/notes')
        })

        it('should clear the last opened directory', () => {
            saveLastOpenedDirectory('/notes')
            clearLastOpenedDirectory()
            expect(getLastOpenedDirectory()).toBeNull()
        })
    })

    describe('recent files', () => {
        // 批次 A：#4 共享钳制函数（recentFilesCount 5~20，非法值回落默认 10）
        it('should clamp recentFilesCount values into 5~20 with default fallback', () => {
            expect(clampRecentFilesLimit(10)).toBe(10)
            expect(clampRecentFilesLimit(3)).toBe(5)
            expect(clampRecentFilesLimit(21)).toBe(20)
            expect(clampRecentFilesLimit(99)).toBe(20)
            expect(clampRecentFilesLimit(5.6)).toBe(6)
            expect(clampRecentFilesLimit(undefined)).toBe(DEFAULT_RECENT_FILES_LIMIT)
            expect(clampRecentFilesLimit('15')).toBe(DEFAULT_RECENT_FILES_LIMIT)
            expect(clampRecentFilesLimit(Number.NaN)).toBe(DEFAULT_RECENT_FILES_LIMIT)
        })

        it('should default to an empty list', () => {
            expect(getRecentFiles()).toEqual([])
        })

        it('should prepend opened files and dedupe existing entries', () => {
            saveLastOpenedFile('/a.md')
            saveLastOpenedFile('/b.md')
            saveLastOpenedFile('/a.md')
            expect(getRecentFiles()).toEqual(['/a.md', '/b.md'])
        })

        it('should keep at most 10 recent files', () => {
            for (let i = 0; i < 12; i++) {
                saveLastOpenedFile(`/f${i}.md`)
            }
            const recent = getRecentFiles()
            expect(recent).toHaveLength(10)
            expect(recent[0]).toBe('/f11.md')
            expect(recent[9]).toBe('/f2.md')
            // 最旧的 f0/f1 被淘汰
            expect(recent).not.toContain('/f0.md')
            expect(recent).not.toContain('/f1.md')
        })

        // 批次 A：#4 最近文件列表数量（recentFilesCount）——写入侧按提供者截断去重
        it('should respect the recent files limit provider when appending', () => {
            setRecentFilesLimitProvider(() => 5)
            for (let i = 0; i < 8; i++) {
                saveLastOpenedFile(`/f${i}.md`)
            }
            const recent = getRecentFiles()
            expect(recent).toHaveLength(5)
            expect(recent[0]).toBe('/f7.md')
            expect(recent).not.toContain('/f0.md')
            expect(recent).not.toContain('/f1.md')
            expect(recent).not.toContain('/f2.md')
        })

        it('should trim the existing list immediately via trimRecentFiles', () => {
            for (let i = 0; i < 10; i++) {
                saveLastOpenedFile(`/f${i}.md`)
            }
            setRecentFilesLimitProvider(() => 6)
            trimRecentFiles()
            const recent = getRecentFiles()
            expect(recent).toHaveLength(6)
            expect(recent[0]).toBe('/f9.md')
            expect(recent[5]).toBe('/f4.md')
        })

        it('should keep the list unchanged when it is already within the limit', () => {
            saveLastOpenedFile('/a.md')
            setRecentFilesLimitProvider(() => 5)
            trimRecentFiles()
            expect(getRecentFiles()).toEqual(['/a.md'])
        })

        it('should remove a specific recent file', () => {
            saveLastOpenedFile('/a.md')
            saveLastOpenedFile('/b.md')
            removeRecentFile('/a.md')
            expect(getRecentFiles()).toEqual(['/b.md'])
        })

        it('should ignore removing a file that is not in the list', () => {
            saveLastOpenedFile('/a.md')
            removeRecentFile('/ghost.md')
            expect(getRecentFiles()).toEqual(['/a.md'])
        })

        it('should clear the recent files list', () => {
            saveLastOpenedFile('/a.md')
            clearRecentFiles()
            expect(getRecentFiles()).toEqual([])
        })
    })

    describe('restoreLastOpenedFile', () => {
        it('should do nothing when there is no saved state', async () => {
            await restoreLastOpenedFile()
            expect(fileUtilsMocks.ReloadDirFromDisk).not.toHaveBeenCalled()
            expect(fileUtilsMocks.OpenSelectFile).not.toHaveBeenCalled()
            expect(appState.rootPath).toBe('')
        })

        it('should restore an existing directory and reload it', async () => {
            const dir = path.join(USER_DATA, 'notes')
            fs.mkdirSync(dir, { recursive: true })
            saveLastOpenedDirectory(dir)
            await restoreLastOpenedFile()
            expect(appState.rootPath).toBe(dir)
            expect(fileUtilsMocks.ReloadDirFromDisk).toHaveBeenCalledTimes(1)
            // 目录保持保存状态
            expect(getLastOpenedDirectory()).toBe(dir)
        })

        it('should clear a directory that no longer exists', async () => {
            saveLastOpenedDirectory(path.join(USER_DATA, 'gone'))
            await restoreLastOpenedFile()
            expect(getLastOpenedDirectory()).toBeNull()
            expect(fileUtilsMocks.ReloadDirFromDisk).not.toHaveBeenCalled()
        })

        it('should restore an existing file through OpenSelectFile', async () => {
            const file = path.join(USER_DATA, 'note.md')
            fs.writeFileSync(file, 'content', 'utf-8')
            saveLastOpenedFile(file)
            await restoreLastOpenedFile()
            expect(fileUtilsMocks.OpenSelectFile).toHaveBeenCalledWith({
                name: 'note.md',
                path: file,
                type: 'file',
                content: ''
            })
            // 文件保持保存状态
            expect(getLastOpenedFile()).toBe(file)
        })

        it('should clear a file that no longer exists', async () => {
            saveLastOpenedFile(path.join(USER_DATA, 'gone.md'))
            await restoreLastOpenedFile()
            expect(getLastOpenedFile()).toBeNull()
            expect(fileUtilsMocks.OpenSelectFile).not.toHaveBeenCalled()
        })

        it('should clear the directory when reloading throws', async () => {
            const dir = path.join(USER_DATA, 'notes')
            fs.mkdirSync(dir, { recursive: true })
            saveLastOpenedDirectory(dir)
            fileUtilsMocks.ReloadDirFromDisk.mockRejectedValueOnce(new Error('reload failed'))
            await restoreLastOpenedFile()
            expect(getLastOpenedDirectory()).toBeNull()
        })

        it('should clear the file when opening throws', async () => {
            const file = path.join(USER_DATA, 'note.md')
            fs.writeFileSync(file, 'x', 'utf-8')
            saveLastOpenedFile(file)
            fileUtilsMocks.OpenSelectFile.mockRejectedValueOnce(new Error('open failed'))
            await restoreLastOpenedFile()
            expect(getLastOpenedFile()).toBeNull()
        })
    })

    describe('resetFileState', () => {
        it('should clear all file state', () => {
            saveLastOpenedFile('/a.md')
            saveLastOpenedDirectory('/notes')
            resetFileState()
            expect(getLastOpenedFile()).toBeNull()
            expect(getLastOpenedDirectory()).toBeNull()
            expect(getRecentFiles()).toEqual([])
        })
    })

    describe('corrupted store recovery (D-6/FUN-11)', () => {
        it('should back up the corrupt file and rebuild the store', async () => {
            const corruptFile = path.join(USER_DATA, 'fileState.json')
            fs.writeFileSync(corruptFile, '{ broken', 'utf-8')

            FakeStore.failOnceFor = 'fileState'
            vi.resetModules()
            const mod = await import('../../src/main/utils/file-state')

            mod.saveLastOpenedFile('/recovered.md')
            expect(mod.getLastOpenedFile()).toBe('/recovered.md')
            expect(mod.getRecentFiles()).toEqual(['/recovered.md'])

            // 损坏文件应被备份为 .corrupt-时间戳
            const files = fs.readdirSync(USER_DATA)
            const backup = files.find((f) => /^fileState\.json\.corrupt-\d+$/.test(f))
            expect(backup).toBeDefined()
            expect(fs.existsSync(corruptFile)).toBe(false)
        })
    })
})
