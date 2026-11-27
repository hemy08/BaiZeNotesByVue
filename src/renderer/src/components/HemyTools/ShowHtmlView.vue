<template>
    <!-- HTML 查看器：三态容器 / 工具栏 / 空态由 FileViewerShell 统一提供，
         本组件只保留 HTML 特有部分（srcdoc iframe、打开浏览器按钮、刷新）。 -->
    <FileViewerShell
        :is-loading="isLoading"
        :error-message="errorMessage"
        :has-content="hasContent"
        :file-path="filePath"
        :loading-text="loadingText"
        :empty-text="emptyText"
        container-class="html-view-container"
        content-wrapper-class="html-content-wrapper"
        toolbar-class="html-toolbar"
        @retry="retry"
    >
        <template #toolbar-actions>
            <button
                class="toolbar-btn"
                :title="t('toolsNetwork.common.openInBrowser')"
                @click="openInBrowser"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
            </button>
            <button
                class="toolbar-btn"
                :title="t('toolsNetwork.hemyTools.htmlView.refresh')"
                @click="retry"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path
                        d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                    ></path>
                </svg>
            </button>
        </template>
        <template #content>
            <!-- P1 安全修复（N-04）：iframe sandbox 收紧为纯展示。
                 1. 移除 allow-scripts：HTML 查看器中的脚本不再执行（行为变化）；
                 2. 移除 allow-forms / allow-popups：查看器无需提交表单或弹窗，避免
                    恶意 HTML 借表单外发数据、或诱导打开新窗口；
                 3. 保留 allow-same-origin：维持本地 HTML 的相对资源（图片/样式）加载。
                 安全约束：allow-scripts 与 allow-same-origin 绝不可同时出现——该组合
                 可让 srcdoc 内容以父窗口同源身份执行脚本并直接访问父窗口 Electron API。 -->
            <iframe
                ref="iframeRef"
                :srcdoc="htmlContent ?? ''"
                class="html-iframe"
                sandbox="allow-same-origin"
                @load="onIframeLoad"
            ></iframe>
        </template>
    </FileViewerShell>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FileViewerShell from './FileViewerShell.vue'
import { t } from '../../common/i18n'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import {
    withBaseHref,
    hasReportNavSlot,
    injectReportNav,
    getReportNavCandidatePaths,
    resolveViewerHtmlLinkClick
} from './html-view-utils'
import { useFileViewerState } from '../../composables/useFileViewerState'
import type { FileLoadContext } from '../../composables/useFileViewerState'

/** iframe 元素引用（用于锚点链接守卫：在 iframe 文档上做事件委托） */
const iframeRef = ref<HTMLIFrameElement | null>(null)

/**
 * 读取报告页静态导航片段（2026-11-19：应用内查看器 ↔ 报告 HTML 共享 assets 配套）
 *
 * 背景：报告 HTML 页面由生成脚本改为引用共享 `assets/` 导航（浏览器打开时由
 * `report-nav.js` 渲染）；但查看器 iframe 的 sandbox 不含 `allow-scripts`，页面脚本
 * 不执行 → 导航不显示。生成脚本同时产出静态片段，由本函数在渲染层读取后注入占位处。
 *
 * 性能与降级约定：
 * - **普通 HTML 零额外 IPC**：内容不含占位标记时同步返回空串，不做任何探测；
 * - 候选最多 4 个（页面同级 `assets/`、父级 `assets/` × 两种深度变体），按顺序
 *   「CHECK_EXISTS → READ_HTML」短路探测，命中即停（最坏 4 次探测 + 1 次读取）；
 * - 单候选失败（Path Guard 越界 / 文件被删 / 读取异常）静默跳过；全部失败返回空串，
 *   由调用方保持原内容（导航缺失但页面正常），不影响普通 HTML 加载。
 *
 * @param html 已读取的 HTML 内容（用于判断是否报告页）
 * @param path 被查看 HTML 的完整路径（用于推导片段候选位置）
 * @returns 静态导航片段；非报告页 / 无可用片段时返回空串
 */
async function readReportNavFragment(html: string, path: string): Promise<string> {
    if (!hasReportNavSlot(html)) {
        return ''
    }
    for (const candidate of getReportNavCandidatePaths(path)) {
        try {
            const exists = (await window.electron.ipcRenderer.invoke(
                IPC.FILE.CHECK_EXISTS,
                candidate
            )) as boolean
            if (!exists) {
                continue
            }
            const fragment = (await window.electron.ipcRenderer.invoke(
                IPC.FILE.READ_HTML,
                candidate
            )) as string | null
            if (typeof fragment === 'string' && fragment.trim().length > 0) {
                return fragment
            }
        } catch {
            // 单个候选读取失败（越界/文件消失等）：静默跳过，继续下一个候选
        }
    }
    return ''
}

/**
 * 加载 HTML 文件内容（IPC 读取 + 报告导航注入 + 注入 base href）
 *
 * @param path HTML 文件完整路径
 * @param context 加载上下文（代次/卸载守卫：过期请求直接返回，不写任何状态）
 * @returns 注入 base 后的 HTML；null 表示内容不可读（空内容按不可读处理）
 */
async function loadHtmlContent(path: string, context: FileLoadContext): Promise<string | null> {
    // 通过 IPC 读取文件内容
    const content = (await window.electron.ipcRenderer.invoke(IPC.FILE.READ_HTML, path)) as
        string | null
    if (context.isStale()) {
        return null
    }
    if (!content) {
        return null
    }
    // 2026-11-19：报告页（内容含 `<!-- baize-report-nav-slot -->` 占位标记）注入静态导航。
    // iframe sandbox 无 allow-scripts，页面内的 report-nav.js 不会执行，必须在渲染层补上；
    // 普通 HTML 无占位标记 → 零额外 IPC、内容原样返回（不受影响）。
    let html = content
    const navFragment = await readReportNavFragment(content, path)
    if (context.isStale()) {
        return null
    }
    if (navFragment) {
        try {
            html = injectReportNav(content, navFragment)
        } catch {
            // 注入异常保持原内容：导航缺失但页面正常展示
        }
    }
    // 2026-11-18 修复「HTML 查看器内相对链接点击无反应」：
    // srcdoc 文档基准 URL 是父页面，注入 `<base href>`（2026-11-20 起为
    // `app://local/<文件目录>/`，迁移前为 file://）后，报告 HTML Wiki 顶部导航、图片等
    // 相对资源可正确定位（详见 html-view-utils.ts）。
    // 注入顺序：先补导航（占位在 body）再注入 base（head），二者互不影响。
    return withBaseHref(html, path)
}

// 通用查看器状态机：三态 + 文件选择监听 + 重试/刷新 + 加载守卫
const {
    content: htmlContent,
    isLoading,
    errorMessage,
    hasContent,
    filePath,
    loadingText,
    emptyText,
    retry,
    finishLoading,
    loadWithGuard
} = useFileViewerState<string>({
    viewerName: 'ShowHtmlView',
    fileExtension: 'html',
    fileSelectedEvent: EVENT_BUS.HTML_FILE_SELECTED,
    loader: loadHtmlContent,
    loadingTextKey: 'toolsNetwork.hemyTools.htmlView.loading',
    emptyTextKey: 'toolsNetwork.hemyTools.htmlView.empty',
    unreadableKey: 'toolsNetwork.hemyTools.htmlView.unreadable',
    loadFailedKey: 'toolsNetwork.hemyTools.htmlView.loadFailed',
    loadFailedLog: '加载 HTML 文件失败:'
})

/**
 * 在浏览器中打开
 */
function openInBrowser(): void {
    if (filePath.value) {
        // 2026-11-18（遗留清单 #1）：本地 HTML 走专用通道（OPEN_EXTERNAL_LINK 仅放行
        // http/https，原实现点击无效）；主进程校验 .html 扩展名 + Path Guard 后
        // 交给系统默认浏览器打开。
        window.electron.ipcRenderer.send(IPC.FILE.OPEN_IN_BROWSER, filePath.value)
    }
}

/**
 * iframe 加载完成：兜底结束加载状态
 */
function onIframeLoad(): void {
    finishLoading()
    bindIframeLinkGuard()
}

/**
 * 2026-11-19（用户反馈修复）：iframe 内 fragment 锚点导航守卫。
 *
 * 背景（两个真实问题）：
 * 1. 报告页左侧悬浮目录（`.toc`）链接均为 `#sec-N`；在 iframe 中点击时 Chromium 会把
 *    目标「scroll into view」并连带滚动**父文档**滚动容器——经顶部导航跳转到 file://
 *    文档后再点击，整个工作区上移、被菜单栏遮挡；
 * 2. HTML 查看器以 srcdoc + 注入 `<base>` 渲染，`#anchor` 可能被 base 解析为 file://
 *    文档导航（sandbox 下导航失败 → iframe 空白）。
 *
 * 修复：父页面同源访问 iframe 文档做事件委托：
 * 1. 「纯 fragment」链接 → 仅滚动 iframe 内部（scrollTo，避免冒泡滚动父级滚动链）；
 * 2. 本地 `.html` 跨文档链接（报告顶部导航等）→ 走查看器加载器（注入静态导航 + 更新
 *    filePath），避免 iframe 直接跳 file:// 后导航消失/路径不切换；http(s) 等默认行为。
 * iframe 每次导航后 load 事件重新绑定，
 * 文档级标记防止重复绑定。
 */
function bindIframeLinkGuard(): void {
    const iframe = iframeRef.value
    const doc = iframe?.contentDocument
    if (!doc) {
        return
    }
    const markedDoc = doc as Document & { __baizeAnchorGuardBound?: boolean }
    if (markedDoc.__baizeAnchorGuardBound) {
        return
    }
    markedDoc.__baizeAnchorGuardBound = true
    doc.addEventListener(
        'click',
        (event: MouseEvent) => {
            const target = event.target as Element | null
            const link = target?.closest?.('a')
            if (!link) {
                return
            }
            const href = link.getAttribute('href') ?? ''
            // 2026-11-20（用户反馈修复）：本地 .html 链接（报告顶部导航等）不再让 iframe
            // 直接跳 file://（目标页 report-nav.js 在 sandbox 下不执行 → 导航消失，且
            // 查看器路径停留在旧文件）。改为走查看器自身加载器：重新读取 + 注入静态导航
            // + 更新 filePath；http(s)/mailto/非 HTML/当前页自身保持默认行为。
            if (!href.startsWith('#')) {
                const action = resolveViewerHtmlLinkClick(link.href, filePath.value)
                if (action.kind === 'navigate') {
                    event.preventDefault()
                    void loadWithGuard(action.path, action.name)
                }
                return
            }
            event.preventDefault()
            const win = doc.defaultView
            if (!win || href.length <= 1) {
                return
            }
            let id = href.slice(1)
            try {
                id = decodeURIComponent(id)
            } catch {
                // 非法编码按原文查找
            }
            const anchor = doc.getElementById(id)
            if (!anchor) {
                return
            }
            // 仅滚动 iframe 内部（报告页顶部导航高 72px，预留偏移）
            const top = anchor.getBoundingClientRect().top + win.scrollY - 72
            win.scrollTo({ top: Math.max(0, top) })
        },
        true
    )
}
</script>

<style scoped>
/* HTML 查看器特有：iframe 占满剩余空间；min-height:0 允许 flex 收缩，
   由 iframe 文档自身滚动（避免内容撑动外层布局） */
.html-iframe {
    flex: 1;
    min-height: 0;
    width: 100%;
    border: none;
    background-color: #ffffff;
}
</style>
