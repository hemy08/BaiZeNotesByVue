/**
 * utils 侧 IPC 注册能力提供者（P1-1：消除 config → ipc 反向依赖，依赖倒置）
 *
 * ## 背景
 * 历史上 `src/main/config/config-manager.ts` 直接静态 import
 * `src/main/ipc/ipc-listener-manager`，只是为了在配置通道注册时调用
 * `registerHandleOnce`（MEM-10 注册台账）。这在依赖方向上形成
 * **config（L2 业务层）→ ipc（L1 编排层）** 的反向边；而 `ipc/**` 本就合法地
 * 依赖 `config/**`（如 ipc/registry 编排配置注册），两层互指后方向约束失效。
 *
 * ## 方案（与 H1 的 utils/providers.ts 同一模式：依赖倒置）
 * - config 侧只依赖本「提供者」叶子模块：它在**未注入时不做任何注册**（仅告警），
 *   不 import 任何 `ipc/**`、`config/**` 或 electron 运行时；
 * - 真实注册能力由 IPC 层在启动早期（`ipc/registry.registerPreWindowIpc`，即在
 *   调用 `config-manager.registerConfigIpcHandlers` 之前）经
 *   `setIpcHandleRegistrar(ipcListenerManager)` 注入；
 * - 单测若需要验证真实注册链路，自行注入 `ipcListenerManager` 即可（见
 *   tests/unit/config-manager.test.ts 的 beforeEach）。
 *
 * ## 行为保持
 * - 注入后每次注册都实时委托给注入实现（无缓存、无拦截），注册参
 *   （通道名 / 监听器 / 组件 ID）与调用顺序原样传递，台账（inventory）口径不变；
 * - 未注入时返回 null 并告警，不抛错——与「注册函数在无 IPC 环境被直接调用」的
 *   防御语义一致，避免测试环境因缺注入而崩溃。
 *
 * ## 边界
 * 本文件是叶子模块：禁止 import `../config`、`../ipc` 或任何业务模块
 * （由 tests/architecture/dependency-boundaries.test.ts 的 `config-no-ipc` 规则与
 * utils 层规则共同守护）。对 electron 只做 type import（与 utils/ipc-security.ts
 * 同一口径，编译期擦除，不引入运行时依赖）。
 */
import type { ipcMain } from 'electron'

/**
 * ipcMain.handle 的监听器签名。
 *
 * 直接沿用 Electron 自身参数类型（与 ipc/ipc-listener-manager 的 IpcHandleListener
 * 同源），保证注入实现与调用方签名严格一致；本模块只在类型位置引用 electron。
 */
type IpcHandleListener = Parameters<typeof ipcMain.handle>[1]

/**
 * IPC `ipcMain.handle` 一次性注册能力的最小接口。
 *
 * 监听器签名与 ipc/ipc-listener-manager.IpcHandleListener 完全一致，
 * 因此 ipcListenerManager 可直接作为实现注入。
 */
export interface IpcHandleRegistrar {
    registerHandleOnce(
        channel: string,
        listener: IpcHandleListener,
        componentId?: string
    ): string | null
}

/** 已注入的注册实现（进程内唯一；未注入为 null） */
let ipcHandleRegistrar: IpcHandleRegistrar | null = null

/**
 * 注入 IPC handle 注册实现（由 IPC 层在启动早期调用）。
 * 传入 null/undefined 或缺少 registerHandleOnce 的对象视为未注入（安全回退）。
 */
export function setIpcHandleRegistrar(registrar: IpcHandleRegistrar | null | undefined): void {
    ipcHandleRegistrar =
        registrar && typeof registrar.registerHandleOnce === 'function' ? registrar : null
}

/**
 * 注册 `ipcMain.handle` 通道（委托给已注入的 IPC 注册实现）。
 *
 * @returns 注入实现返回的监听器 ID；未注入时返回 null（仅告警，不抛错）
 */
export function registerIpcHandleOnce(
    channel: string,
    listener: IpcHandleListener,
    componentId?: string
): string | null {
    if (!ipcHandleRegistrar) {
        console.warn(
            `[IpcRegistration] IPC 注册能力尚未注入，通道 "${channel}" 未注册（启动顺序异常或单测缺少 provider 注入）`
        )
        return null
    }
    return ipcHandleRegistrar.registerHandleOnce(channel, listener, componentId)
}
