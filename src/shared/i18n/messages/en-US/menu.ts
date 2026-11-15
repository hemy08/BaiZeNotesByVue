/**
 * menu namespace (en)
 *
 * Shell menu entries: top-level groups and all menu item labels.
 * Menu data files store only labelKey; MenuBar.vue resolves them via t(labelKey).
 */
export default {
    file: {
        label: 'File',
        new: 'New',
        openFile: 'Open File',
        openFolder: 'Open Folder',
        import: {
            label: 'Import from File',
            word: 'Import from Word',
            html: 'Import from HTML',
            json: 'Import from JSON',
            yaml: 'Import from YAML',
            xml: 'Import from XML',
            text: 'Import from Text File'
        },
        export: {
            label: 'Export to File',
            word: 'Export as Word',
            json: 'Export as JSON',
            xml: 'Export as XML',
            yaml: 'Export as YAML',
            html: 'Export as HTML',
            pdf: 'Export as PDF'
        },
        saveAs: 'Save As',
        reload: 'Reload from Disk',
        relaunch: 'Restart Application',
        exit: 'Exit'
    },
    edit: {
        label: 'Edit',
        goLine: 'Go to Line',
        goLinePrompt: 'Enter the line number to jump to:',
        find: 'Find',
        replace: 'Replace'
    },
    view: {
        label: 'View',
        editMode: 'Edit Mode',
        previewMode: 'Preview Mode',
        editPreviewMode: 'Edit/Preview Mode',
        devTools: 'Developer Tools',
        toggleResourceManager: 'Show/Hide Explorer',
        toggleLineNumber: 'Show/Hide Line Numbers',
        toggleWhitespace: 'Show/Hide Whitespace',
        toggleOutline: 'Show/Hide Outline',
        fold: {
            label: 'Collapse/Expand Headings',
            allFold: 'Collapse All',
            allExpand: 'Expand All',
            level1: 'Heading 1',
            level2: 'Heading 2',
            level3: 'Heading 3',
            level4: 'Heading 4',
            level5: 'Heading 5',
            level6: 'Heading 6'
        }
    },
    coding: {
        label: 'Encoding',
        reopen: 'Reopen with Encoding...',
        convert: 'Convert Encoding...',
        utf8: 'UTF-8',
        utf16le: 'UTF-16LE',
        utf16be: 'UTF-16BE',
        gbk: 'GBK (Simplified Chinese)',
        gb2312: 'GB2312 (Simplified Chinese)',
        gb18030: 'GB18030 (Simplified Chinese)',
        big5: 'Big5 (Traditional Chinese)',
        big5hkscs: 'Big5-HKSCS (Traditional Chinese)',
        hex: 'Hexadecimal',
        warning: 'Note: do not edit garbled files directly.'
    },
    insert: {
        label: 'Insert',
        specialText: 'Special Text',
        math: 'Math Formula',
        mdTable: 'Markdown Table',
        webLink: 'Web Link',
        writing: 'Writing Templates',
        textBlock: 'Text Blocks',
        fromFile: 'From File',
        material: {
            label: 'Material',
            admonition: 'Admonition'
        },
        mermaid: {
            label: 'Mermaid',
            part1: 'Mermaid Part 1',
            part2: 'Mermaid Part 2'
        },
        plantuml: {
            label: 'PlantUML',
            part1: 'PlantUML Part 1',
            part2: 'PlantUML Part 2'
        }
    },
    setting: {
        label: 'Settings',
        system: 'System Settings',
        theme: 'Theme Settings',
        quickLink: 'Quick Link Settings',
        editor: 'Editor Settings'
    },
    tools: {
        label: 'Tools',
        mermaid: 'Mermaid Diagram',
        katex: 'Formula Editor',
        table: 'Spreadsheet',
        images: 'Image Creation',
        drawing: {
            label: 'Drawing Tools',
            mermaid: 'Mermaid Drawing',
            plantuml: 'PlantUML Drawing'
        }
    },
    plugins: {
        label: 'Plugins',
        group: {
            languageKeywords: 'Language Syntax Keyword Reference',
            encrypt: 'Encryption Plugins',
            converters: 'Converters',
            codec: 'Codec Conversion',
            formatConvert: 'Format Converters',
            caseConvert: 'Case Conversion',
            formatTools: 'Formatters',
            network: 'Network Calculators',
            addressConverter: 'Address Converters',
            parsers: 'Parsers',
            cheatSheets: 'Common Reference Tables',
            cheatSheet1: 'Reference Tables 1',
            dataCommand: 'Data and Command Tables',
            science: 'Scientific Symbol Tables'
        },
        encrypt: {
            uuids: 'UUIDs Generator',
            ulid: 'ULID Generator',
            tokenGenerator: 'Token Generator',
            hashText: 'Hash Text',
            encryptDecrypt: 'Encrypt/Decrypt Text',
            cryptoEncryptDecrypt: 'Crypto Encrypt/Decrypt Text',
            hmac: 'HMAC Generator',
            rsa: 'RSA Key Pair Generator'
        },
        net: {
            ipv4SubnetCalculator: 'IPv4 Subnet Calculator',
            // FE-17：网络对照表工具菜单项（task-23 补齐）
            httpStatusCodes: 'HTTP Status Code Table',
            subnetMaskMapTable: 'Subnet Mask Table'
        },
        info: {
            asciiTable: 'ASCII Table',
            fileExtensionTable: 'File Extension Table',
            greeceLetterTable: 'Greek Letter Reference',
            htmlEntityTable: 'HTML Entity Table',
            mathSymbolTable: 'Math Symbol Table',
            physicalConstantTable: 'Physical Constant Table',
            // FE-17：常用对照表工具菜单项（task-23 补齐）
            numericCaseTable: 'Numeric Case Table',
            normalFontStyleTable: 'Normal Font Styles'
        }
    },
    online: {
        label: 'Online',
        group: {
            cainiao: 'Cainiao Online Tools',
            w3school: 'W3CSchool Online Tools',
            encode: 'Online Codec Tools',
            ide: 'Online IDE',
            dev: 'Developer Tools',
            team: 'Popular Chinese Frontend Teams',
            cloud: 'Cloud Platforms'
        },
        tools: {
            cainiaoTools: 'Cainiao Tools',
            w3cschoolTools: 'W3CSchool Tools',
            baibaoxiang: 'Baibaoxiang Toolbox',
            toolfk: 'ToolFK',
            bejson: 'BeJson JSON Toolbox',
            tool67: '67tool Instant Tools',
            toollu: 'ToolLu Online Tools',
            sojson: 'SoJSON Online Parser',
            latexEditor: 'LaTeX Formula Editor',
            mermaidEditor: 'Mermaid Live Editor',
            planttextEditor: 'PlantText Editor',
            mindmapTool: 'Online Mind Map Tool',
            diagramsTool: 'Online Flowchart Drawing',
            plantumlServer: 'PlantUML Web Server',
            chuiziTools: 'ToolHelper Online Tools'
        },
        cainiao: {
            svgEditor: 'Cainiao SVG Image Editor',
            drawTool: 'Cainiao Drawing Tool',
            officeTools: 'Cainiao Online Office Tools',
            tableGenerator: 'Cainiao Online Table Generator'
        },
        w3school: {
            csvToHtml: 'CSV to HTML',
            sqlFormatter: 'SQL Formatter',
            fullwidthHalfwidth: 'Full-width/Half-width Converter'
        },
        encode: {
            qrcodeGenerator: 'Online QR Code Generator',
            qrcodeDecoder: 'Online QR Code Decoder',
            encodingConverter: 'Online URL Encode/Decode'
        },
        ide: {
            html: 'HTML',
            python: 'Python',
            c: 'C',
            go: 'Go'
        },
        dev: {
            prettyQrcode: 'Beautiful QR Code Generator',
            qrcodeDecoder: 'QR Code Decoder',
            imageFormatConverter: 'Image Format Converter',
            linuxCrontab: 'Linux Crontab',
            jwtDecoder: 'JWT Online Decoder'
        },
        team: {
            taobaoFed: 'Taobao FED Team',
            tmallFe: 'Tmall Frontend',
            aliNodejs: 'Alibaba Node.js Performance Platform',
            baiduFex: 'Baidu FEX'
        },
        cloud: {
            aliyun: 'Alibaba Cloud',
            tencent: 'Tencent Cloud',
            huawei: 'Huawei Cloud',
            tianyi: 'Tianyi Cloud',
            jinshan: 'Kingsoft Cloud'
        }
    },
    github: {
        itTools: 'IT TOOLS for Developers and IT Workers',
        ghost: 'Ghost Personal Website Builder',
        priospace: 'Priospace - All-in-one Productivity Tools',
        plane: 'Plane - Developer-friendly Project Management',
        openproject: 'OpenProject - Powerful Enterprise Project Management'
    },
    help: {
        label: 'Help',
        release: 'Release Notes',
        updateLog: 'Changelog',
        updateLogItem: 'Major Version Upgrade',
        shortkeys: 'Keyboard Shortcuts',
        usage: 'Documentation',
        issues: 'Submit Ideas/Feedback',
        techStack: 'Tech Stack',
        about: 'About',
        home: 'Homepage',
        update: 'Check for Updates',
        contactUs: 'Contact Us'
    },
    template: {
        mermaid: {
            basic: 'Basic framework',
            c4: 'C4 diagram',
            classDiagram: 'Class diagram',
            erDiagram: 'ER diagram',
            gantt: 'Gantt chart',
            gitGraph: 'Git graph',
            graph: 'Basic flowchart',
            journey: 'User journey',
            mindmap: 'Mind map',
            pie: 'Pie chart',
            quadrantChart: 'Quadrant chart',
            requirementDiagram: 'Requirement diagram',
            sankey: 'Sankey diagram',
            sequenceDiagram: 'Sequence diagram',
            stateDiagram: 'State diagram',
            timeline: 'Timeline'
        },
        plantuml: {
            basic: 'Basic framework',
            activityDiagram: 'Activity diagram',
            sdl: 'Specification and Description Language (SDL)',
            archimateDiagram: 'Architecture diagram',
            classDiagram: 'Class diagram',
            componentDiagram: 'Component diagram',
            deploymentDiagram: 'Deployment diagram',
            ditaaDiagram: 'Ditaa diagram',
            entityRelationship: 'ER diagram',
            ebnf: 'EBNF diagram',
            ganttDiagram: 'Gantt chart',
            informationEngineering: 'Information engineering diagram',
            jsonDiagram: 'JSON data',
            mindmapDiagram: 'Mind map',
            nwdiag: 'Network diagram',
            objectDiagram: 'Object diagram',
            regex: 'Regex diagram',
            salt: 'UI mockup',
            sequenceDiagram: 'Sequence diagram',
            stateDiagram: 'State diagram',
            timingDiagram: 'Timing diagram',
            useCaseDiagram: 'Use case diagram',
            wbsDiagram: 'WBS diagram',
            yamlDiagram: 'YAML data'
        },
        textblock: {
            imageLinks: 'Image links',
            blockcode: 'Collapsible code block',
            linksList: 'Ordered link list',
            updateDate: 'Article update date'
        },
        writing: {
            leetcode: 'LeetCode solution template',
            problemResolving: 'Problem solving template',
            thesisCoverPage: 'Article cover',
            thesisTemplates: 'Thesis template'
        }
    }
}
