<template>
    <!--
        C-4 迁移：compact（32px 标题栏）+ circle（28px 圆形关闭按钮）+ 750×600 容器；
        迁移前标题栏是「仅关闭按钮、右对齐、无标题文字」的 Electron 原生拖拽区
        （-webkit-app-region: drag），且不使用自定义拖拽（未调用 useDialogDrag），故：
        - 不传 title / title 插槽（BaseDialog 默认渲染的空 .title-text 占 0 宽，布局等价）；
        - titleBarStyle 覆盖 flex-end / 0 10px 内边距 / drag / flex-shrink:0，并还原旧外壳
          未声明的 cursor:auto、user-select:auto（默认壳为 move/none）；
        - closeButtonStyle 覆盖 no-drag（拖拽区内的按钮必须 no-drag 才能点击）；
        - draggable=false 关闭自定义拖拽，标题栏拖拽完全交给 Electron 原生 app-region；
        - 底栏是居中的信息条而非操作按钮行，经 footerStyle 还原为块级居中布局。
    -->
    <BaseDialog
        :visible="visible"
        :aria-label="t('dialogRenderer.helpAbout.windowTitle')"
        title-bar-variant="compact"
        close-button-variant="circle"
        width="750px"
        :draggable="false"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :close-button-style="closeButtonStyle"
        :footer-style="footerStyle"
        @close="handleClose"
    >
        <div class="container">
            <div class="left-panel">
                <div class="icon-container">
                    <div class="baize-icon">白泽</div>
                </div>
                <h1 class="app-name">白泽笔记</h1>
                <div class="app-version">v{{ appVersion }}</div>
                <p class="app-desc">
                    {{ t('dialogRenderer.helpAbout.descLine1') }}
                </p>
                <p class="app-desc">Markdown</p>
                <p class="app-desc">
                    {{ t('dialogRenderer.helpAbout.descLine2') }}
                </p>
                <p class="app-desc">
                    {{ t('dialogRenderer.helpAbout.descLine3') }}
                </p>
            </div>

            <div class="right-panel">
                <div class="info-card">
                    <h3>{{ t('dialogRenderer.helpAbout.versionInfo') }}</h3>
                    <div class="info-row">
                        <span class="label">{{ t('dialogRenderer.helpAbout.appVersion') }}</span>
                        <span class="value">v{{ appVersion }}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">{{ t('dialogRenderer.helpAbout.releaseDate') }}</span>
                        <span class="value">{{ buildDate }}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Electron</span>
                        <span class="value">v{{ electronVersion }}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Chromium</span>
                        <span class="value">v{{ chromeVersion }}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Node.js</span>
                        <span class="value">v{{ nodeVersion }}</span>
                    </div>
                </div>

                <div class="info-card">
                    <h3>{{ t('dialogRenderer.helpAbout.devFramework') }}</h3>
                    <div class="info-row">
                        <span class="label">Vue</span>
                        <span class="value">v{{ vueVersion }}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Vite</span>
                        <span class="value">v{{ viteVersion }}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">TypeScript</span>
                        <span class="value">v{{ typescriptVersion }}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Monaco Editor</span>
                        <span class="value">v{{ monacoEditorVersion }}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">markdown-it</span>
                        <span class="value">v{{ markdownItVersion }}</span>
                    </div>
                </div>

                <div class="info-card">
                    <h3>{{ t('dialogRenderer.helpAbout.systemEnvironment') }}</h3>
                    <div class="info-row">
                        <span class="label">{{ t('dialogRenderer.helpAbout.os') }}</span>
                        <span class="value">{{ systemInfo }}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">{{ t('dialogRenderer.helpAbout.platform') }}</span>
                        <span class="value">{{ platform }}</span>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <a href="#" @click.prevent="openLink('https://github.com/hemy08/BaiZeNotesByVue')"
                >GitHub</a
            >
            <span class="divider">|</span>
            <a href="#" @click.prevent="openLink('https://hemy08.github.io/hemynotes/')">{{
                t('dialogRenderer.common.docs')
            }}</a>
            <span class="divider">|</span>
            <span>2024 Hemy08</span>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { CSSProperties } from 'vue'
import { IPC } from '../../../../../shared/ipc-channels'
// 第 2 批契约重构：版本信息返回结构统一引用 shared AppVersionInfo
// （与主进程 utils.ts 的 SYSTEM.APP_VERSION handler、preload index.d.ts 同一契约）
import type { AppVersionInfo } from '../../../../../shared/types'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
}>()

/**
 * Electron 专有内联样式：BaseDialog 内部的 DialogStyleProperties 未导出，
 * 这里按同构方式在 Vue CSSProperties 上补充 -webkit-app-region（不引入 any）。
 */
interface DialogStyleOverrides extends CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
}

/**
 * C-4 迁移：外壳覆盖（其余外壳声明与 BaseDialog 默认壳逐项一致）。
 * - 容器：宽度 750px 由 width 属性承载，固定高 600px 经 containerStyle 覆盖；
 * - 标题栏：仅关闭按钮、右对齐（flex-end）、0 10px 内边距、Electron 原生 drag 区、
 *   flex-shrink: 0；旧外壳未声明 cursor/user-select，这里显式还原为 auto，
 *   避免默认壳的 cursor:move / user-select:none 在禁用自定义拖拽后误导交互；
 * - 关闭按钮：circle 变体提供 28px 圆形按钮，拖拽区内需声明 no-drag 才能点击；
 * - 底栏：旧外壳是居中的信息条（块级布局、10px 20px 内边距、11px 次要文字、无 gap），
 *   与默认壳的 flex 操作按钮行不同，改回 display:block 才能保持文案居中。
 */
const containerStyle: CSSProperties = { height: '600px' }
const titleBarStyle: DialogStyleOverrides = {
    justifyContent: 'flex-end',
    padding: '0 10px',
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    cursor: 'auto',
    userSelect: 'auto'
}
const closeButtonStyle: DialogStyleOverrides = { WebkitAppRegion: 'no-drag' }
const footerStyle: CSSProperties = {
    display: 'block',
    padding: '10px 20px',
    textAlign: 'center',
    fontSize: '11px',
    color: 'var(--secondary-text-color)'
}

const appVersion = ref('')
const buildDate = ref('')
const vueVersion = ref('')
const viteVersion = ref('')
const typescriptVersion = ref('')
const electronVersion = ref('')
const chromeVersion = ref('')
const nodeVersion = ref('')
const monacoEditorVersion = ref('')
const markdownItVersion = ref('')
const systemInfo = ref('')
const platform = ref('')

onMounted(async () => {
    try {
        // 第 2 批契约重构：返回类型由 preload 类型声明（shared AppVersionInfo）推断，
        // 此处显式标注以固定消费契约（字段与主进程 handler / preload 双侧一致）。
        const versionInfo: AppVersionInfo = await window.api.app.getVersion()
        appVersion.value = versionInfo.appVersion
        electronVersion.value = versionInfo.electronVersion
        chromeVersion.value = versionInfo.chromeVersion
        nodeVersion.value = versionInfo.nodeVersion
        vueVersion.value = versionInfo.vueVersion
        viteVersion.value = versionInfo.viteVersion
        typescriptVersion.value = versionInfo.typescriptVersion
        monacoEditorVersion.value = versionInfo.monacoEditorVersion
        markdownItVersion.value = versionInfo.markdownItVersion
    } catch (error) {
        logger.error('Failed to get version info:', error)
        appVersion.value = '1.3.0'
        vueVersion.value = '3.5.45'
        viteVersion.value = '8.3.8'
        typescriptVersion.value = '6.0.3'
        monacoEditorVersion.value = '0.57.0'
        markdownItVersion.value = '15.0.3'
    }

    buildDate.value = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })

    if (typeof navigator !== 'undefined') {
        platform.value = navigator.platform || ''
    }

    if (typeof require !== 'undefined') {
        try {
            const osInfo = await window.electron.ipcRenderer.invoke(IPC.SYSTEM.SYSTEM_INFO)
            systemInfo.value = osInfo
        } catch {
            systemInfo.value = 'Unknown'
        }
    }
})

function openLink(url: string) {
    if (typeof window !== 'undefined' && window.open) {
        window.open(url, '_blank')
    }
}

function handleClose() {
    emit('close')
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）已抽到 BaseDialog；
   这里只保留正文（左侧应用信息 / 右侧版本信息卡片）与底栏链接样式。底栏链接位于
   BaseDialog 的 footer 插槽内、由本组件模板渲染，仍带本组件 scope id，故 .footer a 继续生效。 */
.container {
    flex: 1;
    display: flex;
    padding: 20px;
    gap: 20px;
    overflow: hidden;
}

.left-panel {
    width: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 20px;
}

.icon-container {
    width: 150px;
    height: 150px;
    background: var(--theme-title-bar-gradient);
    border-radius: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    margin-bottom: 20px;
}

.baize-icon {
    font-size: 48px;
    font-weight: bold;
    color: #fff;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.app-name {
    font-size: 24px;
    font-weight: bold;
    color: var(--text-color);
    margin-bottom: 5px;
}

.app-version {
    font-size: 14px;
    color: var(--secondary-text-color);
    margin-bottom: 20px;
}

.app-desc {
    font-size: 14px;
    font-weight: bold;
    color: var(--text-color);
    margin: 3px 0;
}

.right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
}

.info-card {
    background: var(--card-bg);
    border-radius: 8px;
    padding: 14px 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-color);
}

.info-card h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent-color);
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
}

.info-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 3px 0;
}

.info-row .label {
    color: var(--secondary-text-color);
}

.info-row .value {
    color: var(--text-color);
    font-weight: 500;
}

.footer a {
    color: var(--accent-color);
    text-decoration: none;
}

.footer a:hover {
    text-decoration: underline;
}

.divider {
    margin: 0 8px;
    color: var(--border-color);
}
</style>
