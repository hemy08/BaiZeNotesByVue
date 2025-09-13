<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">HTML特殊字符对照表</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">HTML特殊字符对照表，支持查询</p>
        <div>
            <input
                v-model="searchQuery"
                type="text"
                :style="{ width: htmlSpecCharTableWidth }"
                placeholder="Search ASCII..."
            />
        </div>
        <table
            style="margin-top: 20px"
            class="html-spec-char-table-style"
            :style="{ width: htmlSpecCharTableWidth }"
        >
            <thead>
                <tr>
                    <th class="html-spec-char-table-th">预览</th>
                    <th class="html-spec-char-table-th">写法</th>
                    <th class="html-spec-char-table-th">说明</th>
                    <th class="html-spec-char-table-th">预览</th>
                    <th class="html-spec-char-table-th">写法</th>
                    <th class="html-spec-char-table-th">说明</th>
                    <th class="html-spec-char-table-th">预览</th>
                    <th class="html-spec-char-table-th">写法</th>
                    <th class="html-spec-char-table-th">说明</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, index) in filterHtmlSpecChar" :key="index">
                    <template v-for="(symbol, idx) in item" :key="idx">
                        <td class="html-spec-char-table-preview" v-html="symbol.id"></td>
                        <td class="html-spec-char-table-td">
                            {{ symbol.id }}
                        </td>
                        <td class="html-spec-char-table-td">
                            {{ symbol.mark }}
                        </td>
                    </template>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps } from 'vue'
import { HTMLSpecCharTable, CompressedArray } from './Information'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const searchQuery = ref('')

const htmlSpecCharTableWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const tableWidthVal = workWidthVal - 50
    return tableWidthVal + 'px'
})

const filterHtmlSpecChar = computed(() => {
    if (!searchQuery.value) {
        return CompressedArray(HTMLSpecCharTable, 3)
    }

    const SearchQuery = HTMLSpecCharTable.filter((item) => {
        return (
            item.id.toLowerCase().includes(searchQuery.value) ||
            item.mark.toLowerCase().includes(searchQuery.value.toLowerCase())
        )
    })
    return CompressedArray(SearchQuery, 3)
})
</script>

<style scoped>
.html-spec-char-table-style {
    width: 100%;
    border-collapse: collapse;
}

.html-spec-char-table-th,
.html-spec-char-table-td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

.html-spec-char-table-preview {
    border: 1px solid #ddd;
    padding: 8px;
    background-color: #d5ffd5;
    text-align: center;
}

.html-spec-char-table-th {
    background-color: #f2f2f2;
}
</style>
