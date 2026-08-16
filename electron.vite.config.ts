import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
// import { copy } from 'vite-plugin-copy'
// import monacoEditorPlugin from 'vite-plugin-monaco-editor'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/preload'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          dialog: resolve(__dirname, 'src/preload/dialog.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@mainer': resolve('src/main')
      }
    },
    plugins: [vue()]
  }
})
