/**
 * IPC 通道 / EventBus 事件名 常量 ↔ 源码交叉核对测试（ARC-03 / ARC-14 防回归）
 *
 * 纯文件级核对（fs 读源文件 + 正则解析，不依赖运行时模块）：
 * 1. 解析 src/shared/ipc-channels.ts 的 IPC 常量表：不允许重复值；
 * 2. 正向：src 下所有 ipcMain/ipcRenderer/webContents.send/ipcListenerManager.register
 *    调用点的首参不得出现通道字符串字面量（必须引用常量）；
 * 3. 反向：常量表中的每一个通道都必须至少在 src 中被 IPC.<组>.<键> 引用（无死常量）；
 * 4. 解析 event-bus-events.ts 的 EVENT_BUS 常量表：同样做重复值 / 正向 / 反向核对。
 *
 * ET-19 说明：本文件 5 处 `readFileSync(src)` 属于架构护栏的「必要静态扫描」，无法改为
 * 运行时断言——正向（调用点不得出现通道字面量）、反向（常量零引用）、sendSync 禁用
 * 都需要遍历全仓源码；运行时 import 只能拿到常量值，看不到调用点与引用关系。
 * 解析基于固定形态正则（常量表 4 空格缩进、`IPC.X.Y` 引用），对注释/空行变化不敏感；
 * 已知限制：若整体改写常量表排版（如改成单行对象）会命中解析失败，届时需同步本文件。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'src')
const IPC_CONSTANTS_FILE = path.join(SRC, 'shared', 'ipc-channels.ts')
const EVENT_CONSTANTS_FILE = path.join(
    SRC,
    'renderer',
    'src',
    'common',
    'event-bus',
    'event-bus-events.ts'
)

interface ConstantEntry {
    group: string
    key: string
    value: string
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

/** 解析 `export const NAME = { ... } as const` 的两层常量表（组 → 键 → 值） */
function parseConstantTable(file: string, rootName: string): ConstantEntry[] {
    const content = fs.readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    const entries: ConstantEntry[] = []
    // 顶层键（如 EVENT_BUS 的单层表）直接归属根常量；嵌套组表（IPC）按组归类
    let group: string | null = rootName
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

const allSrcFiles = (): string[] =>
    walk(SRC).filter((f) => f !== IPC_CONSTANTS_FILE && f !== EVENT_CONSTANTS_FILE)

// 通道/事件名字面量形态过滤：小写开头且含 '-' 或 ':'（例外：'keydown'），
// 用于剔除 globalShortcut register('F9'/'Ctrl+N') 之类的非通道字符串。
const CHANNEL_LIKE = /^[a-z][a-z0-9]*(?:[-:][a-z0-9]+)+$/

function collectIpcLiterals(files: string[]): Array<{ file: string; literal: string }> {
    const found: Array<{ file: string; literal: string }> = []
    const callRe =
        /(?:ipcRenderer|ipcMain)\.(?:on|once|handle|invoke|send|sendSync|removeListener|removeAllListeners|removeHandler)\(\s*(['"])([^'"]+)\1/g
    const webRe = /webContents\.send\(\s*(['"])([^'"]+)\1/g
    const regRe = /(?:registerHandleOnce|registerOnce|register)\(\s*(['"])([^'"]+)\1/g
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8')
        for (const re of [callRe, webRe, regRe]) {
            let m: RegExpExecArray | null
            while ((m = re.exec(content)) !== null) {
                const literal = m[2]
                // 排除嵌入 HTML 模板字符串内的 '${IPC.X}' 插值（运行时才求值，不算字面量）
                if (literal.startsWith('${')) {
                    continue
                }
                if (CHANNEL_LIKE.test(literal) || literal === 'keydown') {
                    found.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), literal })
                }
            }
        }
    }
    return found
}

function collectEventBusLiterals(files: string[]): Array<{ file: string; literal: string }> {
    const found: Array<{ file: string; literal: string }> = []
    const re = /EventBus\.\$(?:on|emit|off)\(\s*(['"])([^'"]+)\1/g
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8')
        let m: RegExpExecArray | null
        while ((m = re.exec(content)) !== null) {
            found.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), literal: m[2] })
        }
    }
    return found
}

function countReferences(files: string[], token: string): number {
    let count = 0
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8')
        let idx = 0
        while ((idx = content.indexOf(token, idx)) !== -1) {
            count++
            idx += token.length
        }
    }
    return count
}

describe('IPC 通道常量交叉核对（ARC-03）', () => {
    const ipcEntries = parseConstantTable(IPC_CONSTANTS_FILE, 'IPC')
    const srcFiles = allSrcFiles()

    it('ipc-channels.ts 应导出完整的常量表', () => {
        // P2 死代码清理后通道数从 123 收敛到 86（16 个报告死通道 + C-07/对话框
        // 删除连带产生的死通道），阈值按实际数量下调但仍防止正则/解析失效后空跑
        expect(ipcEntries.length).toBeGreaterThan(80)
    })

    it('通道值不允许重复定义', () => {
        const seen = new Map<string, string>()
        const dup: string[] = []
        for (const { group, key, value } of ipcEntries) {
            const existing = seen.get(value)
            if (existing) {
                dup.push(`${value}（${existing} 与 ${group}.${key}）`)
            } else {
                seen.set(value, `${group}.${key}`)
            }
        }
        expect(dup, `重复通道值：\n${dup.join('\n')}`).toEqual([])
    })

    it('src 下所有 IPC 调用点不得出现通道字符串字面量（必须引用常量）', () => {
        const literals = collectIpcLiterals(srcFiles)
        const values = new Set(ipcEntries.map((e) => e.value))
        const bad = literals.filter((l) => !values.has(l.literal))
        expect(
            bad.map((l) => `${l.file}：'${l.literal}'`),
            '发现未收口到常量的通道字面量'
        ).toEqual([])
    })

    it('常量表中的每个通道都必须在 src 中被 IPC.<组>.<键> 实际引用（无死常量）', () => {
        const dead: string[] = []
        for (const { group, key } of ipcEntries) {
            if (countReferences(srcFiles, `IPC.${group}.${key}`) === 0) {
                dead.push(`IPC.${group}.${key}`)
            }
        }
        expect(dead, '以下常量零引用').toEqual([])
    })

    // CQ-10 / PF-11 / ARC-21 防回归：同步 IPC 会阻塞渲染进程，
    // src 下（含主进程/preload/渲染层）不得再出现 ipcRenderer.sendSync 调用。
    it('src 下不得使用 ipcRenderer.sendSync 同步 IPC', () => {
        const offenders: string[] = []
        for (const file of srcFiles) {
            const content = fs.readFileSync(file, 'utf-8')
            if (/ipcRenderer\s*\.\s*sendSync\s*\(/.test(content)) {
                offenders.push(path.relative(ROOT, file).replace(/\\/g, '/'))
            }
        }
        expect(offenders, '发现同步 IPC 调用（应改为 invoke/handle）').toEqual([])
    })
})

describe('EventBus 事件名常量交叉核对（ARC-14）', () => {
    const eventEntries = parseConstantTable(EVENT_CONSTANTS_FILE, 'EVENT_BUS')
    const rendererFiles = walk(path.join(SRC, 'renderer')).filter((f) => f !== EVENT_CONSTANTS_FILE)

    it('event-bus-events.ts 应导出完整的常量表', () => {
        expect(eventEntries.length).toBeGreaterThan(20)
    })

    it('事件名不允许重复定义', () => {
        const seen = new Map<string, string>()
        const dup: string[] = []
        for (const { group, key, value } of eventEntries) {
            const existing = seen.get(value)
            if (existing) {
                dup.push(`${value}（${existing} 与 ${group}.${key}）`)
            } else {
                seen.set(value, `${group}.${key}`)
            }
        }
        expect(dup, `重复事件名：\n${dup.join('\n')}`).toEqual([])
    })

    it('渲染层所有 EventBus 订阅/发射点不得出现事件名字面量（必须引用常量）', () => {
        const literals = collectEventBusLiterals(rendererFiles)
        const values = new Set(eventEntries.map((e) => e.value))
        const bad = literals.filter((l) => !values.has(l.literal))
        expect(
            bad.map((l) => `${l.file}：'${l.literal}'`),
            '发现未收口到常量的事件名字面量'
        ).toEqual([])
    })

    it('常量表中的每个事件名都必须在渲染层被 EVENT_BUS.<键> 实际引用（无死常量）', () => {
        const dead: string[] = []
        for (const { key } of eventEntries) {
            if (countReferences(rendererFiles, `EVENT_BUS.${key}`) === 0) {
                dead.push(`EVENT_BUS.${key}`)
            }
        }
        expect(dead, '以下常量零引用').toEqual([])
    })
})
