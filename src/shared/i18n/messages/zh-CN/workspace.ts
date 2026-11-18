/**
 * workspace 命名空间（中）
 *
 * 工作区壳层文案：欢迎界面、左右导航栏提示、资源管理器右键菜单、窗口控制按钮提示。
 * 无中文可译的品牌名/扩展名保持原样，不进入本命名空间。
 */
export default {
    appTitle: '白泽笔记 - Markdown Editor Powered By Election + Vue',
    window: {
        minimize: '最小化',
        maximize: '最大化',
        restore: '还原'
    },
    navi: {
        fileManager: '文件管理器',
        outline: '大纲'
    },
    welcome: {
        title: '白泽笔记',
        openFile: '打开文件',
        openFolder: '打开文件夹',
        recentFolders: '最近打开的文件夹'
    },
    resourceContext: {
        new: '新建',
        markdownFile: 'Markdown文件',
        importWord: '从Word文档导入',
        importHtml: '从HTML文档导入',
        copyFile: '文件/文件夹',
        copyName: '文件/文件夹名称',
        copyRealPath: '文件夹绝对路径',
        copyRelativePath: '相对于当前打开文件路径',
        copyImageLink: '复制为本地图片链接',
        copyFileLink: '复制为本地文件链接',
        revealInFolder: '在文件夹中显示',
        exportToFile: '导出到文件',
        exportSourceFailedTitle: '导出已取消',
        exportSourceFailedMessage: '无法打开「{name}」，为避免导出错误内容，本次导出已取消。',
        openInExplorer: '在资源管理器打开',
        reloadFromDisk: '从磁盘重新加载'
    },
    createFileFolder: {
        failedTitle: '新建失败',
        failedMessage: '创建「{name}」失败：{error}'
    },
    config: {
        saveFailedTitle: '配置保存失败',
        saveFailedMessage: '配置「{name}」写入磁盘失败：{error}。修改可能不会在重启后保留。',
        writeReturnedFalse: '写入接口返回失败',
        names: {
            theme: '主题',
            editor: '编辑器',
            system: '系统',
            'quick-links': '快捷链接'
        }
    }
}
