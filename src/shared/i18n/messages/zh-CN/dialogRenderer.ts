/**
 * dialogRenderer 命名空间（中）
 * 渲染层对话框（src/renderer/src/components/dialogs/**）的用户可见文案。
 *
 * 约定：
 * - 通用按钮复用 common.*（确定/取消/保存/关闭/应用/重置/浏览/删除/添加等）；
 * - 数据常量（下拉选项/主题分组/技术栈描述等）存 labelKey/descKey，渲染处 t() 翻译；
 * - 品牌名（白泽/白泽笔记）与格式名/技术名（Markdown/Mermaid/Electron 等）不翻译。
 */
const dialogRenderer = {
    common: {
        title: '对话框',
        insert: '插入',
        edit: '编辑',
        select: '选择',
        format: '格式化',
        clear: '清空',
        preview: '预览',
        titleLabel: '标题',
        content: '内容',
        name: '名称',
        previewPlaceholder: '预览区域',
        insertChart: '插入图表',
        zoomIn: '放大',
        zoomOut: '缩小',
        downloadImage: '下载图片',
        retry: '重试',
        loading: '加载中...',
        versionLabel: '版本: {version}',
        docs: '文档',
        followUs: '关注我们'
    },
    // P2 功能错误处理修复：编码菜单（以指定编码重新打开 / 转换编码）失败提示。
    // 失败后由消息对话框的「重试」按钮再次执行同一编码操作，不再静默失败。
    encoding: {
        reopenFailedTitle: '按编码重新打开失败',
        reopenFailedMessage: '无法按「{encoding}」编码重新打开当前文件：{error}',
        convertFailedTitle: '编码转换失败',
        convertFailedMessage: '无法把当前文件转换为「{encoding}」编码并保存：{error}'
    },
    rename: {
        currentPath: '当前路径',
        newName: '新名称',
        newNamePlaceholder: '请输入新名称'
    },
    webUrl: {
        defaultTitle: '插入链接',
        linkText: '链接文本',
        linkTextPlaceholder: '请输入链接显示文本',
        linkUrl: '链接地址',
        linkUrlPlaceholder: '请输入URL地址，如：https://example.com'
    },
    createFileFolder: {
        defaultTitle: '新建文件/文件夹',
        dirLabel: '目录',
        nameLabel: '名称',
        namePlaceholder: '请输入名称',
        createFile: '新建文件',
        createFolder: '新建文件夹'
    },
    admonition: {
        title: '插入 Admonition',
        titlePlaceholder: '可选的标题',
        contentPlaceholder: 'Admonition 内容',
        contentFallback: 'Admonition 内容',
        defaultContent: '这里是内容...'
    },
    importOption: {
        title: '导入选项',
        header: '选择导入方式',
        subtitle: '请选择如何处理导入的内容',
        replaceTitle: '替换当前内容',
        replaceDesc: '清空当前编辑区，使用导入的内容替换',
        newFileTitle: '新建文件',
        newFileDesc: '创建新文件并导入内容（需要选择保存位置）',
        insertTitle: '插入到当前位置',
        insertDesc: '在当前光标位置插入导入的内容'
    },
    insertImage: {
        title: '插入图片',
        filePath: '文件路径',
        chooseFile: '选择文件',
        imageUrl: '图片 URL',
        imageUrlPlaceholder: '输入图片 URL',
        altText: 'Alt 文本',
        altPlaceholder: '图片描述',
        titlePlaceholder: '可选的图片标题',
        localFile: '本地文件',
        networkImage: '网络图片'
    },
    mathText: {
        title: '数学公式',
        formulaEdit: '公式编辑',
        formulaPlaceholder: '输入 LaTeX 公式...',
        insertInline: '插入行内公式',
        insertBlock: '插入公式块',
        insertMath: '插入Math',
        insertKatex: '插入Katex',
        insertLatex: '插入Latex',
        cancelEdit: '取消编辑',
        syntaxError: '公式语法错误'
    },
    mdSheet: {
        title: '插入表格',
        rows: '行数',
        cols: '列数',
        alignDefault: '默认对齐',
        alignLeft: '左对齐',
        alignCenter: '居中对齐',
        alignRight: '右对齐',
        columnLabel: '列{index}'
    },
    editorSetting: {
        title: '编辑器设置',
        sidebarBasic: '基础设置',
        sidebarAppearance: '外观设置',
        sidebarAdvanced: '高级设置',
        markdown: 'Markdown',
        panelBasicTitle: '基础设置',
        panelBasicDesc: '编辑器的基本配置选项',
        panelAppearanceTitle: '外观设置',
        panelAppearanceDesc: '编辑器的视觉配置',
        panelMarkdownTitle: 'Markdown 设置',
        panelMarkdownDesc: 'Markdown 特定配置',
        panelAdvancedTitle: '高级设置',
        panelAdvancedDesc: '高级编辑器配置',
        groupAutoSave: '自动保存',
        labelEnableAutoSave: '启用自动保存',
        labelAutoSaveInterval: '自动保存间隔（秒）',
        groupEditing: '编辑体验',
        labelEnableFolding: '启用代码折叠',
        labelShowLineNumbers: '显示行号',
        labelEnableAutoComplete: '启用自动补全',
        groupCursor: '光标与选择',
        labelCursorStyle: '光标样式',
        cursorLine: '线条',
        cursorBlock: '方块',
        cursorUnderline: '下划线',
        cursorBlink: '闪烁',
        labelCursorWidth: '光标宽度',
        groupFont: '字体设置',
        labelFontSize: '字体大小',
        labelLineHeight: '行高',
        groupLivePreview: '实时预览',
        labelEnableLivePreview: '启用实时预览',
        labelPreviewDelay: '预览延迟（毫秒）',
        groupSyntaxHighlight: '语法高亮',
        labelEnableCodeHighlight: '启用代码块高亮',
        labelEnableLinkHighlight: '启用链接高亮',
        groupPerformance: '性能',
        labelMaxFileSize: '最大文件大小（MB）',
        labelRenderDelay: '渲染延迟（毫秒）',
        groupExperimental: '实验性功能',
        labelEnableExperimental: '启用实验性功能',
        // P1-FE-05：无 Monaco 对应项的遗留字段统一禁用并标注，避免「假开关」误导
        hintNotImplemented: '该选项暂未接入实际功能，保存后不会产生效果，后续版本支持',
        hintAppliedImmediately: '保存后立即应用到当前编辑器',
        // P2 功能错误处理修复：保存失败时消息对话框提示，且设置对话框保持打开供用户重试
        saveFailedTitle: '编辑器设置保存失败',
        saveFailedMessage: '编辑器设置写入磁盘失败：{error}。修改尚未保存，请重试。'
    },
    fontSelect: {
        title: '特殊文字编辑',
        labelFontFamily: '选择字体：',
        labelFontSize: '字体大小：',
        labelAlign: '对齐方式：',
        alignLeft: '左对齐',
        alignCenter: '居中对齐',
        alignRight: '右对齐',
        alignJustify: '两端对齐',
        bold: '加粗',
        italic: '斜体',
        underline: '下划线',
        strikethrough: '删除线',
        fontColor: '字体颜色：',
        backgroundColor: '背景色：',
        editArea: '编辑区域：',
        editPlaceholder: '请输入要编辑的文字...',
        preview: '效果预览：',
        previewText: '这是一段预览文字。'
    },
    mermaidEdit: {
        title: 'Mermaid 图表编辑',
        definition: '图表定义',
        // FE-15：预览区只做「源码」展示（不渲染 SVG，避免把用户输入交给 HTML/SVG 渲染面），
        // 文案明确标注为源码预览，避免用户误以为此处应出现图形。
        sourcePreview: '源码预览',
        sourcePreviewHint: '此处仅预览 Mermaid 源码文本；插入后由编辑器渲染图形。',
        codePlaceholder: '输入 Mermaid 图表代码...',
        chartGraph: '流程图',
        chartSequence: '时序图',
        chartClass: '类图',
        chartState: '状态图',
        chartEr: 'ER图',
        chartPie: '饼图',
        chartGantt: '甘特图'
    },
    systemSetting: {
        title: '系统设置',
        sidebarGeneral: '通用设置',
        sidebarFile: '文件设置',
        sidebarAppearance: '外观设置',
        sidebarBackup: '备份与恢复',
        sidebarFeatures: '功能',
        sidebarWriting: '编写体验',
        panelWritingTitle: '编写体验',
        panelWritingDesc:
            '用于提升写作过程体验的辅助能力，默认全部关闭；开启后可在状态栏/菜单中使用。',
        groupWritingFeatures: '写作辅助',
        hintWritingFeatures:
            '以下能力默认关闭，按你的写作习惯逐项开启；涉及外观的能力仅在写作模式内生效。',
        writing: {
            modeLabel: '写作模式',
            modeDesc: '进入沉浸写作布局：隐藏侧栏与菜单、正文限宽，并显示写作控制条。',
            typewriterLabel: '打字机模式',
            typewriterDesc: '光标保持在屏幕垂直中部附近，适合长文连续输入。',
            focusLabel: '段落聚焦',
            focusDesc: '高亮当前正在编辑的段落，降低周围内容的视觉干扰。',
            statsLabel: '写作统计',
            statsDesc: '在状态栏显示中文字符、英文词、总字符与预计阅读时间。',
            typographyLabel: '写作排版',
            typographyDesc: '写作模式下使用独立的正文宽度、字号与行高。',
            sessionRestoreLabel: '光标与滚动恢复',
            sessionRestoreDesc: '按文件记住光标、滚动和选区位置，重新打开时回到上次位置。',
            bubbleLabel: '选中文本气泡工具栏',
            bubbleDesc: '选中文字时显示格式工具栏（加粗、斜体、链接、标题、列表等）。',
            slashLabel: 'Slash 命令',
            slashDesc: '在编辑器输入 / 打开插入命令菜单（标题、表格、公式、图片等）。',
            styleCheckLabel: '写作风格检查',
            styleCheckDesc: '检查长句、重复词、口头禅等写作问题，只提示不自动修改。',
            smartInputLabel: '写作智能输入',
            smartInputDesc:
                '写作模式下启用列表/引用/标题续行增强，不改变全局 Markdown 智能输入开关。'
        },
        panelFeaturesTitle: '功能开关',
        panelFeaturesDesc:
            '默认能力始终开启；可选能力按需开启，关闭时不注册界面与编辑行为，不增加启动负担。',
        groupDefaultFeatures: '默认能力',
        hintDefaultFeatures: '以下能力随编辑器提供，无需配置：',
        groupOptionalFeatures: '可选能力',
        hintOptionalFeatures:
            '默认关闭。开启后立即生效；涉及文件/历史的能力会写入本机应用数据目录。',
        features: {
            workspaceSearchLabel: '全工作区搜索 / 替换',
            pasteEnhanceLabel: '粘贴 / 复制增强',
            commandPaletteLabel: '命令面板 / Quick Open',
            tabsLabel: '多标签 / 会话恢复',
            tabsDesc:
                '在编辑器顶部打开多个文件标签，切换文件不丢失编辑状态；重启后恢复上次打开的标签列表。',
            documentHistoryLabel: '文档历史 / diff / 回滚',
            documentHistoryDesc: '保存时记录文档快照，可查看历史版本、行级 diff 并恢复为当前内容。',
            markdownLintLabel: 'Markdown 检查 / 格式化',
            markdownLintDesc:
                '检查标题层级、列表/代码块空行、行尾空格等常见问题，并支持一键格式化。',
            spellcheckLabel: '拼写检查',
            spellcheckDesc: '在编辑器中启用系统拼写检查（浏览器/系统词典），关闭后不加载拼写检查。',
            smartInputLabel: 'Markdown 智能输入',
            smartInputDesc: '有序列表自动编号、引用块续行、标题后自动空行等 Markdown 编辑辅助。',
            outlinePlusLabel: '大纲增强',
            outlinePlusDesc: '大纲支持 setext 标题、层级缩进和快速过滤，便于长文档导航。'
        },
        panelGeneralTitle: '通用设置',
        panelGeneralDesc: '应用程序的基本配置',
        groupStartup: '启动选项',
        labelAutoOpenLastFile: '启动时自动打开上次文件',
        labelAutoOpenLastFolder: '启动时自动打开上次工作目录',
        labelAutoStart: '开机自启动',
        // 开机自启动：开发模式（未打包）系统 API 无效，安装后生效
        hintAutoStart: '开机自启动需安装应用后生效（开发模式下系统接口不可用）',
        groupWindow: '窗口行为',
        labelMinimizeToTray: '关闭时最小化到托盘',
        labelRememberWindowSize: '记住窗口位置和大小',
        panelFileTitle: '文件设置',
        panelFileDesc: '文件相关的配置选项',
        groupDefaultPath: '默认路径',
        labelDefaultFilePath: '默认文件保存路径',
        groupFileOperations: '文件操作',
        labelEnableAutoSave: '启用自动保存',
        labelAutoSaveInterval: '自动保存间隔（秒）',
        labelRecentFilesCount: '最近文件列表数量',
        hintRecentFilesCount: '「最近打开」列表的保留条数（5~20，默认 10），保存后立即裁剪存量列表',
        panelAppearanceTitle: '外观设置',
        panelAppearanceDesc: '应用程序的视觉配置',
        groupTheme: '主题',
        labelAppTheme: '应用主题',
        themeDark: '深色',
        themeLight: '浅色',
        labelUseSystemTheme: '使用系统主题',
        // 批次 B #7：跟随系统主题——与手动切换主题互斥（主题设置对话框选择主题会
        // 自动关闭本开关），通过 tooltip 向用户说明该语义
        hintUseSystemTheme:
            '开启后应用主题跟随系统深浅色自动切换；在「主题设置」对话框中手动选择主题会自动关闭本开关',
        groupFont: '字体',
        labelSystemFont: '系统字体',
        fontMicrosoftYaHei: '微软雅黑',
        fontPingFang: '苹方',
        labelFontSize: '字体大小',
        panelBackupTitle: '备份与恢复',
        panelBackupDesc: '数据备份和恢复选项',
        groupAutoBackup: '自动备份',
        labelEnableAutoBackup: '启用自动备份',
        labelBackupInterval: '备份间隔（小时）',
        labelBackupCount: '保留备份数量',
        groupOperations: '操作',
        backupNow: '立即备份',
        restoreFromBackup: '从备份恢复',
        // 批次 C：#8/#9 自动备份已实现（enableAutoBackup/backupInterval 已启用），
        // 本词条暂无代码引用，保留以备后续新增未实现设置项复用
        hintNotImplemented: '该设置暂无对应功能实现，保存后不会产生效果，后续版本支持',
        // 批次 C #10：应用主题收口为「只读显示 + 打开主题设置」按钮，
        // 本词条现仅作只读主题名的 tooltip 说明
        hintThemeManaged: '应用主题请使用「主题设置」对话框调整',
        // 批次 C #10：打开主题设置对话框的按钮文案
        labelOpenThemeSetting: '打开主题设置',
        // 批次 C #8/#9：自动备份组的行为说明（替换原「暂未实现」提示）；
        // P2-11：默认关闭（opt-in），仅用户显式开启后才备份
        hintAutoBackupGroup:
            '默认关闭；开启后按设定间隔把活动文件（含未保存修改）与已打开工作区的 .md 文件备份到用户数据目录，并按「保留备份数量」滚动清理旧备份',
        hintBackupInterval:
            '自动备份间隔（1~72 小时，默认 24），保存后重启定时器，首次备份在下一个间隔到点时执行',
        hintDefaultFilePath: '用于「打开文件夹」对话框的默认起始位置',
        hintBackupRetention: '「立即备份」时按此数量保留最近的备份',
        backupStatusSuccess: '备份完成：{name}（{count} 个配置文件）',
        backupStatusFailed: '备份失败：配置目录为空或不可写',
        restoreStatusSuccess: '已从备份 {name} 恢复配置并重新载入',
        restoreStatusFailed: '恢复失败：备份不存在或不可读取',
        restoreStatusNoBackup: '暂无可恢复的备份，请先执行「立即备份」',
        // AS-9（P3 隐私）：远程图片加载开关（默认关闭，预览中的远程图片替换为占位块）
        groupPrivacy: '隐私',
        labelAllowRemoteImages: '允许加载远程图片',
        hintAllowRemoteImages:
            '开启后预览会加载文档中的远程图片（可能被第三方统计像素追踪阅读行为）；默认关闭，仅加载本地图片',
        remoteImageBlocked: '远程图片已拦截（可在「系统设置 → 隐私」中开启加载）',
        // P2 功能错误处理修复：保存失败时消息对话框提示，且设置对话框保持打开供用户重试
        saveFailedTitle: '设置保存失败',
        saveFailedMessage: '设置写入磁盘失败：{error}。修改尚未保存，请重试或检查配置目录权限。',
        // P2 剩余静默失败提示：文件页签「浏览默认路径」与自动保存运行时开关同步失败
        // （原实现只写日志，用户无任何反馈；开关同步失败时回滚 UI 并提供重试）
        browseFailedTitle: '选择默认路径失败',
        browseFailedMessage: '无法选择默认保存路径：{error}。可重试。',
        autoSaveSyncFailedTitle: '自动保存开关同步失败',
        autoSaveSyncFailedMessage:
            '自动保存开关未能同步到主进程：{error}。开关已恢复为原状态，可重试或稍后在「应用」时重新保存。',
        // P2 剩余静默失败提示：外观页签「应用主题」只读显示名读取失败时的内联降级提示
        // （非阻断；显示名回退为主题标识，不误导为具体主题名）
        themeDisplayFallbackHint:
            '无法读取当前应用主题的显示名，已回退显示主题标识；可关闭设置后重新打开重试。'
    },
    themeSetting: {
        title: '主题设置',
        sidebarAppTheme: '应用主题',
        sidebarEditorTheme: '编辑器主题',
        sidebarFontSettings: '字体设置',
        customTheme: '自定义主题',
        editorThemeFallback: '编辑器主题',
        colorBackground: '背景色',
        colorAccent: '强调色',
        colorText: '文字色',
        labelEditorFont: '编辑器字体',
        labelPreviewFont: '预览字体',
        labelFontSize: '字体大小',
        categoryLight: '浅色主题',
        categoryDark: '深色主题',
        categoryEyecare: '护眼主题',
        // P2 功能错误处理修复：主题列表加载失败时页签显示错误文案 + 「重试」按钮；
        // 加载成功但列表为空时显示空态提示（同样可重试）
        loadFailed: '主题列表加载失败：{error}',
        emptyState: '暂无可显示的主题，请重试',
        // P2 剩余静默失败提示：用户切换主题时样式拉取 / 编辑器主题加载失败
        // （原实现只写日志并静默回退，用户误以为主题切换成功）
        applyFailedTitle: '应用主题失败',
        applyFailedMessage: '无法加载主题「{theme}」的样式，界面已保持原主题：{error}。可重试。',
        applyFailedReasonNotFound: '主进程未返回该主题的样式数据',
        editorThemeApplyFailedTitle: '编辑器主题加载失败',
        editorThemeApplyFailedMessage:
            '编辑器主题「{theme}」加载失败，编辑器已回退为默认主题（界面主题不受影响）。可重试。'
    },
    helpAbout: {
        windowTitle: '关于白泽笔记',
        descLine1: '一款简洁优雅的',
        descLine2: '笔记应用',
        descLine3: '请尽情书写吧！！！',
        versionInfo: '版本信息',
        appVersion: '应用版本',
        releaseDate: '发布日期',
        devFramework: '开发框架',
        systemEnvironment: '系统环境',
        os: '操作系统',
        platform: '平台'
    },
    helpContactUs: {
        title: '联系我们',
        subtitle: '我们很乐意收到您的反馈和建议',
        feedback: '问题反馈',
        feedbackDesc: '在 GitHub 上提交 Issue',
        star: 'Star 项目',
        starDesc: '在 GitHub 上给我们一个 Star',
        contribute: '贡献代码',
        contributeDesc: '提交 Pull Request',
        email: '发送邮件'
    },
    quickLink: {
        title: '快捷链接设置',
        listTitle: '快捷链接列表',
        editLink: '编辑链接',
        addLink: '添加链接',
        namePlaceholder: '链接名称',
        iconLabel: '图标（emoji）',
        descLabel: '描述',
        descPlaceholder: '可选的描述信息',
        emptyState: '暂无快捷链接',
        addFirst: '添加第一个链接',
        defaultGitHubDesc: '代码托管平台',
        defaultGoogleDesc: '搜索引擎',
        defaultStackOverflowDesc: '程序员问答社区',
        // P2 功能错误处理修复：快捷链接保存失败时消息对话框提示，且设置对话框保持打开供用户重试
        saveFailedTitle: '快捷链接保存失败',
        saveFailedMessage: '快捷链接写入磁盘失败：{error}。修改尚未保存，请重试。'
    },
    techStack: {
        title: '技术栈',
        intro: '白泽笔记使用以下技术构建',
        sectionCore: '核心框架',
        sectionEditors: '编辑器与渲染',
        sectionData: '数据与存储',
        sectionUtilities: '工具库',
        footer: '点击卡片访问官网了解更多信息',
        descElectron: '跨平台桌面应用框架',
        descVue: '渐进式 JavaScript 框架',
        descTypeScript: 'JavaScript 的超集',
        descVite: '下一代前端构建工具',
        descElectronVite: 'Electron 专用 Vite 构建工具',
        descMonaco: 'VS Code 同款代码编辑器',
        descMarkdownIt: 'Markdown 解析器',
        descMermaid: '流程图/时序图渲染',
        descKaTeX: '数学公式渲染',
        descHighlight: '代码语法高亮',
        descElectronStore: 'Electron 数据持久化',
        descElectronUpdater: '应用自动更新',
        descCryptoJs: 'JavaScript 加密库',
        descMammoth: 'Word 文档解析',
        descTurndown: 'HTML 转 Markdown'
    },
    // Material 语法插入对话框：覆盖 15 项 mkdocs-material 扩展语法。
    // features.* 为左侧功能列表名称；labels/placeholders/types 等供右侧表单与下拉复用；
    // defaults.* 为各表单的预填示例值（打开即点「插入」也能产出合法片段）。
    materialSyntax: {
        title: 'Material 语法插入',
        previewEmptyHint: '填写上方内容后，此处实时预览将要插入的 Markdown',
        iconNameRequired: '请先填写图标名（如 pencil、github）',
        features: {
            collapsible: '折叠提示块',
            taskList: '任务列表',
            highlight: '文本高亮',
            insertDelete: '插入/删除标记',
            supSub: '上标/下标',
            keys: '键盘按键',
            attrList: '属性列表',
            footnote: '脚注',
            definitionList: '定义列表',
            gridCards: '网格卡片',
            codeBlock: '代码块增强',
            icon: 'Material 图标',
            blocks: '块语法',
            snippet: '文件片段',
            tabLink: '标签页深链'
        },
        labels: {
            type: '类型',
            expanded: '默认展开',
            completed: '已完成',
            mode: '模式',
            text: '文本',
            url: 'URL',
            className: 'class',
            align: '对齐',
            keys: '按键',
            refText: '引用处文本',
            footnoteContent: '脚注内容',
            term: '术语',
            definition: '定义',
            cards: '卡片列表',
            language: '语言',
            codeTitle: '代码块标题',
            code: '代码',
            linenums: '显示行号',
            hlLines: '高亮行号',
            iconName: '图标名',
            iconText: '文本（可选）',
            tabLabel: 'Tab 标签',
            path: '文件路径',
            startLine: '起始行',
            endLine: '结束行',
            linkText: '链接文本',
            setId: 'Set 序号',
            tabIndex: 'Tab 序号'
        },
        placeholders: {
            title: '可选的标题',
            content: '内容（支持多行）',
            text: '要包裹的文本',
            taskContent: '每行一项待办事项',
            keys: '如 ctrl+alt+del',
            url: '如 https://example.com',
            className: '如 highlight',
            footnoteContent: '脚注的具体说明',
            definition: '术语的解释说明',
            cards: '每行一项：图标名|标题|描述（图标可留空）',
            language: '如 python',
            code: '代码内容',
            hlLines: '如 2 3',
            iconName: '如 pencil',
            tabLabel: '如 标签一',
            path: '如 snippets/example.md',
            linkText: '显示在链接上的文本'
        },
        types: {
            note: '提示（note）',
            tip: '技巧（tip）',
            warning: '警告（warning）',
            danger: '危险（danger）',
            info: '信息（info）',
            success: '成功（success）',
            example: '示例（example）',
            question: '疑问（question）',
            quote: '引用（quote）',
            details: '折叠详情（details）',
            tabbed: '标签页（tabbed）'
        },
        insertDeleteModes: {
            insert: '插入（^^）',
            delete: '删除（~~）',
            criticInsert: 'Critic 插入（{++ ++}）',
            criticDelete: 'Critic 删除（{-- --}）',
            criticHighlight: 'Critic 高亮（{== ==}）',
            criticComment: 'Critic 注释（{>> <<}）'
        },
        scriptModes: {
            superscript: '上标（^ ^）',
            subscript: '下标（~ ~）'
        },
        attrModes: {
            button: '按钮（{ .md-button }）',
            inline: '行内 class（{ .class }）',
            align: '段落/图片对齐（{ align=center }）'
        },
        alignOptions: {
            left: '左对齐',
            center: '居中',
            right: '右对齐'
        },
        defaults: {
            collapsibleContent: '这里是折叠内容，展开后可见。',
            taskContent: '待办事项一\n待办事项二',
            highlightText: '需要高亮的文本',
            insertDeleteText: '需要标记的文本',
            attrText: '按钮文本',
            footnoteText: '需要注释的文本',
            footnoteContent: '脚注的具体说明。',
            definitionTerm: '术语',
            definitionText: '对术语的解释说明。',
            cards: 'pencil|快速开始|几分钟内完成安装与配置。\nrocket|开箱即用|无需额外依赖，可直接用 Markdown 书写。',
            codeTitle: '示例代码',
            blocksTitle: '块标题',
            blocksContent: '块内容，内部支持 Markdown。',
            blocksTabLabel: '标签一',
            tabLinkText: '查看标签页'
        }
    }
}

export default dialogRenderer
