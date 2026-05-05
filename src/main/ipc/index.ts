/**
 * IPC 模块入口
 * 提供 IPC 通信相关的功能
 */

export { registerIpcHandlers, setMainWindow, getMainWindow } from './handlers'
export {
    HandleBaiZeMenuAction,
    getAllMenuActions
} from './menu_handle'
export {
    JYShare,
    W3School,
    EncodeDecode,
    OnlineIDE,
    Links,
    DevOpsTool,
    OpenWebTeam,
    CloudCommunity,
    Encrypt,
    Convert,
    NetWork,
    Information,
    GitHubProject,
    GenElectronMenuItem,
    GenElectronSubMenuItem
} from './menu_context'
export type { SubMenuItems } from './menu_context'