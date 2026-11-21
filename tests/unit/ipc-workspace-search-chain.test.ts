/**
 * A2 工作区搜索/替换 IPC 六步链路护栏（2026-11-21）
 *
 * 按规范附录 B1 逐环节锁定新增通道，防止后续调整只改其中一环造成静默漂移：
 * 1. 常量：shared/ipc-channels.ts（命名 `baize:file:<kebab>`、值唯一）；
 * 2. 契约：shared/types/ipc.ts 三表（IpcRequests + IpcResponses 各登记两个 invoke 通道）；
 * 3. 白名单：generate-preload-whitelist 生成产物与 preload 入口镜像均包含两个通道；
 * 4. 注册：主进程 workspace-search-ipc.ts 经 registerHandleOnce 注册（注册行为由
 *    tests/unit/main-io/workspace-search-ipc.test.ts 覆盖，本文件做静态落点核对）；
 * 5. 渲染层：调用点必须引用 IPC 常量（静态扫描 useWorkspaceSearch.ts）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { IPC } from '../../src/shared/ipc-channels'
import { RENDERER_SEND_CHANNELS } from '../../src/preload/allowed-channels.generated'

const ROOT = path.resolve(__dirname, '../..')
const CONTRACT_FILE = path.join(ROOT, 'src', 'shared', 'types', 'ipc.ts')
const PRELOAD_FILE = path.join(ROOT, 'src', 'preload', 'index.ts')
const HANDLER_FILE = path.join(ROOT, 'src', 'main', 'ipc', 'workspace-search-ipc.ts')
const RENDERER_FILE = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'composables',
    'useWorkspaceSearch.ts'
)

const NEW_CHANNELS = [IPC.FILE.SEARCH_WORKSPACE, IPC.FILE.REPLACE_WORKSPACE] as const

function readSource(file: string): string {
    return fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
}

describe('A2 通道常量（第 1 步）', () => {
    it('通道值为 baize:file:<kebab> 三段式且全局唯一', () => {
        for (const channel of NEW_CHANNELS) {
            expect(channel).toMatch(/^baize:file:[a-z][a-z0-9-]*$/)
        }
        expect(new Set(NEW_CHANNELS).size).toBe(2)
        // 与既有 FILE 组通道不重复
        const existing = Object.values(IPC.FILE) as string[]
        for (const channel of NEW_CHANNELS) {
            expect(existing.filter((value) => value === channel)).toHaveLength(1)
        }
    })
})

describe('A2 IPC 契约（第 2 步）', () => {
    const contractSource = readSource(CONTRACT_FILE)

    it('IpcRequests 登记两个 invoke 请求', () => {
        expect(contractSource).toContain(
            '[IPC.FILE.SEARCH_WORKSPACE]: [options: WorkspaceSearchOptions]'
        )
        expect(contractSource).toContain(
            '[IPC.FILE.REPLACE_WORKSPACE]: [options: WorkspaceReplaceOptions]'
        )
    })

    it('IpcResponses 登记两个返回类型', () => {
        expect(contractSource).toContain('[IPC.FILE.SEARCH_WORKSPACE]: WorkspaceSearchResult')
        expect(contractSource).toContain('[IPC.FILE.REPLACE_WORKSPACE]: WorkspaceReplaceResult')
    })

    it('载荷类型定义存在于 shared 层（主/渲染共用，无本地重复定义）', () => {
        for (const typeName of [
            'WorkspaceSearchOptions',
            'WorkspaceSearchResult',
            'WorkspaceSearchFileResult',
            'WorkspaceReplaceOptions',
            'WorkspaceReplaceResult'
        ]) {
            expect(contractSource).toContain(`export interface ${typeName}`)
        }
    })
})

describe('A2 preload 白名单（第 3 步）', () => {
    it('生成产物包含两个通道（invoke 走同一 send 白名单）', () => {
        const generated = new Set(RENDERER_SEND_CHANNELS as readonly string[])
        for (const channel of NEW_CHANNELS) {
            expect(generated.has(channel), channel).toBe(true)
        }
    })

    it('preload 入口镜像白名单块包含两个通道（由生成器写入）', () => {
        const source = readSource(PRELOAD_FILE)
        expect(source).toContain('IPC.FILE.SEARCH_WORKSPACE')
        expect(source).toContain('IPC.FILE.REPLACE_WORKSPACE')
        expect(source).toMatch(/<preload-whitelist:renderer-send>/)
    })
})

describe('A2 主进程注册与渲染层调用（第 4/5 步）', () => {
    it('handler 文件经 registerHandleOnce + withSenderCheck 注册两个通道', () => {
        const source = readSource(HANDLER_FILE)
        for (const channel of ['IPC.FILE.SEARCH_WORKSPACE', 'IPC.FILE.REPLACE_WORKSPACE']) {
            expect(source).toContain(channel)
        }
        expect(source.match(/ipcListenerManager\.registerHandleOnce\(/g)).toHaveLength(2)
        expect(source.match(/withSenderCheck\(\s*IPC\.FILE\./g)).toHaveLength(2)
        // 禁裸注册：不得出现 ipcMain.handle 直连
        expect(source).not.toMatch(/ipcMain\.handle\(/)
    })

    it('渲染层调用点引用 IPC 常量（无通道字符串字面量）', () => {
        const source = readSource(RENDERER_FILE)
        expect(source).toContain('IPC.FILE.SEARCH_WORKSPACE')
        expect(source).toContain('IPC.FILE.REPLACE_WORKSPACE')
        expect(source).not.toMatch(/'baize:file:(?:search|replace)-workspace'/)
    })
})
