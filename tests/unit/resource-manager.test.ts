import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// mock 第三方右键菜单组件，捕获传入的菜单配置
const { showContextMenuMock } = vi.hoisted(() => ({
    showContextMenuMock: vi.fn()
}))

vi.mock('@imengyu/vue3-context-menu', () => ({
    default: { showContextMenu: showContextMenuMock }
}))

import {
    FileMgrSvgs,
    getFileMgrSvg,
    handleContextMenu,
    resetExportTrackingForTesting,
    ComputeTocSignature,
    MergeExpandedState,
    type FileSysItem
} from '../../src/renderer/src/components/ResourceManager/resource-manager'
import type { MarkdownTOC } from '../../src/shared/types'
import { IPC } from '../../src/shared/ipc-channels'

const ipcSend = vi.fn()
const ipcOn = vi.fn()
const ipcRemoveListener = vi.fn()
const clipboardWriteText = vi.fn()

/** 模拟主进程下发「活动文件已切换」事件（FE-12） */
function emitActiveFile(filePath: string) {
    const handlers = ipcOn.mock.calls
        .filter(([channel]) => channel === IPC.FILE.USER_SELECT_FILE)
        .map(([, callback]) => callback as (event: unknown, path: string) => void)
    for (const handler of handlers) {
        handler({}, filePath)
    }
}

beforeEach(() => {
    showContextMenuMock.mockReset()
    ipcSend.mockReset()
    ipcOn.mockReset()
    ipcRemoveListener.mockReset()
    clipboardWriteText.mockReset()
    resetExportTrackingForTesting()
    vi.stubGlobal('window', {
        electron: { ipcRenderer: { send: ipcSend, on: ipcOn, removeListener: ipcRemoveListener } }
    })
    vi.stubGlobal('navigator', {
        clipboard: { writeText: clipboardWriteText }
    })
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('FileMgrSvgs', () => {
    it('should declare the expected icon keys', () => {
        expect(Object.keys(FileMgrSvgs)).toEqual([
            '.md',
            '.png',
            '.jpg',
            'default',
            'folder-open',
            'folder-close',
            'folder-collapse-open',
            'folder-collapse-close'
        ])
    })

    it('should keep className/style/viewBox/path complete for every icon', () => {
        for (const icon of Object.values(FileMgrSvgs)) {
            expect(icon.className.length).toBeGreaterThan(0)
            expect(icon.style.length).toBeGreaterThan(0)
            expect(icon.viewBox).toMatch(/^0 0 \d+ \d+$/)
            expect(icon.path.length).toBeGreaterThan(0)
        }
    })

    it('should keep the default icon distinct from file icons', () => {
        expect(FileMgrSvgs['default'].style).toBe('fill: #9e9e9e;')
        expect(FileMgrSvgs['default'].className).toBe('file-icon')
    })
})

describe('getFileMgrSvg', () => {
    it('should return folder-open icon for an expanded folder', () => {
        expect(getFileMgrSvg(true, 'folder')).toBe(FileMgrSvgs['folder-open'])
    })

    it('should return folder-close icon for a collapsed folder', () => {
        expect(getFileMgrSvg(false, 'folder')).toBe(FileMgrSvgs['folder-close'])
    })

    it('should return collapse-open icon for an expanded collapse marker', () => {
        expect(getFileMgrSvg(true, 'collapse')).toBe(FileMgrSvgs['folder-collapse-open'])
    })

    it('should return collapse-close icon for a collapsed collapse marker', () => {
        expect(getFileMgrSvg(false, 'collapse')).toBe(FileMgrSvgs['folder-collapse-close'])
    })

    it('should return the markdown icon for .md files', () => {
        expect(getFileMgrSvg(false, '.md')).toBe(FileMgrSvgs['.md'])
        expect(FileMgrSvgs['.md'].style).toBe('fill: #ff9100;')
    })

    it('should be case-insensitive for file extensions', () => {
        expect(getFileMgrSvg(false, '.PNG')).toBe(FileMgrSvgs['.png'])
        expect(getFileMgrSvg(false, '.JpG')).toBe(FileMgrSvgs['.jpg'])
    })

    it('should fall back to the default icon for unknown extensions', () => {
        expect(getFileMgrSvg(false, '.xyz')).toBe(FileMgrSvgs['default'])
        expect(getFileMgrSvg(false, '')).toBe(FileMgrSvgs['default'])
    })
})

describe('PF-8 TOC 指纹去重', () => {
    const buildToc = (): MarkdownTOC[] => [
        { id: 'toc-1-0', level: 'h1', text: '标题一', lineNumber: 0 },
        { id: 'toc-2-3', level: 'h2', text: '标题二', lineNumber: 3 }
    ]

    it('should produce identical signatures for the same TOC content', () => {
        expect(ComputeTocSignature(buildToc())).toBe(ComputeTocSignature(buildToc()))
    })

    it('should change the signature when any heading text/level/id changes', () => {
        const base = ComputeTocSignature(buildToc())

        const changedText = buildToc()
        changedText[1].text = '标题二（改名）'
        expect(ComputeTocSignature(changedText)).not.toBe(base)

        const changedLevel = buildToc()
        changedLevel[1].level = 'h3'
        expect(ComputeTocSignature(changedLevel)).not.toBe(base)

        // 标题平移（行号变化 → id 变化）
        const shifted = buildToc()
        shifted[1].id = 'toc-2-4'
        shifted[1].lineNumber = 4
        expect(ComputeTocSignature(shifted)).not.toBe(base)

        // 标题数量变化
        expect(
            ComputeTocSignature([
                ...buildToc(),
                { id: 'toc-3-5', level: 'h2', text: '新增', lineNumber: 5 }
            ])
        ).not.toBe(base)
    })

    it('should tolerate empty/invalid input', () => {
        expect(typeof ComputeTocSignature([])).toBe('number')
        expect(typeof ComputeTocSignature(null)).toBe('number')
        expect(ComputeTocSignature([])).toBe(ComputeTocSignature([]))
    })
})

describe('PF-4/PF-8 文件树展开态合并', () => {
    function makeTree(expandedPaths: string[]): FileSysItem[] {
        const root: FileSysItem = {
            id: 'C:\\ws',
            name: 'workspace',
            path: 'C:\\ws',
            type: 'folder',
            fileExtension: '',
            children: [
                {
                    id: 'C:\\ws\\docs',
                    name: 'docs',
                    path: 'C:\\ws\\docs',
                    type: 'folder',
                    fileExtension: '',
                    children: [
                        {
                            id: 'C:\\ws\\docs\\deep',
                            name: 'deep',
                            path: 'C:\\ws\\docs\\deep',
                            type: 'folder',
                            fileExtension: '',
                            children: []
                        }
                    ]
                },
                {
                    id: 'C:\\ws\\note.md',
                    name: 'note.md',
                    path: 'C:\\ws\\note.md',
                    type: 'file',
                    fileExtension: '.md'
                }
            ]
        }
        for (const expandedPath of expandedPaths) {
            applyExpanded(root, expandedPath)
        }
        return [root]
    }

    function applyExpanded(node: FileSysItem, targetPath: string): boolean {
        if (node.path === targetPath) {
            node.isExpanded = true
            return true
        }
        for (const child of node.children ?? []) {
            if (applyExpanded(child, targetPath)) {
                return true
            }
        }
        return false
    }

    it('should restore expanded state by stable path on tree refresh', () => {
        const previous = makeTree(['C:\\ws\\docs', 'C:\\ws\\docs\\deep'])
        // 主进程刷新下发的新树：所有节点 isExpanded 为空
        const next = makeTree([])

        const restored = MergeExpandedState(previous, next)

        expect(restored).toBe(2)
        expect(next[0].children![0].isExpanded).toBe(true)
        expect(next[0].children![0].children![0].isExpanded).toBe(true)
    })

    it('should keep collapsed nodes collapsed and ignore vanished paths', () => {
        const previous = makeTree(['C:\\ws\\docs'])
        const next = makeTree([])
        // 新树中 docs 已被删除，换成一个新目录
        next[0].children = [
            {
                id: 'C:\\ws\\other',
                name: 'other',
                path: 'C:\\ws\\other',
                type: 'folder',
                fileExtension: ''
            }
        ]

        const restored = MergeExpandedState(previous, next)

        expect(restored).toBe(0)
        expect(next[0].children![0].isExpanded).toBeFalsy()
    })

    it('should tolerate empty previous tree', () => {
        expect(MergeExpandedState(null, makeTree([]))).toBe(0)
        expect(MergeExpandedState([], makeTree([]))).toBe(0)
    })
})

describe('handleContextMenu', () => {
    // 构造一个基础的右键菜单调用并返回最近一次传入的菜单配置
    function buildMenu(node: FileSysItem) {
        handleContextMenu({ x: 10, y: 20 } as MouseEvent, node)
        expect(showContextMenuMock).toHaveBeenCalled()
        return showContextMenuMock.mock.lastCall![0] as {
            x: number
            y: number
            zIndex: number
            items: Array<{
                label: string
                disabled?: boolean
                divided?: boolean
                onClick?: () => void
                children?: Array<{
                    label: string
                    disabled?: boolean
                    divided?: boolean
                    onClick?: () => void
                }>
            }>
        }
    }

    const fileNode: FileSysItem = {
        id: 'C:\\docs\\note.md',
        name: 'note.md',
        path: 'C:\\docs\\note.md',
        type: 'file',
        fileExtension: '.md'
    }

    it('should pass coordinates and zIndex to the context menu service', () => {
        const menu = buildMenu(fileNode)
        expect(menu.x).toBe(10)
        expect(menu.y).toBe(20)
        expect(menu.zIndex).toBe(3)
    })

    it('should build the expected top-level menu labels', () => {
        const menu = buildMenu(fileNode)
        expect(menu.items.map((item) => item.label)).toEqual([
            '新建',
            '复制',
            '剪切',
            '粘贴',
            '删除',
            // FUN-24：原"查找"（空实现）改为"在文件夹中显示"
            '在文件夹中显示',
            '导出到文件',
            '重命名',
            '在资源管理器打开',
            '从磁盘重新加载'
        ])
    })

    it('should create a markdown file in the parent directory for file nodes', () => {
        const menu = buildMenu(fileNode)
        const create = menu.items.find((item) => item.label === '新建')!
        const mdItem = create.children!.find((child) => child.label === 'Markdown文件')!
        mdItem.onClick!()
        // 文件节点：取父目录 C:\docs，isFolder=false，扩展名 .md
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:create-file', 'C:\\docs', false, '.md')
    })

    it('should create a folder directly under the target folder node', () => {
        const folderNode: FileSysItem = {
            id: 'C:\\docs\\sub',
            name: 'sub',
            path: 'C:\\docs\\sub',
            type: 'folder',
            fileExtension: ''
        }
        const menu = buildMenu(folderNode)
        const create = menu.items.find((item) => item.label === '新建')!
        const folderItem = create.children!.find((child) => child.label === '文件夹')!
        folderItem.onClick!()
        // 文件夹节点：直接使用节点路径
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:create-file', 'C:\\docs\\sub', true, '')
    })

    it('should import from word via the create submenu', () => {
        const menu = buildMenu(fileNode)
        const create = menu.items.find((item) => item.label === '新建')!
        const importWord = create.children!.find((child) => child.label === '从Word文档导入')!
        importWord.onClick!()
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:import-from', 'word')
    })

    it('should copy file/folder through IPC with a file flag', () => {
        const menu = buildMenu(fileNode)
        const copy = menu.items.find((item) => item.label === '复制')!
        const copyFile = copy.children!.find((child) => child.label === '文件/文件夹')!
        copyFile.onClick!()
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:copy-file', 'C:\\docs\\note.md', true)
    })

    it('should copy the file name via the clipboard', async () => {
        const menu = buildMenu(fileNode)
        const copy = menu.items.find((item) => item.label === '复制')!
        const copyName = copy.children!.find((child) => child.label === '文件/文件夹名称')!
        await copyName.onClick!()
        expect(clipboardWriteText).toHaveBeenCalledWith('note.md')
    })

    it('should disable image/file link copy for folder nodes', () => {
        const folderNode: FileSysItem = {
            id: 'C:\\docs\\sub',
            name: 'sub',
            path: 'C:\\docs\\sub',
            type: 'folder',
            fileExtension: ''
        }
        const menu = buildMenu(folderNode)
        const copy = menu.items.find((item) => item.label === '复制')!
        expect(copy.children!.find((child) => child.label === '复制为本地图片链接')?.disabled).toBe(
            true
        )
        expect(copy.children!.find((child) => child.label === '复制为本地文件链接')?.disabled).toBe(
            true
        )
        // 文件节点则不禁用
        const fileMenu = buildMenu(fileNode)
        const copyFile = fileMenu.items.find((item) => item.label === '复制')!
        expect(
            copyFile.children!.find((child) => child.label === '复制为本地图片链接')?.disabled
        ).toBe(false)
    })

    it('should cut/paste/delete with the correct node flags', () => {
        const menu = buildMenu(fileNode)
        menu.items.find((item) => item.label === '剪切')!.onClick!()
        menu.items.find((item) => item.label === '粘贴')!.onClick!()
        menu.items.find((item) => item.label === '删除')!.onClick!()
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:cut', 'C:\\docs\\note.md', true)
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:paste', 'C:\\docs\\note.md', true)
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:delete', 'C:\\docs\\note.md', true)
    })

    // FE-12：右键导出必须以右键节点为数据源——若节点不是当前活动文件，
    // 先经 OPEN_SELECT_FILE 打开它，等 USER_SELECT_FILE 确认切换后才触发导出动作
    it('should open the right-clicked node before exporting and use its content (FE-12)', async () => {
        const menu = buildMenu(fileNode)
        const exportMenu = menu.items.find((item) => item.label === '导出到文件')!
        const exportWord = exportMenu.children!.find((child) => child.label === '导出为Word')!
        exportWord.onClick!()

        // 第一步：打开右键节点文件（带节点路径），而不是直接导出当前编辑器文件
        expect(ipcSend).toHaveBeenCalledWith(IPC.FILE.OPEN_SELECT_FILE, {
            name: 'note.md',
            path: 'C:\\docs\\note.md',
            type: 'file',
            content: ''
        })
        expect(ipcSend).not.toHaveBeenCalledWith(IPC.MENU.ACTION, 'baize:menu:file:export:word')

        // 主进程确认活动文件切换后，第二步才触发导出
        emitActiveFile('C:\\docs\\note.md')
        await vi.waitFor(() => {
            expect(ipcSend).toHaveBeenCalledWith(IPC.MENU.ACTION, 'baize:menu:file:export:word')
        })
    })

    // FE-12：右键节点已经是当前活动文件时直接导出（不重复打开、不重置编辑器）
    it('should export directly when the right-clicked node is already the active file (FE-12)', async () => {
        buildMenu(fileNode)
        emitActiveFile('C:\\docs\\note.md')
        ipcSend.mockClear()

        const menu = buildMenu(fileNode)
        const exportMenu = menu.items.find((item) => item.label === '导出到文件')!
        const exportWord = exportMenu.children!.find((child) => child.label === '导出为Word')!
        exportWord.onClick!()

        expect(ipcSend).toHaveBeenCalledWith(IPC.MENU.ACTION, 'baize:menu:file:export:word')
        expect(ipcSend).not.toHaveBeenCalledWith(IPC.FILE.OPEN_SELECT_FILE, expect.anything())
    })

    // FE-12：节点打不开时取消导出（宁可无动作，也不导出错误的当前文件内容）
    it('should cancel the export when the right-clicked node cannot be opened (FE-12)', async () => {
        const missingNode: FileSysItem = {
            id: 'C:\\docs\\missing.md',
            name: 'missing.md',
            path: 'C:\\docs\\missing.md',
            type: 'file',
            fileExtension: '.md'
        }
        const menu = buildMenu(missingNode)
        const exportMenu = menu.items.find((item) => item.label === '导出到文件')!
        const exportWord = exportMenu.children!.find((child) => child.label === '导出为Word')!
        exportWord.onClick!()

        // 已发出打开请求，但在主进程确认切换前（也未超时）不得触发导出
        expect(ipcSend).toHaveBeenCalledWith(
            IPC.FILE.OPEN_SELECT_FILE,
            expect.objectContaining({ path: 'C:\\docs\\missing.md' })
        )
        expect(ipcSend).not.toHaveBeenCalledWith(IPC.MENU.ACTION, expect.anything())
    })

    it('should disable export for folder nodes', () => {
        const folderNode: FileSysItem = {
            id: 'C:\\docs\\sub',
            name: 'sub',
            path: 'C:\\docs\\sub',
            type: 'folder',
            fileExtension: ''
        }
        const menu = buildMenu(folderNode)
        expect(menu.items.find((item) => item.label === '导出到文件')?.disabled).toBe(true)
    })

    it('should reveal the node in its folder through IPC (FUN-24)', () => {
        const menu = buildMenu(fileNode)
        menu.items.find((item) => item.label === '在文件夹中显示')!.onClick!()
        // 发送节点路径，主进程 shell.showItemInFolder 定位
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:find-in', 'C:\\docs\\note.md')
    })

    it('should rename and open in explorer through IPC', () => {
        const menu = buildMenu(fileNode)
        menu.items.find((item) => item.label === '重命名')!.onClick!()
        menu.items.find((item) => item.label === '在资源管理器打开')!.onClick!()
        menu.items.find((item) => item.label === '从磁盘重新加载')!.onClick!()
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:rename', 'C:\\docs\\note.md', true)
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:open-in-explorer', 'C:\\docs\\note.md')
        expect(ipcSend).toHaveBeenCalledWith('baize:fs:reload-from-disk', '')
    })
})
