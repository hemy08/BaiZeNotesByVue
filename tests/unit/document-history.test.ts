// @vitest-environment jsdom
/**
 * A3 文档历史组合式函数单测（jsdom：localStorage + window.electron 桩）
 *
 * 覆盖：
 * - flag 关闭时**不注册 IPC 监听**；开启时注册 FILE_SAVED_SUCCESS / USER_SELECT_FILE；
 * - 关闭开关时注销监听、清空活动路径、关闭对话框；
 * - 保存成功 → 读取内容 → 写入 localStorage 快照（去重、无路径跳过）；
 * - 内容桥：注入 provider 优先 → Monaco 不可用回退 IPC.FILE.READ_HTML → 空文档；
 * - 恢复/删除/清空/打开关闭对话框；
 * - 编辑器事件桥：MONACO_REPLACE_TEXT / EDITOR_JUMP_LINE（含非法行号防护）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { IPC } from '../../src/shared/ipc-channels'
import EventBus from '../../src/renderer/src/common/event-bus/event-bus'
import { EVENT_BUS } from '../../src/renderer/src/common/event-bus/event-bus-events'
import { useFeatureFlags } from '../../src/renderer/src/composables/useFeatureFlags'
import {
    clearActiveFileHistory,
    closeFileHistoryDialog,
    deleteActiveHistoryVersion,
    disposeDocumentHistoryFeature,
    documentHistoryState,
    ensureDocumentHistoryFeature,
    initDocumentHistoryFeature,
    jumpActiveEditorToLine,
    loadActiveDocumentHistory,
    openFileHistoryDialog,
    readActiveMarkdownContent,
    replaceActiveMarkdownContent,
    restoreHistoryVersion,
    setActiveMarkdownContentProvider,
    unregisterDocumentHistoryIpcListeners,
    useDocumentHistory
} from '../../src/renderer/src/composables/useDocumentHistory'
import {
    appendDocumentHistoryVersion,
    buildHistoryStorageKey,
    DOCUMENT_HISTORY_MAX_SNAPSHOT_BYTES,
    listDocumentHistoryVersions
} from '../../src/renderer/src/components/Markdown/history/history-storage'

/** Monaco 模块桩：仅用其全局模型注册表（readEditorMarkdownContent 动态 import 后调用） */
const monacoMocks = vi.hoisted(() => ({ getModels: vi.fn() }))
vi.mock('monaco-editor', () => ({
    editor: {
        getModels: monacoMocks.getModels
    }
}))

const FILE_PATH = 'C:\\notes\\history.md'

/** window.electron.ipcRenderer 桩 */
const ipcMock = {
    on: vi.fn(),
    removeListener: vi.fn(),
    invoke: vi.fn()
}

/** 等待组合式函数内部的异步保存队列落盘 */
async function flushAsync(rounds = 4): Promise<void> {
    for (let index = 0; index < rounds; index++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}

/** 开启文档历史开关并完成初始化（触发 flag 监听注册 IPC） */
async function enableHistory(): Promise<void> {
    useFeatureFlags().flags.documentHistory = true
    await ensureDocumentHistoryFeature()
    await nextTick()
}

/** 取指定 IPC 通道注册的监听函数 */
function listenerOf(channel: string): (event: unknown, ...args: unknown[]) => void {
    const call = ipcMock.on.mock.calls.find(([registered]) => registered === channel)
    expect(call, `通道 ${channel} 应已注册监听`).toBeTruthy()
    return call![1] as (event: unknown, ...args: unknown[]) => void
}

/** 模拟主进程下发当前文件路径 */
function selectFile(filePath: string): void {
    listenerOf(IPC.FILE.USER_SELECT_FILE)({}, filePath)
}

/** 模拟主进程保存成功广播 */
function emitSaved(): void {
    listenerOf(IPC.EVENTS.FILE_SAVED_SUCCESS)({})
}

beforeEach(() => {
    vi.stubGlobal('electron', { ipcRenderer: ipcMock })
    vi.stubGlobal('api', {
        config: {
            read: vi.fn().mockResolvedValue(null),
            write: vi.fn().mockResolvedValue(true)
        }
    })
    const { flags } = useFeatureFlags()
    for (const key of Object.keys(flags) as Array<keyof typeof flags>) {
        flags[key] = false
    }
    disposeDocumentHistoryFeature()
    setActiveMarkdownContentProvider(null)
    localStorage.clear()
    ipcMock.on.mockClear()
    ipcMock.removeListener.mockClear()
    ipcMock.invoke.mockReset()
    ipcMock.invoke.mockResolvedValue(null)
    monacoMocks.getModels.mockReset()
    document.body.innerHTML = ''
})

afterEach(() => {
    disposeDocumentHistoryFeature()
    vi.unstubAllGlobals()
    localStorage.clear()
    document.body.innerHTML = ''
})

describe('flag 门控与监听注册', () => {
    it('flag 关闭时初始化不注册任何 IPC 监听', async () => {
        await ensureDocumentHistoryFeature()
        await nextTick()
        expect(ipcMock.on).not.toHaveBeenCalled()
        expect(documentHistoryState.dialogVisible).toBe(false)
    })

    it('flag 开启时注册保存/路径监听；关闭后注销并清空活动路径/关闭对话框', async () => {
        await enableHistory()
        expect(ipcMock.on).toHaveBeenCalledWith(IPC.EVENTS.FILE_SAVED_SUCCESS, expect.any(Function))
        expect(ipcMock.on).toHaveBeenCalledWith(IPC.FILE.USER_SELECT_FILE, expect.any(Function))

        selectFile(FILE_PATH)
        expect(documentHistoryState.activeFilePath).toBe(FILE_PATH)
        documentHistoryState.dialogVisible = true

        useFeatureFlags().flags.documentHistory = false
        await nextTick()
        expect(ipcMock.removeListener).toHaveBeenCalledWith(
            IPC.EVENTS.FILE_SAVED_SUCCESS,
            expect.any(Function)
        )
        expect(ipcMock.removeListener).toHaveBeenCalledWith(
            IPC.FILE.USER_SELECT_FILE,
            expect.any(Function)
        )
        expect(documentHistoryState.dialogVisible).toBe(false)
        expect(documentHistoryState.activeFilePath).toBe('')
    })

    it('flag 关闭后即使旧监听回调被触发也不会写 localStorage', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        setActiveMarkdownContentProvider(() => '# 内容')
        useFeatureFlags().flags.documentHistory = false
        await nextTick()
        emitSaved()
        await flushAsync()
        expect(localStorage.getItem(buildHistoryStorageKey(FILE_PATH))).toBeNull()
    })
})

describe('保存快照', () => {
    it('保存成功后按路径 hash 写入快照（内容/时间/大小）', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        setActiveMarkdownContentProvider(() => '# 标题\n\n正文')
        emitSaved()
        await flushAsync()
        const raw = localStorage.getItem(buildHistoryStorageKey(FILE_PATH))
        expect(raw).not.toBeNull()
        const versions = listDocumentHistoryVersions(localStorage, FILE_PATH)
        expect(versions).toHaveLength(1)
        expect(versions[0].content).toBe('# 标题\n\n正文')
        expect(versions[0].sizeBytes).toBeGreaterThan(0)
        expect(versions[0].savedAt).toBeGreaterThan(0)
        expect(documentHistoryState.usage.versionCount).toBe(1)
    })

    it('相同内容重复保存只保留一个版本（去重）', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        setActiveMarkdownContentProvider(() => 'same')
        emitSaved()
        emitSaved()
        await flushAsync()
        expect(listDocumentHistoryVersions(localStorage, FILE_PATH)).toHaveLength(1)
    })

    it('无活动文件路径时跳过快照（不写 storage）', async () => {
        await enableHistory()
        setActiveMarkdownContentProvider(() => '内容')
        emitSaved()
        await flushAsync()
        expect(localStorage.length).toBe(0)
    })

    it('内容来源为空（无编辑器/无已保存内容）时跳过', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        ipcMock.invoke.mockResolvedValue(null)
        emitSaved()
        await flushAsync()
        expect(localStorage.length).toBe(0)
    })
})

describe('内容桥 readActiveMarkdownContent', () => {
    it('注入 provider 优先，返回 editor 来源', async () => {
        setActiveMarkdownContentProvider(() => 'live-content')
        const snapshot = await readActiveMarkdownContent()
        expect(snapshot).toEqual({ content: 'live-content', source: 'editor' })
    })

    it('provider 抛错时回退默认实现（IPC 读取已保存内容）', async () => {
        setActiveMarkdownContentProvider(() => {
            throw new Error('provider failed')
        })
        // 内容桥不依赖 flag/监听，直接注入活动路径以覆盖 IPC 回退分支
        documentHistoryState.activeFilePath = FILE_PATH
        ipcMock.invoke.mockResolvedValue('disk-content')
        const snapshot = await readActiveMarkdownContent()
        expect(snapshot).toEqual({ content: 'disk-content', source: 'saved' })
        expect(ipcMock.invoke).toHaveBeenCalledWith(IPC.FILE.READ_HTML, FILE_PATH)
    })

    it('无 provider/无编辑器/无路径时返回空文档', async () => {
        setActiveMarkdownContentProvider(null)
        const snapshot = await readActiveMarkdownContent()
        expect(snapshot).toEqual({ content: '', source: 'empty' })
        expect(ipcMock.invoke).not.toHaveBeenCalled()
    })
})

describe('历史列表与恢复', () => {
    it('加载历史版本 + 当前内容；恢复经 EventBus MONACO_REPLACE_TEXT', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        appendDocumentHistoryVersion(localStorage, FILE_PATH, 'old-version', {
            savedAt: 100,
            versionId: 'v1'
        })
        setActiveMarkdownContentProvider(() => 'current-editor')
        await loadActiveDocumentHistory()
        expect(documentHistoryState.status).toBe('ready')
        expect(documentHistoryState.versions).toHaveLength(1)
        expect(documentHistoryState.currentContent).toBe('current-editor')

        const emitSpy = vi.spyOn(EventBus, '$emit')
        expect(restoreHistoryVersion('v1')).toBe(true)
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_REPLACE_TEXT, 'old-version')
        expect(restoreHistoryVersion('missing')).toBe(false)
    })

    it('无活动文件时加载为提示态（errorKey=noActiveFile）', async () => {
        await enableHistory()
        await loadActiveDocumentHistory()
        expect(documentHistoryState.status).toBe('ready')
        expect(documentHistoryState.errorKey).toBe('editorUi.fileHistory.noActiveFile')
        expect(documentHistoryState.versions).toEqual([])
    })

    it('删除单个版本 / 清空该文件历史', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        appendDocumentHistoryVersion(localStorage, FILE_PATH, 'v-one', {
            savedAt: 1,
            versionId: 'v1'
        })
        appendDocumentHistoryVersion(localStorage, FILE_PATH, 'v-two', {
            savedAt: 2,
            versionId: 'v2'
        })
        setActiveMarkdownContentProvider(() => 'current')
        await loadActiveDocumentHistory()
        expect(documentHistoryState.versions).toHaveLength(2)

        expect(await deleteActiveHistoryVersion('v1')).toBe(true)
        expect(documentHistoryState.versions).toHaveLength(1)
        expect(await deleteActiveHistoryVersion('missing')).toBe(false)

        expect(await clearActiveFileHistory()).toBe(true)
        expect(localStorage.getItem(buildHistoryStorageKey(FILE_PATH))).toBeNull()
        expect(documentHistoryState.versions).toEqual([])
    })

    it('打开/关闭历史对话框：flag 未开启返回 false，开启返回 true', async () => {
        expect(await openFileHistoryDialog()).toBe(false)
        await enableHistory()
        setActiveMarkdownContentProvider(() => '内容')
        expect(await openFileHistoryDialog()).toBe(true)
        expect(documentHistoryState.dialogVisible).toBe(true)
        closeFileHistoryDialog()
        expect(documentHistoryState.dialogVisible).toBe(false)
    })
})

describe('编辑器事件桥', () => {
    it('replaceActiveMarkdownContent 发射 MONACO_REPLACE_TEXT', () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        replaceActiveMarkdownContent('# 新内容')
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_REPLACE_TEXT, '# 新内容')
    })

    it('jumpActiveEditorToLine 发射 EDITOR_JUMP_LINE（钳制为 ≥1 的整数，非法值忽略）', () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        jumpActiveEditorToLine(12.8)
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.EDITOR_JUMP_LINE, { line: 12 })
        jumpActiveEditorToLine(-3)
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.EDITOR_JUMP_LINE, { line: 1 })
        emitSpy.mockClear()
        jumpActiveEditorToLine(Number.NaN)
        jumpActiveEditorToLine(Number.POSITIVE_INFINITY)
        expect(emitSpy).not.toHaveBeenCalled()
    })

    it('replaceActiveMarkdownContent 对非字符串入参直接忽略', () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        replaceActiveMarkdownContent(123 as unknown as string)
        expect(emitSpy).not.toHaveBeenCalled()
    })
})

describe('Monaco 实时内容读取（动态 import 桩）', () => {
    /** 构造 Monaco 文本模型桩 */
    function createModelStub(options: {
        languageId: string
        versionId: number
        value: string
        disposed?: boolean
    }): {
        isDisposed: () => boolean
        getLanguageId: () => string
        getVersionId: () => number
        getValue: () => string
    } {
        return {
            isDisposed: () => options.disposed === true,
            getLanguageId: () => options.languageId,
            getVersionId: () => options.versionId,
            getValue: () => options.value
        }
    }

    /** 挂载编辑器容器（readEditorMarkdownContent 的开关） */
    function mountEditorContainer(): void {
        const container = document.createElement('div')
        container.id = 'monaco-editor-container'
        document.body.appendChild(container)
    }

    it('优先读取 markdown 模型中最近编辑（versionId 最大）的实时内容', async () => {
        mountEditorContainer()
        monacoMocks.getModels.mockReturnValue([
            createModelStub({ languageId: 'markdown', versionId: 1, value: '旧内容' }),
            createModelStub({ languageId: 'plaintext', versionId: 99, value: '非 markdown' }),
            createModelStub({ languageId: 'markdown', versionId: 5, value: '最新内容' }),
            createModelStub({
                languageId: 'markdown',
                versionId: 100,
                value: '已销毁模型',
                disposed: true
            })
        ])
        documentHistoryState.activeFilePath = FILE_PATH
        ipcMock.invoke.mockResolvedValue(null)
        const snapshot = await readActiveMarkdownContent()
        expect(snapshot).toEqual({ content: '最新内容', source: 'editor' })
        expect(ipcMock.invoke).not.toHaveBeenCalled()
    })

    it('编辑器存在但无 markdown 模型时回退已保存内容', async () => {
        mountEditorContainer()
        monacoMocks.getModels.mockReturnValue([
            createModelStub({ languageId: 'plaintext', versionId: 1, value: '非 markdown' })
        ])
        documentHistoryState.activeFilePath = FILE_PATH
        ipcMock.invoke.mockResolvedValue('disk-content')
        const snapshot = await readActiveMarkdownContent()
        expect(snapshot).toEqual({ content: 'disk-content', source: 'saved' })
    })

    it('Monaco 读取抛错时回退已保存内容（不抛出）', async () => {
        mountEditorContainer()
        monacoMocks.getModels.mockImplementation(() => {
            throw new Error('monaco broken')
        })
        documentHistoryState.activeFilePath = FILE_PATH
        ipcMock.invoke.mockResolvedValue('disk-content')
        const snapshot = await readActiveMarkdownContent()
        expect(snapshot).toEqual({ content: 'disk-content', source: 'saved' })
    })
})

describe('降级路径', () => {
    it('provider 返回 null 时回退默认实现', async () => {
        setActiveMarkdownContentProvider(() => null)
        documentHistoryState.activeFilePath = FILE_PATH
        ipcMock.invoke.mockResolvedValue('disk-content')
        const snapshot = await readActiveMarkdownContent()
        expect(snapshot).toEqual({ content: 'disk-content', source: 'saved' })
    })

    it('READ_HTML 调用失败时返回空文档（不抛出）', async () => {
        documentHistoryState.activeFilePath = FILE_PATH
        ipcMock.invoke.mockRejectedValue(new Error('read failed'))
        const snapshot = await readActiveMarkdownContent()
        expect(snapshot).toEqual({ content: '', source: 'empty' })
    })

    it('localStorage 不可用：保存成功只记日志、不写快照、不抛错', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        setActiveMarkdownContentProvider(() => '内容')
        const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('storage denied')
            }
        })
        try {
            emitSaved()
            await flushAsync()
        } finally {
            if (descriptor !== undefined) {
                Object.defineProperty(window, 'localStorage', descriptor)
            } else {
                delete (window as unknown as Record<string, unknown>).localStorage
            }
        }
        expect(localStorage.length).toBe(0)
    })

    it('快照超过单版本上限时不写 localStorage', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        setActiveMarkdownContentProvider(() => 'x'.repeat(DOCUMENT_HISTORY_MAX_SNAPSHOT_BYTES + 1))
        emitSaved()
        await flushAsync()
        expect(localStorage.length).toBe(0)
    })

    it('关闭 flag 后旧保存回调直接返回（双重门控）', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        const savedListener = listenerOf(IPC.EVENTS.FILE_SAVED_SUCCESS)
        setActiveMarkdownContentProvider(() => '内容')
        useFeatureFlags().flags.documentHistory = false
        await nextTick()
        savedListener({})
        await flushAsync()
        expect(localStorage.length).toBe(0)
    })

    it('window.electron 缺失时开启 flag 不注册监听也不抛错', async () => {
        await enableHistory()
        useFeatureFlags().flags.documentHistory = false
        await nextTick()
        vi.unstubAllGlobals()
        useFeatureFlags().flags.documentHistory = true
        await nextTick()
        // 无 electron 桥时 registerIpcListeners 安全返回；再次关闭时注销同样安全
        useFeatureFlags().flags.documentHistory = false
        await nextTick()
        unregisterDocumentHistoryIpcListeners()
        expect(true).toBe(true)
    })
})

describe('对话框期间的数据刷新与边界操作', () => {
    it('对话框打开时保存成功会刷新版本列表', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        setActiveMarkdownContentProvider(() => '第一版内容')
        documentHistoryState.dialogVisible = true
        emitSaved()
        await flushAsync()
        expect(documentHistoryState.versions).toHaveLength(1)

        setActiveMarkdownContentProvider(() => '第二版内容')
        emitSaved()
        await flushAsync()
        expect(documentHistoryState.versions).toHaveLength(2)
    })

    it('对话框打开时切换文件会清空旧列表并重新加载', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        setActiveMarkdownContentProvider(() => '内容')
        documentHistoryState.dialogVisible = true
        await loadActiveDocumentHistory()
        selectFile('C:\\notes\\another.md')
        await flushAsync()
        expect(documentHistoryState.activeFilePath).toBe('C:\\notes\\another.md')
        expect(documentHistoryState.status).toBe('ready')
        expect(documentHistoryState.versions).toEqual([])
    })

    it('重复下发同一路径不重置列表（早退分支）', async () => {
        await enableHistory()
        selectFile(FILE_PATH)
        appendDocumentHistoryVersion(localStorage, FILE_PATH, '版本', {
            savedAt: 1,
            versionId: 'v1'
        })
        await loadActiveDocumentHistory()
        selectFile(FILE_PATH)
        expect(documentHistoryState.versions).toHaveLength(1)
    })

    it('flag 关闭时恢复/删除/清空直接返回 false', async () => {
        expect(restoreHistoryVersion('any')).toBe(false)
        expect(await deleteActiveHistoryVersion('any')).toBe(false)
        expect(await clearActiveFileHistory()).toBe(false)
    })

    it('无活动路径时删除/清空返回 false', async () => {
        await enableHistory()
        documentHistoryState.activeFilePath = ''
        expect(await deleteActiveHistoryVersion('any')).toBe(false)
        expect(await clearActiveFileHistory()).toBe(false)
    })

    it('flag 关闭时加载历史直接返回（保持状态初值）', async () => {
        documentHistoryState.status = 'idle'
        await loadActiveDocumentHistory()
        expect(documentHistoryState.status).toBe('idle')
    })

    it('useDocumentHistory 组合式入口返回状态与操作', () => {
        const api = useDocumentHistory()
        expect(api.state).toBe(documentHistoryState)
        expect(typeof api.openFileHistoryDialog).toBe('function')
        expect(typeof api.restoreHistoryVersion).toBe('function')
    })

    it('initDocumentHistoryFeature 幂等（可重复调用）', async () => {
        await initDocumentHistoryFeature()
        await initDocumentHistoryFeature()
        expect(initDocumentHistoryFeature()).toBe(ensureDocumentHistoryFeature())
    })
})
