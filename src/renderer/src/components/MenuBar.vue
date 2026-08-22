<template>
    <div class="menu-bar" @mouseleave="handleMenuBarLeave">
        <div
            v-for="(menu, index) in menuMap"
            :key="index"
            class="menu-item"
            :class="{ active: activeMenu === index }"
            @click="toggleMenu(index)"
            @mouseenter="handleMenuEnter(index)"
        >
            <span class="menu-label">{{ menu.label }}</span>
        </div>

        <!-- 子菜单容器 -->
        <teleport to="body">
            <transition name="submenu-fade">
                <div
                    v-if="activeMenu !== null && menuMap[activeMenu].submenu"
                    class="submenu-container"
                    :style="submenuStyle"
                    @mouseleave="handleSubmenuLeave"
                    @mouseenter="handleSubmenuEnter"
                >
                    <BaiZeSubMenuItem
                        :items="menuMap[activeMenu].submenu || []"
                        :level="0"
                        @close="closeMenu"
                    />
                </div>
            </transition>
        </teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { menuMap } from './MenuBar/menu_config'
import {HandleMenuAction} from './MenuBar/menu_actions';
import {BaiZeMenuItem} from '../../../main/global-types';


// 获取当前主题
const currentTheme = ref('baize')

// 加载当前主题
async function loadCurrentTheme() {
    try {
        const themeConfig = await window.api.config.read('theme')
        if (themeConfig && themeConfig.currentTheme) {
            currentTheme.value = themeConfig.currentTheme
        }
    } catch (error) {
        console.error('Failed to load theme:', error)
    }
}

const handleThemeUpdated = (_: any, theme: { currentTheme?: string }) => {
    if (theme && theme.currentTheme) {
        currentTheme.value = theme.currentTheme
    }
}

// 监听主题变化
onMounted(() => {
    loadCurrentTheme()
    window.electron.ipcRenderer.on('baize-notes:theme-updated', handleThemeUpdated)
})

onBeforeUnmount(() => {
    window.electron.ipcRenderer.removeListener('baize-notes:theme-updated', handleThemeUpdated)
})


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
            type: Array as () => BaiZeMenuItem[],
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

        const handleItemClick = (item: BaiZeMenuItem) => {
            if (item.menu_action && !item.submenu) {
              HandleMenuAction(item.menu_action)
              emit('close')
            }
        }

        const handleItemEnter = (index: number, item: BaiZeMenuItem) => {
            if (item.submenu) {
                activeSubmenu.value = index
            } else {
                activeSubmenu.value = null
            }
        }

        return () => {
            const children: any[] = []

            props.items.forEach((item: BaiZeMenuItem, index: number) => {
                if (item.type === 'separator') {
                    children.push(h('div', { class: 'menu-separator', key: `sep-${index}` }))
                    return
                }

                const hasSubmenu = item.submenu && item.submenu.length > 0
                const isActive = activeSubmenu.value === index

                const itemChildren = [
                    h('span', { class: 'menu-item-label' }, item.label),
                    item.accelerator
                        ? h('span', { class: 'menu-item-accelerator' }, item.accelerator)
                        : null,
                    hasSubmenu
                        ? h('span', { class: 'menu-item-arrow' }, '▶')
                        : null
                ]

                const itemElement = h('div', {
                    class: ['menu-submenu-item', {
                        'disabled': item.enabled === false,
                        'has-submenu': hasSubmenu,
                        'active': isActive
                    }],
                    key: index,
                    onClick: (e: Event) => {
                        e.stopPropagation()
                        handleItemClick(item)
                    },
                    onMouseenter: () => handleItemEnter(index, item)
                }, itemChildren)

                if (hasSubmenu && isActive) {
                    const nestedSubmenu = h('div', { class: 'nested-submenu' }, [
                        h(BaiZeSubMenuItem, {
                            items: item.submenu || [],
                            level: props.level + 1,
                            onClose: () => emit('close')
                        })
                    ])
                    children.push(h('div', { class: 'submenu-item-wrapper', key: `wrapper-${index}` }, [
                        itemElement,
                        nestedSubmenu
                    ]))
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
    transition: opacity 0.15s ease, transform 0.15s ease;
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
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 2px 0;
    backdrop-filter: blur(8px);
}

.menu-submenu-item {
    display: flex;          /* 使用 Flex 布局，便于内部内容水平排列和垂直居中 */
    align-items: center;    /* 垂直居中子元素（如文字、图标） */
    padding: 6px 16px;      /* 上下内边距 4px，左右 16px，增加可点击区域 */
    cursor: pointer;        /* 鼠标悬浮时显示手型，提示可点击 */
    position: relative;     /* 相对定位，为伪元素（如 hover 下划线、涟漪效果）提供参考 */
    transition: all 0.15s ease; /* 所有属性变化在 0.15 秒内缓动过渡，增强交互反馈 */
    margin: 0;          /* 左右外边距 1px，避免项之间紧贴，但可能引起布局偏移 */
    border-radius: 4px;     /* 圆角 4px，常见于现代 UI 设计 */
    white-space: nowrap;    /* 文本不换行，适合水平菜单或下拉菜单项 */
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
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3);
    }
}
</style>
