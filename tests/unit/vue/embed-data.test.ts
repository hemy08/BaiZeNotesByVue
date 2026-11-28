// @vitest-environment node
/**
 * 1.5.7 LLM Wiki L4：嵌入 UI 纯逻辑单测（`Markdown/embed/embed-data.ts`）。
 *
 * 覆盖：
 * 1. 目录树解析：找根下 raw/、扁平化文件、分类（text/image/other）、相对路径与排序；
 * 2. 边界：空载荷 / 非法 JSON / 空目录树（无工作区）/ 无 raw/；
 * 3. 相对路径计算：wiki/ 页面 → ../raw/、同级、跨磁盘 null、无活动文件 null；
 * 4. Markdown 链接生成：标题清洗、中文/空格百分号编码、`#`/`?` 转义；
 * 5. 分类/标题/数量统计辅助函数；
 * 6. 防御分支：getBaseName 反斜杠/无分隔符、target 不在 root 下退化、目录树非法子节点跳过、
 *    相对路径相同的二次排序、decodeMarkdownPath 非法百分号序列原样保留。
 */
import { describe, it, expect } from 'vitest'

import {
    buildEmbedMarkdownLink,
    classifyEmbedFile,
    countEmbedFilesByKind,
    decodeMarkdownPath,
    encodeMarkdownPath,
    escapeMarkdownLinkText,
    findFirstEmbedFile,
    getBaseName,
    getEmbedTitle,
    parseWorkspaceFileTree,
    relativePathFrom,
    toRelativeMarkdownPath,
    type EmbedFileEntry
} from '../../../src/renderer/src/components/Markdown/embed/embed-data'

/** 文件节点 */
function treeFile(name: string, parentPath: string, extension: string) {
    return {
        id: `${parentPath}/${name}`,
        name,
        path: `${parentPath}/${name}`,
        type: 'file' as const,
        isDirectory: false,
        fileExtension: extension,
        children: []
    }
}

/** 目录节点 */
function treeFolder(name: string, parentPath: string, children: unknown[]) {
    return {
        id: `${parentPath}/${name}`,
        name,
        path: `${parentPath}/${name}`,
        type: 'folder' as const,
        isDirectory: true,
        fileExtension: '',
        children
    }
}

/** 含 raw/ 的工作区树（raw/ 下 3 个文件 + 1 个子目录，子目录内 1 个文件） */
const TREE_WITH_RAW = [
    treeFolder('ws', 'E:', [
        treeFolder('wiki', 'E:/ws', [treeFile('page.md', 'E:/ws/wiki', '.md')]),
        treeFolder('raw', 'E:/ws', [
            treeFile('a.md', 'E:/ws/raw', '.md'),
            treeFile('b.png', 'E:/ws/raw', '.png'),
            treeFile('c.pdf', 'E:/ws/raw', '.pdf'),
            treeFolder('nested', 'E:/ws/raw', [treeFile('d.txt', 'E:/ws/raw/nested', '.txt')])
        ])
    ])
]

/** 构造 raw 文件条目 */
function makeEntry(
    name: string,
    relativePath: string,
    kind: EmbedFileEntry['kind'] = 'text'
): EmbedFileEntry {
    return {
        path: `E:/ws/${relativePath}`,
        relativePath,
        name,
        extension: name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '',
        kind
    }
}

describe('parseWorkspaceFileTree：目录树 → raw/ 文件清单', () => {
    it('解析根下 raw/ 并递归扁平化（相对工作区根路径、升序）', () => {
        const result = parseWorkspaceFileTree(JSON.stringify(TREE_WITH_RAW))
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.rootPath).toBe('E:/ws')
        expect(result.rawRootPath).toBe('E:/ws/raw')
        expect(result.files.map((file) => file.relativePath)).toEqual([
            'raw/a.md',
            'raw/b.png',
            'raw/c.pdf',
            'raw/nested/d.txt'
        ])
        expect(result.files.map((file) => file.kind)).toEqual(['text', 'image', 'other', 'text'])
    })

    it('raw/ 不存在时 rawRootPath 为 null 且文件为空', () => {
        const tree = [
            treeFolder('ws', 'E:', [
                treeFolder('wiki', 'E:/ws', [treeFile('page.md', 'E:/ws/wiki', '.md')])
            ])
        ]
        const result = parseWorkspaceFileTree(JSON.stringify(tree))
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.rawRootPath).toBeNull()
        expect(result.files).toEqual([])
    })

    it('空目录树载荷 → NO_WORKSPACE；非法 JSON / 空串 / 根节点非法 → INVALID_TREE', () => {
        expect(parseWorkspaceFileTree('[]')).toEqual({ ok: false, code: 'NO_WORKSPACE' })
        expect(parseWorkspaceFileTree('{not-json')).toEqual({ ok: false, code: 'INVALID_TREE' })
        expect(parseWorkspaceFileTree('')).toEqual({ ok: false, code: 'INVALID_TREE' })
        expect(parseWorkspaceFileTree(null)).toEqual({ ok: false, code: 'INVALID_TREE' })
        expect(parseWorkspaceFileTree(JSON.stringify([{ name: 'x' }]))).toEqual({
            ok: false,
            code: 'INVALID_TREE'
        })
    })

    it('raw 目录名大小写不敏感（Windows 口径）', () => {
        const tree = [
            treeFolder('ws', 'E:', [
                {
                    ...treeFolder('RAW', 'E:/ws', [treeFile('a.md', 'E:/ws/RAW', '.md')]),
                    path: 'E:/ws/RAW'
                }
            ])
        ]
        const result = parseWorkspaceFileTree(JSON.stringify(tree))
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.rawRootPath).toBe('E:/ws/RAW')
            expect(result.files).toHaveLength(1)
        }
    })
})

describe('类型分类 / 标题 / 统计辅助', () => {
    it('classifyEmbedFile：文本 / 图片 / 其他（大小写不敏感）', () => {
        expect(classifyEmbedFile('a.md')).toBe('text')
        expect(classifyEmbedFile('a.MARKDOWN')).toBe('text')
        expect(classifyEmbedFile('a.txt')).toBe('text')
        expect(classifyEmbedFile('a.png')).toBe('image')
        expect(classifyEmbedFile('a.SVG')).toBe('image')
        expect(classifyEmbedFile('a.pdf')).toBe('other')
        expect(classifyEmbedFile('a.html')).toBe('other')
        expect(classifyEmbedFile('.md')).toBe('other')
    })

    it('getEmbedTitle 去掉扩展名；escapeMarkdownLinkText 清洗方括号/反斜杠', () => {
        expect(getEmbedTitle('资料 1.md')).toBe('资料 1')
        expect(getEmbedTitle('noext')).toBe('noext')
        expect(escapeMarkdownLinkText('[a]b\\c')).toBe('abc')
    })

    it('countEmbedFilesByKind / findFirstEmbedFile', () => {
        const files = [
            makeEntry('a.md', 'raw/a.md', 'text'),
            makeEntry('b.png', 'raw/b.png', 'image'),
            makeEntry('c.md', 'raw/c.md', 'text')
        ]
        expect(countEmbedFilesByKind(files, 'text')).toBe(2)
        expect(countEmbedFilesByKind(files, 'image')).toBe(1)
        expect(countEmbedFilesByKind(files, 'other')).toBe(0)
        expect(findFirstEmbedFile(files)?.relativePath).toBe('raw/a.md')
        expect(findFirstEmbedFile([])).toBeNull()
    })
})

describe('relativePathFrom / 路径编码', () => {
    it('relativePathFrom：工作区根相对路径（大小写不敏感前缀，保留 target 大小写）', () => {
        expect(relativePathFrom('E:/ws', 'E:/ws/raw/a.md')).toBe('raw/a.md')
        expect(relativePathFrom('E:\\ws', 'E:/WS/raw/a.md')).toBe('raw/a.md')
        expect(relativePathFrom('E:/ws', 'E:/ws')).toBe('')
        expect(relativePathFrom('', 'E:/ws/a.md')).toBe('E:/ws/a.md')
    })

    it('toRelativeMarkdownPath：wiki/ 页面 → ../raw/；同级文件 → 文件名', () => {
        expect(toRelativeMarkdownPath('E:/ws/wiki/page.md', 'E:/ws/raw/a.md')).toBe('../raw/a.md')
        expect(toRelativeMarkdownPath('E:/ws/wiki/sub/page.md', 'E:/ws/raw/a.md')).toBe(
            '../../raw/a.md'
        )
        expect(toRelativeMarkdownPath('E:/ws/raw/note.md', 'E:/ws/raw/a.md')).toBe('a.md')
    })

    it('toRelativeMarkdownPath：跨磁盘 / 无活动文件返回 null', () => {
        expect(toRelativeMarkdownPath('E:/ws/wiki/page.md', 'F:/ws/raw/a.md')).toBeNull()
        expect(toRelativeMarkdownPath('', 'E:/ws/raw/a.md')).toBeNull()
        expect(toRelativeMarkdownPath('E:/ws/wiki/page.md', '')).toBeNull()
    })

    it('空格 / 中文 / # / ? 编码后再解码保持一致', () => {
        const encoded = toRelativeMarkdownPath('E:/ws/wiki/page.md', 'E:/ws/raw/资料 1#x.md')
        expect(encoded).not.toBeNull()
        expect(encoded).not.toContain('#')
        expect(encoded).not.toContain(' ')
        expect(decodeMarkdownPath(encoded as string)).toBe('../raw/资料 1#x.md')
        expect(encodeMarkdownPath('a b#c?.md')).toBe('a%20b%23c%3F.md')
    })
})

describe('buildEmbedMarkdownLink：生成可插入的 Markdown 引用', () => {
    it('文本文件：`[文件名](相对路径)`', () => {
        const result = buildEmbedMarkdownLink(
            makeEntry('资料一.md', 'raw/资料一.md', 'text'),
            'E:/ws/wiki/page.md'
        )
        expect(result).toEqual({
            ok: true,
            markdown: '[资料一](../raw/资料一.md)',
            relativePath: '../raw/资料一.md'
        })
    })

    it('图片/其他类型同样生成引用链接（不区分类型）', () => {
        const result = buildEmbedMarkdownLink(
            makeEntry('b.png', 'raw/b.png', 'image'),
            'E:/ws/wiki/page.md'
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.markdown).toBe('[b](../raw/b.png)')
        }
    })

    it('无活动文件 / 跨磁盘返回结构化失败', () => {
        expect(buildEmbedMarkdownLink(makeEntry('a.md', 'raw/a.md'), '')).toEqual({
            ok: false,
            code: 'NO_ACTIVE_FILE'
        })
        expect(buildEmbedMarkdownLink(makeEntry('a.md', 'raw/a.md'), 'F:/ws/wiki/page.md')).toEqual(
            { ok: false, code: 'DIFFERENT_DRIVE' }
        )
    })

    it('文件名含方括号时清洗后不破坏链接结构', () => {
        const result = buildEmbedMarkdownLink(
            makeEntry('[怪]名.md', 'raw/[怪]名.md', 'text'),
            'E:/ws/wiki/page.md'
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.markdown).toBe('[怪名](../raw/%5B怪%5D名.md)')
        }
    })
})

describe('防御 / 边界分支', () => {
    it('getBaseName：反斜杠路径与无目录分隔符路径', () => {
        expect(getBaseName('E:\\ws\\raw\\a.md')).toBe('a.md')
        expect(getBaseName('a.md')).toBe('a.md')
        expect(getBaseName('E:/ws/raw/')).toBe('')
    })

    it('relativePathFrom：target 不在 root 下时退化为去前导分隔符的原路径', () => {
        expect(relativePathFrom('E:/ws', 'F:/other/a.md')).toBe('F:/other/a.md')
        expect(relativePathFrom('E:/ws', '/absolute/a.md')).toBe('absolute/a.md')
    })

    it('目录树 raw/ 下混入非法子节点时跳过且不抛错', () => {
        const rawFolder = treeFolder('raw', 'E:/ws', [
            null,
            { name: 'only-name.md' },
            'not-an-object',
            treeFile('ok.md', 'E:/ws/raw', '.md')
        ])
        const tree = [treeFolder('ws', 'E:', [rawFolder])]
        const result = parseWorkspaceFileTree(JSON.stringify(tree))

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.files.map((file) => file.relativePath)).toEqual(['raw/ok.md'])
        }
    })

    it('相对路径相同时按绝对路径二次排序（稳定 tie-break）', () => {
        const tree = [
            treeFolder('ws', 'E:', [
                treeFolder('raw', 'E:/ws', [
                    { ...treeFile('a.md', 'E:/ws/raw', '.md'), path: 'E:/WS/raw/a.md' },
                    treeFile('a.md', 'E:/ws/raw', '.md')
                ])
            ])
        ]
        const result = parseWorkspaceFileTree(JSON.stringify(tree))

        expect(result.ok).toBe(true)
        if (result.ok) {
            // 两条记录 relativePath 相同（大小写不敏感前缀），排序不抛错且都保留
            expect(result.files).toHaveLength(2)
            expect(new Set(result.files.map((file) => file.relativePath))).toEqual(
                new Set(['raw/a.md'])
            )
        }
    })

    it('decodeMarkdownPath：非法百分号序列原样保留', () => {
        expect(decodeMarkdownPath('%E0%A4%A')).toBe('%E0%A4%A')
        expect(decodeMarkdownPath('raw/%E0%A4%A/a.md')).toBe('raw/%E0%A4%A/a.md')
        expect(decodeMarkdownPath('raw/%E8%B5%84%E6%96%99.md')).toBe('raw/资料.md')
    })
})
