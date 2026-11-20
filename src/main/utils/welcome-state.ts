/**
 * 欢迎页 / 主界面可见状态（主进程侧）
 *
 * 背景（2026-11-18 用户反馈「欢迎界面关闭按钮有延迟」）：
 * 主窗口 CLOSE 通道在无活动文件时走快速关闭路径（跳过 FLUSH_CONTENT 落盘协议的 2s 超时），
 * 但启动恢复可能已在后台把上次文件恢复到 appState.currentActiveFile——此时欢迎页点击关闭
 * 仍会进入 flush 等待，表现为「关闭按钮有延迟」。
 *
 * 本模块记录「主界面是否已进入」：默认欢迎页（false），主进程发送 WELCOME_ENTER_MAIN
 * （进入主界面）时置 true；新窗口创建（macOS activate 重建）时复位。
 * CLOSE handler 依据 isWelcomeScreenVisible() 判定欢迎页 → 跳过 flush 直接关闭。
 *
 * 结构优化第 2 批 2.4（M1）：状态本体迁移到 src/main/app-context.ts 的
 * `welcome.mainViewEntered`（进程内唯一上下文单例），本模块保留原有公开 API，
 * 调用方与行为均不变；窗口重建可经 app-context.resetAppContext() 整体复位。
 *
 * P2 IPC 注册收口：本模块从 `src/main/ipc/welcome-state.ts` 迁到 utils 层（纯状态访问、
 * 无 IPC 注册），使 `utils/startup-restore.ts` 不再反向 import ipc 层——架构测试
 * 例外清单中 `utils → ipc` 的最后一条随之消除（ipc 层消费 utils 属合法方向）。
 */
import { getAppContext } from '../app-context'

/** 标记已进入主界面（发送 WELCOME_ENTER_MAIN 时调用） */
export function markMainViewEntered(): void {
    getAppContext().welcome.mainViewEntered = true
}

/** 新窗口创建（显示欢迎页）时复位状态 */
export function resetWelcomeState(): void {
    getAppContext().welcome.mainViewEntered = false
}

/** 当前是否仍显示欢迎页（未进入主界面） */
export function isWelcomeScreenVisible(): boolean {
    return !getAppContext().welcome.mainViewEntered
}
