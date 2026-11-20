/**
 * P1-3（首屏 i18n 拆包）：渲染层语言初始化/切换的按需加载测试。
 *
 * 覆盖（均为「全新模块实例」下的真实懒加载路径）：
 * 1. initI18n 读取系统语言后只加载该语言词典，且 resolve 后 t() 立即可用（挂载前可用）；
 * 2. 英文用户首屏只加载英文词典（中文词典保持未加载 = 首屏单语言）；
 * 3. 运行期收到 system-setting-update 切换到中文时，按需加载中文词典并响应式生效；
 * 4. 系统设置读取失败时回落默认中文且不抛错。
 *
 * 说明：全局 setupFiles 预载了双语词典；本文件用 `vi.resetModules()` 取得全新模块实例，
 * 并 stub `window.api` / `window.electron` 模拟 preload 暴露的运行时 API。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels'

interface IpcOnSpy {
    mock: { calls: Array<[string, (event: unknown, setting: { language?: string }) => void]> }
}

function stubRendererRuntime(configRead: () => Promise<unknown>): { onSpy: IpcOnSpy } {
    const onSpy = vi.fn()
    vi.stubGlobal('window', {
        api: { config: { read: vi.fn(configRead) } },
        electron: { ipcRenderer: { on: onSpy } }
    })
    return { onSpy: onSpy as unknown as IpcOnSpy }
}

describe('P1-3 渲染层 i18n 按需加载', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('initI18n 只加载当前语言，挂载前 t() 已可用；切换语言时按需加载另一语言', async () => {
        const { onSpy } = stubRendererRuntime(async () => ({ language: 'en-US' }))

        const i18n = await import('../../src/renderer/src/common/i18n')
        const shared = await import('../../src/shared/i18n')

        // 挂载前（initI18n 之前）词典尚未加载：不允许此时被渲染，t() 返回键名
        expect(i18n.t('common.ok')).toBe('common.ok')

        await i18n.initI18n()

        // await 完成后（main.ts 在此之后 mount）：首屏语言即系统语言，无空文案闪烁
        expect(i18n.getLocale()).toBe('en-US')
        expect(i18n.t('common.ok')).toBe('OK')
        // 首屏只加载英文词典，中文词典未加载
        expect(shared.hasLocaleMessages('en-US')).toBe(true)
        expect(shared.hasLocaleMessages('zh-CN')).toBe(false)

        // 模拟主进程广播语言变更（系统设置切换为中文）→ 按需加载中文词典
        expect(onSpy.mock.calls).toHaveLength(1)
        expect(onSpy.mock.calls[0][0]).toBe(IPC.SETTING.SYSTEM_SETTING_UPDATE)
        onSpy.mock.calls[0][1]({}, { language: 'zh-cn' })
        await i18n.waitForLocaleReady()

        expect(i18n.getLocale()).toBe('zh-CN')
        expect(i18n.t('common.ok')).toBe('确定')
        expect(shared.hasLocaleMessages('zh-CN')).toBe(true)

        // 已加载过的语言再次切换回英文：同步生效（无异步等待）
        i18n.setLocale('en-US')
        expect(i18n.getLocale()).toBe('en-US')
        expect(i18n.t('common.ok')).toBe('OK')
    })

    it('系统设置读取失败时回落默认中文，且不抛错', async () => {
        stubRendererRuntime(async () => {
            throw new Error('read failed')
        })

        const i18n = await import('../../src/renderer/src/common/i18n')
        const shared = await import('../../src/shared/i18n')

        await expect(i18n.initI18n()).resolves.toBeUndefined()

        expect(i18n.getLocale()).toBe('zh-CN')
        expect(i18n.t('common.ok')).toBe('确定')
        expect(shared.hasLocaleMessages('zh-CN')).toBe(true)
        expect(shared.hasLocaleMessages('en-US')).toBe(false)
    })
})
