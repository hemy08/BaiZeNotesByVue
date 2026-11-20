/**
 * Word 导入/导出任务实现单测（P2-2）
 *
 * 覆盖目标：
 * 1. 进程内转换（worker 与降级路径共用的真实实现）成功：真实小 docx → Markdown、
 *    Markdown → 真实 docx（PK 魔数）；
 * 2. worker 任务分发 `handleWordWorkerRequest`：导入/导出成功应答 id 一致，
 *    转换失败/参数非法/未知任务均转为 ok:false（不抛异常，避免 worker 线程崩溃）；
 * 3. 错误文案保留用户可读原因（docx 不存在 → ENOENT 文案）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as path from 'node:path'
import * as os from 'node:os'
import { promises as fs, createWriteStream } from 'node:fs'
import officeGen from 'officegen'
import {
    convertDocxToMarkdownInProcess,
    exportMarkdownToWordInProcess,
    handleWordWorkerRequest
} from '../../src/main/utils/file-utils/word-worker-tasks'
import type { WordWorkerRequest } from '../../src/main/utils/file-utils/word-worker-protocol'

let tmpDir = ''

/** 用 officegen 生成真实 docx 文件（与用户 Word 导入路径同格式） */
async function writeDocx(target: string, paragraphs: string[]): Promise<void> {
    const docx = officeGen('docx')
    for (const text of paragraphs) {
        docx.createP().addText(text)
    }
    await new Promise<void>((resolve, reject) => {
        const stream = createWriteStream(target)
        docx.generate(stream)
        stream.on('close', () => resolve())
        stream.on('error', reject)
    })
}

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-word-tasks-test-'))
})

afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('进程内转换实现（worker 与降级路径共用）', () => {
    it('应把真实 docx 转为 Markdown', async () => {
        const docxPath = path.join(tmpDir, 'sample.docx')
        await writeDocx(docxPath, ['Hello BaiZe 白泽笔记', '第二段内容'])

        const markdown = await convertDocxToMarkdownInProcess(docxPath)

        expect(markdown).toContain('Hello BaiZe 白泽笔记')
        expect(markdown).toContain('第二段内容')
        expect(markdown).not.toContain('<p>')
    })

    it('应把 Markdown 导出为真实 docx（zip 魔数）', async () => {
        const target = path.join(tmpDir, 'out.docx')
        await exportMarkdownToWordInProcess('# 一级标题\n\n正文段落', target)

        const buffer = await fs.readFile(target)
        expect(buffer.length).toBeGreaterThan(100)
        expect(buffer.subarray(0, 2).toString()).toBe('PK')
    })

    it('docx 不存在时应抛错（由任务分发统一转为失败应答）', async () => {
        await expect(
            convertDocxToMarkdownInProcess(path.join(tmpDir, 'missing.docx'))
        ).rejects.toThrow()
    })
})

describe('handleWordWorkerRequest：导入/导出分发', () => {
    it('导入成功应答应带请求 id 与 Markdown 正文', async () => {
        const docxPath = path.join(tmpDir, 'dispatch.docx')
        await writeDocx(docxPath, ['分发测试内容'])
        const request: WordWorkerRequest = { id: 7, type: 'wordImport', filePath: docxPath }

        const response = await handleWordWorkerRequest(request)

        expect(response.id).toBe(7)
        expect(response.ok).toBe(true)
        expect(response.markdown).toContain('分发测试内容')
        expect(response.error).toBeUndefined()
    })

    it('导入失败应答应 ok:false 且保留 ENOENT 原因（不抛出）', async () => {
        const request: WordWorkerRequest = {
            id: 8,
            type: 'wordImport',
            filePath: path.join(tmpDir, 'does-not-exist.docx')
        }

        const response = await handleWordWorkerRequest(request)

        expect(response.id).toBe(8)
        expect(response.ok).toBe(false)
        expect(response.error).toContain('Word 导入失败')
        expect(response.error).toContain('ENOENT')
    })

    it('导出成功应答应 ok:true 并写出真实 docx', async () => {
        const target = path.join(tmpDir, 'dispatch-out.docx')
        const request: WordWorkerRequest = {
            id: 9,
            type: 'wordExport',
            content: '# 分发导出',
            filePath: target
        }

        const response = await handleWordWorkerRequest(request)

        expect(response.id).toBe(9)
        expect(response.ok).toBe(true)
        const buffer = await fs.readFile(target)
        expect(buffer.subarray(0, 2).toString()).toBe('PK')
    })

    it('导出失败（目标目录不存在）应 ok:false 且不抛出', async () => {
        const request: WordWorkerRequest = {
            id: 10,
            type: 'wordExport',
            content: '# x',
            filePath: path.join(tmpDir, 'no-such-dir', 'out.docx')
        }

        const response = await handleWordWorkerRequest(request)

        expect(response.id).toBe(10)
        expect(response.ok).toBe(false)
        expect(response.error).toContain('Word 导出失败')
    })
})

describe('handleWordWorkerRequest：非法/损坏任务防御', () => {
    it('缺少文件路径的导入任务应返回失败应答', async () => {
        const response = await handleWordWorkerRequest({
            id: 11,
            type: 'wordImport',
            filePath: ''
        } as WordWorkerRequest)

        expect(response).toEqual({ id: 11, ok: false, error: 'Word 导入任务缺少文件路径' })
    })

    it('缺少正文的导出任务应返回失败应答', async () => {
        const response = await handleWordWorkerRequest({
            id: 12,
            type: 'wordExport',
            content: '',
            filePath: path.join(tmpDir, 'x.docx')
        } as WordWorkerRequest)

        expect(response).toEqual({ id: 12, ok: false, error: 'Word 导出任务缺少文档内容' })
    })

    it('缺少目标路径的导出任务应返回失败应答', async () => {
        const response = await handleWordWorkerRequest({
            id: 13,
            type: 'wordExport',
            content: '# x',
            filePath: ''
        } as WordWorkerRequest)

        expect(response).toEqual({ id: 13, ok: false, error: 'Word 导出任务缺少目标路径' })
    })

    it('未知任务类型应返回失败应答并保留 id', async () => {
        const response = await handleWordWorkerRequest({
            id: 14,
            type: 'unknown'
        } as unknown as WordWorkerRequest)

        expect(response.id).toBe(14)
        expect(response.ok).toBe(false)
        expect(response.error).toContain('不支持的 Word worker 任务类型')
    })

    it('无法解析 id 的损坏消息应返回 id=-1 的失败应答', async () => {
        const response = await handleWordWorkerRequest(null as unknown as WordWorkerRequest)

        expect(response.id).toBe(-1)
        expect(response.ok).toBe(false)
    })
})
