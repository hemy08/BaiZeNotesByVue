/**
 * preload 渲染层通道白名单回归测试（2026-11-19，P2 修复）
 *
 * 背景：主窗口 preload 自 2026-11-18 起对渲染层暴露受限 ipcRenderer（send/invoke 与
 * on/once 两组通道白名单）。白名单靠人工收集，若渲染层新增通道而忘记登记，调用会被
 * 静默丢弃且无测试告警。本测试扫描 src/renderer 全部 ipcRenderer 调用（含多行与
 * 变量别名），与白名单做**双向**交叉核对：
 *  1) 渲染层实际调用的通道必须全部在白名单内（否则运行时功能静默失效）；
 *  2) 白名单中的通道必须都有渲染层调用（避免多余放行）。
 * 同时冻结白名单规模（58 / 25），新增通道时需同步更新本测试与 preload 注释。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { IPC } from '../../src/shared/ipc-channels'

const ROOT = process.cwd()
const PRELOAD_SOURCE = fs.readFileSync(path.join(ROOT, 'src/preload/index.ts'), 'utf8')
const GROUPS = IPC as unknown as Record<string, Record<string, string>>

/** 从 preload 源码解析一个白名单 Set 的通道字符串集合（经 IPC 常量映射为字符串） */
function parseChannelSet(setName: string): Set<string> {
    const start = PRELOAD_SOURCE.indexOf(`const ${setName} = new Set<string>([`)
    expect(start, `preload 应定义 ${setName}`).toBeGreaterThanOrEqual(0)
    const end = PRELOAD_SOURCE.indexOf('])', start)
    expect(end).toBeGreaterThan(start)
    const block = PRELOAD_SOURCE.slice(start, end)
    const result = new Set<string>()
    for (const match of block.matchAll(/IPC\.([A-Z_]+)\.([A-Z_]+)/g)) {
        const value = GROUPS[match[1]]?.[match[2]]
        expect(value, `IPC.${match[1]}.${match[2]} 应在通道表中存在`).toBeDefined()
        result.add(value!)
    }
    return result
}

function walkFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry)
        const stat = fs.statSync(full)
        if (stat.isDirectory()) {
            walkFiles(full, acc)
        } else if (/\.(ts|vue)$/.test(entry)) {
            acc.push(full)
        }
    }
    return acc
}

/** 渲染层实际使用的通道：按 send/invoke 与 on/once 分类（解析变量别名常量） */
function collectRendererUsage(): { send: Set<string>; receive: Set<string> } {
    const files = walkFiles(path.join(ROOT, 'src/renderer'))
    const alias = new Map<string, string>()
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8')
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
        const source = fs.readFileSync(file, 'utf8')
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

const SEND_WHITELIST = parseChannelSet('ALLOWED_RENDERER_SEND_CHANNELS')
const RECEIVE_WHITELIST = parseChannelSet('ALLOWED_RENDERER_RECEIVE_CHANNELS')
const usage = collectRendererUsage()

describe('preload 渲染层通道白名单', () => {
    it('should freeze the whitelist sizes (58 send/invoke + 25 on/once)', () => {
        // 新增渲染层通道时必须同步登记白名单并更新本断言（防静默失效）
        expect(SEND_WHITELIST.size).toBe(58)
        expect(RECEIVE_WHITELIST.size).toBe(25)
    })

    it('should cover every send/invoke channel used by the renderer', () => {
        const missing = [...usage.send].filter((channel) => !SEND_WHITELIST.has(channel)).sort()
        expect(missing).toEqual([])
    })

    it('should cover every on/once channel used by the renderer', () => {
        const missing = [...usage.receive]
            .filter((channel) => !RECEIVE_WHITELIST.has(channel))
            .sort()
        expect(missing).toEqual([])
    })

    it('should not whitelist unused send/invoke channels', () => {
        const unused = [...SEND_WHITELIST]
            .filter((channel) => !usage.send.has(channel))
            .sort()
        expect(unused).toEqual([])
    })

    it('should not whitelist unused on/once channels', () => {
        const unused = [...RECEIVE_WHITELIST]
            .filter((channel) => !usage.receive.has(channel))
            .sort()
        expect(unused).toEqual([])
    })

    it('should not expose unrestricted ipcRenderer methods', () => {
        // 受限对象仅覆盖 send/invoke/on/once/removeListener/removeAllListeners
        expect(PRELOAD_SOURCE).not.toMatch(/sendTo:\s*/)
        expect(PRELOAD_SOURCE).not.toMatch(/sendSync:\s*/)
        expect(PRELOAD_SOURCE).not.toMatch(/postMessage:\s*/)
    })
})
