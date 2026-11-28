/**
 * system-setting/model.ts 纯函数单元测试（设置页拆分 P0）
 *
 * 覆盖点：
 * 1. 默认值工厂：42 字段与 shared SYSTEM_SETTING_FALLBACK 真源一致、语言按下拉展示值归一化、
 *    工作区模式默认 traditional（1.5.7 LLM Wiki L1，真源 shared/constants/workspace-mode）；
 * 2. mergeStoredSystemSettings：只合并「已定义且类型一致」字段、忽略未知/错误类型、不改入参、
 *    工作区模式非法值归一化（5.7 LLM Wiki）；
 * 3. normalizeLanguageSelection：历史值归一化（zh-cn / en-* / 非法值）；
 * 4. isSystemSettingsDirty：字段级脏标记（新增，供 composable 契约使用）；
 * 5. validateDialogSettings：界面输入范围/语言枚举/工作区模式枚举的诊断校验（不阻断保存）。
 */
import { describe, it, expect } from 'vitest'

import { SYSTEM_SETTING_FALLBACK } from '../../src/shared/constants/system-defaults'
import { DEFAULT_WORKSPACE_MODE } from '../../src/shared/constants/workspace-mode'
import {
    createDefaultSystemDialogSettings,
    isSystemSettingsDirty,
    isWorkspaceMode,
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
    // 1.5.7 LLM Wiki L1：工作区模式（traditional / llm-wiki）
    'workspaceMode',
    'defaultFilePath',
    'autoSaveEnabled',
    'autoSaveInterval',
    'recentFilesCount',
    'appTheme',
    'useSystemTheme',
    // 视觉升级（P0）：界面风格 / 界面密度 / 减少透明效果
    'uiStyle',
    'uiDensity',
    'uiReduceTransparency',
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
    'featureNonModalDialogs',
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
    it('应返回完整 42 字段，且值来自 shared SYSTEM_SETTING_FALLBACK 真源', () => {
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

    it('工作区模式默认 traditional（1.5.7 LLM Wiki L1：真源 shared/constants/workspace-mode）', () => {
        const defaults = createDefaultSystemDialogSettings()
        expect(defaults.workspaceMode).toBe(DEFAULT_WORKSPACE_MODE)
        expect(defaults.workspaceMode).toBe('traditional')
    })

    it('视觉升级三项外观默认值 = workbench + default + 不减少透明（升级前观感）', () => {
        const defaults = createDefaultSystemDialogSettings()
        expect(defaults.uiStyle).toBe('workbench')
        expect(defaults.uiDensity).toBe('default')
        expect(defaults.uiReduceTransparency).toBe(false)
        expect(defaults.uiStyle).toBe(SYSTEM_SETTING_FALLBACK.uiStyle)
        expect(defaults.uiDensity).toBe(SYSTEM_SETTING_FALLBACK.uiDensity)
        expect(defaults.uiReduceTransparency).toBe(SYSTEM_SETTING_FALLBACK.uiReduceTransparency)
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

    it('合并视觉升级三项外观字段（类型一致才覆盖，字符串枚举由主进程 schema 兜底）', () => {
        const current = createDefaultSystemDialogSettings()
        const merged = mergeStoredSystemSettings(current, {
            uiStyle: 'glass',
            uiDensity: 'compact',
            uiReduceTransparency: true
        })
        expect(merged.uiStyle).toBe('glass')
        expect(merged.uiDensity).toBe('compact')
        expect(merged.uiReduceTransparency).toBe(true)
        // 类型不一致时保持默认值（不做运行时枚举校验，主进程 AS-4 才是强制校验）
        const ignored = mergeStoredSystemSettings(current, {
            uiStyle: 42,
            uiDensity: null,
            uiReduceTransparency: 'true'
        })
        expect(ignored.uiStyle).toBe('workbench')
        expect(ignored.uiDensity).toBe('default')
        expect(ignored.uiReduceTransparency).toBe(false)
    })

    // 1.5.7 LLM Wiki L1：工作区模式枚举合并 + 非法值归一化（防御损坏配置/旧版本主进程）
    it('合并工作区模式：合法枚举覆盖，非法/错误类型回落默认 traditional', () => {
        const current = createDefaultSystemDialogSettings()
        expect(
            mergeStoredSystemSettings(current, { workspaceMode: 'llm-wiki' }).workspaceMode
        ).toBe('llm-wiki')
        expect(
            mergeStoredSystemSettings(current, { workspaceMode: 'traditional' }).workspaceMode
        ).toBe('traditional')
        // 非法字符串：类型一致会先被并入，随后由枚举归一化回落默认值
        expect(mergeStoredSystemSettings(current, { workspaceMode: 'bogus' }).workspaceMode).toBe(
            DEFAULT_WORKSPACE_MODE
        )
        // 错误类型：类型不一致直接忽略，保持当前值
        expect(mergeStoredSystemSettings(current, { workspaceMode: 42 }).workspaceMode).toBe(
            DEFAULT_WORKSPACE_MODE
        )
        expect(mergeStoredSystemSettings(current, { workspaceMode: null }).workspaceMode).toBe(
            DEFAULT_WORKSPACE_MODE
        )
    })

    it('isWorkspaceMode：仅接受 shared 枚举值（traditional / llm-wiki）', () => {
        expect(isWorkspaceMode('traditional')).toBe(true)
        expect(isWorkspaceMode('llm-wiki')).toBe(true)
        for (const value of ['LLM-Wiki', 'llm wiki', '', null, undefined, 1, {}]) {
            expect(isWorkspaceMode(value)).toBe(false)
        }
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

    // 1.5.7 LLM Wiki L1：工作区模式枚举诊断（界面下拉只有两个选项，仅防御注入/损坏值）
    it('未知工作区模式记录为诊断问题（不阻断保存）', () => {
        const issues = validateDialogSettings({
            ...createDefaultSystemDialogSettings(),
            workspaceMode: 'bogus' as unknown as SystemDialogSettings['workspaceMode']
        })
        expect(issues.map((issue) => issue.field)).toEqual(['workspaceMode'])
        expect(issues[0].reason).toContain('bogus')
        // 合法枚举不产生问题项
        expect(
            validateDialogSettings({
                ...createDefaultSystemDialogSettings(),
                workspaceMode: 'llm-wiki'
            })
        ).toEqual([])
    })
})
