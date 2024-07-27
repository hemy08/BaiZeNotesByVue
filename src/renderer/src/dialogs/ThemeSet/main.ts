import { createApp } from 'vue'
import themeSetting from './dialogs/ThemeSet/themeSetting.vue'

const themeDialog = createApp(themeSetting)
themeDialog.mount('#theme')
