/**
 * 菜单栏键盘导航纯函数（视觉升级 P1-B2 / T7）
 *
 * ## 为什么单独抽层
 * 菜单栏的键盘可达（`role=menubar/menu/menuitem`、方向键/Home/End 移动、Enter 打开、
 * Esc 关闭）本质是「在一组菜单项里按规则找下一个可聚焦索引」，与 DOM/组件实例无关。
 * 把它收敛为纯函数后：
 * - `MenuBar.vue` / `MenuSubmenu.vue` 只做事件接线与焦点落点，不再各自实现一套索引计算；
 * - 单测可脱离 jsdom 直接覆盖边界（首尾回绕、全禁用、分隔符跳过），避免仅靠组件用例；
 * - 后续若菜单数据模型扩展（新禁用形态等），只需改这里一处。
 *
 * ## 可聚焦判定（与视觉升级方案 §4.1 / COMPONENTS.md §2 一致）
 * - `type === 'separator'` 的分隔符不参与导航（`role=separator`，不可聚焦）；
 * - `enabled === false` 的禁用项不参与导航（`aria-disabled`，键盘跳过）；
 * - 其余项均可聚焦；有非空 `submenu` 的项按「展开组」处理。
 */

import type { BaiZeMenuEntry } from './menu-config'

/** 方向键方向：next = 向下/向右，previous = 向上/向左 */
export type MenuNavigationDirection = 'next' | 'previous'

/** 顶层菜单栏横向移动用的方向（与子菜单纵向导航解耦） */
export type MenubarHorizontalDirection = -1 | 1

/** 是否为分隔符项（不参与键盘导航与 role=menuitem） */
export function isMenuSeparator(item: BaiZeMenuEntry): boolean {
    return item.type === 'separator'
}

/** 是否禁用（aria-disabled，键盘跳过、点击不触发动作） */
export function isMenuDisabled(item: BaiZeMenuEntry): boolean {
    return item.enabled === false
}

/** 是否可被键盘聚焦（跳过分隔符与禁用项） */
export function isMenuNavigable(item: BaiZeMenuEntry): boolean {
    return !isMenuSeparator(item) && !isMenuDisabled(item)
}

/** 是否为「可展开组」：存在非空 submenu（空数组按叶子处理，与既有渲染语义一致） */
export function hasMenuSubmenu(item: BaiZeMenuEntry): boolean {
    return Array.isArray(item.submenu) && item.submenu.length > 0
}

/**
 * 从 `startIndex` 起按方向寻找下一个可导航项（循环回绕）。
 *
 * @param items 当前层级的菜单项
 * @param startIndex 起始索引（-1 表示「从边界之外进入」：next 从头找、previous 从尾找）
 * @param direction 方向
 * @returns 可导航项索引；整层无可用项时返回 -1
 */
export function findNavigableIndex(
    items: readonly BaiZeMenuEntry[],
    startIndex: number,
    direction: MenuNavigationDirection
): number {
    const total = items.length
    if (total === 0) {
        return -1
    }
    const step = direction === 'next' ? 1 : -1
    // 起始索引为 -1（无焦点）时：向下从末尾之外进入（→ 首项 / 最后一个可选项），
    // 向上从首项之外进入（→ 末项），保证「无焦点时按方向键」总能落到合理位置。
    let cursor = startIndex
    if (startIndex < 0) {
        cursor = direction === 'next' ? total - 1 : total
    }
    // 从起始项开始按步长遍历一圈（含起始项本身，保证只有一个可选项时仍能落点）
    for (let offset = 0; offset < total; offset += 1) {
        cursor = (cursor + step + total) % total
        if (isMenuNavigable(items[cursor])) {
            return cursor
        }
    }
    return -1
}

/** 首个可导航项索引（Home）；无可用项返回 -1 */
export function findFirstNavigableIndex(items: readonly BaiZeMenuEntry[]): number {
    for (let index = 0; index < items.length; index += 1) {
        if (isMenuNavigable(items[index])) {
            return index
        }
    }
    return -1
}

/** 末个可导航项索引（End）；无可用项返回 -1 */
export function findLastNavigableIndex(items: readonly BaiZeMenuEntry[]): number {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (isMenuNavigable(items[index])) {
            return index
        }
    }
    return -1
}

/**
 * 顶层菜单栏横向移动（ArrowLeft/ArrowRight）的索引计算：循环回绕。
 * 顶层菜单固定 12 项且全部可聚焦（菜单数据无禁用顶层项），因此不涉及跳过逻辑。
 */
export function moveMenubarIndex(
    currentIndex: number,
    direction: MenubarHorizontalDirection,
    total: number
): number {
    if (total <= 0) {
        return -1
    }
    const safeCurrent = currentIndex >= 0 && currentIndex < total ? currentIndex : 0
    return (safeCurrent + direction + total) % total
}

/** 顶层菜单栏键盘动作（组件按动作做焦点/展开处理，避免在模板里堆 switch） */
export type MenubarKeyAction = 'previous' | 'next' | 'first' | 'last' | 'open' | 'close'

/**
 * 把顶层菜单栏的按键翻译为语义动作。
 *
 * - ArrowLeft / ArrowRight：同级横向移动（打开状态下会切换展开的菜单）；
 * - Home / End：跳转首/末顶层菜单；
 * - ArrowDown / Enter / Space：打开当前菜单并把焦点移入第一项；
 * - Escape：关闭已展开菜单（未展开时返回 null，不消费事件）。
 */
export function resolveMenubarKeyAction(
    key: string,
    hasOpenMenu: boolean
): MenubarKeyAction | null {
    switch (key) {
        case 'ArrowLeft':
            return 'previous'
        case 'ArrowRight':
            return 'next'
        case 'Home':
            return 'first'
        case 'End':
            return 'last'
        case 'ArrowDown':
        case 'Enter':
        case ' ':
        case 'Spacebar':
            return 'open'
        case 'Escape':
            return hasOpenMenu ? 'close' : null
        default:
            return null
    }
}

/**
 * 子菜单层按键分类（组件据此选择处理分支）。
 *
 * 返回 null 表示不消费（交给浏览器默认行为/其他全局快捷键）。
 */
export type SubmenuKeyAction =
    | 'previous'
    | 'next'
    | 'first'
    | 'last'
    | 'activate'
    | 'open-submenu'
    | 'back'
    | 'switch-previous'
    | 'switch-next'
    | 'close'
    | 'tab'

/**
 * 把子菜单层按键翻译为语义动作。
 *
 * @param key 键盘事件 key
 * @param level 当前子菜单层级（0 = 顶层菜单下拉）
 * @param focusedItem 当前焦点项（无焦点项时传 undefined）
 */
export function resolveSubmenuKeyAction(
    key: string,
    level: number,
    focusedItem?: BaiZeMenuEntry
): SubmenuKeyAction | null {
    switch (key) {
        case 'ArrowDown':
            return 'next'
        case 'ArrowUp':
            return 'previous'
        case 'Home':
            return 'first'
        case 'End':
            return 'last'
        case 'Enter':
        case ' ':
        case 'Spacebar':
            return 'activate'
        case 'ArrowRight':
            if (focusedItem && hasMenuSubmenu(focusedItem)) {
                return 'open-submenu'
            }
            // 顶层菜单下拉里，叶子项右方向键切到下一个顶层菜单（与桌面菜单习惯一致）
            return level === 0 ? 'switch-next' : null
        case 'ArrowLeft':
            return level > 0 ? 'back' : 'switch-previous'
        case 'Escape':
            return 'close'
        case 'Tab':
            return 'tab'
        default:
            return null
    }
}

/**
 * Alt 键激活菜单栏的事件判定（Windows 惯例，1.5.5 遗留项补齐）。
 *
 * ## 为什么是「纯判定 + 组件接线」
 * 「单独按 Alt 激活菜单栏」属于按键识别，不涉及焦点落点；与上面的按键映射一样抽成
 * 纯函数后，组件只负责「激活/退出」的状态与焦点，键位边界（组合键、输入法组字、
 * 自动重复）可在单测里直接覆盖，不必为每个边界写一遍组件用例。
 *
 * ## 只认「单独 Alt」
 * - `key` 必须是 `Alt`：Alt+F4 / Alt+Tab / Alt+字母的字母键事件一律不消费；
 * - 带 Ctrl/Meta/Shift 修饰时不是「单独 Alt」：AltGr（Windows 上表现为 Ctrl+Alt）、
 *   `Ctrl+Alt+P` 等既有组合键原样放行；
 * - 输入法组字期（`isComposing` / keyCode 229）不响应；
 * - 按住 Alt 的自动重复（`repeat`）不重复切换，避免激活态被按住时序闪断。
 */
export interface MenuAltKeyEvent {
    /** KeyboardEvent.key */
    key: string
    /** 是否按住 Ctrl（AltGr 在 Windows 上同时带 Ctrl+Alt） */
    ctrlKey?: boolean
    /** 是否按住 Meta（macOS Cmd） */
    metaKey?: boolean
    /** 是否按住 Shift */
    shiftKey?: boolean
    /** 按住不放产生的自动重复事件 */
    repeat?: boolean
    /** 输入法组字中 */
    isComposing?: boolean
    /** 旧内核/Chrome 在组字期给出的 229 标记 */
    keyCode?: number
}

/**
 * 是否为「单独按下 Alt」——菜单栏据此在全局 keydown 中激活/退出激活。
 *
 * 返回 true 时组件才会 `preventDefault`；返回 false 表示不消费（系统组合键、
 * 其它修饰组合或输入法按键原样放行）。
 */
export function isMenuActivationAltKey(event: MenuAltKeyEvent): boolean {
    if (event.key !== 'Alt') {
        return false
    }
    if (event.ctrlKey === true || event.metaKey === true || event.shiftKey === true) {
        return false
    }
    if (event.repeat === true) {
        return false
    }
    if (event.isComposing === true || event.keyCode === 229) {
        return false
    }
    return true
}
