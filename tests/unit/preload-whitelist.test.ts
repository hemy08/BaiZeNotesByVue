/**
 * preload 白名单单一来源（H2）回归测试
 *
 * ## 背景
 * preload 此前维护三份手工通道白名单（主窗口 61 send + 26 on、对话框 0 + 0、
 * `window.api` 直连 6），与 shared 契约没有生成期对应关系：新增 IPC 时若漏登记，
 * 渲染层调用会被 preload **静默丢弃**。H2 把白名单改为由共享契约驱动、
 * `build/generate-preload-whitelist.js` 统一生成（产物见
 * `src/preload/allowed-channels.generated.ts` 与 `src/preload/index.ts` 的生成标记块）。
 *
 * ## 本测试的双向核对
 * 1. 生成产物 ↔ shared 契约：`IpcRequests` 61 / `IpcEvents` 26 / `IpcPreloadApiRequests` 6；
 * 2. 入口镜像 ↔ 生成模块：`index.ts` 两个生成块必须与生成模块完全一致（防两处产物漂移）；
 * 3. 生成器 `--check`：契约已改但产物未重新生成 → 失败（杜绝「漏登记即静默丢弃」）；
 * 4. 对话框白名单 ↔ `src/main/dialogs` 实际调用点（结构优化第 2 批 2.1 后为 0 + 0，双向）；
 * 5. 渲染层实际 `send/invoke/on/once` 调用 ⊆ 窗口白名单，且窗口白名单无未使用通道；
 * 6. `window.api` 直连通道 = 契约 6 个，且不在窗口白名单内（两套放行口径不重叠）；
 * 7. 白名单无重复、全部来自 `IPC` 常量表；受限 ipcRenderer 不暴露全量方法。
 *
 * 类型级穷尽性由 `allowed-channels.generated.ts` 的 `ASSERT_*` 常量提供：
 * 契约新增通道而生成产物缺失时，`Exclude<...>` 解析为 never → `= true` 赋值让 tsc 失败；
 * 本测试同时断言这些常量在运行期恒为 true。
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { IPC } from '../../src/shared/ipc-channels'
import {
    ASSERT_PRELOAD_API_EXHAUSTIVE,
    ASSERT_RENDERER_RECEIVE_EXHAUSTIVE,
    ASSERT_RENDERER_SEND_EXHAUSTIVE,
    DIALOG_RECEIVE_CHANNELS,
    DIALOG_SEND_CHANNELS,
    PRELOAD_API_CHANNELS,
    RENDERER_RECEIVE_CHANNELS,
    RENDERER_SEND_CHANNELS
} from '../../src/preload/allowed-channels.generated'

const ROOT = path.resolve(__dirname, '../..')
const PRELOAD_INDEX_FILE = path.join(ROOT, 'src', 'preload', 'index.ts')
const PRELOAD_DIALOG_FILE = path.join(ROOT, 'src', 'preload', 'dialog.ts')
const GENERATED_FILE = path.join(ROOT, 'src', 'preload', 'allowed-channels.generated.ts')
const GENERATOR_FILE = path.join(ROOT, 'build', 'generate-preload-whitelist.js')
const IPC_CONTRACT_FILE = path.join(ROOT, 'src', 'shared', 'types', 'ipc.ts')
const IPC_CHANNELS_FILE = path.join(ROOT, 'src', 'shared', 'ipc-channels.ts')
const DIALOGS_DIR = path.join(ROOT, 'src', 'main', 'dialogs')
const GROUPS = IPC as unknown as Record<string, Record<string, string>>

function readSource(file: string): string {
    // 仓库内部分文件为 CRLF（prettier endOfLine=auto），统一归一化为 LF 后再做行级解析
    return fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
}

interface ConstantEntry {
    group: string
    key: string
    value: string
}

/** 解析 `src/shared/ipc-channels.ts` 的两层常量表（与 ipc-channel-constants 测试同口径） */
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
const CHANNEL_BY_GROUP_KEY = new Map(
    IPC_ENTRIES.map((entry) => [`${entry.group}.${entry.key}`, entry.value])
)
const ALL_CHANNEL_VALUES = new Set(IPC_ENTRIES.map((entry) => entry.value))

/** 把 `[IPC.X.Y]` 契约键映射回通道字符串（与 ipc-payload-contract 测试同口径） */
function parseContractKeys(interfaceName: string): Set<string> {
    const source = readSource(IPC_CONTRACT_FILE)
    const marker = `export interface ${interfaceName} {`
    const start = source.indexOf(marker)
    expect(start, `shared/types/ipc.ts 应定义 ${interfaceName}`).toBeGreaterThanOrEqual(0)
    const rest = source.slice(start + marker.length)
    const end = rest.indexOf('\n}')
    expect(end, `${interfaceName} 应有闭合大括号`).toBeGreaterThan(0)
    const keys = new Set<string>()
    for (const match of rest.slice(0, end).matchAll(/\[IPC\.([A-Z_]+)\.([A-Z_]+)\]/g)) {
        const value = CHANNEL_BY_GROUP_KEY.get(`${match[1]}.${match[2]}`)
        expect(value, `契约键 IPC.${match[1]}.${match[2]} 应在通道表中存在`).toBeDefined()
        keys.add(value!)
    }
    return keys
}

const CONTRACT_REQUEST_KEYS = parseContractKeys('IpcRequests')
const CONTRACT_EVENT_KEYS = parseContractKeys('IpcEvents')
const CONTRACT_PRELOAD_API_KEYS = parseContractKeys('IpcPreloadApiRequests')

/** 解析 index.ts 中某个生成块（`const NAME = new Set<string>([...])`）的通道集合 */
function parseIndexWhitelist(setName: string): Set<string> {
    const source = readSource(PRELOAD_INDEX_FILE)
    const start = source.indexOf(`const ${setName} = new Set<string>([`)
    expect(start, `index.ts 应包含生成块 ${setName}`).toBeGreaterThanOrEqual(0)
    const end = source.indexOf('])', start)
    expect(end).toBeGreaterThan(start)
    const result = new Set<string>()
    for (const match of source.slice(start, end).matchAll(/IPC\.([A-Z_]+)\.([A-Z_]+)/g)) {
        const value = GROUPS[match[1]]?.[match[2]]
        expect(value, `IPC.${match[1]}.${match[2]} 应在通道表中存在`).toBeDefined()
        result.add(value!)
    }
    return result
}

const INDEX_SEND_WHITELIST = parseIndexWhitelist('ALLOWED_RENDERER_SEND_CHANNELS')
const INDEX_RECEIVE_WHITELIST = parseIndexWhitelist('ALLOWED_RENDERER_RECEIVE_CHANNELS')

function walkFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walkFiles(full, acc)
        } else if (/\.(ts|vue)$/.test(entry.name)) {
            acc.push(full)
        }
    }
    return acc
}

/** 渲染层实际使用的通道：send/invoke 与 on/once 分类（解析变量别名常量，沿用旧测试口径） */
function collectRendererUsage(): { send: Set<string>; receive: Set<string> } {
    const files = walkFiles(path.join(ROOT, 'src', 'renderer'))
    const alias = new Map<string, string>()
    for (const file of files) {
        const source = readSource(file)
        for (const match of source.matchAll(
            /(?:const|let)\s+([A-Z][A-Z0-9_]+)\s*=\s*IPC\.([A-Z_]+)\.([A-Z_]+)/g
        )) {
            const value = GROUPS[match[2]]?.[match[3]]
            if (value) alias.set(match[1], value)
        }
    }

    const aliasNames = [...alias.keys()]
    const aliasAlt = aliasNames.length > 0 ? `|(${aliasNames.join('|')})` : ''
    const callRe = new RegExp(
        '\\.(send|invoke|on|once)\\s*\\(\\s*[\\s\\S]{0,160}?(?:IPC\\.([A-Z_]+)\\.([A-Z_]+)' +
            aliasAlt +
            ')',
        'g'
    )

    const send = new Set<string>()
    const receive = new Set<string>()
    for (const file of files) {
        const source = readSource(file)
        for (const match of source.matchAll(callRe)) {
            const method = match[1]
            let channel: string | undefined
            if (match[2] && match[3]) {
                channel = GROUPS[match[2]]?.[match[3]]
            } else if (match[4]) {
                channel = alias.get(match[4])
            }
            if (!channel) continue
            if (method === 'send' || method === 'invoke') send.add(channel)
            else receive.add(channel)
        }
    }
    return { send, receive }
}

/** src/main/dialogs 中经 dialog preload 的实际调用通道（模板插值写死 IPC 常量） */
function collectDialogUsage(): { send: Set<string>; receive: Set<string> } {
    const callRe = /ipcRenderer\.(send|on|once)\(\s*'\$\{IPC\.([A-Z_]+)\.([A-Z_]+)\}'/g
    const send = new Set<string>()
    const receive = new Set<string>()
    for (const file of walkFiles(DIALOGS_DIR)) {
        const source = readSource(file)
        for (const match of source.matchAll(callRe)) {
            const value = CHANNEL_BY_GROUP_KEY.get(`${match[2]}.${match[3]}`)
            expect(value, `对话框调用 IPC.${match[2]}.${match[3]} 应在通道表中存在`).toBeDefined()
            if (match[1] === 'send') {
                send.add(value!)
            } else {
                receive.add(value!)
            }
        }
    }
    return { send, receive }
}

/** index.ts 中 window.api 闭包使用原始 ipcRenderer 直连的通道（受限包装用 raw.*，不会命中） */
function collectPreloadApiUsage(): Set<string> {
    const source = readSource(PRELOAD_INDEX_FILE)
    const used = new Set<string>()
    for (const match of source.matchAll(
        /ipcRenderer\.(?:send|invoke)\(\s*IPC\.([A-Z_]+)\.([A-Z_]+)/g
    )) {
        const value = CHANNEL_BY_GROUP_KEY.get(`${match[1]}.${match[2]}`)
        expect(value, `window.api 调用 IPC.${match[1]}.${match[2]} 应在通道表中存在`).toBeDefined()
        used.add(value!)
    }
    return used
}

/** 集合差异输出（便于失败信息定位） */
function diff(expected: Iterable<string>, actual: Iterable<string>): string[] {
    const expectedSet = new Set(expected)
    const actualSet = new Set(actual)
    const missing = [...expectedSet].filter((item) => !actualSet.has(item))
    const extra = [...actualSet].filter((item) => !expectedSet.has(item))
    return [...missing.map((item) => `缺失 ${item}`), ...extra.map((item) => `多余 ${item}`)].sort()
}

const RENDERER_USAGE = collectRendererUsage()
const DIALOG_USAGE = collectDialogUsage()
const PRELOAD_API_USAGE = collectPreloadApiUsage()

describe('preload 白名单：生成产物 ↔ shared 契约', () => {
    it('主窗口 send/invoke 白名单应与 IpcRequests 契约完全一致（61，双向）', () => {
        const generated = new Set(RENDERER_SEND_CHANNELS)
        expect(generated.size).toBe(61)
        expect(CONTRACT_REQUEST_KEYS.size).toBe(61)
        expect(diff(generated, CONTRACT_REQUEST_KEYS)).toEqual([])
    })

    it('主窗口 on/once 白名单应与 IpcEvents 契约完全一致（26，双向）', () => {
        const generated = new Set(RENDERER_RECEIVE_CHANNELS)
        expect(generated.size).toBe(26)
        expect(CONTRACT_EVENT_KEYS.size).toBe(26)
        expect(diff(generated, CONTRACT_EVENT_KEYS)).toEqual([])
    })

    it('window.api 直连通道白名单应与 IpcPreloadApiRequests 契约完全一致（6，双向）', () => {
        const generated = new Set(PRELOAD_API_CHANNELS)
        expect(generated.size).toBe(6)
        expect(CONTRACT_PRELOAD_API_KEYS.size).toBe(6)
        expect(diff(generated, CONTRACT_PRELOAD_API_KEYS)).toEqual([])
    })

    it('全部生成通道都应来自 IPC 常量表，且各类白名单内部无重复', () => {
        const channelLists = {
            send: [...RENDERER_SEND_CHANNELS],
            receive: [...RENDERER_RECEIVE_CHANNELS],
            preloadApi: [...PRELOAD_API_CHANNELS],
            dialogSend: [...DIALOG_SEND_CHANNELS],
            dialogReceive: [...DIALOG_RECEIVE_CHANNELS]
        }
        for (const [name, channels] of Object.entries(channelLists)) {
            expect(new Set(channels).size, `${name} 白名单存在重复通道`).toBe(channels.length)
            const unknown = channels.filter((channel) => !ALL_CHANNEL_VALUES.has(channel))
            expect(unknown, `${name} 白名单含未知通道`).toEqual([])
        }
    })

    it('编译期穷尽性断言常量应在运行期恒为 true（漏生成由 tsc 先拦截）', () => {
        // 契约新增通道而生成器未重新生成时，allow-channels.generated.ts 的
        // Exclude<契约通道, 已生成通道> 不为 never → 断言常量类型为 never → 编译失败。
        expect(ASSERT_RENDERER_SEND_EXHAUSTIVE).toBe(true)
        expect(ASSERT_RENDERER_RECEIVE_EXHAUSTIVE).toBe(true)
        expect(ASSERT_PRELOAD_API_EXHAUSTIVE).toBe(true)
    })
})

describe('preload 白名单：入口镜像 ↔ 生成产物（防两处产物漂移）', () => {
    it('index.ts 两个生成块应可解析且与生成模块双向一致（61 / 26）', () => {
        expect(INDEX_SEND_WHITELIST.size).toBe(61)
        expect(INDEX_RECEIVE_WHITELIST.size).toBe(26)
        expect(diff(INDEX_SEND_WHITELIST, new Set(RENDERER_SEND_CHANNELS))).toEqual([])
        expect(diff(INDEX_RECEIVE_WHITELIST, new Set(RENDERER_RECEIVE_CHANNELS))).toEqual([])
    })

    it('index.ts 白名单块应带生成标记（禁止绕过生成器手写）', () => {
        const source = readSource(PRELOAD_INDEX_FILE)
        for (const marker of [
            '// <preload-whitelist:renderer-send>',
            '// </preload-whitelist:renderer-send>',
            '// <preload-whitelist:renderer-receive>',
            '// </preload-whitelist:renderer-receive>'
        ]) {
            expect(source, `index.ts 缺少生成标记 ${marker}`).toContain(marker)
        }
        // 生成块内必须引用 IPC 常量；通道字面量形式（'baize:*'）不得出现
        expect(source).not.toMatch(/'baize:[a-z-]+:[a-z-]+'/)
    })

    it('生成器 --check 应通过（契约/主进程源码已改但产物未重新生成 → 失败）', () => {
        const output = execFileSync(process.execPath, [GENERATOR_FILE, '--check'], {
            cwd: ROOT,
            encoding: 'utf8'
        })
        expect(output).toContain('preload 白名单生成产物与契约一致')
    })

    it('生成模块文件头应标注自动生成 + 生成命令（避免被当作手写文件维护）', () => {
        const source = readSource(GENERATED_FILE)
        expect(source).toContain('自动生成')
        expect(source).toContain('node build/generate-preload-whitelist.js')
        expect(source).toContain('禁止手工编辑')
    })
})

describe('preload 白名单：对话框（生成来源 = src/main/dialogs 实际调用点）', () => {
    // 结构优化第 2 批 2.1（H3）：JSDOM 对话框全部迁移为渲染层 Vue 对话框后，
    // src/main/dialogs 不再有 dialog preload 的 ipcRenderer.send/on 调用点，
    // 两套对话框白名单为空（生成器允许空结果，dialog.ts 作为安全空壳保留）。
    it('对话框 send/on 白名单应与实际调用点双向一致（0 send + 0 on）', () => {
        expect(new Set(DIALOG_SEND_CHANNELS).size).toBe(0)
        expect(new Set(DIALOG_RECEIVE_CHANNELS).size).toBe(0)
        expect(diff(new Set(DIALOG_SEND_CHANNELS), DIALOG_USAGE.send)).toEqual([])
        expect(diff(new Set(DIALOG_RECEIVE_CHANNELS), DIALOG_USAGE.receive)).toEqual([])
    })

    it('dialog.ts 应引用生成模块消费白名单，不再手写 IPC 常量清单', () => {
        const source = readSource(PRELOAD_DIALOG_FILE)
        expect(source).toContain("from './allowed-channels.generated'")
        expect(source).toContain('new Set<string>(DIALOG_SEND_CHANNELS)')
        expect(source).toContain('new Set<string>(DIALOG_RECEIVE_CHANNELS)')
        expect(source).not.toContain("from '../shared/ipc-channels'")
        expect(source).not.toMatch(/new Set<string>\(\[\s*IPC\./)
    })
})

describe('preload 白名单：window.api 直连通道边界', () => {
    it('window.api 实际使用通道应全部落在 IpcPreloadApiRequests 契约内（6，双向）', () => {
        expect(PRELOAD_API_USAGE.size).toBe(6)
        expect(diff(PRELOAD_API_USAGE, new Set(PRELOAD_API_CHANNELS))).toEqual([])
    })

    it('window.api 直连通道不应出现在窗口 send/invoke 白名单内（两套放行口径不重叠）', () => {
        const leaked = [...PRELOAD_API_CHANNELS]
            .filter((channel) => INDEX_SEND_WHITELIST.has(channel))
            .sort()
        expect(leaked).toEqual([])
    })
})

describe('preload 白名单：渲染层实际调用覆盖（双向）', () => {
    it('渲染层全部 send/invoke 调用都应命中主窗口 send 白名单', () => {
        expect(RENDERER_USAGE.send.size).toBeGreaterThan(40)
        const missing = [...RENDERER_USAGE.send]
            .filter((channel) => !INDEX_SEND_WHITELIST.has(channel))
            .sort()
        expect(missing).toEqual([])
    })

    it('渲染层全部 on/once 调用都应命中主窗口 receive 白名单', () => {
        expect(RENDERER_USAGE.receive.size).toBeGreaterThan(20)
        const missing = [...RENDERER_USAGE.receive]
            .filter((channel) => !INDEX_RECEIVE_WHITELIST.has(channel))
            .sort()
        expect(missing).toEqual([])
    })

    it('窗口白名单不应包含渲染层未使用的通道（避免多余放行）', () => {
        const unusedSend = [...INDEX_SEND_WHITELIST]
            .filter((channel) => !RENDERER_USAGE.send.has(channel))
            .sort()
        const unusedReceive = [...INDEX_RECEIVE_WHITELIST]
            .filter((channel) => !RENDERER_USAGE.receive.has(channel))
            .sort()
        expect(unusedSend).toEqual([])
        expect(unusedReceive).toEqual([])
    })

    it('受限 ipcRenderer 不应暴露 sendTo/sendSync/postMessage 等全量方法', () => {
        const source = readSource(PRELOAD_INDEX_FILE)
        expect(source).not.toMatch(/sendTo:\s*/)
        expect(source).not.toMatch(/sendSync:\s*/)
        expect(source).not.toMatch(/postMessage:\s*/)
    })
})
