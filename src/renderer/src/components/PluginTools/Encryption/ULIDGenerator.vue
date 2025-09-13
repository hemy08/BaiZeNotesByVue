<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 style="display: flex; align-items: center; justify-content: center">ULID 生成器</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">生成随机的通用唯一词典可排序标识符（ULID）。</p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/ulid-generator')"
        >
            https://tools.w3cschool.cn/ulid-generator
        </a>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="ulid-label-style"><label>生成数量：</label></div>
            <input v-model="ulidNumber" type="number" value="1" style="margin-left: 20px" />
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="ulid-label-style"><label>格式：</label></div>
            <div v-for="(formatter, index) in formatterStyle" :key="index">
                <button
                    class="ulid-btn-style"
                    :class="{ 'ulid-btn-active': activeFormatterStyle === formatter }"
                    @click="selectFormatter(formatter)"
                >
                    {{ formatter }}
                </button>
            </div>
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="ulid-label-style"><label>ULID LIST：</label></div>
            <textarea v-model="ulidList" :style="ulidTextStyle" placeholder="ulid list" />
        </div>
        <div
            class="plugin-tools-btn-list"
            :style="{ width: props.workAreaWidth, textAlign: 'center' }"
        >
            <button id="ulids-copy" class="plugin-tools-btn" @click="ulidsCopy">拷贝</button>
            <button id="ulids-refresh" class="plugin-tools-btn" @click="ulidsRefresh">刷新</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { defineProps, ref, computed, watch } from 'vue'
import { ulid } from 'ulid'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const ulidList = ref('')
const ulidsViewWidth = ref(props.workAreaWidth)
const ulidNumber = ref(1)
const activeFormatterStyle = ref('RAW')
const formatterStyle = ['RAW', 'JSON']

watch(
    () => props.workAreaWidth,
    (newWidth) => {
        ulidsViewWidth.value = newWidth
    }
)

watch(
    () => ulidNumber.value,
    () => {
        genUlidList(activeFormatterStyle.value)
    }
)
const ulidTextWidth = computed(() => {
    const workWidthVal = parseInt(ulidsViewWidth.value.replace('px', ''), 10)
    const textWidthVal = workWidthVal - 50
    const textMarginLeft = 170
    return textWidthVal - textMarginLeft
})

const ulidTextStyle = computed(() => {
    let textHeight = 0
    if (activeFormatterStyle.value === 'RAW') {
        textHeight = ulidNumber.value * 20 + 40
    } else {
        textHeight = ulidNumber.value * 20 + 60
    }
    return {
        width: ulidTextWidth.value + 'px',
        height: textHeight + 'px',
        marginLeft: '20px',
        minHeight: '100px'
    }
})

function openUrl(link) {
    window.open(link, '_blank', 'noopener, noreferrer')
}

function genUlidList(fmt: string) {
    let ulids = ''
    for (let i = 0; i < ulidNumber.value; i++) {
        if (fmt === 'JSON') {
            ulids += '    "' + ulid() + '",\r\n'
        } else {
            ulids += ulid() + '\r\n'
        }
    }

    if (fmt === 'JSON') {
        ulids = '[\r\n' + ulids + ']'
    } else {
        ulids += '\r\n'
    }

    ulidList.value = ulids
}

function selectFormatter(formatter: string) {
    activeFormatterStyle.value = formatter
    genUlidList(formatter)
}

function ulidsCopy() {
    navigator.clipboard.writeText(ulidList.value)
}

function ulidsRefresh() {
    genUlidList(activeFormatterStyle.value)
}
</script>

<style scoped>
.ulid-label-style {
    width: 150px;
    text-align: justify;
    background-color: #e1e4e8;
}

.ulid-btn-style {
    padding: 5px 20px;
    margin-left: 20px;
    border: none;
    background-color: #e1e4e8;
}

.ulid-btn-style:hover {
    background-color: lightgreen;
    color: #1c7d4d;
}

.ulid-btn-active {
    background-color: lightblue;
    color: #1c7d4d;
}
</style>
