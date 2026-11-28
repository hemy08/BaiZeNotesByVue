/**
 * LLM AI 面板的 transport 注入接口（1.5.7 LLM Wiki L5，UI 骨架批次）。
 *
 * ## 为什么是「可注入 transport」而不是直接写死通道
 * AI 调用通道由 L3 批次提供（主进程代理 + 本地/远程 Provider，见实施计划 §5.2.1）。
 * 本批次只交付 AI 输入面板 UI 骨架，因此把「发一条消息 → 拿到回复文本」抽象为
 * `LlmAiTransport`：
 * - 默认实现返回占位文案「AI 功能尚未接入（L3 批次提供）」；
 * - L3 接入时经组件 props 或 `provide(LLM_AI_TRANSPORT_INJECTION_KEY, transport)` 注入
 *   真实实现，**无需改动面板内部逻辑**，也不需要在 UI 层写死 IPC 通道名；
 * - 单元测试注入 mock transport 即可断言发送/停止/错误路径。
 *
 * ## 契约
 * `sendMessage(payload) => Promise<string>`：payload 含用户消息、模型、历史、上下文与
 * 可选的 `AbortSignal`（供 L3 流式实现响应「停止」；本批次停止按钮只做本地取消，
 * 不依赖 transport 一定消费该 signal）。
 */
import type { InjectionKey } from 'vue'
import { t } from '../../common/i18n'

/** 一条 AI 对话消息（用户/助手） */
export interface LlmAiMessage {
    /** 消息唯一 id（渲染层生成，仅用于列表 key） */
    id: string
    /** 角色：用户 / 助手 */
    role: 'user' | 'assistant'
    /** 消息正文（纯文本；渲染时不做 HTML 解析） */
    content: string
}

/** 发送给 transport 的上下文快照（当前文档名 / 选中文本） */
export interface LlmAiContextSnapshot {
    /** 当前文档文件名（空 = 未打开文档） */
    documentName: string
    /** 当前选中文本（空 = 无选区） */
    selectionText: string
}

/** 发送载荷（transport 的入参；字段只增不改，L3 可继续扩展流式回调） */
export interface LlmAiSendPayload {
    /** 用户本次输入的消息文本（已 trim） */
    message: string
    /**
     * 选中的模型 id（`AI.GET_CONFIG` 返回的真实模型 id；1.5.7 体验升级批次 A 起多模型）。
     * 缺省表示交给主进程使用配置中的 `defaultModelId`（配置读取失败时的降级路径）。
     */
    modelId?: string
    /** 本次发送前的对话历史（含刚追加的用户消息，便于后续多轮上下文） */
    history: readonly LlmAiMessage[]
    /** 上下文引用快照 */
    context: LlmAiContextSnapshot
    /** 可选取消信号（L3 流式实现可据此中断请求） */
    signal?: AbortSignal
}

/** AI transport：发一条消息并返回回复文本（失败应 reject） */
export type LlmAiTransport = (payload: LlmAiSendPayload) => Promise<string>

/**
 * provide/inject 键：L3 或测试可经 `provide(LLM_AI_TRANSPORT_INJECTION_KEY, transport)`
 * 注入真实 AI 通道；组件 props `transport` 优先级更高（显式注入 > provide > 占位默认）。
 */
export const LLM_AI_TRANSPORT_INJECTION_KEY: InjectionKey<LlmAiTransport> =
    Symbol('baize:llm-ai-transport')

/**
 * 占位 transport：返回「AI 功能尚未接入（L3 批次提供）」。
 *
 * 说明：文案在**调用时**经 `t()` 解析（I18N-08：不把翻译结果缓存为模块级常量），
 * 保证语言切换后再次发送时使用当前语言。
 */
export const placeholderLlmAiTransport: LlmAiTransport = async () =>
    t('editorUi.llmWikiPanel.notConnected')
