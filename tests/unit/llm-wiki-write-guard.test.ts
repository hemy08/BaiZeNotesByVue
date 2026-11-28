/**
 * 1.5.7 LLM Wiki L1（T1.3）：工作区写入守卫单测（`src/main/utils/security.ts` 新增段）
 *
 * 覆盖：
 * 1. `resolveWorkspaceMode`：provider 未注入/读取异常/非法值一律回落 traditional；
 *    provider 返回 llm-wiki 时正确解析；
 * 2. `isWorkspaceRawTarget`：`raw/` 子树、`raw` 目录本身命中；`wiki/`、相似前缀目录
 *    （`raw-notes`）、工作区根、非法入参不命中；Windows 下大小写不敏感；
 * 3. `assertWorkspaceWritable`：traditional 模式零影响；llm-wiki 模式拒绝 `raw/` 下
 *    写入/重命名/删除目标并抛既有 `PathAccessDeniedError`，`wiki/` 与根目录文件放行；
 *    显式传入 mode 参数优先于 provider。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({
    shell: { openExternal: vi.fn() },
    BrowserWindow: class {}
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { appState } from '../../src/main/utils/app-state'
import { setSystemSettingProvider } from '../../src/main/utils/providers'
import {
    assertWorkspaceWritable,
    isWorkspaceRawTarget,
    PathAccessDeniedError,
    resolveWorkspaceMode
} from '../../src/main/utils/security'
import { SYSTEM_SETTING_FALLBACK } from '../../src/shared/constants/system-defaults'
import type { SystemSetting } from '../../src/shared/types/system'

let workspaceRoot = ''

beforeEach(() => {
    appState._resetForTesting()
    workspaceRoot = path.join(os.tmpdir(), 'baize-llm-wiki-guard-ws')
    setSystemSettingProvider(null)
})

afterEach(() => {
    setSystemSettingProvider(null)
    appState._resetForTesting()
})

/** 注入系统设置 provider（workspaceMode 可指定） */
function injectWorkspaceMode(workspaceMode: unknown): void {
    setSystemSettingProvider(
        () => ({ ...SYSTEM_SETTING_FALLBACK, workspaceMode }) as unknown as SystemSetting
    )
}

describe('resolveWorkspaceMode：系统设置读取（单一真源 + 安全回落）', () => {
    it('provider 未注入时回落 traditional', () => {
        expect(resolveWorkspaceMode()).toBe('traditional')
    })

    it('provider 返回 llm-wiki 时解析为 llm-wiki', () => {
        injectWorkspaceMode('llm-wiki')
        expect(resolveWorkspaceMode()).toBe('llm-wiki')
    })

    it('provider 返回非法值/缺省时回落 traditional', () => {
        injectWorkspaceMode('unknown-mode')
        expect(resolveWorkspaceMode()).toBe('traditional')
        injectWorkspaceMode(undefined)
        expect(resolveWorkspaceMode()).toBe('traditional')
        injectWorkspaceMode(42)
        expect(resolveWorkspaceMode()).toBe('traditional')
    })

    it('provider 抛异常时回落 traditional（不阻断写盘路径）', () => {
        setSystemSettingProvider(() => {
            throw new Error('config store unavailable')
        })
        expect(resolveWorkspaceMode()).toBe('traditional')
    })
})

describe('isWorkspaceRawTarget：raw/ 目标判定', () => {
    // 注意：workspaceRoot 在 beforeEach 中创建，路径必须在用例运行时计算（不能在 describe
    // 收集阶段用空串拼接，否则得到相对路径）。
    const rawPath = (relative = 'source.pdf'): string => path.join(workspaceRoot, 'raw', relative)
    const wikiPath = (relative = 'topic.md'): string => path.join(workspaceRoot, 'wiki', relative)

    it('raw/ 子树与 raw 目录本身均命中', () => {
        expect(isWorkspaceRawTarget(workspaceRoot, rawPath())).toBe(true)
        expect(isWorkspaceRawTarget(workspaceRoot, path.join(workspaceRoot, 'raw'))).toBe(true)
        expect(isWorkspaceRawTarget(workspaceRoot, rawPath('sub/x.md'))).toBe(true)
    })

    it('wiki/、相似前缀目录与工作区根不命中', () => {
        expect(isWorkspaceRawTarget(workspaceRoot, wikiPath())).toBe(false)
        expect(
            isWorkspaceRawTarget(workspaceRoot, path.join(workspaceRoot, 'raw-notes', 'x.md'))
        ).toBe(false)
        expect(isWorkspaceRawTarget(workspaceRoot, path.join(workspaceRoot, 'note.md'))).toBe(false)
        expect(isWorkspaceRawTarget(workspaceRoot, workspaceRoot)).toBe(false)
    })

    it('非法根/目标入参一律不命中（交由既有 Path Guard 处理）', () => {
        for (const input of [undefined, null, 42, {}, '', 'relative/path']) {
            expect(isWorkspaceRawTarget(input, rawPath()), String(input)).toBe(false)
            expect(isWorkspaceRawTarget(workspaceRoot, input), String(input)).toBe(false)
        }
    })

    it('词法折叠 `..`：raw 内文件用 .. 逃逸后不命中', () => {
        expect(
            isWorkspaceRawTarget(
                workspaceRoot,
                path.join(workspaceRoot, 'raw', '..', 'wiki', 'a.md')
            )
        ).toBe(false)
    })

    it('Windows 盘符大小写不敏感：RAW/ 大写变体同样命中', () => {
        if (process.platform !== 'win32') {
            return
        }
        const variant = path.join(workspaceRoot, 'RAW', 'Source.PDF')
        expect(isWorkspaceRawTarget(workspaceRoot, variant)).toBe(true)
    })
})

describe('assertWorkspaceWritable：模式矩阵', () => {
    // 同上：路径在用例运行时基于 beforeEach 创建的工作区根计算
    const rawPath = (): string => path.join(workspaceRoot, 'raw', 'source.pdf')
    const wikiPath = (): string => path.join(workspaceRoot, 'wiki', 'topic.md')
    const rootFilePath = (): string => path.join(workspaceRoot, 'schema.md')

    /** 断言 fn 抛出既有的 PathAccessDeniedError（返回该异常便于继续断言字段） */
    function capturePathDenied(fn: () => void): PathAccessDeniedError {
        let caught: unknown = null
        try {
            fn()
        } catch (error) {
            caught = error
        }
        expect(caught).toBeInstanceOf(PathAccessDeniedError)
        return caught as PathAccessDeniedError
    }

    it('traditional 模式对 raw/ 目标零影响', () => {
        injectWorkspaceMode('traditional')
        expect(() => assertWorkspaceWritable(workspaceRoot, rawPath())).not.toThrow()
    })

    it('llm-wiki 模式拒绝 raw/ 子树（抛既有 PathAccessDeniedError）', () => {
        capturePathDenied(() => assertWorkspaceWritable(workspaceRoot, rawPath(), 'llm-wiki'))
        capturePathDenied(() =>
            assertWorkspaceWritable(workspaceRoot, path.join(workspaceRoot, 'raw'), 'llm-wiki')
        )
    })

    it('llm-wiki 模式放行 wiki/ 与工作区根文件', () => {
        expect(() => assertWorkspaceWritable(workspaceRoot, wikiPath(), 'llm-wiki')).not.toThrow()
        expect(() =>
            assertWorkspaceWritable(workspaceRoot, rootFilePath(), 'llm-wiki')
        ).not.toThrow()
    })

    it('缺省 mode 实时读取 provider：llm-wiki 时生效、traditional 时不生效', () => {
        injectWorkspaceMode('llm-wiki')
        capturePathDenied(() => assertWorkspaceWritable(workspaceRoot, rawPath()))
        injectWorkspaceMode('traditional')
        expect(() => assertWorkspaceWritable(workspaceRoot, rawPath())).not.toThrow()
    })

    it('根路径非法/为空时不做额外拦截（既有 Path Guard 兜底）', () => {
        expect(() => assertWorkspaceWritable('', rawPath(), 'llm-wiki')).not.toThrow()
        expect(() => assertWorkspaceWritable('relative-root', rawPath(), 'llm-wiki')).not.toThrow()
    })

    it('路径拒绝异常保留被拒绝的原始路径（供调用方提示/日志）', () => {
        const target = rawPath()
        const error = capturePathDenied(() =>
            assertWorkspaceWritable(workspaceRoot, target, 'llm-wiki')
        )
        expect(error.filePath).toBe(target)
    })
})
