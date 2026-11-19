import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isProxy } from 'vue'

// 该模块通过 window.api.config 读写配置，测试中替换 window
import {
    getConfigStore,
    useConfigStore,
    defaultThemeConfig,
    defaultEditorConfig,
    defaultQuickLinksConfig,
    CONFIG_SAVE_DEBOUNCE_MS,
    flushConfigWrites
} from '../../src/renderer/src/common/useConfigStore'
// 2026-11-19 重构：DEFAULT_* 唯一真源为 shared/constants/urls.ts
// （main/constants/urls.ts 现仅为 re-export 门面，useConfigStore 亦直接引用 shared），
// 故此处断言改为对齐真源模块，覆盖不弱化。
import {
    DEFAULT_GITHUB,
    DEFAULT_GOOGLE,
    DEFAULT_STACKOVERFLOW
} from '../../src/shared/constants/urls'

// 假配置读写 API
const configApi = {
    read: vi.fn(),
    write: vi.fn()
}

// 重置所有配置与对话框状态
function resetStoreState() {
    const store = getConfigStore()
    store.themeConfig.value = { ...defaultThemeConfig }
    store.editorConfig.value = { ...defaultEditorConfig }
    store.quickLinksConfig.value = { ...defaultQuickLinksConfig }
    store.isLoading.value = false

    // 逐项重置对话框状态。
    // dialogs 是「各对话框状态对象」的联合类型：用循环遍历 key 再访问差异字段时 TS
    // 无法把 key 与具体成员关联（TS2339），故差异字段改为显式成员访问，循环只统一重置 visible。
    const dialogs = store.dialogs
    dialogs.messageDialog.visible = false
    dialogs.messageDialog.type = 'success'
    dialogs.messageDialog.title = ''
    dialogs.messageDialog.message = ''
    dialogs.importOption.visible = false
    dialogs.importOption.content = undefined

    // 第 4 批 P3：admonition 已删除 data 死字段（主进程从不发送、零消费方），
    // 现在与其他普通对话框一样只需在下方循环中统一重置 visible。
    for (const key of Object.keys(dialogs) as (keyof typeof dialogs)[]) {
        if (key === 'messageDialog' || key === 'importOption') {
            continue
        }
        dialogs[key].visible = false
    }
}

describe('useConfigStore defaults', () => {
    beforeEach(() => {
        vi.stubGlobal('window', { api: { config: configApi } })
        configApi.read.mockReset()
        configApi.write.mockReset().mockResolvedValue(undefined)
        resetStoreState()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('should expose default theme and editor configs', () => {
        const store = getConfigStore()
        expect(store.themeConfig.value).toEqual(defaultThemeConfig)
        expect(store.themeConfig.value.currentTheme).toBe('baize')
        expect(store.editorConfig.value).toEqual(defaultEditorConfig)
        expect(store.editorConfig.value.fontSize).toBe(14)
        expect(store.editorConfig.value.minimap).toEqual({ enabled: true, maxColumn: 120 })
    })

    // 2026-11-19：删除 systemConfig 死状态后只保留快捷链接默认值断言
    it('should expose default quick link configs', () => {
        const store = getConfigStore()
        expect(store.quickLinksConfig.value).toEqual(defaultQuickLinksConfig)
        expect(store.quickLinksConfig.value.links).toHaveLength(3)
        expect(store.quickLinksConfig.value.links[0].url).toBe(DEFAULT_GITHUB)
        expect(store.quickLinksConfig.value.links[1].url).toBe(DEFAULT_GOOGLE)
        expect(store.quickLinksConfig.value.links[2].url).toBe(DEFAULT_STACKOVERFLOW)
    })

    it('should start with all dialogs hidden', () => {
        const store = getConfigStore()
        for (const key of Object.keys(store.dialogs)) {
            expect(
                store.dialogs[key as keyof typeof store.dialogs].visible,
                `${key} 应默认隐藏`
            ).toBe(false)
        }
    })

    it('should expose a singleton instance', () => {
        expect(useConfigStore()).not.toBe(getConfigStore())
        expect(getConfigStore()).toBe(getConfigStore())
    })
})

describe('useConfigStore computed', () => {
    beforeEach(() => {
        vi.stubGlobal('window', { api: { config: configApi } })
        configApi.write.mockReset().mockResolvedValue(undefined)
        resetStoreState()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('should mirror the current theme', () => {
        const store = getConfigStore()
        store.themeConfig.value.currentTheme = 'vs-dark'
        expect(store.currentTheme.value).toBe('vs-dark')
    })

    // 第 2 批契约重构：isDarkTheme 判定口径改为 shared/constants/theme 的
    // DARK_THEME_TYPES（与主题设置对话框分组、标题栏 logo 同一清单），
    // 不再按主题 id 是否含 'dark' / '深' 猜测。
    it('should detect dark themes by the shared dark theme list (第 2 批)', () => {
        const store = getConfigStore()
        store.themeConfig.value.currentTheme = 'baize'
        expect(store.isDarkTheme.value).toBe(false)
        store.themeConfig.value.currentTheme = 'deepdark'
        expect(store.isDarkTheme.value).toBe(true)
        // UI 分类基线：forest 属「深色主题」分组
        store.themeConfig.value.currentTheme = 'forest'
        expect(store.isDarkTheme.value).toBe(true)
        // UI 分类基线：baize-starry 属「浅色主题」分组（配色争议见 shared/constants/theme 注释）
        store.themeConfig.value.currentTheme = 'baize-starry'
        expect(store.isDarkTheme.value).toBe(false)
    })

    it('should treat unknown theme ids as non-dark (第 2 批)', () => {
        const store = getConfigStore()
        // 历史按名字猜测：'baize-dark' / '深色主题' 会被判为深色；统一清单后未知值按非深色处理
        store.themeConfig.value.currentTheme = 'baize-dark'
        expect(store.isDarkTheme.value).toBe(false)
        store.themeConfig.value.currentTheme = '深色主题'
        expect(store.isDarkTheme.value).toBe(false)
    })
})

describe('useConfigStore dialogs', () => {
    beforeEach(() => {
        vi.stubGlobal('window', { api: { config: configApi } })
        configApi.write.mockReset().mockResolvedValue(undefined)
        resetStoreState()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('should show a success message dialog', () => {
        const store = getConfigStore()
        store.showSuccess('成功', '保存完成')
        expect(store.dialogs.messageDialog).toEqual({
            visible: true,
            type: 'success',
            title: '成功',
            message: '保存完成'
        })
    })

    it('should derive the message type from data when using the message pseudo name', () => {
        const store = getConfigStore()
        store.showDialog('message', { type: 'error', title: '错误', message: '失败' })
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.title).toBe('错误')
    })

    it('should default the message type to success when omitted', () => {
        const store = getConfigStore()
        store.showDialog('message', { title: '提示', message: '内容' })
        expect(store.dialogs.messageDialog.type).toBe('success')
        expect(store.dialogs.messageDialog.visible).toBe(true)
    })

    it('should show error/warning/info/failed messages with matching types', () => {
        const store = getConfigStore()
        store.showError('e', 'm')
        expect(store.dialogs.messageDialog.type).toBe('error')
        store.showWarning('e', 'm')
        expect(store.dialogs.messageDialog.type).toBe('warning')
        store.showInfo('e', 'm')
        expect(store.dialogs.messageDialog.type).toBe('info')
        store.showFailed('e', 'm')
        expect(store.dialogs.messageDialog.type).toBe('failed')
        expect(store.dialogs.messageDialog.visible).toBe(true)
    })

    it('should show a plain dialog', () => {
        const store = getConfigStore()
        store.showDialog('themeSettings')
        expect(store.dialogs.themeSettings.visible).toBe(true)
    })

    it('should merge extra data into a dialog when showing it', () => {
        const store = getConfigStore()
        store.showDialog('createFileFolder', { dirPath: '/notes/docs' })
        expect(store.dialogs.createFileFolder).toEqual({ visible: true, dirPath: '/notes/docs' })
    })

    it('should hide a message dialog through any message pseudo name', () => {
        const store = getConfigStore()
        store.showSuccess('t', 'm')
        store.hideDialog('success')
        expect(store.dialogs.messageDialog.visible).toBe(false)
    })

    it('should clear the import option content when hiding it', () => {
        const store = getConfigStore()
        store.showDialog('importOption', { content: 'huge text' })
        expect(store.dialogs.importOption.content).toBe('huge text')
        store.hideDialog('importOption')
        expect(store.dialogs.importOption.visible).toBe(false)
        expect(store.dialogs.importOption.content).toBeUndefined()
    })

    it('should toggle a dialog visibility', () => {
        const store = getConfigStore()
        store.toggleDialog('mdSheet')
        expect(store.dialogs.mdSheet.visible).toBe(true)
        store.toggleDialog('mdSheet')
        expect(store.dialogs.mdSheet.visible).toBe(false)
    })
})

describe('useConfigStore saving', () => {
    beforeEach(() => {
        vi.stubGlobal('window', { api: { config: configApi } })
        configApi.read.mockReset()
        configApi.write.mockReset().mockResolvedValue(undefined)
        resetStoreState()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.clearAllTimers()
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('should update the theme config and debounce-save it', async () => {
        const store = getConfigStore()
        store.updateThemeConfig({ currentTheme: 'vs-dark' })

        expect(store.themeConfig.value.currentTheme).toBe('vs-dark')
        expect(configApi.write).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(500)
        expect(configApi.write).toHaveBeenCalledTimes(1)
        expect(configApi.write).toHaveBeenCalledWith(
            'theme',
            expect.objectContaining({ currentTheme: 'vs-dark' })
        )
    })

    it('should merge consecutive saves of the same config into one write', async () => {
        const store = getConfigStore()
        store.updateThemeConfig({ currentTheme: 'dark-a' })
        store.updateThemeConfig({ currentTheme: 'dark-b' })

        await vi.advanceTimersByTimeAsync(500)
        expect(configApi.write).toHaveBeenCalledTimes(1)
        expect(configApi.write.mock.calls[0][0]).toBe('theme')
        expect((configApi.write.mock.calls[0][1] as { currentTheme: string }).currentTheme).toBe(
            'dark-b'
        )
    })

    it('should keep timers of different config names independent', async () => {
        const store = getConfigStore()
        store.updateThemeConfig({ currentTheme: 'dark' })
        store.updateEditorConfig({ fontSize: 20 })

        await vi.advanceTimersByTimeAsync(500)
        expect(configApi.write).toHaveBeenCalledTimes(2)
        const names = configApi.write.mock.calls.map((call) => call[0])
        expect(names).toEqual(['theme', 'editor'])
    })

    it('should save the quick link config with its name', async () => {
        const store = getConfigStore()
        store.saveQuickLinksConfig()

        await vi.advanceTimersByTimeAsync(500)
        expect(configApi.write).toHaveBeenCalledTimes(1)
        expect(configApi.write.mock.calls.map((call) => call[0])).toEqual(['quick-links'])
    })

    // FE-20：去抖写盘失败（主进程 writeConfig 返回 false）不再静默——弹消息对话框提示
    it('should show an error dialog when the debounced write returns false (FE-20)', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configApi.write.mockResolvedValue(false)
        const store = getConfigStore()

        store.saveThemeConfig()
        await vi.advanceTimersByTimeAsync(500)

        expect(errorSpy).toHaveBeenCalled()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.title).toContain('配置保存失败')
        // 提示中带可读配置名（theme → 主题）与失败原因
        expect(store.dialogs.messageDialog.message).toContain('主题')
        expect(store.dialogs.messageDialog.message).toContain('写入接口返回失败')
    })

    // FE-20：写盘抛异常同样提示（且不向上抛出，避免定时器内未处理拒绝）
    it('should show an error dialog when the debounced write throws (FE-20)', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configApi.write.mockRejectedValue(new Error('disk full'))
        const store = getConfigStore()

        store.updateEditorConfig({ fontSize: 18 })
        await vi.advanceTimersByTimeAsync(500)

        expect(errorSpy).toHaveBeenCalled()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.message).toContain('编辑器')
        expect(store.dialogs.messageDialog.message).toContain('disk full')
    })
})

describe('useConfigStore loading', () => {
    beforeEach(() => {
        vi.stubGlobal('window', { api: { config: configApi } })
        configApi.read.mockReset()
        configApi.write.mockReset().mockResolvedValue(undefined)
        resetStoreState()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // 2026-11-19：'system' 不再由全局 store 加载（无生产消费者的死状态已删除），
    // 系统设置对话框直接经 config:read/write('system') 读取主进程真源。
    it('should load the remaining three configs in parallel and apply them', async () => {
        configApi.read.mockImplementation(async (name: string) => {
            if (name === 'theme') return { currentTheme: 'loaded-dark', separateEditorTheme: false }
            if (name === 'editor') return { fontSize: 22 }
            if (name === 'quick-links')
                return { links: [{ name: 'A', url: 'u', icon: 'i', description: 'd' }] }
            return null
        })

        const store = getConfigStore()
        await store.loadAllConfigs()

        expect(store.themeConfig.value.currentTheme).toBe('loaded-dark')
        expect(store.editorConfig.value.fontSize).toBe(22)
        expect(store.quickLinksConfig.value.links).toHaveLength(1)
        expect(store.isLoading.value).toBe(false)
        expect(configApi.read).toHaveBeenCalledTimes(3)
        expect(configApi.read).not.toHaveBeenCalledWith('system')
    })

    it('should keep defaults for configs missing on disk', async () => {
        configApi.read.mockImplementation(async (name: string) => {
            if (name === 'theme') return { currentTheme: 'saved', separateEditorTheme: false }
            return null
        })

        const store = getConfigStore()
        await store.loadAllConfigs()

        expect(store.themeConfig.value.currentTheme).toBe('saved')
        expect(store.editorConfig.value.fontSize).toBe(defaultEditorConfig.fontSize)
        expect(store.quickLinksConfig.value.links).toHaveLength(3)
        expect(store.isLoading.value).toBe(false)
    })

    it('should log the error and clear loading state on failure', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configApi.read.mockRejectedValue(new Error('disk error'))

        const store = getConfigStore()
        await store.loadAllConfigs()

        expect(errorSpy).toHaveBeenCalled()
        expect(store.isLoading.value).toBe(false)
    })

    it('should swallow write failures without throwing', async () => {
        vi.useFakeTimers()
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configApi.write.mockRejectedValue(new Error('write error'))

        const store = getConfigStore()
        store.saveThemeConfig()
        await vi.advanceTimersByTimeAsync(500)

        expect(errorSpy).toHaveBeenCalled()
        expect(configApi.write).toHaveBeenCalledTimes(1)

        vi.clearAllTimers()
        vi.useRealTimers()
    })
})

// FE-35：配置写盘去抖从 500ms 缩短到 200ms，并提供 flushConfigWrites() 在
// 关窗/卸载前立即落盘，避免最后 200ms 内的设置修改丢失。
describe('useConfigStore flush（FE-35）', () => {
    beforeEach(() => {
        vi.stubGlobal('window', { api: { config: configApi } })
        configApi.read.mockReset()
        configApi.write.mockReset().mockResolvedValue(undefined)
        resetStoreState()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.clearAllTimers()
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('should debounce writes for 200ms instead of 500ms', async () => {
        const store = getConfigStore()
        store.updateThemeConfig({ currentTheme: 'short-debounce' })

        await vi.advanceTimersByTimeAsync(CONFIG_SAVE_DEBOUNCE_MS - 1)
        expect(configApi.write).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        expect(configApi.write).toHaveBeenCalledTimes(1)
        expect(configApi.write).toHaveBeenCalledWith(
            'theme',
            expect.objectContaining({ currentTheme: 'short-debounce' })
        )
    })

    it('should flush a pending write immediately without waiting for the debounce timer', async () => {
        const store = getConfigStore()
        store.updateThemeConfig({ currentTheme: 'flush-dark' })
        expect(configApi.write).not.toHaveBeenCalled()

        await store.flushConfigWrites()

        expect(configApi.write).toHaveBeenCalledTimes(1)
        expect(configApi.write).toHaveBeenCalledWith(
            'theme',
            expect.objectContaining({ currentTheme: 'flush-dark' })
        )

        // 去抖计时器已被取消：继续推进时间不会重复写盘
        await vi.advanceTimersByTimeAsync(500)
        expect(configApi.write).toHaveBeenCalledTimes(1)
    })

    it('should strip Vue reactive Proxy before invoking config write (structured clone safety)', async () => {
        // 2026-11-15 实机问题：store 的 themeConfig.value 是 Vue reactive Proxy，
        // Electron IPC 结构化克隆不支持 Proxy（An object could not be cloned），
        // 主题设置保存会弹「配置「主题」写入磁盘失败」。写盘前必须归一化为纯对象。
        const store = getConfigStore()
        // 先确认 store 的响应式状态确实是 Proxy（否则本用例失去意义）
        expect(isProxy(store.themeConfig.value)).toBe(true)

        store.updateThemeConfig({ currentTheme: 'proxy-safe' })
        await vi.advanceTimersByTimeAsync(CONFIG_SAVE_DEBOUNCE_MS)

        expect(configApi.write).toHaveBeenCalledTimes(1)
        const payload = configApi.write.mock.calls.at(-1)![1] as Record<string, unknown>
        expect(isProxy(payload)).toBe(false)
        expect(Object.getPrototypeOf(payload)).toBe(Object.prototype)
        expect(payload).toEqual(expect.objectContaining({ currentTheme: 'proxy-safe' }))
    })

    it('should flush every pending config once with its latest value', async () => {
        const store = getConfigStore()
        store.updateThemeConfig({ currentTheme: 'a' })
        store.updateThemeConfig({ currentTheme: 'b' })
        store.saveQuickLinksConfig()

        await store.flushConfigWrites()

        expect(configApi.write).toHaveBeenCalledTimes(2)
        expect(configApi.write.mock.calls.map((call) => call[0])).toEqual(['theme', 'quick-links'])
        expect((configApi.write.mock.calls[0][1] as { currentTheme: string }).currentTheme).toBe(
            'b'
        )
    })

    it('should do nothing when there is no pending write', async () => {
        await expect(flushConfigWrites()).resolves.toBeUndefined()
        expect(configApi.write).not.toHaveBeenCalled()
    })

    it('should report write failures during flush without rejecting', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configApi.write.mockRejectedValue(new Error('disk full'))
        const store = getConfigStore()
        // 2026-11-19：改用仍有生产消费者的 theme 配置（systemConfig 死状态已删除）
        store.updateThemeConfig({ currentTheme: 'flush-error' })

        await expect(store.flushConfigWrites()).resolves.toBeUndefined()

        expect(errorSpy).toHaveBeenCalled()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.message).toContain('disk full')
    })
})
