<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 style="display: flex; align-items: center; justify-content: center">Color 选择器</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">在不同格式（十六进制、rgb、hsl和css名称）之间转换颜色</p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/color-converter')"
        >
            https://tools.w3cschool.cn/color-converter
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
