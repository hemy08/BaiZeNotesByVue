/**
 * 共享类型统一出口（ARC-13：主进程 / 渲染层唯一真源）
 *
 * ## 来源约定（新增类型请遵守）
 * 1. 主进程与渲染层双方都要用到的跨进程契约类型（IPC 负载、配置结构、主题结构等）
 *    只能定义在 src/shared/types/ 目录下，按领域拆分到独立文件；
 * 2. main / renderer 两侧一律通过 `import type { X } from '.../shared/types'` 引用，
 *    禁止在 src/main/global-types.d.ts、src/main/config/*.ts、
 *    src/renderer/src/** 中再各自定义同名结构；
 * 3. 类型收敛必须保持字段名 / 类型 / 可选性不变（结构等价），发现历史定义互相矛盾时
 *    以实际使用方为准并在 out/tool-results/r3-types-changes.md 说明取舍；
 * 4. 本目录只放纯类型声明（不引入 Node/Electron/DOM 之外的运行时依赖），
 *    供 tsconfig.node.json 与 tsconfig.web.json 两个程序共用；
 * 5. 本文件只做 re-export，既有 `from '.../shared/types'` 的引用路径保持不变。
 *
 * ## 当前领域划分
 * - system.ts      SystemSetting / WindowBounds（主进程配置 store ↔ 渲染层设置对话框）
 * - theme.ts       ThemeType / ThemeConfig / ThemeStyles / Monaco 主题族 /
 *                  ThemeListItem / ThemeListResult / ThemeUpdateData（第 2 批主题类型族）
 * - editor.ts      EditorSetting（Monaco 编辑器设置持久化结构）
 * - file.ts        FileItem / FileTreePayload / FileProperties / 最近文件负载
 *                  （目录树传输契约与文件属性，第 2 批补 id / FileTreePayload）
 * - quick-link.ts  QuickLinkItem / QuickLinkConfig（NaviTab 快速链接）
 * - menu.ts        BaiZeMenuItem（渲染层菜单数据结构）
 * - markdown.ts    MarkdownTOC（Markdown 大纲项）
 * - crypto.ts      CryptoData / CryptoWireData / CryptoResult（加解密插件 IPC 负载）
 * - status-bar.ts  StatusBarUpdatePayload（状态栏更新负载）
 * - ipc.ts         IpcRequests / IpcResponses / IpcEvents + IPC 载荷结构
 *                  （AppVersionInfo / SelectImageResult / PlantumlRenderResponse /
 *                  HashResult 等领域载荷，第 2 批：IPC 载荷契约）
 * - config.ts      ConfigName / ConfigReadMap / ConfigWriteMap + AppThemeConfig /
 *                  RendererEditorConfig / 备份契约（第 2 批：配置读写契约）
 * - dialog.ts      VueDialogName / MainProcessDialogName / 各对话框 data 契约（第 2 批）
 * - pdf-annotations.ts
 *                  1.5.2 E2 PDF 标注与摘录：PdfAnnotation / PdfAnnotationRect /
 *                  CreatePdfAnnotationInput / 加载与保存结果（侧车文件契约）
 *
 * 主题明暗分组清单（非类型）见 src/shared/constants/theme.ts 的 THEME_GROUPS。
 *
 * ## 历史遗留说明
 * - 原 src/main/global-types.d.ts 中的 Main/共享类型重复定义已删除，该文件现仅保留
 *   渲染层以全局方式使用的 FileProperties 兼容别名（shared 定义 + declare global 转发）；
 * - MenuContext（shared + main 两处定义、全库零引用）已删除；
 * - 渲染层私有对话框形状（EditorDialogSettings / SystemDialogSettings /
 *   快速链接设置对话框 Link 等）不属跨进程同构类型，未纳入本次收敛，详见变更报告遗留项。
 */

export * from './system'
export * from './theme'
export * from './editor'
export * from './file'
export * from './quick-link'
export * from './menu'
export * from './markdown'
export * from './crypto'
export * from './status-bar'
// 第 2 批契约层（核心组）：IPC 载荷 / CONFIG 配置映射 / 对话框契约。
// 采用 `export type *` 保证只导出类型——ipc.ts 内以 `import type` 引用 IPC 常量做
// 计算属性名，不引入任何运行时依赖，本出口继续保持「纯类型」语义。
export type * from './ipc'
export type * from './config'
export type * from './dialog'
// 1.5.2 E2：PDF 标注与摘录契约（侧车文件数据结构 + 两个 FILE 通道的返回结构）。
export type * from './pdf-annotations'
// 1.5.2 E3：图片 OCR 契约（语言包准备 / 剪贴板图片识别两个 OCR 通道的请求与返回结构）。
export type * from './ocr'
