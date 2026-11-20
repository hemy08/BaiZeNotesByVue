/**
 * preview-highlight.ts 单元测试（P1-8：highlight.js 全量语言裁剪）
 *
 * 覆盖：
 * 1. 精选语言全部注册、常用别名可解析（js/ts/html/text/yml/sh/toml/c++/cs/docker/md）；
 * 2. 全量入口才有的冷门语言未注册（体积/注册耗时裁剪的回归防线）；
 * 3. 语言定义可正常高亮（保证 core 实例注册链路正确，而非仅写进列表）。
 */
import { describe, it, expect } from 'vitest'
import hljs from '../../src/renderer/src/components/Markdown/preview-highlight'

/** P1-8 白名单（与 preview-highlight.ts 的 HIGHLIGHT_LANGUAGES 保持一致） */
const CURATED_LANGUAGES = [
    'actionscript',
    'bash',
    'c',
    'cpp',
    'csharp',
    'css',
    'diff',
    'dockerfile',
    'go',
    'ini',
    'java',
    'javascript',
    'json',
    'kotlin',
    'markdown',
    'php',
    'plaintext',
    'python',
    'ruby',
    'rust',
    'sql',
    'swift',
    'typescript',
    'xml',
    'yaml'
]

describe('preview-highlight（P1-8 hljs 语言裁剪）', () => {
    it('should register the curated language set', () => {
        const registered = hljs.listLanguages()
        for (const language of CURATED_LANGUAGES) {
            expect(registered).toContain(language)
        }
        // 只注册白名单语言，不残留其它语言
        expect(registered.length).toBe(CURATED_LANGUAGES.length)
    })

    it('should resolve common aliases used by note code fences', () => {
        for (const alias of [
            'js',
            'jsx',
            'ts',
            'html',
            'text',
            'txt',
            'yml',
            'sh',
            'toml',
            'c++',
            'cs',
            'docker',
            'md',
            'rb',
            'kt'
        ]) {
            expect(hljs.getLanguage(alias), `alias ${alias} 应可解析`).toBeTruthy()
        }
    })

    it('should not register languages outside the curated set (bundle size guard)', () => {
        for (const language of ['haskell', 'elixir', 'erlang', 'scala', 'perl', 'lua', 'matlab']) {
            expect(hljs.getLanguage(language), `冷门语言 ${language} 不应注册`).toBeFalsy()
        }
    })

    it('should highlight curated languages with expected token classes', () => {
        const javascriptHtml = hljs.highlight('const answer = 42', {
            language: 'javascript'
        }).value
        expect(javascriptHtml).toContain('hljs-keyword')

        const pythonHtml = hljs.highlight('def foo():\n    return 1', {
            language: 'python'
        }).value
        expect(pythonHtml).toContain('hljs-keyword')

        const jsonHtml = hljs.highlight('{"a": 1}', { language: 'json' }).value
        expect(jsonHtml).toContain('hljs-attr')
    })
})
