<template>
    <div id="app-root">
        <!-- 欢迎界面 -->
        <WelcomeScreen 
            v-if="showWelcome"
            @openFile="handleOpenFile"
            @openFolder="handleOpenFolder"
            @openRecentFolder="handleOpenRecentFolder"
        />
        
        <!-- 主应用界面 -->
        <BaiZeNotes v-else />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import BaiZeNotes from './components/BaiZeNotes.vue'

// 欢迎界面显示状态
const showWelcome = ref(true)

// 处理打开文件
function handleOpenFile() {
    // 发送 IPC 信号打开文件
    window.electron.ipcRenderer.send('baize:notes:welcome:open-file')
}

// 处理打开文件夹
function handleOpenFolder() {
    // 发送 IPC 信号打开文件夹
    window.electron.ipcRenderer.send('baize:notes:welcome:open-directory')
}

// 处理打开最近的文件夹
async function handleOpenRecentFolder(folder: string) {
    // 直接打开指定文件夹
    window.electron.ipcRenderer.send('baize:notes:open-specific-folder', folder)
    // 延迟隐藏欢迎界面和最大化窗口
    setTimeout(async () => {
        showWelcome.value = false
        window.electron.ipcRenderer.send('window-maximize')
        // 保存到最近打开列表
        await saveToRecentFolders(folder)
    }, 500)
}

// 保存到最近打开的文件夹列表
async function saveToRecentFolders(folderPath: string) {
    try {
        let history = await window.api.config.read('recent-folders') || []
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

// 监听主进程的进入主界面通知
function handleEnterMain(_: any, data: { type: string; path: string }) {
    console.log('Enter main interface:', data)
    // 隐藏欢迎界面
    showWelcome.value = false
    // 最大化窗口
    setTimeout(() => {
        window.electron.ipcRenderer.send('window-maximize')
    }, 100)
    
    // 如果是文件夹,保存到最近打开列表
    if (data.type === 'directory') {
        saveToRecentFolders(data.path)
    }
}

// 检查是否应该显示欢迎界面
onMounted(async () => {
    try {
        // 监听进入主界面事件
        window.electron.ipcRenderer.on('baize:notes:welcome:enter-main', handleEnterMain)
        
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
    window.electron.ipcRenderer.removeListener('baize:notes:welcome:enter-main', handleEnterMain)
})
</script>

<style scoped>
#app-root {
    width: 100%;
    height: 100%;
}
</style>
