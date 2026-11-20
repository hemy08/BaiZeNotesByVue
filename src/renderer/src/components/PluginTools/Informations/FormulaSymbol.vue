<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">
            {{ t('toolsNetwork.infoTables.formulaSymbol.title') }}
        </h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsNetwork.infoTables.formulaSymbol.desc') }}</p>
        <div>
            <input
                v-model="searchQuery"
                type="text"
                :style="{ width: formulaSymbolTableWidth }"
                :placeholder="t('toolsNetwork.infoTables.searchPlaceholder')"
            />
        </div>
        <table
            style="margin-top: 20px"
            class="formula-symbol-table-style"
            :style="{ width: formulaSymbolTableWidth }"
        >
            <thead>
                <tr>
                    <th class="formula-symbol-table-th">
                        {{ t('toolsNetwork.infoTables.formulaSymbol.symbol') }}
                    </th>
                    <th class="formula-symbol-table-th">
                        {{ t('toolsNetwork.infoTables.formulaSymbol.explanation') }}
                    </th>
                    <th class="formula-symbol-table-th">
                        {{ t('toolsNetwork.infoTables.formulaSymbol.symbol') }}
                    </th>
                    <th class="formula-symbol-table-th">
                        {{ t('toolsNetwork.infoTables.formulaSymbol.explanation') }}
                    </th>
                    <th class="formula-symbol-table-th">
                        {{ t('toolsNetwork.infoTables.formulaSymbol.symbol') }}
                    </th>
                    <th class="formula-symbol-table-th">
                        {{ t('toolsNetwork.infoTables.formulaSymbol.explanation') }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, index) in filterFormulaSymbol" :key="index">
                    <template v-for="(symbol, idx) in item" :key="idx">
                        <td class="formula-symbol-table-td">
                            {{ symbol.id }}
                        </td>
                        <td class="formula-symbol-table-td">
                            {{ symbol.mark }}
                        </td>
                    </template>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { FormulaSymbolTable, CompressedArray } from './Information'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const searchQuery = ref('')
const formulaSymbolTableWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const tableWidthVal = workWidthVal - 50
    return tableWidthVal + 'px'
})

const filterFormulaSymbol = computed(() => {
    if (!searchQuery.value) {
        return CompressedArray(FormulaSymbolTable, 3)
    }

    const SearchQuery = FormulaSymbolTable.filter((item) => {
        return (
            item.id.toLowerCase().includes(searchQuery.value) ||
            item.mark.toLowerCase().includes(searchQuery.value.toLowerCase())
        )
    })
    return CompressedArray(SearchQuery, 3)
})
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.formula-symbol-table-style {
    width: 100%;
    border-collapse: collapse;
}

.formula-symbol-table-th,
.formula-symbol-table-td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

.formula-symbol-table-preview {
    border: 1px solid #ddd;
    padding: 8px;
    background-color: #d5ffd5;
    text-align: center;
}

.formula-symbol-table-th {
    background-color: #f2f2f2;
}
</style>
