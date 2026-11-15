/**
 * 菜单类型（ARC-13：主进程 / 渲染层唯一真源）
 *
 * 收敛前在 src/main/global-types.d.ts 与 src/shared/types/index.ts 重复定义；
 * 主进程侧零引用（主进程菜单 handler 树不使用该结构），渲染层
 * MenuBar.vue / MenuBar/menu-config.ts 实际使用 shared 版本，故以 shared 版本
 * 为准迁移到本文件，主进程重复定义删除。
 */
export interface BaiZeMenuItem {
    label?: string
    accelerator?: string
    menuAction?: string
    submenu?: BaiZeMenuItem[]
    type?: string
    enabled?: boolean
    usl?: string
}
