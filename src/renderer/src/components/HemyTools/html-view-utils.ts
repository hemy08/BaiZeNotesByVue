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
 *
 * 迁移（渲染层公共接口归位）：base href 计算与 `<head>` 注入改为复用
 * `src/shared/utils/path.ts` 的 `dirToBaseHref` 与 `src/shared/utils/html.ts` 的
 * `injectIntoHead`（原实现已逐字抽取到 shared 并带等价性单测）；
 * 本函数保留原导出名/签名与输出格式，仅替换实现来源。
 */

import { dirToBaseHref } from '../../../../shared/utils/path'
import { injectIntoHead } from '../../../../shared/utils/html'

/**
 * 为 HTML 字符串注入 `<base href>`（基准指向 filePath 所在目录）。
 * @param html 原始 HTML 内容
 * @param filePath 被查看 HTML 的本地绝对路径（Windows 反斜杠 / POSIX 斜杠均可）
 * @returns 注入 base 后的 HTML（保持原有 <head> 优先）
 */
export function withBaseHref(html: string, filePath: string): string {
    // dirToBaseHref 内部：反斜杠归一化 → 取目录（含尾部 /）→ encodeURI → 转义 #/?，
    // 与迁移前本地实现逐字等价（含 Windows 盘符 file:/// 前缀与 POSIX file:// 前缀）。
    const tag = `<base href="${dirToBaseHref(filePath)}">`
    // injectIntoHead 的三分支（已有 head / 仅 html / 裸露片段）与原实现逐字一致。
    return injectIntoHead(html, tag)
}
