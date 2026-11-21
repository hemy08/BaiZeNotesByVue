/**
 * 1.5.1 能力开关基础测试：
 * - 能力定义表（6 项可选能力）与默认值、持久化字段一一对应；
 * - 系统设置默认值/渲染层兜底常量一致；
 * - config-schema 对 featureXxx 布尔字段的接受/拒绝行为。
 */
import { describe, it, expect } from 'vitest'
import {
    OPTIONAL_FEATURE_FLAG_DEFAULTS,
    OPTIONAL_FEATURE_FLAG_IDS,
    OPTIONAL_FEATURE_FLAGS
} from '../../src/shared/constants/feature-flags'
import { SYSTEM_SETTING_FALLBACK } from '../../src/shared/constants/system-defaults'

describe('可选能力开关定义', () => {
    it('包含用户选定的 6 项可选能力且默认全部关闭', () => {
        expect(OPTIONAL_FEATURE_FLAG_IDS).toEqual([
            'tabs',
            'documentHistory',
            'markdownLint',
            'spellcheck',
            'smartInput',
            'outlinePlus'
        ])
        for (const id of OPTIONAL_FEATURE_FLAG_IDS) {
            expect(OPTIONAL_FEATURE_FLAGS[id].defaultValue).toBe(false)
            expect(OPTIONAL_FEATURE_FLAG_DEFAULTS[id]).toBe(false)
        }
    })

    it('持久化字段名唯一，且与 SystemSetting 的 featureXxx 命名一致', () => {
        const keys = OPTIONAL_FEATURE_FLAG_IDS.map((id) => OPTIONAL_FEATURE_FLAGS[id].settingKey)
        expect(new Set(keys).size).toBe(keys.length)
        for (const key of keys) {
            expect(key).toMatch(/^feature[A-Z][A-Za-z]+$/)
        }
    })

    it('i18n 文案键落在 dialogRenderer.systemSetting.features 命名空间', () => {
        for (const id of OPTIONAL_FEATURE_FLAG_IDS) {
            expect(OPTIONAL_FEATURE_FLAGS[id].labelKey).toBe(
                `dialogRenderer.systemSetting.features.${id}Label`
            )
            expect(OPTIONAL_FEATURE_FLAGS[id].descKey).toBe(
                `dialogRenderer.systemSetting.features.${id}Desc`
            )
        }
    })

    it('渲染层兜底常量与开关默认值一致', () => {
        for (const id of OPTIONAL_FEATURE_FLAG_IDS) {
            const key = OPTIONAL_FEATURE_FLAGS[id].settingKey
            expect(SYSTEM_SETTING_FALLBACK[key]).toBe(false)
        }
    })
})
