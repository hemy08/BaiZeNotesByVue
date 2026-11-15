/**
 * EventBus 事件名常量运行时完整性测试（ARC-14 补充）
 *
 * 被测模块：src/renderer/src/common/event-bus/event-bus-events.ts
 *
 * 与 tests/unit/ipc-channel-constants.test.ts 的分工：
 * - 既有测试是「文件级」核对：解析常量表做重复值检查、扫描渲染层 EventBus.$on/$emit/$off
 *   字面量、反向核对无死常量；
 * - 本文件是「运行时」补充：直接 import 真实常量对象，验证模块导出完整性、命名规范、
 *   CHANNEL_PLUGIN_TOOL_SHOW 兼容别名，以及历史事件名契约不变。
 *
 * ET-19：原「运行时表 ↔ 源码声明一致」用例已删除——它用 fs 读回本模块源码再与运行时
 * 对象逐项比较，而两者本就来自同一模块、恒等成立（等价于把常量抄两遍），只增加对源码
 * 排版的耦合，不提供真实回归价值；命名/唯一性/契约等有效断言均保留在下方运行时用例中。
 */
import { describe, it, expect } from 'vitest'
import {
    EVENT_BUS,
    CHANNEL_PLUGIN_TOOL_SHOW
} from '../../src/renderer/src/common/event-bus/event-bus-events'

const eventEntries = Object.entries(EVENT_BUS)

describe('EVENT_BUS runtime export', () => {
    it('should export a complete constant table of string event names', () => {
        expect(eventEntries.length).toBeGreaterThan(20)
        for (const [key, value] of eventEntries) {
            expect(key, `常量键 ${key} 必须为大写下划线命名`).toMatch(/^[A-Z][A-Z0-9_]*$/)
            expect(typeof value, `常量 ${key} 的值必须为字符串`).toBe('string')
            expect(value.length, `常量 ${key} 的值不能为空`).toBeGreaterThan(0)
        }
    })

    it('should keep every event name unique', () => {
        const values = eventEntries.map(([, value]) => value)
        expect(new Set(values).size).toBe(values.length)
    })

    it('should use lowercase delimiter-separated event names', () => {
        for (const [key, value] of eventEntries) {
            expect(value, `常量 ${key} 的事件名格式不符合规范：${value}`).toMatch(
                /^[a-z0-9][a-z0-9:-]*$/
            )
        }
    })

    it('should keep CHANNEL_PLUGIN_TOOL_SHOW as an alias of PLUGIN_TOOL_SHOW', () => {
        expect(CHANNEL_PLUGIN_TOOL_SHOW).toBe(EVENT_BUS.PLUGIN_TOOL_SHOW)
        expect(EVENT_BUS.PLUGIN_TOOL_SHOW).toBe('plugin-tools-show')
    })
})

describe('EVENT_BUS historical contract', () => {
    it('should keep the historical event name strings unchanged (历史契约)', () => {
        // 这些事件名是渲染层与既有测试依赖的对外契约，改名需同步全部使用方
        expect(EVENT_BUS.PLUGIN_TOOL_SHOW).toBe('plugin-tools-show')
        expect(EVENT_BUS.PLUGIN_TOOLS_CONTAINER_SHOW).toBe('plugin-tools-container-show')
        expect(EVENT_BUS.WORKSPACE_SHOW).toBe('baize:notes:workspace:show')
        expect(EVENT_BUS.MONACO_INSERT_TEXT).toBe('baize:notes:monaco-editor:insert-text')
        expect(EVENT_BUS.MONACO_REPLACE_TEXT).toBe('monaco-editor-replace-text')
        expect(EVENT_BUS.THEME_UPDATED).toBe('theme-updated')
        expect(EVENT_BUS.MONACO_SAVE_FILE_CONTENT_TO_DISK).toBe(
            'monaco-editor-save-file-content-to-disk'
        )
    })
})
