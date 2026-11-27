<template>
    <div
        ref="menuBarRef"
        class="menu-bar"
        role="menubar"
        aria-orientation="horizontal"
        :aria-label="menubarAriaLabel"
        @mouseleave="handleMenuBarLeave"
        @keydown="handleMenubarKeydown"
    >
        <!--
            顶层菜单项（视觉升级 P1-B2 / T7）：
            - 用 button 承载 role=menuitem（原生可聚焦、可被读屏识别），roving tabindex 保证
              Tab 进出菜单栏只占一个焦点位；
            - aria-haspopup/aria-expanded 表达下拉展开状态；菜单数据与动作分发机制不变
              （MENU-01~13：只消费 labelKey + menuAction，不在组件内解析动作）。
        -->
        <button
            v-for="(menu, index) in menuData"
            :key="index"
            type="button"
            class="menu-item"
            :class="{ active: activeMenu === index }"
            role="menuitem"
            :aria-haspopup="hasSubmenu(menu) ? 'true' : undefined"
            :aria-expanded="
                hasSubmenu(menu) ? (activeMenu === index ? 'true' : 'false') : undefined
            "
            :tabindex="focusedMenuIndex === index ? 0 : -1"
            :data-menu-index="index"
            @click="toggleMenu(index)"
            @mouseenter="handleMenuEnter(index)"
            @focus="handleMenuFocus(index)"
        >
            <span class="menu-label">{{ menu.labelKey ? t(menu.labelKey) : menu.label }}</span>
        </button>

        <!-- 子菜单容器（teleport 到 body：位置跟随菜单项，层级走 --ui-z-dropdown） -->
        <teleport to="body">
            <transition name="submenu-fade">
                <div
                    v-if="activeMenu !== null && menuData[activeMenu]?.submenu"
                    class="submenu-container"
                    :style="submenuStyle"
                    @mouseleave="handleSubmenuLeave"
                    @mouseenter="handleSubmenuEnter"
                >
                    <MenuSubmenu
                        :items="menuData[activeMenu].submenu || []"
                        :level="0"
                        :aria-label="activeMenuAriaLabel"
                        @activate="handleSubmenuActivate"
                        @close="handleSubmenuClose"
                        @tab="handleSubmenuTab"
                        @switch-menu="handleSubmenuSwitchMenu"
                    />
                </div>
            </transition>
        </teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { menuMap } from './MenuBar/menu-config'
import type { BaiZeMenuEntry } from './MenuBar/menu-config'
import MenuSubmenu from './MenuBar/MenuSubmenu.vue'
import { hasMenuSubmenu, moveMenubarIndex, resolveMenubarKeyAction } from './MenuBar/menu-keyboard'
import { resolveTopSubmenuPosition } from './MenuBar/menu-position'
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
        if (item.writingFlag && !flags[item.writingFlag]) {
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
    () => [flags.documentHistory, flags.markdownLint, flags.writingMode, flags.writingStyleCheck],
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
        // 最近列表注入会改变下拉面板的实测宽高（列表可达 20 项）：已展开时按新尺寸重新夹取定位，
        // 避免异步数据把面板顶出视口（滚动容器已按用户反馈移除，定位 clamp 是唯一兜底）。
        const openedIndex = activeMenu.value
        if (openedIndex !== null) {
            void nextTick(() => updateSubmenuPosition(openedIndex))
        }
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

/** 菜单栏根节点（键盘焦点查询范围，避免跨实例误命中） */
const menuBarRef = ref<HTMLElement | null>(null)
/** 当前展开的顶层菜单索引（null = 未展开） */
const activeMenu = ref<number | null>(null)
/** roving tabindex：菜单栏内只有一项 tabindex=0，方向键移动时同步更新 */
const focusedMenuIndex = ref(0)
const submenuPosition = ref({ x: 0, y: 0 })
const closeTimer = ref<number | null>(null)
const isSubmenuHovered = ref(false)

/**
 * 键盘激活防抖守卫（T7 键盘可达）：
 * 顶层按钮是原生 `<button>`，Enter/Space 在部分平台会由浏览器补发一次合成 click
 * （detail=0）。键盘 keydown 已经打开菜单，若再让该合成 click 进入 toggleMenu 会把
 * 刚打开的菜单立即关掉。故键盘打开时短暂抑制紧随其后的点击一次；真实鼠标点击
 * （detail≥1）不受影响。
 */
let suppressKeyboardActivationClick = false
let suppressKeyboardActivationTimer: ReturnType<typeof setTimeout> | null = null

/** 键盘打开菜单后抑制一次合成 click（300ms 内有效，覆盖按键保持时间） */
function suppressNextKeyboardActivationClick(): void {
    suppressKeyboardActivationClick = true
    if (suppressKeyboardActivationTimer !== null) {
        clearTimeout(suppressKeyboardActivationTimer)
    }
    suppressKeyboardActivationTimer = setTimeout(() => {
        suppressKeyboardActivationClick = false
        suppressKeyboardActivationTimer = null
    }, 300)
}

/** 消费一次键盘合成 click（真实鼠标点击返回 false，正常走 toggle 逻辑） */
function consumeKeyboardActivationClick(): boolean {
    if (!suppressKeyboardActivationClick) {
        return false
    }
    suppressKeyboardActivationClick = false
    if (suppressKeyboardActivationTimer !== null) {
        clearTimeout(suppressKeyboardActivationTimer)
        suppressKeyboardActivationTimer = null
    }
    return true
}

/** 菜单栏可访问名称（中英词典 menu.menubar.label） */
const menubarAriaLabel = computed(() => t('menu.menubar.label'))

/** 当前展开菜单的可访问名称（传给 role=menu 的下拉面板） */
const activeMenuAriaLabel = computed(() => {
    const index = activeMenu.value
    if (index === null) {
        return ''
    }
    const menu = menuData.value[index]
    if (!menu) {
        return ''
    }
    return menu.labelKey ? t(menu.labelKey) : (menu.label ?? '')
})

/** 顶级菜单项是否有非空下拉（空 submenu 按叶子渲染，与既有渲染语义一致） */
function hasSubmenu(menu: BaiZeMenuEntry): boolean {
    return hasMenuSubmenu(menu)
}

/**
 * 计算子菜单位置，确保不超出屏幕。
 *
 * 几何计算收敛到纯函数 `menu-position.ts`（jsdom 可单测），组件只负责取实测矩形：
 * - 顶级下拉宽度由内容决定（`.submenu-list` 220~400px），因此必须用**实测宽度**夹取，
 *   而不是固定 220——1.5.5 用户反馈中靠右的「AI 导航」等菜单越界被裁剪即由此导致；
 * - 实测高度用于纵向夹取（长菜单如「版本发布」18 项），替代已移除的滚动容器；
 * - jsdom 不排版（矩形为 0）时纯函数回落到最窄宽度，既有定位用例可复现。
 */
function calculateSubmenuPosition(
    x: number,
    y: number,
    submenuWidth?: number,
    submenuHeight?: number
) {
    return resolveTopSubmenuPosition({
        anchorX: x,
        anchorY: y,
        submenuWidth,
        submenuHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
    })
}

const submenuStyle = computed(() => ({
    left: `${submenuPosition.value.x}px`,
    top: `${submenuPosition.value.y}px`
}))

/** 聚焦顶层菜单项（索引取模回绕，保持 roving tabindex 同步） */
function focusTopLevel(index: number): void {
    const total = menuData.value.length
    if (total === 0) {
        return
    }
    const safeIndex = ((index % total) + total) % total
    focusedMenuIndex.value = safeIndex
    menuBarRef.value?.querySelector<HTMLElement>(`[data-menu-index="${safeIndex}"]`)?.focus()
}

/**
 * 打开指定顶层菜单。
 *
 * @param index 顶层菜单索引
 * @param keyboard 是否由键盘触发（true 时把焦点移入下拉第一项）
 */
function openMenuAt(index: number, keyboard: boolean): void {
    if (!menuData.value[index]) {
        return
    }
    // 「文件」菜单：打开时异步刷新最近文件/最近文件夹子菜单（失败静默，不阻塞打开）
    refreshRecentMenusIfFileMenu(index)
    activeMenu.value = index
    void nextTick(() => {
        updateSubmenuPosition(index)
        if (keyboard) {
            focusFirstSubmenuItem()
        }
    })
}

/** 键盘打开菜单时把焦点交给下拉第一项（跳过禁用占位项） */
function focusFirstSubmenuItem(): void {
    const rows = document.querySelectorAll<HTMLElement>(
        '.submenu-container > .submenu-list > .menu-submenu-item, ' +
            '.submenu-container > .submenu-list > .submenu-item-wrapper > .menu-submenu-item'
    )
    for (const row of rows) {
        if (!row.classList.contains('disabled')) {
            row.focus()
            return
        }
    }
}

/** 横向切换顶层菜单（焦点跟随；已展开时同步切换下拉内容） */
function switchTopLevelMenu(fromIndex: number, direction: -1 | 1): void {
    const nextIndex = moveMenubarIndex(fromIndex, direction, menuData.value.length)
    if (nextIndex < 0) {
        return
    }
    focusTopLevel(nextIndex)
    if (activeMenu.value !== null) {
        openMenuAt(nextIndex, true)
    }
}

/**
 * 菜单栏键盘事件（事件委托到根节点）：仅处理来自顶层菜单按钮的按键。
 * 下拉面板的键盘事件由 MenuSubmenu 处理——它 teleport 到 body，不在本节点事件流内。
 */
function handleMenubarKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    const itemElement = target?.closest<HTMLElement>('.menu-item') ?? null
    if (!itemElement || !menuBarRef.value?.contains(itemElement)) {
        return
    }
    // Tab 离开菜单栏时收起已展开的下拉（保持键盘用户的焦点与浮层状态一致；
    // 不 preventDefault —— 浏览器按 roving tabindex 正常把焦点移出菜单栏）
    if (event.key === 'Tab' && activeMenu.value !== null) {
        closeMenu()
        return
    }
    const index = Number(itemElement.dataset.menuIndex)
    if (Number.isNaN(index)) {
        return
    }
    const action = resolveMenubarKeyAction(event.key, activeMenu.value !== null)
    if (!action) {
        return
    }
    event.preventDefault()
    event.stopPropagation()

    switch (action) {
        case 'previous':
            switchTopLevelMenu(index, -1)
            return
        case 'next':
            switchTopLevelMenu(index, 1)
            return
        case 'first': {
            const nextIndex = 0
            focusTopLevel(nextIndex)
            if (activeMenu.value !== null) {
                openMenuAt(nextIndex, true)
            }
            return
        }
        case 'last': {
            const nextIndex = menuData.value.length - 1
            focusTopLevel(nextIndex)
            if (activeMenu.value !== null) {
                openMenuAt(nextIndex, true)
            }
            return
        }
        case 'open':
            // 键盘打开：抑制浏览器可能补发的合成 click，再把焦点移入下拉第一项
            suppressNextKeyboardActivationClick()
            openMenuAt(index, true)
            return
        case 'close': {
            closeMenu()
            focusTopLevel(index)
            return
        }
        default:
            return
    }
}

/** 顶层菜单项获得焦点：同步 roving tabindex（不切换展开状态，避免与点击语义冲突） */
function handleMenuFocus(index: number): void {
    focusedMenuIndex.value = index
}

function toggleMenu(index: number) {
    // 键盘 keydown 已处理打开时，忽略浏览器补发的合成 click（见 suppressNextKeyboardActivationClick）
    if (consumeKeyboardActivationClick()) {
        return
    }
    if (activeMenu.value === index) {
        closeMenu()
    } else {
        focusedMenuIndex.value = index
        // 点击打开：焦点留在按钮上（鼠标用户不强制移入下拉）
        openMenuAt(index, false)
    }
}

/** 键盘焦点当前是否落在下拉面板内（鼠标离开时不能因此关掉键盘正在操作的菜单） */
function isKeyboardFocusInSubmenu(): boolean {
    const active = document.activeElement
    return active instanceof HTMLElement && active.closest('.submenu-container') !== null
}

function handleMenuEnter(index: number) {
    // 清除关闭定时器
    if (closeTimer.value) {
        clearTimeout(closeTimer.value)
        closeTimer.value = null
    }

    if (activeMenu.value !== null && activeMenu.value !== index) {
        // 已打开菜单间悬停切换（最近列表可能在两次打开之间发生变化）。
        // 若切换前键盘焦点在下拉内，切换后把焦点交回新菜单第一项（不丢失键盘位置）。
        const focusWasInSubmenu = isKeyboardFocusInSubmenu()
        openMenuAt(index, false)
        if (focusWasInSubmenu) {
            void nextTick(() => focusFirstSubmenuItem())
        }
    }
}

function handleMenuBarLeave() {
    // 如果子菜单打开，延迟关闭（键盘焦点在下拉内时保持打开，避免鼠标划过误关）
    if (activeMenu.value !== null && !isSubmenuHovered.value) {
        closeTimer.value = window.setTimeout(() => {
            if (!isSubmenuHovered.value && !isKeyboardFocusInSubmenu()) {
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
    // 鼠标离开子菜单，延迟关闭（键盘焦点仍在下拉内时不关闭）
    isSubmenuHovered.value = false
    closeTimer.value = window.setTimeout(() => {
        if (!isSubmenuHovered.value && !isKeyboardFocusInSubmenu()) {
            closeMenu()
        }
    }, 100)
}

/** 关闭当前菜单并把键盘焦点归还对应顶层按钮（Esc / Tab / 动作执行后的统一落点） */
function closeMenuAndFocusTopLevel(): void {
    const index = activeMenu.value ?? focusedMenuIndex.value
    closeMenu()
    focusTopLevel(index)
}

/** 下拉内叶子动作已执行：关闭菜单并归还焦点 */
function handleSubmenuActivate(): void {
    closeMenuAndFocusTopLevel()
}

/** 下拉内按 Esc：关闭菜单并归还焦点 */
function handleSubmenuClose(): void {
    closeMenuAndFocusTopLevel()
}

/** 下拉内按 Tab：关闭菜单并归还焦点（不把焦点留在即将卸载的 teleport 节点） */
function handleSubmenuTab(): void {
    closeMenuAndFocusTopLevel()
}

/** 下拉内方向键横向切换顶层菜单 */
function handleSubmenuSwitchMenu(direction: -1 | 1): void {
    const index = activeMenu.value
    if (index === null) {
        return
    }
    switchTopLevelMenu(index, direction)
}

function updateSubmenuPosition(index: number) {
    const menuBar = menuBarRef.value ?? document.querySelector<HTMLElement>('.menu-bar')
    if (!menuBar) return

    const menuItems = menuBar.querySelectorAll<HTMLElement>('.menu-item')
    const item = menuItems[index]
    if (!item) return

    const rect = item.getBoundingClientRect()
    // 下拉面板可能尚未渲染/不可见：矩形为 0 时交由纯函数按最窄宽度兜底
    const container = document.querySelector<HTMLElement>('.submenu-container')
    const measured = container?.getBoundingClientRect()
    submenuPosition.value = calculateSubmenuPosition(
        rect.left,
        rect.bottom,
        measured?.width,
        measured?.height
    )
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
    if (suppressKeyboardActivationTimer !== null) {
        clearTimeout(suppressKeyboardActivationTimer)
        suppressKeyboardActivationTimer = null
    }
    window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
/* ============================ 菜单栏（外壳/工具区） ============================
 * 视觉升级 P1-B2 / T7 + 1.5.5 用户反馈修复：
 * - 颜色走 --ui-* 语义令牌，尺寸走密度令牌（--ui-row-height / --ui-pad /
 *   --ui-font-size），材质走风格令牌（--ui-surface / --ui-surface-opacity /
 *   --ui-border / --ui-radius-* / --ui-shadow-*）；
 * - 组件内不写 data-style / data-density 分支——四风格 × 三密度全部由根元素属性下的
 *   变量覆盖自动生效（DESIGN.md §6、UI-15）；
 * - 菜单栏属「外壳」而非悬浮层，按 DESIGN.md §3 不启用 backdrop-filter（玻璃模糊
 *   只允许用于悬浮层），glass 的差异由面不透明度 + 圆角/阴影体现。
 * ========================================================================== */
.menu-bar {
    display: flex;
    align-items: center;
    height: 100%;
    /* 壳高真源在宿主（控件高 + 4px）：border-box 保证新增的 1px 下边框
       不把组件撑出宿主 1px（base.css 的全局 border-box 规则处于注释状态）。 */
    box-sizing: border-box;
    padding: 0 4px;
    user-select: none;
    /* 面：--ui-surface × --ui-surface-opacity（glass 0.86 半透明；其余 1 = 不透明）。
       先给不支持 color-mix 的环境一个不透明兜底，再用变量驱动透明度。 */
    background-color: var(--ui-surface, var(--ui-bg));
    background-color: color-mix(
        in srgb,
        var(--ui-surface, var(--ui-bg)) calc(var(--ui-surface-opacity, 1) * 100%),
        transparent
    );
    /* 边框 / 圆角 / 阴影：四风格材质差异的来源（paper 弱阴影小圆角、glass 大圆角、
       workbench/hybrid 外壳紧凑圆角；hybrid 外壳与 workbench 同材质属规格口径）。 */
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, transparent);
    border-radius: 0 0 var(--ui-radius-lg, 6px) var(--ui-radius-lg, 6px);
    box-shadow: var(--ui-shadow-1);
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.menu-item {
    display: flex;
    align-items: center;
    gap: 4px;
    height: var(--ui-row-height, 28px);
    padding: 0 var(--ui-pad, 12px);
    border: none;
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    appearance: none;
    color: var(--ui-text);
    font-family: inherit;
    font-size: var(--ui-font-size, 13px);
    line-height: 1;
    cursor: default;
    /* 状态反馈统一走 120ms 标准缓动（视觉升级方案 §3.4） */
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

/* 悬停 / 展开态统一使用强调色软底 + 强调色文字（COMPONENTS.md §2） */
.menu-item:hover,
.menu-item.active {
    background-color: var(--ui-accent-soft);
    color: var(--ui-accent);
}

/* 键盘焦点必须可见（focus-ring 令牌；不依赖浏览器默认 outline） */
.menu-item:focus-visible {
    outline: none;
    background-color: var(--ui-accent-soft);
    color: var(--ui-accent);
    box-shadow: var(--ui-focus-shadow);
}

.menu-label {
    font-size: inherit;
    font-weight: 500;
    color: inherit;
    letter-spacing: 0.02em;
}

/* 子菜单定位容器（fixed 跟随菜单项；Teleport 到 body 后仍受本 scoped 样式约束） */
.submenu-container {
    position: fixed;
    /* 下拉层级走统一 z-index 令牌（替代旧值 10000） */
    z-index: var(--ui-z-dropdown, 40);
    pointer-events: auto;
}

/* 下拉弹出动效：180ms 淡入 + 4px 位移（视觉升级方案 §3.4） */
.submenu-fade-enter-active,
.submenu-fade-leave-active {
    transition:
        opacity var(--ui-duration-pop, 180ms) var(--ui-ease-standard, ease),
        transform var(--ui-duration-pop, 180ms) var(--ui-ease-standard, ease);
}

.submenu-fade-enter-from,
.submenu-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

/* 系统「减少动效」：仅保留极短淡入 */
@media (prefers-reduced-motion: reduce) {
    .submenu-fade-enter-active,
    .submenu-fade-leave-active {
        transition-duration: 100ms;
    }
}
</style>
