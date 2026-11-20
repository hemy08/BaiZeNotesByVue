/**
 * 小型纯模块/叶子模块分支补测（覆盖率补测第四批）
 *
 * 覆盖 4 个低覆盖但不便归入组件测试的模块：
 * 1. main/utils/providers.ts：provider 注入/缺省回退/部分注入/异常原样传播；
 * 2. main/utils/main-view-timing.ts：主界面进入后的 setImmediate 时序任务成功/失败；
 * 3. renderer dialogs/dialog-stack.ts：对话框栈幂等入栈/移除/顶层判定；
 * 4. theme-setting/model.ts：主题展示名/描述与预览色的 i18n key 优先与字段回退分支。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

import {
    getQuickLinksFromProvider,
    getSystemSettingFromProvider,
    getThemeApiFromProvider,
    recordRecentFolderFromProvider,
    setQuickLinksProvider,
    setRecentFolderRecorderProvider,
    setSystemSettingProvider,
    setThemeApiProvider
} from '../../src/main/utils/providers'
import { runAfterMainViewEntered } from '../../src/main/utils/main-view-timing'
import {
    isTopmostDialog,
    pushOpenDialog,
    removeOpenDialog
} from '../../src/renderer/src/components/dialogs/dialog-stack'
import {
    getMonacoColorDots,
    getMonacoPreviewLines,
    getMonacoPreviewStyle,
    getMonacoSidebarStyle,
    getMonacoThemeDisplayDesc,
    getMonacoThemeDisplayName,
    getMonacoTitleBarStyle,
    getThemeColorDots,
    getThemeDisplayDesc,
    getThemeDisplayName,
    getThemePreviewLines,
    getThemePreviewStyle,
    getThemeSidebarStyle,
    getThemeTitleBarStyle
} from '../../src/renderer/src/components/dialogs/complex/theme-setting/model'
import { SYSTEM_SETTING_FALLBACK } from '../../src/shared/constants/system-defaults'

afterEach(() => {
    // providers 为模块级单例状态：每例后复位为「未注入」
    setSystemSettingProvider(null)
    setQuickLinksProvider(null)
    setRecentFolderRecorderProvider(null)
    setThemeApiProvider(null)
})

describe('providers：系统设置 provider', () => {
    it('未注入/注入非法值时回退安全默认常量', () => {
        expect(getSystemSettingFromProvider()).toBe(SYSTEM_SETTING_FALLBACK)
        setSystemSettingProvider(undefined)
        expect(getSystemSettingFromProvider()).toBe(SYSTEM_SETTING_FALLBACK)
        setSystemSettingProvider('not-a-function' as never)
        expect(getSystemSettingFromProvider()).toBe(SYSTEM_SETTING_FALLBACK)
    })

    it('注入后实时读取，异常原样抛给调用方', () => {
        const provider = vi.fn(() => ({ ...SYSTEM_SETTING_FALLBACK, language: 'en-US' }))
        setSystemSettingProvider(provider)
        expect(getSystemSettingFromProvider().language).toBe('en-US')
        expect(provider).toHaveBeenCalledTimes(1)

        setSystemSettingProvider(() => {
            throw new Error('provider boom')
        })
        expect(() => getSystemSettingFromProvider()).toThrow('provider boom')
    })
})

describe('providers：快速链接 / 最近文件夹 / 主题 API', () => {
    it('快速链接未注入返回空数组，注入后透传', () => {
        expect(getQuickLinksFromProvider()).toEqual([])
        const links = [{ id: 'a', name: 'A', url: 'https://a.example', icon: 'x' }]
        setQuickLinksProvider(() => links as never)
        expect(getQuickLinksFromProvider()).toBe(links)
    })

    it('最近文件夹写入器未注入时为空操作，注入后 await 调用', async () => {
        await expect(recordRecentFolderFromProvider('C:\\x')).resolves.toBeUndefined()
        const recorder = vi.fn(() => Promise.resolve())
        setRecentFolderRecorderProvider(recorder)
        await recordRecentFolderFromProvider('C:\\y')
        expect(recorder).toHaveBeenCalledWith('C:\\y')
    })

    it('主题 API：未注入返回安全占位；部分注入按成员回退；null 复位', () => {
        const fallback = getThemeApiFromProvider()
        expect(fallback.getAllThemes()).toEqual([])
        expect(fallback.getAllMonacoThemes()).toEqual([])
        expect(fallback.getCurrentThemeStyles().name).toBe('Baize')

        const themes = [{ type: 'baize' }]
        setThemeApiProvider({
            getAllThemes: () => themes as never
            // 其余成员未提供 → 回退安全实现
        })
        const partial = getThemeApiFromProvider()
        expect(partial.getAllThemes()).toBe(themes)
        expect(partial.getAllMonacoThemes()).toEqual([])
        expect(partial.getThemeStylesByType('baize')).toBe(fallback.getThemeStylesByType('baize'))

        setThemeApiProvider(null)
        expect(getThemeApiFromProvider().getAllThemes()).toEqual([])
    })
})

describe('main-view-timing：进入主界面后的时序任务', () => {
    it('任务成功时 resolve，任务抛错时 reject', async () => {
        const task = vi.fn(() => Promise.resolve())
        await expect(runAfterMainViewEntered(task)).resolves.toBeUndefined()
        expect(task).toHaveBeenCalledTimes(1)

        await expect(
            runAfterMainViewEntered(() => {
                throw new Error('task boom')
            })
        ).rejects.toThrow('task boom')
    })
})

describe('dialog-stack：顶层对话框栈', () => {
    it('同一 token 幂等入栈；最新入栈者为顶层；移除后回退上一层', () => {
        const a = Symbol('a')
        const b = Symbol('b')

        pushOpenDialog(a)
        pushOpenDialog(a)
        expect(isTopmostDialog(a)).toBe(true)

        pushOpenDialog(b)
        expect(isTopmostDialog(b)).toBe(true)
        expect(isTopmostDialog(a)).toBe(false)

        removeOpenDialog(a)
        removeOpenDialog(a) // 不存在时静默忽略
        expect(isTopmostDialog(b)).toBe(true)

        removeOpenDialog(b)
        expect(isTopmostDialog(b)).toBe(false)
        expect(isTopmostDialog(a)).toBe(false)
    })
})

describe('theme-setting/model：展示与预览样式回退分支', () => {
    const theme = {
        type: 'baize',
        name: '白泽',
        styles: {
            nameKey: 'theme.baize.name',
            descKey: 'theme.baize.desc',
            name: '回退名称',
            description: '回退描述',
            backgroundColor: '#111',
            textColor: '#222',
            accentColor: '#333',
            cardBackground: '#444',
            titleBarGradient: 'linear-gradient(red, blue)'
        }
    } as never

    it('展示名/描述优先 i18n key，缺失时回退字段与类型名', () => {
        expect(getThemeDisplayName(theme)).toBeTypeOf('string')
        expect(getThemeDisplayDesc(theme)).toBeTypeOf('string')

        const noKeys = {
            type: 'custom',
            name: 'Custom',
            styles: { name: '字段名', description: '字段描述' }
        } as never
        expect(getThemeDisplayName(noKeys)).toBe('字段名')
        expect(getThemeDisplayDesc(noKeys)).toBe('字段描述')

        const empty = { type: 'empty', styles: undefined } as never
        expect(getThemeDisplayName(empty)).toBe('empty')
        expect(getThemeDisplayDesc(empty)).toBeTypeOf('string')
    })

    it('主题卡片预览样式在各字段缺失时使用兜底色', () => {
        expect(getThemePreviewStyle(theme)).toEqual({ background: '#111', color: '#222' })
        expect(getThemeTitleBarStyle(theme)).toEqual({
            background: 'linear-gradient(red, blue)'
        })
        expect(getThemeSidebarStyle(theme)).toEqual({ background: '#444' })
        expect(getThemePreviewLines(theme)).toHaveLength(3)
        expect(getThemeColorDots(theme)).toHaveLength(3)

        const bare = { type: 'bare', styles: {} } as never
        expect(getThemePreviewStyle(bare)).toEqual({ background: '#fff', color: '#333' })
        expect(getThemeSidebarStyle(bare)).toEqual({ background: '#f5f5f5' })
        expect(getThemeColorDots(bare)[1].style.background).toBe('#00b0ff')
    })

    it('Monaco 主题卡片样式与展示名/描述回退', () => {
        const monacoTheme = {
            type: 'vs',
            name: 'VS',
            colors: { bg: '#1e1e1e', text: '#ddd', accent: '#00b0ff' },
            config: { nameKey: 'theme.editor.vs.name', descKey: 'theme.editor.vs.desc' }
        } as never
        expect(getMonacoPreviewStyle(monacoTheme)).toEqual({ background: '#1e1e1e' })
        expect(getMonacoTitleBarStyle(monacoTheme)).toEqual({ background: '#1e1e1e' })
        expect(getMonacoSidebarStyle(monacoTheme)).toEqual({ background: '#1e1e1e', opacity: 0.8 })
        expect(getMonacoPreviewLines(monacoTheme)).toHaveLength(3)
        expect(getMonacoColorDots(monacoTheme)).toHaveLength(3)
        expect(getMonacoThemeDisplayName(monacoTheme)).toBeTypeOf('string')
        expect(getMonacoThemeDisplayDesc(monacoTheme)).toBeTypeOf('string')

        const configFields = {
            type: 'custom',
            name: 'Custom',
            colors: { bg: '#000', text: '#fff', accent: '#f00' },
            config: { name: '配置名', description: '配置描述' }
        } as never
        expect(getMonacoThemeDisplayName(configFields)).toBe('配置名')
        expect(getMonacoThemeDisplayDesc(configFields)).toBe('配置描述')

        // 展示名/描述字段也缺失：使用 name 与编辑器主题兜底文案
        const bareMonaco = {
            type: 'bare',
            name: 'Bare',
            colors: { bg: '#000', text: '#fff', accent: '#f00' },
            config: {}
        } as never
        expect(getMonacoThemeDisplayName(bareMonaco)).toBe('Bare')
        expect(getMonacoThemeDisplayDesc(bareMonaco)).toBeTypeOf('string')
    })
})
