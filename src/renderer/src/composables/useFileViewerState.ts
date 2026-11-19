/**
 * 文件查看器（HTML / PDF）通用状态机。
 *
 * 背景：`ShowHtmlView.vue` 与 `ShowPdfEditor.vue` 原先各自实现「加载三态 + 工具栏 +
 * EventBus 文件选择监听」骨架，两份代码高度重复；其中 `ShowPdfEditor` 已具备的
 * 并发/卸载守卫（loadGeneration / isUnmounted）在 HTML 查看器中缺失，导致任何一处
 * 修复都要改两遍、且容易漏改。本 composable 抽出查看器的公共部分：
 *
 * 1. 三态：isLoading / errorMessage / content（空态由 content === null 推导）；
 * 2. loadWithGuard：代次守卫（并发选择文件时只认最新一次加载）+ 卸载守卫
 *    （卸载后拒绝新建加载、拒绝异步写回），实现参照 ShowPdfEditor 的既有守卫；
 * 3. retry：按「最近一次请求的路径/文件名」重载（加载成功前 filePath 为空，
 *    不能作为重试依据，这正是 PDF 重试按钮曾失效的原因）；
 * 4. handleFileSelect：订阅 EventBus 文件选择事件，按配置的扩展名过滤（不区分
 *    大小写），并用「组件前缀 + 实例唯一后缀」的 componentId 注册与清理，避免
 *    多实例（插件菜单 / 工作区）互相清理监听。
 *
 * 查看器各自的特有逻辑（HTML：srcdoc + base 注入；PDF：pdf.js 文档解析与渲染）
 * 通过 options.loader / onReset / onContentReady 注入，本模块不感知具体文件类型。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { useEventBus } from './useEventBus'
import { t } from '../common/i18n'
import { logger } from '../common/logger'

/** EventBus 文件选择事件负载（FileTreeNode 等发送方契约） */
export interface FileSelectPayload {
    /** 文件完整路径（缺失时忽略该事件） */
    path?: string
    /** 文件名（缺失时忽略该事件） */
    name?: string
}

/**
 * 加载过程上下文：供加载函数在每个 await 之后判断本次加载是否已过期。
 * 已过期时加载函数应立即返回（不要写任何查看器状态）。
 */
export interface FileLoadContext {
    /** 本次加载代次（每次 loadWithGuard 调用递增） */
    readonly generation: number
    /** 是否已过期：组件已卸载，或已有更新的加载代次 */
    isStale: () => boolean
}

/**
 * 加载过程的业务错误：加载函数抛出该错误时，按携带的 i18n key 展示文案
 * （不计入异常日志，例如「文件不存在」这类可预期结果）。
 */
export class FileViewerLoadError extends Error {
    /** 用户可见错误文案的 i18n key */
    readonly messageKey: string
    /** 文案插值参数（如 { error }） */
    readonly messageParams?: Record<string, string | number>

    constructor(messageKey: string, messageParams?: Record<string, string | number>) {
        super(messageKey)
        this.name = 'FileViewerLoadError'
        this.messageKey = messageKey
        this.messageParams = messageParams
    }
}

/**
 * 加载函数：读取并解析目标文件。
 *
 * @param path 文件完整路径
 * @param context 加载上下文（用于代次/卸载守卫）
 * @returns 内容；返回 null 表示「内容不可读」（由 unreadableKey 文案提示）；
 *          抛错表示加载失败（普通异常走 loadFailedKey，FileViewerLoadError 走自带 key）
 */
export type FileContentLoader<TContent> = (
    path: string,
    context: FileLoadContext
) => Promise<TContent | null>

/** useFileViewerState 可配置项 */
export interface UseFileViewerStateOptions<TContent> {
    /** 查看器名称：日志/componentId 前缀（如 'ShowHtmlView'） */
    viewerName: string
    /** 允许的文件扩展名（不含点，大小写不敏感，如 'html' / 'pdf'） */
    fileExtension: string
    /** 订阅的文件选择事件名（EVENT_BUS.HTML_FILE_SELECTED / PDF_FILE_SELECTED） */
    fileSelectedEvent: string
    /** 具体的加载实现（IPC 读取 + 解析） */
    loader: FileContentLoader<TContent>
    /** 加载中提示文案的 i18n key */
    loadingTextKey: string
    /** 空态提示文案的 i18n key */
    emptyTextKey: string
    /** 内容不可读（loader 返回 null）时提示文案的 i18n key */
    unreadableKey: string
    /** 加载出现异常时提示文案的 i18n key（支持 { error } 插值） */
    loadFailedKey: string
    /** 加载异常写入日志的前缀（保持既有控制台文案，如 '加载 HTML 文件失败:'） */
    loadFailedLog: string
    /** 每次开始加载前 / 组件卸载时的自定义清理（如销毁 pdf.js 文档与渲染任务） */
    onReset?: () => void
    /** 内容已挂载到 DOM（nextTick）后的回调（如绘制 PDF 首页），供首屏依赖 DOM 的渲染使用 */
    onContentReady?: (content: TContent, context: FileLoadContext) => void | Promise<void>
}

/** useFileViewerState 返回的状态机接口 */
export interface FileViewerState<TContent> {
    /** 是否处于加载态 */
    isLoading: Ref<boolean>
    /** 错误文案（空字符串表示无错误） */
    errorMessage: Ref<string>
    /** 已加载内容（null 表示不可读/尚未加载） */
    content: ShallowRef<TContent | null>
    /** 是否已有可展示内容（壳层据此渲染内容插槽，否则渲染空态） */
    hasContent: ComputedRef<boolean>
    /** 是否为空态：不在加载、无错误、无内容 */
    isEmpty: ComputedRef<boolean>
    /** 当前展示内容的完整路径（仅加载成功后赋值） */
    filePath: Ref<string>
    /** 当前展示内容的文件名（仅加载成功后赋值） */
    fileName: Ref<string>
    /** 最近一次请求加载的路径（重试依据；加载失败时 filePath 为空，只能用该值） */
    lastLoadPath: Ref<string>
    /** 加载中提示文案（响应语言切换） */
    loadingText: ComputedRef<string>
    /** 空态提示文案（响应语言切换） */
    emptyText: ComputedRef<string>
    /** EventBus 注册用的实例唯一 id（组件前缀 + 实例后缀） */
    componentId: string
    /** 加载指定文件（带代次/卸载守卫） */
    loadWithGuard: (path: string, name: string) => Promise<void>
    /** 重试/刷新：按最近一次请求的路径与文件名重载 */
    retry: () => void
    /** 结束加载态（供 iframe 等外部加载完成兜底） */
    finishLoading: () => void
    /** 文件选择事件回调（EventBus 处理器；导出便于需要手动触发的场景） */
    handleFileSelect: (payload: FileSelectPayload) => void
    /** 组件是否已卸载（卸载守卫的只读视图，供查看器内部异步任务判废） */
    isUnmounted: () => boolean
}

/**
 * 创建文件查看器通用状态机。
 *
 * 必须在组件 setup 中调用（内部注册 onMounted / onBeforeUnmount 完成事件订阅与清理）。
 *
 * @param options 查看器配置（扩展名过滤、加载实现、文案 key、清理/渲染回调）
 * @returns 三态、路径、重试/加载方法与实例唯一 componentId
 */
export function useFileViewerState<TContent>(
    options: UseFileViewerStateOptions<TContent>
): FileViewerState<TContent> {
    /** 三态：加载中 / 错误文案 / 已加载内容 */
    const isLoading = ref(false)
    const errorMessage = ref('')
    // 内容可能是不应被 Vue 深度代理的库对象（如 pdf.js 文档），使用 shallowRef
    const content = shallowRef<TContent | null>(null)

    /** 当前展示内容对应的路径/文件名（仅加载成功后赋值） */
    const filePath = ref('')
    const fileName = ref('')

    /** 最近一次请求加载的路径/文件名：失败重试与刷新按钮的依据 */
    const lastLoadPath = ref('')
    const lastLoadName = ref('')

    /** 加载代次：并发选择文件时仅最新代次可以写状态/结束 loading */
    let loadGeneration = 0
    /** 组件是否已卸载：卸载后拒绝新建加载任务与异步写回（防止异步泄漏） */
    let isUnmounted = false

    /**
     * 组件唯一标识：插件菜单实例与 WorkSpace 实例可能同时挂载，固定 id 会让
     * EventBus.$cleanup 把另一实例的监听一并清掉；useEventBus 为每次调用生成
     * 「查看器名-实例-序号」唯一 id，卸载时只清本实例监听。
     */
    const { componentId, on: onEventBus } = useEventBus({
        componentIdPrefix: options.viewerName
    })

    const hasContent = computed(() => content.value !== null)
    const isEmpty = computed(
        () => !isLoading.value && errorMessage.value === '' && content.value === null
    )
    const loadingText = computed(() => t(options.loadingTextKey))
    const emptyText = computed(() => t(options.emptyTextKey))

    /** 判断是否处于过期代次（组件已卸载，或已有更新的加载代次） */
    function createContext(generation: number): FileLoadContext {
        return {
            generation,
            isStale: () => isUnmounted || generation !== loadGeneration
        }
    }

    /**
     * 加载文件（带并发与卸载守卫）。
     *
     * 进入时递增 loadGeneration，重置三态并记录本次请求路径；每个 await 之后
     * 由加载函数自行校验代次。load 返回 null → 不可读；返回内容 → 先退出加载态、
     * 等待 DOM 更新（内容插槽挂载完成）后执行 onContentReady（如 PDF 首屏绘制）；
     * 抛错 → 业务错误走自带文案，其余记录日志并展示加载失败文案。
     */
    async function loadWithGuard(path: string, name: string): Promise<void> {
        if (isUnmounted) {
            return
        }
        const generation = ++loadGeneration
        const context = createContext(generation)

        // 进入 try 前记录加载目标：失败后 retry 据此重载
        lastLoadPath.value = path
        lastLoadName.value = name
        isLoading.value = true
        errorMessage.value = ''
        content.value = null
        filePath.value = ''
        fileName.value = ''
        options.onReset?.()

        try {
            const loaded = await options.loader(path, context)
            if (context.isStale()) {
                return
            }
            if (loaded === null) {
                errorMessage.value = t(options.unreadableKey)
                return
            }
            content.value = loaded
            filePath.value = path
            fileName.value = name
            // 加载态下内容插槽尚未挂载；先结束加载态并等 DOM 更新，再执行依赖 DOM 的
            // 渲染（PDF 首屏 canvas 在内容插槽内，早于此处绘制会读到 null）。
            isLoading.value = false
            await nextTick()
            if (context.isStale()) {
                return
            }
            await options.onContentReady?.(loaded, context)
        } catch (error) {
            if (context.isStale()) {
                return
            }
            if (error instanceof FileViewerLoadError) {
                // 可预期的业务失败（如文件不存在）：按自带 i18n key 提示，不写错误日志
                errorMessage.value = t(error.messageKey, error.messageParams)
                return
            }
            logger.error(options.loadFailedLog, error)
            errorMessage.value = t(options.loadFailedKey, { error: String(error) })
        } finally {
            // isLoading 只由最新代次清除：旧请求不得提前结束新请求的加载态
            if (!context.isStale()) {
                isLoading.value = false
            }
        }
    }

    /**
     * 重试/刷新：使用最近一次记录的路径与文件名重载
     * （filePath 只在加载成功后赋值，失败/首次加载时为空，不能用作守卫）
     */
    function retry(): void {
        if (lastLoadPath.value) {
            void loadWithGuard(lastLoadPath.value, lastLoadName.value)
        }
    }

    /**
     * 结束加载态（HTML iframe onload 等外部加载完成时的兜底）
     *
     * 仅在「已有内容」时生效：若此时另有新的加载正在进行（content 已被重置为 null），
     * 旧 iframe 迟到的 onload 不得提前结束新加载的加载态。
     */
    function finishLoading(): void {
        if (!isUnmounted && content.value !== null) {
            isLoading.value = false
        }
    }

    /**
     * 处理文件选择事件（扩展名不区分大小写）
     * 非目标扩展名 / 负载不完整的事件直接忽略，不改变当前视图。
     */
    function handleFileSelect(payload: FileSelectPayload): void {
        const path = payload?.path
        const name = payload?.name
        if (!path || !name) {
            return
        }
        const extensionSuffix = `.${options.fileExtension.toLowerCase()}`
        if (!name.toLowerCase().endsWith(extensionSuffix)) {
            return
        }
        void loadWithGuard(path, name)
    }

    onMounted(() => {
        // 监听文件选择事件（componentId 实例唯一，卸载时只清理本实例）
        onEventBus<FileSelectPayload>(options.fileSelectedEvent, handleFileSelect)
    })

    onBeforeUnmount(() => {
        // 卸载守卫：使在途加载全部过期，并拒绝后续新建加载任务
        isUnmounted = true
        loadGeneration += 1
        // 事件监听由 useEventBus 的 onBeforeUnmount 自动清理（本 composable 内
        // useEventBus 先于此处注册清理钩子，清理先于查看器资源释放执行）
        // 查看器特有资源清理（如销毁 pdf.js 文档与渲染任务）
        options.onReset?.()
    })

    return {
        isLoading,
        errorMessage,
        content,
        hasContent,
        isEmpty,
        filePath,
        fileName,
        lastLoadPath,
        loadingText,
        emptyText,
        componentId,
        loadWithGuard,
        retry,
        finishLoading,
        handleFileSelect,
        isUnmounted: () => isUnmounted
    }
}
