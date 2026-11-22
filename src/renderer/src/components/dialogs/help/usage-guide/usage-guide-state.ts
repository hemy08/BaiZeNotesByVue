/**
 * 帮助 → 使用指导：本地 HTML 指南的地址解析与显隐状态。
 *
 * 指南文件放在 `src/renderer/public/usage-guide.html`，构建时由 Vite 复制到
 * `out/build/renderer/`，随安装包进入 asar；因此：
 * - 生产环境：`app://baize/usage-guide.html`（与主窗口同源，frame-src 'self' 可加载）；
 * - 开发环境：`http://localhost:<port>/usage-guide.html`（Vite public 目录直接提供）；
 * - 不新增 IPC / 文件系统白名单 / CSP 例外，也不依赖外部网络。
 */
import { reactive } from 'vue'

/** 指南相对入口页的文件名 */
export const USAGE_GUIDE_FILE_NAME = 'usage-guide.html'

/** 兜底地址（无 window 时仅用于测试/SSR 防御） */
export const USAGE_GUIDE_FALLBACK_URL = `app://baize/${USAGE_GUIDE_FILE_NAME}`

/**
 * 以当前页面 URL 为基准解析指南地址：
 * - app://baize/index.html → app://baize/usage-guide.html
 * - http://localhost:5173/index.html → http://localhost:5173/usage-guide.html
 */
export function resolveUsageGuideUrl(locationHref: string | undefined): string {
    if (!locationHref) return USAGE_GUIDE_FALLBACK_URL
    try {
        return new URL(USAGE_GUIDE_FILE_NAME, locationHref).href
    } catch {
        return USAGE_GUIDE_FALLBACK_URL
    }
}

/** 当前运行环境下的指南地址（组件内实时计算，兼容开发/生产） */
export function getUsageGuideUrl(): string {
    if (typeof window === 'undefined') return USAGE_GUIDE_FALLBACK_URL
    return resolveUsageGuideUrl(window.location?.href)
}

/** 使用指导对话框状态（宿主与组件共享） */
export const usageGuideDialogState = reactive<{ visible: boolean }>({
    visible: false
})

/** 打开使用指导 */
export function openUsageGuideDialogState(): void {
    usageGuideDialogState.visible = true
}

/** 关闭使用指导（只切显隐，保留宿主） */
export function closeUsageGuideDialogState(): void {
    usageGuideDialogState.visible = false
}
