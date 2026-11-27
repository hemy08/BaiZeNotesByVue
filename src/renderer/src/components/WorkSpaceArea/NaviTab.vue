<template>
    <div id="navi-tab">
        <div class="navi-tab-item-btn">
            <!-- 文件管理器按钮 - 仅左侧显示 -->
            <button
                v-if="position === 'left'"
                data-index="0"
                :title="t('workspace.navi.fileManager')"
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

            <!-- 大纲按钮 - 仅左侧显示 -->
            <button
                v-if="position === 'left'"
                data-index="1"
                :title="t('workspace.navi.outline')"
                class="navi-tab-item outline"
                @click="onShowMarkdownTOC"
            >
                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M157.538462 265.846154c0 15.753846-13.784615 29.538462-29.538462 29.538461h-59.076923c-15.753846 0-29.538462-13.784615-29.538462-29.538461v-59.076923C39.384615 191.015385 53.169231 177.230769 68.923077 177.230769h59.076923c15.753846 0 29.538462 13.784615 29.538462 29.538462v59.076923z m827.076923-59.076923c0-15.753846-13.784615-29.538462-29.538462-29.538462h-689.230769c-15.753846 0-29.538462 13.784615-29.538462 29.538462v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538461h689.230769c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076923z m-827.076923 275.692307c0-15.753846-13.784615-29.538462-29.538462-29.538461h-59.076923c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076924c0 15.753846 13.784615 29.538462 29.538462 29.538461h59.076923c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076924z m748.307692 0c0-15.753846-13.784615-29.538462-29.538462-29.538461h-610.461538c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076924c0 15.753846 13.784615 29.538462 29.538462 29.538461h610.461538c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076924z m-748.307692 275.692308c0-15.753846-13.784615-29.538462-29.538462-29.538461h-59.076923c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538462h59.076923c15.753846 0 29.538462-13.784615 29.538462-29.538462v-59.076923z m827.076923 0c0-15.753846-13.784615-29.538462-29.538462-29.538461h-689.230769c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538462h689.230769c15.753846 0 29.538462-13.784615 29.538462-29.538462v-59.076923z"
                    ></path>
                </svg>
            </button>

            <!-- HemyNotes按钮 - 仅左侧显示 -->
            <button
                v-if="position === 'left'"
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
                <!-- P1 安全修复（N-06）：svg 图标内容来自可编辑配置，写入 v-html 前必须消毒 -->
                <!-- eslint-disable-next-line vue/no-v-html -- 图标内容来自可编辑配置，已先经 sanitizeSvgIcon（DOMPurify）白名单消毒 -->
                <div v-if="link.icon === 'svg'" v-html="sanitizeSvgIcon(link.iconContent)"></div>
                <img
                    v-else-if="link.icon === 'img'"
                    :src="link.iconContent"
                    :alt="link.name"
                    style="width: 35px; height: 35px"
                />
                <span v-else-if="link.icon === 'text'" class="text-icon">{{
                    link.iconContent
                }}</span>
                <span v-else style="font-size: 24px">{{ link.iconContent }}</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import DOMPurify from 'dompurify'
import { IPC } from '../../../../shared/ipc-channels'
import { t } from '../../common/i18n'
// ARC-13：QuickLinkItem 已收敛到 src/shared/types/quick-link.ts（唯一真源，主进程同源）
import type { QuickLinkItem } from '../../../../shared/types'
import { logger } from '../../common/logger'

// 接收 position prop: 'left' 或 'right'
const props = defineProps<{
    position: 'left' | 'right'
}>()

let currentNaviTal = 'file-explorer'

// 定义 emit 函数
const emit = defineEmits(['update:navi:tab'])

const allQuickLinks = ref<QuickLinkItem[]>([])

// 根据 position 过滤快速链接
const quickLinks = computed(() => {
    return allQuickLinks.value.filter((link) => link.position === props.position)
})

// P1 安全修复（N-06）：iconContent 来自可编辑的快速链接配置并直接进入 v-html，
// 原样注入时可执行 HTML 注入（持久化 XSS）。改为 DOMPurify 白名单消毒：
// 仅启用 svg + svgFilters profile（保留图标所需的 SVG 标签/属性，如 viewBox/path/fill），
// 剥离 <script>、on* 事件处理器、javascript: 协议、foreignObject 等注入面。
const ICON_SVG_SANITIZE_CONFIG = {
    USE_PROFILES: { svg: true, svgFilters: true }
}

/** 消毒 svg 类型的图标内容（img/text/emoji 分支走属性绑定/文本插值，本就不经 v-html） */
function sanitizeSvgIcon(content: string): string {
    return DOMPurify.sanitize(content, ICON_SVG_SANITIZE_CONFIG)
}

// 加载快速链接配置
async function loadQuickLinks() {
    try {
        const links = await window.electron.ipcRenderer.invoke(IPC.QUICK_LINKS.GET)
        if (!Array.isArray(links)) {
            return
        }
        allQuickLinks.value = links.filter((link: QuickLinkItem) => link.enabled)
    } catch (error) {
        logger.error('[NaviTab] 加载快速链接配置失败:', error)
    }
}

// P1-FE-04：快捷链接设置数据源统一——设置对话框保存成功后主进程广播
// QUICK_LINKS.UPDATED（载荷即归一化后的 QuickLinkItem[]），此处直接应用载荷刷新，
// 保证「设置 → 确定」后导航栏立即生效（原实现仅在挂载时读取一次，需重挂载才刷新）。
// 载荷异常时回退为重新 invoke(GET) 拉取，保证与主进程数据源一致。
function handleQuickLinksUpdated(_event: unknown, updated: unknown) {
    if (Array.isArray(updated)) {
        allQuickLinks.value = updated.filter((link: QuickLinkItem) => link.enabled)
        return
    }
    void loadQuickLinks()
}

// 快速链接点击事件
function onQuickLinkClick(link: QuickLinkItem) {
    if (link.type === 'url') {
        window.open(link.path, '_blank', 'noopener, noreferrer')
    } else {
        window.electron.ipcRenderer.send(IPC.NAVIGATION.OPEN_EXE, link.path)
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
    window.open('https://hemy08.github.io/hemynotes/', '_blank', 'noopener, noreferrer')
}

// 组件挂载时注册刷新监听并加载配置
onMounted(async () => {
    window.electron.ipcRenderer.on(IPC.QUICK_LINKS.UPDATED, handleQuickLinksUpdated)
    await loadQuickLinks()
})

// 卸载时移除监听（与项目其他组件 IPC 监听注册/清理成对约定一致）
onBeforeUnmount(() => {
    window.electron.ipcRenderer.removeListener(IPC.QUICK_LINKS.UPDATED, handleQuickLinksUpdated)
})
</script>

<style scoped>
#navi-tab {
    border-right: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-left: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
}

.navi-tab-item-btn {
    width: 100%;
    display: flex;
    flex-direction: column;
    /* 视觉升级（主窗口可见性修复）：按钮面随外壳材质切换（paper 纸感 / glass 半透明 /
       workbench 与 hybrid 保持既有卡片底 --ui-bg-elevated = --theme-card-background）。 */
    background-color: var(--theme-card-background, white);
    background-color: var(--bz-shell-surface, var(--theme-card-background, white));
    margin: 1px;
}

.navi-tab-item {
    width: 100%;
    background-color: var(--theme-card-background, white);
    background-color: var(--bz-shell-surface, var(--theme-card-background, white));
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
    background: var(--theme-title-bar-gradient);
    border-radius: 6px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
</style>
