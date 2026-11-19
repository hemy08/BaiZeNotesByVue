/**
 * 跨端领域契约静态护栏（第 2 批契约重构任务 3：其余跨端契约）
 *
 * 目标（纯文件级静态扫描，不 import 主进程运行时模块）：
 * 1. PlantUML 渲染响应：主进程 plantuml-local.ts 与渲染层 hemy-editor-render.ts
 *    均引用 shared 类型、不再各自定义，两端字段由同一接口约束；
 * 2. AppVersionInfo：shared 接口字段 == preload 运行时 getVersion 返回类型字段，
 *    且 main utils.ts / preload index.d.ts / HelpAboutDialog.vue 三处引用同一类型；
 * 3. 备份契约：ConfigBackupInfo / ConfigBackupState / ConfigBackupCommand 以
 *    shared/types/config.ts 为唯一真源，main config-backup.ts 与渲染层
 *    system-setting/BackupPanel.vue 统一引用（删除本地副本）；
 * 4. 加解密契约：CryptoWireData（渲染层传输形态）与 CryptoResult / HashResult
 *    主进程/渲染层两端引用 shared，不再本地重复定义；
 * 5. SelectImageResult：main handlers.ts 与渲染层 BaiZeNotes.vue 引用 shared 同一结构；
 * 6. RendererEditorConfig / RendererQuickLinkItem：渲染层编辑器设置对话框引用 shared
 *    配置读取形状（第 2 批核心组已建，这里做引用护栏）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const p = (...segments: string[]): string => path.join(ROOT, ...segments)

const IPC_TYPES = p('src', 'shared', 'types', 'ipc.ts')
const CONFIG_TYPES = p('src', 'shared', 'types', 'config.ts')
const CRYPTO_TYPES = p('src', 'shared', 'types', 'crypto.ts')
const PRELOAD_DTS = p('src', 'preload', 'index.d.ts')
const PRELOAD_INDEX = p('src', 'preload', 'index.ts')
const MAIN_UTILS = p('src', 'main', 'utils', 'utils.ts')
const MAIN_ENCRYPT = p('src', 'main', 'utils', 'encrypt-decrypt.ts')
const MAIN_PLANTUML = p('src', 'main', 'renders', 'plantuml-local.ts')
const MAIN_CONFIG_BACKUP = p('src', 'main', 'config', 'config-backup.ts')
const MAIN_HANDLERS = p('src', 'main', 'ipc', 'handlers.ts')
const RENDERER_HELP_ABOUT = p(
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'help',
    'HelpAboutDialog.vue'
)
const RENDERER_HEMY_RENDER = p(
    'src',
    'renderer',
    'src',
    'components',
    'Markdown',
    'hemy-editor-render.ts'
)
const RENDERER_CRYPTO = p(
    'src',
    'renderer',
    'src',
    'components',
    'PluginTools',
    'Encryption',
    'CryptoEncDec.vue'
)
const RENDERER_HASH_TEXT = p(
    'src',
    'renderer',
    'src',
    'components',
    'PluginTools',
    'Encryption',
    'HashText.vue'
)
const RENDERER_HMAC_GENERATOR = p(
    'src',
    'renderer',
    'src',
    'components',
    'PluginTools',
    'Encryption',
    'HmacGenerator.vue'
)
// 设置页拆分 P0：备份/恢复读写逻辑从 SystemSettingDialog.vue 迁至备份页签
// system-setting/BackupPanel.vue（shared 类型引用契约不变，仅源码位置变化）。
const RENDERER_SYSTEM_BACKUP_PANEL = p(
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'complex',
    'system-setting',
    'BackupPanel.vue'
)
const RENDERER_EDITOR_DIALOG = p(
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'complex',
    'EditorSettingDialog.vue'
)
const RENDERER_BAIZE_NOTES = p('src', 'renderer', 'src', 'components', 'BaiZeNotes.vue')

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

/** 解析 `export type X = { ... }` 联合/别名中单引号字符串字面量（如 PlantumlRenderStatus） */
function parseStringLiteralUnion(source: string, typeName: string): string[] {
    const marker = `export type ${typeName} =`
    const start = source.indexOf(marker)
    expect(start, `应定义 ${typeName}`).toBeGreaterThanOrEqual(0)
    const rest = source.slice(start + marker.length)
    const end = rest.indexOf('\n\n')
    expect(end, `${typeName} 联合应有结束空行`).toBeGreaterThan(0)
    return [...rest.slice(0, end).matchAll(/'([^']+)'/g)].map((match) => match[1])
}

describe('PlantUML 渲染响应契约（两端同构）', () => {
    it('shared 应定义 PlantumlRenderResponse（status/svg/message/reason）与状态联合', () => {
        const fields = parseInterfaceFields(IPC_TYPES, 'PlantumlRenderResponse')
        expect([...fields.keys()]).toEqual(['status', 'svg', 'message', 'reason'])
        expect(fields.get('status')).toBe(false)
        expect(parseStringLiteralUnion(readSource(IPC_TYPES), 'PlantumlRenderStatus')).toEqual([
            'ok',
            'error',
            'unavailable'
        ])
    })

    it('主进程 plantuml-local.ts 应引用并 re-export shared 响应类型（无本地定义）', () => {
        const source = readSource(MAIN_PLANTUML)
        expect(source).toContain('PlantumlRenderResponse')
        expect(source).toContain(
            "import type { PlantumlRenderResponse, PlantumlRenderStatus } from '../../shared/types'"
        )
        expect(source).not.toContain('interface PlantumlRenderResponse')
        expect(source).not.toContain('export type PlantumlRenderStatus =')
    })

    it('渲染层 hemy-editor-render.ts 应引用 shared 响应类型（无本地定义）', () => {
        const source = readSource(RENDERER_HEMY_RENDER)
        expect(source).toContain('import type { MarkdownTOC, PlantumlRenderResponse }')
        expect(source).not.toContain('interface PlantumlRenderResponse')
    })
})

describe('AppVersionInfo 契约（shared / preload / main / 渲染层一致）', () => {
    it('shared AppVersionInfo 应含 9 个版本字段', () => {
        const fields = parseInterfaceFields(IPC_TYPES, 'AppVersionInfo')
        expect([...fields.keys()]).toEqual([
            'appVersion',
            'electronVersion',
            'chromeVersion',
            'nodeVersion',
            'vueVersion',
            'viteVersion',
            'typescriptVersion',
            'monacoEditorVersion',
            'markdownItVersion'
        ])
    })

    it('preload index.d.ts 应 import shared AppVersionInfo 作为 getVersion 返回类型', () => {
        const source = readSource(PRELOAD_DTS)
        expect(source).toContain('AppVersionInfo')
        expect(source).toContain('getVersion: () => Promise<AppVersionInfo>')
        expect(source).toContain("from '../shared/types'")
    })

    it('preload 运行时 getVersion 的内联返回类型字段应与 shared AppVersionInfo 一致（防双份漂移）', () => {
        const source = readSource(PRELOAD_INDEX)
        const start = source.indexOf('getVersion: (): Promise<{')
        expect(start).toBeGreaterThanOrEqual(0)
        const end = source.indexOf('}> =>', start)
        expect(end).toBeGreaterThan(start)
        const inlineFields = [
            ...source.slice(start, end).matchAll(/^\s{12}([A-Za-z_$][\w$]*):/gm)
        ].map((match) => match[1])
        const sharedFields = [...parseInterfaceFields(IPC_TYPES, 'AppVersionInfo').keys()]
        expect(inlineFields).toEqual(sharedFields)
    })

    it('主进程 utils.ts 的 APP_VERSION handler 应标注 shared AppVersionInfo', () => {
        const source = readSource(MAIN_UTILS)
        expect(source).toContain('AppVersionInfo')
        expect(source).toContain('async (): Promise<AppVersionInfo>')
    })

    it('渲染层 HelpAboutDialog.vue 应显式标注 shared AppVersionInfo', () => {
        const source = readSource(RENDERER_HELP_ABOUT)
        expect(source).toContain(
            "import type { AppVersionInfo } from '../../../../../shared/types'"
        )
        expect(source).toContain(
            'const versionInfo: AppVersionInfo = await window.api.app.getVersion()'
        )
    })
})

describe('配置备份契约（shared 唯一真源）', () => {
    it('shared 应定义备份元信息 / 状态 / 命令三个结构', () => {
        const info = parseInterfaceFields(CONFIG_TYPES, 'ConfigBackupInfo')
        expect([...info.keys()]).toEqual(['name', 'path', 'createdAt', 'fileCount'])
        const state = parseInterfaceFields(CONFIG_TYPES, 'ConfigBackupState')
        expect([...state.keys()]).toEqual(['backups', 'latest'])
        const command = parseInterfaceFields(CONFIG_TYPES, 'ConfigBackupCommand')
        expect([...command.keys()]).toEqual(['action', 'name', 'keep'])
    })

    it('主进程 config-backup.ts 应引用 shared 备份类型（无本地定义）', () => {
        const source = readSource(MAIN_CONFIG_BACKUP)
        expect(source).toContain('ConfigBackupInfo')
        expect(source).toContain('ConfigBackupState')
        expect(source).toContain('ConfigBackupCommand')
        expect(source).not.toContain('export interface ConfigBackupInfo')
        expect(source).not.toContain('export interface ConfigBackupCommand')
        expect(source).toContain('export function getBackupState(): ConfigBackupState')
    })

    it('渲染层备份页签 BackupPanel.vue 应引用 shared ConfigBackupState（无本地 assert 副本）', () => {
        const source = readSource(RENDERER_SYSTEM_BACKUP_PANEL)
        expect(source).toContain('ConfigBackupState')
        expect(source).not.toContain('interface BackupState')
        expect(source).not.toContain('interface BackupListItem')
    })
})

describe('加解密契约（渲染层传输形态 + 主进程消费形态对齐）', () => {
    it('shared crypto.ts 应定义 CryptoWireData / CryptoData / CryptoResult', () => {
        const wire = parseInterfaceFields(CRYPTO_TYPES, 'CryptoWireData')
        expect([...wire.keys()]).toEqual([
            'context',
            'secretKey',
            'secretKeyEncoding',
            'algorithm',
            'inputEncoding',
            'outputEncoding',
            'iv',
            'authTag'
        ])
        expect(wire.get('secretKey')).toBe(true) // 渲染层表单允许未填
        expect(parseInterfaceFields(CRYPTO_TYPES, 'CryptoData').get('secretKey')).toBe(false)
        const result = parseInterfaceFields(CRYPTO_TYPES, 'CryptoResult')
        expect([...result.keys()]).toEqual([
            'context',
            'secretKey',
            'secretKeyEncoding',
            'iv',
            'authTag'
        ])
    })

    it('渲染层 CryptoEncDec.vue 应引用 shared CryptoWireData / CryptoResult（无本地 partial 副本）', () => {
        const source = readSource(RENDERER_CRYPTO)
        expect(source).toContain(
            "import type { CryptoResult, CryptoWireData } from '../../../../../shared/types'"
        )
        expect(source).toContain('export type CryptoData = CryptoWireData')
        expect(source).not.toContain('interface CryptoData {')
        expect(source).not.toContain('interface CryptoEncryptResponse')
    })

    it('主进程 encrypt-decrypt.ts 的 HashResult 应引用 shared（无本地重复接口）', () => {
        const source = readSource(MAIN_ENCRYPT)
        expect(source).toContain('HashResult')
        expect(source).not.toContain('interface HashResult')
        expect(source).toContain(
            "import type { CryptoData, CryptoResult, HashResult } from '../../shared/types'"
        )
        // shared 侧 HashResult 结构：算法名 → 摘要字符串
        expect(readSource(IPC_TYPES)).toContain('export interface HashResult {')
        expect(readSource(IPC_TYPES)).toMatch(
            /export interface HashResult \{\s*\n\s*\[algorithm: string\]: string\s*\n\}/
        )
    })

    it('渲染层 HashText / HmacGenerator 的结果结构应引用 shared HashResult（无本地 Record 断言）', () => {
        for (const file of [RENDERER_HASH_TEXT, RENDERER_HMAC_GENERATOR]) {
            const source = readSource(file)
            expect(source).toContain(
                "import type { HashResult } from '../../../../../shared/types'"
            )
            expect(source).toContain('as HashResult')
            expect(source.includes('as Record<string, string>')).toBe(false)
        }
    })
})

describe('SelectImageResult / 渲染层配置读取形状引用护栏', () => {
    it('主进程 handlers.ts 应引用 shared SelectImageResult（无本地 interface）', () => {
        const source = readSource(MAIN_HANDLERS)
        expect(source).toContain('SelectImageResult')
        expect(source).not.toContain('interface SelectImageResult')
    })

    it('渲染层 BaiZeNotes.vue 的图片选择返回应标注 shared SelectImageResult', () => {
        const source = readSource(RENDERER_BAIZE_NOTES)
        expect(source).toContain('SelectImageResult')
        expect(source).toContain('as SelectImageResult | null')
    })

    it('shared config.ts 应定义 RendererEditorConfig（7 字段）与 RendererQuickLinkItem', () => {
        const editor = parseInterfaceFields(CONFIG_TYPES, 'RendererEditorConfig')
        expect([...editor.keys()]).toEqual([
            'fontSize',
            'lineHeight',
            'showLineNumbers',
            'enableFolding',
            'enableAutoComplete',
            'cursorStyle',
            'cursorWidth'
        ])
        const quickLink = parseInterfaceFields(CONFIG_TYPES, 'RendererQuickLinkItem')
        expect([...quickLink.keys()]).toEqual(['name', 'url', 'icon', 'description'])
    })

    it('渲染层 EditorSettingDialog.vue 应引用 shared RendererEditorConfig', () => {
        const source = readSource(RENDERER_EDITOR_DIALOG)
        expect(source).toContain('RendererEditorConfig')
        expect(source).toContain("from '../../../../../shared/types'")
    })
})
