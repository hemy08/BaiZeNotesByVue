<template>
    <div :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">常见字体对照</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">常见字体对照查询</p>
        <div>
            <input
                v-model="searchQuery"
                type="text"
                :style="{ width: normalFontStyleTableWidth }"
                placeholder="Search ASCII..."
            />
        </div>
        <table
            style="margin-top: 20px"
            class="normal-font-style-style"
            :style="{ width: normalFontStyleTableWidth }"
        >
            <thead>
                <tr>
                    <th class="normal-font-style-th">字体名称</th>
                    <th class="normal-font-style-th">CSS样式</th>
                    <th class="normal-font-style-th">页面展现</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, index) in filterNormalFontStyle" :key="index">
                    <td class="normal-font-style-id">{{ item.name }}</td>
                    <td class="normal-font-style-id">{{ item.cssStyle }}</td>
                    <td class="normal-font-style-td" :style="{ fontFamily: item.cssStyle }">
                        12345，Hello World，轻轻地我来了，正如我轻轻的走。
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps } from 'vue'
import { NormalFontTable } from './Information'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const searchQuery = ref('')

const normalFontStyleTableWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const tableWidthVal = workWidthVal - 50
    return tableWidthVal + 'px'
})

const filterNormalFontStyle = computed(() => {
    if (!searchQuery.value) {
        return NormalFontTable
    }

    return NormalFontTable.filter((item) => {
        return (
            item.name.includes(searchQuery.value) ||
            item.cssStyle.toLowerCase().includes(searchQuery.value.toLowerCase())
        )
    })
})
</script>

<style scoped>
.normal-font-style-style {
    width: 100%;
    border-collapse: collapse;
}

.normal-font-style-th,
.normal-font-style-td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: center;
}

.normal-font-style-id {
    border: 1px solid #ddd;
    padding: 8px;
    background-color: #d5ffd5;
    text-align: center;
}

.normal-font-style-th {
    background-color: #f2f2f2;
}
</style>
