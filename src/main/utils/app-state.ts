import { BrowserWindow } from 'electron'
import { createHash } from 'crypto'
// ARC-13 / 第 2 批契约重构：FileItem / FileProperties 已收敛到 src/shared/types/file.ts
// （唯一真源）。本文件原先的本地 StoreFileProperties（type: string、children?: [] 零读取、
// 字段为共享类型的超集）已删除，currentActiveFile 直接使用跨进程传输类型 FileProperties。
import type { FileItem, FileProperties } from '../../shared/types'

/**
 * PF-17：当前活动文件的磁盘签名（mtime + size）。
 * 目录刷新（ReloadDirFromDisk）先比较该签名：未变化说明磁盘内容大概率未变，
 * 无需重读全文、也无需向编辑器重发整篇内容（避免无效 IO/IPC/撤销栈重置）。
 */
export interface ActiveFileDiskStamp {
    /** 绝对路径（与 currentActiveFile.path 比较） */
    path: string
    /** 文件修改时间（ms，与 fs.Stats.mtimeMs 同源） */
    mtimeMs: number
    /** 文件字节数 */
    size: number
}

/**
 * PF-14：文本指纹（sha256 十六进制）。
 *
 * 用途 1：脏标记比较。原实现用 `_lastSavedContent` 保存最近一次保存/加载的全文快照，
 * 与 `currentActiveFile.content` 各持一份全文（10MB 文档 → 主进程常驻约 20MB 正文字符串）。
 * 改为保存「长度 + sha256 指纹」后语义不变（是否与上次保存/加载的内容一致），
 * 内存从 O(n) 降为 O(1)，且 sha256 碰撞概率可忽略。
 * 用途 2：目录树整树 JSON 去重（file-operations 的 lastSentTreeHash），
 * 不再长期持有上一份整树 JSON 字符串。
 */
export function fingerprintText(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * P2 非空断言治理：主窗口安全访问辅助。
 *
 * 背景：主进程多处用 `appState.mainWindow!.webContents.send(...)` 发送 IPC。
 * 主窗口在异步操作完成后可能已关闭/销毁（对话框返回、文件读写完成时应用正在退出），
 * 此时非空断言会跳过 null 检查，直接访问已销毁窗口的 webContents 并抛 TypeError，
 * 导致主进程崩溃。本模块统一收口"取活窗口 + 安全发送"：
 *   1. 窗口为 null → 视为不可用；
 *   2. BrowserWindow.isDestroyed() 为 true → 视为不可用；
 *   3. webContents 缺失或已销毁 → 视为不可用（测试桩缺少 isDestroyed 时跳过该检查）；
 *   4. 发送过程本身抛错（销毁竞态）→ 由 sendToMainWindow 捕获并返回 false，不向上抛。
 */

/** 结构化的"可销毁对象"判定：测试桩没有 isDestroyed 时按可用处理 */
function isAlive(target: { isDestroyed?: () => boolean } | null | undefined): boolean {
    if (!target) {
        return false
    }
    return typeof target.isDestroyed === 'function' ? !target.isDestroyed() : true
}

/**
 * 取当前存活的主窗口；窗口不存在、已关闭或已销毁时返回 null。
 * 调用方在需要把窗口作为对话框父窗口等场景应改用本函数替代 `appState.mainWindow!`。
 */
export function getLiveMainWindow(): BrowserWindow | null {
    const win = appState.mainWindow
    if (!win || !isAlive(win)) {
        return null
    }
    // CQ-15：appState.mainWindow 在测试桩/极端环境下可能是"非完整 BrowserWindow"
    // （只提供 send/isDestroyed 等子集），webContents 也可能缺失；这里按结构探测，
    // 双重断言用于绕开 Electron 完整类型，避免为测试桩伪造整个 BrowserWindow。
    const contents = (win as unknown as { webContents?: { isDestroyed?: () => boolean } })
        .webContents
    if (!contents || !isAlive(contents)) {
        return null
    }
    return win
}

/**
 * 安全地向主窗口 webContents 发送 IPC（支持多参数）：
 * 窗口不可用或发送时抛错（销毁竞态）均返回 false，不向调用方抛异常。
 * 静默降级的设计意图：窗口已销毁时没有可通知的渲染层，记日志也无处展示，
 * 主进程不应为此崩溃；需要留痕的调用方可按返回值自行记录。
 */
export function sendToMainWindow(channel: string, ...args: unknown[]): boolean {
    const win = getLiveMainWindow()
    if (!win) {
        return false
    }
    try {
        win.webContents.send(channel, ...args)
        return true
    } catch {
        return false
    }
}

class AppState {
    private _mainWindow: BrowserWindow | null = null
    private _rootPath = ''
    private _currentActiveFile: FileProperties | null = null
    private _savingFile = false
    private _saveFileInterval = '5000'
    private _srcDirCopyCut = ''
    private _isCopyOrCut = ''
    private _mdFileTree: FileItem[] | null = null
    // D-1/FUN-05、PF-06：统一脏标记。_dirty 为内容同步通道置位的显式标记，
    // _lastSavedContentLength/_lastSavedContentHash 为最近一次成功保存（或打开/重载）时的
    // 内容「长度 + sha256 指纹」（PF-14：替代原全文快照，避免主进程常驻两份全文）。
    private _dirty = false
    private _lastSavedContentLength = 0
    private _lastSavedContentHash: string | null = null
    // PF-17：当前活动文件的磁盘签名（mtime + size），null 表示未知（下次刷新按需重读并重建签名）
    private _activeFileDiskStamp: ActiveFileDiskStamp | null = null
    // 批次 B #4：显式退出标志——before-quit / 托盘「退出」置位后，窗口 close 事件
    // 不再被「最小化到托盘」拦截，保证真实退出路径能关闭窗口并完全结束进程。
    private _isQuitting = false

    get isQuitting(): boolean {
        return this._isQuitting
    }

    setQuitting(quitting: boolean): void {
        this._isQuitting = quitting
    }

    get mainWindow(): BrowserWindow | null {
        return this._mainWindow
    }

    set mainWindow(win: BrowserWindow | null) {
        this._mainWindow = win
    }

    get rootPath(): string {
        return this._rootPath
    }

    set rootPath(path: string) {
        this._rootPath = path
    }

    get currentActiveFile(): FileProperties | null {
        return this._currentActiveFile
    }

    set currentActiveFile(file: FileProperties | null) {
        this._currentActiveFile = file
        // PF-17：活动文件发生变化（打开/新建/另存为/关闭）后磁盘签名失效，
        // 由写盘/读取成功的调用方重新记录，避免用旧文件的 mtime/size 误判新文件未变化。
        this._activeFileDiskStamp = null
    }

    /**
     * PF-17：读取当前活动文件的磁盘签名（诊断/单元测试用）。
     */
    get activeFileDiskStamp(): ActiveFileDiskStamp | null {
        return this._activeFileDiskStamp
    }

    /**
     * PF-17：记录当前活动文件的磁盘签名（由 file-operations 在打开/保存/重载成功后调用）。
     * 传 null 表示签名未知，下一次目录刷新会重读全文并重建签名。
     */
    setActiveFileDiskStamp(stamp: ActiveFileDiskStamp | null): void {
        this._activeFileDiskStamp = stamp
    }

    get savingFile(): boolean {
        return this._savingFile
    }

    set savingFile(val: boolean) {
        this._savingFile = val
    }

    get saveFileInterval(): string {
        return this._saveFileInterval
    }

    set saveFileInterval(val: string) {
        this._saveFileInterval = val
    }

    get srcDirCopyCut(): string {
        return this._srcDirCopyCut
    }

    set srcDirCopyCut(val: string) {
        this._srcDirCopyCut = val
    }

    get isCopyOrCut(): string {
        return this._isCopyOrCut
    }

    set isCopyOrCut(val: string) {
        this._isCopyOrCut = val
    }

    get mdFileTree(): FileItem[] | null {
        return this._mdFileTree
    }

    set mdFileTree(val: FileItem[] | null) {
        this._mdFileTree = val
    }

    /**
     * 当前文件是否处于"脏"状态（存在未保存修改）
     * D-1/FUN-05、PF-06：显式标记优先，并兜底比较当前内容与上次保存内容的指纹，
     * 保证任意通道（内容同步/打开/重载）到达的内容变化都能被识别。
     * PF-14：比较对象由全文快照改为「长度 + sha256 指纹」，避免主进程常驻两份全文。
     */
    isDirty(): boolean {
        const file = this._currentActiveFile
        if (!file) {
            return false
        }
        if (this._dirty) {
            return true
        }
        return this.isContentDifferentFromBaseline(file.content ?? '')
    }

    /**
     * PF-14：内容是否与「上次保存/加载」的基准不同。
     * 长度不同直接判定为脏（O(1) 快路径，避免无谓哈希）；长度相同时再比较 sha256 指纹。
     */
    private isContentDifferentFromBaseline(content: string): boolean {
        if (this._lastSavedContentHash === null) {
            // 尚无基准（如测试直接构造 currentActiveFile）：与原实现一致——空内容视为不脏
            return content.length > 0
        }
        if (content.length !== this._lastSavedContentLength) {
            return true
        }
        return fingerprintText(content) !== this._lastSavedContentHash
    }

    /** PF-14：把内容记为新的「上次保存/加载」基准（只存长度 + 指纹，不存全文） */
    private rememberContentBaseline(content: string): void {
        this._lastSavedContentLength = content.length
        this._lastSavedContentHash = fingerprintText(content)
    }

    /**
     * 内容同步到达时调用：更新当前文件内容，
     * 与上次保存内容不同则置脏（D-1/FUN-05、PF-06）。
     */
    syncFileContent(content: string): void {
        if (!this._currentActiveFile) {
            return
        }
        this._currentActiveFile.content = content
        this._dirty = this.isContentDifferentFromBaseline(content)
    }

    /**
     * 保存成功后调用：记录保存基准并清除脏标记（D-1）。
     */
    markSaved(): void {
        if (this._currentActiveFile) {
            this.rememberContentBaseline(this._currentActiveFile.content ?? '')
        }
        this._dirty = false
    }

    /**
     * 打开/重载/新建文件后调用：以磁盘内容为基准重置脏标记（D-1）。
     */
    markFileLoaded(content: string): void {
        this.rememberContentBaseline(content)
        this._dirty = false
    }

    _resetForTesting(): void {
        this._mainWindow = null
        this._rootPath = ''
        this._currentActiveFile = null
        this._savingFile = false
        this._saveFileInterval = '5000'
        this._srcDirCopyCut = ''
        this._isCopyOrCut = ''
        this._mdFileTree = null
        this._dirty = false
        this._lastSavedContentLength = 0
        this._lastSavedContentHash = null
        this._activeFileDiskStamp = null
        this._isQuitting = false
    }
}

export { AppState }
export const appState = new AppState()
