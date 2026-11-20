<template>
    <!--
        C-2 迁移：regular（40px 标题栏 / 14px 标题）+ rounded（32px 圆角关闭按钮）+ 600px 宽度。
        遮罩、容器底色/圆角/阴影、0.2s 动画同默认壳；底栏与 BaseDialog 默认一致但**保持原嵌套位置**：
        迁移前 .footer 是 .content（padding:20px）的子元素，边框/背景随之向内缩进 20px；
        BaseDialog 的 footer 插槽是 .dialog-container 的直接子级（通栏贴边），移入插槽会改变
        边框宽度与背景位置，故此处保留正文内嵌结构，不提供 footer 插槽（BaseDialog 不渲染底栏）。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.insertImage.title')"
        title-bar-variant="regular"
        close-button-variant="rounded"
        width="600px"
        @close="handleCancel"
    >
        <div class="content">
            <div class="tabs">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    class="tab-btn"
                    :class="{ active: activeTab === tab.id }"
                    @click="activeTab = tab.id"
                >
                    {{ t(tab.labelKey) }}
                </button>
            </div>

            <div class="tab-content">
                <div v-if="activeTab === 'local'" class="local-tab">
                    <div class="input-group">
                        <label class="input-label">{{
                            t('dialogRenderer.insertImage.filePath')
                        }}</label>
                        <div class="path-input-wrapper">
                            <input
                                v-model="localFilePath"
                                type="text"
                                class="text-input"
                                :placeholder="t('dialogRenderer.insertImage.chooseFile')"
                                readonly
                            />
                            <button class="browse-btn" @click="browseFile">
                                {{ t('common.browse') }}
                            </button>
                        </div>
                    </div>
                </div>

                <div v-if="activeTab === 'url'" class="url-tab">
                    <div class="input-group">
                        <label class="input-label">{{
                            t('dialogRenderer.insertImage.imageUrl')
                        }}</label>
                        <input
                            v-model="imageUrl"
                            type="text"
                            class="text-input"
                            :placeholder="t('dialogRenderer.insertImage.imageUrlPlaceholder')"
                        />
                    </div>
                </div>

                <div class="input-group">
                    <label class="input-label">{{ t('dialogRenderer.insertImage.altText') }}</label>
                    <input
                        v-model="altText"
                        type="text"
                        class="text-input"
                        :placeholder="t('dialogRenderer.insertImage.altPlaceholder')"
                    />
                </div>

                <div class="input-group">
                    <label class="input-label">{{ t('dialogRenderer.common.titleLabel') }}</label>
                    <input
                        v-model="imageTitle"
                        type="text"
                        class="text-input"
                        :placeholder="t('dialogRenderer.insertImage.titlePlaceholder')"
                    />
                </div>

                <div v-if="previewUrl" class="preview-section">
                    <label class="preview-label">{{ t('dialogRenderer.common.preview') }}</label>
                    <img
                        :src="previewUrl"
                        :alt="t('dialogRenderer.common.preview')"
                        class="preview-image"
                        @error="previewLoadFailed = true"
                    />
                </div>
            </div>

            <div class="footer">
                <button class="btn btn-cancel" @click="handleCancel">
                    {{ t('common.cancel') }}
                </button>
                <button class="btn btn-confirm" :disabled="!canInsert" @click="handleInsert">
                    {{ t('dialogRenderer.common.insert') }}
                </button>
            </div>
        </div>
    </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

/** P1-FE-03：父组件「浏览」后回填的本地图片选择结果 */
interface PickedLocalImage {
    /** 选中图片的绝对路径（输入框展示用） */
    filePath: string
    /** 插入 Markdown 时实际使用的地址：复制到 images/ 后为 ./images/xxx，回退为绝对路径 */
    imageSrc: string
}

interface Props {
    visible: boolean
    /** P1-FE-03：经 IPC.FILE.SELECT_IMAGE 选择并复制后的本地图片（父组件回填） */
    pickedImage?: PickedLocalImage | null
}

// 迁移前不重置拖拽位置（useDialogDrag 未调用 resetPosition），与 BaseDialog 默认 false 等价。
const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'insert', markdown: string): void
    (e: 'browseFile'): void
}>()

const activeTab = ref<'local' | 'url'>('local')
// localFilePath 用于输入框展示与预览；localImageSrc 为实际写入 Markdown 的地址
// （通常已被主进程复制到当前文档 images/ 下，相对引用才能在预览中正常显示）。
const localFilePath = ref('')
const localImageSrc = ref('')
const imageUrl = ref('')
const altText = ref('')
const imageTitle = ref('')
// 预览图片加载失败时隐藏预览区（computed 只读，需独立状态位；切换来源后重置）。
const previewLoadFailed = ref(false)

// P1-FE-03：父组件调用 IPC.FILE.SELECT_IMAGE 后经 pickedImage 回填选择结果。
// 输入框显示绝对路径（用户可见到底选了哪个文件），插入时优先使用复制后的相对引用。
// immediate：组件挂载时若父组件已有选择结果（复用对话框实例）也能正确回填；
// 父组件在对话框关闭时会清空选择结果（避免下次打开插入到别的文件的错误相对路径），
// 此时同步清空本地状态。
watch(
    () => props.pickedImage,
    (picked) => {
        if (!picked || !picked.filePath) {
            localFilePath.value = ''
            localImageSrc.value = ''
            return
        }
        localFilePath.value = picked.filePath
        localImageSrc.value = picked.imageSrc || picked.filePath
    },
    { immediate: true }
)

const tabs = [
    { id: 'local' as const, labelKey: 'dialogRenderer.insertImage.localFile' },
    { id: 'url' as const, labelKey: 'dialogRenderer.insertImage.networkImage' }
]

const previewUrl = computed(() => {
    if (previewLoadFailed.value) return ''
    if (activeTab.value === 'local') return localFilePath.value
    return imageUrl.value
})

watch([activeTab, localFilePath, imageUrl], () => {
    previewLoadFailed.value = false
})

const canInsert = computed(() => {
    if (activeTab.value === 'local') return localFilePath.value.length > 0
    return imageUrl.value.length > 0
})

function browseFile() {
    emit('browseFile')
}

function handleCancel() {
    emit('close')
}

function handleInsert() {
    let src: string
    if (activeTab.value === 'local') {
        // P1-FE-03：优先使用主进程复制到 images/ 后的相对引用，回退为选中图片的绝对路径
        src = localImageSrc.value || localFilePath.value
    } else {
        src = imageUrl.value
    }

    let markdown = '![' + (altText.value || 'image') + '](' + src
    if (imageTitle.value) {
        markdown += ' "' + imageTitle.value + '"'
    }
    markdown += ')'

    emit('insert', markdown)
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/过渡动画）已抽到 BaseDialog；
   这里只保留正文、表单、内嵌底栏与按钮样式。 */
.content {
    padding: 20px;
    display: flex;
    flex-direction: column;
}

.tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 12px;
}

.tab-btn {
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
}

.tab-btn:hover {
    background: var(--hover-bg);
}

.tab-btn.active {
    background: var(--accent-color);
    color: #fff;
}

.tab-content {
    flex: 1;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
}

.input-label {
    font-size: 13px;
    color: var(--text-color);
    font-weight: 500;
}

.text-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--card-bg);
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
}

.text-input:focus {
    border-color: var(--accent-color);
}

.path-input-wrapper {
    display: flex;
    gap: 10px;
}

.browse-btn {
    padding: 0 16px;
    border: none;
    border-radius: 6px;
    background: var(--accent-color);
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
    flex-shrink: 0;
}

.browse-btn:hover {
    opacity: 0.9;
}

.preview-section {
    margin-top: 20px;
}

.preview-label {
    font-size: 13px;
    color: var(--text-color);
    font-weight: 500;
    margin-bottom: 10px;
    display: block;
}

.preview-image {
    max-width: 100%;
    max-height: 200px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
}

/* 原 .footer 嵌在 .content 内（见模板注释），结构与声明保持迁移前不变。 */
.footer {
    padding: 15px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    border-top: 1px solid var(--border-color);
    background: var(--card-bg);
}

.btn {
    padding: 8px 20px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-cancel {
    background: var(--border-color);
    color: var(--text-color);
}

.btn-confirm {
    background: var(--accent-color);
    color: #fff;
}

.btn:hover:not(:disabled) {
    opacity: 0.9;
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
