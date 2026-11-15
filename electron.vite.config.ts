import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
// import { copy } from 'vite-plugin-copy'
// PF-03/CMP-28：vite-plugin-monaco-editor@1.1.0（2022 年发布，面向 vite 2.x）与 vite 8 / electron-vite 6
// 不兼容（writeBundle 钩子与旧版 transformIndexHtml 返回结构已失效），弃用插件，改为手动 worker 注册：
// 见 src/renderer/src/components/Markdown/monaco-worker-setup.ts（?worker 导入 + MonacoEnvironment.getWorker）。
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    main: {
        // ET-42：electron-vite 6 稳定版已将 externalizeDepsPlugin 标记为 @deprecated
        // （类型声明中写明 use `build.externalizeDeps` config option instead），
        // 迁移到 v6 推荐的 build.externalizeDeps 配置。main 的默认值即 true，这里显式声明以保持语义清晰。
        build: {
            externalizeDeps: true
        }
    },
    preload: {
        build: {
            // 【关键修复】Sandboxed preload 无法 require 相对路径文件：
            // 之前 index/dialog 两个入口共享 src/shared/ipc-channels.ts，Rollup 把它提取成
            // out/preload/chunks/ipc-channels-*.js，产物里出现 require("./chunks/...")；
            // 主窗口与对话框均为 sandbox: true，该 require 会在 preload 启动时抛错，
            // 导致 contextBridge 未执行 → 渲染层 window.electron / window.api 缺失 →
            // 欢迎页「打开文件/文件夹」与窗口「最小化/最大化/关闭」全部无反应。
            // isolatedEntries 让每个入口自包含（无共享 chunk）；按 electron-vite 要求，
            // 同时禁用 externalizeDeps，第三方依赖（@electron-toolkit/preload）一并内联，
            // 这是 Electron sandbox preload 的硬性要求。
            isolatedEntries: true,
            // electron 本身由 Electron 运行时提供（rollup 视为外部），其余依赖全部内联
            externalizeDeps: false,
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
            alias: [
                {
                    find: '@renderer',
                    replacement: resolve('src/renderer/src')
                },
                {
                    find: '@mainer',
                    replacement: resolve('src/main')
                },
                // PF-03/CMP-28：裸包名 'monaco-editor' 精确重定向到 editor.api（不含 LSP 客户端、
                // 全量基础语言与 css/html/json/ts 语言服务）。全量入口 editor.main 不再进入主 chunk；
                // 编辑器 contributions、精选语言与 worker 由 Markdown/monaco-worker-setup.ts 按需导入。
                // 注意：@rollup/plugin-alias 对字符串 find 会做「前缀替换」（find + '/xxx' 也命中），
                // 会破坏 'monaco-editor/esm/...' 子路径导入，因此裸包名用正则做精确匹配。
                {
                    find: /^monaco-editor$/,
                    replacement: resolve('node_modules/monaco-editor/esm/vs/editor/editor.api.js')
                },
                // monaco-editor 的 esm 子路径（contributions/语言定义/worker 入口）统一解析到
                // 本仓库 node_modules 内的 esm 目录，绕开 exports 模式映射在 vite 8 下的不确定性
                {
                    find: /^monaco-editor\//,
                    replacement: `${resolve('node_modules/monaco-editor')}/`
                }
            ]
        },
        plugins: [vue({})]
    }
})
