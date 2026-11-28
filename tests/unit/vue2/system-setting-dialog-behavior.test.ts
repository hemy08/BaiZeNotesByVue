// @vitest-environment jsdom
/**
 * 系统设置对话框行为基线（设置页拆分 P0：拆分前后等价的行为契约）
 *
 * 覆盖点（只断言用户可见行为 / 对外 emit / IPC 载荷，不依赖组件内部状态形状）：
 * 1. 6 个页签 × 6 个面板的切换（active 类与 v-show 可见性同步）；
 * 2. 草稿语义：修改不落盘、跨页签保留、取消丢弃并恢复打开时的值；
 * 3. 保存语义：应用写入完整快照并 emit apply（不关闭）；确定 apply + close；
 *    取消不写配置；写入被主进程拒绝（返回 false）时不抛异常、不改变既有 emit 契约；
 * 4. 加载语义：打开时读取 system 配置并把值映射到 5 个面板（含语言历史值归一化）；
 *    首挂即打开（lazyDialog 首次打开才挂载、挂载时 visible 已为 true）也要回填；
 *    加载失败回退默认值并记录错误；重复打开重新加载；
 * 5. 保存/校验失败契约：自动保存 IPC 返回 ok:false 时弹错误提示并回滚开关（不再静默）。
 *
 * 该文件在「拆分前单文件」与「拆分后壳层 + 4 panel + composable」两种结构下都必须通过。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import SystemSettingDialog from '@renderer/components/dialogs/complex/SystemSettingDialog.vue'
import {
    createDefaultSystemDialogSettings,
    type SystemDialogSettings
} from '@renderer/components/dialogs/complex/system-setting/model'
// P2 功能错误处理修复：保存失败断言（全局消息对话框 + 错误文案走 i18n）
import { getConfigStore } from '@renderer/common/useConfigStore'
import { t } from '@renderer/common/i18n'
// P2 剩余静默失败提示（本批）：失败提示节流复位（自动保存开关同步防刷屏）
import { resetActionFailureThrottleForTesting } from '@renderer/common/action-feedback'

const dialogMountOptions = { global: { stubs: { teleport: true } } }

/** 面板在 DOM 中的固定顺序（与侧边栏 6 项 1:1，拆分前后一致） */
const PANEL_ORDER = ['general', 'file', 'appearance', 'features', 'writing', 'backup'] as const

function mountDialog(visible = true): VueWrapper {
    return mount(SystemSettingDialog, {
        ...dialogMountOptions,
        props: { visible }
    }) as VueWrapper
}

/** 打开对话框（watch 仅在 visible 变为 true 时加载配置，故先挂载 false 再打开） */
async function openDialog(wrapper: VueWrapper): Promise<void> {
    await wrapper.setProps({ visible: true })
    await flushPromises()
}

function panel(wrapper: VueWrapper, index: number) {
    return wrapper.findAll('.setting-panel')[index]
}

/**
 * 面板可见性断言。
 *
 * 不用 `isVisible()`：jsdom 对「挂载在游离 DOM 树中的元素」的 getComputedStyle 会缓存
 * 首次结果（VTU isVisible 依赖 computed style），同一元素二次断言会读到旧值；这里直接
 * 读取 v-show 写入的行内 display，拆分前后（v-show 保留在壳层）语义一致且稳定。
 */
function isPanelShown(wrapper: VueWrapper, index: number): boolean {
    const style = panel(wrapper, index).attributes('style') ?? ''
    return !style.includes('display: none')
}

async function switchPanel(wrapper: VueWrapper, index: number): Promise<void> {
    await wrapper.findAll('.sidebar-item')[index].trigger('click')
    await flushPromises()
}

/** 读取默认值（期望值真源与组件一致，避免测试里再抄一份 18 字段默认值） */
function defaults(): SystemDialogSettings {
    return createDefaultSystemDialogSettings()
}

describe('SystemSettingDialog 行为基线（拆分等价契约）', () => {
    let configWrite: ReturnType<typeof vi.fn>
    let configRead: ReturnType<typeof vi.fn>
    let send: ReturnType<typeof vi.fn>
    let invoke: ReturnType<typeof vi.fn>

    beforeEach(() => {
        configWrite = vi.fn().mockResolvedValue(true)
        configRead = vi
            .fn()
            .mockImplementation((name: string) =>
                Promise.resolve(name === 'backup' ? { backups: [], latest: null } : {})
            )
        send = vi.fn()
        invoke = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('api', { config: { write: configWrite, read: configRead } })
        vi.stubGlobal('electron', { ipcRenderer: { send, invoke } })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('渲染 6 个侧边栏项与 6 个面板，默认仅通用设置面板可见', () => {
        const wrapper = mountDialog()
        expect(wrapper.findAll('.sidebar-item')).toHaveLength(6)
        expect(wrapper.findAll('.setting-panel')).toHaveLength(6)
        expect(wrapper.findAll('.sidebar-item')[0].classes()).toContain('active')
        expect(isPanelShown(wrapper, 0)).toBe(true)
        for (const index of [1, 2, 3, 4, 5]) {
            expect(isPanelShown(wrapper, index)).toBe(false)
        }
        wrapper.unmount()
    })

    it('点击侧边栏逐页签切换面板：active 类与可见性同步', async () => {
        const wrapper = mountDialog()
        for (const [index, id] of PANEL_ORDER.entries()) {
            await switchPanel(wrapper, index)
            const items = wrapper.findAll('.sidebar-item')
            items.forEach((item, itemIndex) => {
                expect(item.classes().includes('active'), `${id} 侧边栏项 active`).toBe(
                    itemIndex === index
                )
            })
            for (const other of PANEL_ORDER.keys()) {
                expect(isPanelShown(wrapper, other), `切到 ${id} 后面板 ${other} 可见性`).toBe(
                    other === index
                )
            }
        }
        wrapper.unmount()
    })

    it('草稿修改不落盘、跨页签保留（应用前 config.write 未被调用）', async () => {
        const wrapper = mountDialog()

        // 通用：语言下拉改为英文
        await panel(wrapper, 0).find('select.setting-select').setValue('en-US')
        // 文件：关闭自动保存（会触发运行时 IPC，但不写配置）
        await switchPanel(wrapper, 1)
        await panel(wrapper, 1).findAll('.setting-checkbox')[0].setValue(false)
        // 外观：字体大小改为 16
        await switchPanel(wrapper, 2)
        await panel(wrapper, 2).find('input[type="number"]').setValue('16')
        // 备份：保留数量改为 3
        await switchPanel(wrapper, 5)
        await panel(wrapper, 5).find('input[max="10"]').setValue('3')

        expect(configWrite).not.toHaveBeenCalled()

        // 切回各面板，草稿值仍在（共享同一份草稿状态，而非各面板各存一份）
        await switchPanel(wrapper, 0)
        expect(
            (panel(wrapper, 0).find('select.setting-select').element as HTMLSelectElement).value
        ).toBe('en-US')
        await switchPanel(wrapper, 1)
        expect(
            (panel(wrapper, 1).findAll('.setting-checkbox')[0].element as HTMLInputElement).checked
        ).toBe(false)
        await switchPanel(wrapper, 2)
        expect(
            (panel(wrapper, 2).find('input[type="number"]').element as HTMLInputElement).value
        ).toBe('16')
        await switchPanel(wrapper, 4)
        expect((panel(wrapper, 5).find('input[max="10"]').element as HTMLInputElement).value).toBe(
            '3'
        )

        wrapper.unmount()
    })

    it('应用：写入完整快照并 emit apply，且不关闭对话框', async () => {
        const wrapper = mountDialog()
        // 通用：语言 en-US + 允许远程图片（隐私开关）
        await panel(wrapper, 0).find('select.setting-select').setValue('en-US')
        const generalCheckboxes = panel(wrapper, 0).findAll('.setting-checkbox')
        await generalCheckboxes[5].setValue(true)
        // 外观：字体大小 16
        await switchPanel(wrapper, 2)
        await panel(wrapper, 2).find('input[type="number"]').setValue('16')
        // 备份：保留数量 3
        await switchPanel(wrapper, 4)
        await panel(wrapper, 5).find('input[max="10"]').setValue('3')

        await wrapper.find('.btn-apply').trigger('click')
        await flushPromises()

        const expected: SystemDialogSettings = {
            ...defaults(),
            language: 'en-US',
            allowRemoteImages: true,
            fontSize: 16,
            backupCount: 3
        }
        expect(configWrite).toHaveBeenCalledTimes(1)
        expect(configWrite).toHaveBeenCalledWith('system', expected)
        // 快照字段既不多也不少（不把主进程内部字段带入提交载荷）
        expect(Object.keys(configWrite.mock.calls[0][1]).sort()).toEqual(
            Object.keys(expected).sort()
        )
        expect(wrapper.emitted('apply')).toHaveLength(1)
        expect(wrapper.emitted('apply')![0][0]).toEqual(expected)
        // 「应用」只保存，不关闭
        expect(wrapper.emitted('close')).toBeUndefined()

        wrapper.unmount()
    })

    it('确定：写入配置后同时 emit apply 与 close', async () => {
        const wrapper = mountDialog()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(configWrite).toHaveBeenCalledTimes(1)
        expect(configWrite).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ language: 'zh-CN' })
        )
        expect(wrapper.emitted('apply')).toHaveLength(1)
        expect(wrapper.emitted('close')).toHaveLength(1)

        wrapper.unmount()
    })

    it('功能页签：11 个可选能力（新增非模态工具对话框默认开启），开启后随保存写入 system 配置', async () => {
        const wrapper = mountDialog()
        await switchPanel(wrapper, 3)

        const allCheckboxes = panel(wrapper, 3).findAll('.setting-checkbox')
        // 1.5.7 LLM Wiki L2：功能页签新增「MCP 服务」开关（第 12 个 checkbox，不写入设置草稿，
        // 由 IPC.MCP.SET_ENABLED 立即生效），能力开关仍为 11 项。
        // 1.5.7 LLM Wiki L3：新增「AI 助手」启用开关（第 13 个 checkbox，独立经 AI.SAVE_CONFIG
        // 立即保存，同样不写设置草稿），能力开关仍为 11 项。
        expect(allCheckboxes).toHaveLength(13)
        const checkboxes = allCheckboxes.filter((checkbox) =>
            (checkbox.attributes('id') ?? '').startsWith('feature-')
        )
        expect(checkboxes).toHaveLength(11)
        for (const [index, checkbox] of checkboxes.entries()) {
            // 最后一项 nonModalDialogs 默认开启
            expect((checkbox.element as HTMLInputElement).checked).toBe(index === 10)
        }

        // 开启第一项（多标签/会话恢复）
        await checkboxes[0].setValue(true)
        await wrapper.find('.btn-apply').trigger('click')
        await flushPromises()

        expect(configWrite).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ featureTabs: true })
        )

        wrapper.unmount()
    })

    it('编写体验页签：9 项写作能力默认关闭，开启后随保存写入 system 配置', async () => {
        const wrapper = mountDialog()
        await switchPanel(wrapper, 4)

        const checkboxes = panel(wrapper, 4).findAll('.setting-checkbox')
        expect(checkboxes).toHaveLength(9)
        for (const checkbox of checkboxes) {
            expect((checkbox.element as HTMLInputElement).checked).toBe(false)
        }

        // 开启第一项（写作模式）
        await checkboxes[0].setValue(true)
        await wrapper.find('.btn-apply').trigger('click')
        await flushPromises()

        expect(configWrite).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ writingModeEnabled: true })
        )

        wrapper.unmount()
    })

    it('取消：丢弃草稿、不写配置、恢复打开时的值并 emit close', async () => {
        const wrapper = mountDialog()
        // 首开回填修复：挂载即异步加载持久化配置，先等初始加载完成再模拟用户修改
        await flushPromises()
        await panel(wrapper, 0).find('select.setting-select').setValue('en-US')
        await wrapper.find('.btn-cancel').trigger('click')
        await flushPromises()

        expect(configWrite).not.toHaveBeenCalled()
        expect(wrapper.emitted('close')).toHaveLength(1)
        expect(
            (panel(wrapper, 0).find('select.setting-select').element as HTMLSelectElement).value
        ).toBe('zh-CN')

        wrapper.unmount()
    })

    it('外观页签：界面风格/密度/减少透明随保存写入 system 配置（视觉升级 P0）', async () => {
        const wrapper = mountDialog()
        await flushPromises()
        await switchPanel(wrapper, 2)

        await panel(wrapper, 2).find('[data-testid="ui-style-select"]').setValue('hybrid')
        await panel(wrapper, 2).find('[data-testid="ui-density-select"]').setValue('compact')
        await panel(wrapper, 2).find('[data-testid="ui-reduce-transparency"]').setValue(true)
        await wrapper.find('.btn-apply').trigger('click')
        await flushPromises()

        expect(configWrite).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({
                uiStyle: 'hybrid',
                uiDensity: 'compact',
                uiReduceTransparency: true
            })
        )
        wrapper.unmount()
    })

    it('打开时加载 system 配置并映射到 6 个面板（含语言历史值归一化）', async () => {
        configRead.mockImplementation((name: string) => {
            if (name === 'backup') {
                return Promise.resolve({ backups: [], latest: null })
            }
            if (name === 'theme') {
                return Promise.resolve({ currentTheme: 'dark' })
            }
            return Promise.resolve({
                language: 'en-us',
                fontSize: 16,
                autoSaveEnabled: false,
                autoSaveInterval: 120,
                recentFilesCount: 12,
                defaultFilePath: 'D:\\notes',
                enableAutoBackup: true,
                backupInterval: 12,
                backupCount: 3,
                allowRemoteImages: true,
                useSystemTheme: true
            })
        })
        invoke.mockImplementation((channel: string) =>
            Promise.resolve(
                channel === 'baize:theme:get-all'
                    ? [{ type: 'dark', styles: { name: '深邃夜空' } }]
                    : { ok: true }
            )
        )

        const wrapper = mountDialog(false)
        await openDialog(wrapper)

        // 通用面板：语言值归一化为下拉选项值，隐私开关加载
        expect(
            (panel(wrapper, 0).find('select.setting-select').element as HTMLSelectElement).value
        ).toBe('en-US')
        expect(
            (panel(wrapper, 0).findAll('.setting-checkbox')[5].element as HTMLInputElement).checked
        ).toBe(true)

        // 文件面板：自动保存关闭、最近文件数量与默认路径加载
        await switchPanel(wrapper, 1)
        expect(
            (panel(wrapper, 1).findAll('.setting-checkbox')[0].element as HTMLInputElement).checked
        ).toBe(false)
        expect((panel(wrapper, 1).find('input[min="5"]').element as HTMLInputElement).value).toBe(
            '12'
        )
        expect(
            (panel(wrapper, 1).find('.path-input-group input').element as HTMLInputElement).value
        ).toBe('D:\\notes')

        // 外观面板：只读主题显示名、跟随系统主题、字体大小
        await switchPanel(wrapper, 2)
        expect(panel(wrapper, 2).find('.theme-current-name').text()).toBe('深邃夜空')
        expect(
            (panel(wrapper, 2).find('.setting-checkbox').element as HTMLInputElement).checked
        ).toBe(true)
        expect(
            (panel(wrapper, 2).find('input[type="number"]').element as HTMLInputElement).value
        ).toBe('16')

        // 备份面板：自动备份、间隔、保留数量
        await switchPanel(wrapper, 4)
        expect(
            (panel(wrapper, 5).find('.setting-checkbox').element as HTMLInputElement).checked
        ).toBe(true)
        expect((panel(wrapper, 5).find('input[max="72"]').element as HTMLInputElement).value).toBe(
            '12'
        )
        expect((panel(wrapper, 5).find('input[max="10"]').element as HTMLInputElement).value).toBe(
            '3'
        )

        wrapper.unmount()
    })

    /**
     * 首开回填回归（P0 缺陷）：对话框经 lazyDialog 包装，**首次打开时组件才挂载**，
     * 挂载时 props.visible 已经是 true。若 visible watch 未设置 immediate，首次挂载不会
     * 触发 loadSettings()，首开展示默认值、第二次打开才回填（E2E settings-persistence
     * 的 test.fixme 即由此而来）。本用例直接以「挂载时 visible=true」复现 lazyDialog 首开，
     * 断言持久化值在首次挂载后即可见。
     */
    it('首次挂载即为打开状态（lazyDialog 首开）时立即回填持久化值', async () => {
        configRead.mockImplementation((name: string) => {
            if (name === 'backup') {
                return Promise.resolve({ backups: [], latest: null })
            }
            if (name === 'theme') {
                return Promise.resolve({ currentTheme: 'baize' })
            }
            return Promise.resolve({
                autoOpenLastFile: true,
                autoOpenLastFolder: true,
                language: 'en-us',
                fontSize: 16,
                allowRemoteImages: true
            })
        })

        // 直接挂载 visible=true = lazyDialog 首次打开（模块加载完成后以 true 挂载）
        const wrapper = mountDialog(true)
        await flushPromises()

        // 通用面板：启动自动打开的持久化开关已回填
        expect(
            (panel(wrapper, 0).findAll('.setting-checkbox')[0].element as HTMLInputElement).checked
        ).toBe(true)
        expect(
            (panel(wrapper, 0).findAll('.setting-checkbox')[1].element as HTMLInputElement).checked
        ).toBe(true)
        // 语言历史值归一化同样在首开生效
        expect(
            (panel(wrapper, 0).find('select.setting-select').element as HTMLSelectElement).value
        ).toBe('en-US')
        // 外观面板：字体大小持久化值已回填（默认值为 13，持久化值为 16）
        await switchPanel(wrapper, 2)
        expect(
            (panel(wrapper, 2).find('input[type="number"]').element as HTMLInputElement).value
        ).toBe('16')

        wrapper.unmount()
    })

    it('加载后取消恢复到「打开时加载值」而非硬编码默认值', async () => {
        configRead.mockImplementation((name: string) =>
            Promise.resolve(name === 'backup' ? { backups: [], latest: null } : { fontSize: 16 })
        )
        const wrapper = mountDialog(false)
        await openDialog(wrapper)
        await switchPanel(wrapper, 2)
        expect(
            (panel(wrapper, 2).find('input[type="number"]').element as HTMLInputElement).value
        ).toBe('16')

        await panel(wrapper, 2).find('input[type="number"]').setValue('18')
        await wrapper.find('.btn-cancel').trigger('click')
        await flushPromises()

        expect(
            (panel(wrapper, 2).find('input[type="number"]').element as HTMLInputElement).value
        ).toBe('16')
        wrapper.unmount()
    })

    it('重新打开时重新加载配置（visible false → true）', async () => {
        configRead.mockImplementation((name: string) =>
            Promise.resolve(name === 'backup' ? { backups: [], latest: null } : { fontSize: 15 })
        )
        const wrapper = mountDialog(false)
        await openDialog(wrapper)
        await switchPanel(wrapper, 2)
        expect(
            (panel(wrapper, 2).find('input[type="number"]').element as HTMLInputElement).value
        ).toBe('15')

        await wrapper.setProps({ visible: false })
        configRead.mockImplementation((name: string) =>
            Promise.resolve(name === 'backup' ? { backups: [], latest: null } : { fontSize: 19 })
        )
        await openDialog(wrapper)
        expect(
            (panel(wrapper, 2).find('input[type="number"]').element as HTMLInputElement).value
        ).toBe('19')

        wrapper.unmount()
    })

    it('加载失败：回退默认值并记录错误，不崩溃', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configRead.mockImplementation((name: string) =>
            name === 'system'
                ? Promise.reject(new Error('配置不可读'))
                : Promise.resolve({ backups: [], latest: null })
        )
        const wrapper = mountDialog(false)
        await openDialog(wrapper)

        expect(errorSpy).toHaveBeenCalledWith('加载系统设置失败:', expect.any(Error))
        expect(
            (panel(wrapper, 0).find('select.setting-select').element as HTMLSelectElement).value
        ).toBe('zh-CN')
        expect(wrapper.find('.setting-panel').exists()).toBe(true)
        wrapper.unmount()
    })

    // 校验失败契约（渲染层，P2 功能错误处理修复后更新）：主进程 config:write 经 AS-4
    // config-schema 校验拒绝时返回 false（而非抛异常）。修复前为 fire-and-forget——
    // 仍然 emit apply/close，用户以为已保存；修复后 **await 结果并弹错误提示**，
    // 不 emit apply、不关闭对话框（草稿不丢，用户可修正后原地重试）。
    it('保存被主进程拒绝（write 返回 false）时：弹错误提示且不 emit apply/close，恢复后可重试', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configWrite.mockResolvedValue(false)
        const wrapper = mountDialog()
        await flushPromises()

        await wrapper.find('.btn-apply').trigger('click')
        await flushPromises()
        // 保存尝试发生，但失败后不按「已保存」处理
        expect(configWrite).toHaveBeenCalledTimes(1)
        expect(wrapper.emitted('apply')).toBeUndefined()
        expect(wrapper.emitted('close')).toBeUndefined()
        // 失败有用户可见提示（全局消息对话框，标题为系统设置保存失败）
        const store = getConfigStore()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.title).toBe(
            t('dialogRenderer.systemSetting.saveFailedTitle')
        )
        expect(store.dialogs.messageDialog.message).toContain(
            t('workspace.config.writeReturnedFalse')
        )
        expect(errorSpy).toHaveBeenCalled()
        store.hideDialog('message')

        // 失败后对话框保持打开；主进程恢复后「确定」可正常保存并关闭（可重试）
        configWrite.mockResolvedValue(true)
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()
        expect(wrapper.emitted('apply')).toHaveLength(1)
        expect(wrapper.emitted('close')).toHaveLength(1)

        wrapper.unmount()
    })

    // 校验失败契约（自动保存运行时通道，P2 剩余静默失败提示）：主进程返回 { ok:false }
    // 时渲染层此前只记日志（开关保持操作后的状态，主进程定时器未同步且用户无感知）。
    // 修复后：弹错误对话框 + 回滚开关到操作前状态（可重试），不抛出、不崩溃。
    it('自动保存 IPC 返回 ok:false 时弹错误提示并回滚开关', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        resetActionFailureThrottleForTesting()
        // 首开回填修复后，挂载即会经 invoke 读取主题显示名（同一通道）；
        // 这里按通道返回 { ok:false }，避免挂载阶段消费掉一次性 mock。
        invoke.mockImplementation((channel: string) =>
            Promise.resolve(
                channel === 'baize:setting:auto-save-changed'
                    ? { ok: false, reason: 'invalid-payload' }
                    : undefined
            )
        )
        const wrapper = mountDialog()
        await flushPromises()
        await switchPanel(wrapper, 1)
        const autoSave = panel(wrapper, 1).findAll('.setting-checkbox')[0]
        // 2026-11-20：自动保存默认关闭（opt-in），此处操作改为开启
        await autoSave.setValue(true)
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith('baize:setting:auto-save-changed', {
            autoSaveEnabled: true,
            autoSaveInterval: 60
        })
        expect(errorSpy).toHaveBeenCalledWith(
            '同步自动保存设置失败:',
            expect.objectContaining({ message: 'invalid-payload' })
        )
        // 用户可见反馈：错误对话框（标题/正文走 i18n）
        const store = getConfigStore()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.title).toBe(
            t('dialogRenderer.systemSetting.autoSaveSyncFailedTitle')
        )
        expect(store.dialogs.messageDialog.message).toContain('invalid-payload')
        store.hideDialog('message')
        // 回滚开关到操作前状态（默认关闭），界面不误导用户
        expect((autoSave.element as HTMLInputElement).checked).toBe(false)

        wrapper.unmount()
    })
})
