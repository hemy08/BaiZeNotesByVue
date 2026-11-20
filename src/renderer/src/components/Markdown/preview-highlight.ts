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
 * 后续如需"任意语言按需动态加载"，需把预览渲染管线异步化（safeHighlight 变 async），
 * 成本较高，本轮不做（见 2026-11-20 全量代码扫描报告 P1-8 后续方案）。
 */
import hljs from 'highlight.js/lib/core'
import type { LanguageFn } from 'highlight.js'
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
