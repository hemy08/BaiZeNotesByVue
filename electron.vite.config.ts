import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { copy } from 'vite-plugin-copy'
// import monacoEditorPlugin from 'vite-plugin-monaco-editor'
import vue from '@vitejs/plugin-vue'

function monacoConfig() {
  return {
    define: {
      'process.env': process.env
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    ...monacoConfig()
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@mainer': resolve('src/main'),
        '@libs': resolve('src/renderer/src/lib')
      }
    },
    plugins: [
      vue(),
      copy({
        targets: [{ src: 'src/renderer/src/lib', dest: 'out/renderer/src/lib' }]
      })
    ],
    ...monacoConfig()
  }
})
