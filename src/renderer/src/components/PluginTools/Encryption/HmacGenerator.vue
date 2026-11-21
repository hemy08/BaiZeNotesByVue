<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.hmac.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">
            {{ t('toolsConvert.hmac.description') }}
        </p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/hmac-generator')"
        >
            https://tools.w3cschool.cn/hmac-generator
        </a>
        <div style="margin-top: 5px">
            <label>{{ t('toolsConvert.hmac.inputLabel') }}</label>
        </div>
        <div>
            <textarea
                id="hmac-text-input"
                v-model="textInput"
                :placeholder="t('toolsConvert.hmac.inputPlaceholder')"
                :style="{ width: props.workAreaWidth, height: '100px' }"
            ></textarea>
        </div>
        <div class="div-style-display-row">
            <div style="margin-top: 5px">
                <label>{{ t('toolsConvert.hmac.encodeLabel') }}</label>
            </div>
            <select id="hmac-text-encode-type" v-model="encodeType">
                <option value="Binary">Binary（base2）</option>
                <option value="Hexadecimal" selected>Hexadecimal（base16）</option>
                <option value="base64">Base64（base64）</option>
                <option value="Base64url">Base64url（base64 with url safe chars）</option>
            </select>
            <div style="margin-top: 5px">
                <label>{{ t('toolsConvert.hmac.secretLabel') }}</label>
            </div>
            <input
                v-model="secretKey"
                type="text"
                :placeholder="t('toolsConvert.hmac.secretPlaceholder')"
            />
        </div>
        <div
            v-for="item in hmacTextInput"
            :key="item.text"
            style="margin-top: 15px; display: flex; flex-direction: row"
        >
            <div class="hmac-text-label" :style="{ width: hmacLabelWidth }">
                <label>{{ item.text }}</label>
            </div>
            <input
                :id="item.id"
                type="text"
                class="hash-text-result-output"
                :style="hmacResultStyle"
                :placeholder="t('toolsConvert.hmac.resultPlaceholder', { algorithm: item.text })"
                :value="item.result"
                readonly
            />
            <button
                class="hmac-text-click-button"
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
// 第 2 批契约重构：HMAC 结果结构统一引用 shared HashResult（与主进程 encrypt-decrypt.ts 同源）
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

const textInput = ref('1')
const encodeType = ref('Hexadecimal')
const secretKey = ref('12345678')
const hmacLabelWidth = ref('150px')
const hashButtonWidth = ref('100px')
// CQ-10：结果改为异步 invoke 后，必须使用响应式数组，否则结果回填不会触发视图更新
const hmacTextInput = reactive([
    { id: 'hmac-text-md4', text: 'MD4', result: '' },
    { id: 'hmac-text-md5', text: 'MD5', result: '' },
    { id: 'hmac-text-sha1', text: 'SHA1', result: '' },
    { id: 'hmac-text-sha224', text: 'SHA224', result: '' },
    { id: 'hmac-text-sha256', text: 'SHA256', result: '' },
    { id: 'hmac-text-sha384', text: 'SHA384', result: '' },
    { id: 'hmac-text-sha512', text: 'SHA512', result: '' },
    { id: 'hmac-text-sha512-256', text: 'SHA512-256', result: '' },
    { id: 'hmac-text-ripemd160', text: 'RIPEMD160', result: '' }
])

const hmacResultStyle = computed(() => {
    const hashViewWidthValue = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const hmacLabelWidthValue = parseInt(hmacLabelWidth.value.replace('px', ''), 10)
    const hashButtonWidthValue = parseInt(hashButtonWidth.value.replace('px', ''), 10)
    const hashResultWidthValue = hashViewWidthValue - hmacLabelWidthValue - hashButtonWidthValue
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

// CQ-10/PF-11/ARC-21：sendSync 同步 IPC 改为 invoke 异步，快速输入时用序号丢弃过期响应
let hmacRequestSeq = 0

async function getHmacTextResult(): Promise<void> {
    const requestSeq = ++hmacRequestSeq
    try {
        const result = (await window.electron.ipcRenderer.invoke(
            IPC.PLUGIN.HMAC_TEXT,
            textInput.value,
            secretKey.value,
            encodeType.value
        )) as HashResult
        // 过期响应直接丢弃，避免先发后至的旧结果覆盖新结果
        if (requestSeq !== hmacRequestSeq) {
            return
        }
        hmacTextInput.forEach((item) => {
            item.result = result[item.text] ?? '' // 使用方括号语法来动态访问属性
        })
    } catch (error) {
        if (requestSeq !== hmacRequestSeq) {
            return
        }
        // CQ-05：异步调用必须 catch，失败时提示用户而不是静默
        logger.error('计算 HMAC 失败:', error)
        showAppError(
            t('toolsConvert.hmac.failedAlert', {
                error: error instanceof Error ? error.message : String(error)
            }),
            // 输入/密钥 watch 在连续击键时可能反复失败：同键 5s 内只弹一次（日志仍全量记录）
            { throttleKey: 'toolsConvert.hmac.failedAlert' }
        )
    }
}

watch(
    () => textInput.value,
    () => {
        getHmacTextResult()
    }
)

watch(
    () => secretKey.value,
    () => {
        getHmacTextResult()
    }
)

watch(
    () => encodeType.value,
    () => {
        if (!textInput.value) {
            showAppWarning(t('toolsConvert.hmac.emptyInputAlert'))
            return
        }
        getHmacTextResult()
    }
)
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.hmac-text-label {
    height: 30px;
    background-color: lightgreen;
    border: none;
    text-align: center;
}

.hmac-text-click-button {
    margin-left: 7px;
    height: 30px;
    background-color: deepskyblue;
    border: none;
    cursor: pointer; /* 重复设置，确保按钮样式 */
}
.hmac-text-click-button:hover {
    background-color: #ff9100;
}

.hash-text-result-output {
    background-color: white;
    height: 25px;
    margin-left: 7px;
    border-width: 1px;
}
</style>
