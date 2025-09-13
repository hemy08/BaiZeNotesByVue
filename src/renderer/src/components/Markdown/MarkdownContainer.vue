<template>
    <div id="md-edit-tools-bar" ref="toolsBarRef" class="md-edit-tools-bar">
        <MdEditTools :tool-bar-width="props.mdContainerWidth" />
    </div>
    <div id="md-edit-component" class="md-edit-component">
        <MdEditComp :editor-preview-width="props.mdContainerWidth" />
    </div>
</template>

<script setup lang="ts">
import MdEditTools from './MarkdownEditToolsComponent.vue'
import MdEditComp from './MarkdownEditComponent.vue'
import { defineProps, ref } from 'vue'

const toolsBarRef = ref(null)

const props = defineProps({
    // 编辑器宽度
    mdContainerWidth: {
        type: String,
        default: '100%'
    }
})
</script>

<style scoped>
#md-edit-tools-bar {
    width: 100%;
    height: auto;
    background-color: #f2f2f2;
    color: black;
    display: flex;
    flex-wrap: wrap;
}

#md-edit-component {
    height: calc(100vh - 40px - 2px - 20px);
    display: flex;
    flex: 1;
    width: 100%;
    flex-direction: row;
}
</style>
