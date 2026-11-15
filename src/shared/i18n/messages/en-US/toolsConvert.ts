/**
 * Plugin tools (convert & encryption) messages (en)
 * Covers 7 PluginTools directories: Convert, Encryption, Codec, TextTools,
 * MiscTools, FormatTools and NetWork (regexTester).
 */
export default {
    // ==================== Convert tools ====================
    base: {
        title: 'Base Converter',
        description:
            'Convert numbers between bases 2-36, supporting integers, fractions (20-digit precision) and negative values.',
        fromBaseLabel: 'From base',
        toBaseLabel: 'To base',
        customPlaceholder: 'Custom 2-36',
        inputPlaceholder: 'Enter a number to convert...',
        resultLabel: 'Result:',
        swapButton: 'Swap bases',
        copyButton: 'Copy',
        invalidInput: 'Input contains characters not valid in base {base}',
        inputTooLong:
            'Input exceeds the {limit} character limit; conversion stopped. Please shorten the input and retry.'
    },
    case: {
        title: 'Case converter',
        description: 'Change the case of a string and choose between different case styles'
    },
    color: {
        title: 'Color Converter',
        description:
            'Convert colors between HEX, RGB, HSL, HSV and CMYK formats; editing any format updates all the others.',
        hex: 'HEX',
        rgb: 'RGB',
        hsl: 'HSL',
        hsv: 'HSV',
        cmyk: 'CMYK',
        hue: 'Hue H (0-360)',
        saturation: 'Saturation S (0-100)',
        lightness: 'Lightness L (0-100)',
        value: 'Value V (0-100)',
        cyan: 'Cyan C (0-100)',
        magenta: 'Magenta M (0-100)',
        yellow: 'Yellow Y (0-100)',
        black: 'Black K (0-100)',
        invalidInput: 'Invalid color input value'
    },
    date: {
        title: 'Date & time converter',
        description: 'Convert dates and times into various formats'
    },
    html: {
        title: 'Integer base converter',
        description:
            'Convert numbers between different bases (decimal, hexadecimal, binary, octal, base64…)'
    },
    jsonCsv: {
        title: 'JSON to CSV',
        description: 'Convert JSON to CSV with automatic header detection.'
    },
    jsonFormatter: {
        prettifyTitle: 'JSON prettify and format',
        prettifyDescription: 'Prettify a JSON string into a friendly, readable format.',
        minifyTitle: 'JSON minify',
        minifyDescription: 'Shrink and compress JSON by removing unnecessary whitespace'
    },
    jsonToml: {
        title: 'JSON and TOML converter',
        description: 'Parse JSON and convert it to TOML. Parse TOML and convert it to JSON.',
        jsonToToml: 'JSON to TOML',
        tomlToJson: 'TOML to JSON'
    },
    list: {
        title: 'List converter',
        description:
            'Process array-based data and apply various changes to each row (transpose, add prefix and suffix, reverse, sort, lowercase values, truncate values).'
    },
    roman: {
        title: 'Roman numeral converter',
        description: 'Convert Roman numerals to numbers and numbers to Roman numerals.'
    },
    sql: {
        title: 'SQL prettify and format',
        description: 'Format and prettify your SQL queries (supports various SQL dialects).'
    },
    textToBinary: {
        title: 'Text to ASCII binary',
        description: 'Convert text to its ASCII binary representation and vice versa.'
    },
    textToUnicode: {
        title: 'Text to Unicode',
        description: 'Parse text and convert it to Unicode and vice versa'
    },
    xml: {
        title: 'XML formatter',
        description: 'Prettify an XML string into a friendly, readable format.'
    },
    yaml: {
        title: 'YAML prettify and format',
        description: 'Prettify a YAML string into a friendly, readable format.'
    },
    yamlJson: {
        title: 'YAML and JSON converter',
        description: 'Convert JSON to YAML, or YAML to JSON',
        yamlToJson: 'YAML to JSON converter',
        jsonToYaml: 'JSON to YAML converter'
    },
    yamlToml: {
        title: 'YAML and TOML converter',
        description: 'Parse YAML and convert it to TOML, or TOML to YAML',
        yamlToToml: 'YAML to TOML',
        tomlToYaml: 'TOML to YAML'
    },
    // ==================== Encryption tools ====================
    hash: {
        title: 'Hash text generator, asymmetric encryption',
        descriptionLine1:
            'Hash text strings with the function you need: MD5, SHA1, SHA256, SHA224, SHA512, SHA384, SHA3, or RIPEMD160',
        descriptionLine2:
            'The input is encoded first, then the hash is computed with the selected algorithm, and finally the result is encoded again — this page uses CryptoJS',
        descriptionLine3:
            'Binary encoding displays the corresponding hexadecimal encoding in binary form instead of processing the raw hash array directly',
        inputLabel: 'Text to hash:',
        inputPlaceholder: 'Enter your text...',
        encodeLabel: 'Digest encoding:',
        resultPlaceholder: '{algorithm} hash result...',
        emptyInputAlert: 'Please enter the text to hash first....',
        failedAlert: 'Failed to calculate hash: {error}'
    },
    hmac: {
        title: 'HMAC generator',
        description:
            'Compute a hash-based message authentication code (HMAC) using a secret key and your favorite hash function.',
        inputLabel: 'Text to HMAC:',
        inputPlaceholder: 'Enter your text...',
        encodeLabel: 'Digest encoding:',
        secretLabel: 'Secret key:',
        secretPlaceholder: 'Enter the secret key, defaults to 123456',
        resultPlaceholder: '{algorithm} hash result...',
        emptyInputAlert: 'Please enter the text to HMAC first....',
        failedAlert: 'Failed to calculate HMAC: {error}'
    },
    crypto: {
        title: 'Crypto encrypt/decrypt text',
        description: 'Encrypt and decrypt text with the Node.js crypto algorithms.',
        inputLabel: 'Text to encrypt/decrypt: ',
        inputPlaceholder: 'Decryption result, or enter the text you need to encrypt...',
        encodingNoteLine1:
            'The default encoding is UTF-8; if omitted it is generated automatically and displayed in HEX. If you enter the secret key manually, make sure its length matches the selected encoding.',
        encodingNoteLine2:
            'For example, HEX encoding is twice as long as UTF-8: for AES-256, UTF-8 only needs 32 characters, while HEX needs 64',
        secretKeyLabel: 'Enter your secret key',
        secretKeyPlaceholder:
            'Enter your secret key. Key lengths vary by algorithm, so fill it in as required; if empty, one is generated automatically — remember to save it...',
        secretEncodingLabel: 'Select the secret key encoding',
        algorithmLabel: 'Select the encrypt/decrypt algorithm',
        inputEncodingLabel: 'Select the input encoding',
        outputEncodingLabel: 'Select the output encoding',
        ivPlaceholder:
            'Enter the IV if you know it. IV lengths vary by algorithm; if empty, one is generated automatically — remember to save it...',
        fixedResultNoteLine1:
            'With a fixed secret key, IV, and input ciphertext, the encrypted result is deterministic.',
        fixedResultNoteLine2:
            'If you decrypt a password produced by this tool, note that the input encoding and the output encoding need to be swapped',
        resultLabel: 'Encrypt/decrypt result: ',
        resultPlaceholder: 'Encryption result, or enter the ciphertext to decrypt...',
        encryptButton: 'Encrypt',
        decryptButton: 'Decrypt',
        emptyInputAlert: 'Please enter the text to encrypt/decrypt...',
        secretKeyLengthError: 'The {algorithm} algorithm requires a key length of {length}',
        encryptFailed: 'Encryption failed: {error}',
        decryptFailed: 'Decryption failed: {error}',
        encodingBinary: 'Binary',
        encodingHex: 'HEX (hexadecimal)',
        // AS-13：GCM authTag protocol + algorithm security notices (used by CryptoEncDec.vue)
        authTagLabel: 'Authentication tag (authTag)',
        authTagPlaceholder:
            'Enter the authTag from the encryption result (16 bytes hex, 32 hex chars)',
        authTagNote:
            'GCM is authenticated encryption (AEAD): decryption requires the authTag produced during encryption, otherwise the integrity check fails. This tool fills it in automatically after a successful encryption.',
        authTagRequiredAlert:
            'GCM decryption requires an authTag (authentication tag). Enter the authTag from the encryption result before decrypting.',
        gcmAuthTagWarning:
            'GCM is authenticated encryption (AEAD): decryption requires the authTag as part of authentication, so a missing or wrong authTag makes decryption fail. This tool shows the authTag after encryption — paste it back when decrypting and store it together with the ciphertext.',
        weakAlgorithmWarning:
            'The selected algorithm (ECB/DES/RC2/RC4/Blowfish) is considered insecure. Do not use it for sensitive data; it is only suitable for learning or legacy compatibility.',
        securityWarningTitle: 'Security notice'
    },
    encryptDecrypt: {
        title: 'Encrypt/decrypt text with symmetric algorithms',
        description:
            'Encrypt and decrypt plaintext using algorithms such as AES, TripleDES, Rabbit, or RC4. The encrypted output uses a "random IV:ciphertext" prefix format, and the prefix is parsed automatically when decrypting.',
        inputLabel: 'Text to encrypt: ',
        inputPlaceholder: 'Decryption result, or enter the text you need to encrypt...',
        secretKeyLabel: 'Enter your secret key',
        secretKeyPlaceholder: 'Enter your secret key...',
        algorithmLabel: 'Select the encryption algorithm',
        modeLabel: 'Select the encryption mode',
        paddingLabel: 'Select the padding method',
        resultLabel: 'Encryption result: ',
        resultPlaceholder:
            'Encryption result (IV hex:ciphertext Base64 prefix), or enter the ciphertext to decrypt (legacy format without a prefix is also supported)...',
        note: 'Note: the IV (initialization vector) is generated randomly for each encryption and output with the ciphertext in the "IV hex:ciphertext Base64" format. When decrypting, the prefix is parsed automatically — you do not need to enter the IV manually. Legacy ciphertext without a prefix can still be pasted and decrypted directly.',
        encryptButton: 'Encrypt',
        decryptButton: 'Decrypt',
        algorithmDefaultAes: 'AES (default, AES block cipher algorithm)',
        modeDefaultCbc: 'CBC (default, Cipher Block Chaining mode)',
        paddingDefaultPkcs7: 'Pkcs7 (default, PKCS #5/7 padding strategy)',
        emptyInputAlert: 'Please enter the text to encrypt...',
        emptyCipherAlert: 'Please enter the text to decrypt...',
        encryptFailed: 'Encryption failed: {error}',
        decryptFailed: 'Decryption failed: {error}'
    },
    rsa: {
        title: 'Key pair generator',
        description:
            'Generate a new random RSA or ed25519 private key and public key in PEM format.',
        refreshButton: 'Refresh key pair'
    },
    token: {
        description:
            'Generate a random string using the characters you want — uppercase or lowercase letters, numbers, and/or symbols.',
        uppercaseLabel: 'Uppercase (ABCDEFGHIJKLMNOPQRSTUVWXYZ)',
        lowercaseLabel: 'Lowercase (abcdefghijklmnopqrstuvwxyz)',
        numberLabel: 'Numbers (0123456789)',
        symbolLabel: 'Symbols (!@#$%^&*()_+{}:<>?[]\\|~)',
        lengthLabel: 'Length',
        outputPlaceholder: 'Generated token......',
        generateButton: 'Generate',
        refreshButton: 'Refresh',
        clearButton: 'Clear'
    },
    ulid: {
        title: 'ULID generator',
        description:
            'Generate random universally unique lexicographically sortable identifiers (ULIDs).',
        countLabel: 'Count:',
        formatLabel: 'Format:',
        copyButton: 'Copy',
        refreshButton: 'Refresh'
    },
    uuid: {
        title: 'UUIDs generator',
        description:
            'Universally unique identifiers (UUIDs) are 128-bit numbers used to identify information in computer systems. The number of possible UUIDs is 16^32, or 2^128 — about 3.4x10^38 (that is a lot of numbers!).',
        countLabel: 'Count:',
        namespaceLabel: 'Namespace:',
        nameLabel: 'Name:',
        copyButton: 'Copy',
        refreshButton: 'Refresh'
    },
    base64: {
        title: 'Base64 Encode/Decode',
        description:
            'Encode text into Base64 (UTF-8 first), or decode Base64 back into text; invalid characters are ignored when decoding.',
        inputLabel: 'Plain text:',
        inputPlaceholder: 'Enter the text to encode/decode...',
        outputLabel: 'Result:',
        outputPlaceholder: 'Encode/decode result...',
        encodeButton: 'Encode',
        decodeButton: 'Decode',
        copyButton: 'Copy',
        clearButton: 'Clear'
    },
    urlCodec: {
        title: 'URL Encode/Decode',
        description:
            'Encode and decode text with URL percent-encoding (UTF-8) via encodeURIComponent/decodeURIComponent.',
        inputLabel: 'Plain text:',
        inputPlaceholder: 'Enter the text to encode/decode...',
        outputLabel: 'Result:',
        outputPlaceholder: 'Encode/decode result...',
        encodeButton: 'Encode',
        decodeButton: 'Decode',
        copyButton: 'Copy',
        clearButton: 'Clear',
        decodeErrorAlert: 'Decode failed, the input contains an invalid URL encoding: {error}'
    },
    htmlCodec: {
        title: 'HTML Entity Encode/Decode',
        description:
            'Encoding escapes & < > " \'; decoding supports common named entities (&amp; &lt; &gt; &quot; &#39; &nbsp; …) and numeric entities &#nn; / &#xhh;.',
        inputLabel: 'Plain text:',
        inputPlaceholder: 'Enter the text to encode/decode...',
        outputLabel: 'Result:',
        outputPlaceholder: 'Encode/decode result...',
        encodeButton: 'Encode',
        decodeButton: 'Decode',
        copyButton: 'Copy',
        clearButton: 'Clear'
    },
    unicode: {
        title: 'Unicode & Chinese Converter',
        description:
            'Convert between Chinese text and \\uXXXX Unicode escapes, and between ASCII and &#nnn; numeric entities.',
        inputLabel: 'Plain text:',
        inputPlaceholder: 'Enter the text to convert...',
        outputLabel: 'Result:',
        outputPlaceholder: 'Conversion result...',
        toUnicodeButton: 'Text to \\uXXXX',
        toTextButton: '\\uXXXX to Text',
        toEntityButton: 'Text to &#Entities',
        entityToTextButton: '&#Entities to Text',
        copyButton: 'Copy',
        clearButton: 'Clear'
    },
    imageBase64: {
        title: 'Image to Base64',
        description:
            'Choose an image (up to 20MB) to convert it into Base64/DataURL; you can also decode Base64 back into an image preview.',
        chooseFileLabel: 'Choose image:',
        chooseFileButton: 'Choose File',
        base64Label: 'Base64 content:',
        base64Placeholder:
            'Base64 is generated after choosing an image, or paste Base64/DataURL to preview...',
        decodeButton: 'Base64 to Image',
        copyButton: 'Copy',
        clearButton: 'Clear',
        previewLabel: 'Image Preview',
        sizeLimitAlert: 'The image exceeds the 20MB limit, please choose a smaller one.',
        emptyInputAlert: 'Please choose an image or enter Base64 content first.',
        readFailedAlert: 'Failed to read the image: {error}',
        decodeFailedAlert: 'Base64 decode failed: {error}'
    },
    unit: {
        title: 'Unit Converter',
        description:
            'Convert length units (metric/imperial/astronomical/Chinese/typographic) and storage units (binary 1024 / SI decimal).',
        lengthTab: 'Length',
        storageTab: 'Storage',
        valueLabel: 'Value:',
        fromLabel: 'From:',
        toLabel: 'To:',
        resultLabel: 'Result:',
        modeLabel: 'System:',
        binary: 'Binary (1024)',
        si: 'SI decimal (1000)',
        invalidValue: 'Please enter a valid number',
        units: {
            mm: 'Millimeter (mm)',
            cm: 'Centimeter (cm)',
            dm: 'Decimeter (dm)',
            m: 'Meter (m)',
            km: 'Kilometer (km)',
            um: 'Micrometer (μm)',
            nm: 'Nanometer (nm)',
            pm: 'Picometer (pm)',
            inch: 'Inch (in)',
            foot: 'Foot (ft)',
            yard: 'Yard (yd)',
            mile: 'Mile (mi)',
            nmi: 'Nautical mile (nmi)',
            ly: 'Light year (ly)',
            au: 'Astronomical unit (au)',
            pc: 'Parsec (pc)',
            pt: 'Point (pt)',
            px: 'Pixel (px)',
            zhang: 'Zhang',
            chi: 'Chi',
            cun: 'Cun',
            fen: 'Fen',
            li2: 'Li (1/3000 m)',
            li3: 'Li (Chinese mile)'
        }
    },
    rmb: {
        title: 'RMB Uppercase Converter',
        description:
            'Convert RMB numeric amounts into Chinese uppercase (supports negative and decimal values, precise to cents).',
        inputLabel: 'Amount:',
        placeholder: 'Enter an amount, e.g. 100.5',
        resultLabel: 'Uppercase:',
        convertButton: 'Convert',
        copyButton: 'Copy'
    },
    timestamp: {
        title: 'Timestamp Converter',
        description:
            'Convert between Unix timestamps and local date-time, with second/millisecond toggle and live current timestamp (local time zone).',
        unitLabel: 'Unit:',
        seconds: 'Seconds',
        milliseconds: 'Milliseconds',
        currentLabel: 'Current timestamp:',
        copyButton: 'Copy',
        tsToLocalTitle: 'Timestamp → Local time',
        timestampLabel: 'Timestamp:',
        tsPlaceholder: 'e.g. 1700000000',
        convertButton: 'Convert',
        localTimeLabel: 'Local time:',
        localToTsTitle: 'Local time → Timestamp',
        dateTimeLabel: 'Date-time:',
        dateTimePlaceholder: 'YYYY-MM-DD HH:mm:ss',
        emptyInput: 'Please enter a timestamp'
    },
    random: {
        title: 'Random Generator',
        description:
            'Generate passwords, random strings, random numbers and random colors using unbiased crypto.getRandomValues sampling.',
        tabs: {
            password: 'Password',
            string: 'String',
            number: 'Numbers',
            color: 'Color'
        },
        passwordLength: 'Length (4-128):',
        uppercase: 'Uppercase (A-Z)',
        lowercase: 'Lowercase (a-z)',
        numbers: 'Numbers (0-9)',
        symbols: 'Symbols (!@#$...)',
        generateButton: 'Generate',
        copyButton: 'Copy',
        stringLength: 'Length:',
        charsetLabel: 'Charset:',
        charsets: {
            alnum: 'Letters + digits',
            alpha: 'Letters',
            lower: 'Lowercase letters',
            upper: 'Uppercase letters',
            digits: 'Digits'
        },
        customCharset: 'Custom charset:',
        minLabel: 'Min:',
        maxLabel: 'Max:',
        countLabel: 'Count (≤100):',
        colorModeLabel: 'Mode:',
        vividColor: 'Vivid (fixed S/V)',
        randomBrightness: 'Random brightness'
    },
    calculator: {
        title: 'Calculator',
        description:
            'Standard calculator: addition, subtraction, multiplication, division, modulo, power and parentheses, evaluated with a dual-stack algorithm without eval.',
        clear: 'Clear',
        backspace: 'Backspace',
        equal: '='
    },
    chineseText: {
        title: 'Chinese text tool',
        description:
            'Convert between Traditional and Simplified Chinese; convert Han characters to pinyin (no tones, first reading for polyphones).',
        tabConvert: 'Traditional ⇄ Simplified',
        tabPinyin: 'Hanzi to Pinyin',
        inputPlaceholder: 'Enter text...',
        outputPlaceholder: 'Conversion result...',
        toTraditional: 'To Traditional',
        toSimplified: 'To Simplified',
        toPinyin: 'To Pinyin',
        toFirstLetter: 'To First Letters',
        copyButton: 'Copy'
    },
    wordCount: {
        title: 'Word count',
        description:
            'Count Chinese characters, punctuation, letters, digits and paragraphs in real time.',
        inputPlaceholder: 'Type or paste text here...',
        chineseChars: 'Chinese characters',
        chinesePunctuation: 'Chinese punctuation',
        letters: 'Letters',
        digits: 'Digits',
        englishPunctuation: 'English punctuation',
        totalChars: 'Total characters',
        noSpaceChars: 'Chars without spaces',
        paragraphs: 'Paragraphs',
        clearButton: 'Clear'
    },
    textDiff: {
        title: 'Text diff',
        description:
            'Compare two texts line by line: added lines are marked with +, removed lines with -.',
        originalLabel: 'Original text',
        modifiedLabel: 'Modified text',
        originalPlaceholder: 'Enter the original text...',
        modifiedPlaceholder: 'Enter the modified text...',
        compareButton: 'Compare',
        tooLarge: 'Text too large (total lines × characters > 4M): the two sides differ.'
    },
    jsonTool: {
        title: 'JSON tool',
        description: 'Format, minify, escape and unescape JSON.',
        tabFormat: 'Format',
        tabMinify: 'Minify',
        tabEscape: 'Escape / Unescape',
        inputPlaceholder: 'Enter JSON text...',
        outputPlaceholder: 'Result...',
        formatButton: 'Format',
        minifyButton: 'Minify',
        escapeButton: 'Escape',
        unescapeButton: 'Unescape',
        copyButton: 'Copy',
        errorPrefix: 'Error: '
    },
    xmlFormatter: {
        title: 'XML formatter',
        description: 'Format and minify XML (comments, CDATA and text content preserved).',
        tabFormat: 'Format',
        tabMinify: 'Minify',
        indentLabel: 'Indent spaces: ',
        inputPlaceholder: 'Enter XML text...',
        outputPlaceholder: 'Result...',
        formatButton: 'Format',
        minifyButton: 'Minify',
        copyButton: 'Copy',
        errorPrefix: 'Error: '
    },
    regexTester: {
        title: 'Regex tester',
        description:
            'Test regex matching and replacement in a background Web Worker with automatic timeout (d/g/i/m/s/u/v/y; u and v are exclusive).',
        patternLabel: 'Pattern',
        flagsLabel: 'Flags',
        inputLabel: 'Test text',
        replacementLabel: 'Replacement',
        testButton: 'Test',
        replaceButton: 'Replace',
        matchCount: 'Matches',
        emptyMatch: '(empty)',
        running: 'Matching…',
        timeout:
            'Timed out: the match was aborted. The pattern may trigger catastrophic backtracking; simplify it or shorten the test text.',
        truncated: 'Match count reached the limit of 5000; results were truncated.',
        uvExclusive:
            'Flags u and v are exclusive and cannot be enabled together (the other one was unchecked).',
        errorPrefix: 'Error: ',
        replaceOutputLabel: 'Replacement result'
    }
}
