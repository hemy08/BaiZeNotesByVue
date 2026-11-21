/**
 * P0-8 轻量写作风格 / 语法检查规则单测（node 环境，纯函数）
 *
 * 覆盖 8 条规则（长句 / 重复词 / 高频口头禅 / 填充词 / 连续标点 / 超长段落 /
 * 中英混排空格 / 全半角标点混用）的正常、边界与误报防护，以及：
 * - 代码块、行内代码、HTML 标签、front matter 剔除；
 * - 空文本、超限大文本、每条规则问题上限；
 * - 规则开关 / 阈值 / 词表配置；
 * - 问题行列准确性、排序与汇总统计。
 */
import { describe, expect, it } from 'vitest'
import {
    DEFAULT_FILLER_WORDS,
    DEFAULT_WRITING_STYLE_THRESHOLDS,
    WRITING_STYLE_ISSUE_MESSAGE_KEYS,
    WRITING_STYLE_MAX_INPUT_CHARS,
    WRITING_STYLE_MAX_ISSUES_PER_RULE,
    WRITING_STYLE_RULES,
    checkWritingStyle,
    maskWritingStyleContent,
    resolveWritingStyleOptions,
    summarizeWritingStyleIssues,
    type WritingStyleCheckOptions,
    type WritingStyleRuleId
} from '../../src/renderer/src/components/Markdown/writing-style/writing-style-check'

/** 取指定规则的问题列表（其余规则的问题在工具函数里过滤掉） */
function issuesOfRule(
    markdown: string,
    ruleId: WritingStyleRuleId,
    options?: WritingStyleCheckOptions
): ReturnType<typeof checkWritingStyle> {
    return checkWritingStyle(markdown, options).filter((issue) => issue.ruleId === ruleId)
}

/** 生成 N 个中文汉字 */
function cjk(count: number): string {
    return '字'.repeat(count)
}

/** 生成 N 个英文单词 */
function words(count: number): string {
    return Array.from({ length: count }, () => 'word').join(' ')
}

describe('规则清单元数据', () => {
    it('导出 8 条规则，id 与建议 i18n 键唯一且完整', () => {
        expect(WRITING_STYLE_RULES).toHaveLength(8)
        const ids = WRITING_STYLE_RULES.map((rule) => rule.id)
        expect(new Set(ids).size).toBe(8)
        expect(ids).toEqual([
            'long-sentence',
            'repeated-word',
            'frequent-catchphrase',
            'filler-word',
            'consecutive-punctuation',
            'long-paragraph',
            'mixed-script-spacing',
            'punctuation-width-mix'
        ])
        for (const rule of WRITING_STYLE_RULES) {
            expect(rule.labelKey).toMatch(/^editorUi\.writingStyle\.ruleLabels\.[A-Za-z]+$/)
            expect(rule.messageKey).toMatch(/^editorUi\.writingStyle\.rules\.[A-Za-z]+$/)
            expect(['info', 'warning']).toContain(rule.severity)
            expect(rule.enabledByDefault).toBe(true)
        }
    })

    it('问题文案键常量表（含英文长句变体）均为建议键', () => {
        const keys = Object.values(WRITING_STYLE_ISSUE_MESSAGE_KEYS)
        expect(new Set(keys).size).toBe(keys.length)
        for (const key of keys) {
            expect(key.startsWith('editorUi.writingStyle.rules.')).toBe(true)
        }
        expect(WRITING_STYLE_ISSUE_MESSAGE_KEYS.longSentenceWords).not.toBe(
            WRITING_STYLE_ISSUE_MESSAGE_KEYS.longSentence
        )
    })

    it('默认阈值符合任务要求（中文 60 字 / 英文 35 词 / 段落 500 字）', () => {
        expect(DEFAULT_WRITING_STYLE_THRESHOLDS.longSentenceCjkChars).toBe(60)
        expect(DEFAULT_WRITING_STYLE_THRESHOLDS.longSentenceEnglishWords).toBe(35)
        expect(DEFAULT_WRITING_STYLE_THRESHOLDS.longParagraphChars).toBe(500)
        expect(DEFAULT_FILLER_WORDS).toContain('其实')
        expect(DEFAULT_FILLER_WORDS).toContain('basically')
        expect(DEFAULT_FILLER_WORDS).toContain('非常')
    })
})

describe('空文本与超限输入', () => {
    it('空文本与纯空白文本返回空数组', () => {
        expect(checkWritingStyle('')).toEqual([])
        expect(checkWritingStyle('   \n\n\t\n')).toEqual([])
    })

    it('超过 2 MiB 上限直接返回空数组（由调用方提示文档过大）', () => {
        const oversized = 'x'.repeat(WRITING_STYLE_MAX_INPUT_CHARS + 1)
        expect(checkWritingStyle(oversized)).toEqual([])
        expect(WRITING_STYLE_MAX_INPUT_CHARS).toBe(2 * 1024 * 1024)
    })

    it('纯代码文档剔除后无可见文本，返回空数组', () => {
        expect(checkWritingStyle('```\n非常非常 其实 你好！！！\n```')).toEqual([])
    })
})

describe('long-sentence 长句', () => {
    it('中文 61 字报长句（60 字不报），参数为字数与阈值', () => {
        const long = issuesOfRule(cjk(61), 'long-sentence')
        expect(long).toHaveLength(1)
        expect(long[0]).toMatchObject({
            line: 1,
            column: 1,
            severity: 'warning',
            messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.longSentence,
            messageParams: { count: 61, limit: 60 }
        })
        expect(long[0].excerpt.length).toBeGreaterThan(0)
        expect(issuesOfRule(cjk(60), 'long-sentence')).toEqual([])
    })

    it('中文长句按句号拆句：两段 40 字不报，单段 61 字报', () => {
        expect(issuesOfRule(`${cjk(40)}。${cjk(40)}。`, 'long-sentence')).toEqual([])
        expect(issuesOfRule(`${cjk(61)}。`, 'long-sentence')).toHaveLength(1)
    })

    it('英文 36 词报长句（35 词不报），使用 words 文案键', () => {
        const long = issuesOfRule(`${words(36)}.`, 'long-sentence')
        expect(long).toHaveLength(1)
        expect(long[0].messageKey).toBe(WRITING_STYLE_ISSUE_MESSAGE_KEYS.longSentenceWords)
        expect(long[0].messageParams).toEqual({ count: 36, limit: 35 })
        expect(issuesOfRule(`${words(35)}.`, 'long-sentence')).toEqual([])
    })

    it('软换行（同一段落内换行）按整句统计', () => {
        const long = issuesOfRule(`${cjk(30)}\n${cjk(35)}`, 'long-sentence')
        expect(long).toHaveLength(1)
        expect(long[0].line).toBe(1)
        expect(long[0].messageParams).toEqual({ count: 65, limit: 60 })
    })

    it('标题不参与长句统计；阈值可配置；规则可关闭', () => {
        expect(issuesOfRule(`# ${cjk(61)}`, 'long-sentence')).toEqual([])
        expect(
            issuesOfRule(cjk(11), 'long-sentence', {
                thresholds: { longSentenceCjkChars: 10 }
            })
        ).toHaveLength(1)
        expect(
            issuesOfRule(cjk(61), 'long-sentence', { rules: { 'long-sentence': false } })
        ).toEqual([])
    })
})

describe('repeated-word 重复词', () => {
    it('中文相邻整词重复报一次，取重复出现的后一处', () => {
        const issues = issuesOfRule('非常重要非常重要', 'repeated-word')
        expect(issues).toHaveLength(1)
        expect(issues[0].messageParams).toEqual({ word: '非常重要' })
        expect(issues[0].column).toBe(5)
        expect(issues[0].severity).toBe('warning')
    })

    it('中文空格分隔的重复词、单字叠写均报出', () => {
        expect(issuesOfRule('重要 重要', 'repeated-word')[0]?.messageParams).toEqual({
            word: '重要'
        })
        expect(issuesOfRule('这这', 'repeated-word')[0]?.messageParams).toEqual({ word: '这这' })
    })

    it('常见叠词 / 拟声词不报（看看、哈哈、慢慢）', () => {
        expect(issuesOfRule('看看哈哈慢慢', 'repeated-word')).toEqual([])
    })

    it('英文相邻重复单词报出且忽略大小写', () => {
        const issues = issuesOfRule('This is is a test.', 'repeated-word')
        expect(issues).toHaveLength(1)
        expect(issues[0].messageParams).toEqual({ word: 'is' })
        expect(issuesOfRule('This is not is a test.', 'repeated-word')).toEqual([])
        expect(issuesOfRule('Very very good.', 'repeated-word')[0]?.messageParams).toEqual({
            word: 'Very'
        })
    })

    it('代码块 / 行内代码中的重复不报', () => {
        expect(issuesOfRule('```\n非常重要非常重要\n```', 'repeated-word')).toEqual([])
        expect(issuesOfRule('`非常重要非常重要`', 'repeated-word')).toEqual([])
    })
})

describe('filler-word 填充词', () => {
    it('默认词表命中中文 / 英文填充词', () => {
        const cjkIssues = issuesOfRule('其实这个问题其实很简单', 'filler-word')
        expect(cjkIssues).toHaveLength(2)
        expect(cjkIssues[0].messageParams).toEqual({ word: '其实' })
        expect(cjkIssues[0].severity).toBe('info')
        const enIssues = issuesOfRule('Basically, this is very simple.', 'filler-word')
        expect(enIssues.map((issue) => issue.messageParams?.word)).toEqual(['basically', 'very'])
    })

    it('英文按整词匹配：unbasically 不命中', () => {
        expect(issuesOfRule('This is unbasically fine.', 'filler-word')).toEqual([])
    })

    it('自定义词表整体替换默认词表；空数组关闭匹配', () => {
        const issues = issuesOfRule('其实非常真的很棒', 'filler-word', { fillerWords: ['非常'] })
        expect(issues).toHaveLength(1)
        expect(issues[0].messageParams).toEqual({ word: '非常' })
        expect(issuesOfRule('其实非常', 'filler-word', { fillerWords: [] })).toEqual([])
    })

    it('代码块中的填充词不报', () => {
        expect(issuesOfRule('```text\n其实 basically\n```', 'filler-word')).toEqual([])
    })
})

describe('frequent-catchphrase 高频口头禅', () => {
    it('达到阈值（4 次）报一次，未达阈值不报', () => {
        const issues = issuesOfRule('然后，然后，然后，然后。', 'frequent-catchphrase')
        expect(issues).toHaveLength(1)
        expect(issues[0].messageParams).toEqual({ phrase: '然后', count: 4, limit: 4 })
        expect(issuesOfRule('然后，然后，然后。', 'frequent-catchphrase')).toEqual([])
    })

    it('阈值可配置；与填充词重叠的口头禅自动跳过', () => {
        expect(
            issuesOfRule('反正，反正。', 'frequent-catchphrase', {
                thresholds: { catchphraseMinCount: 2 }
            })
        ).toHaveLength(1)
        // 其实在默认填充词表内：不再作为高频口头禅重复报告
        expect(issuesOfRule('其实，其实，其实，其实。', 'frequent-catchphrase')).toEqual([])
    })
})

describe('consecutive-punctuation 连续标点', () => {
    it('连续叹号 / 句号 / 混合标点报出', () => {
        expect(issuesOfRule('你好！！！', 'consecutive-punctuation')).toHaveLength(1)
        expect(issuesOfRule('不错的。。', 'consecutive-punctuation')).toHaveLength(1)
        const mixed = issuesOfRule('真的吗！？', 'consecutive-punctuation')
        expect(mixed).toHaveLength(1)
        expect(mixed[0].messageParams).toEqual({ punctuation: '！？' })
    })

    it('省略号 … / ... 豁免；Markdown 分隔线 / 容器语法不报', () => {
        expect(issuesOfRule('他说...', 'consecutive-punctuation')).toEqual([])
        expect(issuesOfRule('他说……', 'consecutive-punctuation')).toEqual([])
        expect(issuesOfRule('---\n\n***\n\n===', 'consecutive-punctuation')).toEqual([])
        expect(issuesOfRule('::: tip\n正文', 'consecutive-punctuation')).toEqual([])
    })

    it('代码块 / 行内代码中的连续标点不报', () => {
        expect(issuesOfRule('```\n你好！！！\n```', 'consecutive-punctuation')).toEqual([])
        expect(issuesOfRule('`你好！！！`', 'consecutive-punctuation')).toEqual([])
    })
})

describe('long-paragraph 超长段落', () => {
    it('单段落 501 字报出（500 字不报）', () => {
        const issues = issuesOfRule(cjk(501), 'long-paragraph')
        expect(issues).toHaveLength(1)
        expect(issues[0]).toMatchObject({ line: 1, column: 1 })
        expect(issues[0].messageParams).toEqual({ count: 501, limit: 500 })
        expect(issuesOfRule(cjk(500), 'long-paragraph')).toEqual([])
    })

    it('同一段落内多行合并计数；空行分段', () => {
        expect(issuesOfRule(`${cjk(260)}\n${cjk(260)}`, 'long-paragraph')).toHaveLength(1)
        expect(issuesOfRule(`${cjk(300)}\n\n${cjk(300)}`, 'long-paragraph')).toEqual([])
    })

    it('中文 + 英文混合按「汉字数 + 英文词数」计数', () => {
        const mixed = `${cjk(400)} ${words(101)}`
        expect(issuesOfRule(mixed, 'long-paragraph')).toHaveLength(1)
    })

    it('标题 / 列表 / 表格行不计入段落；阈值可配置', () => {
        expect(issuesOfRule(`# ${cjk(600)}`, 'long-paragraph')).toEqual([])
        expect(issuesOfRule(`- ${cjk(600)}`, 'long-paragraph')).toEqual([])
        expect(issuesOfRule(`| ${cjk(600)} |`, 'long-paragraph')).toEqual([])
        expect(
            issuesOfRule(cjk(101), 'long-paragraph', {
                thresholds: { longParagraphChars: 100 }
            })
        ).toHaveLength(1)
    })
})

describe('mixed-script-spacing 中英混排缺少空格', () => {
    it('汉字与英文字母直接相邻各报一次（info 级）', () => {
        const issues = issuesOfRule('中文English混排', 'mixed-script-spacing')
        expect(issues).toHaveLength(2)
        expect(issues[0].severity).toBe('info')
        expect(issues.map((issue) => issue.messageParams)).toEqual([
            { before: '文', after: 'E' },
            { before: 'h', after: '混' }
        ])
    })

    it('已加空格、数字相邻、代码内均不报', () => {
        expect(issuesOfRule('中文 English 混排', 'mixed-script-spacing')).toEqual([])
        expect(issuesOfRule('中文123 混排', 'mixed-script-spacing')).toEqual([])
        expect(issuesOfRule('中文 `English` 混排', 'mixed-script-spacing')).toEqual([])
        expect(issuesOfRule('```\n中文English\n```', 'mixed-script-spacing')).toEqual([])
    })

    it('HTML 标签属性不参与检测（标签被剔除）', () => {
        expect(
            issuesOfRule('<div data-title="中文English">正文</div>', 'mixed-script-spacing')
        ).toEqual([])
    })
})

describe('punctuation-width-mix 全半角标点混用', () => {
    it('中文语境半角问号 + 全角问号 → 报一条（info 级）', () => {
        const issues = issuesOfRule('这是问题？还是问题?', 'punctuation-width-mix')
        expect(issues).toHaveLength(1)
        expect(issues[0].severity).toBe('info')
        expect(issues[0].messageParams).toEqual({ full: '？', half: '?', count: 1 })
    })

    it('纯全角 / 纯半角 / 小数点不报', () => {
        expect(issuesOfRule('这是问题？就这样。', 'punctuation-width-mix')).toEqual([])
        expect(issuesOfRule('Is this a question? Yes.', 'punctuation-width-mix')).toEqual([])
        expect(issuesOfRule('版本。 数值 1.5 保持原样。', 'punctuation-width-mix')).toEqual([])
    })

    it('括号成对统计：中文语境半角括号 + 全角括号混用报出', () => {
        expect(issuesOfRule('说明（中文）(中文)', 'punctuation-width-mix')).toHaveLength(1)
        // 半角括号包英文时不算中文语境混用
        expect(issuesOfRule('说明（中文）(English)', 'punctuation-width-mix')).toEqual([])
    })

    it('代码 / 行内代码中的半角标点不计入', () => {
        expect(issuesOfRule('问题？`?`', 'punctuation-width-mix')).toEqual([])
    })
})

describe('掩码（代码块 / 行内代码 / HTML / front matter）', () => {
    it('掩码文本与原文等长，覆盖区域为空格且换行保留', () => {
        const source = '```\n其实其实\n```\n正文 `非常` <div>'
        const masked = maskWritingStyleContent(source)
        expect(masked.maskedText).toHaveLength(source.length)
        expect(masked.maskedText.split('\n')).toHaveLength(source.split('\n').length)
        expect(masked.blockedLines).toEqual([true, true, true, false])
        expect(masked.maskedLines[1]).toBe(' '.repeat('其实其实'.length))
        expect(masked.maskedLines[3]).not.toContain('非常')
        expect(masked.maskedLines[3]).not.toContain('<div>')
        expect(masked.maskedLines[3]).toContain('正文')
    })

    it('front matter 与缩进代码块整体剔除', () => {
        const frontMatter = maskWritingStyleContent('---\ntitle: 其实\n---\n正文')
        expect(frontMatter.blockedLines.slice(0, 3)).toEqual([true, true, true])
        const indented = maskWritingStyleContent('    其实其实\n正文')
        expect(indented.blockedLines).toEqual([true, false])
    })

    it('普通正文中的 HTML 标签剔除后仍保留文字', () => {
        const masked = maskWritingStyleContent('中文<strong>重点</strong>内容')
        expect(masked.maskedText).toContain('中文')
        expect(masked.maskedText).toContain('重点')
        expect(masked.maskedText).not.toContain('<strong>')
    })
})

describe('行号列号、排序与上限', () => {
    it('多行问题行列准确并按行排序', () => {
        const issues = issuesOfRule('第一行\n第二行\n其实', 'filler-word')
        expect(issues).toHaveLength(1)
        expect(issues[0].line).toBe(3)
        expect(issues[0].column).toBe(1)
        const sorted = checkWritingStyle('其实。\n\n其实。')
        expect(sorted[0].line).toBeLessThanOrEqual(sorted[sorted.length - 1].line)
    })

    it('每条规则最多返回固定条数（防止大文档刷屏）', () => {
        const issues = issuesOfRule('其实'.repeat(500), 'filler-word')
        expect(issues).toHaveLength(WRITING_STYLE_MAX_ISSUES_PER_RULE)
        const summary = summarizeWritingStyleIssues(checkWritingStyle('其实'.repeat(500)))
        expect(summary.truncated).toBe(true)
    })

    it('1 MiB 以内大文本可正常检查，且各规则命中数不超过上限', () => {
        const large = '其实中文English混排。'.repeat(20000)
        expect(large.length).toBeLessThan(WRITING_STYLE_MAX_INPUT_CHARS)
        const issues = checkWritingStyle(large)
        expect(issues.length).toBeGreaterThan(0)
        for (const rule of WRITING_STYLE_RULES) {
            expect(issues.filter((issue) => issue.ruleId === rule.id).length).toBeLessThanOrEqual(
                WRITING_STYLE_MAX_ISSUES_PER_RULE
            )
        }
    })
})

describe('汇总统计与配置解析', () => {
    it('汇总总数 / 级别 / 规则统计与问题一致，未截断', () => {
        const issues = checkWritingStyle('其实 very 你好！！！')
        const summary = summarizeWritingStyleIssues(issues)
        expect(summary.total).toBe(issues.length)
        expect(summary.warnings + summary.infos).toBe(summary.total)
        expect(summary.warnings).toBe(1)
        expect(summary.infos).toBe(2)
        expect(summary.ruleStats.map((stat) => stat.ruleId)).toEqual([
            'filler-word',
            'consecutive-punctuation'
        ])
        expect(summary.truncated).toBe(false)
    })

    it('resolveWritingStyleOptions：默认值 / 开关 / 词表归一化 / 非法阈值回落', () => {
        const defaults = resolveWritingStyleOptions()
        expect(defaults.rules['long-sentence']).toBe(true)
        expect(defaults.thresholds.longSentenceCjkChars).toBe(60)
        const custom = resolveWritingStyleOptions({
            rules: { 'long-sentence': false },
            thresholds: { longSentenceCjkChars: 0 },
            fillerWords: [' 其实 ', '其实', ''],
            catchphrases: ['然后', '然后']
        })
        expect(custom.rules['long-sentence']).toBe(false)
        expect(custom.rules['long-paragraph']).toBe(true)
        expect(custom.thresholds.longSentenceCjkChars).toBe(60)
        expect(custom.fillerWords).toEqual(['其实'])
        expect(custom.catchphrases).toEqual(['然后'])
    })

    it('关闭规则后该规则不再产出问题', () => {
        const text = '其实。你好！！！'
        expect(issuesOfRule(text, 'filler-word')).toHaveLength(1)
        expect(issuesOfRule(text, 'filler-word', { rules: { 'filler-word': false } })).toEqual([])
        expect(issuesOfRule(text, 'consecutive-punctuation')).toHaveLength(1)
    })
})
