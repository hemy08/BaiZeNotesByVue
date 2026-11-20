/**
 * app:// 自定义协议共享纯函数单测（2026-11-20 renderer file:// → app:// 迁移）
 *
 * 覆盖范围：
 * 1. URL 编码/解码互逆（Windows 盘符 / POSIX / 中文空格 / `#` `?` / 目录 base href）；
 * 2. renderer 入口 URL 判定与构建（主窗口加载与导航白名单口径）；
 * 3. 运行时开关（app:// 模式 vs Vite dev server file:// 模式）的本地资源 URL 选择；
 * 4. **目录穿越防护**（协议 handler 安全边界：`..`、编码绕过、盘符/UNC/ADS、NUL 控制字符、
 *    Windows 尾随点空格等一律拒绝）；
 * 5. Content-Type 映射（协议响应头，含大小写与未知扩展名回退）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
    APP_LOCAL_FILE_HOST,
    APP_PLANTUML_HOST,
    APP_PROTOCOL_SCHEME,
    APP_RENDERER_HOST,
    APP_RENDERER_INDEX_PATHNAME,
    appLocalUrlToLocalPath,
    buildAppRendererUrl,
    buildPlantumlPageUrl,
    contentTypeForFilePath,
    dirToRendererBaseHref,
    fileUrlToAppLocalUrl,
    isAppLocalFileUrl,
    isAppProtocolActive,
    isAppProtocolUrl,
    isAppRendererIndexUrl,
    isAppRendererUrl,
    localDirToAppLocalBaseHref,
    localPathFromAppLocalPathname,
    localPathToAppLocalUrl,
    resetAppProtocolStateForTesting,
    resolveRendererRequestRelativePath,
    setAppProtocolActive,
    toRendererLocalResourceUrl
} from '../../src/shared/protocol/app-protocol'

afterEach(() => {
    resetAppProtocolStateForTesting()
})

describe('协议常量', () => {
    it('scheme 与宿主常量与主进程 handler 约定一致', () => {
        expect(APP_PROTOCOL_SCHEME).toBe('app')
        expect(APP_RENDERER_HOST).toBe('baize')
        expect(APP_LOCAL_FILE_HOST).toBe('local')
        expect(APP_PLANTUML_HOST).toBe('plantuml')
        expect(APP_RENDERER_INDEX_PATHNAME).toBe('/index.html')
    })

    it('buildAppRendererUrl/buildPlantumlPageUrl 生成入口 URL', () => {
        expect(buildAppRendererUrl()).toBe('app://baize/index.html')
        expect(buildAppRendererUrl('baizePerf=1')).toBe('app://baize/index.html?baizePerf=1')
        expect(buildAppRendererUrl('?baizePerf=1')).toBe('app://baize/index.html?baizePerf=1')
        expect(buildPlantumlPageUrl()).toBe('app://plantuml/index.html')
    })

    it('isAppProtocolUrl / isAppRendererUrl / isAppLocalFileUrl 按协议与宿主区分', () => {
        expect(isAppProtocolUrl('app://baize/index.html')).toBe(true)
        expect(isAppProtocolUrl('file:///E:/a.png')).toBe(false)
        expect(isAppProtocolUrl('')).toBe(false)
        expect(isAppRendererUrl('app://baize/index.html')).toBe(true)
        expect(isAppRendererUrl('app://local/E:/a.png')).toBe(false)
        expect(isAppLocalFileUrl('app://local/E:/a.png')).toBe(true)
        expect(isAppLocalFileUrl('app://baize/index.html')).toBe(false)
    })

    it('isAppRendererIndexUrl 只精确匹配 renderer 入口（忽略 query，拒绝其它路径/宿主）', () => {
        expect(isAppRendererIndexUrl('app://baize/index.html')).toBe(true)
        expect(isAppRendererIndexUrl('app://baize/index.html?baizePerf=1')).toBe(true)
        expect(isAppRendererIndexUrl('app://baize/assets/index-abc.js')).toBe(false)
        expect(isAppRendererIndexUrl('app://local/index.html')).toBe(false)
        expect(isAppRendererIndexUrl('app://evil/index.html')).toBe(false)
        expect(isAppRendererIndexUrl('file:///E:/out/build/renderer/index.html')).toBe(false)
        expect(isAppRendererIndexUrl('not-a-url')).toBe(false)
    })
})

describe('本地路径 ↔ app://local URL（编码/解码互逆）', () => {
    it('Windows 盘符路径：反斜杠归一化 + 前导斜杠 + 中文/空格/#/? 编码', () => {
        expect(localPathToAppLocalUrl('E:\\notes\\a.png')).toBe('app://local/E:/notes/a.png')
        expect(localPathToAppLocalUrl('E:\\笔记 目录\\图 1.png')).toBe(
            'app://local/E:/%E7%AC%94%E8%AE%B0%20%E7%9B%AE%E5%BD%95/%E5%9B%BE%201.png'
        )
        expect(localPathToAppLocalUrl('E:\\a#b?c\\x.png')).toBe('app://local/E:/a%23b%3Fc/x.png')
        expect(localPathToAppLocalUrl('C:/notes/a.md')).toBe('app://local/C:/notes/a.md')
    })

    it('POSIX 绝对路径：保留前导斜杠', () => {
        expect(localPathToAppLocalUrl('/home/user/a.png')).toBe('app://local/home/user/a.png')
        expect(localPathToAppLocalUrl('/home/user/笔记.md')).toBe(
            'app://local/home/user/%E7%AC%94%E8%AE%B0.md'
        )
    })

    it('空/非字符串入参返回空串（调用方按无效 URL 处理）', () => {
        expect(localPathToAppLocalUrl('')).toBe('')
        expect(localPathToAppLocalUrl('   ')).toBe('')
    })

    it('app://local URL → 本地路径（Windows 盘符去前导斜杠，POSIX 保留）', () => {
        expect(appLocalUrlToLocalPath('app://local/E:/notes/a.png')).toBe('E:/notes/a.png')
        expect(appLocalUrlToLocalPath('app://local/home/user/a.png')).toBe('/home/user/a.png')
        expect(appLocalUrlToLocalPath('app://local/E:/%E7%AC%94%E8%AE%B0%20x.png')).toBe(
            'E:/笔记 x.png'
        )
        expect(appLocalUrlToLocalPath('app://baize/index.html')).toBeNull()
        expect(appLocalUrlToLocalPath('file:///E:/a.png')).toBeNull()
        expect(appLocalUrlToLocalPath('not-a-url')).toBeNull()
    })

    it('localPathFromAppLocalPathname 拒绝非法编码与控制字符', () => {
        expect(localPathFromAppLocalPathname('/E:/a.png')).toBe('E:/a.png')
        expect(localPathFromAppLocalPathname('/%E0%A4%A')).toBeNull()
        expect(localPathFromAppLocalPathname('/E:/a%00b.png')).toBeNull()
        expect(localPathFromAppLocalPathname('')).toBeNull()
    })

    it('编码/解码互逆（Windows 与 POSIX 样例）', () => {
        for (const sample of [
            'E:\\notes\\a b.png',
            'E:\\笔记\\图#1?.png',
            'C:/notes/100% done.md',
            '/home/user/笔记 目录/a.png'
        ]) {
            const url = localPathToAppLocalUrl(sample)
            const decoded = appLocalUrlToLocalPath(url)
            expect(decoded, `${sample} → ${url}`).not.toBeNull()
            // 反斜杠归一化为 `/` 后与解码结果一致
            expect(decoded!.replace(/\\/g, '/')).toBe(sample.replace(/\\/g, '/'))
        }
    })

    it('目录 base href：取所在目录并保留尾部 /，目录语义与 dirToBaseHref 一致', () => {
        expect(localDirToAppLocalBaseHref('E:\\notes\\sub\\a.md')).toBe('app://local/E:/notes/sub/')
        expect(localDirToAppLocalBaseHref('/notes/sub/a.md')).toBe('app://local/notes/sub/')
        expect(localDirToAppLocalBaseHref('E:\\a#b\\c?d\\file.md')).toBe(
            'app://local/E:/a%23b/c%3Fd/'
        )
    })

    it('file:// URL → app://local URL（用户 Markdown 硬编码绝对路径兼容）', () => {
        expect(fileUrlToAppLocalUrl('file:///E:/notes/a.png')).toBe('app://local/E:/notes/a.png')
        expect(fileUrlToAppLocalUrl('file:///home/user/a.png')).toBe('app://local/home/user/a.png')
        expect(fileUrlToAppLocalUrl('file:///E:/%E7%AC%94%E8%AE%B0/a.png')).toBe(
            'app://local/E:/%E7%AC%94%E8%AE%B0/a.png'
        )
        expect(fileUrlToAppLocalUrl('https://example.com/a.png')).toBeNull()
        expect(fileUrlToAppLocalUrl('not-a-url')).toBeNull()
    })
})

describe('运行时开关：app:// 模式 vs dev server file:// 模式', () => {
    it('默认（dev server 口径）使用 file://', () => {
        expect(isAppProtocolActive()).toBe(false)
        expect(toRendererLocalResourceUrl('E:\\notes\\a.png')).toBe('file:///E:/notes/a.png')
        expect(dirToRendererBaseHref('E:\\notes\\a.md')).toBe('file:///E:/notes/')
    })

    it('app:// 模式（打包/构建产物）使用 app://local', () => {
        setAppProtocolActive(true)
        expect(isAppProtocolActive()).toBe(true)
        expect(toRendererLocalResourceUrl('E:\\notes\\a.png')).toBe('app://local/E:/notes/a.png')
        expect(dirToRendererBaseHref('E:\\notes\\a.md')).toBe('app://local/E:/notes/')
    })

    it('setAppProtocolActive 只接受严格 true；reset 恢复默认', () => {
        setAppProtocolActive(true)
        expect(isAppProtocolActive()).toBe(true)
        setAppProtocolActive(false)
        expect(isAppProtocolActive()).toBe(false)
        setAppProtocolActive(true)
        resetAppProtocolStateForTesting()
        expect(isAppProtocolActive()).toBe(false)
    })
})

describe('renderer 根内相对路径解析（目录穿越防护）', () => {
    it('合法资源路径：归一化点段与空段', () => {
        expect(resolveRendererRequestRelativePath('/index.html')).toBe('index.html')
        expect(resolveRendererRequestRelativePath('/assets/index-abc.js')).toBe(
            'assets/index-abc.js'
        )
        expect(resolveRendererRequestRelativePath('/assets/./chunk.js')).toBe('assets/chunk.js')
        expect(resolveRendererRequestRelativePath('/assets/chunk.js/')).toBe('assets/chunk.js')
        expect(resolveRendererRequestRelativePath('/assets/中文.js')).toBe('assets/中文.js')
        expect(resolveRendererRequestRelativePath('/assets/%E4%B8%AD%E6%96%87.js')).toBe(
            'assets/中文.js'
        )
    })

    it('拒绝上跳越界（明文与百分号编码形态）', () => {
        expect(resolveRendererRequestRelativePath('/../secret.txt')).toBeNull()
        expect(resolveRendererRequestRelativePath('/assets/../../secret.txt')).toBeNull()
        expect(resolveRendererRequestRelativePath('/%2e%2e/secret.txt')).toBeNull()
        expect(resolveRendererRequestRelativePath('/assets/%2e%2e/%2e%2e/package.json')).toBeNull()
        expect(resolveRendererRequestRelativePath('/..%2Fsecret.txt')).toBeNull()
        // 反斜杠按分隔符处理后同样越界
        expect(resolveRendererRequestRelativePath('..\\secret.txt')).toBeNull()
        expect(resolveRendererRequestRelativePath('/assets/..\\..\\package.json')).toBeNull()
    })

    it('拒绝盘符/UNC/ADS 等非 renderer 相对路径形态', () => {
        expect(resolveRendererRequestRelativePath('/C:/Windows/win.ini')).toBeNull()
        expect(resolveRendererRequestRelativePath('/a:b')).toBeNull()
        expect(resolveRendererRequestRelativePath('/assets/file.png::stream')).toBeNull()
    })

    it('拒绝 Windows 尾随点/空格（文件系统会归一为 ..，可绕过上跳检查）', () => {
        expect(resolveRendererRequestRelativePath('/assets/..%20')).toBeNull()
        expect(resolveRendererRequestRelativePath('/assets/...')).toBeNull()
        // 纯 `.` 段按 URL 语义折叠（不构成越界）
        expect(resolveRendererRequestRelativePath('/assets/.')).toBe('assets')
    })

    it('拒绝 NUL/控制字符/非法编码/空路径', () => {
        expect(resolveRendererRequestRelativePath('/%00')).toBeNull()
        expect(resolveRendererRequestRelativePath('/a\u0001b')).toBeNull()
        expect(resolveRendererRequestRelativePath('/%zz')).toBeNull()
        expect(resolveRendererRequestRelativePath('/')).toBeNull()
        expect(resolveRendererRequestRelativePath('')).toBeNull()
    })

    it('request 根目录（空段）不服务', () => {
        expect(resolveRendererRequestRelativePath('//')).toBeNull()
    })
})

describe('contentTypeForFilePath', () => {
    it('常见前端资源类型', () => {
        expect(contentTypeForFilePath('index.html')).toContain('text/html')
        expect(contentTypeForFilePath('E:/x/assets/app.js')).toContain('text/javascript')
        expect(contentTypeForFilePath('E:/x/assets/app.mjs')).toContain('text/javascript')
        expect(contentTypeForFilePath('E:/x/app.css')).toContain('text/css')
        expect(contentTypeForFilePath('E:/x/app.json')).toContain('application/json')
        expect(contentTypeForFilePath('E:/x/logo.SVG')).toBe('image/svg+xml')
        expect(contentTypeForFilePath('E:/x/pic.png')).toBe('image/png')
        expect(contentTypeForFilePath('E:/x/font.woff2')).toBe('font/woff2')
        expect(contentTypeForFilePath('E:/x/mod.wasm')).toBe('application/wasm')
        expect(contentTypeForFilePath('E:/x/doc.pdf')).toBe('application/pdf')
    })

    it('未知/无扩展名回退二进制流', () => {
        expect(contentTypeForFilePath('E:/x/data.bin')).toBe('application/octet-stream')
        expect(contentTypeForFilePath('E:/x/LICENSE')).toBe('application/octet-stream')
        expect(contentTypeForFilePath('.gitignore')).toBe('application/octet-stream')
        expect(contentTypeForFilePath('')).toBe('application/octet-stream')
    })
})
