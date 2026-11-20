// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import WebUrlDialog from '@renderer/components/dialogs/simple/WebUrlDialog.vue'
import CreateFileFolderDialog from '@renderer/components/dialogs/simple/CreateFileFolderDialog.vue'
import MessageDialog from '@renderer/components/dialogs/simple/MessageDialog.vue'

// 对话框使用 <Teleport to="body">，测试时 stub 成内联渲染以便断言
const dialogMountOptions = {
    global: { stubs: { teleport: true } }
}

// P2 死代码清理：NewFileFolderDialog.vue 已删除（仅被已删聚合器 BaiZeDialogs.vue
// 与测试引用），其用例同步移除；文件/文件夹新建走 CreateFileFolderDialog。
// FE-27：Vue RenameDialog.vue 死轨（showRename 无调用方、父组件未绑定 @confirm）
// 已删除，实际重命名走主进程 HTML 对话框 ShowRenameDialog，其用例在本文件同步移除。

describe('WebUrlDialog', () => {
    it('does not render the overlay when visible is false', () => {
        const wrapper = mount(WebUrlDialog, { ...dialogMountOptions, props: { visible: false } })
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
    })

    it('disables the insert button while the URL is empty', async () => {
        const wrapper = mount(WebUrlDialog, { ...dialogMountOptions, props: { visible: true } })
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeDefined()
        await wrapper.find('input[placeholder^="请输入URL地址"]').setValue('https://example.com')
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeUndefined()
    })

    it('emits insert with the markdown link built from text and url', async () => {
        const wrapper = mount(WebUrlDialog, { ...dialogMountOptions, props: { visible: true } })
        await wrapper.find('input[placeholder="请输入链接显示文本"]').setValue('示例链接')
        await wrapper.find('input[placeholder^="请输入URL地址"]').setValue('https://example.com')
        await wrapper.find('.btn-confirm').trigger('click')

        expect(wrapper.emitted('insert')).toHaveLength(1)
        expect(wrapper.emitted('insert')![0][0]).toBe('[示例链接](https://example.com)')
    })

    it('uses the URL as link text when the text input is empty', async () => {
        const wrapper = mount(WebUrlDialog, { ...dialogMountOptions, props: { visible: true } })
        await wrapper.find('input[placeholder^="请输入URL地址"]').setValue('https://example.com')
        await wrapper.find('.btn-confirm').trigger('click')
        expect(wrapper.emitted('insert')![0][0]).toBe('[https://example.com](https://example.com)')
    })

    it('emits insert when pressing enter in the URL input', async () => {
        const wrapper = mount(WebUrlDialog, { ...dialogMountOptions, props: { visible: true } })
        const urlInput = wrapper.find('input[placeholder^="请输入URL地址"]')
        await urlInput.setValue('https://example.com')
        await urlInput.trigger('keyup.enter')
        expect(wrapper.emitted('insert')).toHaveLength(1)
    })
})

describe('CreateFileFolderDialog', () => {
    let invoke: ReturnType<typeof vi.fn>

    beforeEach(() => {
        invoke = vi.fn().mockResolvedValue('/selected/dir')
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('disables create buttons while the name is empty', async () => {
        const wrapper = mount(CreateFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        expect(wrapper.find('.btn-create-file').attributes('disabled')).toBeDefined()
        expect(wrapper.find('.btn-create-folder').attributes('disabled')).toBeDefined()

        await wrapper.find('input[placeholder="请输入名称"]').setValue('doc')
        expect(wrapper.find('.btn-create-file').attributes('disabled')).toBeUndefined()
        expect(wrapper.find('.btn-create-folder').attributes('disabled')).toBeUndefined()
    })

    it('selects a directory through IPC and shows it in the path input', async () => {
        const wrapper = mount(CreateFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-select-path').trigger('click')
        expect(invoke).toHaveBeenCalledWith('baize:file:select-directory')
        await wrapper.vm.$nextTick()
        expect((wrapper.find('.path-input').element as HTMLInputElement).value).toBe(
            '/selected/dir'
        )
    })

    it('emits create with type file, trimmed name and dir path', async () => {
        const wrapper = mount(CreateFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('input[placeholder="请输入名称"]').setValue('  notes.md  ')
        await wrapper.find('.btn-create-file').trigger('click')

        expect(wrapper.emitted('create')).toHaveLength(1)
        expect(wrapper.emitted('create')![0][0]).toEqual({
            type: 'file',
            name: 'notes.md',
            dirPath: ''
        })
    })

    it('emits create with type folder when clicking the folder button', async () => {
        const wrapper = mount(CreateFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('input[placeholder="请输入名称"]').setValue('my-folder')
        await wrapper.find('.btn-create-folder').trigger('click')

        expect(wrapper.emitted('create')).toHaveLength(1)
        expect(wrapper.emitted('create')![0][0]).toEqual({
            type: 'folder',
            name: 'my-folder',
            dirPath: ''
        })
    })

    it('resets the name and fills the dirPath prop when becoming visible', async () => {
        const wrapper = mount(CreateFileFolderDialog, {
            ...dialogMountOptions,
            props: { visible: false, dirPath: '/initial/dir' }
        })
        await wrapper.setProps({ visible: true })
        expect(
            (wrapper.find('input[placeholder="请输入名称"]').element as HTMLInputElement).value
        ).toBe('')
        expect((wrapper.find('.path-input').element as HTMLInputElement).value).toBe('/initial/dir')
    })
})

describe('MessageDialog', () => {
    it('renders the title and message text', () => {
        const wrapper = mount(MessageDialog, {
            ...dialogMountOptions,
            props: { visible: true, type: 'info', title: '提示', message: '这是一条消息' }
        })
        expect(wrapper.find('.title-text').text()).toBe('提示')
        expect(wrapper.find('.message-text').text()).toBe('这是一条消息')
        expect(wrapper.find('.dialog-container').classes()).toContain('info-dialog')
    })

    it('renders the success icon and color for type success', () => {
        const wrapper = mount(MessageDialog, {
            ...dialogMountOptions,
            props: { visible: true, type: 'success', title: '成功', message: '保存完成' }
        })
        expect(wrapper.find('.dialog-container').classes()).toContain('success-dialog')
        expect(wrapper.find('.message-icon circle').attributes('stroke')).toBe('#2ed573')
        // jsdom 会把样式属性中的 16 进制颜色归一化为 rgb() 形式
        expect(wrapper.find('.btn-confirm').attributes('style')).toContain(
            'background: rgb(46, 213, 115)'
        )
    })

    it('renders the error icon and color for type error', () => {
        const wrapper = mount(MessageDialog, {
            ...dialogMountOptions,
            props: { visible: true, type: 'error', title: '失败', message: '出错了' }
        })
        expect(wrapper.find('.dialog-container').classes()).toContain('error-dialog')
        expect(wrapper.find('.message-icon circle').attributes('stroke')).toBe('#ff4757')
    })

    it('emits close when clicking the confirm button', async () => {
        const wrapper = mount(MessageDialog, {
            ...dialogMountOptions,
            props: { visible: true, type: 'warning', title: '警告', message: '注意' }
        })
        await wrapper.find('.btn-confirm').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('emits close when clicking the close button', async () => {
        const wrapper = mount(MessageDialog, {
            ...dialogMountOptions,
            props: { visible: true, type: 'failed', title: '失败', message: '操作失败' }
        })
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    // P2 功能错误处理修复：宿主可经 footer-extra 插槽注入「重试」按钮（编码转换失败等），
    // 普通消息框不传插槽时外观/行为不变。
    it('renders host footer-extra slot content when provided (P2 retry button)', () => {
        const wrapper = mount(MessageDialog, {
            ...dialogMountOptions,
            props: { visible: true, type: 'error', title: '失败', message: '可重试的错误' },
            slots: {
                'footer-extra': '<button class="btn-retry-slot">重试</button>'
            }
        })
        expect(wrapper.find('.btn-retry-slot').exists()).toBe(true)
        expect(wrapper.find('.btn-confirm').exists()).toBe(true)
    })

    it('renders no extra footer button without the slot', () => {
        const wrapper = mount(MessageDialog, {
            ...dialogMountOptions,
            props: { visible: true, type: 'info', title: '提示', message: '普通消息' }
        })
        expect(wrapper.find('.btn-retry-slot').exists()).toBe(false)
        expect(wrapper.findAll('.btn-confirm')).toHaveLength(1)
    })
})
