import './assets/main.css'
import './styles/theme.css'
import '@renderer/styles/preview_font/atom-one-light.css'
import '@renderer/styles/sheet_dialog/normalize.css'
import '@renderer/styles/material/admonition.css'
import 'katex/dist/katex.css'
import '@renderer/styles/material/admonition.css'
import '@renderer/styles/material/gridcards.css'
import '@renderer/styles/material/tableset.css'
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'
import { ContextMenu } from '@imengyu/vue3-context-menu'
import { createStore, Store } from 'vuex'
import { createApp } from 'vue'
import App from './App.vue'

const store : Store<any> = createStore({
    state: {
        header: ''
    },
    mutations: {
        setFormatHeader(state, value) {
            state.header = value
        }
    },
    actions: {
        updateFormatHeader({ commit }, value) {
            commit('setFormatHeader', value)
        }
    }
})

const app = createApp(App)
app.use(store)
app.component('ContextMenu', ContextMenu)
app.mount('#app')
