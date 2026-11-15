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
    editor: {
        ariaLabel: '白泽笔记编辑器'
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
        menuActionFailed: '菜单操作执行失败：{message}'
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
        downloadFailed: '新版本下载失败，请检查网络后重试'
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
