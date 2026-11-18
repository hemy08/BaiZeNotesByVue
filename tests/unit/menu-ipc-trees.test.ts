/**
 * menu_file / menu_edit / menu_view / menu_help 菜单 handler 树单元测试
 * 覆盖：send 通道与参数、app.relaunch/quit、shell.openExternal、
 * 文件操作与对话框函数委托、编码切换、折叠级别参数
 * task-50 追加：AI 导航菜单动作 ↔ aiMenuHandlers 双向一致 + 末跳 URL 契约（https / 唯一 / 无推广参数）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const treeMocks = vi.hoisted(() => ({
    relaunch: vi.fn(),
    quit: vi.fn(),
    openExternal: vi.fn(),
    openOnlineWebPage: vi.fn(),
    openFile: vi.fn(),
    openDirectory: vi.fn(),
    saveActiveFile: vi.fn(),
    saveActiveFileAs: vi.fn(),
    reloadDirFromDisk: vi.fn(),
    insertImportFormFile: vi.fn(),
    exportToFile: vi.fn(),
    showReleaseNotesDialog: vi.fn(),
    showUpdateLogDialog: vi.fn(),
    // FE-07：帮助 → 快捷键 主进程 handler 现在打开真实对话框
    showShortcutKeysDialog: vi.fn(),
    // ET-7：menu-help 的 'update' handler 动态 import '../utils/auto-updater.js'，
    // 测试中替换为桩函数（避免在无 Electron 运行时的测试环境加载 electron-updater）
    checkForUpdatesAndNotify: vi.fn()
}))

// AS-12：视图 → 开发人员工具菜单动作按 is.dev 守卫，测试需要可切换开发/生产环境
const toolkitState = vi.hoisted(() => ({ is: { dev: true } }))
vi.mock('@electron-toolkit/utils', () => ({ is: toolkitState.is }))

// 视图开关持久化（task-49）：menu-view 动态 import editor-setting 写回唯一真源；
// 这里用最小替身隔离 electron-store/config 链（真实模块在无 Electron 运行时的
// 测试环境会在 getUserDataPath 处崩溃）。持久化行为的完整断言见
// tests/unit/menu-view-editor-view-toggles.test.ts。
const editorSettingMocks = vi.hoisted(() => ({
    getEditorSetting: vi.fn(() => ({ lineNumbers: 'on', renderWhitespace: 'all' })),
    saveEditorSetting: vi.fn()
}))
vi.mock('../../src/main/config/editor-setting', () => editorSettingMocks)

vi.mock('electron', () => ({
    app: { relaunch: treeMocks.relaunch, quit: treeMocks.quit },
    shell: { openExternal: treeMocks.openExternal }
}))

vi.mock('../../src/main/utils/file-utils/file-operations', () => ({
    OpenFile: treeMocks.openFile,
    OpenDirectory: treeMocks.openDirectory,
    SaveActiveFile: treeMocks.saveActiveFile,
    SaveActiveFileAs: treeMocks.saveActiveFileAs,
    ReloadDirFromDisk: treeMocks.reloadDirFromDisk
}))

vi.mock('../../src/main/utils/file-utils/import', () => ({
    InsertImportFormFile: treeMocks.insertImportFormFile
}))

vi.mock('../../src/main/utils/file-utils/export', () => ({
    ExportToFile: treeMocks.exportToFile
}))

vi.mock('../../src/main/dialogs/dialogs', () => ({
    ShowReleaseNotesDialog: treeMocks.showReleaseNotesDialog,
    ShowUpdateLogDialog: treeMocks.showUpdateLogDialog,
    ShowShortcutKeysDialog: treeMocks.showShortcutKeysDialog,
    // task-50：AI 导航 handler 树叶子的末跳统一为 OpenOnlineWebPage(url)
    OpenOnlineWebPage: treeMocks.openOnlineWebPage
}))

vi.mock('../../src/main/utils/auto-updater.js', () => ({
    checkForUpdatesAndNotify: treeMocks.checkForUpdatesAndNotify
}))

import { IPC } from '../../src/shared/ipc-channels'
import { fileMenuHandlers, codingMenuHandlers } from '../../src/main/ipc/menu-file'
import { editMenuHandlers } from '../../src/main/ipc/menu-edit'
import { viewMenuHandlers, insertMenuHandlers } from '../../src/main/ipc/menu-view'
import { helpMenuHandlers } from '../../src/main/ipc/menu-help'
import { aiMenuHandlers, aiMenuUrlMaps } from '../../src/main/ipc/menu-tools'
import { menuMap } from '../../src/renderer/src/components/MenuBar/menu-config'

// 构造最小主窗口 mock
function makeWindow(): {
    webContents: { send: ReturnType<typeof vi.fn>; toggleDevTools: ReturnType<typeof vi.fn> }
} {
    return { webContents: { send: vi.fn(), toggleDevTools: vi.fn() } }
}

beforeEach(() => {
    for (const mock of Object.values(treeMocks)) {
        mock.mockClear()
    }
    toolkitState.is.dev = true
    editorSettingMocks.getEditorSetting.mockClear()
    editorSettingMocks.saveEditorSetting.mockClear()
})

describe('fileMenuHandlers', () => {
    it('should open the create dialog for new-file with a folder flag', () => {
        const win = makeWindow()
        ;(fileMenuHandlers['new-file'] as (w: never) => void)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'createFileFolder',
            {
                isFolder: true
            }
        )
    })

    it('should open the create dialog for new-folder with a file flag', () => {
        const win = makeWindow()
        ;(fileMenuHandlers['new-folder'] as (w: never) => void)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'createFileFolder',
            {
                isFolder: false
            }
        )
    })

    it('should delegate save to SaveActiveFile', async () => {
        treeMocks.saveActiveFile.mockResolvedValue(undefined)
        // 生产实现返回 Promise<boolean>，测试只关心保存被调用，此处放宽返回值类型
        await (fileMenuHandlers['save'] as () => Promise<unknown>)()
        expect(treeMocks.saveActiveFile).toHaveBeenCalled()
    })

    it('should delegate open-file to OpenFile with the window', async () => {
        const win = makeWindow()
        await (fileMenuHandlers['open-file'] as (w: never) => Promise<void>)(win as never)
        expect(treeMocks.openFile).toHaveBeenCalledWith(win)
    })

    it('should delegate open-folder to OpenDirectory with the window', async () => {
        const win = makeWindow()
        await (fileMenuHandlers['open-folder'] as (w: never) => Promise<void>)(win as never)
        expect(treeMocks.openDirectory).toHaveBeenCalledWith(win)
    })

    it('should relaunch then quit for relaunch', () => {
        ;(fileMenuHandlers['relaunch'] as () => void)()
        expect(treeMocks.relaunch).toHaveBeenCalled()
        expect(treeMocks.quit).toHaveBeenCalled()
    })

    it('should quit the app for exit', () => {
        ;(fileMenuHandlers['exit'] as () => void)()
        expect(treeMocks.quit).toHaveBeenCalled()
        expect(treeMocks.relaunch).not.toHaveBeenCalled()
    })

    it('should insert word import via InsertImportFormFile with insert flag', () => {
        const win = makeWindow()
        const handler = (fileMenuHandlers.import as Record<string, unknown>)['word'] as (
            w: never
        ) => void
        handler(win as never)
        expect(treeMocks.insertImportFormFile).toHaveBeenCalledWith(win, 'word', true)
    })

    it('should export to pdf via ExportToFile', () => {
        const win = makeWindow()
        const handler = (fileMenuHandlers.export as Record<string, unknown>)['pdf'] as (
            w: never
        ) => void
        handler(win as never)
        expect(treeMocks.exportToFile).toHaveBeenCalledWith(win, 'pdf')
    })
})

describe('codingMenuHandlers', () => {
    it('should send open-with-encoding for each encoding entry', () => {
        const win = makeWindow()
        const handler = (codingMenuHandlers.encoding as Record<string, unknown>)['gbk'] as (
            w: never
        ) => void
        handler(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith('baize:file:open-with-encoding', 'gbk')
    })

    it('should send convert-to-encoding for each switch entry', () => {
        const win = makeWindow()
        const handler = (codingMenuHandlers.switch as Record<string, unknown>)['utf16-le'] as (
            w: never
        ) => void
        handler(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(
            'baize:file:convert-to-encoding',
            'utf16-le'
        )
    })
})

describe('editMenuHandlers', () => {
    it('should trigger undo and redo via the undo-redo channel', () => {
        const win = makeWindow()
        ;(editMenuHandlers['undo'] as (w: never) => void)(win as never)
        ;(editMenuHandlers['redo'] as (w: never) => void)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith('baize:monaco:undo-redo', 'undo')
        expect(win.webContents.send).toHaveBeenCalledWith('baize:monaco:undo-redo', 'redo')
    })

    it('should trigger Monaco clipboard actions for cut/copy/paste (FUN-09)', () => {
        const win = makeWindow()
        ;(editMenuHandlers['cut'] as (w: never) => void)(win as never)
        ;(editMenuHandlers['copy'] as (w: never) => void)(win as never)
        ;(editMenuHandlers['paste'] as (w: never) => void)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(
            'baize:monaco:undo-redo',
            'editor.action.clipboardCutAction'
        )
        expect(win.webContents.send).toHaveBeenCalledWith(
            'baize:monaco:undo-redo',
            'editor.action.clipboardCopyAction'
        )
        expect(win.webContents.send).toHaveBeenCalledWith(
            'baize:monaco:undo-redo',
            'editor.action.clipboardPasteAction'
        )
    })

    it('should expose no go-line/find/replace handlers (FUN-09 removed)', () => {
        // FUN-09：go-line/find-in-file/replace-in-file 已移交渲染层 menu_actions.ts
        // 已删除的键不在类型定义中，用索引签名视图断言其确实不存在（TS7053）
        const handlers = editMenuHandlers as unknown as Record<string, unknown>
        expect(handlers['go-line']).toBeUndefined()
        expect(handlers['find-in-file']).toBeUndefined()
        expect(handlers['replace-in-file']).toBeUndefined()
        expect(handlers['find-in-dir']).toBeUndefined()
        expect(handlers['replace-in-dir']).toBeUndefined()
    })
})

describe('viewMenuHandlers', () => {
    it('should toggle dev tools for dev-tools in dev mode', () => {
        const win = makeWindow()
        ;(viewMenuHandlers['dev-tools'] as (w: never) => void)(win as never)
        expect(win.webContents.toggleDevTools).toHaveBeenCalled()
    })

    // AS-12：生产包不得通过菜单打开 DevTools（与 F12 全局热键仅开发环境注册一致）
    it('should NOT toggle dev tools in production mode (AS-12)', () => {
        toolkitState.is.dev = false
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const win = makeWindow()
        expect(() =>
            (viewMenuHandlers['dev-tools'] as (w: never) => void)(win as never)
        ).not.toThrow()
        expect(win.webContents.toggleDevTools).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(
            '[Menu] 开发人员工具仅在开发环境可用，生产包已忽略该操作'
        )
        warnSpy.mockRestore()
    })

    it('should send editor options updates for toggle-line-number', () => {
        const win = makeWindow()
        ;(viewMenuHandlers['toggle-line-number'] as (w: never) => void)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(
            'baize:editor:update-options',
            'lineNumbers'
        )
    })

    it('should send the whitespace option update for toggle-whitespace', () => {
        const win = makeWindow()
        ;(viewMenuHandlers['toggle-whitespace'] as (w: never) => void)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(
            'baize:editor:update-options',
            'renderWhitespace'
        )
    })

    it('should expose no fold/toggle-outline handlers (FUN-09 removed)', () => {
        // FUN-09：折叠树与大纲开关已移交渲染层 menu_actions.ts（EventBus 事件）
        const handlers = viewMenuHandlers as unknown as Record<string, unknown>
        expect(handlers.fold).toBeUndefined()
        expect(handlers['toggle-outline']).toBeUndefined()
    })

    it('should expose no special-text handler (P2：渲染层 menu_actions 接管)', () => {
        // 特殊文字/字体选择对话框由渲染层 menu_actions.ts 接管（configStore.showDialog('fontSelect')），
        // 主进程 handler 与对应 JSDOM 对话框已删除；已删除的键用索引签名视图断言（TS7053）。
        const handlers = insertMenuHandlers as unknown as Record<string, unknown>
        expect(handlers['special-text']).toBeUndefined()
    })

    it('should still expose the reachable material admonition handler', () => {
        const win = makeWindow()
        ;(
            (insertMenuHandlers.material as Record<string, unknown>)['admonition'] as (
                w: never
            ) => void
        )(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith('baize:dialog:open-vue', 'admonition')
    })

    it('should insert from a csv file without the insert flag', () => {
        const win = makeWindow()
        const handler = (insertMenuHandlers['from-file'] as Record<string, unknown>)['csv'] as (
            w: never
        ) => void
        handler(win as never)
        expect(treeMocks.insertImportFormFile).toHaveBeenCalledWith(win, 'csv', false)
    })
})

describe('helpMenuHandlers', () => {
    it('should open the usage page externally', () => {
        ;(helpMenuHandlers['usage'] as () => void)()
        expect(treeMocks.openExternal).toHaveBeenCalledWith('https://hemy08.github.io/hemynotes/')
    })

    it('should open the issues page externally', () => {
        ;(helpMenuHandlers['issues'] as () => void)()
        expect(treeMocks.openExternal).toHaveBeenCalledWith(
            'https://github.com/hemy08/BaiZeNotesByVue/issues'
        )
    })

    it('should open the home page externally', () => {
        ;(helpMenuHandlers['home'] as () => void)()
        expect(treeMocks.openExternal).toHaveBeenCalledWith(
            'https://github.com/hemy08/BaiZeNotesByVue'
        )
    })

    it('should show the update log dialog', () => {
        ;(helpMenuHandlers['update-log'] as () => void)()
        expect(treeMocks.showUpdateLogDialog).toHaveBeenCalled()
    })

    it('should not expose the deleted tech-stack/about/contact-us handlers (P2：渲染层接管)', () => {
        // 渲染层 menu_actions.ts 对 help:tech-stack / help:about / help:contact-us
        // 优先拦截并打开 Vue 对话框，主进程 JSDOM 对话框已删除（CQ-4：联系对话框
        // 连同不可达的 contact-us handler 一并删除）；update-log / release-notes
        // 仍在主进程可达（渲染层未拦截）。
        const handlers = helpMenuHandlers as unknown as Record<string, unknown>
        expect(handlers['tech-stack']).toBeUndefined()
        expect(handlers['about']).toBeUndefined()
        expect(handlers['contact-us']).toBeUndefined()
        expect(handlers['update-log']).toBeDefined()
        expect(handlers['release-notes']).toBeDefined()
    })

    it('should show the release notes dialog for each version', () => {
        const handler = (helpMenuHandlers['release-notes'] as Record<string, unknown>)[
            'v1.2.2'
        ] as () => void
        handler()
        expect(treeMocks.showReleaseNotesDialog).toHaveBeenCalledWith('1.2.2')
    })

    it('should show the release notes dialog for v1.3.0', () => {
        const handler = (helpMenuHandlers['release-notes'] as Record<string, unknown>)[
            'v1.3.0'
        ] as () => void
        handler()
        expect(treeMocks.showReleaseNotesDialog).toHaveBeenCalledWith('1.3.0')
    })

    // FE-07：快捷键说明由空实现（console.warn）改为打开真实对话框
    it('should open the shortcut keys dialog (FE-07)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        ;(helpMenuHandlers['shortkeys'] as () => void)()
        expect(treeMocks.showShortcutKeysDialog).toHaveBeenCalledTimes(1)
        expect(warnSpy).not.toHaveBeenCalledWith('[Menu] Shortcut keys help not implemented yet')
        warnSpy.mockRestore()
    })
})

/**
 * ET-7：菜单 handler 全量覆盖。
 *
 * 背景：扫描报告 ET-7 指出 menu-file / menu-view / menu-help 行覆盖仅 26%~36%——
 * 原有用例每个 handler 家族只抽测 1~2 个叶子，其余叶子（菜单动作的最后一跳）从未执行。
 * 本段以「handler 树按路径取叶子 + 参数化」逐项执行并断言「通道 → 参数」契约，
 * 覆盖菜单三跳链路（menu_config → menu_actions 拦截 → 主进程 handler）的主进程末跳。
 */

/** 从 handler 树按路径取叶子函数；路径不存在/非函数时直接失败，避免用例静默跳过缺口 */
function pickHandler(tree: unknown, ...keys: string[]): (...args: never[]) => unknown {
    let current: unknown = tree
    for (const key of keys) {
        if (current === null || typeof current !== 'object') {
            throw new Error(`handler 树节点缺失：${keys.join('.')}`)
        }
        current = (current as Record<string, unknown>)[key]
    }
    if (typeof current !== 'function') {
        throw new Error(`handler 叶子不是函数：${keys.join('.')}`)
    }
    return current as (...args: never[]) => unknown
}

const IMPORT_FILE_TYPES = ['word', 'html', 'json', 'yaml', 'xml', 'text'] as const
const EXPORT_FILE_TYPES = ['word', 'json', 'xml', 'yaml', 'html', 'pdf'] as const
const FILE_ENCODINGS = [
    'utf8',
    'utf16-le',
    'utf16-be',
    'gbk',
    'gb2312',
    'gb18030',
    'big5',
    'big5-hkscs',
    'hex'
] as const
const FROM_FILE_TYPES = ['json', 'text', 'ini', 'yaml', 'xml', 'html', 'csv', 'excel'] as const
const RELEASE_NOTE_VERSIONS = [
    '1.3.0',
    '1.2.2',
    '1.2.1',
    '1.2.0',
    '1.1.5',
    '1.1.3',
    '1.1.2',
    '1.1.1',
    '1.1.0',
    '1.0.2',
    '1.0.1',
    '1.0.0'
] as const

describe('fileMenuHandlers 全量 handler（ET-7）', () => {
    it('should delegate save-as, close-file and reload to the corresponding file operations', async () => {
        const win = makeWindow()
        await pickHandler(fileMenuHandlers, 'save-as')(win as never)
        await pickHandler(fileMenuHandlers, 'close-file')(win as never)
        await pickHandler(fileMenuHandlers, 'reload')(win as never)
        expect(treeMocks.saveActiveFileAs).toHaveBeenCalledTimes(1)
        expect(treeMocks.saveActiveFile).toHaveBeenCalledTimes(1)
        expect(treeMocks.reloadDirFromDisk).toHaveBeenCalledTimes(1)
    })

    it.each(IMPORT_FILE_TYPES)('should insert %s import with the insert flag true', (fileType) => {
        const win = makeWindow()
        pickHandler(fileMenuHandlers, 'import', fileType)(win as never)
        expect(treeMocks.insertImportFormFile).toHaveBeenCalledWith(win, fileType, true)
    })

    it.each(EXPORT_FILE_TYPES)('should export to %s via ExportToFile', (fileType) => {
        const win = makeWindow()
        pickHandler(fileMenuHandlers, 'export', fileType)(win as never)
        expect(treeMocks.exportToFile).toHaveBeenCalledWith(win, fileType)
    })

    it.each(FILE_ENCODINGS)('should request reopening with encoding %s', (encoding) => {
        const win = makeWindow()
        pickHandler(codingMenuHandlers, 'encoding', encoding)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(IPC.FILE.OPEN_WITH_ENCODING, encoding)
    })

    it.each(FILE_ENCODINGS)('should request converting to encoding %s', (encoding) => {
        const win = makeWindow()
        pickHandler(codingMenuHandlers, 'switch', encoding)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(IPC.FILE.CONVERT_TO_ENCODING, encoding)
    })
})

describe('viewMenuHandlers 全量 handler（ET-7）', () => {
    const viewChannels = [
        ['edit-mode', IPC.VIEW.EDIT_MODE],
        ['preview-mode', IPC.VIEW.PREVIEW_MODE],
        ['edit-preview-mode', IPC.VIEW.EDIT_PREVIEW_MODE],
        ['toggle-resource-manager', IPC.VIEW.TOGGLE_RES_MANAGER]
    ] as const

    it.each(viewChannels)('should send %s with a null payload', (action, channel) => {
        const win = makeWindow()
        pickHandler(viewMenuHandlers, action)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(channel, null)
    })

    const insertDialogs = [
        ['math', 'mathText'],
        ['md-table', 'mdSheet'],
        ['web-link', 'insertLink']
    ] as const

    it.each(insertDialogs)('should open the %s Vue dialog', (action, dialog) => {
        const win = makeWindow()
        pickHandler(insertMenuHandlers, action)(win as never)
        expect(win.webContents.send).toHaveBeenCalledWith(IPC.DIALOG.OPEN_VUE_DIALOG, dialog)
    })

    it.each(FROM_FILE_TYPES)('should insert from %s file without the insert flag', (fileType) => {
        const win = makeWindow()
        pickHandler(insertMenuHandlers, 'from-file', fileType)(win as never)
        expect(treeMocks.insertImportFormFile).toHaveBeenCalledWith(win, fileType, false)
    })
})

describe('helpMenuHandlers 全量 handler（ET-7）', () => {
    it.each(RELEASE_NOTE_VERSIONS)('should show the release notes dialog for v%s', (version) => {
        pickHandler(helpMenuHandlers, 'release-notes', `v${version}`)()
        expect(treeMocks.showReleaseNotesDialog).toHaveBeenCalledWith(version)
    })

    it('should warn for the unimplemented change-log entry', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        pickHandler(helpMenuHandlers, 'change-log')()
        expect(warnSpy).toHaveBeenCalledWith('[Menu] Change log not implemented yet')
        warnSpy.mockRestore()
    })

    // FUN-10/CMP-21：检查更新经动态 import 调用 auto-updater，结果由对话框反馈
    it('should delegate the update check to the auto-updater module with the main window', async () => {
        treeMocks.checkForUpdatesAndNotify.mockResolvedValue(undefined)
        const win = makeWindow()
        pickHandler(helpMenuHandlers, 'update')(win as never)
        await vi.waitFor(() => {
            expect(treeMocks.checkForUpdatesAndNotify).toHaveBeenCalledWith(win)
        })
    })

    // CQ-10：动态 import 失败必须有兜底，否则打包产物缺依赖时点击"检查更新"无任何反馈
    it('should surface auto-updater module failures as a console warning', async () => {
        const updaterError = new Error('updater module unavailable')
        treeMocks.checkForUpdatesAndNotify.mockRejectedValue(updaterError)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        pickHandler(helpMenuHandlers, 'update')(makeWindow() as never)
        await vi.waitFor(() => {
            expect(warnSpy).toHaveBeenCalledWith('[Menu] 检查更新模块加载失败:', updaterError)
        })
        warnSpy.mockRestore()
        treeMocks.checkForUpdatesAndNotify.mockReset()
    })
})

/**
 * task-50：AI 导航菜单（9 组 70 个叶子）双跳一致性。
 * 数据真源：渲染层 `menu-config.ts` 的 aiMenuGroups（labelKey + menuAction）
 *          主进程 `menu-tools.ts` 的 aiMenuUrlMaps（URL 单一真源）→ aiMenuHandlers
 * 断言：① 菜单动作与 handler 叶子一一对应（不多不少）；② 每个叶子可执行；
 *      ③ URL 全部 https、AI 菜单内部唯一、无推广/返利参数；④ URL 映射表 ↔ handler 无孤儿条目。
 */
describe('aiMenuHandlers（AI 导航，task-50）', () => {
    /** 递归收集 handler 树叶子函数 */
    function collectAiLeaves(tree: unknown, out: Array<() => unknown> = []): Array<() => unknown> {
        if (typeof tree === 'function') {
            out.push(tree as () => unknown)
            return out
        }
        if (tree && typeof tree === 'object') {
            for (const value of Object.values(tree)) {
                collectAiLeaves(value, out)
            }
        }
        return out
    }

    /** 递归收集菜单树中指定前缀的 menuAction */
    function collectAiActions(items: unknown[], prefix: string): string[] {
        const actions: string[] = []
        for (const item of items as Array<{ menuAction?: string; submenu?: unknown[] }>) {
            if (item.menuAction?.startsWith(prefix)) {
                actions.push(item.menuAction)
            }
            if (item.submenu) {
                actions.push(...collectAiActions(item.submenu, prefix))
            }
        }
        return actions
    }

    it('should keep every AI menu action reachable in the main-process handler tree', () => {
        const actions = collectAiActions(menuMap.value, 'baize:menu:ai:')
        expect(actions).toHaveLength(70)
        for (const action of actions) {
            const [, group, toolId] = action.split(':').slice(2)
            expect(typeof pickHandler(aiMenuHandlers, group, toolId)).toBe('function')
        }
        // handler 叶子数与菜单叶子数一致（无多余/遗漏条目）
        expect(collectAiLeaves(aiMenuHandlers)).toHaveLength(actions.length)
    })

    it('should execute every AI handler and open a unique https URL without promo params', () => {
        const leaves = collectAiLeaves(aiMenuHandlers)
        expect(leaves).toHaveLength(70)
        for (const leaf of leaves) {
            leaf()
        }

        expect(treeMocks.openOnlineWebPage).toHaveBeenCalledTimes(70)
        const urls = treeMocks.openOnlineWebPage.mock.calls.map((call) => call[0] as string)
        for (const url of urls) {
            expect(typeof url).toBe('string')
            // https + 无 query/hash（官方干净地址，不带任何推广或跟踪参数）
            expect(url).toMatch(/^https:\/\/[^\s?#]+$/)
            expect(url).not.toMatch(/utm_|cps_key|invitecode|redirect|spm_|userCode/i)
        }
        // 全菜单 URL 唯一（AI 导航内部无重复）
        expect(new Set(urls).size).toBe(urls.length)
    })

    it('should keep aiMenuUrlMaps and aiMenuHandlers in one-to-one correspondence', () => {
        const urlMapPaths = Object.entries(aiMenuUrlMaps).flatMap(([group, tools]) =>
            Object.keys(tools).map((toolId) => `${group}:${toolId}`)
        )
        const handlerPaths: string[] = []
        for (const [group, tools] of Object.entries(aiMenuHandlers)) {
            for (const toolId of Object.keys(tools)) {
                handlerPaths.push(`${group}:${toolId}`)
            }
        }
        expect(handlerPaths.sort()).toEqual(urlMapPaths.sort())
        // 9 个分组与渲染层菜单分组名一致
        expect(Object.keys(aiMenuHandlers).sort()).toEqual(Object.keys(aiMenuUrlMaps).sort())
    })
})
