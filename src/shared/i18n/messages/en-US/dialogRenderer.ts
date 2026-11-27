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
        features: {
            workspaceSearchLabel: 'Workspace search / replace',
            pasteEnhanceLabel: 'Paste / copy enhancements',
            commandPaletteLabel: 'Command palette / Quick Open',
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
    themeSetting: {
        title: 'Theme settings',
        sidebarAppTheme: 'App theme',
        sidebarEditorTheme: 'Editor theme',
        sidebarFontSettings: 'Font settings',
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
    }
}

export default dialogRenderer
