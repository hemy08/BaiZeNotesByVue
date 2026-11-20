/**
 * IPC 注册收口（P2 架构债）：原 `utils/utils.ts` 的 29 处 IPC 注册编排入口
 *
 * ## 背景
 * 改造前 `src/main/utils/utils.ts` 同时承担「IPC 注册枢纽（29/68 处注册）+ RSA 入参校验 +
 * 可执行文件安全策略 + file-utils/crypto 门面」四类职责，与 M2「IPC 注册收口」目标相悖。
 * 本批把 29 处注册按域拆到 `src/main/ipc/` 下的独立模块，utils.ts 只保留纯工具函数，
 * 从而消除架构测试中 `utils → ipc` 的最后一条例外方向。
 *
 * ## 模块划分（通道域 → 文件）
 * - `file-manager-ipc.ts`：FILE.OPEN_SELECT_FILE、FILE_MANAGER.*（8）、RENDER.INSERT_IMAGE；
 * - `crypto-ipc.ts`：PLUGIN.RSA_GENERATE、HASH_TEXT、HMAC_TEXT、CRYPTO_ENCRYPT/DECRYPT；
 * - `navigation-ipc.ts`：NAVIGATION.OPEN_EXE（多重安全校验）；
 * - `theme-ipc.ts`：QUICK_LINKS.GET、THEME.GET_CURRENT_THEME_STYLES、GET_ALL_THEMES、
 *   GET_ALL_MONACO_THEMES；
 * - `file-editor-ipc.ts`：FILE.UPDATE_SELECT_FILE_CONTENT、REOPEN_WITH_ENCODING、
 *   CONVERT_SAVE_ENCODING、SAVE_TO_DISK、READ_HTML、READ_BINARY、OPEN_IN_BROWSER、CHECK_EXISTS；
 * - `system-ipc.ts`：SYSTEM.APP_VERSION。
 *
 * ## 行为零变化约束
 * - **注册顺序不可调整**：本函数的调用序列 = 拆分前 `MainWindowListenUtilsEvent` 的
 *   实际注册顺序（文件打开/管理器 → 加密工具 → 导航 → 主题 → 文件编辑/读取 → 系统版本），
 *   同一通道的注册方式（registerOnce / registerHandleOnce）与组件 ID 均不变；
 * - 注册即登记受信主窗口（P1/N-05，与 `handlers.ts` 的 setMainWindow 同源）；
 * - 各域模块内部保留原 sender 校验、日志、错误兜底与返回契约。
 *
 * ## 调用方
 * `src/main/ipc/registry.ts` 的 registerAll() 阶段 2 第 4 步调用（与改造前位置一致；
 * 窗口重建不会重复调用，各域模块均为进程级 persistent 注册，重复调用由台账判重跳过）。
 */
import type { BrowserWindow } from 'electron'
import { setTrustedMainWindow } from '../utils/ipc-security'
import { registerFileManagerIpc } from './file-manager-ipc'
import { registerCryptoIpc } from './crypto-ipc'
import { registerNavigationIpc } from './navigation-ipc'
import { registerThemeIpc } from './theme-ipc'
import { registerFileEditorIpc } from './file-editor-ipc'
import { registerSystemIpc } from './system-ipc'

/**
 * 原 utils 侧 IPC 注册统一归属的组件 ID（MEM-10 监听台账口径）。
 * 拆分前后保持不变，保证台账 inventory / 诊断与既有测试口径一致。
 */
const GLOBAL_UTILS_IPC_COMPONENT_ID = 'global-utils-ipc'

/**
 * 注册原 `utils/utils.ts` 中的全部 29 个 IPC 通道（按域分发、顺序与拆分前一致）。
 *
 * @param mainWindow 主窗口（登记为受信发送方；各域回调内取活窗口发送数据事件）
 */
export function registerUtilsIpcHandlers(mainWindow: BrowserWindow): void {
    // P1/N-05：注册即登记受信主窗口（sender 校验依据；与 setMainWindow 同源）
    setTrustedMainWindow(mainWindow)

    // 1) 文件打开 / 文件管理器右键 / 插入图片
    registerFileManagerIpc(mainWindow, GLOBAL_UTILS_IPC_COMPONENT_ID)
    // 2) 插件加密工具（RSA 生成 + Hash/HMAC/加解密）
    registerCryptoIpc(GLOBAL_UTILS_IPC_COMPONENT_ID)
    // 3) 导航（执行本地可执行文件）
    registerNavigationIpc(mainWindow, GLOBAL_UTILS_IPC_COMPONENT_ID)
    // 4) 主题 / 快速链接只读查询
    registerThemeIpc(GLOBAL_UTILS_IPC_COMPONENT_ID)
    // 5) 文件编辑 / 落盘 / 读取
    registerFileEditorIpc(mainWindow, GLOBAL_UTILS_IPC_COMPONENT_ID)
    // 6) 系统信息（应用版本）
    registerSystemIpc(GLOBAL_UTILS_IPC_COMPONENT_ID)
}
