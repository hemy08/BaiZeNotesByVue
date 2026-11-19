// @vitest-environment jsdom
/**
 * 结构优化第 2 批 2.1（H3）：由主进程 JSDOM/原生对话框迁移而来的 Vue 对话框组件测试。
 *
 * 覆盖 5 个新组件：
 * - RenameFileFolderDialog：原路径展示、空名称校验、确认/回车 emit、打开时重置；
 * - ConfirmDeleteDialog：删除确认文案、确认/取消 emit；
 * - ShortcutKeysDialog：快捷键分组/kbd 渲染、关闭 emit；
 * - UpdateLogDialog：更新日志区块/依赖表/i18n 渲染、关闭 emit；
 * - ReleaseNotesDialog：按 version prop 渲染对应发布说明、不存在版本降级文案。
 *
 * 说明：所有文案来自共享词典（dialogMain.* / common.* / mainMsg.*），
 * 测试固定 zh-CN 保证与迁移前主进程 HTML 对话框中文输出一致。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

import RenameFileFolderDialog from '@renderer/components/dialogs/simple/RenameFileFolderDialog.vue'
import ConfirmDeleteDialog from '@renderer/components/dialogs/simple/ConfirmDeleteDialog.vue'
import ShortcutKeysDialog from '@renderer/components/dialogs/help/ShortcutKeysDialog.vue'
import UpdateLogDialog from '@renderer/components/dialogs/help/UpdateLogDialog.vue'
import ReleaseNotesDialog from '@renderer/components/dialogs/help/ReleaseNotesDialog.vue'
import { setLocale } from '@renderer/common/i18n'

const dialogMountOptions = { global: { stubs: { teleport: true } } }

beforeEach(() => {
    setLocale('zh-CN')
})

afterEach(() => {
    document.body.innerHTML = ''
})

describe('RenameFileFolderDialog（原 JSDOM 重命名对话框）', () => {
    it('renders the old path and the new-name input', () => {
        const wrapper = mount(RenameFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: true, path: 'C:/notes/a.md', isFile: true }
        })
        expect(wrapper.find('.old-path').text()).toContain('C:/notes/a.md')
        expect(wrapper.find('.name-input').attributes('placeholder')).toBe('请输入新名称')
        expect(wrapper.text()).toContain('新名称：')
    })

    it('shows the empty-name tip instead of emitting when confirming an empty value', async () => {
        const wrapper = mount(RenameFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: true, path: 'C:/notes/a.md', isFile: true }
        })
        await wrapper.find('.btn-confirm').trigger('click')
        expect(wrapper.emitted('confirm')).toBeUndefined()
        expect(wrapper.find('.error-tip').classes()).toContain('visible')
        expect(wrapper.text()).toContain('新名称不能为空')
    })

    it('emits the trimmed new name on confirm', async () => {
        const wrapper = mount(RenameFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: true, path: 'C:/notes/a.md', isFile: true }
        })
        await wrapper.find('.name-input').setValue('  b  ')
        await wrapper.find('.btn-confirm').trigger('click')
        expect(wrapper.emitted('confirm')![0][0]).toBe('b')
    })

    it('emits on Enter and resets the input when reopened', async () => {
        const wrapper = mount(RenameFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: true, path: 'C:/notes/a.md', isFile: true }
        })
        await wrapper.find('.name-input').setValue('c')
        await wrapper.find('.name-input').trigger('keyup.enter')
        expect(wrapper.emitted('confirm')![0][0]).toBe('c')

        // 关闭再打开：输入框清空（与迁移前 JSDOM 每次打开重新输入一致）
        await wrapper.setProps({ visible: false })
        await wrapper.setProps({ visible: true })
        await flushPromises()
        expect((wrapper.find('.name-input').element as HTMLInputElement).value).toBe('')
    })

    it('emits close on cancel and on title-bar close', async () => {
        const wrapper = mount(RenameFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: true, path: 'C:/notes/a.md', isFile: true }
        })
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(2)
    })
})

describe('ConfirmDeleteDialog（原 electron 原生删除确认框）', () => {
    it('renders the deletion question with the target path', () => {
        const wrapper = mount(ConfirmDeleteDialog, {
            ...dialogMountOptions,
            props: { visible: true, path: 'C:/notes/a.md', isFile: true }
        })
        expect(wrapper.text()).toContain('确认')
        expect(wrapper.text()).toContain('确定要删除[C:/notes/a.md]吗？')
        expect(wrapper.find('.btn-danger').text()).toBe('是')
        expect(wrapper.find('.btn-cancel').text()).toBe('否')
    })

    it('emits confirm on yes and close on no', async () => {
        const wrapper = mount(ConfirmDeleteDialog, {
            ...dialogMountOptions,
            props: { visible: true, path: 'C:/notes/a.md', isFile: true }
        })
        await wrapper.find('.btn-danger').trigger('click')
        expect(wrapper.emitted('confirm')).toHaveLength(1)
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('ShortcutKeysDialog（原 JSDOM 快捷键说明）', () => {
    it('renders every shortcut group and key combination', () => {
        const wrapper = mount(ShortcutKeysDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const text = wrapper.text()
        for (const group of ['文件', '编辑', 'Markdown 格式', '视图']) {
            expect(text).toContain(group)
        }
        for (const key of ['Ctrl+N', 'Ctrl+O', 'Ctrl+S', 'Ctrl+Shift+R', 'F4', 'Ctrl+Z', 'F9']) {
            expect(wrapper.findAll('kbd').some((node) => node.text() === key)).toBe(true)
        }
        expect(text).toContain('新建文件 / 文件夹')
        expect(text).toContain('开发者工具')
        expect(wrapper.text()).toContain('以下为当前版本可用的快捷键')
    })

    it('emits close when the close button is clicked', async () => {
        const wrapper = mount(ShortcutKeysDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-close').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('UpdateLogDialog（原 JSDOM 更新日志）', () => {
    it('renders dependency upgrade groups, fixes and verification results', () => {
        const wrapper = mount(UpdateLogDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const text = wrapper.text()
        expect(text).toContain('更新日志')
        expect(text).toContain('1.3.0 重大更新')
        expect(text).toContain('核心框架')
        expect(text).toContain('electron')
        expect(text).toContain('^43.0.0')
        expect(text).toContain('^43.8.10')
        expect(text).toContain('补丁')
        expect(text).toContain('移除')
        expect(text).toContain('代码适配修复')
        expect(text).toContain('验证结果')
        expect(text).toContain('TypeScript (main+preload): 0 错误')
        expect(text).toContain('白泽笔记 v1.3.0')
        // 4 个依赖分组各有一张表
        expect(wrapper.findAll('.upgrade-table')).toHaveLength(4)
    })

    it('emits close when the close button is clicked', async () => {
        const wrapper = mount(UpdateLogDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-close').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('ReleaseNotesDialog（原 JSDOM 版本发布说明）', () => {
    it('renders the release note selected by the version prop (1.2.2)', () => {
        const wrapper = mount(ReleaseNotesDialog, {
            ...dialogMountOptions,
            props: { visible: true, version: '1.2.2' }
        })
        const text = wrapper.text()
        expect(text).toContain('v1.2.2')
        expect(text).toContain('Electron 43 重大升级')
        expect(text).toContain('发布日期：2026-08-22')
        expect(text).toContain('Electron 38 → 43')
        expect(text).toContain('新功能')
        expect(text).toContain('问题修复')
        expect(text).toContain('优化改进')
        expect(text).toContain('技术栈')
        expect(text).toContain('白泽笔记 v1.2.2 · 2026-08-22')
    })

    it('renders the newest release note (1.3.5) with its features', () => {
        const wrapper = mount(ReleaseNotesDialog, {
            ...dialogMountOptions,
            props: { visible: true, version: '1.3.5' }
        })
        const text = wrapper.text()
        expect(text).toContain('1.3.5 菜鸟常用工具插件集成')
        expect(text).toContain('编解码：Base64 / URL / HTML 实体')
        expect(text).toContain('新增 154 个单元测试用例')
    })

    it('falls back to the not-found text for an unknown version', () => {
        const wrapper = mount(ReleaseNotesDialog, {
            ...dialogMountOptions,
            props: { visible: true, version: '9.9.9' }
        })
        expect(wrapper.text()).toContain('未找到版本 9.9.9 的发布说明')
        expect(wrapper.find('.section').exists()).toBe(false)
    })

    it('updates content when the version prop changes while open', async () => {
        const wrapper = mount(ReleaseNotesDialog, {
            ...dialogMountOptions,
            props: { visible: true, version: '1.2.2' }
        })
        expect(wrapper.text()).toContain('Electron 43 重大升级')
        await wrapper.setProps({ version: '1.3.5' })
        await nextTick()
        expect(wrapper.text()).toContain('1.3.5 菜鸟常用工具插件集成')
    })

    it('emits close when the close button is clicked', async () => {
        const wrapper = mount(ReleaseNotesDialog, {
            ...dialogMountOptions,
            props: { visible: true, version: '1.0.0' }
        })
        await wrapper.find('.btn-close').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})
