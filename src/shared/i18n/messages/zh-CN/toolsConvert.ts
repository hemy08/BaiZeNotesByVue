/**
 * 插件工具（转换与加密）词条（中）
 * 覆盖 PluginTools/Convert 与 PluginTools/Encryption 两个目录；
 * 技术名词（JSON/YAML/Base64/AES…）、格式名与示例数据不翻译，仍保留在组件中。
 */
export default {
    // ==================== Convert：转换工具 ====================
    base: {
        title: '进制转换',
        description: '2~36 进制任意互转，支持整数、小数（20 位精度）与负数。',
        fromBaseLabel: '源进制',
        toBaseLabel: '目标进制',
        customPlaceholder: '自定义 2-36',
        inputPlaceholder: '输入要转换的数字...',
        resultLabel: '结果：',
        swapButton: '交换进制',
        copyButton: '复制',
        invalidInput: '输入包含非 {base} 进制的字符'
    },
    case: {
        title: '大小写转换',
        description: '更改字符串的大小写并在不同格式之间进行选择'
    },
    color: {
        title: '颜色转换',
        description:
            '在不同格式（HEX、RGB、HSL、HSV、CMYK）之间转换颜色，任一格式输入自动联动其他格式。',
        hex: 'HEX',
        rgb: 'RGB',
        hsl: 'HSL',
        hsv: 'HSV',
        cmyk: 'CMYK',
        hue: '色相 H（0-360）',
        saturation: '饱和度 S（0-100）',
        lightness: '亮度 L（0-100）',
        value: '明度 V（0-100）',
        cyan: '青 C（0-100）',
        magenta: '品红 M（0-100）',
        yellow: '黄 Y（0-100）',
        black: '黑 K（0-100）',
        invalidInput: '无效的颜色输入值'
    },
    date: {
        title: '日期时间转换器',
        description: '将日期和时间转换为各种不同的格式'
    },
    // 说明：HtmlFormatter 当前是沿用 BaseConvert 标题/说明的占位壳（待实现后修正文案）
    html: {
        title: '整数基转换器',
        description: '在不同的基数（十进制、十六进制、二进制、八进制、base64…）之间转换数字'
    },
    jsonCsv: {
        title: 'JSON 转 CSV',
        description: '使用自动标头检测将JSON转换为CSV。'
    },
    jsonFormatter: {
        prettifyTitle: 'JSON美化和格式化',
        prettifyDescription: '将JSON字符串修饰为友好的可读格式。',
        minifyTitle: 'JSON 压缩',
        minifyDescription: '通过删除不必要的空白来缩小和压缩JSON'
    },
    jsonToml: {
        title: 'JSON 和 TOML 转换',
        description: '解析JSON并将其转换为TOML。解析TOML并将其转换为JSON。',
        jsonToToml: 'JSON 转 TOML',
        tomlToJson: 'TOML 到 JSON'
    },
    list: {
        title: 'List 转换器',
        description:
            '该工具可以处理基于数组的数据，并将各种更改（转置、添加前缀和后缀、反向列表、排序列表、小写值、截断值）应用于每一行。'
    },
    roman: {
        title: '罗马数字转换器',
        description: '将罗马数字转换为数字，并将数字转换为罗马数字。'
    },
    sql: {
        title: 'SQL 美化和格式化',
        description: '格式化和美化您的 SQL 查询（它支持各种 SQL 方言）。'
    },
    textToBinary: {
        title: '文本到 ASCII 二进制',
        description: '将文本转换为其 ASCII 二进制表示形式，反之亦然。'
    },
    textToUnicode: {
        title: '文本转 Unicode',
        description: '解析文本并将其转换为 unicode，反之亦然'
    },
    xml: {
        title: 'XML 格式化',
        description: '将XML字符串修饰为友好的可读格式。'
    },
    yaml: {
        title: 'YAML美化和格式化',
        description: '将YAML字符串修饰为友好的可读格式。'
    },
    yamlJson: {
        title: 'YAML 和 JSON转换器',
        description: '将JSON转换为YAML。或者将YAMl转成JSON',
        yamlToJson: 'YAML到JSON转换器',
        jsonToYaml: 'JSON到YAML转换器'
    },
    yamlToml: {
        title: 'YAML 和 TOML转换器',
        description: '解析YAML并将其转换为TOML。或者将TOML转成YAML',
        yamlToToml: 'YAML 到 TOML',
        tomlToYaml: 'TOML 到 YAML'
    },
    // ==================== Encryption：加密工具 ====================
    hash: {
        title: 'Hash 哈希文本生成，非对称加密',
        descriptionLine1:
            '使用所需的函数哈希文本字符串：MD5、SHA1、SHA256、SHA224、SHA512、SHA384、SHA3或RIPEMD160',
        descriptionLine2:
            '先将输入进行encode，然后根据算法获取对应的哈希值，最后在进行响应的编码，得到最终的结果，文中使用的是CryptoJS',
        descriptionLine3:
            '二进制的编码，是将对应的16进制编码转换为二进制进行显示，不是直接对哈希结果array进行处理',
        inputLabel: '需要进行HASH的文本：',
        inputPlaceholder: '请输入你的文本...',
        encodeLabel: '摘要编码：',
        resultPlaceholder: '{algorithm}哈希结果...',
        emptyInputAlert: '请先输入要进行Hash的文本....',
        failedAlert: '计算哈希失败：{error}'
    },
    hmac: {
        title: 'Hmac 生成器',
        description: '使用密钥和您喜欢的哈希函数计算基于哈希的消息身份验证代码（HMAC）。',
        inputLabel: '需要进行Hmac的文本：',
        inputPlaceholder: '请输入你的文本...',
        encodeLabel: '摘要编码：',
        secretLabel: '密钥：',
        secretPlaceholder: '请输入密钥，默认123456',
        resultPlaceholder: '{algorithm}哈希结果...',
        emptyInputAlert: '请先输入要进行Hmac的文本....',
        failedAlert: '计算 HMAC 失败：{error}'
    },
    crypto: {
        title: 'Crypto 加密/解密文本',
        description: '使用NodeJs的crypto加解密算法，进行加解密文本处理。',
        inputLabel: '请输入你需要加密/解密的文本: ',
        inputPlaceholder: '解密结果，或请输入你需要加密的文本...',
        encodingNoteLine1:
            '默认编码方式是UTF-8，不输入则自动生成，按照HEX编码显示。如果手动输入秘钥，请根据编码方式确定输入长度。',
        encodingNoteLine2:
            '如：HEX编码的长度是utf-8编码的2倍，AES-256算法，UTF-8编码只需要输入32位，选择HEX则需要输入64位',
        secretKeyLabel: '请输入你的秘钥',
        secretKeyPlaceholder:
            '请输入你的秘钥，各类算法秘钥长度不一致，按照要求填入，如果为空，会自动生成，记得保存...',
        secretEncodingLabel: '请选择密钥编码方式',
        algorithmLabel: '请选择加密/解密算法',
        inputEncodingLabel: '请选择输入编码方式',
        outputEncodingLabel: '请选择结果编码方式',
        ivPlaceholder:
            '请输入IV，如果你知道的话。各个算法IV长度不一致，如果不输入，会自动生成，记得保存...',
        fixedResultNoteLine1: '在秘钥、IV和输入的加密文本固定的情况下，加密的结果是固定的。',
        fixedResultNoteLine2:
            '如果是使用当前工具得到的密码进行解密，请注意输入编码方式和结构编码方式需要互换下',
        resultLabel: '加密/解密结果: ',
        resultPlaceholder: '加密结果，或输入要进行解密的密文...',
        encryptButton: '加密',
        decryptButton: '解密',
        emptyInputAlert: '请输入要加密/解密的文本...',
        secretKeyLengthError: '加密算法{algorithm}需要秘钥长度{length}',
        encryptFailed: '加密失败：{error}',
        decryptFailed: '解密失败：{error}',
        encodingBinary: '二进制',
        encodingHex: 'HEX(十六进制编码)',
        // AS-13：GCM 认证加密 authTag 协议与算法安全提示（渲染层 CryptoEncDec.vue 使用）
        authTagLabel: '认证标签 authTag',
        authTagPlaceholder: '请输入加密结果中的 authTag（16 字节 hex，32 个十六进制字符）',
        authTagNote:
            'GCM 是认证加密（AEAD）：解密必须提供加密时产生的 authTag，否则无法通过完整性认证。加密成功后本工具会自动填入。',
        authTagRequiredAlert:
            'GCM 解密需要 authTag（认证标签），请先填写加密结果中的 authTag 再解密。',
        gcmAuthTagWarning:
            'GCM 是认证加密（AEAD）：解密需要 authTag 参与认证，缺少或错误的 authTag 会导致解密失败。本工具在加密后自动展示 authTag，解密时请一并填入，并随密文一起保存。',
        weakAlgorithmWarning:
            '所选算法（ECB / DES / RC2 / RC4 / Blowfish）已被认为不安全，请勿用于敏感数据，仅适合教学或兼容旧数据。',
        securityWarningTitle: '安全提示'
    },
    encryptDecrypt: {
        title: '加密/解密文本，对称加密算法',
        description:
            '使用加密算法(如AES、TripleDES、Rabbit或RC4)加密和解密文本明文。加密输出为"随机IV:密文"前缀格式，解密时自动解析前缀。',
        inputLabel: '请输入你需要加密的文本: ',
        inputPlaceholder: '解密结果，或请输入你需要加密的文本...',
        secretKeyLabel: '请输入你的秘钥',
        secretKeyPlaceholder: '请输入你的秘钥...',
        algorithmLabel: '请选择加密算法',
        modeLabel: '请选择加密模式',
        paddingLabel: '请选择填充方式',
        resultLabel: '加密结果: ',
        resultPlaceholder:
            '加密结果（IV十六进制:密文Base64 前缀拼接），或输入要进行解密的密文（无前缀按旧格式兼容）...',
        note: '说明：IV（初始化向量）每次加密随机生成并随密文输出，格式为「IV十六进制:密文Base64」，解密时自动解析前缀，无需手工填写 IV；无前缀的旧格式密文仍可直接粘贴解密。',
        encryptButton: '加密',
        decryptButton: '解密',
        algorithmDefaultAes: 'AES (默认，AES block cipher algorithm)',
        modeDefaultCbc: 'CBC (默认，Cipher Block Chaining mode)',
        paddingDefaultPkcs7: 'Pkcs7 (默认，PKCS #5/7 padding strategy)',
        emptyInputAlert: '请输入要加密的文本...',
        emptyCipherAlert: '请输入要解密的文本...',
        encryptFailed: '加密失败：{error}',
        decryptFailed: '解密失败：{error}'
    },
    rsa: {
        title: '密钥对生成器',
        description: '生成新的随机RSA或者ed25519私钥和公钥pem证书。',
        refreshButton: '刷新密钥对'
    },
    token: {
        description: '使用您想要的字符、大写或小写字母、数字和/或符号生成随机字符串。',
        uppercaseLabel: '大写(ABCDEFGHIJKLMNOPQRSTUVWXYZ)',
        lowercaseLabel: '小写(abcdefghijklmnopqrstuvwxyz)',
        numberLabel: '数字(0123456789)',
        symbolLabel: '符号(!@#$%^&*()_+{}:<>?[]\\|~)',
        lengthLabel: '长度',
        outputPlaceholder: '生成的令牌......',
        generateButton: '生成',
        refreshButton: '刷新',
        clearButton: '清空'
    },
    ulid: {
        title: 'ULID 生成器',
        description: '生成随机的通用唯一词典可排序标识符（ULID）。',
        countLabel: '生成数量：',
        formatLabel: '格式：',
        copyButton: '拷贝',
        refreshButton: '刷新'
    },
    uuid: {
        title: 'UUIDs 生成器',
        description:
            '通用唯一标识符（UUID）是一个128位数字，用于标识计算机系统中的信息。可能的UUID数量为16^32，即2^128或约3.4x10^38（这是一个很大的数字！）。',
        countLabel: '生成数量：',
        namespaceLabel: '命名空间：',
        nameLabel: '名称：',
        copyButton: '拷贝',
        refreshButton: '刷新'
    },
    base64: {
        title: 'Base64 编码/解码',
        description:
            '将文本先按 UTF-8 编码再转换为 Base64，或将 Base64 解码还原为文本；解码时自动忽略非法字符。',
        inputLabel: '原文：',
        inputPlaceholder: '请输入要编码/解码的文本...',
        outputLabel: '结果：',
        outputPlaceholder: '编码/解码结果...',
        encodeButton: '编码',
        decodeButton: '解码',
        copyButton: '复制',
        clearButton: '清空'
    },
    urlCodec: {
        title: 'URL 编码/解码',
        description:
            '使用 encodeURIComponent/decodeURIComponent 对文本进行 URL 百分号编码与解码（UTF-8）。',
        inputLabel: '原文：',
        inputPlaceholder: '请输入要编码/解码的文本...',
        outputLabel: '结果：',
        outputPlaceholder: '编码/解码结果...',
        encodeButton: '编码',
        decodeButton: '解码',
        copyButton: '复制',
        clearButton: '清空',
        decodeErrorAlert: '解码失败，输入包含非法 URL 编码：{error}'
    },
    htmlCodec: {
        title: 'HTML 实体编码/解码',
        description:
            '编码转义 & < > " \' 五个字符；解码支持常用命名实体（&amp; &lt; &gt; &quot; &#39; &nbsp; 等）与数字实体 &#nn; / &#xhh;。',
        inputLabel: '原文：',
        inputPlaceholder: '请输入要编码/解码的文本...',
        outputLabel: '结果：',
        outputPlaceholder: '编码/解码结果...',
        encodeButton: '编码',
        decodeButton: '解码',
        copyButton: '复制',
        clearButton: '清空'
    },
    unicode: {
        title: 'Unicode 与中文互转',
        description: '中文与 \\uXXXX 格式 Unicode 互转；ASCII 与 &#十进制; 数字实体互转。',
        inputLabel: '原文：',
        inputPlaceholder: '请输入要转换的文本...',
        outputLabel: '结果：',
        outputPlaceholder: '转换结果...',
        toUnicodeButton: '中文 转 \\uXXXX',
        toTextButton: '\\uXXXX 转中文',
        toEntityButton: '文本 转 &#实体',
        entityToTextButton: '&#实体 转文本',
        copyButton: '复制',
        clearButton: '清空'
    },
    imageBase64: {
        title: '图片转 Base64',
        description:
            '选择图片（不超过 20MB）转换为 Base64/DataURL；也可把 Base64 解码还原为图片预览。',
        chooseFileLabel: '选择图片：',
        chooseFileButton: '选择图片',
        base64Label: 'Base64 内容：',
        base64Placeholder: '选择图片后自动生成 Base64，或粘贴 Base64/DataURL 进行预览...',
        decodeButton: 'Base64 转图片',
        copyButton: '复制',
        clearButton: '清空',
        previewLabel: '图片预览',
        sizeLimitAlert: '图片大小超过 20MB 限制，请选择更小的图片。',
        emptyInputAlert: '请先选择图片或输入 Base64 内容。',
        readFailedAlert: '读取图片失败：{error}',
        decodeFailedAlert: 'Base64 解码失败：{error}'
    },
    unit: {
        title: '单位换算',
        description:
            '长度单位（公制/英制/天文/市制/排版）与存储单位（二进制 1024 制 / SI 十进制）换算。',
        lengthTab: '长度',
        storageTab: '存储',
        valueLabel: '数值：',
        fromLabel: '从：',
        toLabel: '到：',
        resultLabel: '结果：',
        modeLabel: '制式：',
        binary: '二进制（1024 制）',
        si: 'SI 十进制（1000 制）',
        invalidValue: '请输入有效数值',
        units: {
            mm: '毫米 (mm)',
            cm: '厘米 (cm)',
            dm: '分米 (dm)',
            m: '米 (m)',
            km: '千米 (km)',
            um: '微米 (μm)',
            nm: '纳米 (nm)',
            pm: '皮米 (pm)',
            inch: '英寸 (in)',
            foot: '英尺 (ft)',
            yard: '码 (yd)',
            mile: '英里 (mi)',
            nmi: '海里 (nmi)',
            ly: '光年 (ly)',
            au: '天文单位 (au)',
            pc: '秒差距 (pc)',
            pt: '点 (pt)',
            px: '像素 (px)',
            zhang: '丈',
            chi: '尺',
            cun: '寸',
            fen: '分',
            li2: '厘',
            li3: '里'
        }
    },
    rmb: {
        title: '人民币数字转中文大写',
        description: '将人民币数字金额转换为中文大写（支持负数、小数，按角/分精确到分）。',
        inputLabel: '金额：',
        placeholder: '请输入金额，如 100.5',
        resultLabel: '大写：',
        convertButton: '转换',
        copyButton: '复制'
    },
    timestamp: {
        title: '时间戳转换',
        description: 'Unix 时间戳与本地日期时间互转，支持秒/毫秒切换与当前时间戳显示（本地时区）。',
        unitLabel: '单位：',
        seconds: '秒',
        milliseconds: '毫秒',
        currentLabel: '当前时间戳：',
        copyButton: '复制',
        tsToLocalTitle: '时间戳 → 本地时间',
        timestampLabel: '时间戳：',
        tsPlaceholder: '如 1700000000',
        convertButton: '转换',
        localTimeLabel: '本地时间：',
        localToTsTitle: '本地时间 → 时间戳',
        dateTimeLabel: '日期时间：',
        dateTimePlaceholder: 'YYYY-MM-DD HH:mm:ss'
    },
    random: {
        title: '随机生成器',
        description:
            '密码 / 随机字符串 / 随机数 / 随机颜色生成，使用 crypto.getRandomValues 无偏采样。',
        tabs: {
            password: '密码',
            string: '随机字符串',
            number: '随机数',
            color: '随机颜色'
        },
        passwordLength: '长度（4-128）：',
        uppercase: '大写 (A-Z)',
        lowercase: '小写 (a-z)',
        numbers: '数字 (0-9)',
        symbols: '符号 (!@#$...)',
        generateButton: '生成',
        copyButton: '复制',
        stringLength: '长度：',
        charsetLabel: '字符集：',
        charsets: {
            alnum: '大小写字母 + 数字',
            alpha: '大小写字母',
            lower: '小写字母',
            upper: '大写字母',
            digits: '数字'
        },
        customCharset: '自定义字符集：',
        minLabel: '最小值：',
        maxLabel: '最大值：',
        countLabel: '数量（≤100）：',
        colorModeLabel: '模式：',
        vividColor: '鲜艳（固定饱和度/亮度）',
        randomBrightness: '随机亮度'
    },
    calculator: {
        title: '在线计算器',
        description: '标准模式计算器：支持加减乘除、取余、乘方与括号，双栈求值、禁用 eval。',
        clear: '清空',
        backspace: '退格',
        equal: '='
    },
    chineseText: {
        title: '中文文本工具',
        description: '繁体与简体互转；汉字转拼音（无调、多音字取第一读音）。',
        tabConvert: '繁简互转',
        tabPinyin: '汉字转拼音',
        inputPlaceholder: '请输入文本...',
        outputPlaceholder: '转换结果...',
        toTraditional: '转为繁体',
        toSimplified: '转为简体',
        toPinyin: '转为拼音',
        toFirstLetter: '转为首字母',
        copyButton: '复制'
    },
    wordCount: {
        title: '字数统计',
        description: '实时统计汉字、标点、字母、数字与段落数量。',
        inputPlaceholder: '请在此输入或粘贴文本...',
        chineseChars: '汉字数',
        chinesePunctuation: '中文标点数',
        letters: '字母数',
        digits: '数字数',
        englishPunctuation: '英文标点数',
        totalChars: '总字符数',
        noSpaceChars: '去空格字符数',
        paragraphs: '段落数',
        clearButton: '清空'
    },
    textDiff: {
        title: '文本比对',
        description: '行级对比两侧文本：新增行以 + 标注，删除行以 - 标注。',
        originalLabel: '原始文本',
        modifiedLabel: '修改后文本',
        originalPlaceholder: '请输入原始文本...',
        modifiedPlaceholder: '请输入修改后的文本...',
        compareButton: '开始比对',
        tooLarge: '文本过大（总行数×字符数超过 400 万）：两侧不同。'
    },
    jsonTool: {
        title: 'JSON 工具',
        description: 'JSON 格式化、压缩与转义/去转义。',
        tabFormat: '格式化',
        tabMinify: '压缩',
        tabEscape: '转义/去转义',
        inputPlaceholder: '请输入 JSON 文本...',
        outputPlaceholder: '处理结果...',
        formatButton: '格式化',
        minifyButton: '压缩',
        escapeButton: '转义',
        unescapeButton: '去转义',
        copyButton: '复制',
        errorPrefix: '错误：'
    },
    xmlFormatter: {
        title: 'XML 格式化',
        description: 'XML 格式化与压缩（保留注释、CDATA 与文本内容）。',
        tabFormat: '格式化',
        tabMinify: '压缩',
        indentLabel: '缩进空格数：',
        inputPlaceholder: '请输入 XML 文本...',
        outputPlaceholder: '处理结果...',
        formatButton: '格式化',
        minifyButton: '压缩',
        copyButton: '复制',
        errorPrefix: '错误：'
    },
    regexTester: {
        title: '正则表达式测试',
        description: '在主线程测试正则匹配与替换（d/g/i/m/s/u/v/y，u 与 v 互斥）。',
        patternLabel: '正则表达式',
        flagsLabel: '标志',
        inputLabel: '测试文本',
        replacementLabel: '替换内容',
        testButton: '测试匹配',
        replaceButton: '执行替换',
        matchCount: '匹配数',
        emptyMatch: '(空)',
        truncated: '匹配数已达 5000 项上限，结果已截断。',
        uvExclusive: 'u 与 v 标志互斥，不能同时启用（已自动取消另一项）。',
        errorPrefix: '错误：',
        replaceOutputLabel: '替换结果'
    }
}
