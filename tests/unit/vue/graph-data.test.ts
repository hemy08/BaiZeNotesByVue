// @vitest-environment node
/**
 * 1.5.7 LLM Wiki L4：关系图谱数据构建纯函数单测（`Graph/graph-data.ts`）。
 *
 * 覆盖：
 * 1. 快照 → 节点/边：仅 resolved 且命中快照内文件的链接建边，同一对来源/目标聚合 occurrence；
 * 2. 防御：missing/ambiguous 链接、自链接、目标不在快照内的防御性跳过；
 * 3. wiki 过滤：仅 `wiki/` 下页面（嵌套 `notes/wiki/` 不算）；
 * 4. 上限：节点按链接度降序截断、边上限截断、统计字段与确定性顺序；
 * 5. 空快照 / null 快照 / 非法过滤模式兜底。
 */
import { describe, it, expect } from 'vitest'

import {
    buildGraphData,
    isWikiPagePath,
    normalizeGraphFilter,
    normalizeGraphPath
} from '../../../src/renderer/src/components/Graph/graph-data'
import type {
    WorkspaceIndexFile,
    WorkspaceIndexSnapshot
} from '../../../src/shared/types/workspace-index'

/** 构造索引文件（默认无链接、无标签） */
function makeFile(
    relativePath: string,
    overrides: Partial<WorkspaceIndexFile> = {}
): WorkspaceIndexFile {
    const path = `E:/ws/${relativePath}`
    const name = relativePath.split('/').pop() ?? relativePath
    return {
        path,
        relativePath,
        name,
        title: name.replace(/\.md$/, ''),
        tags: [],
        links: [],
        size: 10,
        mtimeMs: 1,
        ...overrides
    }
}

/** 构造快照（stats 使用最小合法结构） */
function makeSnapshot(files: WorkspaceIndexFile[]): WorkspaceIndexSnapshot {
    return {
        rootPath: 'E:/ws',
        generatedAt: 1,
        files,
        tags: [],
        missingLinks: [],
        attachments: [],
        stats: {
            fileCount: files.length,
            linkCount: 0,
            missingCount: 0,
            ambiguousCount: 0
        }
    }
}

/** 构造 resolved 链接 */
function resolvedLink(targetFile: WorkspaceIndexFile, line = 3, column = 1) {
    return {
        target: targetFile.relativePath,
        raw: `[[${targetFile.relativePath}]]`,
        line,
        column,
        status: 'resolved' as const,
        resolvedPath: targetFile.path
    }
}

describe('normalizeGraphPath / isWikiPagePath / normalizeGraphFilter', () => {
    it('路径归一化统一分隔符并小写（Windows 大小写不敏感口径）', () => {
        expect(normalizeGraphPath('E:\\Wiki\\A.md')).toBe('e:/wiki/a.md')
        expect(normalizeGraphPath('E:/Wiki/A.md')).toBe('e:/wiki/a.md')
    })

    it('只有工作区根下第一段为 wiki/ 的相对路径才算 Wiki 页面', () => {
        expect(isWikiPagePath('wiki/a.md')).toBe(true)
        expect(isWikiPagePath('wiki/sub/a.md')).toBe(true)
        expect(isWikiPagePath('notes/wiki/a.md')).toBe(false)
        expect(isWikiPagePath('schema.md')).toBe(false)
        expect(isWikiPagePath('')).toBe(false)
        expect(isWikiPagePath('wiki')).toBe(false)
    })

    it('过滤模式非法值回落 all', () => {
        expect(normalizeGraphFilter('wiki')).toBe('wiki')
        expect(normalizeGraphFilter('all')).toBe('all')
        expect(normalizeGraphFilter('unknown')).toBe('all')
        expect(normalizeGraphFilter(undefined)).toBe('all')
    })
})

describe('buildGraphData：节点/边构建', () => {
    it('null / 空快照返回空图且统计归零', () => {
        expect(buildGraphData(null)).toEqual({
            nodes: [],
            edges: [],
            totalNodeCount: 0,
            filteredNodeCount: 0,
            omittedNodeCount: 0,
            omittedEdgeCount: 0,
            truncated: false
        })
        expect(buildGraphData(makeSnapshot([])).nodes).toEqual([])
    })

    it('resolved 链接生成有向边，同一对来源/目标聚合 occurrence', () => {
        const target = makeFile('wiki/b.md')
        const source = makeFile('wiki/a.md', {
            links: [resolvedLink(target, 3, 1), resolvedLink(target, 9, 5)]
        })
        const graph = buildGraphData(makeSnapshot([source, target]))
        expect(graph.nodes.map((node) => node.relativePath)).toEqual(['wiki/a.md', 'wiki/b.md'])
        expect(graph.edges).toHaveLength(1)
        expect(graph.edges[0].source).toBe(normalizeGraphPath(source.path))
        expect(graph.edges[0].target).toBe(normalizeGraphPath(target.path))
        expect(graph.edges[0].occurrences).toEqual([
            { raw: '[[wiki/b.md]]', line: 3, column: 1 },
            { raw: '[[wiki/b.md]]', line: 9, column: 5 }
        ])
        // 度数：入边 + 出边各 +1
        expect(graph.nodes.find((node) => node.relativePath === 'wiki/a.md')?.degree).toBe(1)
        expect(graph.nodes.find((node) => node.relativePath === 'wiki/b.md')?.degree).toBe(1)
    })

    it('missing / ambiguous / 自链接 / 快照外 resolvedPath 均不建边', () => {
        const target = makeFile('wiki/b.md')
        const source = makeFile('wiki/a.md')
        source.links = [
            {
                target: 'missing',
                raw: '[[missing]]',
                line: 1,
                column: 1,
                status: 'missing'
            },
            {
                target: 'ambiguous',
                raw: '[[ambiguous]]',
                line: 2,
                column: 1,
                status: 'ambiguous'
            },
            {
                target: 'wiki/a.md',
                raw: '[[wiki/a.md]]',
                line: 3,
                column: 1,
                status: 'resolved',
                resolvedPath: source.path
            },
            {
                target: 'outside',
                raw: '[[outside]]',
                line: 4,
                column: 1,
                status: 'resolved',
                resolvedPath: 'E:/ws/outside.md'
            }
        ]
        const graph = buildGraphData(makeSnapshot([source, target]))
        expect(graph.edges).toEqual([])
        // 节点仍然全部展示（无关系时由 UI 决定空态）
        expect(graph.nodes).toHaveLength(2)
        expect(graph.nodes.every((node) => node.degree === 0)).toBe(true)
    })

    it('双向链接生成两条方向边', () => {
        const a = makeFile('wiki/a.md')
        const b = makeFile('wiki/b.md')
        a.links = [resolvedLink(b)]
        b.links = [resolvedLink(a)]
        const graph = buildGraphData(makeSnapshot([a, b]))
        expect(graph.edges).toHaveLength(2)
        expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
            `${normalizeGraphPath(a.path)}->${normalizeGraphPath(b.path)}`,
            `${normalizeGraphPath(b.path)}->${normalizeGraphPath(a.path)}`
        ])
    })
})

describe('buildGraphData：wiki 过滤', () => {
    it('仅保留 wiki/ 目录下的节点与两端都在 wiki 的边', () => {
        const wikiA = makeFile('wiki/a.md')
        const wikiB = makeFile('wiki/b.md')
        const rootNote = makeFile('note.md')
        wikiA.links = [resolvedLink(wikiB), resolvedLink(rootNote)]
        rootNote.links = [resolvedLink(wikiA)]
        const graph = buildGraphData(makeSnapshot([wikiA, wikiB, rootNote]), { filter: 'wiki' })
        expect(graph.nodes.map((node) => node.relativePath)).toEqual(['wiki/a.md', 'wiki/b.md'])
        expect(graph.edges).toHaveLength(1)
        expect(graph.totalNodeCount).toBe(3)
        expect(graph.filteredNodeCount).toBe(2)
    })

    it('没有 wiki/ 页面时 wiki 过滤返回空节点（totalNodeCount 保留快照总数）', () => {
        const graph = buildGraphData(makeSnapshot([makeFile('note.md')]), { filter: 'wiki' })
        expect(graph.nodes).toEqual([])
        expect(graph.totalNodeCount).toBe(1)
        expect(graph.filteredNodeCount).toBe(0)
    })
})

describe('buildGraphData：节点/边上限', () => {
    it('节点超上限时按链接度降序截断并回传省略数', () => {
        const hub = makeFile('wiki/hub.md')
        const leaves = Array.from({ length: 5 }, (_, index) => makeFile(`wiki/leaf-${index}.md`))
        hub.links = leaves.map((leaf) => resolvedLink(leaf))
        const files = [hub, ...leaves]
        for (const leaf of leaves) {
            leaf.links = [resolvedLink(hub)]
        }
        const graph = buildGraphData(makeSnapshot(files), { maxNodes: 3 })
        expect(graph.nodes).toHaveLength(3)
        expect(graph.truncated).toBe(true)
        expect(graph.omittedNodeCount).toBe(3)
        // hub 度数最高，必定保留；其余按 degree 降序（并列时 relativePath 升序）
        expect(graph.nodes[0].relativePath).toBe('wiki/hub.md')
        expect(graph.nodes.map((node) => node.relativePath)).toEqual([
            'wiki/hub.md',
            'wiki/leaf-0.md',
            'wiki/leaf-1.md'
        ])
    })

    it('节点上限按过滤后的候选集计算', () => {
        const files = [
            makeFile('wiki/a.md'),
            makeFile('wiki/b.md'),
            makeFile('note.md'),
            makeFile('other.md')
        ]
        const graph = buildGraphData(makeSnapshot(files), { filter: 'wiki', maxNodes: 1 })
        expect(graph.nodes).toHaveLength(1)
        expect(graph.filteredNodeCount).toBe(2)
        expect(graph.omittedNodeCount).toBe(1)
    })

    it('边超上限时按出现次数降序截断并回传省略数', () => {
        const target = makeFile('wiki/target.md')
        const strong = makeFile('wiki/strong.md', {
            links: [resolvedLink(target), resolvedLink(target), resolvedLink(target)]
        })
        const weak = makeFile('wiki/weak.md', { links: [resolvedLink(target)] })
        const graph = buildGraphData(makeSnapshot([target, strong, weak]), { maxEdges: 1 })
        expect(graph.edges).toHaveLength(1)
        expect(graph.edges[0].source).toBe(normalizeGraphPath(strong.path))
        expect(graph.omittedEdgeCount).toBe(1)
        expect(graph.truncated).toBe(true)
    })

    it('非法上限/过滤参数回落默认值（不抛异常）', () => {
        const a = makeFile('wiki/a.md')
        const b = makeFile('wiki/b.md')
        a.links = [resolvedLink(b)]
        const graph = buildGraphData(makeSnapshot([a, b]), {
            filter: 'unknown' as never,
            maxNodes: -1,
            maxEdges: Number.NaN
        })
        expect(graph.nodes).toHaveLength(2)
        expect(graph.edges).toHaveLength(1)
        expect(graph.truncated).toBe(false)
    })
})
