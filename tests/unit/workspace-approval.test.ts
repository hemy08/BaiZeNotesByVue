/**
 * src/main/utils/workspace-approval.ts 单元测试
 *
 * P1-1 剩余（工作区受信根来源收敛）：
 * - 受信根只由主进程登记（approveWorkspaceRoot / seedApprovedWorkspaceRoots），
 *   渲染层可触达入口只能做只读判定（touchApprovedWorkspaceRoot / isWorkspaceRootApproved）；
 * - realpath 归一化：同一目录的不同写法（含大小写/分隔符差异）判定一致；
 * - LRU：最多 MAX_APPROVED_WORKSPACE_ROOTS 项，命中/新增移到最新，超限淘汰最旧；
 * - 批量播种按「从旧到新」保持列表顺序；复位后集合清空。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { resetAppContext } from '../../src/main/app-context'
import {
    approveWorkspaceRoot,
    getApprovedWorkspaceRootsForTesting,
    isWorkspaceRootApproved,
    MAX_APPROVED_WORKSPACE_ROOTS,
    resetWorkspaceApprovalsForTesting,
    seedApprovedWorkspaceRoots,
    touchApprovedWorkspaceRoot
} from '../../src/main/utils/workspace-approval'
import { normalizePathForCompare } from '../../src/shared/utils/path'

/** 与 workspace-approval 内部一致的比较键（realpath + 平台归一化） */
function approvalKey(dirPath: string): string {
    return normalizePathForCompare(fs.realpathSync(dirPath), process.platform === 'win32')
}

let tempBase: string

beforeAll(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-workspace-approval-'))
})

afterAll(() => {
    fs.rmSync(tempBase, { recursive: true, force: true })
})

/** 在临时根下创建目录（受信根判定要求绝对路径） */
function makeDir(name: string): string {
    const dir = path.join(tempBase, name)
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

beforeEach(() => {
    resetAppContext()
    resetWorkspaceApprovalsForTesting()
})

describe('approveWorkspaceRoot / touchApprovedWorkspaceRoot', () => {
    it('should reject empty, non-string and relative paths', async () => {
        await expect(approveWorkspaceRoot('')).resolves.toBeNull()
        await expect(approveWorkspaceRoot('relative/folder')).resolves.toBeNull()
        await expect(approveWorkspaceRoot(undefined)).resolves.toBeNull()
        await expect(approveWorkspaceRoot(42)).resolves.toBeNull()
        expect(getApprovedWorkspaceRootsForTesting()).toHaveLength(0)
    })

    it('should approve a directory and expose it to read-only checks', async () => {
        const dir = makeDir('notes')
        await expect(approveWorkspaceRoot(dir)).resolves.toBeTruthy()

        await expect(isWorkspaceRootApproved(dir)).resolves.toBe(true)
        await expect(touchApprovedWorkspaceRoot(dir)).resolves.toBeTruthy()
        expect(getApprovedWorkspaceRootsForTesting()).toEqual([approvalKey(dir)])
    })

    it('should normalize trailing separators and mixed slashes to the same root', async () => {
        const dir = makeDir('slash-check')
        await approveWorkspaceRoot(dir)

        const withTrailingSeparator = `${dir}${path.sep}`
        const withForwardSlash = dir.split(path.sep).join('/')
        await expect(isWorkspaceRootApproved(withTrailingSeparator)).resolves.toBe(true)
        if (process.platform === 'win32') {
            await expect(isWorkspaceRootApproved(withForwardSlash)).resolves.toBe(true)
            // Windows 目录名大小写不敏感：同一目录的不同大小写写法命中同一受信根
            await expect(isWorkspaceRootApproved(dir.toUpperCase())).resolves.toBe(true)
        }
        expect(getApprovedWorkspaceRootsForTesting()).toHaveLength(1)
    })

    it('should return null when touching a directory that was never approved', async () => {
        const approvedDir = makeDir('approved')
        const unapprovedDir = makeDir('unapproved')
        await approveWorkspaceRoot(approvedDir)

        await expect(touchApprovedWorkspaceRoot(unapprovedDir)).resolves.toBeNull()
        await expect(isWorkspaceRootApproved(unapprovedDir)).resolves.toBe(false)
        // 只读判定不得扩张授权集合
        expect(getApprovedWorkspaceRootsForTesting()).toEqual([approvalKey(approvedDir)])
    })

    it('should refresh LRU order when touching an existing root', async () => {
        const firstDir = makeDir('lru-first')
        const secondDir = makeDir('lru-second')
        await approveWorkspaceRoot(firstDir)
        await approveWorkspaceRoot(secondDir)
        expect(getApprovedWorkspaceRootsForTesting()).toEqual([
            approvalKey(firstDir),
            approvalKey(secondDir)
        ])

        // 命中旧根 → 刷新到最新（尾部）；集合大小不变
        await touchApprovedWorkspaceRoot(firstDir)
        expect(getApprovedWorkspaceRootsForTesting()).toEqual([
            approvalKey(secondDir),
            approvalKey(firstDir)
        ])
    })
})

describe('seedApprovedWorkspaceRoots（启动播种）', () => {
    it('should register candidates from oldest to newest and ignore invalid entries', async () => {
        const newestDir = makeDir('seed-newest')
        const olderDir = makeDir('seed-older')
        const count = await seedApprovedWorkspaceRoots(['relative/path', newestDir, olderDir])
        expect(count).toBe(2)
        // 入参按最近列表语义「首项最新」：反序登记后最旧在头部、最新在尾部
        expect(getApprovedWorkspaceRootsForTesting()).toEqual([
            approvalKey(olderDir),
            approvalKey(newestDir)
        ])
        await expect(touchApprovedWorkspaceRoot(newestDir)).resolves.toBeTruthy()
    })

    it('should not add anything for an empty candidate list', async () => {
        await expect(seedApprovedWorkspaceRoots([])).resolves.toBe(0)
        expect(getApprovedWorkspaceRootsForTesting()).toHaveLength(0)
    })
})

describe('LRU 上限（MAX_APPROVED_WORKSPACE_ROOTS）', () => {
    it('should evict the oldest root when exceeding the limit', async () => {
        const dirs = Array.from({ length: MAX_APPROVED_WORKSPACE_ROOTS + 1 }, (_, index) =>
            makeDir(`cap-${index}`)
        )
        for (const dir of dirs) {
            await approveWorkspaceRoot(dir)
        }

        const approvedKeys = getApprovedWorkspaceRootsForTesting()
        expect(approvedKeys).toHaveLength(MAX_APPROVED_WORKSPACE_ROOTS)
        // 最旧的第一项被淘汰，其余保留（最新在尾部）
        await expect(isWorkspaceRootApproved(dirs[0])).resolves.toBe(false)
        await expect(isWorkspaceRootApproved(dirs[1])).resolves.toBe(true)
        await expect(isWorkspaceRootApproved(dirs[dirs.length - 1])).resolves.toBe(true)
        expect(approvedKeys[approvedKeys.length - 1]).toBe(approvalKey(dirs[dirs.length - 1]))
    })
})
