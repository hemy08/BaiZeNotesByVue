/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本为 CommonJS 构建脚本（package.json 无 type:module，由 node 直接运行），保持 require 写法 */
/**
 * preload 白名单单一来源生成器（H2：结构优化第 1 批）
 *
 * ## 背景
 * preload 此前维护三份手工通道白名单（主窗口 58 send + 25 on、对话框 2 + 1、
 * `window.api` 直连 6），与 shared 契约没有生成期对应关系——渲染层/主进程新增通道时
 * 若漏登记，调用会被 preload 静默丢弃（inject 失效），只能靠事后静态测试发现。
 *
 * ## 单一来源
 * 1. 主窗口 send/invoke：`src/shared/types/ipc.ts` 的 `IpcRequests` 键集合（58）；
 * 2. 主窗口 on/once：同文件 `IpcEvents` 键集合（25）；
 * 3. `window.api.*` 直连通道：同文件 `IpcPreloadApiRequests` 键集合（6，不经窗口白名单）；
 * 4. 对话框 preload send/on：静态扫描 `src/main/dialogs` 中
 *    `ipcRenderer.send/on('${IPC.X.Y}')` 模板插值调用（对话框通道没有 shared 契约，
 *    以「实际调用点」为真源；主进程新增对话框通道也会被自动登记）。
 * 通道字符串本身仍只在 `src/shared/ipc-channels.ts` 定义一次，生成产物一律引用 `IPC.*` 常量。
 *
 * ## 产物
 * 1. `src/preload/allowed-channels.generated.ts`：
 *    - 运行时被 `dialog.ts` 引用（对话框白名单）；
 *    - 导出带字面量类型的通道元组 + **编译期穷尽性断言**（契约新增通道未重新生成时
 *      `tsc` 直接失败）；
 *    - 被 `tests/unit/preload-whitelist.test.ts` 引用做双向核对。
 * 2. `src/preload/index.ts` 中两个带 `preload-whitelist` 生成标记的白名单块：
 *    既有 `tests/unit/ipc-payload-contract.test.ts`（本批不修改）从**入口文件**静态
 *    解析 `ALLOWED_RENDERER_SEND_CHANNELS` / `ALLOWED_RENDERER_RECEIVE_CHANNELS`，
 *    因此入口镜像必须保留在 index.ts；镜像与生成模块由同一份数据一次产出，
 *    并由 `preload-whitelist.test.ts` 校验两者完全一致（防两处产物漂移）。
 *
 * ## 用法
 *   node build/generate-preload-whitelist.js           # 生成并写回产物（幂等）
 *   node build/generate-preload-whitelist.js --check   # 只校验入库产物是否与契约一致（CI/单测）
 *
 * 说明：本脚本只读 shared/主进程源码，只写上面两处 preload 产物；不新增任何 npm 依赖。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const IPC_CHANNELS_FILE = path.join(ROOT, 'src', 'shared', 'ipc-channels.ts')
const IPC_CONTRACT_FILE = path.join(ROOT, 'src', 'shared', 'types', 'ipc.ts')
const DIALOGS_DIR = path.join(ROOT, 'src', 'main', 'dialogs')
const GENERATED_FILE = path.join(ROOT, 'src', 'preload', 'allowed-channels.generated.ts')
const PRELOAD_INDEX_FILE = path.join(ROOT, 'src', 'preload', 'index.ts')

/** index.ts 中生成块的标记（生成器按标记整体替换块内容；缺失即报错，绝不猜测） */
const INDEX_BLOCK_MARKERS = {
    send: {
        open: '// <preload-whitelist:renderer-send>',
        close: '// </preload-whitelist:renderer-send>'
    },
    receive: {
        open: '// <preload-whitelist:renderer-receive>',
        close: '// </preload-whitelist:renderer-receive>'
    }
}

function readSource(file) {
    // 统一归一化为 LF 解析，写回时再按目标文件既有行尾还原
    return fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
}

function detectEol(file) {
    if (!fs.existsSync(file)) {
        return '\n'
    }
    return fs.readFileSync(file, 'utf-8').includes('\r\n') ? '\r\n' : '\n'
}

function toTargetEol(content, eol) {
    return eol === '\n' ? content : content.replace(/\n/g, eol)
}

/**
 * 解析 `src/shared/ipc-channels.ts` 的两层常量表（GROUP → KEY → 通道字符串）。
 * 解析约定与 tests/unit/ipc-channel-constants.test.ts 一致（4 空格缩进、单引号值）。
 */
function parseIpcConstantTable() {
    const lines = readSource(IPC_CHANNELS_FILE).split('\n')
    const entries = []
    let group = null
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
    if (entries.length === 0) {
        throw new Error(`[preload-whitelist] 未能从 ${IPC_CHANNELS_FILE} 解析出任何通道常量`)
    }
    return entries
}

/** `GROUP.KEY` → 通道字符串（同时校验通道值唯一） */
function buildChannelMap(entries) {
    const map = new Map()
    for (const entry of entries) {
        const id = `${entry.group}.${entry.key}`
        if (map.has(id)) {
            throw new Error(`[preload-whitelist] IPC 常量重复定义：${id}`)
        }
        map.set(id, entry.value)
    }
    return map
}

/**
 * 解析 shared/types/ipc.ts 中某个契约接口的通道键（保持源码声明顺序）。
 * 与既有 ipc-payload-contract.test.ts 使用同一解析口径：接口块内的 `[IPC.X.Y]` 引用。
 */
function parseContractChannels(interfaceName, channelMap) {
    const source = readSource(IPC_CONTRACT_FILE)
    const marker = `export interface ${interfaceName} {`
    const start = source.indexOf(marker)
    if (start < 0) {
        throw new Error(`[preload-whitelist] ${IPC_CONTRACT_FILE} 缺少契约接口 ${interfaceName}`)
    }
    const rest = source.slice(start + marker.length)
    const end = rest.indexOf('\n}')
    if (end < 0) {
        throw new Error(`[preload-whitelist] 契约接口 ${interfaceName} 缺少闭合大括号`)
    }
    const channels = []
    const seen = new Set()
    for (const match of rest.slice(0, end).matchAll(/\[IPC\.([A-Z_]+)\.([A-Z_]+)\]/g)) {
        const id = `${match[1]}.${match[2]}`
        const value = channelMap.get(id)
        if (!value) {
            throw new Error(
                `[preload-whitelist] 契约 ${interfaceName} 引用了不存在的常量 IPC.${id}`
            )
        }
        if (seen.has(id)) {
            throw new Error(`[preload-whitelist] 契约 ${interfaceName} 重复登记通道 IPC.${id}`)
        }
        seen.add(id)
        channels.push({ id, value })
    }
    if (channels.length === 0) {
        throw new Error(`[preload-whitelist] 契约接口 ${interfaceName} 未解析出任何通道`)
    }
    return channels
}

function walkTsFiles(dir, out = []) {
    for (const entry of fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walkTsFiles(full, out)
        } else if (entry.name.endsWith('.ts')) {
            out.push(full)
        }
    }
    return out
}

/**
 * 扫描 JSDOM 对话框源码中经 dialog preload 使用的通道：
 * HTML 内联脚本里以模板插值写死常量（`ipcRenderer.send('${IPC.X.Y}', ...)`），
 * 这是对话框 preload 白名单的唯一实际调用面。
 */
function collectDialogChannels(channelMap) {
    const callRe = /ipcRenderer\.(send|on|once)\(\s*'\$\{IPC\.([A-Z_]+)\.([A-Z_]+)\}'/g
    const send = []
    const receive = []
    const seen = new Set()
    for (const file of walkTsFiles(DIALOGS_DIR)) {
        const source = readSource(file)
        for (const match of source.matchAll(callRe)) {
            const method = match[1]
            const id = `${match[2]}.${match[3]}`
            const value = channelMap.get(id)
            if (!value) {
                throw new Error(
                    `[preload-whitelist] ${path.relative(ROOT, file)} 的对话框 IPC 调用引用了不存在的常量 IPC.${id}`
                )
            }
            const key = `${method}:${id}`
            if (seen.has(key)) {
                continue
            }
            seen.add(key)
            if (method === 'send') {
                send.push({ id, value })
            } else {
                receive.push({ id, value })
            }
        }
    }
    if (send.length === 0 && receive.length === 0) {
        throw new Error(
            '[preload-whitelist] 未从 src/main/dialogs 扫描到任何对话框 preload 通道（正则失效？）'
        )
    }
    return { send, receive }
}

/** 渲染 `IPC.X.Y,` 形式的数组元素行（末项不带逗号，与仓库 Prettier trailingComma:none 对齐） */
function renderChannelEntries(channels) {
    return channels
        .map((channel, index) => {
            const comma = index === channels.length - 1 ? '' : ','
            return `    IPC.${channel.id}${comma}`
        })
        .join('\n')
}

/** 生成 allowed-channels.generated.ts 全文 */
function renderGeneratedModule(data) {
    const { send, receive, preloadApi, dialogSend, dialogReceive } = data
    return `/**
 * ⚠️ 本文件由 build/generate-preload-whitelist.js 自动生成，禁止手工编辑。
 *
 * 真源：
 * - 主窗口 send/invoke：src/shared/types/ipc.ts 的 IpcRequests 键集合；
 * - 主窗口 on/once：同文件 IpcEvents 键集合；
 * - window.api.* 直连通道：同文件 IpcPreloadApiRequests 键集合（不经窗口白名单）；
 * - 对话框 preload：src/main/dialogs 内 \`ipcRenderer.send/on('\${IPC.X.Y}')\` 实际调用。
 *
 * 生成命令：node build/generate-preload-whitelist.js
 * 一致性守护：tests/unit/preload-whitelist.test.ts（--check 模式，产物漂移即失败）。
 */
import { IPC } from '../shared/ipc-channels'
import type { IpcEventChannel, IpcPreloadApiRequests, IpcSendChannel } from '../shared/types/ipc'

/** IPC 常量表类型（用于校验生成通道都来自常量真源） */
type IpcConstantTable = typeof IPC

/** 全部合法通道字符串联合（IPC 常量表中任意组的任意值） */
type AllIpcChannel = {
    [Group in keyof IpcConstantTable]: IpcConstantTable[Group][keyof IpcConstantTable[Group]]
}[keyof IpcConstantTable]

/** window.api.* 直连通道键类型（来源 IpcPreloadApiRequests） */
type PreloadApiChannel = keyof IpcPreloadApiRequests

/** 渲染层 → 主进程（send / invoke）白名单：来源 IpcRequests，共 ${send.length} 个 */
export const RENDERER_SEND_CHANNELS = [
${renderChannelEntries(send)}
] as const satisfies readonly IpcSendChannel[]

/** 主进程 → 渲染层（on / once）白名单：来源 IpcEvents，共 ${receive.length} 个 */
export const RENDERER_RECEIVE_CHANNELS = [
${renderChannelEntries(receive)}
] as const satisfies readonly IpcEventChannel[]

/** window.api.* 直连通道（不经窗口白名单）：来源 IpcPreloadApiRequests，共 ${preloadApi.length} 个 */
export const PRELOAD_API_CHANNELS = [
${renderChannelEntries(preloadApi)}
] as const satisfies readonly PreloadApiChannel[]

/** 对话框 preload send 白名单：来源 src/main/dialogs 实际调用，共 ${dialogSend.length} 个 */
export const DIALOG_SEND_CHANNELS = [
${renderChannelEntries(dialogSend)}
] as const satisfies readonly AllIpcChannel[]

/** 对话框 preload on/once 白名单：来源 src/main/dialogs 实际调用，共 ${dialogReceive.length} 个 */
export const DIALOG_RECEIVE_CHANNELS = [
${renderChannelEntries(dialogReceive)}
] as const satisfies readonly AllIpcChannel[]

/* ==========================================================================
 * 编译期穷尽性断言（H2「新增 IPC 漏登记即静默丢弃」的编译期兜底）
 *
 * 契约新增通道但未重新执行生成器时，下面的 Exclude<契约通道, 已生成通道> 不为 never，
 * 断言类型解析为 never，= true 赋值会让 tsc 直接编译失败。
 * 运行期兜底：tests/unit/preload-whitelist.test.ts 的「生成产物 ↔ 契约」双向核对。
 * ========================================================================== */

type AssertRendererSendExhaustive =
    Exclude<IpcSendChannel, (typeof RENDERER_SEND_CHANNELS)[number]> extends never ? true : never

/** 编译期断言常量（恒为 true；测试同时做运行期断言） */
export const ASSERT_RENDERER_SEND_EXHAUSTIVE: AssertRendererSendExhaustive = true

type AssertRendererReceiveExhaustive =
    Exclude<IpcEventChannel, (typeof RENDERER_RECEIVE_CHANNELS)[number]> extends never
        ? true
        : never

/** 编译期断言常量（恒为 true；测试同时做运行期断言） */
export const ASSERT_RENDERER_RECEIVE_EXHAUSTIVE: AssertRendererReceiveExhaustive = true

type AssertPreloadApiExhaustive =
    Exclude<PreloadApiChannel, (typeof PRELOAD_API_CHANNELS)[number]> extends never ? true : never

/** 编译期断言常量（恒为 true；测试同时做运行期断言） */
export const ASSERT_PRELOAD_API_EXHAUSTIVE: AssertPreloadApiExhaustive = true
`
}

/** 生成 index.ts 中的白名单块（含生成标记；整体替换标记区间） */
function renderIndexBlock(kind, channels) {
    const markers = INDEX_BLOCK_MARKERS[kind]
    const title =
        kind === 'send' ? '渲染层 → 主进程（send / invoke）' : '主进程 → 渲染层（on / once）'
    const sourceName = kind === 'send' ? 'IpcRequests' : 'IpcEvents'
    const variableName =
        kind === 'send' ? 'ALLOWED_RENDERER_SEND_CHANNELS' : 'ALLOWED_RENDERER_RECEIVE_CHANNELS'
    return `${markers.open}
/**
 * ${title}允许通道：${channels.length} 个。
 * 由 build/generate-preload-whitelist.js 从 shared/types/ipc.ts 的 ${sourceName} 生成，禁止手改。
 */
const ${variableName} = new Set<string>([
${renderChannelEntries(channels)}
])
${markers.close}`
}

/** 按标记整体替换 index.ts 中的白名单块（标记缺失/顺序异常直接抛错，避免静默跳过） */
function replaceIndexBlock(source, kind, blockText) {
    const markers = INDEX_BLOCK_MARKERS[kind]
    const start = source.indexOf(markers.open)
    const end = source.indexOf(markers.close)
    if (start < 0 || end < 0 || end < start) {
        throw new Error(
            `[preload-whitelist] ${path.relative(ROOT, PRELOAD_INDEX_FILE)} 缺少生成标记 ` +
                `${markers.open} / ${markers.close}，无法安全更新白名单块`
        )
    }
    return source.slice(0, start) + blockText + source.slice(end + markers.close.length)
}

/** 计算全部产物的期望内容（不落盘） */
function buildOutputs() {
    const ipcEntries = parseIpcConstantTable()
    const channelMap = buildChannelMap(ipcEntries)
    const send = parseContractChannels('IpcRequests', channelMap)
    const receive = parseContractChannels('IpcEvents', channelMap)
    const preloadApi = parseContractChannels('IpcPreloadApiRequests', channelMap)
    const dialog = collectDialogChannels(channelMap)

    const generatedContent = renderGeneratedModule({
        send,
        receive,
        preloadApi,
        dialogSend: dialog.send,
        dialogReceive: dialog.receive
    })

    const indexOriginal = readSource(PRELOAD_INDEX_FILE)
    let indexContent = replaceIndexBlock(indexOriginal, 'send', renderIndexBlock('send', send))
    indexContent = replaceIndexBlock(indexContent, 'receive', renderIndexBlock('receive', receive))

    return {
        stats: {
            send: send.length,
            receive: receive.length,
            preloadApi: preloadApi.length,
            dialogSend: dialog.send.length,
            dialogReceive: dialog.receive.length
        },
        files: [
            { file: GENERATED_FILE, content: generatedContent },
            { file: PRELOAD_INDEX_FILE, content: indexContent }
        ]
    }
}

function formatStats(stats) {
    return (
        `send=${stats.send} / receive=${stats.receive} / window.api=${stats.preloadApi} / ` +
        `dialogSend=${stats.dialogSend} / dialogReceive=${stats.dialogReceive}`
    )
}

/** 生成并写回（内容未变化时不写，避免无意义 mtime 变化） */
function generate() {
    const { stats, files } = buildOutputs()
    const written = []
    for (const { file, content } of files) {
        const eol = detectEol(file)
        const next = toTargetEol(content, eol)
        const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null
        if (current === next) {
            continue
        }
        fs.writeFileSync(file, next, 'utf-8')
        written.push(path.relative(ROOT, file).replace(/\\/g, '/'))
    }
    console.log(`✅ preload 白名单生成完成（${formatStats(stats)}）`)
    for (const file of written) {
        console.log(`   - 已更新 ${file}`)
    }
    if (written.length === 0) {
        console.log('   - 全部产物已是最新（无文件变更）')
    }
    return stats
}

/** 只校验入库产物与期望内容一致（CI/单测用，不写文件） */
function check() {
    const { stats, files } = buildOutputs()
    const mismatched = []
    for (const { file, content } of files) {
        const eol = detectEol(file)
        const expected = toTargetEol(content, eol)
        const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null
        if (actual !== expected) {
            mismatched.push(path.relative(ROOT, file).replace(/\\/g, '/'))
        }
    }
    if (mismatched.length > 0) {
        console.error(
            `❌ preload 白名单生成产物与契约不一致（${formatStats(stats)}），` +
                `请执行：node build/generate-preload-whitelist.js\n   - 需要重新生成：${mismatched.join('、')}`
        )
        process.exitCode = 1
        return false
    }
    console.log(`✅ preload 白名单生成产物与契约一致（${formatStats(stats)}）`)
    return true
}

function main(argv) {
    const isCheck = argv.includes('--check')
    const unknown = argv.filter((arg) => arg.startsWith('-') && arg !== '--check')
    if (unknown.length > 0) {
        console.error(`[preload-whitelist] 未知参数：${unknown.join(' ')}（仅支持 --check）`)
        process.exitCode = 1
        return
    }
    if (isCheck) {
        check()
        return
    }
    generate()
}

if (require.main === module) {
    try {
        main(process.argv.slice(2))
    } catch (error) {
        // 解析/生成失败时给出单行清晰报错（不打印堆栈），避免 dev/build 链路上难以定位
        console.error(
            `❌ preload 白名单生成失败：${error instanceof Error ? error.message : String(error)}`
        )
        process.exitCode = 1
    }
}

module.exports = { buildOutputs, check, generate }
