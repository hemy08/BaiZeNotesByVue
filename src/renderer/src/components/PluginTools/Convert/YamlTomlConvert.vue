<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 style="display: flex; align-items: center; justify-content: center">
            YAML 和 TOML转换器
        </h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">解析YAML并将其转换为TOML。或者将TOML转成YAML</p>
        <p>
            YAML 到 TOML<a
                class="plugin-tools-openurl"
                role="button"
                @click="openUrl('https://tools.w3cschool.cn/yaml-to-toml')"
            >
                https://tools.w3cschool.cn/yaml-to-toml
            </a>
        </p>
        <p>
            TOML 到 YAML
            <a
                class="plugin-tools-openurl"
                role="button"
                @click="openUrl('https://tools.w3cschool.cn/toml-to-yaml')"
            >
                https://tools.w3cschool.cn/toml-to-yaml
            </a>
        </p>
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
