import { describe, it, expect, beforeEach, vi } from 'vitest'

// 模拟 monaco-editor：只使用 languages 注册接口
vi.mock('monaco-editor', () => ({
    languages: {
        register: vi.fn(),
        setMonarchTokensProvider: vi.fn(),
        setLanguageConfiguration: vi.fn()
    }
}))

import * as monaco from 'monaco-editor'
import {
    registerPlantUMLLanguage,
    registerMermaidLanguage,
    registerCustomLanguages
} from '../../src/renderer/src/components/Markdown/register-languages'

const languagesMock = vi.mocked(monaco.languages)

describe('registerPlantUMLLanguage', () => {
    beforeEach(() => {
        languagesMock.register.mockClear()
        languagesMock.setMonarchTokensProvider.mockClear()
        languagesMock.setLanguageConfiguration.mockClear()
    })

    it('should register the plantuml language id', () => {
        registerPlantUMLLanguage()
        expect(languagesMock.register).toHaveBeenCalledWith({ id: 'plantuml' })
    })

    it('should install a monarch tokens provider with plantuml keywords', () => {
        registerPlantUMLLanguage()

        expect(languagesMock.setMonarchTokensProvider).toHaveBeenCalledTimes(1)
        const [languageId, provider] = languagesMock.setMonarchTokensProvider.mock.calls[0]
        expect(languageId).toBe('plantuml')

        const cfg = provider as {
            keywords: string[]
            operators: string[]
            symbols: RegExp
            tokenizer: Record<string, unknown>
        }
        // 关键字、操作符、符号正则都应存在
        expect(cfg.keywords).toContain('abstract')
        expect(cfg.keywords).toContain('class')
        expect(cfg.keywords).toContain('namespace')
        expect(cfg.keywords).toContain('interface')
        expect(cfg.operators).toContain('=')
        expect(cfg.operators).toContain('..')
        expect(cfg.operators).toContain('~')
        expect(cfg.symbols.source).toBe('[=><~:]+')
    })

    it('should define root and string tokenizer rules', () => {
        registerPlantUMLLanguage()
        const [, provider] = languagesMock.setMonarchTokensProvider.mock.calls[0]
        const cfg = provider as { tokenizer: Record<string, { length: number }> }

        expect(cfg.tokenizer.root).toBeDefined()
        expect(cfg.tokenizer.root.length).toBeGreaterThan(0)
        expect(cfg.tokenizer.string).toBeDefined()
    })

    it('should install the plantuml bracket configuration', () => {
        registerPlantUMLLanguage()

        expect(languagesMock.setLanguageConfiguration).toHaveBeenCalledTimes(1)
        const [languageId, conf] = languagesMock.setLanguageConfiguration.mock.calls[0]
        expect(languageId).toBe('plantuml')

        const cfg = conf as {
            brackets: [string, string][]
            autoClosingPairs: { open: string; close: string }[]
            surroundingPairs: { open: string; close: string }[]
        }
        expect(cfg.brackets).toEqual([
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ])
        expect(cfg.autoClosingPairs).toContainEqual({ open: '"', close: '"' })
        expect(cfg.autoClosingPairs).toContainEqual({ open: "'", close: "'" })
        expect(cfg.autoClosingPairs).toHaveLength(5)
        expect(cfg.surroundingPairs).toHaveLength(5)
    })
})

describe('registerMermaidLanguage', () => {
    beforeEach(() => {
        languagesMock.register.mockClear()
        languagesMock.setMonarchTokensProvider.mockClear()
    })

    it('should register the mermaid language id', () => {
        registerMermaidLanguage()
        expect(languagesMock.register).toHaveBeenCalledWith({ id: 'mermaid' })
    })

    it('should install a monarch tokens provider with mermaid keywords', () => {
        registerMermaidLanguage()

        expect(languagesMock.setMonarchTokensProvider).toHaveBeenCalledTimes(1)
        const [languageId, provider] = languagesMock.setMonarchTokensProvider.mock.calls[0]
        expect(languageId).toBe('mermaid')

        const cfg = provider as { keywords: string[]; tokenizer: { root: [unknown, unknown][] } }
        expect(cfg.keywords).toContain('graph')
        expect(cfg.keywords).toContain('flowchart')
        expect(cfg.keywords).toContain('sequenceDiagram')
        expect(cfg.keywords).toContain('subgraph')
        expect(cfg.keywords).toContain('end')
        expect(cfg.keywords).toContain('mindmap')
        // 必须包含 mermaid 注释（%%）与 # 注释规则
        const commentRules = cfg.tokenizer.root.filter((rule) => rule[1] === 'comment')
        expect(commentRules.length).toBeGreaterThanOrEqual(2)
        expect(commentRules.some((rule) => String(rule[0]).includes('%%'))).toBe(true)
    })
})

describe('registerCustomLanguages', () => {
    beforeEach(() => {
        languagesMock.register.mockClear()
    })

    it('should register both plantuml and mermaid', () => {
        registerCustomLanguages()
        expect(languagesMock.register).toHaveBeenCalledTimes(2)
        const ids = languagesMock.register.mock.calls.map((call) => call[0].id)
        expect(ids).toEqual(['plantuml', 'mermaid'])
    })
})
