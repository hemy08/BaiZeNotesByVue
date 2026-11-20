<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 style="display: flex; align-items: center; justify-content: center">
            {{ t('toolsConvert.token.title') }}
        </h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsConvert.token.description') }}</p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/token-generator')"
        >
            https://tools.w3cschool.cn/token-generator
        </a>
        <div>
            <div v-for="type in boxTypes" :key="type.value">
                <input
                    :id="`char-${type.value}`"
                    v-model="selectedTypes"
                    type="checkbox"
                    :value="type.value"
                />
                <label :for="`char-${type.value}`" style="font-size: 20px; margin: 8px">
                    {{ t(type.labelKey) }}
                </label>
            </div>
        </div>
        <div style="margin-top: 15px; display: flex">
            <label for="text-token-length">{{ t('toolsConvert.token.lengthLabel') }}</label>
            <input
                id="text-token-length"
                v-model.number="tokenLength"
                type="number"
                style="margin-left: 20px"
            />
        </div>
        <div>
            <textarea
                id="token-output"
                :style="{ width: props.workAreaWidth }"
                :placeholder="t('toolsConvert.token.outputPlaceholder')"
                readonly
            ></textarea>
        </div>
        <div class="plugin-tools-btn-list" :style="{ width: props.workAreaWidth }">
            <button id="token-generator" class="plugin-tools-btn" @click="GeneratorToken">
                {{ t('toolsConvert.token.generateButton') }}
            </button>
            <button id="token-refresh" class="plugin-tools-btn" @click="RefreshToken">
                {{ t('toolsConvert.token.refreshButton') }}
            </button>
            <button id="token-clear" class="plugin-tools-btn" @click="ClearToken">
                {{ t('toolsConvert.token.clearButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../../../common/i18n'
const selectedTypes = ref<string[]>(['uppercase', 'lowercase', 'number'])
const tokenLength = ref<number>(64)
const generatorTokenStr = ref<string>('')

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const boxTypes = [
    { value: 'uppercase', labelKey: 'toolsConvert.token.uppercaseLabel' },
    { value: 'lowercase', labelKey: 'toolsConvert.token.lowercaseLabel' },
    { value: 'number', labelKey: 'toolsConvert.token.numberLabel' },
    { value: 'symbols', labelKey: 'toolsConvert.token.symbolLabel' }
]

function openUrl(link: string) {
    window.open(link, '_blank', 'noopener, noreferrer')
}

function getCharacters() {
    let chars = ''
    if (selectedTypes.value.includes('uppercase')) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    if (selectedTypes.value.includes('lowercase')) chars += 'abcdefghijklmnopqrstuvwxyz'
    if (selectedTypes.value.includes('number')) chars += '0123456789'
    if (selectedTypes.value.includes('symbols')) chars += '!@#$%^&*()_+{}:<>?[]\\|~'
    return chars
}

function GeneratorToken() {
    let characters = getCharacters()
    if (characters.length < 2) {
        characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    }
    let result = ''
    const values = new Uint32Array(tokenLength.value)
    window.crypto.getRandomValues(values)

    for (let i = 0; i < tokenLength.value; i++) {
        result += characters[values[i] % characters.length]
    }
    generatorTokenStr.value = result
    const tkOut = document.getElementById('token-output')
    if (tkOut) {
        tkOut.textContent = generatorTokenStr.value
    }
}

function RefreshToken() {
    GeneratorToken()
}

function ClearToken() {
    generatorTokenStr.value = ''
    const tkOut = document.getElementById('token-output')
    if (tkOut) {
        tkOut.textContent = ''
    }
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';
#token-output {
    padding: 8px;
    font-size: 16px;
    border: 1px solid #ccc;
    border-radius: 4px;
    height: 150px;
    margin: 15px 0 10px;
    display: flex;
}
</style>
