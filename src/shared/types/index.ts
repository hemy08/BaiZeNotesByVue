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
 * - system.ts      SystemSetting（主进程配置 store ↔ 渲染层设置对话框）
 * - theme.ts       ThemeStyles / ThemeUpdateData（主题样式与广播负载）
 * - editor.ts      EditorSetting（Monaco 编辑器设置持久化结构）
 * - file.ts        FileItem / FileProperties（目录树与文件属性）
 * - quick-link.ts  QuickLinkItem / QuickLinkConfig（NaviTab 快速链接）
 * - menu.ts        BaiZeMenuItem（渲染层菜单数据结构）
 * - markdown.ts    MarkdownTOC（Markdown 大纲项）
 * - crypto.ts      CryptoData / CryptoResult（加解密插件 IPC 负载，主进程消费）
 * - status-bar.ts  StatusBarUpdatePayload（状态栏更新负载）
 *
 * ## 历史遗留说明
 * - 原 src/main/global-types.d.ts 中的 Main/共享类型重复定义已删除，该文件现仅保留
 *   渲染层以全局方式使用的 FileProperties 兼容别名（shared 定义 + declare global 转发）；
 * - MenuContext（shared + main 两处定义、全库零引用）已删除；
 * - 渲染层私有对话框形状（ThemeConfig / EditorDialogSettings / SystemDialogSettings /
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
