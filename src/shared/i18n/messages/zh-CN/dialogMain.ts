/**
 * dialogMain 命名空间（中）
 * 主进程 HTML 对话框（src/main/dialogs/**）的标题、按钮、标签、占位符、提示与动态文案。
 * 词典值必须与提取前的中文原文逐字一致（保证中文界面 HTML 输出零变化）。
 */
export default {
    common: {
        alreadyExists: {
            title: '错误！',
            message: '出错啦',
            detail: '已经有一个相同的对话框，请先关闭！！！'
        }
    },
    confirmDelete: {
        title: '确认',
        message: '确定要删除[{path}]吗？',
        yes: '是',
        no: '否'
    },
    createFileFolder: {
        windowTitle: '新建',
        title: '新建',
        nameLabel: '名称：',
        namePlaceholder: '请输入名称',
        fileSuffixHint: '文件默认后缀 .md',
        // FE-09：空名称校验与创建失败提示
        nameRequired: '名称不能为空',
        createFailed: '创建「{name}」失败：{error}'
    },
    rename: {
        windowTitle: '重命名',
        title: '重命名',
        newNameLabel: '新名称：',
        newNamePlaceholder: '请输入新名称',
        // FE-09：空名称校验与重命名失败提示
        nameRequired: '新名称不能为空',
        renameFailed: '重命名「{path}」失败：{error}'
    },
    // FE-07：帮助 → 快捷键说明（此前 handler 仅 console.warn，菜单点击无任何界面反馈）
    shortcutKeys: {
        windowTitle: '键盘快捷键 - 白泽笔记',
        title: '键盘快捷键',
        intro: '以下为当前版本可用的快捷键；部分快捷键在编辑器聚焦时生效。',
        close: '关闭',
        groups: {
            file: '文件',
            edit: '编辑',
            format: 'Markdown 格式',
            view: '视图'
        },
        items: {
            newFile: '新建文件 / 文件夹',
            openFolder: '打开文件夹',
            save: '保存当前文件',
            reload: '从磁盘重新加载',
            relaunch: '重启应用',
            exit: '退出应用',
            undo: '撤销',
            redo: '重做',
            cut: '剪切',
            copy: '复制',
            paste: '粘贴',
            pasteImage: '粘贴剪贴板中的图片',
            find: '查找',
            replace: '替换',
            goLine: '跳转到行',
            headings: '一级 ~ 六级标题',
            bold: '粗体',
            italic: '斜体',
            underline: '下划线',
            strikethrough: '删除线',
            keyboard: '键盘按键样式',
            link: '插入链接',
            editMode: '纯编辑模式',
            previewMode: '纯预览模式',
            editPreviewMode: '编辑 + 预览模式',
            devTools: '开发者工具'
        }
    },
    helpContactUs: {
        windowTitle: '联系我们',
        title: '联系我们',
        authorDesc: '白泽笔记开发者',
        emailLabel: '邮箱',
        issueLabel: '问题反馈',
        issueAction: '提交 Issue 或建议',
        footer: '感谢您使用白泽笔记'
    },
    updateLog: {
        windowTitle: '更新日志 - 白泽笔记',
        title: '更新日志 - 白泽笔记',
        heading: '更新日志',
        updateDate: '更新日期：2026年11月15日 · 版本 1.3.0',
        updateSummary:
            '本版本完成安全加固、国际化、预览本地渲染与架构收口：127 项检查清单中 105 项完全修复、22 项部分修复，质量门禁全绿',
        highlightsTitle: '1.3.0 重大更新',
        highlights: {
            h1: '安全加固：P0 攻击链闭环（预览 DOMPurify 消毒 + IPC sender/路径校验 + 导航边界 + CSP）',
            h2: '国际化：中英双语全覆盖，系统设置切换即时生效（12 命名空间词典）',
            h3: '预览性能：本地单跳渲染（IPC 4 跳→0）+ 行内代码高亮提速约 124 倍 + KaTeX 缓存',
            h4: '本地图片预览修复：images/ 相对路径图片在预览区正常显示',
            h5: '架构收口：IPC 通道唯一真源（123→86）、注册一次性化、监听台账全纳管、配置单真源',
            h6: '质量门禁：类型检查 0 错误、ESLint 0 错误/0 警告、依赖审计 0 漏洞、2243 用例全通过',
            h7: '包体积：安装包 233MB → 109.8MB（-53%）；死代码清理 10,403 行'
        },
        groups: {
            coreFramework: '核心框架',
            electronEcosystem: 'Electron 生态',
            editorRendering: '编辑器与渲染',
            dataTools: '数据与工具库',
            devTools: '开发工具'
        },
        table: {
            dependency: '依赖',
            oldVersion: '旧版本',
            newVersion: '新版本',
            type: '类型'
        },
        typeLabels: {
            major: '大版本',
            minor: '小版本',
            patch: '补丁',
            keep: '保持',
            added: '新增',
            removed: '移除'
        },
        codeFixesTitle: '代码适配修复',
        codeFixes: {
            materialRender: 'mkdocs-material：admonition/tabbed set 重构为 markdown-it 原生 block 插件',
            editorOptions: 'preview-markdown-it.ts：关闭 highlightAuto 全语言探测（auto:false）+ 高亮守卫',
            hemyEditorRender: 'preview-local-render.ts：本地图片 file:// URL 转换（toFileUrl + encodeURI）',
            tsconfigWeb: 'tsconfig.*：开启 noImplicitAny 并修复 46 处隐式 any 诊断',
            vitest: 'tsconfig.test.json：测试目录纳入类型检查（235 处诊断修复）',
            encryptDecrypt: 'DOMPurify 配置：URI 白名单追加 file: 协议（本地图片 src 不再被剥离）',
            useConfigStore: 'CSP：img-src 增加 file:，放行本地相对路径图片',
            preloadTypes: 'IPC 通道常量：123→86 统一 baize:<domain>:<name> 并清理死通道',
            quickLinkXss: '安全修复：TOC/NaviTab/Mermaid 预览 v-html 移除或消毒（XSS 纵深）',
            cleanup: '死代码清理 10,403 行；主进程产物 -44%；@ts-ignore 清零'
        },
        verifyTitle: '验证结果',
        verify: {
            typescriptNode: 'TypeScript (main+preload): 0 错误',
            typescriptWeb: 'TypeScript (renderer): 0 错误',
            eslint: 'ESLint: 0 错误 / 0 警告',
            unitTests: '单元测试: 133 文件 / 2243 用例全通过',
            audit: '依赖审计: 全量与生产 0 漏洞',
            build: '打包构建: 安装包 109.8MB（-53%）'
        },
        footer: '白泽笔记 v1.3.0 · 基于 Electron 43 + Vue 3.5 + TypeScript 6.0'
    },
    releaseNotes: {
        windowTitle: '版本发布 v{version} - 白泽笔记',
        notFound: '未找到版本 {version} 的发布说明',
        releaseDate: '发布日期：{date}',
        footer: '白泽笔记 v{version} · {date}',
        featuresTitle: '新功能',
        fixesTitle: '问题修复',
        improvementsTitle: '优化改进',
        techStackTitle: '技术栈',
        v130: {
            title: '1.3.0 全面治理版',
            highlights: {
                h1: 'P0 安全攻击链闭环：预览消毒 + IPC 校验 + 路径守卫',
                h2: '国际化（i18n）：中英双语全覆盖',
                h3: '预览本地单跳渲染，性能大幅提升',
                h4: '质量门禁全绿：类型检查/ESLint/审计 0 问题'
            },
            features: {
                f1: '新增 IPC 授权与 Path Guard 路径守卫',
                f2: '新增 CSP 与导航边界安全加固',
                f3: '新增国际化词典（12 命名空间双语）'
            },
            improvements: {
                i1: '预览渲染 IPC 4 跳→0，行内代码高亮提速约 124 倍',
                i2: '目录树 fs.watch 增量重扫（单文件变更快 94.8%）',
                i3: '安装包体积 233MB→约 110MB',
                i4: 'IPC 通道 123→86 统一命名，死代码清理 10,403 行'
            },
            fixes: {
                x1: '修复自动保存开关反向、间隔不生效问题',
                x2: '修复文件编码探测缺失导致 GBK 覆盖乱码问题'
            }
        },
        v122: {
            title: 'Electron 43 重大升级',
            highlights: {
                h1: 'Electron 38 → 43，跨 5 个大版本升级',
                h2: '同步升级 40+ 依赖包到最新版本',
                h3: '修复 78 个 TypeScript 类型错误',
                h4: '修复 3 个 XSS 安全风险'
            },
            features: {
                f1: '新增"更新日志"对话框，展示依赖升级详情',
                f2: '关于页面新增 Monaco Editor 和 markdown-it 版本显示',
                f3: '版本发布子菜单，支持查看各版本发布说明'
            },
            improvements: {
                i1: 'markdown-it 14 → 15，适配 highlight 选项 API 变化',
                i2: 'monaco-editor 0.55 → 0.56，适配 hover 类型变化',
                i3: 'vue-tsc 2 → 3，关闭 noUnusedLocals 适配',
                i4: 'vitest 3 → 4，解决 Node.js 24 兼容性',
                i5: 'electron-store 8 → 11，electron-builder 24 → 26'
            },
            fixes: {
                x1: '修复 generate-version-config.js 在 Node.js 环境下 electron/chrome 版本为空的问题',
                x2: '修复 ShowQuickLinkSettingDialog.ts XSS 安全风险',
                x3: '修复 encrypt_decrypt.ts crypto API 类型安全问题',
                x4: '修复 MermaidEditDialog.vue handleClose 生命周期 bug'
            }
        },
        v121: {
            title: '全量扫描与代码优化',
            highlights: {
                h1: '使用 Deepseek 进行全量代码扫描和优化',
                h2: '修复多个 bug 和缺陷',
                h3: '代码质量全面提升'
            },
            improvements: {
                i1: '项目代码全量扫描优化',
                i2: '修复编译和运行时缺陷'
            }
        },
        v120: {
            title: '图标与主题优化',
            highlights: {
                h1: '应用图标全面更新',
                h2: '新增四个主题',
                h3: '主题设置支持选择后立即更新'
            },
            features: {
                f1: '新增四个主题样式',
                f2: '应用图标重新设计'
            },
            improvements: {
                i1: '主题设置选择后立即生效，无需重启',
                i2: '删除不使用的文件，清理项目'
            }
        },
        v115: {
            title: '对话框架构重大更新',
            highlights: {
                h1: '将部分对话框从 JSDOM 转换为 Vue 对话框',
                h2: '项目架构变更',
                h3: 'IPC 通信优化'
            },
            features: {
                f1: '对话框组件从 JSDOM 迁移到 Vue 组件',
                f2: '消息处理逻辑重构'
            },
            improvements: {
                i1: 'IPC 通信机制优化',
                i2: '对话框组件更新',
                i3: '项目架构整体变更'
            }
        },
        v113: {
            title: '进程与文件修复',
            highlights: {
                h1: '修复进程残留问题',
                h2: '修复文件重新打开后未加载最新内容问题',
                h3: '修复从磁盘重新加载后文件内容未更新问题'
            },
            fixes: {
                x1: '修复应用关闭后进程残留问题',
                x2: '修复文件重新打开后未加载最新内容的问题',
                x3: '修复从磁盘重新加载后文件内容未更新的问题'
            }
        },
        v112: {
            title: '项目优化与 UI 样式更新',
            highlights: {
                h1: '优化项目，删除冗余文件和函数',
                h2: '更新主题 UI 样式标准',
                h3: '增加窗口的模态/非模态控制'
            },
            improvements: {
                i1: '删除冗余文件和函数',
                i2: '主题 UI 样式标准化',
                i3: '窗口模态/非模态控制'
            }
        },
        v111: {
            title: '主题配置与文件记忆',
            highlights: {
                h1: '主题配置支持应用主题和编辑器主题分开设置',
                h2: '增加保存文件和目录记忆功能',
                h3: '编辑区适配主题更改'
            },
            features: {
                f1: '应用主题和编辑器主题分开设置',
                f2: '应用再次打开后自动加载上次的文件和目录'
            },
            improvements: {
                i1: '编辑区适配主题更改'
            }
        },
        v110: {
            title: '文件导入导出功能',
            highlights: {
                h1: '增加文件导入导出基本功能框架',
                h2: '修正编译打包错误'
            },
            features: {
                f1: '文件导入导出基本功能框架'
            },
            fixes: {
                x1: '修正编译打包错误'
            }
        },
        v102: {
            title: '图标与文字调整',
            highlights: {
                h1: '修改文字图标大小',
                h2: '界面细节调整'
            },
            improvements: {
                i1: '修改文字图标大小'
            }
        },
        v101: {
            title: '图标设计与快速链接',
            highlights: {
                h1: '增加图标设计',
                h2: '编译输出安装包可指定安装目录',
                h3: '增加支持自定义快速链接'
            },
            features: {
                f1: '应用图标设计',
                f2: '编译输出安装包支持自定义安装目录',
                f3: '自定义快速链接功能'
            }
        },
        v100: {
            title: '初始版本发布',
            highlights: {
                h1: '白泽笔记初始版本',
                h2: '基于 Electron + Vue + TypeScript 的 Markdown 笔记应用'
            },
            features: {
                f1: 'Markdown 编辑与预览',
                f2: '文件管理器',
                f3: '主题系统',
                f4: '插件系统'
            }
        }
    }
}
