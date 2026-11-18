/**
 * toolsNetwork 命名空间（中）
 * 覆盖：插件工具外壳、常用对照表（Informations）、网络工具（NetWork）、
 * 工具面板（Tools/LatexEditor）与 HemyTools 壳层。
 *
 * 注意：对照表的数据行（ASCII 表、HTTP 状态码说明、字体/MIME 类型、希腊字母等）
 * 属于参考数据，仍原样保留在 information-tables/ 中，不进入词典。
 */
export default {
    common: {
        backToEditor: '返回编辑器',
        retry: '重试',
        openInBrowser: '在浏览器中打开'
    },
    pluginTools: {
        placeholder: '请选择其他工具，当前工具正在开发中，敬请期待。。。'
    },
    infoTables: {
        ascii: {
            title: 'ASCII 对照表',
            desc: 'ASCII 对照表，支持查询',
            bin: 'Bin(二进制)',
            oct: 'Oct(八进制)',
            dec: 'Dec(十进制)',
            hex: 'Hex(十六进制)',
            char: '缩写/字符',
            explanation: '解释'
        },
        fileNameExtension: {
            title: '文件类型（MIME头）',
            desc: '文件类型（MIME头）',
            extension: '文件扩展名',
            mimeType: 'Content-Type(Mime-Type)'
        },
        formulaSymbol: {
            title: '数学公式符号',
            desc: '数学公式符号查询',
            symbol: '符号',
            explanation: '说明'
        },
        greeceLetter: {
            title: '希腊字母对照',
            desc: '希腊字母大小写对照',
            symbol: '特殊符号',
            entity: '命名实体',
            decimal: '十进制编码'
        },
        htmlSpecialChar: {
            title: 'HTML特殊字符对照表',
            desc: 'HTML特殊字符对照表，支持查询',
            preview: '预览',
            code: '写法',
            explanation: '说明'
        },
        httpStatusCode: {
            title: 'HTTP 消息状态码',
            desc: 'HTTP 消息状态码和对应的解释',
            code: '状态码',
            explanation: '说明'
        },
        normalFontStyle: {
            title: '常见字体对照',
            desc: '常见字体对照查询',
            fontName: '字体名称',
            cssStyle: 'CSS样式',
            preview: '页面展现'
        },
        numericCase: {
            title: '数字大小写单位',
            desc: '数字大小写单位',
            digit: '数码',
            lower: '小写数字',
            upper: '大写数字'
        },
        physicalSymbol: {
            title: '物理符号常量',
            desc: '物理符号常量查询',
            symbol: '符号',
            name: '名称',
            explanation: '说明'
        },
        subnetMask: {
            title: '子网掩码对照表',
            desc: 'IP地址 子网掩码对照表',
            mask: '掩码',
            bits: '位',
            ipCount: 'IP数'
        }
    },
    network: {
        ipv4AddrConvert: {
            title: 'Ipv4地址转换器',
            desc: '在ipv6中，将ip地址转换为十进制、二进制、十六进制或事件'
        },
        ipv6UlaGenerator: {
            title: 'IPv6 ULA生成器',
            desc: '根据RFC4193在网络上生成您自己的本地不可路由IP地址。'
        },
        macAddrGenerator: {
            title: 'MAC 地址生成器',
            desc: '输入数量和前缀。MAC地址将以您选择的大小写（大写或小写）生成'
        },
        macAddrLookup: {
            title: 'MAC地址查找',
            desc: '通过设备的MAC地址查找设备的供应商和制造商。'
        },
        qrcodeGenerator: {
            title: '二维码生成器',
            desc: '生成并下载url或文本的QR代码，并自定义背景和前景颜色。'
        },
        wifiQrcodeGenerator: {
            title: 'WiFi 二维码生成器',
            desc: '生成和下载QR码以快速连接到WiFi网络。'
        },
        ipv4SubnetCalc: {
            title: 'IPv4子网计算器',
            desc: '解析IPv4 CIDR块，并获取有关子网络的所有所需信息。',
            networkCalcTitle: '网络和IP地址计算器',
            networkCalcDesc: '显示网络，广播，第一次和最后一个给定的网络地址:',
            ipMaskBits: 'IP/掩码位:',
            calculate: '计算',
            reset: '重置',
            availableAddresses: '可用地址：',
            cidrNote: '在网络掩码“位格式”也被称为CIDR格式（CIDR=无类别域间路由选择）。',
            maskToBitsTitle: '子网掩码转换器（对位点分十进制格式）',
            maskToBitsDesc: '根据网络掩码，计算掩码位。掩码不合法，返回无效。',
            settings: '设置：',
            result: '结果/',
            bitsToMaskTitle: '子网掩码转换器（位点分十进制格式）',
            netmask: '网络掩码：',
            networkAddress: '网络地址：',
            firstUsable: '第一个可用：',
            lastUsable: '最后可用：',
            broadcast: '广播：',
            dec: 'Dec 十进制：',
            hex: 'Hex 十六进制：',
            availableCount: '可用地址数：',
            totalCount: '地址总数量：',
            ipNumberTitle: '所需IP数量掩码地址转换器',
            ipNumberDesc: '根据所需的IP地址数量，计算相应的掩码Bit数、十进制、十六进制掩码',
            maskBits: '掩码位数：',
            invalidIp: '输入IP地址无效',
            invalidMask: '无效'
        }
    },
    tools: {
        latexEditor: {
            title: 'Latex公式编辑器',
            introPronounce:
                '（常被读作/ˈlɑːtɛk/或/ˈleɪtɛk/，正确读音:/ˈlɑːtɛx/音译：拉泰赫，写作LaTeX），是一种基于TeX的排版系统，由美国计算机科学家',
            lamport: '莱斯利·兰伯特',
            introOrigin: '在20世纪80年代初期开发。',
            introLibrary:
                '是一个跨浏览器的JavaScript库，它使用MathML、LaTeX和ASCIIMathML标记在Web浏览器中显示数学符号。',
            introPage: '本页面是基于',
            introExport:
                '实现的便捷LaTeX公式编辑器，支持导出SVG矢量图、高清PNG位图、MathML代码以及SVGCode。',
            inputArea: '输入区域',
            outputArea: '输出区域',
            quickTools: '快捷工具',
            formulaTemplates: '公式模板',
            imageRecognition: '图片识别',
            placeholder: '请输入您的LaTeX表达式'
        }
    },
    hemyTools: {
        pdfView: {
            loading: '正在加载 PDF 文件...',
            loadFailed: '加载失败: {error}',
            fileNotFound: '文件不存在',
            empty: '请选择一个 PDF 文件进行预览',
            zoomIn: '放大',
            zoomOut: '缩小',
            prevPage: '上一页',
            nextPage: '下一页',
            unreadable: '无法读取 PDF 文件内容'
        },
        htmlView: {
            loading: '正在加载 HTML 文件...',
            loadFailed: '加载失败: {error}',
            empty: '请选择一个 HTML 文件进行预览',
            unreadable: '无法读取文件内容',
            refresh: '刷新'
        }
    }
}
