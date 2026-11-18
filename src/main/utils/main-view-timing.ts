/**
 * FE-01：欢迎页 → 主界面的数据事件时序（从 ipc/handlers.ts 抽出，供多模块复用）
 *
 * 渲染层 App.vue 用 `v-if="showWelcome"` 切换界面，主界面组件（编辑器、资源管理器、
 * 状态栏）只有在收到 WELCOME_ENTER_MAIN 之后才会在 Vue 挂载周期里注册 IPC 监听器。
 * 旧实现先发送 CLEAR_EDITOR_PREVIEW / FILE_SYSTEM_DATA / SHOW_SELECTED_FILE_CONTEXT
 * 等数据事件、最后才发送 WELCOME_ENTER_MAIN：数据事件在监听器注册前到达而被丢弃，
 * 表现为首次从欢迎页打开文件/文件夹后编辑器与目录树空白，并存在用空内容覆盖原文件的
 * 数据丢失风险（P0-FE-01）。
 *
 * 修复策略（主进程最小改动）：先 send WELCOME_ENTER_MAIN，再在下一个事件循环 tick
 * （setImmediate）发送数据事件。Vue 挂载在渲染层处理 WELCOME_ENTER_MAIN 后的微任务中
 * 完成（onMounted 注册监听器），setImmediate 只让出主进程一个 tick，确保
 * WELCOME_ENTER_MAIN 已投递后再发数据；不使用固定 sleep，额外延迟通常 < 1 ms，
 * 远低于 500 ms 上限。
 *
 * 独立成模块的原因：「文件」菜单最近文件夹（handlers.ts 的 OPEN_RECENT）与启动恢复
 * （startup-restore.ts）都需要同一投递时序，而 startup-restore 反向被 handlers 引用；
 * 把本函数下沉到无依赖叶子模块可避免 handlers ↔ startup-restore 循环依赖。
 */

export function runAfterMainViewEntered(task: () => Promise<void> | void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        setImmediate(() => {
            void (async () => {
                try {
                    await task()
                    resolve()
                } catch (error) {
                    reject(error)
                }
            })()
        })
    })
}
