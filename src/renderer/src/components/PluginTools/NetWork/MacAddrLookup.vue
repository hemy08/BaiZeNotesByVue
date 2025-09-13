<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 style="display: flex; align-items: center; justify-content: center">MAC地址查找</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">通过设备的MAC地址查找设备的供应商和制造商。</p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/mac-address-lookup')"
        >
            https://tools.w3cschool.cn/mac-address-lookup
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
