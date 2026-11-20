/**
 * 覆盖率补测第五批：app-paths.ts POSIX 权限收紧分支（独立于既有 app-paths.test.ts）。
 *
 * 覆盖点（此前未覆盖的语句/分支）：
 * - shouldApplyPosixPermissionHardening：win32 返回 false、其它平台返回 true；
 * - hardenPathPermissionsSync / hardenPathPermissions：不适用平台直接 false、
 *   成功 chmod 返回 true、路径不存在/无权限返回 false（失败安全降级）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const hoisted = vi.hoisted(() => ({
    home: `${process.env.TEMP || process.env.TMP || '/tmp'}/baize-paths5/home`,
    appPath: `${process.env.TEMP || process.env.TMP || '/tmp'}/baize-paths5/app`
}))

vi.mock('electron', () => ({
    app: {
        getPath: (name: string) => (name === 'home' ? hoisted.home : hoisted.appPath),
        getAppPath: () => hoisted.appPath,
        isPackaged: false
    }
}))

import {
    BACKUP_FILE_MODE,
    hardenPathPermissions,
    hardenPathPermissionsSync,
    shouldApplyPosixPermissionHardening,
    USER_DATA_DIR_MODE
} from '../../../src/main/utils/app-paths'

let tmpDir = ''

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-paths5-'))
})

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('shouldApplyPosixPermissionHardening', () => {
    it('Windows 不应用 chmod 收紧，其它平台应用', () => {
        expect(shouldApplyPosixPermissionHardening('win32')).toBe(false)
        expect(shouldApplyPosixPermissionHardening('linux')).toBe(true)
        expect(shouldApplyPosixPermissionHardening('darwin')).toBe(true)
        expect(shouldApplyPosixPermissionHardening()).toBe(process.platform !== 'win32')
    })
})

describe('hardenPathPermissionsSync', () => {
    it('不适用平台直接返回 false（不做 chmod）', () => {
        const target = path.join(tmpDir, 'dir-win')
        fs.mkdirSync(target)
        expect(hardenPathPermissionsSync(target, USER_DATA_DIR_MODE, 'win32')).toBe(false)
    })

    it('支持平台 chmod 成功返回 true；路径不存在时失败降级返回 false', () => {
        const dir = path.join(tmpDir, 'dir-posix')
        fs.mkdirSync(dir)
        expect(hardenPathPermissionsSync(dir, USER_DATA_DIR_MODE, 'linux')).toBe(true)

        expect(
            hardenPathPermissionsSync(path.join(tmpDir, 'missing'), USER_DATA_DIR_MODE, 'linux')
        ).toBe(false)
    })
})

describe('hardenPathPermissions（异步）', () => {
    it('不适用平台直接返回 false', async () => {
        const target = path.join(tmpDir, 'file-win')
        fs.writeFileSync(target, 'x')
        await expect(hardenPathPermissions(target, BACKUP_FILE_MODE, 'win32')).resolves.toBe(false)
    })

    it('支持平台 chmod 成功返回 true；路径不存在时失败降级返回 false', async () => {
        const file = path.join(tmpDir, 'backup.json')
        fs.writeFileSync(file, '{}')
        await expect(hardenPathPermissions(file, BACKUP_FILE_MODE, 'linux')).resolves.toBe(true)
        await expect(
            hardenPathPermissions(path.join(tmpDir, 'missing-file'), BACKUP_FILE_MODE, 'linux')
        ).resolves.toBe(false)
    })
})
