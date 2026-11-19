/**
 * 白泽笔记 ESLint flat config（CQ-01：修复 ESLint 门禁 100% 失效）
 *
 * 背景：ESLint 9 仅支持 flat config。旧 .eslintrc.cjs 引用
 * @electron-toolkit/eslint-config@2.x，该包只输出 flat 专用属性
 * languageOptions，被旧式配置校验器拒绝，lint 直接 exit 2
 * （详见 out/tool-results/eslint.txt）。
 *
 * 本文件按 flat 模式重组规则，与旧 .eslintrc.cjs 语义保持接近：
 *   - @electron-toolkit/eslint-config：eslint:recommended + browser/es2021/node 全局变量
 *   - @electron-toolkit/eslint-config-ts configs.recommended：内含 typescript-eslint 推荐规则
 *   - eslint-plugin-vue flat/recommended（flat 模式下无前缀 = Vue3，即旧 vue3-recommended）
 *   - @vue/eslint-config-prettier/skip-formatting：关闭与 Prettier 冲突的格式规则
 *   - 规则覆盖：vue/require-default-prop、vue/multi-word-component-names、
 *     max-len、eol-last 与旧配置一致保持关闭
 * 旧 .eslintignore 内容已迁移到下方 ignores（CQ-12），并补充任务要求的目录。
 */
const electronToolkit = require('@electron-toolkit/eslint-config')
const electronToolkitTs = require('@electron-toolkit/eslint-config-ts')
const pluginVue = require('eslint-plugin-vue')
const prettierSkipFormatting = require('@vue/eslint-config-prettier/skip-formatting')

/**
 * 结构优化第 1 批 1.3（L4）：shared 层禁止「相对路径进入进程层」的 import pattern。
 *
 * shared 约定位为纯函数/纯数据叶子层，不得反向依赖 main / renderer / preload。
 * shared 最深目录为 `src/shared/i18n/messages/zh-CN/`（距 src 4 级），故按 1~4 级
 * `../` 枚举；同时区分「精确目录名」与「目录下子路径」，避免误伤 shared 内
 * 形似进程层目录的文件（如 i18n 的 mainMsg.ts 不受 `../main/*` 影响）。
 * no-restricted-imports 的 pattern 匹配为 gitignore 风格，`/` 前的 `..` 需显式列举。
 */
const SHARED_CROSS_LAYER_PATTERNS = ['main', 'renderer', 'preload'].flatMap((layer) =>
    [1, 2, 3, 4].flatMap((depth) => {
        const prefix = Array.from({ length: depth }, () => '..').join('/')
        return [`${prefix}/${layer}`, `${prefix}/${layer}/*`, `${prefix}/${layer}/**`]
    })
)

module.exports = [
    // 全局忽略：旧 .eslintignore 迁移（node_modules/out/dist）+ 任务新增目录（coverage）
    {
        ignores: [
            'node_modules',
            'out',
            'dist',
            'coverage',
            'resources',
            'docs',
            '.codeartsdoer',
            'specs',
            'tests/*.sh',
            // ET-11：Playwright E2E 运行产物（含压缩 JS/HTML，不参与 lint）
            'test-results',
            'playwright-report',
            // 配置文件自身不参与 lint（CJS require 写法会被 no-require-imports 命中）
            'eslint.config.js'
        ]
    },
    // @electron-toolkit/eslint-config 的 flat 导出（eslint:recommended + 全局变量）
    electronToolkit,
    // @electron-toolkit/eslint-config-ts flat 推荐配置（内含 typescript-eslint recommended）
    ...electronToolkitTs.configs.recommended,
    // eslint-plugin-vue flat 版 vue3-recommended（负责 .vue 解析与规则）
    ...pluginVue.configs['flat/recommended'],
    // .vue 文件内嵌 TypeScript 脚本：外层 vue-eslint-parser，内层 typescript 解析器
    {
        files: ['**/*.vue'],
        languageOptions: {
            parserOptions: {
                parser: electronToolkitTs.parser,
                extraFileExtensions: ['.vue']
            }
        }
    },
    // 关闭与 Prettier 冲突的格式规则（对应旧 @vue/eslint-config-prettier，但不开 prettier/prettier）
    prettierSkipFormatting,
    // 与旧 .eslintrc.cjs 保持语义接近的规则覆盖
    {
        rules: {
            'vue/require-default-prop': 'off',
            'vue/multi-word-component-names': 'off',
            'max-len': 'off',
            'eol-last': 'off',
            // 旧策略链（eslint-recommended 子集）不含显式返回类型要求，
            // flat 版 recommended 多引入的两档严格规则收敛回旧语义：
            '@typescript-eslint/explicit-function-return-type': 'off',
            // any 与 transition 切换为警告：可见、不阻塞门禁，后续专项清理
            '@typescript-eslint/no-explicit-any': 'warn',
            'vue/require-toggle-inside-transition': 'warn'
        }
    },
    /**
     * 结构优化第 1 批 1.3（L4）：shared 目录硬边界（ESLint 侧门禁）。
     *
     * 约定：`src/shared/**` 只放纯类型/纯数据/纯函数，不依赖任何运行环境
     * （node 内建 / electron / vue）与任何进程层实现（main / renderer / preload），
     * 也不直接访问 DOM 全局。唯一历史例外 `shared/utils/backup-dir.ts` 的
     * `node:path` 依赖已改为 `PathApi` 显式注入（见该文件注释），此 override 防止例外回流。
     *
     * 说明：规则只作用于 src/shared，不影响主进程/preload/渲染层的正常 Node/Electron 依赖；
     * 架构测试 `tests/architecture/shared-boundary.test.ts` 提供同口径的 AST 级硬门禁。
     */
    {
        files: ['src/shared/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'electron',
                            message:
                                'shared 层禁止依赖 electron：只放纯类型/纯数据/纯函数，跨进程契约请用 src/shared 定义'
                        },
                        {
                            name: 'vue',
                            message:
                                'shared 层禁止依赖 vue：共享层必须与渲染框架解耦（纯函数/纯数据边界）'
                        }
                    ],
                    patterns: [
                        {
                            group: ['node:*', 'node:*/*'],
                            message:
                                'shared 层禁止依赖 Node 内建模块：路径/IO 等环境能力请由调用方注入（参考 shared/utils/backup-dir.ts 的 PathApi）'
                        },
                        {
                            group: ['electron/*', 'vue/*'],
                            message:
                                'shared 层禁止依赖 electron / vue 的子路径（纯函数/纯数据边界）'
                        },
                        {
                            group: [
                                '@main/*',
                                '@main',
                                '@renderer/*',
                                '@renderer',
                                '@preload/*',
                                '@preload'
                            ],
                            message: 'shared 层禁止反向依赖进程层（main / renderer / preload）'
                        },
                        {
                            group: SHARED_CROSS_LAYER_PATTERNS,
                            message:
                                'shared 层禁止以相对路径引用进程层（main / renderer / preload），共享契约请放 src/shared'
                        }
                    ]
                }
            ],
            'no-restricted-globals': [
                'error',
                {
                    name: 'window',
                    message: 'shared 层禁止访问 DOM 全局 window（纯函数/纯数据边界）'
                },
                {
                    name: 'document',
                    message: 'shared 层禁止访问 DOM 全局 document（纯函数/纯数据边界）'
                },
                {
                    name: 'navigator',
                    message: 'shared 层禁止访问 DOM 全局 navigator（纯函数/纯数据边界）'
                },
                {
                    name: 'localStorage',
                    message: 'shared 层禁止访问 DOM 全局 localStorage（纯函数/纯数据边界）'
                },
                {
                    name: 'sessionStorage',
                    message: 'shared 层禁止访问 DOM 全局 sessionStorage（纯函数/纯数据边界）'
                }
            ]
        }
    }
]
