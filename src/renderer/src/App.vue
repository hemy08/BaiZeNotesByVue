<template>
    <div id="app-root">
        <!-- 欢迎界面 -->
        <WelcomeScreen
            v-if="showWelcome"
            @open-file="handleOpenFile"
            @open-folder="handleOpenFolder"
            @open-recent-folder="handleOpenRecentFolder"
        />

        <!-- 主应用界面 -->
        <BaiZeNotes v-else />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import BaiZeNotes from './components/BaiZeNotes.vue'
import { IPC } from '../../shared/ipc-channels'
// FE-35：配置写盘去抖窗口内的最后修改需要关窗前主动落盘
import { flushConfigWrites } from './common/useConfigStore'

// 欢迎界面显示状态
const showWelcome = ref(true)

// =============================================================================================
// 启动恢复与欢迎页（产品决策 2026-11-15）
//
// 主进程启动时（src/main/index.ts ready-to-show → restoreLastOpenedFile）会在后台恢复上次
// 打开的文件/目录并下发数据事件；但渲染层**不会因此自动跳过欢迎页**——启动后始终显示
// 欢迎界面，由用户点击「最近文件夹 / 打开文件 / 打开文件夹」主动进入主界面。
// 理由：欢迎页是应用入口与最近工作列表，自动跳转会让用户失去选择入口的机会。
// （此前 FE-18 的「收到恢复数据即进入主界面」实现已按此决策移除。）
//
// 用户主动进入主界面时，主进程会重新下发目录树/文件内容（handlers.ts 的 WELCOME_* 与
// OPEN_SPECIFIC_FOLDER 流程），因此欢迎页期间被丢弃的恢复数据不影响后续使用。
// =============================================================================================

/** 进入主界面后最大化窗口的延迟（与 handleEnterMain 的历史行为保持一致） */
const MAXIMIZE_DELAY_MS = 100

// 处理打开文件
function handleOpenFile() {
    // 发送 IPC 信号打开文件
    window.electron.ipcRenderer.send(IPC.FILE.WELCOME_OPEN_FILE)
}

// 处理打开文件夹
function handleOpenFolder() {
    // 发送 IPC 信号打开文件夹
    window.electron.ipcRenderer.send(IPC.FILE.WELCOME_OPEN_DIRECTORY)
}

// 处理打开最近的文件夹
async function handleOpenRecentFolder(folder: string) {
    // 立即隐藏欢迎界面和最大化窗口
    showWelcome.value = false
    window.electron.ipcRenderer.send(IPC.WINDOW.MAXIMIZE)
    // 打开指定文件夹
    window.electron.ipcRenderer.send(IPC.FILE.OPEN_SPECIFIC_FOLDER, folder)
    // 保存到最近打开列表
    await saveToRecentFolders(folder)
}

// 保存到最近打开的文件夹列表
async function saveToRecentFolders(folderPath: string) {
    try {
        let history = (await window.api.config.read<string[]>('recent-folders')) || []
        if (!Array.isArray(history)) {
            history = []
        }
        // 移除重复项并添加到开头
        history = history.filter((path: string) => path !== folderPath)
        history.unshift(folderPath)
        // 只保留最近20个
        history = history.slice(0, 20)
        await window.api.config.write('recent-folders', history)
    } catch (error) {
        console.error('Failed to save recent folders:', error)
    }
}

/** 最大化主窗口（延迟到主界面首帧渲染之后，避免欢迎页/主界面切换动画期间调用无效） */
function maximizeMainWindow(): void {
    setTimeout(() => {
        window.electron.ipcRenderer.send(IPC.WINDOW.MAXIMIZE)
    }, MAXIMIZE_DELAY_MS)
}

// 监听主进程的进入主界面通知
function handleEnterMain(_event: unknown, data: { type: string; path: string }) {
    // 隐藏欢迎界面
    showWelcome.value = false
    // 最大化窗口
    maximizeMainWindow()

    // 如果是文件夹,保存到最近打开列表
    if (data.type === 'directory') {
        saveToRecentFolders(data.path)
    }
}

/**
 * FE-35：立即落盘渲染层配置去抖窗口内的最后修改。
 *
 * 主进程关闭流程（main/index.ts 的 close/before-quit）会先发送 IPC.EDITOR.FLUSH_CONTENT
 * 并等待渲染层回执（2s 超时）后才真正关窗——此刻渲染层仍存活，配置写盘的 invoke
 * 可以送达主进程；beforeunload / onBeforeUnmount 作为刷新、卸载场景的兜底。
 */
function handleFlushConfigWrites(): void {
    void flushConfigWrites()
}

/** FE-35：页面刷新/关闭兜底 flush（异步 IPC 若来不及完成，由主进程关窗流程兜底） */
function handleBeforeUnload(): void {
    void flushConfigWrites()
}

// 检查是否应该显示欢迎界面
onMounted(async () => {
    try {
        // 监听进入主界面事件
        window.electron.ipcRenderer.on(IPC.FILE.WELCOME_ENTER_MAIN, handleEnterMain)
        // FE-35：主进程关窗前 flush 配置写盘 + 页面卸载兜底
        window.electron.ipcRenderer.on(IPC.EDITOR.FLUSH_CONTENT, handleFlushConfigWrites)
        window.addEventListener('beforeunload', handleBeforeUnload)

        // 可以根据配置决定是否显示欢迎界面
        const showWelcomeConfig = await window.api.config.read('show-welcome')
        if (showWelcomeConfig === false) {
            showWelcome.value = false
        }
    } catch (error) {
        console.error('Failed to load welcome config:', error)
    }
})

onBeforeUnmount(() => {
    // 移除监听器
    window.electron.ipcRenderer.removeListener(IPC.FILE.WELCOME_ENTER_MAIN, handleEnterMain)
    // FE-35：移除配置 flush 监听，并在卸载前兜底落盘待写配置
    window.electron.ipcRenderer.removeListener(IPC.EDITOR.FLUSH_CONTENT, handleFlushConfigWrites)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    void flushConfigWrites()
})
</script>

<style scoped>
#app-root {
    width: 100%;
    height: 100%;
}
</style>
