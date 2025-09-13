<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 style="display: flex; align-items: center; justify-content: center">JSON 转 CSV</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">使用自动标头检测将JSON转换为CSV。</p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/json-to-csv')"
        >
            https://tools.w3cschool.cn/json-to-csv
        </a>
        <div :style="{ width: props.workAreaWidth }">TEST</div>
    </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

function openUrl(link) {
    window.open(link, '_blank', 'noopener, noreferrer')
}
</script>

<style scoped></style>
