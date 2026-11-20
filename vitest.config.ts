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
        // P1-3（首屏 i18n 拆包）：shared/i18n 改为按语言动态加载后，单测在模块顶层就要能
        // 同步读取中英两套词典（词典一致性用例构建 zh/en 键值映射、组件用例断言具体文案）。
        // 该 setup 用静态 import + 同步 register 预载双语——只影响测试进程，不进入构建产物；
        // 渲染层的首屏单语言行为由 tests/unit/i18n-lazy.test.ts 与 budget 门禁守护。
        setupFiles: [resolve(__dirname, 'tests/unit/helpers/i18n-preload.ts')],
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
            // 2026-11-20（P1-6 覆盖率盲区补测第二批）：保留全局红线不动，按补测后实测值
            // 上调已有 5 个目录 glob 下限（口径：实测 - 2pp 取整；实测时间为第二批补测完成后，
            // 顺序为 lines / statements / functions / branches）：
            //   src/main/window/**                             实测 100.00 / 100.00 / 100.00 / 93.55
            //   src/main/renders/**                            实测 97.24 / 97.25 / 97.44 / 91.76
            //   src/preload/**                                 实测 93.41 / 93.48 / 90.91 / 96.67
            //   src/renderer/src/components/WorkSpaceArea/**   实测 95.60 / 95.76 / 94.59 / 97.26
            //   src/renderer/src/components/Markdown/**        实测 90.54 / 90.29 / 88.40 / 80.29
            // 2026-11-20（P1-6 覆盖率盲区补测第三批）：Markdown/** 补测本批 hemy-editor-shortcut
            // 后在干净基线（7f457ae）实测 91.31 / 91.05 / 91.98 / 80.81；但集成 main 最新提交
            // （6ce6aea「KaTeX CSS 按需」新增 preview-katex-assets.ts）后实测为
            // 90.12 / 89.90 / 84.20 / 81.17（functions 被未覆盖的新模块拉低）。为保持门禁可过，
            // 本目录阈值取「集成实测 - 2pp 取整」：lines 88 / statements 88 / functions 82 /
            // branches 79；其中 functions 由 86 下调至 82（待 KaTeX 资源模块补测后回调），
            // 其余三项较第二批不下调且 branches 上调。同时新增 4 个本轮显著提升目录的 glob
            // 下限（同为「实测 - 2pp 取整」，集成 HEAD 实测值与净基线一致）：
            //   src/renderer/src/components/HemyTools/**       实测 96.76 / 96.77 / 100.00 / 88.62
            //   src/renderer/src/components/PluginTools/**     实测 93.16 / 92.71 / 87.80 / 89.48
            //   src/renderer/src/common/**                     实测 96.58 / 96.50 / 100.00 / 88.54
            //   src/renderer/src/composables/**                实测 93.90 / 93.15 / 93.02 / 84.91
            // 2026-11-20（P1-6 覆盖率盲区补测第四批）：在第三批 glob 基础上按本轮实测上调。
            // 本轮补测覆盖 preview-highlight 全量惰性语言/word-worker 入口/preview-md-inline/media
            // 分支/MarkdownPreview·MarkdownEdit 组件事件/App.vue 降级/主进程小模块等，实测
            // （321 文件，口径 lines / statements / functions / branches，取整为「实测 - 2pp」）：
            //   src/renderer/src/components/Markdown/**       实测 95.13 / 94.92 / 95.87 / 86.08
            //   src/renderer/src/components/PluginTools/**     实测 94.57 / 94.37 / 87.80 / 93.19
            //   src/renderer/src/components/HemyTools/**       实测 96.76 / 96.77 / 100.00 / 88.62
            //   src/main/utils/**（新增 glob）                 实测 89.25 / 89.22 / 94.83 / 84.03
            // 说明：glob 阈值只约束匹配文件；未匹配文件仍适用上方全局阈值。
            // 并发批次（IPC 拆分 / 对话框可访问性）仍在主工作区推进，阈值统一保留 2pp 余量。
            // 2026-11-20（P1-6 覆盖率盲区补测第五批）：在第四批 glob 基础上按本批实测上调，
            // 并新增 main/config、main/ipc 两个主进程目录下限（本批补测重点域）。实测口径
            // （326 文件，lines / statements / functions / branches）：
            //   src/main/utils/**                              实测 96.76 / 96.69 / 98.15 / 92.25
            //   src/main/config/**（新增）                     实测 95.77 / 95.87 / 98.82 / 89.37
            //   src/main/ipc/**（新增）                        实测 97.07 / 96.50 / 98.26 / 88.22
            // 阈值统一取「实测 - 2pp 取整」，保留并行批次浮动余量；全局红线不下调。
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
                    lines: 95,
                    statements: 95,
                    functions: 95,
                    branches: 89
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
                    lines: 93,
                    statements: 92,
                    functions: 93,
                    branches: 84
                },
                'src/renderer/src/components/HemyTools/**': {
                    lines: 94,
                    statements: 94,
                    functions: 98,
                    branches: 86
                },
                'src/renderer/src/components/PluginTools/**': {
                    lines: 92,
                    statements: 92,
                    functions: 86,
                    branches: 90
                },
                'src/renderer/src/common/**': {
                    lines: 94,
                    statements: 94,
                    functions: 98,
                    branches: 86
                },
                'src/renderer/src/composables/**': {
                    lines: 91,
                    statements: 91,
                    functions: 91,
                    branches: 82
                },
                'src/main/utils/**': {
                    lines: 94,
                    statements: 94,
                    functions: 96,
                    branches: 90
                },
                'src/main/config/**': {
                    lines: 93,
                    statements: 93,
                    functions: 96,
                    branches: 87
                },
                'src/main/ipc/**': {
                    lines: 95,
                    statements: 94,
                    functions: 96,
                    branches: 86
                }
            }
        }
    }
})
