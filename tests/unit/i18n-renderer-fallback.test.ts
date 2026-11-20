/**
 * 渲染层 i18n（`src/renderer/src/common/i18n.ts`）加载失败 / 回退 / 并发切换分支补测。
 *
 * 既有用例（tests/unit/i18n-renderer-lazy.test.ts）覆盖了「正常加载 + 按需切换」主链路；
 * 本文件用 `vi.resetModules()` 取得全新模块实例，覆盖主链路之外的防御性分支：
 * 1. 初始语言词典已预载：ensureLocaleMessages 早退（真实懒加载不会走到的同步预载路径，
 *    主进程/测试预载场景）；
 * 2. 目标语言加载失败 → 回落默认语言成功；
 * 3. 目标语言与默认语言都加载失败 → 保持现语言（默认语言分支早退）；
 * 4. 并发切换只允许最后一次请求生效（慢加载不得回写旧语言）；
 * 5. initI18n 幂等（重复调用只生效一次）；
 * 6. 主进程语言变更广播的负载非法（无 language 字段）时忽略；
 * 7. 订阅广播失败（preload 异常）不阻塞启动；
 * 8. 目标语言加载失败但默认语言可加载 → 回退到默认语言。
 *
 * 说明：这些分支在当前正常运行时（setupFiles 预载双语词典）不可达，因此只能通过
 * 全新模块实例 + 注入替身加载器覆盖；断言只验证「不抛错 + 语言状态正确」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels'

import type { MessageNode } from '../../src/shared/i18n/types'

type LocaleLoader = () => Promise<{ default: MessageNode }>

const FIXTURE_ZH: MessageNode = { common: { ok: '确定' } }
const FIXTURE_EN: MessageNode = { common: { ok: 'OK' } }

interface IpcOnSpy {
    mock: { calls: Array<[string, (event: unknown, setting: unknown) => void]> }
}

/** 安装渲染层运行时替身；onThrow 可替换为抛错实现（模拟 preload 异常） */
function stubRendererRuntime(
    configRead: () => Promise<unknown>,
    onThrow = false
): { onSpy: IpcOnSpy } {
    const onSpy = vi.fn(() => {
        if (onThrow) throw new Error('ipc on failed')
        return undefined
    })
    vi.stubGlobal('window', {
        api: { config: { read: vi.fn(configRead) } },
        electron: { ipcRenderer: { on: onSpy, removeListener: vi.fn() } }
    })
    return { onSpy: onSpy as unknown as IpcOnSpy }
}

/** 等待微任务队列（多次 await 之后挂起的加载任务全部落定） */
async function settle(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

describe('渲染层 i18n 加载失败与回退分支', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('词典已预载时直接生效，initI18n 幂等且非法广播负载被忽略', async () => {
        const { onSpy } = stubRendererRuntime(async () => ({ language: 'en-US' }))

        // 先取 shared/i18n 并预载英文词典（模拟主进程/测试的同步预载路径）
        const shared = await import('../../src/shared/i18n')
        shared.registerLocaleMessages('en-US', FIXTURE_EN)

        const i18n = await import('../../src/renderer/src/common/i18n')
        await i18n.initI18n()

        // 词典已预载：ensureLocaleMessages 早退，不触发动态加载
        expect(i18n.getLocale()).toBe('en-US')
        expect(i18n.t('common.ok')).toBe('OK')
        expect(shared.hasLocaleMessages('zh-CN')).toBe(false)

        // 幂等：重复调用只生效一次（第二次早退，不再读配置）
        const readMock = window.api.config.read as unknown as ReturnType<typeof vi.fn>
        const callsAfterFirst = readMock.mock.calls.length
        await i18n.initI18n()
        expect(readMock.mock.calls.length).toBe(callsAfterFirst)

        // 广播负载非法（undefined / 无 language 字段 / language 非字符串）→ 忽略
        expect(onSpy.mock.calls).toHaveLength(1)
        const handler = onSpy.mock.calls[0][1]
        expect(onSpy.mock.calls[0][0]).toBe(IPC.SETTING.SYSTEM_SETTING_UPDATE)
        handler({}, undefined)
        handler({}, { language: 123 })
        // 中文词典未预载：广播切换走异步加载，等待落定后生效
        handler({}, { language: 'zh-CN' })
        await i18n.waitForLocaleReady()
        expect(i18n.getLocale()).toBe('zh-CN')
        expect(i18n.t('common.ok')).toBe('确定')
    })

    it('目标语言加载失败时回落默认语言', async () => {
        const { onSpy } = stubRendererRuntime(async () => ({ language: 'en-US' }))
        const shared = await import('../../src/shared/i18n')
        await import('../../src/renderer/src/common/i18n')
        // 英文加载失败、中文正常：initI18n 应回落中文
        shared.registerLocaleLoader('en-US', (async () => {
            throw new Error('en chunk missing')
        }) as LocaleLoader)

        const i18n = await import('../../src/renderer/src/common/i18n')
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        await i18n.initI18n()

        expect(i18n.getLocale()).toBe('zh-CN')
        expect(i18n.t('common.ok')).toBe('确定')
        expect(warnSpy).toHaveBeenCalled()
        expect(onSpy.mock.calls).toHaveLength(1)
    })

    it('目标语言与默认语言都加载失败时保持当前语言且不抛错', async () => {
        stubRendererRuntime(async () => ({ language: 'en-US' }))
        const shared = await import('../../src/shared/i18n')
        const i18n = await import('../../src/renderer/src/common/i18n')
        // 两种语言加载均失败
        const failingLoader = (async () => {
            throw new Error('all chunks missing')
        }) as LocaleLoader
        shared.registerLocaleLoader('zh-CN', failingLoader)
        shared.registerLocaleLoader('en-US', failingLoader)
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        await i18n.initI18n()
        // 回落默认语言也失败 → 保持初始默认语言（词典未加载，t() 返回键名）
        expect(i18n.getLocale()).toBe('zh-CN')
        expect(i18n.t('common.ok')).toBe('common.ok')

        // setLocale 归一化到默认语言（词典未加载）→ 走默认语言分支早退，不切换
        i18n.setLocale('fr-FR')
        await i18n.waitForLocaleReady()
        expect(i18n.getLocale()).toBe('zh-CN')
        expect(shared.hasLocaleMessages('zh-CN')).toBe(false)
    })

    it('并发切换时只有最后一次请求生效（慢加载不回写旧语言）', async () => {
        stubRendererRuntime(async () => ({ language: 'zh-CN' }))
        const shared = await import('../../src/shared/i18n')
        const i18n = await import('../../src/renderer/src/common/i18n')
        // 中文正常；英文慢加载（手动 resolve）
        let resolveEn: (value: { default: MessageNode }) => void = () => undefined
        const slowEnLoader = () =>
            new Promise<{ default: MessageNode }>((resolve) => {
                resolveEn = resolve
            })
        shared.registerLocaleLoader('en-US', slowEnLoader)
        shared.registerLocaleMessages('zh-CN', FIXTURE_ZH)

        vi.spyOn(console, 'warn').mockImplementation(() => {})
        await i18n.initI18n()
        expect(i18n.getLocale()).toBe('zh-CN')

        // 请求切英文（慢加载挂起）→ 立即切回中文：旧请求完成后不得回写英文
        i18n.setLocale('en-US')
        const pending = i18n.waitForLocaleReady()
        i18n.setLocale('zh-CN')
        expect(i18n.getLocale()).toBe('zh-CN')

        resolveEn({ default: FIXTURE_EN })
        await pending
        await settle()

        expect(i18n.getLocale()).toBe('zh-CN')
        expect(shared.hasLocaleMessages('en-US')).toBe(true)
        expect(i18n.t('common.ok')).toBe('确定')
    })

    it('订阅语言变更广播失败时不阻塞启动', async () => {
        stubRendererRuntime(async () => ({ language: 'zh-CN' }), true)
        await import('../../src/shared/i18n')
        const i18n = await import('../../src/renderer/src/common/i18n')
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        await expect(i18n.initI18n()).resolves.toBeUndefined()
        expect(i18n.getLocale()).toBe('zh-CN')
        expect(i18n.t('common.ok')).toBe('确定')
        expect(warnSpy).toHaveBeenCalled()
    })

    it('系统语言读取失败时使用默认语言（覆盖读取异常分支）', async () => {
        stubRendererRuntime(async () => {
            throw new Error('config read failed')
        })
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const i18n = await import('../../src/renderer/src/common/i18n')

        await i18n.initI18n()
        expect(i18n.getLocale()).toBe('zh-CN')
        expect(i18n.t('common.ok')).toBe('确定')
    })

    it('目标语言加载失败但默认语言可加载时回退到默认语言', async () => {
        stubRendererRuntime(async () => ({ language: 'en-US' }))
        const shared = await import('../../src/shared/i18n')
        const i18n = await import('../../src/renderer/src/common/i18n')
        shared.registerLocaleLoader('en-US', (async () => {
            throw new Error('en chunk missing')
        }) as LocaleLoader)
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        await i18n.initI18n()
        expect(i18n.getLocale()).toBe('zh-CN')
        expect(shared.hasLocaleMessages('zh-CN')).toBe(true)
        expect(shared.hasLocaleMessages('en-US')).toBe(false)
    })
})
