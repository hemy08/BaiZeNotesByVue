<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsNetwork.infoTables.subnetMask.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsNetwork.infoTables.subnetMask.desc') }}</p>
        <div>
            <input
                v-model="searchQuery"
                type="text"
                :style="{ width: subnetMaskMapTableWidth }"
                :placeholder="t('toolsNetwork.infoTables.searchPlaceholder')"
            />
        </div>
        <table
            style="margin-top: 20px"
            class="subnet-mask-map-table-style"
            :style="{ width: subnetMaskMapTableWidth }"
        >
            <thead>
                <tr>
                    <th class="subnet-mask-map-table-th">
                        {{ t('toolsNetwork.infoTables.subnetMask.mask') }}
                    </th>
                    <th class="subnet-mask-map-table-th">
                        {{ t('toolsNetwork.infoTables.subnetMask.bits') }}
                    </th>
                    <th class="subnet-mask-map-table-th">
                        {{ t('toolsNetwork.infoTables.subnetMask.ipCount') }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, index) in filterPhysicalSymbol" :key="index">
                    <td class="subnet-mask-map-table-td">{{ item.mask }}</td>
                    <td class="subnet-mask-map-table-td">{{ item.bit }}</td>
                    <td class="subnet-mask-map-table-td">{{ item.nums }}</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { SubnetMaskBitsTable } from './Information'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const searchQuery = ref('')

const subnetMaskMapTableWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const tableWidthVal = workWidthVal - 50
    return tableWidthVal + 'px'
})

const filterPhysicalSymbol = computed(() => {
    if (!searchQuery.value) {
        return SubnetMaskBitsTable
    }

    return SubnetMaskBitsTable.filter((item) => {
        return (
            item.mask.includes(searchQuery.value) ||
            item.bit.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            item.nums.toLowerCase().includes(searchQuery.value.toLowerCase())
        )
    })
})
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.subnet-mask-map-table-style {
    width: 100%;
    border-collapse: collapse;
}

.subnet-mask-map-table-th,
.subnet-mask-map-table-td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

.subnet-mask-map-table-id {
    border: 1px solid #ddd;
    padding: 8px;
    background-color: #d5ffd5;
    text-align: center;
}

.subnet-mask-map-table-th {
    background-color: #f2f2f2;
}
</style>
