/**
 * monaco-worker-setup 单元测试（PF-03 / CMP-28 防回归）
 *
 * 被测模块：src/renderer/src/components/Markdown/monaco-worker-setup.ts
 *
 * 隔离策略（重要）：
 * 该模块由 120 个 `monaco-editor/esm/...` 深层导入组成（贡献注册 + 语言注册 +
 * 1 个 ?worker 入口），无运行时导出，唯一真实行为是给 self.MonacoEnvironment
 * 赋一个按 label 分发 worker 的工厂。
 *
 * ET-8：vitest.config.ts 现已补齐与 electron.vite.config.ts 一致的 monaco 正则别名
 * （`/^monaco-editor$/`、`/^monaco-editor\//`），测试解析这些深层路径不再报
 * "Cannot find package"。但别名只解决「模块定位」，不解决「运行环境」：真实 monaco
 * ESM（editor.api / contributions / worker）依赖浏览器 DOM、Worker 全局与 CSS，
 * 在 vitest 默认 node 环境下执行会失败，且本用例要验证的只是 getWorker 的 label 分发
 * 逻辑，因此继续用 vi.mock 把全部 monaco 深层导入替换为空模块（副作用导入无需导出）、
 * ?worker 模块替换为可断言的 mock 构造器。
 *
 * PF-11：ts/css/html/json 4 个语言 worker 已从源文件移除（实测死重 ~14.75 MB），
 * 对应 mock 同步删除，只保留 editor.worker；用例改为断言「任意 label 均回退 editor worker」。
 *
 * 末尾的“全量 mock 覆盖”用例会解析源文件 import 清单与本文件 vi.mock 清单做交叉
 * 核对：源文件新增/删除导入时会明确报错提示补齐 mock，避免出现难以定位的解析失败。
 * （ET-19：这 2 处 readFileSync 是有意保留的静态护栏，mock 与源文件 import 必须一一对应。）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// ==================== monaco 深层导入 mock（120 个，顺序与源文件一致）====================
// PF-11：仅 1 个 ?worker（editor.worker）——返回带唯一类名的 mock 构造器，供用例断言
// 任意 label 都回退到它。语言服务 worker mock（ts/css/html/json）已随源文件死重移除。
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({
    default: class EditorWorkerMock {}
}))
// 以下为编辑器 contributions / 精选语言 / codicon 样式的纯副作用导入：返回空模块即可。
vi.mock('monaco-editor/esm/vs/editor/contrib/anchorSelect/browser/anchorSelect.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/caretOperations/browser/transpose.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/browser/widget/codeEditor/codeEditorWidget.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/codelens/browser/codelensController.js', () => ({}))
vi.mock('monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/colorPicker/browser/colorPickerContribution.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/browser/widget/diffEditor/diffEditor.contribution.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/diffEditorBreadcrumbs/browser/contribution.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/dnd/browser/dnd.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/documentSymbols/browser/documentSymbols.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/features/find/register.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/floatingMenu/browser/floatingMenu.contribution.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/fontZoom/browser/fontZoom.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/format/browser/formatActions.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/gotoError/browser/gotoError.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/gpu/browser/gpuActions.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/inlayHints/browser/inlayHintsContribution.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/inlineProgress/browser/inlineProgress.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/inPlaceReplace/browser/inPlaceReplace.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/insertFinalNewLine/browser/insertFinalNewLine.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/standalone/browser/inspectTokens/inspectTokens.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/lineSelection/browser/lineSelection.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/linkedEditing/browser/linkedEditing.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/links/browser/links.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/longLinesHelper/browser/longLinesHelper.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/middleScroll/browser/middleScroll.contribution.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/parameterHints/browser/parameterHints.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/placeholderText/browser/placeholderText.contribution.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/readOnlyMessage/browser/contribution.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/rename/browser/rename.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/sectionHeaders/browser/sectionHeaders.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/semanticTokens/browser/viewportSemanticTokens.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/smartSelect/browser/smartSelect.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/stickyScroll/browser/stickyScrollContribution.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestInlineCompletions.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/standalone/browser/toggleHighContrast/toggleHighContrast.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/tokenization/browser/tokenization.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/wordPartOperations/browser/wordPartOperations.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/browser/coreCommands.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/caretOperations/browser/caretOperations.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/find/browser/findController.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js', () => ({}))
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/gotoError/browser/markerSelectionStatus.js',
    () => ({})
)
vi.mock(
    'monaco-editor/esm/vs/editor/contrib/semanticTokens/browser/documentSemanticTokens.js',
    () => ({})
)
vi.mock('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/common/standaloneStrings.js', () => ({}))
vi.mock('monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/markdown/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/mdx/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/javascript/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/typescript/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/css/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/html/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/xml/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/yaml/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/python/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/java/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/cpp/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/csharp/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/go/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/rust/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/php/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/ruby/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/shell/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/sql/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/mysql/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/pgsql/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/powershell/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/bat/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/ini/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/dockerfile/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/kotlin/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/swift/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/dart/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/scala/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/perl/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/lua/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/r/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/objective-c/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/graphql/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/handlebars/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/less/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/scss/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/hcl/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/twig/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/pug/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/solidity/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/elixir/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/protobuf/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/clojure/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/redis/register.js', () => ({}))
vi.mock('monaco-editor/esm/vs/languages/definitions/restructuredtext/register.js', () => ({}))

// ==================== 被测模块加载与 self 环境模拟 ====================

const ROOT = path.resolve(__dirname, '../..')
const SETUP_FILE = path.join(ROOT, 'src/renderer/src/components/Markdown/monaco-worker-setup.ts')
const TEST_FILE = path.resolve(__dirname, 'monaco-worker-setup.test.ts')

/** 只关心 getWorker 的行为，返回实例的构造器类名用于断言分支选择 */
interface MonacoEnvironmentLike {
    getWorker(workerId: string, label: string): { constructor: { name: string } }
}

const EDGE_LABELS = ['markdown', 'mermaid', 'plantuml', 'plaintext', 'unknown-language', '']

let selfStub: Record<string, unknown>
let capturedEnvironment: MonacoEnvironmentLike | undefined
let assignmentCount: number

beforeAll(async () => {
    assignmentCount = 0
    capturedEnvironment = undefined
    // 用访问器模拟 self（node 环境无 self 全局），以便统计 MonacoEnvironment 赋值次数
    selfStub = {}
    Object.defineProperty(selfStub, 'MonacoEnvironment', {
        configurable: true,
        enumerable: true,
        get: () => capturedEnvironment,
        set: (value: MonacoEnvironmentLike) => {
            assignmentCount += 1
            capturedEnvironment = value
        }
    })
    vi.stubGlobal('self', selfStub)

    // 动态导入：必须在 self 桩与 vi.mock 注册之后
    await import('../../src/renderer/src/components/Markdown/monaco-worker-setup')
})

afterAll(() => {
    vi.unstubAllGlobals()
})

/** 取当前 MonacoEnvironment（导入后必然存在） */
function getEnvironment(): MonacoEnvironmentLike {
    if (!capturedEnvironment) {
        throw new Error('self.MonacoEnvironment 未被 monaco-worker-setup 初始化')
    }
    return capturedEnvironment
}

/** 按 label 创建 worker 并返回 mock 构造器类名 */
function workerNameFor(label: string, workerId = 'worker'): string {
    return getEnvironment().getWorker(workerId, label).constructor.name
}

describe('monaco-worker-setup environment registration', () => {
    it('should register self.MonacoEnvironment with a getWorker factory on import', () => {
        const environment = getEnvironment()

        expect(environment).toBeDefined()
        expect(typeof environment.getWorker).toBe('function')
        expect(assignmentCount).toBe(1)
    })

    it('should keep the assignment idempotent thanks to the module cache', async () => {
        const environmentBefore = getEnvironment()

        // 重复导入命中模块缓存，不应再次执行 self.MonacoEnvironment 赋值
        const moduleAgain =
            await import('../../src/renderer/src/components/Markdown/monaco-worker-setup')

        expect(Object.keys(moduleAgain)).toEqual([])
        expect(assignmentCount).toBe(1)
        expect(getEnvironment()).toBe(environmentBefore)
    })
})

describe('monaco-worker-setup getWorker label branches', () => {
    // PF-11：语言服务 worker 移除后，Monaco 若以任何语言 label 请求 worker，
    // 统一由 editor worker 兜底（Markdown 的 Monarch tokenization 在主线程，不依赖 worker）。
    const LANGUAGE_SERVICE_LABELS = [
        'json',
        'css',
        'scss',
        'less',
        'html',
        'handlebars',
        'razor',
        'typescript',
        'javascript'
    ]

    it('should create the editor worker for language-service labels (PF-11 removal)', () => {
        for (const label of LANGUAGE_SERVICE_LABELS) {
            expect(workerNameFor(label), `label=${label} 应回退 editor worker`).toBe(
                'EditorWorkerMock'
            )
        }
    })

    it('should create the editor worker for editor/basic-language labels', () => {
        for (const label of EDGE_LABELS) {
            expect(workerNameFor(label), `label=${label} 应回退 editor worker`).toBe(
                'EditorWorkerMock'
            )
        }
    })
})

describe('monaco-worker-setup getWorker dispatch semantics', () => {
    it('should select the editor worker for every label and ignore the workerId argument', () => {
        // 同一 label、不同 workerId：均回退 editor worker
        expect(workerNameFor('css', 'worker-id-a')).toBe('EditorWorkerMock')
        expect(workerNameFor('css', 'worker-id-b')).toBe('EditorWorkerMock')

        // 同一 workerId、不同 label：语言服务 label 与 markdown 一样回退 editor worker
        expect(workerNameFor('json', 'same-id')).toBe('EditorWorkerMock')
        expect(workerNameFor('typescript', 'same-id')).toBe('EditorWorkerMock')
        expect(workerNameFor('markdown', 'same-id')).toBe('EditorWorkerMock')
    })

    it('should return a fresh worker instance on every call', () => {
        const environment = getEnvironment()
        const first = environment.getWorker('editor', 'json')
        const second = environment.getWorker('editor', 'json')

        expect(first).not.toBe(second)
        expect(first.constructor.name).toBe('EditorWorkerMock')
        expect(second.constructor.name).toBe('EditorWorkerMock')
    })

    it('should not throw for an unrecognized label at runtime', () => {
        expect(() => getEnvironment().getWorker('worker', 'not-a-real-language')).not.toThrow()
        expect(() =>
            getEnvironment().getWorker('worker', undefined as unknown as string)
        ).not.toThrow()
    })
})

describe('monaco-worker-setup test isolation guard', () => {
    it('should mock exactly the monaco imports used by monaco-worker-setup.ts', () => {
        // ET-19：保留源码级交叉核对——mock 清单必须与源文件 import 清单严格一致，
        // 这是「源文件新增导入 → 测试 mock 漏补 → 运行期解析失败」的兜底护栏；
        // 纯行为断言无法发现「多了/少了 mock」这类集合差异。
        // 源文件 import 清单（?worker 与副作用导入均包含）
        // ET-19/Prettier 兼容：同时匹配「from 'xxx'」（含 Prettier 折行的多行 import）
        // 与副作用导入「import 'xxx'」，避免格式化后漏解析。
        const source = fs.readFileSync(SETUP_FILE, 'utf-8')
        const importedSpecifiers = [
            ...source.matchAll(/from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)
        ].map((match) => match[1] ?? match[2])

        // 本文件 vi.mock 清单（只扫描字符串字面量形式，不会匹配到本行正则本身）
        const testSource = fs.readFileSync(TEST_FILE, 'utf-8')
        // ET-19/Prettier 兼容：vi.mock( 与字符串之间允许换行（Prettier 会折行长调用）
        const mockedSpecifiers = [...testSource.matchAll(/vi\.mock\(\s*'([^']+)'/g)].map(
            (match) => match[1]
        )

        expect(importedSpecifiers.length).toBeGreaterThan(100)
        // PF-11 防回归：源文件只允许一个 ?worker 导入（editor.worker）。若重新引入
        // ts/css/html/json 语言服务 worker，该断言立即失败——它们是永不加载的死重
        // （改造前实测 5 个 worker chunk 共 15.31 MB，其中 4 个语言 worker 占 14.75 MB）。
        const workerImports = importedSpecifiers.filter((specifier) =>
            specifier.includes('?worker')
        )
        expect(workerImports).toEqual(['monaco-editor/esm/vs/editor/editor.worker?worker'])
        expect(mockedSpecifiers.sort()).toEqual(importedSpecifiers.sort())
    })
})
