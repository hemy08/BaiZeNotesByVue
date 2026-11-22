/**
 * 1.5.2 E6/E1 日常记录 + 剪藏 IPC 层单测（`src/main/ipc/capture-ipc.ts`，不启动 Electron）
 *
 * 覆盖口径：
 * 1. 载荷校验：非法 kind / 非对象载荷返回 invalid-kind，不触碰磁盘；
 * 2. 无工作区返回 no-workspace；
 * 3. daily/inbox 目录自动递归创建、文件名按本地日期（时间）生成、写入模板内容；
 * 4. 已存在文件**不覆盖**（created=false）且仍走既有打开链路；
 * 5. 写入失败（根不可解析 / 目录被同名文件占用）返回 write-failed；
 * 6. E1 剪藏（kind='clip'）：正文/标题/来源校验、inbox/…-clip.md 文件名、
 *    front matter + 正文写入、content 超限、非 clip 携带 content/title 被忽略；
 * 7. 路径校验 helper（目标必须位于工作区根内）与注册形状（registerHandleOnce + sender 校验包装）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { IPC } from '../../src/shared/ipc-channels'
import {
    buildDailyEntryTemplate,
    buildInboxEntryTemplate
} from '../../src/shared/constants/daily-entries'
import {
    CLIP_CONTENT_MAX_BYTES,
    CLIP_EMPTY_CONTENT_PLACEHOLDER,
    clipEntryTemplate
} from '../../src/shared/constants/clip-capture'

const mocks = vi.hoisted(() => ({
    appState: { rootPath: '' },
    openSelectFile: vi.fn(),
    registerHandleOnce: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../src/main/utils/app-state', () => ({ appState: mocks.appState }))
// 打开文件链路（file-utils/OpenSelectFile）在单测中只断言「被调用」，不真实读写编辑器状态
vi.mock('../../src/main/utils/file-utils/index', () => ({
    OpenSelectFile: mocks.openSelectFile
}))
// sender 校验在 ipc-security 单测覆盖；本文件只验证 handler 注册形状，直接放行
vi.mock('../../src/main/utils/ipc-security', () => ({
    withSenderCheck: (_channel: string, handler: unknown) => handler
}))
vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: { registerHandleOnce: mocks.registerHandleOnce }
}))
vi.mock('../../src/main/utils/logger', () => ({ logger: mocks.logger }))

import {
    isPathInsideRoot,
    openOrCreateCaptureEntry,
    registerCaptureIpc
} from '../../src/main/ipc/capture-ipc'

/** 固定本地时间：2026-01-04（周日）09:05:06 —— 与 daily-entries 单测同一基准 */
const FIXED_DATE = new Date(2026, 0, 4, 9, 5, 6)

/** 临时工作区根（测试临时目录统一 baize- 前缀，afterEach 清理） */
let workspaceRoot = ''

beforeEach(async () => {
    vi.clearAllMocks()
    mocks.openSelectFile.mockResolvedValue(undefined)
    workspaceRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'baize-capture-')))
    mocks.appState.rootPath = workspaceRoot
})

afterEach(async () => {
    mocks.appState.rootPath = ''
    if (workspaceRoot) {
        await rm(workspaceRoot, { recursive: true, force: true })
        workspaceRoot = ''
    }
})

describe('openOrCreateCaptureEntry：载荷与工作区校验', () => {
    it('非法 kind / 非对象载荷返回 invalid-kind，且不触碰磁盘', async () => {
        const payloads = [
            null,
            undefined,
            'daily',
            42,
            [],
            {},
            { kind: 'weekly' },
            { kind: '' },
            { kind: 1 },
            { path: '/etc/passwd' }
        ]
        for (const payload of payloads) {
            await expect(openOrCreateCaptureEntry(payload, FIXED_DATE)).resolves.toEqual({
                ok: false,
                reason: 'invalid-kind'
            })
        }
        expect(mocks.openSelectFile).not.toHaveBeenCalled()
    })

    it('无工作区返回 no-workspace（不抛异常）', async () => {
        mocks.appState.rootPath = ''
        await expect(openOrCreateCaptureEntry({ kind: 'daily' }, FIXED_DATE)).resolves.toEqual({
            ok: false,
            reason: 'no-workspace'
        })
        expect(mocks.openSelectFile).not.toHaveBeenCalled()
    })

    it('工作区根不存在（realpath 失败）返回 write-failed', async () => {
        mocks.appState.rootPath = path.join(workspaceRoot, 'not-exist-root')
        await expect(openOrCreateCaptureEntry({ kind: 'daily' }, FIXED_DATE)).resolves.toEqual({
            ok: false,
            reason: 'write-failed'
        })
        expect(mocks.logger.error).toHaveBeenCalled()
    })
})

describe('openOrCreateCaptureEntry：创建今日日记（daily）', () => {
    it('目录不存在时递归创建，写入模板并返回 created=true', async () => {
        const result = await openOrCreateCaptureEntry({ kind: 'daily' }, FIXED_DATE)
        const expectedPath = path.join(workspaceRoot, 'diary', '2026-01-04.md')

        expect(result).toEqual({ ok: true, created: true, filePath: expectedPath })
        await expect(access(expectedPath)).resolves.toBeUndefined()
        await expect(readFile(expectedPath, 'utf8')).resolves.toBe(
            buildDailyEntryTemplate(FIXED_DATE)
        )
        // 打开动作复用既有 file-utils.OpenSelectFile 链路（主进程读取并通知渲染层）
        expect(mocks.openSelectFile).toHaveBeenCalledTimes(1)
        expect(mocks.openSelectFile).toHaveBeenCalledWith({
            name: '2026-01-04.md',
            path: expectedPath,
            type: 'file'
        })
    })

    it('同日已存在时直接打开、绝不覆盖（created=false）', async () => {
        const diaryDir = path.join(workspaceRoot, 'diary')
        const existingPath = path.join(diaryDir, '2026-01-04.md')
        await mkdir(diaryDir, { recursive: true })
        await writeFile(existingPath, '用户已有内容，不能被覆盖\n', 'utf8')

        const result = await openOrCreateCaptureEntry({ kind: 'daily' }, FIXED_DATE)

        expect(result).toEqual({ ok: true, created: false, filePath: existingPath })
        await expect(readFile(existingPath, 'utf8')).resolves.toBe('用户已有内容，不能被覆盖\n')
        expect(mocks.openSelectFile).toHaveBeenCalledWith({
            name: '2026-01-04.md',
            path: existingPath,
            type: 'file'
        })
    })

    it('写入失败（目录路径被同名文件占用）返回 write-failed', async () => {
        // 在工作区根下放一个名为 diary 的普通文件：mkdir(diary) 必然失败
        await writeFile(path.join(workspaceRoot, 'diary'), 'not a directory', 'utf8')

        await expect(openOrCreateCaptureEntry({ kind: 'daily' }, FIXED_DATE)).resolves.toEqual({
            ok: false,
            reason: 'write-failed'
        })
        expect(mocks.openSelectFile).not.toHaveBeenCalled()
        expect(mocks.logger.error).toHaveBeenCalled()
    })

    it('打开链路抛错不回滚已创建文件（仍返回 ok=true，仅记录 warn）', async () => {
        mocks.openSelectFile.mockRejectedValueOnce(new Error('open chain failed'))
        const result = await openOrCreateCaptureEntry({ kind: 'daily' }, FIXED_DATE)
        const expectedPath = path.join(workspaceRoot, 'diary', '2026-01-04.md')

        expect(result).toEqual({ ok: true, created: true, filePath: expectedPath })
        await expect(access(expectedPath)).resolves.toBeUndefined()
        expect(mocks.logger.warn).toHaveBeenCalled()
    })
})

describe('openOrCreateCaptureEntry：创建快速收件箱（inbox）', () => {
    it('目录自动创建，文件名含时分秒且模板 source: inbox', async () => {
        const result = await openOrCreateCaptureEntry({ kind: 'inbox' }, FIXED_DATE)
        const expectedPath = path.join(workspaceRoot, 'inbox', '2026-01-04-090506.md')

        expect(result).toEqual({ ok: true, created: true, filePath: expectedPath })
        await expect(readFile(expectedPath, 'utf8')).resolves.toBe(
            buildInboxEntryTemplate(FIXED_DATE)
        )
        expect(mocks.openSelectFile).toHaveBeenCalledWith({
            name: '2026-01-04-090506.md',
            path: expectedPath,
            type: 'file'
        })
    })

    it('同一秒重复创建不覆盖已有收件箱笔记', async () => {
        const first = await openOrCreateCaptureEntry({ kind: 'inbox' }, FIXED_DATE)
        const filePath = String(first.filePath)
        await writeFile(filePath, 'second-run-must-not-overwrite', 'utf8')

        const second = await openOrCreateCaptureEntry({ kind: 'inbox' }, FIXED_DATE)
        expect(second.ok).toBe(true)
        expect(second.created).toBe(false)
        await expect(readFile(filePath, 'utf8')).resolves.toBe('second-run-must-not-overwrite')
    })
})

describe('openOrCreateCaptureEntry：剪藏到新笔记（clip，1.5.2 E1）', () => {
    it('目录自动创建，文件名带 -clip 后缀，写入 front matter + 正文', async () => {
        const payload = {
            kind: 'clip',
            content: '# 剪藏标题\n\n正文第一段',
            title: '网页标题',
            sourceUrl: 'https://example.com/page'
        }
        const result = await openOrCreateCaptureEntry(payload, FIXED_DATE)
        const expectedPath = path.join(workspaceRoot, 'inbox', '2026-01-04-090506-clip.md')

        expect(result).toEqual({ ok: true, created: true, filePath: expectedPath })
        await expect(readFile(expectedPath, 'utf8')).resolves.toBe(
            clipEntryTemplate(FIXED_DATE, payload)
        )
        const written = await readFile(expectedPath, 'utf8')
        expect(written).toContain('source: "clip"')
        expect(written).toContain('title: "网页标题"')
        expect(written).toContain('sourceUrl: "https://example.com/page"')
        expect(written).toContain('# 剪藏标题\n\n正文第一段')
        expect(mocks.openSelectFile).toHaveBeenCalledWith({
            name: '2026-01-04-090506-clip.md',
            path: expectedPath,
            type: 'file'
        })
    })

    it('正文超过 CLIP_CONTENT_MAX_BYTES 返回 content-too-large，不写盘/不打开', async () => {
        const content = 'a'.repeat(CLIP_CONTENT_MAX_BYTES + 1)
        await expect(
            openOrCreateCaptureEntry({ kind: 'clip', content }, FIXED_DATE)
        ).resolves.toEqual({ ok: false, reason: 'content-too-large' })
        expect(mocks.openSelectFile).not.toHaveBeenCalled()
        await expect(access(path.join(workspaceRoot, 'inbox'))).rejects.toThrow()
        expect(mocks.logger.warn).toHaveBeenCalled()
    })

    it('content 超限优先于无工作区校验（载荷校验先失败）', async () => {
        mocks.appState.rootPath = ''
        await expect(
            openOrCreateCaptureEntry(
                { kind: 'clip', content: 'a'.repeat(CLIP_CONTENT_MAX_BYTES + 1) },
                FIXED_DATE
            )
        ).resolves.toEqual({ ok: false, reason: 'content-too-large' })
    })

    it('title 剥离控制字符并截断到 120；不安全 sourceUrl 被忽略', async () => {
        const longTitle = '标'.repeat(130)
        const result = await openOrCreateCaptureEntry(
            {
                kind: 'clip',
                content: '正文',
                title: `a\u0000b\nc ${longTitle}`,
                sourceUrl: 'javascript:alert(1)'
            },
            FIXED_DATE
        )
        expect(result.ok).toBe(true)
        const written = await readFile(String(result.filePath), 'utf8')
        const titleLine = written.split('\n').find((line) => line.startsWith('title:'))
        expect(titleLine).toBeDefined()
        expect(titleLine).not.toContain('\u0000')
        // 控制字符归一化为空格后参与截断；YAML 值始终为单个双引号标量
        expect(titleLine).toMatch(/^title: "a b c 标+"/)
        expect(Array.from((titleLine ?? '').slice(8, -1))).toHaveLength(120)
        expect(written).not.toContain('sourceUrl')
        expect(written).not.toContain('javascript:')
    })

    it('非 clip 载荷携带 content/title/sourceUrl 时一律忽略（不写入文件）', async () => {
        const result = await openOrCreateCaptureEntry(
            {
                kind: 'inbox',
                content: '不应写入的剪藏正文',
                title: '不应写入的标题',
                sourceUrl: 'https://example.com/ignored'
            },
            FIXED_DATE
        )
        expect(result.ok).toBe(true)
        const written = await readFile(String(result.filePath), 'utf8')
        expect(written).toBe(buildInboxEntryTemplate(FIXED_DATE))
        expect(written).not.toContain('不应写入')
        expect(written).not.toContain('ignored')
    })

    it('content 缺省/非字符串时写占位正文（防御异常载荷）', async () => {
        const missing = await openOrCreateCaptureEntry({ kind: 'clip' }, FIXED_DATE)
        const missingContent = await readFile(String(missing.filePath), 'utf8')
        expect(missingContent).toContain(CLIP_EMPTY_CONTENT_PLACEHOLDER)

        const invalid = await openOrCreateCaptureEntry(
            { kind: 'clip', content: 42 as unknown as string },
            new Date(2026, 0, 4, 9, 5, 7)
        )
        const invalidContent = await readFile(String(invalid.filePath), 'utf8')
        expect(invalidContent).toContain(CLIP_EMPTY_CONTENT_PLACEHOLDER)
    })

    it('同一秒重复剪藏不覆盖已有文件（created=false）', async () => {
        const first = await openOrCreateCaptureEntry(
            { kind: 'clip', content: '第一次内容' },
            FIXED_DATE
        )
        await writeFile(String(first.filePath), '用户后改内容，不能被覆盖', 'utf8')
        const second = await openOrCreateCaptureEntry(
            { kind: 'clip', content: '第二次内容' },
            FIXED_DATE
        )
        expect(second).toEqual({ ok: true, created: false, filePath: first.filePath })
        await expect(readFile(String(first.filePath), 'utf8')).resolves.toBe(
            '用户后改内容，不能被覆盖'
        )
    })
})

describe('isPathInsideRoot：工作区根内路径复核', () => {
    const root = path.resolve('/workspace')

    it('根内子路径为 true（含根下多级目录）', () => {
        expect(isPathInsideRoot(root, path.join(root, 'diary'))).toBe(true)
        expect(isPathInsideRoot(root, path.join(root, 'diary', '2026-01-04.md'))).toBe(true)
    })

    it('根自身 / 父目录 / 兄弟目录 / 绝对路径视为 false', () => {
        expect(isPathInsideRoot(root, root)).toBe(false)
        expect(isPathInsideRoot(root, path.resolve(root, '..'))).toBe(false)
        expect(isPathInsideRoot(root, path.resolve(root, '..', 'outside', 'x.md'))).toBe(false)
        expect(isPathInsideRoot(root, path.resolve('/other/place/x.md'))).toBe(false)
    })
})

describe('registerCaptureIpc：注册形状与监听透传', () => {
    it('按契约注册 1 个 handle 通道并透传 componentId', () => {
        registerCaptureIpc({} as never, 'global-capture-ipc')
        expect(mocks.registerHandleOnce).toHaveBeenCalledTimes(1)
        const [channel, , componentId] = mocks.registerHandleOnce.mock.calls[0]
        expect(channel).toBe(IPC.FILE.OPEN_OR_CREATE_ENTRY)
        expect(componentId).toBe('global-capture-ipc')
    })

    it('注册的监听器校验 kind 并返回结构化结果', async () => {
        registerCaptureIpc({} as never, 'global-capture-ipc')
        const listener = mocks.registerHandleOnce.mock.calls[0][1] as (
            event: unknown,
            payload: unknown
        ) => Promise<unknown>

        await expect(listener({}, { kind: 'weekly' })).resolves.toEqual({
            ok: false,
            reason: 'invalid-kind'
        })
        const result = (await listener({}, { kind: 'daily' })) as { ok: boolean; reason?: string }
        expect(result).toMatchObject({ ok: true })
    })
})
