/**
 * CQ-7：file-operations.ts 拆分后的模块边界 smoke 测试。
 *
 * 守护两件事：
 * 1. 公开 API 完整：迁移到 directory-tree / file-encoding / shared 的函数，仍能从
 *    file-operations 导入，且与源模块是同一函数引用（re-export 不产生包装函数）；
 * 2. 依赖方向单向、无循环依赖：file-operations → directory-tree → file-encoding/shared，
 *    叶子模块（file-encoding/shared）不得反向 import 上层模块；自身写入窗口状态只保留在
 *    shared（directory-tree 只消费，不重复声明）。
 *
 * 说明：这是薄 smoke（导出完整性 + import 图静态断言），拆分后的行为回归由既有
 * file-operations.test.ts / pf17-directory-reload-io.test.ts / file-encoding.test.ts 守护。
 */
import { describe, it, expect, vi } from 'vitest'
import path from 'path'
import { readFileSync } from 'fs'

// CMP-30：file-utils 依赖链经 tMain 读取词典（语言来自系统设置），固定中文词条并隔离存储依赖
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// electron / logger / file-state-store 与 index.test.ts 保持同款最小 mock（模块加载期依赖）
const electronMocks = vi.hoisted(() => ({
    getAllWindows: vi.fn()
}))

vi.mock('electron', () => {
    class MockBrowserWindow {
        static getAllWindows = electronMocks.getAllWindows
        webContents = { send: vi.fn() }
    }
    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {},
        shell: {},
        clipboard: { writeText: vi.fn() },
        app: { getPath: () => '', getVersion: () => '1.0.0-test' },
        ipcMain: { on: () => {} }
    }
})

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../src/main/utils/file-state-store', () => ({
    saveLastOpenedFile: vi.fn(),
    saveLastOpenedDirectory: vi.fn()
}))

import * as fileOps from '../../src/main/utils/file-utils/file-operations'
import * as directoryTree from '../../src/main/utils/file-utils/directory-tree'
import * as fileEncoding from '../../src/main/utils/file-utils/file-encoding'
import * as shared from '../../src/main/utils/file-utils/shared'

const FILE_UTILS_DIR = path.resolve(__dirname, '../../src/main/utils/file-utils')

/**
 * 结构优化第 5 批 5.5：directory-tree.ts 已按 scan/watch/reload 拆为同目录多文件，
 * 本文件为聚合薄壳。依赖方向静态断言需覆盖全部子模块源码。
 */
const DIRECTORY_TREE_MODULE_FILES = [
    'directory-tree.ts',
    'directory-tree-scan.ts',
    'directory-tree-watch.ts',
    'directory-tree-reload.ts'
] as const

/** 读取源码文本（用于 import 图静态断言） */
function readModuleSource(fileName: string): string {
    return readFileSync(path.join(FILE_UTILS_DIR, fileName), 'utf8')
}

/** 读取 directory-tree 拆分后的全部模块源码（拼接，用于「不得出现某写法」类断言） */
function readDirectoryTreeModulesSource(): string {
    return DIRECTORY_TREE_MODULE_FILES.map((fileName) => readModuleSource(fileName)).join('\n')
}

/** 命名空间导入按字符串索引访问（避免 noImplicitAny 的隐式 any） */
function asRecord(moduleNamespace: object): Record<string, unknown> {
    return moduleNamespace as unknown as Record<string, unknown>
}

/** 迁移到 directory-tree 的公开 API（既有调用方仍从 file-operations 导入） */
const DIRECTORY_TREE_API = [
    'TraverseDirectory',
    'ReloadDirFromDisk',
    'ScheduleReloadFromDisk',
    'CleanupDirectoryWatch',
    'DegradeDirectoryWatch',
    'GetDirectoryWatchStatus',
    'GetDirectoryReloadStats'
]

/** 迁移到 file-encoding 的公开 API（既有调用方仍从 file-operations 导入） */
const FILE_ENCODING_API = [
    'normalizeEncoding',
    'decodeFileContent',
    'encodeFileContent',
    'DescribeFileSystemError',
    'ReadFileContentAdaptive'
]

/** 拆分后仍保留在 file-operations 的核心操作 */
const CORE_FILE_OPERATIONS = [
    'SaveActiveFile',
    'SaveActiveFileAs',
    'OpenSelectFile',
    'OpenFile',
    'CreateFile',
    'CreateFileFolder',
    'CreateDirectory',
    'OpenDirectory',
    'Rename',
    'Delete',
    'RenameFileFolder',
    'DeleteFileFolder',
    'OpenFolderExplorer',
    'ReopenActiveFileWithEncoding',
    'ConvertActiveFileEncoding',
    'getMathRandom'
]

describe('CQ-7：file-operations.ts 拆分后的公开 API（re-export 完整性）', () => {
    it('目录树/监听/刷新 API 仍从 file-operations 导出，且与 directory-tree 为同一引用', () => {
        const fileOpsRecord = asRecord(fileOps)
        const directoryTreeRecord = asRecord(directoryTree)
        for (const name of DIRECTORY_TREE_API) {
            expect(typeof directoryTreeRecord[name], `${name} 应在 directory-tree 导出`).toBe(
                'function'
            )
            expect(typeof fileOpsRecord[name], `${name} 应从 file-operations 可导入`).toBe(
                'function'
            )
            expect(fileOpsRecord[name], `${name} re-export 应保持同一函数引用`).toBe(
                directoryTreeRecord[name]
            )
        }
    })

    it('编码/读取 API 仍从 file-operations 导出，且与 file-encoding 为同一引用', () => {
        const fileOpsRecord = asRecord(fileOps)
        const fileEncodingRecord = asRecord(fileEncoding)
        for (const name of FILE_ENCODING_API) {
            expect(typeof fileEncodingRecord[name], `${name} 应在 file-encoding 导出`).toBe(
                'function'
            )
            expect(typeof fileOpsRecord[name], `${name} 应从 file-operations 可导入`).toBe(
                'function'
            )
            expect(fileOpsRecord[name], `${name} re-export 应保持同一函数引用`).toBe(
                fileEncodingRecord[name]
            )
        }
    })

    it('路径守卫提示由 shared 提供，file-operations re-export 同一引用', () => {
        expect(typeof shared.notifyPathAccessDenied).toBe('function')
        expect(fileOps.notifyPathAccessDenied).toBe(shared.notifyPathAccessDenied)
    })

    it('文件/文件夹核心操作仍保留在 file-operations', () => {
        const fileOpsRecord = asRecord(fileOps)
        for (const name of CORE_FILE_OPERATIONS) {
            expect(typeof fileOpsRecord[name], `${name} 应保留在 file-operations`).toBe('function')
        }
    })
})

describe('CQ-7：拆分后的依赖方向（静态 import 图）', () => {
    it('directory-tree 拆分模块不 import file-operations 的核心操作（避免循环依赖）', () => {
        for (const fileName of DIRECTORY_TREE_MODULE_FILES) {
            const source = readModuleSource(fileName)
            expect(source, `${fileName} 不应 import file-operations`).not.toMatch(
                /from\s+['"]\.\/file-operations['"]/
            )
        }
        // 正向依赖仍成立：目录树模块复用编码读取 + shared 的共享状态
        const modulesSource = readDirectoryTreeModulesSource()
        expect(modulesSource).toMatch(/from\s+['"]\.\/file-encoding['"]/)
        expect(modulesSource).toMatch(/from\s+['"]\.\/shared['"]/)
    })

    it('directory-tree.ts 为聚合薄壳：只 re-export 拆分模块，不重复实现', () => {
        const shellSource = readModuleSource('directory-tree.ts')
        // 薄壳内不应出现可执行实现（函数声明/顶层 let/const/异步流程）
        expect(shellSource).not.toMatch(/\bfunction\s+[A-Za-z_$]/)
        expect(shellSource).not.toMatch(/^\s*(let|const)\s/m)
        expect(shellSource).not.toMatch(/\bsetTimeout\(|\bwatch\(/)
        for (const subModule of [
            './directory-tree-scan',
            './directory-tree-watch',
            './directory-tree-reload'
        ]) {
            expect(shellSource, `薄壳应聚合 ${subModule}`).toContain(`from '${subModule}'`)
        }
    })

    it('file-encoding / shared 为叶子依赖，不反向 import 上层模块', () => {
        for (const leaf of ['file-encoding.ts', 'shared.ts']) {
            const source = readModuleSource(leaf)
            expect(source, `${leaf} 不应 import file-operations`).not.toMatch(
                /from\s+['"]\.\/file-operations['"]/
            )
            expect(source, `${leaf} 不应 import directory-tree`).not.toMatch(
                /from\s+['"]\.\/directory-tree['"]/
            )
        }
    })

    it('file-operations 通过显式 re-export 保持调用方 import 路径（不用 export *）', () => {
        const source = readModuleSource('file-operations.ts')
        expect(source).toMatch(/export\s+\{[^}]*\}\s+from\s+['"]\.\/directory-tree['"]/)
        expect(source).toMatch(/export\s+\{[^}]*\}\s+from\s+['"]\.\/file-encoding['"]/)
        // 任务约束：避免 export * 的重复导出冲突
        expect(source).not.toMatch(/export\s+\*\s+from/)
    })

    it('自身写入窗口状态只存在于 shared（状态与职责同模块，不在 directory-tree 重复声明）', () => {
        const sharedSource = readModuleSource('shared.ts')
        const directoryTreeSource = readDirectoryTreeModulesSource()
        expect(sharedSource).toMatch(/let selfWriteDepth = 0/)
        expect(directoryTreeSource).not.toMatch(/\bselfWriteDepth\b/)
        // directory-tree 只通过 shared 的消费入口判断抑制窗口
        expect(directoryTreeSource).toMatch(/isSelfWriteWindow/)
    })
})
