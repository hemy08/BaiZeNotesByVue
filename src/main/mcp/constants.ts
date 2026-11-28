/**
 * 1.5.7 LLM Wiki L2：MCP 只读桥常量（主进程唯一真源）
 *
 * 设计约束：
 * - 本文件只放常量/纯数值，不 import 任何运行时模块（server/tools/protocol 共用）；
 * - 端口、超时、请求体上限等安全边界只在这里维护，测试与本模块共用同一口径。
 */

/** MCP HTTP 服务仅绑定的回环地址（不对外网/局域网暴露，DNS rebinding 由 Host 校验兜底） */
export const MCP_HOST = '127.0.0.1'

/** 默认端口（被占用时依次尝试后续端口；最终回退操作系统分配的空闲端口） */
export const MCP_DEFAULT_PORT = 3847

/** 端口被占用时的顺序尝试个数（3847..3856），仍失败则回退 port 0（系统分配） */
export const MCP_PORT_ATTEMPTS = 10

/** 合法端口下界（用户可配置的首选端口；0 表示自动选择，单独处理） */
export const MCP_PORT_MIN = 1

/** 合法端口上界（TCP 端口最大值） */
export const MCP_PORT_MAX = 65535

/** MCP 端点路径（设置页展示给外部 Agent 的 URL 路径） */
export const MCP_ENDPOINT_PATH = '/mcp'

/** 单次 HTTP 请求体上限（1 MiB；MCP JSON-RPC 请求远小于该上限，防超大载荷占内存） */
export const MCP_MAX_REQUEST_BODY_BYTES = 1024 * 1024

/** HTTP 请求超时（ms；防慢客户端/半开连接长期占用主进程事件循环） */
export const MCP_REQUEST_TIMEOUT_MS = 30_000

/** HTTP 头部接收超时（ms） */
export const MCP_HEADERS_TIMEOUT_MS = 10_000

/** HTTP keep-alive 空闲超时（ms） */
export const MCP_KEEP_ALIVE_TIMEOUT_MS = 5_000

/** 单个文本文件读取上限（2 MiB，与工作区索引/搜索服务的单文件上限口径一致） */
export const MCP_MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024

/** 工作区相对路径参数长度上限（防异常超长载荷） */
export const MCP_MAX_RELATIVE_PATH_LENGTH = 4096

/** 分页默认条数（search_wiki / list_pages） */
export const MCP_DEFAULT_PAGE_LIMIT = 20

/** 分页最大条数（search_wiki / list_pages 的 limit 上限） */
export const MCP_MAX_PAGE_LIMIT = 100

/** 标签列表默认条数 */
export const MCP_DEFAULT_TAG_LIMIT = 100

/** 标签列表最大条数 */
export const MCP_MAX_TAG_LIMIT = 500

/** 全文检索单次匹配总数上限（与 workspace-search 服务上限一致） */
export const MCP_MAX_SEARCH_MATCHES = 500

/** 全文检索查询长度上限（与 workspace-search 服务同口径） */
export const MCP_MAX_SEARCH_QUERY_LENGTH = 512

/** 工作区索引快照缓存 TTL（ms；与 FILE.GET_WORKSPACE_INDEX 的 5s 缓存口径一致） */
export const MCP_WORKSPACE_CACHE_TTL_MS = 5000

/**
 * 支持的 MCP 协议版本（JSON 响应模式）。
 *
 * 本期只实现「JSON-RPC 2.0 over HTTP POST + application/json 响应」，不实现 SSE 流式传输；
 * initialize 时按客户端请求版本回显（客户端可按 2025-03-26 / 2025-06-18 协商），
 * 未知/缺失版本回落 {@link MCP_DEFAULT_PROTOCOL_VERSION}。
 */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26'] as const

/** 默认 MCP 协议版本（客户端未指定/不受支持时回显） */
export const MCP_DEFAULT_PROTOCOL_VERSION = '2025-03-26'

/** initialize 的 serverInfo.name（客户端展示用；版本由主进程 app.getVersion() 注入） */
export const MCP_SERVER_NAME = 'baize-notes-mcp'
