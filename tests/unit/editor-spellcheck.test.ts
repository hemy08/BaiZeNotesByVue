// @vitest-environment jsdom
/**
 * A6 拼写检查（opt-in）单测：
 * 覆盖开启时 textarea 获得 spellcheck="true"/lang、关闭时恢复 spellcheck="false"
 * 且移除 lang（不保留开启态属性）、多 textarea、编辑器未就绪/无 DOM 的安全降级，
 * 以及语言回退规则。真实拼写词典由 Chromium/操作系统提供，本模块不引入词典依赖。
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
    applyEditorSpellcheck,
    applySpellcheckToRoot,
    applySpellcheckToTextarea,
    resolveSpellcheckLanguage,
    SPELLCHECK_LANG_FALLBACK
} from '../../src/renderer/src/components/Markdown/editor-spellcheck'

/** 构造带 Monaco 输入 textarea 的编辑器 DOM 根节点 */
function createEditorRoot(): HTMLElement {
    const root = document.createElement('div')
    const textarea = document.createElement('textarea')
    textarea.className = 'inputarea'
    root.appendChild(textarea)
    return root
}

describe('applySpellcheckToTextarea', () => {
    it('开启：spellcheck=true 且写入 lang', () => {
        const textarea = document.createElement('textarea')
        applySpellcheckToTextarea(textarea, true, 'zh-CN')
        expect(textarea.getAttribute('spellcheck')).toBe('true')
        expect(textarea.getAttribute('lang')).toBe('zh-CN')
        expect(textarea.spellcheck).toBe(true)
    })

    it('关闭：spellcheck=false 且移除 lang（不保留开启态属性）', () => {
        const textarea = document.createElement('textarea')
        applySpellcheckToTextarea(textarea, true, 'en-US')
        applySpellcheckToTextarea(textarea, false)
        expect(textarea.getAttribute('spellcheck')).toBe('false')
        expect(textarea.hasAttribute('lang')).toBe(false)
        expect(textarea.spellcheck).toBe(false)
    })
})

describe('applySpellcheckToRoot', () => {
    it('对根节点下全部 textarea 生效并返回命中数量', () => {
        const root = createEditorRoot()
        root.appendChild(document.createElement('textarea'))
        expect(applySpellcheckToRoot(root, true, 'zh-CN')).toBe(2)
        const textareas = Array.from(root.querySelectorAll('textarea'))
        for (const textarea of textareas) {
            expect(textarea.getAttribute('spellcheck')).toBe('true')
            expect(textarea.getAttribute('lang')).toBe('zh-CN')
        }
    })

    it('无 textarea / 空根节点返回 0', () => {
        expect(applySpellcheckToRoot(document.createElement('div'), true)).toBe(0)
        expect(applySpellcheckToRoot(null, true)).toBe(0)
        expect(applySpellcheckToRoot(undefined, true)).toBe(0)
    })

    it('开关来回切换：开启态属性可被完整撤销', () => {
        const root = createEditorRoot()
        applySpellcheckToRoot(root, true, 'zh-CN')
        applySpellcheckToRoot(root, false)
        const textarea = root.querySelector('textarea')!
        expect(textarea.getAttribute('spellcheck')).toBe('false')
        expect(textarea.hasAttribute('lang')).toBe(false)

        applySpellcheckToRoot(root, true, 'zh-CN')
        expect(textarea.getAttribute('spellcheck')).toBe('true')
        expect(textarea.getAttribute('lang')).toBe('zh-CN')
    })
})

describe('applyEditorSpellcheck（Monaco 编辑器适配）', () => {
    it('通过 editor.getDomNode() 命中 textarea', () => {
        const root = createEditorRoot()
        const editor = { getDomNode: () => root }
        expect(applyEditorSpellcheck(editor, true, 'zh-CN')).toBe(1)
        expect(root.querySelector('textarea')!.getAttribute('spellcheck')).toBe('true')
    })

    it('编辑器为空 / 无 getDomNode / getDomNode 抛错时安全返回 0', () => {
        expect(applyEditorSpellcheck(null, true)).toBe(0)
        expect(applyEditorSpellcheck(undefined, true)).toBe(0)
        expect(applyEditorSpellcheck({}, true)).toBe(0)
        expect(
            applyEditorSpellcheck(
                {
                    getDomNode: () => {
                        throw new Error('editor disposed')
                    }
                },
                true
            )
        ).toBe(0)
        expect(applyEditorSpellcheck({ getDomNode: () => null }, true)).toBe(0)
    })
})

describe('resolveSpellcheckLanguage', () => {
    afterEach(() => {
        // 撤销测试对 navigator.language 的临时改写
        Reflect.deleteProperty(navigator, 'language')
    })

    /** 临时改写 navigator.language（jsdom 下原型 getter 不可直接 spyOn） */
    function stubNavigatorLanguage(value: string): void {
        Object.defineProperty(navigator, 'language', { configurable: true, get: () => value })
    }

    it('优先使用 navigator.language', () => {
        stubNavigatorLanguage('en-US')
        expect(resolveSpellcheckLanguage()).toBe('en-US')
    })

    it('取不到语言时回落默认值', () => {
        stubNavigatorLanguage('')
        expect(resolveSpellcheckLanguage()).toBe(SPELLCHECK_LANG_FALLBACK)
    })
})
