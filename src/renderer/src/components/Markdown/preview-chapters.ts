/**
 * preview-chapters.ts
 * P1/PF-2：预览渲染管线的「大纲（TOC）增量判定」。
 *
 * 背景：
 * 预览每轮渲染都会基于「编辑器原始内容」再做一次全文 `md.parse` 提取标题
 * （PF-8：1 MiB 文档单轮约 70.6 ms + indexOf 定位 28.6 ms）。该解析**不能**简单复用
 * `md.render` 的 tokens：`HemyRenderPreLocal` 会在围栏代码块边界合并换行
 * （实测 16~50 KiB 报告类文档预渲染后行数会少 3~13 行），基于预渲染文本的
 * `token.map` 行号与编辑器行号不一致，会破坏目录点击定位（PF-14 依赖 lineNumber）。
 *
 * 方案：
 * 用 O(行数)、无全文拷贝的「标题候选行指纹」判定标题结构是否可能变化：
 * 1. 只收集可能构成/影响标题的行（ATX 标题行、setext 下划线行），记录其**行号 + 行内容**；
 * 2. 行号参与指纹 → 标题上方增删行（导致标题行平移）也会触发重解析，保证跳转行号准确；
 * 3. 指纹是「候选超集」：宁可多解析（误报只是让原本的全量解析照旧发生，不影响正确性），
 *    不遗漏标题变化（漏报才会导致目录陈旧）。
 *
 * 收益：正文编辑（标题结构未变）时不再触发第二次全文解析；标题新增/删除/改名/平移时才解析。
 */

import { FNV_OFFSET_BASIS, fnv1a32Mix } from '../../../../shared/utils/hash'

/**
 * 可出现在标题行前的容器前缀（候选超集）：引用符、列表标记（含嵌套列表）。
 * markdown-it 只会因 ATX 标题规则或 setext 下划线规则产生 heading token，
 * 因此"行首容器前缀 + 标题标记"的候选范围必须覆盖这两种规则可能命中的行。
 */
const CONTAINER_PREFIX = '(?:[\\s>]|(?:[-*+]|\\d+[.)])\\s+)*'

/** ATX 标题候选行：行首（允许任意缩进/引用/嵌套列表前缀，作为超集）出现的 1~6 个 `#` */
const ATX_CANDIDATE_RE = new RegExp(`^${CONTAINER_PREFIX}#{1,6}(?:\\s|$)`)

/** setext 标题下划线候选行：仅由 `=`/`-` 与空白/引用符组成（超集，含主题分隔线） */
const SETEXT_CANDIDATE_RE = new RegExp(`^${CONTAINER_PREFIX}[-=]+[\\s>]*$`)

/*
 * 章节指纹的 FNV-1a 32 位哈希（仅作指纹，无需密码学强度）。
 *
 * 迁移（渲染层公共接口归位）：原本地常量 `FNV_OFFSET_BASIS`/`FNV_PRIME` 与
 * `mixString()` 实现已删除，改为复用 `src/shared/utils/hash.ts`（同一偏移基准、
 * 同一质数、同一逐字符 XOR + Math.imul 顺序，输出逐字一致）。
 */

/**
 * 计算「标题候选行」指纹。
 *
 * - 逐行扫描（手写换行遍历，避免 `split('\n')` 对全文做数组拷贝）；
 * - 行号与行内容一起混入，因此标题平移、改名、增删都会改变指纹；
 * - 只追加正文/正文内改名（没有标题候选行变化）不会改变指纹。
 *
 * @param text 编辑器原始 Markdown 内容
 * @returns 32 位无符号指纹
 */
export function ComputeChaptersFingerprint(text: string): number {
    let hash = FNV_OFFSET_BASIS
    let lineNumber = 0
    let lineStart = 0

    for (let index = 0; index <= text.length; index += 1) {
        if (index !== text.length && text.charCodeAt(index) !== 10) {
            continue
        }
        const rawLine = text.slice(lineStart, index)
        // 兼容 CRLF：去掉行尾 \r，使同一文档的 LF/CRLF 表示得到相同指纹
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        lineStart = index + 1
        if (ATX_CANDIDATE_RE.test(line) || SETEXT_CANDIDATE_RE.test(line)) {
            hash = fnv1a32Mix(hash, `${lineNumber}\u0000${line}\u0001`)
        }
        lineNumber += 1
    }

    return hash >>> 0
}
