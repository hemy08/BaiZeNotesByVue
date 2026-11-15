<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">
            {{ t('toolsNetwork.infoTables.htmlSpecialChar.title') }}
        </h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsNetwork.infoTables.htmlSpecialChar.desc') }}</p>
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
                    <th class="html-spec-char-table-th">
                        {{ t('toolsNetwork.infoTables.htmlSpecialChar.preview') }}
                    </th>
                    <th class="html-spec-char-table-th">
                        {{ t('toolsNetwork.infoTables.htmlSpecialChar.code') }}
                    </th>
                    <th class="html-spec-char-table-th">
                        {{ t('toolsNetwork.infoTables.htmlSpecialChar.explanation') }}
                    </th>
                    <th class="html-spec-char-table-th">
                        {{ t('toolsNetwork.infoTables.htmlSpecialChar.preview') }}
                    </th>
                    <th class="html-spec-char-table-th">
                        {{ t('toolsNetwork.infoTables.htmlSpecialChar.code') }}
                    </th>
                    <th class="html-spec-char-table-th">
                        {{ t('toolsNetwork.infoTables.htmlSpecialChar.explanation') }}
                    </th>
                    <th class="html-spec-char-table-th">
                        {{ t('toolsNetwork.infoTables.htmlSpecialChar.preview') }}
                    </th>
                    <th class="html-spec-char-table-th">
                        {{ t('toolsNetwork.infoTables.htmlSpecialChar.code') }}
                    </th>
                    <th class="html-spec-char-table-th">
                        {{ t('toolsNetwork.infoTables.htmlSpecialChar.explanation') }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, index) in filterHtmlSpecChar" :key="index">
                    <template v-for="(symbol, idx) in item" :key="idx">
                        <!-- eslint-disable-next-line vue/no-v-html -- HTML 特殊字符表为仓库内静态常量（实体字符串），无外部输入 -->
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
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
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
@import '../plugin-tools-theme.css';
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
