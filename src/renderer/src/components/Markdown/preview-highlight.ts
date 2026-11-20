/**
 * preview-highlight.ts
 * P1-8：预览代码高亮的 highlight.js 单例（core + 精选常用语言）。
 *
 * 背景（2026-11-20 全量代码扫描）：
 * 原实现 `import hljs from 'highlight.js'` 引入默认入口，会注册 highlight.js 全量
 * 199 种语言（预览 chunk 中 hljs 约占 1.29 MiB，首次进入预览需加载/注册约 55ms），
 * 而笔记代码块实际只用到少数常用语言、自动语言探测也已在 PF-1 关闭。
 *
 * 本模块改为：
 * 1. 使用 `highlight.js/lib/core`（不含任何语言定义）；
 * 2. 只注册精选语言（见 HIGHLIGHT_LANGUAGES，约 25 种，覆盖项目测试/文档与笔记高频语言）；
 * 3. 未知语言不注册、不探测：由 preview-markdown-it.ts 的 safeHighlight 回退为转义文本
 *    （内容不丢失、不抛异常，行为与改造前一致）。
 *
 * 新增语言：在 HIGHLIGHT_LANGUAGES 追加 import 与表项即可（静态注册，仍属于预览异步 chunk）。
 *
 * P1-8 后续（冷门语言按需预取，2026-11-20）：在「未知语言转义」之外增加低风险增强——
 * 预览管线在 md.render 前扫描文档围栏语言，对白名单外但已建立显式映射的常见冷门语言
 * 动态 import highlight.js 语言包并注册，同一轮同步渲染即命中高亮（见文件末尾第二节）。
 * 未映射语言仍按原语义转义；预取失败也不影响渲染（不引入异步渲染/半渲染）。
 */
import hljs from 'highlight.js/lib/core'
import type { LanguageFn } from 'highlight.js'
import { logger } from '../../common/logger'
import actionscript from 'highlight.js/lib/languages/actionscript'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

/**
 * 预览高亮注册的语言白名单（名称 → highlight.js 语言定义）。
 *
 * 选择依据：
 * - 项目测试/文档实际出现：js/ts、html（xml）、css、c、cpp、go、python、markdown、
 *   text（plaintext）、yaml/yml、json、sql、bash/sh；
 * - 笔记代码块高频补充：java、csharp、rust、php、ruby、kotlin、swift、dockerfile、diff、ini/toml；
 * - 历史兼容：actionscript 由原 MarkdownPreviewComponent 挂载时显式 registerLanguage，
 *   现统一在此注册，行为不变。
 */
const HIGHLIGHT_LANGUAGES: ReadonlyArray<readonly [string, LanguageFn]> = [
    ['actionscript', actionscript],
    ['bash', bash],
    ['c', c],
    ['cpp', cpp],
    ['csharp', csharp],
    ['css', css],
    ['diff', diff],
    ['dockerfile', dockerfile],
    ['go', go],
    ['ini', ini],
    ['java', java],
    ['javascript', javascript],
    ['json', json],
    ['kotlin', kotlin],
    ['markdown', markdown],
    ['php', php],
    ['plaintext', plaintext],
    ['python', python],
    ['ruby', ruby],
    ['rust', rust],
    ['sql', sql],
    ['swift', swift],
    ['typescript', typescript],
    ['xml', xml],
    ['yaml', yaml]
]

for (const [languageName, languageDefinition] of HIGHLIGHT_LANGUAGES) {
    hljs.registerLanguage(languageName, languageDefinition)
}

/** 预览高亮使用的 highlight.js 单例（core + 精选语言；markdown-it-highlightjs 与守卫共享） */
export default hljs

/* ==================== 二、P1-8 后续：冷门语言按需预取（低风险增强） ====================
 * 背景：静态白名单只有 25 种高频语言，白名单外语言由 safeHighlight 回退为转义纯文本
 * （内容不丢、不报错，但无高亮）。本节的增强不改变同步渲染契约：
 *
 * 1. 预览组件在 md.render 之前（与 KaTeX 同一异步前置位置）调用
 *    EnsurePreviewHighlightLanguagesLoaded(text)；
 * 2. 该函数扫描文档围栏语言，只对「不在静态白名单、但已在下方显式映射」的语言
 *    动态 import 对应 highlight.js 语言包并 registerLanguage；
 * 3. await 完成后同一轮同步 md.render 即可命中高亮——**首轮即完整高亮，不存在
 *    「第一次转义、下次再高亮」的闪烁或半渲染**；
 * 4. 未映射语言 / 预取失败 / 检测异常：safeHighlight 行为与改造前完全一致（转义文本），
 *    渲染链路不感知异步、不抛异常。
 *
 * 清单取舍：只为「笔记与开发文档中常见、但未进静态白名单」的语言建立显式动态 import 映射。
 * Vite/rolldown 会为每个映射生成独立小 chunk（仅文档实际用到该语言时请求），不进入预览
 * chunk 首载闭包；不引入 highlight.js 全量 199 语言映射（约 190 个小 chunk 的构建/产物净增，
 * 报告评估后不采用），其余语言仍按「未知语言转义」处理。
 * 新增语言：在 LAZY_HIGHLIGHT_LANGUAGES 追加一行（语言名 → 动态 import）并视需要补别名即可。
 */

/** 动态 import 的语言模块形状（ESM/CJS 两种导出形态都兼容：default 或模块本身为函数） */
type LazyLanguageModule = { default?: LanguageFn } | LanguageFn

/** 语言名（highlight.js 文件名 / 注册名）→ 动态 import 工厂 */
const LAZY_HIGHLIGHT_LANGUAGES: Readonly<Record<string, () => Promise<LazyLanguageModule>>> = {
    apache: () => import('highlight.js/lib/languages/apache'),
    arduino: () => import('highlight.js/lib/languages/arduino'),
    awk: () => import('highlight.js/lib/languages/awk'),
    clojure: () => import('highlight.js/lib/languages/clojure'),
    cmake: () => import('highlight.js/lib/languages/cmake'),
    coffeescript: () => import('highlight.js/lib/languages/coffeescript'),
    crystal: () => import('highlight.js/lib/languages/crystal'),
    d: () => import('highlight.js/lib/languages/d'),
    dart: () => import('highlight.js/lib/languages/dart'),
    dns: () => import('highlight.js/lib/languages/dns'),
    dos: () => import('highlight.js/lib/languages/dos'),
    elixir: () => import('highlight.js/lib/languages/elixir'),
    elm: () => import('highlight.js/lib/languages/elm'),
    erlang: () => import('highlight.js/lib/languages/erlang'),
    fortran: () => import('highlight.js/lib/languages/fortran'),
    fsharp: () => import('highlight.js/lib/languages/fsharp'),
    glsl: () => import('highlight.js/lib/languages/glsl'),
    gradle: () => import('highlight.js/lib/languages/gradle'),
    graphql: () => import('highlight.js/lib/languages/graphql'),
    groovy: () => import('highlight.js/lib/languages/groovy'),
    haskell: () => import('highlight.js/lib/languages/haskell'),
    http: () => import('highlight.js/lib/languages/http'),
    julia: () => import('highlight.js/lib/languages/julia'),
    latex: () => import('highlight.js/lib/languages/latex'),
    less: () => import('highlight.js/lib/languages/less'),
    lisp: () => import('highlight.js/lib/languages/lisp'),
    lua: () => import('highlight.js/lib/languages/lua'),
    makefile: () => import('highlight.js/lib/languages/makefile'),
    matlab: () => import('highlight.js/lib/languages/matlab'),
    nginx: () => import('highlight.js/lib/languages/nginx'),
    nim: () => import('highlight.js/lib/languages/nim'),
    nix: () => import('highlight.js/lib/languages/nix'),
    objectivec: () => import('highlight.js/lib/languages/objectivec'),
    ocaml: () => import('highlight.js/lib/languages/ocaml'),
    perl: () => import('highlight.js/lib/languages/perl'),
    powershell: () => import('highlight.js/lib/languages/powershell'),
    prolog: () => import('highlight.js/lib/languages/prolog'),
    properties: () => import('highlight.js/lib/languages/properties'),
    protobuf: () => import('highlight.js/lib/languages/protobuf'),
    r: () => import('highlight.js/lib/languages/r'),
    sas: () => import('highlight.js/lib/languages/sas'),
    scala: () => import('highlight.js/lib/languages/scala'),
    scheme: () => import('highlight.js/lib/languages/scheme'),
    scss: () => import('highlight.js/lib/languages/scss'),
    stata: () => import('highlight.js/lib/languages/stata'),
    stylus: () => import('highlight.js/lib/languages/stylus'),
    tcl: () => import('highlight.js/lib/languages/tcl'),
    vbnet: () => import('highlight.js/lib/languages/vbnet'),
    verilog: () => import('highlight.js/lib/languages/verilog'),
    vhdl: () => import('highlight.js/lib/languages/vhdl'),
    vim: () => import('highlight.js/lib/languages/vim'),
    wasm: () => import('highlight.js/lib/languages/wasm')
}

/**
 * 围栏语言别名 → 动态 import 语言名（只覆盖常见写法；未收录别名仍按未知语言转义）。
 * 说明：语言包内部还会注册自己的 aliases（如 dos 的 bat/cmd、objectivec 的 objc），
 * 但预取发生在注册之前，扫描阶段需要可确定地反查模块，故必须显式列出。
 */
const LAZY_HIGHLIGHT_LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
    aconf: 'apache',
    apacheconf: 'apache',
    bat: 'dos',
    cmd: 'dos',
    cl: 'lisp',
    clj: 'clojure',
    cljc: 'clojure',
    cljs: 'clojure',
    coffee: 'coffeescript',
    cson: 'coffeescript',
    edn: 'clojure',
    el: 'lisp',
    erl: 'elixir',
    ex: 'elixir',
    exs: 'elixir',
    f03: 'fortran',
    f08: 'fortran',
    f90: 'fortran',
    f95: 'fortran',
    fs: 'fsharp',
    fsi: 'fsharp',
    fsscript: 'fsharp',
    fsx: 'fsharp',
    gql: 'graphql',
    hs: 'haskell',
    https: 'http',
    iced: 'coffeescript',
    make: 'makefile',
    mak: 'makefile',
    mk: 'makefile',
    mm: 'objectivec',
    'obj-c': 'objectivec',
    'obj-c++': 'objectivec',
    objc: 'objectivec',
    pl: 'perl',
    pm: 'perl',
    proto: 'protobuf',
    ps: 'powershell',
    ps1: 'powershell',
    pwsh: 'powershell',
    scm: 'scheme',
    ss: 'scheme',
    styl: 'stylus',
    sv: 'verilog',
    tex: 'latex',
    v: 'verilog',
    vhd: 'vhdl'
}

/** 会话级：已成功预取并注册的语言（诊断/单测用） */
const prefetchedLazyLanguages = new Set<string>()
/** 会话级：预取失败的语言（避免每次渲染重复 import/刷告警） */
const failedLazyLanguages = new Set<string>()
/** 会话级：按语言去重的加载 Promise（并发/重复调用共享同一次 import） */
const lazyLanguagePromises = new Map<string, Promise<boolean>>()
/** 会话级：动态 import 尝试次数（诊断/单测用；同一语言最多 1 次） */
let lazyLanguageLoadAttempts = 0

/** P1-8 后续：某语言是否已通过按需预取注册成功（诊断/单元测试用） */
export function IsPreviewHighlightLanguagePrefetched(languageName: string): boolean {
    return prefetchedLazyLanguages.has(languageName.toLowerCase())
}

/** P1-8 后续：冷门语言动态 import 尝试次数（诊断/单元测试用；文档无冷门语言时应保持 0） */
export function GetPreviewHighlightPrefetchAttemptCount(): number {
    return lazyLanguageLoadAttempts
}

/** P1-8 后续：已预取成功的语言名列表（诊断/单元测试用） */
export function GetPreviewHighlightPrefetchedLanguages(): string[] {
    return [...prefetchedLazyLanguages]
}

/**
 * P1-8 后续：提取文档围栏代码块声明的语言（近似 CommonMark 围栏规则，宁多载不漏）。
 *
 * - 支持 ``` 与 ~~~ 围栏、任意缩进（含列表内缩进）与 blockquote 前缀（`> ```js`）；
 * - 围栏内出现的伪围栏行不会被视为新的语言声明（只有与开启围栏同字符、长度不短且
 *   info 为空的关闭行才结束当前围栏）；
 * - info string 取第一个空白分隔的 token（忽略 markdown-it 属性标注，如 ```js {.line}）；
 * - 无围栏标记的文档零成本快速返回（绝大多数纯文本/普通 Markdown）。
 *
 * 该函数只影响「是否预取语言包」，不参与渲染，因此宽松检测（多取语言）不损害正确性。
 */
export function CollectPreviewFenceLanguages(text: string): string[] {
    if (typeof text !== 'string' || text.length === 0) {
        return []
    }
    if (!text.includes('```') && !text.includes('~~~')) {
        return []
    }
    const languages: string[] = []
    const seen = new Set<string>()
    /** 当前开启的围栏（null 表示不在围栏内） */
    let openFence: { char: string; length: number } | null = null
    for (const rawLine of text.split('\n')) {
        // blockquote 前缀（含嵌套）不改变围栏语义：先剥离 `>` 标记再判定
        const line = rawLine.replace(/^\s*(?:>\s*)+/, '')
        if (openFence) {
            const closeMatch = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
            if (
                closeMatch &&
                closeMatch[1][0] === openFence.char &&
                closeMatch[1].length >= openFence.length
            ) {
                openFence = null
            }
            continue
        }
        const openMatch = /^\s*(`{3,}|~{3,})\s*(.*)$/.exec(line)
        if (!openMatch) {
            continue
        }
        const fence = openMatch[1]
        openFence = { char: fence[0], length: fence.length }
        const info = openMatch[2].trim()
        if (info.length === 0) {
            continue
        }
        const language = info.split(/\s+/)[0].toLowerCase()
        if (language.length > 0 && !seen.has(language)) {
            seen.add(language)
            languages.push(language)
        }
    }
    return languages
}

/**
 * P1-8 后续：按需加载单个冷门语言包并注册（会话级幂等；失败只告警，不抛异常）。
 * @returns 是否注册成功
 */
function prefetchHighlightLanguage(
    languageName: string,
    loader: () => Promise<LazyLanguageModule>
): Promise<boolean> {
    const existing = lazyLanguagePromises.get(languageName)
    if (existing) {
        return existing
    }
    lazyLanguageLoadAttempts += 1
    const promise = loader()
        .then((module) => {
            // 兼容 ESM（default 导出函数）与 CJS interop（模块本身即函数）两种形态
            const definition =
                typeof module === 'function' ? module : (module as { default?: LanguageFn }).default
            if (typeof definition !== 'function') {
                throw new Error(`highlight.js 语言包 ${languageName} 未导出语言定义函数`)
            }
            hljs.registerLanguage(languageName, definition)
            prefetchedLazyLanguages.add(languageName)
            return true
        })
        .catch((error: unknown) => {
            failedLazyLanguages.add(languageName)
            logger.warn(
                `[PreviewHighlight] 语言包 '${languageName}' 动态加载失败，该语言回退为转义文本:`,
                error
            )
            return false
        })
    lazyLanguagePromises.set(languageName, promise)
    return promise
}

/**
 * P1-8 后续：预览渲染前的语言预取异步前置（无围栏/无冷门语言时零动态 import）。
 *
 * 调用约束：必须在同步的 `md.render` 之前 await 完成（渲染组件已按此顺序接入）。
 * 只对「围栏实际出现、未注册、且已显式映射」的语言发起动态 import；
 * 未知语言/加载失败均不抛异常，后续 safeHighlight 按原语义转义。
 * @param text 待渲染的 Markdown 文本（snippets 展开后）
 */
export async function EnsurePreviewHighlightLanguagesLoaded(text: string): Promise<void> {
    try {
        const fenceLanguages = CollectPreviewFenceLanguages(text)
        if (fenceLanguages.length === 0) {
            return
        }
        const pending: Promise<boolean>[] = []
        for (const language of fenceLanguages) {
            if (hljs.getLanguage(language)) {
                continue
            }
            const canonicalName = LAZY_HIGHLIGHT_LANGUAGE_ALIASES[language] ?? language
            const loader = LAZY_HIGHLIGHT_LANGUAGES[canonicalName]
            if (
                !loader ||
                hljs.getLanguage(canonicalName) ||
                failedLazyLanguages.has(canonicalName)
            ) {
                continue
            }
            pending.push(prefetchHighlightLanguage(canonicalName, loader))
        }
        if (pending.length > 0) {
            await Promise.all(pending)
        }
    } catch (error) {
        // 预取是增强项：任何异常都不得阻断预览（渲染仍按未知语言转义）
        logger.warn('[PreviewHighlight] 冷门语言预取失败，按已知语言集合渲染:', error)
    }
}
