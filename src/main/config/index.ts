/**
 * 配置文件模块导出
 */
export * from './config-manager'
export * from './default-configs'
export * from './theme-config'
// 从 theme-registry 单独导出需要的函数（避免与 theme-config 冲突）
export { getMonacoThemeData } from './theme-registry'
export type { MonacoThemeConfig } from './theme-registry'
export * from './system-setting'
export * from './editor-setting'
export * from './quick-link-config'
export * from '../ipc/ipc-listener-manager'
export * from './short-key-register'
export * from './window-manager'

// 导出配置 IPC 处理器注册函数
export { registerConfigIpcHandlers } from './config-manager'
