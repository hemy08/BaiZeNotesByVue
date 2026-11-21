/**
 * 写作统计核心库单测（writing-stats.ts）
 *
 * 覆盖：中英混排 / 数字词 / Emoji / 标点 / 空文本 / Markdown 标记剔除（标题、列表、
 * 引用、表格、强调、HTML 标签与注释、链接与图片、引用式链接、围栏与行内代码）、
 * 选区统计、可配置阅读速度、1 MiB 大文本性能与输入上限保护。
 *
 * 口径说明见 writing-stats.ts 顶部注释：字符按 Unicode 码点计，totalChars 不计换行，
 * paragraphs 为非空行数，sentences 以句末标点计界并统计末尾残句。
 */
import { describe, expect, it } from 'vitest'
import {
    MAX_STATS_INPUT_CHARS,
    analyzePlainTextForStats,
    computeSelectionStats,
    computeWritingStats,
    stripMarkdownForStats
} from '../../src/renderer/src/components/Markdown/writing-stats'

/** 空统计结果（供「全 0」断言复用） */
const EMPTY_STATS = {
    totalChars: 0,
    charsNoSpaces: 0,
    cjkChars: 0,
    latinWords: 0,
    paragraphs: 0,
    sentences: 0,
    readingMinutes: 0
}

describe('空文本与纯空白', () => {
    it('空串返回全 0', () => {
        expect(computeWritingStats('')).toEqual(EMPTY_STATS)
        expect(computeSelectionStats('')).toEqual(EMPTY_STATS)
    })

    it('只有空白/空行时返回全 0（空行不算段落）', () => {
        expect(computeWritingStats('   \n\n\t\n  ')).toEqual(EMPTY_STATS)
    })

    it('剔除后为空（纯水平线/纯代码块）返回全 0', () => {
        expect(computeWritingStats('---\n\n```js\nconst a = 1\n```')).toEqual(EMPTY_STATS)
    })

    it('stripMarkdownForStats 对空串/非字符串输入返回空串', () => {
        expect(stripMarkdownForStats('')).toBe('')
        expect(stripMarkdownForStats(null as unknown as string)).toBe('')
    })
})

describe('中英混排统计', () => {
    const text = '你好，世界！Hello world 2026'

    it('字符 / 汉字 / 英文词 / 段落 / 句子逐项正确', () => {
        expect(computeWritingStats(text)).toEqual({
            totalChars: 22,
            charsNoSpaces: 20,
            cjkChars: 4,
            latinWords: 3,
            paragraphs: 1,
            sentences: 2,
            readingMinutes: 1
        })
    })

    it('阅读时间按「中文 300 字/分钟 + 英文 200 词/分钟」计算并向上取整', () => {
        // 4/300 + 3/200 ≈ 0.028 分钟 → 向上取整为 1 分钟
        expect(computeWritingStats(text).readingMinutes).toBe(1)
    })

    it('多段落 / 多句子统计', () => {
        const stats = computeWritingStats('第一段第一句。第一段第二句！\n\n第二段没有句号')
        expect(stats).toEqual({
            totalChars: 21,
            charsNoSpaces: 21,
            cjkChars: 19,
            latinWords: 0,
            paragraphs: 2,
            sentences: 3,
            readingMinutes: 1
        })
    })

    it('数字词与小数：3.14 视为一个词且不当作句界', () => {
        const stats = computeWritingStats('2026 年 3.14 是圆周率。')
        expect(stats.latinWords).toBe(2)
        expect(stats.cjkChars).toBe(5)
        expect(stats.sentences).toBe(1)
    })

    it('连字符 / 撇号连接词只计一个词', () => {
        expect(computeWritingStats("well-known don't stop").latinWords).toBe(3)
    })
})

describe('Emoji 与标点', () => {
    it('Emoji 按 Unicode 码点计 1 个字符，不计入汉字/英文词', () => {
        expect(computeWritingStats('😀👍！')).toEqual({
            totalChars: 3,
            charsNoSpaces: 3,
            cjkChars: 0,
            latinWords: 0,
            paragraphs: 1,
            sentences: 1,
            readingMinutes: 0
        })
    })

    it('ZWJ 组合 Emoji 按组成码点逐个计数（👨‍👩‍👧 = 5）', () => {
        expect(computeWritingStats('👨‍👩‍👧').totalChars).toBe(5)
    })

    it('Emoji 与英文词混合时互不干扰', () => {
        const stats = computeWritingStats('😀abc😀')
        expect(stats.totalChars).toBe(5)
        expect(stats.charsNoSpaces).toBe(5)
        expect(stats.latinWords).toBe(1)
        expect(stats.cjkChars).toBe(0)
    })

    it('中文标点属于有效字符但不属于汉字', () => {
        const stats = computeWritingStats('你好，世界！')
        expect(stats.totalChars).toBe(6)
        expect(stats.cjkChars).toBe(4)
        expect(stats.sentences).toBe(1)
    })

    it('全角空格计入 totalChars 但不计入 charsNoSpaces', () => {
        const stats = computeWritingStats('你\u3000好')
        expect(stats.totalChars).toBe(3)
        expect(stats.charsNoSpaces).toBe(2)
        expect(stats.cjkChars).toBe(2)
    })
})

describe('Markdown 块级标记剔除', () => {
    it('标题标记剔除、标题正文保留', () => {
        const stats = computeWritingStats('# 一级标题\n\n## 二级标题 ##')
        expect(stats.cjkChars).toBe(8)
        expect(stats.paragraphs).toBe(2)
        expect(stripMarkdownForStats('# 一级标题\n\n## 二级标题 ##')).toBe('一级标题\n二级标题')
    })

    it('列表 / 有序列表标记剔除，正文保留', () => {
        const stats = computeWritingStats('- 项目一\n- 项目二\n\n1. 第一项\n2) 第二项')
        expect(stats.cjkChars).toBe(12)
        expect(stats.paragraphs).toBe(4)
        expect(stats.totalChars).toBe(12)
    })

    it('任务列表复选框剔除', () => {
        expect(stripMarkdownForStats('- [x] 已完成\n- [ ] 待办')).toBe('已完成\n待办')
        expect(computeWritingStats('- [x] 已完成\n- [ ] 待办').cjkChars).toBe(5)
    })

    it('引用标记剔除（含多级引用）', () => {
        expect(stripMarkdownForStats('> 引用内容\n> > 嵌套引用')).toBe('引用内容\n嵌套引用')
        expect(computeWritingStats('> 引用内容').cjkChars).toBe(4)
    })

    it('水平线 / Setext 下划线整行剔除且不算段落', () => {
        expect(stripMarkdownForStats('上文\n\n---\n\n下文')).toBe('上文\n下文')
        expect(computeWritingStats('上文\n\n---\n\n下文').paragraphs).toBe(2)
        expect(stripMarkdownForStats('标题\n=====')).toBe('标题')
    })

    it('表格竖线剔除、表头与单元格文字保留、分隔行整行剔除', () => {
        const text = '| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 3 |'
        expect(stripMarkdownForStats(text)).toBe('名称  数量\n苹果  3')
        const stats = computeWritingStats(text)
        expect(stats.totalChars).toBe(11)
        expect(stats.charsNoSpaces).toBe(7)
        expect(stats.cjkChars).toBe(6)
        expect(stats.latinWords).toBe(1)
        expect(stats.paragraphs).toBe(2)
    })

    it('行首缩进不作为有效字符', () => {
        expect(stripMarkdownForStats('   缩进正文')).toBe('缩进正文')
        expect(computeWritingStats('   缩进正文').cjkChars).toBe(4)
    })

    it('CRLF 换行归一化后统计一致', () => {
        expect(computeWritingStats('# 标题\r\n\r\n正文')).toEqual(
            computeWritingStats('# 标题\n\n正文')
        )
        expect(stripMarkdownForStats('# 标题\r\n\r\n正文')).toBe('标题\n正文')
    })
})

describe('代码块与行内代码剔除', () => {
    it('围栏代码块（含内容）整块剔除', () => {
        const text = '正文\n\n```js\nconst a = 1\nconsole.log(a)\n```\n\n结尾'
        expect(stripMarkdownForStats(text)).toBe('正文\n结尾')
        const stats = computeWritingStats(text)
        expect(stats.totalChars).toBe(4)
        expect(stats.latinWords).toBe(0)
        expect(stats.paragraphs).toBe(2)
    })

    it('波浪号围栏代码块同样剔除', () => {
        const text = '前文\n\n~~~python\nprint("中文也不计入")\n~~~\n\n后文'
        expect(stripMarkdownForStats(text)).toBe('前文\n后文')
    })

    it('行内代码连同内容剔除', () => {
        expect(stripMarkdownForStats('使用 `npm run dev` 启动')).toBe('使用  启动')
        const stats = computeWritingStats('使用 `npm run dev` 启动')
        expect(stats.totalChars).toBe(6)
        expect(stats.charsNoSpaces).toBe(4)
        expect(stats.cjkChars).toBe(4)
        expect(stats.latinWords).toBe(0)
    })

    it('未闭合行内代码：该行剩余内容按代码剔除', () => {
        expect(stripMarkdownForStats('前面 `未闭合代码')).toBe('前面')
    })
})

describe('链接 / 图片 / HTML 剔除', () => {
    it('行内链接只保留文字、剔除 URL', () => {
        const text = '[白泽笔记](https://github.com/hemy08/BaiZeNotesByVue) 是本地笔记'
        expect(stripMarkdownForStats(text)).toBe('白泽笔记 是本地笔记')
        const stats = computeWritingStats(text)
        expect(stats.cjkChars).toBe(9)
        expect(stats.latinWords).toBe(0)
        expect(stats.totalChars).toBe(10)
    })

    it('链接标题一并剔除', () => {
        expect(stripMarkdownForStats('[文档](https://example.com "标题")')).toBe('文档')
    })

    it('图片保留 alt 文字、剔除地址', () => {
        expect(stripMarkdownForStats('![替代文字](images/a.png)')).toBe('替代文字')
        expect(computeWritingStats('![替代文字](images/a.png)').cjkChars).toBe(4)
    })

    it('引用式链接与引用定义行剔除', () => {
        const text = '[链接文字][ref]\n\n[ref]: https://example.com'
        expect(stripMarkdownForStats(text)).toBe('链接文字')
        expect(computeWritingStats(text).cjkChars).toBe(4)
    })

    it('脚注引用剔除', () => {
        expect(stripMarkdownForStats('正文[^1]')).toBe('正文')
    })

    it('HTML 标签剔除、标签间文字保留', () => {
        expect(stripMarkdownForStats('第一行<br>第二行')).toBe('第一行第二行')
        expect(stripMarkdownForStats('<b>加粗</b>')).toBe('加粗')
        expect(computeWritingStats('第一行<br>第二行').cjkChars).toBe(6)
    })

    it('单行 HTML 注释整段剔除', () => {
        expect(stripMarkdownForStats('正文<!-- 隐藏注释 -->继续')).toBe('正文继续')
    })

    it('跨行 HTML 注释整段剔除', () => {
        const text = '前文\n<!--\n隐藏注释行\n-->\n后文'
        expect(stripMarkdownForStats(text)).toBe('前文\n后文')
        expect(computeWritingStats(text).paragraphs).toBe(2)
    })

    it('自动链接整段剔除', () => {
        expect(stripMarkdownForStats('见 <https://example.com> 说明')).toBe('见  说明')
    })

    it('普通比较符 < 不是 HTML 标签，按文本保留', () => {
        const stats = computeWritingStats('a < b')
        expect(stats.totalChars).toBe(5)
        expect(stats.latinWords).toBe(2)
    })
})

describe('强调 / 删除线 / 转义', () => {
    it('强调与删除线标记剔除、文字保留', () => {
        expect(stripMarkdownForStats('**加粗**和*斜体*还有~~删除~~')).toBe('加粗和斜体还有删除')
        expect(computeWritingStats('**加粗**和*斜体*还有~~删除~~').cjkChars).toBe(9)
    })

    it('反斜杠转义保留字面字符', () => {
        expect(stripMarkdownForStats('\\*不是斜体\\*')).toBe('*不是斜体*')
        const stats = computeWritingStats('\\*不是斜体\\*')
        expect(stats.totalChars).toBe(6)
        expect(stats.cjkChars).toBe(4)
    })
})

describe('块级标记边界场景', () => {
    it('混合符号不是水平线，按列表标记继续剥离', () => {
        expect(stripMarkdownForStats('- * 内容')).toBe('内容')
        expect(stripMarkdownForStats('-*-')).toBe('--')
    })

    it('带空白的 Setext 下划线整行剔除', () => {
        expect(stripMarkdownForStats('标题\n= = =')).toBe('标题')
    })

    it('未闭合的链接引用定义按普通文本处理', () => {
        expect(stripMarkdownForStats('[未闭合引用')).toBe('未闭合引用')
    })

    it('标题末尾空白/闭合井号/井号正文的边界处理', () => {
        expect(stripMarkdownForStats('# 标题   ')).toBe('标题')
        expect(stripMarkdownForStats('# ###')).toBe('')
        expect(stripMarkdownForStats('## C#')).toBe('C#')
        expect(computeWritingStats('#标签').cjkChars).toBe(2)
        expect(computeWritingStats('#标签').totalChars).toBe(3)
    })

    it('空列表项 / 空有序项整行剔除', () => {
        expect(stripMarkdownForStats('-')).toBe('')
        expect(stripMarkdownForStats('1.')).toBe('')
        expect(stripMarkdownForStats('- [ ]')).toBe('')
    })

    it('有序序号后无空白时不按列表处理（如 1.5kg）', () => {
        expect(stripMarkdownForStats('1.5kg 重量')).toBe('1.5kg 重量')
        expect(computeWritingStats('1.5kg 重量').latinWords).toBe(1)
    })

    it('非法任务复选框字符 / 复选框后无空白按普通文本处理', () => {
        expect(stripMarkdownForStats('[o] 选项')).toBe('o 选项')
        expect(stripMarkdownForStats('[x]内容')).toBe('x内容')
    })

    it('围栏代码块允许缩进的结束围栏', () => {
        expect(stripMarkdownForStats('```\n代码\n  ```')).toBe('')
    })

    it('结束围栏后允许尾随空白', () => {
        expect(stripMarkdownForStats('```\n代码\n```   ')).toBe('')
    })

    it('围栏代码块内带语言的伪结束行仍算内容', () => {
        expect(stripMarkdownForStats('```\n```js\n内容\n```')).toBe('')
    })

    it('两个反引号不是围栏，按行内代码剔除', () => {
        expect(stripMarkdownForStats('``代码``')).toBe('')
    })
})

describe('行内剔除边界场景', () => {
    it('未闭合脚注引用 / 未闭合引用式目标按普通文本处理', () => {
        expect(stripMarkdownForStats('文字[^1')).toBe('文字^1')
        expect(stripMarkdownForStats('[文字][ref')).toBe('文字ref')
    })

    it('普通方括号（非链接）只剔除括号标记', () => {
        expect(stripMarkdownForStats('列表 [1]')).toBe('列表 1')
    })

    it('未闭合 HTML 标签：保留 < 与后续文本（第二处不再重复扫描）', () => {
        expect(stripMarkdownForStats('a <b 和 <c')).toBe('a <b 和 <c')
        expect(stripMarkdownForStats('a <b 和 <c').length).toBe(9)
    })

    it('链接目标支持嵌套括号与转义括号', () => {
        expect(stripMarkdownForStats('[文字](a(b)c)')).toBe('文字')
        expect(stripMarkdownForStats('[文字](a\\)b)')).toBe('文字')
    })

    it('行尾孤立反斜杠按普通字符剔除（不保留反斜杠）', () => {
        expect(stripMarkdownForStats('结尾\\')).toBe('结尾')
    })
})

describe('句子边界边界场景', () => {
    it('数字后的英文句点不单独计句界', () => {
        expect(computeWritingStats('数字 2. 结束').sentences).toBe(1)
    })

    it('以英文句点结尾的句子计一句', () => {
        expect(computeWritingStats('Hello.').sentences).toBe(1)
        expect(computeWritingStats('Hello world. How are you? Fine!').sentences).toBe(3)
    })

    it('顿号等 CJK 标点不产生句界', () => {
        expect(computeWritingStats('你好、世界').sentences).toBe(1)
        expect(computeWritingStats('等等……').sentences).toBe(1)
    })
})

describe('选区统计', () => {
    it('与全文统计同口径（剔除 Markdown 标记）', () => {
        const selected = '选中的 **加粗文字** 结束'
        expect(computeSelectionStats(selected)).toEqual(computeWritingStats(selected))
        expect(computeSelectionStats(selected)).toEqual({
            totalChars: 11,
            charsNoSpaces: 9,
            cjkChars: 9,
            latinWords: 0,
            paragraphs: 1,
            sentences: 1,
            readingMinutes: 1
        })
    })

    it('英文选区统计英文词数', () => {
        const stats = computeSelectionStats('Hello **world**')
        expect(stats.latinWords).toBe(2)
        expect(stats.totalChars).toBe(11)
        expect(stats.charsNoSpaces).toBe(10)
        expect(stats.sentences).toBe(1)
    })

    it('纯空白选区返回全 0', () => {
        expect(computeSelectionStats('   ')).toEqual(EMPTY_STATS)
    })
})

describe('阅读时间可配置', () => {
    it('默认中文 300 字/分钟：600 字 = 2 分钟', () => {
        const stats = computeWritingStats('中'.repeat(600))
        expect(stats.cjkChars).toBe(600)
        expect(stats.readingMinutes).toBe(2)
    })

    it('自定义中文阅读速度', () => {
        const stats = computeWritingStats('中'.repeat(600), { chineseCharsPerMinute: 600 })
        expect(stats.readingMinutes).toBe(1)
    })

    it('默认英文 200 词/分钟：400 词 = 2 分钟', () => {
        const stats = computeWritingStats('word '.repeat(400))
        expect(stats.latinWords).toBe(400)
        expect(stats.readingMinutes).toBe(2)
    })

    it('自定义英文阅读速度', () => {
        const stats = computeWritingStats('word '.repeat(400), { latinWordsPerMinute: 400 })
        expect(stats.readingMinutes).toBe(1)
    })

    it('中英混合阅读时间相加后向上取整', () => {
        const text = `${'中'.repeat(150)} ${'word '.repeat(100)}`
        expect(computeWritingStats(text).readingMinutes).toBe(1)
    })

    it('非有限/非正数的阅读速度回落默认值', () => {
        const text = '中'.repeat(600)
        expect(computeWritingStats(text, { chineseCharsPerMinute: 0 }).readingMinutes).toBe(2)
        expect(computeWritingStats(text, { chineseCharsPerMinute: -1 }).readingMinutes).toBe(2)
        expect(
            computeWritingStats(text, { chineseCharsPerMinute: Number.NaN }).readingMinutes
        ).toBe(2)
        expect(
            computeWritingStats(text, { chineseCharsPerMinute: Number.POSITIVE_INFINITY })
                .readingMinutes
        ).toBe(2)
    })

    it('有内容但不足 1 分钟时向上取整为 1；空文本为 0', () => {
        expect(computeWritingStats('字').readingMinutes).toBe(1)
        expect(computeWritingStats('').readingMinutes).toBe(0)
    })
})

describe('纯文本统计入口（analyzePlainTextForStats）', () => {
    it('直接统计纯文本，不再做 Markdown 剔除', () => {
        const stats = analyzePlainTextForStats('# 不是标题\n\n段落')
        expect(stats.cjkChars).toBe(6)
        expect(stats.totalChars).toBe(8)
        expect(stats.paragraphs).toBe(2)
    })
})

describe('大文本性能与输入上限保护', () => {
    it('1 MiB 中文文本统计正确且耗时受控（< 2000ms）', () => {
        const unit = '写作统计测试。'
        const repeatCount = 149_796
        const text = unit.repeat(repeatCount)
        expect(text.length).toBeLessThan(MAX_STATS_INPUT_CHARS)

        const startedAt = performance.now()
        const stats = computeWritingStats(text)
        const elapsed = performance.now() - startedAt

        expect(stats.cjkChars).toBe(repeatCount * 6)
        expect(stats.sentences).toBe(repeatCount)
        expect(stats.totalChars).toBe(text.length)
        expect(elapsed).toBeLessThan(2000)
    })

    it('超过上限的输入被截断统计（不切断代理对）', () => {
        const oversize = 'a'.repeat(MAX_STATS_INPUT_CHARS + 100)
        const stats = computeWritingStats(oversize)
        expect(stats.totalChars).toBe(MAX_STATS_INPUT_CHARS)
        expect(stats.latinWords).toBe(1)
        expect(stats.paragraphs).toBe(1)
    })

    it('截断点落在代理对中间时向前回退一个码元', () => {
        const boundaryText = `${'a'.repeat(MAX_STATS_INPUT_CHARS - 1)}😀`
        expect(computeWritingStats(boundaryText).totalChars).toBe(MAX_STATS_INPUT_CHARS - 1)
    })

    it('病态输入（大量未闭合链接/方括号）仍能线性完成', () => {
        const pathological = '](]('.repeat(20_000)
        const startedAt = performance.now()
        const stats = computeWritingStats(pathological)
        const elapsed = performance.now() - startedAt
        expect(stats.totalChars).toBeGreaterThanOrEqual(0)
        expect(elapsed).toBeLessThan(2000)
    })
})
