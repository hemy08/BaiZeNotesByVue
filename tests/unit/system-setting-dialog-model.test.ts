/**
 * system-setting/model.ts 纯函数单元测试（设置页拆分 P0）
 *
 * 覆盖点：
 * 1. 默认值工厂：35 字段与 shared SYSTEM_SETTING_FALLBACK 真源一致、语言按下拉展示值归一化；
 * 2. mergeStoredSystemSettings：只合并「已定义且类型一致」字段、忽略未知/错误类型、不改入参；
 * 3. normalizeLanguageSelection：历史值归一化（zh-cn / en-* / 非法值）；
 * 4. isSystemSettingsDirty：字段级脏标记（新增，供 composable 契约使用）；
 * 5. validateDialogSettings：界面输入范围/语言枚举的诊断校验（不阻断保存）。
 */
import { describe, it, expect } from 'vitest'

import { SYSTEM_SETTING_FALLBACK } from '../../src/shared/constants/system-defaults'
import {
    createDefaultSystemDialogSettings,
    isSystemSettingsDirty,
    mergeStoredSystemSettings,
    normalizeLanguageSelection,
    SYSTEM_SETTING_NUMBER_LIMITS,
    validateDialogSettings,
    type SystemDialogSettings
} from '../../src/renderer/src/components/dialogs/complex/system-setting/model'

const EXPECTED_FIELDS: (keyof SystemDialogSettings)[] = [
    'autoOpenLastFile',
    'autoOpenLastFolder',
    'autoStart',
    'minimizeToTray',
    'rememberWindowSize',
    'language',
    'defaultFilePath',
    'autoSaveEnabled',
    'autoSaveInterval',
    'recentFilesCount',
    'appTheme',
    'useSystemTheme',
    'fontFamily',
    'fontSize',
    'enableAutoBackup',
    'backupInterval',
    'backupCount',
    'allowRemoteImages',
    'featureTabs',
    'featureDocumentHistory',
    'featureMarkdownLint',
    'featureSpellcheck',
    'featureSmartInput',
    'featureOutlinePlus',
    'featureDailyNotes',
    'featureClipCapture',
    'featurePdfAnnotations',
    'featureImageOcr',
    'writingModeEnabled',
    'writingTypewriterEnabled',
    'writingFocusEnabled',
    'writingStatsEnabled',
    'writingTypographyEnabled',
    'writingSessionRestoreEnabled',
    'writingBubbleEnabled',
    'writingSlashEnabled',
    'writingStyleCheckEnabled'
]

describe('createDefaultSystemDialogSettings', () => {
    it('应返回完整 37 字段，且值来自 shared SYSTEM_SETTING_FALLBACK 真源', () => {
        const defaults = createDefaultSystemDialogSettings()
        expect(Object.keys(defaults).sort()).toEqual([...EXPECTED_FIELDS].sort())
        expect(defaults.autoOpenLastFile).toBe(SYSTEM_SETTING_FALLBACK.autoOpenLastFile)
        expect(defaults.rememberWindowSize).toBe(SYSTEM_SETTING_FALLBACK.rememberWindowSize)
        expect(defaults.autoSaveEnabled).toBe(SYSTEM_SETTING_FALLBACK.autoSaveEnabled)
        expect(defaults.autoSaveInterval).toBe(SYSTEM_SETTING_FALLBACK.autoSaveInterval)
        expect(defaults.fontFamily).toBe(SYSTEM_SETTING_FALLBACK.fontFamily)
        expect(defaults.fontSize).toBe(SYSTEM_SETTING_FALLBACK.fontSize)
        expect(defaults.backupInterval).toBe(SYSTEM_SETTING_FALLBACK.backupInterval)
        expect(defaults.backupCount).toBe(SYSTEM_SETTING_FALLBACK.backupCount)
        expect(defaults.allowRemoteImages).toBe(SYSTEM_SETTING_FALLBACK.allowRemoteImages)
    })

    it('语言按下拉展示值归一化为 zh-CN（主进程默认 zh-cn 小写）', () => {
        expect(createDefaultSystemDialogSettings().language).toBe('zh-CN')
    })

    it('每次调用返回新对象（避免多处共享同一兜底实例）', () => {
        const first = createDefaultSystemDialogSettings()
        const second = createDefaultSystemDialogSettings()
        expect(first).not.toBe(second)
        expect(first).toEqual(second)
    })
})

describe('mergeStoredSystemSettings', () => {
    it('只覆盖已定义且类型一致的字段，其余保持当前值', () => {
        const current = createDefaultSystemDialogSettings()
        const merged = mergeStoredSystemSettings(current, {
            language: 'en-us',
            fontSize: 16,
            autoOpenLastFile: true,
            unknownField: 'ignored'
        })
        expect(merged.language).toBe('en-us')
        expect(merged.fontSize).toBe(16)
        expect(merged.autoOpenLastFile).toBe(true)
        // 未返回字段保持默认
        expect(merged.backupCount).toBe(current.backupCount)
        // 未知字段不进入提交载荷
        expect(Object.keys(merged)).not.toContain('unknownField')
    })

    it('类型不一致的字段不覆盖（bool ← string / number ← string 均忽略）', () => {
        const current = createDefaultSystemDialogSettings()
        const merged = mergeStoredSystemSettings(current, {
            autoOpenLastFile: 'true',
            fontSize: '16',
            backupInterval: null
        })
        expect(merged).toEqual(current)
    })

    it('stored 非对象/为空时返回当前值的浅拷贝（不修改入参）', () => {
        const current: SystemDialogSettings = {
            ...createDefaultSystemDialogSettings(),
            fontSize: 15
        }
        for (const stored of [null, undefined, 42, 'x']) {
            const merged = mergeStoredSystemSettings(current, stored)
            expect(merged).toEqual(current)
            expect(merged).not.toBe(current)
        }
    })
})

describe('normalizeLanguageSelection', () => {
    it.each([
        ['zh-cn', 'zh-CN'],
        ['zh-CN', 'zh-CN'],
        ['zh', 'zh-CN'],
        ['', 'zh-CN'],
        [null, 'zh-CN'],
        [undefined, 'zh-CN'],
        ['en-us', 'en-US'],
        ['en-US', 'en-US'],
        ['en', 'en-US'],
        ['EN_GB', 'en-US'],
        ['ja', 'zh-CN']
    ])('归一化 %s → %s', (input, expected) => {
        expect(normalizeLanguageSelection(input)).toBe(expected)
    })
})

describe('isSystemSettingsDirty', () => {
    it('相同值返回 false，任一字段不同返回 true', () => {
        const initial = createDefaultSystemDialogSettings()
        expect(isSystemSettingsDirty(createDefaultSystemDialogSettings(), initial)).toBe(false)

        expect(isSystemSettingsDirty({ ...initial, language: 'en-US' }, initial)).toBe(true)
        expect(isSystemSettingsDirty({ ...initial, fontSize: 16 }, initial)).toBe(true)
        expect(isSystemSettingsDirty({ ...initial, allowRemoteImages: true }, initial)).toBe(true)
    })

    it('布尔与数值字段按 Object.is 比较（不误判 0/false）', () => {
        const initial = createDefaultSystemDialogSettings()
        expect(isSystemSettingsDirty({ ...initial, autoStart: false }, initial)).toBe(false)
        expect(isSystemSettingsDirty({ ...initial, autoStart: true }, initial)).toBe(true)
    })
})

describe('validateDialogSettings（保存前诊断校验）', () => {
    it('默认值全部在界面范围内：无问题项', () => {
        expect(validateDialogSettings(createDefaultSystemDialogSettings())).toEqual([])
    })

    it('数值越界逐项记录，且字段范围与界面 min/max 一致', () => {
        expect(SYSTEM_SETTING_NUMBER_LIMITS).toEqual({
            autoSaveInterval: { min: 10, max: 300 },
            recentFilesCount: { min: 5, max: 20 },
            fontSize: { min: 12, max: 20 },
            backupInterval: { min: 1, max: 72 },
            backupCount: { min: 1, max: 10 }
        })

        const issues = validateDialogSettings({
            ...createDefaultSystemDialogSettings(),
            fontSize: 99,
            backupCount: 0
        })
        expect(issues.map((issue) => issue.field).sort()).toEqual(['backupCount', 'fontSize'])
        expect(issues.find((issue) => issue.field === 'fontSize')?.reason).toContain('12~20')
        expect(issues.find((issue) => issue.field === 'backupCount')?.reason).toContain('1~10')
    })

    it('非有限数字与未知语言选项同样记录', () => {
        const issues = validateDialogSettings({
            ...createDefaultSystemDialogSettings(),
            autoSaveInterval: Number.NaN,
            language: 'ja'
        })
        expect(issues.map((issue) => issue.field).sort()).toEqual(['autoSaveInterval', 'language'])
    })
})
