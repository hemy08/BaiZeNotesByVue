// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L4：关系图谱对话框单测（`components/Graph/GraphDialog.vue`）。
 *
 * 覆盖：
 * 1. 打开即调用 FILE.GET_WORKSPACE_INDEX，渲染 SVG 节点/边与汇总；
 * 2. 点击节点 → 复用 openIndexedFile 打开文件（mock），并展示「已打开」提示；
 * 3. 过滤：切换「仅 Wiki 页面」后只渲染 wiki/ 节点与边；
 * 4. 悬停/点击连线 → 右侧栏展示关系明细（来源/目标/出现位置）；
 * 5. 空态/错误态（空快照、无工作区）与重试按钮；
 * 6. visible=false 不发起 IPC；关闭按钮 emit close。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import GraphDialog from '@renderer/components/Graph/GraphDialog.vue'
import { openIndexedFile } from '@renderer/composables/useWorkspaceIndex'
import { IPC } from '../../../src/shared/ipc-channels'
import type {
    WorkspaceIndexFile,
    WorkspaceIndexSnapshot
} from '../../../src/shared/types/workspace-index'

// openIndexedFile 只测「是否被调用/调用参数」，用替身避免真实等待主进程回发事件
vi.mock('@renderer/composables/useWorkspaceIndex', async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import('../../../src/renderer/src/composables/useWorkspaceIndex')
        >()
    return {
        ...actual,
        openIndexedFile: vi.fn(async () => true)
    }
})

/** 构造索引文件 */
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

/** 构造快照 */
function makeSnapshot(files: WorkspaceIndexFile[]): WorkspaceIndexSnapshot {
    return {
        rootPath: 'E:/ws',
        generatedAt: 1,
        files,
        tags: [],
        missingLinks: [],
        attachments: [],
        stats: { fileCount: files.length, linkCount: 0, missingCount: 0, ambiguousCount: 0 }
    }
}

/** 构造 resolved 链接 */
function resolvedLink(targetFile: WorkspaceIndexFile, line = 2) {
    return {
        target: targetFile.relativePath,
        raw: `[[${targetFile.relativePath}]]`,
        line,
        column: 1,
        status: 'resolved' as const,
        resolvedPath: targetFile.path
    }
}

/**
 * 三文件快照：wiki/a.md → wiki/b.md 与 note.md；note.md → wiki/a.md。
 * 全部过滤：3 节点 / 3 边；仅 Wiki：2 节点 / 1 边。
 */
function makeThreeFileSnapshot(): WorkspaceIndexSnapshot {
    const wikiA = makeFile('wiki/a.md')
    const wikiB = makeFile('wiki/b.md')
    const note = makeFile('note.md')
    wikiA.links = [resolvedLink(wikiB, 2), resolvedLink(note, 4)]
    note.links = [resolvedLink(wikiA, 6)]
    return makeSnapshot([wikiA, wikiB, note])
}

let invoke: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[] = []

/** 挂载对话框（默认 visible=true 触发一次索引请求） */
function mountGraph(visible = true): VueWrapper {
    const wrapper = mount(GraphDialog, {
        props: { visible },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
}

beforeEach(() => {
    invoke = vi.fn(async (channel: string) => {
        if (channel === IPC.FILE.GET_WORKSPACE_INDEX) {
            return { ok: true, snapshot: makeThreeFileSnapshot(), cached: true }
        }
        return undefined
    })
    vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    vi.mocked(openIndexedFile).mockClear()
})

afterEach(() => {
    for (const wrapper of wrappers) {
        wrapper.unmount()
    }
    wrappers = []
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
})

describe('GraphDialog：图谱渲染', () => {
    it('打开即加载工作区索引，渲染画布/节点/边与汇总', async () => {
        const wrapper = mountGraph()
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(IPC.FILE.GET_WORKSPACE_INDEX, { force: false })
        expect(wrapper.find('[data-testid="graph-canvas"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-testid="graph-node"]')).toHaveLength(3)
        expect(wrapper.findAll('[data-testid="graph-edge-hit"]')).toHaveLength(3)
        const summary = wrapper.find('[data-testid="graph-summary"]').text()
        expect(summary).toContain('3')
        expect(summary).toContain('3')
        // 初始展示侧栏操作说明
        expect(wrapper.find('[data-testid="graph-legend"]').exists()).toBe(true)
    })

    it('visible=false 不发起索引请求', async () => {
        mountGraph(false)
        await flushPromises()
        expect(invoke).not.toHaveBeenCalled()
    })

    it('点击节点调用 openIndexedFile 并展示已打开提示', async () => {
        const wrapper = mountGraph()
        await flushPromises()

        const noteNode = wrapper
            .findAll('[data-testid="graph-node"]')
            .find((node) => node.attributes('data-node-path') === 'E:/ws/note.md')
        expect(noteNode).toBeDefined()
        await noteNode!.trigger('click')
        await flushPromises()

        expect(openIndexedFile).toHaveBeenCalledWith('E:/ws/note.md', 1)
        const opened = wrapper.find('[data-testid="graph-opened"]')
        expect(opened.exists()).toBe(true)
        expect(opened.text()).toContain('note')
    })

    it('键盘 Enter 同样可打开节点（无障碍）', async () => {
        const wrapper = mountGraph()
        await flushPromises()
        const firstNode = wrapper.findAll('[data-testid="graph-node"]')[0]
        await firstNode.trigger('keydown', { key: 'Enter' })
        await flushPromises()
        expect(openIndexedFile).toHaveBeenCalledTimes(1)
    })
})

describe('GraphDialog：过滤与关系侧栏', () => {
    it('切换「仅 Wiki 页面」后只渲染 wiki/ 节点与边', async () => {
        const wrapper = mountGraph()
        await flushPromises()
        expect(wrapper.findAll('[data-testid="graph-node"]')).toHaveLength(3)

        await wrapper.find('[data-testid="graph-filter"]').setValue('wiki')
        await flushPromises()

        const nodes = wrapper.findAll('[data-testid="graph-node"]')
        expect(nodes).toHaveLength(2)
        expect(nodes.map((node) => node.attributes('data-node-path'))).toEqual([
            'E:/ws/wiki/a.md',
            'E:/ws/wiki/b.md'
        ])
        expect(wrapper.findAll('[data-testid="graph-edge-hit"]')).toHaveLength(1)
    })

    it('悬停连线在侧栏展示关系明细（来源/目标/出现位置）', async () => {
        const wrapper = mountGraph()
        await flushPromises()

        const edge = wrapper
            .findAll('[data-testid="graph-edge-hit"]')
            .find((item) => (item.attributes('data-edge-id') ?? '').endsWith('wiki/b.md'))
        expect(edge).toBeDefined()
        await edge!.trigger('mouseenter')
        await flushPromises()

        const panel = wrapper.find('[data-testid="graph-panel"]')
        const relation = wrapper.find('[data-testid="graph-edge-relation"]')
        expect(relation.exists()).toBe(true)
        expect(relation.text()).toContain('→')
        expect(panel.text()).toContain('wiki/b.md')
        expect(panel.text()).toContain('L2:1')
    })

    it('点击连线后关系明细保持选中（鼠标离开不清空）', async () => {
        const wrapper = mountGraph()
        await flushPromises()

        const edge = wrapper
            .findAll('[data-testid="graph-edge-hit"]')
            .find((item) => (item.attributes('data-edge-id') ?? '').endsWith('wiki/b.md'))
        expect(edge).toBeDefined()
        await edge!.trigger('mouseenter')
        await edge!.trigger('click')
        await edge!.trigger('mouseleave')
        await flushPromises()

        expect(wrapper.find('[data-testid="graph-edge-relation"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="graph-panel"]').text()).toContain('L2:1')
    })
})

describe('GraphDialog：空态 / 错误态 / 关闭', () => {
    it('空工作区显示空态文案', async () => {
        invoke.mockResolvedValue({
            ok: true,
            snapshot: makeSnapshot([]),
            cached: true
        })
        const wrapper = mountGraph()
        await flushPromises()
        expect(wrapper.find('[data-testid="graph-empty-workspace"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="graph-canvas"]').exists()).toBe(false)
    })

    it('文件存在但没有可解析链接时显示「无关系」空态', async () => {
        invoke.mockResolvedValue({
            ok: true,
            snapshot: makeSnapshot([makeFile('wiki/a.md'), makeFile('wiki/b.md')]),
            cached: true
        })
        const wrapper = mountGraph()
        await flushPromises()
        expect(wrapper.find('[data-testid="graph-empty-links"]').exists()).toBe(true)
    })

    it('无工作区显示引导态（不展示重试错误框）', async () => {
        invoke.mockResolvedValue({ ok: false, code: 'NO_WORKSPACE' })
        const wrapper = mountGraph()
        await flushPromises()
        expect(wrapper.find('[data-testid="graph-no-workspace"]').exists()).toBe(true)
    })

    it('索引失败显示错误态，重试按钮再次请求（force=true）', async () => {
        invoke.mockResolvedValueOnce({ ok: false, code: 'INDEX_ERROR' })
        const wrapper = mountGraph()
        await flushPromises()
        expect(wrapper.find('[data-testid="graph-error"]').exists()).toBe(true)

        invoke.mockResolvedValue({ ok: true, snapshot: makeThreeFileSnapshot(), cached: false })
        await wrapper.find('.btn-retry-graph').trigger('click')
        await flushPromises()
        expect(invoke).toHaveBeenLastCalledWith(IPC.FILE.GET_WORKSPACE_INDEX, { force: true })
        expect(wrapper.find('[data-testid="graph-canvas"]').exists()).toBe(true)
    })

    it('关闭按钮 emit close（不直接操作宿主状态）', async () => {
        const wrapper = mountGraph()
        await flushPromises()
        await wrapper.find('.btn-close-graph').trigger('click')
        expect(wrapper.emitted('close')).toBeTruthy()
    })
})
