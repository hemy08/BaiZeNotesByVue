// @vitest-environment jsdom
/**
 * B1 Wiki 链接宿主接线测试：鼠标/命令注册、dispose、无编辑器降级。
 * 只验证宿主编排，不重复纯动作/对话框测试。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/renderer/src/components/Markdown/wiki-link-actions', async () => {
    const actual = await vi.importActual<
        typeof import('../../src/renderer/src/components/Markdown/wiki-link-actions')
    >('../../src/renderer/src/components/Markdown/wiki-link-actions')
    return {
        ...actual,
        performWikiLinkAction: vi.fn(),
        isWikiLinkModifierClick: vi.fn(),
        readWikiLinkMousePosition: vi.fn()
    }
})

import {
    dispatchWikiLinkActionOutcome,
    disposeWikiLinkActionHost,
    setupWikiLinkActions,
    type WikiLinkActionsEditorLike
} from '../../src/renderer/src/components/Markdown/wiki-link-actions.index'
import {
    isWikiLinkModifierClick,
    performWikiLinkAction,
    readWikiLinkMousePosition,
    type WikiLinkActionEditorLike
} from '../../src/renderer/src/components/Markdown/wiki-link-actions'
import { wikiLinkActionDialogState } from '../../src/renderer/src/components/Markdown/wiki-link-action-dialog-state'

function makeEditor(): {
    editor: WikiLinkActionsEditorLike
    mouseListeners: Array<(event: unknown) => void>
    mouseDispose: ReturnType<typeof vi.fn>
    actionDispose: ReturnType<typeof vi.fn>
    lastAction?: {
        id: string
        label: string
        run: (editor: WikiLinkActionEditorLike) => unknown
    }
} {
    const mouseListeners: Array<(event: unknown) => void> = []
    const mouseDispose = vi.fn()
    const actionDispose = vi.fn()
    const result: ReturnType<typeof makeEditor> = {
        editor: {
            getModel: () => null,
            onMouseDown: (listener) => {
                mouseListeners.push(listener)
                return { dispose: mouseDispose }
            },
            addAction: (descriptor) => {
                result.lastAction = descriptor
                return { dispose: actionDispose }
            },
            getPosition: () => ({ lineNumber: 1, column: 1 })
        },
        mouseListeners,
        mouseDispose,
        actionDispose
    }
    return result
}

beforeEach(() => {
    vi.mocked(performWikiLinkAction).mockReset()
    vi.mocked(isWikiLinkModifierClick).mockReset().mockReturnValue(false)
    vi.mocked(readWikiLinkMousePosition).mockReset().mockReturnValue(null)
    disposeWikiLinkActionHost()
})

afterEach(() => {
    disposeWikiLinkActionHost()
    document.body.innerHTML = ''
})

describe('setupWikiLinkActions：注册与降级', () => {
    it('null / 普通对象无 Monaco 方法返回 null', async () => {
        expect(await setupWikiLinkActions(null)).toBeNull()
        expect(await setupWikiLinkActions(undefined)).toBeNull()
        expect(await setupWikiLinkActions({} as WikiLinkActionsEditorLike)).toBeNull()
    })

    it('注册鼠标监听与命令，dispose 幂等释放并清空宿主', async () => {
        const fake = makeEditor()
        const handle = await setupWikiLinkActions(fake.editor)
        expect(handle).not.toBeNull()
        expect(fake.mouseListeners).toHaveLength(1)
        expect(fake.lastAction?.id).toBe('baize.wiki-link.open-at-cursor')
        expect(handle?.isDisposed).toBe(false)

        handle?.dispose()
        expect(handle?.isDisposed).toBe(true)
        expect(fake.mouseDispose).toHaveBeenCalledTimes(1)
        expect(fake.actionDispose).toHaveBeenCalledTimes(1)
        // 幂等
        handle?.dispose()
        expect(fake.mouseDispose).toHaveBeenCalledTimes(1)
    })

    it('普通鼠标点击不执行动作', async () => {
        const fake = makeEditor()
        await setupWikiLinkActions(fake.editor)
        vi.mocked(isWikiLinkModifierClick).mockReturnValue(false)
        fake.mouseListeners[0]({})
        expect(performWikiLinkAction).not.toHaveBeenCalled()
    })

    it('Ctrl/Cmd 点击有位置时执行动作并阻止默认行为', async () => {
        const fake = makeEditor()
        vi.mocked(performWikiLinkAction).mockResolvedValue({
            kind: 'ignored'
        } as never)
        vi.mocked(isWikiLinkModifierClick).mockReturnValue(true)
        vi.mocked(readWikiLinkMousePosition).mockReturnValue({ lineNumber: 2, column: 3 })
        const preventDefault = vi.fn()
        await setupWikiLinkActions(fake.editor)
        fake.mouseListeners[0]({ event: { preventDefault } })
        await Promise.resolve()
        await Promise.resolve()
        expect(preventDefault).toHaveBeenCalledTimes(1)
        expect(performWikiLinkAction).toHaveBeenCalled()
    })

    it('只有命令时也能注册；命令 run 使用编辑器位置', async () => {
        const fake = makeEditor()
        const editor = {
            getModel: fake.editor.getModel,
            addAction: fake.editor.addAction,
            getPosition: fake.editor.getPosition
        }
        vi.mocked(performWikiLinkAction).mockResolvedValue({ kind: 'ignored' } as never)
        const handle = await setupWikiLinkActions(editor)
        expect(handle).not.toBeNull()
        await fake.lastAction?.run(editor)
        expect(performWikiLinkAction).toHaveBeenCalled()
    })

    it('监听注册抛错时仍保留已注册命令', async () => {
        const dispose = vi.fn()
        const editor: WikiLinkActionsEditorLike = {
            getModel: () => null,
            onMouseDown: () => {
                throw new Error('no listener')
            },
            addAction: () => ({ dispose })
        }
        const handle = await setupWikiLinkActions(editor)
        expect(handle).not.toBeNull()
        handle?.dispose()
    })

    it('dispose 时单个 dispose 抛错不影响另一个释放', async () => {
        const editor: WikiLinkActionsEditorLike = {
            getModel: () => null,
            onMouseDown: () => ({
                dispose: () => {
                    throw new Error('mouse dispose failed')
                }
            }),
            addAction: () => ({
                dispose: () => {
                    throw new Error('command dispose failed')
                }
            })
        }
        const handle = await setupWikiLinkActions(editor)
        expect(handle).not.toBeNull()
        expect(() => handle?.dispose()).not.toThrow()
        expect(handle?.isDisposed).toBe(true)
    })

    it('只有 addAction 但注册抛错时返回 null', async () => {
        const editor: WikiLinkActionsEditorLike = {
            getModel: () => null,
            addAction: () => {
                throw new Error('addAction failed')
            }
        }
        expect(await setupWikiLinkActions(editor)).toBeNull()
    })

    it('command 位置为空时不执行动作；显式 label 覆盖生效', async () => {
        const fake = makeEditor()
        const actions: Array<{
            label: string
            run: (editor: WikiLinkActionEditorLike) => unknown
        }> = []
        const editor: WikiLinkActionsEditorLike = {
            getModel: () => null,
            addAction: (descriptor) => {
                actions.push(descriptor)
                return { dispose: vi.fn() }
            },
            getPosition: () => null
        }
        const handle = await setupWikiLinkActions(editor, { actionLabel: '打开知识链接' })
        expect(actions[0].label).toBe('打开知识链接')
        await actions[0].run(editor)
        expect(performWikiLinkAction).not.toHaveBeenCalled()
        handle?.dispose()
        expect(fake.mouseListeners).toHaveLength(0)
    })

    it('鼠标修饰键但位置为空时不执行动作', async () => {
        const fake = makeEditor()
        vi.mocked(isWikiLinkModifierClick).mockReturnValue(true)
        vi.mocked(readWikiLinkMousePosition).mockReturnValue(null)
        await setupWikiLinkActions(fake.editor)
        fake.mouseListeners[0]({})
        await Promise.resolve()
        expect(performWikiLinkAction).not.toHaveBeenCalled()
    })
})

describe('dispatchWikiLinkActionOutcome', () => {
    it('ignored/invalid-target 不打开对话框', async () => {
        await dispatchWikiLinkActionOutcome({ kind: 'ignored' } as never)
        expect(wikiLinkActionDialogState.visible).toBe(false)
        await dispatchWikiLinkActionOutcome({
            kind: 'invalid-target',
            raw: '[[x]]',
            target: 'x',
            line: 1,
            column: 1,
            reason: 'invalid-target'
        } as never)
        expect(wikiLinkActionDialogState.visible).toBe(false)
    })

    it('error 结果写入错误对话框状态', async () => {
        await dispatchWikiLinkActionOutcome({
            kind: 'error',
            message: 'boom'
        } as never)
        expect(wikiLinkActionDialogState.visible).toBe(true)
        expect(wikiLinkActionDialogState.request?.kind).toBe('error')
        expect(wikiLinkActionDialogState.request?.message).toBe('boom')
    })

    it('ambiguous/missing/create-blocked/open-failed/unavailable 映射到对话框状态', async () => {
        const outcomes = [
            {
                kind: 'ambiguous',
                raw: '[[x]]',
                target: 'x',
                line: 1,
                column: 1,
                candidates: []
            },
            {
                kind: 'missing',
                raw: '[[m]]',
                target: 'm',
                line: 2,
                column: 3,
                plan: {
                    rootPath: 'C:/ws',
                    fileName: 'm',
                    dirPath: 'C:/ws',
                    dirRelativePath: '',
                    relativePath: 'm.md',
                    displayPath: 'm.md',
                    extension: '.md'
                }
            },
            {
                kind: 'create-blocked',
                raw: '[[b]]',
                target: 'b',
                line: 1,
                column: 1,
                reason: 'invalid-target'
            },
            {
                kind: 'open-failed',
                raw: '[[f]]',
                target: 'f',
                line: 1,
                column: 1
            },
            {
                kind: 'unavailable',
                raw: '[[u]]',
                target: 'u',
                line: 1,
                column: 1,
                reason: 'no-workspace'
            }
        ]
        const expectedKinds = ['ambiguous', 'missing', 'blocked', 'error', 'error']
        for (let index = 0; index < outcomes.length; index++) {
            await dispatchWikiLinkActionOutcome(outcomes[index] as never)
            expect(wikiLinkActionDialogState.visible).toBe(true)
            expect(wikiLinkActionDialogState.request?.kind).toBe(expectedKinds[index])
        }
        disposeWikiLinkActionHost()
    })
})
