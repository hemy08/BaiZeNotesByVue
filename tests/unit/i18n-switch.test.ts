/**
 * CMP-30 语言切换冒烟测试（集成式）
 *
 * 覆盖三条路径：
 * 1. 渲染层 t()：setLocale 切换中英后，菜单/对话框/工具/状态栏代表词条输出对应语言，
 *    且 t() 依赖的 currentLocale 为响应式 ref（computed 自动重算）；
 * 2. 主进程 tMain()：语言取自系统设置，refreshMainLocale() 失效缓存后随之切换；
 * 3. resolveLocale / setLocale 对历史值（'zh-cn' / 'en-us' / 'zh' / 'en'）的归一化。
 *
 * 说明：tMain 的语言来源经 utils/providers 注入替身，避免引入 config/electron-store 依赖链。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { computed, effectScope } from 'vue'

// 主进程 tMain 的语言来源（可在用例内修改）
const settingState = vi.hoisted(() => ({ language: 'zh-CN' as string | undefined }))

import { DEFAULT_LOCALE, resolveLocale, SUPPORTED_LOCALES } from '../../src/shared/i18n'
import { currentLocale, getLocale, setLocale, t } from '../../src/renderer/src/common/i18n'
import { getMainLocale, refreshMainLocale, tMain } from '../../src/main/utils/i18n'
import { setSystemSettingProvider } from '../../src/main/utils/providers'
import type { SystemSetting } from '../../src/shared/types'

// 结构优化 1.1（H1）：主进程 i18n 的语言读取改经 provider 注入（替代原 mock config/system-setting），
// 用 settingState 模拟实时系统设置，保持各用例断言语义不变。
setSystemSettingProvider(
    () => ({ language: settingState.language }) as unknown as SystemSetting
)

describe('CMP-30 语言切换冒烟', () => {
    beforeEach(() => {
        // 每个用例从中性状态开始：渲染层回默认语言，主进程缓存失效
        setLocale(DEFAULT_LOCALE)
        settingState.language = 'zh-CN'
        refreshMainLocale()
    })

    it('渲染层 setLocale 切换后，菜单/对话框/工具/状态栏代表词条同步切换，且 t() 响应式重算', () => {
        // 中文基线
        expect(currentLocale.value).toBe('zh-CN')
        expect(t('menu.file.new')).toBe('新建')
        expect(t('dialogRenderer.techStack.title')).toBe('技术栈')
        expect(t('toolsConvert.base.description')).toBe(
            '2~36 进制任意互转，支持整数、小数（20 位精度）与负数。'
        )
        expect(t('status.filePathLabel')).toBe('文件路径:')

        // 响应式：computed 读取 t() 后随语言切换自动重算
        const scope = effectScope()
        const okText = scope.run(() => computed(() => t('common.ok')))!
        expect(okText.value).toBe('确定')

        // 切英文
        setLocale('en-US')
        expect(currentLocale.value).toBe('en-US')
        expect(t('menu.file.new')).toBe('New')
        expect(t('dialogRenderer.techStack.title')).toBe('Tech stack')
        expect(t('toolsConvert.base.description')).toBe(
            'Convert numbers between bases 2-36, supporting integers, fractions (20-digit precision) and negative values.'
        )
        expect(t('status.filePathLabel')).toBe('File path:')
        expect(okText.value).toBe('OK')

        // 切回中文
        setLocale('zh-CN')
        expect(t('menu.file.new')).toBe('新建')
        expect(t('dialogRenderer.techStack.title')).toBe('技术栈')
        expect(t('status.filePathLabel')).toBe('文件路径:')
        expect(okText.value).toBe('确定')
        scope.stop()
    })

    it('主进程 tMain 随系统设置 language 切换（refreshMainLocale 失效缓存）', () => {
        expect(getMainLocale()).toBe('zh-CN')
        expect(tMain('mainMsg.update.title')).toBe('检查更新')
        expect(tMain('mainMsg.dialog.saveAsSuccessMessage', { path: '/tmp/a.md' })).toBe(
            '文件已保存到: /tmp/a.md'
        )

        // 系统设置写入英文后，主进程缓存失效 → tMain 输出英文
        settingState.language = 'en-us'
        refreshMainLocale()
        expect(getMainLocale()).toBe('en-US')
        expect(tMain('mainMsg.update.title')).toBe('Check for updates')
        expect(tMain('mainMsg.dialog.saveAsSuccessMessage', { path: '/tmp/a.md' })).toBe(
            'File saved to: /tmp/a.md'
        )

        // 切回中文（历史小写写法同样归一化）
        settingState.language = 'zh-cn'
        refreshMainLocale()
        expect(tMain('mainMsg.update.title')).toBe('检查更新')
    })

    it('resolveLocale 归一化历史语言值，未知值回落默认语言', () => {
        expect(SUPPORTED_LOCALES).toEqual(['zh-CN', 'en-US'])
        expect(DEFAULT_LOCALE).toBe('zh-CN')

        expect(resolveLocale('zh-cn')).toBe('zh-CN')
        expect(resolveLocale('en-us')).toBe('en-US')
        expect(resolveLocale('zh_CN')).toBe('zh-CN')
        expect(resolveLocale('EN')).toBe('en-US')
        expect(resolveLocale('zh')).toBe('zh-CN')
        expect(resolveLocale(' en-US ')).toBe('en-US')

        // setLocale 同样归一化历史值
        setLocale('en-us')
        expect(getLocale()).toBe('en-US')
        setLocale('zh-cn')
        expect(getLocale()).toBe('zh-CN')

        // 空值/非法值回落默认语言
        setLocale('')
        expect(getLocale()).toBe('zh-CN')
        setLocale('fr-FR')
        expect(getLocale()).toBe('zh-CN')
        setLocale(null)
        expect(getLocale()).toBe('zh-CN')
    })
})
