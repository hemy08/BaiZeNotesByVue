/**
 * mainMsg 命名空间（中）
 * 主进程用户可见消息：状态栏提示、错误/信息/确认框标题与正文、文件操作提示、
 * 自动更新提示、权限确认与 PlantUML 本地渲染错误等。
 * 词典值必须与提取前的中文原文逐字一致（保证中文界面零变化）。
 */
export default {
    app: {
        windowTitle: '白泽笔记 -- Markdown Editor Powered By Electron and Vue'
    },
    // 批次 B #4：系统托盘（关闭时最小化到托盘）菜单与提示文案
    tray: {
        showMainWindow: '显示主窗口',
        quit: '退出',
        tooltip: '白泽笔记',
        // 1.3.6：首次隐藏到托盘时的系统通知（Windows 托盘图标可能位于任务栏溢出区）
        minimizedTitle: '白泽笔记已最小化到系统托盘',
        minimizedBody:
            '应用仍在后台运行。右键点击系统托盘图标（可能位于任务栏溢出区）可选择「退出」完全关闭。'
    },
    editor: {
        ariaLabel: '白泽笔记编辑器'
    },
    // 2026-11-20（用户需求）：关闭窗口/退出时存在未保存修改的确认文案
    closeConfirm: {
        title: '未保存的修改',
        message: '当前文件有未保存的修改，是否保存后关闭？',
        detail: '选择「保存并关闭」将保存当前文件；「不保存」将丢弃修改；「取消」返回继续编辑。',
        save: '保存并关闭',
        discard: '不保存',
        cancel: '取消',
        // P3 F-09：minimizeToTray 开启时「关闭」实际是隐藏到托盘，文案随场景切换
        trayMessage: '当前文件有未保存的修改，是否保存后隐藏到系统托盘？',
        trayDetail:
            '选择「保存并隐藏」将保存当前文件并隐藏到系统托盘（应用继续在后台运行）；「不保存」将丢弃修改；「取消」返回继续编辑。',
        traySave: '保存并隐藏',
        // 2026-11-20（关闭确认应用内对话框）：保存执行中按钮文案与失败提示
        saving: '正在保存…',
        saveFailed: '保存失败，窗口未关闭。请重试保存，或选择「不保存」/「取消」。'
    },
    dialog: {
        errorTitle: '错误!',
        infoTitle: '提示',
        warningTitle: '警告',
        confirmTitle: '确认',
        confirm: '确认',
        cancel: '取消',
        saveAsTitle: '另存为',
        saveAsSuccessTitle: '另存为成功',
        saveAsSuccessMessage: '文件已保存到: {path}',
        saveAsFailedTitle: '另存为失败',
        saveAsFailedMessage: '另存为失败: {error}',
        largeFileTitle: '大文件提示',
        largeFileMessage: '文件大小为 {size} MB，打开可能影响性能，是否继续？',
        largeFileContinue: '继续打开',
        exportTitle: '导出为 {name}',
        exportSuccess: '导出成功: {path}',
        exportFailed: '导出文件失败: {error}',
        saveImportFileTitle: '保存导入文件'
    },
    status: {
        operationFailed: '操作失败：{message}',
        autoSaveFailed: '自动保存失败：{message}',
        saveFailed: '文件保存失败：{message}',
        fileCreatedUtf8: '已创建文件（utf-8）',
        fileOpened: '已打开文件（{encoding}）',
        openFileFailed: '打开文件失败：{message}',
        dirtySkipReload: '当前文件有未保存的修改，已跳过从磁盘重新加载',
        reloadedFromDisk: '已从磁盘重新加载（{encoding}）',
        reloadFromDiskFailed: '从磁盘重新加载失败：{message}',
        reopenedWithEncoding: '已按 {encoding} 编码重新打开文件',
        convertedEncoding: '已转为 {encoding} 编码并保存',
        noActiveFileUnsaved: '当前没有活动文件，内容暂未保存',
        // FE-08：无活动文件时执行保存的明确提示（原 SaveActiveFile 直接 throw，菜单路径产生未捕获拒绝）
        noActiveFileSave: '当前没有活动文件，无法保存',
        // FE-08：菜单动作执行失败的统一状态栏提示（ASLA）
        menuActionFailed: '菜单操作执行失败：{message}',
        // 「文件」菜单最近文件/最近文件夹：目标已不在当前最近列表中（列表变化/文件被移动）
        recentTargetMissing: '最近列表已变化，目标不存在',
        // P1-1（工作区受信根来源收敛）：拒绝未经主进程确认的工作区目录
        workspaceRootNotApproved:
            '该工作目录未经系统目录选择器确认，已拒绝打开（请通过「打开文件夹」重新选择目录）',
        // 系统设置补充实现批次 A：启动恢复上次文件/目录失败时的状态栏提示
        startupRestoreFileMissing:
            '上次打开的文件已不存在（可能已被移动或删除），本次未自动恢复：{path}',
        startupRestoreFolderMissing:
            '上次打开的工作目录已不存在（可能已被移动或删除），本次未自动恢复：{path}',
        // P2-6：启动恢复的目录未通过 AS-2 工作区根校验（主目录/系统目录/磁盘根等）
        startupRestoreFolderInvalid:
            '上次打开的工作目录未通过安全检查（{reason}），本次未自动恢复：{path}',
        startupRestoreFailed: '启动时自动恢复上次打开的内容失败：{message}',
        // 系统设置补充实现批次 C：自动备份结果状态栏提示
        autoBackupSuccess: '自动备份完成：{name}（{count} 个文件）',
        autoBackupFailed: '自动备份失败：{message}'
    },
    file: {
        saveFailed: '保存文件失败: {message}',
        noActiveFileForSaveAs: '当前没有活动文件可另存为',
        unsupportedFormat: '不支持的文件格式: {ext}',
        directoryListFailed: '获取目录列表失败！',
        alreadyExists: '{path} 已存在',
        openDirectoryDialogFailed: '打开目录对话框出错: {error}',
        noActiveFileReopen: '当前没有活动文件，无法重新打开',
        noActiveFileConvert: '当前没有活动文件，无法转换编码',
        readLargeFileFailed: '读取大文件失败：{message}',
        readLargeFileFailedPrefix: '读取大文件失败',
        readError: {
            enoent: '文件不存在或已被移动',
            eacces: '没有读取权限',
            eperm: '没有读取权限',
            eisdir: '目标路径是目录而不是文件',
            ebusy: '文件被其他程序占用',
            emfile: '同时打开的文件过多'
        },
        readErrorWithDetail: '{reason}（{message}）',
        noExportContent: '当前没有可导出的内容',
        unsupportedExportFormat: '暂不支持导出为 {format} 格式',
        excelImportUnsupported: '暂不支持直接导入 .xls/.xlsx 文件，请先将表格导出为 CSV 格式再导入',
        htmlToMarkdownFailed: 'HTML 转 Markdown 失败: {error}',
        importUnsupportedFormat:
            '暂不支持当前格式的文件。\r\n当前支持 *.txt、*.log、*.ini、*.json、*.yaml、*.yml、*.csv、*.xml、*.html、*.htm、*.mhtml、*.doc、*.docx。\r\n*.xls、*.xlsx 请先导出为 CSV 格式再导入',
        importFailed: '导入文件失败: {error}',
        importDefaultFileName: '导入文件.md',
        createImagesDirFailed: '{path} 不存在，创建目录失败，{error}',
        imageFormatUnsupported: '解析文件格式失败，当前只支持*.png;*.jpg;*.jpeg;*.bmp;*gif;*.ico;',
        saveImageFailed: '保存图像时出错: {error}',
        noFileOpen: '未打开任何文件，请先打开一个文件',
        fileAlreadyExists: '文件已经存在 {name}',
        openFileFirst: '请先打开一个文件！',
        pasteTargetNotDirectory: '目标不是一个目录！',
        noCopyCutSource: '未拷贝/剪切源文件！',
        sameSourceAndTarget: '源路径和目标路径相同！',
        fileOrFolderAlreadyExists: '文件/文件夹已经存在！\r\n{path}',
        // FE-32：删除/复制失败时把常见错误码映射为中文可读文案（未知错误保留原文+错误码）
        deleteFailed: '删除失败：{message}',
        copyFailed: '复制失败：{message}'
    },
    filters: {
        markdown: 'Markdown 文件',
        word: 'Word 文档',
        text: '文本文件',
        html: 'HTML 文件',
        json: 'JSON 文件',
        pdf: 'PDF 文件',
        xml: 'XML 文件',
        yaml: 'YAML 文件'
    },
    security: {
        openExeTitle: '安全确认',
        openExeMessage: '即将打开可执行程序',
        openExeDetail: '该程序不在系统受信目录中：\n{path}\n\n请确认来源可信后再继续。',
        // P3-2：系统敏感目录（%SystemRoot%\System32、Program Files、macOS /System 等）
        // 不再免确认，使用更强提示；普通目录仍用 openExeDetail。
        openExeDetailSystem:
            '该程序位于系统敏感目录（如 Windows 系统目录、Program Files 或系统程序目录）：\n{path}\n\n系统目录中的程序通常由操作系统或软件安装器管理。请确认来源可信后再继续。',
        openExeConfirm: '确认打开'
    },
    update: {
        title: '检查更新',
        notConfiguredMessage: '未配置更新源',
        notConfiguredDetail:
            '当前未配置可用的更新服务器地址。\n方式一（推荐）：在 resources/config/update.json 中配置 { "provider": "generic", "url": "https://更新服务器地址/目录" }，可参考 resources/config/update.json.example；\n方式二：将 electron-builder.yml 中 publish.url 的 example.com 占位地址替换为真实的更新服务器地址后重新打包。',
        upToDateMessage: '已是最新版本',
        upToDateDetail: '当前版本 v{version} 已是最新版本。',
        availableMessage: '发现新版本 v{version}',
        availableDetail: '新版本已下载完成，是否立即重启并安装更新？',
        restartNow: '立即重启安装',
        later: '稍后',
        failedMessage: '检查更新失败',
        downloadFailed: '新版本下载失败，请检查网络后重试',
        // 更新链路健壮性：下载等待超时（10 分钟）与安装前置保存失败
        downloadTimeout: '新版本下载超时，请检查网络后重试',
        saveBeforeInstallFailedMessage: '保存未完成的修改失败，本次更新安装已取消',
        saveBeforeInstallFailedDetail:
            '请先处理保存失败的原因（例如另存为新文件）后，再次通过「帮助 → 检查更新」安装已下载的更新。'
    },
    plantuml: {
        missingOutContainer: 'PlantUML 渲染页缺少 #out 容器',
        missingSvg: 'PlantUML 未生成 SVG',
        invalidResult: 'PlantUML 本地渲染返回了无效结果',
        renderFailed: 'PlantUML 本地渲染失败',
        resourceNotFound: '未找到 resources/plantuml 离线渲染资源',
        windowInitTimeout: 'PlantUML 渲染窗口初始化超时（{ms}ms）',
        pageNotReady: 'PlantUML 渲染页未就绪（window.plantumlRender 未暴露）',
        pageLoadFailed: 'PlantUML 渲染页加载失败：{description}（{code}）',
        processGone: 'PlantUML 渲染进程异常退出：{reason}',
        renderTimeout: 'PlantUML 本地渲染超时（{ms}ms）',
        renderException: 'PlantUML 本地渲染异常：{message}',
        emptySource: 'PlantUML 源码为空',
        invalidSourceParam: 'PlantUML 源码参数无效（期望字符串）'
    }
}
