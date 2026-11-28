// @vitest-environment jsdom
/**
 * 1.5.7 迁移批次：渲染层迁移动作单测（`src/renderer/src/common/llm-wiki-migration-actions.ts`）
 *
 * 覆盖：
 * 1. 扫描/迁移/回滚：正常结果归一化（缺失字段补默认、非法条目丢弃、total 重算）；
 *    受限 ipcRenderer 不可用 / invoke 抛异常 → 结构化失败（不抛异常、文案可读）；
 * 2. 归一化函数对「主进程未受信返回对象」等异常结构的降级；
 * 3. AI 编译可用性检测：enabled + models 判定、配置读取失败降级为未配置；
 * 4. 纯工具函数：字节格式化、指定目录归一化、分批数量归一化（边界与非法值）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../../src/shared/ipc-channels'
import {
    formatLlmWikiMigrationBytes,
    LLM_WIKI_COMPILE_BATCH_SIZE_DEFAULT,
    LLM_WIKI_COMPILE_BATCH_SIZE_MAX,
    LLM_WIKI_COMPILE_BATCH_SIZE_MIN,
    normalizeCompileBatchSize,
    normalizeCompileDirectoryInput,
    normalizeLlmWikiMigrateResult,
    normalizeLlmWikiRollbackResult,
    normalizeLlmWikiScanResult,
    readLlmWikiAiCompileStatus,
    rollbackWorkspaceMigration,
    runWorkspaceMigration,
    scanWorkspaceMigratableFiles
} from '../../../src/renderer/src/common/llm-wiki-migration-actions'
import { t } from '../../../src/renderer/src/common/i18n'

const { loggerErrorMock } = vi.hoisted(() => ({
    loggerErrorMock: vi.fn()
}))

vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() }
}))

let invokeMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    invokeMock = vi.fn()
    vi.stubGlobal('electron', { ipcRenderer: { invoke: invokeMock } })
    loggerErrorMock.mockClear()
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 构造完整扫描结果替身 */
function scanResultPayload(): Record<string, unknown> {
    return {
        ok: true,
        formats: [
            { id: 'markdown', count: 2, bytes: 20 },
            { id: 'image', count: 1, bytes: 5 },
            { id: 'invalid', count: 99, bytes: 99 }
        ],
        total: 99,
        links: {
            total: 2,
            items: [
                { file: 'a.md', line: 3, target: 'b.md', targetFile: 'b.md', format: 'markdown' },
                { file: 'x', line: 0, target: 'y', targetFile: 'z', format: 'nope' }
            ]
        }
    }
}

describe('scanWorkspaceMigratableFiles：调用与归一化', () => {
    it('正常返回：缺失格式补 0、非法格式丢弃、total 按格式重算、链接明细过滤', async () => {
        invokeMock.mockResolvedValue(scanResultPayload())

        const result = await scanWorkspaceMigratableFiles()

        expect(invokeMock).toHaveBeenCalledWith(IPC.LLM_WIKI.SCAN_FILES)
        expect(result.ok).toBe(true)
        expect(result.formats.map((item) => item.id)).toEqual([
            'markdown',
            'image',
            'pdf',
            'html',
            'text'
        ])
        expect(result.formats.find((item) => item.id === 'pdf')).toEqual({
            id: 'pdf',
            count: 0,
            bytes: 0
        })
        expect(result.total).toBe(3)
        // 非法 format 的链接条目被丢弃，行号下限 1
        expect(result.links.items).toEqual([
            { file: 'a.md', line: 3, target: 'b.md', targetFile: 'b.md', format: 'markdown' }
        ])
        expect(result.links.total).toBe(2)
    })

    it('非对象返回按 IPC 不可用降级（ok=false + 可读错误）', async () => {
        invokeMock.mockResolvedValue(null)
        const result = await scanWorkspaceMigratableFiles()
        expect(result.ok).toBe(false)
        expect(result.error).toBe(t('dialogRenderer.migrationWizard.ipcUnavailable'))
        expect(result.total).toBe(0)
    })

    it('invoke 抛异常：记录错误日志并返回结构化失败', async () => {
        invokeMock.mockRejectedValue(new Error('channel closed'))
        const result = await scanWorkspaceMigratableFiles()
        expect(result.ok).toBe(false)
        expect(result.error).toBe(t('dialogRenderer.migrationWizard.ipcUnavailable'))
        expect(loggerErrorMock).toHaveBeenCalled()
    })

    it('受限 ipcRenderer 不可用（无 window.electron）：返回结构化失败', async () => {
        vi.unstubAllGlobals()
        const result = await scanWorkspaceMigratableFiles()
        expect(result.ok).toBe(false)
        expect(result.error).toBe(t('dialogRenderer.migrationWizard.ipcUnavailable'))
    })

    it('主进程返回截断标记与 error 时透传', async () => {
        invokeMock.mockResolvedValue({
            ok: false,
            formats: [],
            total: 0,
            truncated: true,
            links: { total: 0, items: [] },
            error: '根目录不可访问'
        })
        const result = await scanWorkspaceMigratableFiles()
        expect(result.ok).toBe(false)
        expect(result.truncated).toBe(true)
        expect(result.error).toBe('根目录不可访问')
    })
})

describe('runWorkspaceMigration：调用与归一化', () => {
    it('正常返回：明细归一化 + logId 透传', async () => {
        invokeMock.mockResolvedValue({
            ok: true,
            mode: 'copy',
            copied: [
                { path: '/ws/a.md', relativePath: 'a.md', targetPath: '/ws/raw/a.md', bytes: 4 }
            ],
            moved: [],
            skipped: [{ path: 'b.md', reason: '目标已存在同名文件（不覆盖，已跳过）' }],
            failed: [{ path: 'c.md' }],
            logId: '20261128-120000-123'
        })

        const result = await runWorkspaceMigration({ mode: 'copy', formats: ['markdown'] })

        expect(invokeMock).toHaveBeenCalledWith(IPC.LLM_WIKI.MIGRATE, {
            mode: 'copy',
            formats: ['markdown']
        })
        expect(result.ok).toBe(true)
        expect(result.copied).toHaveLength(1)
        expect(result.skipped[0]!.reason).toContain('同名')
        // 缺失 reason 的失败条目用兜底文案
        expect(result.failed[0]!.reason).toBe(t('dialogRenderer.migrationWizard.unknownError'))
        expect(result.logId).toBe('20261128-120000-123')
    })

    it('主进程不受信拒绝对象（无业务字段）→ 归一化为 ok=false', async () => {
        invokeMock.mockResolvedValue({
            ok: false,
            code: 'untrusted-sender',
            error: 'IPC sender is not trusted'
        })
        const result = await runWorkspaceMigration({ mode: 'move', formats: ['pdf'] })
        expect(result.ok).toBe(false)
        expect(result.mode).toBeNull()
        expect(result.error).toBe('IPC sender is not trusted')
        expect(result.copied).toEqual([])
    })

    it('invoke 抛异常：记录错误日志并返回结构化失败', async () => {
        invokeMock.mockRejectedValue(new Error('ipc broken'))
        const result = await runWorkspaceMigration({ mode: 'move', formats: ['pdf'] })
        expect(result.ok).toBe(false)
        expect(result.mode).toBe('move')
        expect(result.error).toBe(t('dialogRenderer.migrationWizard.ipcUnavailable'))
    })

    it('无 ipcRenderer：返回结构化失败', async () => {
        vi.unstubAllGlobals()
        const result = await runWorkspaceMigration({ mode: 'copy', formats: ['markdown'] })
        expect(result.ok).toBe(false)
        expect(result.error).toBe(t('dialogRenderer.migrationWizard.ipcUnavailable'))
    })
})

describe('rollbackWorkspaceMigration：调用与归一化', () => {
    it('正常返回：restored / failed / mode / logId 归一化', async () => {
        invokeMock.mockResolvedValue({
            ok: true,
            mode: 'move',
            restored: 2,
            failed: [{ path: 'a.md', reason: '原位置已存在同名文件（不覆盖）' }],
            logId: 'log-1'
        })

        const result = await rollbackWorkspaceMigration('log-1')

        expect(invokeMock).toHaveBeenCalledWith(IPC.LLM_WIKI.ROLLBACK_MIGRATION, {
            logId: 'log-1'
        })
        expect(result.ok).toBe(true)
        expect(result.restored).toBe(2)
        expect(result.mode).toBe('move')
        expect(result.failed[0]!.reason).toContain('原位置')
        expect(result.logId).toBe('log-1')
    })

    it('缺省 logId 时不传载荷', async () => {
        invokeMock.mockResolvedValue({ ok: false, error: '未找到可回滚的迁移记录。' })
        const result = await rollbackWorkspaceMigration()
        expect(invokeMock).toHaveBeenCalledWith(IPC.LLM_WIKI.ROLLBACK_MIGRATION, undefined)
        expect(result.ok).toBe(false)
        expect(result.error).toBe('未找到可回滚的迁移记录。')
    })

    it('invoke 抛异常 / 无 ipcRenderer：结构化失败', async () => {
        invokeMock.mockRejectedValue(new Error('boom'))
        const thrown = await rollbackWorkspaceMigration()
        expect(thrown.ok).toBe(false)
        expect(thrown.error).toBe(t('dialogRenderer.migrationWizard.ipcUnavailable'))

        vi.unstubAllGlobals()
        const unavailable = await rollbackWorkspaceMigration()
        expect(unavailable.ok).toBe(false)
        expect(unavailable.restored).toBe(0)
    })
})

describe('AI 编译可用性检测（复用 AI.GET_CONFIG）', () => {
    it('enabled=true 且有模型 → 已配置', async () => {
        invokeMock.mockResolvedValue({
            enabled: true,
            models: [{ id: 'm1', name: '模型一' }],
            defaultModelId: 'm1',
            apiKeyStorage: 'safe'
        })
        const status = await readLlmWikiAiCompileStatus()
        expect(invokeMock).toHaveBeenCalledWith(IPC.AI.GET_CONFIG)
        expect(status).toEqual({ configured: true, readFailed: false })
    })

    it('enabled=false 或模型为空 → 未配置', async () => {
        invokeMock.mockResolvedValueOnce({ enabled: false, models: [{ id: 'm1' }] })
        expect((await readLlmWikiAiCompileStatus()).configured).toBe(false)

        invokeMock.mockResolvedValueOnce({ enabled: true, models: [] })
        expect((await readLlmWikiAiCompileStatus()).configured).toBe(false)
    })

    it('配置读取失败（invoke 抛异常 / 无 ipcRenderer）→ 未配置 + readFailed', async () => {
        invokeMock.mockRejectedValue(new Error('config broken'))
        expect(await readLlmWikiAiCompileStatus()).toEqual({
            configured: false,
            readFailed: true
        })

        vi.unstubAllGlobals()
        expect(await readLlmWikiAiCompileStatus()).toEqual({
            configured: false,
            readFailed: true
        })
    })
})

describe('归一化函数：异常结构降级', () => {
    it('normalizeLlmWikiScanResult：非对象/链接缺失 → 安全默认值', () => {
        const fallback = normalizeLlmWikiScanResult('bad')
        expect(fallback.ok).toBe(false)
        expect(fallback.total).toBe(0)
        expect(fallback.links).toEqual({ total: 0, items: [] })
        expect(fallback.formats).toHaveLength(5)

        const noLinks = normalizeLlmWikiScanResult({ ok: true, formats: [] })
        expect(noLinks.ok).toBe(true)
        expect(noLinks.links).toEqual({ total: 0, items: [] })
    })

    it('normalizeLlmWikiMigrateResult：非对象/条目类型错误 → 安全默认值', () => {
        const fallback = normalizeLlmWikiMigrateResult(null)
        expect(fallback.ok).toBe(false)
        expect(fallback.mode).toBeNull()
        expect(fallback.logId).toBeNull()

        const badEntries = normalizeLlmWikiMigrateResult({
            ok: true,
            mode: 'move',
            moved: ['x', { relativePath: 'a.md' }, null],
            copied: 'not-array',
            skipped: [{ reason: '无路径' }],
            failed: null,
            logId: 42
        })
        expect(badEntries.moved).toHaveLength(1)
        expect(badEntries.copied).toEqual([])
        expect(badEntries.skipped).toEqual([])
        expect(badEntries.logId).toBeNull()
    })

    it('normalizeLlmWikiRollbackResult：非对象/字段缺失 → 安全默认值', () => {
        const fallback = normalizeLlmWikiRollbackResult(undefined)
        expect(fallback.ok).toBe(false)
        expect(fallback.restored).toBe(0)

        const partial = normalizeLlmWikiRollbackResult({
            ok: true,
            restored: -3,
            failed: [{ path: 'a.md' }, 'junk'],
            mode: 'copy',
            error: '  '
        })
        expect(partial.ok).toBe(true)
        expect(partial.restored).toBe(0)
        expect(partial.failed).toEqual([
            { path: 'a.md', reason: t('dialogRenderer.migrationWizard.unknownError') }
        ])
        expect(partial.mode).toBe('copy')
        expect(partial.error).toBeUndefined()
    })
})

describe('归一化补充分支', () => {
    it('扫描结果：格式数组重复/非法条目、链接条目缺字段、negative 数字降级', () => {
        const result = normalizeLlmWikiScanResult({
            ok: true,
            formats: [
                { id: 'markdown', count: -2, bytes: -1 },
                { id: 'markdown', count: 9, bytes: 9 },
                { id: 'unknown', count: 1 },
                'junk',
                null
            ],
            truncated: true,
            links: {
                total: -5,
                items: [
                    { format: 'image', file: 'a.md', targetFile: 'p.png' },
                    { format: 'image', file: '', targetFile: 'p.png', target: 'x' },
                    'junk'
                ]
            }
        })
        expect(result.total).toBe(0)
        expect(result.truncated).toBe(true)
        expect(result.links.items).toEqual([
            { file: 'a.md', line: 1, target: '', targetFile: 'p.png', format: 'image' }
        ])
        expect(result.links.total).toBe(1)
    })

    it('迁移结果：truncated / 混合非法条目归一化', () => {
        const result = normalizeLlmWikiMigrateResult({
            ok: true,
            mode: 'copy',
            truncated: true,
            moved: null,
            copied: [{ relativePath: 'a.md' }, { relativePath: '' }, 42],
            skipped: [{ path: 'b.md' }, { path: '' }, null],
            failed: 'not-array'
        })
        expect(result.truncated).toBe(true)
        expect(result.copied).toEqual([
            { path: '', relativePath: 'a.md', targetPath: '', bytes: 0 }
        ])
        expect(result.skipped).toHaveLength(1)
        expect(result.failed).toEqual([])
    })

    it('回滚结果：非法 mode/非数组 failed 归一化', () => {
        const result = normalizeLlmWikiRollbackResult({
            ok: false,
            mode: 'invalid',
            restored: 2,
            failed: 'nope',
            logId: '  '
        })
        expect(result.mode).toBeUndefined()
        expect(result.failed).toEqual([])
        expect(result.logId).toBeUndefined()
        expect(result.restored).toBe(2)
    })

    it('无 window 的极端环境（typeof window === undefined）→ 不可用降级', async () => {
        vi.stubGlobal('window', undefined)
        expect((await scanWorkspaceMigratableFiles()).ok).toBe(false)
        expect((await runWorkspaceMigration({ mode: 'copy', formats: ['markdown'] })).ok).toBe(
            false
        )
        expect((await rollbackWorkspaceMigration()).ok).toBe(false)
    })

    it('electron 桥存在但 invoke 缺失 → 按不可用降级', async () => {
        vi.stubGlobal('electron', { ipcRenderer: {} })
        expect((await scanWorkspaceMigratableFiles()).ok).toBe(false)
        expect((await runWorkspaceMigration({ mode: 'copy', formats: ['markdown'] })).ok).toBe(
            false
        )
        expect((await rollbackWorkspaceMigration()).ok).toBe(false)
    })
})

describe('纯工具函数', () => {
    it('formatLlmWikiMigrationBytes：单位换算与非法值', () => {
        expect(formatLlmWikiMigrationBytes(0)).toBe('0 B')
        expect(formatLlmWikiMigrationBytes(-1)).toBe('0 B')
        expect(formatLlmWikiMigrationBytes(Number.NaN)).toBe('0 B')
        expect(formatLlmWikiMigrationBytes(512)).toBe('512 B')
        expect(formatLlmWikiMigrationBytes(1024)).toBe('1 KB')
        expect(formatLlmWikiMigrationBytes(1536)).toBe('1.5 KB')
        expect(formatLlmWikiMigrationBytes(12 * 1024)).toBe('12 KB')
        expect(formatLlmWikiMigrationBytes(3 * 1024 * 1024)).toBe('3 MB')
        expect(formatLlmWikiMigrationBytes(2 * 1024 * 1024 * 1024)).toBe('2 GB')
    })

    it('normalizeCompileDirectoryInput：统一分隔符、拒绝绝对/空/.. 段', () => {
        expect(normalizeCompileDirectoryInput(' notes/sub ')).toBe('notes/sub')
        expect(normalizeCompileDirectoryInput('notes\\sub\\')).toBe('notes/sub')
        expect(normalizeCompileDirectoryInput('/notes/')).toBe('notes')
        expect(normalizeCompileDirectoryInput('')).toBeNull()
        expect(normalizeCompileDirectoryInput('   ')).toBeNull()
        expect(normalizeCompileDirectoryInput('../outside')).toBeNull()
        expect(normalizeCompileDirectoryInput('notes/../outside')).toBeNull()
        expect(normalizeCompileDirectoryInput('notes//sub')).toBeNull()
        expect(normalizeCompileDirectoryInput('.')).toBeNull()
    })

    it('normalizeCompileBatchSize：1–500 整数，非法返回 null', () => {
        expect(LLM_WIKI_COMPILE_BATCH_SIZE_DEFAULT).toBe(10)
        expect(normalizeCompileBatchSize(1)).toBe(LLM_WIKI_COMPILE_BATCH_SIZE_MIN)
        expect(normalizeCompileBatchSize('10')).toBe(10)
        expect(normalizeCompileBatchSize(LLM_WIKI_COMPILE_BATCH_SIZE_MAX)).toBe(500)
        expect(normalizeCompileBatchSize(0)).toBeNull()
        expect(normalizeCompileBatchSize(501)).toBeNull()
        expect(normalizeCompileBatchSize(2.5)).toBeNull()
        expect(normalizeCompileBatchSize('abc')).toBeNull()
        expect(normalizeCompileBatchSize(null)).toBeNull()
    })
})
