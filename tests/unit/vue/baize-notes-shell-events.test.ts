// @vitest-environment jsdom
/**
 * BaiZeNotes.vue 主壳事件接线补测（既有测试覆盖特殊文字/图片插入与 OPEN_VUE_DIALOG 链路，
 * 本文件用轻量对话框桩覆盖父组件侧的 23 个 @close / @insert / @apply / @confirm /
 * @browse-file 内联处理器、标题栏窗口操作、系统设置广播与卸载清理）。
 *
 * 为什么用对话框桩：主壳的价值在于「事件接线」，各对话框内部实现已有专项用例；
 * 把 23 个懒加载对话框替换为只渲染触发按钮的桩，可以稳定触发父组件每一个内联处理器，
 * 且不依赖动态 import 时序。
 *
 * 覆盖点：
 * 1. 全部对话框 close 处理器（configStore.hideDialog 各键）；
 * 2. insert / apply / change 事件 → EventBus 插入或主题切换；
 * 3. 创建文件/文件夹（文件补 .md、已带扩展名/文件夹不补、invoke 异常弹错误框）；
 * 4. 重命名/删除确认（path 缺失、成功、invoke 异常）；
 * 5. 导入选项 replace / insert / newfile 三条分支（newfile 异常弹错误框）；
 * 6. 插入图片本地浏览：成功回填（imageSrc 缺失回退 filePath）、取消/异常不回填；
 * 7. 标题栏拖拽/双击、8 个窗口缩放边 mousedown；
 * 8. 系统设置广播切换菜单栏形态；卸载时移除 IPC 监听。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

// Monaco 在 jsdom 下不需要真实实例；BaiZeNotes 只用到 defineTheme/setTheme
vi.mock('monaco-editor', () => ({
    editor: { defineTheme: vi.fn(), setTheme: vi.fn() }
}))
// 工作区/菜单/状态栏与本次事件接线无关，stub 掉避免加载整棵组件树
vi.mock('@renderer/components/WorkSpaceArea/WorkSpace.vue', () => ({
    default: { name: 'WorkSpace', template: '<div class="workspace-stub" />' }
}))
vi.mock('@renderer/components/StatusBar.vue', () => ({
    default: { name: 'StatusBar', template: '<div class="status-bar-stub" />' }
}))
vi.mock('@renderer/components/MenuBar.vue', () => ({
    default: { name: 'MenuBar', template: '<div class="menu-bar-stub" />' }
}))

/**
 * 对话框桩：每个导出渲染固定按钮集合，点击即 emit 对应事件（含固定 payload）。
 * 根节点带 data-dialog 名称与 data-picked（InsertImageDialog 的本地图片回填断言用）。
 */
vi.mock('@renderer/components/dialogs', async () => {
    const { defineComponent, h } = await import('vue')
    /** 桩按钮：点击后以固定事件名 + payload 触发父组件监听 */
    type StubEvent = 'close' | 'insert' | 'apply' | 'change' | 'browse-file' | 'create' | 'confirm'
    type StubButton = { cls: string; event: StubEvent; payload?: unknown }
    const makeStub = (name: string, buttons: StubButton[]) =>
        defineComponent({
            name: `Stub${name}`,
            inheritAttrs: false,
            props: {
                visible: { type: Boolean, default: false },
                type: { type: String, default: '' },
                title: { type: String, default: '' },
                message: { type: String, default: '' },
                preset: { type: String, default: '' },
                pickedImage: { type: Object, default: null },
                dirPath: { type: String, default: '' },
                path: { type: String, default: '' },
                isFile: { type: Boolean, default: false },
                version: { type: String, default: '' }
            },
            emits: [
                'close',
                'insert',
                'apply',
                'change',
                'browse-file',
                'browseFile',
                'create',
                'confirm'
            ],
            setup(props, { emit }) {
                // emits 数组形式的联合签名下 payload 类型过窄，统一收窄为通用触发器
                const emitStub = emit as unknown as (event: string, payload?: unknown) => void
                return () =>
                    h(
                        'div',
                        {
                            class: 'dialog-stub',
                            'data-dialog': name,
                            'data-picked': JSON.stringify(props.pickedImage ?? null)
                        },
                        buttons.map((button) =>
                            h(
                                'button',
                                {
                                    class: button.cls,
                                    onClick: () => emitStub(button.event, button.payload)
                                },
                                button.cls
                            )
                        )
                    )
            }
        })

    const closeOnly = (name: string) => makeStub(name, [{ cls: 'stub-close', event: 'close' }])

    return {
        // 模板中 `<BaiZeDialogs.XxxDialog>` 会被编译为 `_unref(BaiZeDialogs.XxxDialog)`，
        // 模块命名空间 mock 需显式声明该探测键，避免 Vite mock Proxy 对未知导出抛错。
        __v_isRef: undefined,
        MessageDialog: makeStub('MessageDialog', [{ cls: 'stub-close', event: 'close' }]),
        ThemeSettingDialog: makeStub('ThemeSettingDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-change', event: 'change', payload: 'baize-dark' }
        ]),
        FontSelectDialog: makeStub('FontSelectDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-apply', event: 'apply', payload: '<b>特殊文字</b>' }
        ]),
        EditorSettingDialog: closeOnly('EditorSettingDialog'),
        SystemSettingDialog: closeOnly('SystemSettingDialog'),
        MermaidEditDialog: makeStub('MermaidEditDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-insert', event: 'insert', payload: '```mermaid\ngraph TD\n```' }
        ]),
        AdmonitionDialog: makeStub('AdmonitionDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-insert', event: 'insert', payload: '!!! note' }
        ]),
        MaterialSyntaxDialog: makeStub('MaterialSyntaxDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-insert', event: 'insert', payload: '=== "Tab"' }
        ]),
        MathTextDialog: makeStub('MathTextDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-insert', event: 'insert', payload: '$$x^2$$' }
        ]),
        InsertImageDialog: makeStub('InsertImageDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-browse', event: 'browse-file', payload: undefined },
            { cls: 'stub-insert', event: 'insert', payload: '![img](./a.png)' }
        ]),
        MdSheetDialog: makeStub('MdSheetDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-insert', event: 'insert', payload: '| a | b |' }
        ]),
        WebUrlDialog: makeStub('WebUrlDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-insert', event: 'insert', payload: '[链接](https://x.com)' }
        ]),
        CreateFileFolderDialog: makeStub('CreateFileFolderDialog', [
            { cls: 'stub-close', event: 'close' },
            {
                cls: 'stub-create-file',
                event: 'create',
                payload: { type: 'file', name: '新笔记', dirPath: 'C:/notes' }
            },
            {
                cls: 'stub-create-dotted',
                event: 'create',
                payload: { type: 'file', name: 'a.txt', dirPath: 'C:/notes' }
            },
            {
                cls: 'stub-create-folder',
                event: 'create',
                payload: { type: 'folder', name: '新目录', dirPath: 'C:/notes' }
            }
        ]),
        RenameFileFolderDialog: makeStub('RenameFileFolderDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-confirm', event: 'confirm', payload: '新名称' }
        ]),
        ConfirmDeleteDialog: makeStub('ConfirmDeleteDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-confirm', event: 'confirm', payload: undefined }
        ]),
        HelpAboutDialog: closeOnly('HelpAboutDialog'),
        HelpContactUsDialog: closeOnly('HelpContactUsDialog'),
        TechStackDialog: closeOnly('TechStackDialog'),
        ShortcutKeysDialog: closeOnly('ShortcutKeysDialog'),
        UpdateLogDialog: closeOnly('UpdateLogDialog'),
        ReleaseNotesDialog: closeOnly('ReleaseNotesDialog'),
        QuickLinkSettingDialog: closeOnly('QuickLinkSettingDialog'),
        ImportOptionDialog: makeStub('ImportOptionDialog', [
            { cls: 'stub-close', event: 'close' },
            { cls: 'stub-import-replace', event: 'confirm', payload: 'replace' },
            { cls: 'stub-import-insert', event: 'confirm', payload: 'insert' },
            { cls: 'stub-import-newfile', event: 'confirm', payload: 'newfile' }
        ])
    }
})

import BaiZeNotes from '@renderer/components/BaiZeNotes.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { getConfigStore } from '@renderer/common/useConfigStore'
import { IPC } from '../../../src/shared/ipc-channels'

const invokeMock = vi.fn()
type InvokeArgs = [channel: string, ...args: unknown[]]
/** 主进程 → 渲染层 IPC 订阅回调（按通道记录，用于模拟系统设置广播） */
const ipcOnHandlers = new Map<string, (...args: unknown[]) => void>()
const ipcRemoveListener = vi.fn()

let wrapper: VueWrapper | null = null

beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(null)
    ipcOnHandlers.clear()
    ipcRemoveListener.mockClear()
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
                ipcOnHandlers.set(channel, cb)
            }),
            removeListener: ipcRemoveListener,
            send: vi.fn(),
            invoke: (...args: InvokeArgs) => invokeMock(...args)
        }
    })
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue(null), write: vi.fn().mockResolvedValue(true) },
        app: { getVersion: vi.fn().mockResolvedValue({}) }
    })
    const store = getConfigStore()
    // 复位所有对话框状态，避免用例间相互污染
    const dialogNames = [
        'message',
        'themeSettings',
        'fontSelect',
        'editorSettings',
        'systemSettings',
        'mermaidEdit',
        'admonition',
        'materialSyntax',
        'mathText',
        'insertImage',
        'mdSheet',
        'insertLink',
        'createFileFolder',
        'renameFileFolder',
        'confirmDelete',
        'helpAbout',
        'helpContact',
        'techStack',
        'shortcutKeys',
        'updateLog',
        'releaseNotes',
        'quickLinks',
        'importOption'
    ] as const
    for (const name of dialogNames) {
        store.hideDialog(name)
    }
    store.clearMessageDialogRetry()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

async function mountShell(): Promise<VueWrapper> {
    wrapper = mount(BaiZeNotes, {
        attachTo: document.body,
        global: { stubs: { teleport: true } }
    })
    await flushPromises()
    return wrapper
}

/** 按 data-dialog 找对话框桩根节点 */
function dialogStub(name: string) {
    return wrapper!.find(`[data-dialog="${name}"]`)
}

/** 点击指定对话框桩的按钮并等待状态落定 */
async function clickDialogButton(dialogName: string, buttonClass: string): Promise<void> {
    await dialogStub(dialogName).find(`.${buttonClass}`).trigger('click')
    await flushPromises()
}

describe('BaiZeNotes 对话框 close 处理器', () => {
    it('全部对话框 close 事件均关闭对应 store 状态', async () => {
        const shell = await mountShell()
        const store = getConfigStore()

        const mapping: Array<[string, keyof typeof store.dialogs]> = [
            ['MessageDialog', 'messageDialog'],
            ['ThemeSettingDialog', 'themeSettings'],
            ['FontSelectDialog', 'fontSelect'],
            ['EditorSettingDialog', 'editorSettings'],
            ['SystemSettingDialog', 'systemSettings'],
            ['MermaidEditDialog', 'mermaidEdit'],
            ['AdmonitionDialog', 'admonition'],
            ['MaterialSyntaxDialog', 'materialSyntax'],
            ['MathTextDialog', 'mathText'],
            ['InsertImageDialog', 'insertImage'],
            ['MdSheetDialog', 'mdSheet'],
            ['WebUrlDialog', 'insertLink'],
            ['CreateFileFolderDialog', 'createFileFolder'],
            ['RenameFileFolderDialog', 'renameFileFolder'],
            ['ConfirmDeleteDialog', 'confirmDelete'],
            ['HelpAboutDialog', 'helpAbout'],
            ['HelpContactUsDialog', 'helpContact'],
            ['TechStackDialog', 'techStack'],
            ['ShortcutKeysDialog', 'shortcutKeys'],
            ['UpdateLogDialog', 'updateLog'],
            ['ReleaseNotesDialog', 'releaseNotes'],
            ['QuickLinkSettingDialog', 'quickLinks'],
            ['ImportOptionDialog', 'importOption']
        ]

        for (const [stubName, storeKey] of mapping) {
            // 先打开再关闭，确保 close 处理器真正被执行且被断言
            store.dialogs[storeKey].visible = true
            await flushPromises()
            await clickDialogButton(stubName, 'stub-close')
            expect(
                store.dialogs[storeKey].visible,
                `${stubName} close 应关闭 ${String(storeKey)}`
            ).toBe(false)
        }
        expect(shell.find('.dialog-stub').exists()).toBe(true)
    })

    it('消息对话框关闭时清空残留的重试动作', async () => {
        await mountShell()
        const store = getConfigStore()
        const retry = vi.fn()
        store.showRetryableError('标题', '消息', retry)
        expect(store.messageDialogRetry.value).not.toBeNull()

        await clickDialogButton('MessageDialog', 'stub-close')

        expect(store.dialogs.messageDialog.visible).toBe(false)
        expect(store.messageDialogRetry.value).toBeNull()
    })
})

describe('BaiZeNotes 对话框 insert/apply/change 事件', () => {
    it('各插入类对话框 insert/apply 事件统一转发到 EventBus 插入', async () => {
        await mountShell()
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await clickDialogButton('FontSelectDialog', 'stub-apply')
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_INSERT_TEXT, '<b>特殊文字</b>')

        await clickDialogButton('MermaidEditDialog', 'stub-insert')
        expect(emitSpy).toHaveBeenCalledWith(
            EVENT_BUS.MONACO_INSERT_TEXT,
            '```mermaid\ngraph TD\n```'
        )

        await clickDialogButton('InsertImageDialog', 'stub-insert')
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_INSERT_TEXT, '![img](./a.png)')

        await clickDialogButton('WebUrlDialog', 'stub-insert')
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_INSERT_TEXT, '[链接](https://x.com)')
    })

    it('主题设置 change 事件转发到 useTheme.changeTheme', async () => {
        await mountShell()
        // changeTheme 内部走配置读/写与主题样式 IPC；仅断言链路可达（invoke 已被 stub）
        await clickDialogButton('ThemeSettingDialog', 'stub-change')
        await flushPromises()
        expect(invokeMock).toHaveBeenCalled()
    })
})

describe('BaiZeNotes 创建文件/文件夹', () => {
    it('按类型与扩展名规则 invoke 创建通道', async () => {
        await mountShell()
        const shell = wrapper!
        const store = getConfigStore()

        // 纯名称新建文件 → 补 .md
        store.showDialog('createFileFolder', { dirPath: 'C:/notes' })
        await flushPromises()
        await clickDialogButton('CreateFileFolderDialog', 'stub-create-file')
        expect(invokeMock).toHaveBeenCalledWith(
            IPC.FILE.CREATE_FILE_FOLDER,
            '新笔记',
            'C:/notes',
            false,
            '.md'
        )

        // 已带扩展名 → 不再追加
        store.showDialog('createFileFolder', { dirPath: 'C:/notes' })
        await flushPromises()
        await clickDialogButton('CreateFileFolderDialog', 'stub-create-dotted')
        expect(invokeMock).toHaveBeenCalledWith(
            IPC.FILE.CREATE_FILE_FOLDER,
            'a.txt',
            'C:/notes',
            false,
            ''
        )

        // 文件夹 → 不加后缀
        store.showDialog('createFileFolder', { dirPath: 'C:/notes' })
        await flushPromises()
        await clickDialogButton('CreateFileFolderDialog', 'stub-create-folder')
        expect(invokeMock).toHaveBeenCalledWith(
            IPC.FILE.CREATE_FILE_FOLDER,
            '新目录',
            'C:/notes',
            true,
            ''
        )
        // 成功后对话框关闭
        expect(store.dialogs.createFileFolder.visible).toBe(false)
        expect(shell.find('[data-dialog="CreateFileFolderDialog"]').exists()).toBe(true)
    })

    it('创建失败时弹全局错误对话框并记录日志', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CREATE_FILE_FOLDER) throw new Error('disk full')
            return null
        })
        const store = getConfigStore()
        await mountShell()
        store.showDialog('createFileFolder', { dirPath: 'C:/notes' })
        await flushPromises()

        await clickDialogButton('CreateFileFolderDialog', 'stub-create-file')

        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.message).toContain('disk full')
        expect(errorSpy).toHaveBeenCalled()
    })
})

describe('BaiZeNotes 重命名/删除确认', () => {
    it('重命名路径缺失时只关闭对话框不 invoke', async () => {
        await mountShell()
        const store = getConfigStore()
        store.showDialog('renameFileFolder', { path: '', isFile: true })
        await flushPromises()
        invokeMock.mockClear()

        await clickDialogButton('RenameFileFolderDialog', 'stub-confirm')

        expect(invokeMock).not.toHaveBeenCalledWith(IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT, ...[])
        expect(store.dialogs.renameFileFolder.visible).toBe(false)
    })

    it('重命名成功关闭；invoke 异常弹错误对话框', async () => {
        await mountShell()
        const store = getConfigStore()
        invokeMock.mockResolvedValueOnce({ ok: true })
        store.showDialog('renameFileFolder', { path: 'C:/notes/a.md', isFile: true })
        await flushPromises()

        await clickDialogButton('RenameFileFolderDialog', 'stub-confirm')

        expect(invokeMock).toHaveBeenCalledWith(
            IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT,
            'C:/notes/a.md',
            true,
            '新名称'
        )
        expect(store.dialogs.renameFileFolder.visible).toBe(false)

        // invoke 异常：弹错误对话框
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invokeMock.mockRejectedValueOnce(new Error('rename ipc down'))
        store.showDialog('renameFileFolder', { path: 'C:/notes/b.md', isFile: false })
        await flushPromises()
        await clickDialogButton('RenameFileFolderDialog', 'stub-confirm')

        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.message).toContain('rename ipc down')
        expect(errorSpy).toHaveBeenCalled()
    })

    it('删除路径缺失时只关闭不 invoke；invoke 异常弹错误对话框', async () => {
        await mountShell()
        const store = getConfigStore()
        store.showDialog('confirmDelete', { path: '', isFile: true })
        await flushPromises()
        invokeMock.mockClear()
        await clickDialogButton('ConfirmDeleteDialog', 'stub-confirm')
        expect(store.dialogs.confirmDelete.visible).toBe(false)
        expect(invokeMock).not.toHaveBeenCalledWith(IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM, ...[])

        // 删除失败
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invokeMock.mockRejectedValueOnce(new Error('delete ipc down'))
        store.showDialog('confirmDelete', { path: 'C:/notes/c.md', isFile: false })
        await flushPromises()
        await clickDialogButton('ConfirmDeleteDialog', 'stub-confirm')

        expect(invokeMock).toHaveBeenCalledWith(
            IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM,
            'C:/notes/c.md',
            false
        )
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(errorSpy).toHaveBeenCalled()
    })
})

describe('BaiZeNotes 导入选项', () => {
    it('replace / insert 分别广播替换与插入事件', async () => {
        await mountShell()
        const store = getConfigStore()
        const emitSpy = vi.spyOn(EventBus, '$emit')

        store.showDialog('importOption')
        store.dialogs.importOption.content = '导入正文'
        await flushPromises()

        await clickDialogButton('ImportOptionDialog', 'stub-import-replace')
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_REPLACE_TEXT, '导入正文')
        expect(store.dialogs.importOption.visible).toBe(false)

        store.showDialog('importOption')
        store.dialogs.importOption.content = '导入正文2'
        await flushPromises()
        await clickDialogButton('ImportOptionDialog', 'stub-import-insert')
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_INSERT_TEXT, '导入正文2')
    })

    it('newfile 失败时弹错误对话框', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.IMPORT_NEW_FILE) throw new Error('import boom')
            return null
        })
        const store = getConfigStore()
        await mountShell()
        store.showDialog('importOption')
        store.dialogs.importOption.content = '导入正文'
        await flushPromises()

        await clickDialogButton('ImportOptionDialog', 'stub-import-newfile')

        expect(invokeMock).toHaveBeenCalledWith(IPC.FILE.IMPORT_NEW_FILE, '导入正文')
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.message).toContain('import boom')
        expect(errorSpy).toHaveBeenCalled()
    })
})

describe('BaiZeNotes 插入图片本地浏览', () => {
    it('选中后回填路径；imageSrc 缺失时回退 filePath', async () => {
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.SELECT_IMAGE) {
                return { canceled: false, filePath: 'C:/pics/a.png', imageSrc: '' }
            }
            return null
        })
        await mountShell()

        await clickDialogButton('InsertImageDialog', 'stub-browse')
        await flushPromises()

        const picked = JSON.parse(
            dialogStub('InsertImageDialog').attributes('data-picked') ?? 'null'
        ) as { filePath: string; imageSrc: string } | null
        expect(picked).toEqual({ filePath: 'C:/pics/a.png', imageSrc: 'C:/pics/a.png' })
    })

    it('选中后回填 imageSrc（复制到文档 images/ 的相对引用）', async () => {
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.SELECT_IMAGE) {
                return { canceled: false, filePath: 'C:/pics/b.png', imageSrc: './images/b-x1.png' }
            }
            return null
        })
        await mountShell()

        await clickDialogButton('InsertImageDialog', 'stub-browse')
        await flushPromises()

        const picked = JSON.parse(
            dialogStub('InsertImageDialog').attributes('data-picked') ?? 'null'
        ) as { filePath: string; imageSrc: string } | null
        expect(picked).toEqual({
            filePath: 'C:/pics/b.png',
            imageSrc: './images/b-x1.png'
        })
    })

    it('取消选择/异常时不回填，仅异常记录日志', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.SELECT_IMAGE) {
                return { canceled: true, filePath: null, imageSrc: null }
            }
            return null
        })
        await mountShell()
        await clickDialogButton('InsertImageDialog', 'stub-browse')
        expect(dialogStub('InsertImageDialog').attributes('data-picked')).toBe('null')
        expect(errorSpy).not.toHaveBeenCalled()

        // invoke 异常：记录日志且不回填
        invokeMock.mockRejectedValueOnce(new Error('picker crashed'))
        await clickDialogButton('InsertImageDialog', 'stub-browse')
        expect(dialogStub('InsertImageDialog').attributes('data-picked')).toBe('null')
        expect(errorSpy).toHaveBeenCalled()
    })
})

describe('BaiZeNotes 标题栏与窗口缩放', () => {
    it('标题栏拖拽/双击触发窗口管理，缩放边 mousedown 进入缩放流程', async () => {
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.WINDOW.GET_BOUNDS) {
                return { x: 0, y: 0, width: 1200, height: 800 }
            }
            if (channel === IPC.WINDOW.IS_MAXIMIZED) return false
            return null
        })
        await mountShell()
        const shell = wrapper!

        await shell.find('#title-bar').trigger('mousedown', { button: 0, screenX: 10, screenY: 10 })
        await flushPromises()
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        await flushPromises()

        await shell.find('#title-bar').trigger('dblclick')
        await flushPromises()

        // 8 个方向的缩放边/角依次 mousedown → mouseup
        const edges = shell.findAll('.resize-edge, .resize-corner')
        expect(edges).toHaveLength(8)
        for (const edge of edges) {
            await edge.trigger('mousedown', { button: 0, screenX: 20, screenY: 20 })
        }
        await flushPromises()
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        await flushPromises()

        expect(invokeMock).toHaveBeenCalledWith(IPC.WINDOW.GET_BOUNDS)
    })
})

describe('BaiZeNotes 系统设置广播与卸载清理', () => {
    it('系统设置广播按 menuBarStyle 切换标题栏/菜单栏显隐', async () => {
        await mountShell()
        const handler = ipcOnHandlers.get(IPC.SETTING.SYSTEM_SETTING_UPDATE)
        expect(handler).toBeDefined()

        handler!({}, { menuBarStyle: 'custom' })
        await flushPromises()
        expect(wrapper!.find('#title-bar').attributes('style')).toContain('display: none')

        handler!({}, { menuBarStyle: 'electron' })
        await flushPromises()
        expect(wrapper!.find('#title-bar').attributes('style') ?? '').not.toContain('display: none')

        handler!({}, { menuBarStyle: 'default' })
        await flushPromises()
        expect(wrapper!.find('#title-bar').attributes('style') ?? '').not.toContain('display: none')
    })

    it('卸载时移除 IPC 监听并发出主界面挂载事件', async () => {
        await mountShell()
        expect(wrapper!.emitted('main-view-mounted')).toHaveLength(1)

        wrapper!.unmount()
        wrapper = null

        const removedChannels = ipcRemoveListener.mock.calls.map(([channel]) => channel)
        expect(removedChannels).toContain(IPC.SETTING.SYSTEM_SETTING_UPDATE)
        expect(removedChannels).toContain(IPC.DIALOG.OPEN_VUE_DIALOG)
    })
})
