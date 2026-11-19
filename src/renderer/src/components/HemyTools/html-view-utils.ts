/**
 * HTML 查看器（ShowHtmlView）工具函数。
 *
 * 背景（2026-11-18）：HTML 查看器通过 iframe `srcdoc` 渲染文件内容，而 srcdoc 文档的
 * 基准 URL 是「父页面 URL」而非被查看文件所在目录——因此本地 HTML 中的**相对链接**
 * （如报告 HTML Wiki 顶部导航 `../README.html`）会解析到 app 安装目录，点击无反应。
 * 修复方式：读取 HTML 后注入 `<base href="file:///<文件所在目录>/">`，把相对 URL 基准
 * 指向文件真实目录（同源 iframe 内导航 `file://` → `file://` 允许）。
 *
 * 安全说明：注入 base 只改变相对 URL 解析基准，不执行脚本（sandbox 仍为
 * `allow-same-origin` 且无 `allow-scripts`），不提升跨域权限；打开本地 HTML 是用户主动行为。
 */

/**
 * 为 HTML 字符串注入 `<base href>`（基准指向 filePath 所在目录）。
 * @param html 原始 HTML 内容
 * @param filePath 被查看 HTML 的本地绝对路径（Windows 反斜杠 / POSIX 斜杠均可）
 * @returns 注入 base 后的 HTML（保持原有 <head> 优先）
 */
export function withBaseHref(html: string, filePath: string): string {
    const normalized = String(filePath || '').replace(/\\/g, '/')
    const slash = normalized.lastIndexOf('/')
    const dir = slash >= 0 ? normalized.slice(0, slash + 1) : normalized
    // encodeURI 保留 "/" 与 ":"，编码中文/空格等；但 `#` 与 `?` 在 file:// URL 中会分别被
    // 解析为 fragment/query，必须先转义（与 preview-local-render.toFileUrl 口径一致）。
    // POSIX 绝对路径（/notes/）用 file:// + 路径（file:///notes/）；Windows（E:/...）需 file:/// 前缀。
    const encodedDir = encodeURI(dir).replace(/#/g, '%23').replace(/\?/g, '%3F')
    const base = dir.startsWith('/') ? `file://${encodedDir}` : `file:///${encodedDir}`
    const tag = `<base href="${base}">`
    if (/<head(\s[^>]*)?>/i.test(html)) {
        return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n    ${tag}`)
    }
    if (/<html(\s[^>]*)?>/i.test(html)) {
        return html.replace(/<html(\s[^>]*)?>/i, (m) => `${m}\n<head>${tag}</head>`)
    }
    return `${tag}\n${html}`
}
