/**
 * app:// 自定义协议共享纯函数层（2026-11-20 renderer file:// → app:// 迁移）
 *
 * 背景：
 * 关闭 Electron fuse `grantFileProtocolExtraPrivileges` 后，`file://` 页面/资源加载能力失效
 * （实测：fuse 关闭后 file:// 入口直接 ERR_FILE_NOT_FOUND / ERR_FAILED，asar 内与外置真实
 * 文件一致不可用）。因此 renderer 页面改由自定义标准安全协议 `app://` 提供：
 *
 * - `app://baize/index.html`：renderer 构建产物（严格限定在 out/build/renderer 根内）；
 * - `app://local/<绝对路径>`：用户本地文件（Markdown 预览本地图片、HTML 查看器 base href），
 *   由主进程 Path Guard 白名单校验，拒绝目录穿越与越权路径；
 * - `app://plantuml/index.html`：PlantUML 离线渲染页（extraResources/plantuml 根内）。
 *
 * 本模块只包含**不依赖 electron / node:path** 的纯字符串逻辑，主进程（协议 handler）与
 * 渲染进程（本地资源 URL 生成）共用同一套编码/解码口径，避免两端规则漂移。
 *
 * 运行时开关（`setAppProtocolActive`）：
 * - 打包/构建产物 renderer 由 app:// 加载 → 本地资源必须改走 `app://local`（file:// 已被
 *   Chromium 从 app:// origin 禁止，且 fuse 关闭后 file 协议不可用）；
 * - Vite dev server（http://localhost）模式保持 file:// 口径（webSecurity 关闭、无需迁移）；
 * 由渲染层入口按 `window.location.protocol === 'app:'` 显式设置，单测可显式切换。
 */
import { dirToBaseHref, toFileUrl } from '../utils/path'

/** 自定义协议 scheme（注册为 standard/secure/supportFetchAPI） */
export const APP_PROTOCOL_SCHEME = 'app'
/** renderer 构建产物宿主（app://baize/index.html） */
export const APP_RENDERER_HOST = 'baize'
/** 用户本地文件宿主（app://local/E:/notes/a.png） */
export const APP_LOCAL_FILE_HOST = 'local'
/** PlantUML 离线渲染页宿主（app://plantuml/index.html） */
export const APP_PLANTUML_HOST = 'plantuml'
/** renderer 入口 pathname（主窗口加载与导航白名单唯一口径） */
export const APP_RENDERER_INDEX_PATHNAME = '/index.html'

/**
 * registerSchemesAsPrivileged 使用的标准安全协议特权：
 * - standard：按标准 URL 解析（有 host/origin，相对路径与同源判定按 Web 语义工作）；
 * - secure：视为安全上下文（worker/fetch/crypto.subtle 等标准能力可用）；
 * - supportFetchAPI：渲染层 fetch(app://) 可用（CSP connect-src 'self' 覆盖）；
 * - corsEnabled：跨 origin 请求走 CORS 校验（app://local 不返回 CORS 头 → 渲染层无法 fetch
 *   本地文件内容，只能作为 img/style 等子资源加载，保持 file 协议此前的只读资源语义）；
 * - stream：支持流式响应体。
 */
export const APP_PROTOCOL_PRIVILEGES = {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
} as const

/** 协议是否启用（渲染层入口按实际页面协议设置；默认 false = 旧 file:// 口径） */
let appProtocolActive = false

/** 设置当前 renderer 是否由 app:// 加载（渲染层入口调用一次） */
export function setAppProtocolActive(active: boolean): void {
    appProtocolActive = active === true
}

/** 当前是否 app:// 模式（渲染层用于选择本地资源 URL 方案） */
export function isAppProtocolActive(): boolean {
    return appProtocolActive
}

/** 重置运行时开关（单测隔离用） */
export function resetAppProtocolStateForTesting(): void {
    appProtocolActive = false
}

/** 安全解析 URL（非字符串/非法 URL 返回 null，不抛异常） */
export function parseAppProtocolUrl(url: unknown): URL | null {
    if (typeof url !== 'string' || url.trim().length === 0) {
        return null
    }
    try {
        return new URL(url)
    } catch {
        return null
    }
}

/** 是否为 app:// 协议 URL */
export function isAppProtocolUrl(url: string): boolean {
    const parsed = parseAppProtocolUrl(url)
    return parsed !== null && parsed.protocol === `${APP_PROTOCOL_SCHEME}:`
}

/** 是否为 app:// 协议 URL 且宿主为指定值 */
function hasAppHost(url: string, host: string): boolean {
    const parsed = parseAppProtocolUrl(url)
    return (
        parsed !== null && parsed.protocol === `${APP_PROTOCOL_SCHEME}:` && parsed.hostname === host
    )
}

/** 是否为 renderer 页面（app://baize）URL */
export function isAppRendererUrl(url: string): boolean {
    return hasAppHost(url, APP_RENDERER_HOST)
}

/** 是否为本地文件（app://local）URL */
export function isAppLocalFileUrl(url: string): boolean {
    return hasAppHost(url, APP_LOCAL_FILE_HOST)
}

/** renderer 入口 URL（主窗口加载口径，query 由调用方按需追加） */
export function buildAppRendererUrl(search = ''): string {
    const suffix = search.length > 0 ? (search.startsWith('?') ? search : `?${search}`) : ''
    return `${APP_PROTOCOL_SCHEME}://${APP_RENDERER_HOST}${APP_RENDERER_INDEX_PATHNAME}${suffix}`
}

/** PlantUML 离线渲染页 URL（隐藏渲染窗口加载口径） */
export function buildPlantumlPageUrl(): string {
    return `${APP_PROTOCOL_SCHEME}://${APP_PLANTUML_HOST}${APP_RENDERER_INDEX_PATHNAME}`
}

/**
 * 判断 URL 是否为「renderer 入口」（app://baize/index.html，允许 query）。
 * 主窗口导航白名单与 Web 权限受信来源判定共用该口径。
 */
export function isAppRendererIndexUrl(url: string): boolean {
    const parsed = parseAppProtocolUrl(url)
    if (parsed === null) {
        return false
    }
    return (
        parsed.protocol === `${APP_PROTOCOL_SCHEME}:` &&
        parsed.hostname === APP_RENDERER_HOST &&
        parsed.pathname === APP_RENDERER_INDEX_PATHNAME
    )
}

/**
 * 本地绝对路径 → app://local URL。
 *
 * 编码口径与 `shared/utils/path.toFileUrl` 对齐：反斜杠归一化为 `/`、Windows 盘符补前导
 * `/`（`E:/a.png` → `app://local/E:/a.png`）、`encodeURI` 编码中文/空格、`#`/`?` 单独转义。
 *
 * 说明：URL 的 pathname 即「带前导 `/` 的本地绝对路径」，因此 `<base href>` 天然支持相对
 * 路径解析（HTML 查看器报告页的 `../README.html`、`assets/report.css` 等）。
 *
 * @param absolutePath 本地绝对路径（Windows 反斜杠 / POSIX 斜杠均可）
 * @returns app://local URL（入参为空/非字符串时返回空串，调用方按无效 URL 处理）
 */
export function localPathToAppLocalUrl(absolutePath: string): string {
    if (typeof absolutePath !== 'string' || absolutePath.trim().length === 0) {
        return ''
    }
    return `${APP_PROTOCOL_SCHEME}://${APP_LOCAL_FILE_HOST}${encodeLocalPathForUrl(absolutePath, 'file')}`
}

/**
 * 本地文件路径 → `<base href>` 基准 URL（指向文件所在目录，保留尾部 `/`）。
 * 目录语义与 `shared/utils/path.dirToBaseHref` 逐字一致。
 */
export function localDirToAppLocalBaseHref(filePath: string): string {
    return `${APP_PROTOCOL_SCHEME}://${APP_LOCAL_FILE_HOST}${encodeLocalPathForUrl(filePath, 'dir')}`
}

/**
 * 编码本地路径为 URL pathname（内部工具）：
 * - `file` 模式：整条文件路径（Windows 盘符补前导 `/`）；
 * - `dir` 模式：取所在目录（保留尾部 `/`），语义对齐 dirToBaseHref。
 */
function encodeLocalPathForUrl(value: string, mode: 'file' | 'dir'): string {
    let normalized = String(value || '').replace(/\\/g, '/')
    if (mode === 'dir') {
        const slash = normalized.lastIndexOf('/')
        normalized = slash >= 0 ? normalized.slice(0, slash + 1) : normalized
    }
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
    // encodeURI 保留 "/" ":"，编码中文/空格；`#`/`?` 保留会改变 URL 语义，必须转义
    return encodeURI(withLeadingSlash).replace(/#/g, '%23').replace(/\?/g, '%3F')
}

/**
 * app://local URL 的 pathname（已解码）→ 本地绝对路径。
 *
 * 形态约定（与 localPathToAppLocalUrl 互逆）：
 * - Windows 盘符：pathname `/E:/notes/a.png` → `E:/notes/a.png`（去掉前导 `/`）；
 * - UNC：pathname `//server/share/a.png` → `//server/share/a.png`（保留前导 `//`）；
 * - POSIX：pathname `/home/notes/a.png` → `/home/notes/a.png`。
 *
 * @param pathname URL pathname（通常为 `url.pathname`）
 * @returns 本地路径；非法编码/含 NUL/控制字符时返回 null
 */
export function localPathFromAppLocalPathname(pathname: string): string | null {
    if (typeof pathname !== 'string' || pathname.length === 0) {
        return null
    }
    let decoded: string
    try {
        decoded = decodeURIComponent(pathname)
    } catch {
        return null
    }
    if (hasControlChars(decoded)) {
        return null
    }
    // Windows 盘符：/E:/notes/a.png → E:/notes/a.png
    if (/^\/[A-Za-z]:[\\/]/.test(decoded) || /^\/[A-Za-z]:$/.test(decoded)) {
        return decoded.slice(1)
    }
    // UNC：//server/share/a.png 原样保留（Windows path 语义可识别前导双斜杠）
    if (decoded.startsWith('//')) {
        return decoded
    }
    return decoded
}

/**
 * app://local URL → 本地绝对路径（HTML 查看器把 iframe 内已解析的链接 href 换回文件路径）。
 *
 * @param url app://local URL（或 file:// URL 的兼容入参由 fileUrlToAppLocalUrl 处理）
 * @returns 本地路径；非 app://local / 非法 URL 返回 null
 */
export function appLocalUrlToLocalPath(url: string): string | null {
    const parsed = parseAppProtocolUrl(url)
    if (
        parsed === null ||
        parsed.protocol !== `${APP_PROTOCOL_SCHEME}:` ||
        parsed.hostname !== APP_LOCAL_FILE_HOST
    ) {
        return null
    }
    return localPathFromAppLocalPathname(parsed.pathname)
}

/**
 * file:// URL → app://local URL（用户 Markdown 中硬编码 file:// 绝对路径的兼容转换）。
 *
 * 兼容 Windows 盘符形态（`file:///E:/a.png`）与 UNC 形态（`file://server/share/a.png`）；
 * POSIX 保留绝对路径。非 file: URL 返回 null。
 */
export function fileUrlToAppLocalUrl(fileUrl: string): string | null {
    const parsed = parseAppProtocolUrl(fileUrl)
    if (parsed === null || parsed.protocol !== 'file:') {
        return null
    }
    let localPath = localPathFromAppLocalPathname(parsed.pathname)
    if (localPath === null) {
        return null
    }
    // UNC file URL：file://server/share/x → //server/share/x（host 即共享服务器）
    if (parsed.hostname.length > 0) {
        localPath = `//${parsed.hostname}${parsed.pathname}`
        localPath = localPathFromAppLocalPathname(localPath) ?? localPath
    }
    return localPathToAppLocalUrl(localPath)
}

/**
 * 本地绝对路径 → 当前 renderer 可加载的资源 URL：
 * - app:// 模式 → app://local/...（fuse 关闭后 file:// 不可用）；
 * - 其它（Vite dev server）→ file://...（保持迁移前行为）。
 */
export function toRendererLocalResourceUrl(absolutePath: string): string {
    return appProtocolActive ? localPathToAppLocalUrl(absolutePath) : toFileUrl(absolutePath)
}

/**
 * 本地文件路径 → 当前 renderer 的 `<base href>` 基准 URL：
 * - app:// 模式 → app://local/<目录>/；
 * - 其它（Vite dev server）→ file:///<目录>/（保持迁移前行为）。
 */
export function dirToRendererBaseHref(filePath: string): string {
    return appProtocolActive ? localDirToAppLocalBaseHref(filePath) : dirToBaseHref(filePath)
}

/* ============================================================================
 * 主进程协议 handler 使用的路径解析（纯字符串，便于单测安全边界）
 * ========================================================================== */

/** 是否含 C0 控制字符（含 NUL；与 shared/utils/validate.hasControlChars 同口径） */
function hasControlChars(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        if (value.charCodeAt(index) <= 0x1f) {
            return true
        }
    }
    return false
}

/**
 * 解析 app://<renderer 宿主> 请求的**相对路径**（严格限制在 renderer 根内）。
 *
 * 目录穿越防护（拒绝即返回 null，由 handler 统一按 403 处理）：
 * - 非法百分号编码、含 NUL/控制字符；
 * - 反斜杠统一按分隔符处理（防 Windows 语义绕过）；
 * - 任何 `..` 段导致栈溢出（`/../../etc` 直接拒绝，而非折叠到根）；
 * - 盘符/UNC/ADS 形态（段内含 `:`）与 Windows 尾随点/空格（`.. `、`...` 会被
 *   Windows 文件系统归一为 `..`）一律拒绝；
 * - 解析结果为空（请求根目录）返回 null（协议只服务文件）。
 *
 * @param pathname URL pathname（形如 `/assets/index-abc.js`）
 * @returns 规范化后的相对路径（`assets/index-abc.js`）；非法/越界返回 null
 */
export function resolveRendererRequestRelativePath(pathname: string): string | null {
    if (typeof pathname !== 'string' || pathname.length === 0) {
        return null
    }
    let decoded: string
    try {
        decoded = decodeURIComponent(pathname)
    } catch {
        return null
    }
    if (hasControlChars(decoded)) {
        return null
    }
    // 反斜杠按分隔符处理，防止 `..\` 在 Windows 上的等价绕过
    const segments = decoded.replace(/\\/g, '/').split('/')
    const stack: string[] = []
    for (const segment of segments) {
        if (segment.length === 0 || segment === '.') {
            continue
        }
        if (segment === '..') {
            if (stack.length === 0) {
                return null
            }
            stack.pop()
            continue
        }
        // 盘符/UNC/ADS（含冒号）、Windows 尾随点或空格（文件系统会做归一，可借此绕过）
        if (/[:]/.test(segment) || /[. ]$/.test(segment)) {
            return null
        }
        stack.push(segment)
    }
    if (stack.length === 0) {
        return null
    }
    return stack.join('/')
}

/** 静态资源扩展名 → Content-Type（协议 handler 响应头；未知类型按二进制流） */
const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.cjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
}

/**
 * 按文件扩展名取 Content-Type（协议响应头）。
 * @param filePath 文件路径（大小写不敏感，取最后一段扩展名）
 */
export function contentTypeForFilePath(filePath: string): string {
    const normalized = String(filePath || '').replace(/\\/g, '/')
    const slash = normalized.lastIndexOf('/')
    const fileName = slash >= 0 ? normalized.slice(slash + 1) : normalized
    const dot = fileName.lastIndexOf('.')
    if (dot <= 0) {
        return 'application/octet-stream'
    }
    return (
        CONTENT_TYPE_BY_EXTENSION[fileName.slice(dot).toLowerCase()] ?? 'application/octet-stream'
    )
}
