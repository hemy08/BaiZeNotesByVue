/**
 * src/shared/constants/* 共享常量单元测试（公共接口归位第 1 批 1.12~1.17）。
 *
 * 覆盖两层：
 * 1. 字面值断言：与各来源文件逐字对齐的关键数值（窗口 bounds、128MB、10s/20s/8s/60s/12s、
 *    50/3、9 个编码、9 个 Hash 算法 label、扩展名清单等）；
 * 2. 漂移护栏：import 已导出的既有常量（handlers 窗口 bounds、plantuml-local 渲染常量、
 *    file-encoding 大文件阈值与别名表、auto-backup 单文件上限、preview 降级阈值、
 *    snippets 清单、encrypt-decrypt 结果字典 key）与 shared 新常量逐项比对；
 *    只 import 不修改任何既有文件。
 *
 * 说明：main 侧部分常量仍为模块私有（utils.ts 的 128MB、logger 的 10MB、handlers 的图片白名单、
 * 渲染层 hemy-editor-render.ts 的并发/缓存常量等），本测试以「固定字面值 + 注释来源行号」守护；
 * 后续引用迁移阶段可改为 import 对比。
 */
import { describe, it, expect, vi } from 'vitest'

/**
 * 最小 electron 桩：handlers / plantuml-local / encrypt-decrypt 等主进程模块在 import 时
 * 会解构 electron 导出（仅解构、不调用），这里提供全部被 value-import 的导出即可，
 * 不触发任何真实窗口 / IPC / store 行为。
 */
const electronMock = vi.hoisted(() => {
    class MockBrowserWindow {
        static getAllWindows = vi.fn(() => [] as unknown[])
        static fromWebContents = vi.fn(() => null)
    }
    const mock: Record<string, unknown> = {
        app: {
            getPath: vi.fn(() => process.env.TEMP ?? '/tmp'),
            getAppPath: vi.fn(() => process.cwd()),
            getVersion: vi.fn(() => '0.0.0-test'),
            isPackaged: false,
            on: vi.fn(),
            whenReady: vi.fn(() => Promise.resolve()),
            quit: vi.fn(),
            relaunch: vi.fn(),
            getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
            setLoginItemSettings: vi.fn()
        },
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showOpenDialog: vi.fn(),
            showSaveDialog: vi.fn(),
            showMessageBox: vi.fn(),
            showErrorBox: vi.fn()
        },
        shell: {
            openExternal: vi.fn(),
            openPath: vi.fn(),
            showItemInFolder: vi.fn(),
            trashItem: vi.fn()
        },
        ipcMain: { on: vi.fn(), handle: vi.fn(), removeListener: vi.fn() },
        Menu: {
            setApplicationMenu: vi.fn(),
            buildFromTemplate: vi.fn(),
            getApplicationMenu: vi.fn(() => null)
        },
        Notification: class {
            static isSupported = vi.fn(() => false)
            show = vi.fn()
        },
        Tray: class {},
        nativeImage: { createFromPath: vi.fn(), createEmpty: vi.fn() },
        session: { defaultSession: {} },
        screen: {
            getAllDisplays: vi.fn(() => []),
            getPrimaryDisplay: vi.fn(() => ({
                workArea: { x: 0, y: 0, width: 1920, height: 1080 }
            }))
        },
        clipboard: { writeText: vi.fn(), readText: vi.fn(() => '') },
        globalShortcut: { register: vi.fn(), unregisterAll: vi.fn() },
        nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' }
    }
    // electron-store 等依赖以 default import 方式取 electron；补 default 自引用兼容两种取法
    mock.default = mock
    return mock
})

vi.mock('electron', () => electronMock)

// @electron-toolkit/utils 为 node_modules 外部依赖，内部以 ESM 命名导入真实 electron，
// 在 vitest node 环境下会因 electron 为 CJS 而报 "Named export 'BrowserWindow' not found"；
// 这里整体打桩（只 import 常量，不使用其平台判定逻辑）。
vi.mock('@electron-toolkit/utils', () => ({
    is: { dev: false, macOS: false, windows: true, linux: false },
    electronApp: { setAppUserModelId: vi.fn() },
    optimizer: { watchWindowShortcuts: vi.fn() }
}))

// 隔离主进程存储 / 日志 / i18n 依赖链（只 import 常量与纯函数，不触发落盘）
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))
vi.mock('../../src/main/utils/logger', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../../src/main/utils/i18n', () => ({
    tMain: (key: string) => key
}))

import {
    WINDOW_COORDINATE_LIMIT,
    WINDOW_MIN_SIZE,
    WINDOW_MAX_SIZE
} from '../../src/shared/constants/window'
import {
    MAX_READ_BINARY_SIZE,
    MAX_FILE_ENCODING_SIZE,
    MAX_AUTO_BACKUP_FILE_SIZE,
    MAX_LOG_FILE_SIZE,
    MAX_IMAGE_BASE64_SIZE,
    PREVIEW_DEGRADE_FILE_SIZE,
    PREVIEW_DEGRADE_LINES,
    PREVIEW_PROGRESSIVE_FILE_SIZE,
    PREVIEW_PROGRESSIVE_LINES,
    PREVIEW_BLOCK_MAX_SIZE,
    PREVIEW_BLOCK_TOTAL_MAX_SIZE,
    PREVIEW_BLOCK_MAX_DEPTH
} from '../../src/shared/constants/limits'
import {
    PLANTUML_RENDER_TIMEOUT_MS,
    PLANTUML_WINDOW_LOAD_TIMEOUT_MS,
    PLANTUML_PAGE_RENDER_WAIT_MS,
    PLANTUML_RENDER_CACHE_MAX,
    PLANTUML_IDLE_DISPOSE_MS,
    RENDERER_PLANTUML_TIMEOUT_MS,
    PLANTUML_CONCURRENCY_LIMIT,
    RENDERER_PLANTUML_CACHE_MAX,
    MERMAID_RENDER_CACHE_MAX,
    MERMAID_CONCURRENCY_LIMIT
} from '../../src/shared/constants/render'
import {
    MARKDOWN_EXTENSIONS,
    TREE_SUPPORTED_EXTENSIONS,
    IMAGE_EXTENSIONS,
    TREE_IMAGE_EXTENSIONS,
    SNIPPET_SUPPORTED_EXTENSIONS
} from '../../src/shared/constants/file-extensions'
import { HASH_ALGORITHMS, HASH_ENCODINGS } from '../../src/shared/constants/hash-algorithms'
import {
    FILE_ENCODINGS,
    ENCODING_ALIASES,
    type FileEncoding
} from '../../src/shared/constants/encodings'

// 既有实现（只 import，不修改）：用于逐项漂移对比
import {
    WINDOW_COORDINATE_LIMIT as EXISTING_WINDOW_COORDINATE_LIMIT,
    WINDOW_MIN_SIZE as EXISTING_WINDOW_MIN_SIZE,
    WINDOW_MAX_SIZE as EXISTING_WINDOW_MAX_SIZE,
    isValidWindowCoordinate,
    isValidWindowSize
} from '../../src/main/ipc/handlers'
import {
    PLANTUML_RENDER_TIMEOUT_MS as EXISTING_PLANTUML_RENDER_TIMEOUT_MS,
    PLANTUML_WINDOW_LOAD_TIMEOUT_MS as EXISTING_PLANTUML_WINDOW_LOAD_TIMEOUT_MS,
    PLANTUML_CACHE_MAX as EXISTING_PLANTUML_CACHE_MAX,
    PLANTUML_IDLE_DISPOSE_MS as EXISTING_PLANTUML_IDLE_DISPOSE_MS
} from '../../src/main/renders/plantuml-local'
import {
    LARGE_FILE_THRESHOLD,
    normalizeEncoding
} from '../../src/main/utils/file-utils/file-encoding'
import { AUTO_BACKUP_MAX_FILE_BYTES } from '../../src/main/utils/auto-backup'
import {
    PREVIEW_LARGE_DOC_BYTE_THRESHOLD,
    PREVIEW_LARGE_DOC_LINE_THRESHOLD
} from '../../src/renderer/src/components/Markdown/preview-local-render'
import {
    SNIPPET_ALLOWED_EXTENSIONS,
    SNIPPET_DEFAULT_MAX_DEPTH,
    SNIPPET_DEFAULT_MAX_FILE_BYTES,
    SNIPPET_DEFAULT_MAX_TOTAL_BYTES
} from '../../src/renderer/src/components/Markdown/preview-md-blocks'
import { CreateHash } from '../../src/main/utils/encrypt-decrypt'

/** 9 个 Hash 算法 label 固定字面值（= 主进程 hashTextInput[].text，结果字典 key） */
const EXPECTED_HASH_LABELS = [
    'MD4',
    'MD5',
    'SHA1',
    'SHA224',
    'SHA256',
    'SHA384',
    'SHA512',
    'SHA512-256',
    'RIPEMD160'
] as const

/** 4 项摘要输出编码 label 固定字面值（含中文全角括号，与界面选项逐字一致） */
const EXPECTED_HASH_ENCODING_LABELS = [
    'Binary（base2）',
    'Hexadecimal（base16）',
    'Base64（base64）',
    'Base64url（base64 with url safe chars）'
] as const

describe('window 共享常量', () => {
    it('should keep coordinate/size bounds byte-exact', () => {
        expect(WINDOW_COORDINATE_LIMIT).toBe(100000)
        expect(WINDOW_MIN_SIZE).toBe(1)
        expect(WINDOW_MAX_SIZE).toBe(32768)
    })

    it('should match the existing exported constants in handlers.ts', () => {
        // 来源：src/main/ipc/handlers.ts:114-119（AS-6 校验，config-schema.ts:205-210 与
        // window-bounds.ts:31-35 为注释自认的就地复制，数值应同为 100000 / 1 / 32768）
        expect(WINDOW_COORDINATE_LIMIT).toBe(EXISTING_WINDOW_COORDINATE_LIMIT)
        expect(WINDOW_MIN_SIZE).toBe(EXISTING_WINDOW_MIN_SIZE)
        expect(WINDOW_MAX_SIZE).toBe(EXISTING_WINDOW_MAX_SIZE)
    })

    it('should agree with handlers validity boundaries (exact limit accepted, +1 rejected)', () => {
        expect(isValidWindowCoordinate(WINDOW_COORDINATE_LIMIT)).toBe(true)
        expect(isValidWindowCoordinate(-WINDOW_COORDINATE_LIMIT)).toBe(true)
        expect(isValidWindowCoordinate(WINDOW_COORDINATE_LIMIT + 1)).toBe(false)
        expect(isValidWindowCoordinate(-WINDOW_COORDINATE_LIMIT - 1)).toBe(false)
        expect(isValidWindowSize(WINDOW_MIN_SIZE)).toBe(true)
        expect(isValidWindowSize(WINDOW_MIN_SIZE - 1)).toBe(false)
        expect(isValidWindowSize(WINDOW_MAX_SIZE)).toBe(true)
        expect(isValidWindowSize(WINDOW_MAX_SIZE + 1)).toBe(false)
    })
})

describe('limits 共享常量', () => {
    it('should keep process-private file size limits byte-exact', () => {
        // 来源：src/main/utils/utils.ts:47-48（128MB，模块私有未导出）
        expect(MAX_READ_BINARY_SIZE).toBe(128 * 1024 * 1024)
        expect(MAX_READ_BINARY_SIZE).toBe(134217728)
        // 来源：src/main/utils/logger.ts:40-41（defaultConfig.maxFileSize = 10MB，模块私有）
        expect(MAX_LOG_FILE_SIZE).toBe(10 * 1024 * 1024)
        expect(MAX_LOG_FILE_SIZE).toBe(10485760)
        // 来源：src/renderer/src/components/PluginTools/Codec/ImageBase64.vue:68-69
        // （MAX_IMAGE_BYTES = 20MB，SFC 内常量不单独导出）
        expect(MAX_IMAGE_BASE64_SIZE).toBe(20 * 1024 * 1024)
        expect(MAX_IMAGE_BASE64_SIZE).toBe(20971520)
    })

    it('should align with exported encoding / backup / preview limits', () => {
        // 来源：file-encoding.ts:21-22 的 LARGE_FILE_THRESHOLD（5MB）
        expect(MAX_FILE_ENCODING_SIZE).toBe(LARGE_FILE_THRESHOLD)
        expect(MAX_FILE_ENCODING_SIZE).toBe(5 * 1024 * 1024)
        // 来源：auto-backup.ts:67-68 的 AUTO_BACKUP_MAX_FILE_BYTES（20MB）
        expect(MAX_AUTO_BACKUP_FILE_SIZE).toBe(AUTO_BACKUP_MAX_FILE_BYTES)
        expect(MAX_AUTO_BACKUP_FILE_SIZE).toBe(20 * 1024 * 1024)
        // 来源：preview-large-doc.ts / preview-local-render.ts（P2-1 大文档分级阈值）
        // 简化档：>256KiB 或 >1 万行；渐进档：>512KiB 或 >2 万行（原 PF-9 的 2MiB/5 万行已下调）
        expect(PREVIEW_DEGRADE_FILE_SIZE).toBe(PREVIEW_LARGE_DOC_BYTE_THRESHOLD)
        expect(PREVIEW_DEGRADE_FILE_SIZE).toBe(256 * 1024)
        expect(PREVIEW_DEGRADE_LINES).toBe(PREVIEW_LARGE_DOC_LINE_THRESHOLD)
        expect(PREVIEW_DEGRADE_LINES).toBe(10_000)
        expect(PREVIEW_PROGRESSIVE_FILE_SIZE).toBe(512 * 1024)
        expect(PREVIEW_PROGRESSIVE_LINES).toBe(20_000)
        // 来源：preview-md-blocks.ts:516-521（snippets 深度 5 / 单文件 1MiB / 总量 4MiB）
        expect(PREVIEW_BLOCK_MAX_DEPTH).toBe(SNIPPET_DEFAULT_MAX_DEPTH)
        expect(PREVIEW_BLOCK_MAX_DEPTH).toBe(5)
        expect(PREVIEW_BLOCK_MAX_SIZE).toBe(SNIPPET_DEFAULT_MAX_FILE_BYTES)
        expect(PREVIEW_BLOCK_MAX_SIZE).toBe(1024 * 1024)
        expect(PREVIEW_BLOCK_TOTAL_MAX_SIZE).toBe(SNIPPET_DEFAULT_MAX_TOTAL_BYTES)
        expect(PREVIEW_BLOCK_TOTAL_MAX_SIZE).toBe(4 * 1024 * 1024)
    })
})

describe('render 共享常量', () => {
    it('should align with exported plantuml-local constants', () => {
        // 来源：src/main/renders/plantuml-local.ts:61-110
        expect(PLANTUML_RENDER_TIMEOUT_MS).toBe(EXISTING_PLANTUML_RENDER_TIMEOUT_MS)
        expect(PLANTUML_RENDER_TIMEOUT_MS).toBe(10000)
        expect(PLANTUML_WINDOW_LOAD_TIMEOUT_MS).toBe(EXISTING_PLANTUML_WINDOW_LOAD_TIMEOUT_MS)
        expect(PLANTUML_WINDOW_LOAD_TIMEOUT_MS).toBe(20000)
        expect(PLANTUML_RENDER_CACHE_MAX).toBe(EXISTING_PLANTUML_CACHE_MAX)
        expect(PLANTUML_RENDER_CACHE_MAX).toBe(50)
        expect(PLANTUML_IDLE_DISPOSE_MS).toBe(EXISTING_PLANTUML_IDLE_DISPOSE_MS)
        expect(PLANTUML_IDLE_DISPOSE_MS).toBe(60000)
    })

    it('should keep module-private render timeouts/concurrency byte-exact', () => {
        // 来源：plantuml-local.ts:67-68 私有常量（页面内等待 SVG 输出 8s）
        expect(PLANTUML_PAGE_RENDER_WAIT_MS).toBe(8000)
        // 来源：hemy-editor-render.ts:232-233 私有常量（渲染层兜底超时 12s = 主进程 10s + 2s 余量）
        expect(RENDERER_PLANTUML_TIMEOUT_MS).toBe(12000)
        // 来源：hemy-editor-render.ts:234-235 私有常量（PlantUML 渲染并发上限 3）
        expect(PLANTUML_CONCURRENCY_LIMIT).toBe(3)
        // 来源：hemy-editor-render.ts:236-237 私有常量（渲染层 PlantUML HTML 缓存 50）
        expect(RENDERER_PLANTUML_CACHE_MAX).toBe(50)
        // 来源：hemy-editor-render.ts:69-70 私有常量（Mermaid 缓存 50）
        expect(MERMAID_RENDER_CACHE_MAX).toBe(50)
        // 来源：hemy-editor-render.ts:208-210 函数内局部常量（Mermaid 并发上限 3）
        expect(MERMAID_CONCURRENCY_LIMIT).toBe(3)
    })
})

describe('file-extensions 共享常量', () => {
    it('should keep markdown / tree extensions byte-exact', () => {
        // 来源：directory-tree.ts:77-87（8 项树白名单；.md 为唯一 Markdown 主扩展名）
        expect(MARKDOWN_EXTENSIONS).toEqual(['.md'])
        expect(TREE_SUPPORTED_EXTENSIONS).toEqual([
            '.md',
            '.png',
            '.jpg',
            '.jpeg',
            '.svg',
            '.pdf',
            '.txt',
            '.html'
        ])
        expect(TREE_SUPPORTED_EXTENSIONS).toHaveLength(8)
    })

    it('should keep the two image extension sets (7 vs 4) and their subset relation', () => {
        // 来源：handlers.ts:324-330（选择/复制 7 项）
        expect(IMAGE_EXTENSIONS).toEqual(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])
        expect(IMAGE_EXTENSIONS).toHaveLength(7)
        // 来源：directory-tree.ts:79-87 中的图片子集（树展示 4 项，不含 gif/webp/bmp）
        expect(TREE_IMAGE_EXTENSIONS).toEqual(['.png', '.jpg', '.jpeg', '.svg'])
        expect(TREE_IMAGE_EXTENSIONS).toEqual(
            TREE_SUPPORTED_EXTENSIONS.filter((extension) => IMAGE_EXTENSIONS.includes(extension))
        )
    })

    it('should align snippet extensions with preview-md-blocks.ts', () => {
        // 来源：preview-md-blocks.ts:523-568 的 SNIPPET_ALLOWED_EXTENSIONS（43 项）
        expect(SNIPPET_SUPPORTED_EXTENSIONS).toEqual(SNIPPET_ALLOWED_EXTENSIONS)
        expect(SNIPPET_SUPPORTED_EXTENSIONS).toHaveLength(43)
        expect(new Set(SNIPPET_SUPPORTED_EXTENSIONS).size).toBe(43)
        for (const extension of SNIPPET_SUPPORTED_EXTENSIONS) {
            expect(extension.startsWith('.')).toBe(true)
            expect(extension).toBe(extension.toLowerCase())
        }
    })
})

describe('hash-algorithms 共享常量', () => {
    it('should keep 9 algorithm labels byte-identical to main-process dictionary keys', () => {
        // 来源：encrypt-decrypt.ts:56-66 的 hashTextInput[].text；label 即结果字典 key，
        // 渲染层 HashText.vue / HmacGenerator.vue 按 label 回填，禁改文案
        expect(HASH_ALGORITHMS).toHaveLength(9)
        expect(HASH_ALGORITHMS.map((item) => item.label)).toEqual([...EXPECTED_HASH_LABELS])
        expect(HASH_ALGORITHMS.map((item) => item.id)).toEqual([
            'md4',
            'md5',
            'sha1',
            'sha224',
            'sha256',
            'sha384',
            'sha512',
            'sha512-256',
            'RIPEMD160'
        ])
        // 渲染层两个组件（HashText.vue:89-99 / HmacGenerator.vue:93-103）同序同文案
        expect(new Set(HASH_ALGORITHMS.map((item) => item.label)).size).toBe(9)
    })

    it('should align main-process digest result keys with HASH_ALGORITHMS labels', () => {
        // 真实调用主进程 CreateHash：结果字典以 label 为 key（Node 24 + OpenSSL 3 下
        // MD4 通常不可用，仅断言其余 8 项必然存在；所有 key 都必须是 9 个 label 之一）
        const digestResult = CreateHash('baize-shared-constants', 'hex')
        const resultKeys = Object.keys(digestResult)
        expect(resultKeys.length).toBeGreaterThanOrEqual(8)
        expect(resultKeys.length).toBeLessThanOrEqual(9)
        for (const key of resultKeys) {
            expect(EXPECTED_HASH_LABELS).toContain(key)
        }
        for (const label of EXPECTED_HASH_LABELS) {
            if (label === 'MD4') {
                continue
            }
            expect(resultKeys).toContain(label)
        }
    })

    it('should keep 4 output encoding options byte-identical to HashText/HmacGenerator', () => {
        // 来源：HashText.vue:32-41 / HmacGenerator.vue:30-35（选项 value 与文案逐字一致）
        expect(HASH_ENCODINGS.map((item) => item.id)).toEqual([
            'Binary',
            'Hexadecimal',
            'base64',
            'Base64url'
        ])
        expect(HASH_ENCODINGS.map((item) => item.label)).toEqual([...EXPECTED_HASH_ENCODING_LABELS])
    })
})

describe('encodings 共享常量', () => {
    it('should keep 9 file encoding ids aligned with menu routes', () => {
        // 来源：menu-file.ts:80-120（menu-file 编码 id）与 menu-config.ts:214-250（labelKey）
        const expectedIds: FileEncoding[] = [
            'utf8',
            'utf16-le',
            'utf16-be',
            'gbk',
            'gb2312',
            'gb18030',
            'big5',
            'big5-hkscs',
            'hex'
        ]
        expect(FILE_ENCODINGS.map((item) => item.id)).toEqual(expectedIds)
        expect(FILE_ENCODINGS).toHaveLength(9)
        expect(FILE_ENCODINGS.map((item) => item.labelKey)).toEqual([
            'menu.coding.utf8',
            'menu.coding.utf16le',
            'menu.coding.utf16be',
            'menu.coding.gbk',
            'menu.coding.gb2312',
            'menu.coding.gb18030',
            'menu.coding.big5',
            'menu.coding.big5hkscs',
            'menu.coding.hex'
        ])
        // 本轮只提供常量清单：不得出现菜单 action 路由字符串（路由迁移由后续阶段负责）
        for (const item of FILE_ENCODINGS) {
            expect(item.id).not.toContain('baize:')
            expect(item.labelKey.startsWith('menu.coding.')).toBe(true)
        }
    })

    it('should align encoding aliases with main-process normalizeEncoding behavior', () => {
        // 来源：file-encoding.ts:24-44 的 ENCODING_ALIASES（模块私有，共 15 项）
        expect(Object.keys(ENCODING_ALIASES)).toHaveLength(15)
        expect(ENCODING_ALIASES.ascii).toBe('utf-8')
        expect(ENCODING_ALIASES.gb2312).toBe('gbk')
        expect(ENCODING_ALIASES.gbk).toBe('gbk')
        expect(ENCODING_ALIASES.gb18030).toBe('gbk')
        expect(ENCODING_ALIASES['utf-16le']).toBe('utf-16le')
        expect(ENCODING_ALIASES['utf-16be']).toBe('utf-16be')

        // 用真实主进程实现反向验证：shared 别名表的每个键经 normalizeEncoding 后
        // 必须得到同一归一化结果（任一侧漂移都会让该断言失败）
        for (const [rawEncoding, normalized] of Object.entries(ENCODING_ALIASES)) {
            expect(normalizeEncoding(rawEncoding)).toBe(normalized)
        }
        // 未识别编码保守回退 UTF-8（D-4）
        expect(normalizeEncoding('not-a-real-encoding')).toBe('utf-8')
        expect(normalizeEncoding(null)).toBe('utf-8')
        expect(normalizeEncoding(undefined)).toBe('utf-8')
    })
})
