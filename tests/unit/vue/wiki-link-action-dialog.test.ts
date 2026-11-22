// @vitest-environment jsdom
/**
 * B1 Wiki 链接动作对话框组件契约测试：
 * 歧义候选、缺失确认、创建被阻止、错误提示、busy/关闭。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import WikiLinkActionDialog from '../../../src/renderer/src/components/Markdown/WikiLinkActionDialog.vue'
import {
    closeWikiLinkActionDialogState,
    openWikiLinkActionDialogState,
    setWikiLinkActionDialogBusy,
    wikiLinkActionDialogState
} from '../../../src/renderer/src/components/Markdown/wiki-link-action-dialog-state'

vi.mock('../../../src/renderer/src/components/Markdown/wiki-link-actions', async () => {
    const actual = await vi.importActual<
        typeof import('../../../src/renderer/src/components/Markdown/wiki-link-actions')
    >('../../../src/renderer/src/components/Markdown/wiki-link-actions')
    return {
        ...actual,
        openWikiLinkTarget: vi.fn(),
        createMissingWikiPage: vi.fn()
    }
})

import {
    createMissingWikiPage,
    openWikiLinkTarget
} from '../../../src/renderer/src/components/Markdown/wiki-link-actions'

const mountOptions = {
    global: { stubs: { teleport: true } },
    attachTo: document.body
}

let wrapper: VueWrapper | null = null

function mountDialog(): VueWrapper {
    wrapper = mount(WikiLinkActionDialog, mountOptions) as VueWrapper
    return wrapper
}

function lastCall(fn: unknown): unknown[] {
    const mocked = fn as { mock: { calls: unknown[][] } }
    return mocked.mock.calls[mocked.mock.calls.length - 1] ?? []
}

beforeEach(() => {
    closeWikiLinkActionDialogState()
    vi.mocked(openWikiLinkTarget).mockReset()
    vi.mocked(createMissingWikiPage).mockReset()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    closeWikiLinkActionDialogState()
    document.body.innerHTML = ''
})

describe('WikiLinkActionDialog：歧义选择', () => {
    it('渲染候选标题/路径与链接原文，点击候选打开并关闭', async () => {
        vi.mocked(openWikiLinkTarget).mockResolvedValue(true)
        openWikiLinkActionDialogState({
            kind: 'ambiguous',
            raw: '[[同名]]',
            target: '同名',
            line: 3,
            column: 5,
            candidates: [
                { path: 'C:/ws/a/同名.md', title: '同名 A', relativePath: 'a/同名.md' },
                { path: 'C:/ws/b/同名.md', title: '同名 B', relativePath: 'b/同名.md' }
            ]
        })
        const wrapper = mountDialog()
        expect(wrapper.find('.wiki-link-raw').text()).toContain('[[同名]]')
        expect(wrapper.find('.wiki-link-location').text()).toContain('L3:5')
        const candidates = wrapper.findAll('.wiki-link-candidate')
        expect(candidates).toHaveLength(2)
        expect(candidates[0].text()).toContain('同名 A')
        expect(candidates[0].text()).toContain('a/同名.md')

        await candidates[0].trigger('click')
        expect(lastCall(openWikiLinkTarget)).toEqual(['C:/ws/a/同名.md'])
        expect(wikiLinkActionDialogState.visible).toBe(false)
    })

    it('候选打开失败时保留对话框并显示错误', async () => {
        vi.mocked(openWikiLinkTarget).mockResolvedValue(false)
        openWikiLinkActionDialogState({
            kind: 'ambiguous',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1,
            candidates: [{ path: 'C:/ws/x.md', title: 'x', relativePath: 'x.md' }]
        })
        const wrapper = mountDialog()
        await wrapper.find('.wiki-link-candidate').trigger('click')
        expect(wrapper.find('.wiki-link-dialog-error').text()).toContain('打开文件失败')
        expect(wikiLinkActionDialogState.visible).toBe(true)
    })

    it('空候选显示失效提示', () => {
        openWikiLinkActionDialogState({
            kind: 'ambiguous',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1,
            candidates: []
        })
        const wrapper = mountDialog()
        expect(wrapper.find('.wiki-link-empty').text()).toContain('候选已失效')
        expect(wrapper.find('.wiki-link-candidate').exists()).toBe(false)
    })
})

describe('WikiLinkActionDialog：缺失页创建', () => {
    it('展示将创建路径与保存目录，确认创建成功后关闭', async () => {
        vi.mocked(createMissingWikiPage).mockResolvedValue({ ok: true })
        openWikiLinkActionDialogState({
            kind: 'missing',
            raw: '[[新笔记]]',
            target: '新笔记',
            line: 2,
            column: 1,
            plan: {
                rootPath: 'C:/ws',
                fileName: '新笔记',
                dirPath: 'C:/ws',
                dirRelativePath: '',
                relativePath: '新笔记.md',
                displayPath: '新笔记.md',
                extension: '.md'
            }
        })
        const wrapper = mountDialog()
        expect(wrapper.find('.wiki-link-create-notice').text()).toContain('新笔记.md')
        expect(wrapper.find('.wiki-link-create-dir').text()).toContain('C:/ws')
        await wrapper.find('.btn-wiki-link-create').trigger('click')
        expect(lastCall(createMissingWikiPage)[0]).toMatchObject({ relativePath: '新笔记.md' })
        expect(wikiLinkActionDialogState.visible).toBe(false)
    })

    it('创建失败保留对话框并提示主进程不可用', async () => {
        vi.mocked(createMissingWikiPage).mockResolvedValue({
            ok: false,
            error: 'IPC_UNAVAILABLE'
        })
        openWikiLinkActionDialogState({
            kind: 'missing',
            raw: '[[n]]',
            target: 'n',
            line: 1,
            column: 1,
            plan: {
                rootPath: 'C:/ws',
                fileName: 'n',
                dirPath: 'C:/ws',
                dirRelativePath: '',
                relativePath: 'n.md',
                displayPath: 'n.md',
                extension: '.md'
            }
        })
        const wrapper = mountDialog()
        await wrapper.find('.btn-wiki-link-create').trigger('click')
        expect(wrapper.find('.wiki-link-dialog-error').text()).toContain('主进程')
        expect(wikiLinkActionDialogState.visible).toBe(true)
    })

    it('busy 时创建按钮禁用并显示创建中', async () => {
        openWikiLinkActionDialogState({
            kind: 'missing',
            raw: '[[n]]',
            target: 'n',
            line: 1,
            column: 1,
            plan: {
                rootPath: 'C:/ws',
                fileName: 'n',
                dirPath: 'C:/ws',
                dirRelativePath: '',
                relativePath: 'n.md',
                displayPath: 'n.md',
                extension: '.md'
            }
        })
        setWikiLinkActionDialogBusy(true)
        const wrapper = mountDialog()
        const button = wrapper.find('.btn-wiki-link-create')
        expect(button.attributes('disabled')).toBeDefined()
        expect(button.text()).toContain('创建中')
    })

    it('创建失败时展示通用错误与主进程 message', async () => {
        vi.mocked(createMissingWikiPage).mockResolvedValue({
            ok: false,
            error: '磁盘只读'
        })
        openWikiLinkActionDialogState({
            kind: 'missing',
            raw: '[[n]]',
            target: 'n',
            line: 1,
            column: 1,
            plan: {
                rootPath: 'C:/ws',
                fileName: 'n',
                dirPath: 'C:/ws',
                dirRelativePath: '',
                relativePath: 'n.md',
                displayPath: 'n.md',
                extension: '.md'
            }
        })
        const wrapper = mountDialog()
        await wrapper.find('.btn-wiki-link-create').trigger('click')
        expect(wrapper.find('.wiki-link-dialog-error').text()).toContain('磁盘只读')
    })

    it('创建失败 INVALID_PLAN 显示参数不合法', async () => {
        vi.mocked(createMissingWikiPage).mockResolvedValue({
            ok: false,
            error: 'INVALID_PLAN'
        })
        openWikiLinkActionDialogState({
            kind: 'missing',
            raw: '[[n]]',
            target: 'n',
            line: 1,
            column: 1,
            plan: {
                rootPath: 'C:/ws',
                fileName: 'n',
                dirPath: 'C:/ws',
                dirRelativePath: '',
                relativePath: 'n.md',
                displayPath: 'n.md',
                extension: '.md'
            }
        })
        const wrapper = mountDialog()
        await wrapper.find('.btn-wiki-link-create').trigger('click')
        expect(wrapper.find('.wiki-link-dialog-error').text()).toContain('参数不合法')
    })

    it('取消按钮关闭缺失确认', async () => {
        openWikiLinkActionDialogState({
            kind: 'missing',
            raw: '[[n]]',
            target: 'n',
            line: 1,
            column: 1,
            plan: {
                rootPath: 'C:/ws',
                fileName: 'n',
                dirPath: 'C:/ws',
                dirRelativePath: '',
                relativePath: 'n.md',
                displayPath: 'n.md',
                extension: '.md'
            }
        })
        const wrapper = mountDialog()
        await wrapper.find('.btn-wiki-link-cancel').trigger('click')
        expect(wikiLinkActionDialogState.visible).toBe(false)
    })
})

describe('WikiLinkActionDialog：阻止与错误态', () => {
    it('目录不存在显示具体目录和先建目录提示', () => {
        openWikiLinkActionDialogState({
            kind: 'blocked',
            raw: '[[a/b]]',
            target: 'a/b',
            line: 1,
            column: 1,
            reason: 'directory-missing',
            missingDirectory: 'a'
        })
        const wrapper = mountDialog()
        expect(wrapper.find('[role="alert"]').text()).toContain('目录不存在')
        expect(wrapper.find('[role="alert"]').text()).toContain('a')
    })

    it('目标已存在显示已存在路径', () => {
        openWikiLinkActionDialogState({
            kind: 'blocked',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1,
            reason: 'already-exists',
            existingFilePath: 'C:/ws/x.md'
        })
        const wrapper = mountDialog()
        expect(wrapper.find('[role="alert"]').text()).toContain('C:/ws/x.md')
    })

    it('未知阻止原因走默认提示', () => {
        openWikiLinkActionDialogState({
            kind: 'blocked',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1
        })
        const wrapper = mountDialog()
        expect(wrapper.find('[role="alert"]').text()).toContain('无法')
    })

    it('无链接上下文时不渲染 raw/location', () => {
        openWikiLinkActionDialogState({
            kind: 'blocked',
            raw: '',
            target: 'x',
            line: 1,
            column: 1,
            reason: 'invalid-target'
        })
        const wrapper = mountDialog()
        expect(wrapper.find('.wiki-link-context').exists()).toBe(false)
    })

    it('缺失态但缺少创建计划时只显示关闭按钮', () => {
        openWikiLinkActionDialogState({
            kind: 'missing',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1
        })
        const wrapper = mountDialog()
        expect(wrapper.find('.btn-wiki-link-create').exists()).toBe(false)
        expect(wrapper.find('.btn-wiki-link-cancel').exists()).toBe(true)
    })

    it('busy 时取消按钮禁用', () => {
        openWikiLinkActionDialogState({
            kind: 'ambiguous',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1,
            candidates: [{ path: 'C:/ws/x.md', title: 'x', relativePath: 'x.md' }]
        })
        setWikiLinkActionDialogBusy(true)
        const wrapper = mountDialog()
        expect(wrapper.find('.btn-wiki-link-cancel').attributes('disabled')).toBeDefined()
    })

    it('无工作区/索引错误/打开失败/非法目标分别映射提示', () => {
        const cases = [
            { reason: 'no-workspace' as const, text: '尚未打开工作区' },
            { reason: 'index-error' as const, text: '加载工作区索引失败' },
            { reason: 'open-failed' as const, text: '打开文件失败' },
            { reason: 'invalid-target' as const, text: '目标' }
        ]
        for (const item of cases) {
            closeWikiLinkActionDialogState()
            openWikiLinkActionDialogState({
                kind: 'blocked',
                raw: '[[x]]',
                target: 'x',
                line: 1,
                column: 1,
                reason: item.reason
            })
            const localWrapper = mountDialog()
            expect(localWrapper.find('[role="alert"]').text()).toContain(item.text)
            localWrapper.unmount()
            wrapper = null
        }
    })

    it('候选 busy 时点击不触发打开', async () => {
        openWikiLinkActionDialogState({
            kind: 'ambiguous',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1,
            candidates: [{ path: 'C:/ws/x.md', title: 'x', relativePath: 'x.md' }]
        })
        setWikiLinkActionDialogBusy(true)
        const wrapper = mountDialog()
        await wrapper.find('.wiki-link-candidate').trigger('click')
        expect(openWikiLinkTarget).not.toHaveBeenCalled()
    })

    it('动作错误优先展示 message', () => {
        openWikiLinkActionDialogState({
            kind: 'error',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1,
            reason: 'open-failed',
            message: '磁盘读取失败'
        })
        const wrapper = mountDialog()
        expect(wrapper.find('[role="alert"]').text()).toContain('磁盘读取失败')
    })

    it('无 message 时按 reason 映射错误文案', () => {
        openWikiLinkActionDialogState({
            kind: 'error',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1,
            reason: 'no-workspace'
        })
        const wrapper = mountDialog()
        expect(wrapper.find('[role="alert"]').text()).toContain('尚未打开工作区')
    })

    it('error 的 index-error/open-failed 映射到对应文案', () => {
        const cases = [
            { reason: 'index-error' as const, text: '加载工作区索引失败' },
            { reason: 'open-failed' as const, text: '打开文件失败' }
        ]
        for (const item of cases) {
            closeWikiLinkActionDialogState()
            openWikiLinkActionDialogState({
                kind: 'error',
                raw: '[[x]]',
                target: 'x',
                line: 1,
                column: 1,
                reason: item.reason
            })
            const localWrapper = mountDialog()
            expect(localWrapper.find('[role="alert"]').text()).toContain(item.text)
            localWrapper.unmount()
            wrapper = null
        }
    })

    it('关闭按钮清空状态', async () => {
        openWikiLinkActionDialogState({
            kind: 'blocked',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1,
            reason: 'invalid-target'
        })
        const wrapper = mountDialog()
        await wrapper.find('.btn-wiki-link-close').trigger('click')
        expect(wikiLinkActionDialogState.visible).toBe(false)
        expect(wikiLinkActionDialogState.request).toBeNull()
    })
})
