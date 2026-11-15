/**
 * XML 格式化 / 压缩核心库（自研轻量词法解析器，移植自 jyshare 710 页面的
 * xml-formatter core.js，3.4KB 词法扫描：token 化 -> 栈建树 -> 缩进布局）
 *
 * 支持：注释、CDATA、处理指令、DOCTYPE、自闭合标签、属性（含引号内 >）、
 *      实体原样保留、文本节点原样保留。
 * 布局规则（与原版一致）：
 *   - 文本敏感子树（含 CDATA、非空白文本，或 xml:space="preserve"）整体按原始
 *     字节原样保留，不做任何重排；
 *   - 其余子树按缩进 step 重排（compact 模式即压缩，去除标签间空白）；
 *   - 校验用浏览器内置 DOMParser('application/xml')，发现 parsererror 时报错
 *     （词法树自身也会校验闭合与标签匹配、层次上限）。
 */

/** 词法 token 类型：text 文本 / cdata CDATA 段 / raw 注释·PI·DOCTYPE / open·close 标签 */
type TokenType = 'text' | 'cdata' | 'raw' | 'open' | 'close'

interface XmlToken {
    raw: string
    type: TokenType
    start: number
    end: number
}

/** 建树节点（open 标签节点拥有 children 与 close；其余节点仅携带原文区间） */
interface XmlNode {
    type: 'document' | TokenType
    raw: string
    start: number
    end: number
    name?: string
    close: string
    preserve: boolean
    children: XmlNode[]
}

/** token 上限（与原版一致） */
const MAX_TOKENS = 150_000
/** 层次上限（栈深 >256 报错，即最多 255 层嵌套） */
const MAX_DEPTH = 256

/** 词法扫描：把 XML 切成 text/cdata/raw/open/close 五类 token */
function tokens(xml: string): XmlToken[] {
    const out: XmlToken[] = []
    let i = 0
    while (i < xml.length) {
        const start = i
        let type: TokenType = 'raw'
        if (xml[i] !== '<') {
            // 纯文本：直到下一个 '<'
            const end = xml.indexOf('<', i)
            i = end < 0 ? xml.length : end
            type = 'text'
        } else if (xml.startsWith('<!--', i)) {
            // 注释
            const end = xml.indexOf('-->', i + 4)
            if (end < 0) throw new Error('注释缺少结束标记 -->')
            i = end + 3
        } else if (xml.startsWith('<![CDATA[', i)) {
            // CDATA：内容原样保留
            const end = xml.indexOf(']]>', i + 9)
            if (end < 0) throw new Error('CDATA 缺少结束标记 ]]>')
            i = end + 3
            type = 'cdata'
        } else if (xml.startsWith('<?', i)) {
            // 处理指令（含 XML 声明）
            const end = xml.indexOf('?>', i + 2)
            if (end < 0) throw new Error('处理指令缺少结束标记 ?>')
            i = end + 2
        } else {
            // 标签 / DOCTYPE：处理引号内 '>' 与 DOCTYPE 内部子集的方括号
            let quote = ''
            let brackets = 0
            let found = false
            const doctype = xml.startsWith('<!DOCTYPE', i)
            i++
            for (; i < xml.length; i++) {
                const c = xml[i]
                if (quote) {
                    if (c === quote) quote = ''
                    continue
                }
                if (c === '"' || c === "'") {
                    quote = c
                    continue
                }
                if (doctype && xml.startsWith('<!--', i)) {
                    // DOCTYPE 内部子集中的注释
                    const end = xml.indexOf('-->', i + 4)
                    if (end < 0) throw new Error('DOCTYPE 注释未结束')
                    i = end + 2
                    continue
                }
                if (doctype && c === '[') brackets++
                else if (doctype && c === ']') brackets--
                else if (c === '>' && brackets === 0) {
                    i++
                    found = true
                    break
                }
            }
            if (!found) throw new Error('标签或 DOCTYPE 未结束')
            if (!doctype) {
                type = xml[start + 1] === '/' ? 'close' : xml[start + 1] === '!' ? 'raw' : 'open'
            }
        }
        out.push({ raw: xml.slice(start, i), type, start, end: i })
        if (out.length > MAX_TOKENS) {
            throw new Error('XML 节点过多，请拆分文件后处理。')
        }
    }
    return out
}

/** 栈建树：校验开闭标签匹配，记录各 open 节点的闭合区间与 preserve 状态 */
function tree(xml: string, tokenList: XmlToken[]): XmlNode {
    const doc: XmlNode = {
        type: 'document',
        raw: '',
        start: 0,
        end: xml.length,
        close: '',
        preserve: false,
        children: []
    }
    const stack: XmlNode[] = [doc]
    for (const t of tokenList) {
        const parent = stack[stack.length - 1]
        if (t.type === 'open') {
            const name = (/^<([^\s/>]+)/.exec(t.raw) || [])[1] || ''
            const node: XmlNode = {
                ...t,
                name,
                close: '',
                preserve: parent.preserve || /\bxml:space\s*=\s*(["'])preserve\1/.test(t.raw),
                children: []
            }
            parent.children.push(node)
            if (!/\/\s*>$/.test(t.raw)) {
                // 非自闭合：入栈等待闭合标签
                stack.push(node)
                if (stack.length > MAX_DEPTH) {
                    throw new Error('XML 层次超过 255 层，请简化后处理。')
                }
            }
        } else if (t.type === 'close') {
            const node = stack.pop()
            const closeName = t.raw.replace(/^<\/\s*|\s*>$/g, '')
            if (!node || node.type === 'document' || closeName !== node.name) {
                throw new Error('XML 开始与结束标签不匹配。')
            }
            node.close = t.raw
            node.end = t.end
        } else {
            // 文本/CDATA/注释/PI/DOCTYPE：补齐节点字段统一入树
            parent.children.push({ ...t, close: '', preserve: false, children: [] })
        }
    }
    if (stack.length !== 1) {
        throw new Error('XML 标签没有完整闭合。')
    }
    return doc
}

/** 缩进布局：compact=true 即压缩；返回重排后的文本 */
function layout(xml: string, doc: XmlNode, step: string, compact: boolean): string {
    function render(n: XmlNode, depth: number): string {
        if (n.type !== 'open') return n.raw
        // 文本敏感：含 CDATA 或非空白文本（或纯空白但无换行，保护行内空格）
        const textSensitive = n.children.some(
            (c) =>
                c.type === 'cdata' ||
                (c.type === 'text' && (c.raw.trim() !== '' || !/[\r\n]/.test(c.raw)))
        )
        if (n.preserve || textSensitive) {
            // 整棵子树按原始字节原样保留
            return xml.slice(n.start, n.end)
        }
        const children = n.children.filter((c) => c.type !== 'text' || c.raw.trim())
        if (!children.length) return n.raw + n.close
        if (compact) return n.raw + children.map((c) => render(c, depth + 1)).join('') + n.close
        return (
            n.raw +
            '\n' +
            children.map((c) => step.repeat(depth + 1) + render(c, depth + 1)).join('\n') +
            '\n' +
            step.repeat(depth) +
            n.close
        )
    }

    const children = doc.children.filter((c) => c.type !== 'text' || c.raw.trim())
    return children.map((n) => render(n, 0)).join(compact ? '' : '\n')
}

/** DOMParser 校验（'application/xml'，发现 parsererror 即报错；环境无 DOMParser 时跳过） */
function validateWithDOMParser(xml: string): void {
    if (typeof DOMParser === 'undefined') return
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const parserErrors = doc.getElementsByTagName('parsererror')
    if (parserErrors.length > 0) {
        const brief = (parserErrors[0].textContent || 'XML 语法错误')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200)
        throw new Error(`XML 校验失败：${brief}`)
    }
}

/** 解析 + 校验，返回语法树 */
function parseAndValidate(input: string): XmlNode {
    const tokenList = tokens(input)
    const doc = tree(input, tokenList)
    validateWithDOMParser(input)
    return doc
}

/**
 * XML 格式化：按 indentSize 空格缩进重排；文本敏感子树与 CDATA 原样保留；
 * 非法 XML 抛错（词法不闭合/标签不匹配/DOMParser 校验失败）。
 */
export function formatXml(input: string, indentSize = 2): string {
    const step = ' '.repeat(Math.max(1, Math.min(8, indentSize)))
    return layout(input, parseAndValidate(input), step, false)
}

/** XML 压缩：去除标签间空白；文本敏感子树与 CDATA 原样保留；非法 XML 抛错。 */
export function minifyXml(input: string): string {
    return layout(input, parseAndValidate(input), ' ', true)
}
