/**
 * 跨进程共享的 HTML 字符串纯函数（第 1 批公共接口归位：src/shared/utils/html.ts）。
 *
 * 本模块只做无副作用的字符串变换，不依赖 electron / vue / DOM：
 * - {@link escapeHtml}：HTML 特殊字符转义；
 * - {@link injectIntoHead}：把一段标签（`<meta>` / `<base>` 等）注入到文档 `<head>`。
 */

/**
 * HTML 文本/属性值转义（覆盖 5 个 HTML 特殊字符）。
 *
 * 对齐 `src/renderer/src/common/escape-html.ts:15-22`：
 * `&` 必须最先替换，否则会把后续生成的实体（如 `&lt;`）再次转义成 `&amp;lt;`，
 * 浏览器解码后仍会还原出 `<`，等于绕过转义。
 *
 * 注意：这不是给 `v-html` 兜底的通用消毒器——外部输入应优先改文本插值，
 * 或使用 DOMPurify 白名单消毒。
 *
 * @param text 原始文本
 * @returns 转义后的文本（`& < > " '` → `&amp; &lt; &gt; &quot; &#39;`）
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/** 匹配 `<head ...>` 开标签（不匹配闭合标签；`(\s[^>]*)?` 允许携带属性） */
const HEAD_TAG_PATTERN = /<head(\s[^>]*)?>/i

/** 匹配 `<html ...>` 开标签 */
const HTML_TAG_PATTERN = /<html(\s[^>]*)?>/i

/**
 * 把一段 HTML 标签注入到文档的 `<head>` 内。
 *
 * 对齐 `src/main/dialogs/dialog-defaults.ts:42-54`（withDialogCsp）与
 * `src/renderer/src/components/HemyTools/html-view-utils.ts:30-36`（withBaseHref）
 * 完全一致的三分支逻辑（两处实现逐字同构）：
 * 1. 已有 `<head>`（可带属性）→ 在开标签后换行 + 4 空格缩进插入；
 * 2. 无 `<head>` 但有 `<html>`（可带属性）→ 补 `<head>标签</head>`；
 * 3. 两者都没有 → 标签前置到内容最前面。
 *
 * 本函数**不负责幂等判断**：withDialogCsp 的「已含 CSP 则保持原样」、withBaseHref 的
 * 「调用方保证只注入一次」都由调用方处理（避免把业务判断耦合进公共注入逻辑），
 * 因此对同一文档重复调用会重复注入。
 *
 * @param html 原始 HTML 字符串
 * @param tag 要注入的完整标签字符串（如 `<meta http-equiv="...">`、`<base href="...">`）
 * @returns 注入后的 HTML 字符串
 */
export function injectIntoHead(html: string, tag: string): string {
    if (HEAD_TAG_PATTERN.test(html)) {
        return html.replace(HEAD_TAG_PATTERN, (match) => `${match}\n    ${tag}`)
    }
    if (HTML_TAG_PATTERN.test(html)) {
        return html.replace(HTML_TAG_PATTERN, (match) => `${match}\n<head>${tag}</head>`)
    }
    return `${tag}\n${html}`
}
