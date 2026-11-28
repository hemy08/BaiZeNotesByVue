/**
 * 工作区模式共享常量（1.5.7 LLM Wiki L1：单一真源）
 *
 * ## 两种工作区模式
 * - `traditional`（默认）：传统笔记工作区，行为与 1.5.6 完全一致，`raw/` 只读守卫不生效；
 * - `llm-wiki`：LLM Wiki 工作区，`raw/` 存放原始资料且**只读**、`wiki/` 存放编译态知识，
 *   由「文件 → 初始化 LLM Wiki」命令创建目录与 `schema.md` 约定文件。
 *
 * ## 约束
 * - 合法取值只在本文件维护：主进程 `config-schema` 的 system 枚举校验、`system-setting`
 *   默认值、渲染层设置页下拉共用本常量（GEN-03 单一真源，禁止另写一份数组）；
 * - 本文件只放纯常量/纯类型（不依赖 Node/Electron/Vue，ARCH-05）。
 */
import type { WorkspaceMode } from '../types/system'

// 类型再导出：渲染层/主进程统一从本常量模块取 `WorkspaceMode`（与常量同源，
// 避免调用方同时 import types 与 constants 两处）
export type { WorkspaceMode }

/** 工作区模式合法取值（互斥单选；主进程 config-schema 枚举校验与本常量同源） */
export const WORKSPACE_MODE_VALUES = [
    'traditional',
    'llm-wiki'
] as const satisfies readonly WorkspaceMode[]

/** 默认工作区模式：traditional（对既有工作区零影响；llm-wiki 需用户显式选择） */
export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = 'traditional'

/** 工作区模式枚举常量（供 UI 下拉/文案键映射使用，取值与 {@link WORKSPACE_MODE_VALUES} 一致） */
export const WORKSPACE_MODE = {
    TRADITIONAL: 'traditional',
    LLM_WIKI: 'llm-wiki'
} as const satisfies Record<string, WorkspaceMode>

/** 归一化工作区模式：未知/非法值回落默认 traditional（CFG-10 白名单归一化口径） */
export function normalizeWorkspaceMode(value: unknown): WorkspaceMode {
    return typeof value === 'string' && (WORKSPACE_MODE_VALUES as readonly string[]).includes(value)
        ? (value as WorkspaceMode)
        : DEFAULT_WORKSPACE_MODE
}

/* ============================================================================
 * LLM Wiki 工作区布局常量（1.5.7 L1：目录/约定文件名的单一真源）
 *
 * 消费方：
 * - 主进程初始化服务 `main/utils/llm-wiki-workspace.ts`（创建目录与 schema.md）；
 * - 主进程写入守卫 `main/utils/security.ts`（判定目标是否位于 `raw/` 下）；
 * - 渲染层（如需展示提示文案）引用同一常量，避免各处手写目录名字符串。
 * ========================================================================== */

/** 原始资料目录名（LLM Wiki 只读区） */
export const LLM_WIKI_RAW_DIR_NAME = 'raw'

/** 编译态知识目录名（LLM Wiki 可写区） */
export const LLM_WIKI_WIKI_DIR_NAME = 'wiki'

/** 工作区约定文件名（front matter 规范 / 目录职责说明） */
export const LLM_WIKI_SCHEMA_FILE_NAME = 'schema.md'
