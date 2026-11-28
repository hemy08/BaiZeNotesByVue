// @vitest-environment node
/**
 * A9 命令面板空态「相关命令」建议纯逻辑单测（1.5.6 P2 批次 C / REQ-11）
 *
 * 覆盖：
 * 1. 空查询 / 停用词 / 无关乱码 → 无建议（不误报，避免误导执行）；
 * 2. 同义词/别名扩展（中文口语 → 命令关键词，如「存档」→ 保存）；
 * 3. 最近命令的近似匹配（编辑距离 1 / 字符集相同 / 子序列兜底）；
 * 4. 使用历史加权（最近使用命令在同等近似度下排在前面）；
 * 5. 最多 5 条上限、排序确定性、不修改入参。
 *
 * 使用真实命令注册表（buildPaletteCommands）+ 伪翻译，确保关键词/分类匹配走真实数据。
 */
import { describe, it, expect } from 'vitest'

import {
    PALETTE_SUGGESTION_LIMIT,
    PALETTE_SUGGESTION_MIN_SCORE,
    suggestPaletteCommands
} from '../../../src/renderer/src/components/search/command-suggestions'
import {
    buildPaletteCommands,
    type PaletteCommand,
    type PaletteCommandHandlers
} from '../../../src/renderer/src/components/search/command-registry'

/** 测试用菜单动作分发替身（不真正执行） */
const handlers: PaletteCommandHandlers = {
    runMenuAction: () => {},
    openWorkspaceSearch: () => {},
    switchMode: () => {},
    openOrCreateCaptureEntry: () => {},
    captureClipToNote: () => {},
    captureClipToEditor: () => {},
    ocrClipboardToEditor: () => {},
    ocrClipboardToClipboard: () => {}
}

/** 命令清单（含可选能力命令，便于覆盖「日记/剪藏/OCR」同义词） */
const commands = buildPaletteCommands(handlers)

/** 伪翻译：命令显示名/分类名按 i18n 键末段输出（如 openFolder → openFolder） */
const translate = (key: string): string => key.split('.').pop() ?? key

/** 便捷封装：按 id 收集建议 id 列表 */
function suggestIds(query: string, usage?: Parameters<typeof suggestPaletteCommands>[2]['usage']) {
    return suggestPaletteCommands(commands, query, { translate, usage }).map(
        (command) => command.id
    )
}

describe('无建议场景（不误报）', () => {
    it('空查询 / 纯空白返回空数组（空查询走「最近使用 + 全量分组」）', () => {
        expect(suggestIds('')).toEqual([])
        expect(suggestIds('   ')).toEqual([])
        expect(suggestIds('\u3000')).toEqual([])
    })

    it('无关乱码不产生建议', () => {
        expect(suggestIds('zzzz-not-exist')).toEqual([])
        expect(suggestIds('qqqqqq')).toEqual([])
    })

    it('纯英文停用词不参与匹配', () => {
        expect(suggestIds('the not of')).toEqual([])
    })
})

describe('同义词 / 别名映射', () => {
    it('中文口语「存档」映射到保存命令', () => {
        expect(suggestIds('存档')).toContain('save')
    })

    it('中文口语「流程图」映射到 Mermaid 图表命令', () => {
        expect(suggestIds('流程图')).toContain('insert-mermaid')
    })

    it('中文口语「反链」映射到反向链接命令', () => {
        expect(suggestIds('反链')).toContain('knowledge-backlinks')
    })

    it('中文口语「截图识别」映射到 OCR 命令（同义扩展词命中关键词）', () => {
        expect(suggestIds('截图识别').includes('ocr-insert')).toBe(true)
    })
})

describe('最近命令的近似匹配（拼写近似 / 子序列兜底）', () => {
    it('编辑距离 1 的拼写错误「sabe」→ save', () => {
        expect(suggestIds('sabe')[0]).toBe('save')
    })

    it('字符集打乱「tabel」→ 插入表格（关键词 table 近似）', () => {
        expect(suggestIds('tabel')[0]).toBe('insert-table')
    })

    it('子序列兜底命中命令 id（wsp → workspace-search）', () => {
        expect(suggestIds('wsrch')).toContain('workspace-search')
    })
})

describe('使用历史加权与排序', () => {
    it('同等近似度下，最近使用过的命令排在前面', () => {
        expect(suggestIds('open')[0]).toBe('open-folder')
        const usage = {
            'quick-open': { lastUsed: 9_999, count: 3 }
        }
        expect(suggestIds('open', usage)[0]).toBe('quick-open')
    })

    it('使用频率只作为使用权重的一部分（lastUsed 新者仍优先）', () => {
        const usage = {
            'open-file': { lastUsed: 100, count: 99 },
            'open-folder': { lastUsed: 200, count: 1 }
        }
        expect(suggestIds('open', usage).slice(0, 2)).toEqual(['open-folder', 'open-file'])
    })

    it('建议排序确定：无使用历史时按注册顺序兜底', () => {
        expect(suggestIds('open').slice(0, 2)).toEqual(['open-folder', 'open-file'])
    })
})

describe('建议数量上限与输入约束', () => {
    it('最多返回 5 条建议（默认上限常量）', () => {
        const synthetic: PaletteCommand[] = Array.from({ length: 8 }, (_item, index) => ({
            id: `alpha-${index}`,
            labelKey: 'synthetic.alpha',
            categoryKey: 'synthetic.category',
            keywords: ['alpha']
        }))
        const suggestions = suggestPaletteCommands(synthetic, 'alpha', {
            translate: () => 'alpha'
        })
        expect(suggestions).toHaveLength(PALETTE_SUGGESTION_LIMIT)
        expect(PALETTE_SUGGESTION_LIMIT).toBe(5)
    })

    it('支持自定义 limit；limit=0 返回空数组', () => {
        const synthetic: PaletteCommand[] = Array.from({ length: 3 }, (_item, index) => ({
            id: `beta-${index}`,
            labelKey: 'synthetic.beta',
            categoryKey: 'synthetic.category',
            keywords: ['beta']
        }))
        expect(
            suggestPaletteCommands(synthetic, 'beta', { translate: () => 'beta', limit: 2 })
        ).toHaveLength(2)
        expect(
            suggestPaletteCommands(synthetic, 'beta', { translate: () => 'beta', limit: 0 })
        ).toEqual([])
    })

    it('不修改入参命令数组', () => {
        const snapshot = commands.map((command) => command.id)
        suggestPaletteCommands(commands, '存档', { translate })
        expect(commands.map((command) => command.id)).toEqual(snapshot)
    })

    it('评分阈值常量有效（过弱匹配不进入建议）', () => {
        expect(PALETTE_SUGGESTION_MIN_SCORE).toBeGreaterThan(0)
        // 与任何命令都无交集的重复字符不会命中
        expect(suggestIds('qqqq')).toEqual([])
    })
})
