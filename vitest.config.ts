import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    resolve: {
        // ET-8：vitest 复用 electron.vite.config.ts 的别名解析，保证测试与构建使用同一套模块图。
        // 第 4 批 P3 清理：删除 @mainer（src/main）死别名——全仓 0 引用。
        // 构建侧（electron.vite.config.ts）的 monaco 正则别名此前未同步到 vitest：
        // monaco-editor 的 package.json exports 仅声明 `./*.js → ./esm/vs/*.js`，
        // node SSR 解析深层 ESM 子路径时不一定会走 exports 映射，容易出现
        // "Cannot find package 'monaco-editor'"；补齐后测试可直接 import 真实 monaco 入口，
        // 不再必须对裸包名做 vi.mock 才能解析。
        alias: [
            {
                find: '@renderer',
                replacement: resolve(__dirname, 'src/renderer/src')
            },
            // 裸包名 'monaco-editor' 精确重定向到 editor.api（不含 LSP/全量语言服务），
            // 与构建侧一致；用正则做精确匹配，避免字符串 find 的前缀替换破坏子路径导入。
            {
                find: /^monaco-editor$/,
                replacement: resolve(
                    __dirname,
                    'node_modules/monaco-editor/esm/vs/editor/editor.api.js'
                )
            },
            // monaco-editor 的 esm 子路径（contributions / 语言定义 / worker 入口）统一
            // 解析到本仓库 node_modules 内的 esm 目录，绕开 exports 模式映射的不确定性。
            {
                find: /^monaco-editor\//,
                replacement: `${resolve(__dirname, 'node_modules/monaco-editor')}/`
            }
        ]
    },
    test: {
        globals: true,
        environment: 'node',
        // 2026-11-20（Node 26.13.1 升级）：forks 池在 Node 26 下 crypto.randomBytes
        // 触发 OpenSSL 熵源错误（1C8000BA），threads 池正常；统一改用线程池。
        pool: 'threads',
        // Node 26 + 大型静态扫描/集成测试在慢机器上偶发 >5s（默认 5s 超时），统一放宽。
        testTimeout: 15_000,
        // 结构优化第 1 批 1.1（H1）：架构依赖边界测试独立于 tests/unit 目录，
        // 补一条 include 使其随 `npm test` 自动发现（原 include 保持不变）。
        include: ['tests/unit/**/*.test.ts', 'tests/architecture/**/*.test.ts'],
        // ET-17：测试临时目录统一清理。
        // globalSetup 在全部 worker 结束后（主进程内串行）删除本轮收尾时 %TEMP%/baize-*
        // 目录；这些目录由测试按需创建（mkdir recursive / mkdtemp），跨运行无保留价值。
        // 采用 globalSetup 而不是 setupFiles+afterAll，是因为各 worker 并行运行时
        // afterAll 清理会与其他 worker 正在使用的临时目录竞争（详见 helpers 注释）。
        globalSetup: [resolve(__dirname, 'tests/unit/helpers/tmpdir-global-setup.ts')],
        // ET-18：用例级 mock 隔离。restoreMocks 在每个用例前恢复 vi.spyOn 的原始实现，
        // 避免同一文件内跨用例共享 spy 状态造成顺序依赖；全量 118 文件 / 1896 用例实测全绿。
        restoreMocks: true,
        // clearMocks 保持关闭（评估后按需关闭）：开启后会在每个用例前清空 mock.calls，
        // 破坏「模块级一次性 import 触发、后续用例断言调用记录」的测试。
        // 例如 tests/unit/preload-index.test.ts 在 import 时调用 contextBridge.exposeInMainWorld，
        // 用例只断言这次调用的参数；clearMocks 会把记录清掉导致 7 个用例全红。
        // 需要清调用记录的文件请继续使用局部 vi.clearAllMocks()/mockClear()（原有 17 个文件如此）。
        clearMocks: false,
        coverage: {
            provider: 'v8',
            // CMP-02：覆盖范围扩大至渲染端组件与组合式函数——
            // 原 include 把占代码量最大的 components/composables 排除在覆盖率统计之外。
            // CMP-03：配套安装 @vitest/coverage-v8（与 vitest 同版本 4.1.11）。
            // ET-5：统计口径补全为「src 全量代码」——此前漏掉 preload（2 文件 121 行）、
            // shared（38 文件 4,409 行：ipc 通道常量 / i18n 逻辑 / 跨进程共享类型）、
            // 渲染进程入口（App.vue 221 行 + main.ts 31 行），合计 42 文件 4,685 行
            // （约占 src 44,610 行的 10.5%）不在统计内，导致覆盖率只代表部分模块。
            include: [
                'src/main/**/*.ts',
                'src/preload/**/*.ts',
                'src/shared/**/*.ts',
                'src/renderer/src/**/*.{ts,vue}'
            ],
            // ET-5：仅排除「无运行时逻辑」的文件，避免统计口径失真：
            // 1) `**/*.d.ts`（含 renderer/src/env.d.ts、preload/index.d.ts）：纯类型声明，
            //    编译产物为空模块，不存在可执行的语句/分支/函数；
            // 2) `src/shared/i18n/messages/**`：纯 i18n 词典数据（24 个常量表约 3,600 行），
            //    模块被 static import 时整体执行，纳入统计等于用「数据被执行」抬高百分比；
            //    其质量由 tests/unit/i18n-dict.test.ts 的键集合对齐用例守护。
            // 注意：shared/types（跨进程契约类型）、shared/ipc-channels（通道唯一真源）
            // 与 shared/i18n/index.ts（回退/翻译逻辑）均保留在统计内。
            exclude: ['**/*.d.ts', 'src/shared/i18n/messages/**'],
            // ET-6：最低覆盖率红线（防回归）。
            // 口径：src 全量代码（main/preload/shared/renderer 全部，见上方 include/exclude）。
            // 2026-11-15 18:50 口径补全后 `npm run test:coverage` 全量实测（130 测试文件 / 2080 用例）：
            // statements 82.09% / branches 77.01% / functions 75.41% / lines 82.40%
            // （最终计入统计 196 个文件，其中 18 个纯类型/纯 re-export 模块无可执行指标，不进入分母）。
            // 阈值取实测下沿约 2pp（statements 80 / branches 75 / functions 73 / lines 80），
            // 既能拦住明显回归，又给正常迭代留出浮动空间；补测提升覆盖率后再逐档上调。
            //
            // 2026-11-20（P1-6 覆盖率盲区补测）：保留全局红线不动，新增「核心目录 glob 下限」。
            // 背景：全局平均值会稀释单目录退化（window-manager 分支曾仅 32.25%、preload/dialog
            // 62.5%、WorkSpace.vue 0% 都不触发全局阈值）。glob 下限按补测后实测值 - 2pp 取整设定：
            //   src/main/window/**                             实测 100 / 93.55 / 100 / 100
            //   src/main/renders/**                            实测 71.98 / 61.18 / 74.36 / 72.38
            //   src/preload/**                                 实测 93.48 / 96.67 / 90.91 / 93.41
            //   src/renderer/src/components/WorkSpaceArea/**   实测 95.76 / 97.26 / 94.59 / 95.60
            //   src/renderer/src/components/Markdown/**        实测 85.97 / 74.61 / 81.60 / 86.28
            // 说明：glob 阈值只约束匹配文件；未匹配文件仍适用上方全局阈值。
            thresholds: {
                lines: 80,
                statements: 80,
                functions: 73,
                branches: 75,
                'src/main/window/**': {
                    lines: 98,
                    statements: 98,
                    functions: 98,
                    branches: 91
                },
                'src/main/renders/**': {
                    lines: 70,
                    statements: 69,
                    functions: 72,
                    branches: 59
                },
                'src/preload/**': {
                    lines: 91,
                    statements: 91,
                    functions: 88,
                    branches: 94
                },
                'src/renderer/src/components/WorkSpaceArea/**': {
                    lines: 93,
                    statements: 93,
                    functions: 92,
                    branches: 95
                },
                'src/renderer/src/components/Markdown/**': {
                    lines: 84,
                    statements: 83,
                    functions: 79,
                    branches: 72
                }
            }
        }
    }
})
