/**
 * P1-3（首屏 i18n 拆包）：shared/i18n 按语言动态加载语义测试。
 *
 * 覆盖：
 * 1. 冷启动（未加载任何词典）时 translate 返回键名，不会误报其它语言；
 * 2. `loadLocale()` 只加载目标语言（另一语言保持未加载 = 首屏不装双语）；
 * 3. 目标语言未加载时 translate 仍回落已加载的默认语言（保持原有回退语义）；
 * 4. loadLocale 幂等 + 并发去重（同一语言只加载一次）；
 * 5. 未注册加载器时给出明确错误；
 * 6. loadAllLocales 一次加载双语；已加载语言不要求注册加载器。
 *
 * 说明：shared/i18n 只提供「注册加载器 + 加载状态」机制，真实动态 import 由渲染层
 * `common/i18n.ts` 注册（见 tests/unit/i18n-renderer-lazy.test.ts）。本文件用
 * `vi.resetModules()` 取得全新实例，并注入轻量替身词典观察加载状态机。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 轻量替身词典：只验证加载状态机与回退语义，不依赖真实 24 个词典文件 */
const FIXTURE_ZH = { common: { ok: '确定' }, settings: { language: { label: '界面语言' } } }
const FIXTURE_EN = { common: { ok: 'OK' }, settings: { language: { label: 'Interface language' } } }

describe('P1-3 shared/i18n 按语言动态加载', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it('冷启动未加载词典时 translate 返回键名；loadLocale 只加载目标语言', async () => {
        const i18n = await import('../../src/shared/i18n')
        const zhLoader = vi.fn(async () => ({ default: FIXTURE_ZH }))
        const enLoader = vi.fn(async () => ({ default: FIXTURE_EN }))
        i18n.registerLocaleLoader('zh-CN', zhLoader)
        i18n.registerLocaleLoader('en-US', enLoader)

        expect(i18n.hasLocaleMessages('zh-CN')).toBe(false)
        expect(i18n.hasLocaleMessages('en-US')).toBe(false)
        expect(i18n.getMessages('zh-CN')).toBeUndefined()
        expect(Object.keys(i18n.MESSAGES)).toEqual([])
        expect(i18n.translate('common.ok')).toBe('common.ok')

        await i18n.loadLocale('zh-CN')

        expect(i18n.hasLocaleMessages('zh-CN')).toBe(true)
        // 首屏只装当前语言：英文加载器未被调用，英文词典仍未加载
        expect(zhLoader).toHaveBeenCalledTimes(1)
        expect(enLoader).not.toHaveBeenCalled()
        expect(i18n.hasLocaleMessages('en-US')).toBe(false)
        expect(i18n.translate('common.ok')).toBe('确定')
        // 目标语言未加载时回落已加载的默认语言（保持改造前的回退语义）
        expect(i18n.translate('common.ok', 'en-US')).toBe('确定')

        await i18n.loadLocale('en-US')

        expect(enLoader).toHaveBeenCalledTimes(1)
        expect(i18n.translate('common.ok', 'en-US')).toBe('OK')
        expect(Object.keys(i18n.MESSAGES).sort()).toEqual(['en-US', 'zh-CN'])
    })

    it('loadLocale 并发/重复调用只加载一次且幂等', async () => {
        const i18n = await import('../../src/shared/i18n')
        const enLoader = vi.fn(async () => ({ default: FIXTURE_EN }))
        i18n.registerLocaleLoader('en-US', enLoader)

        await Promise.all([
            i18n.loadLocale('en-US'),
            i18n.loadLocale('en-US'),
            i18n.loadLocale('en-US')
        ])
        // 已加载后再调用：直接 resolve（不重复加载）
        await i18n.loadLocale('en-US')

        expect(enLoader).toHaveBeenCalledTimes(1)
        expect(i18n.hasLocaleMessages('en-US')).toBe(true)
        expect(i18n.translate('common.ok', 'en-US')).toBe('OK')
    })

    it('未注册加载器时 loadLocale 抛出明确错误', async () => {
        const i18n = await import('../../src/shared/i18n')

        await expect(i18n.loadLocale('en-US')).rejects.toThrow(/未注册词典加载器/)
    })

    it('loadAllLocales 一次加载双语；已加载语言不要求注册加载器', async () => {
        const i18n = await import('../../src/shared/i18n')
        i18n.registerLocaleMessages('zh-CN', FIXTURE_ZH)
        i18n.registerLocaleLoader('en-US', async () => ({ default: FIXTURE_EN }))

        await i18n.loadAllLocales()

        expect(i18n.hasLocaleMessages('zh-CN')).toBe(true)
        expect(i18n.hasLocaleMessages('en-US')).toBe(true)
        expect(i18n.translate('common.ok', 'zh-CN')).toBe('确定')
        expect(i18n.translate('common.ok', 'en-US')).toBe('OK')
    })
})
