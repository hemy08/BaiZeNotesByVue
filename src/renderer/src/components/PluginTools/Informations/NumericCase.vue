<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsNetwork.infoTables.numericCase.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsNetwork.infoTables.numericCase.desc') }}</p>
        <div>
            <input
                v-model="searchQuery"
                type="text"
                :style="{ width: numericCaseTableWidth }"
                :placeholder="t('toolsNetwork.infoTables.searchPlaceholder')"
            />
        </div>
        <table
            style="margin-top: 20px"
            class="numeric-case-table-style"
            :style="{ width: numericCaseTableWidth }"
        >
            <thead>
                <tr>
                    <th class="numeric-case-table-th">
                        {{ t('toolsNetwork.infoTables.numericCase.digit') }}
                    </th>
                    <th class="numeric-case-table-th">
                        {{ t('toolsNetwork.infoTables.numericCase.lower') }}
                    </th>
                    <th class="numeric-case-table-th">
                        {{ t('toolsNetwork.infoTables.numericCase.upper') }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, index) in filterNumericCase" :key="index">
                    <td class="numeric-case-table-id">{{ item.number }}</td>
                    <td class="numeric-case-table-td">{{ item.lower }}</td>
                    <td class="numeric-case-table-td">{{ item.upper }}</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { NumericCaseTable } from './Information'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const searchQuery = ref('')

const numericCaseTableWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const tableWidthVal = workWidthVal - 50
    return tableWidthVal + 'px'
})

const filterNumericCase = computed(() => {
    if (!searchQuery.value) {
        return NumericCaseTable
    }

    return NumericCaseTable.filter((item) => {
        return (
            item.number.includes(searchQuery.value) ||
            item.lower.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            item.upper.toLowerCase().includes(searchQuery.value.toLowerCase())
        )
    })
})
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.numeric-case-table-style {
    width: 100%;
    border-collapse: collapse;
}

.numeric-case-table-th,
.numeric-case-table-td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: center;
}

.numeric-case-table-id {
    border: 1px solid #ddd;
    padding: 8px;
    background-color: #d5ffd5;
    text-align: center;
}

.numeric-case-table-th {
    background-color: #f2f2f2;
}
</style>
