/**
 * 1.5.7 LLM Wiki L3：AI ingest / diff / 审批写盘单测
 * （`src/main/ai/{diff,prompt,workspace-path,validation,ingest,apply}.ts`）
 *
 * 覆盖：
 * 1. 行级 diff：新增/删除/上下文 + 行号 + 统计；相同内容全上下文；超限截断/降级；
 * 2. 提示词与草案归一化：默认页面路径清洗、代码围栏剥离、front matter 补齐、标题推导；
 * 3. 工作区相对路径白名单：合法/越界（绝对路径、盘符、`..`、控制字符）判定；
 * 4. IPC 载荷校验：chat/ingest/apply/save-config 的结构、长度、枚举与审批标记；
 * 5. ingest 编排：扫描 raw/（排序取首个）、指定 rawPath、front matter 元信息、
 *    草案目标（新建/既有 source 匹配更新）、不写盘、失败结构化 code；
 * 6. apply 守卫：审批标记、wiki/ 目录白名单、raw/ 目标拒绝、原子写入。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({
    app: {
        getPath: () => os.tmpdir(),
        getVersion: () => '1.0.0-test',
        getAppPath: () => os.tmpdir(),
        isPackaged: false
    },
    safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.from('cipher'),
        decryptString: () => ''
    },
    shell: { showItemInFolder: vi.fn(), openExternal: vi.fn(), trashItem: vi.fn() },
    BrowserWindow: class {},
    ipcMain: { on: vi.fn(), handle: vi.fn() }
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { buildAiDiff, splitAiDiffLines } from '../../src/main/ai/diff'
import {
    buildDefaultDraftRelativePath,
    buildIngestMessages,
    clampPromptRawContent,
    normalizeDraftContent,
    stripWrappingCodeFence
} from '../../src/main/ai/prompt'
import {
    isRelativePathInChildDir,
    normalizeWorkspaceRelativePath,
    resolvePathWithinWorkspaceChild
} from '../../src/main/ai/workspace-path'
import {
    normalizeAiApplyIngestRequest,
    normalizeAiChatRequest,
    normalizeAiIngestRequest,
    normalizeAiSaveConfigRequest,
    sanitizeAiBaseUrl
} from '../../src/main/ai/validation'
import { runAiIngest } from '../../src/main/ai/ingest'
import { runAiApplyIngest } from '../../src/main/ai/apply'
import { AiProviderError } from '../../src/main/ai/errors'
import type { AiProviderChatResult, AiProvider } from '../../src/main/ai/providers/types'
import { AI_INGEST_PROMPT_MAX_CHARS } from '../../src/shared/constants/ai'

/** 断言抛出的 AiProviderError code */
async function expectCode(action: () => unknown | Promise<unknown>, code: string): Promise<void> {
    try {
        await action()
    } catch (error) {
        expect(error).toBeInstanceOf(AiProviderError)
        expect((error as AiProviderError).code).toBe(code)
        return
    }
    throw new Error(`期望抛出 ${code}，但调用成功返回`)
}

let workspaceRoot = ''

beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-ai-ingest-'))
    await fs.mkdir(path.join(workspaceRoot, 'raw'), { recursive: true })
    await fs.mkdir(path.join(workspaceRoot, 'wiki'), { recursive: true })
})

afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true })
})

/** 构造假 Provider（chat 返回固定内容；记录调用参数） */
function makeFakeProvider(
    content = '# 生成的页面\n\n要点 A\n要点 B',
    model = 'fake-model'
): AiProvider & { chat: ReturnType<typeof vi.fn> } {
    return {
        id: 'fake',
        chat: vi.fn(async (): Promise<AiProviderChatResult> => ({ content, model })),
        testConnection: vi.fn(async () => ({ model, latencyMs: 1 }))
    }
}

/** ingest 依赖：假 providerLoader + 固定日期 */
function makeDeps(provider: AiProvider, rootPath = workspaceRoot) {
    return {
        rootPath,
        providerLoader: async () => ({
            provider,
            config: {
                enabled: true,
                provider: 'local' as const,
                localProvider: 'ollama' as const,
                baseUrl: '',
                model: 'fake-model'
            }
        }),
        now: () => new Date(2026, 10, 28)
    }
}

/** 写入 raw/ 测试文件 */
async function writeRaw(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(workspaceRoot, relativePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
}

/** 读取工作区文件（不存在返回 null） */
async function readWorkspaceFile(relativePath: string): Promise<string | null> {
    try {
        return await fs.readFile(path.join(workspaceRoot, relativePath), 'utf-8')
    } catch {
        return null
    }
}

describe('行级 diff（buildAiDiff）', () => {
    it('拆分行：统一换行并忽略末尾空行', () => {
        expect(splitAiDiffLines('a\r\nb\n')).toEqual(['a', 'b'])
        expect(splitAiDiffLines('')).toEqual([])
    })

    it('识别上下文/删除/新增行并统计数量', () => {
        const result = buildAiDiff('a\nb\nc', 'a\nx\nc')
        expect(result.truncated).toBe(false)
        expect(result.additions).toBe(1)
        expect(result.deletions).toBe(1)
        expect(result.lines).toEqual([
            { type: 'context', content: 'a', oldLine: 1, newLine: 1 },
            { type: 'del', content: 'b', oldLine: 2 },
            { type: 'add', content: 'x', newLine: 2 },
            { type: 'context', content: 'c', oldLine: 3, newLine: 3 }
        ])
    })

    it('新建页面：旧内容为空时全部为新增行', () => {
        const result = buildAiDiff('', 'line1\nline2\n')
        expect(result.lines.map((line) => line.type)).toEqual(['add', 'add'])
        expect(result.additions).toBe(2)
        expect(result.deletions).toBe(0)
    })

    it('内容相同时全部为上下文行', () => {
        const result = buildAiDiff('# 标题\n\n正文', '# 标题\n\n正文')
        expect(result.lines.every((line) => line.type === 'context')).toBe(true)
        expect(result.additions).toBe(0)
        expect(result.deletions).toBe(0)
    })

    it('超长内容降级为粗略 diff 并标记 truncated', () => {
        const oldLines = Array.from({ length: 3000 }, (_, index) => `old-${index}`)
        const newLines = Array.from({ length: 3000 }, (_, index) => `new-${index}`)
        const result = buildAiDiff(oldLines.join('\n'), newLines.join('\n'))
        expect(result.truncated).toBe(true)
        expect(result.lines).toHaveLength(2000)
        expect(result.lines[0].type).toBe('del')
        expect(result.deletions).toBe(3000)
        expect(result.additions).toBe(3000)
    })
})

describe('提示词与草案归一化（prompt）', () => {
    it('默认 wiki 页面路径：保留中英文与连字符，剔除非法字符', () => {
        expect(buildDefaultDraftRelativePath('raw/2026-11-28-来源.md')).toBe(
            'wiki/2026-11-28-来源.md'
        )
        expect(buildDefaultDraftRelativePath('raw/a b:c*d.txt')).toBe('wiki/a-b-c-d.md')
        expect(buildDefaultDraftRelativePath('raw/###.md')).toBe('wiki/untitled.md')
    })

    it('剥离整体包裹的 markdown 代码围栏', () => {
        expect(stripWrappingCodeFence('```markdown\n# hi\n```')).toBe('# hi')
        expect(stripWrappingCodeFence('```\n# hi\n```')).toBe('# hi')
        expect(stripWrappingCodeFence('# hi')).toBe('# hi')
    })

    it('模型输出缺 front matter 时补齐（标题/来源/日期）', () => {
        const content = normalizeDraftContent({
            modelOutput: '# 我的页面\n\n内容',
            sourceRelativePath: 'raw/source.md',
            rawTitle: '原始资料标题',
            rawTags: ['知识管理', 'LLM'],
            today: '2026-11-28'
        })
        expect(content.startsWith('---\n')).toBe(true)
        expect(content).toContain('title: 原始资料标题')
        expect(content).toContain('  - 知识管理')
        expect(content).toContain('  - raw/source.md')
        expect(content).toContain('created: 2026-11-28')
        expect(content).toContain('# 我的页面')
        expect(content.endsWith('\n')).toBe(true)
    })

    it('模型输出已有 front matter 时保持原样（仅去围栏/补结尾换行）', () => {
        const modelOutput = '```markdown\n---\ntitle: X\n---\n\n# X\n```'
        const content = normalizeDraftContent({
            modelOutput,
            sourceRelativePath: 'raw/source.md',
            today: '2026-11-28'
        })
        expect(content.startsWith('---\ntitle: X')).toBe(true)
        expect(content.endsWith('\n')).toBe(true)
    })

    it('原始资料超长时截断并带截断标记', () => {
        const longText = 'a'.repeat(AI_INGEST_PROMPT_MAX_CHARS + 100)
        const clamped = clampPromptRawContent(longText)
        expect(clamped.truncated).toBe(true)
        expect(clamped.content.length).toBeLessThanOrEqual(AI_INGEST_PROMPT_MAX_CHARS)
        expect(clamped.content).toContain('已截断')
    })

    it('构造 system + user 消息（含来源路径与正文）', () => {
        const messages = buildIngestMessages({
            sourceRelativePath: 'raw/source.md',
            rawContent: '原始内容',
            rawTruncated: false,
            draftRelativePath: 'wiki/source.md',
            today: '2026-11-28'
        })
        expect(messages.map((message) => message.role)).toEqual(['system', 'user'])
        expect(messages[1].content).toContain('raw/source.md')
        expect(messages[1].content).toContain('原始内容')
        expect(messages[1].content).toContain('wiki/source.md')
    })
})

describe('工作区相对路径白名单（workspace-path）', () => {
    it('接受合法相对路径并归一化反斜杠', () => {
        expect(normalizeWorkspaceRelativePath('raw/a.md')).toBe('raw/a.md')
        expect(normalizeWorkspaceRelativePath('  raw\\sub\\a.md  ')).toBe('raw/sub/a.md')
    })

    it.each([
        ['绝对路径 /etc/passwd', '/etc/passwd'],
        ['Windows 绝对路径', 'C:\\notes\\a.md'],
        ['盘符相对', 'C:a.md'],
        ['.. 回溯', 'raw/../wiki/a.md'],
        ['仅 ..', '..'],
        ['UNC', '\\\\server\\share\\a.md'],
        ['控制字符', 'raw/a\u0000b.md'],
        ['空串', '   ']
    ])('拒绝%s', (_label, value) => {
        expect(normalizeWorkspaceRelativePath(value)).toBeNull()
    })

    it('子目录判定与绝对路径复核', () => {
        expect(isRelativePathInChildDir('raw/a.md', 'raw')).toBe(true)
        expect(isRelativePathInChildDir('raw', 'raw')).toBe(false)
        expect(isRelativePathInChildDir('wiki/a.md', 'raw')).toBe(false)
        const resolved = resolvePathWithinWorkspaceChild(workspaceRoot, 'raw/a.md', 'raw')
        expect(resolved).not.toBeNull()
        expect(resolved as string).toBe(path.join(workspaceRoot, 'raw', 'a.md'))
        expect(resolvePathWithinWorkspaceChild(workspaceRoot, 'wiki/a.md', 'raw')).toBeNull()
    })
})

describe('IPC 载荷校验（validation）', () => {
    it('chat：messages 必须为数组，空数组合法（连接测试语义）', () => {
        expect(normalizeAiChatRequest({ messages: [] })).toEqual({ messages: [] })
        expect(() => normalizeAiChatRequest({})).toThrowError(AiProviderError)
        expect(() => normalizeAiChatRequest({ messages: 'x' })).toThrowError(AiProviderError)
    })

    it('chat：role 白名单与内容长度上限', () => {
        expect(
            normalizeAiChatRequest({
                messages: [{ role: 'user', content: 'hi' }],
                context: { title: 'T', selection: null }
            })
        ).toEqual({
            messages: [{ role: 'user', content: 'hi' }],
            context: { title: 'T', selection: undefined }
        })
        expect(() =>
            normalizeAiChatRequest({ messages: [{ role: 'system', content: 'x'.repeat(40000) }] })
        ).toThrowError(AiProviderError)
        expect(() =>
            normalizeAiChatRequest({ messages: [{ role: 'tool', content: 'x' }] })
        ).toThrowError(AiProviderError)
    })

    it('ingest：rawPath 可选，空串按缺省处理', () => {
        expect(normalizeAiIngestRequest(undefined)).toEqual({})
        expect(normalizeAiIngestRequest({ rawPath: '  ' })).toEqual({})
        expect(normalizeAiIngestRequest({ rawPath: 'raw/a.md' })).toEqual({ rawPath: 'raw/a.md' })
        expect(() => normalizeAiIngestRequest({ rawPath: 1 })).toThrowError(AiProviderError)
    })

    it('apply：approved 必须为 true，内容非空且限长', async () => {
        await expectCode(
            () =>
                normalizeAiApplyIngestRequest({
                    draftPath: 'wiki/a.md',
                    content: 'x',
                    approved: false
                }),
            'AI_NOT_APPROVED'
        )
        await expectCode(
            () =>
                normalizeAiApplyIngestRequest({
                    draftPath: 'wiki/a.md',
                    content: '',
                    approved: true
                }),
            'AI_INVALID_PAYLOAD'
        )
        const normalized = normalizeAiApplyIngestRequest({
            draftPath: 'wiki/a.md',
            content: '# x',
            approved: true
        })
        expect(normalized).toEqual({ draftPath: 'wiki/a.md', content: '# x', approved: true })
    })

    it('save-config：枚举/布尔/baseUrl/密钥互斥校验', () => {
        expect(normalizeAiSaveConfigRequest({ enabled: true, provider: 'remote' })).toEqual({
            enabled: true,
            provider: 'remote'
        })
        expect(() => normalizeAiSaveConfigRequest({ provider: 'cloud' })).toThrowError(
            AiProviderError
        )
        expect(() => normalizeAiSaveConfigRequest({ enabled: 'yes' })).toThrowError(AiProviderError)
        expect(() =>
            normalizeAiSaveConfigRequest({ apiKey: 'sk-x', clearApiKey: true })
        ).toThrowError(AiProviderError)
        expect(normalizeAiSaveConfigRequest({ clearApiKey: true })).toEqual({ clearApiKey: true })
        expect(sanitizeAiBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1')
        expect(sanitizeAiBaseUrl('')).toBe('')
        expect(() => sanitizeAiBaseUrl('ftp://x')).toThrowError(AiProviderError)
        expect(() => sanitizeAiBaseUrl('https://user:pass@x')).toThrowError(AiProviderError)
        expect(() => sanitizeAiBaseUrl('not-a-url')).toThrowError(AiProviderError)
    })
})

describe('ingest 编排（runAiIngest，不写盘）', () => {
    it('扫描 raw/ 取排序首个文件，生成草案 + front matter + diff，且不写盘', async () => {
        await writeRaw('raw/b-source.md', 'B 内容')
        await writeRaw('raw/a-source.md', '---\ntitle: 原始标题\ntags:\n  - 标签A\n---\n\nA 内容')
        const provider = makeFakeProvider()
        const result = await runAiIngest({}, makeDeps(provider))
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.sourcePath).toBe('raw/a-source.md')
        expect(result.draftPath).toBe('wiki/a-source.md')
        expect(result.isUpdate).toBe(false)
        expect(result.content).toContain('title: 原始标题')
        expect(result.content).toContain('  - 标签A')
        expect(result.diff.length).toBeGreaterThan(0)
        expect(result.diff.every((line) => line.type === 'add')).toBe(true)
        // 不写盘：wiki/ 目录下没有生成文件
        expect(await readWorkspaceFile('wiki/a-source.md')).toBeNull()
        // 提示词包含 raw 正文
        const chatCalls = provider.chat.mock.calls as unknown as Array<[Array<{ content: string }>]>
        expect(chatCalls[0][0][1].content).toContain('A 内容')
    })

    it('指定 rawPath：只编译该文件', async () => {
        await writeRaw('raw/a.md', '# A')
        await writeRaw('raw/b.md', '# B')
        const provider = makeFakeProvider()
        const result = await runAiIngest({ rawPath: 'raw/b.md' }, makeDeps(provider))
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.sourcePath).toBe('raw/b.md')
            expect(result.draftPath).toBe('wiki/b.md')
        }
    })

    it('既有 wiki 页面 source 匹配 → 更新目标并给出删除/新增行 diff', async () => {
        await writeRaw('raw/a.md', '# A')
        await fs.writeFile(
            path.join(workspaceRoot, 'wiki', 'existing.md'),
            '---\ntitle: Old\nsource:\n  - raw/a.md\n---\n\n# Old\n',
            'utf-8'
        )
        const provider = makeFakeProvider('---\ntitle: New\nsource:\n  - raw/a.md\n---\n\n# New')
        const result = await runAiIngest({ rawPath: 'raw/a.md' }, makeDeps(provider))
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.draftPath).toBe('wiki/existing.md')
            expect(result.isUpdate).toBe(true)
            expect(result.diff.some((line) => line.type === 'del')).toBe(true)
            expect(result.diff.some((line) => line.type === 'add')).toBe(true)
        }
        // 审批前不写盘：既有页面内容保持不变
        expect(await readWorkspaceFile('wiki/existing.md')).toContain('# Old')
    })

    it.each([
        ['绝对路径', 'C:\\raw\\a.md'],
        ['越界路径', '../outside.md'],
        ['不在 raw/ 下', 'wiki/a.md'],
        ['扩展名不支持', 'raw/a.png']
    ])('非法 rawPath（%s）→ AI_RAW_PATH_INVALID', async (_label, rawPath) => {
        const provider = makeFakeProvider()
        await expectCode(async () => {
            const result = await runAiIngest({ rawPath }, makeDeps(provider))
            if (!result.ok) {
                throw new AiProviderError(result.code, result.message)
            }
        }, 'AI_RAW_PATH_INVALID')
    })

    it('raw/ 目录缺失 → AI_WORKSPACE_UNAVAILABLE（提示先初始化）', async () => {
        await fs.rm(path.join(workspaceRoot, 'raw'), { recursive: true, force: true })
        await expectCode(async () => {
            const result = await runAiIngest({}, makeDeps(makeFakeProvider()))
            if (!result.ok) {
                throw new AiProviderError(result.code, result.message)
            }
        }, 'AI_WORKSPACE_UNAVAILABLE')
    })

    it('raw/ 为空 → AI_NO_RAW_FILES', async () => {
        await expectCode(async () => {
            const result = await runAiIngest({}, makeDeps(makeFakeProvider()))
            if (!result.ok) {
                throw new AiProviderError(result.code, result.message)
            }
        }, 'AI_NO_RAW_FILES')
    })

    it('Provider 报错（如未配置）原样传出结构化错误', async () => {
        await writeRaw('raw/a.md', '# A')
        const failingProvider: AiProvider = {
            id: 'fake',
            chat: async () => {
                throw new AiProviderError('AI_NOT_CONFIGURED', 'AI 助手未启用')
            },
            testConnection: async () => ({ model: 'x', latencyMs: 1 })
        }
        await expectCode(
            () =>
                runAiIngest(
                    { rawPath: 'raw/a.md' },
                    {
                        rootPath: workspaceRoot,
                        providerLoader: async () => ({
                            provider: failingProvider,
                            config: {
                                enabled: true,
                                provider: 'local',
                                localProvider: 'ollama',
                                baseUrl: '',
                                model: 'm'
                            }
                        })
                    }
                ),
            'AI_NOT_CONFIGURED'
        )
    })
})

describe('审批写盘（runAiApplyIngest）', () => {
    it('approved=true 时写入 wiki/ 下目标（父目录自动创建，内容完整）', async () => {
        const result = await runAiApplyIngest(
            { draftPath: 'wiki/sub/page.md', content: '# 新页面\n', approved: true },
            { rootPath: workspaceRoot }
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.draftPath).toBe('wiki/sub/page.md')
            expect(result.bytes).toBeGreaterThan(0)
        }
        expect(await readWorkspaceFile('wiki/sub/page.md')).toBe('# 新页面\n')
    })

    it('未审批（approved=false）→ AI_NOT_APPROVED 且不写盘', async () => {
        await expectCode(
            () =>
                runAiApplyIngest(
                    { draftPath: 'wiki/a.md', content: '# x', approved: false },
                    { rootPath: workspaceRoot }
                ),
            'AI_NOT_APPROVED'
        )
        expect(await readWorkspaceFile('wiki/a.md')).toBeNull()
    })

    it.each([
        ['绝对路径', 'C:\\notes\\a.md'],
        ['不在 wiki/ 下', 'raw/a.md'],
        ['工作区根文件', 'a.md'],
        ['.. 回溯', 'wiki/../raw/a.md'],
        ['扩展名不支持', 'wiki/a.txt']
    ])('非法目标（%s）→ AI_TARGET_NOT_ALLOWED 且不写盘', async (_label, draftPath) => {
        await expectCode(
            () =>
                runAiApplyIngest(
                    { draftPath, content: '# x', approved: true },
                    { rootPath: workspaceRoot }
                ),
            'AI_TARGET_NOT_ALLOWED'
        )
    })

    it('工作区根为空 → AI_WORKSPACE_UNAVAILABLE（不写盘）', async () => {
        await expectCode(
            () =>
                runAiApplyIngest(
                    { draftPath: 'wiki/a.md', content: '# x', approved: true },
                    { rootPath: '' }
                ),
            'AI_WORKSPACE_UNAVAILABLE'
        )
    })
})
