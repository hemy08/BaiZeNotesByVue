/**
 * CONFIG 配置读写契约（ARC-13 / 第 2 批契约重构：配置名与载荷形状的唯一类型真源）
 *
 * ## 背景（为什么需要本文件）
 * 渲染层长期以 `window.api.config.read<T>(name)` 的「调用方自述泛型」消费配置，
 * 该泛型只是开发者的主观断言，与主进程实际返回无任何约束——例如：
 * - `read<EditorConfig>('editor')` 断言的是渲染层历史 9 字段形状，而主进程
 *   `getRendererEditorConfig()` 实际只返回 7 个经反算的对话框字段；
 * - `read<QuickLinksConfig>('quick-links')` 断言 `{ links: [...] }`，而主进程
 *   `getRendererQuickLinks()` 实际直接返回数组（无 `links` 包裹）。
 * 本文件按**主进程实际行为**定义 `ConfigName` / 读取形状 / 写入形状，
 * preload 类型声明（`src/preload/index.d.ts`）据此提供按配置名推断的重载。
 *
 * ## 数据来源（逐一核实）
 * - 配置名白名单：`src/main/config/config-schema.ts` 的 `ALLOWED_CONFIG_NAMES`
 *   （8 个：system / theme / editor / quick-links / quickLinks / backup /
 *   recent-folders / show-welcome）；
 * - 读写路由：`src/main/config/config-manager.ts` 的 `STORE_BACKED_CONFIGS`
 *   （system/theme/editor/quick-links/quickLinks 路由到主进程 store）与
 *   `readConfig` / `writeConfig` 的 backup、裸 JSON 分支；
 * - 读取形状：`getSystemSetting()`（system）、`getThemeConfig()`（theme）、
 *   `getRendererEditorConfig()`（editor）、`getRendererQuickLinks()`（quick-links /
 *   quickLinks）、`getBackupState()`（backup）、裸 JSON（recent-folders / show-welcome）。
 *
 * ## 约定
 * - 本文件只放纯类型（不 import 任何主进程模块/运行时依赖）；
 * - 写入形状按「主进程 schema 实际接受的字段」定义，允许只传部分字段（浅合并语义）；
 * - 读取形状按「主进程实际返回」定义，**不为了迁就历史渲染层断言而放宽**；
 * - 名称对齐是防回归点：`tests/unit/ipc-payload-contract.test.ts` 会静态解析本文件的
 *   配置名/读写映射键，与 config-schema.ts 白名单做双向核对。
 */
import type { SystemSetting } from './system'

/**
 * 允许经 config:read / config:write 访问的配置名白名单。
 *
 * 与 `src/main/config/config-schema.ts` 的 `ALLOWED_CONFIG_NAMES` 逐项一致
 * （tests/unit/ipc-payload-contract.test.ts 静态断言两集合相等）。
 * 说明：`quickLinks`（驼峰）是历史渲染层写入路径的遗留配置名，主进程仍保留兼容，
 * 与 `quick-links` 读写的实际 store 数据同源（均路由到 rendererQuickLinks 键）。
 */
export type ConfigName =
    | 'system'
    | 'theme'
    | 'editor'
    | 'quick-links'
    | 'quickLinks'
    | 'backup'
    | 'recent-folders'
    | 'show-welcome'

/**
 * 主进程 'theme' 配置的读取形状（`src/main/config/theme-config.ts` 的 ThemeConfig）。
 *
 * 与主进程 ThemeConfig 结构等价，但把 `currentTheme` / `editorTheme` 放宽为 string：
 * 主进程内部用 ThemeType / MonacoThemeType 字面量联合描述合法取值，本文件只描述
 * 「经 IPC 传回的 JSON 形状」，合法值校验仍由主进程 `validateThemeConfig` 负责。
 */
export interface AppThemeConfig {
    /** 当前应用主题标识（主进程保证为已知主题，写入时非法值会被拒绝） */
    currentTheme: string
    /** 编辑器是否使用独立于应用的主题 */
    separateEditorTheme: boolean
    /** 独立的 Monaco 编辑器主题标识（可选，缺省回退 'vs'） */
    editorTheme?: string
}

/**
 * 主进程 'editor' 配置的读取形状（`getRendererEditorConfig()` 实际返回的 7 个字段）。
 *
 * 重要：这不是渲染层历史 `EditorConfig`（9 字段，含 fontFamily/tabSize/wordWrap/
 * autoSave/autoSaveInterval/minimap），也不是主进程完整 `EditorSetting`。
 * 它是主进程把 Monaco 唯一真源 `editorSetting` 反算成「编辑器设置对话框可回填字段」
 * 后的结果——行高为倍数、光标样式已归一化、autoSave 等不在此配置内。
 */
export interface RendererEditorConfig {
    /** 字体大小（px，主进程兜底 15） */
    fontSize: number
    /** 行高倍数（主进程按 lineHeight/fontSize 反算，兜底 1.6） */
    lineHeight: number
    /** 是否显示行号（由 lineNumbers !== 'off' 反算） */
    showLineNumbers: boolean
    /** 是否启用代码折叠（由 folding !== false 反算） */
    enableFolding: boolean
    /** 是否启用自动补全（由 quickSuggestions 反算） */
    enableAutoComplete: boolean
    /** 光标样式（line/block/underline/blink，主进程已做 Monaco 粗粒度归一化） */
    cursorStyle: string
    /** 光标宽度（兜底 2） */
    cursorWidth: number
}

/**
 * 主进程 'editor' 配置的写入形状（渲染层编辑器设置对话框的 16 个可提交字段）。
 *
 * 与主进程 `validateEditorConfig` 的字段级 schema 一致：布尔字段 + 数值字段
 * （超范围钳制）+ cursorStyle 枚举。其中只有一部分字段会被
 * `mapRendererSettingsToEditorSetting` 映射进 Monaco 唯一真源，其余字段
 * （实时预览/预览延迟/代码高亮/链接高亮/最大文件大小/渲染延迟/实验特性）
 * 目前仍按 schema 落盘但不影响 Monaco（UI 上标注「暂未实现」）。
 */
export interface RendererEditorSettings {
    autoSave: boolean
    autoSaveInterval: number
    enableFolding: boolean
    showLineNumbers: boolean
    enableAutoComplete: boolean
    cursorStyle: string
    cursorWidth: number
    fontSize: number
    lineHeight: number
    enableLivePreview: boolean
    previewDelay: number
    enableCodeHighlight: boolean
    enableLinkHighlight: boolean
    maxFileSize: number
    renderDelay: number
    enableExperimental: boolean
}

/**
 * 渲染层形状的快捷链接项（主进程 config-schema 归一化后的存储形状）。
 *
 * 主进程 `normalizeRendererQuickLink` 只强制 name/url 必填，icon/description
 * 允许缺省（因此本接口把后两者标为可选）；`RendererQuickLink`（主进程模块内
 * 同名接口）把四者都标为必填，属于写入侧假设，两者结构上可互相赋值。
 */
export interface RendererQuickLinkItem {
    /** 展示名称（主进程必填） */
    name: string
    /** 目标 URL（主进程必填） */
    url: string
    /** 图标文本（emoji / 短文本 / 图片地址，可选） */
    icon?: string
    /** 描述文案（可选） */
    description?: string
}

/**
 * quick-links / quickLinks 配置的写入载荷：
 * 主进程 `validateQuickLinksConfig` 接受「裸数组」或 `{ links: [...] }` 包裹两种形态，
 * 且保存时保持调用方传入的包裹形态。
 */
export type QuickLinksWriteData = RendererQuickLinkItem[] | { links: RendererQuickLinkItem[] }

/** 配置备份目录元信息（主进程 `ConfigBackupInfo` 的结构镜像） */
export interface ConfigBackupInfo {
    /** 备份目录名（恢复时作为 name 参数） */
    name: string
    /** 备份目录绝对路径（仅供主进程排查，渲染层不依赖） */
    path: string
    /** 备份创建时间（ISO 字符串） */
    createdAt: string
    /** 备份文件数 */
    fileCount: number
}

/** 'backup' 配置的读取形状（主进程 `getBackupState()` 的返回结构） */
export interface ConfigBackupState {
    /** 备份列表（最近的在前） */
    backups: ConfigBackupInfo[]
    /** 最新一次备份目录名（无备份时为 null） */
    latest: string | null
}

/** 'backup' 配置的写入载荷（主进程 `ConfigBackupCommand` 的结构镜像） */
export interface ConfigBackupCommand {
    /** 备份（create）或从备份恢复（restore） */
    action: 'create' | 'restore'
    /** 恢复时指定备份目录名（缺省取最新一次备份） */
    name?: string
    /** 备份时指定保留数量（主进程钳制到 1~20） */
    keep?: number
}

/**
 * 'system' 配置的读取形状。
 *
 * 主进程读取时返回 `{ ...getSystemSetting(), autoStart: app.getLoginItemSettings().openAtLogin }`
 * ——`autoStart` 以操作系统实际状态覆盖 store 值（用户可能在系统启动项中手动改过），
 * 因此这里用交叉类型标注「autoStart 一定存在且为布尔值」。
 */
export type SystemConfigRead = SystemSetting & { autoStart: boolean }

/**
 * 配置名 → 读取形状（主进程 config:read 实际返回）。
 *
 * 读取失败/配置不存在时统一返回 null（preload 类型为 `Promise<ConfigReadMap[K] | null>`）；
 * `quick-links` 在「主进程从未保存过渲染层形状」时也返回 null，与缺失语义一致。
 */
export interface ConfigReadMap {
    system: SystemConfigRead
    theme: AppThemeConfig
    editor: RendererEditorConfig
    'quick-links': RendererQuickLinkItem[]
    quickLinks: RendererQuickLinkItem[]
    backup: ConfigBackupState
    'recent-folders': string[]
    'show-welcome': boolean
}

/**
 * 配置名 → 写入形状（主进程 config:write 实际接受的载荷）。
 *
 * 写入失败返回 false（不抛异常）；`system`/`theme`/`editor` 走字段级 schema
 * （未知字段丢弃、超范围钳制），`quick-links` 走条目归一化（非法条目丢弃）。
 */
export interface ConfigWriteMap {
    system: Partial<SystemSetting>
    theme: Partial<AppThemeConfig>
    editor: Partial<RendererEditorSettings>
    'quick-links': QuickLinksWriteData
    quickLinks: QuickLinksWriteData
    backup: ConfigBackupCommand
    'recent-folders': string[]
    'show-welcome': boolean
}

/**
 * 配置读写契约总览（按配置名分组的 { read, write } 形状）。
 *
 * 该形式便于后续把「读取/写入」合并为一个参数化入口；当前 preload 暴露的是
 * `read` / `write` 两个方法，分别用上面的 ConfigReadMap / ConfigWriteMap 约束。
 */
export type ConfigDataMap = {
    [K in ConfigName]: {
        /** 主进程读取返回形状 */
        read: ConfigReadMap[K]
        /** 主进程写入可接受载荷 */
        write: ConfigWriteMap[K]
    }
}

/** 按配置名取读取形状的便捷别名（等价于 `ConfigReadMap[K]`） */
export type ConfigReadValue<K extends ConfigName> = ConfigReadMap[K]

/** 按配置名取写入形状的便捷别名（等价于 `ConfigWriteMap[K]`） */
export type ConfigWriteValue<K extends ConfigName> = ConfigWriteMap[K]
