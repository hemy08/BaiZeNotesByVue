<template>
    <div id="navi-tab">
        <div class="navi-tab-item-btn">
            <!-- 文件管理器按钮 - 保留 -->
            <button
                data-index="0"
                title="文件管理器"
                class="navi-tab-item file active"
                @click="onShowFileExplorer"
            >
                <svg viewBox="0 0 32 32" xml:space="preserve" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M28,7v3c0,0.55-0.45,1-1,1H16c-0.35,0-0.68-0.18-0.86-0.49l-1.8-3c-0.1801-0.3-0.19-0.69-0.01-1    C13.51,6.19,13.84,6,14.2,6H27C27.55,6,28,6.45,28,7z"
                        fill="#FE9803"
                    />
                    <path
                        d="M31,10v17c0,0.55-0.45,1-1,1H2c-0.55,0-1-0.45-1-1V5c0-0.55,0.45-1,1-1h11c0.35,0,0.68,0.18,0.86,0.49    L16.57,9H30C30.55,9,31,9.45,31,10z"
                        fill="#FFC10A"
                    />
                </svg>
            </button>

            <!-- 大纲按钮 - 保留 -->
            <button
                data-index="1"
                title="大纲"
                class="navi-tab-item outline"
                @click="onShowMarkdownTOC"
            >
                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M157.538462 265.846154c0 15.753846-13.784615 29.538462-29.538462 29.538461h-59.076923c-15.753846 0-29.538462-13.784615-29.538462-29.538461v-59.076923C39.384615 191.015385 53.169231 177.230769 68.923077 177.230769h59.076923c15.753846 0 29.538462 13.784615 29.538462 29.538462v59.076923z m827.076923-59.076923c0-15.753846-13.784615-29.538462-29.538462-29.538462h-689.230769c-15.753846 0-29.538462 13.784615-29.538462 29.538462v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538461h689.230769c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076923z m-827.076923 275.692307c0-15.753846-13.784615-29.538462-29.538462-29.538461h-59.076923c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076924c0 15.753846 13.784615 29.538462 29.538462 29.538461h59.076923c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076924z m748.307692 0c0-15.753846-13.784615-29.538462-29.538462-29.538461h-610.461538c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076924c0 15.753846 13.784615 29.538462 29.538462 29.538461h610.461538c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076924z m-748.307692 275.692308c0-15.753846-13.784615-29.538462-29.538462-29.538461h-59.076923c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538462h59.076923c15.753846 0 29.538462-13.784615 29.538462-29.538462v-59.076923z m827.076923 0c0-15.753846-13.784615-29.538462-29.538462-29.538461h-689.230769c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538462h689.230769c15.753846 0 29.538462-13.784615 29.538462-29.538462v-59.076923z"
                    ></path>
                </svg>
            </button>

            <!-- HemyNotes按钮 - 保留 -->
            <button
                data-index="2"
                title="HemyNotes"
                class="navi-tab-item outline"
                @click="onOpenHemyNotes"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                        d="M12 8a3 3 0 0 0 3-3 3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3m0 3.54C9.64 9.35 6.5 8 3 8v11c3.5 0 6.64 1.35 9 3.54 2.36-2.19 5.5-3.54 9-3.54V8c-3.5 0-6.64 1.35-9 3.54"
                    ></path>
                </svg>
            </button>

            <!-- 动态配置的快速链接 -->
            <button
                v-for="link in quickLinks"
                :key="link.id"
                :title="link.name"
                class="navi-tab-item outline"
                @click="onQuickLinkClick(link)"
            >
                <div v-if="link.icon === 'svg'" v-html="link.iconContent"></div>
                <img v-else-if="link.icon === 'img'" :src="link.iconContent" :alt="link.name" style="width: 35px; height: 35px" />
                <span v-else-if="link.icon === 'text'" class="text-icon">{{ link.iconContent }}</span>
                <span v-else style="font-size: 24px;">{{ link.iconContent }}</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

let currentNaviTal = 'file-explorer'

// 定义 emit 函数
const emit = defineEmits(['update:navi:tab'])

interface QuickLinkItem {
    id: string
    name: string
    type: 'url' | 'exe'
    path: string
    icon: string
    iconContent: string
    enabled: boolean
    order: number
}

const quickLinks = ref<QuickLinkItem[]>([])

// 加载快速链接配置
function loadQuickLinks() {
    const links = window.electron.ipcRenderer.sendSync('baize-notes:get-quick-links')
    quickLinks.value = links.filter((link: QuickLinkItem) => link.enabled)
}

// 监听快速链接更新事件
function handleQuickLinksUpdated() {
    loadQuickLinks()
}

// 快速链接点击事件
function onQuickLinkClick(link: QuickLinkItem) {
    console.log('Quick link clicked:', link.name)
    if (link.type === 'url') {
        window.open(link.path, '_blank', 'noopener, noreferrer')
    } else {
        window.electron.ipcRenderer.send('navi-tab-open-exe', link.path)
    }
}

// 显示文件管理器
function onShowFileExplorer() {
    if (currentNaviTal === 'file-explorer') {
        // 隐藏文件资源管理器
        emit('update:navi:tab', 'switch-open-close')
    } else {
        // 切换文件资源管理器
        emit('update:navi:tab', 'file-explorer')
        currentNaviTal = 'file-explorer'
    }
}

// 显示Markdown大纲
function onShowMarkdownTOC() {
    if (currentNaviTal === 'markdown-toc') {
        // 隐藏文件资源管理器
        emit('update:navi:tab', 'switch-open-close')
    } else {
        // 切换markdown导航栏
        currentNaviTal = 'markdown-toc'
        emit('update:navi:tab', 'markdown-toc')
    }
}

// 打开HemyNotes
function onOpenHemyNotes() {
    console.log('navi-tab-open-exe')
    window.open('https://hemy08.github.io/hemynotes/', '_blank', 'noopener, noreferrer')
}

// 组件挂载时加载配置
onMounted(() => {
    loadQuickLinks()
    // 监听快速链接更新事件，实现立即生效
    window.electron.ipcRenderer.on('baize-notes:quick-links-updated', handleQuickLinksUpdated)
})

// 组件卸载时移除监听
onUnmounted(() => {
    window.electron.ipcRenderer.removeListener('baize-notes:quick-links-updated', handleQuickLinksUpdated)
})
</script>

<style scoped>
.navi-tab-item-btn {
    width: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--theme-card-background, white);
    margin: 1px;
}

.navi-tab-item {
    width: 100%;
    background-color: var(--theme-card-background, white);
    color: white;
    fill: #986801;
    border: none; /* 去掉外边框 */
    margin-top: 10px;
}

.navi-tab-item:hover {
    background-color: var(--theme-hover-background, grey);
}
.text-icon {
    font-size: 20px;
    font-weight: bold;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 6px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}
</style>
