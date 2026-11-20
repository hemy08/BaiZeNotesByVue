<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">
            {{ t('toolsNetwork.infoTables.fileNameExtension.title') }}
        </h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsNetwork.infoTables.fileNameExtension.desc') }}</p>
        <div>
            <input
                v-model="searchQuery"
                type="text"
                :style="{ width: fileNameExtTableWidth }"
                :placeholder="t('toolsNetwork.infoTables.searchPlaceholder')"
            />
        </div>
        <table
            style="margin-top: 20px"
            class="file-name-ext-style"
            :style="{ width: fileNameExtTableWidth }"
        >
            <thead>
                <tr>
                    <th class="file-name-ext-th">
                        {{ t('toolsNetwork.infoTables.fileNameExtension.extension') }}
                    </th>
                    <th class="file-name-ext-th">
                        {{ t('toolsNetwork.infoTables.fileNameExtension.mimeType') }}
                    </th>
                    <th class="file-name-ext-th">
                        {{ t('toolsNetwork.infoTables.fileNameExtension.extension') }}
                    </th>
                    <th class="file-name-ext-th">
                        {{ t('toolsNetwork.infoTables.fileNameExtension.mimeType') }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, index) in filterFileNameExt" :key="index">
                    <template v-for="(symbol, idx) in item" :key="idx">
                        <td class="file-name-ext-preview">
                            {{ symbol.ext }}
                        </td>
                        <td class="file-name-ext-td">
                            {{ symbol.type }}
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
import { HTMLMimeTypeTable, CompressedArray } from './Information'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const searchQuery = ref('')
const fileNameExtTableWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const tableWidthVal = workWidthVal - 50
    return tableWidthVal + 'px'
})

const filterFileNameExt = computed(() => {
    if (!searchQuery.value) {
        return CompressedArray(HTMLMimeTypeTable, 2)
    }

    const SearchQuery = HTMLMimeTypeTable.filter((item) => {
        return (
            item.ext.toLowerCase().includes(searchQuery.value) ||
            item.type.toLowerCase().includes(searchQuery.value.toLowerCase())
        )
    })
    return CompressedArray(SearchQuery, 2)
})
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.file-name-ext-style {
    width: 100%;
    border-collapse: collapse;
}

.file-name-ext-th,
.file-name-ext-td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

.file-name-ext-preview {
    border: 1px solid #ddd;
    padding: 8px;
    background-color: #d5ffd5;
    text-align: left;
}

.file-name-ext-th {
    background-color: #f2f2f2;
}
</style>
