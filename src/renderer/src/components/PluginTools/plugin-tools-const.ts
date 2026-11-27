// PF-6（首屏 eager JS 10.36 MiB）：插件工具注册表从「静态 import 20 个工具组件」
// 改为「defineAsyncComponent + 动态 import」：
// 1. 每个工具（及其专属依赖，如加解密/Qrcode/Latex 相关库）拆为独立 chunk，不进入首屏主 chunk；
// 2. PluginTools.vue 仅渲染当前激活工具（`<component :is="visibleTool.component">`），
//    未点击过的工具不会请求模块，实现真正的按需加载；
// 3. 首次打开工具时显示 i18n 文案「加载中…」占位，避免点击菜单后无反馈；
// 4. 工具组件内部实现与外部调用方式（id/component 字段、work-area-width prop）保持不变。
//
// M3（结构优化收尾）：38 项工具的 id / i18n key / 组件模块路径不再在本文件与菜单数据里
// 重复维护，统一由 shared/constants/plugin-tools-manifest.ts 的 PLUGIN_TOOL_MENU 生成。
// 本文件只负责把 manifest 的 component 模块路径映射为 defineAsyncComponent 懒加载：
// 通过 import.meta.glob 做 Vite 静态分析，新增工具只需改 manifest 一处（组件文件放对目录），
// 仍保持每工具独立 chunk 的 PF-6 行为。
import { defineAsyncComponent, defineComponent, h, markRaw } from 'vue'
import type { Component } from 'vue'
import { t } from '../../common/i18n'
import {
    PLUGIN_TOOL_ITEMS,
    getPluginToolMenuAction
} from '../../../../shared/constants/plugin-tools-manifest'

/** PF-6：工具分块加载中的占位（轻量，无额外依赖） */
const ToolLoading = defineComponent({
    name: 'PluginToolLoading',
    setup() {
        return () =>
            h(
                'div',
                {
                    class: 'plugin-tool-async-loading',
                    style: 'display:flex;align-items:center;justify-content:center;width:100%;min-height:120px;padding:16px;color:var(--theme-secondary-text-color);font-size:14px;'
                },
                t('common.loading')
            )
    }
})

/** Vue SFC 动态导入模块形态（只有 default 导出） */
type VueModule = { default: Component }

/**
 * PF-6：把一个插件工具 SFC 转为按需加载的异步组件。
 * 首次渲染（即用户点击对应菜单）时才请求并加载该工具模块。
 */
function lazyTool(loader: () => Promise<VueModule>) {
    return defineAsyncComponent({
        loader,
        loadingComponent: ToolLoading,
        delay: 120,
        timeout: 30000,
        suspensible: false
    })
}

/**
 * 工具组件懒加载表（M3：组件模块路径 → 懒加载函数）：
 * - `./**\/*.vue` 覆盖 PluginTools 下全部工具页，排除 2 个非工具页——
 *   `./PluginTools.vue`（插件面板宿主壳）与 `./Codec/TextCodecTool.vue`（4 个编解码页共用的基件），
 *   避免它们被 glob 生成多余的动态 chunk；
 * - PDF 预览工具页在 HemyTools 目录，单独加入（其一并注册进 manifest 的 misc:pdf-preview）；
 * - 键统一为「相对 PluginTools 目录的模块路径」（去掉 glob 的 './' 前缀），与 manifest 的
 *   component 字段一一对应；键缺失时注册表模块加载即抛错（fail fast，测试同时守护）。
 */
const toolModuleLoaders = new Map<string, () => Promise<VueModule>>(
    Object.entries({
        ...import.meta.glob<{ default: Component }>([
            './**/*.vue',
            '!./PluginTools.vue',
            '!./Codec/TextCodecTool.vue'
        ]),
        ...import.meta.glob<{ default: Component }>('../HemyTools/ShowPdfEditor.vue')
    }).map(([modulePath, loader]): [string, () => Promise<VueModule>] => [
        modulePath.replace(/^\.\//, ''),
        loader
    ])
)

/** 懒加载表覆盖的模块路径（一致性测试锁死：应与 manifest 的 component 集合完全一致） */
export const pluginToolModuleKeys: readonly string[] = [...toolModuleLoaders.keys()]

/** 取 manifest 条目对应的懒加载器（缺失说明 manifest 登记了不存在的组件文件） */
function requireToolModuleLoader(component: string): () => Promise<VueModule> {
    const loader = toolModuleLoaders.get(component)
    if (!loader) {
        throw new Error(
            `[plugin-tools] manifest 登记的工具组件未找到：${component}（请检查文件位置与 manifest 的 component 字段）`
        )
    }
    return loader
}

/**
 * 38 项插件工具注册表：id/顺序来自 manifest（PLUGIN_TOOL_ITEMS），
 * component 为按需加载的异步组件（每工具独立 chunk，PF-6 行为保持不变）。
 */
export const pluginTools = markRaw(
    PLUGIN_TOOL_ITEMS.map((item) => ({
        id: getPluginToolMenuAction(item.id),
        component: lazyTool(requireToolModuleLoader(item.component))
    }))
)

// CMP-19/CMP-27：HemyTools（工具面板）故意不注册为插件工具（沿用第一轮 A-4 模式，不展示入口）：
// 其模板仅一个"返回编辑器"按钮，属未完成空壳——补齐功能后再登记到 manifest。
// 容器开关由 WorkSpace.vue 的事件控制，manifest 与 menu-config.ts 均不为其生成菜单入口。
// （注：PDF 预览已于 2026-11-18 改为 pdf.js 方案并恢复注册，见 manifest 的 misc:pdf-preview。）
