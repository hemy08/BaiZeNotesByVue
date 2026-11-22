/**
 * 工作区索引服务单测（tests/unit/workspace-index.test.ts）
 *
 * 覆盖口径（task-9 + task-12）：
 * - 根校验：空/不存在/非目录/非法路径 → 空快照；
 * - 扫描过滤：扩展名、忽略目录、符号链接、2 MiB 上限、深度上限；
 * - front matter：标题 / 标签（数组、字符串、逗号分隔）、CRLF/BOM；
 * - 标题回退链：front matter title > 第一个 H1 > 文件名；
 * - 标签：正文行内 `#tag`、heading 行与代码（围栏/行内）排除、大小写不敏感去重、聚合；
 * - Wiki 链接：基础/别名/heading、扩展名补全、相对源文件目录、缺失、歧义、title 消歧、
 *   代码内忽略、越出根目录不解析；
 * - task-12 摘要：front matter/围栏代码/行内标记清理、空白压缩、240 码点截断、空正文；
 * - task-12 附件：图片/普通链接引用、相对源文件目录、存在性、缺失计数、referencedBy
 *   去重、外链/协议/绝对路径/锚点/越界忽略、代码块忽略、确定性排序；
 * - 查询 API：findBacklinks（含 Windows 大小写口径）、findLinkIssues、findFilesByTag；
 * - 快照确定性与统计字段（含 attachmentCount / missingAttachmentCount）。
 *
 * 说明：全部用例使用 `os.tmpdir()` 下的独立 `baize-workspace-index-*` 临时目录，
 * 每个用例自建隔离根并在 afterAll 统一清理（不依赖 Electron/appState）。
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
    WORKSPACE_INDEX_EXCERPT_MAX_LENGTH,
    buildWorkspaceIndex,
    findBacklinks,
    findFilesByTag,
    findLinkIssues
} from '../../src/main/utils/workspace-index'
import type { WorkspaceIndexSnapshot } from '../../src/shared/types/workspace-index'

/** 本次测试创建的全部临时根目录（afterAll 统一清理） */
const createdRoots: string[] = []

/** 新建一个隔离的临时工作区根 */
function createWorkspaceRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-workspace-index-'))
    createdRoots.push(root)
    return root
}

/** 在工作区内写文件（自动创建父目录），返回绝对路径 */
function writeWorkspaceFile(root: string, relativePath: string, content: string): string {
    const fullPath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    return fullPath
}

/** 按 relativePath 取快照中的文件（未命中返回 undefined） */
function findIndexedFile(
    snapshot: WorkspaceIndexSnapshot,
    relativePath: string
): WorkspaceIndexSnapshot['files'][number] | undefined {
    return snapshot.files.find((file) => file.relativePath === relativePath)
}

afterAll(() => {
    for (const root of createdRoots) {
        fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 })
    }
})

describe('buildWorkspaceIndex：根校验与降级', () => {
    it('根为空字符串/纯空白时返回空快照', async () => {
        const empty = await buildWorkspaceIndex('')
        const blank = await buildWorkspaceIndex('   ')
        for (const snapshot of [empty, blank]) {
            expect(snapshot.rootPath).toBe('')
            expect(snapshot.files).toEqual([])
            expect(snapshot.tags).toEqual([])
            expect(snapshot.missingLinks).toEqual([])
            expect(snapshot.attachments).toEqual([])
            expect(snapshot.stats).toEqual({
                fileCount: 0,
                linkCount: 0,
                missingCount: 0,
                ambiguousCount: 0,
                attachmentCount: 0,
                missingAttachmentCount: 0
            })
            expect(typeof snapshot.generatedAt).toBe('number')
        }
    })

    it('根不存在时返回空快照（不抛异常）', async () => {
        const missingRoot = path.join(os.tmpdir(), 'baize-workspace-index-missing-root')
        const snapshot = await buildWorkspaceIndex(missingRoot)
        expect(snapshot.rootPath).toBe('')
        expect(snapshot.files).toEqual([])
        expect(snapshot.attachments).toEqual([])
        expect(snapshot.stats.fileCount).toBe(0)
        expect(snapshot.stats.missingAttachmentCount).toBe(0)
    })

    it('根指向普通文件时返回空快照', async () => {
        const root = createWorkspaceRoot()
        const filePath = writeWorkspaceFile(root, 'not-a-dir.md', '# 标题')
        const snapshot = await buildWorkspaceIndex(filePath)
        expect(snapshot.rootPath).toBe('')
        expect(snapshot.files).toEqual([])
    })

    it('相对路径与设备命名空间根一律拒绝', async () => {
        const relative = await buildWorkspaceIndex('docs/notes')
        const device = await buildWorkspaceIndex('\\\\?\\C:\\notes')
        expect(relative.files).toEqual([])
        expect(relative.rootPath).toBe('')
        expect(device.files).toEqual([])
        expect(device.rootPath).toBe('')
    })
})

describe('buildWorkspaceIndex：扫描过滤', () => {
    it('只索引 .md/.markdown/.txt，忽略其它扩展名与无扩展名文件', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'a.md', '# A')
        writeWorkspaceFile(root, 'notes/b.markdown', '# B')
        writeWorkspaceFile(root, 'notes/c.txt', 'plain')
        writeWorkspaceFile(root, 'd.png', 'binary')
        writeWorkspaceFile(root, 'e.js', 'console.log(1)')
        writeWorkspaceFile(root, 'no-extension', 'text')
        const snapshot = await buildWorkspaceIndex(root)
        expect(snapshot.files.map((file) => file.relativePath)).toEqual([
            'a.md',
            'notes/b.markdown',
            'notes/c.txt'
        ])
        expect(snapshot.stats.fileCount).toBe(3)
        const a = findIndexedFile(snapshot, 'a.md')
        expect(a).toBeDefined()
        expect(a?.path).toBe(path.resolve(root, 'a.md'))
        expect(a?.name).toBe('a.md')
        expect(a?.size).toBe(Buffer.byteLength('# A', 'utf-8'))
        expect(a?.mtimeMs).toBeGreaterThan(0)
    })

    it('跳过依赖/VCS/IDE/凭据类目录（含任意层级命中）', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'notes/keep.md', '# keep')
        writeWorkspaceFile(root, 'node_modules/pkg/readme.md', '# dep')
        writeWorkspaceFile(root, '.git/objects/note.md', '# git')
        writeWorkspaceFile(root, '.vscode/settings.md', '# ide')
        writeWorkspaceFile(root, '.ssh/known.md', '# secret')
        writeWorkspaceFile(root, '.docker/config.md', '# secret')
        writeWorkspaceFile(root, 'deep/.svn/entry.md', '# vcs')
        const snapshot = await buildWorkspaceIndex(root)
        expect(snapshot.files.map((file) => file.relativePath)).toEqual(['notes/keep.md'])
    })

    it('跳过目录符号链接（junction），不读取链接目标', async (context) => {
        const root = createWorkspaceRoot()
        const realDirectory = path.join(root, 'real')
        fs.mkdirSync(realDirectory, { recursive: true })
        fs.writeFileSync(path.join(realDirectory, 'inside.md'), '# inside', 'utf-8')
        const linkPath = path.join(root, 'linked')
        try {
            fs.symlinkSync(realDirectory, linkPath, 'junction')
        } catch {
            context.skip()
            return
        }
        writeWorkspaceFile(root, 'direct.md', '# direct')
        const snapshot = await buildWorkspaceIndex(root)
        expect(snapshot.files.map((file) => file.relativePath)).toEqual([
            'direct.md',
            'real/inside.md'
        ])
    })

    it('超过 2 MiB 的文本文件被跳过、小文件正常收录', async () => {
        const root = createWorkspaceRoot()
        const oversized = 'a'.repeat(2 * 1024 * 1024 + 1)
        writeWorkspaceFile(root, 'big.md', oversized)
        writeWorkspaceFile(root, 'small.md', '# small')
        const snapshot = await buildWorkspaceIndex(root)
        expect(snapshot.files.map((file) => file.relativePath)).toEqual(['small.md'])
    })

    it('目录递归深度上限 32：超过深度的文件不索引', async () => {
        const root = createWorkspaceRoot()
        const withinDepth = Array.from({ length: 32 }, (_, index) => `d${index + 1}`).join('/')
        const beyondDepth = Array.from({ length: 33 }, (_, index) => `d${index + 1}`).join('/')
        writeWorkspaceFile(root, `${withinDepth}/deep.md`, '# deep')
        writeWorkspaceFile(root, `${beyondDepth}/too-deep.md`, '# deeper')
        const snapshot = await buildWorkspaceIndex(root)
        const relativePaths = snapshot.files.map((file) => file.relativePath)
        expect(relativePaths).toHaveLength(1)
        expect(relativePaths[0]).toBe(`${withinDepth}/deep.md`)
    })

    it('空文件也纳入索引（标题回退文件名、无标签/链接/摘要）', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'empty-note.md', '')
        const snapshot = await buildWorkspaceIndex(root)
        const file = findIndexedFile(snapshot, 'empty-note.md')
        expect(file?.title).toBe('empty-note')
        expect(file?.tags).toEqual([])
        expect(file?.links).toEqual([])
        expect(file?.excerpt).toBe('')
        expect(file?.size).toBe(0)
    })
})

describe('buildWorkspaceIndex：front matter 与标题/标签', () => {
    it('front matter 提供 title 与 tags（数组形式）', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'fm.md',
            ['---', 'title: 甲笔记', 'tags: [知识库, project]', '---', '正文内容', ''].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        const file = findIndexedFile(snapshot, 'fm.md')
        expect(file?.title).toBe('甲笔记')
        expect(file?.tags).toEqual(['知识库', 'project'])
    })

    it('front matter tags 字符串按中英文逗号拆分为多个标签', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'fm-string.md',
            ['---', 'tags: alpha, beta，gamma', '---', '正文', ''].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'fm-string.md')?.tags).toEqual(['alpha', 'beta', 'gamma'])
    })

    it('front matter tags 块数组（- item 形式）也可识别', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'fm-block.md',
            ['---', 'tags:', '  - alpha', '  - beta', '---', '正文', ''].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'fm-block.md')?.tags).toEqual(['alpha', 'beta'])
    })

    it('front matter title 为数字时转为字符串标题', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'numeric-title.md',
            ['---', 'title: 42', '---', '# 不应覆盖', ''].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'numeric-title.md')?.title).toBe('42')
    })

    it('标题回退：front matter title > 第一个 H1 > 文件名', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'fm-title.md',
            ['---', 'title: 来自 front matter', '---', '# 来自 H1', ''].join('\n')
        )
        writeWorkspaceFile(
            root,
            'h1-title.md',
            ['## 二级标题', '', '# 真 H1 标题 #', ''].join('\n')
        )
        writeWorkspaceFile(root, 'stem-title.md', '没有标题的正文')
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'fm-title.md')?.title).toBe('来自 front matter')
        expect(findIndexedFile(snapshot, 'h1-title.md')?.title).toBe('真 H1 标题')
        expect(findIndexedFile(snapshot, 'stem-title.md')?.title).toBe('stem-title')
    })

    it('标题回退时忽略围栏代码块内的 H1', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'fenced-h1.md',
            ['```md', '# 代码里的标题', '```', '', '# 真正的标题', ''].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'fenced-h1.md')?.title).toBe('真正的标题')
    })

    it('CRLF + UTF-8 BOM 的 front matter 与正文行号正确', async () => {
        const root = createWorkspaceRoot()
        const content = [
            '---',
            'title: CRLF 标题',
            'tags: [crlf]',
            '---',
            '正文',
            '[[later]]'
        ].join('\r\n')
        writeWorkspaceFile(root, 'crlf.md', `\uFEFF${content}`)
        writeWorkspaceFile(root, 'later.md', '# later')
        const snapshot = await buildWorkspaceIndex(root)
        const file = findIndexedFile(snapshot, 'crlf.md')
        expect(file?.title).toBe('CRLF 标题')
        expect(file?.tags).toEqual(['crlf'])
        // 第 6 行（front matter 4 行 + 正文 1 行之后）
        expect(file?.links[0]?.line).toBe(6)
        expect(file?.links[0]?.status).toBe('resolved')
    })

    it('正文行内 #tag：排除 heading 行、围栏代码、行内代码、URL 锚点与 C#', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'inline-tags.md',
            [
                '# 标题 #不是标签',
                '正文 #tag1 与 #tag2',
                '`#代码标签` 不是标签',
                '```',
                '#围栏标签',
                '```',
                'C# 语言与 https://example.com/#anchor',
                ''
            ].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'inline-tags.md')?.tags).toEqual(['tag1', 'tag2'])
    })

    it('front matter 与行内标签大小写不敏感去重（保留首次出现写法）', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'dedupe-tags.md',
            ['---', 'tags: [Note, note]', '---', '正文 #NOTE #Note', ''].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'dedupe-tags.md')?.tags).toEqual(['Note'])
    })
})

describe('buildWorkspaceIndex：Wiki 链接解析', () => {
    it('支持 [[target]] / [[target|alias]] / [[target#heading]]，raw/target/位置正确', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'note-a.md', '# A')
        writeWorkspaceFile(root, 'note-b.md', '# B')
        writeWorkspaceFile(root, 'note-c.md', '# C')
        writeWorkspaceFile(root, 'folder/note-d.md', '# D')
        writeWorkspaceFile(
            root,
            'hub.md',
            '[[note-a]] 与 [[note-b|别名]] 与 [[note-c#小节]] 与 [[folder/note-d]]\n'
        )
        const snapshot = await buildWorkspaceIndex(root)
        const hub = findIndexedFile(snapshot, 'hub.md')
        expect(hub?.links.map((link) => link.target)).toEqual([
            'note-a',
            'note-b',
            'note-c',
            'folder/note-d'
        ])
        expect(hub?.links.map((link) => link.raw)).toEqual([
            '[[note-a]]',
            '[[note-b|别名]]',
            '[[note-c#小节]]',
            '[[folder/note-d]]'
        ])
        expect(hub?.links.every((link) => link.status === 'resolved')).toBe(true)
        expect(hub?.links[0]?.resolvedPath).toBe(path.resolve(root, 'note-a.md'))
        expect(hub?.links[0]?.line).toBe(1)
        expect(hub?.links[0]?.column).toBe(1)
        expect(hub?.links[1]?.column).toBe(14)
        expect(snapshot.stats.linkCount).toBe(4)
        expect(snapshot.stats.missingCount).toBe(0)
        expect(snapshot.stats.ambiguousCount).toBe(0)
    })

    it('无扩展名的 target 会补全 .md/.markdown/.txt', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'doc-markdown.markdown', '# md')
        writeWorkspaceFile(root, 'plain-text.txt', 'txt')
        writeWorkspaceFile(root, 'index.md', '[[doc-markdown]] [[plain-text]] [[plain-text.txt]]\n')
        const snapshot = await buildWorkspaceIndex(root)
        const index = findIndexedFile(snapshot, 'index.md')
        expect(index?.links.map((link) => link.status)).toEqual([
            'resolved',
            'resolved',
            'resolved'
        ])
        expect(index?.links[0]?.resolvedPath).toBe(path.resolve(root, 'doc-markdown.markdown'))
        expect(index?.links[1]?.resolvedPath).toBe(path.resolve(root, 'plain-text.txt'))
    })

    it('优先按工作区根相对路径解析，其次相对源文件目录', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'root-note.md', '# root')
        writeWorkspaceFile(root, 'sub/root-note.md', '# sub-same-name')
        writeWorkspaceFile(root, 'sub/sibling.md', '# sibling')
        writeWorkspaceFile(root, 'sub/source.md', '[[root-note]] [[sibling]]\n')
        const snapshot = await buildWorkspaceIndex(root)
        const source = findIndexedFile(snapshot, 'sub/source.md')
        // 根相对优先：命中根目录的同名文件
        expect(source?.links[0]?.resolvedPath).toBe(path.resolve(root, 'root-note.md'))
        // 根相对未命中时回退到源文件同目录
        expect(source?.links[1]?.resolvedPath).toBe(path.resolve(root, 'sub/sibling.md'))
    })

    it('目标不存在时标记 missing 并进入 missingLinks', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'source.md', '第一行\n第二行 [[not-exists]]\n')
        const snapshot = await buildWorkspaceIndex(root)
        const link = findIndexedFile(snapshot, 'source.md')?.links[0]
        expect(link?.status).toBe('missing')
        expect(link?.resolvedPath).toBeUndefined()
        expect(snapshot.stats.missingCount).toBe(1)
        expect(snapshot.missingLinks).toEqual([
            {
                sourcePath: path.resolve(root, 'source.md'),
                sourceRelativePath: 'source.md',
                target: 'not-exists',
                line: 2,
                column: 5
            }
        ])
    })

    it('同名 basename 多候选且 title 无法消歧时标记 ambiguous', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'a/note.md', '# A 版')
        writeWorkspaceFile(root, 'b/note.md', '# B 版')
        writeWorkspaceFile(root, 'index.md', '[[note]]\n')
        const snapshot = await buildWorkspaceIndex(root)
        const link = findIndexedFile(snapshot, 'index.md')?.links[0]
        expect(link?.status).toBe('ambiguous')
        expect(link?.resolvedPath).toBeUndefined()
        expect(snapshot.stats.ambiguousCount).toBe(1)
        expect(snapshot.stats.missingCount).toBe(0)
        expect(snapshot.missingLinks).toEqual([])
    })

    it('basename 多候选但 title 唯一命中时按 title 消歧', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'a/note.md',
            ['---', 'title: 甲方案', '---', '正文', ''].join('\n')
        )
        writeWorkspaceFile(
            root,
            'b/note.md',
            ['---', 'title: 乙方案', '---', '正文', ''].join('\n')
        )
        writeWorkspaceFile(root, 'index.md', '[[乙方案]]\n')
        const snapshot = await buildWorkspaceIndex(root)
        const link = findIndexedFile(snapshot, 'index.md')?.links[0]
        expect(link?.status).toBe('resolved')
        expect(link?.resolvedPath).toBe(path.resolve(root, 'b/note.md'))
    })

    it('忽略围栏代码块与行内代码中的 Wiki 链接', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'note.md', '# note')
        writeWorkspaceFile(
            root,
            'index.md',
            [
                '```',
                '[[fenced-ignored]]',
                '```',
                '行内 `[[inline-ignored]]` 但 [[note]] 有效',
                ''
            ].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        const links = findIndexedFile(snapshot, 'index.md')?.links ?? []
        expect(links.map((link) => link.target)).toEqual(['note'])
        expect(links[0]?.line).toBe(4)
    })

    it('~~~ 围栏代码块同样屏蔽标题/标签/链接', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'note.md', '# note')
        writeWorkspaceFile(
            root,
            'tilde-fence.md',
            [
                '~~~',
                '# 代码里的标题',
                '[[fenced-ignored]] #fencedTag',
                '~~~~',
                '[[note]] #realTag',
                ''
            ].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        const file = findIndexedFile(snapshot, 'tilde-fence.md')
        expect(file?.title).toBe('tilde-fence')
        expect(file?.tags).toEqual(['realTag'])
        expect(file?.links.map((link) => link.target)).toEqual(['note'])
    })

    it('越出工作区根的相对目标（../ 或绝对系统路径）不解析为 resolved', async () => {
        const root = createWorkspaceRoot()
        const outside = path.join(path.dirname(root), 'baize-workspace-index-outside.md')
        fs.writeFileSync(outside, '# outside', 'utf-8')
        try {
            writeWorkspaceFile(
                root,
                'index.md',
                '[[../baize-workspace-index-outside]] [[C:/Windows/win.ini]] [[//server/share/note]]\n'
            )
            const snapshot = await buildWorkspaceIndex(root)
            const links = findIndexedFile(snapshot, 'index.md')?.links ?? []
            expect(links.map((link) => link.status)).toEqual(['missing', 'missing', 'missing'])
            expect(snapshot.stats.missingCount).toBe(3)
        } finally {
            fs.rmSync(outside, { force: true })
        }
    })
})

describe('buildWorkspaceIndex：正文摘要 excerpt（task-12 / E10）', () => {
    it('去 front matter/标题/强调/链接/行内代码标记并压缩空白', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'excerpt.md',
            [
                '---',
                'title: 摘要测试',
                'tags: [summary]',
                '---',
                '# 一级标题',
                '正文   **加粗**   与 [链接文字](https://example.com/a) 以及 `行内代码`。',
                ''
            ].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'excerpt.md')?.excerpt).toBe(
            '一级标题 正文 加粗 与 链接文字 以及 行内代码。'
        )
    })

    it('整块丢弃围栏代码块内容，图片引用不进摘要', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'fenced-excerpt.md',
            [
                '可见文字',
                '```js',
                'const hidden = 1',
                '![隐藏图片](images/hidden.png)',
                '```',
                '![示意图](images/diagram.png)',
                '结束语',
                ''
            ].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'fenced-excerpt.md')?.excerpt).toBe('可见文字 结束语')
    })

    it('清理引用/列表/表格/Wiki 链接标记', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'target.md', '# 目标')
        writeWorkspaceFile(root, 'other.md', '# 其他')
        writeWorkspaceFile(
            root,
            'markers.md',
            [
                '> 引用文字',
                '- 列表项 **粗**',
                '| 列一 | 列二 |',
                '| --- | --- |',
                '[[target|别名]] 与 [[other]]',
                ''
            ].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'markers.md')?.excerpt).toBe(
            '引用文字 列表项 粗 列一 列二 别名 与 other'
        )
    })

    it('空正文与仅 front matter 的文件摘要为空串', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(
            root,
            'empty-body.md',
            ['---', 'title: 只有元数据', '---', ''].join('\n')
        )
        writeWorkspaceFile(root, 'empty-file.md', '')
        const snapshot = await buildWorkspaceIndex(root)
        expect(findIndexedFile(snapshot, 'empty-body.md')?.excerpt).toBe('')
        expect(findIndexedFile(snapshot, 'empty-file.md')?.excerpt).toBe('')
    })

    it('长正文按 Unicode 码点截断到最多 240 字符且不切断代理对', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'long.md', '长'.repeat(300))
        writeWorkspaceFile(root, 'emoji.md', '😀'.repeat(300))
        const snapshot = await buildWorkspaceIndex(root)
        const longExcerpt = findIndexedFile(snapshot, 'long.md')?.excerpt ?? ''
        expect([...longExcerpt].length).toBe(WORKSPACE_INDEX_EXCERPT_MAX_LENGTH)
        expect(longExcerpt).toBe('长'.repeat(WORKSPACE_INDEX_EXCERPT_MAX_LENGTH))
        const emojiExcerpt = findIndexedFile(snapshot, 'emoji.md')?.excerpt ?? ''
        expect([...emojiExcerpt].length).toBe(WORKSPACE_INDEX_EXCERPT_MAX_LENGTH)
        expect(emojiExcerpt).toBe('😀'.repeat(WORKSPACE_INDEX_EXCERPT_MAX_LENGTH))
        // 代理对成对保留（240 个 emoji = 480 个 UTF-16 码元，未出现半个代理对）
        expect(emojiExcerpt.length).toBe(WORKSPACE_INDEX_EXCERPT_MAX_LENGTH * 2)
    })
})

describe('buildWorkspaceIndex：附件引用（task-12 / B5）', () => {
    it('图片/附件引用按绝对路径聚合，exists 与 referencedBy 正确', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'images/logo.png', 'png')
        writeWorkspaceFile(root, 'docs/manual.pdf', 'pdf')
        writeWorkspaceFile(
            root,
            'note.md',
            [
                '![图](images/logo.png)',
                '[说明书](docs/manual.pdf)',
                '再次引用 ![图2](./images/logo.png)',
                ''
            ].join('\n')
        )
        writeWorkspaceFile(root, 'sub/other.md', '![上级](../images/logo.png)\n')
        const snapshot = await buildWorkspaceIndex(root)
        const attachments = snapshot.attachments ?? []
        expect(attachments.map((item) => item.relativePath)).toEqual([
            'docs/manual.pdf',
            'images/logo.png'
        ])
        expect(attachments.every((item) => item.exists)).toBe(true)
        const logo = attachments.find((item) => item.relativePath === 'images/logo.png')
        expect(logo?.path).toBe(path.resolve(root, 'images/logo.png'))
        expect(logo?.referencedBy).toEqual([
            path.resolve(root, 'note.md'),
            path.resolve(root, 'sub/other.md')
        ])
        expect(snapshot.stats.attachmentCount).toBe(2)
        expect(snapshot.stats.missingAttachmentCount).toBe(0)
    })

    it('缺失附件 exists=false 且计入 missingAttachmentCount', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'images/ok.png', 'png')
        writeWorkspaceFile(
            root,
            'note.md',
            [
                '![存在](images/ok.png)',
                '![缺失](images/missing.png)',
                '[报告](assets/report.docx)',
                ''
            ].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        const attachments = snapshot.attachments ?? []
        expect(attachments.map((item) => item.relativePath)).toEqual([
            'assets/report.docx',
            'images/missing.png',
            'images/ok.png'
        ])
        expect(attachments.find((item) => item.relativePath === 'images/ok.png')?.exists).toBe(true)
        expect(attachments.find((item) => item.relativePath === 'images/missing.png')?.exists).toBe(
            false
        )
        expect(attachments.find((item) => item.relativePath === 'assets/report.docx')?.exists).toBe(
            false
        )
        expect(snapshot.stats.attachmentCount).toBe(3)
        expect(snapshot.stats.missingAttachmentCount).toBe(2)
    })

    it('忽略外链/协议/绝对路径/锚点/越界路径与非附件扩展名', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'images/ok.png', 'png')
        writeWorkspaceFile(root, 'other.md', '# 其他笔记')
        const outsidePath = path.join(path.dirname(root), 'baize-attachment-outside.png')
        fs.writeFileSync(outsidePath, 'png', 'utf-8')
        try {
            writeWorkspaceFile(
                root,
                'note.md',
                [
                    '![外链](https://example.com/a.png)',
                    '![数据](data:image/png;base64,AAAA)',
                    '![应用](app://resource/icon.png)',
                    '![盘符](C:/Windows/logo.png)',
                    '![绝对](/absolute/logo.png)',
                    '![协议相对](//cdn.example.com/logo.png)',
                    '![锚点](#section)',
                    '![越界](../baize-attachment-outside.png)',
                    '[普通笔记](other.md)',
                    '![有效](images/ok.png)',
                    ''
                ].join('\n')
            )
            const snapshot = await buildWorkspaceIndex(root)
            expect(snapshot.attachments?.map((item) => item.relativePath)).toEqual([
                'images/ok.png'
            ])
            expect(snapshot.stats.attachmentCount).toBe(1)
            expect(snapshot.stats.missingAttachmentCount).toBe(0)
        } finally {
            fs.rmSync(outsidePath, { force: true })
        }
    })

    it('围栏代码块与行内代码中的附件引用不参与索引', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'images/real.png', 'png')
        writeWorkspaceFile(
            root,
            'note.md',
            [
                '```md',
                '![代码内](images/code-only.png)',
                '```',
                '`![行内](images/inline-only.png)`',
                '![真实](images/real.png)',
                ''
            ].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(snapshot.attachments?.map((item) => item.relativePath)).toEqual(['images/real.png'])
        expect(snapshot.stats.attachmentCount).toBe(1)
    })

    it('同一文件多次引用同一附件时 referencedBy 去重', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'images/logo.png', 'png')
        writeWorkspaceFile(
            root,
            'note.md',
            [
                '![a](images/logo.png)',
                '[b](./images/logo.png)',
                '[c](images/../images/logo.png)',
                ''
            ].join('\n')
        )
        const snapshot = await buildWorkspaceIndex(root)
        expect(snapshot.attachments).toHaveLength(1)
        expect(snapshot.attachments?.[0]?.referencedBy).toEqual([path.resolve(root, 'note.md')])
    })

    it('无附件引用时 attachments 为空数组、统计为 0', async () => {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'plain.md', '没有附件引用的正文\n')
        const snapshot = await buildWorkspaceIndex(root)
        expect(snapshot.attachments).toEqual([])
        expect(snapshot.stats.attachmentCount).toBe(0)
        expect(snapshot.stats.missingAttachmentCount).toBe(0)
    })
})

describe('查询 API：findBacklinks / findLinkIssues / findFilesByTag', () => {
    /** 构造一个包含反链、缺失、歧义、标签的通用快照 */
    async function buildQueryFixture(): Promise<{
        root: string
        snapshot: WorkspaceIndexSnapshot
    }> {
        const root = createWorkspaceRoot()
        writeWorkspaceFile(root, 'target.md', '# 目标')
        writeWorkspaceFile(root, 'a.md', '第一行\n第二行 [[target]]\n')
        writeWorkspaceFile(root, 'b.md', '[[target|目标别名]]\n')
        writeWorkspaceFile(root, 'c.md', '[[ghost]] [[ambig-note]]\n')
        writeWorkspaceFile(
            root,
            'x/ambig-note.md',
            ['---', 'tags: [项目]', '---', '正文', ''].join('\n')
        )
        writeWorkspaceFile(
            root,
            'y/ambig-note.md',
            ['---', 'tags: [项目, 归档]', '---', '正文', ''].join('\n')
        )
        writeWorkspaceFile(root, 'tagged.md', '正文 #项目 #other\n')
        const snapshot = await buildWorkspaceIndex(root)
        return { root, snapshot }
    }

    it('findBacklinks 按 resolvedPath 精确匹配，返回来源行/列', async () => {
        const { root, snapshot } = await buildQueryFixture()
        const backlinks = findBacklinks(snapshot, path.resolve(root, 'target.md'))
        expect(backlinks.map((item) => item.sourceRelativePath).sort()).toEqual(['a.md', 'b.md'])
        const fromA = backlinks.find((item) => item.sourceRelativePath === 'a.md')
        expect(fromA).toBeDefined()
        expect(fromA?.line).toBe(2)
        expect(fromA?.column).toBe(5)
        expect(fromA?.sourceTitle).toBe('a')
        expect(fromA?.sourcePath).toBe(path.resolve(root, 'a.md'))
    })

    it('findBacklinks 无命中/空目标返回空数组', async () => {
        const { root, snapshot } = await buildQueryFixture()
        expect(findBacklinks(snapshot, path.resolve(root, 'nobody.md'))).toEqual([])
        expect(findBacklinks(snapshot, '')).toEqual([])
    })

    it('findBacklinks 在 Windows 下大小写不敏感匹配', async () => {
        const { root, snapshot } = await buildQueryFixture()
        const upperCaseTarget = path.resolve(root, 'target.md').toUpperCase()
        const backlinks = findBacklinks(snapshot, upperCaseTarget)
        if (process.platform === 'win32') {
            expect(backlinks).toHaveLength(2)
        } else {
            expect(backlinks).toEqual([])
        }
    })

    it('findLinkIssues 汇总缺失 + 歧义链接（不含已解析）', async () => {
        const { root, snapshot } = await buildQueryFixture()
        const issues = findLinkIssues(snapshot)
        expect(issues).toHaveLength(2)
        expect(issues.map((issue) => issue.status).sort()).toEqual(['ambiguous', 'missing'])
        expect(issues.find((issue) => issue.status === 'missing')?.target).toBe('ghost')
        expect(issues.find((issue) => issue.status === 'ambiguous')?.target).toBe('ambig-note')
        expect(findLinkIssues(snapshot).every((issue) => issue.sourceRelativePath === 'c.md')).toBe(
            true
        )
        // 目标文件本身存在，但链接目标名歧义：不计入 missingLinks
        expect(snapshot.missingLinks).toHaveLength(1)
        expect(findBacklinks(snapshot, path.resolve(root, 'x/ambig-note.md')).length).toBe(0)
    })

    it('findFilesByTag 大小写不敏感、支持 # 前缀、未知标签返回空数组', async () => {
        const { snapshot } = await buildQueryFixture()
        const projectFiles = findFilesByTag(snapshot, '项目')
        expect(projectFiles.map((file) => file.relativePath).sort()).toEqual([
            'tagged.md',
            'x/ambig-note.md',
            'y/ambig-note.md'
        ])
        expect(findFilesByTag(snapshot, '#项目')).toHaveLength(3)
        expect(findFilesByTag(snapshot, 'unknown-tag')).toEqual([])
        expect(findFilesByTag(snapshot, '   ')).toEqual([])
    })

    it('非法查询入参不会抛异常（防御性空结果）', async () => {
        const { snapshot } = await buildQueryFixture()
        expect(findFilesByTag(snapshot, null as unknown as string)).toEqual([])
        expect(findBacklinks(snapshot, undefined as unknown as string)).toEqual([])
    })

    it('tags 聚合：数量降序、同数量按标签名升序，files 为绝对路径', async () => {
        const { root, snapshot } = await buildQueryFixture()
        // 数量降序：项目 3 个排第一；同数量（other / 归档）内部顺序依赖 locale collation，不作断言
        expect(snapshot.tags[0]?.tag).toBe('项目')
        expect(new Set(snapshot.tags.slice(1).map((tag) => tag.tag))).toEqual(
            new Set(['other', '归档'])
        )
        const projectTag = snapshot.tags.find((tag) => tag.tag === '项目')
        expect(projectTag?.count).toBe(3)
        expect(projectTag?.files).toEqual([
            path.resolve(root, 'tagged.md'),
            path.resolve(root, 'x/ambig-note.md'),
            path.resolve(root, 'y/ambig-note.md')
        ])
        expect(snapshot.tags.find((tag) => tag.tag === '归档')?.count).toBe(1)
    })
})
