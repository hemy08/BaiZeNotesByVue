/**
 * IPC 载荷契约静态护栏（第 2 批契约重构）
 *
 * 目标：`src/shared/types/ipc.ts` 的 IpcRequests / IpcResponses / IpcEvents 三张契约表
 * 与「通道真源 + preload 白名单 + 主进程注册点」保持双向一致，防止后续新增/删除通道时
 * 契约静默漂移。全部为纯文件级静态扫描（fs 读源码 + 正则解析，不 import 运行时模块）：
 *
 * 1. IpcRequests 键集合 == preload ALLOWED_RENDERER_SEND_CHANNELS（74，双向）；
 * 2. IpcEvents 键集合 == preload ALLOWED_RENDERER_RECEIVE_CHANNELS（28，双向）；
 * 3. IpcResponses 键集合 == IpcRequests ∩ 主进程 registerHandleOnce 注册通道（41）；
 * 4. IpcEvents 的每个通道在主进程都有真实发送点（webContents.send / sendToMainWindow /
 *    sendToLiveWindow，含 main/index.ts 的通道常量别名）；
 * 5. 渲染层全部 ipcRenderer.send/invoke 调用的通道都落在 IpcRequests 内；
 * 6. preload 受限高层 API（window.api.*）直连的 6 个通道单独成表且不经过窗口白名单；
 * 7. CONFIG 契约：shared/types/config.ts 的 ConfigName == config-schema.ts 的
 *    ALLOWED_CONFIG_NAMES，且 ConfigReadMap / ConfigWriteMap 键集合与之一致。
 *
 * 解析约定：三张契约表统一用计算属性名 `[IPC.<组>.<键>]` 引用 ipc-channels.ts 常量，
 * 本测试把该引用映射回通道字符串后与 IPC 常量表核对，因此通道字符串仍只有一处真源。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { IPC } from '../../src/shared/ipc-channels'

const ROOT = path.resolve(__dirname, '../..')
const GROUPS = IPC as unknown as Record<string, Record<string, string>>

const IPC_CHANNELS_FILE = path.join(ROOT, 'src', 'shared', 'ipc-channels.ts')
const IPC_CONTRACT_FILE = path.join(ROOT, 'src', 'shared', 'types', 'ipc.ts')
const CONFIG_CONTRACT_FILE = path.join(ROOT, 'src', 'shared', 'types', 'config.ts')
const CONFIG_SCHEMA_FILE = path.join(ROOT, 'src', 'main', 'config', 'config-schema.ts')
const PRELOAD_FILE = path.join(ROOT, 'src', 'preload', 'index.ts')

/** IPC 常量表条目（组 / 键 / 通道值） */
interface ConstantEntry {
    group: string
    key: string
    value: string
}

function readSource(file: string): string {
    // 仓库内部分文件为 CRLF（prettier endOfLine=auto），统一归一化为 LF 后再做行级解析
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** 解析 `export const IPC = { GROUP: { KEY: 'value' } } as const` 的两层常量表 */
function parseIpcConstantTable(): ConstantEntry[] {
    const lines = readSource(IPC_CHANNELS_FILE).split('\n')
    const entries: ConstantEntry[] = []
    let group: string | null = null
    for (const line of lines) {
        const groupMatch = line.match(/^\s{4}([A-Z_]+): \{$/)
        if (groupMatch) {
            group = groupMatch[1]
            continue
        }
        if (/^\s{4}\} as const/.test(line)) {
            group = null
            continue
        }
        const keyMatch = line.match(/^\s+([A-Z_]+): '([^']+)'/)
        if (keyMatch && group) {
            entries.push({ group, key: keyMatch[1], value: keyMatch[2] })
        }
    }
    return entries
}

const IPC_ENTRIES = parseIpcConstantTable()
/** `GROUP.KEY` → 通道字符串 */
const CHANNEL_BY_GROUP_KEY = new Map(
    IPC_ENTRIES.map((entry) => [`${entry.group}.${entry.key}`, entry.value])
)
const ALL_CHANNEL_VALUES = new Set(IPC_ENTRIES.map((entry) => entry.value))

/** 解析 preload 白名单 Set（`IPC.X.Y` 引用映射为通道字符串），并断言引用的常量存在 */
function parseWhitelist(setName: string): Set<string> {
    const source = readSource(PRELOAD_FILE)
    const start = source.indexOf(`const ${setName} = new Set<string>([`)
    expect(start, `preload 应定义 ${setName}`).toBeGreaterThanOrEqual(0)
    const end = source.indexOf('])', start)
    expect(end).toBeGreaterThan(start)
    const block = source.slice(start, end)
    const result = new Set<string>()
    for (const match of block.matchAll(/IPC\.([A-Z_]+)\.([A-Z_]+)/g)) {
        const value = GROUPS[match[1]]?.[match[2]]
        expect(value, `IPC.${match[1]}.${match[2]} 应在通道表中存在`).toBeDefined()
        result.add(value!)
    }
    return result
}

const SEND_WHITELIST = parseWhitelist('ALLOWED_RENDERER_SEND_CHANNELS')
const RECEIVE_WHITELIST = parseWhitelist('ALLOWED_RENDERER_RECEIVE_CHANNELS')

/**
 * 解析 shared/types/ipc.ts 中某个契约接口（IpcRequests / IpcResponses / IpcEvents /
 * IpcPreloadApiRequests）的通道键集合：把 `[IPC.X.Y]` 引用映射回通道字符串。
 */
function parseContractInterfaceKeys(interfaceName: string): Set<string> {
    const source = readSource(IPC_CONTRACT_FILE)
    const marker = `export interface ${interfaceName} {`
    const start = source.indexOf(marker)
    expect(start, `shared/types/ipc.ts 应定义 ${interfaceName}`).toBeGreaterThanOrEqual(0)
    const rest = source.slice(start + marker.length)
    const end = rest.indexOf('\n}')
    expect(end, `${interfaceName} 应有闭合大括号`).toBeGreaterThan(0)
    const block = rest.slice(0, end)
    const keys = new Set<string>()
    for (const match of block.matchAll(/\[IPC\.([A-Z_]+)\.([A-Z_]+)\]/g)) {
        const value = CHANNEL_BY_GROUP_KEY.get(`${match[1]}.${match[2]}`)
        expect(value, `契约键 IPC.${match[1]}.${match[2]} 应在通道表中存在`).toBeDefined()
        keys.add(value!)
    }
    return keys
}

const REQUEST_KEYS = parseContractInterfaceKeys('IpcRequests')
const RESPONSE_KEYS = parseContractInterfaceKeys('IpcResponses')
const EVENT_KEYS = parseContractInterfaceKeys('IpcEvents')
const PRELOAD_API_REQUEST_KEYS = parseContractInterfaceKeys('IpcPreloadApiRequests')

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

/** 主进程源码里 `const ALIAS = IPC.X.Y` 形式的通道常量别名（如 EDITOR_FLUSH_CHANNEL） */
function collectMainChannelAliases(): Map<string, string> {
    const alias = new Map<string, string>()
    for (const file of walk(path.join(ROOT, 'src', 'main'))) {
        const source = readSource(file)
        for (const match of source.matchAll(
            /(?:const|let)\s+([A-Z][A-Z0-9_]+)\s*=\s*IPC\.([A-Z_]+)\.([A-Z_]+)/g
        )) {
            const value = GROUPS[match[2]]?.[match[3]]
            if (value) {
                alias.set(match[1], value)
            }
        }
    }
    return alias
}

const MAIN_ALIASES = collectMainChannelAliases()

/** 主进程以 registerHandleOnce / ipcMain.handle 注册（invoke 类）的通道集合 */
function collectMainInvokeChannels(): Set<string> {
    const channels = new Set<string>()
    for (const file of walk(path.join(ROOT, 'src', 'main'))) {
        const source = readSource(file)
        const registerRe =
            /(?:registerHandleOnce|ipcMain\.handle)\(\s*(?:IPC\.([A-Z_]+)\.([A-Z_]+)|([A-Z][A-Z0-9_]+))/g
        for (const match of source.matchAll(registerRe)) {
            if (match[1] !== undefined && match[2] !== undefined) {
                const value = CHANNEL_BY_GROUP_KEY.get(`${match[1]}.${match[2]}`)
                if (value) {
                    channels.add(value)
                }
            } else if (match[3] !== undefined) {
                const aliasValue = MAIN_ALIASES.get(match[3])
                if (aliasValue) {
                    channels.add(aliasValue)
                }
            }
        }
    }
    return channels
}

/** 主进程实际发送过（webContents.send / sendToMainWindow / sendToLiveWindow）的通道集合 */
function collectMainSentChannels(): Set<string> {
    const channels = new Set<string>()
    for (const file of walk(path.join(ROOT, 'src', 'main'))) {
        const source = readSource(file)
        const sendRe =
            /(?:webContents\.send|sendToMainWindow|sendToLiveWindow)\(\s*(?:IPC\.([A-Z_]+)\.([A-Z_]+)|([A-Z][A-Z0-9_]+))/g
        for (const match of source.matchAll(sendRe)) {
            if (match[1] !== undefined && match[2] !== undefined) {
                const value = CHANNEL_BY_GROUP_KEY.get(`${match[1]}.${match[2]}`)
                if (value) {
                    channels.add(value)
                }
            } else if (match[3] !== undefined) {
                const aliasValue = MAIN_ALIASES.get(match[3])
                if (aliasValue) {
                    channels.add(aliasValue)
                }
            }
        }
    }
    return channels
}

const MAIN_INVOKE_CHANNELS = collectMainInvokeChannels()
const MAIN_SENT_CHANNELS = collectMainSentChannels()

/** 渲染层实际使用的 send / invoke 通道（兼容常量别名，与 preload-whitelist 测试同款解析） */
function collectRendererSendChannels(): Set<string> {
    const files = walk(path.join(ROOT, 'src', 'renderer'))
    const alias = new Map<string, string>()
    for (const file of files) {
        const source = readSource(file)
        for (const match of source.matchAll(
            /(?:const|let)\s+([A-Z][A-Z0-9_]+)\s*=\s*IPC\.([A-Z_]+)\.([A-Z_]+)/g
        )) {
            const value = GROUPS[match[2]]?.[match[3]]
            if (value) {
                alias.set(match[1], value)
            }
        }
    }
    const aliasAlt = alias.size > 0 ? `|(${[...alias.keys()].join('|')})` : ''
    const callRe = new RegExp(
        '\\.(?:send|invoke)\\s*\\(\\s*[\\s\\S]{0,160}?(?:IPC\\.([A-Z_]+)\\.([A-Z_]+)' +
            aliasAlt +
            ')',
        'g'
    )
    const channels = new Set<string>()
    for (const file of files) {
        const source = readSource(file)
        for (const match of source.matchAll(callRe)) {
            if (match[1] !== undefined && match[2] !== undefined) {
                const value = CHANNEL_BY_GROUP_KEY.get(`${match[1]}.${match[2]}`)
                if (value) {
                    channels.add(value)
                }
            } else if (match[3] !== undefined) {
                const aliasValue = alias.get(match[3])
                if (aliasValue) {
                    channels.add(aliasValue)
                }
            }
        }
    }
    return channels
}

/** 解析 `export interface X { key: Y }` 的属性名集合（只用于 CONFIG 映射表核对） */
function parseInterfacePropertyKeys(file: string, interfaceName: string): Set<string> {
    const source = readSource(file)
    const marker = `export interface ${interfaceName} {`
    const start = source.indexOf(marker)
    expect(start, `${file} 应定义 ${interfaceName}`).toBeGreaterThanOrEqual(0)
    const rest = source.slice(start + marker.length)
    const end = rest.indexOf('\n}')
    expect(end, `${interfaceName} 应有闭合大括号`).toBeGreaterThan(0)
    const keys = new Set<string>()
    for (const line of rest.slice(0, end).split('\n')) {
        // Prettier 的 quoteProps=as-needed：合法标识符键无引号，带连字符的键保留单引号
        const match = line.match(/^\s{4}(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:/)
        if (match) {
            keys.add(match[1] ?? match[2])
        }
    }
    return keys
}

/** 解析 ALLOWED_CONFIG_NAMES（主进程配置名白名单） */
function parseAllowedConfigNames(): Set<string> {
    const source = readSource(CONFIG_SCHEMA_FILE)
    const start = source.indexOf('export const ALLOWED_CONFIG_NAMES')
    expect(start, 'config-schema.ts 应定义 ALLOWED_CONFIG_NAMES').toBeGreaterThanOrEqual(0)
    const end = source.indexOf('])', start)
    expect(end).toBeGreaterThan(start)
    const names = new Set<string>()
    for (const match of source.slice(start, end).matchAll(/'([^']+)'/g)) {
        names.add(match[1])
    }
    return names
}

/** 解析 shared/types/config.ts 的 ConfigName 联合 */
function parseConfigNameUnion(): Set<string> {
    const source = readSource(CONFIG_CONTRACT_FILE)
    const start = source.indexOf('export type ConfigName =')
    expect(start, 'shared/types/config.ts 应定义 ConfigName').toBeGreaterThanOrEqual(0)
    const rest = source.slice(start)
    const end = rest.indexOf('\n\n')
    const names = new Set<string>()
    for (const match of rest.slice(0, end).matchAll(/'([^']+)'/g)) {
        names.add(match[1])
    }
    return names
}

/** 解析 validateConfigData 的 switch case 分支（配置名校验覆盖集合） */
function parseValidatedConfigNames(): Set<string> {
    const source = readSource(CONFIG_SCHEMA_FILE)
    const start = source.indexOf('export function validateConfigData')
    expect(start, 'config-schema.ts 应定义 validateConfigData').toBeGreaterThanOrEqual(0)
    const rest = source.slice(start)
    const end = rest.indexOf('\n}\n')
    const names = new Set<string>()
    for (const match of rest.slice(0, end).matchAll(/case '([^']+)':/g)) {
        names.add(match[1])
    }
    return names
}

/** 集合差异输出（便于失败信息定位） */
function diff(expected: Iterable<string>, actual: Iterable<string>): string[] {
    const expectedSet = new Set(expected)
    const actualSet = new Set(actual)
    const missing = [...expectedSet].filter((item) => !actualSet.has(item))
    const extra = [...actualSet].filter((item) => !expectedSet.has(item))
    return [...missing.map((item) => `缺失 ${item}`), ...extra.map((item) => `多余 ${item}`)].sort()
}

describe('IPC 载荷契约：请求/响应（渲染层 → 主进程）', () => {
    it('IPC 常量表应解析成功（防止正则失效后空跑）', () => {
        expect(IPC_ENTRIES.length).toBeGreaterThan(80)
        expect(ALL_CHANNEL_VALUES.size).toBe(IPC_ENTRIES.length)
    })

    it('IpcRequests 键集合应与 preload send/invoke 白名单完全一致（74 个，双向）', () => {
        expect(SEND_WHITELIST.size).toBe(74)
        expect(REQUEST_KEYS.size).toBe(74)
        expect(diff(SEND_WHITELIST, REQUEST_KEYS)).toEqual([])
    })

    it('IpcResponses 键集合应等于「invoke 注册通道 ∩ send 白名单」（41 个）', () => {
        const invokeInWhitelist = new Set(
            [...MAIN_INVOKE_CHANNELS].filter((channel) => SEND_WHITELIST.has(channel))
        )
        expect(invokeInWhitelist.size).toBe(41)
        expect(RESPONSE_KEYS.size).toBe(41)
        expect(diff(invokeInWhitelist, RESPONSE_KEYS)).toEqual([])
    })

    it('IpcResponses 的每个键都必须是 IpcRequests 的键（响应不能脱离请求契约）', () => {
        expect([...RESPONSE_KEYS].filter((channel) => !REQUEST_KEYS.has(channel)).sort()).toEqual(
            []
        )
    })

    it('IpcRequests 的每个键都必须是 IPC 常量表中的合法通道（无未知通道）', () => {
        expect(
            [...REQUEST_KEYS].filter((channel) => !ALL_CHANNEL_VALUES.has(channel)).sort()
        ).toEqual([])
    })

    it('渲染层全部 ipcRenderer.send/invoke 调用的通道都应落在 IpcRequests 内', () => {
        const used = collectRendererSendChannels()
        expect(used.size).toBeGreaterThan(40)
        expect([...used].filter((channel) => !REQUEST_KEYS.has(channel)).sort()).toEqual([])
    })
})

describe('IPC 载荷契约：广播事件（主进程 → 渲染层）', () => {
    it('IpcEvents 键集合应与 preload on/once 白名单完全一致（28 个，双向）', () => {
        expect(RECEIVE_WHITELIST.size).toBe(28)
        expect(EVENT_KEYS.size).toBe(28)
        expect(diff(RECEIVE_WHITELIST, EVENT_KEYS)).toEqual([])
    })

    it('IpcEvents 的每个通道在主进程都应有真实发送点（无「只定义类型、从不发送」的死事件）', () => {
        expect(MAIN_SENT_CHANNELS.size).toBeGreaterThan(20)
        expect(
            [...EVENT_KEYS].filter((channel) => !MAIN_SENT_CHANNELS.has(channel)).sort()
        ).toEqual([])
    })
})

describe('IPC 载荷契约：preload 受限高层 API 直连通道', () => {
    it('window.api.* 直连通道应全部是合法通道，且不经过渲染层窗口白名单', () => {
        expect(PRELOAD_API_REQUEST_KEYS.size).toBe(6)
        expect(
            [...PRELOAD_API_REQUEST_KEYS]
                .filter((channel) => !ALL_CHANNEL_VALUES.has(channel))
                .sort()
        ).toEqual([])
        // 这 6 个通道由 preload 闭包直接用原始 ipcRenderer 调用，不暴露给渲染层直接 invoke，
        // 因此必须不在 63 通道渲染层白名单内（避免出现「两套放行口径」）。
        expect(
            [...PRELOAD_API_REQUEST_KEYS].filter((channel) => SEND_WHITELIST.has(channel)).sort()
        ).toEqual([])
    })
})

describe('CONFIG 配置名/载荷映射契约', () => {
    it('ConfigName 联合应与 config-schema.ts 的 ALLOWED_CONFIG_NAMES 完全一致（8 个）', () => {
        const allowed = parseAllowedConfigNames()
        const configNames = parseConfigNameUnion()
        expect(allowed.size).toBe(8)
        expect(configNames.size).toBe(8)
        expect(diff(allowed, configNames)).toEqual([])
    })

    it('ConfigReadMap / ConfigWriteMap 的键集合应与 ConfigName 完全一致', () => {
        const configNames = parseConfigNameUnion()
        const readKeys = parseInterfacePropertyKeys(CONFIG_CONTRACT_FILE, 'ConfigReadMap')
        const writeKeys = parseInterfacePropertyKeys(CONFIG_CONTRACT_FILE, 'ConfigWriteMap')
        expect(readKeys.size).toBe(8)
        expect(writeKeys.size).toBe(8)
        expect(diff(configNames, readKeys)).toEqual([])
        expect(diff(configNames, writeKeys)).toEqual([])
    })

    it('config-schema.ts 的 validateConfigData 应覆盖全部配置名（每个名称都有校验规则）', () => {
        const configNames = parseConfigNameUnion()
        const validated = parseValidatedConfigNames()
        expect(diff(configNames, validated)).toEqual([])
    })
})
