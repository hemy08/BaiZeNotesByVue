/**
 * IPC 模块入口
 * 提供 IPC 通信相关的功能
 */

// A-5/ARC-15：仅保留真实消费方在用的 re-export。
// - registerIpcHandlers / setMainWindow：src/main/index.ts 从 './ipc' 导入使用；
// - getMainWindow / HandleBaiZeMenuAction：全库 src 零消费（handlers.ts 直接
//   import HandleBaiZeMenuAction、无模块从本入口取 getMainWindow），已按死
//   re-export 清理（原 api 契约测试断言同步删除）。
//
// P2 死通道清理：原注释提及的 OPEN_PLUGIN_TOOL 通道与 menu-tools.ts 的 26 处
// 发送方已随 pluginsMenuHandlers 子树（渲染层全部拦截 → 主进程不可达）一并删除。
export { registerIpcHandlers, setMainWindow } from './handlers'
