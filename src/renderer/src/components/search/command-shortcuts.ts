/**
 * 命令面板快捷键 chip 数据（视觉升级 P1-B2 / T10）
 *
 * ## 数据来源（单一真源，不复制键位）
 * 键位标注的真源是菜单树 `MenuBar/menu-config.ts` 的 `accelerator` 字段（MENU-10：
 * 只有真实存在键位绑定的动作才标注 accelerator）。本模块把「命令 → 菜单动作 → 键位」
 * 的映射收敛为纯函数，命令面板只负责展示 chip，不新增第二份键位表；菜单树调整键位后
 * 命令面板自动跟随。
 *
 * ## 为什么需要 COMMAND_MENU_ACTION_BINDINGS
 * 命令面板有一部分命令是「面板自身动作」（如打开 Quick Open / 工作区搜索），它们只登记
 * `run()` 而没有 `menuAction`；这些动作在菜单树里有等价入口与键位标注，用一张显式的
 * id → menuAction 映射表接线，避免在命令注册表里复制 accelerator 字面量。
 */

import { menuMap } from '../MenuBar/menu-config'
import type { BaiZeMenuEntry } from '../MenuBar/menu-config'
import type { PaletteCommand } from './command-registry'

/**
 * 无 menuAction 的命令自身动作 → 菜单树等价动作（键位唯一真源仍在菜单树）。
 *
 * 与 `command-registry.ts` 的 `run()` 命令一一对应（新增此类命令时同步本表；
 * 未登记的命令只是没有 chip，不影响执行与键盘导航）。
 */
export const COMMAND_MENU_ACTION_BINDINGS: Readonly<Record<string, string>> = {
    'workspace-search': 'baize:menu:edit:workspace-search',
    'command-palette': 'baize:menu:edit:command-palette',
    'quick-open': 'baize:menu:edit:quick-open'
}

/** CSS 快捷键修饰键 → aria-keyshortcuts 规范名称（WAI-ARIA `aria-keyshortcuts` 语法） */
const ARIA_MODIFIER_NAMES: Readonly<Record<string, string>> = {
    Ctrl: 'Control',
    Control: 'Control',
    Cmd: 'Meta',
    Command: 'Meta',
    Meta: 'Meta',
    Win: 'Meta',
    Alt: 'Alt',
    Option: 'Alt',
    Shift: 'Shift'
}

/**
 * 递归收集菜单树里「动作 id → 快捷键标注」映射。
 *
 * 只收集同时具备 `menuAction` 与 `accelerator` 的叶子/组项；分隔符与纯展示项跳过。
 * 同一动作重复出现时保留先出现的标注（菜单树内动作 id 全局唯一，MENU-04）。
 */
export function collectMenuAccelerators(
    items: readonly BaiZeMenuEntry[],
    result: Map<string, string> = new Map<string, string>()
): Map<string, string> {
    for (const item of items) {
        if (item.menuAction && item.accelerator && !result.has(item.menuAction)) {
            result.set(item.menuAction, item.accelerator)
        }
        if (item.submenu && item.submenu.length > 0) {
            collectMenuAccelerators(item.submenu, result)
        }
    }
    return result
}

/**
 * 构建「命令 id → 快捷键标注」映射（供命令面板渲染 chip）。
 *
 * @param commands 当前注册的命令（可为过滤前的完整列表）
 * @param menuItems 菜单树（缺省取静态真源 menuMap.value；单测可注入最小样本）
 */
export function buildCommandAcceleratorMap(
    commands: readonly PaletteCommand[],
    menuItems: readonly BaiZeMenuEntry[] = menuMap.value
): Map<string, string> {
    const byAction = collectMenuAccelerators(menuItems)
    const result = new Map<string, string>()
    for (const command of commands) {
        const action = command.menuAction ?? COMMAND_MENU_ACTION_BINDINGS[command.id]
        const accelerator = action ? byAction.get(action) : undefined
        if (accelerator) {
            result.set(command.id, accelerator)
        }
    }
    return result
}

/**
 * 把界面展示用快捷键（如 `Ctrl+Shift+P`）转换为 `aria-keyshortcuts` 语法
 * （如 `Control+Shift+P`）。无法识别的片段原样保留（大小写按规范）。
 */
export function toAriaKeyshortcuts(accelerator: string): string {
    return accelerator
        .split('+')
        .map((token) => {
            const trimmed = token.trim()
            const modifier = ARIA_MODIFIER_NAMES[trimmed]
            if (modifier) {
                return modifier
            }
            // 单字母按键统一大写（aria-keyshortcuts 规范要求可打印字符区分大小写）
            return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed
        })
        .filter((token) => token.length > 0)
        .join('+')
}
