<template>
    <Teleport to="body">
        <Transition name="dialog-fade">
            <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
                <Transition name="dialog-scale">
                    <div v-if="visible" class="dialog-container">
                        <div class="title-bar">
                            <span class="title-text">{{
                                t('dialogRenderer.helpContactUs.title')
                            }}</span>
                            <button class="close-btn" @click="handleClose">×</button>
                        </div>

                        <div class="main-content">
                            <div class="contact-info">
                                <h2>{{ t('dialogRenderer.helpContactUs.title') }}</h2>
                                <p class="subtitle">
                                    {{ t('dialogRenderer.helpContactUs.subtitle') }}
                                </p>

                                <div class="contact-cards">
                                    <div
                                        class="contact-card"
                                        @click="
                                            openLink(
                                                'https://github.com/hemy08/BaiZeNotesByVue/issues'
                                            )
                                        "
                                    >
                                        <div class="card-icon">🐛</div>
                                        <div class="card-title">
                                            {{ t('dialogRenderer.helpContactUs.feedback') }}
                                        </div>
                                        <div class="card-desc">
                                            {{ t('dialogRenderer.helpContactUs.feedbackDesc') }}
                                        </div>
                                    </div>

                                    <div
                                        class="contact-card"
                                        @click="
                                            openLink('https://github.com/hemy08/BaiZeNotesByVue')
                                        "
                                    >
                                        <div class="card-icon">⭐</div>
                                        <div class="card-title">
                                            {{ t('dialogRenderer.helpContactUs.star') }}
                                        </div>
                                        <div class="card-desc">
                                            {{ t('dialogRenderer.helpContactUs.starDesc') }}
                                        </div>
                                    </div>

                                    <div
                                        class="contact-card"
                                        @click="
                                            openLink(
                                                'https://github.com/hemy08/BaiZeNotesByVue/pulls'
                                            )
                                        "
                                    >
                                        <div class="card-icon">🔧</div>
                                        <div class="card-title">
                                            {{ t('dialogRenderer.helpContactUs.contribute') }}
                                        </div>
                                        <div class="card-desc">
                                            {{ t('dialogRenderer.helpContactUs.contributeDesc') }}
                                        </div>
                                    </div>

                                    <div
                                        class="contact-card"
                                        @click="openLink('mailto:hemy08@example.com')"
                                    >
                                        <div class="card-icon">📧</div>
                                        <div class="card-title">
                                            {{ t('dialogRenderer.helpContactUs.email') }}
                                        </div>
                                        <div class="card-desc">hemy08@example.com</div>
                                    </div>
                                </div>

                                <div class="social-links">
                                    <h3>{{ t('dialogRenderer.common.followUs') }}</h3>
                                    <div class="social-icons">
                                        <div
                                            class="social-icon"
                                            @click="openLink('https://github.com/hemy08')"
                                        >
                                            <span>🐙</span>
                                            <span>GitHub</span>
                                        </div>
                                        <div
                                            class="social-icon"
                                            @click="openLink('https://hemy08.github.io/hemynotes/')"
                                        >
                                            <span>📖</span>
                                            <span>{{ t('dialogRenderer.common.docs') }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="footer">
                            <button class="btn btn-cancel" @click="handleClose">
                                {{ t('common.close') }}
                            </button>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { t } from '../../../common/i18n'

interface Props {
    visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
}>()

function openLink(url: string) {
    if (typeof window !== 'undefined' && window.open) {
        window.open(url, '_blank')
    }
}

function handleClose() {
    emit('close')
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
    width: 600px;
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
    padding: 30px;
    overflow-y: auto;
}

.contact-info {
    text-align: center;
}

.contact-info h2 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 8px;
}

.subtitle {
    font-size: 14px;
    color: var(--secondary-text-color);
    margin-bottom: 30px;
}

.contact-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 30px;
}

.contact-card {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 20px;
    cursor: pointer;
    transition: all 0.2s;
}

.contact-card:hover {
    border-color: var(--accent-color);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-icon {
    font-size: 36px;
    margin-bottom: 12px;
}

.card-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 6px;
}

.card-desc {
    font-size: 12px;
    color: var(--secondary-text-color);
}

.social-links h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 16px;
}

.social-icons {
    display: flex;
    justify-content: center;
    gap: 20px;
}

.social-icon {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
}

.social-icon:hover {
    border-color: var(--accent-color);
}

.social-icon span:first-child {
    font-size: 20px;
}

.social-icon span:last-child {
    font-size: 13px;
    color: var(--text-color);
}

.footer {
    padding: 15px 20px;
    display: flex;
    justify-content: center;
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
    background: var(--button-bg);
    color: var(--text-color);
}

.btn:hover {
    opacity: 0.9;
}
</style>
