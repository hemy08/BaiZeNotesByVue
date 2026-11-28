/**
 * AS-4：配置写入白名单 + 字段级 schema 校验（src/main/config/config-schema.ts）单元测试
 *
 * 覆盖：
 * - 配置名白名单（system/theme/editor/quick-links/quickLinks/backup/recent-folders/show-welcome）；
 * - fontFamily CSS 注入拦截与安全字符集；
 * - system/theme/editor 的类型/枚举/范围校验（超范围钳制、未知字段丢弃、非法值整体拒绝）；
 * - quick-links/recent-folders/show-welcome 的结构与条目校验；
 * - validateConfigData 的按名路由与 backup 命令放行。
 *
 * 说明：theme-config 被轻量替换（themes 注册表 + isKnownThemeType），
 * 避免拉起 electron-store / 主题文件扫描依赖链；本测试只验证 schema 逻辑本身。
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/main/config/theme-config', () => {
    const themes = {
        baize: { name: '白泽紫韵' },
        dark: { name: '深邃夜空' }
    }
    const isKnownThemeType = (value: unknown): boolean =>
        typeof value === 'string' && Object.prototype.hasOwnProperty.call(themes, value)
    return { themes, isKnownThemeType }
})

import {
    ALLOWED_CONFIG_NAMES,
    clampFontSize,
    DEFAULT_FONT_FAMILY,
    isAllowedConfigName,
    isMainProcessOnlyConfigName,
    sanitizeFontFamily,
    validateConfigData,
    validateEditorConfig,
    validateQuickLinksConfig,
    validateRecentFoldersConfig,
    validateShowWelcomeConfig,
    validateSystemConfig,
    validateThemeConfig
} from '../../src/main/config/config-schema'

describe('AS-4 config name whitelist', () => {
    it('should allow only known config names', () => {
        for (const name of [
            'system',
            'theme',
            'editor',
            'quick-links',
            'quickLinks',
            'backup',
            'recent-folders',
            'show-welcome'
        ]) {
            expect(isAllowedConfigName(name), name).toBe(true)
        }
        expect(ALLOWED_CONFIG_NAMES.size).toBe(8)
    })

    it('should reject unknown / non-string config names', () => {
        for (const name of ['evil', 'rendererEditorConfig', '../system', '', null, 42, {}]) {
            expect(isAllowedConfigName(name), String(name)).toBe(false)
        }
    })

    // P1-1（工作区受信根来源收敛）：recent-folders 仍是可读白名单，但仅主进程可写
    it('should mark recent-folders as main-process-only writable', () => {
        expect(isMainProcessOnlyConfigName('recent-folders')).toBe(true)
        expect(isMainProcessOnlyConfigName('show-welcome')).toBe(false)
        expect(isMainProcessOnlyConfigName('system')).toBe(false)
        expect(isMainProcessOnlyConfigName(undefined)).toBe(false)
        // 可读白名单仍包含 recent-folders（欢迎页展示需要 config:read）
        expect(isAllowedConfigName('recent-folders')).toBe(true)
    })
})

describe('AS-4 sanitizeFontFamily', () => {
    it('should accept the default font list and common families', () => {
        expect(sanitizeFontFamily(DEFAULT_FONT_FAMILY)).toBe(DEFAULT_FONT_FAMILY)
        expect(sanitizeFontFamily('"Microsoft YaHei", sans-serif')).toBe(
            '"Microsoft YaHei", sans-serif'
        )
        expect(sanitizeFontFamily('微软雅黑')).toBe('微软雅黑')
    })

    it('should reject CSS injection payloads', () => {
        const payloads = [
            'x; } body { background: url("https://attacker/t.png") } /*',
            'Arial; } .x { display:none',
            'Arial{}',
            'url(https://attacker)',
            'Arial/**/',
            'Arial\\65',
            'Arial\nBody',
            ''
        ]
        for (const payload of payloads) {
            expect(sanitizeFontFamily(payload), JSON.stringify(payload)).toBeNull()
        }
    })

    it('should reject non-string / overlong values', () => {
        expect(sanitizeFontFamily(null)).toBeNull()
        expect(sanitizeFontFamily(42)).toBeNull()
        expect(sanitizeFontFamily('A'.repeat(201))).toBeNull()
    })

    it('should clamp font size into the safe range', () => {
        expect(clampFontSize(999)).toBe(72)
        expect(clampFontSize(1)).toBe(8)
        expect(clampFontSize(13.4)).toBe(13)
        expect(clampFontSize(Number.NaN)).toBe(13)
        expect(clampFontSize('16')).toBe(13)
    })
})

describe('AS-4 validateSystemConfig', () => {
    it('should reject non-object payloads', () => {
        for (const payload of [undefined, null, 42, 'x', [1, 2]]) {
            expect(validateSystemConfig(payload).ok).toBe(false)
        }
    })

    it('should accept the dialog-shaped payload and drop unknown fields', () => {
        const result = validateSystemConfig({
            language: 'zh-CN',
            menuBarStyle: 'windows-native',
            autoSaveEnabled: false,
            autoSaveInterval: 120,
            fontFamily: 'Consolas',
            fontSize: 14,
            recentFilesCount: 15,
            unknownKey: 'payload'
        })
        expect(result.ok).toBe(true)
        const value = result.value as Record<string, unknown>
        expect(value.language).toBe('zh-CN')
        expect(value.menuBarStyle).toBe('windows-native')
        expect(value.autoSaveInterval).toBe(120)
        expect(value.unknownKey).toBeUndefined()
        expect(result.adjusted).toEqual([expect.stringContaining('unknownKey')])
    })

    // P2 死配置字段清理：checkUpdateOnStart 已无消费方，从字段白名单移除——
    // 历史渲染层若仍提交该字段，按「未知系统设置字段」丢弃（ok=true，不写坏 store）。
    it('should drop the deprecated checkUpdateOnStart field as unknown (P2 dead config)', () => {
        const result = validateSystemConfig({ checkUpdateOnStart: true, language: 'zh-cn' })
        expect(result.ok).toBe(true)
        expect((result.value as Record<string, unknown>).checkUpdateOnStart).toBeUndefined()
        expect(result.adjusted).toEqual([expect.stringContaining('checkUpdateOnStart')])
    })

    it('should reject CSS-injection fontFamily as a whole write', () => {
        const result = validateSystemConfig({
            language: 'zh-CN',
            fontFamily: 'x; } body { background: url("https://evil") } /*'
        })
        expect(result.ok).toBe(false)
        expect(result.reason).toContain('fontFamily')
    })

    it('should clamp numeric ranges and drop invalid enum/type values', () => {
        const result = validateSystemConfig({
            fontSize: 999,
            autoSaveInterval: 1,
            backupCount: 0,
            menuBarStyle: 'evil-style',
            autoSaveEnabled: 'yes'
        })
        expect(result.ok).toBe(true)
        const value = result.value as Record<string, unknown>
        expect(value.fontSize).toBe(72)
        expect(value.autoSaveInterval).toBe(5)
        expect(value.backupCount).toBe(1)
        expect(value.menuBarStyle).toBeUndefined()
        expect(value.autoSaveEnabled).toBeUndefined()
        expect(result.adjusted?.length).toBeGreaterThanOrEqual(4)
    })

    // AS-9：远程图片隐私开关是布尔字段——true/false 均可写入，非布尔值丢弃（不写坏 store）
    it('should accept the allowRemoteImages boolean and drop non-boolean values (AS-9)', () => {
        const accepted = validateSystemConfig({ allowRemoteImages: true, language: 'zh-CN' })
        expect(accepted.ok).toBe(true)
        expect((accepted.value as Record<string, unknown>).allowRemoteImages).toBe(true)

        const rejected = validateSystemConfig({ allowRemoteImages: 'yes' })
        expect(rejected.ok).toBe(true)
        expect((rejected.value as Record<string, unknown>).allowRemoteImages).toBeUndefined()
        expect(rejected.adjusted).toEqual([expect.stringContaining('allowRemoteImages')])
    })

    // 视觉升级（P0）：界面风格/密度为枚举字段，减少透明为布尔字段——
    // 合法值写入，非法值丢弃并记 adjusted（不写坏 store）。
    it('should accept uiStyle/uiDensity enums and uiReduceTransparency boolean (visual P0)', () => {
        const accepted = validateSystemConfig({
            uiStyle: 'glass',
            uiDensity: 'compact',
            uiReduceTransparency: true,
            language: 'zh-CN'
        })
        expect(accepted.ok).toBe(true)
        const value = accepted.value as Record<string, unknown>
        expect(value.uiStyle).toBe('glass')
        expect(value.uiDensity).toBe('compact')
        expect(value.uiReduceTransparency).toBe(true)

        const rejected = validateSystemConfig({
            uiStyle: 'fancy',
            uiDensity: 'wide',
            uiReduceTransparency: 'yes'
        })
        expect(rejected.ok).toBe(true)
        expect((rejected.value as Record<string, unknown>).uiStyle).toBeUndefined()
        expect((rejected.value as Record<string, unknown>).uiDensity).toBeUndefined()
        expect((rejected.value as Record<string, unknown>).uiReduceTransparency).toBeUndefined()
        expect(rejected.adjusted?.length).toBeGreaterThanOrEqual(3)
    })

    it('should accept every allowed uiStyle/uiDensity value from the shared whitelist', () => {
        for (const uiStyle of ['paper', 'glass', 'workbench', 'hybrid']) {
            const result = validateSystemConfig({ uiStyle })
            expect((result.value as Record<string, unknown>).uiStyle, uiStyle).toBe(uiStyle)
        }
        for (const uiDensity of ['compact', 'default', 'spacious']) {
            const result = validateSystemConfig({ uiDensity })
            expect((result.value as Record<string, unknown>).uiDensity, uiDensity).toBe(uiDensity)
        }
    })

    // 1.5.7 LLM Wiki L1：workspaceMode 为枚举字段（traditional | llm-wiki），
    // 合法值写入；非法值丢弃并记 adjusted（不写坏 store，读取侧回落默认 traditional）。
    it('should accept workspaceMode enum values and drop invalid ones (LLM Wiki L1)', () => {
        for (const workspaceMode of ['traditional', 'llm-wiki']) {
            const result = validateSystemConfig({ workspaceMode })
            expect(result.ok).toBe(true)
            expect((result.value as Record<string, unknown>).workspaceMode, workspaceMode).toBe(
                workspaceMode
            )
            expect(result.adjusted ?? []).toEqual([])
        }

        const rejected = validateSystemConfig({ workspaceMode: 'wiki-only' })
        expect(rejected.ok).toBe(true)
        expect((rejected.value as Record<string, unknown>).workspaceMode).toBeUndefined()
        expect(rejected.adjusted).toEqual([expect.stringContaining('workspaceMode')])

        // 非字符串同样按非法枚举丢弃（不产生写入）
        for (const invalid of [42, null, true, {}]) {
            const dropped = validateSystemConfig({ workspaceMode: invalid })
            expect(dropped.ok).toBe(true)
            expect((dropped.value as Record<string, unknown>).workspaceMode).toBeUndefined()
        }
    })

    // 1.5.2 E6：日常记录开关是布尔字段——true/false 均可写入，非布尔值丢弃（不写坏 store）
    it('should accept the featureDailyNotes boolean and drop non-boolean values (E6)', () => {
        const accepted = validateSystemConfig({ featureDailyNotes: true, language: 'zh-CN' })
        expect(accepted.ok).toBe(true)
        expect((accepted.value as Record<string, unknown>).featureDailyNotes).toBe(true)

        const disabled = validateSystemConfig({ featureDailyNotes: false })
        expect((disabled.value as Record<string, unknown>).featureDailyNotes).toBe(false)

        const rejected = validateSystemConfig({ featureDailyNotes: 'yes' })
        expect(rejected.ok).toBe(true)
        expect((rejected.value as Record<string, unknown>).featureDailyNotes).toBeUndefined()
        expect(rejected.adjusted).toEqual([expect.stringContaining('featureDailyNotes')])
    })

    // 1.5.2 E1：剪贴板剪藏开关是布尔字段——true/false 均可写入，非布尔值丢弃（不写坏 store）
    it('should accept the featureClipCapture boolean and drop non-boolean values (E1)', () => {
        const accepted = validateSystemConfig({ featureClipCapture: true, language: 'zh-CN' })
        expect(accepted.ok).toBe(true)
        expect((accepted.value as Record<string, unknown>).featureClipCapture).toBe(true)

        const disabled = validateSystemConfig({ featureClipCapture: false })
        expect((disabled.value as Record<string, unknown>).featureClipCapture).toBe(false)

        const rejected = validateSystemConfig({ featureClipCapture: 'yes' })
        expect(rejected.ok).toBe(true)
        expect((rejected.value as Record<string, unknown>).featureClipCapture).toBeUndefined()
        expect(rejected.adjusted).toEqual([expect.stringContaining('featureClipCapture')])
    })

    // 1.5.2 E2：PDF 标注与摘录开关是布尔字段——true/false 均可写入，非布尔值丢弃（不写坏 store）
    it('should accept the featurePdfAnnotations boolean and drop non-boolean values (E2)', () => {
        const accepted = validateSystemConfig({ featurePdfAnnotations: true, language: 'zh-CN' })
        expect(accepted.ok).toBe(true)
        expect((accepted.value as Record<string, unknown>).featurePdfAnnotations).toBe(true)

        const disabled = validateSystemConfig({ featurePdfAnnotations: false })
        expect((disabled.value as Record<string, unknown>).featurePdfAnnotations).toBe(false)

        const rejected = validateSystemConfig({ featurePdfAnnotations: 'yes' })
        expect(rejected.ok).toBe(true)
        expect((rejected.value as Record<string, unknown>).featurePdfAnnotations).toBeUndefined()
        expect(rejected.adjusted).toEqual([expect.stringContaining('featurePdfAnnotations')])
    })

    // 1.5.2 E3：图片 OCR 开关是布尔字段——true/false 均可写入，非布尔值丢弃（不写坏 store）
    it('should accept the featureImageOcr boolean and drop non-boolean values (E3)', () => {
        const accepted = validateSystemConfig({ featureImageOcr: true, language: 'zh-CN' })
        expect(accepted.ok).toBe(true)
        expect((accepted.value as Record<string, unknown>).featureImageOcr).toBe(true)

        const disabled = validateSystemConfig({ featureImageOcr: false })
        expect((disabled.value as Record<string, unknown>).featureImageOcr).toBe(false)

        const rejected = validateSystemConfig({ featureImageOcr: 'yes' })
        expect(rejected.ok).toBe(true)
        expect((rejected.value as Record<string, unknown>).featureImageOcr).toBeUndefined()
        expect(rejected.adjusted).toEqual([expect.stringContaining('featureImageOcr')])
    })

    // 1.5.7 LLM Wiki L2：MCP 启用偏好是布尔字段——true/false 均可写入，非布尔值丢弃（不写坏 store）
    it('should accept the mcpEnabled boolean and drop non-boolean values (LLM Wiki L2)', () => {
        const accepted = validateSystemConfig({ mcpEnabled: true, language: 'zh-CN' })
        expect(accepted.ok).toBe(true)
        expect((accepted.value as Record<string, unknown>).mcpEnabled).toBe(true)

        const disabled = validateSystemConfig({ mcpEnabled: false })
        expect((disabled.value as Record<string, unknown>).mcpEnabled).toBe(false)

        const rejected = validateSystemConfig({ mcpEnabled: 'yes' })
        expect(rejected.ok).toBe(true)
        expect((rejected.value as Record<string, unknown>).mcpEnabled).toBeUndefined()
        expect(rejected.adjusted).toEqual([expect.stringContaining('mcpEnabled')])
    })

    // 1.5.7 体验升级批次 C：MCP 首选端口（null/0 = 自动选择；1~65535 为固定端口）
    it('should accept a valid mcpPort, normalize 0 to null, and drop invalid values', () => {
        const accepted = validateSystemConfig({ mcpPort: 4000, language: 'zh-CN' })
        expect(accepted.ok).toBe(true)
        expect((accepted.value as Record<string, unknown>).mcpPort).toBe(4000)

        for (const raw of [null, 0]) {
            const auto = validateSystemConfig({ mcpPort: raw })
            expect(auto.ok).toBe(true)
            expect((auto.value as Record<string, unknown>).mcpPort).toBeNull()
        }

        for (const raw of [-1, 65536, 1.5, '3847', true]) {
            const rejected = validateSystemConfig({ mcpPort: raw })
            expect(rejected.ok).toBe(true)
            expect((rejected.value as Record<string, unknown>).mcpPort, String(raw)).toBeUndefined()
            expect(rejected.adjusted).toEqual([expect.stringContaining('mcpPort')])
        }
    })

    // 批次 A：#4 最近文件列表数量范围收紧为 5~20（越界钳制而非拒绝）
    it('should clamp recentFilesCount into the 5~20 range', () => {
        const low = validateSystemConfig({ recentFilesCount: 2 })
        expect((low.value as Record<string, unknown>).recentFilesCount).toBe(5)
        const high = validateSystemConfig({ recentFilesCount: 99 })
        expect((high.value as Record<string, unknown>).recentFilesCount).toBe(20)
        const ok = validateSystemConfig({ recentFilesCount: 15 })
        expect((ok.value as Record<string, unknown>).recentFilesCount).toBe(15)
    })

    // P3 对齐：backupInterval/backupCount 上限与 UI 输入框（1~72 / 1~10）
    // 及 auto-backup 运行时钳制一致（越界钳制而非拒绝）
    it('should clamp backupInterval to 1~72 and backupCount to 1~10', () => {
        const low = validateSystemConfig({ backupInterval: 0, backupCount: 0 })
        expect((low.value as Record<string, unknown>).backupInterval).toBe(1)
        expect((low.value as Record<string, unknown>).backupCount).toBe(1)

        const high = validateSystemConfig({ backupInterval: 720, backupCount: 50 })
        expect((high.value as Record<string, unknown>).backupInterval).toBe(72)
        expect((high.value as Record<string, unknown>).backupCount).toBe(10)

        const ok = validateSystemConfig({ backupInterval: 24, backupCount: 5 })
        expect((ok.value as Record<string, unknown>).backupInterval).toBe(24)
        expect((ok.value as Record<string, unknown>).backupCount).toBe(5)
    })

    // 批次 A：#5 记住窗口位置和大小——windowBounds 为 null 或合法整数边界对象
    it('should accept null or valid windowBounds objects', () => {
        const cleared = validateSystemConfig({ windowBounds: null })
        expect((cleared.value as Record<string, unknown>).windowBounds).toBeNull()

        const bounds = { x: 10, y: 20, width: 1280, height: 800 }
        const accepted = validateSystemConfig({ windowBounds: bounds })
        expect((accepted.value as Record<string, unknown>).windowBounds).toEqual(bounds)
    })

    it('should drop invalid windowBounds payloads', () => {
        const invalid = validateSystemConfig({
            windowBounds: { x: 'a', y: 2, width: 100, height: 100 }
        })
        expect(invalid.ok).toBe(true)
        expect((invalid.value as Record<string, unknown>).windowBounds).toBeUndefined()
        expect(invalid.adjusted).toEqual([expect.stringContaining('windowBounds')])

        const outOfRange = validateSystemConfig({
            windowBounds: { x: 1e9, y: 2, width: 100, height: 100 }
        })
        expect((outOfRange.value as Record<string, unknown>).windowBounds).toBeUndefined()

        const wrongShape = validateSystemConfig({ windowBounds: '1280x800' })
        expect((wrongShape.value as Record<string, unknown>).windowBounds).toBeUndefined()
    })
})

describe('AS-4 validateThemeConfig', () => {
    it('should accept a known theme and safe monaco id', () => {
        const result = validateThemeConfig({
            currentTheme: 'dark',
            separateEditorTheme: true,
            editorTheme: 'vs-dark'
        })
        expect(result.ok).toBe(true)
        expect(result.value).toEqual({
            currentTheme: 'dark',
            separateEditorTheme: true,
            editorTheme: 'vs-dark'
        })
    })

    it('should reject unknown theme types (would break HTML dialog styling)', () => {
        const result = validateThemeConfig({ currentTheme: 'no-such-theme' })
        expect(result.ok).toBe(false)
        expect(result.reason).toContain('currentTheme')
    })

    it('should reject path-like editorTheme values', () => {
        for (const editorTheme of [
            '../../evil',
            'a/b',
            'a\\b',
            '',
            42,
            'themelist',
            'Fake..Theme',
            'a'.repeat(65)
        ]) {
            expect(validateThemeConfig({ editorTheme }).ok, String(editorTheme)).toBe(false)
        }
    })

    // 2026-11-28 用户反馈「编辑器主题设置不生效」回归：磁盘 Monaco 主题名来自
    // resources/themes/monaco-themes/themes/*.json 的文件名，54 个主题中 21 个含空格/括号
    // （如 "All Hallows Eve"、"Birds of Paradise"、"MagicWB (Amiga)"）。此前校验只允许
    // [A-Za-z0-9_-]，选择这些主题点确定会让整个 theme 配置写入被拒（editorTheme 落不了盘）。
    it('should accept real disk monaco theme names with spaces / parentheses', () => {
        const diskThemeNames = [
            'All Hallows Eve',
            'Birds of Paradise',
            'MagicWB (Amiga)',
            'GitHub Dark',
            'Oceanic Next',
            'Textmate (Mac Classic)',
            'Active4D',
            'vs-dark'
        ]
        for (const editorTheme of diskThemeNames) {
            const result = validateThemeConfig({
                currentTheme: 'baize',
                separateEditorTheme: true,
                editorTheme
            })
            expect(result.ok, editorTheme).toBe(true)
            expect((result.value as Record<string, unknown>).editorTheme).toBe(editorTheme)
        }
    })

    it('should drop unknown theme config fields', () => {
        const result = validateThemeConfig({ currentTheme: 'baize', injected: '<script>' })
        expect(result.ok).toBe(true)
        expect((result.value as Record<string, unknown>).injected).toBeUndefined()
    })
})

describe('AS-4 validateEditorConfig', () => {
    it('should clamp numeric fields and drop invalid enum/unknown fields', () => {
        const result = validateEditorConfig({
            fontSize: 500,
            cursorWidth: 99,
            lineHeight: 0.01,
            cursorStyle: 'evil',
            unknownEditorField: true
        })
        expect(result.ok).toBe(true)
        const value = result.value as Record<string, unknown>
        expect(value.fontSize).toBe(72)
        expect(value.cursorWidth).toBe(10)
        expect(value.lineHeight).toBe(0.5)
        expect(value.cursorStyle).toBeUndefined()
        expect(value.unknownEditorField).toBeUndefined()
    })

    it('should accept valid booleans and enum values', () => {
        const result = validateEditorConfig({
            autoSave: true,
            enableFolding: false,
            cursorStyle: 'block',
            autoSaveInterval: 30
        })
        expect(result.ok).toBe(true)
        expect((result.value as Record<string, unknown>).cursorStyle).toBe('block')
    })

    it('should reject non-object payloads', () => {
        expect(validateEditorConfig('x').ok).toBe(false)
        expect(validateEditorConfig([1]).ok).toBe(false)
    })
})

describe('AS-4 validateQuickLinksConfig', () => {
    it('should reject non-array / missing links payloads', () => {
        expect(validateQuickLinksConfig('x').ok).toBe(false)
        expect(validateQuickLinksConfig({ name: 'x' }).ok).toBe(false)
        expect(validateQuickLinksConfig(null).ok).toBe(false)
    })

    it('should drop invalid entries and keep valid ones', () => {
        const result = validateQuickLinksConfig({
            links: [
                { name: 'GitHub', url: 'https://github.com', icon: '🐙', description: '代码托管' },
                { name: '', url: 'https://evil.test' },
                { name: 'NoUrl', url: '' },
                { name: 'BadType', url: 42 }
            ]
        })
        expect(result.ok).toBe(true)
        const links = (result.value as { links: Array<{ name: string }> }).links
        expect(links).toHaveLength(1)
        expect(links[0].name).toBe('GitHub')
        expect(result.adjusted).toEqual([expect.stringContaining('3 条')])
    })

    it('should reject a too-large links array', () => {
        const links = Array.from({ length: 51 }, (_, index) => ({
            name: `link-${index}`,
            url: 'https://example.com'
        }))
        expect(validateQuickLinksConfig({ links }).ok).toBe(false)
    })

    it('should reject control characters in link fields', () => {
        const result = validateQuickLinksConfig([
            { name: 'bad\u0000name', url: 'https://example.com' },
            { name: 'ok', url: 'https://example.com' }
        ])
        const links = result.value as Array<{ name: string }>
        expect(links).toHaveLength(1)
        expect(links[0].name).toBe('ok')
    })
})

describe('AS-4 validateRecentFoldersConfig / validateShowWelcomeConfig', () => {
    it('should accept only string arrays for recent-folders', () => {
        expect(validateRecentFoldersConfig('C:\\notes').ok).toBe(false)
        const result = validateRecentFoldersConfig(['C:\\notes', 42, '', 'D:\\work'])
        expect(result.ok).toBe(true)
        expect(result.value).toEqual(['C:\\notes', 'D:\\work'])
    })

    it('should cap recent folders count', () => {
        const folders = Array.from({ length: 80 }, (_, index) => `C:\\notes-${index}`)
        const result = validateRecentFoldersConfig(folders)
        expect(result.ok).toBe(true)
        expect((result.value as string[]).length).toBe(50)
    })

    it('should accept only booleans for show-welcome', () => {
        expect(validateShowWelcomeConfig(true)).toEqual({ ok: true, value: true })
        expect(validateShowWelcomeConfig(false)).toEqual({ ok: true, value: false })
        expect(validateShowWelcomeConfig('false').ok).toBe(false)
    })
})

describe('AS-4 validateConfigData routing', () => {
    it('should pass backup commands through (validated by config-backup itself)', () => {
        const result = validateConfigData('backup', { action: 'create', keep: 5 })
        expect(result.ok).toBe(true)
        expect(result.value).toEqual({ action: 'create', keep: 5 })
    })

    it('should reject unknown config names', () => {
        expect(validateConfigData('evil-config', {}).ok).toBe(false)
    })

    it('should route each known config name to its schema', () => {
        expect(validateConfigData('system', 'x').ok).toBe(false)
        expect(validateConfigData('theme', { currentTheme: 'dark' }).ok).toBe(true)
        expect(validateConfigData('editor', { fontSize: 14 }).ok).toBe(true)
        expect(validateConfigData('quickLinks', []).ok).toBe(true)
        expect(validateConfigData('recent-folders', []).ok).toBe(true)
        expect(validateConfigData('show-welcome', true).ok).toBe(true)
    })
})
