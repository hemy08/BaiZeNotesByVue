/**
 * 文件树传输契约静态护栏（第 2 批契约重构 2.4）
 *
 * 目标（纯文件级静态扫描，不 import 主进程运行时模块）：
 * 1. shared `FileItem` 声明 `id: string` 必填（主进程实际下发稳定 id，历史以 as 断言绕过）；
 * 2. shared `FileTreePayload` 存在且 = `FileItem[]`（FILE_SYSTEM_DATA 的 JSON.parse 形状）；
 * 3. 主进程构造目录树的两处对象字面量（directory-tree.scanDirectoryTree 的
 *    items.push 与 path-utils.BuildFileTree 的根节点）字段 ⊆ FileItem 字段集合，
 *    且不再使用 `as FileItem` 绕过类型检查（字段缺失会在编译期暴露）；
 * 4. 渲染层解析整树 JSON 时使用同一传输类型（ResourceManager.vue → FileTreePayload），
 *    UI 类型 FileSysItem 显式从 FileItem 派生；
 * 5. 主进程 app-state 的活动文件类型改用 shared FileProperties（本地 StoreFileProperties 已删）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const SHARED_FILE_TYPE = path.join(ROOT, 'src', 'shared', 'types', 'file.ts')
// 结构优化第 5 批 5.5：scanDirectoryTree 实现位于 directory-tree.ts 拆分出的 scan 子模块
const DIRECTORY_TREE = path.join(
    ROOT,
    'src',
    'main',
    'utils',
    'file-utils',
    'directory-tree-scan.ts'
)
const PATH_UTILS = path.join(ROOT, 'src', 'main', 'utils', 'file-utils', 'path-utils.ts')
const APP_STATE = path.join(ROOT, 'src', 'main', 'utils', 'app-state.ts')
const RESOURCE_MANAGER_TS = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'components',
    'ResourceManager',
    'resource-manager.ts'
)
const RESOURCE_MANAGER_VUE = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'components',
    'ResourceManager',
    'ResourceManager.vue'
)

function readSource(file: string): string {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** 解析接口字段：{ 字段名 → 是否可选 } */
function parseInterfaceFields(file: string, interfaceName: string): Map<string, boolean> {
    const source = readSource(file)
    const marker = `export interface ${interfaceName} {`
    const start = source.indexOf(marker)
    expect(start, `${file} 应定义 ${interfaceName}`).toBeGreaterThanOrEqual(0)
    const rest = source.slice(start + marker.length)
    const end = rest.indexOf('\n}')
    expect(end, `${interfaceName} 应有闭合大括号`).toBeGreaterThan(0)
    const fields = new Map<string, boolean>()
    for (const line of rest.slice(0, end).split('\n')) {
        const match = line.match(/^\s{4}([A-Za-z_$][\w$]*)(\?)?:/)
        if (match) {
            fields.set(match[1], match[2] === '?')
        }
    }
    return fields
}

/** 从源码片段中提取对象字面量字段名（只取给定字段白名单内的行） */
function extractObjectKeys(
    region: string,
    allowedFields: readonly string[]
): Record<string, boolean> {
    const found: Record<string, boolean> = {}
    for (const field of allowedFields) {
        const pattern = new RegExp(`^\\s{8,}${field}:`, 'm')
        if (pattern.test(region)) {
            found[field] = true
        }
    }
    return found
}

const FILE_ITEM_FIELDS = [
    'id',
    'name',
    'path',
    'type',
    'isDirectory',
    'fileExtension',
    'children'
] as const

describe('shared 文件树传输契约（FileItem / FileTreePayload）', () => {
    it('FileItem 应声明必填 id 与 fileExtension（主进程实际下发字段）', () => {
        const fields = parseInterfaceFields(SHARED_FILE_TYPE, 'FileItem')
        expect(fields.get('id')).toBe(false) // 非可选
        expect(fields.get('fileExtension')).toBe(false)
        expect(fields.get('isDirectory')).toBe(false)
        expect(fields.get('children')).toBe(false)
        expect([...fields.keys()]).toEqual(expect.arrayContaining([...FILE_ITEM_FIELDS]))
    })

    it('FileTreePayload 应存在且等价于 FileItem[]', () => {
        const source = readSource(SHARED_FILE_TYPE)
        expect(source.includes('export type FileTreePayload = FileItem[]')).toBe(true)
    })

    it('FileProperties 应仍保留跨进程打开文件所需字段', () => {
        const fields = parseInterfaceFields(SHARED_FILE_TYPE, 'FileProperties')
        expect(fields.get('name')).toBe(false)
        expect(fields.get('path')).toBe(false)
        expect(fields.get('type')).toBe(false)
        expect(fields.get('content')).toBe(true) // 可选
        expect(fields.get('encoding')).toBe(true) // 可选
    })
})

describe('主进程目录树构造对象 ⊆ FileItem 字段', () => {
    it('directory-tree.scanDirectoryTree 的 items.push 应覆盖全部 FileItem 必填字段且不再 as 断言', () => {
        const source = readSource(DIRECTORY_TREE)
        const start = source.indexOf('async function scanDirectoryTree')
        expect(start).toBeGreaterThanOrEqual(0)
        const end = source.indexOf('return items', start)
        expect(end).toBeGreaterThan(start)
        const region = source.slice(start, end)
        // 防回归：历史 `as FileItem` 绕过类型检查的写法必须消失
        expect(region.includes('as FileItem')).toBe(false)
        const keys = extractObjectKeys(region, FILE_ITEM_FIELDS)
        expect(Object.keys(keys).sort()).toEqual([...FILE_ITEM_FIELDS].sort())
    })

    it('path-utils.BuildFileTree 根节点应携带 id / fileExtension 并与 FileItem 字段一致', () => {
        const source = readSource(PATH_UTILS)
        const start = source.indexOf('const directory: FileItem = {')
        expect(start).toBeGreaterThanOrEqual(0)
        const end = source.indexOf('\n    }', start)
        expect(end).toBeGreaterThan(start)
        const region = source.slice(start, end)
        const keys = extractObjectKeys(region, FILE_ITEM_FIELDS)
        expect(Object.keys(keys).sort()).toEqual([...FILE_ITEM_FIELDS].sort())
    })
})

describe('渲染层使用同一传输类型', () => {
    it('ResourceManager.vue 解析整树 JSON 应使用 shared FileTreePayload', () => {
        const source = readSource(RESOURCE_MANAGER_VUE)
        expect(source).toContain('FileTreePayload')
        expect(source).toContain('as FileTreePayload')
        expect(source).toContain("from '../../../../shared/types'")
    })

    it('resource-manager.ts 的 FileSysItem 应显式从 FileItem 派生（仅扩展 UI 字段）', () => {
        const source = readSource(RESOURCE_MANAGER_TS)
        expect(source).toContain('export interface FileSysItem extends Omit<FileItem')
        expect(source).toContain('isExpanded')
        expect(source).toContain('import type { FileItem, MarkdownTOC }')
    })
})

describe('主进程活动文件类型统一引用 shared FileProperties', () => {
    it('app-state.ts 应使用 shared FileProperties 且已删除本地 StoreFileProperties', () => {
        const source = readSource(APP_STATE)
        // 本地类型定义与字段使用都应消失（注释里说明历史来源不算残留）
        expect(source.includes('interface StoreFileProperties {')).toBe(false)
        expect(source.includes('_currentActiveFile: StoreFileProperties')).toBe(false)
        expect(source).toContain(
            "import type { FileItem, FileProperties } from '../../shared/types'"
        )
        expect(source).not.toContain('interface FileProperties {')
    })
})
