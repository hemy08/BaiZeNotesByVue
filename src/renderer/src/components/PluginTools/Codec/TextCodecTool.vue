<!--
  文本编解码工具通用组件（第 3 批重构 / 子任务 A2）。

  抽取来源：Codec/Base64Codec.vue、HtmlCodec.vue、UrlCodec.vue、UnicodeConvert.vue 四份
  「双栏输入输出 + 操作按钮 + 复制/清空」结构几乎完全重复的实现。差异点通过 props 表达：
  - i18nPrefix：标题/描述/输入输出标签/文案的 i18n key 前缀（保持既有词条 key 不变）；
  - idPrefix：输入/输出/复制/清空按钮的 DOM id 前缀（保持既有 id 契约不变）；
  - actions：本工具专属的转换动作表（id + 文案 key 后缀 + 纯变换函数 + 可选错误提示 key）。

  ImageBase64.vue 含图片文件选择/预览 objectURL 生命周期等专属逻辑，本轮按任务要求
  保留独立实现，不纳入本通用组件。
-->
<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t(`${props.i18nPrefix}.title`) }}</h1>
        <div class="divider-tool"></div>
        <p>{{ t(`${props.i18nPrefix}.description`) }}</p>
        <div class="codec-row">
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label :for="inputId">{{ t(`${props.i18nPrefix}.inputLabel`) }}</label>
                </div>
                <textarea
                    :id="inputId"
                    v-model="inputText"
                    class="codec-textarea"
                    :rows="props.inputRows"
                    :placeholder="t(`${props.i18nPrefix}.inputPlaceholder`)"
                ></textarea>
            </div>
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label :for="outputId">{{ t(`${props.i18nPrefix}.outputLabel`) }}</label>
                </div>
                <textarea
                    :id="outputId"
                    v-model="outputText"
                    class="codec-textarea"
                    :rows="props.outputRows"
                    :placeholder="t(`${props.i18nPrefix}.outputPlaceholder`)"
                ></textarea>
            </div>
        </div>
        <div class="codec-btn-list" :style="{ width: props.workAreaWidth }">
            <button
                v-for="action in props.actions"
                :id="action.id"
                :key="action.id"
                class="codec-btn-style"
                @click="runAction(action)"
            >
                {{ t(`${props.i18nPrefix}.${action.labelKey}`) }}
            </button>
            <button :id="copyId" class="codec-btn-style" @click="handleCopy">
                {{ t(`${props.i18nPrefix}.copyButton`) }}
            </button>
            <button :id="clearId" class="codec-btn-style" @click="handleClear">
                {{ t(`${props.i18nPrefix}.clearButton`) }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'

defineOptions({ name: 'TextCodecTool' })

/** 单个转换按钮定义：id/文案 key 由各 codec 薄封装传入，行为与原独立实现一致 */
interface TextCodecAction {
    /** 按钮 DOM id（沿用迁移前的既有 id，避免破坏选择器/自动化契约） */
    id: string
    /** 按钮文案 i18n key 后缀，相对 `${i18nPrefix}.`（如 encodeButton / toUnicodeButton） */
    labelKey: string
    /** 纯变换函数：输入文本 → 输出文本（不产生副作用） */
    transform: (input: string) => string
    /**
     * 失败提示 i18n key 后缀（可选）：提供时捕获转换异常并 alert；
     * 未提供时保持原实现的行为（异常原样抛出）。
     */
    errorKey?: string
}

const props = withDefaults(
    defineProps<{
        /** 编辑器工作区宽度（由 PluginTools.vue 注入，原各 codec 同名字段） */
        workAreaWidth?: string
        /** i18n key 前缀（如 'toolsConvert.base64'），标题/描述/标签等词条沿用既有 key */
        i18nPrefix: string
        /** DOM id 前缀（如 'base64'），生成 `${idPrefix}-input/output/copy/clear` */
        idPrefix: string
        /** 本 codec 的转换动作表（渲染顺序即按钮顺序） */
        actions: TextCodecAction[]
        /** 输入文本框行数（默认 6；CSS min-height 与迁移前一致仍为 120px） */
        inputRows?: number
        /** 输出文本框行数（默认 6） */
        outputRows?: number
    }>(),
    {
        workAreaWidth: '100%',
        inputRows: 6,
        outputRows: 6
    }
)

const inputText = ref('')
const outputText = ref('')

// 左右两栏各占工作区宽度的一半（去掉栏间距），单位 px；宽度无法解析时回落 340px
const columnWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const total = Number.isFinite(workWidthVal) ? workWidthVal : 680
    return Math.max(240, Math.floor((total - 40) / 2)) + 'px'
})

// DOM id 统一按「前缀 + 用途」生成，保持迁移前各 codec 的 id 不变
const inputId = computed(() => `${props.idPrefix}-input`)
const outputId = computed(() => `${props.idPrefix}-output`)
const copyId = computed(() => `${props.idPrefix}-copy`)
const clearId = computed(() => `${props.idPrefix}-clear`)

/**
 * 执行转换动作：成功写入输出框；
 * 带 errorKey 的动作（如 URL 解码）异常时弹 i18n 提示并保留原输出，其余异常原样抛出。
 */
function runAction(action: TextCodecAction): void {
    try {
        outputText.value = action.transform(inputText.value)
    } catch (error) {
        if (!action.errorKey) throw error
        alert(t(`${props.i18nPrefix}.${action.errorKey}`, { error: String(error) }))
    }
}

function handleCopy(): void {
    if (!outputText.value) return
    void copyTextToClipboard(outputText.value)
}

function handleClear(): void {
    inputText.value = ''
    outputText.value = ''
}
</script>

<style scoped>
/* 主题样式 + 插件通用类（A3 收敛后的公共类） */
@import '../plugin-tools-theme.css';

/*
  文本 codec 双栏布局与按钮样式：迁移前 4 个 codec 组件各复制一份，现统一到本组件，
  取值与迁移前完全一致（仅一份，避免四份重复）。
*/
.codec-row {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 20px;
    margin-top: 10px;
}

.codec-col {
    display: flex;
    flex-direction: column;
}

.codec-label-style {
    width: 150px;
    text-align: justify;
    background-color: #e1e4e8;
}

.codec-textarea {
    width: 100%;
    min-height: 120px;
    resize: vertical;
    margin-top: 5px;
}

.codec-btn-list {
    margin-top: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
}

.codec-btn-style {
    padding: 5px 20px;
    border-radius: 5px;
    cursor: pointer;
}
</style>
