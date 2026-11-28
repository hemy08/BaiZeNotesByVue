/**
 * B4 Wiki 链接重命名自动更新单测（临时工作区，不启动 Electron）：
 * - 重命名前计划收集、重命名后应用；
 * - `[[target]]` / `[[target|alias]]` / `[[target#heading]]` 保留 alias/heading；
 * - 目录相对写法、扩展名保留、BOM/CRLF 保留；
 * - 无引用/越界/旧文件自身/重复位置跳过；
 * - 上限与失败降级语义。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as iconv from 'iconv-lite'
import {
    applyWikiLinkRenamePlan,
    buildWikiLinkRenamePlan,
    findSourcesForRename,
    updateWikiLinksForRename,
    wikiLinkRenameInternals
} from '../../src/main/utils/wiki-link-rename'
import { buildWorkspaceIndex } from '../../src/main/utils/workspace-index'
// 1.5.7 LLM Wiki L1（T1.3）：注入工作区模式，验证 raw/ 只读目录不写回链接
import { setSystemSettingProvider } from '../../src/main/utils/providers'
import { SYSTEM_SETTING_FALLBACK } from '../../src/shared/constants/system-defaults'
import type { SystemSetting } from '../../src/shared/types/system'

let root = ''

function write(relativePath: string, content: string): string {
    const fullPath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf8')
    return fullPath
}

function read(relativePath: string): string {
    return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-wiki-rename-'))
})

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
})

describe('buildWikiLinkRenamePlan + applyWikiLinkRenamePlan', () => {
    it('重命名后更新 basename 链接，保留 alias/heading', async () => {
        write('old.md', '# Old')
        write(
            'source.md',
            ['[[old]]', '[[old|别名]]', '[[old#标题]]', '[[old#标题|别名]]', '[[other]]'].join('\n')
        )
        write('other.md', '# Other')

        const oldPath = path.join(root, 'old.md')
        const newPath = path.join(root, 'new-name.md')
        const plan = await buildWikiLinkRenamePlan(root, oldPath, newPath)
        const applied = await applyWikiLinkRenamePlan(plan)

        expect(applied.updatedFiles).toBe(1)
        expect(applied.replacements).toBe(4)
        const content = read('source.md')
        expect(content).toContain('[[new-name]]')
        expect(content).toContain('[[new-name|别名]]')
        expect(content).toContain('[[new-name#标题]]')
        expect(content).toContain('[[new-name#标题|别名]]')
        expect(content).toContain('[[other]]')
        fs.renameSync(oldPath, newPath)
    })

    it('目录相对链接使用源目录到新路径的相对写法', async () => {
        write('a/old.md', '# Old')
        write('source.md', '[[a/old]]')
        write('b/new-place.md', '# New')
        const plan = await buildWikiLinkRenamePlan(
            root,
            path.join(root, 'a/old.md'),
            path.join(root, 'b/new-place.md')
        )
        expect(plan.updates.length).toBe(1)
        expect(plan.updates[0].content).toContain('[[b/new-place]]')
    })

    it('原标题含目录时保留目录相对写法；带扩展名则保留扩展名', async () => {
        write('a/old.md', '# Old')
        write('a/source.md', ['[[sub/old]]', '[[sub/old.md]]'].join('\n'))
        write('a/sub/old.md', '# dup')
        const plan = await buildWikiLinkRenamePlan(
            root,
            path.join(root, 'a/old.md'),
            path.join(root, 'a/new.md')
        )
        // 快照中第一条 [[sub/old]] 解析到 a/sub/old.md，不应被更新；第二条同理。
        expect(plan.updates).toEqual([])
    })

    it('保留 BOM 与 CRLF，并按原编码写回', async () => {
        write('old.md', '# Old')
        write('source.md', '\uFEFF[[old]]\r\n第二行\r\n')
        const plan = await buildWikiLinkRenamePlan(
            root,
            path.join(root, 'old.md'),
            path.join(root, 'new.md')
        )
        expect(plan.updates).toHaveLength(1)
        expect(plan.updates[0].content).toContain('\r\n')
        expect(plan.updates[0].content).toContain('[[new]]')
        expect(plan.updates[0].bom).toBe('utf-8')
        await applyWikiLinkRenamePlan(plan)
        const bytes = fs.readFileSync(path.join(root, 'source.md'))
        expect(bytes[0]).toBe(0xef)
        expect(bytes[1]).toBe(0xbb)
        expect(bytes[2]).toBe(0xbf)
        expect(bytes.subarray(3).toString('utf8')).toBe('[[new]]\r\n第二行\r\n')
    })

    it('GBK 来源文件按原编码写回，不损坏中文', async () => {
        write('old.md', '# Old')
        const sourcePath = path.join(root, 'source.md')
        fs.writeFileSync(sourcePath, iconv.encode('中文[[old]]结尾', 'gbk'))
        const plan = await buildWikiLinkRenamePlan(
            root,
            path.join(root, 'old.md'),
            path.join(root, 'new.md')
        )
        expect(plan.updates).toHaveLength(1)
        expect(plan.updates[0].encoding).toBe('gbk')
        await applyWikiLinkRenamePlan(plan)
        const bytes = fs.readFileSync(sourcePath)
        expect(iconv.decode(bytes, 'gbk')).toBe('中文[[new]]结尾')
        // 若不是 GBK 而是 UTF-8，中文会被解码成替换字符/长度不同
        expect(bytes.includes(Buffer.from('中文', 'utf8'))).toBe(false)
    })

    it('无引用时不产生更新', async () => {
        write('old.md', '# Old')
        write('source.md', 'plain text')
        const plan = await buildWikiLinkRenamePlan(
            root,
            path.join(root, 'old.md'),
            path.join(root, 'new.md')
        )
        expect(plan.updates).toEqual([])
        expect(plan.replacementCount).toBe(0)
    })

    it('old 文件自身链接不被写入（重命名后旧路径不存在）', async () => {
        write('old.md', '# Old\n[[old]]')
        const plan = await buildWikiLinkRenamePlan(
            root,
            path.join(root, 'old.md'),
            path.join(root, 'new.md')
        )
        expect(plan.updates).toEqual([])
        expect(plan.skipped).toContain('source-renamed:old.md')
    })

    it('越界 old/new 路径返回空计划', async () => {
        write('a.md', '# A')
        const outside = path.join(os.tmpdir(), 'outside-wiki.md')
        const plan1 = await buildWikiLinkRenamePlan(root, outside, path.join(root, 'b.md'))
        expect(plan1.updates).toEqual([])
        expect(plan1.skipped).toContain('old-path-outside-root')
        const plan2 = await buildWikiLinkRenamePlan(root, path.join(root, 'a.md'), outside)
        expect(plan2.updates).toEqual([])
        expect(plan2.skipped).toContain('new-path-outside-root')
    })

    it('一站式 updateWikiLinksForRename 应用计划', async () => {
        write('old.md', '# Old')
        write('source.md', '[[old]]')
        const result = await updateWikiLinksForRename(
            root,
            path.join(root, 'old.md'),
            path.join(root, 'renamed.md')
        )
        expect(result.plan.updates).toHaveLength(1)
        expect(result.applied.updatedFiles).toBe(1)
        expect(read('source.md')).toBe('[[renamed]]')
    })

    it('findSourcesForRename 返回命中来源', async () => {
        write('old.md', '# Old')
        write('source.md', '[[old]]')
        write('other.md', '[[other]]')
        const snapshot = await buildWorkspaceIndex(root)
        const sources = findSourcesForRename(snapshot, path.join(root, 'old.md'))
        expect(sources.map((file) => file.relativePath)).toEqual(['source.md'])
    })
})

describe('纯 helper 边界', () => {
    it('splitWikiLinkRaw / buildReplacementLink', () => {
        const split = wikiLinkRenameInternals.splitWikiLinkRaw('[[old#h|别名]]')
        expect(split).toEqual({ target: 'old', heading: '#h', alias: '|别名' })
        expect(
            wikiLinkRenameInternals.buildReplacementLink(
                '[[old#h|别名]]',
                path.join(root, 'a.md'),
                path.join(root, 'b.md')
            )
        ).toBe('[[b#h|别名]]')
    })

    it('非法链接返回 null', () => {
        expect(wikiLinkRenameInternals.buildReplacementLink('old', 'a.md', 'b.md')).toBeNull()
        expect(wikiLinkRenameInternals.buildReplacementLink('[[]]', 'a.md', 'b.md')).toBeNull()
    })

    it('applyLinksToContent 位置不匹配时跳过（防旧快照误改）', () => {
        const applied = wikiLinkRenameInternals.applyLinksToContent(
            'no link',
            path.join(root, 'a.md'),
            [
                {
                    target: 'old',
                    raw: '[[old]]',
                    line: 1,
                    column: 1,
                    status: 'resolved',
                    resolvedPath: path.join(root, 'old.md')
                }
            ],
            path.join(root, 'new.md')
        )
        expect(applied.count).toBe(0)
        expect(applied.content).toBe('no link')
    })
})

describe('LLM Wiki 模式：raw/ 只读目录不写回 Wiki 链接（T1.3）', () => {
    /** 构造一条指向 updates 的计划（仅覆盖应用阶段，不依赖索引） */
    function buildApplyPlan(): Parameters<typeof applyWikiLinkRenamePlan>[0] {
        const rawSource = write('raw/source.md', '[[old]]')
        const wikiSource = write('wiki/source.md', '[[old]]')
        return {
            rootPath: root,
            oldPath: path.join(root, 'old.md'),
            newPath: path.join(root, 'new.md'),
            updates: [
                {
                    sourcePath: rawSource,
                    content: '[[new]]',
                    encoding: 'utf-8',
                    bom: null,
                    replacementCount: 1
                },
                {
                    sourcePath: wikiSource,
                    content: '[[new]]',
                    encoding: 'utf-8',
                    bom: null,
                    replacementCount: 2
                }
            ],
            skipped: [],
            replacementCount: 3,
            truncated: false
        }
    }

    it('llm-wiki 模式：raw/ 来源跳过写回并计入 failedFiles，wiki/ 来源正常写回', async () => {
        setSystemSettingProvider(
            () =>
                ({
                    ...SYSTEM_SETTING_FALLBACK,
                    workspaceMode: 'llm-wiki'
                }) as unknown as SystemSetting
        )
        try {
            const plan = buildApplyPlan()
            const applied = await applyWikiLinkRenamePlan(plan)
            expect(applied.updatedFiles).toBe(1)
            expect(applied.replacements).toBe(2)
            expect(applied.failedFiles).toHaveLength(1)
            expect(applied.failedFiles[0]).toBe(path.join(root, 'raw/source.md'))
            expect(read('raw/source.md')).toBe('[[old]]')
            expect(read('wiki/source.md')).toBe('[[new]]')
        } finally {
            setSystemSettingProvider(null)
        }
    })

    it('traditional 模式：raw/wiki 来源均照常写回（行为与 1.5.6 一致）', async () => {
        const plan = buildApplyPlan()
        const applied = await applyWikiLinkRenamePlan(plan)
        expect(applied.updatedFiles).toBe(2)
        expect(applied.failedFiles).toEqual([])
        expect(read('raw/source.md')).toBe('[[new]]')
        expect(read('wiki/source.md')).toBe('[[new]]')
    })
})
