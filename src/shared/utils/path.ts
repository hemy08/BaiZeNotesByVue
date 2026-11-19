/**
 * 跨进程共享的路径纯函数工具（第 1 批公共接口归位：src/shared/utils/path.ts）。
 *
 * 设计约束：
 * - 不依赖 electron / vue，也不依赖 Node 的 `node:path`——全部为纯字符串逻辑，
 *   保证主进程与渲染进程「同输入同输出」；平台差异由调用方通过显式参数传入
 *   （`win32CaseInsensitive`），本模块不读 `process.platform`。
 * - 内部统一使用 `/` 作为路径分隔符（Windows 反斜杠先归一化为 `/`）。
 * - 语义按「与现有实现逐一对齐」原则抽取，来源与已知差异见各函数 JSDoc。
 */

/** 路径比较选项 */
export interface PathCompareOptions {
    /**
     * 是否按 win32 语义大小写不敏感比较（Windows 盘符/目录名大小写不敏感）。
     * 默认 `false`（POSIX 语义大小写敏感），Windows 调用方显式传 `true`。
     */
    win32CaseInsensitive?: boolean
}

/**
 * 反斜杠统一转正斜杠。
 *
 * 对齐：`src/renderer/src/components/Markdown/preview-local-render.ts:199-206`（toFileUrl）、
 * `src/renderer/src/components/HemyTools/html-view-utils.ts:20-37`（withBaseHref）、
 * `src/renderer/src/components/Markdown/preview-md-blocks.ts:662-664`（normalizeSlashes）。
 *
 * @param p 任意路径字符串
 * @returns 分隔符全部为 `/` 的路径字符串（不改变其它字符）
 */
export function normalizeSlashes(p: string): string {
    return p.replace(/\\/g, '/')
}

/**
 * 转为 POSIX 风格路径（与 {@link normalizeSlashes} 同一实现，语义等价）。
 *
 * 该别名用于调用方表达「跨平台比较前统一为 POSIX 分隔符」的意图；两者输出完全一致。
 *
 * @param p 任意路径字符串
 * @returns 分隔符全部为 `/` 的路径字符串
 */
export function toPosixPath(p: string): string {
    return normalizeSlashes(p)
}

/**
 * 本地绝对路径 → 合法的 `file://` URL。
 *
 * 对齐 `src/renderer/src/components/Markdown/preview-local-render.ts:199-206`：
 * 1. 反斜杠归一化为 `/`；
 * 2. 保证有前导 `/`（POSIX 绝对路径本身已带，Windows `E:/...` 需补一个）；
 * 3. 追加 `file://` 前缀（POSIX 得到 `file:///notes/...`，Windows 得到
 *    `file:///E:/...`）；
 * 4. `encodeURI` 编码中文/空格等，`encodeURI` 仍保留的 `#`/`?` 再单独转义为
 *    `%23`/`%3F`（否则文件名中的 `#` 会被解析为片段标识）。
 *
 * 已知形态（与原实现逐字对齐，不额外做 RFC 化）：
 * - UNC 路径 `\\server\share\a.md` → `file:////server/share/a.md`（共 4 个斜杠，
 *   因归一化后以 `//` 开头，原实现的「补前导斜杠」分支不会再加斜杠）。
 *
 * @param path 本地绝对路径（Windows 反斜杠 / POSIX 斜杠均可）
 * @returns `file://` URL
 */
export function toFileUrl(path: string): string {
    const normalized = normalizeSlashes(path)
    const withLeadingSlash = normalized.startsWith('/') ? normalized : '/' + normalized
    return (
        'file://' +
        encodeURI(withLeadingSlash).replace(/[?#]/g, (ch) => (ch === '#' ? '%23' : '%3F'))
    )
}

/**
 * 由本地文件路径计算 HTML `<base>` 的 href 基准 URL（指向文件所在目录）。
 *
 * 对齐 `src/renderer/src/components/HemyTools/html-view-utils.ts:20-37`（withBaseHref）：
 * 1. 反斜杠归一化；
 * 2. 取最后一个 `/` 之前（含该 `/`）的部分作为目录——因此结果天然以 `/` 结尾；
 *    路径中没有任何分隔符时沿用原实现，直接使用整个入参；
 * 3. `encodeURI` 编码中文/空格等，`#`/`?` 转 `%23`/`%3F`（与 toFileUrl 口径一致）；
 * 4. POSIX 绝对目录（`/notes/`）输出 `file:///notes/`；Windows 盘符目录（`E:/notes/`）
 *    输出 `file:///E:/notes/`。
 *
 * 说明：返回的是 href 值而非完整标签，调用方自行拼 `<base href="...">` 后交给
 * `html.ts` 的 `injectIntoHead()` 注入；入参语义与 withBaseHref 一致（文件绝对路径）。
 *
 * @param filePath 被查看/引用文件的本地绝对路径
 * @returns `<base href>` 使用的 URL 字符串
 */
export function dirToBaseHref(filePath: string): string {
    const normalized = normalizeSlashes(String(filePath || ''))
    const slash = normalized.lastIndexOf('/')
    const dir = slash >= 0 ? normalized.slice(0, slash + 1) : normalized
    // encodeURI 保留 "/" 与 ":"，编码中文/空格等；但 `#` 与 `?` 在 file:// URL 中会分别被
    // 解析为 fragment/query，必须先转义（与 preview-local-render.toFileUrl 口径一致）。
    const encodedDir = encodeURI(dir).replace(/#/g, '%23').replace(/\?/g, '%3F')
    return dir.startsWith('/') ? `file://${encodedDir}` : `file:///${encodedDir}`
}

/**
 * 取路径最后一段（文件名/目录名）。
 *
 * 对齐 `src/main/utils/file-utils/path-utils.ts:67-73`（ParserFileName）：
 * 同时识别 `/` 与 `\`，取两者中最后出现的分隔符；无分隔符时返回原字符串。
 *
 * @param filePath 完整路径或裸文件名
 * @returns 最后一段名称（以分隔符结尾时返回空串）
 */
export function getBaseName(filePath: string): string {
    const lastIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    if (lastIndex === -1) {
        return filePath
    }
    return filePath.slice(lastIndex + 1)
}

/**
 * 取小写扩展名（**不含点**；无扩展名返回空串）。
 *
 * 对齐 `src/renderer/src/components/Markdown/preview-md-blocks.ts:756-761`
 * （getLowerExtension）的判定语义：
 * - 取最后一段文件名（本实现同时兼容 `\` 分隔符，原实现只按 `/` 切分）；
 * - 最后一个 `.` 的位置 `dot <= 0` 视为无扩展名（隐藏文件 `.gitignore`、纯名字均无扩展名）；
 * - 有扩展名时取 `.` 之后的字符并转小写。
 *
 * 与原实现的表示差异：原实现返回「含点」的扩展名（如 `.md`），本函数返回不含点的
 * `md`（任务要求）；判定分支与大小写处理保持一致。
 *
 * @param filePath 完整路径或裸文件名
 * @returns 小写扩展名（不含点）；无扩展名返回 `''`
 */
export function getExtension(filePath: string): string {
    const fileName = getBaseName(filePath)
    const dot = fileName.lastIndexOf('.')
    return dot <= 0 ? '' : fileName.slice(dot + 1).toLowerCase()
}

/**
 * 从完整路径中提取目录部分。
 *
 * 对齐 `src/main/utils/file-utils/path-utils.ts:80-88`（ParseDirectoryPath）与
 * `src/renderer/src/components/Markdown/preview-local-render.ts:180-186` 的同名实现，
 * **逐字保留其特殊语义**（迁移时不得"顺手修正"）：
 * 1. 整个路径中没有任何 `.` 时直接返回**原路径**（例如 `/notes/folder` 返回
 *    `/notes/folder`，而不是 `/notes`）；
 * 2. 否则取 `Math.max(lastIndexOf('\\'), lastIndexOf('/'))` 作为分隔符位置；
 * 3. 使用 `substring(0, lastIndex)`：当路径含 `.` 但**无分隔符**时 lastIndex 为 -1，
 *    而 `substring(0, -1)` 返回空串（例如 `file.md` → `''`）。
 *
 * @param fullName 完整文件或目录路径
 * @returns 目录部分（无分隔符且无点号时返回原路径）
 */
export function parseDirectoryPath(fullName: string): string {
    if (fullName.lastIndexOf('.') === -1) {
        return fullName
    }
    const lastIndex1 = fullName.lastIndexOf('\\')
    const lastIndex2 = fullName.lastIndexOf('/')
    const lastIndex = Math.max(lastIndex1, lastIndex2)
    return fullName.substring(0, lastIndex)
}

/**
 * 拆分路径的「根前缀」与其余部分（内部工具）。
 *
 * 支持的根形态：UNC 共享根 `//server/share`、Windows 盘符 `C:`、POSIX 根 `/`；
 * 均不是根形态时按相对路径处理（prefix 为空串）。
 */
function splitRootPrefix(value: string): { prefix: string; rest: string } {
    // UNC 共享根：//server/share（必须 server 与 share 都非空）
    const uncMatch = /^(\/\/[^/]+\/[^/]+)(?:\/|$)/.exec(value)
    if (uncMatch) {
        return { prefix: uncMatch[1], rest: value.slice(uncMatch[1].length) }
    }
    // 残缺 UNC（只有 //server 或 //）：保留双斜杠前缀，避免被折叠成单斜杠
    if (value.startsWith('//')) {
        return { prefix: '//', rest: value.slice(2) }
    }
    // Windows 盘符根：C:/ 或 C:
    const driveMatch = /^([A-Za-z]:)(?:\/|$)/.exec(value)
    if (driveMatch) {
        return { prefix: driveMatch[1], rest: value.slice(2) }
    }
    // POSIX 文件系统根
    if (value.startsWith('/')) {
        return { prefix: '/', rest: value.slice(1) }
    }
    return { prefix: '', rest: value }
}

/**
 * 词法折叠 `.` / `..` 后拼接根前缀与剩余段（内部工具）。
 *
 * 折叠规则与 `path.normalize` 对绝对路径的语义一致：
 * - 空段与 `.` 丢弃；`..` 弹出上一段；
 * - 绝对路径中越过根的 `..` 直接忽略（`/../a` → `/a`）；
 * - 相对路径中无处可退的 `..` 保留（`../a` → `../a`）。
 */
function joinRootAndSegments(prefix: string, rest: string): string {
    const isAbsoluteRoot = prefix.length > 0
    const segments: string[] = []
    for (const segment of rest.split('/')) {
        if (segment.length === 0 || segment === '.') {
            continue
        }
        if (segment === '..') {
            const last = segments[segments.length - 1]
            if (segments.length > 0 && last !== '..') {
                segments.pop()
            } else if (!isAbsoluteRoot) {
                segments.push('..')
            }
            continue
        }
        segments.push(segment)
    }
    const joined = segments.join('/')
    if (prefix.length === 0) {
        return joined
    }
    if (prefix.endsWith('/')) {
        return joined.length === 0 ? prefix : prefix + joined
    }
    return joined.length === 0 ? prefix : `${prefix}/${joined}`
}

/**
 * 归一化用于比较的路径：统一分隔符、词法折叠 `.`/`..`、去尾部分隔符、可选 win32 小写。
 *
 * 对齐两处现有实现（取两者能力的并集，安全语义以 security.ts 为准）：
 * - `src/renderer/src/components/Markdown/preview-md-blocks.ts:734-741`
 *   （normalizePathForCompare：反斜杠归一化 + 去尾部 `/` + 盘符/UNC 自动小写）；
 * - `src/main/utils/security.ts:218-233`（normalizeForCompare：path.normalize 折叠
 *   `.`/`..` + 去尾部分隔符 + Windows 小写）。
 *
 * 与两个原实现的差异（本函数为准，原因如下）：
 * 1. 大小写不敏感由显式参数 `win32CaseInsensitive` 决定，而不是内部读平台或自动识别
 *    盘符/UNC——shared 层要跨进程复用，平台判断必须由调用方传入；
 * 2. 保留 `.`/`..` 的词法折叠（security 原实现有、preview 原实现没有）：
 *    `isPathWithin` 必须把 `/root/../etc` 判为不在 `/root` 内，否则是路径穿越漏判；
 * 3. POSIX 根 `/` 保留为 `/`（security 原实现如此）；preview 原实现会把 `/` 归一化为
 *    空串，但两者在 isWithinDirectory 判定上等价（空串分支等价于以 `/` 开头判断）。
 *
 * @param p 待比较路径
 * @param win32CaseInsensitive 是否按 win32 语义转小写
 * @returns 统一分隔符（`/`）、无尾部斜杠（根除外）、已折叠点段的可比较字符串
 */
export function normalizePathForCompare(p: string, win32CaseInsensitive: boolean): string {
    const normalized = normalizeSlashes(p)
    const { prefix, rest } = splitRootPrefix(normalized)
    const joined = joinRootAndSegments(prefix, rest)
    return win32CaseInsensitive ? joined.toLowerCase() : joined
}

/**
 * 判断 child 是否等于 root 或位于 root 子树内（纯词法比较，不解析符号链接、不访问文件系统）。
 *
 * 对齐 `src/main/utils/security.ts:322-336`（isSameOrWithin）的核心判定：
 * `child === root || child.startsWith(root + sep)`；并在其之上做了 shared 层需要的增强：
 * - 比较前用 {@link normalizePathForCompare} 统一分隔符并折叠 `.`/`..`（原实现要求调用方
 *   先经 path.resolve/path.normalize 规范化，这里自包含）；
 * - 分隔符固定为 `/`（原实现用平台相关的 `path.sep`）；
 * - 大小写不敏感通过 `opts.win32CaseInsensitive` 显式开启（原实现读 process.platform）。
 *
 * 注意：根自身返回 true；空 root 只有空 child 才返回 true；词法比较不处理符号链接逃逸
 * （安全场景仍需在需要时叠加 realpath 校验，与原 security.ts 的分层一致）。
 *
 * @param child 待判定路径
 * @param root 根目录路径
 * @param opts 比较选项（默认 POSIX 语义：大小写敏感、分隔符归一化）
 * @returns child 等于 root 或位于其子树内返回 true
 */
export function isPathWithin(child: string, root: string, opts: PathCompareOptions = {}): boolean {
    const win32CaseInsensitive = opts.win32CaseInsensitive === true
    const normalizedChild = normalizePathForCompare(child, win32CaseInsensitive)
    const normalizedRoot = normalizePathForCompare(root, win32CaseInsensitive)
    if (normalizedChild === normalizedRoot) {
        return true
    }
    if (normalizedRoot.length === 0) {
        return false
    }
    const rootWithSeparator = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`
    return normalizedChild.startsWith(rootWithSeparator)
}
