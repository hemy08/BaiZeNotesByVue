/**
 * A7 智能输入（opt-in，开关 `smartInput`，默认关闭）：回车键增强的纯函数实现。
 *
 * 设计约束：
 * - 本模块不依赖 Monaco / Vue / DOM：输入「当前行文本 + 光标列（1 基）+ 开关」，
 *   输出「插入计划」；真正的文本插入由 hemy-editor-actions.ts 完成，便于直接单测；
 * - 仅当光标位于行尾时给出增强计划；行中间回车返回 null，回退到原 EnterAction 行为，
 *   避免把列表/引用前缀插入到原行中间破坏内容；
 * - 开关关闭时调用方不进入本模块，原 EnterAction 行为逐字保持现状（见 hemy-editor-actions.ts）。
 */

/** 有序列表续行后需要顺延的后续项元数据（由调用方结合 model 生成重编号编辑） */
export interface SmartOrderedRenumber {
    /** 列表缩进（保持层级） */
    indent: string
    /** 序号分隔符：`.` 或 `)` */
    delimiter: '.' | ')'
    /** 下一项应使用的序号（当前项序号 + 2） */
    nextNumber: number
}

/** 增强回车计划：插入文本使用 `\n` 换行，由调用方按 Monaco 习惯转换为 `\r\n` */
export interface SmartEnterPlan {
    /** 光标处应插入的文本（`\n` 分隔） */
    insertText: string
    /** 需要从行首删除到光标前的字符数（空列表项回车退出列表时删除标记；0/缺省表示不删除） */
    deletePrefixChars?: number
    /** 有序列表按回车后，后续同缩进/同分隔符列表项需要自动重编号 */
    orderedRenumber?: SmartOrderedRenumber
}

/** 空列表项退格退出计划 */
export interface SmartBackspacePlan {
    /** 当前行需要删除的字符数（从行首到行尾） */
    deletePrefixChars: number
    /** 删除后光标列（1 基） */
    cursorColumn: number
}

/** 空列表项（回车退出列表）：`- ` / `1. ` / `- [ ] ` 等只含标记的行 */
const EMPTY_LIST_ITEM_PATTERNS: readonly RegExp[] = [
    /^(\s*)([-*+])([ \t]+)\[[ xX]\]([ \t]+)$/,
    /^(\s*)([-*+])([ \t]+)$/,
    /^(\s*)(\d+)([.)])([ \t]+)$/
]

/** 非空任务列表项：`- [ ] 内容` / `- [x] 内容`（* 与 + 同样支持） */
const TASK_ITEM_PATTERN = /^(\s*)([-*+])([ \t]+)\[[ xX]\]([ \t]+)\S/
/** 非空有序列表项：`1. 内容` / `2) 内容` */
const ORDERED_ITEM_PATTERN = /^(\s*)(\d+)([.)])([ \t]+)\S/
/** 非空无序列表项：`- 内容` / `* 内容` / `+ 内容`（含嵌套缩进） */
const UNORDERED_ITEM_PATTERN = /^(\s*)([-*+])([ \t]+)\S/
/** 引用块：`> 内容`、`> > 内容`、`>> 内容` */
const QUOTE_LINE_PATTERN = /^(\s*)((?:>[ \t]?)+)(\S.*)$/
/** ATX 标题：行首最多 3 个空格 + 1~6 个 # + 空白 + 非空标题文本 */
const ATX_HEADING_PATTERN = /^(\s{0,3})(#{1,6})([ \t]+)\S/

/** 取匹配结果指定分组（配合 noUncheckedIndexedAccess 关闭时的可空检查，保持类型安全） */
function group(match: RegExpMatchArray, index: number): string {
    return match[index] ?? ''
}

/**
 * 计算回车增强计划。
 *
 * @param lineText 光标所在行的完整文本
 * @param cursorColumn 光标列（Monaco 口径，1 基；等于行尾时才会增强）
 * @returns 增强计划；无需增强 / 光标不在行尾 / 非列表引用标题行时返回 null
 */
export function computeSmartEnterPlan(
    lineText: string,
    cursorColumn: number
): SmartEnterPlan | null {
    // 仅在行尾回车时增强，避免破坏行中间内容
    if (cursorColumn - 1 !== lineText.length) {
        return null
    }

    // 1) 空列表项回车：删除当前行标记，回到普通空行（退出列表）
    for (const pattern of EMPTY_LIST_ITEM_PATTERNS) {
        if (pattern.test(lineText)) {
            return { insertText: '\n', deletePrefixChars: lineText.length }
        }
    }

    // 2) 任务列表续行：统一补未勾选的新任务项（原 `- [x]` 也续成未勾选）
    const taskMatch = lineText.match(TASK_ITEM_PATTERN)
    if (taskMatch) {
        return {
            insertText: `\n${group(taskMatch, 1)}${group(taskMatch, 2)} [ ] `
        }
    }

    // 3) 有序列表自动递增：`1.` → `2.`，保留缩进与 `)` 分隔符；
    //    同时标记后续同缩进项按序重编号（调用方一次 executeEdits 完成）
    const orderedMatch = lineText.match(ORDERED_ITEM_PATTERN)
    if (orderedMatch) {
        const current = Number(group(orderedMatch, 2))
        if (!Number.isSafeInteger(current) || current < 0) {
            return null
        }
        const delimiter = group(orderedMatch, 3) as '.' | ')'
        return {
            insertText: `\n${group(orderedMatch, 1)}${current + 1}${delimiter} `,
            orderedRenumber: {
                indent: group(orderedMatch, 1),
                delimiter,
                nextNumber: current + 2
            }
        }
    }

    // 4) 无序列表续行（含嵌套）；保序放在任务列表之后，避免把任务项当普通列表
    const unorderedMatch = lineText.match(UNORDERED_ITEM_PATTERN)
    if (unorderedMatch) {
        return {
            insertText: `\n${group(unorderedMatch, 1)}${group(unorderedMatch, 2)} `
        }
    }

    // 5) 引用块续行：保留缩进与 `>` 层级
    const quoteMatch = lineText.match(QUOTE_LINE_PATTERN)
    if (quoteMatch) {
        const markers = group(quoteMatch, 2).trimEnd()
        return {
            insertText: `\n${group(quoteMatch, 1)}${markers} `
        }
    }

    // 6) 标题后回车补空行：正文与标题之间留一个空行
    if (ATX_HEADING_PATTERN.test(lineText)) {
        return { insertText: '\n\n' }
    }

    // 普通行不在这里处理
    return null
}

/**
 * 计算「空列表项退格退出」计划。
 *
 * 仅在空列表项（例：`- ` / `1. ` / `- [ ] `）且光标不在行首时生效；由调用方在
 * keydown 阶段拦截 Backspace，并一次 executeEdits 删除整行标记，保证可一次撤销。
 */
export function computeSmartBackspacePlan(
    lineText: string,
    cursorColumn: number
): SmartBackspacePlan | null {
    if (cursorColumn < 2 || cursorColumn > lineText.length + 1) {
        return null
    }
    if (!EMPTY_LIST_ITEM_PATTERNS.some((pattern) => pattern.test(lineText))) {
        return null
    }
    return { deletePrefixChars: lineText.length, cursorColumn: 1 }
}
