// @vitest-environment jsdom
/**
 * 1.5.7 体验优化（减少弹窗）：轻量 Toast 宿主组件单测（`components/common/ToastHost.vue`）。
 *
 * 覆盖点：
 * 1. Teleport 到 body、空态渲染空宿主；无障碍属性（aria-live / aria-atomic / role=status / 关闭 aria-label）；
 * 2. 类型渲染：成功提示的类型 class / data-toast-type / 图标（24 网格、stroke 1.5）/ 标题 + 正文；
 * 3. 多类型强调色分支（info / warning / error）各自渲染对应 class；
 * 4. 关闭：点击关闭按钮 / 点击提示本体均移除队列并最终从 DOM 消失；
 * 5. 自动消失与队列上限在宿主上的表现（DOM 条数）；
 * 6. 卸载清理：卸载宿主后模块单例状态清空（定时器回收，不残留到下一次挂载）；
 * 7. 样式契约：全部消费 --ui-* 令牌、无硬编码颜色 / 风格密度分支、动效与层级令牌正确；
 *    主界面 BaiZeNotes.vue 已挂载 ToastHost 且卸载时复位。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ToastHost from '../../../src/renderer/src/components/common/ToastHost.vue'
import {
    MAX_TOAST_COUNT,
    dismissAllToasts,
    resetToastsForTesting,
    showToast,
    toastState
} from '../../../src/renderer/src/common/toast'
import { t } from '../../../src/renderer/src/common/i18n'

const RENDERER_SRC = resolve(__dirname, '../../../src/renderer/src')
const TOAST_HOST_FILE = resolve(RENDERER_SRC, 'components/common/ToastHost.vue')
const BAIZE_NOTES_FILE = resolve(RENDERER_SRC, 'components/BaiZeNotes.vue')

/** 读取源码（统一 CRLF → LF，避免 Windows 换行影响正则断言） */
function readSource(file: string): string {
    return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** 连续两个 nextTick：等待 Teleport / 列表更新落到 DOM */
async function flush(): Promise<void> {
    await nextTick()
    await nextTick()
}

let wrapper: VueWrapper | null = null

function mountHost(): VueWrapper {
    wrapper = mount(ToastHost, {
        attachTo: document.body
    })
    return wrapper
}

/** Toast 宿主容器（Teleport 到 body） */
function hostElement(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>('.toast-host')
}

/** 当前渲染的 Toast 条目 */
function toastElements(): HTMLElement[] {
    return Array.from(document.body.querySelectorAll<HTMLElement>('.toast'))
}

beforeEach(() => {
    resetToastsForTesting()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    resetToastsForTesting()
    vi.useRealTimers()
    document.body.innerHTML = ''
})

describe('ToastHost：挂载与无障碍', () => {
    it('Teleport 到 body；空队列时渲染空 live region（aria-live=polite / aria-atomic=false）', async () => {
        mountHost()
        await flush()

        const host = hostElement()
        expect(host).not.toBeNull()
        expect(host!.getAttribute('aria-live')).toBe('polite')
        expect(host!.getAttribute('aria-atomic')).toBe('false')
        expect(toastElements()).toHaveLength(0)
    })

    it('成功提示：role=status、类型 class/data 属性、标题 + 正文、24 网格 stroke 1.5 图标', async () => {
        mountHost()
        showToast('已切换到 LLM Wiki 模式；本工作区此前已初始化', {
            type: 'success',
            title: '已切换到 LLM Wiki 模式'
        })
        await flush()

        const items = toastElements()
        expect(items).toHaveLength(1)
        const item = items[0]!
        expect(item.getAttribute('role')).toBe('status')
        expect(item.getAttribute('data-toast-type')).toBe('success')
        expect(item.classList.contains('toast--success')).toBe(true)
        expect(item.textContent).toContain('已切换到 LLM Wiki 模式')
        expect(item.textContent).toContain('本工作区此前已初始化')

        const icon = item.querySelector('.toast__icon svg')
        expect(icon).not.toBeNull()
        expect(icon!.getAttribute('viewBox')).toBe('0 0 24 24')
        expect(icon!.getAttribute('stroke-width')).toBe('1.5')
        expect(item.querySelector('.toast__icon')!.getAttribute('aria-hidden')).toBe('true')
        expect(icon!.getAttribute('focusable')).toBe('false')

        // 关闭按钮：类型 button + 无障碍标签走 i18n
        const close = item.querySelector<HTMLButtonElement>('.toast__close')
        expect(close).not.toBeNull()
        expect(close!.getAttribute('type')).toBe('button')
        expect(close!.getAttribute('aria-label')).toBe(t('common.close'))
        expect(close!.querySelector('svg')).not.toBeNull()
    })

    it('多类型：info / warning / error 各自渲染对应强调色 class 与图标', async () => {
        mountHost()
        showToast('中性提示', { type: 'info' })
        showToast('警告提示', { type: 'warning' })
        showToast('错误提示', { type: 'error' })
        await flush()

        const items = toastElements()
        expect(items).toHaveLength(3)
        expect(items.map((item) => item.getAttribute('data-toast-type'))).toEqual([
            'info',
            'warning',
            'error'
        ])
        for (const type of ['info', 'warning', 'error']) {
            const item = document.body.querySelector<HTMLElement>(`.toast--${type}`)
            expect(item, `${type} 类型 class 应存在`).not.toBeNull()
            expect(item!.querySelector('.toast__icon svg')).not.toBeNull()
        }
        // 各类型图标形状互不相同（成功在上一用例已断言，本用例覆盖 info/warning/error）
        const glyphs = new Set(
            items.map((item) => item.querySelector('.toast__icon svg')!.innerHTML)
        )
        expect(glyphs.size).toBe(3)
    })
})

describe('ToastHost：关闭与自动消失', () => {
    it('点击关闭按钮：移除队列并最终从 DOM 消失', async () => {
        mountHost()
        showToast('可关闭提示', { duration: 0 })
        await flush()

        const close = document.body.querySelector<HTMLButtonElement>('.toast__close')
        expect(close).not.toBeNull()
        close!.click()
        await nextTick()

        expect(toastState.toasts).toHaveLength(0)
        await vi.waitFor(() => {
            expect(toastElements()).toHaveLength(0)
        })
    })

    it('点击提示本体也关闭（关闭按钮 stop 冒泡，不重复处理）', async () => {
        mountHost()
        showToast('点击关闭', { duration: 0 })
        await flush()

        document.body.querySelector<HTMLElement>('.toast__message')!.click()
        await nextTick()

        expect(toastState.toasts).toHaveLength(0)
        await vi.waitFor(() => {
            expect(toastElements()).toHaveLength(0)
        })
    })

    it('自动消失：到时移除队列并清空 DOM', async () => {
        vi.useFakeTimers()
        mountHost()
        showToast('自动消失', { duration: 1000 })
        await flush()
        expect(toastElements()).toHaveLength(1)

        vi.advanceTimersByTime(1000)
        await nextTick()
        expect(toastState.toasts).toHaveLength(0)

        vi.runAllTimers()
        await flush()
        expect(toastElements()).toHaveLength(0)
    })

    it('同屏上限：超出 MAX_TOAST_COUNT 时队列与 DOM 只保留最新 3 条', async () => {
        mountHost()
        showToast('一', { duration: 0 })
        showToast('二', { duration: 0 })
        showToast('三', { duration: 0 })
        showToast('四', { duration: 0 })

        // 队列立即收敛为最新 3 条（移除最旧一条）
        expect(toastState.toasts.map((item) => item.message)).toEqual(['二', '三', '四'])
        // DOM 在离场过渡结束后同样只剩 3 条（最长等待 1s，避免离场帧时序抖动）
        await vi.waitFor(() => {
            expect(toastElements()).toHaveLength(MAX_TOAST_COUNT)
        })
        expect(toastElements().map((item) => item.textContent?.trim())).toEqual(['二', '三', '四'])
    })

    it('卸载宿主：清空模块单例状态（不残留到下一次挂载）', async () => {
        mountHost()
        showToast('卸载前提示', { duration: 0 })
        await flush()
        expect(toastState.toasts).toHaveLength(1)

        wrapper!.unmount()
        wrapper = null

        expect(toastState.toasts).toHaveLength(0)
        dismissAllToasts()
    })
})

describe('ToastHost：样式令牌契约', () => {
    it('样式全部消费 --ui-* 令牌（四风格 × 三密度 × 明暗主题自适应）', () => {
        const source = readSource(TOAST_HOST_FILE)
        const requiredTokens = [
            '--ui-z-toast',
            '--ui-pad',
            '--ui-bg-elevated',
            '--ui-surface-opacity',
            '--ui-border',
            '--ui-hairline-width',
            '--ui-radius-md',
            '--ui-radius-sm',
            '--ui-shadow-2',
            '--ui-text',
            '--ui-text-secondary',
            '--ui-text-tertiary',
            '--ui-font-size',
            '--ui-control-height',
            '--ui-accent-soft',
            '--ui-focus-shadow',
            '--ui-duration-fast',
            '--ui-duration-pop',
            '--ui-ease-standard',
            '--ui-success',
            '--ui-warning',
            '--ui-danger',
            '--ui-info'
        ]
        const missing = requiredTokens.filter((token) => !source.includes(`var(${token}`))
        expect(missing).toEqual([])
    })

    it('无硬编码颜色、无 data-style / data-density 分支', () => {
        const source = readSource(TOAST_HOST_FILE).replace(/<!--[\s\S]*?-->/g, '')
        // 颜色只能来自 --ui-* 令牌（含 var 兜底），组件内不得出现 hex / rgb 字面量
        expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
        expect(source).not.toMatch(/\brgba?\(/)
        // 四风格 × 三密度差异只由令牌数值派生，组件不写分支
        expect(source).not.toMatch(/data-(style|density)\s*[=\]]/)
    })

    it('层序/定位/点击行为符合「不抢焦点、不遮挡操作」约定', () => {
        const source = readSource(TOAST_HOST_FILE)
        // 语义层级 --ui-z-toast 低于模态对话框（110），不与对话框抢层
        expect(source).toContain('z-index: var(--ui-z-toast, 70)')
        // 宿主不拦截点击，条目自身可交互
        expect(source).toMatch(/\.toast-host\s*\{[\s\S]*?pointer-events:\s*none;/)
        expect(source).toMatch(/\.toast\s*\{[\s\S]*?pointer-events:\s*auto;/)
        // 固定在右下角并避开状态栏（24px 主界面状态栏常量）
        expect(source).toMatch(/\.toast-host\s*\{[\s\S]*?position:\s*fixed;/)
        expect(source).toMatch(/\.toast-host\s*\{[\s\S]*?bottom:\s*calc\([^;]*24px\);/)
        // 动效：淡入 + 4px 位移（MOTION.md Toast 规范），减少动效由全局令牌降级
        expect(source).toContain('transform: translateY(4px)')
        expect(source).toContain('--ui-duration-pop, 180ms')
    })

    it('不使用 TransitionGroup（运行时声明会被提升进入口 chunk，击穿 150 KiB 预算）', () => {
        // 只看真实模板/脚本，文件头注释里的历史说明不算用法
        const source = readSource(TOAST_HOST_FILE).replace(/<!--[\s\S]*?-->/g, '')
        // 回归防线：@vue/runtime-dom 被渲染入口静态引用，任何 <TransitionGroup> 用法都会让
        // 其声明被 Rollup 提升进入口 chunk（实测 +5.3 KiB，150.2 KiB > 150 KiB 预算）。
        // 组件改用列表 + 入场 CSS 动画实现；后续改动不得重新引入。
        expect(source).not.toMatch(/<TransitionGroup\b|<transition-group\b/)
    })

    it('主界面已挂载 ToastHost 并在卸载时复位（主界面 = 唯一宿主）', () => {
        const source = readSource(BAIZE_NOTES_FILE)
        expect(source).toContain("import ToastHost from './common/ToastHost.vue'")
        expect(source).toContain('<ToastHost />')
        expect(source).toContain('dismissAllToasts()')
    })
})
