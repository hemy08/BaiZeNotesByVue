// @vitest-environment node
/**
 * A2 工作区搜索渲染层纯函数工具单测（2026-11-21）
 *
 * 覆盖：请求载荷构造、IPC 结果防御性归一化、替换结果归一化、Quick Open 文件过滤、
 * 子序列匹配与列表导航索引计算。
 */
import { describe, it, expect } from 'vitest'

import {
    DEFAULT_WORKSPACE_SEARCH_CRITERIA,
    buildReplaceAllOptions,
    buildReplaceOneOptions,
    buildWorkspaceSearchOptions,
    failedWorkspaceSearchResult,
    filterWorkspaceFileEntries,
    isSubsequenceMatch,
    moveListSelection,
    normalizeWorkspaceReplaceResult,
    normalizeWorkspaceSearchResult
} from '../../../src/renderer/src/components/search/workspace-search-utils'

/** 完整合法搜索响应 */
const validSearchResult = {
    ok: true,
    files: [
        {
            filePath: 'C:/w/a.md',
            relativePath: 'a.md',
            matches: [
                { line: 1, column: 3, preview: '# Hello' },
                { line: 2, column: 7, preview: 'world hello' }
            ]
        }
    ],
    truncated: false,
    matchCount: 2,
    scannedFiles: 5
}

describe('请求载荷构造', () => {
    it('默认条件全部为 false，listFilesOnly/maxResults 按需附加', () => {
        expect(buildWorkspaceSearchOptions('hello', DEFAULT_WORKSPACE_SEARCH_CRITERIA)).toEqual({
            query: 'hello',
            caseSensitive: false,
            wholeWord: false,
            useRegex: false
        })
        expect(
            buildWorkspaceSearchOptions(
                'x',
                { caseSensitive: true, wholeWord: true, useRegex: true },
                { listFilesOnly: true, maxResults: 10 }
            )
        ).toEqual({
            query: 'x',
            caseSensitive: true,
            wholeWord: true,
            useRegex: true,
            listFilesOnly: true,
            maxResults: 10
        })
        // 非法 maxResults 不写入
        expect(
            buildWorkspaceSearchOptions('x', DEFAULT_WORKSPACE_SEARCH_CRITERIA, {
                maxResults: Number.NaN
            }).maxResults
        ).toBeUndefined()
    })

    it('构造单处替换载荷（文件数组只含目标文件，带 line/column）', () => {
        expect(
            buildReplaceOneOptions({
                query: 'hello',
                criteria: { caseSensitive: true, wholeWord: false, useRegex: false },
                replacement: 'HI',
                filePath: 'C:/w/a.md',
                line: 2,
                column: 7
            })
        ).toEqual({
            query: 'hello',
            caseSensitive: true,
            wholeWord: false,
            useRegex: false,
            replacement: 'HI',
            filePaths: ['C:/w/a.md'],
            line: 2,
            column: 7
        })
    })

    it('构造全部替换载荷（文件列表复制，不带 line/column）', () => {
        const options = buildReplaceAllOptions({
            query: 'hello',
            criteria: DEFAULT_WORKSPACE_SEARCH_CRITERIA,
            replacement: 'HI',
            filePaths: ['C:/w/a.md', 'C:/w/b.md']
        })
        expect(options.filePaths).toEqual(['C:/w/a.md', 'C:/w/b.md'])
        expect(options.line).toBeUndefined()
        expect(options.column).toBeUndefined()
    })
})

describe('normalizeWorkspaceSearchResult（IPC 边界防御）', () => {
    it('合法响应原样归一化', () => {
        const result = normalizeWorkspaceSearchResult(validSearchResult)
        expect(result.ok).toBe(true)
        expect(result.files).toHaveLength(1)
        expect(result.files[0].matches).toHaveLength(2)
        expect(result.matchCount).toBe(2)
        expect(result.scannedFiles).toBe(5)
        expect(result.truncated).toBe(false)
        expect(result.fileList).toBeUndefined()
    })

    it('fileList 存在时归一化文本文件清单', () => {
        const result = normalizeWorkspaceSearchResult({
            ok: true,
            files: [],
            fileList: [
                { filePath: 'C:/w/a.md', relativePath: 'a.md' },
                { filePath: '', relativePath: 'bad.md' },
                'bad'
            ],
            truncated: true,
            matchCount: 0,
            scannedFiles: 1
        })
        expect(result.fileList).toEqual([{ filePath: 'C:/w/a.md', relativePath: 'a.md' }])
        expect(result.truncated).toBe(true)
    })

    it('畸形匹配/文件项被丢弃，缺省计数由有效项推导', () => {
        const result = normalizeWorkspaceSearchResult({
            ok: true,
            files: [
                {
                    filePath: 'C:/w/a.md',
                    relativePath: 'a.md',
                    matches: [
                        { line: 0, column: 1, preview: 'bad-line' },
                        { line: 1, column: 0, preview: 'bad-column' },
                        { line: 2, column: 3, preview: 'ok' }
                    ]
                },
                { filePath: 'C:/w/empty.md', relativePath: 'empty.md', matches: [] },
                { relativePath: 'no-path.md', matches: [{ line: 1, column: 1 }] },
                null
            ]
        })
        expect(result.ok).toBe(true)
        expect(result.files).toHaveLength(1)
        expect(result.files[0].matches).toEqual([{ line: 2, column: 3, preview: 'ok' }])
        // 缺省 matchCount 按有效匹配推导；缺省 scannedFiles 为 0
        expect(result.matchCount).toBe(1)
        expect(result.scannedFiles).toBe(0)
    })

    it('ok=false 时保留合法 code，非法 code 归一为 SEARCH_FAILED', () => {
        expect(normalizeWorkspaceSearchResult({ ok: false, code: 'NO_WORKSPACE' })).toMatchObject({
            ok: false,
            code: 'NO_WORKSPACE',
            files: []
        })
        expect(normalizeWorkspaceSearchResult({ ok: false, code: 'WHATEVER' }).code).toBe(
            'SEARCH_FAILED'
        )
        expect(normalizeWorkspaceSearchResult(null)).toEqual(failedWorkspaceSearchResult())
        expect(normalizeWorkspaceSearchResult('bad').code).toBe('SEARCH_FAILED')
    })
})

describe('normalizeWorkspaceReplaceResult（IPC 边界防御）', () => {
    it('合法响应归一化', () => {
        const result = normalizeWorkspaceReplaceResult({
            ok: true,
            files: [{ filePath: 'C:/w/a.md', relativePath: 'a.md', replacements: 2 }],
            totalReplacements: 2
        })
        expect(result).toEqual({
            ok: true,
            files: [{ filePath: 'C:/w/a.md', relativePath: 'a.md', replacements: 2 }],
            totalReplacements: 2
        })
    })

    it('失败响应保留 code 与部分写入文件，非法 code 归一为 INTERNAL_ERROR', () => {
        const result = normalizeWorkspaceReplaceResult({
            ok: false,
            code: 'WRITE_FAILED',
            files: [{ filePath: 'C:/w/a.md', relativePath: 'a.md', replacements: 1 }],
            totalReplacements: 1
        })
        expect(result.ok).toBe(false)
        expect(result.code).toBe('WRITE_FAILED')
        expect(result.totalReplacements).toBe(1)
        expect(normalizeWorkspaceReplaceResult({ ok: false, code: 'NOPE' }).code).toBe(
            'INTERNAL_ERROR'
        )
        expect(normalizeWorkspaceReplaceResult(undefined).code).toBe('INTERNAL_ERROR')
    })
})

describe('Quick Open 过滤', () => {
    const entries = [
        { filePath: 'C:/w/docs/guide.md', relativePath: 'docs/guide.md' },
        { filePath: 'C:/w/src/workspace-search.md', relativePath: 'src/workspace-search.md' },
        { filePath: 'C:/w/README.md', relativePath: 'README.md' }
    ]

    it('空查询返回全部（保持原顺序）', () => {
        expect(filterWorkspaceFileEntries(entries, '')).toEqual(entries)
        expect(filterWorkspaceFileEntries(entries, '   ')).toEqual(entries)
    })

    it('子串命中优先且文件名命中排在前面', () => {
        const result = filterWorkspaceFileEntries(entries, 'guide')
        expect(result.map((entry) => entry.relativePath)).toEqual(['docs/guide.md'])
    })

    it('子序列兜底匹配（wsm → workspace-search.md）', () => {
        const result = filterWorkspaceFileEntries(entries, 'wsm')
        expect(result.map((entry) => entry.relativePath)).toEqual(['src/workspace-search.md'])
    })

    it('无命中返回空数组；大小写不敏感', () => {
        expect(filterWorkspaceFileEntries(entries, 'zzz')).toEqual([])
        expect(filterWorkspaceFileEntries(entries, 'README')).toHaveLength(1)
    })

    it('isSubsequenceMatch 边界', () => {
        expect(isSubsequenceMatch('abc', '')).toBe(true)
        expect(isSubsequenceMatch('abc', 'ac')).toBe(true)
        expect(isSubsequenceMatch('abc', 'ca')).toBe(false)
    })
})

describe('moveListSelection（列表键盘导航）', () => {
    it('空列表返回 -1', () => {
        expect(moveListSelection(0, 1, 0)).toBe(-1)
    })

    it('正常上下移动并循环', () => {
        expect(moveListSelection(0, 1, 3)).toBe(1)
        expect(moveListSelection(2, 1, 3)).toBe(0)
        expect(moveListSelection(0, -1, 3)).toBe(2)
    })

    it('当前索引非法时按方向落到首/尾', () => {
        expect(moveListSelection(-1, 1, 3)).toBe(0)
        expect(moveListSelection(-1, -1, 3)).toBe(2)
        expect(moveListSelection(9, 1, 3)).toBe(0)
        expect(moveListSelection(Number.NaN, 1, 3)).toBe(0)
    })
})
