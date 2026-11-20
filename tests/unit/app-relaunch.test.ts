/**
 * 「重启应用」意图协调（src/main/utils/app-relaunch.ts）单元测试（P2-7）
 *
 * 背景：改造前菜单/Ctrl+Shift+R 直接 `app.relaunch(); app.quit()`；before-quit 新增
 * 可取消的未保存确认后，用户取消退出仍会遗留 relaunch 请求（下次正常退出意外重启）。
 *
 * 覆盖：
 * - 只登记 AppContext.quit.pendingRelaunch 并请求 app.quit()，不直接 app.relaunch()；
 * - 待处理期间重复请求幂等（不叠加多次 app.quit）；
 * - 与 before-quit 的消费/取消语义（确认放行后 relaunch、取消时丢弃）由 main-index.test.ts
 *   的 before-quit 用例覆盖。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const appMocks = vi.hoisted(() => ({
    quit: vi.fn(),
    relaunch: vi.fn()
}))

vi.mock('electron', () => ({ app: appMocks }))

import { requestRelaunch } from '../../src/main/utils/app-relaunch'
import { getAppContext, resetAppContext } from '../../src/main/app-context'

describe('requestRelaunch (P2-7)', () => {
    beforeEach(() => {
        resetAppContext()
        appMocks.quit.mockClear()
        appMocks.relaunch.mockClear()
    })

    it('should only register the intent and request quit, without calling app.relaunch()', () => {
        requestRelaunch()

        expect(getAppContext().quit.pendingRelaunch).toBe(true)
        expect(appMocks.quit).toHaveBeenCalledTimes(1)
        // 真正 app.relaunch() 必须等 before-quit 确认放行后由入口执行
        expect(appMocks.relaunch).not.toHaveBeenCalled()
    })

    it('should be idempotent while a relaunch is already pending', () => {
        requestRelaunch()
        requestRelaunch()
        requestRelaunch()

        expect(appMocks.quit).toHaveBeenCalledTimes(1)
        expect(getAppContext().quit.pendingRelaunch).toBe(true)
    })

    it('should forget the intent after resetAppContext (window rebuild / test isolation)', () => {
        requestRelaunch()
        resetAppContext()

        expect(getAppContext().quit.pendingRelaunch).toBe(false)
    })
})
