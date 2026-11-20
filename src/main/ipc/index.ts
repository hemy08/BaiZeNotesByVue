/**
 * IPC 模块入口
 * 提供 IPC 通信相关的功能
 */

// A-5/ARC-15：仅保留真实消费方在用的 re-export。
// - registerIpcHandlers / setMainWindow：registry.ts 直接 import './handlers'；本入口保留
//   re-export 作为 IPC 注册对外契约（ipc-handlers.test 校验 re-export 契约）；
// - getMainWindow / HandleBaiZeMenuAction：全库 src 零消费（handlers.ts 直接
//   import HandleBaiZeMenuAction、无模块从本入口取 getMainWindow），已按死
//   re-export 清理（原 api 契约测试断言同步删除）。
//
// P2 死通道清理：原注释提及的 OPEN_PLUGIN_TOOL 通道与 menu-tools.ts 的 26 处
// 发送方已随 pluginsMenuHandlers 子树（渲染层全部拦截 → 主进程不可达）一并删除。
export { registerIpcHandlers, setMainWindow } from './handlers'
// P2 IPC 注册收口：原 utils/utils.ts 的 29 处 IPC 注册已按域拆分到同目录独立模块
// （file-manager / crypto / navigation / theme / file-editor / system），由 utils-ipc.ts
// 按拆分前顺序统一编排。registry.ts 阶段 2 调用本入口导出的注册函数。
export { registerUtilsIpcHandlers } from './utils-ipc'
