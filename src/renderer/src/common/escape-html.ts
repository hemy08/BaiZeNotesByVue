/**
 * 渲染层共享 HTML 转义工具（P1 安全修复）。
 *
 * 背景：`hemy-editor-render.ts` 曾内置一份 `escapeHtml`（仅用于 mermaid/PlantUML
 * 错误回显），而 TOC 目录（`ResourceManager.vue`）此前把 markdown-it `text` token
 * 的内容直接写入 `v-html`——该内容已完成 HTML 实体解码（`&lt;img&gt;` → `<img>`），
 * 造成存储型 XSS（复核编号 N-03）。本模块把转义实现收敛为单一来源，供渲染层需要
 * 拼接 HTML 字符串的降级回显等场景统一复用，避免各处转义字符集不一致。
 *
 * 覆盖 5 个 HTML 特殊字符；`&` 必须最先替换，否则会把后续生成的实体再转义一次。
 *
 * 迁移（渲染层公共接口归位）：实现已归位到 `src/shared/utils/html.ts` 的
 * `escapeHtml`（主进程对话框与渲染层共用同一实现），本文件改为 **re-export 薄壳**，
 * 保留 `../../common/escape-html` 这条既有引用路径与导出名，调用方零改动。
 *
 * 注意：这不是给 `v-html` 兜底的通用消毒器——`v-html` 渲染外部输入应优先改为
 * 文本插值（Vue 自动转义），或使用 DOMPurify 白名单消毒。
 */
export { escapeHtml } from '../../../shared/utils/html'
