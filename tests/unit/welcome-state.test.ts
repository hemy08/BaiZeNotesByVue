/**
 * 欢迎页 / 主界面状态模块测试（2026-11-18，用户反馈「欢迎界面关闭按钮延迟」修复）
 *
 * 背景：CLOSE 通道在「无活动文件」时跳过 FLUSH_CONTENT 的 2s 超时快速关闭；
 * 但启动恢复可能已在后台把上次文件恢复到 appState.currentActiveFile，
 * 因此额外用本模块记录主界面是否已进入，欢迎页时同样走快速关闭。
 *
 * P2 IPC 注册收口：本模块（纯状态门面）已从 src/main/ipc/ 迁到 src/main/utils/，
 * 消除 utils/startup-restore.ts 反向 import ipc 层的架构例外；行为不变。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
    isWelcomeScreenVisible,
    markMainViewEntered,
    resetWelcomeState
} from '../../src/main/utils/welcome-state'

describe('welcome-state', () => {
    beforeEach(() => {
        resetWelcomeState()
    })

    it('should treat the app as welcome screen by default', () => {
        expect(isWelcomeScreenVisible()).toBe(true)
    })

    it('should mark main view entered after WELCOME_ENTER_MAIN is sent', () => {
        markMainViewEntered()
        expect(isWelcomeScreenVisible()).toBe(false)
    })

    it('should reset to welcome screen when a new window is created (macOS activate rebuild)', () => {
        markMainViewEntered()
        resetWelcomeState()
        expect(isWelcomeScreenVisible()).toBe(true)
    })

    it('should stay idempotent on repeated marks', () => {
        markMainViewEntered()
        markMainViewEntered()
        expect(isWelcomeScreenVisible()).toBe(false)
    })
})
