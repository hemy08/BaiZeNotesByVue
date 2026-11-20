// @vitest-environment jsdom
/**
 * `src/renderer/src/main.ts` 渲染进程入口补测（0% 盲区）。
 *
 * 入口文件只做四件事，全部属于可隔离的装配逻辑：
 * 1. 创建 Vue 应用实例（createApp(App)）；
 * 2. 全局注册右键菜单组件 ContextMenu；
 * 3. 捕获阶段拦截 dragover / drop 默认行为（P0 安全：阻止拖入远程链接/本地 HTML
 *    把主窗口导航到不可信页面）；
 * 4. initI18n() 完成后再 mount('#app')（避免首屏语言闪烁）。
 *
 * CSS 副作用导入由 Vite 在测试环境置空，不在此断言（由 theme-contract 静态护栏负责）。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'

const vueMocks = vi.hoisted(() => {
    const app = {
        component: vi.fn(),
        mount: vi.fn()
    }
    return {
        app,
        createApp: vi.fn(() => app)
    }
})

vi.mock('vue', () => ({ createApp: vueMocks.createApp }))

const appStub = vi.hoisted(() => ({ name: 'AppStub' }))
vi.mock('@renderer/App.vue', () => ({ default: appStub }))

const i18nMocks = vi.hoisted(() => ({
    initI18n: vi.fn(() => Promise.resolve())
}))
vi.mock('@renderer/common/i18n', () => i18nMocks)

const contextMenuStub = vi.hoisted(() => ({ name: 'ContextMenuStub' }))
vi.mock('@imengyu/vue3-context-menu', () => ({ ContextMenu: contextMenuStub }))

describe('renderer main.ts 入口装配', () => {
    beforeAll(async () => {
        await import('../../../src/renderer/src/main')
        // initI18n().finally(mount) 在微任务后执行
        await Promise.resolve()
        await Promise.resolve()
    })

    it('createApp(App) 创建应用实例', () => {
        expect(vueMocks.createApp).toHaveBeenCalledTimes(1)
        expect(vueMocks.createApp).toHaveBeenCalledWith(appStub)
    })

    it('注册全局 ContextMenu 组件并在 i18n 初始化后挂载 #app', () => {
        expect(vueMocks.app.component).toHaveBeenCalledWith('ContextMenu', contextMenuStub)
        expect(i18nMocks.initI18n).toHaveBeenCalledTimes(1)
        expect(vueMocks.app.mount).toHaveBeenCalledTimes(1)
        expect(vueMocks.app.mount).toHaveBeenCalledWith('#app')
    })

    it('捕获阶段阻止 dragover / drop 默认行为（拖放安全拦截）', () => {
        for (const type of ['dragover', 'drop']) {
            const event = new Event(type, { bubbles: true, cancelable: true })
            window.dispatchEvent(event)
            expect(event.defaultPrevented, `${type} 未被 preventDefault`).toBe(true)
        }
    })

    it('普通事件不受影响（拦截仅限拖放事件）', () => {
        const event = new Event('click', { bubbles: true, cancelable: true })
        window.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
    })
})
