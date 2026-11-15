/**
 * editor-setting.ts 单元测试
 * 覆盖：默认值、懒初始化写入存储、保存/读取往返、重置、对象引用别名行为
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// 顶层 mock：electron（app-paths 通过 app.getPath('home') 取用户目录）
const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: { home: `${base}/baize-vitest-editor-setting/home` } as Record<string, string>,
        packaged: false,
        appPath: `${base}/baize-vitest-editor-setting/app`
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => electronState.paths[name]),
        getAppPath: vi.fn(() => electronState.appPath),
        get isPackaged() {
            return electronState.packaged
        }
    },
    BrowserWindow: class {}
}))

// 顶层 mock：electron-store 使用内存替身
vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})

// theme-config → theme-registry 依赖 @electron-toolkit/utils（ESM），
// 未 mock 会真实加载 electron 导致测试环境崩溃
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

import { FakeStore } from './helpers/fake-store'
import {
    getEditorSetting,
    saveEditorSetting,
    resetEditorSetting,
    getDefaultEditorSetting,
    mapRendererSettingsToEditorSetting,
    getRendererEditorConfig,
    applyRendererEditorConfig,
    migrateRendererEditorConfig
} from '../../src/main/config/editor-setting'

describe('editor-setting', () => {
    beforeEach(() => {
        FakeStore.resetAll()
    })

    describe('default values', () => {
        it('should return the hardcoded default editor setting on first access', () => {
            const setting = getEditorSetting()
            // 基础显示配置
            expect(setting.fontSize).toBe(15)
            expect(setting.fontFamily).toBe('Hack')
            expect(setting.wordWrap).toBe('on')
            expect(setting.lineNumbers).toBe('on')
            expect(setting.minimap).toBe(false)
            expect(setting.tabSize).toBe(4)
            expect(setting.insertSpaces).toBe(true)
            expect(setting.wordWrapColumn).toBe(80)
            expect(setting.ariaLabel).toBe('白泽笔记编辑器')
            expect(setting.lineHeight).toBe(0)
            // 空白和折叠
            expect(setting.renderWhitespace).toBe('all')
            expect(setting.folding).toBe(true)
            expect(setting.foldingMaximumRegions).toBe(5000)
            // 光标配置
            expect(setting.cursorBlinking).toBe('smooth')
            expect(setting.cursorWidth).toBe(0)
            expect(setting.stopRenderingLineAfter).toBe(-1)
            // 自动完成
            expect(setting.quickSuggestions).toBe(true)
            expect(setting.acceptSuggestionOnEnter).toBe('on')
            // 括号和引号
            expect(setting.autoClosingBrackets).toBe('languageDefined')
            expect(setting.autoIndent).toBe('advanced')
            // 嵌套配置
            expect(setting.hover).toEqual({ enabled: true, delay: 300, sticky: false })
            expect(setting.gotoLocation.multiple).toBe('goto')
            expect(setting.scrollbar.vertical).toBe('auto')
            expect(setting.stickyScroll).toEqual({ enabled: false, maxLineCount: 5 })
            expect(setting.find.highlightFindMatches).toBe(true)
            expect(setting.guides).toEqual({
                indentation: true,
                bracketPairs: false,
                highlightActiveIndentation: true
            })
            expect(setting.bracketPairColorization).toEqual({ enabled: true })
            expect(setting.unicodeHighlight.invisibleCharacters).toBe(true)
            // 其他配置
            expect(setting.matchingBrackets).toBe('always')
            expect(setting.renderFinalNewline).toBe('on')
            expect(setting.trimAutoWhitespace).toBe(true)
            expect(setting.codeLens).toBe(false)
            expect(setting.lineDecorationsWidth).toBe(10)
            expect(setting.overviewRulerLanes).toBe(1)
            expect(setting.rulers).toEqual([])
            expect(setting.maximizedScrollbar).toBe(false)
            expect(setting.ariaHeaderMessage).toBeUndefined()
        })

        it('should persist the default setting into the store on first access', () => {
            getEditorSetting()
            // 首次访问后 defaultEditorSetting 应已写入存储
            expect(FakeStore.data.get('editor-setting')?.has('editorSetting')).toBe(true)
        })

        it('should return the same default object reference on repeated calls', () => {
            expect(getDefaultEditorSetting()).toBe(getDefaultEditorSetting())
        })
    })

    describe('save / get roundtrip', () => {
        it('should save a modified setting and return it', () => {
            const custom = {
                ...getDefaultEditorSetting(),
                fontSize: 22,
                wordWrap: 'off' as const,
                tabSize: 2
            }
            saveEditorSetting(custom)
            const loaded = getEditorSetting()
            expect(loaded.fontSize).toBe(22)
            expect(loaded.wordWrap).toBe('off')
            expect(loaded.tabSize).toBe(2)
            // 未修改字段保持默认
            expect(loaded.fontFamily).toBe('Hack')
            expect(loaded.lineNumbers).toBe('on')
        })

        it('should overwrite the previous saved setting', () => {
            saveEditorSetting({ ...getDefaultEditorSetting(), fontSize: 30 })
            saveEditorSetting({ ...getDefaultEditorSetting(), fontSize: 18 })
            expect(getEditorSetting().fontSize).toBe(18)
        })

        it('should reset back to defaults', () => {
            saveEditorSetting({ ...getDefaultEditorSetting(), fontSize: 30, minimap: true })
            resetEditorSetting()
            const loaded = getEditorSetting()
            expect(loaded.fontSize).toBe(15)
            expect(loaded.minimap).toBe(false)
            expect(loaded).toEqual(getDefaultEditorSetting())
        })
    })

    describe('reference aliasing behavior', () => {
        it('should return the same object reference as the stored value', () => {
            // 首次访问时写入的是 defaultEditorSetting 的引用
            expect(getEditorSetting()).toBe(getDefaultEditorSetting())
        })

        it('should reflect in-place mutation of the returned object (no deep clone)', () => {
            const setting = getEditorSetting()
            const original = setting.fontSize
            setting.fontSize = 99
            expect(getEditorSetting().fontSize).toBe(99)
            // 恢复现场，避免污染其他用例
            setting.fontSize = original
            expect(getEditorSetting().fontSize).toBe(original)
        })
    })

    // P1-FE-05：渲染层 EditorSettingDialog 形状 ↔ Monaco EditorSetting 映射
    describe('renderer dialog config mapping (FE-05)', () => {
        it('maps renderer dialog fields onto the matching Monaco options', () => {
            const base = getDefaultEditorSetting()
            const mapped = mapRendererSettingsToEditorSetting(
                {
                    fontSize: 18,
                    lineHeight: 1.5,
                    showLineNumbers: false,
                    enableFolding: false,
                    enableAutoComplete: false,
                    cursorStyle: 'block',
                    cursorWidth: 3
                },
                base
            )
            expect(mapped.fontSize).toBe(18)
            // 对话框行高是倍数，Monaco 需要像素：18 × 1.5 = 27
            expect(mapped.lineHeight).toBe(27)
            expect(mapped.lineNumbers).toBe('off')
            expect(mapped.folding).toBe(false)
            expect(mapped.quickSuggestions).toBe(false)
            expect(mapped.cursorStyle).toBe('block')
            expect(mapped.cursorWidth).toBe(3)
            // 未参与映射的字段保持原值（不整体覆盖、不丢字段）
            expect(mapped.fontFamily).toBe(base.fontFamily)
            expect(mapped.tabSize).toBe(base.tabSize)
        })

        it('maps the blink cursor option to cursorBlinking', () => {
            const mapped = mapRendererSettingsToEditorSetting(
                { cursorStyle: 'blink' },
                getDefaultEditorSetting()
            )
            expect(mapped.cursorBlinking).toBe('blink')
        })

        it('ignores renderer-only fields that have no Monaco counterpart', () => {
            const base = getDefaultEditorSetting()
            const mapped = mapRendererSettingsToEditorSetting(
                {
                    enableLivePreview: false,
                    previewDelay: 999,
                    enableCodeHighlight: false,
                    maxFileSize: 42,
                    enableExperimental: true
                },
                base
            )
            expect(mapped).toEqual(base)
        })

        it('persists the mapped values into the editorSetting store key', () => {
            applyRendererEditorConfig({ fontSize: 20, showLineNumbers: false })
            const stored = FakeStore.data.get('editor-setting')?.get('editorSetting') as
                Record<string, unknown> | undefined
            expect(stored?.fontSize).toBe(20)
            expect(stored?.lineNumbers).toBe('off')
            // 唯一真源：不再写 rendererEditorConfig 双轨键
            expect(FakeStore.data.get('editor-setting')?.has('rendererEditorConfig')).toBe(false)
        })

        it('reads back the renderer dialog shape from the stored Monaco setting', () => {
            applyRendererEditorConfig({
                fontSize: 18,
                lineHeight: 1.5,
                showLineNumbers: false,
                enableFolding: false,
                enableAutoComplete: false,
                cursorStyle: 'block',
                cursorWidth: 4
            })
            const renderer = getRendererEditorConfig()
            expect(renderer.fontSize).toBe(18)
            expect(renderer.lineHeight).toBe(1.5)
            expect(renderer.showLineNumbers).toBe(false)
            expect(renderer.enableFolding).toBe(false)
            expect(renderer.enableAutoComplete).toBe(false)
            expect(renderer.cursorStyle).toBe('block')
            expect(renderer.cursorWidth).toBe(4)
        })

        it('falls back to dialog-friendly defaults for auto lineHeight/cursorWidth', () => {
            // 默认 EditorSetting：lineHeight=0（自动）、cursorWidth=0（默认宽度）
            const renderer = getRendererEditorConfig()
            expect(renderer.lineHeight).toBe(1.6)
            expect(renderer.cursorWidth).toBe(2)
            expect(renderer.fontSize).toBe(15)
        })

        it('migrates the legacy rendererEditorConfig key into editorSetting and deletes it', () => {
            getEditorSetting() // 确保 store 已创建并写入 editorSetting
            const storeData = FakeStore.data.get('editor-setting')!
            storeData.set('rendererEditorConfig', {
                fontSize: 21,
                lineHeight: 1.5,
                showLineNumbers: false
            })

            migrateRendererEditorConfig()

            expect(storeData.has('rendererEditorConfig')).toBe(false)
            expect(getEditorSetting().fontSize).toBe(21)
            expect(getEditorSetting().lineNumbers).toBe('off')
            expect(getRendererEditorConfig().lineHeight).toBe(1.5)
        })

        it('is a no-op when there is no legacy rendererEditorConfig key', () => {
            const before = getEditorSetting().fontSize
            migrateRendererEditorConfig()
            expect(getEditorSetting().fontSize).toBe(before)
        })
    })
})
