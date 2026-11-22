// @vitest-environment jsdom
/**
 * B1 Wiki 链接 Ctrl/Cmd+Click 动作单测（wiki-link-actions.ts / 对话框状态 / 宿主入口）
 *
 * 覆盖口径：
 * 1. 链接定位 `locateWikiLinkAt`：三种写法、多链接、边界列、空目标；
 * 2. 目标清洗 `cleanWikiLinkTarget` / 路径段安全 `isSafeWikiLinkSegment`：
 *    alias/heading 去除、空目标/绝对路径/UNC/盘符/`..` 段拒绝、非法字符/控制字符/
 *    尾随点空格/Windows 保留设备名拒绝；
 * 3. 三态解析 `resolveWikiLinkCandidates`：根相对 / 源目录相对 / basename / title /
 *    缺失 / 歧义（候选带标题 + 相对路径）；
 * 4. 缺失页创建计划 `planWikiLinkCreation`：根目录 / 子目录已存在 / 目录不存在 /
 *    已存在 / 无工作区 / 非法目标，绝不递归建目录；
 * 5. 创建 IPC `createMissingWikiPage`：复用既有 `IPC.FILE.CREATE_FILE_FOLDER`，
 *    参数顺序 `(name, dirPath, false, '.md')`；失败 / IPC 不可用降级；
 * 6. 动作编排 `performWikiLinkAction`：唯一点击打开、歧义返回候选、缺失返回计划、
 *    非 Markdown 模型忽略、索引不可用降级、目录不存在 blocked；
 * 7. 鼠标事件判定：仅 Ctrl/Cmd + 左键；普通点击/右键不触发；
 * 8. 对话框状态与展示辅助：打开/关闭/忙碌/错误、候选展示项去重与标题回退；
 * 9. 宿主入口 `setupWikiLinkActions`：监听 + 命令注册、Ctrl+Click 弹对话框、
 *    候选与缺失页 DOM 渲染、创建参数、dispose 清理与幂等。
 *
 * 说明：本文件用 jsdom 是因为宿主入口会动态 import + createApp 挂载对话框（与
 * knowledge-dialog / writing-style-dialog 宿主测试同构）；纯函数用例同样在该环境运行。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
    cleanWikiLinkTarget,
    createMissingWikiPage,
    isSafeWikiLinkSegment,
    isWikiLinkModifierClick,
    loadWikiLinkIndex,
    locateWikiLinkAt,
    performWikiLinkAction,
    planWikiLinkCreation,
    readWikiLinkMousePosition,
    resolveWikiLinkCandidates,
    WIKI_LINK_CREATE_EXTENSION,
    type WikiLinkActionEditorLike,
    type WikiLinkActionPosition,
    type WikiLinkCreationPlan
} from '../../src/renderer/src/components/Markdown/wiki-link-actions'
import {
    buildWikiLinkCandidateItems,
    closeWikiLinkActionDialogState,
    openWikiLinkActionDialogState,
    setWikiLinkActionDialogBusy,
    setWikiLinkActionDialogError,
    wikiLinkActionDialogState
} from '../../src/renderer/src/components/Markdown/wiki-link-action-dialog-state'
import {
    disposeWikiLinkActionHost,
    setupWikiLinkActions,
    WIKI_LINK_ACTION_COMMAND_ID,
    WIKI_LINK_ACTION_HOST_ID
} from '../../src/renderer/src/components/Markdown/wiki-link-actions.index'
import { IPC } from '../../src/shared/ipc-channels'
import type { WorkspaceIndexResult } from '../../src/shared/types/ipc'
import type {
    WorkspaceIndexFile,
    WorkspaceIndexSnapshot
} from '../../src/shared/types/workspace-index'

/* ============================ 夹具 ============================ */

const ROOT_PATH = 'E:/notes'

/** 创建快照文件（字段按当前契约给全，无需真正读盘） */
function createFile(spec: {
    relativePath: string
    title?: string
    path?: string
}): WorkspaceIndexFile {
    const relativePath = spec.relativePath
    const name = relativePath.split('/').pop() ?? relativePath
    return {
        path: spec.path ?? `${ROOT_PATH}/${relativePath}`,
        relativePath,
        name,
        title: spec.title ?? name.replace(/\.(?:md|markdown|txt)$/i, ''),
        tags: [],
        links: [],
        size: 0,
        mtimeMs: 0
    }
}

/** 创建索引快照（stats 按文件数给全，避免任何防御分支误判） */
function createSnapshot(files: WorkspaceIndexFile[], rootPath = ROOT_PATH): WorkspaceIndexSnapshot {
    return {
        rootPath,
        generatedAt: 0,
        files,
        tags: [],
        missingLinks: [],
        stats: {
            fileCount: files.length,
            linkCount: 0,
            missingCount: 0,
            ambiguousCount: 0
        }
    }
}

/** 包装为 IPC 返回结构 */
function createIndexResult(snapshot: WorkspaceIndexSnapshot): WorkspaceIndexResult {
    return { ok: true, snapshot, cached: false }
}

/** 在行文本中找到某段子串的中间列（1-based，落在链接区间内） */
function columnInside(lineText: string, needle: string): number {
    const index = lineText.indexOf(needle)
    return index + 1 + Math.floor(needle.length / 2)
}

/** 带「源文件」的文件（用于源目录相对解析阶段） */
function createWorkspaceSnapshot(): WorkspaceIndexSnapshot {
    return createSnapshot([
        createFile({ relativePath: 'a.md', title: '文件 A' }),
        createFile({ relativePath: 'notes/b.md', title: '文件 B' }),
        createFile({ relativePath: 'one/dup.md', title: '重复一' }),
        createFile({ relativePath: 'two/dup.md', title: '重复二' }),
        createFile({ relativePath: 'sub/sibling.md', title: '兄弟文件' }),
        createFile({ relativePath: 'other/sibling.md', title: '别处兄弟' }),
        createFile({ relativePath: 'sub/source.md', title: '子目录源文件' }),
        createFile({ relativePath: 'source.md', title: '源文件' })
    ])
}

/* ============================ 链接定位 ============================ */

describe('locateWikiLinkAt 链接定位', () => {
    it('命中链接区间内任意列并返回 1-based 列区间', () => {
        const lineText = '前文 [[notes/a]] 后文'
        const raw = '[[notes/a]]'
        const startColumn = lineText.indexOf(raw) + 1
        const endColumn = startColumn + raw.length
        const first = locateWikiLinkAt(lineText, startColumn)
        expect(first).not.toBeNull()
        expect(first?.raw).toBe(raw)
        expect(first?.target).toBe('notes/a')
        expect(first?.startColumn).toBe(startColumn)
        expect(first?.endColumn).toBe(endColumn)
        // 区间内最后一个字符列也命中
        expect(locateWikiLinkAt(lineText, endColumn - 1)?.raw).toBe(raw)
        // 链接前后一列不命中
        expect(locateWikiLinkAt(lineText, startColumn - 1)).toBeNull()
        expect(locateWikiLinkAt(lineText, endColumn)).toBeNull()
    })

    it('解析 alias 与 heading（target 只保留 # 与 | 之前的部分）', () => {
        const withAlias = locateWikiLinkAt('[[a/b|别名]]', 3)
        expect(withAlias?.target).toBe('a/b')
        expect(withAlias?.alias).toBe('别名')
        expect(withAlias?.heading).toBe('')

        const withHeading = locateWikiLinkAt('[[笔记/标题#小节]]', 3)
        expect(withHeading?.target).toBe('笔记/标题')
        expect(withHeading?.heading).toBe('小节')

        const both = locateWikiLinkAt('[[目标#标题|别名]]', 3)
        expect(both?.target).toBe('目标')
        expect(both?.heading).toBe('标题')
        expect(both?.alias).toBe('别名')
    })

    it('多链接行只命中列所在的那一条', () => {
        const lineText = '[[one]] 中间 [[two]]'
        const first = locateWikiLinkAt(lineText, columnInside(lineText, '[[one]]'))
        const second = locateWikiLinkAt(lineText, columnInside(lineText, '[[two]]'))
        expect(first?.raw).toBe('[[one]]')
        expect(second?.raw).toBe('[[two]]')
    })

    it('空目标 / 非链接 / 非法列返回 null', () => {
        expect(locateWikiLinkAt('[[#只有标题]]', 3)).toBeNull()
        expect(locateWikiLinkAt('[[|只有别名]]', 3)).toBeNull()
        expect(locateWikiLinkAt('没有链接的一行', 1)).toBeNull()
        expect(locateWikiLinkAt('', 1)).toBeNull()
        expect(locateWikiLinkAt('[[a]]', 0)).toBeNull()
    })
})

/* ============================ 目标清洗 / 路径安全 ============================ */

describe('cleanWikiLinkTarget 目标清洗与路径安全', () => {
    it('去 alias/heading、去 ./ 段、反斜杠归一化为 /', () => {
        const result = cleanWikiLinkTarget('./sub\\page.md#小节|别名')
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.target).toBe('sub/page.md')
        expect(result.segments).toEqual(['sub', 'page.md'])
        expect(result.alias).toBe('别名')
        expect(result.heading).toBe('小节')
    })

    it('拒绝空目标 / 绝对路径 / UNC / 盘符 / .. 段 / 尾随目录', () => {
        expect(cleanWikiLinkTarget('')).toMatchObject({ ok: false, reason: 'empty-target' })
        expect(cleanWikiLinkTarget('|别名')).toMatchObject({
            ok: false,
            reason: 'empty-target'
        })
        expect(cleanWikiLinkTarget('/abs/a')).toMatchObject({
            ok: false,
            reason: 'absolute-path'
        })
        expect(cleanWikiLinkTarget('//server/share/a')).toMatchObject({
            ok: false,
            reason: 'unc-path'
        })
        expect(cleanWikiLinkTarget('C:\\notes\\a')).toMatchObject({
            ok: false,
            reason: 'drive-letter'
        })
        expect(cleanWikiLinkTarget('a/../b')).toMatchObject({
            ok: false,
            reason: 'parent-segment'
        })
        expect(cleanWikiLinkTarget('a/')).toMatchObject({
            ok: false,
            reason: 'missing-filename'
        })
    })

    it('路径段安全：非法字符 / 控制字符 / 尾随点空格 / Windows 保留名一律拒绝', () => {
        expect(isSafeWikiLinkSegment('normal-name.md')).toBe(true)
        expect(isSafeWikiLinkSegment('中文 目录')).toBe(true)
        expect(isSafeWikiLinkSegment('a:b')).toBe(false)
        expect(isSafeWikiLinkSegment('a*b')).toBe(false)
        expect(isSafeWikiLinkSegment('a?b')).toBe(false)
        expect(isSafeWikiLinkSegment('a<b')).toBe(false)
        expect(isSafeWikiLinkSegment('a|b')).toBe(false)
        expect(isSafeWikiLinkSegment('a\u0001b')).toBe(false)
        expect(isSafeWikiLinkSegment('名字.')).toBe(false)
        expect(isSafeWikiLinkSegment('名字 ')).toBe(false)
        expect(isSafeWikiLinkSegment('con')).toBe(false)
        expect(isSafeWikiLinkSegment('NUL.md')).toBe(false)
        expect(isSafeWikiLinkSegment('')).toBe(false)
        expect(isSafeWikiLinkSegment('..')).toBe(false)
    })

    it('目标含非法目录段时整体拒绝（不把危险字符写进 dirPath）', () => {
        expect(cleanWikiLinkTarget('safe/a:b.md')).toMatchObject({
            ok: false,
            reason: 'unsafe-segment'
        })
        expect(cleanWikiLinkTarget('a/../x')).toMatchObject({
            ok: false,
            reason: 'parent-segment'
        })
        const chinese = cleanWikiLinkTarget('中文目录/笔记.md')
        expect(chinese.ok).toBe(true)
        if (chinese.ok) {
            expect(chinese.target).toBe('中文目录/笔记.md')
        }
    })
})

/* ============================ 三态解析 ============================ */

describe('resolveWikiLinkCandidates 三态解析', () => {
    const snapshot = createWorkspaceSnapshot()

    it('唯一命中：工作区根相对路径 + 自动补 .md 扩展名', () => {
        const resolution = resolveWikiLinkCandidates(snapshot, `${ROOT_PATH}/source.md`, 'a')
        expect(resolution.status).toBe('resolved')
        expect(resolution.match).toBe('root-relative')
        expect(resolution.candidates).toHaveLength(1)
        expect(resolution.candidates[0]).toMatchObject({
            path: `${ROOT_PATH}/a.md`,
            relativePath: 'a.md',
            title: '文件 A'
        })
    })

    it('源目录相对：根相对未命中时按当前文件目录解析', () => {
        const resolution = resolveWikiLinkCandidates(
            snapshot,
            `${ROOT_PATH}/sub/source.md`,
            'sibling'
        )
        expect(resolution.status).toBe('resolved')
        expect(resolution.match).toBe('source-relative')
        expect(resolution.candidates[0].path).toBe(`${ROOT_PATH}/sub/sibling.md`)
    })

    it('歧义：同名文件多个时返回全部候选（标题 + 相对路径）', () => {
        const ambiguous = resolveWikiLinkCandidates(snapshot, `${ROOT_PATH}/source.md`, 'dup')
        expect(ambiguous.status).toBe('ambiguous')
        expect(ambiguous.match).toBe('basename-or-title')
        expect(ambiguous.candidates).toHaveLength(2)
        expect(ambiguous.candidates.map((item) => item.relativePath).sort()).toEqual([
            'one/dup.md',
            'two/dup.md'
        ])
        expect(ambiguous.candidates.every((item) => item.title.length > 0)).toBe(true)
    })

    it('缺失：目标不存在时返回 missing 且候选为空', () => {
        const resolution = resolveWikiLinkCandidates(
            snapshot,
            `${ROOT_PATH}/source.md`,
            '并不存在的笔记'
        )
        expect(resolution).toMatchObject({ status: 'missing', candidates: [], match: null })
    })

    it('title 唯一匹配可作为兜底（文件名与链接目标不同）', () => {
        const withTitle = createSnapshot([
            createFile({ relativePath: 'x/random-name.md', title: '罗盘笔记' })
        ])
        const resolution = resolveWikiLinkCandidates(
            withTitle,
            `${ROOT_PATH}/source.md`,
            '罗盘笔记'
        )
        expect(resolution.status).toBe('resolved')
        expect(resolution.candidates[0].path).toBe(`${ROOT_PATH}/x/random-name.md`)
    })
})

/* ============================ 缺失页创建计划 ============================ */

describe('planWikiLinkCreation 缺失页创建计划', () => {
    const snapshot = createWorkspaceSnapshot()

    it('根目录创建：name 去扩展名、dirPath 为工作区根、extension 固定 .md', () => {
        const result = planWikiLinkCreation(snapshot, 'newpage')
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.plan).toMatchObject({
            rootPath: ROOT_PATH,
            fileName: 'newpage',
            relativePath: 'newpage.md',
            dirRelativePath: '',
            dirPath: ROOT_PATH,
            displayPath: 'newpage.md',
            extension: WIKI_LINK_CREATE_EXTENSION
        })
    })

    it('目标自带 .md 扩展名时不会重复添加', () => {
        const result = planWikiLinkCreation(snapshot, 'foo.md')
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.plan.fileName).toBe('foo')
        expect(result.plan.relativePath).toBe('foo.md')
    })

    it('子目录已出现在工作区路径中时允许创建，dirPath 拼接正确', () => {
        const result = planWikiLinkCreation(snapshot, 'notes/新笔记')
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.plan).toMatchObject({
            relativePath: 'notes/新笔记.md',
            dirRelativePath: 'notes',
            dirPath: `${ROOT_PATH}/notes`
        })
    })

    it('目录不存在时拒绝创建（不递归建目录）', () => {
        const result = planWikiLinkCreation(snapshot, '不存在的目录/新笔记')
        expect(result).toMatchObject({
            ok: false,
            reason: 'directory-missing',
            missingDirectory: '不存在的目录'
        })
        // 多级目录：只创建第一级时，第二级同样视为不存在
        const nested = planWikiLinkCreation(snapshot, 'notes/deep/新笔记')
        expect(nested).toMatchObject({
            ok: false,
            reason: 'directory-missing',
            missingDirectory: 'notes/deep'
        })
    })

    it('目录大小写按快照真实路径归一化（大小写敏感平台不拼错目录）', () => {
        const result = planWikiLinkCreation(snapshot, 'NOTES/新笔记')
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.plan.dirRelativePath).toBe('notes')
        expect(result.plan.relativePath).toBe('notes/新笔记.md')
        expect(result.plan.dirPath).toBe(`${ROOT_PATH}/notes`)
    })

    it('目标文件已存在时拒绝（不覆盖）', () => {
        const result = planWikiLinkCreation(snapshot, 'a')
        expect(result).toMatchObject({
            ok: false,
            reason: 'already-exists',
            existingFilePath: `${ROOT_PATH}/a.md`
        })
    })

    it('无工作区 / 非法目标返回对应拒绝原因', () => {
        expect(planWikiLinkCreation(null, 'a')).toMatchObject({ ok: false, reason: 'no-workspace' })
        expect(planWikiLinkCreation(createSnapshot([], ''), 'a')).toMatchObject({
            ok: false,
            reason: 'no-workspace'
        })
        expect(planWikiLinkCreation(snapshot, 'C:\\tmp\\a')).toMatchObject({
            ok: false,
            reason: 'invalid-target'
        })
    })
})

/* ============================ 创建 IPC ============================ */

describe('createMissingWikiPage 复用既有 CREATE_FILE_FOLDER', () => {
    const plan: WikiLinkCreationPlan = {
        rootPath: ROOT_PATH,
        relativePath: 'notes/新笔记.md',
        fileName: '新笔记',
        extension: WIKI_LINK_CREATE_EXTENSION,
        dirRelativePath: 'notes',
        dirPath: `${ROOT_PATH}/notes`,
        displayPath: 'notes/新笔记.md'
    }

    it('按 (name, dirPath, false, .md) 顺序调用既有通道', async () => {
        const invoke = vi.fn().mockResolvedValue({ success: true })
        const result = await createMissingWikiPage(plan, { invokeIpc: { invoke } })
        expect(result).toEqual({ ok: true })
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke).toHaveBeenCalledWith(
            IPC.FILE.CREATE_FILE_FOLDER,
            '新笔记',
            `${ROOT_PATH}/notes`,
            false,
            '.md'
        )
    })

    it('主进程异常时返回 ok=false 与错误信息（不抛出）', async () => {
        const invoke = vi.fn().mockRejectedValue(new Error('磁盘写入失败'))
        const result = await createMissingWikiPage(plan, { invokeIpc: { invoke } })
        expect(result.ok).toBe(false)
        expect(result.error).toContain('磁盘写入失败')
    })

    it('IPC 不可用 / 创建计划非法时降级', async () => {
        await expect(createMissingWikiPage(plan, { invokeIpc: null })).resolves.toEqual({
            ok: false,
            error: 'IPC_UNAVAILABLE'
        })
        await expect(
            createMissingWikiPage({ ...plan, fileName: '' }, { invokeIpc: { invoke: vi.fn() } })
        ).resolves.toEqual({ ok: false, error: 'INVALID_PLAN' })
    })
})

/* ============================ 动作编排 ============================ */

/** 构造只提供模型/位置的编辑器替身（performWikiLinkAction 用） */
function createModelEditor(lineText: string, languageId = 'markdown'): WikiLinkActionEditorLike {
    return {
        getModel: () => ({
            getLineContent: () => lineText,
            getLanguageId: () => languageId
        }),
        getPosition: () => ({ lineNumber: 1, column: 1 })
    }
}

describe('performWikiLinkAction 动作编排', () => {
    it('唯一命中：调用既有打开链路打开目标文件（第 1 行）', async () => {
        const lineText = '参见 [[a]] 说明'
        const openFile = vi.fn().mockResolvedValue(true)
        const outcome = await performWikiLinkAction(
            createModelEditor(lineText),
            { lineNumber: 1, column: columnInside(lineText, '[[a]]') },
            {
                loadIndex: async () => createIndexResult(createWorkspaceSnapshot()),
                openFile,
                getSourcePath: () => `${ROOT_PATH}/source.md`
            }
        )
        expect(outcome.kind).toBe('opened')
        expect(openFile).toHaveBeenCalledWith(`${ROOT_PATH}/a.md`, 1)
        if (outcome.kind === 'opened') {
            expect(outcome.filePath).toBe(`${ROOT_PATH}/a.md`)
            expect(outcome.raw).toBe('[[a]]')
        }
    })

    it('歧义：返回候选清单（标题 + 相对路径）而不是直接打开', async () => {
        const lineText = '[[dup]]'
        const openFile = vi.fn().mockResolvedValue(true)
        const outcome = await performWikiLinkAction(
            createModelEditor(lineText),
            { lineNumber: 1, column: columnInside(lineText, '[[dup]]') },
            {
                loadIndex: async () => createIndexResult(createWorkspaceSnapshot()),
                openFile,
                getSourcePath: () => `${ROOT_PATH}/source.md`
            }
        )
        expect(outcome.kind).toBe('ambiguous')
        expect(openFile).not.toHaveBeenCalled()
        if (outcome.kind === 'ambiguous') {
            expect(outcome.candidates).toHaveLength(2)
            expect(outcome.candidates[0].title.length).toBeGreaterThan(0)
            expect(outcome.candidates[0].relativePath.length).toBeGreaterThan(0)
        }
    })

    it('缺失：返回创建计划（供确认框展示）', async () => {
        const lineText = '[[ghost]]'
        const outcome = await performWikiLinkAction(
            createModelEditor(lineText),
            { lineNumber: 1, column: columnInside(lineText, '[[ghost]]') },
            {
                loadIndex: async () => createIndexResult(createWorkspaceSnapshot()),
                getSourcePath: () => `${ROOT_PATH}/source.md`
            }
        )
        expect(outcome.kind).toBe('missing')
        if (outcome.kind === 'missing') {
            expect(outcome.plan.relativePath).toBe('ghost.md')
            expect(outcome.plan.dirPath).toBe(ROOT_PATH)
        }
    })

    it('缺失但目标目录不存在：返回 create-blocked（directory-missing）', async () => {
        const lineText = '[[不存在目录/新页]]'
        const outcome = await performWikiLinkAction(
            createModelEditor(lineText),
            { lineNumber: 1, column: columnInside(lineText, '[[不存在目录/新页]]') },
            {
                loadIndex: async () => createIndexResult(createWorkspaceSnapshot()),
                getSourcePath: () => `${ROOT_PATH}/source.md`
            }
        )
        expect(outcome).toMatchObject({
            kind: 'create-blocked',
            reason: 'directory-missing',
            missingDirectory: '不存在目录'
        })
    })

    it('非 Markdown 模型 / 非链接位置 / 空模型均忽略', async () => {
        const lineText = '[[a]]'
        const position = { lineNumber: 1, column: columnInside(lineText, '[[a]]') }
        const markdownSnapshot = async (): Promise<WorkspaceIndexResult> =>
            createIndexResult(createWorkspaceSnapshot())

        await expect(
            performWikiLinkAction(createModelEditor(lineText, 'plaintext'), position, {
                loadIndex: markdownSnapshot
            })
        ).resolves.toMatchObject({ kind: 'ignored', reason: 'not-markdown' })

        await expect(
            performWikiLinkAction(createModelEditor('普通文本'), position, {
                loadIndex: markdownSnapshot
            })
        ).resolves.toMatchObject({ kind: 'ignored', reason: 'no-link' })

        await expect(
            performWikiLinkAction({ getModel: () => null }, position, {
                loadIndex: markdownSnapshot
            })
        ).resolves.toMatchObject({ kind: 'ignored', reason: 'no-model' })
    })

    it('索引不可用（未打开工作区 / 加载异常）降级为 unavailable', async () => {
        const lineText = '[[a]]'
        const position = { lineNumber: 1, column: columnInside(lineText, '[[a]]') }

        await expect(
            performWikiLinkAction(createModelEditor(lineText), position, {
                loadIndex: async () => ({ ok: false, code: 'NO_WORKSPACE' })
            })
        ).resolves.toMatchObject({ kind: 'unavailable', reason: 'no-workspace' })

        await expect(
            performWikiLinkAction(createModelEditor(lineText), position, {
                loadIndex: async () => {
                    throw new Error('索引构建失败')
                }
            })
        ).resolves.toMatchObject({ kind: 'unavailable', reason: 'index-error' })
    })
})

/* ============================ 鼠标事件判定 ============================ */

describe('isWikiLinkModifierClick / readWikiLinkMousePosition', () => {
    it('仅 Ctrl/Cmd + 左键触发；普通点击 / 右键 / 缺失事件不触发', () => {
        expect(isWikiLinkModifierClick({ event: { ctrlKey: true } })).toBe(true)
        expect(isWikiLinkModifierClick({ event: { metaKey: true } })).toBe(true)
        expect(isWikiLinkModifierClick({ event: { ctrlKey: false, metaKey: false } })).toBe(false)
        expect(isWikiLinkModifierClick({ event: { ctrlKey: true, leftButton: false } })).toBe(false)
        expect(
            isWikiLinkModifierClick({ event: { ctrlKey: true, browserEvent: { button: 2 } } })
        ).toBe(false)
        expect(
            isWikiLinkModifierClick({ event: { ctrlKey: true, browserEvent: { button: 0 } } })
        ).toBe(true)
        expect(isWikiLinkModifierClick(null)).toBe(false)
        expect(isWikiLinkModifierClick({})).toBe(false)
    })

    it('读取鼠标位置：合法返回 1-based 位置，非法/缺失返回 null', () => {
        expect(
            readWikiLinkMousePosition({ target: { position: { lineNumber: 3, column: 7 } } })
        ).toEqual({ lineNumber: 3, column: 7 })
        expect(readWikiLinkMousePosition({ target: { position: null } })).toBeNull()
        expect(readWikiLinkMousePosition({ target: {} })).toBeNull()
        expect(
            readWikiLinkMousePosition({ target: { position: { lineNumber: 0, column: 1 } } })
        ).toBeNull()
        expect(readWikiLinkMousePosition(null)).toBeNull()
    })
})

/* ============================ 对话框状态 / 展示辅助 ============================ */

describe('wiki-link-action-dialog-state 状态与展示辅助', () => {
    it('open 重置忙碌/错误并设置请求；close 清理；busy/error 可读写', () => {
        setWikiLinkActionDialogBusy(true)
        setWikiLinkActionDialogError('旧错误')
        openWikiLinkActionDialogState({
            kind: 'missing',
            raw: '[[ghost]]',
            target: 'ghost',
            line: 2,
            column: 5,
            plan: {
                rootPath: ROOT_PATH,
                relativePath: 'ghost.md',
                fileName: 'ghost',
                extension: '.md',
                dirRelativePath: '',
                dirPath: ROOT_PATH,
                displayPath: 'ghost.md'
            }
        })
        expect(wikiLinkActionDialogState.visible).toBe(true)
        expect(wikiLinkActionDialogState.request?.kind).toBe('missing')
        expect(wikiLinkActionDialogState.request?.line).toBe(2)
        expect(wikiLinkActionDialogState.busy).toBe(false)
        expect(wikiLinkActionDialogState.error).toBe('')

        setWikiLinkActionDialogBusy(true)
        expect(wikiLinkActionDialogState.busy).toBe(true)
        setWikiLinkActionDialogError('创建失败')
        expect(wikiLinkActionDialogState.error).toBe('创建失败')

        closeWikiLinkActionDialogState()
        expect(wikiLinkActionDialogState.visible).toBe(false)
        expect(wikiLinkActionDialogState.request).toBeNull()
        expect(wikiLinkActionDialogState.busy).toBe(false)
        expect(wikiLinkActionDialogState.error).toBe('')
    })

    it('候选展示项：过滤空路径、按路径去重、标题缺失回退相对路径', () => {
        const items = buildWikiLinkCandidateItems([
            { path: 'E:/notes/a.md', relativePath: 'a.md', title: '标题 A' },
            { path: 'E:\\notes\\A.md', relativePath: 'a.md', title: '重复路径' },
            { path: '', relativePath: 'bad.md', title: '空路径' },
            { path: 'E:/notes/b.md', relativePath: 'b.md', title: '' }
        ])
        expect(items).toHaveLength(2)
        expect(items[0]).toEqual({ path: 'E:/notes/a.md', title: '标题 A', relativePath: 'a.md' })
        expect(items[1]).toEqual({ path: 'E:/notes/b.md', title: 'b.md', relativePath: 'b.md' })
        expect(buildWikiLinkCandidateItems(null)).toEqual([])
    })
})

/* ============================ 宿主入口 ============================ */

/** 宿主联调用的编辑器替身（记录监听/命令与释放次数） */
function createHostEditor(options: { lineText: string; languageId?: string }): {
    editor: WikiLinkActionEditorLike & {
        onMouseDown(listener: (event: unknown) => void): { dispose(): void }
        addAction(descriptor: {
            id: string
            label: string
            run(editor: WikiLinkActionEditorLike): void | Promise<void>
        }): { dispose(): void }
    }
    emitMouseDown: (event: unknown) => void
    actions: Array<{
        id: string
        label: string
        run(editor: WikiLinkActionEditorLike): void | Promise<void>
    }>
    disposeCounts: { mouseDown: number; action: number }
    position: WikiLinkActionPosition
} {
    const lineText = options.lineText
    const languageId = options.languageId ?? 'markdown'
    const listeners: Array<(event: unknown) => void> = []
    const actions: Array<{
        id: string
        label: string
        run(editor: WikiLinkActionEditorLike): void | Promise<void>
    }> = []
    const disposeCounts = { mouseDown: 0, action: 0 }
    const position = { lineNumber: 1, column: columnInside(lineText, '[[') }
    const editor = {
        getModel: () => ({
            getLineContent: () => lineText,
            getLanguageId: () => languageId
        }),
        getPosition: () => position,
        onMouseDown: (listener: (event: unknown) => void) => {
            listeners.push(listener)
            return {
                dispose: () => {
                    disposeCounts.mouseDown += 1
                }
            }
        },
        addAction: (descriptor: {
            id: string
            label: string
            run(editor: WikiLinkActionEditorLike): void | Promise<void>
        }) => {
            actions.push(descriptor)
            return {
                dispose: () => {
                    disposeCounts.action += 1
                }
            }
        }
    }
    return {
        editor,
        emitMouseDown: (event: unknown) => {
            for (const listener of listeners) {
                listener(event)
            }
        },
        actions,
        disposeCounts,
        position
    }
}

/** 构造 Ctrl+Click 事件（位置指向链接内部） */
function createCtrlMouseEvent(position: WikiLinkActionPosition): unknown {
    return {
        event: {
            ctrlKey: true,
            metaKey: false,
            leftButton: true,
            browserEvent: { button: 0 },
            preventDefault: vi.fn()
        },
        target: { position }
    }
}

/**
 * 等待对话框异步挂载 + 渲染完成。
 *
 * 首次触发动作会动态 import `WikiLinkActionDialog.vue`（Vite 仍需异步转换/加载模块），
 * 仅 flushPromises（微任务）不足以跨过真实模块加载，故按 10ms 间隔轮询真实定时器。
 */
async function waitForDialog(): Promise<void> {
    for (let index = 0; index < 100 && !wikiLinkActionDialogState.visible; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10))
        await flushPromises()
    }
    await flushPromises()
    await nextTick()
}

/** 宿主依赖替身：索引固定返回歧义/缺失夹具，打开与 IPC 均注入 */
function createHostDeps(snapshot: WorkspaceIndexSnapshot = createWorkspaceSnapshot()) {
    return {
        loadIndex: vi.fn(async () => createIndexResult(snapshot)),
        openFile: vi.fn(async () => true),
        getSourcePath: () => `${ROOT_PATH}/source.md`
    }
}

beforeEach(() => {
    closeWikiLinkActionDialogState()
    vi.stubGlobal('electron', {
        ipcRenderer: {
            invoke: vi.fn().mockResolvedValue({ success: true }),
            send: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn()
        }
    })
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

afterEach(async () => {
    disposeWikiLinkActionHost()
    await nextTick()
    closeWikiLinkActionDialogState()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

describe('setupWikiLinkActions 宿主入口', () => {
    it('注册 onMouseDown 与命令动作；普通点击不触发动作', async () => {
        const host = createHostEditor({ lineText: '[[dup]]' })
        const deps = createHostDeps()
        const handle = await setupWikiLinkActions(host.editor, deps)
        expect(handle).not.toBeNull()
        expect(handle?.isDisposed).toBe(false)
        expect(host.actions).toHaveLength(1)
        expect(host.actions[0].id).toBe(WIKI_LINK_ACTION_COMMAND_ID)
        expect(host.actions[0].label.length).toBeGreaterThan(0)

        // 普通点击（无 Ctrl/Cmd）不加载索引、不弹对话框
        host.emitMouseDown({
            event: { ctrlKey: false, metaKey: false, leftButton: true },
            target: { position: host.position }
        })
        await flushPromises()
        expect(deps.loadIndex).not.toHaveBeenCalled()
        expect(wikiLinkActionDialogState.visible).toBe(false)

        handle?.dispose()
    })

    it('Ctrl+Click 歧义：挂载对话框、渲染候选（标题 + 相对路径）', async () => {
        const host = createHostEditor({ lineText: '[[dup]]' })
        const deps = createHostDeps()
        const handle = await setupWikiLinkActions(host.editor, deps)
        host.emitMouseDown(createCtrlMouseEvent(host.position))
        await waitForDialog()

        expect(wikiLinkActionDialogState.visible).toBe(true)
        expect(wikiLinkActionDialogState.request?.kind).toBe('ambiguous')
        expect(document.querySelectorAll(`#${WIKI_LINK_ACTION_HOST_ID}`)).toHaveLength(1)
        const candidates = document.querySelectorAll('.btn-wiki-link-candidate')
        expect(candidates).toHaveLength(2)
        expect(candidates[0].textContent).toContain('重复一')
        expect(candidates[0].textContent).toContain('one/dup.md')

        handle?.dispose()
    })

    it('Ctrl+Click 缺失：确认框展示「将创建 ghost.md」，确认后按既有参数创建并关闭', async () => {
        const host = createHostEditor({ lineText: '[[ghost]]' })
        const deps = createHostDeps()
        const handle = await setupWikiLinkActions(host.editor, deps)
        host.emitMouseDown(createCtrlMouseEvent(host.position))
        await waitForDialog()

        expect(wikiLinkActionDialogState.request?.kind).toBe('missing')
        const notice = document.querySelector('.wiki-link-create-notice')
        expect(notice?.textContent).toContain('将创建 ghost.md')

        const createButton = document.querySelector<HTMLButtonElement>('.btn-wiki-link-create')
        expect(createButton).not.toBeNull()
        createButton?.click()
        await waitForDialog()
        await flushPromises()

        const invoke = window.electron?.ipcRenderer?.invoke as unknown as {
            mock: { calls: unknown[][] }
        }
        const createCall = invoke.mock.calls.find((call) => call[0] === IPC.FILE.CREATE_FILE_FOLDER)
        expect(createCall).toBeDefined()
        expect(createCall).toEqual([IPC.FILE.CREATE_FILE_FOLDER, 'ghost', ROOT_PATH, false, '.md'])
        expect(wikiLinkActionDialogState.visible).toBe(false)

        handle?.dispose()
    })

    it('命令动作可通过 editor.addAction 触发（命令面板入口）', async () => {
        const host = createHostEditor({ lineText: '[[ghost]]' })
        const deps = createHostDeps()
        const handle = await setupWikiLinkActions(host.editor, deps)
        await host.actions[0].run(host.editor)
        await waitForDialog()
        expect(deps.loadIndex).toHaveBeenCalled()
        expect(wikiLinkActionDialogState.request?.kind).toBe('missing')
        handle?.dispose()
    })

    it('dispose 释放监听 / 命令 / 宿主且幂等；再次 setup 可正常重挂载', async () => {
        const host = createHostEditor({ lineText: '[[dup]]' })
        const deps = createHostDeps()
        const handle = await setupWikiLinkActions(host.editor, deps)
        host.emitMouseDown(createCtrlMouseEvent(host.position))
        await waitForDialog()
        expect(wikiLinkActionDialogState.visible).toBe(true)

        handle?.dispose()
        await nextTick()
        expect(handle?.isDisposed).toBe(true)
        expect(host.disposeCounts.mouseDown).toBe(1)
        expect(host.disposeCounts.action).toBe(1)
        expect(wikiLinkActionDialogState.visible).toBe(false)
        expect(document.querySelectorAll(`#${WIKI_LINK_ACTION_HOST_ID}`)).toHaveLength(0)

        // dispose 幂等：重复调用不重复释放
        handle?.dispose()
        expect(host.disposeCounts.mouseDown).toBe(1)
        expect(host.disposeCounts.action).toBe(1)

        // 释放后可重新注册（模拟组件重挂载）
        const nextHandle = await setupWikiLinkActions(host.editor, deps)
        expect(nextHandle).not.toBeNull()
        nextHandle?.dispose()
    })

    it('不支持的编辑器（无 onMouseDown / addAction）返回 null', async () => {
        await expect(setupWikiLinkActions({ getModel: () => null }, {})).resolves.toBeNull()
        await expect(setupWikiLinkActions(null, {})).resolves.toBeNull()
    })
})

/* ============================ 索引加载辅助 ============================ */

describe('loadWikiLinkIndex 防御性归一化', () => {
    it('成功返回快照；NO_WORKSPACE / 结构非法 / 异常分别降级', async () => {
        const snapshot = createWorkspaceSnapshot()
        await expect(
            loadWikiLinkIndex({ loadIndex: async () => createIndexResult(snapshot) })
        ).resolves.toEqual({ snapshot, code: null })
        await expect(
            loadWikiLinkIndex({ loadIndex: async () => ({ ok: false, code: 'NO_WORKSPACE' }) })
        ).resolves.toEqual({ snapshot: null, code: 'no-workspace' })
        await expect(
            loadWikiLinkIndex({
                loadIndex: async () => ({ ok: true, snapshot: null })
            } as unknown as Parameters<typeof loadWikiLinkIndex>[0])
        ).resolves.toEqual({ snapshot: null, code: 'index-error' })
        await expect(
            loadWikiLinkIndex({
                loadIndex: async () => {
                    throw new Error('boom')
                }
            })
        ).resolves.toEqual({ snapshot: null, code: 'index-error' })
    })
})
