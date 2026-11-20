/**
 * src/main/utils/workspace-root.ts 单元测试（AS-2 + P1-1 敏感根黑名单）
 *
 * 覆盖：
 * - 既有危险根：磁盘根/UNC 共享根、用户主目录、用户目录根、系统目录（取环境变量）；
 * - P1-1 新增凭据/隐私目录黑名单：.ssh/.gnupg/.aws/.azure/.kube/.docker/.password-store、
 *   浏览器配置、.config/.local、本应用 .baizenotes，Windows AppData、macOS Library 隐私
 *   目录、POSIX /etc 等系统目录；
 * - 大小写/分隔符/子树语义：敏感目录的子目录同样拒绝，仅前缀相似的兄弟目录不误伤；
 * - 系统临时目录豁免：Windows %TEMP% 位于 AppData 下时仍可作为合法工作区；
 * - validateWorkspaceRoot：空值/相对路径/不存在/非目录拒绝、普通目录放行、
 *   realpath 兜底拦截「临时目录内符号链接/目录联接指向敏感目录」。
 *
 * 说明：os.homedir/os.tmpdir 用测试内固定目录 mock，避免依赖真实用户目录
 * （真实主目录下是否恰好存在 .ssh 会影响断言，且不能对真实目录做任何读写探测）。
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const osMockState = vi.hoisted(() => ({ home: '', temp: '' }))

vi.mock('os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('os')>()
    return {
        ...actual,
        homedir: () => osMockState.home,
        tmpdir: () => osMockState.temp
    }
})

import {
    detectDangerousWorkspaceRoot,
    validateWorkspaceRoot
} from '../../src/main/utils/workspace-root'

// 夹具根目录放在 out/（gitignore）下，避免污染工作区；afterAll 统一清理
const OUT_DIR = path.join(process.cwd(), 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })
const FIXTURE_ROOT = fs.mkdtempSync(path.join(OUT_DIR, 'vitest-workspace-root-'))
const HOME_DIR = path.join(FIXTURE_ROOT, 'home')
const TEMP_DIR = path.join(FIXTURE_ROOT, 'tmp')

function homePath(...segments: string[]): string {
    return path.join(HOME_DIR, ...segments)
}

function tempPath(...segments: string[]): string {
    return path.join(TEMP_DIR, ...segments)
}

/** 断言命中危险根，并可选校验拒绝原因片段 */
function expectDangerous(candidate: string, reasonFragment?: string): void {
    const reason = detectDangerousWorkspaceRoot(candidate)
    expect(reason, `应拒绝危险工作区根：${candidate}`).not.toBeNull()
    if (reasonFragment !== undefined) {
        expect(reason).toContain(reasonFragment)
    }
}

beforeEach(() => {
    osMockState.home = HOME_DIR
    osMockState.temp = TEMP_DIR
    fs.mkdirSync(HOME_DIR, { recursive: true })
    fs.mkdirSync(TEMP_DIR, { recursive: true })
})

afterAll(() => {
    fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true })
})

describe('detectDangerousWorkspaceRoot 既有危险根', () => {
    it('should reject the filesystem/drive root', () => {
        expectDangerous(path.parse(FIXTURE_ROOT).root)
    })

    it('should reject the user home directory itself', () => {
        expectDangerous(HOME_DIR, '用户主目录')
    })

    it('should reject the parent directory of the user home', () => {
        expectDangerous(path.dirname(HOME_DIR), '用户目录根')
    })

    it('should reject Windows system directories and their subdirectories', () => {
        // 仅 Windows 有系统目录环境变量；其他平台该分支为空，跳过断言
        if (process.platform !== 'win32') {
            return
        }
        const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
        if (systemRoot === undefined || systemRoot.trim() === '') {
            return
        }
        expectDangerous(path.join(systemRoot, 'Temp'), '系统目录')
    })
})

describe('detectDangerousWorkspaceRoot 用户凭据/隐私目录（P1-1）', () => {
    it.each([
        '.ssh',
        '.gnupg',
        '.aws',
        '.azure',
        '.kube',
        '.docker',
        '.password-store',
        '.pki',
        '.config',
        '.local',
        '.mozilla',
        '.thunderbird',
        '.baizenotes'
    ])('should reject the sensitive directory %s', (relativeDirectory) => {
        expectDangerous(homePath(relativeDirectory), '凭据或隐私目录')
    })

    it('should reject subdirectories of sensitive directories', () => {
        expectDangerous(homePath('.ssh', 'keys'), '凭据或隐私目录')
        expectDangerous(homePath('.aws', 'credentials-backup'), '凭据或隐私目录')
        expectDangerous(homePath('.config', 'google-chrome'), '凭据或隐私目录')
        expectDangerous(homePath('.local', 'share', 'keyrings'), '凭据或隐私目录')
    })

    it('should not reject sibling directories sharing the sensitive prefix', () => {
        expect(detectDangerousWorkspaceRoot(homePath('.ssh-backup'))).toBeNull()
        expect(detectDangerousWorkspaceRoot(homePath('.awsx'))).toBeNull()
        expect(detectDangerousWorkspaceRoot(homePath('ssh'))).toBeNull()
        expect(detectDangerousWorkspaceRoot(homePath('notes', '.ssh'))).toBeNull()
    })

    it('should compare case-insensitively on win32 only', () => {
        const upperCaseCandidate = homePath('.SSH')
        if (process.platform === 'win32') {
            expectDangerous(upperCaseCandidate, '凭据或隐私目录')
        } else {
            // POSIX 文件系统区分大小写，.SSH 与 .ssh 不是同一目录
            expect(detectDangerousWorkspaceRoot(upperCaseCandidate)).toBeNull()
        }
    })

    it('should reject Windows AppData and its subdirectories on win32', () => {
        if (process.platform !== 'win32') {
            return
        }
        expectDangerous(homePath('AppData'), '凭据或隐私目录')
        expectDangerous(
            homePath('AppData', 'Local', 'Google', 'Chrome', 'User Data'),
            '凭据或隐私目录'
        )
        expectDangerous(homePath('AppData', 'Roaming', 'Mozilla', 'Firefox'), '凭据或隐私目录')
    })

    it('should reject macOS keychain/browser privacy directories on darwin', () => {
        if (process.platform !== 'darwin') {
            return
        }
        expectDangerous(homePath('Library', 'Keychains'), '凭据或隐私目录')
        expectDangerous(homePath('Library', 'Safari'), '凭据或隐私目录')
        expectDangerous(
            homePath('Library', 'Application Support', 'Google', 'Chrome'),
            '凭据或隐私目录'
        )
        expectDangerous('/Library', '凭据或隐私目录')
    })

    it('should reject POSIX system directories on linux', () => {
        if (process.platform !== 'linux') {
            return
        }
        expectDangerous('/etc', '凭据或隐私目录')
        expectDangerous('/etc/ssl/private', '凭据或隐私目录')
        expectDangerous('/root', '凭据或隐私目录')
    })

    it('should not reject a normal subdirectory of the home directory', () => {
        expect(detectDangerousWorkspaceRoot(homePath('Documents'))).toBeNull()
        expect(detectDangerousWorkspaceRoot(homePath('Documents', 'Notes'))).toBeNull()
    })

    it('should exempt the system temp directory subtree (Windows %TEMP% under AppData)', () => {
        // 模拟 Windows 真实布局：临时目录位于 home\AppData\Local\Temp
        osMockState.home = path.join(FIXTURE_ROOT, 'winhome')
        osMockState.temp = path.join(osMockState.home, 'AppData', 'Local', 'Temp')
        expect(
            detectDangerousWorkspaceRoot(path.join(osMockState.temp, 'baize-workspace'))
        ).toBeNull()
        // 临时目录之外的 AppData 仍被拒绝（仅 Windows 生效）
        if (process.platform === 'win32') {
            expectDangerous(path.join(osMockState.home, 'AppData', 'Local'), '凭据或隐私目录')
        }
    })
})

describe('validateWorkspaceRoot', () => {
    it('should reject empty / non-string / relative candidates', async () => {
        await expect(validateWorkspaceRoot('')).resolves.toMatchObject({ ok: false })
        await expect(validateWorkspaceRoot('   ')).resolves.toMatchObject({ ok: false })
        await expect(validateWorkspaceRoot(123)).resolves.toMatchObject({ ok: false })
        await expect(validateWorkspaceRoot('notes')).resolves.toMatchObject({ ok: false })
        await expect(validateWorkspaceRoot('./notes')).resolves.toMatchObject({ ok: false })
    })

    it('should reject a non-existent directory', async () => {
        const validation = await validateWorkspaceRoot(tempPath('not-exists'))
        expect(validation).toMatchObject({ ok: false, reason: expect.stringContaining('不存在') })
    })

    it('should reject a file path', async () => {
        const file = tempPath('note.md')
        fs.writeFileSync(file, 'content', 'utf-8')
        const validation = await validateWorkspaceRoot(file)
        expect(validation).toMatchObject({ ok: false, reason: expect.stringContaining('不是目录') })
    })

    it('should accept a normal directory inside the system temp directory', async () => {
        const workspace = tempPath('notes')
        fs.mkdirSync(workspace, { recursive: true })
        const validation = await validateWorkspaceRoot(workspace)
        expect(validation).toEqual({ ok: true, path: path.resolve(workspace) })
    })

    it('should reject sensitive directories before touching the filesystem', async () => {
        fs.mkdirSync(homePath('.ssh'), { recursive: true })
        const validation = await validateWorkspaceRoot(homePath('.ssh'))
        expect(validation).toMatchObject({
            ok: false,
            reason: expect.stringContaining('凭据或隐私目录')
        })
    })

    it('should reject a symlink/junction that resolves into a sensitive directory (realpath)', async () => {
        const sensitiveTarget = homePath('.ssh')
        fs.mkdirSync(sensitiveTarget, { recursive: true })
        const link = tempPath('link-to-ssh')
        try {
            // Windows 下使用 junction 避免管理员权限要求；POSIX 使用普通目录符号链接
            fs.symlinkSync(sensitiveTarget, link, process.platform === 'win32' ? 'junction' : 'dir')
        } catch {
            // 文件系统不支持符号链接（权限/环境）：跳过本用例
            return
        }
        const validation = await validateWorkspaceRoot(link)
        expect(validation).toMatchObject({
            ok: false,
            reason: expect.stringContaining('凭据或隐私目录')
        })
    })
})
