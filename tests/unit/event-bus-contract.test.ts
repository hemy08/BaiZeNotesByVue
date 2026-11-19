/**
 * EventBus 事件「谁发 / 谁收」契约测试（结构优化第 4 批 4.3 / M5 防回归）
 *
 * 纯文件级核对（fs 读源文件 + 正则解析，不依赖运行时模块）：
 * 1. 常量表（EVENT_BUS）与契约表（EVENT_BUS_CONTRACT）键集合完全一致；
 * 2. 契约中声明的 emitters / receivers 文件真实存在，且确实参与该事件；
 * 3. 源码中每一处发射/订阅点都登记在契约里（双向防漂移）：
 *    - 发射：`EventBus.$emit(EVENT_BUS.X)`
 *    - 订阅：`EventBus.$on(EVENT_BUS.X)` / useEventBus 的 `onEventBus(EVENT_BUS.X)`
 *      （动态事件名 `fileSelectedEvent: EVENT_BUS.X` 视为订阅方声明）
 * 4. 每个事件至少一个发射方；无订阅方的空发事件必须在契约中写明 note。
 *
 * 为什么用静态扫描：契约描述的是「文件级收发关系」，运行时 import 只能拿到事件名，
 * 看不到调用点分布；静态扫描能在事件被迁移/删除后立即指出契约腐化（对齐
 * tests/unit/ipc-channel-constants.test.ts 的既有做法）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { EVENT_BUS } from '../../src/renderer/src/common/event-bus/event-bus-events'
import {
    EVENT_BUS_CONTRACT,
    type EventBusEventKey
} from '../../src/renderer/src/common/event-bus/event-bus-contract'

const ROOT = path.resolve(__dirname, '../..')
const RENDERER_SRC = path.join(ROOT, 'src', 'renderer', 'src')
/** 契约与常量文件自身不参与扫描（注释里会出现事件名示例） */
const SELF_FILES = new Set([
    path.join(RENDERER_SRC, 'common', 'event-bus', 'event-bus-events.ts'),
    path.join(RENDERER_SRC, 'common', 'event-bus', 'event-bus-contract.ts')
])

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

/** 渲染层源文件（排除 EVENT_BUS 常量表/契约表自身） */
const rendererFiles = walk(RENDERER_SRC).filter((file) => !SELF_FILES.has(file))

/** 绝对路径 → 契约中的相对路径（正斜杠） */
function toContractPath(file: string): string {
    return path.relative(RENDERER_SRC, file).replace(/\\/g, '/')
}

function toSorted(values: Iterable<string>): string[] {
    return [...new Set(values)].sort()
}

/** 事件常量键（排除兼容别名导出） */
const eventKeys = Object.keys(EVENT_BUS) as EventBusEventKey[]
const contractKeys = Object.keys(EVENT_BUS_CONTRACT) as EventBusEventKey[]

/** 扫描结果：key → 发射/订阅文件集合 */
function scanEventSites(): {
    emitters: Map<string, string[]>
    receivers: Map<string, string[]>
} {
    const emitters = new Map<string, string[]>()
    const receivers = new Map<string, string[]>()
    for (const file of rendererFiles) {
        const content = fs.readFileSync(file, 'utf-8')
        const relative = toContractPath(file)
        for (const key of eventKeys) {
            const emitPattern = new RegExp(
                `EventBus\\.\\$emit(?:<[^>]*>)?\\(\\s*EVENT_BUS\\.${key}\\b`
            )
            if (emitPattern.test(content)) {
                emitters.set(key, [...(emitters.get(key) ?? []), relative])
            }
            const subscribePattern = new RegExp(
                `(?:\\$on|onEventBus)(?:<[^>]*>)?\\(\\s*EVENT_BUS\\.${key}\\b`
            )
            // ShowHtmlView / ShowPdfEditor 经 useFileViewerState 的 fileSelectedEvent
            // 选项动态传入事件名，视为该文件的订阅声明
            const dynamicSubscribePattern = new RegExp(
                `fileSelectedEvent\\s*:\\s*EVENT_BUS\\.${key}\\b`
            )
            if (subscribePattern.test(content) || dynamicSubscribePattern.test(content)) {
                receivers.set(key, [...(receivers.get(key) ?? []), relative])
            }
        }
    }
    return { emitters, receivers }
}

const { emitters, receivers } = scanEventSites()

describe('EventBus 事件契约（M5）', () => {
    it('事件常量与契约键集合完全一致（24 个事件都有收发说明）', () => {
        // 第 4 批基线：EVENT_BUS 常量表 24 个事件；新增/删除事件时必须同步契约与报告
        expect(eventKeys).toHaveLength(24)
        expect(toSorted(contractKeys)).toEqual(toSorted(eventKeys))
    })

    it('契约声明的发射/订阅文件真实存在', () => {
        const missing: string[] = []
        for (const key of eventKeys) {
            const entry = EVENT_BUS_CONTRACT[key]
            for (const relative of [...entry.emitters, ...entry.receivers]) {
                if (!fs.existsSync(path.join(RENDERER_SRC, relative))) {
                    missing.push(`${key} → ${relative}`)
                }
            }
        }
        expect(missing, '契约引用了不存在的文件').toEqual([])
    })

    it('每个事件至少有一个发射方（无死常量）', () => {
        const dead = eventKeys.filter((key) => EVENT_BUS_CONTRACT[key].emitters.length === 0)
        expect(dead, '以下事件没有登记任何发射方').toEqual([])
    })

    it('无订阅方的空发事件必须在契约中说明原因（当前仅 MONACO_SWITCH_EXPLORER）', () => {
        const undocumented = eventKeys.filter((key) => {
            const entry = EVENT_BUS_CONTRACT[key]
            return entry.receivers.length === 0 && !entry.note
        })
        expect(undocumented, '空发事件缺少 note 说明').toEqual([])
    })

    it('契约 emitters 与源码实际发射点完全一致', () => {
        const mismatches: string[] = []
        for (const key of eventKeys) {
            const declared = toSorted(EVENT_BUS_CONTRACT[key].emitters)
            const actual = toSorted(emitters.get(key) ?? [])
            if (JSON.stringify(declared) !== JSON.stringify(actual)) {
                mismatches.push(
                    `${key}：契约=${JSON.stringify(declared)} 实际=${JSON.stringify(actual)}`
                )
            }
        }
        expect(mismatches, '契约发射方与源码不一致（新增/迁移发射点请同步契约）').toEqual([])
    })

    it('契约 receivers 与源码实际订阅点完全一致', () => {
        const mismatches: string[] = []
        for (const key of eventKeys) {
            const declared = toSorted(EVENT_BUS_CONTRACT[key].receivers)
            const actual = toSorted(receivers.get(key) ?? [])
            if (JSON.stringify(declared) !== JSON.stringify(actual)) {
                mismatches.push(
                    `${key}：契约=${JSON.stringify(declared)} 实际=${JSON.stringify(actual)}`
                )
            }
        }
        expect(mismatches, '契约订阅方与源码不一致（新增/迁移订阅点请同步契约）').toEqual([])
    })

    it('渲染层不再手写 EventBus.$on / $off（统一使用 useEventBus）', () => {
        // M5 目标：8 个消费方手写 on/off 已全部迁移到 useEventBus；EventBus 本体与
        // useEventBus composable 内部实现除外，业务代码不得再出现 $on/$off。
        const offenders: string[] = []
        const allowed = new Set(['common/event-bus/event-bus.ts', 'composables/useEventBus.ts'])
        for (const file of rendererFiles) {
            const relative = toContractPath(file)
            if (allowed.has(relative)) {
                continue
            }
            const content = fs.readFileSync(file, 'utf-8')
            if (/EventBus\.\$(?:on|off)\s*[<(]/.test(content)) {
                offenders.push(relative)
            }
        }
        expect(offenders, '以下文件仍手写 EventBus.$on/$off，请迁移到 useEventBus').toEqual([])
    })
})
