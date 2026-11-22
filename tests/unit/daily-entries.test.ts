/**
 * 1.5.2 E6 今日日记 / 快速收件箱 —— shared 纯函数单测（`src/shared/constants/daily-entries.ts`）
 *
 * 覆盖口径：
 * 1. 目录常量与文件名生成（daily 日期 / inbox 日期+时分秒 / 非法 kind / 非法 Date）；
 * 2. 模板变量展开（全部变量、未知占位符原样保留、空模板、空白占位符）；
 * 3. 今日日记模板（front matter title/date/createdAt/source: diary + `# 标题`）；
 * 4. 快速收件箱模板（front matter date/createdAt/source: inbox）；
 * 5. 与既有 `parseFrontMatter` 的兼容性（front matter 可被主进程索引链路解析）。
 */
import { describe, it, expect } from 'vitest'
import {
    DAILY_ENTRY_DIRECTORIES,
    DAILY_ENTRY_TEMPLATE,
    buildDailyEntryTemplate,
    buildEntryFileName,
    buildEntryTemplate,
    buildInboxEntryTemplate,
    buildTemplateVariables,
    formatEntryDate,
    formatEntryDateTime,
    formatEntryTime,
    formatEntryWeekday,
    renderTemplateVariables,
    type DailyEntryKind
} from '../../src/shared/constants/daily-entries'
import { parseFrontMatter } from '../../src/shared/utils/front-matter'

/** 固定本地时间：2026-01-04（周日）09:05:06，避免用例受运行机器时区影响（本地时间口径） */
const FIXED_DATE = new Date(2026, 0, 4, 9, 5, 6)

describe('DAILY_ENTRY_DIRECTORIES：入口目录白名单', () => {
    it('daily → diary、inbox → inbox（工作区根下一级目录）', () => {
        expect(DAILY_ENTRY_DIRECTORIES).toEqual({ daily: 'diary', inbox: 'inbox' })
    })
})

describe('日期时间格式', () => {
    it('formatEntryDate：本地 YYYY-MM-DD（月/日补零）', () => {
        expect(formatEntryDate(FIXED_DATE)).toBe('2026-01-04')
    })

    it('formatEntryTime：本地 HHmmss（时分秒补零，文件名排序友好）', () => {
        expect(formatEntryTime(FIXED_DATE)).toBe('090506')
        expect(formatEntryTime(new Date(2026, 11, 31, 23, 59, 0))).toBe('235900')
    })

    it('formatEntryDateTime：本地 YYYY-MM-DDTHH:mm:ss（front matter createdAt）', () => {
        expect(formatEntryDateTime(FIXED_DATE)).toBe('2026-01-04T09:05:06')
    })

    it('formatEntryWeekday：英文星期全名与 Date#getDay 对齐', () => {
        expect(formatEntryWeekday(new Date(2026, 0, 4))).toBe('Sunday')
        expect(formatEntryWeekday(new Date(2026, 0, 5))).toBe('Monday')
        expect(formatEntryWeekday(new Date(2026, 0, 10))).toBe('Saturday')
    })
})

describe('buildEntryFileName：文件名生成（主进程生成，渲染层不可传文件名）', () => {
    it('daily → YYYY-MM-DD.md（同一天同名，复用既有文件）', () => {
        expect(buildEntryFileName('daily', FIXED_DATE)).toBe('2026-01-04.md')
    })

    it('inbox → YYYY-MM-DD-HHmmss.md（秒级唯一，连续创建不覆盖）', () => {
        expect(buildEntryFileName('inbox', FIXED_DATE)).toBe('2026-01-04-090506.md')
        expect(buildEntryFileName('inbox', new Date(2026, 0, 4, 9, 5, 7))).toBe(
            '2026-01-04-090507.md'
        )
    })

    it('非法 kind 返回 null（调用方必须先做白名单校验）', () => {
        expect(buildEntryFileName('weekly' as unknown as DailyEntryKind, FIXED_DATE)).toBeNull()
        expect(buildEntryFileName('' as unknown as DailyEntryKind, FIXED_DATE)).toBeNull()
    })

    it('非法 Date 返回 null（避免生成 NaN 文件名）', () => {
        expect(buildEntryFileName('daily', new Date('not-a-date'))).toBeNull()
    })
})

describe('buildTemplateVariables / renderTemplateVariables：模板变量展开', () => {
    it('buildTemplateVariables 提供全部内置变量（title 缺省同 date）', () => {
        expect(buildTemplateVariables(FIXED_DATE)).toEqual({
            date: '2026-01-04',
            time: '090506',
            datetime: '2026-01-04T09:05:06',
            year: '2026',
            month: '01',
            day: '04',
            weekday: 'Sunday',
            title: '2026-01-04'
        })
    })

    it('overrides 可覆盖 title（日记模板标题与文件名日期一致）', () => {
        expect(buildTemplateVariables(FIXED_DATE, { title: '今日记录' }).title).toBe('今日记录')
    })

    it('展开全部变量（含 {{ 变量 }} 两侧空白写法）', () => {
        const template =
            '{{date}}|{{time}}|{{datetime}}|{{year}}|{{month}}|{{day}}|{{weekday}}|{{title}}|{{ date }}'
        expect(renderTemplateVariables(template, buildTemplateVariables(FIXED_DATE))).toBe(
            '2026-01-04|090506|2026-01-04T09:05:06|2026|01|04|Sunday|2026-01-04|2026-01-04'
        )
    })

    it('未知占位符原样保留（禁止 eval，不报错不删除）', () => {
        const template = 'a={{known}} b={{unknown}} c={{  unknown2  }} d={{}}'
        expect(renderTemplateVariables(template, { known: 'OK' })).toBe(
            'a=OK b={{unknown}} c={{  unknown2  }} d={{}}'
        )
    })

    it('空模板返回空串（不抛异常）', () => {
        expect(renderTemplateVariables('', { date: 'x' })).toBe('')
    })

    it('变量值为 undefined 时视为未知占位符保留', () => {
        expect(renderTemplateVariables('{{date}}', { date: undefined })).toBe('{{date}}')
    })
})

describe('buildDailyEntryTemplate：今日日记模板', () => {
    const content = buildDailyEntryTemplate(FIXED_DATE)
    const parsed = parseFrontMatter(content)

    it('含 front matter（title/date/createdAt/source: diary）与一级标题', () => {
        expect(content.startsWith('---\n')).toBe(true)
        expect(content).toContain('title: 2026-01-04')
        expect(content).toContain('date: 2026-01-04')
        expect(content).toContain('createdAt: 2026-01-04T09:05:06')
        expect(content).toContain('source: diary')
        expect(content).toContain('\n# 2026-01-04\n')
    })

    it('front matter 可被既有 parseFrontMatter 解析（索引链路兼容）', () => {
        expect(parsed.present).toBe(true)
        expect(parsed.data.title).toBe('2026-01-04')
        expect(parsed.data.date).toBe('2026-01-04')
        expect(parsed.data.source).toBe('diary')
        expect(parsed.body).toContain('# 2026-01-04')
    })

    it('无 BOM、以换行结尾（UTF-8 纯文本，与项目既有写文件一致）', () => {
        expect(content.charCodeAt(0)).not.toBe(0xfeff)
        expect(content.endsWith('\n')).toBe(true)
    })

    it('模板常量本身可被展开（占位符集合稳定）', () => {
        expect(DAILY_ENTRY_TEMPLATE).toContain('{{title}}')
        expect(DAILY_ENTRY_TEMPLATE).toContain('{{datetime}}')
    })
})

describe('buildInboxEntryTemplate / buildEntryTemplate：快速收件箱模板与分发', () => {
    const content = buildInboxEntryTemplate(FIXED_DATE)
    const parsed = parseFrontMatter(content)

    it('含 front matter（date/createdAt/source: inbox），不含日记标题段', () => {
        expect(content).toContain('date: 2026-01-04')
        expect(content).toContain('createdAt: 2026-01-04T09:05:06')
        expect(content).toContain('source: inbox')
        expect(content).not.toContain('# 2026-01-04')
        expect(parsed.present).toBe(true)
        expect(parsed.data.source).toBe('inbox')
    })

    it('buildEntryTemplate 按 kind 分发到对应模板', () => {
        expect(buildEntryTemplate('daily', FIXED_DATE)).toBe(buildDailyEntryTemplate(FIXED_DATE))
        expect(buildEntryTemplate('inbox', FIXED_DATE)).toBe(buildInboxEntryTemplate(FIXED_DATE))
    })

    it('buildEntryTemplate 对未知 kind 显式抛错（主进程 handler 已先白名单校验）', () => {
        expect(() => buildEntryTemplate('weekly' as unknown as DailyEntryKind, FIXED_DATE)).toThrow(
            /未知的日常记录类型/
        )
    })
})
