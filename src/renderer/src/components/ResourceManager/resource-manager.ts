import { markRaw } from 'vue'
import ContextMenu from '@imengyu/vue3-context-menu'
import { IPC } from '../../../../shared/ipc-channels'
import type { FileItem, MarkdownTOC } from '../../../../shared/types'
import { t } from '../../common/i18n'
import { getConfigStore } from '../../common/useConfigStore'
import { logger } from '../../common/logger'
import { FNV_OFFSET_BASIS, fnv1a32Mix } from '../../../../shared/utils/hash'
import {
    MARKDOWN_EXTENSIONS,
    TREE_IMAGE_EXTENSIONS
} from '../../../../shared/constants/file-extensions'

/**
 * 渲染层文件树节点（UI 类型）。
 *
 * 第 2 批契约重构（文件树传输契约）：从 shared 传输类型 `FileItem`（主进程
 * directory-tree 实际下发的节点形状，IPC.FILE_MANAGER.FILE_SYSTEM_DATA 的 JSON）
 * **显式派生**，只额外增加渲染层自己的 UI 扩展字段：
 * - `isExpanded`：目录展开态（主进程不下发；整树刷新时由 MergeExpandedState 按路径恢复）；
 * - `isIndented`：缩进标记（历史字段，FileTreeNode 目前用 isIndented prop 传递，保留兼容）。
 *
 * 映射关系：wire `FileItem` → UI `FileSysItem`（字段同名同义：id/name/path/type/
 * fileExtension/isDirectory/children）；其中 id 用于 v-for key 与 ref（主进程按路径
 * 派生稳定 id），path 用于展开态恢复与节点定位。
 *
 * `children` / `isDirectory` 在本 UI 类型中保持可选：渲染层只消费 JSON 解析结果，
 * 且单测可构造「只有叶子必要字段」的节点；传输契约本身（FileItem）两者均为必填。
 */
export interface FileSysItem extends Omit<FileItem, 'children' | 'isDirectory'> {
    isDirectory?: boolean
    children?: FileSysItem[]
    isExpanded?: boolean
    isIndented?: boolean
}

/* ==================== PF-8：TOC 指纹去重 + 文件树展开态合并 ==================== */

/**
 * PF-8：计算目录（TOC）内容指纹。
 *
 * 背景：markdown 预览每轮渲染都会（经 MONACO_CHAPTERS）广播一次完整大纲数组，
 * ResourceManager 侧无条件 `tocArray.value = toc` → 隐藏的 TOC 面板也会做整表 v-for diff
 * （1708 标题样本每轮全量替换）。这里用「标题数 + 每项 id/level/text」的 FNV 指纹判断内容是否变化，
 * 相同则跳过整表替换；指纹相同的判定只与真正影响渲染的字段有关（lineNumber 参与 id 派生，
 * 标题平移/改名都会改变 id → 指纹变化，不会漏更新）。
 *
 * 迁移（渲染层公共接口归位）：FNV-1a 核心改为复用 `src/shared/utils/hash.ts` 的
 * `FNV_OFFSET_BASIS` / `fnv1a32Mix`（与原本地常量、逐字符 mix 实现逐字一致；
 * 最终 `>>> 0` 无符号化保持不变）。
 */
export function ComputeTocSignature(toc: ReadonlyArray<MarkdownTOC> | null | undefined): number {
    if (!Array.isArray(toc)) {
        return FNV_OFFSET_BASIS
    }
    let hash = FNV_OFFSET_BASIS
    const mixString = (value: string): void => {
        hash = fnv1a32Mix(hash, value)
    }
    mixString(String(toc.length))
    for (const item of toc) {
        mixString('\u0000')
        mixString(item.id ?? '')
        mixString('\u0001')
        mixString(item.level ?? '')
        mixString('\u0002')
        mixString(item.text ?? '')
    }
    return hash >>> 0
}

/**
 * PF-4/PF-8：文件树整树刷新时按路径合并「展开态」。
 *
 * 主进程每次刷新都会下发全新的树对象（节点 isExpanded 均为 undefined），
 * 直接替换会让所有已展开目录折叠。这里把上一棵树中 isExpanded 为 true 的目录路径
 * 迁移到新树对应节点，目录刷新后用户展开状态保持不变（路径稳定，DOM key 复用）。
 *
 * @param previousTree 刷新前的树（渲染层当前展示）
 * @param nextTree 刷新后的新树（就地写入 isExpanded）
 * @returns 被恢复展开态的目录数量（诊断/测试用）
 */
export function MergeExpandedState(
    previousTree: FileSysItem[] | null,
    nextTree: FileSysItem[]
): number {
    if (!Array.isArray(previousTree) || !Array.isArray(nextTree) || previousTree.length === 0) {
        return 0
    }
    const expandedPaths = new Set<string>()
    const collectStack: FileSysItem[] = [...previousTree]
    while (collectStack.length > 0) {
        const node = collectStack.pop() as FileSysItem
        if (node.isExpanded && node.type === 'folder') {
            expandedPaths.add(node.path)
        }
        for (const child of node.children ?? []) {
            collectStack.push(child)
        }
    }
    if (expandedPaths.size === 0) {
        return 0
    }
    let restored = 0
    const applyStack: FileSysItem[] = [...nextTree]
    while (applyStack.length > 0) {
        const node = applyStack.pop() as FileSysItem
        if (node.type === 'folder' && node.isExpanded !== true && expandedPaths.has(node.path)) {
            node.isExpanded = true
            restored += 1
        }
        for (const child of node.children ?? []) {
            applyStack.push(child)
        }
    }
    return restored
}

type MappingTable = {
    [key: string]: {
        className: string
        style: string
        viewBox: string
        path: string
    } // 键是字符串，值是数字
}

/**
 * 文件图标映射使用的扩展名（键名真源：`shared/constants/file-extensions`）。
 *
 * 迁移（渲染层公共接口归位）：图标映射结构（className/style/viewBox/path）仍保留在本文件，
 * 仅扩展名键名改为引用共享清单——`.md` 取 `MARKDOWN_EXTENSIONS` 首项，
 * `.png` / `.jpg` 取 `TREE_IMAGE_EXTENSIONS` 前两项（与迁移前字面量一致）。
 */
const ICON_EXTENSION_MARKDOWN = MARKDOWN_EXTENSIONS[0]
const ICON_EXTENSION_PNG = TREE_IMAGE_EXTENSIONS[0]
const ICON_EXTENSION_JPG = TREE_IMAGE_EXTENSIONS[1]

export const FileMgrSvgs: MappingTable = markRaw({
    [ICON_EXTENSION_MARKDOWN]: {
        className: 'file-icon',
        style: 'fill: #ff9100;',
        viewBox: '0 0 16 10',
        path: 'M14.85 3c.63 0 1.15.52 1.14 1.15v7.7c0 .63-.51 1.15-1.15 1.15H1.15C.52 13 0 12.48 0 11.84V4.15C0 3.52.52 3 1.15 3ZM9 11V5H7L5.5 7 4 5H2v6h2V8l1.5 1.92L7 8v3Zm2.99.5L14.5 8H13V5h-2v3H9.5Z'
    },
    [ICON_EXTENSION_PNG]: {
        className: 'file-icon',
        style: 'fill: #ff00ff;',
        viewBox: '0 0 24 24',
        path: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 11.5c0 .8-.7 1.5-1.5 1.5h-1v2H5V9h2.5c.8 0 1.5.7 1.5 1.5v1m5 3.5h-1.5l-1-2.5V15H10V9h1.5l1 2.5V9H14v6m5-4.5h-2.5v3h1V12H19v1.7c0 .7-.5 1.3-1.3 1.3h-1.3c-.8 0-1.3-.7-1.3-1.3v-3.3c-.1-.7.4-1.4 1.2-1.4h1.3c.8 0 1.3.7 1.3 1.3v.2h.1m-12.5 0h1v1h-1v-1Z'
    },
    [ICON_EXTENSION_JPG]: {
        className: 'file-icon',
        style: 'fill: #a846b9;',
        viewBox: '0 0 24 24',
        path: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 13.5c0 1.1-.9 1.5-2 1.5s-2-.4-2-1.5V12h1.5v1.5h1V9H9v4.5m5-2c0 .8-.7 1.5-1.5 1.5h-1v2H10V9h2.5c.8 0 1.5.7 1.5 1.5v1m5-1h-2.5v3h1V12H19v1.7c0 .7-.5 1.3-1.3 1.3h-1.3c-.8 0-1.3-.7-1.3-1.3v-3.3c-.1-.7.4-1.4 1.2-1.4h1.3c.8 0 1.3.7 1.3 1.3v.2m-7.4 0h1v1h-1v-1Z'
    },
    default: {
        className: 'file-icon',
        style: 'fill: #9e9e9e;',
        viewBox: '0 0 24 24',
        path: 'M13 9V3.5L18.5 9M6 2c-1.11 0-2 .89-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Z'
    },
    'folder-open': {
        className: 'folder-icon',
        style: 'fill: #f0dc4e;',
        viewBox: '0 0 24 24',
        path: 'M19 20H4a2 2 0 0 1-2-2V6c0-1.11.89-2 2-2h6l2 2h7a2 2 0 0 1 2 2H4v10l2.14-8h17.07l-2.28 8.5c-.23.87-1.01 1.5-1.93 1.5Z'
    },
    'folder-close': {
        className: 'folder-icon',
        style: 'fill: #dcb67a;',
        viewBox: '0 0 24 24',
        path: 'M10 4H4c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z'
    },
    'folder-collapse-open': {
        className: 'folder-collapse',
        style: 'fill: #3f6ec6;',
        viewBox: '0 0 24 24',
        path: 'm7 10 5 5 5-5H7Z'
    },
    'folder-collapse-close': {
        className: 'folder-collapse',
        style: 'fill: #0184bb;',
        viewBox: '0 0 24 24',
        path: 'm10 17 5-5-5-5v10Z'
    }
})

export function getFileMgrSvg(isExpanded: boolean, extension: string) {
    if (extension == 'folder') {
        return isExpanded ? FileMgrSvgs['folder-open'] : FileMgrSvgs['folder-close']
    } else if (extension == 'collapse') {
        return isExpanded
            ? FileMgrSvgs['folder-collapse-open']
            : FileMgrSvgs['folder-collapse-close']
    } else {
        return FileMgrSvgs[extension.toLowerCase()] || FileMgrSvgs['default']
    }
}

export function handleContextMenu(e: MouseEvent, node: FileSysItem) {
    // FE-12：右键时补注册活动文件跟踪（模块加载期窗口不可用的兜底）
    ensureActiveFileTracker()
    ContextMenu.showContextMenu({
        x: e.x,
        y: e.y,
        zIndex: 3,
        items: [
            {
                label: t('workspace.resourceContext.new'),
                children: [
                    {
                        label: t('common.file'),
                        onClick: () => {
                            onHandleCreateFolder(node, false, '')
                        }
                    },
                    {
                        label: t('common.folder'),
                        divided: true,
                        onClick: () => {
                            onHandleCreateFolder(node, true, '')
                        }
                    },
                    {
                        label: t('workspace.resourceContext.markdownFile'),
                        onClick: () => {
                            onHandleCreateFolder(node, false, '.md')
                        }
                    },
                    {
                        label: t('workspace.resourceContext.importWord'),
                        onClick: () => {
                            onHandleImport('word')
                        }
                    },
                    {
                        label: t('workspace.resourceContext.importHtml'),
                        onClick: () => {
                            onHandleImport('html')
                        }
                    }
                ],
                divided: true
            },
            {
                label: t('common.copy'),
                children: [
                    {
                        label: t('workspace.resourceContext.copyFile'),
                        divided: true,
                        onClick: () => {
                            onHandleCopy(node, 'file')
                        }
                    },
                    {
                        label: t('workspace.resourceContext.copyName'),
                        onClick: () => {
                            onHandleCopy(node, 'fullname')
                        }
                    },
                    {
                        label: t('workspace.resourceContext.copyRealPath'),
                        onClick: () => {
                            onHandleCopy(node, 'realpath')
                        }
                    },
                    {
                        label: t('workspace.resourceContext.copyRelativePath'),
                        onClick: () => {
                            onHandleCopy(node, 'relativepath')
                        }
                    },
                    {
                        label: t('workspace.resourceContext.copyImageLink'),
                        disabled: node.type !== 'file',
                        onClick: () => {
                            onHandleCopy(node, 'imagelink')
                        }
                    },
                    {
                        label: t('workspace.resourceContext.copyFileLink'),
                        disabled: node.type !== 'file',
                        onClick: () => {
                            onHandleCopy(node, 'filelink')
                        }
                    }
                ]
            },
            {
                label: t('common.cut'),
                onClick: () => {
                    onHandleCut(node)
                }
            },
            {
                label: t('common.paste'),
                onClick: () => {
                    onHandlePaste(node)
                }
            },
            {
                label: t('common.delete'),
                onClick: () => {
                    onHandleDelete(node)
                },
                divided: true
            },
            {
                // FUN-24：原"查找（在文件中查找/在文件夹中查找）"为空实现；
                // 改为"在文件夹中显示"，接主进程 shell.showItemInFolder
                label: t('workspace.resourceContext.revealInFolder'),
                onClick: () => {
                    onHandleFind(node)
                }
            },
            {
                label: t('workspace.resourceContext.exportToFile'),
                disabled: node.type !== 'file',
                children: [
                    {
                        label: t('menu.file.export.word'),
                        onClick: () => {
                            void onHandleExport(node, 'word')
                        }
                    },
                    {
                        label: t('menu.file.export.json'),
                        onClick: () => {
                            void onHandleExport(node, 'json')
                        }
                    },
                    {
                        label: t('menu.file.export.xml'),
                        onClick: () => {
                            void onHandleExport(node, 'xml')
                        }
                    },
                    {
                        label: t('menu.file.export.yaml'),
                        onClick: () => {
                            void onHandleExport(node, 'yaml')
                        }
                    },
                    {
                        label: t('menu.file.export.html'),
                        onClick: () => {
                            void onHandleExport(node, 'html')
                        }
                    },
                    {
                        label: t('menu.file.export.pdf'),
                        onClick: () => {
                            void onHandleExport(node, 'pdf')
                        }
                    }
                ]
            },
            {
                label: t('common.rename'),
                onClick: () => {
                    onHandleRename(node)
                }
            },
            {
                label: t('workspace.resourceContext.openInExplorer'),
                onClick: () => {
                    onHandleOpenExplorer(node)
                }
            },
            {
                label: t('workspace.resourceContext.reloadFromDisk'),
                onClick: () => {
                    onHandleReloadFromDisk()
                }
            }
        ]
    })
}

function onHandleCreateFolder(node: FileSysItem, isFolder: boolean, fileExtension: string) {
    let directoryPath: string
    if (node.type === 'folder') {
        directoryPath = node.path
    } else {
        const lastIndex1 = node.path.lastIndexOf('\\')
        const lastIndex2 = node.path.lastIndexOf('/')
        const lastIndex = Math.max(lastIndex1, lastIndex2)
        directoryPath = node.path.substring(0, lastIndex)
    }

    window.electron.ipcRenderer.send(
        IPC.FILE_MANAGER.CREATE_FILE,
        directoryPath,
        isFolder,
        fileExtension
    )
}

function onHandleImport(value: string) {
    window.electron.ipcRenderer.send(IPC.FILE_MANAGER.IMPORT_FROM, value)
}

// ==================== FE-12：右键导出以右键节点为数据源 ====================
// 原实现直接 send MENU.ACTION，主进程 ExportToFile 固定取 appState.currentActiveFile.content
// → 右键 A 文件导出的是当前打开的 B 文件内容（数据错导）。
// MENU.ACTION 通道只透传动作 id（handlers.ts 注册点不在本轮写作用域），因此改为：
// 先经既有 IPC.FILE.OPEN_SELECT_FILE 打开右键节点文件，等主进程回发 IPC.FILE.USER_SELECT_FILE
// 确认活动文件已切换后再触发导出；若打不开则取消导出（绝不继续导出错误的当前文件）。
const EXPORT_OPEN_TIMEOUT_MS = 5000

/** 已跟踪的当前活动文件路径（正斜杠归一化，跨平台比较） */
let trackedActiveFilePath = ''
let activeFileTrackerRegistered = false

function normalizeFsPath(targetPath: string): string {
    return targetPath.replace(/\\/g, '/')
}

/** 跟踪主进程下发的活动文件切换事件（幂等；窗口/IPC 不可用时静默降级） */
function ensureActiveFileTracker(): void {
    if (activeFileTrackerRegistered) {
        return
    }
    try {
        if (typeof window === 'undefined' || !window.electron?.ipcRenderer) {
            return
        }
        const ipc = window.electron.ipcRenderer
        if (typeof ipc.on !== 'function') {
            return
        }
        ipc.on(IPC.FILE.USER_SELECT_FILE, (_event: unknown, filePath: string) => {
            if (typeof filePath === 'string' && filePath.length > 0) {
                trackedActiveFilePath = normalizeFsPath(filePath)
            }
        })
        activeFileTrackerRegistered = true
    } catch (error) {
        logger.warn('[FE-12] 无法跟踪活动文件切换，右键导出将先重新打开节点文件：', error)
    }
}

/**
 * 仅供单元测试重置 FE-12 的活动文件跟踪状态（生产代码不要调用）。
 */
export function resetExportTrackingForTesting(): void {
    trackedActiveFilePath = ''
    activeFileTrackerRegistered = false
}

try {
    ensureActiveFileTracker()
} catch {
    // 模块加载期 window 尚不可用（单测/极端启动时序）时忽略，首次右键时再注册
}

/** 打开节点文件并等待主进程确认活动文件已切换 */
function openNodeAndWaitActive(node: FileSysItem): Promise<boolean> {
    return new Promise((resolve) => {
        const ipc = window.electron?.ipcRenderer
        if (!ipc || typeof ipc.on !== 'function' || typeof ipc.removeListener !== 'function') {
            resolve(false)
            return
        }
        const targetPath = normalizeFsPath(node.path)
        let settled = false
        const finish = (result: boolean): void => {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(timer)
            try {
                ipc.removeListener(IPC.FILE.USER_SELECT_FILE, listener)
            } catch {
                // 窗口销毁时 IPC 不可用，忽略
            }
            resolve(result)
        }
        const listener = (_event: unknown, filePath: string): void => {
            if (typeof filePath === 'string' && normalizeFsPath(filePath) === targetPath) {
                trackedActiveFilePath = targetPath
                finish(true)
            }
        }
        const timer = setTimeout(() => finish(false), EXPORT_OPEN_TIMEOUT_MS)
        ipc.on(IPC.FILE.USER_SELECT_FILE, listener)
        ipc.send(IPC.FILE.OPEN_SELECT_FILE, {
            name: node.name,
            path: node.path,
            type: 'file',
            content: ''
        })
    })
}

async function onHandleExport(node: FileSysItem, value: string) {
    const action = 'baize:menu:file:export:' + value
    const ipc = window.electron?.ipcRenderer
    if (!ipc) {
        return
    }
    ensureActiveFileTracker()

    const targetPath = normalizeFsPath(node.path)
    if (trackedActiveFilePath !== targetPath) {
        // 右键节点不是当前活动文件：先打开它（主进程会先保存当前文件），确认切换后再导出
        const switched = await openNodeAndWaitActive(node)
        if (!switched) {
            // 打开失败（路径失效/无权限等）：取消导出，避免继续导出错误的当前文件
            getConfigStore().showError(
                t('workspace.resourceContext.exportSourceFailedTitle'),
                t('workspace.resourceContext.exportSourceFailedMessage', { name: node.name })
            )
            return
        }
    }
    ipc.send(IPC.MENU.ACTION, action)
}

async function onHandleCopy(node: FileSysItem, value: string) {
    if (value === 'fullname') {
        await navigator.clipboard.writeText(node.name)
    } else if (value === 'realpath') {
        await navigator.clipboard.writeText(node.path)
    } else if (value === 'relativepath') {
        window.electron.ipcRenderer.send(IPC.FILE_MANAGER.COPY_RELATIVE_PATH, node.path)
    } else if (value === 'imagelink') {
        window.electron.ipcRenderer.send(IPC.FILE_MANAGER.COPY_IMAGELINK, node.path)
    } else if (value === 'filelink') {
        window.electron.ipcRenderer.send(IPC.FILE_MANAGER.COPY_FILELINK, node.path)
    } else {
        window.electron.ipcRenderer.send(
            IPC.FILE_MANAGER.COPY_FILE,
            node.path,
            node.type === 'file'
        )
    }
}

function onHandleCut(node: FileSysItem) {
    window.electron.ipcRenderer.send(IPC.FILE_MANAGER.CUT, node.path, node.type === 'file')
}

function onHandlePaste(node: FileSysItem) {
    window.electron.ipcRenderer.send(IPC.FILE_MANAGER.PASTE, node.path, node.type === 'file')
}

function onHandleDelete(node: FileSysItem) {
    window.electron.ipcRenderer.send(IPC.FILE_MANAGER.DELETE, node.path, node.type === 'file')
}

function onHandleFind(node: FileSysItem) {
    // FUN-24：发送节点路径，主进程 dialogs.ts 经 shell.showItemInFolder 在文件夹中显示
    window.electron.ipcRenderer.send(IPC.FILE_MANAGER.FIND_IN, node.path)
}

function onHandleRename(node: FileSysItem) {
    window.electron.ipcRenderer.send(IPC.FILE_MANAGER.RENAME, node.path, node.type === 'file')
}

function onHandleOpenExplorer(node: FileSysItem) {
    window.electron.ipcRenderer.send(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, node.path)
}

function onHandleReloadFromDisk() {
    window.electron.ipcRenderer.send(IPC.FILE_MANAGER.RELOAD_FROM_DISK, '')
}
