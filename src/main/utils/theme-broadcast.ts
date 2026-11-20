/**
 * P1/C-03：主进程主题广播单一实现
 *
 * 背景：主题更新原先有两套实现：
 * 1. src/main/index.ts 的 THEME.UPDATE_THEME 监听回调里内联遍历
 *    BrowserWindow.getAllWindows() 向所有窗口 send THEME.THEME_UPDATED；
 * 2. 已删除的 JSDOM 主题设置对话框在 ipcMain.on 回调里误用渲染层全局
 *    `window.electronAPI.broadcastTheme(...)`——主进程没有 window 全局，回调执行到
 *    广播处会抛 ReferenceError（dialogs.test.ts 旧版需 stubGlobal('window') 才能通过）。
 *
 * C-03 收口：把"向所有存活窗口广播主题"抽成主进程独立函数，统一由此模块实现，
 * 任何主进程侧主题广播（index.ts 的 UPDATE_THEME、配置写后的主题应用）都复用本函数；
 * 主进程内禁止再出现 `window.electronAPI` 形式的跨进程调用。
 *
 * 2026-11-19 契约归位 + 载荷组装收口（本轮重构）：
 * - 删除本模块自定义的 ThemeBroadcastPayload（themeStyles: unknown），广播载荷类型
 *   直接复用 shared 唯一真源 ThemeUpdateData（src/shared/types/theme.ts），主进程与
 *   渲染层不再各持一份契约；
 * - 载荷组装抽为纯函数 buildThemeBroadcastPayload()，主进程三处发送现场
 *   （main/index.ts 的 UPDATE_THEME、config/system-theme.ts 跟随系统主题、
 *   config/config-manager.ts 配置写入与备份恢复）统一经它组装，字段形态只在
 *   本模块定义一次；
 * - config-manager.ts 原先自行遍历 BrowserWindow 的广播实现已删除，改为复用
 *   broadcastThemeToAllWindows（本模块仍是主进程唯一广播出口）。
 *
 * 2026-11-20 归档归位（P1-1：依赖方向门禁第二层）：
 * - 本模块从 `src/main/ipc/theme-broadcast.ts` 迁到中性层 `src/main/utils/`：
 *   它只是「向所有窗口发送主题更新」的发送端实现，不注册任何 IPC 监听器，不属
 *   IPC 编排层；迁出后 config（L2 业务层，config-manager / system-theme）不再
 *   静态 import `src/main/ipc/**`，消除了 config → ipc 反向边；
 * - 调用方（ipc/registry、config/config-manager、config/system-theme）与单测
 *   mock 路径同步更新；行为、调用顺序、广播载荷与窗口遍历语义完全不变；
 * - `src/main/utils/**` 对本模块的依赖方向为 utils → electron/shared/utils，不变。
 */
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
// ARC-13/契约归位：广播载荷类型以 shared 为唯一真源（主进程不再自定义重复结构）
import type { ThemeStyles, ThemeUpdateData } from '../../shared/types'
import { logger } from './logger'

/**
 * 组装主题广播载荷（纯函数：只做字段组装，不读 store、不发送 IPC）。
 *
 * 返回值即 shared 唯一契约 ThemeUpdateData——主进程发送端与渲染层
 * BaiZeNotes.vue 的 handleThemeUpdate 共用同一份字段定义。
 *
 * 三处调用现场的取值来源不同（index.ts 优先采用渲染层经 IPC 传入的主题类型 /
 * Monaco 主题 / 独立主题参数，另两处读取当前 store），因此由调用方传入字段值，
 * 本函数只负责把值收敛成契约形态，避免字段名/顺序在多点重复。
 *
 * @param themeStyles 最新应用主题样式（shared ThemeStyles）
 * @param monacoTheme Monaco 编辑器主题名
 * @param separateEditorTheme 编辑器是否使用独立主题
 */
export function buildThemeBroadcastPayload(
    themeStyles: ThemeStyles,
    monacoTheme: string,
    separateEditorTheme: boolean
): ThemeUpdateData {
    return { themeStyles, monacoTheme, separateEditorTheme }
}

/**
 * 向所有存活窗口广播主题更新（主进程唯一广播实现）。
 *
 * - 遍历 BrowserWindow.getAllWindows()，逐个过滤 isDestroyed() 的窗口；
 * - 单个窗口 send 抛错（窗口销毁竞态）只告警，不影响其余窗口；
 * - 返回成功发送的窗口数量（供测试与诊断断言）。
 */
export function broadcastThemeToAllWindows(payload: ThemeUpdateData): number {
    const windows = BrowserWindow.getAllWindows()
    let sentCount = 0
    for (const window of windows) {
        if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) {
            continue
        }
        try {
            window.webContents.send(IPC.THEME.THEME_UPDATED, payload)
            sentCount += 1
        } catch (error) {
            logger.warn('[Theme] 主题广播失败（窗口可能已销毁）:', error)
        }
    }
    return sentCount
}
