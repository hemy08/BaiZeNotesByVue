<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">文件类型（MIME头）</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">文件类型（MIME头）</p>
        <div>
            <input
                v-model="searchQuery"
                type="text"
                :style="{ width: fileNameExtTableWidth }"
                placeholder="Search ASCII..."
            />
        </div>
        <table
            style="margin-top: 20px"
            class="file-name-ext-style"
            :style="{ width: fileNameExtTableWidth }"
        >
            <thead>
                <tr>
                    <th class="file-name-ext-th">文件扩展名</th>
                    <th class="file-name-ext-th">Content-Type(Mime-Type)</th>
                    <th class="file-name-ext-th">文件扩展名</th>
                    <th class="file-name-ext-th">Content-Type(Mime-Type)</th>
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
import { computed, ref, defineProps } from 'vue'
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
