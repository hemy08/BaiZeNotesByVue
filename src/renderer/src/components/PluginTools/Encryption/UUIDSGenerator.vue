<template>
  <div :style="{ width: props.viewWidth }">
    <h1 class="header-display-center">UUIDs 生成器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">
      通用唯一标识符（UUID）是一个128位数字，用于标识计算机系统中的信息。可能的UUID数量为16^32，即2^128或约3.4x10^38（这是一个很大的数字！）。
    </p>
    <a href="https://tools.w3cschool.cn/uuid-generator">
      https://tools.w3cschool.cn/uuid-generator
    </a>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="uuid-label-style"><label>UUID Version</label></div>
      <div v-for="(version, index) in uuidVerKeys" :key="index">
        <button
          class="uuid-btn-style"
          :class="{ 'uuid-btn-active': activeUUIDVersion === version }"
          @click="selectVersion(version)"
        >
          {{ version }}
        </button>
      </div>
    </div>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="uuid-label-style"><label>生成数量：</label></div>
      <input v-model="uuidNumber" type="number" value="1" style="margin-left: 20px" />
    </div>
    <div v-show="isShowNamespace">
      <div class="div-style-display-row" style="margin-top: 10px">
        <div class="uuid-label-style"><label>命名空间：</label></div>
        <div v-for="(namespace, index) in uuidNameSpaceKeys" :key="index">
          <button
            class="uuid-btn-style"
            :class="{ 'uuid-btn-active': activeNameSpace === namespace }"
            @click="selectNameSpace(namespace)"
          >
            {{ namespace }}
          </button>
        </div>
      </div>
      <div style="margin-top: 10px">
        <input v-model="uuidNameSpace" :style="uuidNameSpaceStyle" placeholder="uuids namespace" />
      </div>
      <div class="div-style-display-row" style="margin-top: 10px">
        <div class="uuid-label-style"><label>名称：</label></div>
        <input v-model="uuidName" type="text" :style="uuidNameStyle" placeholder="name" />
      </div>
    </div>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="uuid-label-style"><label>UUIDS：</label></div>
      <textarea v-model="uuidList" :style="uuidTextStyle" placeholder="uuids" />
    </div>
    <div class="plugin-tools-btn-list" :style="{ width: props.viewWidth, textAlign: 'center' }">
      <button id="uuids-copy" class="plugin-tools-btn" @click="UuidsCopy">拷贝</button>
      <button id="uuids-refresh" class="plugin-tools-btn" @click="RefreshUuids">刷新</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineProps, ref, watch } from 'vue'
import * as uuid from 'uuid'

const props = defineProps({
  // 编辑器宽度
  viewWidth: {
    type: String,
    default: '100%'
  }
})

const activeUUIDVersion = ref('v1')
const activeNameSpace = ref('DNS')
const uuidsViewWidth = ref(props.viewWidth)
const isShowNamespace = ref(false)
const uuidNumber = ref(1)
const uuidNameSpace = ref('6ba7b810-9dad-11d1-80b4-00c04fd430c8')
const uuidName = ref('')
const uuidList = ref('')
const uuidVersions = {
  NIL: uuid.NIL,
  v1: uuid.v1,
  v3: uuid.v3,
  v4: uuid.v4,
  v5: uuid.v5
}
const uuidVerKeys = Object.keys(uuidVersions)
const uuidNameSpaces = {
  DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c9',
  OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c9'
}
const uuidNameSpaceKeys = Object.keys(uuidNameSpaces)

watch(
  () => props.viewWidth,
  (newWidth) => {
    uuidsViewWidth.value = newWidth
  }
)

watch(
  () => uuidNumber.value,
  () => {
    selectVersion(activeUUIDVersion.value)
  }
)

watch(
  () => uuidName.value,
  () => {
    selectVersion(activeUUIDVersion.value)
  }
)

const uuidTextWidth = computed(() => {
  const viewWidthVal = parseInt(uuidsViewWidth.value.replace('px', ''), 10)
  const workWidthVal = viewWidthVal - 50
  const textMarginLeft = 170
  return workWidthVal - textMarginLeft
})

const uuidNameSpaceStyle = computed(() => {
  return {
    width: uuidTextWidth.value + 'px',
    marginLeft: '170px',
    textAlign: 'center'
  }
})

const uuidTextStyle = computed(() => {
  const textHeight = uuidNumber.value * 20
  return {
    width: uuidTextWidth.value + 'px',
    height: textHeight + 'px',
    marginLeft: '20px',
    minHeight: '50px',
    textAlign: 'center',
    overflowY: 'hidden'
  }
})

const uuidNameStyle = computed(() => {
  return {
    width: uuidTextWidth.value + 'px',
    marginLeft: '20px'
  }
})

function generatorUUID(version: string): string {
  if (version === 'NIL') {
    return '00000000-0000-0000-0000-000000000000'
  } else if (version === 'v4') {
    return uuid.v4()
  } else if (version === 'v3') {
    return uuid.v3(uuidName.value, uuidNameSpace.value)
  } else if (version === 'v5') {
    return uuid.v5(uuidName.value, uuidNameSpace.value)
  } else {
    return uuid.v1()
  }
}

function genUUIDList(version: string, nums: number): string {
  let uuids = ''
  for (let i = 0; i < nums; i++) {
    uuids += generatorUUID(version) + '\r\n'
  }

  return uuids
}

function selectVersion(version: string) {
  activeUUIDVersion.value = version
  isShowNamespace.value = version === 'v3' || version === 'v5'
  uuidList.value = genUUIDList(version, uuidNumber.value)
}

function selectNameSpace(namespace: string) {
  activeNameSpace.value = namespace
  uuidNameSpace.value = uuidNameSpaces[namespace]
  selectVersion(activeUUIDVersion.value)
}

function UuidsCopy() {
  navigator.clipboard.writeText(uuidList.value)
}

function RefreshUuids() {
  selectVersion(activeUUIDVersion.value)
}
</script>

<style scoped>
.uuid-label-style {
  width: 150px;
  text-align: justify;
  background-color: #e1e4e8;
}

.uuid-btn-style {
  padding: 5px 20px;
  margin-left: 20px;
  border: none;
  background-color: #e1e4e8;
}

.uuid-btn-style:hover {
  background-color: lightgreen;
  color: #1c7d4d;
}

.uuid-btn-active {
  background-color: lightblue;
  color: #1c7d4d;
}
</style>
