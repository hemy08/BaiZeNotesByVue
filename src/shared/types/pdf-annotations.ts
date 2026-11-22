/**
 * 1.5.2 E2：PDF 标注与摘录 —— 跨进程契约类型（唯一真源，ARC-12）
 *
 * 设计约束：
 * - 本文件属于 `src/shared/types`：只声明类型，不依赖 Node / Electron / Vue / DOM；
 * - 主进程（`src/main/ipc/pdf-annotations-ipc.ts`）与渲染层
 *   （`src/renderer/src/common/pdf-annotations-actions.ts`、`ShowPdfEditor.vue`）两侧
 *   一律引用本文件，禁止各自维护同构结构；
 * - 侧车文件（`<pdfPath>.annotations.json`）内的数据以本结构序列化，归一化/清洗逻辑
 *   在 `src/shared/constants/pdf-annotations.ts` 的纯函数中完成（两端共用）。
 */

/**
 * 标注矩形：相对**页面**归一化后的矩形（左上原点，单位 0~1）。
 *
 * 渲染层由浏览器 Selection 的 client rect 相对 canvas 包围盒换算得到；
 * 显示时按百分比定位在 canvas 上方的 overlay 层，因此与缩放 / 窗口尺寸无关。
 * 四个字段均为有限数值，且满足 `0 <= x <= 1`、`0 <= y <= 1`、`0 < w <= 1`、`0 < h <= 1`
 * 与 `x + w <= 1`、`y + h <= 1`（共享纯函数 `sanitizePdfAnnotationRects` 保证）。
 */
export interface PdfAnnotationRect {
    /** 左偏移（相对页面宽度，0~1） */
    x: number
    /** 上偏移（相对页面高度，0~1） */
    y: number
    /** 宽度占比（0~1） */
    w: number
    /** 高度占比（0~1） */
    h: number
}

/**
 * 单条 PDF 标注（侧车文件中的一条记录）。
 *
 * 字段裁剪上限见 `src/shared/constants/pdf-annotations.ts`：
 * - `text` ≤ `PDF_ANNOTATION_TEXT_MAX`（2000 字符）；
 * - `note` ≤ `PDF_ANNOTATION_NOTE_MAX`（1000 字符，可选）；
 * - `rects` ≤ `PDF_ANNOTATION_RECTS_MAX`（200 个）。
 */
export interface PdfAnnotation {
    /** 标注唯一 id（同一份侧车文件内去重；由渲染层生成） */
    id: string
    /** 所在页码（1-based，正整数） */
    page: number
    /** 选中的 PDF 文本（已去除首尾空白、统一 LF 换行） */
    text: string
    /** 创建时间（ISO 8601 字符串） */
    createdAt: string
    /** 可选备注（MVP 未提供编辑入口，保留字段供后续扩展与外部工具写入） */
    note?: string
    /** 高亮矩形（相对页面归一化 0~1；可为空数组——只记录文字不绘制高亮） */
    rects: PdfAnnotationRect[]
}

/** `createPdfAnnotation` 的入参（渲染层生成新标注时使用） */
export interface CreatePdfAnnotationInput {
    /** 所在页码（1-based；非法值返回 null，不创建标注） */
    page: number
    /** 选中文本（首尾空白裁剪、CRLF 归一化、超长截断；为空返回 null） */
    text: string
    /** 高亮矩形（缺省/非法项被清洗；最多保留 200 个） */
    rects?: readonly PdfAnnotationRect[]
    /** 可选备注（裁剪到 1000 字符；空白备注不写入） */
    note?: string
    /** 可选注入 id（仅供单测/外部导入；缺省按时间戳 + 随机后缀生成） */
    id?: string
    /** 可选注入创建时间（ISO 字符串或毫秒时间戳；仅供单测；缺省取当前时间） */
    createdAt?: string | number
}

/**
 * PDF 标注 IPC 结构化失败码（渲染层按 code 映射 i18n 文案）。
 *
 * - `invalid-path`：入参不是非空字符串 / 无法解析为绝对路径；
 * - `invalid-extension`：目标文件不是 `.pdf` 扩展名；
 * - `path-denied`：PDF 或侧车文件不在受信根内（Path Guard 拒绝）；
 * - `invalid-payload`：保存请求的 annotations 不是数组；
 * - `read-failed`：侧车文件存在但读取失败（权限/IO 错误）；
 * - `write-failed`：侧车文件写入 / 原子替换失败；
 * - `too-large`：侧车文件超过读写大小上限（默认 10 MiB）。
 *
 * 注：JSON 损坏属于「读取容错」范畴，主进程按「空数组 + WARN 日志」返回 ok=true，
 * 不使用 `read-failed`（不阻塞 PDF 预览）。
 */
export type PdfAnnotationsErrorCode =
    | 'invalid-path'
    | 'invalid-extension'
    | 'path-denied'
    | 'invalid-payload'
    | 'read-failed'
    | 'write-failed'
    | 'too-large'

/**
 * `FILE.LOAD_PDF_ANNOTATIONS` 返回结构（安全失败不抛异常）。
 *
 * - 侧车缺失 / 内容损坏 / 超限：`ok=true, annotations=[]`（容错，不阻塞预览）；
 * - 路径非法 / Path Guard 拒绝 / IO 失败：`ok=false, error=<code>, annotations=[]`。
 */
export interface PdfAnnotationsLoadResult {
    /** 是否成功得到可用结果（容错读取也算成功） */
    ok: boolean
    /** 标注列表（ok=false 时为空数组） */
    annotations: PdfAnnotation[]
    /** 失败码（ok=false 时存在） */
    error?: PdfAnnotationsErrorCode
}

/** `FILE.SAVE_PDF_ANNOTATIONS` 返回结构（安全失败不抛异常） */
export interface PdfAnnotationsSaveResult {
    /** 是否已成功原子写盘 */
    ok: boolean
    /** 失败码（ok=false 时存在） */
    error?: PdfAnnotationsErrorCode
}
