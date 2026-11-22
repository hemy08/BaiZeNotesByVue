/**
 * 1.5.2 E6：今日日记 / 快速收件箱 —— shared 纯数据 + 纯函数（唯一真源）
 *
 * 设计约束（ARCH-05）：
 * - 本模块属 `src/shared` 叶子层：不依赖 Node / Electron / Vue / DOM，不做任何 IO；
 * - 只负责「目录名 / 文件名 / 模板变量展开 / 模板内容」这类可被主进程与测试复用的纯逻辑；
 * - 文件名由主进程基于本模块生成（渲染层只能传 `kind`，不能传路径/文件名，防目录穿越）。
 *
 * 模板变量（仅支持字符串替换，**禁止 eval**）：
 * `{{date}}` `{{time}}` `{{datetime}}` `{{year}}` `{{month}}` `{{day}}` `{{weekday}}` `{{title}}`；
 * 未知占位符原样保留（不报错、不删除），便于用户后续扩展模板而不丢内容。
 *
 * 时间口径：全部使用**本地时间**（`diary/YYYY-MM-DD.md` 对应本机「今天」；
 * `inbox/YYYY-MM-DD-HHmmss.md` 的时分秒同样取本地时间，文件内 `createdAt` 用本地
 * `YYYY-MM-DDTHH:mm:ss`，避免跨时区用户看到日期与文件名不一致）。
 */

/**
 * 入口类型（daily = 今日日记；inbox = 快速收件箱）。
 *
 * 注意：1.5.2 E1 的剪藏入口 `kind='clip'` 属于同一 IPC 通道，但目录/文件名/模板语义
 * 由 `clip-capture.ts` 独立维护（不复用本模块的 `DAILY_ENTRY_DIRECTORIES`），因此这里
 * 显式排除 `clip`，保持 E6 入口文件名的单一真源。
 */
export type DailyEntryKind = 'daily' | 'inbox'

/** 入口目录：工作区根下的一级目录（主进程唯一使用方，渲染层不可指定目录） */
export const DAILY_ENTRY_DIRECTORIES: Readonly<Record<DailyEntryKind, string>> = {
    daily: 'diary',
    inbox: 'inbox'
}

/** 今日日记模板：front matter（title/date/createdAt/source）+ 一级标题 */
export const DAILY_ENTRY_TEMPLATE = [
    '---',
    'title: {{title}}',
    'date: {{date}}',
    'createdAt: {{datetime}}',
    'source: diary',
    '---',
    '',
    '# {{title}}',
    ''
].join('\n')

/** 快速收件箱模板：front matter（date/createdAt/source） */
export const INBOX_ENTRY_TEMPLATE = [
    '---',
    'date: {{date}}',
    'createdAt: {{datetime}}',
    'source: inbox',
    '---',
    ''
].join('\n')

/** 模板变量映射（未知变量不在此表中，渲染时原样保留） */
export type TemplateVariableMap = Readonly<Record<string, string | undefined>>

/** 模板占位符：`{{variable}}`（允许花括号内两侧空白，变量名限 ASCII 标识符） */
const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g

/** 英文星期全名（模板变量 `{{weekday}}` 的语言中立取值，索引与 Date#getDay 一致） */
const WEEKDAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
] as const

/** 两位补零 */
function pad2(value: number): string {
    return String(value).padStart(2, '0')
}

/** 本地日期 `YYYY-MM-DD` */
export function formatEntryDate(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 本地时间 `HHmmss`（文件名用，不含分隔符，排序友好） */
export function formatEntryTime(date: Date): string {
    return `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
}

/** 本地日期时间 `YYYY-MM-DDTHH:mm:ss`（front matter `createdAt` 用，无时区后缀） */
export function formatEntryDateTime(date: Date): string {
    return `${formatEntryDate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
        date.getSeconds()
    )}`
}

/** 星期英文全名（`{{weekday}}`） */
export function formatEntryWeekday(date: Date): string {
    return WEEKDAY_NAMES[date.getDay()] ?? ''
}

/**
 * 生成模板变量映射：`date/time/datetime/year/month/day/weekday/title`。
 *
 * @param date 用于取值的日期（应为合法 Date；非法 Date 由调用方先行校验）
 * @param overrides 覆盖项（如 `title`；同键优先取覆盖值）
 */
export function buildTemplateVariables(
    date: Date,
    overrides: TemplateVariableMap = {}
): Record<string, string> {
    const variables: Record<string, string> = {
        date: formatEntryDate(date),
        time: formatEntryTime(date),
        datetime: formatEntryDateTime(date),
        year: String(date.getFullYear()),
        month: pad2(date.getMonth() + 1),
        day: pad2(date.getDate()),
        weekday: formatEntryWeekday(date),
        title: formatEntryDate(date)
    }
    for (const [key, value] of Object.entries(overrides)) {
        if (typeof value === 'string') {
            variables[key] = value
        }
    }
    return variables
}

/**
 * 展开模板变量（纯字符串替换，禁止 eval）。
 *
 * - 已知变量替换为上下文中的值；
 * - 未知占位符（变量名不在上下文中 / 值为 undefined）**原样保留**；
 * - 空模板返回空串；不修改入参。
 *
 * @param template 含 `{{variable}}` 占位符的模板文本
 * @param variables 变量映射（`buildTemplateVariables` 的返回值或自定义映射）
 */
export function renderTemplateVariables(template: string, variables: TemplateVariableMap): string {
    if (typeof template !== 'string' || template.length === 0) {
        return ''
    }
    return template.replace(TEMPLATE_VARIABLE_PATTERN, (placeholder, name: string) => {
        const value = variables[name]
        return typeof value === 'string' ? value : placeholder
    })
}

/**
 * 生成入口文件名（主进程生成，不接受渲染层传入文件名）：
 * - daily → `YYYY-MM-DD.md`（同一工作区同一天只有一个今日日记文件）；
 * - inbox → `YYYY-MM-DD-HHmmss.md`（秒级唯一，连续创建不会互相覆盖）；
 * - 非法 kind / 非法 Date 返回 null（调用方必须先做白名单/日期校验，不应走到这里）。
 */
export function buildEntryFileName(kind: DailyEntryKind, date: Date): string | null {
    if (!Object.prototype.hasOwnProperty.call(DAILY_ENTRY_DIRECTORIES, kind)) {
        return null
    }
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null
    }
    const datePart = formatEntryDate(date)
    if (kind === 'inbox') {
        return `${datePart}-${formatEntryTime(date)}.md`
    }
    return `${datePart}.md`
}

/** 今日日记模板内容（front matter + `# 标题`，标题与文件名日期一致） */
export function buildDailyEntryTemplate(date: Date): string {
    const variables = buildTemplateVariables(date, { title: formatEntryDate(date) })
    return renderTemplateVariables(DAILY_ENTRY_TEMPLATE, variables)
}

/** 快速收件箱模板内容（front matter `date/createdAt/source: inbox`） */
export function buildInboxEntryTemplate(date: Date): string {
    return renderTemplateVariables(INBOX_ENTRY_TEMPLATE, buildTemplateVariables(date))
}

/**
 * 按入口类型生成新建文件模板内容（主进程唯一入口）。
 *
 * 非法 kind 由调用方在处理入口前白名单校验；此处对未知 kind 回退收件箱模板不合适，
 * 因此显式抛错以便单测/调用方尽早暴露（主进程 handler 已先校验，不会触发）。
 */
export function buildEntryTemplate(kind: DailyEntryKind, date: Date): string {
    if (kind === 'daily') {
        return buildDailyEntryTemplate(date)
    }
    if (kind === 'inbox') {
        return buildInboxEntryTemplate(date)
    }
    throw new Error(`未知的日常记录类型：${String(kind)}`)
}
