/**
 * editorUi namespace (en)
 * Markdown editor UI copy: toolbar tooltips, document outline, diagram rendering fallbacks,
 * quick-insert menu categories, plus dialogs/actions added in 1.5.1 (A2 workspace search,
 * A9 command palette / Quick Open, A3 document history, A4 Markdown lint, A8 copy actions,
 * A10 outline filter).
 */
export default {
    toolbar: {
        h1: 'Heading 1',
        h2: 'Heading 2',
        h3: 'Heading 3',
        h4: 'Heading 4',
        h5: 'Heading 5',
        h6: 'Heading 6',
        fontFamily: 'Font family',
        fontSize: 'Font size',
        bold: 'Bold',
        italic: 'Italic',
        deleteLine: 'Strikethrough',
        underline: 'Underline',
        quote: 'Blockquote',
        superscript: 'Superscript',
        subscript: 'Subscript',
        alignLeft: 'Align left',
        alignCenter: 'Center',
        alignJustify: 'Justify',
        alignRight: 'Align right',
        listNumbered: 'Ordered list',
        listBulleted: 'Bullet list',
        lineScan: 'Horizontal rule',
        lineEnter: 'Line break',
        codeLine: 'Inline code',
        codeBlock: 'Code block',
        mathLine: 'Inline math',
        mathBlock: 'Math block',
        webLinks: 'Web link',
        taskLists: 'Task list',
        insertImages: 'Insert image',
        insertTable: 'Table',
        insertEmoji: 'Emoji',
        insertSymbol: 'Special symbol',
        insertMermaid: 'mermaid',
        insertPlantuml: 'plantuml'
    },
    monacoOutline: {
        title: 'Document outline',
        lineTitle: 'Line {line}',
        empty: 'No headings found (lines starting with #)',
        emptyTitle: '(Untitled)',
        filterPlaceholder: 'Filter headings'
    },
    editor: {
        ariaLabel: 'Baize Notes editor'
    },
    render: {
        mermaidFailed: 'Mermaid diagram rendering failed',
        plantumlFailed: 'PlantUML diagram rendering failed',
        errorInfo: 'Error: ',
        plantumlInvalidResult: 'The main process returned an invalid PlantUML render result',
        plantumlLocalFailed: 'PlantUML local rendering failed',
        plantumlTimeout: 'PlantUML local rendering timed out ({ms}ms)',
        plantumlUnknownError: 'Unknown error'
    },
    emojiCategories: {
        phone: 'Phone 📱',
        plant: 'Plants 💐',
        gesture: 'Gestures 💪',
        daily: 'Daily 🌂',
        common: 'Common 🚮',
        heartShaped: 'Hearts 💖',
        terror: 'Horror 😈',
        expression: 'Expressions 😀',
        people: 'People 👦',
        goods: 'Goods 🎀',
        marks: 'Signs 🔶',
        travel: 'Travel 🚅',
        animal: 'Animals 🐶',
        nature: 'Nature 🌍',
        food: 'Food 🍇',
        stylistics: 'Styles ⚽',
        zodiac: 'Zodiac',
        timepiece: 'Clocks 🕛',
        architecture: 'Buildings 🏠',
        arrow: 'Arrows 🔝'
    },
    symbolCategories: {
        spcial1: 'Special characters ☆',
        spcial2: 'Special characters ◎',
        spcial3: 'Special characters ◤',
        spcial4: 'Special characters ❉',
        number1: 'Numbers ①',
        number2: 'Numbers ⑴',
        number3: 'Numbers ⒈',
        number4: 'Numbers Ⅰ',
        number5: 'Numbers ❶㈠',
        math1: 'Math operators ㏒',
        math2: 'Math symbols ∰',
        math3: 'Math units ￡',
        greece: 'Greek letters Ω',
        greeceLow: 'Greek letters ω',
        latin: 'Latin letters Œ',
        latinLow: 'Latin letters œ',
        chinesePhonetic: 'Chinese phonetics',
        chineseUnit: 'Chinese units',
        chineseCharacters: 'Chinese characters',
        remoteRadical: 'Rare radicals',
        tabls1: 'Box drawing ╬',
        tabls2: 'Box drawing ┆',
        tabls3: 'Box drawing ╫'
    },
    /**
     * A8 editor context-menu actions (copy enhancements).
     * Action ids in `hemy-editor-actions.ts` are fixed as `baize.copyAsMarkdown` / `baize.copyAsHtml`.
     */
    editorActions: {
        copyAsMarkdown: 'Copy as Markdown',
        copyAsHtml: 'Copy as HTML',
        editTable: 'Insert / edit table'
    },
    /** A2 workspace search / replace dialog (`components/search/WorkspaceSearchDialog.vue`) */
    workspaceSearch: {
        title: 'Search / replace in workspace',
        placeholder: 'Search for',
        search: 'Search',
        caseSensitive: 'Match case',
        wholeWord: 'Match whole word',
        useRegex: 'Use regular expression',
        replacePlaceholder: 'Replace with',
        replaceAll: 'Replace all',
        replaceAllConfirm: 'Replace {count} matches? This writes changes to disk.',
        confirm: 'Replace',
        cancel: 'Cancel',
        resultsLabel: 'Search results',
        searching: 'Searching…',
        initialHint: 'Enter a keyword to search Markdown files in the workspace',
        noResults: 'No matches found',
        replaceOne: 'Replace',
        truncated: 'Too many results; only part of the matches are shown (narrow your search)',
        close: 'Close',
        resultSummary: '{matches} matches in {files} files',
        resultSummaryTruncated: 'At least {matches} matches in {files} files (truncated)',
        replacedSummary: 'Replacements completed: {count} matches',
        error: {
            noWorkspace: 'Open a workspace folder before searching',
            invalidQuery: 'The search query is invalid. Check your input.',
            invalidRegex: 'The regular expression is invalid. Check the syntax.',
            internal: 'Search failed due to an internal error. Try again later.',
            searchFailed: 'Search failed. Try again later.',
            invalidInput: 'The replace parameters are invalid. Check your input.',
            pathDenied:
                'The target file is outside the workspace, so the replacement was rejected.',
            fileChanged: 'The file changed on disk. Search again before replacing.',
            writeFailed: 'Failed to write the file. Check the file permissions.',
            noMatch: 'No matches available to replace'
        }
    },
    /** A9 command palette / file Quick Open (`components/search/CommandPalette.vue`) */
    commandPalette: {
        placeholder: 'Type a command name or keyword',
        filePlaceholder: 'Type a file name to open it quickly',
        noResults: 'No matching commands',
        loading: 'Loading file list…',
        noFiles: 'No files available in the workspace',
        hint: '↑↓ to select, Enter to run, Esc to close',
        fileHint: '↑↓ to select, Enter to open, Esc to close',
        ariaLabel: 'Command palette',
        fileAriaLabel: 'Quick open file',
        listLabel: 'Command list',
        fileListLabel: 'File list',
        executeFailed: 'Command failed',
        openFileFailed: 'Failed to open the file. Try again later.',
        // 1.5.6 P2 batch C: REQ-10 recently used section / REQ-11 related command suggestions
        recentTitle: 'Recently used',
        suggestionsTitle: 'Related commands',
        suggestionsHint: 'No exact match. These related suggestions run with Enter.',
        suggestionBadge: 'Suggestion',
        command: {
            save: 'Save',
            openFolder: 'Open folder',
            openFile: 'Open file',
            // 1.5.7 LLM Wiki L1: initialize workspace (raw/ and wiki/)
            initializeLlmWiki: 'Initialize LLM Wiki',
            find: 'Find',
            replace: 'Replace',
            gotoLine: 'Go to line',
            outline: 'Toggle document outline',
            insertTable: 'Insert Markdown table',
            insertMath: 'Insert math formula',
            insertMermaid: 'Insert Mermaid diagram',
            workspaceSearch: 'Workspace search / replace',
            quickOpen: 'Quick open file',
            showCommandPalette: 'Show command palette',
            frontMatter: 'Edit document properties',
            knowledgeTags: 'Browse tag index',
            knowledgeLinks: 'Check missing/ambiguous links',
            knowledgeBacklinks: 'Show backlinks for current file',
            attachments: 'Attachment manager',
            // 1.5.2 E6: daily entries (optional feature featureDailyNotes, off by default)
            dailyNote: "Open today's daily note",
            inboxCapture: 'Create a quick inbox note',
            // 1.5.2 E1: clipboard capture (optional feature featureClipCapture, off by default)
            clipToNote: 'Clip clipboard to a new note',
            clipToEditor: 'Clip clipboard into the current note',
            // 1.5.2 E3: image OCR (optional feature featureImageOcr, off by default; MVP clipboard screenshots)
            ocrInsert: 'Recognize clipboard image text and insert into the current note',
            ocrCopy: 'Recognize clipboard image text and copy it',
            // 1.5.7 LLM Wiki L3: AI compile (raw/ source material -> wiki/ draft + diff approval)
            llmIngest: 'AI compile (raw -> wiki)',
            // 1.5.7 LLM Wiki L4: relationship graph / embed raw source material
            openGraph: 'Open relationship graph',
            insertRawEmbed: 'Embed raw source material'
        },
        category: {
            file: 'File',
            edit: 'Edit',
            view: 'View',
            insert: 'Insert',
            search: 'Search',
            knowledge: 'Knowledge base',
            // 1.5.2 E6: daily entries (daily note / quick inbox)
            capture: 'Daily entries'
        }
    },
    /** 1.5.2 E6 daily note / quick inbox (shared entry + failure prompts for the Tools menu and command palette) */
    dailyEntries: {
        disabledTitle: 'Feature disabled',
        disabledMessage:
            'Daily notes and quick inbox are turned off. Enable "Daily notes" in Settings → Features and try again.',
        failedTitle: 'Failed to open or create the note',
        failedMessage: 'The main process returned an unknown failure reason. Try again later.',
        noWorkspace: 'Open a workspace folder before creating a daily note or inbox note.',
        invalidKind: 'Invalid request type. Try again from the Tools menu or the command palette.',
        writeFailed:
            'Failed to write the note file. Check the workspace folder permissions and try again.',
        invokeFailed: 'Main process call failed: {error}',
        unavailable: 'The app IPC channel is unavailable. Restart the app and try again.'
    },
    /** 1.5.2 E1 clipboard capture (shared entry + failure prompts for the Tools menu and command palette) */
    clipCapture: {
        disabledTitle: 'Feature disabled',
        disabledMessage:
            'Clipboard capture is turned off. Enable "Clipboard capture" in Settings → Features and try again.',
        failedTitle: 'Clip capture failed',
        emptyClipboard:
            'The clipboard has no text or HTML to clip. Copy some content first and try again.',
        unavailable:
            'Clipboard access is unavailable. Press Ctrl+V in the editor first, or restart the app and try again.',
        readFailed:
            'Failed to read the clipboard. Check the system clipboard permission and try again (you can also paste with Ctrl+V in the editor first).',
        contentTooLarge:
            'Clipboard content exceeds the clip limit ({max}). Copy a smaller range and try again.',
        noWorkspace: 'Open a workspace folder before clipping to a new note.',
        invalidKind: 'Invalid request type. Try again from the Tools menu or the command palette.',
        writeFailed:
            'Failed to write the clip note. Check the workspace folder permissions and try again.',
        failedMessage: 'The main process returned an unknown failure reason. Try again later.',
        editorUnavailable:
            'No editable note is available. Open a note first, then run "Clip into current note".',
        insertFailed:
            'Failed to insert into the current note. Make sure the editor is editable and try again.',
        invokeFailed: 'Main process call failed: {error}',
        sourceLine: 'Clipped from: {source} · {date}'
    },
    /** 1.5.2 E3 image OCR (clipboard screenshot recognition: entries and failure prompts) */
    imageOcr: {
        disabledTitle: 'Feature disabled',
        disabledMessage:
            'Image text recognition (OCR) is currently disabled. Enable "Image text recognition (OCR)" in System Settings → Features and try again.',
        failedTitle: 'Image text recognition failed',
        noImage:
            'The clipboard does not contain an image. Take a screenshot or copy an image first.',
        unavailable: 'The clipboard API is unavailable. Restart the application and try again.',
        readFailed:
            'Failed to read the clipboard image. Check the system clipboard permission and try again (or copy the screenshot again).',
        tooLarge:
            'The clipboard image exceeds the size limit ({max}). Reduce the screenshot area and try again.',
        notPng: 'Unsupported clipboard image format (only PNG screenshots are supported). Take the screenshot again.',
        downloadFailed:
            'Failed to download the OCR language data (about 10 MB on first use). Check your network and try again; recognition runs locally and images are never uploaded.',
        initFailed:
            'The OCR language data is corrupted and the cache has been cleared. Try again to download it again.',
        recognitionFailed:
            'Failed to recognize the image text. Try again, or restart the application if it keeps failing.',
        engineUnavailable: 'The OCR engine is unavailable. Restart the application and try again.',
        invalidLanguage:
            'Invalid OCR language setting. Check the system language settings and try again.',
        failedMessage: 'Recognition failed. Try again later.',
        invokeFailed: 'Main process call failed: {error}',
        emptyTitle: 'No text recognized',
        emptyMessage:
            'No extractable text was recognized in the screenshot. Make sure the image is clear and contains text.',
        copyFailed: 'Failed to write to the clipboard. Try again.',
        insertFailed:
            'Failed to insert into the current note. Make sure the editor is editable and try again.',
        copiedTitle: 'Copied to clipboard',
        copiedMessage:
            'The recognized text has been copied to the clipboard and can be pasted anywhere.',
        noEditorCopiedMessage:
            'There is no editor available to insert into, so the recognized text has been copied to the clipboard.',
        sourceLine: 'From image text recognition'
    },
    /** 1.5.2 E2 PDF annotations and excerpts (failure prompts shared by the viewer and excerpt action) */
    pdfAnnotations: {
        loadFailedTitle: 'Failed to read PDF annotations',
        loadFailed: 'Failed to read the annotations file; opened with no annotations: {error}',
        saveFailedTitle: 'Failed to save PDF annotations',
        saveFailed:
            'Failed to write the annotations file. Check write permission of the PDF folder and try again: {error}',
        addFailedTitle: 'Failed to add annotation',
        addInvalid: 'The selected text is empty or the page number is invalid. Select text again.',
        failedMessage: 'The main process returned an unknown failure reason. Try again later.',
        invalidPath: 'The PDF path is invalid, so annotations cannot be read or saved.',
        invalidExtension: 'Annotations can only be saved for .pdf files.',
        pathDenied:
            'The PDF location is outside the trusted roots; annotations cannot be read or saved.',
        invalidPayload: 'The annotation payload is invalid, so the save was cancelled.',
        tooLarge: 'The annotation data exceeds the size limit, so the save was cancelled.',
        readFailed: 'Failed to read the annotations file. Try again later.',
        writeFailed: 'Failed to write the annotations file. Try again later.',
        invokeFailed: 'Main process call failed: {error}',
        unavailable: 'The app IPC channel is unavailable. Restart the app and try again.',
        excerptFailedTitle: 'Excerpt failed',
        excerptInvalid: 'This annotation has no text to excerpt.',
        excerptInsertFailed:
            'Failed to insert into the current note and failed to copy to the clipboard. Open a note first and try again.',
        copiedTitle: 'Copied to clipboard',
        copiedMessage:
            'No Markdown editor is available to insert into, so the excerpt was copied to the clipboard. Paste it where you need it.'
    },
    /** A3 document history / diff / restore dialog (`components/Markdown/history/FileHistoryDialog.vue`) */
    fileHistory: {
        title: 'Document history',
        loading: 'Loading history versions…',
        loadFailed: 'Failed to load history versions. Try again later.',
        noActiveFile: 'No file is open. History snapshots are created after you save a file.',
        empty: 'No history versions yet (snapshots are created on save, up to 20 per file)',
        timeColumn: 'Saved at',
        sizeColumn: 'Size',
        latestBadge: 'Latest',
        compareTitle: 'Version from {time} compared with current content',
        diffTitle: 'Line-level diff',
        noDiff: 'This version matches the current editor content',
        selectHint: 'Select a history version on the left to view the diff',
        tooLarge: 'The document is too large to generate a line-level diff',
        gapLines: '… {count} lines omitted',
        restore: 'Restore this version',
        deleteVersion: 'Delete this version',
        restoreConfirm: 'Restore',
        restoreConfirmMessage:
            'Restoring overwrites the current editor content with this history version, so unsaved changes are lost. Continue?',
        clear: 'Clear history for this file',
        clearConfirm: 'Clear',
        clearConfirmMessage:
            'All history versions of the current file will be cleared. This cannot be undone. Continue?',
        cancel: 'Cancel',
        close: 'Close',
        usage: 'History storage {used} / {limit}, {count} versions',
        pathLabel: 'File: {path}'
    },
    /** A4 Markdown lint / one-click format dialog (`components/Markdown/lint/MarkdownLintDialog.vue`) */
    markdownLint: {
        title: 'Markdown lint',
        checking: 'Checking…',
        loadFailed: 'Failed to read the editor content. Try again later.',
        noContent: 'No document to check. Open or create a Markdown file first.',
        tooLarge: 'The document is too large and was skipped (over 512K characters)',
        noIssues: 'No Markdown style issues found',
        recheck: 'Check again',
        applyFormat: 'Format now',
        issueListTitle: 'Issues',
        ruleStatsTitle: 'Rule statistics',
        ruleStatsTotal: '{total} issues: {errors} errors / {warnings} warnings',
        summary: '{total} issues: {errors} errors / {warnings} warnings, {fixable} auto-fixable',
        fixableHint: 'Auto-fixable',
        formatConfirmMessage:
            'Safe formatting will fix {count} auto-fixable issues (trailing spaces, blank lines, fenced code language) without changing heading levels or table structure. Continue?',
        formatConfirm: 'Format',
        cancel: 'Cancel',
        appliedStatus: 'Formatting applied: {count} auto-fixable issues fixed',
        nochangeStatus: 'Nothing to auto-fix (the formatted output matches the original)',
        savedContentHint: 'The editor is not ready, so the saved content is checked instead',
        targetEditor: 'Target: {path}',
        targetEditorFallback: 'Current editor',
        close: 'Close',
        rules: {
            headingIncrement:
                'Heading level skipped: H{previous} → H{current} (headings should increase one level at a time)',
            trailingSpaces: 'Trailing spaces at the end of the line',
            multipleBlanks: 'Multiple consecutive blank lines (at most 1 allowed)',
            blanksAroundHeadings: 'Headings should be surrounded by blank lines',
            blanksAroundFences: 'Code fences should be surrounded by blank lines',
            blanksAroundLists: 'Lists should be surrounded by blank lines',
            fencedCodeLanguage: 'Fenced code block is missing a language tag',
            tableColumnCount:
                'Table column count differs from the header ({expected} header columns, {actual} actual columns)',
            tableSeparator:
                'Invalid table separator row (each column should be --- / :-- / --: / :-:)'
        }
    },
    /** P0 writing mode (floating controls + status bar entry) */
    writingMode: {
        enter: 'Writing Mode',
        exit: 'Exit Writing',
        label: 'Writing Mode',
        typewriter: 'Typewriter',
        focusParagraph: 'Paragraph Focus',
        typography: 'Typography',
        toolbar: 'Toolbar',
        preview: 'Preview',
        goalHint: 'Today’s writing goal and progress',
        contentWidth: 'Text width',
        fontSize: 'Font size',
        lineHeight: 'Line height',
        dailyGoal: 'Daily goal',
        charsUnit: 'chars',
        today: 'Today',
        reset: 'Reset typography'
    },
    /** P0-8 writing style / grammar check */
    writingStyle: {
        title: 'Writing Style Check',
        checking: 'Checking…',
        loadFailed: 'Failed to read editor content. Please try again.',
        noContent: 'No document to check',
        tooLarge: 'Document exceeds 2 MiB; style check is unavailable',
        noIssues: 'No obvious writing style issues found',
        recheck: 'Check again',
        issueListTitle: 'Issues',
        ruleStatsTitle: 'Rule summary',
        ruleStatsTotal: '{total} issues, {enabled}/{all} rules enabled',
        summary: '{total} issues: {warnings} warnings / {infos} hints',
        truncatedHint: 'Too many results; showing the first {count}',
        savedContentHint: 'Editor unavailable; checking saved content',
        targetEditor: 'Target: {path}',
        targetEditorFallback: 'Current editor',
        close: 'Close',
        rules: {
            longSentence: 'Long sentence: {count} chars (suggested max {limit})',
            longSentenceWords: 'Long sentence: {count} words (suggested max {limit})',
            repeatedWord: 'Possible repeated word: {word}',
            frequentCatchphrase:
                'Frequent phrase: "{phrase}" appears {count} times (suggested max {limit})',
            fillerWord: 'Filler word: {word}',
            consecutivePunctuation: 'Consecutive punctuation: "{punctuation}"',
            longParagraph: 'Long paragraph: about {count} chars (suggested max {limit})',
            mixedScriptSpacing: 'Consider a space in mixed Chinese/Latin text',
            punctuationWidthMix: 'Mixed full-width and half-width punctuation'
        },
        ruleLabels: {
            longSentence: 'Long sentence',
            repeatedWord: 'Repeated word',
            frequentCatchphrase: 'Frequent phrase',
            fillerWord: 'Filler word',
            consecutivePunctuation: 'Consecutive punctuation',
            longParagraph: 'Long paragraph',
            mixedScriptSpacing: 'Mixed script spacing',
            punctuationWidthMix: 'Punctuation width mix'
        }
    },
    /** A5 Front matter properties dialog */
    frontMatter: {
        title: 'Document properties',
        loading: 'Reading document properties…',
        loadFailed: 'Failed to read current document. Try again later.',
        noContent: 'No editable Markdown document',
        retry: 'Retry',
        target: 'Target: {path}',
        targetFallback: 'Current editor',
        savedContentHint: 'Editor unavailable; using saved content',
        presentHint: 'Front matter found; saving updates the file header only',
        absentHint: 'No front matter; filling fields inserts a front matter block',
        scalarPlaceholder: 'Enter a value',
        listPlaceholder: 'Separate values with commas',
        customTitle: 'Custom properties',
        customEmpty: 'No other custom properties',
        remove: 'Remove property',
        save: 'Save',
        saveFailed: 'Save failed. Try again later.',
        cancel: 'Cancel',
        fields: {
            title: 'Title',
            date: 'Date',
            tags: 'Tags',
            status: 'Status',
            summary: 'Summary',
            aliases: 'Aliases'
        }
    },
    /** B2/B1/B4 knowledge base query dialog */
    knowledge: {
        titleTags: 'Tags',
        titleLinks: 'Link issues',
        titleBacklinks: 'Backlinks',
        loading: 'Loading workspace index…',
        loadFailed: 'Failed to load workspace index. Try again later.',
        noWorkspace: 'No workspace open; open a folder to query the knowledge base',
        emptyWorkspace: 'No indexable Markdown / TXT files in the workspace',
        emptyTags: 'No tags in the workspace yet',
        emptyLinks: 'No missing or ambiguous Wiki links',
        noActiveFile: 'No file is currently open',
        emptyBacklinks: 'The current file has no backlinks yet',
        retry: 'Retry',
        refresh: 'Refresh index',
        refreshing: 'Refreshing workspace index…',
        refreshFailed: 'Index refresh failed; showing the previous result',
        openFailed: 'Failed to open the file. Try again later.',
        close: 'Close',
        statusMissing: 'Missing',
        statusAmbiguous: 'Ambiguous',
        summaryTags: '{tags} tags / {files} files',
        summaryLinks: '{missing} missing / {ambiguous} ambiguous',
        summaryBacklinks: '{count} backlinks',
        targetWorkspace: 'Workspace: {path}',
        targetWorkspaceUnknown: 'Workspace index',
        targetActiveFile: 'Current file: {path}',
        targetNoActiveFile: 'No file is currently open',
        tagListLabel: 'Tag list',
        tagFilesLabel: 'Files with this tag',
        linkListLabel: 'Link issue list',
        backlinkListLabel: 'Backlink list'
    },
    /** B5 attachment manager dialog */
    attachments: {
        title: 'Attachment Manager',
        loading: 'Loading workspace index (attachments)…',
        loadFailed: 'Failed to load workspace index (attachments). Try again later.',
        noWorkspace: 'No workspace open; open a folder to scan attachments',
        unsupported: 'The current index does not include attachment data; refresh or upgrade',
        empty: 'No attachments referenced in this workspace',
        retry: 'Retry',
        refresh: 'Refresh index',
        refreshing: 'Refreshing workspace index…',
        refreshFailed: 'Index refresh failed; showing the previous result',
        reveal: 'Show in Explorer',
        revealFailed: 'Cannot reveal in Explorer (IPC unavailable or path not trusted)',
        close: 'Close',
        summary:
            '{total} attachments: {missing} missing / {available} available, {references} references',
        missingSection: 'Missing attachments',
        missingSectionLabel: 'Missing attachment list',
        missingBadge: 'Missing',
        availableSection: 'Available attachments',
        availableSectionLabel: 'Available attachment list',
        refCount: '{count} references',
        refToggleLabel: 'Toggle source references',
        refListLabel: 'Source files',
        targetWorkspace: 'Workspace: {path}',
        targetWorkspaceUnknown: 'Workspace index',
        titleOrphans: 'Orphan attachments ({count})',
        orphanSection: 'Orphan attachments',
        orphanHint:
            'Orphans are attachments not referenced by any Markdown file (the audit is conservative); items moved to the system recycle bin can be restored.',
        auditLoading: 'Auditing orphan attachments…',
        auditFailed: 'Orphan attachment audit failed. Try again later.',
        auditUnsupported: 'The current main process does not support orphan audit; update the app',
        auditTruncated: 'Audit results are truncated; only some orphans are shown',
        emptyOrphans: 'No orphan attachments found',
        retryAudit: 'Audit again',
        noWorkspaceOrphans: 'No workspace open; cannot audit orphan attachments',
        selectAll: 'Select all',
        selectOrphan: 'Select orphan attachment: {path}',
        selectedCount: '{selected} selected / {total} total',
        sizeLabel: 'Size',
        mtimeLabel: 'Modified',
        trash: 'Move to Recycle Bin',
        trashConfirm: 'Confirm move to Recycle Bin',
        trashConfirmMessage:
            'Move {count} orphan attachments ({size} total) to the system Recycle Bin?',
        trashConfirmHint:
            'The main process will revalidate paths and references; items can be restored from the system Recycle Bin.',
        trashOperating: 'Moving to Recycle Bin…',
        trashSuccess: 'Moved {count} orphan attachments to the system Recycle Bin',
        trashPartial: 'Moved {trashed}; {failed} failed',
        trashFailed: 'Failed to move to Recycle Bin. Try again later.',
        trashItemFailed: '{path}: {reason}',
        trashReasonPathDenied: 'Path is not trusted',
        trashReasonNotFile: 'Not a regular file',
        trashReasonStillReferenced: 'Still referenced by Markdown',
        trashReasonTrashFailed: 'System Recycle Bin unavailable',
        trashReasonLimitExceeded: 'Batch count or size limit exceeded',
        rename: 'Rename',
        renameConfirm: 'Confirm rename',
        renamePlaceholder: 'Enter a new file name (without extension)',
        renameInputLabel: 'New file name (without extension)',
        renamePrompt: 'Rename: {path}',
        renameNameRequired: 'Enter a new file name',
        renameInvalidName: 'Invalid file name (path separators or special characters)',
        renameConflict: 'Target name already exists; choose another name',
        renamePathDenied: 'Path is not trusted; cannot rename',
        renameNotFile: 'Target is not a regular file; cannot rename',
        renameFailed: 'Rename failed. Try again later.',
        renameSuccess: 'Renamed to {name}; updated {files} files / {replacements} references',
        renameRefUpdateFailed:
            '{count} source files failed to update references (file was renamed; manual fix required): {files}',
        cancel: 'Cancel'
    },
    /** B1 Wiki link click/create dialog */
    wikiLinkAction: {
        commandOpen: 'Open Wiki link at cursor',
        titleAmbiguous: 'Ambiguous link target',
        titleMissing: 'Target note does not exist',
        titleBlocked: 'Cannot create target note',
        titleError: 'Wiki link action failed',
        ambiguousHint: 'The link target is ambiguous; choose a note to open:',
        ambiguousEmpty: 'Candidates are stale; refresh the index and retry',
        candidateListLabel: 'Candidate notes',
        missingHint: 'Target note does not exist. Create it?',
        createNotice: 'Will create {path}',
        createLocation: 'Save to: {dir}',
        blockedDirectoryMissing: 'Directory does not exist; create it first: {dir}',
        blockedAlreadyExists: 'Target file already exists: {path}',
        blockedInvalidTarget: 'Invalid target path; cannot create',
        blockedDefault: 'Cannot create target note',
        noWorkspace: 'No workspace open; cannot open Wiki links',
        indexError: 'Workspace index is unavailable. Try again later.',
        openFailed: 'Failed to open file. Try again later.',
        createFailed: 'Failed to create target note. Try again later.',
        createIpcUnavailable: 'Main process unavailable; cannot create target note',
        createInvalidPlan: 'Invalid creation plan',
        errorHint: 'Action failed; refresh the index and retry',
        cancel: 'Cancel',
        create: 'Create',
        creating: 'Creating…',
        close: 'Close'
    },
    /**
     * 1.5.7 LLM Wiki L5: workbench AI input panel + editor/preview tab switch.
     * UI skeleton batch only; AI calls go through an injectable transport (placeholder by default).
     * 1.5.7 UX fine-tuning (user feedback batch A4): the editor/preview switch and the workspace
     * mode quick switch become icon-only buttons at the right of the edit toolbar; the right
     * sidebar AI entry switches to LLM Wiki mode when clicked in traditional mode.
     */
    llmWikiPanel: {
        ariaLabel: 'AI input panel',
        title: 'AI Assistant',
        modelLabel: 'Model',
        modelSelectHint: 'Choose the model used for this conversation',
        modelLoading: 'Loading models…',
        modelUnconfigured: 'No model configured',
        modelUnconfiguredHint:
            'The AI assistant is not enabled or has no model configured. Configure it in Settings > AI Assistant and try again.',
        modelFallback: 'Default model (config unavailable)',
        modelLoadFailedHint:
            'Failed to read the AI model configuration; the default model will be used. Reopen the panel or check the configuration in Settings.',
        resetWidth: 'Reset panel width',
        splitterLabel: 'Resize the AI panel',
        splitterHint:
            'Drag to resize the AI panel (arrow keys for fine adjustment, double-click to reset)',
        clear: 'Clear conversation',
        contextTitle: 'Context',
        contextDocument: 'Current document',
        contextSelection: 'Selected text',
        contextEmpty: 'No context yet (open a document or select text to reference it)',
        emptyTitle: 'Start a conversation with AI',
        emptyHint:
            'Type a question or instruction; results can be copied or applied to the editor (apply is not connected yet).',
        userRole: 'You',
        assistantRole: 'AI Assistant',
        thinking: 'Generating…',
        messageListLabel: 'AI conversation messages',
        inputLabel: 'AI input',
        inputPlaceholder:
            'Type a question or instruction (Enter to send, Shift+Enter for a new line)',
        inputHint: 'Enter to send / Shift+Enter for a new line',
        send: 'Send',
        stop: 'Stop',
        copy: 'Copy',
        copied: 'Copied',
        copyFailed: 'Copy failed',
        apply: 'Apply to editor',
        applyComingSoon: 'Applying results is not connected yet (available in the L3 batch)',
        notConnected: 'AI features are not connected yet (available in the L3 batch)',
        emptyReply: 'AI returned no content. Try again later.',
        transportError: 'AI request failed. Try again later.',
        aiNotConfigured:
            'The AI assistant is not enabled or is incompletely configured. Finish the configuration in Settings > AI Assistant and try again.',
        aiUnavailable: 'Unavailable in this environment: the AI service channel cannot be reached.',
        aiError: 'AI request failed. Try again later.',
        collapse: 'Collapse AI panel',
        expand: 'Expand AI panel',
        switchToPreview: 'Switch to preview',
        switchToEditor: 'Switch to editor',
        switchToLlmWiki: 'Switch to LLM Wiki mode',
        switchToTraditional: 'Switch to traditional mode',
        switchToLlmWikiEntry: 'Switch to LLM Wiki mode and open the AI assistant',
        workspaceModeSwitchFailedTitle: 'Failed to switch workspace mode',
        workspaceModeSwitchFailedMessage:
            'Failed to save the workspace mode configuration: {error}. The previous mode is still active; please try again.',
        workspaceModeSwitchUnavailable:
            'The system configuration cannot be read or written in this environment, so the workspace mode was not switched'
    },
    /**
     * 1.5.7 LLM Wiki L3: AI compile diff approval UI (Markdown/llm-ingest-diff.vue).
     * Appended after L5's llmWikiPanel block so the two AI surfaces stay independent.
     */
    llmIngest: {
        title: 'AI compile approval',
        loading: 'Compiling the raw source and generating a draft…',
        preparing: 'Preparing…',
        sourceLabel: 'Source material',
        targetLabel: 'Target page',
        newBadge: 'New page',
        updateBadge: 'Update existing page',
        diffLabel: 'Diff between the draft and the target file',
        addCount: '+{count} lines',
        delCount: '-{count} lines',
        truncated:
            'The diff is large, showing the first {count} lines; the full draft will be written.',
        empty: 'The draft is empty and cannot be approved.',
        apply: 'Approve and apply',
        applying: 'Writing…',
        cancel: 'Cancel',
        applied: 'Written to {path}',
        applyFailed: 'Failed to write: {error}',
        loadFailed: 'AI compile failed: {error}',
        notConfiguredHint:
            'Enable the AI assistant and finish its configuration in System Settings -> Features -> AI Assistant first.',
        noWorkspaceHint:
            'Open an LLM Wiki workspace and initialize the raw/ and wiki/ directories first.',
        ipcUnavailable:
            'The main process is unavailable, so AI compile cannot run. Restart the app and try again.',
        close: 'Close',
        retry: 'Retry'
    },
    /**
     * 1.5.7 LLM Wiki L4: relationship graph dialog (components/Graph/GraphDialog.vue).
     * Appended after L3 llmIngest so existing knowledge-base / AI panel entries stay untouched.
     */
    graphDialog: {
        title: 'Relationship graph',
        menuLabel: 'Relationship graph',
        filterLabel: 'Scope',
        filterAll: 'All files',
        filterWiki: 'Wiki pages only',
        summary: '{files} files · {edges} relationships',
        summaryFiltered: 'Showing {shown}/{total} files · {edges} relationships',
        truncated:
            'Too many nodes/relationships, so the graph is truncated by link count ({shownNodes}/{totalNodes} nodes, {omittedEdges} relationships omitted); switch to "Wiki pages only" to narrow the scope.',
        loading: 'Loading the workspace index and computing the graph…',
        noWorkspace: 'Open a workspace folder before viewing the relationship graph',
        emptyWorkspace: 'The workspace has no indexable Markdown / TXT files',
        emptyWiki:
            'No pages under wiki/ in this workspace (switch to "All files" to browse everything)',
        emptyGraph: 'No file nodes to display in the current scope',
        emptyLinks:
            'No resolvable Wiki links in this workspace yet (use [[page name]] in a note to create links)',
        loadFailed: 'Failed to load the workspace index. Try again later.',
        retry: 'Retry',
        refresh: 'Refresh index',
        refreshing: 'Refreshing the workspace index…',
        refreshFailed: 'Failed to refresh the index; showing the previous snapshot',
        openFailed: 'Failed to open the file. Try again later.',
        opened: 'Opened: {title}',
        close: 'Close',
        canvasLabel:
            'Relationship graph canvas: drag to pan, scroll to zoom, click a node to open the file',
        panelLabel: 'Graph relationship details',
        edgePanelTitle: 'Link relationship',
        edgeSource: 'Source',
        edgeTarget: 'Target',
        edgeOccurrenceCount: 'Occurrences',
        edgeOccurrenceListLabel: 'Link occurrence list',
        nodePanelTitle: 'Node details',
        nodeDegree: 'Connections: {count}',
        nodeTags: 'Tags',
        legendTitle: 'How to use',
        legendPan: 'Drag empty space to pan the canvas',
        legendZoom: 'Scroll or use the buttons at the top right to zoom',
        legendNodeClick: 'Click a node to open the corresponding file',
        legendEdge: 'Hover or click a line to inspect the relationship',
        legendWikiFilter: 'Switch to "Wiki pages only" to focus on pages under wiki/',
        zoomGroupLabel: 'Graph zoom',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        zoomReset: 'Reset zoom'
    },
    /**
     * 1.5.7 LLM Wiki L4: embed raw/ source material dialog
     * (components/Markdown/embed/EmbedDialog.vue). The file list comes from the existing
     * directory-tree IPC event, preview reuses FILE.READ_HTML, insertion reuses A8.
     */
    embedDialog: {
        title: 'Embed raw source material',
        workspace: 'Workspace: {path}',
        workspaceUnknown: 'Workspace file tree',
        summary: '{count} embeddable files',
        loading: 'Reading the workspace file tree…',
        timeout:
            'Timed out while reading the workspace file tree (the workspace may not be open). Open a workspace and try again.',
        ipcUnavailable:
            'The main process is unavailable, so the file tree cannot be read. Restart the app and try again.',
        invalidTree: 'The workspace file tree payload is invalid. Refresh and try again.',
        loadFailed: 'Failed to read the workspace file tree. Try again later.',
        retry: 'Retry',
        noWorkspace: 'Open a workspace folder before reading raw/ files',
        emptyRaw:
            'This workspace has not initialized the raw/ directory yet. Run "Initialize LLM Wiki" first.',
        emptyFiles:
            'No embeddable files in raw/ yet (Markdown / text / image / PDF / HTML are supported)',
        listLabel: 'raw/ file list',
        previewTitle: 'Read-only preview',
        previewEmpty: 'Select a file on the left to preview it',
        previewLoading: 'Reading file content…',
        previewFailed: 'Failed to read the file content. Try again later.',
        previewTruncated: 'The file is long, so only the first {count} characters are shown',
        previewOther: 'This file type cannot be previewed inline; insert a reference link instead',
        activeFile: 'Insert into: {path}',
        noActiveFileHint: 'No file open: open a wiki/ page before inserting a reference',
        noActiveFile: 'Open a wiki/ page before inserting a raw/ reference',
        differentDrive:
            'The raw/ file and the current file are on different drives, so a relative path cannot be built',
        editorUnavailable: 'No editor is available. Open and focus a note first.',
        insert: 'Insert into editor',
        inserted: 'Inserted the Markdown reference into the current editor',
        insertFailed: 'Insert failed. Make sure the editor is editable and try again.',
        copy: 'Copy Markdown',
        copied: 'Copied',
        copyFailed: 'Copy failed. Check the system clipboard permission.',
        kindText: 'Text',
        kindImage: 'Image',
        kindOther: 'Other',
        kindTextBadge: 'T',
        kindImageBadge: 'I',
        kindOtherBadge: 'O',
        refresh: 'Refresh list',
        close: 'Close'
    }
}
