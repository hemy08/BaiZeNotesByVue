/**
 * 1.5.7 LLM Wiki L1：工作区初始化服务（主进程）
 *
 * ## 职责
 * - 校验当前工作区根（只接受主进程传入的 `appState.rootPath`，渲染层不传路径）；
 * - 在工作区根内创建 `raw/`（原始资料，只读）与 `wiki/`（编译态知识）目录；
 * - 生成 `schema.md` 工作区约定模板（包含 LLM Wiki 约定：raw 不可变、wiki 为编译态、
 *   front matter 规范示例等），**已存在时不覆盖**。
 *
 * ## 安全与幂等
 * 1. 根路径先经 `security.normalizeLocalPath` 校验（拒绝相对路径/设备命名空间/盘符根等
 *    异常形态），再 stat 确认为目录；所有目标路径由本模块在根内拼接；
 * 2. 目录创建使用 `recursive: true`（已存在不报错）；`schema.md` 以 `wx` 独占标志写入，
 *    命中 `EEXIST` 视为「已初始化」直接成功，**绝不覆盖**用户维护的约定文件；
 * 3. 失败返回结构化 `{ success: false, error }`，不向渲染层抛堆栈。
 *
 * ## 文案口径
 * 模板与错误文案为中文常量（本模块是主进程数据模板，不是 i18n 界面词典条目；
 * 1.5.7 L1 批次不改 i18n 词典，界面侧提示由渲染层按返回结果展示）。
 */
import { promises as fs } from 'fs'
import * as path from 'path'
import type { InitializeLlmWikiResult } from '../../shared/types/ipc'
// 1.5.7 L1：目录/约定文件名唯一真源在 shared 常量（渲染层/主进程共用）
import {
    LLM_WIKI_RAW_DIR_NAME,
    LLM_WIKI_SCHEMA_FILE_NAME,
    LLM_WIKI_WIKI_DIR_NAME
} from '../../shared/constants/workspace-mode'
import { logger } from './logger'
import { normalizeLocalPath } from './security'

// 目录/文件名常量从 shared 真源再导出，便于本模块既有调用方/单测直接引用
export { LLM_WIKI_RAW_DIR_NAME, LLM_WIKI_SCHEMA_FILE_NAME, LLM_WIKI_WIKI_DIR_NAME }

/** 错误文案：尚未打开工作区 */
export const LLM_WIKI_ERROR_NO_WORKSPACE = '尚未打开工作区，无法初始化 LLM Wiki。'

/** 错误文案：工作区根路径不合法 */
export const LLM_WIKI_ERROR_INVALID_ROOT = '当前工作区路径不合法，无法初始化 LLM Wiki。'

/** 错误文案：工作区根不可访问 */
export const LLM_WIKI_ERROR_ROOT_UNAVAILABLE =
    '当前工作区目录不存在或不可访问，无法初始化 LLM Wiki。'

/** 错误文案前缀：目录创建失败（拼接底层原因） */
export const LLM_WIKI_ERROR_CREATE_DIR_FAILED = '创建 raw/ 或 wiki/ 目录失败：'

/** 错误文案前缀：schema.md 写入失败（拼接底层原因） */
export const LLM_WIKI_ERROR_WRITE_SCHEMA_FAILED = '生成 schema.md 失败：'

/**
 * `schema.md` 工作区约定模板（中文）。
 *
 * 内容覆盖 T1.1 验收要求：raw 不可变、wiki 为编译态、front matter 规范示例；
 * 用行数组拼接而非模板字符串，避免正文中的 Markdown 代码围栏与 TS 模板字符串冲突。
 */
export const LLM_WIKI_SCHEMA_TEMPLATE: string = [
    '# LLM Wiki 工作区约定',
    '',
    '> 本文件由白泽笔记「初始化 LLM Wiki」命令生成，用于约定本工作区的目录职责与写作规范。',
    '> 如无特殊需要，请保留本文件；修改后建议提交到版本库，便于 AI 与人类协作者共享上下文。',
    '',
    '## 一、目录职责',
    '',
    '| 目录 | 存放内容 | 写入规则 |',
    '| --- | --- | --- |',
    '| `raw/` | 原始资料：网页剪藏、PDF 摘录、会议记录、访谈原文、截图等 | **只读**：应用内禁止写入 / 重命名 / 删除，保持原始资料不可变 |',
    '| `wiki/` | 编译态知识：主题笔记、概念卡、综述、对比表等 | 可写：日常编辑、重命名、删除 |',
    '| `schema.md` | 本约定文件 | 可写：用户自行维护 |',
    '',
    '## 二、LLM Wiki 约定',
    '',
    '1. **`raw/` 不可变**：原始资料一旦放入 `raw/` 即视为不可变，应用内不允许修改、重命名或删除；',
    '   需要更正或补充时，请新增一份带日期/来源标记的文件，并保留旧资料。',
    '2. **`wiki/` 是编译态**：`wiki/` 中存放经阅读、归纳、交叉引用后的结构化知识，',
    '   而不是原始资料的复制粘贴；同一主题尽量沉淀为一篇可独立阅读的笔记。',
    '3. **`raw/` 不参与检索**：工作区索引与全文搜索会忽略 `raw/`，',
    '   原始资料仅作为 `wiki/` 笔记的引用来源与可追溯证据。',
    '4. **引用原始资料用相对链接**：例如 `[来源](../raw/2026-11-28-原始资料.md)`，',
    '   便于在编辑器内点击跳转、在版本库中保持可移植。',
    '5. **命名建议**：主题笔记使用「领域-主题」形式的可读名称（中文或英文均可），',
    '   避免特殊字符；子目录按领域划分，避免层级过深。',
    '',
    '## 三、Front matter 规范',
    '',
    '`wiki/` 下的主题笔记建议使用以下 YAML front matter：',
    '',
    '```yaml',
    '---',
    'title: 主题名称',
    'tags:',
    '  - 领域/子领域',
    '  - 关键词',
    'source:',
    '  - raw/2026-11-28-原始资料.md',
    'status: draft',
    'created: 2026-11-28',
    'updated: 2026-11-28',
    '---',
    '```',
    '',
    '| 字段 | 必填 | 说明 |',
    '| --- | --- | --- |',
    '| `title` | 否 | 主题名称；缺省时使用第一个 H1 或文件名 |',
    '| `tags` | 否 | 标签数组（也接受中英文逗号分隔字符串）；建议「领域/子领域」形式 |',
    '| `source` | 否 | 对应原始资料的相对路径（可多值），指向 `raw/` 下的文件 |',
    '| `status` | 否 | 编译状态：`draft`（草稿）/ `reviewed`（已校对）/ `stable`（稳定） |',
    '| `created` / `updated` | 否 | 创建 / 更新日期（`YYYY-MM-DD`） |',
    '',
    '### 示例',
    '',
    '```markdown',
    '---',
    'title: LLM Wiki 工作方式',
    'tags:',
    '  - 知识管理/LLM Wiki',
    'source:',
    '  - raw/2026-11-28-llm-wiki-原始资料.md',
    'status: draft',
    'created: 2026-11-28',
    'updated: 2026-11-28',
    '---',
    '',
    '# LLM Wiki 工作方式',
    '',
    '原始资料见 [来源](../raw/2026-11-28-llm-wiki-原始资料.md)。',
    '',
    '## 要点',
    '',
    '- 原始资料进 `raw/`，保持不可变；',
    '- 归纳与结论沉淀到 `wiki/`，形成可被人类与 AI 共同消费的编译态知识。',
    '```',
    '',
    '## 四、维护建议',
    '',
    '- `raw/` 中的资料建议按日期或来源命名，便于追溯；',
    '- `wiki/` 中的主题笔记建议互相链接（`[[目标笔记]]` 或相对 Markdown 链接），形成知识网络；',
    '- 定期回看 `status: draft` 的笔记，校对后升级为 `reviewed` / `stable`。',
    ''
].join('\n')

/** 从底层异常中提取可读原因（Error.message / 字符串化） */
function describeError(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
        return error.message
    }
    return String(error)
}

/**
 * 初始化当前工作区为 LLM Wiki 工作区（幂等）。
 *
 * @param rawRootPath 工作区根绝对路径（生产只传 `appState.rootPath`；类型未知时按非法处理）
 * @returns 结构化结果：`{ success: true }` 表示工作区已就绪（含「已初始化过」）；
 *          失败返回 `{ success: false, error }`，不抛异常。
 */
export async function initializeLlmWikiWorkspace(
    rawRootPath: unknown
): Promise<InitializeLlmWikiResult> {
    if (typeof rawRootPath !== 'string' || rawRootPath.trim().length === 0) {
        return { success: false, error: LLM_WIKI_ERROR_NO_WORKSPACE }
    }
    const rootPath = normalizeLocalPath(rawRootPath)
    if (rootPath === null) {
        logger.warn('[LLM Wiki] 工作区根路径不合法，已拒绝初始化：', String(rawRootPath))
        return { success: false, error: LLM_WIKI_ERROR_INVALID_ROOT }
    }
    try {
        const stats = await fs.stat(rootPath)
        if (!stats.isDirectory()) {
            return { success: false, error: LLM_WIKI_ERROR_ROOT_UNAVAILABLE }
        }
    } catch (error) {
        logger.warn('[LLM Wiki] 工作区根不可访问：', rootPath, error)
        return { success: false, error: LLM_WIKI_ERROR_ROOT_UNAVAILABLE }
    }

    const rawDirPath = path.join(rootPath, LLM_WIKI_RAW_DIR_NAME)
    const wikiDirPath = path.join(rootPath, LLM_WIKI_WIKI_DIR_NAME)
    const schemaFilePath = path.join(rootPath, LLM_WIKI_SCHEMA_FILE_NAME)

    try {
        // recursive: true —— 目录已存在时幂等成功（不报错、不删除既有内容）
        await Promise.all([
            fs.mkdir(rawDirPath, { recursive: true }),
            fs.mkdir(wikiDirPath, { recursive: true })
        ])
    } catch (error) {
        logger.error('[LLM Wiki] 创建目录失败：', rootPath, error)
        return {
            success: false,
            error: `${LLM_WIKI_ERROR_CREATE_DIR_FAILED}${describeError(error)}`
        }
    }

    try {
        // 'wx'：文件已存在直接抛 EEXIST —— 从系统调用层保证「绝不覆盖」既有约定文件
        await fs.writeFile(schemaFilePath, LLM_WIKI_SCHEMA_TEMPLATE, {
            encoding: 'utf-8',
            flag: 'wx'
        })
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
            // 已初始化过：保留用户维护的 schema.md，按成功处理（幂等）
            logger.info('[LLM Wiki] schema.md 已存在，保留原文件不覆盖：', schemaFilePath)
            return { success: true }
        }
        logger.error('[LLM Wiki] 写入 schema.md 失败：', schemaFilePath, error)
        return {
            success: false,
            error: `${LLM_WIKI_ERROR_WRITE_SCHEMA_FAILED}${describeError(error)}`
        }
    }

    logger.info('[LLM Wiki] 工作区初始化完成：', rootPath)
    return { success: true }
}
