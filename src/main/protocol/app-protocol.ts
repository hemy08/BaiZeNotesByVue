/**
 * app:// 自定义协议主进程实现（renderer file:// → app:// 迁移）
 *
 * 为什么需要（背景与证据见 out/tool-results/fix-app-protocol.md）：
 * 关闭 Electron fuse `grantFileProtocolExtraPrivileges` 后，`file://` 页面与资源加载能力
 * 失效（实测 file:// 入口 ERR_FILE_NOT_FOUND / ERR_FAILED，asar 内外一致），而 asar 内
 * renderer 入口此前正是以 file:// 加载。因此 renderer 迁移到标准安全自定义协议 app://：
 *
 * | URL | 映射根 | 用途 |
 * | --- | --- | --- |
 * | `app://baize/index.html` 等 | renderer 构建产物目录（asar 内 out/build/renderer） | 主窗口页面与全部前端资源 |
 * | `app://plantuml/index.html` | extraResources/plantuml（开发环境 resources/plantuml） | PlantUML 隐藏渲染窗口 |
 * | `app://local/<绝对路径>` | 用户本地文件（经 Path Guard 白名单） | Markdown 预览本地图片、HTML 查看器相对资源 |
 *
 * 安全边界：
 * 1. renderer / plantuml 宿主严格限定在各自根目录内：URL pathname 经
 *    `resolveRendererRequestRelativePath` 归一化（拒绝 `..` 逃逸、盘符/UNC/ADS、尾随点空格、
 *    NUL/控制字符），再 path.resolve 后二次 isPathWithin 校验；
 * 2. local 宿主直接读取用户文件，必须通过既有 Path Guard（`isPathAllowed`：受信根/用户
 *    选择路径/临时目录 + realpath 符号链接逃逸校验），越权一律 403；
 * 3. 只响应 GET/HEAD；响应固定带 Content-Type（无 CORS 头 → 渲染层无法 fetch 本地文件内容，
 *    仅可作为 img/style 等子资源加载，保持 file 协议此前的只读资源语义）。
 */
import { protocol } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import {
    APP_LOCAL_FILE_HOST,
    APP_PLANTUML_HOST,
    APP_PROTOCOL_PRIVILEGES,
    APP_PROTOCOL_SCHEME,
    APP_RENDERER_HOST,
    appLocalUrlToLocalPath,
    contentTypeForFilePath,
    resolveRendererRequestRelativePath
} from '../../shared/protocol/app-protocol'
import { isPathWithin } from '../../shared/utils/path'
import { logger } from '../utils/logger'

/** 协议映射根目录（`rendererRoot`、`plantumlRoot` 均为绝对路径） */
export interface AppProtocolRoots {
    /** renderer 构建产物根（out/build/renderer；打包后位于 app.asar 内） */
    rendererRoot: string
    /** PlantUML 离线渲染资源根（resources/plantuml；缺失时传 null） */
    plantumlRoot?: string | null
}

/** 协议 handler 依赖（单测可注入桩，避免真实 electron/文件系统依赖） */
export interface AppProtocolHandlerDeps {
    /** 读取文件内容（默认 fs.promises.readFile） */
    readFile?: (filePath: string) => Promise<Buffer>
    /** 文件存在/可读判定（默认 fs.promises.access） */
    isReadableFile?: (filePath: string) => Promise<boolean>
    /** 本地文件访问白名单判定（生产环境注入 security.isPathAllowed；单测注入桩） */
    isLocalPathAllowed: (candidatePath: string) => boolean
    /** 平台判断（Windows 下大小写不敏感；默认读取 process.platform） */
    platform?: NodeJS.Platform
}

/** 协议请求解析结果（便于单测断言拒绝原因） */
export type AppProtocolResolution =
    { ok: true; filePath: string } | { ok: false; status: number; reason: string }

/** 构造 403/404 等错误响应（不泄漏文件系统细节） */
function buildErrorResponse(status: number, message: string): Response {
    return new Response(message, {
        status,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
}

/**
 * 把 host + pathname 解析为待返回的绝对文件路径（纯函数，不读文件系统）。
 *
 * @returns ok=false 时携带 HTTP 状态码：400（非法 URL）/403（越权/穿越）/404（未知宿主）
 */
export function resolveAppProtocolRequest(
    requestUrl: string,
    roots: AppProtocolRoots,
    isLocalPathAllowed: (candidatePath: string) => boolean,
    platform: NodeJS.Platform = process.platform
): AppProtocolResolution {
    let url: URL
    try {
        url = new URL(requestUrl)
    } catch {
        return { ok: false, status: 400, reason: '非法 URL' }
    }
    if (url.protocol !== `${APP_PROTOCOL_SCHEME}:`) {
        return { ok: false, status: 400, reason: '非 app:// 协议请求' }
    }
    const host = url.hostname.toLowerCase()
    if (host === APP_RENDERER_HOST) {
        return resolveRootedRequest(url.pathname, roots.rendererRoot, platform, 'renderer')
    }
    if (host === APP_PLANTUML_HOST) {
        if (typeof roots.plantumlRoot !== 'string' || roots.plantumlRoot.length === 0) {
            return { ok: false, status: 404, reason: 'PlantUML 资源根未配置' }
        }
        return resolveRootedRequest(url.pathname, roots.plantumlRoot, platform, 'plantuml')
    }
    if (host === APP_LOCAL_FILE_HOST) {
        const localPath = appLocalUrlToLocalPath(url.href)
        if (localPath === null || localPath.trim().length === 0) {
            return { ok: false, status: 400, reason: '本地路径解码失败' }
        }
        let normalized: string
        try {
            normalized = path.normalize(localPath)
        } catch {
            return { ok: false, status: 400, reason: '本地路径归一化失败' }
        }
        if (!path.isAbsolute(normalized)) {
            return { ok: false, status: 403, reason: '非绝对路径' }
        }
        if (!isLocalPathAllowed(normalized)) {
            return { ok: false, status: 403, reason: '路径不在受信白名单内' }
        }
        return { ok: true, filePath: normalized }
    }
    return { ok: false, status: 404, reason: `未知宿主：${host}` }
}

/**
 * 解析「根目录内相对路径」宿主请求（renderer / plantuml 共用）：
 * pathname → 归一化相对路径 → path.resolve 到根内 → 二次词法越界校验。
 */
function resolveRootedRequest(
    pathname: string,
    root: string,
    platform: NodeJS.Platform,
    label: string
): AppProtocolResolution {
    if (typeof root !== 'string' || root.trim().length === 0) {
        return { ok: false, status: 404, reason: `${label} 根目录未配置` }
    }
    const relativePath = resolveRendererRequestRelativePath(pathname)
    if (relativePath === null) {
        return { ok: false, status: 403, reason: '非法或越界的资源路径' }
    }
    const rootAbsolute = path.resolve(root)
    const filePath = path.resolve(rootAbsolute, relativePath)
    if (
        !isPathWithin(filePath, rootAbsolute, {
            win32CaseInsensitive: platform === 'win32'
        })
    ) {
        return { ok: false, status: 403, reason: '资源路径越界' }
    }
    return { ok: true, filePath }
}

/**
 * 创建 app:// 协议请求处理函数（protocol.handle 的 handler）。
 *
 * 返回 200 时按扩展名带 Content-Type；文件不存在/不可读统一 404（不区分，避免路径预言机）。
 */
export function createAppProtocolRequestHandler(
    roots: AppProtocolRoots,
    deps: AppProtocolHandlerDeps
): (request: Request) => Promise<Response> {
    const readFile = deps.readFile ?? ((filePath: string) => fs.promises.readFile(filePath))
    const isReadableFile =
        deps.isReadableFile ??
        (async (filePath: string): Promise<boolean> => {
            try {
                await fs.promises.access(filePath, fs.constants.R_OK)
                const stat = await fs.promises.stat(filePath)
                return stat.isFile()
            } catch {
                return false
            }
        })

    return async (request: Request): Promise<Response> => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return buildErrorResponse(405, 'Method Not Allowed')
        }
        const resolved = resolveAppProtocolRequest(
            request.url,
            roots,
            deps.isLocalPathAllowed,
            deps.platform ?? process.platform
        )
        if (!resolved.ok) {
            logger.warn(`[app-protocol] 已拒绝协议请求（${resolved.status}）：${request.url}`)
            return buildErrorResponse(resolved.status, resolved.reason)
        }
        // 可读性判定：异常按不可读处理（统一 404，不暴露文件系统细节）
        let readable: boolean
        try {
            readable = await isReadableFile(resolved.filePath)
        } catch {
            readable = false
        }
        if (!readable) {
            return buildErrorResponse(404, 'Not Found')
        }
        try {
            const data = await readFile(resolved.filePath)
            // Buffer → Uint8Array（BodyInit 的 BufferSource 口径；HEAD 不返回响应体）
            const body = request.method === 'HEAD' ? null : new Uint8Array(data)
            return new Response(body, {
                status: 200,
                headers: {
                    'content-type': contentTypeForFilePath(resolved.filePath),
                    'content-length': String(data.byteLength)
                }
            })
        } catch (error) {
            logger.warn(`[app-protocol] 读取资源失败：${resolved.filePath}`, error)
            return buildErrorResponse(404, 'Not Found')
        }
    }
}

/** scheme 是否已注册（registerSchemesAsPrivileged 必须早于 app ready，且只允许一次） */
let schemesRegistered = false
/** handler 是否已注册（幂等） */
let handlersRegistered = false

/**
 * 注册 app:// 标准安全协议特权。**必须在 app ready 之前调用**（main/index.ts 模块顶层）。
 * 环境异常（单测桩 / protocol 缺失）时仅告警，不阻断启动。
 */
export function registerAppProtocolSchemes(): void {
    if (schemesRegistered) {
        return
    }
    // 单测桩/异常环境下 electron.protocol 可能缺失：安全跳过（不阻断应用启动）
    if (typeof protocol?.registerSchemesAsPrivileged !== 'function') {
        logger.warn('[app-protocol] electron.protocol 不可用，跳过 app:// 协议特权注册')
        return
    }
    try {
        protocol.registerSchemesAsPrivileged([
            { scheme: APP_PROTOCOL_SCHEME, privileges: { ...APP_PROTOCOL_PRIVILEGES } }
        ])
        schemesRegistered = true
        logger.info('[app-protocol] 已注册 app:// 标准安全协议特权')
    } catch (error) {
        logger.warn('[app-protocol] 注册 app:// 协议特权失败（renderer 可能无法加载）:', error)
    }
}

/**
 * 注册 app:// 协议 handler（app.whenReady 后、创建窗口前调用；幂等）。
 *
 * @param roots 协议映射根目录（renderer 构建产物根 / PlantUML 资源根）
 * @param isLocalPathAllowed 本地文件白名单判定（生产传入 security.isPathAllowed）
 * @returns 是否完成注册
 */
export function registerAppProtocolHandlers(
    roots: AppProtocolRoots,
    isLocalPathAllowed: (candidatePath: string) => boolean
): boolean {
    if (handlersRegistered) {
        return false
    }
    if (typeof protocol?.handle !== 'function') {
        logger.warn('[app-protocol] electron.protocol 不可用，跳过 app:// 协议 handler 注册')
        return false
    }
    try {
        const handler = createAppProtocolRequestHandler(roots, { isLocalPathAllowed })
        protocol.handle(APP_PROTOCOL_SCHEME, handler)
        handlersRegistered = true
        logger.info('[app-protocol] 已注册 app:// 协议 handler')
        return true
    } catch (error) {
        logger.warn('[app-protocol] 注册 app:// 协议 handler 失败（renderer 可能无法加载）:', error)
        return false
    }
}

/** 重置注册标记（仅单元测试隔离使用；真实进程内协议注册无法注销） */
export function resetAppProtocolRegistrationForTesting(): void {
    schemesRegistered = false
    handlersRegistered = false
}
