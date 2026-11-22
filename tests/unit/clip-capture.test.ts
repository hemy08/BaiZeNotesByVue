/**
 * 1.5.2 E1 剪藏 shared 纯函数单测（`src/shared/constants/clip-capture.ts`）
 *
 * 覆盖口径：
 * 1. 字节数 / 标题 / 来源 URL 归一化（控制字符、长度上限、协议白名单）；
 * 2. 元数据提取三级标题回退（`<title>` → `<h1>` → 纯文本首行 60 字）与 URL 提取
 *    （`<base href>` → 首个绝对 http(s) 链接；纯文本不扫描、不安全协议忽略）；
 * 3. front matter YAML 安全转义（引号/冒号/换行/中文）与可选 sourceUrl；
 * 4. 正文模板（空正文占位）、clip 文件名格式、目录常量与 E6 inbox 目录一致。
 */
import { describe, it, expect } from 'vitest'
import {
    CLIP_CAPTURE_DIR,
    CLIP_CONTENT_MAX_BYTES,
    CLIP_EMPTY_CONTENT_PLACEHOLDER,
    CLIP_TEXT_TITLE_MAX_LENGTH,
    CLIP_TITLE_MAX_LENGTH,
    buildClipFrontMatter,
    buildClipNoteContent,
    clipEntryFileName,
    clipEntryTemplate,
    extractClipMetadata,
    sanitizeClipSourceUrl,
    sanitizeClipTitle,
    utf8ByteLength
} from '../../src/shared/constants/clip-capture'
import { DAILY_ENTRY_DIRECTORIES } from '../../src/shared/constants/daily-entries'

/** 固定本地时间：2026-01-04（周日）09:05:06 —— 与 E6 daily-entries/capture-ipc 单测同一基准 */
const FIXED_DATE = new Date(2026, 0, 4, 9, 5, 6)

describe('常量与字节数', () => {
    it('剪藏目录与 E6 快速收件箱共用 inbox/（单一真源一致性守卫）', () => {
        expect(CLIP_CAPTURE_DIR).toBe('inbox')
        expect(CLIP_CAPTURE_DIR).toBe(DAILY_ENTRY_DIRECTORIES.inbox)
    })

    it('正文上限 512 KiB、标题上限 120、纯文本回退标题 60', () => {
        expect(CLIP_CONTENT_MAX_BYTES).toBe(512 * 1024)
        expect(CLIP_TITLE_MAX_LENGTH).toBe(120)
        expect(CLIP_TEXT_TITLE_MAX_LENGTH).toBe(60)
        expect(CLIP_EMPTY_CONTENT_PLACEHOLDER.length).toBeGreaterThan(0)
    })

    it('utf8ByteLength 按 UTF-8 编码统计（ASCII / 中文 / emoji）', () => {
        expect(utf8ByteLength('')).toBe(0)
        expect(utf8ByteLength('abc')).toBe(3)
        expect(utf8ByteLength('中文')).toBe(6)
        expect(utf8ByteLength('😀')).toBe(4)
    })
})

describe('sanitizeClipTitle', () => {
    it('剥离控制字符并压缩连续空白', () => {
        expect(sanitizeClipTitle('  a\u0000b\n\tc  ')).toBe('a b c')
        expect(sanitizeClipTitle('标题\r\n第二行')).toBe('标题 第二行')
    })

    it('空串/纯空白/非字符串返回 undefined', () => {
        expect(sanitizeClipTitle('')).toBeUndefined()
        expect(sanitizeClipTitle('   ')).toBeUndefined()
        expect(sanitizeClipTitle(null)).toBeUndefined()
        expect(sanitizeClipTitle(42)).toBeUndefined()
    })

    it('按 Unicode 码点截断到 120，不切断代理对', () => {
        const longTitle = '题'.repeat(CLIP_TITLE_MAX_LENGTH + 10)
        const normalized = sanitizeClipTitle(longTitle)
        expect(normalized).toHaveLength(CLIP_TITLE_MAX_LENGTH)
        const emojiTitle = '😀'.repeat(CLIP_TITLE_MAX_LENGTH + 1)
        const normalizedEmoji = sanitizeClipTitle(emojiTitle) as string
        expect(Array.from(normalizedEmoji)).toHaveLength(CLIP_TITLE_MAX_LENGTH)
        expect(normalizedEmoji.endsWith('😀')).toBe(true)
    })
})

describe('sanitizeClipSourceUrl', () => {
    it('接受绝对 http/https 地址', () => {
        expect(sanitizeClipSourceUrl('https://example.com/a?b=1#c')).toBe(
            'https://example.com/a?b=1#c'
        )
        expect(sanitizeClipSourceUrl('  http://example.com/x  ')).toBe('http://example.com/x')
    })

    it('拒绝相对路径、不安全协议与非字符串', () => {
        expect(sanitizeClipSourceUrl('/relative/path')).toBeUndefined()
        expect(sanitizeClipSourceUrl('javascript:alert(1)')).toBeUndefined()
        expect(sanitizeClipSourceUrl('data:text/html,hi')).toBeUndefined()
        expect(sanitizeClipSourceUrl('file:///C:/secret.txt')).toBeUndefined()
        expect(sanitizeClipSourceUrl(undefined)).toBeUndefined()
    })

    it('移除控制字符并拒绝超长地址', () => {
        expect(sanitizeClipSourceUrl('https://example.com/\u0000path')).toBe(
            'https://example.com/path'
        )
        expect(sanitizeClipSourceUrl(`https://example.com/${'a'.repeat(4096)}`)).toBeUndefined()
    })
})

describe('extractClipMetadata：标题三级回退', () => {
    it('优先取 <title>（含实体/嵌套标签/多余空白）', () => {
        const html =
            '<html><head><title>  A &amp; B <b>标题</b>\n </title></head><body></body></html>'
        expect(extractClipMetadata(html, '纯文本首行').title).toBe('A & B 标题')
    })

    it('无 <title> 时取首个 <h1>', () => {
        const html = '<html><body><h1>一级标题</h1><h1>第二个</h1></body></html>'
        expect(extractClipMetadata(html, '纯文本首行').title).toBe('一级标题')
    })

    it('无 <title>/<h1> 时回退纯文本首个非空行并截断 60 字', () => {
        const firstLine = '文'.repeat(CLIP_TEXT_TITLE_MAX_LENGTH + 5)
        const text = `\n   \n${firstLine}\n第二行`
        expect(extractClipMetadata('', text).title).toBe(
            firstLine.slice(0, CLIP_TEXT_TITLE_MAX_LENGTH)
        )
    })

    it('无 HTML 且无文本时返回空对象', () => {
        expect(extractClipMetadata('', '')).toEqual({})
        expect(extractClipMetadata(undefined, undefined)).toEqual({})
        expect(extractClipMetadata(null, null)).toEqual({})
    })

    it('标题超过 120 字时截断', () => {
        const longTitle = '标'.repeat(CLIP_TITLE_MAX_LENGTH + 20)
        const html = `<html><head><title>${longTitle}</title></head></html>`
        expect(extractClipMetadata(html, '').title).toHaveLength(CLIP_TITLE_MAX_LENGTH)
    })
})

describe('extractClipMetadata：来源 URL 提取', () => {
    it('优先取 <base href>', () => {
        const html =
            '<html><head><base href="https://base.example.com/doc"></head><body><a href="https://link.example.com/page">x</a></body></html>'
        expect(extractClipMetadata(html, '').sourceUrl).toBe('https://base.example.com/doc')
    })

    it('无 <base> 时取片段首个绝对 http(s) 链接', () => {
        const html =
            '<div><a href="/relative">rel</a><a href=\'https://link.example.com/page\'>link</a></div>'
        expect(extractClipMetadata(html, '').sourceUrl).toBe('https://link.example.com/page')
    })

    it('仅扫描 HTML：纯文本中的 URL 不作为来源（需求约束）', () => {
        expect(extractClipMetadata('', '见 https://example.com/page')).toEqual({
            title: '见 https://example.com/page'
        })
    })

    it('不安全协议/相对链接被忽略（无来源信息）', () => {
        const html =
            '<div><a href="javascript:alert(1)">bad</a><a href="/only-relative">rel</a></div>'
        expect(extractClipMetadata(html, '').sourceUrl).toBeUndefined()
        expect(
            extractClipMetadata('<base href="javascript:alert(1)">', '').sourceUrl
        ).toBeUndefined()
    })

    it('HTML 实体解码后仍校验协议', () => {
        const html = '<base href="https://example.com/a?x=1&amp;y=2">'
        expect(extractClipMetadata(html, '').sourceUrl).toBe('https://example.com/a?x=1&y=2')
    })
})

describe('buildClipFrontMatter：YAML 安全转义', () => {
    it('固定时间生成 date/createdAt/source/title，值均为双引号标量', () => {
        const frontMatter = buildClipFrontMatter({ capturedAt: FIXED_DATE, title: '普通标题' })
        expect(frontMatter).toBe(
            [
                '---',
                'date: "2026-01-04"',
                'createdAt: "2026-01-04T09:05:06"',
                'source: "clip"',
                'title: "普通标题"',
                '---'
            ].join('\n')
        )
    })

    it('引号/冒号/反斜杠/换行均被转义（不产生裸值）', () => {
        const title = '引用"引号": 冒号\\反斜杠\n第二行'
        const frontMatter = buildClipFrontMatter({ capturedAt: FIXED_DATE, title })
        expect(frontMatter).toContain('title: "引用\\"引号\\": 冒号\\\\反斜杠\\n第二行"')
        // 标题行内不能出现裸换行（否则 YAML 结构被破坏）
        const titleLine = frontMatter.split('\n').find((line) => line.startsWith('title:'))
        expect(titleLine).toBe('title: "引用\\"引号\\": 冒号\\\\反斜杠\\n第二行"')
    })

    it('有合法来源 URL 时追加 sourceUrl；不安全 URL 忽略', () => {
        const withUrl = buildClipFrontMatter({
            capturedAt: FIXED_DATE,
            title: 'T',
            sourceUrl: 'https://example.com/page'
        })
        expect(withUrl).toContain('sourceUrl: "https://example.com/page"')
        const unsafe = buildClipFrontMatter({
            capturedAt: FIXED_DATE,
            title: 'T',
            sourceUrl: 'javascript:alert(1)'
        })
        expect(unsafe).not.toContain('sourceUrl')
    })

    it('无标题时生成兜底标题；非法 capturedAt 回退当前时间不抛错', () => {
        const withoutTitle = buildClipFrontMatter({ capturedAt: FIXED_DATE })
        expect(withoutTitle).toContain('title: "Clip 2026-01-04 09:05:06"')
        expect(() =>
            buildClipFrontMatter({ capturedAt: new Date(Number.NaN), title: 'x' })
        ).not.toThrow()
    })
})

describe('buildClipNoteContent / clipEntryTemplate', () => {
    it('front matter + 空行 + 正文', () => {
        const content = buildClipNoteContent('# 正文\n\n段落', {
            capturedAt: FIXED_DATE,
            title: '标题'
        })
        expect(content.startsWith('---\n')).toBe(true)
        expect(content).toContain('\n---\n\n# 正文\n\n段落\n')
        expect(content.endsWith('\n')).toBe(true)
    })

    it('空正文写占位内容；CRLF 归一化为 LF', () => {
        const empty = buildClipNoteContent('', { capturedAt: FIXED_DATE })
        expect(empty).toContain(CLIP_EMPTY_CONTENT_PLACEHOLDER)
        const crlf = buildClipNoteContent('第一行\r\n第二行', { capturedAt: FIXED_DATE })
        expect(crlf).toContain('第一行\n第二行')
        expect(crlf).not.toContain('\r')
    })

    it('clipEntryTemplate 组合标题与来源 URL', () => {
        const template = clipEntryTemplate(FIXED_DATE, {
            content: '正文',
            title: '剪藏标题',
            sourceUrl: 'https://example.com/x'
        })
        expect(template).toContain('title: "剪藏标题"')
        expect(template).toContain('sourceUrl: "https://example.com/x"')
        expect(template.endsWith('\n\n正文\n')).toBe(true)
    })

    it('clipEntryTemplate 空载荷（content 缺省）写占位内容', () => {
        const template = clipEntryTemplate(FIXED_DATE, {})
        expect(template).toContain('source: "clip"')
        expect(template).toContain(CLIP_EMPTY_CONTENT_PLACEHOLDER)
    })
})

describe('clipEntryFileName', () => {
    it('按本地时间生成 YYYY-MM-DD-HHmmss-clip.md', () => {
        expect(clipEntryFileName(FIXED_DATE)).toBe('2026-01-04-090506-clip.md')
    })

    it('非法日期返回 null（调用方应先做白名单/日期校验）', () => {
        expect(clipEntryFileName(new Date(Number.NaN))).toBeNull()
        expect(clipEntryFileName('2026-01-04' as unknown as Date)).toBeNull()
    })
})
