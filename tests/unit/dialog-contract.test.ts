/**
 * 对话框契约静态护栏（第 2 批契约重构 + 结构优化第 2 批 2.1：双对话框体系收敛）
 *
 * 目标：`src/shared/types/dialog.ts` 的对话框名与 data 契约和「主进程发送点」+
 * 「渲染层消费点」双向一致，防止新增对话框/改 data 字段时契约静默漂移。
 * 纯文件级静态扫描（fs + 正则/大括号配对解析，不 import 运行时模块）：
 *
 * 1. 主进程全部 `OPEN_VUE_DIALOG` 发送点的 dialogName 集合 == MainProcessDialogName；
 * 2. MainProcessDialogName ⊆ VueDialogName（主进程发送集合是渲染层可接收集合的子集）；
 * 3. VueDialogName == useConfigStore 的 `keyof DialogState` + 消息伪名称（29 个）；
 * 4. 主进程发送的 data 键集合与 MainProcessDialogDataMap 各对话框 data 契约一致；
 * 5. 渲染层消费端（MessageDialog.vue / CreateFileFolderDialog.vue / RenameFileFolderDialog.vue /
 *    ConfirmDeleteDialog.vue / ReleaseNotesDialog.vue / DialogState）的字段集合与 shared
 *    data 契约一致；
 * 6. 死字段回归：createFileFolder 载荷不得再出现已删除的 `isFolder`。
 *
 * 解析说明：主进程 data 载荷对象可能包含嵌套调用（如 `tMain('key', { path })`），
 * 因此用「引号感知的大括号配对 + 顶层逗号切分」提取顶层键，而不是简单正则截断。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const DIALOG_CONTRACT_FILE = path.join(ROOT, 'src', 'shared', 'types', 'dialog.ts')
const USE_CONFIG_STORE_FILE = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'common',
    'useConfigStore.ts'
)
const MENU_FILE = path.join(ROOT, 'src', 'main', 'ipc', 'menu-file.ts')
const MESSAGE_DIALOG_VUE = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'simple',
    'MessageDialog.vue'
)
const CREATE_FILE_FOLDER_VUE = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'simple',
    'CreateFileFolderDialog.vue'
)
// 结构优化第 2 批 2.1：JSDOM/原生消息框迁移而来的 Vue 对话框（消费端字段核对）
const RENAME_FILE_FOLDER_VUE = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'simple',
    'RenameFileFolderDialog.vue'
)
const CONFIRM_DELETE_VUE = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'simple',
    'ConfirmDeleteDialog.vue'
)
const RELEASE_NOTES_VUE = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'help',
    'ReleaseNotesDialog.vue'
)

/** 主进程一处 OPEN_VUE_DIALOG 发送点（dialogName + 可选的 data 顶层键） */
interface DialogSendSite {
    file: string
    dialogName: string
    dataKeys: string[] | null
}

function readSource(file: string): string {
    // 仓库内部分文件为 CRLF（prettier endOfLine=auto），统一归一化为 LF 后再做行级解析
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walk(full, out)
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
            out.push(full)
        }
    }
    return out
}

/**
 * 从 openIndex（必须指向 `{`）开始做引号感知的大括号配对，返回内部文本。
 * 用于提取 IPC 载荷对象（其值里可能嵌套 `{ path }` 等对象字面量）。
 */
function extractBalancedObject(source: string, openIndex: number): string | null {
    if (source[openIndex] !== '{') {
        return null
    }
    let depth = 0
    let quote: string | null = null
    for (let index = openIndex; index < source.length; index += 1) {
        const char = source[index]
        if (quote !== null) {
            if (char === '\\') {
                index += 1
            } else if (char === quote) {
                quote = null
            }
            continue
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char
            continue
        }
        if (char === '{') {
            depth += 1
        } else if (char === '}') {
            depth -= 1
            if (depth === 0) {
                return source.slice(openIndex + 1, index)
            }
        }
    }
    return null
}

/** 按顶层逗号切分对象体（忽略嵌套括号/字符串/行注释内的逗号） */
function splitTopLevel(body: string): string[] {
    const segments: string[] = []
    let current = ''
    let depth = 0
    let quote: string | null = null
    for (let index = 0; index < body.length; index += 1) {
        const char = body[index]
        if (quote !== null) {
            current += char
            if (char === '\\') {
                current += body[index + 1] ?? ''
                index += 1
            } else if (char === quote) {
                quote = null
            }
            continue
        }
        // 行注释：跳过 `//` 到行尾（不把注释文本当作键的一部分）
        if (char === '/' && body[index + 1] === '/') {
            const lineEnd = body.indexOf('\n', index)
            if (lineEnd < 0) {
                break
            }
            index = lineEnd - 1
            continue
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char
            current += char
            continue
        }
        if (char === '{' || char === '[' || char === '(') {
            depth += 1
        } else if (char === '}' || char === ']' || char === ')') {
            depth -= 1
        }
        if (char === ',' && depth === 0) {
            segments.push(current)
            current = ''
            continue
        }
        current += char
    }
    if (current.trim().length > 0) {
        segments.push(current)
    }
    return segments
}

/** 解析对象体的顶层键（显式 `key:` 与简写 `{ content }` 均支持） */
function parseObjectTopLevelKeys(body: string): string[] {
    const keys: string[] = []
    for (const segment of splitTopLevel(body)) {
        const trimmed = segment.trim()
        if (trimmed.length === 0) {
            continue
        }
        const colonIndex = trimmed.indexOf(':')
        if (colonIndex >= 0) {
            keys.push(trimmed.slice(0, colonIndex).trim())
        } else {
            keys.push(trimmed.replace(/\s+/g, ''))
        }
    }
    return keys
}

/**
 * 收集主进程全部 OPEN_VUE_DIALOG 发送点的 dialogName 与 data 顶层键。
 * 覆盖 4 种发送函数：webContents.send / sendToMainWindow / sendToLiveWindow。
 */
function collectMainDialogSendSites(): DialogSendSite[] {
    const sites: DialogSendSite[] = []
    for (const file of walk(path.join(ROOT, 'src', 'main'))) {
        const source = readSource(file)
        const sendRe =
            /(?:webContents\.send|sendToMainWindow|sendToLiveWindow)\(\s*IPC\.DIALOG\.OPEN_VUE_DIALOG\s*,\s*'([^']+)'/g
        for (const match of source.matchAll(sendRe)) {
            const nameEnd = (match.index ?? 0) + match[0].length
            let cursor = nameEnd
            let dataKeys: string[] | null = null
            // 跳过空白后若出现逗号 + 对象字面量，则提取 data 顶层键
            while (cursor < source.length && /\s/.test(source[cursor])) {
                cursor += 1
            }
            if (source[cursor] === ',') {
                cursor += 1
                while (cursor < source.length && /\s/.test(source[cursor])) {
                    cursor += 1
                }
                if (source[cursor] === '{') {
                    const body = extractBalancedObject(source, cursor)
                    dataKeys = body === null ? null : parseObjectTopLevelKeys(body)
                }
            }
            sites.push({ file, dialogName: match[1], dataKeys })
        }
    }
    return sites
}

/** 解析 `export type X = 'a' | 'b'` 形式的联合成员（支持引号字面量与别名引用） */
function parseTypeAliasMembers(file: string, typeName: string): string[] {
    const source = readSource(file)
    // 兼容 `export type X =` 与模块内私有 `type X =` 两种声明形态
    const hasExported = source.includes(`export type ${typeName} =`)
    expect(hasExported || source.includes(`type ${typeName} =`), `${file} 应定义 ${typeName}`).toBe(
        true
    )
    const start = source.indexOf(`type ${typeName} =`)
    expect(start).toBeGreaterThanOrEqual(0)
    const rest = source.slice(start)
    const newlineEnd = rest.indexOf('\n\n')
    const block = rest.slice(0, newlineEnd > 0 ? newlineEnd : rest.length)
    const members: string[] = []
    for (const line of block.split('\n')) {
        const withoutPrefix = line.replace(new RegExp(`^(?:export )?type ${typeName} =`), '')
        for (const match of withoutPrefix.matchAll(/'([^']+)'|\b([A-Z][A-Za-z0-9_]*)\b/g)) {
            if (match[1] !== undefined) {
                members.push(match[1])
            } else if (match[2] !== undefined && match[2] !== typeName) {
                members.push(match[2])
            }
        }
    }
    return members
}

/** 递归展开联合类型（引号字面量 + 同文件内的别名引用），返回全部字面量 */
function expandUnionLiterals(file: string, typeName: string): Set<string> {
    const literals = new Set<string>()
    const visiting = new Set<string>()
    const visit = (name: string): void => {
        if (visiting.has(name)) {
            return
        }
        visiting.add(name)
        for (const member of parseTypeAliasMembers(file, name)) {
            // 引号字面量直接加入；裸标识符视为同文件别名继续展开
            if (/^[A-Z][A-Za-z0-9_]*$/.test(member)) {
                visit(member)
            } else {
                literals.add(member)
            }
        }
    }
    visit(typeName)
    return literals
}

/** 解析 `export interface X { key: T }` 的属性名集合（兼容 Vue SFC 内无 export 的 interface） */
function parseInterfacePropertyKeys(file: string, interfaceName: string): Set<string> {
    const source = readSource(file)
    const exportedMarker = `export interface ${interfaceName} {`
    const plainMarker = `interface ${interfaceName} {`
    const start = source.includes(exportedMarker)
        ? source.indexOf(exportedMarker)
        : source.indexOf(plainMarker)
    expect(start, `${file} 应定义 ${interfaceName}`).toBeGreaterThanOrEqual(0)
    const markerLength = source.includes(exportedMarker)
        ? exportedMarker.length
        : plainMarker.length
    const rest = source.slice(start + markerLength)
    const end = rest.indexOf('\n}')
    expect(end, `${interfaceName} 应有闭合大括号`).toBeGreaterThan(0)
    const keys = new Set<string>()
    for (const line of rest.slice(0, end).split('\n')) {
        const match = line.match(/^\s{4}(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*[:?]/)
        if (match) {
            keys.add(match[1] ?? match[2])
        }
    }
    return keys
}

function sorted(values: Iterable<string>): string[] {
    return [...values].sort()
}

const SEND_SITES = collectMainDialogSendSites()
const MAIN_DIALOG_NAMES = new Set(SEND_SITES.map((site) => site.dialogName))
const DECLARED_MAIN_DIALOG_NAMES = expandUnionLiterals(
    DIALOG_CONTRACT_FILE,
    'MainProcessDialogName'
)
const VUE_DIALOG_NAMES = expandUnionLiterals(DIALOG_CONTRACT_FILE, 'VueDialogName')

/** useConfigStore.ts 的 DialogState 键（渲染层对话框状态对象名） */
const DIALOG_STATE_KEYS = parseInterfacePropertyKeys(USE_CONFIG_STORE_FILE, 'DialogState')
/** 消息对话框伪名称：'message' + MessageType 5 种 */
const MESSAGE_TYPE_NAMES = expandUnionLiterals(USE_CONFIG_STORE_FILE, 'MessageType')
const MESSAGE_PSEUDO_NAMES = new Set(['message', ...MESSAGE_TYPE_NAMES])

describe('对话框名集合核对（主进程 ↔ 渲染层）', () => {
    it('主进程全部 OPEN_VUE_DIALOG 发送点的 dialogName 应与 MainProcessDialogName 完全一致', () => {
        // 发送点：dialogs.ts（帮助请求 ×3 + 文件管理器转 Vue ×3）、menu-file ×2、
        // menu-view ×4、menu-tools ×4、short-key ×1、dialog-helpers ×3、import ×1、
        // file-operations ×2（去重后 14 个对话框名）
        expect(SEND_SITES.length).toBeGreaterThanOrEqual(8)
        expect(MAIN_DIALOG_NAMES.size).toBe(14)
        expect(DECLARED_MAIN_DIALOG_NAMES.size).toBe(14)
        expect(sorted(MAIN_DIALOG_NAMES)).toEqual(sorted(DECLARED_MAIN_DIALOG_NAMES))
    })

    it('MainProcessDialogName 应是 VueDialogName 的子集（主进程只能打开渲染层认识的对话框）', () => {
        expect([...MAIN_DIALOG_NAMES].filter((name) => !VUE_DIALOG_NAMES.has(name)).sort()).toEqual(
            []
        )
    })

    it('VueDialogName 应与 useConfigStore 的 DialogState 键 + 消息伪名称完全一致（29 个）', () => {
        const expected = new Set([...DIALOG_STATE_KEYS, ...MESSAGE_PSEUDO_NAMES])
        expect(DIALOG_STATE_KEYS.size).toBe(23)
        expect(MESSAGE_PSEUDO_NAMES.size).toBe(6)
        expect(expected.size).toBe(29)
        expect(VUE_DIALOG_NAMES.size).toBe(29)
        expect(sorted(VUE_DIALOG_NAMES)).toEqual(sorted(expected))
    })
})

describe('对话框 data 契约核对（主进程发送 ↔ 渲染层消费）', () => {
    const messageDataKeys = parseInterfacePropertyKeys(DIALOG_CONTRACT_FILE, 'MessageDialogData')
    const createFileFolderDataKeys = parseInterfacePropertyKeys(
        DIALOG_CONTRACT_FILE,
        'CreateFileFolderDialogData'
    )
    const importOptionDataKeys = parseInterfacePropertyKeys(
        DIALOG_CONTRACT_FILE,
        'ImportOptionDialogData'
    )
    // 结构优化第 2 批 2.1：新增的 3 个带 data 对话框
    const renameFileFolderDataKeys = parseInterfacePropertyKeys(
        DIALOG_CONTRACT_FILE,
        'RenameFileFolderDialogData'
    )
    const confirmDeleteDataKeys = parseInterfacePropertyKeys(
        DIALOG_CONTRACT_FILE,
        'ConfirmDeleteDialogData'
    )
    const releaseNotesDataKeys = parseInterfacePropertyKeys(
        DIALOG_CONTRACT_FILE,
        'ReleaseNotesDialogData'
    )
    const dataMapKeys = parseInterfacePropertyKeys(DIALOG_CONTRACT_FILE, 'MainProcessDialogDataMap')

    it('MainProcessDialogDataMap 的键集合应与 MainProcessDialogName 一致（每个对话框都有 data 契约）', () => {
        expect(sorted(dataMapKeys)).toEqual(sorted(DECLARED_MAIN_DIALOG_NAMES))
    })

    it('message 发送载荷的顶层键应恰好是 MessageDialogData 的 title/type/message', () => {
        const sites = SEND_SITES.filter((site) => site.dialogName === 'message')
        expect(sites.length).toBeGreaterThanOrEqual(5)
        for (const site of sites) {
            expect(site.dataKeys, `${site.file} 的 message 载荷应携带 data`).not.toBeNull()
            expect(sorted(site.dataKeys ?? [])).toEqual(['message', 'title', 'type'])
        }
        expect(sorted(messageDataKeys)).toEqual(['message', 'title', 'type'])
    })

    it('createFileFolder 发送载荷只允许 dirPath（死字段 isFolder 已删除且不得回归）', () => {
        const sites = SEND_SITES.filter((site) => site.dialogName === 'createFileFolder')
        expect(sites.length).toBeGreaterThanOrEqual(1)
        for (const site of sites) {
            const keys = site.dataKeys ?? []
            expect(keys, `${site.file} 的 createFileFolder 载荷不得包含 isFolder`).not.toContain(
                'isFolder'
            )
            for (const key of keys) {
                expect(['title', 'dirPath']).toContain(key)
            }
        }
        // menu-file.ts 的两个发送点不得携带 data（历史 { isFolder } 已删除）；
        // 源码里允许保留解释性注释，故只对「send(..., { isFolder: true/false })」形态回归断言。
        const menuSites = sites.filter((site) => site.file === MENU_FILE)
        expect(menuSites.length).toBe(2)
        for (const site of menuSites) {
            expect(site.dataKeys).toBeNull()
        }
        // 结构优化第 2 批 2.1：文件管理器右键「新建」通道由主进程仅透传 dirPath
        const dialogSites = sites.filter((site) =>
            site.file.replace(/\\/g, '/').endsWith('src/main/dialogs/dialogs.ts')
        )
        expect(dialogSites.length).toBe(1)
        expect(sorted(dialogSites[0].dataKeys ?? [])).toEqual(['dirPath'])
        expect(readSource(MENU_FILE)).not.toMatch(/isFolder\s*:\s*(?:true|false)\s*\}\s*\)/)
        expect(sorted(createFileFolderDataKeys)).toEqual(['dirPath', 'title'])
    })

    it('renameFileFolder 发送载荷应恰好携带 path/isFile', () => {
        const sites = SEND_SITES.filter((site) => site.dialogName === 'renameFileFolder')
        expect(sites.length).toBe(1)
        expect(sorted(sites[0].dataKeys ?? [])).toEqual(['isFile', 'path'])
        expect(sorted(renameFileFolderDataKeys)).toEqual(['isFile', 'path'])
    })

    it('confirmDelete 发送载荷应恰好携带 path/isFile', () => {
        const sites = SEND_SITES.filter((site) => site.dialogName === 'confirmDelete')
        expect(sites.length).toBe(1)
        expect(sorted(sites[0].dataKeys ?? [])).toEqual(['isFile', 'path'])
        expect(sorted(confirmDeleteDataKeys)).toEqual(['isFile', 'path'])
    })

    it('releaseNotes 发送载荷应恰好携带 version', () => {
        const sites = SEND_SITES.filter((site) => site.dialogName === 'releaseNotes')
        expect(sites.length).toBe(1)
        expect(sorted(sites[0].dataKeys ?? [])).toEqual(['version'])
        expect(sorted(releaseNotesDataKeys)).toEqual(['version'])
    })

    it('importOption 发送载荷的顶层键应恰好是 ImportOptionDialogData 的 content', () => {
        const sites = SEND_SITES.filter((site) => site.dialogName === 'importOption')
        expect(sites.length).toBe(1)
        expect(sorted(sites[0].dataKeys ?? [])).toEqual(['content'])
        expect(sorted(importOptionDataKeys)).toEqual(['content'])
    })

    it('其余 8 个对话框（admonition/mathText/mdSheet/insertLink/mermaidEdit/insertImage/shortcutKeys/updateLog）发送时不携带 data', () => {
        const noDataNames = [
            'admonition',
            'mathText',
            'mdSheet',
            'insertLink',
            'mermaidEdit',
            'insertImage',
            'shortcutKeys',
            'updateLog'
        ]
        for (const name of noDataNames) {
            const sites = SEND_SITES.filter((site) => site.dialogName === name)
            expect(sites.length, `${name} 应有发送点`).toBeGreaterThanOrEqual(1)
            for (const site of sites) {
                expect(site.dataKeys, `${site.file} 的 ${name} 不应携带 data`).toBeNull()
            }
        }
    })

    it('渲染层消费端字段应与 shared data 契约一致（Props 去掉 visible 后等于契约键）', () => {
        // MessageDialog.vue 的 Props：visible/type/title/message → data 契约 type/title/message
        const messageDialogProps = parseInterfacePropertyKeys(MESSAGE_DIALOG_VUE, 'Props')
        expect(sorted([...messageDialogProps].filter((key) => key !== 'visible'))).toEqual(
            sorted(messageDataKeys)
        )
        // CreateFileFolderDialog.vue 的 Props：visible/title?/dirPath? → data 契约 title?/dirPath?
        const createDialogProps = parseInterfacePropertyKeys(CREATE_FILE_FOLDER_VUE, 'Props')
        expect(sorted([...createDialogProps].filter((key) => key !== 'visible'))).toEqual(
            sorted(createFileFolderDataKeys)
        )
        // 结构优化第 2 批 2.1：重命名/删除确认/版本发布说明对话框的 Props 与 data 契约一致
        const renameProps = parseInterfacePropertyKeys(RENAME_FILE_FOLDER_VUE, 'Props')
        expect(sorted([...renameProps].filter((key) => key !== 'visible'))).toEqual(
            sorted(renameFileFolderDataKeys)
        )
        const confirmDeleteProps = parseInterfacePropertyKeys(CONFIRM_DELETE_VUE, 'Props')
        expect(sorted([...confirmDeleteProps].filter((key) => key !== 'visible'))).toEqual(
            sorted(confirmDeleteDataKeys)
        )
        const releaseNotesProps = parseInterfacePropertyKeys(RELEASE_NOTES_VUE, 'Props')
        expect(sorted([...releaseNotesProps].filter((key) => key !== 'visible'))).toEqual(
            sorted(releaseNotesDataKeys)
        )
        // useConfigStore 的 DialogState：messageDialog 与 importOption 的 data 字段
        const stateSource = readSource(USE_CONFIG_STORE_FILE)
        /** 解析 DialogState 中某对话框的状态字段名（去掉 visible 与可选标记 ?） */
        const parseDialogStateKeys = (name: string): string[] => {
            const line = stateSource.match(new RegExp(`${name}: \\{([^}]*)\\}`))
            expect(line, `DialogState 应定义 ${name}`).not.toBeNull()
            return (line?.[1] ?? '')
                .split(';')
                .map((part) => part.split(':')[0]?.trim().replace(/\?$/, '') ?? '')
                .filter((key) => key.length > 0 && key !== 'visible')
        }
        expect(sorted(parseDialogStateKeys('messageDialog'))).toEqual(sorted(messageDataKeys))
        expect(sorted(parseDialogStateKeys('importOption'))).toEqual(sorted(importOptionDataKeys))
        expect(sorted(parseDialogStateKeys('renameFileFolder'))).toEqual(
            sorted(renameFileFolderDataKeys)
        )
        expect(sorted(parseDialogStateKeys('confirmDelete'))).toEqual(sorted(confirmDeleteDataKeys))
        expect(sorted(parseDialogStateKeys('releaseNotes'))).toEqual(sorted(releaseNotesDataKeys))
    })
})
