/**
 * IPC 注册收口（P2 架构债）：主题 / 快速链接只读查询通道
 *
 * 从 `src/main/utils/utils.ts` 的 `MainWindowListenUtilsEvent` 按域拆出：
 * - QUICK_LINKS.GET：快速链接配置读取（经 utils/providers 依赖倒置，不反向依赖 config）；
 * - THEME.GET_CURRENT_THEME_STYLES / GET_ALL_THEMES / GET_ALL_MONACO_THEMES：
 *   主题样式与 Monaco 主题读取（同样经 provider 注入）。
 *
 * 均为只读查询类 handle 通道，AS-6 发送方校验与返回契约保持不变。
 */
// 结构优化 1.1（H1）：主题/快速链接读取由 main/index.ts 启动早期注入（见 utils/providers.ts）
import { getQuickLinksFromProvider, getThemeApiFromProvider } from '../utils/providers'
import { ipcListenerManager } from './ipc-listener-manager'
import { withSenderCheck } from '../utils/ipc-security'
import { IPC } from '../../shared/ipc-channels'
import type { ThemeType } from '../../shared/types'

/**
 * 注册主题 / 快速链接查询域 IPC。
 *
 * @param componentId 监听台账组件 ID（拆分前统一为 `global-utils-ipc`，保持不变）
 */
export function registerThemeIpc(componentId: string): void {
    // 快速链接配置相关 IPC
    // AS-6：快速链接含 exe 路径（可被后续 OPEN_EXE 消费），补发送方校验
    ipcListenerManager.registerHandleOnce(
        IPC.QUICK_LINKS.GET,
        withSenderCheck(IPC.QUICK_LINKS.GET, () => getQuickLinksFromProvider(), {
            kind: 'handle'
        }),
        componentId
    )

    // 主题配置相关 IPC
    // AS-6：主题数据决定渲染层外观，补发送方校验（handle 拒绝返回统一错误对象）
    ipcListenerManager.registerHandleOnce(
        IPC.THEME.GET_CURRENT_THEME_STYLES,
        withSenderCheck(
            IPC.THEME.GET_CURRENT_THEME_STYLES,
            (_event: Electron.IpcMainInvokeEvent, themeType?: string) => {
                const themeApi = getThemeApiFromProvider()
                if (themeType) {
                    return themeApi.getThemeStylesByType(themeType as ThemeType)
                }
                return themeApi.getCurrentThemeStyles()
            },
            { kind: 'handle' }
        ),
        componentId
    )

    ipcListenerManager.registerHandleOnce(
        IPC.THEME.GET_ALL_THEMES,
        withSenderCheck(IPC.THEME.GET_ALL_THEMES, () => getThemeApiFromProvider().getAllThemes(), {
            kind: 'handle'
        }),
        componentId
    )

    ipcListenerManager.registerHandleOnce(
        IPC.THEME.GET_ALL_MONACO_THEMES,
        withSenderCheck(
            IPC.THEME.GET_ALL_MONACO_THEMES,
            () => getThemeApiFromProvider().getAllMonacoThemes(),
            {
                kind: 'handle'
            }
        ),
        componentId
    )

    // P2 死代码清理：THEME.GET_CURRENT_THEME / GET_SEPARATE_EDITOR_THEME /
    // GET_MONACO_THEME 三个通道主进程有监听但全仓零发送方（渲染层实际使用
    // GET_CURRENT_THEME_STYLES + THEME_UPDATED 广播），已随通道常量一并删除。
}
