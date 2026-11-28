/**
 * 1.5.7 LLM Wiki L1：工作区初始化服务单测（`src/main/utils/llm-wiki-workspace.ts`）
 *
 * 覆盖：
 * 1. 根校验：非字符串/空串 → NO_WORKSPACE；相对路径/设备命名空间 → INVALID_ROOT；
 *    不存在/普通文件 → ROOT_UNAVAILABLE；
 * 2. 成功路径：创建 `raw/`、`wiki/` 目录与 `schema.md` 约定模板（含 raw 不可变、
 *    wiki 编译态、front matter 规范示例等关键约定）；
 * 3. 幂等：目录已存在不报错；`schema.md` 已存在时**绝不覆盖**（返回成功）；
 * 4. 失败分支：目录创建失败 / schema.md 写入失败均返回结构化 `{ success:false, error }`，
 *    不向调用方抛异常（含非 Error 抛出值的文案归一化）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

// 仅按类型使用 electron 的模块在单测中无需真实 electron 运行时
vi.mock('electron', () => ({
    BrowserWindow: class {},
    shell: {}
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import {
    initializeLlmWikiWorkspace,
    LLM_WIKI_ERROR_CREATE_DIR_FAILED,
    LLM_WIKI_ERROR_INVALID_ROOT,
    LLM_WIKI_ERROR_NO_WORKSPACE,
    LLM_WIKI_ERROR_ROOT_UNAVAILABLE,
    LLM_WIKI_ERROR_WRITE_SCHEMA_FAILED,
    LLM_WIKI_RAW_DIR_NAME,
    LLM_WIKI_SCHEMA_FILE_NAME,
    LLM_WIKI_SCHEMA_TEMPLATE,
    LLM_WIKI_WIKI_DIR_NAME
} from '../../src/main/utils/llm-wiki-workspace'

let workspaceRoot = ''

beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-llm-wiki-'))
})

afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(workspaceRoot, { recursive: true, force: true })
})

describe('initializeLlmWikiWorkspace：根校验与降级', () => {
    it('非字符串/空串/纯空白根返回 NO_WORKSPACE', async () => {
        for (const input of [undefined, null, 42, {}, [], '', '   ']) {
            const result = await initializeLlmWikiWorkspace(input)
            expect(result.success, String(input)).toBe(false)
            expect(result.error).toBe(LLM_WIKI_ERROR_NO_WORKSPACE)
        }
    })

    it('相对路径与设备命名空间根返回 INVALID_ROOT', async () => {
        for (const input of ['relative/path', './x', '\\\\?\\C:\\Windows']) {
            const result = await initializeLlmWikiWorkspace(input)
            expect(result.success, input).toBe(false)
            expect(result.error).toBe(LLM_WIKI_ERROR_INVALID_ROOT)
        }
    })

    it('不存在的目录与普通文件根返回 ROOT_UNAVAILABLE', async () => {
        const missing = path.join(workspaceRoot, 'not-exists')
        expect(await initializeLlmWikiWorkspace(missing)).toEqual({
            success: false,
            error: LLM_WIKI_ERROR_ROOT_UNAVAILABLE
        })

        const filePath = path.join(workspaceRoot, 'note.md')
        await fs.writeFile(filePath, '# note', 'utf8')
        expect(await initializeLlmWikiWorkspace(filePath)).toEqual({
            success: false,
            error: LLM_WIKI_ERROR_ROOT_UNAVAILABLE
        })
    })
})

describe('initializeLlmWikiWorkspace：目录与 schema.md 模板', () => {
    it('创建 raw/、wiki/ 与 schema.md，模板包含 LLM Wiki 三项核心约定', async () => {
        const result = await initializeLlmWikiWorkspace(workspaceRoot)
        expect(result).toEqual({ success: true })

        const rawStat = await fs.stat(path.join(workspaceRoot, LLM_WIKI_RAW_DIR_NAME))
        const wikiStat = await fs.stat(path.join(workspaceRoot, LLM_WIKI_WIKI_DIR_NAME))
        expect(rawStat.isDirectory()).toBe(true)
        expect(wikiStat.isDirectory()).toBe(true)

        const schema = await fs.readFile(
            path.join(workspaceRoot, LLM_WIKI_SCHEMA_FILE_NAME),
            'utf8'
        )
        expect(schema).toBe(LLM_WIKI_SCHEMA_TEMPLATE)
        // ① raw 不可变（只读）约定
        expect(schema).toContain('raw/')
        expect(schema).toContain('不可变')
        expect(schema).toContain('只读')
        // ② wiki 为编译态约定
        expect(schema).toContain('编译态')
        // ③ front matter 规范 + 示例
        expect(schema).toContain('Front matter')
        expect(schema).toContain('```yaml')
        expect(schema).toContain('title:')
        expect(schema).toContain('tags:')
        expect(schema).toContain('status:')
    })

    it('目录已存在时幂等成功（不删除既有内容）', async () => {
        const rawDir = path.join(workspaceRoot, LLM_WIKI_RAW_DIR_NAME)
        await fs.mkdir(rawDir, { recursive: true })
        const keepFile = path.join(rawDir, 'source.pdf')
        await fs.writeFile(keepFile, 'raw-bytes', 'utf8')

        const result = await initializeLlmWikiWorkspace(workspaceRoot)
        expect(result).toEqual({ success: true })
        expect(await fs.readFile(keepFile, 'utf8')).toBe('raw-bytes')
    })

    it('schema.md 已存在时绝不覆盖（保留用户维护的约定文件）', async () => {
        const schemaPath = path.join(workspaceRoot, LLM_WIKI_SCHEMA_FILE_NAME)
        await fs.writeFile(schemaPath, '# 用户自定义约定', 'utf8')

        const result = await initializeLlmWikiWorkspace(workspaceRoot)
        expect(result).toEqual({ success: true })
        expect(await fs.readFile(schemaPath, 'utf8')).toBe('# 用户自定义约定')
    })
})

describe('initializeLlmWikiWorkspace：失败分支', () => {
    it('目录创建失败返回结构化失败（前缀 + 底层原因）', async () => {
        vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(new Error('EACCES: permission denied'))
        const result = await initializeLlmWikiWorkspace(workspaceRoot)
        expect(result.success).toBe(false)
        expect(result.error).toBe(`${LLM_WIKI_ERROR_CREATE_DIR_FAILED}EACCES: permission denied`)
    })

    it('schema.md 写入失败返回结构化失败（非 EEXIST，不覆盖既有文件）', async () => {
        vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('ENOSPC: no space left'))
        const result = await initializeLlmWikiWorkspace(workspaceRoot)
        expect(result.success).toBe(false)
        expect(result.error).toBe(`${LLM_WIKI_ERROR_WRITE_SCHEMA_FAILED}ENOSPC: no space left`)
    })

    it('底层抛出非 Error 值时文案归一化为字符串', async () => {
        vi.spyOn(fs, 'writeFile').mockRejectedValueOnce('boom-string' as never)
        const result = await initializeLlmWikiWorkspace(workspaceRoot)
        expect(result.success).toBe(false)
        expect(result.error).toBe(`${LLM_WIKI_ERROR_WRITE_SCHEMA_FAILED}boom-string`)
    })
})
