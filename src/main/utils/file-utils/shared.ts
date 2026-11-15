/**
 * 文件操作共享小工具（主进程）
 *
 * CQ-7：从 file-operations.ts 拆出，供 file-operations.ts 与 directory-tree.ts 共同
 * 使用的小工具，避免两者互相 import 形成循环依赖：
 * - P1-AS-1 路径守卫的用户提示（状态栏提示、非法文件名提示）；
 * - PF-05「应用自身写入/改目录」抑制窗口状态（写操作方标记，watcher 方忽略回环事件）；
 * - PF-17 当前活动文件磁盘签名（mtime + size）记录。
 *
 * 本模块为叶子依赖：不依赖 file-operations.ts / directory-tree.ts / file-encoding.ts。
 */

import { promises as fs } from 'fs'
import { logger } from '../logger'
import { tMain } from '../i18n'
import { IPC } from '../../../shared/ipc-channels'
import { appState, sendToMainWindow } from '../app-state'
// ARC-11：直接依赖无反向边的 file-state-store（避免 file-state → file-utils 循环依赖）
import { getLastOpenedDirectory, getLastOpenedFile, getRecentFiles } from '../file-state-store'
// P1-AS-1：「最近打开」历史作为受信来源注入 security（由本模块统一注册一次）
import { PathAccessDeniedError, setTrustedHistoryProvider } from '../security'

// ==================== PF-05：应用自身写入/改目录抑制窗口 ====================
// watcher（directory-tree）在该窗口内收到的事件视为自身写入回环并忽略；
// 由 file-operations.ts 的写盘/改目录操作负责 begin/end 标记。
const WATCH_SELF_WRITE_WINDOW_MS = 1500

// 自身写入/改目录的嵌套计数与最近一次标记时间（应用自身写盘回环抑制，PF-05）
let selfWriteDepth = 0
let lastSelfWriteAt = 0

/**
 * 标记"应用自身正在写盘/改目录"开始（PF-05）。
 * watcher 在该窗口内收到的事件视为自身写入回环并忽略，由调用方自己的
 * ScheduleReloadFromDisk（或显式刷新）负责刷新，避免自我触发事件风暴。
 */
export function beginSelfWrite(): void {
    selfWriteDepth += 1
    lastSelfWriteAt = Date.now()
}

/** 标记"应用自身写盘/改目录"结束（PF-05）：保留一小段抑制窗口覆盖延迟到达的 watcher 事件 */
export function endSelfWrite(): void {
    selfWriteDepth = Math.max(0, selfWriteDepth - 1)
    lastSelfWriteAt = Date.now()
}

/** 当前是否处于应用自身写入的抑制窗口内（PF-05） */
export function isSelfWriteWindow(): boolean {
    return selfWriteDepth > 0 || Date.now() - lastSelfWriteAt < WATCH_SELF_WRITE_WINDOW_MS
}

/** 退出清理时复位自身写入抑制窗口（PF-05，配合 CleanupDirectoryWatch） */
export function resetSelfWriteWindow(): void {
    selfWriteDepth = 0
    lastSelfWriteAt = 0
}

// ==================== P1-AS-1：文件 IPC 路径约束 ====================
// 背景（out/full-scan/arch-security.md AS-1）：文件类 IPC 此前只校验发送方、
// 不校验 path，渲染层一旦取得脚本执行能力即可任意读取/覆盖/复制/删除本地文件。
// 本文件的所有写/读/删/重命名入口统一经 security.ts 的路径守卫校验：
//   - 允许范围：工作区根、系统临时目录、用户经系统对话框选择过的路径（本次运行期登记 +
//     file-state 中的「最近打开」历史）、当前活动文件所在目录；
//   - 越界路径：logger.warn + 状态栏 STATUS_BAR_UPDATE 提示并 return / 抛受控错误，不崩溃主进程。
// 注：功能提示统一走状态栏而非阻塞对话框，避免渲染层反复触发非法请求时连续弹框。

/** 读取「最近打开」历史（file-state-store；单测可能只桩部分函数，缺失时按空处理） */
function collectTrustedHistoryEntries(): { files: string[]; directories: string[] } {
    const files: string[] = []
    const directories: string[] = []
    try {
        if (typeof getLastOpenedFile === 'function') {
            const lastFile = getLastOpenedFile()
            if (typeof lastFile === 'string' && lastFile.length > 0) {
                files.push(lastFile)
            }
        }
        if (typeof getRecentFiles === 'function') {
            const recentFiles = getRecentFiles()
            if (Array.isArray(recentFiles)) {
                files.push(...recentFiles)
            }
        }
        if (typeof getLastOpenedDirectory === 'function') {
            const lastDirectory = getLastOpenedDirectory()
            if (typeof lastDirectory === 'string' && lastDirectory.length > 0) {
                directories.push(lastDirectory)
            }
        }
    } catch (error) {
        // 历史记录损坏/存储不可用不应影响文件操作主流程，按「无受信历史」处理
        logger.warn('[Security] 读取最近打开受信记录失败（按不受信处理）：', error)
    }
    return { files, directories }
}

// 「最近打开」历史属于用户此前经对话框显式选择过的路径，登记为受信来源；
// security.ts 不直接依赖 electron-store，由本文件注入只读 provider。
setTrustedHistoryProvider(collectTrustedHistoryEntries)

/**
 * P1-AS-1：越界路径统一提示（状态栏，不抛异常、不弹阻塞对话框）。
 * @param filePath 被拒绝的路径（任意类型：渲染层载荷可能不是字符串）
 * @param actionKey 提示词条前缀（默认通用「操作失败」；打开/保存可传更具体的状态词条）
 */
export function notifyPathAccessDenied(
    filePath: unknown,
    actionKey: string = 'mainMsg.status.operationFailed'
): void {
    const display =
        typeof filePath === 'string' && filePath.trim().length > 0 ? filePath : String(filePath)
    const reason = tMain('mainMsg.file.readError.eacces')
    logger.warn('[Security] 已拒绝访问工作区外的路径（P1-AS-1）：', display)
    sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
        message: tMain(actionKey, { message: `${reason}: ${display}` }),
        type: 'error'
    })
}

/** P1-AS-1：把路径校验异常转换为用户可读提示（非路径异常返回 null） */
export function describePathDeniedError(error: unknown): string | null {
    return error instanceof PathAccessDeniedError ? tMain('mainMsg.file.readError.eacces') : null
}

/** 文件名非法时的统一提示（CREATE/新建/重命名/图片保存的 name 参数） */
export function notifyInvalidFileName(name: unknown): void {
    const display = typeof name === 'string' ? name : String(name)
    logger.warn('[Security] 已拒绝非法文件名（P1-AS-1）：', display)
    sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
        message: tMain('mainMsg.status.operationFailed', {
            message: `${tMain('mainMsg.file.readError.eacces')}: ${display}`
        }),
        type: 'error'
    })
}

/* ==================== PF-17：当前活动文件磁盘签名 ====================
 * 背景（out/full-scan/perf.md PF-17）：ReloadDirFromDisk 每次执行都会重读当前活动文件全文
 * 并整篇下发（file-content-reloaded），而目录刷新会在一系列目录操作后由 500ms 防抖触发。
 * 1 MiB 文档 + 任意目录操作 → 额外 1 MiB 读盘 + 1 MiB IPC + 渲染层 Monaco 全量注入
 * （撤销栈/光标丢失）。本轮引入「磁盘签名（mtimeMs + size）」：
 *   - 打开/保存/重载/新建当前文件成功后记录签名；
 *   - 目录刷新先 stat 一次比较签名，未变化则跳过重读与重发（仍只花 1 次 stat）；
 *   - 签名缺失（首次刷新/测试直接构造状态）时保持原行为：重读并重建签名。
 * 说明：mtime/size 判定是「磁盘内容可能变化」的快速筛选，不是内容哈希；外部工具
 * 改动后恢复 mtime 且大小不变等极端场景可能漏判（可再次手动"从磁盘重新加载"或编辑触发 watcher）。
 */

/** PF-17：记录当前活动文件的磁盘签名（调用方保证 filePath 仍是当前活动文件） */
export async function refreshActiveFileDiskStamp(filePath: string): Promise<void> {
    // 仅当读取/写盘目标仍是当前活动文件时才记录，避免异步间隙切换文件后写入错误签名
    if (!appState.currentActiveFile || appState.currentActiveFile.path !== filePath) {
        return
    }
    try {
        const stats = await fs.stat(filePath)
        appState.setActiveFileDiskStamp({
            path: filePath,
            mtimeMs: stats.mtimeMs,
            size: stats.size
        })
    } catch {
        // 文件被删/无权限：签名置空，下一次刷新按原逻辑重读并给出错误提示
        appState.setActiveFileDiskStamp(null)
    }
}

/** PF-17：用已 stat 过的结果记录签名（避免重复 stat） */
export function rememberActiveFileDiskStamp(
    filePath: string,
    stats: { mtimeMs: number; size: number }
): void {
    if (!appState.currentActiveFile || appState.currentActiveFile.path !== filePath) {
        return
    }
    appState.setActiveFileDiskStamp({ path: filePath, mtimeMs: stats.mtimeMs, size: stats.size })
}
