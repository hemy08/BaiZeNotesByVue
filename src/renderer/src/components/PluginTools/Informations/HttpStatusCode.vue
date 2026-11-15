<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">
            {{ t('toolsNetwork.infoTables.httpStatusCode.title') }}
        </h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsNetwork.infoTables.httpStatusCode.desc') }}</p>
        <div>
            <input
                v-model="searchQuery"
                type="text"
                :style="{ width: httpStatusCodeTableWidth }"
                placeholder="Search ASCII..."
            />
        </div>
        <table
            style="margin-top: 20px"
            class="http-code-table-style"
            :style="{ width: httpStatusCodeTableWidth }"
        >
            <thead>
                <tr>
                    <th class="http-code-table-th">
                        {{ t('toolsNetwork.infoTables.httpStatusCode.code') }}
                    </th>
                    <th class="http-code-table-th">
                        {{ t('toolsNetwork.infoTables.httpStatusCode.explanation') }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, index) in filterHttpStatusCode" :key="index">
                    <td class="http-code-table-id">{{ item.code }}</td>
                    <!-- eslint-disable-next-line vue/no-v-html -- 描述文本来自仓库内静态状态码表，cleanHtml 仅把 \r\n 换成 <br />，无外部输入 -->
                    <td class="http-code-table-td" v-html="cleanHtml(item.desc)"></td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { HTTPStatusCodeTable } from './Information'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const searchQuery = ref('')

const httpStatusCodeTableWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const tableWidthVal = workWidthVal - 50
    return tableWidthVal + 'px'
})

const filterHttpStatusCode = computed(() => {
    if (!searchQuery.value) {
        return HTTPStatusCodeTable
    }

    return HTTPStatusCodeTable.filter((item) => {
        return (
            item.code.includes(searchQuery.value) ||
            item.desc.toLowerCase().includes(searchQuery.value.toLowerCase())
        )
    })
})

function cleanHtml(desc: string) {
    // 替换 \r\n 为 <br />
    return desc.replace(/\r\n/g, '<br />')
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.http-code-table-style {
    width: 100%;
    border-collapse: collapse;
}

.http-code-table-th,
.http-code-table-td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

.http-code-table-id {
    border: 1px solid #ddd;
    padding: 8px;
    background-color: #d5ffd5;
    text-align: left;
}

.http-code-table-th {
    background-color: #f2f2f2;
}
</style>
