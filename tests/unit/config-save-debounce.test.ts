import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// useConfigStore 通过 window.api 读写配置，测试中 stub 掉
const writeMock = vi.fn()

vi.stubGlobal('window', {
    api: {
        config: {
            write: writeMock,
            read: vi.fn().mockResolvedValue(null)
        }
    }
})

import {
    getConfigStore,
    CONFIG_SAVE_DEBOUNCE_MS
} from '../../src/renderer/src/common/useConfigStore'

// MEM-15：各配置（theme / editor / quick-links）的保存防抖定时器按 configName 分离，
// 不同配置连续保存互不取消，仅同配置合并防抖。
// 2026-11-19：系统配置全局状态（systemConfig）为无消费者死状态，已从 store 删除，
// 此处随之由「四种配置」收敛为三种。
// FE-35：去抖窗口由 500ms 缩短为 CONFIG_SAVE_DEBOUNCE_MS（200ms），时间断言不再写死 500/600。
describe('useConfigStore 配置保存防抖', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        writeMock.mockClear()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('不同配置名的保存防抖互不取消，各自落盘', async () => {
        const store = getConfigStore()
        store.saveThemeConfig()
        store.saveEditorConfig()
        store.saveQuickLinksConfig()

        await vi.advanceTimersByTimeAsync(CONFIG_SAVE_DEBOUNCE_MS + 50)

        expect(writeMock).toHaveBeenCalledTimes(3)
        const savedNames = writeMock.mock.calls.map((call) => call[0])
        expect(savedNames).toEqual(expect.arrayContaining(['theme', 'editor', 'quick-links']))
    })

    it('同一配置名连续保存合并为一次写盘（防抖生效）', async () => {
        const store = getConfigStore()
        store.updateThemeConfig({ currentTheme: 'dark' })
        store.updateThemeConfig({ currentTheme: 'light' })

        await vi.advanceTimersByTimeAsync(CONFIG_SAVE_DEBOUNCE_MS + 50)

        expect(writeMock).toHaveBeenCalledTimes(1)
        expect(writeMock.mock.calls[0][0]).toBe('theme')
        expect(writeMock.mock.calls[0][1].currentTheme).toBe('light')
    })

    it('同一配置名防抖期间不取消其他配置的挂起保存', async () => {
        const store = getConfigStore()
        store.saveThemeConfig()
        // 推进半个去抖窗口后再保存另一配置：theme 的定时器不受影响
        await vi.advanceTimersByTimeAsync(CONFIG_SAVE_DEBOUNCE_MS / 2)
        store.saveEditorConfig()
        // 再推进半个窗口：theme 到点先落盘，editor 尚未到点
        await vi.advanceTimersByTimeAsync(CONFIG_SAVE_DEBOUNCE_MS / 2)

        expect(writeMock).toHaveBeenCalledTimes(1)
        expect(writeMock.mock.calls[0][0]).toBe('theme')

        await vi.advanceTimersByTimeAsync(CONFIG_SAVE_DEBOUNCE_MS / 2)
        expect(writeMock).toHaveBeenCalledTimes(2)
        expect(writeMock.mock.calls[1][0]).toBe('editor')
    })
})
