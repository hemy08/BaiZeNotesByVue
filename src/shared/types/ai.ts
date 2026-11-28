/**
 * 1.5.7 LLM Wiki L3：AI Provider / AI ingest / diff 审批契约（跨进程唯一类型真源）
 *
 * 本文件只放「主进程 ↔ 渲染层」共用的纯类型（ARCH-12），不依赖任何进程层实现：
 * - 配置结构：`AiStoredConfig` / `AiConfigSnapshot` / `AiSaveConfigRequest`；
 * - 对话契约：`AiChatRequest` / `AiChatResult`（供 L5 AI 面板联调，**契约保持稳定**）；
 * - ingest 契约：`AiIngestRequest` / `AiIngestResult` / `AiDiffLine`（草案 + 行级 diff）；
 * - 审批写盘契约：`AiApplyIngestRequest` / `AiApplyIngestResult`；
 * - 运行状态查询契约：`AiQueryRunningModelsRequest` / `AiQueryRunningModelsResult`
 *   （1.5.7「查询当前运行的模型」；用户可配置 `statusCommand`，每次执行前渲染层确认）；
 * - 错误码：`AiErrorCode`（主进程结构化失败，永不向渲染层抛堆栈）。
 *
 * 取值白名单/默认值/限额的运行时真源见 `src/shared/constants/ai.ts`；本文件不引用它，
 * 避免「类型 ↔ 常量」运行期环依赖。
 */

/* ============================================================================
 * 一、配置（AI 开关 / Provider / 模型 / 密钥状态）
 * ========================================================================== */

/** Provider 形态：本地模型（隐私友好、离线）或远程 BYOK（OpenAI 兼容接口） */
export type AiProviderKind = 'local' | 'remote'

/** 本地 Provider 标识：Ollama（原生 /api/chat）或 LM Studio（OpenAI 兼容 /v1） */
export type AiLocalProviderId = 'ollama' | 'lmstudio'

/**
 * API Key 存储形态（主进程 safeStorage 探测结果）：
 * - `safe`：safeStorage 可用，密钥经系统级加密后写入独立配置文件（可跨重启）；
 * - `memory`：safeStorage 不可用，密钥**仅保存在本次会话内存**（不落盘），重启后需重新输入。
 */
export type AiKeyStorage = 'safe' | 'memory'
/**
 * 单个模型配置（多模型列表项，1.5.7 体验升级）。
 *
 * 用户可添加多个模型（本地 Ollama/LM Studio 或远程 OpenAI 兼容），在 AI 面板/设置页切换。
 * id 由渲染层生成并保持稳定；密钥不在此结构中（由主进程按模型 id 单独加密存储，
 * 快照仅暴露 apiKeyConfigured 标记）。
 */
export interface AiModelConfig {
    /** 模型唯一 id（渲染层生成，用于切换/密钥绑定） */
    id: string
    /** 显示名称（用户可编辑，如「本地 Qwen」「DeepSeek」） */
    name: string
    /** Provider 形态（local / remote） */
    provider: AiProviderKind
    /** 本地 Provider 标识（provider=local 时生效；remote 时忽略） */
    localProvider: AiLocalProviderId
    /** 接口基址（空串 = 该 Provider 默认基址；远程 BYOK 必填） */
    baseUrl: string
    /** 模型名称（本地为已拉取模型名；远程为服务商模型 id） */
    model: string
    /**
     * 运行状态查询命令（可选；1.5.7「查询当前运行的模型」）。
     *
     * 用户显式配置的本机命令（如 Ollama `ollama ps`、LM Studio `lms ps`），
     * 仅 `AI.QUERY_RUNNING_MODELS` 使用：由主进程以 shell 执行并把 stdout/stderr 合并返回。
     * 安全约束：
     * - 只允许用户经设置页保存（`AI.SAVE_CONFIG.models[].statusCommand`），长度 ≤ 500 且禁止换行/控制字符；
     * - 每次执行前渲染层必须弹出确认（载荷 `confirmExecution === true`），主进程未收到确认时拒绝执行；
     * - 未配置（undefined/空串）时走内置查询（Ollama `/api/ps` / OpenAI 兼容 `/models`），不执行任何命令。
     */
    statusCommand?: string
    /** 远程模型是否已配置 API Key（仅快照返回，不返回明文） */
    apiKeyConfigured?: boolean
}

/**
 * AI 非敏感配置（持久化到独立配置文件 `ai-config.json`，**不含密钥明文**）。
 *
 * 1.5.7 体验升级后为**多模型**结构：`models` 可添加多个本地/远程模型，
 * `defaultModelId` 为 AI 面板缺省模型；每模型密钥由主进程按模型 id 单独加密存储。
 * 默认值：`enabled=false` + `models=[]` + `defaultModelId=null` ——「默认关闭、无模型」，
 * 未启用或未配置模型时主进程不发起任何网络请求。
 */
export interface AiStoredConfig {
    /** 是否启用 AI 能力（默认 false；未启用时 AI.CHAT / AI.INGEST 返回 AI_NOT_CONFIGURED） */
    enabled: boolean
    /** 模型列表（可添加多个；默认空数组） */
    models: AiModelConfig[]
    /** 默认模型 id（AI 面板缺省使用；无可用模型时为 null） */
    defaultModelId: string | null
}

/** `AI.GET_CONFIG` 返回的配置快照（非敏感配置 + 密钥配置状态，永不返回密钥明文） */
export interface AiConfigSnapshot extends AiStoredConfig {
    /** 密钥存储形态（safeStorage 可用性探测结果） */
    apiKeyStorage: AiKeyStorage
}

/**
 * `AI.SAVE_CONFIG` 请求载荷（全部可选：只更新出现的字段，未出现字段保持原值）。
 *
 * 密钥字段：
 * - `apiKey` 非空 → 保存（safeStorage 加密落盘；不可用时仅会话内存）；
 * - `clearApiKey=true` → 清除已保存的密钥；
 * - 两者同时出现视为非法载荷（返回 AI_INVALID_PAYLOAD）。
 */
export interface AiSaveConfigRequest {
    /** 是否启用 AI 能力（缺省保持不变） */
    enabled?: boolean
    /** 完整模型列表（缺省保持不变；提供时按 id 覆盖/新增，缺失的旧模型被删除） */
    models?: AiModelConfig[]
    /** 默认模型 id（缺省保持不变；null = 清空默认） */
    defaultModelId?: string | null
    /** 单模型密钥操作（与 models 同批次提交；apiKey 非空=保存，clearApiKey=true=清除） */
    modelApiKey?: {
        modelId: string
        apiKey?: string
        clearApiKey?: boolean
    }
}

/* ============================================================================
 * 二、对话（AI.CHAT）
 * ========================================================================== */

/** 对话角色（与 OpenAI/Ollama 消息角色一致） */
export type AiChatRole = 'system' | 'user' | 'assistant'

/** 单条对话消息 */
export interface AiChatMessage {
    role: AiChatRole
    content: string
}

/**
 * 对话上下文（可选；由渲染层提供当前文档标题/选中文本，主进程只做长度上限校验）。
 * 主进程不会把上下文写日志、不落盘。
 */
export interface AiChatContext {
    /** 当前文档标题（可选） */
    title?: string
    /** 当前选中文本（可选；过长时主进程拒绝并返回 AI_INVALID_PAYLOAD） */
    selection?: string
}

/**
 * `AI.CHAT` 请求载荷。
 *
 * **契约稳定**（L5 AI 面板联调用）：`{ messages: { role, content }[], context?: { title?, selection? } }`。
 * 特殊约定：`messages` 为空数组时执行「连接测试」语义（设置页「测试连接」按钮使用），
 * 不发起对话补全、只做一次轻量连通性探测（本地 Ollama 为 GET /api/tags，
 * OpenAI 兼容接口为 GET /models），返回 `content` 为可读测试结果文本（如「连接成功」）。
 */
export interface AiChatRequest {
    messages: AiChatMessage[]
    context?: AiChatContext
    /** 指定使用的模型 id（缺省 = 配置中的 defaultModelId） */
    modelId?: string
}

/* ============================================================================
 * 三、AI ingest（AI.INGEST：生成 wiki 页面草案 + 行级 diff，不写盘）
 * ========================================================================== */

/** `AI.INGEST` 请求载荷（全部可选） */
export interface AiIngestRequest {
    /**
     * 指定原始资料路径（**工作区相对路径**，如 `raw/2026-11-28-来源.md`）。
     * 缺省时主进程扫描 `raw/` 目录并选择首个可处理文件（.md/.markdown/.txt）。
     */
    rawPath?: string
}

/** diff 单行类型：新增行 / 删除行 / 上下文行 */
export type AiDiffLineType = 'add' | 'del' | 'context'

/** diff 单行（行号从 1 开始；仅对应侧有行号） */
export interface AiDiffLine {
    type: AiDiffLineType
    /** 行内容（不含换行符） */
    content: string
    /** 旧文件中的行号（add 行缺省） */
    oldLine?: number
    /** 新文件中的行号（del 行缺省） */
    newLine?: number
}

/**
 * `AI.INGEST` 成功结构：
 * - `draftPath`：计划写入的目标（**工作区相对路径**，固定位于 `wiki/` 下）；**此时未写盘**；
 * - `content`：AI 生成的完整 Markdown 页面内容（含 front matter）；
 * - `diff`：`draftPath` 现有磁盘内容（不存在时视为空）与 `content` 的行级 diff；
 * - `sourcePath`：本次编译的原始资料路径（工作区相对路径，位于 `raw/` 下）；
 * - `isUpdate`：目标为既有 wiki 页面（有基线可对比）还是新建。
 */
export interface AiIngestSuccess {
    ok: true
    draftPath: string
    content: string
    diff: AiDiffLine[]
    sourcePath: string
    isUpdate: boolean
    /** diff 是否因行数上限被截断（截断时 UI 需提示） */
    diffTruncated: boolean
    /** 本次使用的模型名（可选，供 UI 展示） */
    model?: string
}

/** `AI.INGEST` 返回结构（成功 = 草案 + diff；失败 = 结构化 code，不抛堆栈） */
export type AiIngestResult = AiIngestSuccess | AiFailure

/* ============================================================================
 * 四、审批写盘（AI.APPLY_INGEST）
 * ========================================================================== */

/**
 * `AI.APPLY_INGEST` 请求载荷（用户在 diff 审批 UI 点击「确认应用」后提交）。
 *
 * 安全约束：`approved` 必须显式为 `true`；`draftPath` 只接受 `wiki/` 下的工作区相对路径
 * （绝对路径 / `..` / raw/ 目标 / 符号链接一律拒绝）；内容写入前经 Path Guard 与
 * `assertWorkspaceWritable`（raw 只读）复核。
 */
export interface AiApplyIngestRequest {
    /** 目标路径（工作区相对路径，必须位于 `wiki/` 下） */
    draftPath: string
    /** 审批通过的完整内容（由 diff 审批 UI 回传） */
    content: string
    /** 用户是否已显式确认（必须为 true） */
    approved: boolean
}

/** `AI.APPLY_INGEST` 成功结构 */
export interface AiApplyIngestSuccess {
    ok: true
    /** 已写入的目标（工作区相对路径） */
    draftPath: string
    /** 实际写入字节数（UTF-8） */
    bytes: number
}

/** `AI.APPLY_INGEST` 返回结构 */
export type AiApplyIngestResult = AiApplyIngestSuccess | AiFailure

/* ============================================================================
 * 五、错误码与统一失败结构
 * ========================================================================== */

/**
 * AI 结构化错误码（主进程统一归一化；渲染层按 code 决定提示文案与引导动作）。
 *
 * - AI_NOT_CONFIGURED：AI 未启用 / 配置不完整（含远程缺密钥、缺模型）——不发起请求；
 * - AI_INVALID_PAYLOAD：IPC 载荷结构非法（字段类型/长度/枚举越界）；
 * - AI_NETWORK_ERROR：网络不可达（连接被拒/DNS/证书等）；
 * - AI_AUTH_ERROR：HTTP 401/403（API Key 无效或无权限）；
 * - AI_MODEL_NOT_FOUND：模型不存在（HTTP 404 且响应提示模型缺失，或本地服务无该模型）；
 * - AI_RATE_LIMITED：HTTP 429（限流/额度不足）；
 * - AI_TIMEOUT：超时（默认 60s，AbortController 中止）；
 * - AI_CANCELED：调用方取消（AbortSignal 中止）；
 * - AI_HTTP_ERROR：其他非 2xx 状态；
 * - AI_INVALID_RESPONSE：响应不是预期 JSON / 结构不合法；
 * - AI_EMPTY_RESPONSE：响应成功但内容为空；
 * - AI_WORKSPACE_UNAVAILABLE：无工作区 / 非 LLM Wiki 模式 / raw/ 目录不存在；
 * - AI_RAW_PATH_INVALID：rawPath 非法（绝对路径、越界、扩展名不支持）；
 * - AI_RAW_FILE_NOT_FOUND：指定原始资料文件不存在；
 * - AI_NO_RAW_FILES：raw/ 下没有可处理的原始资料；
 * - AI_NOT_APPROVED：未显式审批（approved !== true）；
 * - AI_TARGET_NOT_ALLOWED：写盘目标非法（不在 wiki/ 下、符号链接、扩展名不符）；
 * - AI_APPLY_FAILED：写盘失败（IO/权限）；
 * - AI_CONFIG_STORE_FAILED：AI 配置读写失败。
 */
export type AiErrorCode =
    | 'AI_NOT_CONFIGURED'
    | 'AI_INVALID_PAYLOAD'
    | 'AI_NETWORK_ERROR'
    | 'AI_AUTH_ERROR'
    | 'AI_MODEL_NOT_FOUND'
    | 'AI_RATE_LIMITED'
    | 'AI_TIMEOUT'
    | 'AI_CANCELED'
    | 'AI_HTTP_ERROR'
    | 'AI_INVALID_RESPONSE'
    | 'AI_EMPTY_RESPONSE'
    | 'AI_WORKSPACE_UNAVAILABLE'
    | 'AI_RAW_PATH_INVALID'
    | 'AI_RAW_FILE_NOT_FOUND'
    | 'AI_NO_RAW_FILES'
    | 'AI_NOT_APPROVED'
    | 'AI_TARGET_NOT_ALLOWED'
    | 'AI_APPLY_FAILED'
    | 'AI_CONFIG_STORE_FAILED'

/** 统一失败结构（所有 AI 通道失败均返回该形态，不向渲染层抛异常/堆栈） */
export interface AiFailure {
    ok: false
    code: AiErrorCode
    /** 可读中文原因（已脱敏：不含密钥、不含笔记正文） */
    message: string
}

/* ============================================================================
 * 六、通道返回类型（供 shared/types/ipc.ts 契约表引用）
 * ========================================================================== */

/** `AI.CHAT` 返回：成功返回助手回复（或空 messages 时的连接测试文本）；失败结构化 */
export type AiChatResult =
    | {
          ok: true
          /** 助手回复内容；`messages: []`（连接测试）时为可读测试结果文本 */
          content: string
          /** 本次实际使用的模型名（可选，供 UI 展示） */
          model?: string
      }
    | AiFailure

/** `AI.GET_CONFIG` 返回（配置读取失败时主进程回退默认值，不返回失败结构） */
export type AiGetConfigResult = AiConfigSnapshot

/** `AI.SAVE_CONFIG` 返回：成功返回最新配置快照；失败结构化 */
export type AiSaveConfigResult = { ok: true; config: AiConfigSnapshot } | AiFailure

/* ============================================================================
 * 七、运行中模型查询（AI.QUERY_RUNNING_MODELS，1.5.7「查询当前运行的模型」）
 * ========================================================================== */

/**
 * 查询来源：
 * - `command`：模型配置了 `statusCommand`，本次在主进程执行该用户命令；
 * - `builtin`：未配置命令，走内置查询（Ollama `GET /api/ps` / OpenAI 兼容 `GET /models`）。
 */
export type AiRunningModelsSource = 'command' | 'builtin'

/** 查询结果中的单条模型（`detail` 为可选补充信息，如到期时间/来源） */
export interface AiRunningModelEntry {
    /** 模型名（Ollama 为 `models[].name`；OpenAI 兼容为 `data[].id`） */
    name: string
    /** 可选补充信息（到期时间、owned_by 等；仅展示，不参与逻辑） */
    detail?: string
}

/**
 * `AI.QUERY_RUNNING_MODELS` 请求载荷。
 *
 * `modelId` 缺省 = 配置中的 `defaultModelId`；显式指定不存在的模型 → 失败 `code=AI_MODEL_NOT_FOUND`。
 */
export interface AiQueryRunningModelsRequest {
    /** 指定模型 id（缺省使用 defaultModelId） */
    modelId?: string
    /**
     * 用户是否已在渲染层确认执行（缺省 false）。
     *
     * 仅当模型配置了 `statusCommand` 时主进程才要求该标记为 true（命令只允许
     * 「用户每次显式确认」后执行）；内置查询不执行任何命令，不要求该标记。
     */
    confirmExecution?: boolean
}

/** `AI.QUERY_RUNNING_MODELS` 成功结构 */
export interface AiQueryRunningModelsSuccess {
    ok: true
    /** 本次查询来源（用户命令 / 内置查询） */
    source: AiRunningModelsSource
    /** 执行的用户命令原文（仅 source=command 时返回；用于 UI 展示与审计） */
    command?: string
    /** 可读文本输出（命令 stdout+stderr 合并截断；内置查询为格式化列表；空结果为「未检测到运行中的模型」） */
    output: string
    /** 解析出的模型列表（可为空数组；命令来源无法可靠解析时缺省） */
    models?: AiRunningModelEntry[]
}

/**
 * `AI.QUERY_RUNNING_MODELS` 失败结构。
 *
 * 说明：配置级错误复用既有错误码（`AI_NOT_CONFIGURED` / `AI_MODEL_NOT_FOUND` / `AI_INVALID_PAYLOAD`）；
 * 命令执行失败/超时/内置查询网络失败只给 `error` 可读原因（不新增错误码，避免契约膨胀）。
 */
export interface AiQueryRunningModelsFailure {
    ok: false
    /** 失败时若能确定查询来源则返回（配置级错误通常无来源） */
    source?: AiRunningModelsSource
    /** 已尝试执行的用户命令原文（source=command 时返回，便于用户核对） */
    command?: string
    /** 失败前的可读输出（命令 stderr / 内置查询响应为空串） */
    output: string
    /** 可读失败原因（已清洗，不含密钥/堆栈） */
    error: string
    /** 配置级错误码（复用既有 AI 错误口径） */
    code?: AiErrorCode
}

/** `AI.QUERY_RUNNING_MODELS` 返回：成功 / 失败统一结构化（不向渲染层抛异常） */
export type AiQueryRunningModelsResult = AiQueryRunningModelsSuccess | AiQueryRunningModelsFailure
