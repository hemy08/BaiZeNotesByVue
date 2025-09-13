<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">Hmac 生成器</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">
            使用密钥和您喜欢的哈希函数计算基于哈希的消息身份验证代码（HMAC）。
        </p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/hmac-generator')"
        >
            https://tools.w3cschool.cn/hmac-generator
        </a>
        <div style="margin-top: 5px"><label>需要进行Hmac的文本：</label></div>
        <div>
            <textarea
                id="hmac-text-input"
                v-model="textInput"
                placeholder="请输入你的文本..."
                :style="{ width: props.workAreaWidth, height: '100px' }"
            ></textarea>
        </div>
        <div class="div-style-display-row">
            <div style="margin-top: 5px"><label>摘要编码：</label></div>
            <select id="hmac-text-encode-type" v-model="encodeType">
                <option value="Binary">Binary（base2）</option>
                <option value="Hexadecimal" selected>Hexadecimal（base16）</option>
                <option value="base64">Base64（base64）</option>
                <option value="Base64url">Base64url（base64 with url safe chars）</option>
            </select>
            <div style="margin-top: 5px"><label>密钥：</label></div>
            <input v-model="secretKey" type="text" placeholder="请输入密钥，默认123456" />
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
                :placeholder="item.text + '哈希结果...'"
                :value="item.result"
                readonly
            />
            <button
                class="hmac-text-click-button"
                :style="{ width: hashButtonWidth }"
                @click="onCopyToClipboard(item.result)"
            >
                复制
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, computed } from 'vue'

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
const hashViewWidth = ref(props.workAreaWidth)
const hmacTextInput = [
    { id: 'hmac-text-md4', text: 'MD4', result: '' },
    { id: 'hmac-text-md5', text: 'MD5', result: '' },
    { id: 'hmac-text-sha1', text: 'SHA1', result: '' },
    { id: 'hmac-text-sha224', text: 'SHA224', result: '' },
    { id: 'hmac-text-sha256', text: 'SHA256', result: '' },
    { id: 'hmac-text-sha384', text: 'SHA384', result: '' },
    { id: 'hmac-text-sha512', text: 'SHA512', result: '' },
    { id: 'hmac-text-sha512-256', text: 'SHA512-256', result: '' },
    { id: 'hmac-text-ripemd160', text: 'RIPEMD160', result: '' }
]

const hmacResultStyle = computed(() => {
    const hashViewWidthValue = parseInt(hashViewWidth.value.replace('px', ''), 10)
    const hmacLabelWidthValue = parseInt(hmacLabelWidth.value.replace('px', ''), 10)
    const hashButtonWidthValue = parseInt(hashButtonWidth.value.replace('px', ''), 10)
    const hashResultWidthValue = hashViewWidthValue - hmacLabelWidthValue - hashButtonWidthValue
    return {
        width: hashResultWidthValue + 'px'
    }
})

function openUrl(link) {
    window.open(link, '_blank', 'noopener, noreferrer')
}

function onCopyToClipboard(context: string) {
    navigator.clipboard.writeText(context)
}

function getHmacTextResult() {
    const result = window.electron.ipcRenderer.sendSync(
        'plugin-tools-generator-hmac-text',
        textInput.value,
        secretKey.value,
        encodeType.value
    )
    hmacTextInput.forEach((item) => {
        item.result = result[item.text] // 使用方括号语法来动态访问属性
    })
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
            alert('请先输入要进行Hmac的文本....')
            return
        }
        getHmacTextResult()
    }
)

watch(
    () => props.workAreaWidth,
    (width) => {
        hashViewWidth.value = width
    }
)
</script>

<style scoped>
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
