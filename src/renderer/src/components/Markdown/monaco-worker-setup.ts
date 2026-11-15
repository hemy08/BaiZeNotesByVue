/**
 * PF-03 / CMP-28：Monaco worker 手动注册 + 按需语言贡献
 *
 * 背景：vite-plugin-monaco-editor@1.1.0（2022 年发布，面向 vite 2.x）与当前
 * vite 8 / electron-vite 6 不兼容——其 writeBundle 钩子与旧版 transformIndexHtml
 * 返回结构在 vite 8 已失效，无法产出 worker 文件（worker 404 后 Monaco 回退主线程）。
 * 故弃用插件，改用官方推荐的 Vite 手动方案：?worker 导入 + self.MonacoEnvironment.getWorker。
 *
 * 配合 electron.vite.config.ts 中 'monaco-editor' → editor.api 的重定向：
 * 裸包名入口（editor.main）不再进入主 chunk，本文件补齐三个缺口——
 *   1. 编辑器全部内置功能（contributions：查找/折叠/建议/右键菜单/Ctrl+G 等，与
 *      monaco-editor/esm/vs/index.js 的贡献清单逐一对应，保证行为与原来一致）；
 *   2. 精选语言贡献（只保留笔记常用语言，替代原全量 80+ 语言）；
 *   3. worker 注册（PF-11：只注册 editor worker；ts/css/html/json 语言服务 worker
 *      因本项目无 LSP 语言服务而永不加载，已移除，避免 ~14.75 MB 死重）。
 *
 * CSP 说明：生产构建的 worker chunk 与页面同源（file:// 或 http://），现有 CSP
 * default-src 'self' 已覆盖 worker-src。若运行期控制台出现 CSP 拦截 worker 的报错，
 * 需在 src/renderer/index.html 的 CSP 中补充 worker-src 'self' blob:（index.html 不在
 * 本代理范围，具体改动见 out/tool-results/r2-monaco-changes.md，由根代理执行）。
 */

// —— 0. TS 声明：本文件的 esm 子路径导入的模块类型声明见同目录 monaco-worker-types.ts ——

// —— 1. worker 导入（PF-11：仅保留编辑器基础 worker，不再打包语言服务 worker）——
// 本项目编辑器语言固定为 markdown（见 editor-options.ts），语言贡献只做 Monarch 语法
// 高亮（tokenization 在主线程完成），且未注册任何 LSP 语言服务；原先静态导入的
// ts/css/html/json 4 个语言 worker 永远不会被构造，却各自产出独立 chunk
// （实测约 14.75 MB），属纯死重，已移除。详见第 4 节回退说明。
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

// —— 2. 编辑器内置功能（contributions，与 monaco-editor/esm/vs/index.js L92-L165 逐一对应）——
import 'monaco-editor/esm/vs/editor/contrib/anchorSelect/browser/anchorSelect.js'
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-editor/esm/vs/editor/contrib/caretOperations/browser/transpose.js'
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions.js'
import 'monaco-editor/esm/vs/editor/browser/widget/codeEditor/codeEditorWidget.js'
import 'monaco-editor/esm/vs/editor/contrib/codelens/browser/codelensController.js'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-editor/esm/vs/editor/contrib/colorPicker/browser/colorPickerContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js'
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js'
import 'monaco-editor/esm/vs/editor/browser/widget/diffEditor/diffEditor.contribution.js'
import 'monaco-editor/esm/vs/editor/contrib/diffEditorBreadcrumbs/browser/contribution.js'
import 'monaco-editor/esm/vs/editor/contrib/dnd/browser/dnd.js'
import 'monaco-editor/esm/vs/editor/contrib/documentSymbols/browser/documentSymbols.js'
import 'monaco-editor/esm/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution.js'
import 'monaco-editor/esm/vs/features/find/register.js'
import 'monaco-editor/esm/vs/editor/contrib/floatingMenu/browser/floatingMenu.contribution.js'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
import 'monaco-editor/esm/vs/editor/contrib/fontZoom/browser/fontZoom.js'
import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions.js'
import 'monaco-editor/esm/vs/editor/contrib/gotoError/browser/gotoError.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js'
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js'
import 'monaco-editor/esm/vs/editor/contrib/gpu/browser/gpuActions.js'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation.js'
import 'monaco-editor/esm/vs/editor/contrib/inlayHints/browser/inlayHintsContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js'
import 'monaco-editor/esm/vs/editor/contrib/inlineProgress/browser/inlineProgress.js'
import 'monaco-editor/esm/vs/editor/contrib/inPlaceReplace/browser/inPlaceReplace.js'
import 'monaco-editor/esm/vs/editor/contrib/insertFinalNewLine/browser/insertFinalNewLine.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/inspectTokens/inspectTokens.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard.js'
import 'monaco-editor/esm/vs/editor/contrib/lineSelection/browser/lineSelection.js'
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/linkedEditing/browser/linkedEditing.js'
import 'monaco-editor/esm/vs/editor/contrib/links/browser/links.js'
import 'monaco-editor/esm/vs/editor/contrib/longLinesHelper/browser/longLinesHelper.js'
import 'monaco-editor/esm/vs/editor/contrib/middleScroll/browser/middleScroll.contribution.js'
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js'
import 'monaco-editor/esm/vs/editor/contrib/parameterHints/browser/parameterHints.js'
import 'monaco-editor/esm/vs/editor/contrib/placeholderText/browser/placeholderText.contribution.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js'
import 'monaco-editor/esm/vs/editor/contrib/readOnlyMessage/browser/contribution.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js'
import 'monaco-editor/esm/vs/editor/contrib/rename/browser/rename.js'
import 'monaco-editor/esm/vs/editor/contrib/sectionHeaders/browser/sectionHeaders.js'
import 'monaco-editor/esm/vs/editor/contrib/semanticTokens/browser/viewportSemanticTokens.js'
import 'monaco-editor/esm/vs/editor/contrib/smartSelect/browser/smartSelect.js'
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js'
import 'monaco-editor/esm/vs/editor/contrib/stickyScroll/browser/stickyScrollContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestInlineCompletions.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/toggleHighContrast/toggleHighContrast.js'
import 'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js'
import 'monaco-editor/esm/vs/editor/contrib/tokenization/browser/tokenization.js'
import 'monaco-editor/esm/vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js'
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/wordPartOperations/browser/wordPartOperations.js'
import 'monaco-editor/esm/vs/editor/browser/coreCommands.js'
import 'monaco-editor/esm/vs/editor/contrib/caretOperations/browser/caretOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js'
import 'monaco-editor/esm/vs/editor/contrib/gotoError/browser/markerSelectionStatus.js'
import 'monaco-editor/esm/vs/editor/contrib/semanticTokens/browser/documentSemanticTokens.js'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/esm/vs/editor/common/standaloneStrings.js'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css'

// —— 3. 精选语言贡献（PF-03：不再全量打包 80+ 语言；markdown 必需，其余为笔记中代码块常见语言）——
import 'monaco-editor/esm/vs/languages/definitions/markdown/register.js'
import 'monaco-editor/esm/vs/languages/definitions/mdx/register.js'
import 'monaco-editor/esm/vs/languages/definitions/javascript/register.js'
import 'monaco-editor/esm/vs/languages/definitions/typescript/register.js'
import 'monaco-editor/esm/vs/languages/definitions/css/register.js'
import 'monaco-editor/esm/vs/languages/definitions/html/register.js'
import 'monaco-editor/esm/vs/languages/definitions/xml/register.js'
import 'monaco-editor/esm/vs/languages/definitions/yaml/register.js'
import 'monaco-editor/esm/vs/languages/definitions/python/register.js'
import 'monaco-editor/esm/vs/languages/definitions/java/register.js'
import 'monaco-editor/esm/vs/languages/definitions/cpp/register.js'
import 'monaco-editor/esm/vs/languages/definitions/csharp/register.js'
import 'monaco-editor/esm/vs/languages/definitions/go/register.js'
import 'monaco-editor/esm/vs/languages/definitions/rust/register.js'
import 'monaco-editor/esm/vs/languages/definitions/php/register.js'
import 'monaco-editor/esm/vs/languages/definitions/ruby/register.js'
import 'monaco-editor/esm/vs/languages/definitions/shell/register.js'
import 'monaco-editor/esm/vs/languages/definitions/sql/register.js'
import 'monaco-editor/esm/vs/languages/definitions/mysql/register.js'
import 'monaco-editor/esm/vs/languages/definitions/pgsql/register.js'
import 'monaco-editor/esm/vs/languages/definitions/powershell/register.js'
import 'monaco-editor/esm/vs/languages/definitions/bat/register.js'
import 'monaco-editor/esm/vs/languages/definitions/ini/register.js'
import 'monaco-editor/esm/vs/languages/definitions/dockerfile/register.js'
import 'monaco-editor/esm/vs/languages/definitions/kotlin/register.js'
import 'monaco-editor/esm/vs/languages/definitions/swift/register.js'
import 'monaco-editor/esm/vs/languages/definitions/dart/register.js'
import 'monaco-editor/esm/vs/languages/definitions/scala/register.js'
import 'monaco-editor/esm/vs/languages/definitions/perl/register.js'
import 'monaco-editor/esm/vs/languages/definitions/lua/register.js'
import 'monaco-editor/esm/vs/languages/definitions/r/register.js'
import 'monaco-editor/esm/vs/languages/definitions/objective-c/register.js'
import 'monaco-editor/esm/vs/languages/definitions/graphql/register.js'
import 'monaco-editor/esm/vs/languages/definitions/handlebars/register.js'
import 'monaco-editor/esm/vs/languages/definitions/less/register.js'
import 'monaco-editor/esm/vs/languages/definitions/scss/register.js'
import 'monaco-editor/esm/vs/languages/definitions/hcl/register.js'
import 'monaco-editor/esm/vs/languages/definitions/twig/register.js'
import 'monaco-editor/esm/vs/languages/definitions/pug/register.js'
import 'monaco-editor/esm/vs/languages/definitions/solidity/register.js'
import 'monaco-editor/esm/vs/languages/definitions/elixir/register.js'
import 'monaco-editor/esm/vs/languages/definitions/protobuf/register.js'
import 'monaco-editor/esm/vs/languages/definitions/clojure/register.js'
import 'monaco-editor/esm/vs/languages/definitions/redis/register.js'
import 'monaco-editor/esm/vs/languages/definitions/restructuredtext/register.js'

// —— 4. worker 注册（Monaco 在 editor.create 前读取 self.MonacoEnvironment）——
// PF-11：全部 label（markdown/plantuml/mermaid、代码块内嵌语言，以及 json/css/html/
// typescript 等语言服务 label）统一回退到 editor worker。
// 回退是安全的：Monarch 语法高亮的 tokenization 在主线程完成，不依赖 worker；
// 语言服务 worker 只有在对应 LSP 语言服务被注册时才会被请求，而本项目未注册任何
// 语言服务（contributions 与 languages/definitions 之外没有 vs/language/* 导入）。
self.MonacoEnvironment = {
    // Monaco 的 Environment 签名是 getWorker(workerId, label)；本项目无需按 label 分发，
    // 全部请求统一返回 editor worker（TS 允许更少形参的函数赋值）。
    getWorker(): Worker {
        return new editorWorker()
    }
}
