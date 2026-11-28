/**
 * menu 命名空间（中）
 *
 * 壳层菜单词条：菜单栏顶层分组（文件/编辑/视图/编码/插入/设置/工具/插件/在线/GitHub/帮助）
 * 与全部菜单项标签。菜单数据（MenuBar/menu-config.ts、menu-consts.ts、
 * common/templates.ts）只存 labelKey，由 MenuBar.vue 渲染时调用 t(labelKey) 输出，
 * 切换语言即时生效；中文值必须与抽取前界面文案逐字一致。
 */
export default {
    // 菜单栏自身的可访问名称（视觉升级 P1-B2：role=menubar 需要可访问名称；
    // 只由 MenuBar.vue 的 aria-label 消费，不出现在可见文案中）
    menubar: {
        label: '菜单栏'
    },
    file: {
        label: '文件',
        new: '新建',
        openFile: '打开文件',
        openFolder: '打开文件夹',
        // 「文件」菜单 → 最近文件/最近文件夹（子菜单内容由 MenuBar.vue 打开菜单时动态注入，
        // 各最多 20 项；无记录时显示 recentEmpty 禁用占位项）
        recentFiles: '最近文件',
        recentFolders: '最近文件夹',
        recentEmpty: '（暂无记录）',
        import: {
            label: '从文件导入',
            word: '从 Word 导入',
            html: '从 HTML 导入',
            json: '从 JSON 导入',
            yaml: '从 YAML 导入',
            xml: '从 XML 导入',
            text: '从文本文件导入'
        },
        export: {
            label: '导出到文件',
            word: '导出为Word',
            json: '导出为JSON',
            xml: '导出为XML',
            yaml: '导出为YAML',
            html: '导出为HTML（自包含）',
            pdf: '导出为PDF',
            epub: '导出为EPUB电子书',
            slides: '导出为幻灯片（HTML）'
        },
        printPreview: '打印预览',
        print: '打印',
        saveAs: '另存为',
        reload: '从磁盘重新加载',
        relaunch: '重启应用',
        exit: '退出'
    },
    edit: {
        label: '编辑',
        goLine: '跳转到行',
        find: '查找',
        replace: '替换',
        workspaceSearch: '在工作区中搜索',
        commandPalette: '命令面板',
        quickOpen: '快速打开文件',
        documentHistory: '文档历史…',
        markdownLint: 'Markdown 检查/格式化…',
        writingStyleCheck: '写作风格检查…',
        frontMatter: '文档属性…',
        knowledge: '知识库',
        knowledgeTags: '标签索引…',
        knowledgeLinks: '链接检查…',
        knowledgeBacklinks: '反向链接…',
        attachments: '附件管理…'
    },
    view: {
        label: '视图',
        editMode: '编辑模式',
        previewMode: '预览模式',
        editPreviewMode: '编辑/预览模式',
        devTools: '开发人员工具',
        toggleResourceManager: '显示/隐藏资源管理器',
        toggleLineNumber: '显示/隐藏行号',
        toggleWhitespace: '显示/隐藏空白字符',
        toggleOutline: '显示/隐藏文章大纲',
        writingMode: '写作模式',
        layoutProfiles: '布局配置…',
        fold: {
            label: '折叠/展开标题',
            allFold: '全部折叠',
            allExpand: '全部展开',
            level1: '一级标题',
            level2: '二级标题',
            level3: '三级标题',
            level4: '四级标题',
            level5: '五级标题',
            level6: '六级标题'
        }
    },
    coding: {
        label: '编码',
        reopen: '重新用...编码打开',
        convert: '转为...编码',
        utf8: 'UTF-8',
        utf16le: 'UTF-16LE',
        utf16be: 'UTF-16BE',
        gbk: 'GBK(简体中文)',
        gb2312: 'GB2312(简体中文)',
        gb18030: 'GB18030(简体中文)',
        big5: 'Big5(繁体中文)',
        big5hkscs: 'Big5-HKSCS(繁体中文)',
        hex: '十六进制',
        warning: '注意: 请勿直接编辑乱码文件。'
    },
    insert: {
        label: '插入',
        specialText: '特殊字体',
        math: '数学公式',
        mdTable: 'Markdown表格',
        webLink: '网页链接',
        writing: '写作模板',
        textBlock: '文本块',
        fromFile: '来自文件',
        // FE-28：插入菜单下的模板分组标签改走 i18n（原为 menu-config.ts 内硬编码 label）。
        // Material/Mermaid/PlantUML 为框架/格式专名，中文界面同样保留原文。
        material: {
            label: 'Material',
            admonition: 'Admonition',
            // mkdocs-material 扩展语法插入入口（15 项，与 menu-config.ts 的 Material 子菜单
            // 以及 menu-actions.ts 的 MATERIAL_SYNTAX_FEATURE_IDS 一一对应，键名 camelCase）
            collapsible: '折叠提示块',
            taskList: '任务列表',
            highlight: '高亮',
            insertDelete: '插入/删除',
            supSub: '上标/下标',
            keys: '键盘按键',
            attrList: '属性列表',
            footnote: '脚注',
            definitionList: '定义列表',
            gridCards: '网格卡片',
            codeBlock: '代码块增强',
            icon: 'Material 图标',
            blocks: '块语法（///）',
            snippet: '文件片段（snippets）',
            tabLink: '标签页深链'
        },
        mermaid: {
            label: 'Mermaid',
            part1: 'Mermaid 第一部分',
            part2: 'Mermaid 第二部分'
        },
        plantuml: {
            label: 'PlantUML',
            part1: 'PlantUML 第一部分',
            part2: 'PlantUML 第二部分'
        }
    },
    setting: {
        label: '设置',
        system: '系统设置',
        theme: '主题设置',
        quickLink: '快速链接设置',
        editor: '编辑器设置'
    },
    tools: {
        label: '工具',
        mermaid: 'mermaid绘图',
        katex: '公式编辑器',
        table: '电子表格',
        images: '配图制作',
        // 1.5.2 E6：日常记录（可选能力 featureDailyNotes，默认关闭）
        dailyNote: '今日日记',
        inboxCapture: '快速收件箱',
        // 1.5.2 E1：剪贴板剪藏（可选能力 featureClipCapture，默认关闭）
        clipToNote: '剪藏为新笔记',
        clipToEditor: '剪藏并插入当前笔记',
        // 1.5.2 E3：图片 OCR（可选能力 featureImageOcr，默认关闭；MVP 仅剪贴板截图）
        imageOcrInsert: '识别剪贴板图片文字并插入',
        imageOcrCopy: '识别剪贴板图片文字并复制',
        drawing: {
            label: '绘图工具',
            mermaid: 'Mermaid 绘图',
            plantuml: 'PlantUML 绘图'
        }
    },
    plugins: {
        label: '插件',
        // 1.5.6：插件菜单首项「插件搜索」（打开面板搜索入口视图，非具体工具）
        search: '插件搜索',
        group: {
            languageKeywords: '语言语法关键字对照表',
            encrypt: '加解密插件',
            converters: '各类转换器',
            codec: '编解码转换',
            formatConvert: '格式转换器',
            caseConvert: '大小写转换',
            formatTools: '格式化工具',
            textConvert: '文本转换',
            miscTools: '常用小工具',
            network: '网络计算插件',
            addressConverter: '地址转换器',
            parsers: '解析器',
            cheatSheets: '常用对照表',
            cheatSheet1: '对照表一',
            dataCommand: '数据和命令对照表',
            science: '科学符号对照表'
        },
        encrypt: {
            uuids: 'UUIDs 生成器',
            ulid: 'ULID 生成器',
            // FE-28：原 plugin 菜单 label 硬编码 'Token Generator' / 'Hash Text'
            tokenGenerator: '令牌生成器',
            hashText: '哈希文本',
            encryptDecrypt: '加密/解密文本',
            cryptoEncryptDecrypt: 'Crypto加密/解密文本',
            hmac: 'Hmac 生成器',
            rsa: 'RSA密钥对生成器'
        },
        net: {
            ipv4SubnetCalculator: 'IPv4子网计算器',
            // FE-17：已注册但此前无菜单入口的网络对照表工具（task-23 补齐菜单项）
            httpStatusCodes: 'HTTP状态码对照表',
            subnetMaskMapTable: '子网掩码对照表',
            regexTester: '正则表达式测试'
        },
        codec: {
            base64Codec: 'Base64 编码/解码',
            urlCodec: 'URL 编码/解码',
            htmlCodec: 'HTML 实体编码/解码',
            unicode: 'Unicode 与中文互转',
            imageBase64: '图片转 Base64'
        },
        convert: {
            colorConvert: '颜色转换',
            unitConvert: '单位换算',
            rmbCase: '人民币大写',
            timestampConvert: '时间戳转换',
            baseConvert: '进制转换'
        },
        misc: {
            randomGenerator: '随机生成器',
            calculator: '在线计算器',
            pdfPreview: 'PDF 预览'
        },
        text: {
            chineseText: '中文文本工具',
            wordCount: '字数统计',
            textDiff: '文本比对'
        },
        format: {
            jsonTool: 'JSON 工具',
            xmlFormatter: 'XML 格式化'
        },
        info: {
            asciiTable: 'ASCII码对照表',
            fileExtensionTable: '文件扩展名对照表',
            greeceLetterTable: '希腊字母对照',
            htmlEntityTable: 'HTML实体编码表',
            mathSymbolTable: '数学符号对照表',
            physicalConstantTable: '物理常数对照表',
            // FE-17：已注册但此前无菜单入口的常用对照表工具（task-23 补齐菜单项）
            numericCaseTable: '数字大小写对照表',
            normalFontStyleTable: '常见字体样式对照表'
        }
    },
    online: {
        label: '在线',
        group: {
            cainiao: '菜鸟在线工具',
            w3school: '编程狮在线工具',
            encode: '在线编解码工具',
            ide: '在线IDE编辑器',
            dev: '开发者工具',
            team: '国内知名前端团队',
            cloud: '云计算平台'
        },
        tools: {
            cainiaoTools: '菜鸟工具',
            w3cschoolTools: 'W3CSchool工具',
            baibaoxiang: '百宝箱',
            // FE-28：ToolFK 为品牌名（中英同文），补 key 以走 i18n 渲染链路
            toolfk: 'ToolFK',
            bejson: 'JSON工具箱BeJson',
            tool67: '即时工具67tool',
            toollu: '在线工具ToolLu',
            sojson: 'SoJSON在线解析',
            latexEditor: 'Latex公式编辑器',
            mermaidEditor: 'Mermaid在线编辑器',
            planttextEditor: 'PlantText编辑器',
            mindmapTool: '在线思维导图工具',
            diagramsTool: '在线流程图绘制',
            plantumlServer: 'PlantUml 网页服务器',
            chuiziTools: '锤子在线工具网'
        },
        cainiao: {
            svgEditor: '菜鸟SVG图片编辑器',
            drawTool: '菜鸟绘图工具',
            officeTools: '菜鸟在线办公工具大全',
            tableGenerator: '菜鸟在线表格生成'
        },
        w3school: {
            csvToHtml: 'CSV转HTML',
            sqlFormatter: 'SQL格式化',
            fullwidthHalfwidth: '全角/半角转换工具'
        },
        encode: {
            qrcodeGenerator: '二维码在线生成工具',
            qrcodeDecoder: '二维码在线解码',
            encodingConverter: '在线编码转换'
        },
        ide: {
            html: 'HTML语言',
            python: 'Python语言',
            c: 'C语言',
            go: 'Go语言'
        },
        dev: {
            prettyQrcode: '漂亮二维码生成',
            qrcodeDecoder: '二维码解码器',
            imageFormatConverter: '图片格式转换',
            // FE-28：原 label 硬编码 'Linux Crontab'，补中文词条
            linuxCrontab: 'Linux 定时任务',
            jwtDecoder: 'JWT在线解码'
        },
        team: {
            taobaoFed: '淘系前端团队（FED）',
            tmallFe: '天猫前端',
            aliNodejs: '阿里Node.js 性能平台',
            baiduFex: '百度 FEX'
        },
        cloud: {
            aliyun: '阿里云',
            tencent: '腾讯云',
            huawei: '华为云',
            tianyi: '天翼云',
            jinshan: '金山云'
        }
    },
    ai: {
        label: 'AI 导航',
        group: {
            hot: '热门 AI',
            coding: 'AI 编程',
            image: 'AI 作图',
            writing: 'AI 写作',
            office: 'AI 办公',
            media: 'AI 影音',
            agent: 'AI 智能体',
            model: 'AI 模型与榜单',
            more: '更多 AI 工具'
        },
        // 热门 AI（2026 当前主流）
        hot: {
            chatgpt: 'ChatGPT',
            deepseek: 'DeepSeek',
            doubao: '豆包',
            kimi: 'Kimi',
            tongyi: '通义千问',
            wenxin: '文心一言',
            yuanbao: '腾讯元宝',
            claude: 'Claude',
            gemini: 'Gemini',
            grok: 'Grok',
            copilot: 'Copilot',
            perplexity: 'Perplexity',
            chatglm: '智谱清言',
            tiangong: '天工 AI'
        },
        // AI 编程
        coding: {
            cursor: 'Cursor',
            trae: 'TRAE',
            qoder: 'Qoder',
            githubCopilot: 'GitHub Copilot',
            opencode: 'OpenCode',
            googleAiStudio: 'Google AI Studio',
            codingPlan: '字节 Coding Plan',
            zcode: 'ZCode',
            deepseekHarness: 'DeepSeek Harness'
        },
        // AI 作图
        image: {
            midjourney: 'Midjourney',
            stableDiffusion: 'Stable Diffusion',
            leonardo: 'Leonardo',
            adobeFirefly: 'Adobe Firefly',
            runway: 'Runway',
            canva: 'Canva',
            figma: 'Figma',
            removeBg: 'RemoveBG',
            clipdrop: 'Clipdrop',
            civitai: 'Civitai'
        },
        // AI 写作
        writing: {
            notionAi: 'Notion AI',
            grammarly: 'Grammarly',
            quillbot: 'QuillBot',
            gamma: 'Gamma',
            notebooklm: 'NotebookLM',
            metaso: '秘塔 AI 搜索',
            poe: 'Poe'
        },
        // AI 办公
        office: {
            miro: 'Miro',
            imaCopilot: 'ima copilot',
            manus: 'Manus'
        },
        // AI 影音
        media: {
            suno: 'Suno',
            elevenlabs: 'ElevenLabs',
            veed: 'VEED',
            reccloud: 'RecCloud',
            turboscribe: 'TurboScribe',
            genmo: 'Genmo',
            kling: '可灵 AI',
            hailuo: '海螺 AI'
        },
        // AI 智能体
        agent: {
            openclaw: 'OpenClaw',
            kimiclaw: 'KimiClaw',
            autoclaw: 'AutoClaw',
            maxclaw: 'MaxClaw',
            arkclaw: 'ArkClaw',
            easyclaw: 'EasyClaw',
            qoderwork: 'QoderWork',
            miaoda: '百度秒哒',
            agentSkills: 'Agent Skills 目录',
            skillhubQq: '腾讯 SkillHub'
        },
        // AI 模型与榜单
        model: {
            huggingFace: 'Hugging Face',
            openrouter: 'OpenRouter',
            arena: 'Arena 排行榜',
            artificialAnalysis: 'Artificial Analysis',
            sweBench: 'SWE-bench'
        },
        // 更多 AI 工具（菜鸟 AI 导航主页 / AI 社区与实验平台）
        more: {
            jyshareAi: '菜鸟 AI 导航',
            googleLabs: 'Google Labs',
            skillsmp: 'SkillsMP',
            characterAi: 'Character AI'
        }
    },
    github: {
        itTools: 'IT TOOLS 助力开发人员和IT工作者',
        ghost: 'Ghost 个人网站搭建',
        priospace: 'Priospace - 集大成的效率工具',
        plane: 'Plane - 开发者友好的项目管理神器',
        openproject: 'OpenProject - 功能强大的企业级项目管理'
    },
    help: {
        label: '帮助',
        release: '版本发布',
        updateLog: '修改日志',
        updateLogItem: '重大版本升级',
        shortkeys: '键盘快捷方式',
        usage: 'hemy08.github.io',
        guide: '使用指导',
        guideHtml: 'HTML 版',
        guidePdf: 'PDF 版',
        issues: '提交创意/意见',
        techStack: '技术栈',
        about: '关于',
        home: '主页',
        update: '检查更新',
        contactUs: '联系我们'
    },
    template: {
        mermaid: {
            basic: '基础框架',
            c4: 'C4图',
            classDiagram: '类图',
            erDiagram: '实体关系图',
            gantt: '甘特图',
            gitGraph: 'Git图',
            graph: '基本流程图',
            journey: '用户旅程图',
            mindmap: '思维导图',
            pie: '饼图',
            quadrantChart: '象限图',
            requirementDiagram: '需求图',
            sankey: '桑基图',
            sequenceDiagram: '序列图',
            stateDiagram: '状态图',
            timeline: '时间线图'
        },
        plantuml: {
            basic: '基础框架',
            activityDiagram: '活动图',
            sdl: '规范和描述语言（SDL）',
            archimateDiagram: '架构图',
            classDiagram: '类图',
            componentDiagram: '组件图',
            deploymentDiagram: '部署图',
            ditaaDiagram: 'Ditaa 图表',
            entityRelationship: '实体关系图',
            ebnf: 'EBNF 图表',
            ganttDiagram: '甘特图',
            informationEngineering: '信息工程图',
            jsonDiagram: 'JSON 数据',
            mindmapDiagram: '思维导图',
            nwdiag: '网络图',
            objectDiagram: '对象图',
            regex: 'Regex 图表',
            salt: '用户界面模型',
            sequenceDiagram: '序列图',
            stateDiagram: '状态图',
            timingDiagram: '定时图',
            useCaseDiagram: '用例图',
            wbsDiagram: 'WBS 图表',
            yamlDiagram: 'YAML 数据'
        },
        textblock: {
            imageLinks: '图片链接',
            blockcode: '折叠代码块',
            linksList: '有序链接列表',
            updateDate: '文章更新日期'
        },
        writing: {
            leetcode: '力扣题解模板',
            problemResolving: '问题处理模板',
            thesisCoverPage: '文章封面',
            thesisTemplates: '论文模板'
        }
    }
}
