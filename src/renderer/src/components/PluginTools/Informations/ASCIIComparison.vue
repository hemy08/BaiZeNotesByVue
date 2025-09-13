<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">ASCII 对照表</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">ASCII 对照表，支持查询</p>
        <div>
            <input
                v-model="searchQuery"
                type="text"
                :style="{ width: asciiTableWidth }"
                placeholder="Search ASCII..."
            />
        </div>
        <table
            style="margin-top: 20px"
            class="ascii-table-style"
            :style="{ width: asciiTableWidth }"
        >
            <thead>
                <tr>
                    <th class="ascii-table-th">Bin(二进制)</th>
                    <th class="ascii-table-th">Oct(八进制)</th>
                    <th class="ascii-table-th">Dec(十进制)</th>
                    <th class="ascii-table-th">Hex(十六进制)</th>
                    <th class="ascii-table-th">缩写/字符</th>
                    <th class="ascii-table-th">解释</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(ascii, index) in filteredAsciiTable" :key="index">
                    <td class="ascii-table-td">{{ ascii.bin }}</td>
                    <td class="ascii-table-td">{{ ascii.oct }}</td>
                    <td class="ascii-table-td">{{ ascii.dec }}</td>
                    <td class="ascii-table-td">{{ ascii.hex }}</td>
                    <td class="ascii-table-td">{{ ascii.abridge }}</td>
                    <td class="ascii-table-td">{{ ascii.mark }}</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps, watch } from 'vue'
import { ASCIITable } from './Information'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const asciiViewWidth = ref(props.workAreaWidth)
const searchQuery = ref('')

watch(
    () => props.workAreaWidth,
    (newWidth) => {
        asciiViewWidth.value = newWidth
    }
)

const asciiTableWidth = computed(() => {
    const workWidthVal = parseInt(asciiViewWidth.value.replace('px', ''), 10)
    const tableWidthVal = workWidthVal - 50
    return tableWidthVal + 'px'
})

const filteredAsciiTable = computed(() => {
    if (!searchQuery.value) {
        return ASCIITable
    }
    return ASCIITable.filter((item) => {
        return (
            item.bin.includes(searchQuery.value) ||
            item.dec.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            item.oct.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            item.hex.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            item.abridge.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            item.mark.toLowerCase().includes(searchQuery.value.toLowerCase())
        )
    })
})
</script>

<style scoped>
.ascii-table-style {
    width: 100%;
    border-collapse: collapse;
}

.ascii-table-th,
.ascii-table-td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

.ascii-table-th {
    background-color: #f2f2f2;
}
</style>
