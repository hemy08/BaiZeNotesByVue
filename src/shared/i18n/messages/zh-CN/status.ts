/**
 * status 命名空间（中）
 *
 * 状态栏文案：文件路径标签、就绪提示、文件大小、光标位置等静态与动态模板。
 * 注意：主进程经状态栏通道下发的消息由主进程侧翻译（mainMsg 命名空间），
 * 渲染层原样展示，不在本命名空间内。
 */
export default {
    filePathLabel: '文件路径:',
    defaultFilePath: '白泽笔记',
    ready: '就绪',
    bytesZero: '0字节',
    bytes: '{value} 字节',
    cursorLabel: '行',
    cursorPosition: '行 {line} 列 {column}',
    writingStats: {
        summary: '{cjk} 字 · {words} 词 · {chars} 字符 · 约 {minutes} 分钟',
        selection: '选中 {chars} 字符 · {words} 词',
        goal: '今日 {written}/{goal} · {percent}%',
        goalAchieved: '今日目标已达成 · {written} 字'
    }
}
