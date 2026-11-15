<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsNetwork.infoTables.ascii.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsNetwork.infoTables.ascii.desc') }}</p>
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
                    <th class="ascii-table-th">{{ t('toolsNetwork.infoTables.ascii.bin') }}</th>
                    <th class="ascii-table-th">{{ t('toolsNetwork.infoTables.ascii.oct') }}</th>
                    <th class="ascii-table-th">{{ t('toolsNetwork.infoTables.ascii.dec') }}</th>
                    <th class="ascii-table-th">{{ t('toolsNetwork.infoTables.ascii.hex') }}</th>
                    <th class="ascii-table-th">{{ t('toolsNetwork.infoTables.ascii.char') }}</th>
                    <th class="ascii-table-th">
                        {{ t('toolsNetwork.infoTables.ascii.explanation') }}
                    </th>
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
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { ASCIITable } from './Information'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const searchQuery = ref('')

const asciiTableWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
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
@import '../plugin-tools-theme.css';
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
