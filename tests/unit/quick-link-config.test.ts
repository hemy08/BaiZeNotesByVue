/**
 * quick-link-config.ts 单元测试
 * 覆盖：默认链接、按 order 排序、position 兼容补全、保存往返、增删改、
 * 重置默认、存储接线、损坏配置备份重建
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'

// 顶层 mock：electron（app-paths 需要 getPath('home')）
const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: { home: `${base}/baize-vitest-quick-link/home` } as Record<string, string>,
        packaged: false,
        appPath: `${base}/baize-vitest-quick-link/app`
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => electronState.paths[name]),
        getAppPath: vi.fn(() => electronState.appPath),
        get isPackaged() {
            return electronState.packaged
        }
    },
    BrowserWindow: class {}
}))

vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})

// 让 theme-registry 目录扫描返回空（主题目录不存在），避免依赖磁盘状态
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

import { FakeStore } from './helpers/fake-store'
import {
    getQuickLinks,
    saveQuickLinks,
    addQuickLink,
    updateQuickLink,
    deleteQuickLink,
    resetToDefault,
    normalizeQuickLinkItems,
    inferQuickLinkIconType,
    type QuickLinkItem
} from '../../src/main/config/quick-link-config'

function makeLink(overrides: Partial<QuickLinkItem> = {}): QuickLinkItem {
    return {
        id: 'x',
        name: 'X',
        type: 'url',
        path: 'https://example.com/',
        icon: 'text',
        iconContent: 'X',
        enabled: true,
        order: 1,
        position: 'left',
        ...overrides
    }
}

// 直接注入存储数据（绕过公开 API，用于构造异常状态）
function injectLinks(links: Array<Partial<QuickLinkItem>>): void {
    FakeStore.data.set('quick-link-config', new Map<string, unknown>([['quickLinks', { links }]]))
}

describe('quick-link-config', () => {
    beforeEach(() => {
        FakeStore.resetAll()
    })

    describe('default quick links', () => {
        it('should return three default links sorted by order', () => {
            const links = getQuickLinks()
            expect(links).toHaveLength(3)
            expect(links.map((l) => l.id)).toEqual(['deepseek', 'wenxin', 'chatgpt'])
            expect(links.map((l) => l.order)).toEqual([1, 2, 3])
        })

        it('should have valid default link fields', () => {
            const links = getQuickLinks()
            for (const link of links) {
                expect(link.type).toBe('url')
                expect(link.enabled).toBe(true)
                expect(link.position).toBe('left')
                expect(link.path).toMatch(/^https:\/\//)
            }
            expect(links[0].name).toBe('DeepSeek')
            expect(links[0].iconContent).toBe('DS')
        })
    })

    describe('getQuickLinks sorting and compatibility', () => {
        it('should sort links by order regardless of stored order', () => {
            injectLinks([
                { ...makeLink({ id: 'c', order: 3 }) },
                { ...makeLink({ id: 'a', order: 1 }) },
                { ...makeLink({ id: 'b', order: 2 }) }
            ])
            expect(getQuickLinks().map((l) => l.id)).toEqual(['a', 'b', 'c'])
        })

        it('should backfill position with left for legacy links', () => {
            injectLinks([
                {
                    id: 'legacy',
                    name: 'L',
                    type: 'url',
                    path: 'https://l.com',
                    icon: 'text',
                    iconContent: 'L',
                    enabled: true,
                    order: 1
                } as QuickLinkItem
            ])
            const links = getQuickLinks()
            expect(links).toHaveLength(1)
            expect(links[0].position).toBe('left')
        })
    })

    describe('save / add / update / delete / reset', () => {
        it('should roundtrip a custom link list through save', () => {
            const custom = [makeLink({ id: 'a', order: 2 }), makeLink({ id: 'b', order: 1 })]
            saveQuickLinks(custom)
            expect(getQuickLinks().map((l) => l.id)).toEqual(['b', 'a'])
        })

        it('should append a link with order = length + 1', () => {
            addQuickLink(makeLink({ id: 'new', order: 99 }))
            const links = getQuickLinks()
            expect(links).toHaveLength(4)
            const added = links.find((l) => l.id === 'new')
            expect(added).toBeDefined()
            expect(added!.order).toBe(4)
        })

        it('should update an existing link by id', () => {
            updateQuickLink(makeLink({ id: 'deepseek', name: 'DS2', path: 'https://new.example/' }))
            const links = getQuickLinks()
            const updated = links.find((l) => l.id === 'deepseek')
            expect(updated!.name).toBe('DS2')
            expect(updated!.path).toBe('https://new.example/')
        })

        it('should ignore update for an unknown id', () => {
            const before = getQuickLinks()
            updateQuickLink(makeLink({ id: 'ghost', name: 'Ghost' }))
            expect(getQuickLinks()).toEqual(before)
        })

        it('should delete a link and renumber remaining orders', () => {
            deleteQuickLink('wenxin')
            const links = getQuickLinks()
            expect(links.map((l) => l.id)).toEqual(['deepseek', 'chatgpt'])
            expect(links.map((l) => l.order)).toEqual([1, 2])
        })

        it('should ignore delete for an unknown id', () => {
            const before = getQuickLinks()
            deleteQuickLink('ghost')
            expect(getQuickLinks()).toEqual(before)
        })

        it('should reset to default links', () => {
            saveQuickLinks([makeLink({ id: 'only' })])
            resetToDefault()
            const links = getQuickLinks()
            expect(links).toHaveLength(3)
            expect(links.map((l) => l.id)).toEqual(['deepseek', 'wenxin', 'chatgpt'])
        })
    })

    describe('store wiring', () => {
        it('should create the store with expected name and cwd', async () => {
            // 模块级缓存会复用 Store 实例；用 resetModules + 动态导入拿到全新实例
            vi.resetModules()
            const mod = await import('../../src/main/config/quick-link-config')
            mod.getQuickLinks()
            const instance = FakeStore.instances.find((s) => s.name === 'quick-link-config')
            expect(instance).toBeDefined()
            expect(instance!.cwd).toBe(path.join(electronState.paths.home, '.baizenotes', 'config'))
        })
    })

    describe('P1-FE-04 normalizeQuickLinkItems（设置对话框保存入参归一化）', () => {
        it('should normalize a valid payload into QuickLinkItem shape', () => {
            const normalized = normalizeQuickLinkItems([
                {
                    id: 'github',
                    name: '  GitHub  ',
                    path: ' https://github.com ',
                    type: 'url',
                    icon: 'text',
                    iconContent: 'G',
                    enabled: true,
                    order: 9,
                    position: 'left'
                }
            ])
            expect(normalized).toEqual([
                {
                    id: 'github',
                    name: 'GitHub',
                    path: 'https://github.com',
                    type: 'url',
                    icon: 'text',
                    iconContent: 'G',
                    enabled: true,
                    order: 1,
                    position: 'left'
                }
            ])
        })

        it('should return null for non-array or oversized payloads', () => {
            expect(normalizeQuickLinkItems(undefined)).toBeNull()
            expect(normalizeQuickLinkItems({ links: [] })).toBeNull()
            expect(normalizeQuickLinkItems('not-an-array')).toBeNull()
            const tooMany = Array.from({ length: 51 }, (_, index) => ({
                name: `L${index}`,
                path: `https://example.com/${index}`
            }))
            expect(normalizeQuickLinkItems(tooMany)).toBeNull()
        })

        it('should drop entries without name/path and non-object entries', () => {
            const normalized = normalizeQuickLinkItems([
                null,
                'bad-entry',
                { name: '', path: 'https://a.com' },
                { name: '无地址' },
                { name: '合法', path: 'https://ok.com' }
            ])
            expect(normalized).toHaveLength(1)
            expect(normalized![0].name).toBe('合法')
            expect(normalized![0].order).toBe(1)
        })

        it('should renumber order by final position and backfill defaults', () => {
            const normalized = normalizeQuickLinkItems([
                {
                    id: 'b',
                    name: 'B',
                    path: 'https://b.com',
                    order: 9,
                    enabled: false,
                    position: 'right'
                },
                { id: 'a', name: 'A', path: 'https://a.com' }
            ])
            expect(normalized!.map((link) => [link.id, link.order])).toEqual([
                ['b', 1],
                ['a', 2]
            ])
            expect(normalized![0].enabled).toBe(false)
            expect(normalized![0].position).toBe('right')
            // 缺省值：url / left / enabled
            expect(normalized![1]).toMatchObject({
                type: 'url',
                position: 'left',
                enabled: true
            })
        })

        it('should generate unique ids and normalize enum fields', () => {
            const normalized = normalizeQuickLinkItems([
                { name: 'A', path: 'C:\\tools\\a.exe' },
                { name: 'B', path: 'https://b.com', type: 'exe', position: 'up' },
                { name: 'C', path: 'https://c.com', id: 'quick-link-1' }
            ])
            const ids = normalized!.map((link) => link.id)
            expect(new Set(ids).size).toBe(ids.length)
            expect(normalized![0].type).toBe('url')
            expect(normalized![1].type).toBe('exe')
            expect(normalized![1].position).toBe('left')
        })

        it('should infer icon type when icon is not in the whitelist', () => {
            const normalized = normalizeQuickLinkItems([
                {
                    name: 'Svg',
                    path: 'https://a.com',
                    icon: 'auto',
                    iconContent: '<svg viewBox="0 0 1 1"></svg>'
                },
                {
                    name: 'Img',
                    path: 'https://b.com',
                    icon: 'auto',
                    iconContent: 'https://x.com/icon.png'
                },
                { name: 'Emoji', path: 'https://c.com', icon: 'auto', iconContent: '🌐' },
                { name: 'Text', path: 'https://d.com', icon: 'auto', iconContent: 'DS' }
            ])
            expect(normalized!.map((link) => link.icon)).toEqual(['svg', 'img', 'emoji', 'text'])
            expect(normalized!.map((link) => link.iconContent)).toEqual([
                '<svg viewBox="0 0 1 1"></svg>',
                'https://x.com/icon.png',
                '🌐',
                'DS'
            ])
        })

        it('should infer icon type by content', () => {
            expect(inferQuickLinkIconType('')).toBe('text')
            expect(inferQuickLinkIconType('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(
                'svg'
            )
            expect(inferQuickLinkIconType('data:image/png;base64,AAAA')).toBe('img')
            expect(inferQuickLinkIconType('./images/icon.jpg')).toBe('img')
            expect(inferQuickLinkIconType('🌐')).toBe('emoji')
            expect(inferQuickLinkIconType('文')).toBe('emoji')
            expect(inferQuickLinkIconType('DS')).toBe('text')
        })

        it('should roundtrip through saveQuickLinks/getQuickLinks', () => {
            const normalized = normalizeQuickLinkItems([
                {
                    id: 'zhihu',
                    name: '知乎',
                    path: 'https://www.zhihu.com',
                    icon: 'emoji',
                    iconContent: '知'
                }
            ])
            saveQuickLinks(normalized!)
            expect(getQuickLinks()).toEqual(normalized)
        })
    })

    describe('corrupted config recovery (D-6/FUN-11)', () => {
        it('should back up the corrupt file and rebuild defaults', async () => {
            const configDir = path.join(electronState.paths.home, '.baizenotes', 'config')
            const configFile = path.join(configDir, 'quick-link-config.json')
            fs.mkdirSync(configDir, { recursive: true })
            fs.writeFileSync(configFile, '{ broken json', 'utf-8')

            FakeStore.failOnceFor = 'quick-link-config'
            vi.resetModules()
            const mod = await import('../../src/main/config/quick-link-config')

            const links = mod.getQuickLinks()
            expect(links.map((l) => l.id)).toEqual(['deepseek', 'wenxin', 'chatgpt'])

            const files = fs.readdirSync(configDir)
            const backup = files.find((f) => /^quick-link-config\.json\.corrupt-\d+$/.test(f))
            expect(backup).toBeDefined()
            expect(fs.existsSync(configFile)).toBe(false)
        })
    })
})
