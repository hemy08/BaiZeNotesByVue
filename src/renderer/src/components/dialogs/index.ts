/* eslint-disable vue/one-component-per-file -- 本文件是「对话框聚合入口」：导出多个懒加载包装组件 + 一个共享加载占位组件，属聚合/工具模块而非单文件单组件 */
// 本文件是「对话框聚合入口」：导出多个懒加载包装组件 + 一个共享的加载占位组件，
// 属于聚合/工具模块而非单文件单组件，故关闭 one-component-per-file 规则。
//
// P2 死代码清理：本聚合导出仅保留 BaiZeNotes.vue 等活跃组件实际消费的对话框。
// 移除：BaiZeDialogs.vue（聚合器自身无消费者）、BaseDialog / DialogButton /
// TitleBar（仅被已删死组件或测试引用）、NewFileFolderDialog、MermaidRenderFrame
// （C-07 隐藏窗口链路）、OnlineWebPage、Versions。
// 结构优化第 2 批 2.1（H3）：原主进程 JSDOM 对话框迁移为 Vue 对话框，
// 新增 RenameFileFolderDialog / ConfirmDeleteDialog / ShortcutKeysDialog /
// UpdateLogDialog / ReleaseNotesDialog 的懒加载导出（重命名/删除为受控组件，
// 显隐与数据来自 useConfigStore.dialogs.*，由主进程 OPEN_VUE_DIALOG 驱动）。
//
// PF-6（首屏 eager JS 10.36 MiB）：本文件从「静态 import 全部对话框」改为
// 「按需动态 import + defineAsyncComponent」：
// 1. 打包器会把每个对话框（及其专属依赖）拆成独立 chunk，不再进入首屏主 chunk；
// 2. 外层包装组件只在 visible 第一次为 true 时才渲染异步子组件——对话框真正按需加载，
//    未打开过的对话框连模块都不会请求（首帧 JS 解析/编译量下降）；
// 3. 首次打开时显示 i18n 文案「加载中…」占位，避免点击后无反馈；
// 4. 打开过一次后组件保持挂载（与优化前"常驻对话框、状态可保留"的语义一致），
//    仅 visible 控制显隐，不改变各对话框内部实现。
import { defineAsyncComponent, defineComponent, h, ref, watch } from 'vue'
import type { Component } from 'vue'
import { t } from '../../common/i18n'

/** PF-6：对话框分块加载中的兜底占位（轻量，无额外依赖） */
const DialogLoading = defineComponent({
    name: 'DialogLoading',
    setup() {
        return () =>
            h(
                'div',
                {
                    class: 'dialog-async-loading',
                    style: 'display:flex;align-items:center;justify-content:center;padding:16px;color:var(--theme-secondary-text-color,#888);font-size:13px;'
                },
                t('common.loading')
            )
    }
})

/** Vue SFC 动态导入模块形态（只有 default 导出） */
type VueModule = { default: Component }

/**
 * PF-6：把一个对话框 SFC 转为「首次可见才加载」的懒加载组件。
 *
 * 包装组件只声明并透传 `visible`（其余 props 与事件经 $attrs 原样转发），
 * 因此各对话框的外部调用方式（props/事件名）完全不变；
 * `visible` 第一次变为 true 之前不渲染异步组件，模块也就不会被请求。
 */
function lazyDialog(loader: () => Promise<VueModule>) {
    const AsyncDialog = defineAsyncComponent({
        loader,
        loadingComponent: DialogLoading,
        // 首次打开时立即显示「加载中…」占位（本地磁盘分块通常 < 1 帧，占位几乎不可见）
        delay: 0,
        timeout: 30000,
        // 不使用 Suspense 语义：保持与传统同步组件一致的挂载/更新时序
        suspensible: false
    })

    return defineComponent({
        name: 'LazyDialog',
        inheritAttrs: false,
        props: {
            visible: {
                type: Boolean,
                default: false
            }
        },
        setup(props, { attrs, slots }) {
            // 打开过一次后保持挂载，避免每次打开都重建对话框内部状态（保持原常驻语义）
            const everOpened = ref(props.visible)
            watch(
                () => props.visible,
                (isVisible) => {
                    if (isVisible) {
                        everOpened.value = true
                    }
                }
            )
            return () => {
                if (!everOpened.value) {
                    return null
                }
                // P2 功能错误处理修复：透传父级插槽——MessageDialog 的 #footer-extra
                // （可重试错误的「重试」按钮）经本包装层传入，此前被丢弃导致按钮不渲染。
                return h(AsyncDialog, { ...attrs, visible: props.visible }, slots)
            }
        }
    })
}

export const CreateFileFolderDialog = lazyDialog(
    () => import('./simple/CreateFileFolderDialog.vue')
)
export const MessageDialog = lazyDialog(() => import('./simple/MessageDialog.vue'))
export const WebUrlDialog = lazyDialog(() => import('./simple/WebUrlDialog.vue'))
// 结构优化第 2 批 2.1（H3）：主进程 JSDOM/原生消息框迁移而来的 Vue 对话框。
// 重命名为受控组件：显隐与 path/isFile 由 useConfigStore.dialogs.* 驱动，
// 确认后由 BaiZeNotes.vue 统一 invoke 主进程动作通道。
export const RenameFileFolderDialog = lazyDialog(
    () => import('./simple/RenameFileFolderDialog.vue')
)
export const ConfirmDeleteDialog = lazyDialog(() => import('./simple/ConfirmDeleteDialog.vue'))

export const AdmonitionDialog = lazyDialog(() => import('./medium/AdmonitionDialog.vue'))
export const ImportOptionDialog = lazyDialog(() => import('./medium/ImportOptionDialog.vue'))
export const InsertImageDialog = lazyDialog(() => import('./medium/InsertImageDialog.vue'))
export const MathTextDialog = lazyDialog(() => import('./medium/MathTextDialog.vue'))

export const EditorSettingDialog = lazyDialog(() => import('./complex/EditorSettingDialog.vue'))
export const FontSelectDialog = lazyDialog(() => import('./complex/FontSelectDialog.vue'))
export const MaterialSyntaxDialog = lazyDialog(() => import('./complex/MaterialSyntaxDialog.vue'))
export const MermaidEditDialog = lazyDialog(() => import('./complex/MermaidEditDialog.vue'))
export const SystemSettingDialog = lazyDialog(() => import('./complex/SystemSettingDialog.vue'))
export const ThemeSettingDialog = lazyDialog(() => import('./complex/ThemeSettingDialog.vue'))

export const HelpAboutDialog = lazyDialog(() => import('./help/HelpAboutDialog.vue'))
export const HelpContactUsDialog = lazyDialog(() => import('./help/HelpContactUsDialog.vue'))
export const QuickLinkSettingDialog = lazyDialog(() => import('./help/QuickLinkSettingDialog.vue'))
export const TechStackDialog = lazyDialog(() => import('./help/TechStackDialog.vue'))
// 结构优化第 2 批 2.1（H3）：帮助类 JSDOM 对话框迁移为 Vue + BaseDialog。
export const ShortcutKeysDialog = lazyDialog(() => import('./help/ShortcutKeysDialog.vue'))
export const UpdateLogDialog = lazyDialog(() => import('./help/UpdateLogDialog.vue'))
export const ReleaseNotesDialog = lazyDialog(() => import('./help/ReleaseNotesDialog.vue'))
