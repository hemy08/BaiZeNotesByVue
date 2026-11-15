<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsNetwork.tools.latexEditor.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px; margin-top: 10px"></div>
        <p style="color: grey; margin-top: 10px">
            <strong>LaTeX</strong>{{ t('toolsNetwork.tools.latexEditor.introPronounce')
            }}<a
                href="https://zh.wikipedia.org/wiki/%E8%8E%B1%E6%96%AF%E5%88%A9%C2%B7%E5%85%B0%E6%B3%A2%E7%89%B9"
                target="_blank"
                >{{ t('toolsNetwork.tools.latexEditor.lamport') }}</a
            >{{ t('toolsNetwork.tools.latexEditor.introOrigin') }} <br /><strong>MathJax</strong
            >{{ t('toolsNetwork.tools.latexEditor.introLibrary') }}
            {{ t('toolsNetwork.tools.latexEditor.introPage')
            }}<a href="https://www.mathjax.org/" target="_blank">MathJax</a
            >{{ t('toolsNetwork.tools.latexEditor.introExport') }}
        </p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://www.latexlive.com/home')"
        >
            https://www.latexlive.com/home
        </a>
        <div id="input-area" class="container area" style="margin-top: 20px">
            <div class="card">
                <div class="card-header">
                    <h2>{{ t('toolsNetwork.tools.latexEditor.inputArea') }} <span>Input</span></h2>
                </div>
                <div class="card-body">
                    <div id="wrap_shortcut" class="form-group">
                        <ul id="ul_navtabs" class="nav nav-tabs">
                            <li class="nav-item">
                                <a id="a_shortcut_0" class="nav-link active" href="##">{{
                                    t('toolsNetwork.tools.latexEditor.quickTools')
                                }}</a>
                            </li>
                            <li class="nav-item">
                                <a id="a_shortcut_1" class="nav-link" href="##">{{
                                    t('toolsNetwork.tools.latexEditor.formulaTemplates')
                                }}</a>
                            </li>
                            <li class="nav-item">
                                <a id="a_shortcut_mathpix" class="nav-link" href="##">{{
                                    t('toolsNetwork.tools.latexEditor.imageRecognition')
                                }}</a>
                            </li>
                        </ul>
                    </div>
                    <div id="wrap_txtainput" class="form-group">
                        <textarea
                            id="txta_input"
                            class="form-control"
                            :placeholder="t('toolsNetwork.tools.latexEditor.placeholder')"
                            maxlength="16384"
                            spellcheck="false"
                            wrap="off"
                        ></textarea>
                        <div id="div_copy" class="form-control"></div>
                    </div>
                </div>
            </div>
        </div>
        <div id="output-area" class="container area">
            <div class="card">
                <div class="card-header">
                    <h2>
                        {{ t('toolsNetwork.tools.latexEditor.outputArea') }} <span>Output</span>
                    </h2>
                </div>
                <div class="card-body">
                    <div class="form-group">
                        <div id="wrap_output" class="output"></div>
                    </div>
                    <div id="wrap_action"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { t } from '../../../common/i18n'

const props = defineProps({
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

function openUrl(link: string) {
    window.open(link, '_blank', 'noopener, noreferrer')
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.card {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    word-wrap: break-word;
    background-color: #fff;
    background-clip: border-box;
    border: 1px solid rgba(0, 0, 0, 0.125);
    border-radius: 0.25rem;
    margin-bottom: 1rem;
}

.card-header {
    padding: 0.75rem 1.25rem;
    margin-bottom: 0;
    background-color: rgba(0, 0, 0, 0.03);
    border-bottom: 1px solid rgba(0, 0, 0, 0.125);
}

.card-body {
    flex: 1 1 auto;
    min-height: 1px;
    padding: 1.25rem;
}

.form-group {
    margin-bottom: 1rem;
}

.nav {
    display: flex;
    flex-wrap: wrap;
    padding-left: 0;
    margin-bottom: 0;
    list-style: none;
    border-bottom: 1px solid #dee2e6;
}

.nav-item {
    margin-bottom: -1px;
}

.nav-link {
    display: block;
    padding: 0.5rem 1rem;
    border: 1px solid transparent;
    border-top-left-radius: 0.25rem;
    border-top-right-radius: 0.25rem;
}

.nav-link.active {
    color: #495057;
    background-color: #fff;
    border-color: #dee2e6 #dee2e6 #fff;
}
</style>
