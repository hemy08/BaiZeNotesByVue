/**
 * 1.5.7 LLM Wiki 迁移批次：文件迁移 IPC（主进程侧，domain=llm-wiki，4 个 invoke）
 *
 * 链路（IPC-17 六步）：
 *   1. 常量：`IPC.LLM_WIKI.GET_STATUS / SCAN_FILES / MIGRATE / ROLLBACK_MIGRATION`
 *      （shared/ipc-channels.ts）；
 *   2. 契约：`LlmWikiWorkspaceStatus / LlmWikiScanResult / LlmWikiMigrateResult /
 *      LlmWikiRollbackResult` + IpcRequests / IpcResponses（shared/types/ipc.ts）；
 *   3. 白名单：build/generate-preload-whitelist.js 生成（禁止手改）；
 *   4. 主进程：本模块注册 handler（withSenderCheck）→ utils/llm-wiki-migrate.ts
 *      （工作区初始化状态检测 / 扫描统计 / 复制 / 移动 / 操作日志 / 回滚；
 *      专用迁移授权 + 路径/符号链接校验）；
 *   5. 渲染层：common/llm-wiki-migration-actions.ts + MigrationWizardDialog.vue
 *      + composables/useWorkspaceModeSwitch.ts（已初始化直接切换 / 首次切换弹迁移弹窗）；
 *   6. 测试：llm-wiki-migration-ipc / llm-wiki-migrate / llm-wiki-migration-actions /
 *      use-workspace-mode-switch / migration-wizard-dialog + 通道命名/契约/白名单/注册门禁。
 *
 * 安全边界：
 * - 仅主窗口可信调用（withSenderCheck，`kind: 'handle'` 拒绝返回统一错误对象）；
 * - 工作区根只取主进程 `appState.rootPath`（渲染层不传根，无法指定任意目录）；
 * - 迁移/回滚的路径校验、符号链接拒绝、raw/ 目标限定全部在迁移服务内部完成；
 * - 状态检测只做 `stat` 探测（不读目录/文件内容），无工作区时全部 false；
 * - 所有失败返回结构化结果（`ok:false` + `error`），不向渲染层抛异常/堆栈。
 */
import { IPC } from '../../shared/ipc-channels'
import type {
    LlmWikiMigrateResult,
    LlmWikiRollbackResult,
    LlmWikiScanResult,
    LlmWikiWorkspaceStatus
} from '../../shared/types/ipc'
import { withSenderCheck } from '../utils/ipc-security'
import {
    inspectLlmWikiWorkspaceStatus,
    migrateLlmWikiFiles,
    rollbackLlmWikiMigration,
    scanLlmWikiMigratableFiles,
    type LlmWikiMigrationDeps
} from '../utils/llm-wiki-migrate'
import { ipcListenerManager } from './ipc-listener-manager'

/** 监听台账组件 ID（与各独立域模块口径一致：global-<domain>-ipc） */
export const LLM_WIKI_MIGRATION_IPC_COMPONENT_ID = 'global-llm-wiki-migration-ipc'

/** 迁移 IPC 业务入口的可注入依赖（生产缺省取 appState / userData；单测注入替身） */
export interface LlmWikiMigrationIpcDeps {
    /** 工作区根（缺省 `appState.rootPath`；生产不传，单测可注入） */
    rootPath?: string
    /** 操作日志目录（缺省 `userData/migrations`；null = 不可用，单测验证降级） */
    logDir?: string | null
    /** 时间源（日志 id / 时间戳；单测固定） */
    now?: () => Date
}

/** 把 IPC 层依赖透传给迁移服务（字段同名，显式声明避免隐式耦合） */
function toServiceDeps(deps: LlmWikiMigrationIpcDeps): LlmWikiMigrationDeps {
    return {
        rootPath: deps.rootPath,
        logDir: deps.logDir,
        now: deps.now
    }
}

/**
 * `LLM_WIKI.GET_STATUS` 业务入口（导出便于单测直接断言）。
 *
 * @returns 工作区 LLM Wiki 状态；无工作区/根不可访问时全部 false（不抛异常）
 */
export async function llmWikiGetStatus(
    deps: LlmWikiMigrationIpcDeps = {}
): Promise<LlmWikiWorkspaceStatus> {
    return inspectLlmWikiWorkspaceStatus(toServiceDeps(deps))
}

/**
 * `LLM_WIKI.SCAN_FILES` 业务入口（导出便于单测直接断言）。
 *
 * @returns 结构化统计结果；无工作区/根非法返回 `{ ok:false, error }`，不抛异常
 */
export async function llmWikiScanFiles(
    deps: LlmWikiMigrationIpcDeps = {}
): Promise<LlmWikiScanResult> {
    return scanLlmWikiMigratableFiles(toServiceDeps(deps))
}

/**
 * `LLM_WIKI.MIGRATE` 业务入口：渲染层只传 `{ mode, formats }`，根路径由主进程持有。
 */
export async function llmWikiMigrateFiles(
    payload: unknown,
    deps: LlmWikiMigrationIpcDeps = {}
): Promise<LlmWikiMigrateResult> {
    return migrateLlmWikiFiles(payload, toServiceDeps(deps))
}

/**
 * `LLM_WIKI.ROLLBACK_MIGRATION` 业务入口：缺省回滚最近一次未回滚的迁移。
 */
export async function llmWikiRollbackMigration(
    payload: unknown,
    deps: LlmWikiMigrationIpcDeps = {}
): Promise<LlmWikiRollbackResult> {
    return rollbackLlmWikiMigration(payload, toServiceDeps(deps))
}

/**
 * 注册 LLM Wiki 迁移 IPC（4 个 invoke 通道）。
 *
 * @param componentId 监听台账组件 ID（来源 registry 编排；缺省用本域常量）
 */
export function registerLlmWikiMigrationIpc(
    componentId: string = LLM_WIKI_MIGRATION_IPC_COMPONENT_ID
): void {
    ipcListenerManager.registerHandleOnce(
        IPC.LLM_WIKI.GET_STATUS,
        withSenderCheck(IPC.LLM_WIKI.GET_STATUS, async () => llmWikiGetStatus(), {
            kind: 'handle'
        }),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.LLM_WIKI.SCAN_FILES,
        withSenderCheck(IPC.LLM_WIKI.SCAN_FILES, async () => llmWikiScanFiles(), {
            kind: 'handle'
        }),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.LLM_WIKI.MIGRATE,
        withSenderCheck(
            IPC.LLM_WIKI.MIGRATE,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) =>
                llmWikiMigrateFiles(payload),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.LLM_WIKI.ROLLBACK_MIGRATION,
        withSenderCheck(
            IPC.LLM_WIKI.ROLLBACK_MIGRATION,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) =>
                llmWikiRollbackMigration(payload),
            { kind: 'handle' }
        ),
        componentId
    )
}
