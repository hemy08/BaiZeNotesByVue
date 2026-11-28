/**
 * toolsNetwork namespace (en)
 * Covers: plugin tools shell, reference tables (Informations), network tools
 * (NetWork), the Tools/LatexEditor panel and the HemyTools shells.
 *
 * Note: the data rows of the reference tables (ASCII table, HTTP status code
 * descriptions, font/MIME types, Greek letters, etc.) are reference data and
 * stay untouched in information-tables/; they are not part of this dictionary.
 */
export default {
    common: {
        backToEditor: 'Back to editor',
        retry: 'Retry',
        openInBrowser: 'Open in browser'
    },
    pluginTools: {
        placeholder: 'Please select another tool. This tool is under development — stay tuned.',
        // 1.5.6 batch B (REQ-04/05): panel search + favorites/recently used
        searchPlaceholder: 'Search tools by name, category or keyword',
        searchAriaLabel: 'Search plugin tools',
        searchClear: 'Clear search',
        searchResultCount: '{count} tools found',
        noResult: 'No matching tools',
        noResultHint:
            'Try a tool name, a category (e.g. "Encrypt") or a keyword (e.g. "hash", "Base64")',
        favorites: 'Favorites',
        recent: 'Recently used',
        allTools: 'All tools',
        addFavorite: 'Add to favorites',
        removeFavorite: 'Remove from favorites',
        favoritesLimitReached: 'Favorites limit reached (up to {count})',
        backToToolList: 'Tool list',
        homeHint: 'Browse all tools, favorites and recently used'
    },
    infoTables: {
        /** Shared search placeholder for the 10 lookup tables */
        searchPlaceholder: 'Search…',
        ascii: {
            title: 'ASCII table',
            desc: 'ASCII reference table with search',
            bin: 'Bin (binary)',
            oct: 'Oct (octal)',
            dec: 'Dec (decimal)',
            hex: 'Hex (hexadecimal)',
            char: 'Abbr./Char.',
            explanation: 'Description'
        },
        fileNameExtension: {
            title: 'File types (MIME header)',
            desc: 'File types (MIME header)',
            extension: 'File extension',
            mimeType: 'Content-Type (Mime-Type)'
        },
        formulaSymbol: {
            title: 'Mathematical symbols',
            desc: 'Search mathematical formula symbols',
            symbol: 'Symbol',
            explanation: 'Description'
        },
        greeceLetter: {
            title: 'Greek letters',
            desc: 'Greek letters in upper and lower case',
            symbol: 'Special symbol',
            entity: 'Named entity',
            decimal: 'Decimal code'
        },
        htmlSpecialChar: {
            title: 'HTML special characters',
            desc: 'HTML special character reference table with search',
            preview: 'Preview',
            code: 'Code',
            explanation: 'Description'
        },
        httpStatusCode: {
            title: 'HTTP status codes',
            desc: 'HTTP status codes and their meanings',
            code: 'Status code',
            explanation: 'Description'
        },
        normalFontStyle: {
            title: 'Common fonts',
            desc: 'Search common fonts',
            fontName: 'Font name',
            cssStyle: 'CSS style',
            preview: 'Preview'
        },
        numericCase: {
            title: 'Number case units',
            desc: 'Number case units',
            digit: 'Digit',
            lower: 'Lower case',
            upper: 'Upper case'
        },
        physicalSymbol: {
            title: 'Physical symbols and constants',
            desc: 'Search physical symbols and constants',
            symbol: 'Symbol',
            name: 'Name',
            explanation: 'Description'
        },
        subnetMask: {
            title: 'Subnet mask reference',
            desc: 'IP address and subnet mask reference table',
            mask: 'Mask',
            bits: 'Bits',
            ipCount: 'IPs'
        }
    },
    network: {
        ipv4AddrConvert: {
            title: 'IPv4 address converter',
            desc: 'In IPv6, convert an IP address to decimal, binary, hexadecimal or event'
        },
        ipv6UlaGenerator: {
            title: 'IPv6 ULA generator',
            desc: 'Generate your own local, non-routable IP address on the network according to RFC 4193.'
        },
        macAddrGenerator: {
            title: 'MAC address generator',
            desc: 'Enter the count and prefix. MAC addresses are generated in the letter case you choose (upper or lower).'
        },
        macAddrLookup: {
            title: 'MAC address lookup',
            desc: 'Look up the vendor and manufacturer of a device by its MAC address.'
        },
        qrcodeGenerator: {
            title: 'QR code generator',
            desc: 'Generate and download a QR code for a URL or text, and customize the background and foreground colors.'
        },
        wifiQrcodeGenerator: {
            title: 'WiFi QR code generator',
            desc: 'Generate and download a QR code to quickly connect to a Wi-Fi network.'
        },
        ipv4SubnetCalc: {
            title: 'IPv4 subnet calculator',
            desc: 'Parse an IPv4 CIDR block and get all the information you need about the subnet.',
            networkCalcTitle: 'Network and IP address calculator',
            networkCalcDesc:
                'Show the network, broadcast, first and last addresses of the given network:',
            ipMaskBits: 'IP/mask bits:',
            calculate: 'Calculate',
            reset: 'Reset',
            availableAddresses: 'Available addresses:',
            cidrNote:
                'The “bit format” of a network mask is also called CIDR format (CIDR = Classless Inter-Domain Routing).',
            maskToBitsTitle: 'Subnet mask converter (dotted decimal to bits)',
            maskToBitsDesc:
                'Calculate the mask bits from a network mask. An invalid mask returns “invalid”.',
            settings: 'Settings:',
            result: 'Result/',
            bitsToMaskTitle: 'Subnet mask converter (bits to dotted decimal)',
            netmask: 'Netmask:',
            networkAddress: 'Network address:',
            firstUsable: 'First usable:',
            lastUsable: 'Last usable:',
            broadcast: 'Broadcast:',
            dec: 'Dec (decimal):',
            hex: 'Hex (hexadecimal):',
            availableCount: 'Available addresses:',
            totalCount: 'Total addresses:',
            ipNumberTitle: 'Mask converter for a required number of IPs',
            ipNumberDesc:
                'Calculate the mask bits, decimal mask and hexadecimal mask for the required number of IP addresses.',
            maskBits: 'Mask bits:',
            invalidIp: 'The entered IP address is invalid',
            invalidMask: 'invalid'
        }
    },
    tools: {
        latexEditor: {
            title: 'LaTeX formula editor',
            introPronounce:
                ' (often pronounced /ˈlɑːtɛk/ or /ˈleɪtɛk/, correctly /ˈlɑːtɛx/; transliterated as “拉泰赫”, written LaTeX), a TeX-based typesetting system developed by American computer scientist',
            lamport: 'Leslie Lamport',
            introOrigin: ' in the early 1980s.',
            introLibrary:
                ' is a cross-browser JavaScript library that displays mathematical notation in web browsers using MathML, LaTeX and ASCIIMathML markup.',
            introPage: 'This page is based on',
            introExport:
                ' to provide a convenient LaTeX formula editor that supports exporting SVG vector graphics, high-resolution PNG bitmaps, MathML code and SVGCode.',
            inputArea: 'Input area',
            outputArea: 'Output area',
            quickTools: 'Shortcuts',
            formulaTemplates: 'Templates',
            imageRecognition: 'Image recognition',
            placeholder: 'Enter your LaTeX expression'
        }
    },
    hemyTools: {
        pdfView: {
            loading: 'Loading PDF file...',
            loadFailed: 'Failed to load: {error}',
            fileNotFound: 'File not found',
            empty: 'Select a PDF file to preview',
            zoomIn: 'Zoom in',
            zoomOut: 'Zoom out',
            prevPage: 'Previous page',
            nextPage: 'Next page',
            unreadable: 'Unable to read the PDF file',
            // 1.5.2 E2: PDF annotations and excerpts (hidden when featurePdfAnnotations is off)
            annotations: {
                addAnnotation: 'Add annotation',
                annotationList: 'Annotations',
                annotationListTitle: 'Annotations ({count})',
                annotationEmpty:
                    'This PDF has no annotations yet. Select text on the page and click "Add annotation" to create one.',
                annotationSelectHint: 'Select some text first, then click "Add annotation"',
                annotationPageChip: 'Page {page}',
                annotationJump: 'Go to page {page}',
                annotationDelete: 'Delete annotation',
                annotationExcerpt: 'Excerpt into current note',
                annotationPanelClose: 'Close annotation list'
            }
        },
        htmlView: {
            loading: 'Loading HTML file...',
            loadFailed: 'Failed to load: {error}',
            empty: 'Select an HTML file to preview',
            unreadable: 'Unable to read the file content',
            refresh: 'Refresh'
        }
    }
}
