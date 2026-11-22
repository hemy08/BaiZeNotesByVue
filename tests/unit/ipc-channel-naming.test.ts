/**
 * IPC 通道命名规范防回归测试（2026-11-15 通道命名统一后新增）
 *
 * 规则（见 ../../docs/wiki/06-历史报告/md/14-IPC通道命名统一方案.md）：
 * 1. 统一格式 `baize:<domain>:<name>`（三段、全小写 kebab-case）；
 * 2. domain 必须属于白名单（18 个；1.5.2 E3 新增 ocr 域）；
 * 3. 禁止历史前缀（`baize-notes:` / `baize:notes:`）与无前缀通道；
 * 4. 通道值唯一（与 ipc-channel-constants.test.ts 互为补充）。
 *
 * ET-19：本用例原本用 `fs.readFileSync(ipc-channels.ts)` + 正则解析源码文本来取通道表，
 * 对格式/注释调整过于敏感。`ipc-channels.ts` 是纯常量模块（无任何 import），因此改为
 * 直接 import 运行时常量表，断言对象结构与实际值——等价覆盖命名规范，且不再依赖源码排版。
 * 需要「扫描全仓调用点/零引用」的架构约束仍保留在 ipc-channel-constants.test.ts（只能源码级核对）。
 */
import { describe, it, expect } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels'

/** 允许的领域白名单（与 14 号方案一致） */
const DOMAINS = new Set([
    'window',
    'config',
    'setting',
    'theme',
    'editor',
    'monaco',
    'view',
    'menu',
    'file',
    'fs',
    'navigation',
    'dialog',
    'plugin',
    'render',
    'quick-links',
    'status-bar',
    'system',
    // 1.5.2 E3：图片 OCR（prepare-lang / recognize-image）
    'ocr'
])

/** 统一格式：baize:<domain>:<name> */
const CHANNEL_PATTERN = /^baize:[a-z][a-z-]*:[a-z][a-z0-9-]*$/

interface Entry {
    group: string
    key: string
    value: string
}

/** 展开 IPC 常量表：组 → 键 → 通道字符串 */
function flattenChannels(): Entry[] {
    const entries: Entry[] = []
    for (const [group, groupValue] of Object.entries(IPC)) {
        for (const [key, value] of Object.entries(groupValue as Record<string, string>)) {
            entries.push({ group, key, value })
        }
    }
    return entries
}

const channels = flattenChannels()

describe('IPC 通道命名规范', () => {
    it('白名单领域数量为 18（与 ipc-channels.ts 注释口径一致）', () => {
        // 1.5.2 E3：新增 `ocr` 域（图片 OCR 两个 invoke 通道），白名单 17 → 18；
        // 用断言锁定口径，避免后续增删 domain 时再次出现注释与实现脱节。
        expect(DOMAINS.size).toBe(18)
    })

    it('解析到完整的通道常量表（P2 清理后 ≥80 个）', () => {
        expect(channels.length).toBeGreaterThanOrEqual(80)
    })

    it('所有通道匹配 baize:<domain>:<name> 格式', () => {
        const invalid = channels.filter((c) => !CHANNEL_PATTERN.test(c.value))
        expect(
            invalid,
            `格式不符: ${invalid.map((c) => `${c.group}.${c.key}=${c.value}`).join(', ')}`
        ).toEqual([])
    })

    it('所有通道 domain 属于 18 个白名单', () => {
        const invalid = channels.filter((c) => !DOMAINS.has(c.value.split(':')[1]))
        expect(
            invalid,
            `domain 不在白名单: ${invalid.map((c) => `${c.group}.${c.key}=${c.value}`).join(', ')}`
        ).toEqual([])
    })

    it('不存在历史前缀或无前缀通道', () => {
        const legacy = channels.filter(
            (c) =>
                c.value.startsWith('baize-notes:') ||
                c.value.startsWith('baize:notes:') ||
                !c.value.startsWith('baize:')
        )
        expect(
            legacy,
            `历史前缀残留: ${legacy.map((c) => `${c.group}.${c.key}=${c.value}`).join(', ')}`
        ).toEqual([])
    })

    it('通道值全局唯一', () => {
        const seen = new Map<string, string>()
        const duplicates: string[] = []
        for (const c of channels) {
            const existing = seen.get(c.value)
            if (existing) {
                duplicates.push(`${c.value}（${existing} 与 ${c.group}.${c.key}）`)
            } else {
                seen.set(c.value, `${c.group}.${c.key}`)
            }
        }
        expect(duplicates).toEqual([])
    })

    it('通道值不含多余分隔符（英文小写 + kebab-case）', () => {
        const invalid = channels.filter((c) => /[A-Z_]/.test(c.value) || c.value.includes('::'))
        expect(invalid).toEqual([])
    })
})
