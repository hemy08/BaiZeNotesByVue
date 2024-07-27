import './assets/main.css'
import './style/preview_font/atom-one-light.css'
import './style/sheet_dialog/normalize.css'
import './style/material/admonition.css'
import './lib/Katex/katex.css'
import './style/material/admonition.css'
import './style/material/gridcards.css'
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'
import 'os'
import { createApp } from 'vue'
import themeSetting from './dialogs/ThemeSet/themeSetting.vue'

const themeDialog = createApp(themeSetting)
themeDialog.mount('#theme')
