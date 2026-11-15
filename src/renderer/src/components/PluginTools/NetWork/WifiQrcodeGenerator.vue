<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 style="display: flex; align-items: center; justify-content: center">
            {{ t('toolsNetwork.network.wifiQrcodeGenerator.title') }}
        </h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsNetwork.network.wifiQrcodeGenerator.desc') }}</p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/wifi-qrcode-generator')"
        >
            https://tools.w3cschool.cn/wifi-qrcode-generator
        </a>
    </div>
</template>

<script setup lang="ts">
import { t } from '../../../common/i18n'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

function openUrl(link: string) {
    window.open(link, '_blank', 'noopener, noreferrer')
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';
</style>
