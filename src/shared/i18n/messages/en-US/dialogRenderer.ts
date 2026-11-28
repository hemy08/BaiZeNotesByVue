/**
 * dialogRenderer namespace (en)
 * User-visible copy for renderer dialogs (src/renderer/src/components/dialogs/**).
 */
const dialogRenderer = {
    common: {
        title: 'Dialog',
        insert: 'Insert',
        edit: 'Edit',
        select: 'Select',
        format: 'Format',
        clear: 'Clear',
        preview: 'Preview',
        titleLabel: 'Title',
        content: 'Content',
        name: 'Name',
        previewPlaceholder: 'Preview area',
        insertChart: 'Insert chart',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        downloadImage: 'Download image',
        retry: 'Retry',
        loading: 'Loading...',
        versionLabel: 'Version: {version}',
        docs: 'Docs',
        followUs: 'Follow us'
    },
    // P2 error-handling fix: encoding menu (reopen with encoding / convert encoding)
    // failure messages. The retry button on the message dialog re-runs the same action.
    encoding: {
        reopenFailedTitle: 'Failed to reopen with encoding',
        reopenFailedMessage:
            'Could not reopen the current file with "{encoding}" encoding: {error}',
        convertFailedTitle: 'Failed to convert encoding',
        convertFailedMessage: 'Could not convert and save the current file as "{encoding}": {error}'
    },
    rename: {
        currentPath: 'Current path',
        newName: 'New name',
        newNamePlaceholder: 'Enter a new name'
    },
    webUrl: {
        defaultTitle: 'Insert link',
        linkText: 'Link text',
        linkTextPlaceholder: 'Enter link display text',
        linkUrl: 'Link URL',
        linkUrlPlaceholder: 'Enter a URL, e.g. https://example.com'
    },
    createFileFolder: {
        defaultTitle: 'New file/folder',
        dirLabel: 'Directory',
        nameLabel: 'Name',
        namePlaceholder: 'Enter a name',
        createFile: 'New file',
        createFolder: 'New folder'
    },
    admonition: {
        title: 'Insert Admonition',
        titlePlaceholder: 'Optional title',
        contentPlaceholder: 'Admonition content',
        contentFallback: 'Admonition content',
        defaultContent: 'This is the content...'
    },
    importOption: {
        title: 'Import options',
        header: 'Choose an import method',
        subtitle: 'Choose how to handle the imported content',
        replaceTitle: 'Replace current content',
        replaceDesc: 'Clear the editor and replace it with the imported content',
        newFileTitle: 'New file',
        newFileDesc:
            'Create a new file with the imported content (you will choose where to save it)',
        insertTitle: 'Insert at cursor',
        insertDesc: 'Insert the imported content at the current cursor position'
    },
    insertImage: {
        title: 'Insert image',
        filePath: 'File path',
        chooseFile: 'Choose file',
        imageUrl: 'Image URL',
        imageUrlPlaceholder: 'Enter image URL',
        altText: 'Alt text',
        altPlaceholder: 'Image description',
        titlePlaceholder: 'Optional image title',
        width: 'Width (px)',
        widthPlaceholder: 'Leave empty for original size',
        alignment: 'Alignment',
        alignNone: 'Default',
        alignLeft: 'Left',
        alignCenter: 'Center',
        alignRight: 'Right',
        caption: 'Caption',
        captionPlaceholder: 'Optional image caption',
        localFile: 'Local file',
        networkImage: 'Network image'
    },
    mathText: {
        title: 'Math formula',
        formulaEdit: 'Formula editor',
        formulaPlaceholder: 'Enter a LaTeX formula...',
        insertInline: 'Insert inline formula',
        insertBlock: 'Insert block formula',
        insertMath: 'Insert Math',
        insertKatex: 'Insert KaTeX',
        insertLatex: 'Insert LaTeX',
        cancelEdit: 'Cancel editing',
        syntaxError: 'Formula syntax error'
    },
    tableEditor: {
        title: 'Table Editor',
        insertTitle: 'Insert Table',
        editTitle: 'Edit Table',
        insertHint: 'Fill in the table; it will be inserted at the current cursor position.',
        editHint: 'Edit headers, cells and alignment; the current table will be replaced on apply.',
        header: 'Header',
        cell: 'Cell',
        column: 'Column',
        row: 'Row',
        alignment: 'Column alignment',
        alignDefault: 'Default',
        alignLeft: 'Left',
        alignCenter: 'Center',
        alignRight: 'Right',
        alignShortDefault: 'Default',
        alignShortLeft: 'Left',
        alignShortCenter: 'Center',
        alignShortRight: 'Right',
        addRow: 'Add row',
        addColumn: 'Add column',
        deleteRow: 'Delete row',
        deleteColumn: 'Delete column',
        applyInsert: 'Insert table',
        applyEdit: 'Apply changes',
        rowsCount: '{count} rows',
        columnsCount: '{count} cols',
        rows: 'Rows',
        columns: 'Columns',
        settingsTitle: 'Table settings',
        allColumnsAlign: 'All columns alignment',
        importFile: 'Import Excel/CSV',
        importing: 'Importing…',
        importEmpty: 'No importable table data found in this file',
        importSuccess: 'Imported {rows} rows and {columns} columns',
        sortBy: 'Sort by column',
        sortAsc: 'Ascending',
        sortDesc: 'Descending',
        sort: 'Sort',
        transpose: 'Transpose',
        insertRowBelow: 'Insert row below',
        insertColumnRight: 'Insert column right',
        dragRow: 'Drag to reorder row',
        dragColumn: 'Drag to reorder column',
        resizeColumn: 'Drag to resize column',
        taskToggle: 'Toggle task status',
        cellRichHint:
            'Cells support Markdown: line breaks, bold, italic, inline code, links, images, math; use - [ ] / - [x] for tasks',
        resizeHint: 'Drag to resize dialog',
        shortcutHint: 'Ctrl + Enter to apply, Esc to cancel',
        keyboardHint: 'Arrow keys / Tab move between cells, Enter or F2 edits, Esc cancels'
    },
    mdSheet: {
        title: 'Insert table',
        rows: 'Rows',
        cols: 'Columns',
        alignDefault: 'Default align',
        alignLeft: 'Align left',
        alignCenter: 'Align center',
        alignRight: 'Align right',
        columnLabel: 'Column {index}'
    },
    editorSetting: {
        title: 'Editor settings',
        sidebarBasic: 'Basic',
        sidebarAppearance: 'Appearance',
        sidebarAdvanced: 'Advanced',
        markdown: 'Markdown',
        panelBasicTitle: 'Basic settings',
        panelBasicDesc: 'Basic editor options',
        panelAppearanceTitle: 'Appearance settings',
        panelAppearanceDesc: 'Editor visual options',
        panelMarkdownTitle: 'Markdown settings',
        panelMarkdownDesc: 'Markdown-specific options',
        panelAdvancedTitle: 'Advanced settings',
        panelAdvancedDesc: 'Advanced editor options',
        groupAutoSave: 'Auto save',
        labelEnableAutoSave: 'Enable auto save',
        labelAutoSaveInterval: 'Auto save interval (seconds)',
        groupEditing: 'Editing experience',
        labelEnableFolding: 'Enable code folding',
        labelShowLineNumbers: 'Show line numbers',
        labelEnableAutoComplete: 'Enable autocomplete',
        groupCursor: 'Cursor and selection',
        labelCursorStyle: 'Cursor style',
        cursorLine: 'Line',
        cursorBlock: 'Block',
        cursorUnderline: 'Underline',
        cursorBlink: 'Blink',
        labelCursorWidth: 'Cursor width',
        groupFont: 'Font',
        labelFontSize: 'Font size',
        labelLineHeight: 'Line height',
        groupLivePreview: 'Live preview',
        labelEnableLivePreview: 'Enable live preview',
        labelPreviewDelay: 'Preview delay (ms)',
        groupSyntaxHighlight: 'Syntax highlighting',
        labelEnableCodeHighlight: 'Enable code block highlight',
        labelEnableLinkHighlight: 'Enable link highlight',
        groupPerformance: 'Performance',
        labelMaxFileSize: 'Max file size (MB)',
        labelRenderDelay: 'Render delay (ms)',
        groupExperimental: 'Experimental',
        labelEnableExperimental: 'Enable experimental features',
        // P1-FE-05: legacy fields without Monaco counterparts are disabled and labelled
        hintNotImplemented:
            'This option is not wired to any feature yet and will have no effect after saving.',
        hintAppliedImmediately: 'Applied to the current editor immediately after saving',
        // P2 error-handling fix: on save failure the message dialog reports it and the
        // settings dialog stays open so the user can retry
        saveFailedTitle: 'Failed to save editor settings',
        saveFailedMessage:
            'Could not write the editor settings to disk: {error}. Your changes were not saved; please retry.'
    },
    fontSelect: {
        title: 'Styled text editor',
        labelFontFamily: 'Font:',
        labelFontSize: 'Font size:',
        labelAlign: 'Alignment:',
        alignLeft: 'Align left',
        alignCenter: 'Align center',
        alignRight: 'Align right',
        alignJustify: 'Justify',
        bold: 'Bold',
        italic: 'Italic',
        underline: 'Underline',
        strikethrough: 'Strikethrough',
        fontColor: 'Font color:',
        backgroundColor: 'Background color:',
        editArea: 'Edit area:',
        editPlaceholder: 'Enter text to edit...',
        preview: 'Preview:',
        previewText: 'This is a preview text.'
    },
    mermaidEdit: {
        title: 'Mermaid diagram editor',
        definition: 'Diagram definition',
        // FE-15：源码预览语义（不渲染 SVG），与 zh-CN 同键同名。
        sourcePreview: 'Diagram preview',
        sourcePreviewHint: 'Renders the Mermaid diagram live; errors are shown below.',
        chartPreview: 'Diagram preview',
        chartPreviewHint: 'Renders the Mermaid diagram live; errors are shown below.',
        rendering: 'Rendering…',
        renderFailed: 'Mermaid render failed',
        codePlaceholder: 'Enter Mermaid diagram code...',
        chartGraph: 'Flowchart',
        chartSequence: 'Sequence diagram',
        chartClass: 'Class diagram',
        chartState: 'State diagram',
        chartEr: 'ER diagram',
        chartPie: 'Pie chart',
        chartGantt: 'Gantt chart'
    },
    systemSetting: {
        title: 'System settings',
        sidebarGeneral: 'General',
        sidebarFile: 'Files',
        sidebarAppearance: 'Appearance',
        sidebarBackup: 'Backup & restore',
        sidebarFeatures: 'Features',
        sidebarWriting: 'Writing experience',
        panelWritingTitle: 'Writing experience',
        panelWritingDesc:
            'Optional helpers that improve the writing process. All are off by default; enable the ones you need.',
        groupWritingFeatures: 'Writing helpers',
        hintWritingFeatures:
            'All helpers are off by default. Typography helpers only apply while Writing Mode is active.',
        writing: {
            modeLabel: 'Writing Mode',
            modeDesc:
                'Immersive writing layout: hide sidebars/menus, constrain text width and show the writing toolbar.',
            typewriterLabel: 'Typewriter mode',
            typewriterDesc:
                'Keep the caret near the vertical center of the screen for long-form typing.',
            focusLabel: 'Paragraph focus',
            focusDesc:
                'Highlight the paragraph currently being edited and reduce surrounding noise.',
            statsLabel: 'Writing statistics',
            statsDesc:
                'Show Chinese characters, English words, total characters and estimated reading time in the status bar.',
            typographyLabel: 'Writing typography',
            typographyDesc: 'Use a separate text width, font size and line height in Writing Mode.',
            sessionRestoreLabel: 'Caret and scroll restore',
            sessionRestoreDesc:
                'Remember caret, scroll and selection per file and restore them when reopening.',
            bubbleLabel: 'Selection bubble toolbar',
            bubbleDesc:
                'Show a formatting toolbar for selected text (bold, italic, link, heading, list, etc.).',
            slashLabel: 'Slash commands',
            slashDesc:
                'Type / in the editor to open an insert menu (heading, table, math, image, etc.).',
            styleCheckLabel: 'Writing style check',
            styleCheckDesc:
                'Check long sentences, repeated words and filler words; suggestions only, never auto-rewrite.'
        },
        panelFeaturesTitle: 'Feature switches',
        panelFeaturesDesc:
            'Default capabilities are always on. Optional capabilities are off by default and only register their UI/behavior when enabled.',
        groupDefaultFeatures: 'Default capabilities',
        hintDefaultFeatures: 'Always available without configuration:',
        groupOptionalFeatures: 'Optional capabilities',
        hintOptionalFeatures:
            'Off by default. Enabled changes take effect immediately; file/history features store data in the local app data directory.',
        // 1.5.7 LLM Wiki L1: workspace mode (top "Workspace" group in the Features tab)
        groupWorkspace: 'Workspace',
        features: {
            workspaceSearchLabel: 'Workspace search / replace',
            pasteEnhanceLabel: 'Paste / copy enhancements',
            commandPaletteLabel: 'Command palette / Quick Open',
            // 1.5.7 LLM Wiki L1: workspace mode selector + switch confirmation / init feedback
            workspaceMode: 'Workspace mode',
            workspaceModeTraditional: 'Traditional',
            workspaceModeLlmWiki: 'LLM Wiki',
            workspaceModeHint:
                'LLM Wiki mode creates raw/ (read-only source material) and wiki/ (structured knowledge base) directories in the current workspace.',
            workspaceModeConfirmTitle: 'Switch to LLM Wiki mode',
            workspaceModeConfirmMessage:
                'The raw/ and wiki/ directories will be created and raw/ will become read-only. Continue?',
            workspaceModeConfirmOk: 'Initialize',
            workspaceModeInitSuccess:
                'LLM Wiki workspace initialized: raw/ and wiki/ directories are ready.',
            workspaceModeInitFailed: 'Failed to initialize the LLM Wiki workspace: {error}',
            workspaceModeInitUnavailable:
                'Initializing LLM Wiki is unavailable in the current environment. Restart the app and try again.',
            tabsLabel: 'Tabs / session restore',
            tabsDesc:
                'Open multiple file tabs above the editor and restore the tab list after restart.',
            documentHistoryLabel: 'Document history / diff / restore',
            documentHistoryDesc:
                'Save snapshots on save, view line-level diffs and restore a previous version into the editor.',
            markdownLintLabel: 'Markdown lint / format',
            markdownLintDesc:
                'Check heading levels, blank lines around lists/code fences and trailing spaces, with one-click formatting.',
            spellcheckLabel: 'Spellcheck',
            spellcheckDesc:
                'Enable the system/browser spellchecker in the editor; disabled means no spellchecker is loaded.',
            smartInputLabel: 'Smart Markdown input',
            smartInputDesc:
                'Ordered-list increment/renumber, quote/nested/task continuation, empty-list backspace exit, blank line after headings; IME-safe and one-step undo.',
            outlinePlusLabel: 'Enhanced outline',
            outlinePlusDesc:
                'Outline supports setext headings, indentation and quick filtering for long documents.',
            // 1.5.2 E6: daily note / quick inbox (workspace diary/ and inbox/ folders)
            dailyNotesLabel: 'Daily notes / quick inbox',
            dailyNotesDesc:
                "Open or create today's note under diary/ and create timestamped quick inbox notes under inbox/ in the workspace with one click; off by default, and the Tools menu and command palette entries appear when enabled.",
            // 1.5.2 E1: clipboard capture (new note / insert into current note)
            clipCaptureLabel: 'Clipboard capture (new note / insert)',
            clipCaptureDesc:
                'Turn clipboard HTML or text into Markdown: create a timestamped inbox/...-clip.md note or insert it at the caret in the current note with a source reference; the clipboard is read only when you invoke the command. Off by default.',
            // 1.5.2 E2: PDF annotations and excerpts (9th optional feature)
            pdfAnnotationsLabel: 'PDF annotations and excerpts',
            pdfAnnotationsDesc:
                'Enable text selection in the PDF preview, add annotations for the current page (stored in a .annotations.json sidecar next to the PDF) with highlights, and jump/delete/excerpt them from the annotation list; when off, the PDF preview behaves exactly as before. Off by default.',
            // 1.5.2 E3: image OCR (10th optional feature, MVP: clipboard screenshot recognition)
            imageOcrLabel: 'Image text recognition (OCR)',
            imageOcrDesc:
                'Recognize text from a clipboard screenshot via Tools → Image OCR or the command palette, then insert the result into the current note or copy it to the clipboard. Images are recognized locally with tesseract.js and are never uploaded; the first use downloads about 10 MB of English language data from the official https source and caches it in the local user data directory. Off by default: when disabled the OCR engine is not loaded and no language data is downloaded.',
            // 1.5.3: non-modal tool dialogs
            nonModalDialogsLabel: 'Non-modal tool dialogs',
            nonModalDialogsDesc:
                'Insert/edit tool dialogs do not block the editor: clicking outside, hovering outside, or pressing Esc will not close them, so Markdown can still be edited. They close only via the close button or an insert/apply action. On by default.'
            // 1.5.7 experience upgrade B: the MCP server and AI assistant configuration moved to
            // a dedicated tab (dialogRenderer.aiAssistant.*); the features tab keeps switches only.
        },
        panelGeneralTitle: 'General settings',
        panelGeneralDesc: 'Basic application settings',
        groupStartup: 'Startup',
        labelAutoOpenLastFile: 'Open the last file on startup',
        labelAutoOpenLastFolder: 'Open the last folder on startup',
        labelAutoStart: 'Launch at system startup',
        // Launch at startup: the system API has no effect until the app is installed
        hintAutoStart:
            'Launch at startup only takes effect after installation (the system API is unavailable in development mode)',
        groupWindow: 'Window behavior',
        labelMinimizeToTray: 'Minimize to tray on close',
        labelRememberWindowSize: 'Remember window position and size',
        panelFileTitle: 'File settings',
        panelFileDesc: 'File-related options',
        groupDefaultPath: 'Default path',
        labelDefaultFilePath: 'Default save path',
        groupFileOperations: 'File operations',
        labelEnableAutoSave: 'Enable auto save',
        labelAutoSaveInterval: 'Auto save interval (seconds)',
        labelRecentFilesCount: 'Recent file list size',
        hintRecentFilesCount:
            'Number of entries kept in the recent lists (5~20, default 10); existing entries are trimmed immediately after saving',
        panelAppearanceTitle: 'Appearance settings',
        panelAppearanceDesc: 'Application visual settings',
        groupTheme: 'Theme',
        labelAppTheme: 'App theme',
        themeDark: 'Dark',
        themeLight: 'Light',
        labelUseSystemTheme: 'Use system theme',
        // Batch B #7: follow the system theme — mutually exclusive with manual theme
        // selection (choosing a theme in the Theme settings dialog turns this off)
        hintUseSystemTheme:
            'When enabled, the app theme follows the system light/dark mode; manually choosing a theme in the Theme settings dialog turns this off automatically',
        groupFont: 'Font',
        labelSystemFont: 'System font',
        fontMicrosoftYaHei: 'Microsoft YaHei',
        fontPingFang: 'PingFang',
        labelFontSize: 'Font size',
        // Visual upgrade (P0): interface style / density / reduce transparency
        // (default workbench + default equals the previous look)
        groupUiAppearance: 'Interface style & density',
        hintUiAppearance:
            'The defaults (workbench + default density) match the previous look. Light glass is experimental and uses blur only on small floating layers; dark, eyecare and high-saturation themes automatically fall back to the paper material.',
        labelUiStyle: 'Interface style',
        uiStylePaper: 'Quiet paper',
        uiStyleGlass: 'Light glass',
        uiStyleWorkbench: 'High-density workbench',
        uiStyleHybrid: 'Hybrid (paper content)',
        labelUiDensity: 'Interface density',
        uiDensityCompact: 'Compact',
        uiDensityDefault: 'Default',
        uiDensitySpacious: 'Spacious',
        labelReduceTransparency: 'Reduce transparency',
        hintReduceTransparency:
            'When enabled, the glass style drops translucency and blur and falls back to an opaque paper material (performance and readability first)',
        panelBackupTitle: 'Backup & restore',
        panelBackupDesc: 'Data backup and restore options',
        groupAutoBackup: 'Auto backup',
        labelEnableAutoBackup: 'Enable auto backup',
        labelBackupInterval: 'Backup interval (hours)',
        labelBackupCount: 'Backups to keep',
        groupOperations: 'Actions',
        backupNow: 'Back up now',
        restoreFromBackup: 'Restore from backup',
        // Batch C: #8/#9 auto backup is implemented (enableAutoBackup/backupInterval
        // are enabled); this entry has no code reference anymore and is kept for
        // future not-yet-implemented settings
        hintNotImplemented:
            'This setting is not wired to any feature yet and will have no effect after saving.',
        // Batch C #10: the app theme is now a read-only display plus an "Open theme
        // settings" button; this entry is only used as the tooltip of the read-only name
        hintThemeManaged: 'Use the Theme settings dialog to change the app theme',
        // Batch C #10: button label that opens the theme settings dialog
        labelOpenThemeSetting: 'Open theme settings',
        // Batch C #8/#9: behavior description of the auto backup group (replaces the
        // former "not implemented" hint); P2-11: off by default (opt-in)
        hintAutoBackupGroup:
            'Off by default; when enabled, backs up the active file (including unsaved changes) and every .md file in the open workspace folder to the user data directory at the configured interval, pruning old backups by "Backups to keep"',
        hintBackupInterval:
            'Auto backup interval (1~72 hours, default 24); saving restarts the timer and the first backup runs when the next interval elapses',
        hintDefaultFilePath: 'Default starting folder for the "Open folder" dialog',
        hintBackupRetention: 'Number of recent backups kept when using "Back up now"',
        backupStatusSuccess: 'Backup created: {name} ({count} config files)',
        backupStatusFailed: 'Backup failed: the config directory is empty or not writable',
        restoreStatusSuccess: 'Restored settings from backup {name} and reloaded them',
        restoreStatusFailed: 'Restore failed: the backup does not exist or cannot be read',
        restoreStatusNoBackup: 'No backup available yet. Use "Back up now" first.',
        // AS-9 (P3 privacy): remote image loading switch (off by default; remote images become placeholders)
        groupPrivacy: 'Privacy',
        labelAllowRemoteImages: 'Allow loading remote images',
        hintAllowRemoteImages:
            'When enabled, the preview loads remote images from documents (third parties may use tracking pixels to record reading activity). Off by default: only local images are loaded.',
        remoteImageBlocked: 'Remote image blocked (enable loading in System Settings → Privacy)',
        // P2 error-handling fix: on save failure the message dialog reports it and the
        // settings dialog stays open so the user can retry
        saveFailedTitle: 'Failed to save settings',
        saveFailedMessage:
            'Could not write the settings to disk: {error}. Your changes were not saved; please retry or check the config directory permissions.',
        // P2 remaining silent-failure fix: "Browse default path" and the runtime auto-save
        // toggle sync used to only log errors; failures now show a dialog (toggle rolls back)
        browseFailedTitle: 'Failed to choose the default path',
        browseFailedMessage: 'Could not choose the default save path: {error}. You can retry.',
        autoSaveSyncFailedTitle: 'Failed to sync the auto-save toggle',
        autoSaveSyncFailedMessage:
            'The auto-save toggle could not be synced to the main process: {error}. The toggle was restored to its previous state; retry now or save again with "Apply".',
        // P2 remaining silent-failure fix: inline, non-blocking hint when the read-only
        // "App theme" display name cannot be loaded (falls back to the theme id)
        themeDisplayFallbackHint:
            'Could not read the display name of the current app theme, so the theme id is shown instead. Close the settings and reopen them to retry.'
    },
    // 1.5.7 experience upgrade B: AI assistant configuration block (multi-model + MCP).
    // 1.5.7 experience tweak (user feedback 2026-11-28): formerly the 7th system-settings
    // tab; now a standalone dialog opened from Settings -> AI Assistant
    // (../AiAssistantDialog.vue reuses the same panel).
    aiAssistant: {
        title: 'AI Assistant',
        panelTitle: 'AI assistant',
        panelDesc:
            'Manage AI models and the MCP server in one place: add multiple models (local Ollama / LM Studio or remote OpenAI-compatible APIs) and let external agents read the current workspace over MCP. Changes are saved independently and take effect immediately.',
        groupModels: 'Models',
        enabledLabel: 'Enable AI assistant',
        storageSafe: 'API key storage: OS secure storage (encrypted, persists across restarts)',
        storageMemory:
            'API key storage: this session only (not saved to disk; re-enter after restart)',
        privacyNote:
            'Privacy note: local models (Ollama / LM Studio) only talk to this machine. With a remote API, chat content and processed material are sent to the configured provider — check its privacy policy and data processing terms.',
        modelsEmptyTitle: 'No models yet',
        addModel: 'Add model',
        defaultBadge: 'Default',
        keyConfiguredBadge: 'Key configured',
        setDefault: 'Set default',
        editModel: 'Edit',
        deleteModel: 'Delete',
        saveModel: 'Save model',
        formTitleEdit: 'Edit model',
        formName: 'Display name',
        formNameRequired: 'Enter a display name for the model',
        formProvider: 'Type',
        formProviderLocal: 'Local model',
        formProviderRemote: 'Remote API',
        formLocalProvider: 'Local service',
        formBaseUrl: 'Base URL',
        formBaseUrlPlaceholderLocal:
            'Leave empty to use the default base URL (Ollama 11434 / LM Studio 1234)',
        formBaseUrlPlaceholderRemote: 'e.g. https://api.openai.com/v1',
        formBaseUrlRequired: 'Remote models require a base URL (https recommended)',
        formModel: 'Model name',
        formModelPlaceholder: 'e.g. qwen2.5 / deepseek-chat',
        formModelRequired: 'Enter the model name',
        formApiKey: 'Remote API key',
        formApiKeyPlaceholder:
            'Enter the remote API key (required when adding; leave empty to keep the saved key)',
        formApiKeyRequired: 'A remote model needs an API key when first added',
        clearKey: 'Clear key',
        saved: 'Settings saved.',
        saveFailed: 'Failed to save AI settings: {error}',
        loadFailed: 'Failed to read AI settings: {error}',
        unavailable:
            'AI settings are unavailable in the current environment. Restart the app and try again.',
        testConnection: 'Test connection',
        testing: 'Testing…',
        testSuccess: 'Connection succeeded: {detail}',
        testFailed: 'Connection failed: {error}',
        groupMcp: 'MCP server',
        mcpEnabled: 'Enable MCP server (read-only bridge)',
        mcpHint:
            'Let external AI agents (Claude Code, DSH, Cursor, ...) read the current LLM Wiki workspace over MCP: loopback-only, Bearer token required, read-only tools only. Off by default; the switch takes effect immediately (no need to press Apply).',
        mcpRunning: 'Running',
        mcpStopped: 'Stopped',
        mcpPort: 'Port',
        mcpUrl: 'MCP URL',
        mcpToken: 'Access token',
        mcpCopyToken: 'Copy token',
        mcpTokenCopied: 'Copied',
        mcpRegenerateToken: 'Reset token',
        mcpToolsTitle: 'Read-only tools',
        mcpPortAuto: 'Choose a port automatically (prefers 3847)',
        mcpPortPlaceholder: '1-65535',
        mcpPortInvalid: 'Port must be an integer between 1 and 65535',
        mcpApplyPort: 'Apply port',
        mcpPortPending:
            'Port setting recorded; it takes effect the next time the MCP server is enabled.',
        mcpSecurityNote:
            'Security: the server listens on the loopback interface only (127.0.0.1) and every request must carry a Bearer token. All 7 tools are read-only (search, read pages/schema/raw sources, tags, backlinks); they reject absolute paths and never write, rename or delete files. The token is never persisted and becomes invalid as soon as the server stops or the app restarts.',
        mcpRestartHint:
            'After restarting the app, re-enable the server on this page to get a new token, then update your MCP client configuration.',
        mcpToggleFailed: 'MCP server operation failed: {error}',
        mcpCopyFailed: 'Failed to copy the token. Select the token text and copy it manually.',
        mcpUnavailable:
            'MCP server control is unavailable in the current environment. Restart the app and try again.'
    },
    themeSetting: {
        title: 'Theme settings',
        sidebarAppTheme: 'App theme',
        sidebarEditorTheme: 'Editor theme',
        sidebarFontSettings: 'Font settings',
        // 2026-11-28 fix for the "editor theme setting has no effect" report: independent
        // editor-theme switch plus the two semantics (off = follow the app theme colors,
        // on = use the Monaco theme selected below).
        separateEditorThemeLabel: 'Independent editor theme',
        separateEditorThemeHintOn:
            'The editor uses the theme selected below instead of following the app theme.',
        separateEditorThemeHintOff:
            'The editor follows the app theme colors; selecting a theme below turns on the independent editor theme automatically.',
        customTheme: 'Custom theme',
        editorThemeFallback: 'Editor theme',
        colorBackground: 'Background color',
        colorAccent: 'Accent color',
        colorText: 'Text color',
        labelEditorFont: 'Editor font',
        labelPreviewFont: 'Preview font',
        labelFontSize: 'Font size',
        categoryLight: 'Light themes',
        categoryDark: 'Dark themes',
        categoryEyecare: 'Eye-care themes',
        // P2 error-handling fix: show an error state + retry button when the theme list
        // fails to load; show an empty-state hint (also retryable) when the list is empty
        loadFailed: 'Failed to load the theme list: {error}',
        emptyState: 'No themes available. Please retry.',
        // P2 remaining silent-failure fix: theme style / editor theme load failures while
        // the user switches themes used to be logged only and silently fell back
        applyFailedTitle: 'Failed to apply the theme',
        applyFailedMessage:
            'Could not load the styles of theme "{theme}"; the previous theme is kept: {error}. You can retry.',
        applyFailedReasonNotFound: 'the main process returned no style data for this theme',
        editorThemeApplyFailedTitle: 'Failed to load the editor theme',
        editorThemeApplyFailedMessage:
            'Could not load editor theme "{theme}"; the editor fell back to the default theme (the app theme is unaffected). You can retry.'
    },
    helpAbout: {
        windowTitle: 'About BaiZe Notes',
        descLine1: 'A simple and elegant',
        descLine2: 'note-taking app',
        descLine3: 'Write to your heart’s content!',
        versionInfo: 'Version info',
        appVersion: 'App version',
        releaseDate: 'Release date',
        devFramework: 'Frameworks',
        systemEnvironment: 'System environment',
        os: 'Operating system',
        platform: 'Platform'
    },
    helpContactUs: {
        title: 'Contact us',
        subtitle: 'We would love to hear your feedback and suggestions',
        feedback: 'Report an issue',
        feedbackDesc: 'Open an issue on GitHub',
        star: 'Star the project',
        starDesc: 'Give us a star on GitHub',
        contribute: 'Contribute',
        contributeDesc: 'Submit a pull request',
        email: 'Send an email'
    },
    quickLink: {
        title: 'Quick link settings',
        listTitle: 'Quick links',
        editLink: 'Edit link',
        addLink: 'Add link',
        namePlaceholder: 'Link name',
        iconLabel: 'Icon (emoji)',
        descLabel: 'Description',
        descPlaceholder: 'Optional description',
        emptyState: 'No quick links yet',
        addFirst: 'Add your first link',
        defaultGitHubDesc: 'Code hosting platform',
        defaultGoogleDesc: 'Search engine',
        defaultStackOverflowDesc: 'Programmer Q&A community',
        // P2 error-handling fix: on save failure the message dialog reports it and the
        // settings dialog stays open so the user can retry
        saveFailedTitle: 'Failed to save quick links',
        saveFailedMessage:
            'Could not write the quick links to disk: {error}. Your changes were not saved; please retry.'
    },
    techStack: {
        title: 'Tech stack',
        intro: '白泽笔记 is built with the following technologies',
        sectionCore: 'Core frameworks',
        sectionEditors: 'Editors and rendering',
        sectionData: 'Data and storage',
        sectionUtilities: 'Utility libraries',
        footer: 'Click a card to visit the official site',
        descElectron: 'Cross-platform desktop app framework',
        descVue: 'Progressive JavaScript framework',
        descTypeScript: 'A superset of JavaScript',
        descVite: 'Next-generation frontend build tool',
        descElectronVite: 'Vite build tool for Electron',
        descMonaco: 'The code editor behind VS Code',
        descMarkdownIt: 'Markdown parser',
        descMermaid: 'Flowchart and sequence diagram rendering',
        descKaTeX: 'Math formula rendering',
        descHighlight: 'Code syntax highlighting',
        descElectronStore: 'Electron data persistence',
        descElectronUpdater: 'Application auto update',
        descCryptoJs: 'JavaScript crypto library',
        descMammoth: 'Word document parsing',
        descTurndown: 'HTML to Markdown'
    },
    // Material syntax insertion dialog: 15 mkdocs-material extension syntaxes.
    // Keep the leaf key set in sync with zh-CN/dialogRenderer.ts materialSyntax.
    materialSyntax: {
        title: 'Insert Material syntax',
        previewEmptyHint: 'Fill in the form above to preview the Markdown that will be inserted',
        iconNameRequired: 'Enter an icon name first (e.g. pencil, github)',
        features: {
            collapsible: 'Collapsible block',
            taskList: 'Task list',
            highlight: 'Text highlight',
            insertDelete: 'Insert/delete marks',
            supSub: 'Superscript/subscript',
            keys: 'Keyboard keys',
            attrList: 'Attribute list',
            footnote: 'Footnote',
            definitionList: 'Definition list',
            gridCards: 'Grid cards',
            codeBlock: 'Code block extras',
            icon: 'Material icon',
            blocks: 'Block syntax',
            snippet: 'File snippet',
            tabLink: 'Tabbed deep link'
        },
        labels: {
            type: 'Type',
            expanded: 'Expanded by default',
            completed: 'Completed',
            mode: 'Mode',
            text: 'Text',
            url: 'URL',
            className: 'class',
            align: 'Align',
            keys: 'Keys',
            refText: 'Referencing text',
            footnoteContent: 'Footnote content',
            term: 'Term',
            definition: 'Definition',
            cards: 'Cards',
            language: 'Language',
            codeTitle: 'Code block title',
            code: 'Code',
            linenums: 'Show line numbers',
            hlLines: 'Highlighted lines',
            iconName: 'Icon name',
            iconText: 'Text (optional)',
            tabLabel: 'Tab label',
            path: 'File path',
            startLine: 'Start line',
            endLine: 'End line',
            linkText: 'Link text',
            setId: 'Set index',
            tabIndex: 'Tab index'
        },
        placeholders: {
            title: 'Optional title',
            content: 'Content (multi-line supported)',
            text: 'Text to wrap',
            taskContent: 'One task per line',
            keys: 'e.g. ctrl+alt+del',
            url: 'e.g. https://example.com',
            className: 'e.g. highlight',
            footnoteContent: 'Footnote details',
            definition: 'Explanation of the term',
            cards: 'One card per line: icon|title|description (icon optional)',
            language: 'e.g. python',
            code: 'Code content',
            hlLines: 'e.g. 2 3',
            iconName: 'e.g. pencil',
            tabLabel: 'e.g. Tab one',
            path: 'e.g. snippets/example.md',
            linkText: 'Text shown on the link'
        },
        types: {
            note: 'Note',
            tip: 'Tip',
            warning: 'Warning',
            danger: 'Danger',
            info: 'Info',
            success: 'Success',
            example: 'Example',
            question: 'Question',
            quote: 'Quote',
            details: 'Details',
            tabbed: 'Tabbed'
        },
        insertDeleteModes: {
            insert: 'Insert (^^)',
            delete: 'Delete (~~)',
            criticInsert: 'Critic insert ({++ ++})',
            criticDelete: 'Critic delete ({-- --})',
            criticHighlight: 'Critic highlight ({== ==})',
            criticComment: 'Critic comment ({>> <<})'
        },
        scriptModes: {
            superscript: 'Superscript (^ ^)',
            subscript: 'Subscript (~ ~)'
        },
        attrModes: {
            button: 'Button ({ .md-button })',
            inline: 'Inline class ({ .class })',
            align: 'Paragraph/image align ({ align=center })'
        },
        alignOptions: {
            left: 'Left',
            center: 'Center',
            right: 'Right'
        },
        defaults: {
            collapsibleContent: 'Collapsible content shown when expanded.',
            taskContent: 'First task\nSecond task',
            highlightText: 'Highlighted text',
            insertDeleteText: 'Marked text',
            attrText: 'Button text',
            footnoteText: 'Annotated text',
            footnoteContent: 'Footnote details.',
            definitionTerm: 'Term',
            definitionText: 'Explanation of the term.',
            cards: 'pencil|Quick start|Install and configure in minutes.\nrocket|Batteries included|No extra dependencies, just Markdown.',
            codeTitle: 'Example code',
            blocksTitle: 'Block title',
            blocksContent: 'Block content, Markdown inside is supported.',
            blocksTabLabel: 'Tab one',
            tabLinkText: 'Go to tab'
        }
    },
    workspaceLayout: {
        title: 'Workspace Layouts',
        description:
            'Save the current view mode and resource manager state as a layout, then switch quickly between writing, research, and project setups. Layouts only affect the UI and never modify note content.',
        current: 'Current layout',
        viewMode: 'View mode',
        resourceManager: 'Resource manager',
        viewModes: {
            edit: 'Editor only',
            preview: 'Preview only',
            'edit-preview': 'Editor + Preview'
        },
        resourceVisible: 'Visible',
        resourceHidden: 'Hidden',
        width: 'Width {width}px',
        apply: 'Apply',
        delete: 'Delete',
        builtin: 'Built-in',
        savePlaceholder: 'Layout name, for example: Long-form writing',
        saveCurrent: 'Save current layout',
        saved: 'Saved layout "{name}"',
        saveFailed: 'Failed to save layout (empty/too long name or limit reached)',
        deleted: 'Deleted layout "{name}"',
        deleteFailed: 'Failed to delete layout',
        noCustom: 'No custom layouts yet. Save the current layout to see it here.'
    },
    untitledDraft: {
        title: 'Save untitled content',
        message:
            'The current content has not been saved to a file. Save it before opening the selected file?',
        detail: 'Save and Open shows a save location/filename dialog. Do Not Save clears the current untitled content.',
        save: 'Save and Open',
        discard: 'Do Not Save',
        cancel: 'Cancel'
    },
    // 1.5.6：使用指导对话框（应用内搜索由父页面代理实现，见 UsageGuideDialog.vue）。
    // 键名统一 usageGuide.*，单独成块追加在文件末尾，便于并行批次合入与整块搬移。
    usageGuide: {
        loading: 'Loading the usage guide...',
        unavailable:
            'The usage guide is unavailable: in-app search is disabled for now. Close the dialog and retry, or open the PDF version from Help > Usage Guide.',
        noIndex:
            'Could not read the usage guide outline: in-app search is disabled for now. Use the static outline inside the page to jump between sections.',
        searchPlaceholder: 'Search titles and body text, Enter to jump, Esc to clear',
        searchAriaLabel: 'Search usage guide content',
        searchClear: 'Clear search',
        searchResults: 'Search results',
        searchEmpty: 'No matching sections. Press Esc to clear.',
        searchMatches: 'Matched {count} sections',
        searchMatchesCapped: 'Matched {count} sections; showing the first {limit}'
    },
    // 1.5.7 migration batch: migration wizard dialog (shown when switching traditional -> LLM Wiki;
    // all three entry points share it). Keys use the migrationWizard.* namespace and are appended
    // as one block at the end of the file for easier parallel batch merges and block moves.
    migrationWizard: {
        title: 'Switch to LLM Wiki',
        subtitle:
            'Choose how and what to migrate. Migration writes an operation log and can be rolled back at any time.',
        loading: 'Scanning migratable files...',
        scanFailed: 'Failed to scan migratable files: {error}',
        noFiles: 'No migratable files were detected. You can finish the initialization directly.',
        truncated:
            'The file count exceeded the scan limit: only the scanned files are handled this time; run the migration again later to continue.',
        stepMigrationMode: '① Migration method',
        modeNone: 'Do not migrate',
        modeNoneHint:
            'Keep existing files where they are; only initialize the raw/ and wiki/ folders.',
        modeCopy: 'Copy to raw/',
        modeCopyHint:
            'Keep the original files and create copies under raw/. Safe and rollbackable.',
        modeMove: 'Move to raw/',
        modeMoveHint:
            'Original paths stop existing (rollbackable). Read the warning at the top first.',
        moveWarningTitle: 'Original paths stop existing after moving to raw/',
        moveWarningBody:
            'Historical links, recent files and bookmarks may stop working. The migration writes an operation log and can be rolled back at any time.',
        linkImpactTitle: 'About {count} links will break after migration',
        linkImpactHint:
            'Those references must be updated to raw/ paths afterwards. Automatic link rewriting is planned for a later batch; for now keep the originals or fix them manually.',
        linkItem: '{file}:{line} → {target}',
        linkMore: 'Showing the first {limit} of {total} items.',
        stepScope: '② Migration scope',
        scopeHint:
            'Select file formats (file count and size are shown for each format); at least one format is required.',
        formatMarkdown: 'Markdown',
        formatImage: 'Images',
        formatPdf: 'PDF',
        formatHtml: 'HTML',
        formatText: 'Other text',
        formatCount: '{count} files · {size}',
        scopeRequired: 'Select at least one file format.',
        stepCompile: '③ Start compilation',
        compileEnable: 'Start compilation after migration (generate wiki/ pages)',
        aiNotConfiguredTitle: 'No configured AI model was detected',
        aiNotConfiguredBody:
            'You can migrate files now; after configuring a model, use "AI Compile" from the command palette to generate wiki/ pages.',
        aiConfigFailed:
            'Failed to read the AI configuration; treating it as not configured. Configure a model later before compiling.',
        aiConfigure: 'Configure AI assistant',
        aiConfigureHint:
            'This closes the migration settings and opens the AI Assistant configuration dialog; you can switch again afterwards.',
        compileUnavailable:
            'Compilation runs after migration through the batch compile queue (provided by a later batch).',
        stepCompileScope: '④ Compilation scope',
        compileScopeAll: 'Compile everything',
        compileScopeDirectory: 'Compile a specific directory',
        compileScopeBatch: 'Compile in batches',
        compileDirectoryLabel: 'Directory (workspace-relative path)',
        compileDirectoryPlaceholder: 'e.g. notes/ or notes/subfolder',
        compileDirectoryInvalid:
            'The directory must be a workspace-relative path (no leading / and no ..).',
        compileBatchSizeLabel: 'Files per batch',
        compileBatchSizeInvalid: 'Files per batch must be an integer between 1 and 500.',
        startMigrate: 'Start migration',
        startInit: 'Finish initialization',
        submitting: 'Migrating and initializing the workspace...',
        resultTitle: 'Migration finished',
        resultSummary:
            'Migrated {migrated} files (copied {copied} / moved {moved}), skipped {skipped}, failed {failed}.',
        resultSkipped: 'Skipped items',
        resultFailed: 'Failed items',
        rollback: 'Roll back migration',
        rollbackConfirmTitle: 'Roll back this migration?',
        rollbackConfirmBody:
            'This moves {move} files back to their original paths and deletes {copy} copied files. Files modified after migration are skipped and reported individually.',
        rollbackRunning: 'Rolling back...',
        rollbackSuccess: 'Rollback finished: {restored} files restored.',
        rollbackPartial:
            'Rollback partially finished: {restored} restored, {failed} conflicts not rolled back.',
        viewResult: 'View details',
        hideResult: 'Hide details',
        copyFollowUpTitle: '② What should happen to the original files?',
        copyFollowUpKeep: 'Keep the original files (recommended)',
        copyFollowUpMove: 'Move the original files to raw/ (upgrade to the move method)',
        copyFollowUpDelete:
            'Delete the original files (not supported yet; planned for a later batch)',
        copyFollowUpHint:
            'Choosing "Move to raw" deletes this run\'s copies first and then moves the originals to raw/; this upgrade is rollbackable.',
        copyFollowUpMoveConfirm: 'Confirm upgrade to the move method',
        copyFollowUpMoveConfirmBody:
            'This deletes the {count} copies created under raw/ this time and moves the original files to raw/.',
        copyFollowUpMoving: 'Upgrading to the move method...',
        copyFollowUpKeepDone:
            'The original files were kept; the copies under raw/ can be used for compilation.',
        copyGuide:
            'Files were migrated to raw/. After configuring a model, use "AI Compile" from the command palette to generate wiki/ pages.',
        compileRequestRecorded:
            'Compilation choice recorded: {scope}; the batch compile queue runs in a later batch.',
        switchFailed: 'Failed to switch to LLM Wiki: {error}',
        resultGuide:
            'Migrated files are under raw/ (read-only); compiled wiki/ pages appear in the resource manager. To undo, use "Roll back migration" on this result page (move method) or reopen the dialog and choose copy.',
        ipcUnavailable:
            'The migration channels are unavailable in this environment. Restart the app and try again.',
        unknownError: 'Unknown error'
    }
}

export default dialogRenderer
