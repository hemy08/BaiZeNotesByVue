<template>
    <div id="md-edit-tools-bar" class="md-edit-tools-bar">
        <!-- 结构优化第 2 批 2.2（H4）：工具栏（QuickAccess → hemy-editor 桶）改为二级懒加载，
             避免主界面壳 chunk 通过工具栏间接同步引入 Monaco。工具条为空时用等高骨架占位。 -->
        <MdEditTools :tool-bar-width="props.mdContainerWidth" />
    </div>
    <div id="md-edit-component" class="md-edit-component">
        <!-- 编辑器编排组件保持同步加载：它注册启动恢复/保存 flush 等关键 IPC 监听器，
             必须与主界面壳同批挂载（Monaco 与预览在其内部再按需加载）。 -->
        <MdEditComp :editor-preview-width="props.mdContainerWidth" />
    </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, defineComponent, h } from 'vue'
import MdEditComp from './MarkdownEditComponent.vue'

const props = defineProps({
    // 编辑器宽度
    mdContainerWidth: {
        type: String,
        default: '100%'
    }
})

// 结构优化第 2 批 2.2（H4）：编辑器工具栏按需加载。
// 改造前 MarkdownEditToolsComponent 静态导入 `hemy-editor` 聚合桶（→ Monaco），
// 使工具栏与整棵编辑器依赖进入主界面壳 chunk；改为异步组件后，工具栏独立成 chunk，
// 仅在其容器首次渲染时加载（进入主界面即需要，但发生在壳首帧之后）。
// 显式解包 default：避免不同打包/测试模块形态下 defineAsyncComponent 的模块解包差异。
const loadEditTools = () => import('./MarkdownEditToolsComponent.vue').then((mod) => mod.default)

/** 工具栏加载中的轻量骨架（不使用任何重型依赖，样式用主题变量） */
// eslint-disable-next-line vue/one-component-per-file -- 纯骨架占位组件，不值得拆独立 SFC/文件
const EditToolsSkeleton = defineComponent({
    name: 'EditToolsSkeleton',
    setup() {
        return () =>
            h('div', {
                class: 'md-edit-tools-skeleton',
                role: 'status',
                'aria-label': 'loading'
            })
    }
})

/** 工具栏加载失败的兜底占位（保持同高度，避免布局跳动） */
// eslint-disable-next-line vue/one-component-per-file -- 同上，纯错误占位组件
const EditToolsErrorPlaceholder = defineComponent({
    name: 'EditToolsErrorPlaceholder',
    setup() {
        return () => h('div', { class: 'md-edit-tools-skeleton is-error', role: 'alert' })
    }
})

const MdEditTools = defineAsyncComponent({
    loader: loadEditTools,
    loadingComponent: EditToolsSkeleton,
    errorComponent: EditToolsErrorPlaceholder,
    // 本地磁盘分块通常在一帧内就绪；立即显示骨架可避免工具条区域高度抖动
    delay: 0,
    timeout: 30000,
    // 不依赖 Suspense 边界，与服务层其它异步组件挂载语义一致
    suspensible: false
})
</script>

<style scoped>
#md-edit-tools-bar {
    width: 100%;
    height: auto;
    background-color: var(--theme-background-color, #f2f2f2);
    color: var(--theme-text-color, black);
    display: flex;
    flex-wrap: wrap;
}

#md-edit-component {
    height: calc(100vh - 40px - 2px - 20px);
    display: flex;
    flex: 1;
    width: 100%;
    flex-direction: row;
    position: relative;
}

/* 工具栏骨架：与按钮行同高（35px），使用次级背景色，避免首屏出现大片空白或布局跳动 */
.md-edit-tools-skeleton {
    width: 100%;
    height: 35px;
    border-radius: 2px;
    background: linear-gradient(
        90deg,
        var(--theme-hover-background, rgba(0, 0, 0, 0.04)) 25%,
        var(--theme-border-color, rgba(0, 0, 0, 0.08)) 37%,
        var(--theme-hover-background, rgba(0, 0, 0, 0.04)) 63%
    );
    background-size: 400% 100%;
    animation: md-edit-tools-skeleton-shimmer 1.2s ease infinite;
}

.md-edit-tools-skeleton.is-error {
    background: var(--theme-border-color, rgba(0, 0, 0, 0.08));
    animation: none;
}

@keyframes md-edit-tools-skeleton-shimmer {
    0% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0 50%;
    }
}
</style>
