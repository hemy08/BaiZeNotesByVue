/**
 * 系统设置类型（ARC-13：主进程 / 渲染层唯一真源）
 *
 * 收敛前该接口同时定义在 src/main/global-types.d.ts（带注释版）与
 * src/shared/types/index.ts（精简版）两处，主进程 5 个引用点与渲染层
 * BaiZeNotes.vue / SystemSettingDialog 各自取用其中一份，改一处漏一处。
 * 现以主进程版本为基准收敛到本文件：
 * - 主进程：src/main/config/system-setting.ts 的 electron-store 泛型、
 *   config-manager、dialog-shared-css 等（P2 起主进程 HTML 系统设置对话框
 *   ShowSystemSettingDialog / 编辑器设置对话框 ShowEditorSettingDialog 已删除）；
 * - 渲染层：BaiZeNotes.vue 的 system-setting-update 广播回调；渲染层
 *   SystemSettingDialog.vue / EditorSettingDialog.vue 经 config:read /
 *   config:write('system') 读写的字段即其子集。
 *
 * 字段名 / 类型 / 可选性与收敛前主进程版本完全一致（渲染层扩展字段保持可选）。
 */
/**
 * 主窗口边界（「记住窗口位置和大小」持久化字段，由主进程写入 system store）。
 * 坐标与尺寸均为屏幕坐标整数（与 electron-screen 的 Display.workArea 同坐标系）。
 */
export interface WindowBounds {
    x: number
    y: number
    width: number
    height: number
}

export interface SystemSetting {
    language: string
    resourceManager: string
    editorModel: string
    pluginOpen: string
    menuBarStyle: string // 'electron' | 'windows-native'
    autoSaveEnabled: boolean // 是否启用自动保存，默认true
    autoSaveInterval: number // 自动保存间隔（秒），最小5秒，最大86400秒（24小时）
    fontFamily: string // 界面字体，如 'Microsoft YaHei', 'Segoe UI', 'PingFang SC'
    fontSize: number // 界面字体大小(px)，范围 10-24，默认 13
    renderWhitespace: string // 渲染空白字符: 'none' | 'boundary' | 'all'
    // 窗口浮动控制（模态/非模态）
    editorSettingModal: boolean // 编辑器设置对话框是否模态，默认false
    systemSettingModal: boolean // 系统设置对话框是否模态，默认false
    themeSettingModal: boolean // 主题设置对话框是否模态，默认false
    helpAboutModal: boolean // 帮助关于对话框是否模态，默认false
    helpContactUsModal: boolean // 帮助联系我们对话框是否模态，默认false
    insertImageModal: boolean // 插入图片对话框是否模态，默认false
    admonitionsModal: boolean // Admonitions对话框是否模态，默认false
    fontSelectModal: boolean // 字体选择对话框是否模态，默认false
    mathTextModal: boolean // 数学文本对话框是否模态，默认false
    mdSheetModal: boolean // Markdown速查表对话框是否模态，默认false
    importOptionModal: boolean // 导入选项对话框是否模态，默认false
    mermaidEditModal: boolean // Mermaid编辑对话框是否模态，默认false
    quickLinkSettingModal: boolean // 快速链接设置对话框是否模态，默认false
    techStackModal: boolean // 技术栈对话框是否模态，默认false
    webUrlModal: boolean // Web URL对话框是否模态，默认false

    // ========== 渲染层系统设置扩展字段（ARC-04） ==========
    // 原渲染层 SystemSettingDialog 经 config:write('system') 写入裸 JSON 的字段，
    // 主进程从不读取。配置单真源收口后统一持久化到本 store，
    // 保证对话框全部字段往返不丢、行为与历史版本兼容。
    autoOpenLastFile?: boolean // 启动时自动打开上次文件
    autoOpenLastFolder?: boolean // 启动时自动打开上次工作目录
    autoStart?: boolean // 开机自启动
    minimizeToTray?: boolean // 关闭时最小化到托盘（默认 false，opt-in；P2-10）
    rememberWindowSize?: boolean // 记住窗口位置和大小
    // 「记住窗口位置和大小」：上次关闭时的主窗口边界（主进程写入，渲染层对话框不读写）
    windowBounds?: WindowBounds | null
    defaultFilePath?: string // 默认文件保存路径
    recentFilesCount?: number // 最近文件列表数量
    enableAutoBackup?: boolean // 启用自动备份（默认 false，opt-in；P2-11）
    backupInterval?: number // 备份间隔（小时）
    backupCount?: number // 保留备份数量
    appTheme?: string // 应用主题（对话框下拉值）
    useSystemTheme?: boolean // 使用系统主题
    // AS-9（P3 隐私）：是否允许 Markdown 预览加载文档中的远程（http/https/协议相对）图片。
    // 默认 false：渲染层把远程图片替换为占位块，不发起任何网络请求（防跟踪像素/IP 泄露）；
    // 本地相对路径、绝对路径与 data:/blob: 图片不受影响。
    allowRemoteImages?: boolean
    // 可选能力开关（2026-11-21，用户选定）：全部 opt-in、默认关闭；
    // 定义/默认值/i18n 键见 shared/constants/feature-flags.ts。
    featureTabs?: boolean // A1 多标签 / 会话恢复
    featureDocumentHistory?: boolean // A3 文档历史 / diff / 回滚
    featureMarkdownLint?: boolean // A4 Markdown lint / 格式化
    featureSpellcheck?: boolean // A6 拼写检查
    featureSmartInput?: boolean // A7 Markdown 智能输入
    featureOutlinePlus?: boolean // A10 大纲增强
    // 1.5.2 E6：今日日记 / 快速收件箱（默认关闭；定义见 shared/constants/feature-flags.ts）
    featureDailyNotes?: boolean
    // 1.5.2 E1：剪贴板剪藏（默认关闭；定义见 shared/constants/feature-flags.ts）
    featureClipCapture?: boolean
    // 1.5.2 E2：PDF 标注与摘录（第 9 项，默认关闭；定义见 shared/constants/feature-flags.ts）
    featurePdfAnnotations?: boolean
    // 1.5.2 E3：图片 OCR（第 10 项，默认关闭；定义见 shared/constants/feature-flags.ts）
    featureImageOcr?: boolean
    // 写作体验开关（P0，系统设置「编写体验」页签；全部 opt-in、默认关闭）
    writingModeEnabled?: boolean
    writingTypewriterEnabled?: boolean
    writingFocusEnabled?: boolean
    writingStatsEnabled?: boolean
    writingTypographyEnabled?: boolean
    writingSessionRestoreEnabled?: boolean
    writingBubbleEnabled?: boolean
    writingSlashEnabled?: boolean
    writingStyleCheckEnabled?: boolean
    // 系统设置结构版本（迁移用）：1.3.6 起写入。缺失表示 1.3.1~1.3.5 的旧数据
    // （当时 minimizeToTray / enableAutoBackup 默认 true，保存设置时会被写入 true）。
    settingsSchemaVersion?: number
}
