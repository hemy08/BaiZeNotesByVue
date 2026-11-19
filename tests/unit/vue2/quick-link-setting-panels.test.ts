// @vitest-environment jsdom
/**
 * 设置对话框二期拆分 —— QuickLinkSettingDialog 子组件 + composable 契约单测
 *
 * 覆盖点：
 * 1. QuickLinkList：props 只读渲染、选中态、选中/新增/编辑/删除事件索引与 .stop 语义；
 * 2. QuickLinkForm：编辑回填、图标默认值、save/cancel 事件载荷（不直接改父级草稿）；
 * 3. useQuickLinkSettingForm：
 *    - 打开时从主进程 QUICK_LINKS.GET 读取并映射为对话框 Link（path→url / iconContent→icon）；
 *    - 异步读取迟到时不得覆盖用户已做的增删（userModifiedSinceOpen 竞态保护）；
 *    - 新增/编辑/删除/取消回滚；编辑未改图标时保留主进程原始 source；
 *    - saveLinksToMain：SUCCESS 返回 true、ok:false / 抛异常返回 false；
 *    - snapshotLinks：深拷贝载荷，emit 后修改不影响草稿。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

import QuickLinkList from '@renderer/components/dialogs/help/quick-link-setting/QuickLinkList.vue'
import QuickLinkForm from '@renderer/components/dialogs/help/quick-link-setting/QuickLinkForm.vue'
import { useQuickLinkSettingForm } from '@renderer/components/dialogs/help/quick-link-setting/useQuickLinkSettingForm'
import type { Link } from '@renderer/components/dialogs/help/quick-link-setting/model'
import { IPC } from '../../../src/shared/ipc-channels'
import type { QuickLinkItem } from '../../../src/shared/types'

const SAMPLE_LINKS: Link[] = [
    { name: 'GitHub', url: 'https://github.com', icon: '🐙', description: '' },
    { name: 'Google', url: 'https://google.com', icon: '🔍', description: '' }
]

/** 主进程侧 QuickLinkItem（含对话框不可编辑字段） */
function makeMainItem(overrides: Partial<QuickLinkItem> = {}): QuickLinkItem {
    return {
        id: 'github',
        name: 'GitHub',
        type: 'url',
        path: 'https://github.com',
        icon: 'emoji',
        iconContent: '🐙',
        enabled: true,
        order: 1,
        position: 'left',
        ...overrides
    }
}

describe('QuickLinkList（快捷链接列表子组件）', () => {
    it('按 props 渲染链接并标记选中项', () => {
        const wrapper = mount(QuickLinkList, {
            props: { links: SAMPLE_LINKS, selectedIndex: 1 }
        })
        const items = wrapper.findAll('.link-item')
        expect(items).toHaveLength(2)
        expect(items[0].text()).toContain('GitHub')
        expect(items[1].classes()).toContain('selected')
        expect(items[0].classes()).not.toContain('selected')
        // 不直接修改 props
        expect(SAMPLE_LINKS[0].name).toBe('GitHub')
    })

    it('选中/新增/编辑/删除均只 emit 事件（操作按钮不冒泡为选中）', async () => {
        const wrapper = mount(QuickLinkList, {
            props: { links: SAMPLE_LINKS, selectedIndex: -1 }
        })
        await wrapper.findAll('.link-item')[0].trigger('click')
        expect(wrapper.emitted('select')).toEqual([[0]])

        await wrapper.findAll('.link-item')[1].trigger('click')
        expect(wrapper.emitted('select')![1]).toEqual([1])

        await wrapper.find('.add-btn').trigger('click')
        expect(wrapper.emitted('add')).toHaveLength(1)

        await wrapper.findAll('.link-item')[0].findAll('.action-btn')[0].trigger('click')
        expect(wrapper.emitted('edit')).toEqual([[0]])
        // .stop：编辑/删除按钮点击不应再触发选中
        expect(wrapper.emitted('select')).toHaveLength(2)

        await wrapper.findAll('.link-item')[1].findAll('.action-btn')[1].trigger('click')
        expect(wrapper.emitted('delete')).toEqual([[1]])
        expect(wrapper.emitted('select')).toHaveLength(2)
    })
})

describe('QuickLinkForm（快捷链接编辑表单子组件）', () => {
    it('编辑态回填初始值并显示编辑标题，保存时 emit 表单草稿', async () => {
        const wrapper = mount(QuickLinkForm, {
            props: { initial: SAMPLE_LINKS[0], isEditing: true }
        })
        expect(wrapper.find('h3').text()).toBe('编辑链接')
        const inputs = wrapper.findAll('.form-input')
        expect((inputs[0].element as HTMLInputElement).value).toBe('GitHub')
        expect((inputs[1].element as HTMLInputElement).value).toBe('https://github.com')

        await inputs[0].setValue('GitHub 镜像')
        await wrapper.find('.form-textarea').setValue('镜像站')
        await wrapper.find('.btn-primary').trigger('click')
        expect(wrapper.emitted('save')).toEqual([
            [
                {
                    name: 'GitHub 镜像',
                    url: 'https://github.com',
                    icon: '🐙',
                    description: '镜像站'
                }
            ]
        ])
    })

    it('新增态为空草稿 + 默认图标，取消时 emit cancel', async () => {
        const wrapper = mount(QuickLinkForm, { props: { isEditing: false } })
        expect(wrapper.find('h3').text()).toBe('添加链接')
        const inputs = wrapper.findAll('.form-input')
        expect((inputs[0].element as HTMLInputElement).value).toBe('')
        expect((inputs[2].element as HTMLInputElement).value).toBe('🌐')

        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('cancel')).toHaveLength(1)
        expect(wrapper.emitted('save')).toBeUndefined()
    })
})

describe('useQuickLinkSettingForm（共享草稿 composable）', () => {
    let invoke: ReturnType<typeof vi.fn>

    beforeEach(() => {
        invoke = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    /** 在最小宿主组件中执行 composable（setup 同步完成，可直接持有返回值） */
    function mountForm(): ReturnType<typeof useQuickLinkSettingForm> {
        let form!: ReturnType<typeof useQuickLinkSettingForm>
        const Host = defineComponent({
            setup() {
                form = useQuickLinkSettingForm()
                return () => null
            }
        })
        const wrapper = mount(Host)
        wrapper.unmount()
        return form
    }

    it('打开时从主进程读取并映射为对话框 Link（path→url / iconContent→icon / svg 占位）', async () => {
        invoke.mockResolvedValueOnce([
            makeMainItem(),
            makeMainItem({
                id: 'svg-link',
                name: 'SVG 链接',
                path: 'https://svg.example.com',
                icon: 'svg',
                iconContent: '<svg/>'
            })
        ])
        const form = mountForm()
        await form.loadLinksOnOpen()

        expect(invoke).toHaveBeenCalledWith(IPC.QUICK_LINKS.GET)
        expect(form.links.value).toHaveLength(2)
        expect(form.links.value[0]).toMatchObject({
            name: 'GitHub',
            url: 'https://github.com',
            icon: '🐙'
        })
        expect(form.links.value[0].source?.id).toBe('github')
        // svg 图标在对话框内以通用图标占位，原始项保留在 source
        expect(form.links.value[1].icon).toBe('🔗')
    })

    it('异步读取迟到时不得覆盖用户已做的增删改，但取消快照以打开时数据源为准', async () => {
        let resolveGet!: (value: QuickLinkItem[]) => void
        invoke.mockImplementationOnce(
            () => new Promise<QuickLinkItem[]>((resolve) => (resolveGet = resolve))
        )
        const form = mountForm()
        const pending = form.loadLinksOnOpen()

        // 读取返回前用户先删除一条
        form.deleteLink(0)
        expect(form.links.value).toHaveLength(2)

        resolveGet([makeMainItem(), makeMainItem({ id: 'second', name: '第二条' })])
        await pending

        // 迟到的读取结果不得覆盖用户操作
        expect(form.links.value).toHaveLength(2)
        expect(form.links.value[0].name).toBe('Google')
        expect(form.links.value.some((link) => link.name === '第二条')).toBe(false)

        // 取消回滚到「打开时的数据源状态」
        form.resetLinks()
        expect(form.links.value.map((link) => link.name)).toEqual(['GitHub', '第二条'])
    })

    it('新增/编辑/删除/取消回滚，编辑未改图标时保留主进程原始 source', async () => {
        invoke.mockResolvedValueOnce([makeMainItem()])
        const form = mountForm()
        await form.loadLinksOnOpen()

        // 新增：空图标回退默认 🌐
        form.openAddForm()
        expect(form.showForm.value).toBe(true)
        form.submitForm({ name: '知乎', url: 'https://www.zhihu.com', icon: '', description: '' })
        expect(form.showForm.value).toBe(false)
        expect(form.links.value).toHaveLength(2)
        expect(form.links.value[1]).toMatchObject({ name: '知乎', icon: '🌐' })

        // 编辑：仅改名称，保留 source（id/enabled/position 往返不丢失）
        form.openEditForm(0)
        expect(form.editingLink.value?.name).toBe('GitHub')
        form.submitForm({
            name: 'GitHub 镜像',
            url: 'https://github.com',
            icon: '🐙',
            description: ''
        })
        expect(form.links.value[0].name).toBe('GitHub 镜像')
        expect(form.links.value[0].source?.id).toBe('github')

        // 删除后取消回滚到打开时快照
        form.deleteLink(0)
        expect(form.links.value).toHaveLength(1)
        form.resetLinks()
        expect(form.links.value).toHaveLength(1)
        expect(form.links.value[0].name).toBe('GitHub')
    })

    it('名称或 URL 为空时提交被拒绝且表单保持打开', () => {
        const form = mountForm()
        form.openAddForm()
        form.submitForm({ name: '', url: 'https://x.example.com', icon: '🌐', description: '' })
        form.submitForm({ name: '有名称', url: '', icon: '🌐', description: '' })
        expect(form.links.value).toHaveLength(3)
        expect(form.showForm.value).toBe(true)
    })

    it('保存成功返回 true 并提交主进程形状；ok:false / 抛异常返回 false', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockResolvedValueOnce([makeMainItem()])
        const form = mountForm()
        await form.loadLinksOnOpen()

        invoke.mockResolvedValueOnce({ ok: true })
        expect(await form.saveLinksToMain()).toBe(true)
        expect(invoke).toHaveBeenLastCalledWith(
            IPC.QUICK_LINKS.SAVE,
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'github',
                    type: 'url',
                    path: 'https://github.com',
                    icon: 'emoji',
                    iconContent: '🐙'
                })
            ])
        )

        invoke.mockResolvedValueOnce({ ok: false, reason: 'invalid-payload' })
        expect(await form.saveLinksToMain()).toBe(false)
        expect(errorSpy).toHaveBeenCalled()

        invoke.mockRejectedValueOnce(new Error('主进程不可用'))
        expect(await form.saveLinksToMain()).toBe(false)
        expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('snapshotLinks 返回深拷贝（emit 后修改载荷不影响草稿）', async () => {
        const form = mountForm()
        const snapshot = form.snapshotLinks()
        expect(snapshot).toHaveLength(3)
        snapshot[0].name = '被外部修改'
        snapshot.pop()
        expect(form.links.value[0].name).toBe('GitHub')
        expect(form.links.value).toHaveLength(3)
    })
})
