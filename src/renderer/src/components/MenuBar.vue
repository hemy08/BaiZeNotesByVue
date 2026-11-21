<template>
    <div class="menu-bar" @mouseleave="handleMenuBarLeave">
        <div
            v-for="(menu, index) in menuData"
            :key="index"
            class="menu-item"
            :class="{ active: activeMenu === index }"
            @click="toggleMenu(index)"
            @mouseenter="handleMenuEnter(index)"
        >
            <span class="menu-label">{{ menu.labelKey ? t(menu.labelKey) : menu.label }}</span>
        </div>

        <!-- 子菜单容器 -->
        <teleport to="body">
            <transition name="submenu-fade">
                <div
                    v-if="activeMenu !== null && menuData[activeMenu].submenu"
                    class="submenu-container"
                    :style="submenuStyle"
                    @mouseleave="handleSubmenuLeave"
                    @mouseenter="handleSubmenuEnter"
                >
                    <BaiZeSubMenuItem
                        :items="menuData[activeMenu].submenu || []"
                        :level="0"
                        @close="closeMenu"
                    />
                </div>
            </transition>
        </teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { VNode } from 'vue'
import { menuMap } from './MenuBar/menu-config'
import type { BaiZeMenuEntry } from './MenuBar/menu-config'
import { HandleMenuAction } from './MenuBar/menu-actions'
import { t } from '../common/i18n'
import { getBaseName } from '../../../shared/utils/path'
import { logger } from '../common/logger'
import { useFeatureFlags } from '../composables/useFeatureFlags'

// ---------------------------------------------------------------------------------------------
// 菜单数据响应式副本
//
// menuMap 是静态导出（markRaw，避免被 Vue 代理）；「文件」菜单的「最近文件 / 最近文件夹」
// 两个占位子菜单需要在运行时按最近列表动态注入子项，故 MenuBar 挂载时做一次
// structuredClone 得到可响应的独立副本，模板与子菜单组件统一改用 menuData，
// 静态 menuMap 保持只读真源（单测/其他组件不受运行时注入影响）。
// ---------------------------------------------------------------------------------------------
const menuData = ref<BaiZeMenuEntry[]>(structuredClone(menuMap.value))

/**
 * 1.5.1 可选能力菜单过滤：featureFlag 关闭时从运行时菜单树移除该叶子项。
 * 静态 menuMap 保持完整（配置/测试/命令面板引用不受影响），只影响 MenuBar 展示。
 */
const { flags } = useFeatureFlags()

function filterFeatureMenu(items: BaiZeMenuEntry[]): BaiZeMenuEntry[] {
    const filtered: BaiZeMenuEntry[] = []
    for (const item of items) {
        if (item.featureFlag && !flags[item.featureFlag]) {
            continue
        }
        if (item.submenu) {
            const submenu = filterFeatureMenu(item.submenu)
            if (submenu.length === 0 && !item.recentMenuPlaceholder) {
                continue
            }
            filtered.push({ ...item, submenu })
        } else {
            filtered.push(item)
        }
    }
    return filtered
}

onMounted(() => {
    // 首帧按当前开关过滤一次（useFeatureFlags 的配置读取可能在挂载后才完成）
    menuData.value = filterFeatureMenu(structuredClone(menuMap.value))
})

watch(
    () => [flags.documentHistory, flags.markdownLint],
    () => {
        // 开关变化时重建运行时菜单；最近文件/文件夹占位项会由既有逻辑在打开菜单时重新注入
        menuData.value = filterFeatureMenu(structuredClone(menuMap.value))
        activeMenu.value = null
    }
)
/** 「文件」顶层菜单的 i18n key（用于定位并动态刷新最近文件/最近文件夹子菜单） */
const FILE_MENU_LABEL_KEY = 'menu.file.label'
/** 两个动态子菜单的占位项 id（与 menu-config.ts 保持一致） */
const RECENT_FILES_MENU_ID = 'recent-files'
const RECENT_FOLDERS_MENU_ID = 'recent-folders'
/** 最近列表展示上限（主进程返回侧已截断到 20，渲染层再兜底一次） */
const RECENT_MENU_LIMIT = 20
/** 最近项标签最大长度（超出截断，避免菜单被超长路径撑破） */
const RECENT_LABEL_MAX_LENGTH = 60

/** 截断最近项标签（保留前 N-3 字符 + ...） */
function truncateRecentLabel(label: string): string {
    return label.length > RECENT_LABEL_MAX_LENGTH
        ? `${label.slice(0, RECENT_LABEL_MAX_LENGTH - 3)}...`
        : label
}

/**
 * 最近文件菜单项：标签取文件名（basename），动作携带 encodeURIComponent 后的完整路径。
 *
 * 迁移（渲染层公共接口归位）：basename 解析改为复用 `shared/utils/path.getBaseName`
 * （同时识别 `/` 与 `\`；原实现先归一化反斜杠再按 `/` 切分，两者对文件路径输出一致）。
 * 保留原 `|| filePath` 兜底：路径以分隔符结尾导致 basename 为空串时仍展示原路径。
 */
function toRecentFileEntry(filePath: string): BaiZeMenuEntry {
    const baseName = getBaseName(filePath) || filePath
    return {
        label: truncateRecentLabel(baseName),
        menuAction: `baize:menu:file:recent-file:${encodeURIComponent(filePath)}`
    }
}

/** 最近文件夹菜单项：标签取完整路径（正斜杠归一化），动作携带编码后的完整路径 */
function toRecentFolderEntry(folderPath: string): BaiZeMenuEntry {
    return {
        label: truncateRecentLabel(folderPath.replace(/\\/g, '/')),
        menuAction: `baize:menu:file:recent-folder:${encodeURIComponent(folderPath)}`
    }
}

/** 把最近列表注入指定占位子菜单；空列表时注入禁用占位项（labelKey recentEmpty） */
function injectRecentEntries(menuId: string, entries: BaiZeMenuEntry[]): void {
    const fileMenu = menuData.value.find((item) => item.labelKey === FILE_MENU_LABEL_KEY)
    const placeholder = fileMenu?.submenu?.find((item) => item.id === menuId)
    if (!placeholder) {
        return
    }
    placeholder.submenu =
        entries.length > 0 ? entries : [{ labelKey: 'menu.file.recentEmpty', enabled: false }]
}

/**
 * 刷新「最近文件 / 最近文件夹」子菜单（主进程经 window.api.file.recentList() 读取）。
 * 失败静默：保留上次已注入的数据（首次失败保持空占位），不影响菜单打开。
 */
async function refreshRecentMenus(): Promise<void> {
    // 防御：测试桩/旧 preload 可能未暴露 file 组；缺失时静默跳过
    const recentListApi = window.api?.file?.recentList
    if (typeof recentListApi !== 'function') {
        return
    }
    try {
        const result = await recentListApi()
        const files = Array.isArray(result?.files)
            ? result.files
                  .filter((item): item is string => typeof item === 'string')
                  .slice(0, RECENT_MENU_LIMIT)
            : []
        const folders = Array.isArray(result?.folders)
            ? result.folders
                  .filter((item): item is string => typeof item === 'string')
                  .slice(0, RECENT_MENU_LIMIT)
            : []
        injectRecentEntries(RECENT_FILES_MENU_ID, files.map(toRecentFileEntry))
        injectRecentEntries(RECENT_FOLDERS_MENU_ID, folders.map(toRecentFolderEntry))
    } catch (error) {
        logger.warn('[MenuBar] 刷新最近文件/最近文件夹菜单失败（保留上次数据）:', error)
    }
}

/** 打开的菜单是「文件」时刷新最近列表（点击/悬停切换均触发） */
function refreshRecentMenusIfFileMenu(index: number): void {
    if (menuData.value[index]?.labelKey === FILE_MENU_LABEL_KEY) {
        void refreshRecentMenus()
    }
}

// 第 4 批 4.2（M4：主题单真源）：菜单栏**没有**主题选中态/主题名渲染需求，收敛前这里
// 独立 `window.api.config.read('theme')` 读盘 + 独立监听 THEME_UPDATED，把主题名写入一个
// 无任何消费方的 `currentTheme` ref（死状态 + 重复读盘 + 重复订阅）。现全部删除——主题
// 状态与广播订阅统一由 `composables/useTheme` 单例负责，本组件仅通过 CSS 变量消费主题。
// 2026-11-18（遗留清单 #2）原注释中「菜单主题选中态不刷新」的问题随死状态删除不再存在。

const activeMenu = ref<number | null>(null)
const submenuPosition = ref({ x: 0, y: 0 })
const closeTimer = ref<number | null>(null)
const isSubmenuHovered = ref(false)

// 计算子菜单位置，确保不超出屏幕
function calculateSubmenuPosition(x: number, y: number) {
    const screenWidth = window.innerWidth
    // const screenHeight = window.innerHeight
    const menuWidth = 220
    const padding = 8

    let posX = x
    let posY = y

    // 水平方向：如果超出右侧，向左调整
    if (x + menuWidth + padding > screenWidth) {
        posX = screenWidth - menuWidth - padding
    }

    // 确保不超出顶部
    if (posY < padding) {
        posY = padding
    }

    // 确保不超出左侧
    if (posX < padding) {
        posX = padding
    }

    return { x: posX, y: posY }
}

// 子菜单项组件（递归）
const BaiZeSubMenuItem = defineComponent({
    name: 'BaiZeSubMenuItem',
    props: {
        items: {
            type: Array as () => BaiZeMenuEntry[],
            required: true
        },
        level: {
            type: Number,
            default: 0
        }
    },
    emits: ['close'],
    setup(props, { emit }) {
        const activeSubmenu = ref<number | null>(null)

        const handleItemClick = (item: BaiZeMenuEntry) => {
            if (item.menuAction && !item.submenu) {
                HandleMenuAction(item.menuAction)
                emit('close')
            }
        }

        const handleItemEnter = (index: number, item: BaiZeMenuEntry) => {
            if (item.submenu) {
                activeSubmenu.value = index
            } else {
                activeSubmenu.value = null
            }
        }

        return () => {
            const children: VNode[] = []

            props.items.forEach((item: BaiZeMenuEntry, index: number) => {
                if (item.type === 'separator') {
                    children.push(h('div', { class: 'menu-separator', key: `sep-${index}` }))
                    return
                }

                const hasSubmenu = item.submenu && item.submenu.length > 0
                const isActive = activeSubmenu.value === index

                const itemChildren = [
                    h(
                        'span',
                        { class: 'menu-item-label' },
                        item.labelKey ? t(item.labelKey) : item.label
                    ),
                    item.accelerator
                        ? h('span', { class: 'menu-item-accelerator' }, item.accelerator)
                        : null,
                    hasSubmenu ? h('span', { class: 'menu-item-arrow' }, '▶') : null
                ]

                const itemElement = h(
                    'div',
                    {
                        class: [
                            'menu-submenu-item',
                            {
                                disabled: item.enabled === false,
                                'has-submenu': hasSubmenu,
                                active: isActive
                            }
                        ],
                        key: index,
                        onClick: (e: Event) => {
                            e.stopPropagation()
                            handleItemClick(item)
                        },
                        onMouseenter: () => handleItemEnter(index, item)
                    },
                    itemChildren
                )

                if (hasSubmenu && isActive) {
                    const nestedSubmenu = h('div', { class: 'nested-submenu' }, [
                        h(BaiZeSubMenuItem, {
                            items: item.submenu || [],
                            level: props.level + 1,
                            onClose: () => emit('close')
                        })
                    ])
                    children.push(
                        h('div', { class: 'submenu-item-wrapper', key: `wrapper-${index}` }, [
                            itemElement,
                            nestedSubmenu
                        ])
                    )
                } else {
                    children.push(itemElement)
                }
            })

            return h('div', { class: 'submenu-list' }, children)
        }
    }
})

const submenuStyle = computed(() => ({
    left: `${submenuPosition.value.x}px`,
    top: `${submenuPosition.value.y}px`
}))

function toggleMenu(index: number) {
    if (activeMenu.value === index) {
        closeMenu()
    } else {
        // 「文件」菜单：打开时异步刷新最近文件/最近文件夹子菜单（失败静默，不阻塞打开）
        refreshRecentMenusIfFileMenu(index)
        activeMenu.value = index
        nextTick(() => {
            updateSubmenuPosition(index)
        })
    }
}

function handleMenuEnter(index: number) {
    // 清除关闭定时器
    if (closeTimer.value) {
        clearTimeout(closeTimer.value)
        closeTimer.value = null
    }

    if (activeMenu.value !== null && activeMenu.value !== index) {
        // 已打开菜单间悬停切换时同样刷新（最近列表可能在两次打开之间发生变化）
        refreshRecentMenusIfFileMenu(index)
        activeMenu.value = index
        nextTick(() => {
            updateSubmenuPosition(index)
        })
    }
}

function handleMenuBarLeave() {
    // 如果子菜单打开，延迟关闭
    if (activeMenu.value !== null && !isSubmenuHovered.value) {
        closeTimer.value = window.setTimeout(() => {
            if (!isSubmenuHovered.value) {
                closeMenu()
            }
        }, 100)
    }
}

function handleSubmenuEnter() {
    // 鼠标进入子菜单，取消关闭
    isSubmenuHovered.value = true
    if (closeTimer.value) {
        clearTimeout(closeTimer.value)
        closeTimer.value = null
    }
}

function handleSubmenuLeave() {
    // 鼠标离开子菜单，延迟关闭
    isSubmenuHovered.value = false
    closeTimer.value = window.setTimeout(() => {
        if (!isSubmenuHovered.value) {
            closeMenu()
        }
    }, 100)
}

function updateSubmenuPosition(index: number) {
    const menuBar = document.querySelector('.menu-bar')
    if (!menuBar) return

    const BaiZeMenuItems = menuBar.querySelectorAll('.menu-item')
    if (BaiZeMenuItems[index]) {
        const rect = BaiZeMenuItems[index].getBoundingClientRect()
        const position = calculateSubmenuPosition(rect.left, rect.bottom)
        submenuPosition.value = position
    }
}

function closeMenu() {
    activeMenu.value = null
    isSubmenuHovered.value = false
    if (closeTimer.value) {
        clearTimeout(closeTimer.value)
        closeTimer.value = null
    }
}

// 点击外部关闭菜单
function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('.menu-bar') && !target.closest('.submenu-container')) {
        closeMenu()
    }
}

function handleResize() {
    if (activeMenu.value !== null) {
        updateSubmenuPosition(activeMenu.value)
    }
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
    window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
    document.removeEventListener('click', handleClickOutside)
    if (closeTimer.value) {
        clearTimeout(closeTimer.value)
    }
    window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.menu-bar {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 4px;
    user-select: none;
    background-color: var(--theme-background-color, #fff);
}

.menu-item {
    position: relative;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: 6px;
}

.menu-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
    opacity: 0.9;
    transition: opacity 0.2s;
}

.menu-item:hover .menu-icon {
    opacity: 1;
}

.menu-item:hover {
    background-color: var(--theme-hover-background, rgba(0, 0, 0, 0.06));
}

.menu-item.active {
    background-color: var(--theme-active-background, rgba(0, 0, 0, 0.1));
}

.menu-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--theme-text-color, #333);
    letter-spacing: 0.02em;
}

/* 子菜单动画 */
.submenu-fade-enter-active,
.submenu-fade-leave-active {
    transition:
        opacity 0.15s ease,
        transform 0.15s ease;
}

.submenu-fade-enter-from {
    opacity: 0;
    transform: translateY(-4px);
}

.submenu-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}
</style>

<style>
/* 全局样式，用于teleport的子菜单 */
.submenu-container {
    position: fixed;
    z-index: 10000;
    pointer-events: auto;
}

.submenu-list {
    min-width: 220px;
    max-width: 400px;
    background-color: var(--theme-card-background, #fff);
    border: 1px solid var(--theme-border-color, #e0e0e0);
    border-radius: 4px;
    box-shadow:
        0 8px 24px rgba(0, 0, 0, 0.15),
        0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 2px 0;
    backdrop-filter: blur(8px);
}

.menu-submenu-item {
    display: flex; /* 使用 Flex 布局，便于内部内容水平排列和垂直居中 */
    align-items: center; /* 垂直居中子元素（如文字、图标） */
    padding: 6px 16px; /* 上下内边距 4px，左右 16px，增加可点击区域 */
    cursor: pointer; /* 鼠标悬浮时显示手型，提示可点击 */
    position: relative; /* 相对定位，为伪元素（如 hover 下划线、涟漪效果）提供参考 */
    transition: all 0.15s ease; /* 所有属性变化在 0.15 秒内缓动过渡，增强交互反馈 */
    margin: 0; /* 左右外边距 1px，避免项之间紧贴，但可能引起布局偏移 */
    border-radius: 4px; /* 圆角 4px，常见于现代 UI 设计 */
    white-space: nowrap; /* 文本不换行，适合水平菜单或下拉菜单项 */
}

.menu-submenu-item:hover:not(.disabled) {
    background-color: var(--theme-hover-background, rgba(0, 0, 0, 0.06));
}

.menu-submenu-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.menu-submenu-item.active {
    background-color: var(--theme-active-background, rgba(0, 0, 0, 0.08));
}

.menu-item-label {
    flex: 1;
    font-size: 14px;
    color: var(--theme-text-color, #333);
}

.menu-item-accelerator {
    font-size: 12px;
    color: var(--theme-secondary-text-color, #888);
    margin-left: 32px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    flex-shrink: 0;
}

.menu-item-arrow {
    font-size: 8px;
    color: var(--theme-secondary-text-color, #888);
    margin-left: 12px;
    transition: transform 0.2s ease;
    flex-shrink: 0;
}

.menu-submenu-item:hover .menu-item-arrow {
    transform: translateX(2px);
}

.menu-separator {
    height: 1px;
    background-color: var(--theme-border-color, #e0e0e0);
    margin: 6px 12px;
}

.submenu-item-wrapper {
    position: relative;
}

.nested-submenu {
    position: absolute;
    left: 100%;
    top: -6px;
    margin-left: -4px;
    animation: slideIn 0.15s ease;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(-8px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

/* 深色主题适配 */
@media (prefers-color-scheme: dark) {
    .submenu-list {
        box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.4),
            0 2px 8px rgba(0, 0, 0, 0.3);
    }
}
</style>
