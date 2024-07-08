import './assets/main.css'
import './style/preview_font/atom-one-light.css'
import './style/sheet_dialog/normalize.css'
import './style/material/admonition.css'
import './lib/Katex/katex.css'
import './style/material/admonition.css'
import './style/material/gridcards.css'
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'
import 'os'
import { ContextMenu } from '@imengyu/vue3-context-menu'
import { createStore } from 'vuex'
import { createApp } from 'vue'
import App from './App.vue'

const store = createStore({
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
