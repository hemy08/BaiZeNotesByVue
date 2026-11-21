<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.hash.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">
            {{ t('toolsConvert.hash.descriptionLine1') }}
            <br />{{ t('toolsConvert.hash.descriptionLine2') }} <br />{{
                t('toolsConvert.hash.descriptionLine3')
            }}
        </p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/hash-text')"
        >
            https://tools.w3cschool.cn/hash-text
        </a>
        <div style="margin-top: 5px">
            <label>{{ t('toolsConvert.hash.inputLabel') }}</label>
        </div>
        <div>
            <textarea
                id="hash-text-input"
                v-model="textInput"
                :placeholder="t('toolsConvert.hash.inputPlaceholder')"
                :style="{ width: props.workAreaWidth, height: '100px' }"
            ></textarea>
        </div>
        <div style="margin-top: 5px">
            <label>{{ t('toolsConvert.hash.encodeLabel') }}</label>
        </div>
        <select
            id="hash-text-encode-type"
            v-model="encodeType"
            :style="{ width: props.workAreaWidth }"
        >
            <option value="Binary">Binary（base2）</option>
            <option value="Hexadecimal" selected>Hexadecimal（base16）</option>
            <option value="base64">Base64（base64）</option>
            <option value="Base64url">Base64url（base64 with url safe chars）</option>
        </select>
        <div
            v-for="item in hashTextInput"
            :key="item.text"
            style="margin-top: 15px; display: flex; flex-direction: row"
        >
            <div class="hash-text-label" :style="{ width: hashLabelWidth }">
                <label>{{ item.text }}</label>
            </div>
            <input
                :id="item.id"
                type="text"
                class="hash-text-result-output"
                :style="hashResultStyle"
                :placeholder="t('toolsConvert.hash.resultPlaceholder', { algorithm: item.text })"
                :value="item.result"
                readonly
            />
            <button
                class="hash-text-click-button"
                :style="{ width: hashButtonWidth }"
                @click="onCopyToClipboard(item.result)"
            >
                {{ t('common.copy') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive } from 'vue'
import { t } from '../../../common/i18n'
import { IPC } from '../../../../../shared/ipc-channels'
// 第 2 批契约重构：摘要结果结构统一引用 shared HashResult（与主进程 encrypt-decrypt.ts 同源）
import type { HashResult } from '../../../../../shared/types'
import { logger } from '../../../common/logger'
// alert 应用内化：空输入 → warning，IPC 失败 → error（同一类失败 5s 内只提示一次）
import { showAppError, showAppWarning } from '../../../common/app-message'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const textInput = ref('')
const encodeType = ref('Hexadecimal')
const hashLabelWidth = ref('150px')
const hashButtonWidth = ref('100px')
// CQ-10：结果改为异步 invoke 后，必须使用响应式数组，否则结果回填不会触发视图更新
const hashTextInput = reactive([
    { id: 'hash-text-md4', text: 'MD4', result: '' },
    { id: 'hash-text-md5', text: 'MD5', result: '' },
    { id: 'hash-text-sha1', text: 'SHA1', result: '' },
    { id: 'hash-text-sha224', text: 'SHA224', result: '' },
    { id: 'hash-text-sha256', text: 'SHA256', result: '' },
    { id: 'hash-text-sha384', text: 'SHA384', result: '' },
    { id: 'hash-text-sha512', text: 'SHA512', result: '' },
    { id: 'hash-text-sha512-256', text: 'SHA512-256', result: '' },
    { id: 'hash-text-ripemd160', text: 'RIPEMD160', result: '' }
])

const hashResultStyle = computed(() => {
    const hashViewWidthValue = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const hashLabelWidthValue = parseInt(hashLabelWidth.value.replace('px', ''), 10)
    const hashButtonWidthValue = parseInt(hashButtonWidth.value.replace('px', ''), 10)
    const hashResultWidthValue = hashViewWidthValue - hashLabelWidthValue - hashButtonWidthValue
    return {
        width: hashResultWidthValue + 'px'
    }
})

function openUrl(link: string) {
    window.open(link, '_blank', 'noopener, noreferrer')
}

function onCopyToClipboard(context: string) {
    navigator.clipboard.writeText(context)
}

watch(
    () => textInput.value,
    () => {
        getHashTextResult()
    }
)

watch(
    () => encodeType.value,
    () => {
        if (!textInput.value) {
            showAppWarning(t('toolsConvert.hash.emptyInputAlert'))
            return
        }
        getHashTextResult()
    }
)

// CQ-10/PF-11/ARC-21：sendSync 同步 IPC 改为 invoke 异步，快速输入时用序号丢弃过期响应
let hashRequestSeq = 0

async function getHashTextResult(): Promise<void> {
    const requestSeq = ++hashRequestSeq
    try {
        const result = (await window.electron.ipcRenderer.invoke(
            IPC.PLUGIN.HASH_TEXT,
            textInput.value,
            encodeType.value
        )) as HashResult
        // 过期响应直接丢弃，避免先发后至的旧结果覆盖新结果
        if (requestSeq !== hashRequestSeq) {
            return
        }
        hashTextInput.forEach((item) => {
            item.result = result[item.text] ?? '' // 使用方括号语法来动态访问属性
        })
    } catch (error) {
        if (requestSeq !== hashRequestSeq) {
            return
        }
        // CQ-05：异步调用必须 catch，失败时提示用户而不是静默
        logger.error('计算哈希失败:', error)
        showAppError(
            t('toolsConvert.hash.failedAlert', {
                error: error instanceof Error ? error.message : String(error)
            }),
            // 输入 watch 在连续击键时可能反复失败：同键 5s 内只弹一次（日志仍全量记录）
            { throttleKey: 'toolsConvert.hash.failedAlert' }
        )
    }
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.hash-text-label {
    height: 30px;
    background-color: lightgreen;
    border: none;
    text-align: center;
}

.hash-text-click-button {
    margin-left: 7px;
    height: 30px;
    background-color: deepskyblue;
    border: none;
    cursor: pointer; /* 重复设置，确保按钮样式 */
}
.hash-text-click-button:hover {
    background-color: #ff9100;
}

.hash-text-result-output {
    background-color: white;
    height: 25px;
    margin-left: 7px;
    border-width: 1px;
}
</style>
