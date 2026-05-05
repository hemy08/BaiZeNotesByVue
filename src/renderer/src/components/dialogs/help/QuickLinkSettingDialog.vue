<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <Transition name="dialog-scale">
          <div class="dialog-container">
            <div class="title-bar">
              <span class="title-text">快捷链接设置</span>
              <button class="close-btn" @click="handleClose">×</button>
            </div>

            <div class="main-content">
              <div class="content-wrapper">
                <div class="link-list">
                  <div class="list-header">
                    <h3>快捷链接列表</h3>
                    <button class="add-btn" @click="handleAdd">+ 添加</button>
                  </div>

                  <div class="link-items">
                    <div
                      v-for="(link, index) in links"
                      :key="index"
                      class="link-item"
                      :class="{ selected: selectedIndex === index }"
                      @click="selectedIndex = index"
                    >
                      <div class="link-info">
                        <span class="link-icon">{{ link.icon }}</span>
                        <span class="link-name">{{ link.name }}</span>
                      </div>
                      <div class="link-actions">
                        <button class="action-btn" @click.stop="handleEdit(index)">编辑</button>
                        <button class="action-btn delete" @click.stop="handleDelete(index)">删除</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="link-form" v-if="showForm">
                  <h3>{{ isEditing ? '编辑链接' : '添加链接' }}</h3>

                  <div class="form-group">
                    <label>名称</label>
                    <input v-model="formData.name" type="text" class="form-input" placeholder="链接名称" />
                  </div>

                  <div class="form-group">
                    <label>URL</label>
                    <input v-model="formData.url" type="text" class="form-input" placeholder="https://..." />
                  </div>

                  <div class="form-group">
                    <label>图标（emoji）</label>
                    <input v-model="formData.icon" type="text" class="form-input" placeholder="🌐" maxlength="2" />
                  </div>

                  <div class="form-group">
                    <label>描述</label>
                    <textarea v-model="formData.description" class="form-textarea" placeholder="可选的描述信息"></textarea>
                  </div>

                  <div class="form-actions">
                    <button class="btn btn-cancel" @click="handleCancelForm">取消</button>
                    <button class="btn btn-primary" @click="handleSaveForm">保存</button>
                  </div>
                </div>

                <div class="empty-state" v-else-if="links.length === 0">
                  <p>暂无快捷链接</p>
                  <button class="add-btn" @click="handleAdd">添加第一个链接</button>
                </div>
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleCancel">取消</button>
              <button class="btn btn-apply" @click="handleApply">应用</button>
              <button class="btn btn-confirm" @click="handleConfirm">确定</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'

interface Link {
  name: string
  url: string
  icon: string
  description: string
}

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', links: Link[]): void
}>()

const initialLinks = ref<Link[]>([
  { name: 'GitHub', url: 'https://github.com', icon: '🐙', description: '代码托管平台' },
  { name: 'Google', url: 'https://google.com', icon: '🔍', description: '搜索引擎' },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '📚', description: '程序员问答社区' }
])

const links = ref<Link[]>(JSON.parse(JSON.stringify(initialLinks.value)))

const selectedIndex = ref(-1)
const showForm = ref(false)
const isEditing = ref(false)
const editingIndex = ref(-1)

const formData = reactive({
  name: '',
  url: '',
  icon: '🌐',
  description: ''
})

watch(() => props.visible, (newVal) => {
  if (newVal) {
    initialLinks.value = JSON.parse(JSON.stringify(links.value))
  }
})

function handleAdd() {
  isEditing.value = false
  editingIndex.value = -1
  Object.assign(formData, { name: '', url: '', icon: '🌐', description: '' })
  showForm.value = true
}

function handleEdit(index: number) {
  isEditing.value = true
  editingIndex.value = index
  Object.assign(formData, links.value[index])
  showForm.value = true
}

function handleDelete(index: number) {
  links.value.splice(index, 1)
  if (selectedIndex.value === index) {
    selectedIndex.value = -1
  }
}

function handleCancelForm() {
  showForm.value = false
  editingIndex.value = -1
}

function handleSaveForm() {
  if (!formData.name || !formData.url) return

  const link: Link = {
    name: formData.name,
    url: formData.url,
    icon: formData.icon || '🌐',
    description: formData.description
  }

  if (isEditing.value && editingIndex.value >= 0) {
    links.value[editingIndex.value] = link
  } else {
    links.value.push(link)
  }

  showForm.value = false
}

function handleClose() {
  emit('close')
}

function handleApply() {
  window.api.config.write('quickLinks', JSON.parse(JSON.stringify(links.value)))
  emit('apply', JSON.parse(JSON.stringify(links.value)))
}

function handleConfirm() {
  handleApply()
  handleClose()
}

function handleCancel() {
  links.value = JSON.parse(JSON.stringify(initialLinks.value))
  handleClose()
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-scale-enter-active,
.dialog-scale-leave-active {
  transition: transform 0.2s ease;
}

.dialog-scale-enter-from,
.dialog-scale-leave-to {
  transform: scale(0.9);
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.dialog-container {
  width: 800px;
  height: 600px;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.title-bar {
  height: 48px;
  background: var(--title-bar-gradient);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.title-text {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  -webkit-app-region: no-drag;
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #fff;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 80, 80, 0.95);
}

.main-content {
  flex: 1;
  padding: 20px;
  overflow: hidden;
}

.content-wrapper {
  height: 100%;
  display: flex;
  gap: 20px;
}

.link-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.list-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.list-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.add-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: var(--accent-color);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.add-btn:hover {
  opacity: 0.9;
}

.link-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.link-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 4px;
}

.link-item:hover {
  background: var(--hover-bg);
}

.link-item.selected {
  background: var(--hover-bg);
  border-left: 3px solid var(--accent-color);
}

.link-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.link-icon {
  font-size: 20px;
}

.link-name {
  font-size: 13px;
  color: var(--text-color);
}

.link-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.link-item:hover .link-actions {
  opacity: 1;
}

.action-btn {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.action-btn.delete:hover {
  border-color: #ff4d4f;
  color: #ff4d4f;
}

.link-form {
  width: 280px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  padding: 16px;
}

.link-form h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  font-size: 12px;
  color: var(--text-color);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--bg-color);
}

.form-textarea {
  width: 100%;
  min-height: 60px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--bg-color);
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--secondary-text-color);
}

.footer {
  padding: 15px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
  flex-shrink: 0;
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
}

.btn-cancel:hover {
  background: var(--border-color);
}

.btn-apply {
  background: var(--card-bg);
  border: 1px solid var(--accent-color);
  color: var(--accent-color);
}

.btn-apply:hover {
  background: var(--accent-color);
  color: #fff;
}

.btn-confirm {
  background: var(--accent-color);
  color: #fff;
}

.btn:hover {
  opacity: 0.9;
}
</style>
