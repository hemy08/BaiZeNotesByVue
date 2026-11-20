/**
 * 「重启应用」意图协调（P2 F-07：app.relaunch() 残留）。
 *
 * ## 背景
 * 改造前「文件 → 重启应用」（菜单 / Ctrl+Shift+R）直接 `app.relaunch(); app.quit()`。
 * 自 2026-11-20 起 before-quit 会因未保存修改弹「保存并关闭 / 不保存 / 取消」确认框，
 * 用户可以取消退出；但 `app.relaunch()` 请求**已登记到当前实例**（Electron 文档：
 * 当前实例退出时重启），取消后请求不会撤销——之后任意一次正常退出（托盘退出 / F4 /
 * 关闭窗口）都会意外重启应用，且重复点击会叠加多个重启请求。
 *
 * ## 改造后
 * 菜单/快捷键只登记意图（AppContext.quit.pendingRelaunch）并 `app.quit()`；
 * `src/main/index.ts` 的 before-quit 在未保存确认**放行后**才调用 app.relaunch()，
 * 用户取消退出/保存失败时清除意图，绝不遗留 relaunch 请求。
 */
import { app } from 'electron'
import { getAppContext } from '../app-context'

/**
 * 请求重启应用：登记意图并走 app.quit()，由 before-quit 在确认放行后执行 relaunch。
 *
 * 幂等：已有待处理重启意图时直接忽略（避免重复点击叠加多次 app.quit/relaunch）。
 */
export function requestRelaunch(): void {
    const context = getAppContext()
    if (context.quit.pendingRelaunch) {
        return
    }
    context.quit.pendingRelaunch = true
    app.quit()
}
