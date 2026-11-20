/**
 * mainMsg namespace (en)
 * User-visible messages emitted by the main process: status bar notices, error/info/
 * confirmation dialog titles and bodies, file operation prompts, auto-update prompts,
 * security confirmations and PlantUML local render errors.
 */
export default {
    app: {
        windowTitle: 'BaiZe Notes -- Markdown Editor Powered By Electron and Vue'
    },
    // Batch B #4: system tray menu and tooltip copy (minimize to tray on close)
    tray: {
        showMainWindow: 'Show main window',
        quit: 'Quit',
        tooltip: 'BaiZe Notes',
        // 1.3.6: first-time notification when hidden to tray (Windows tray icon may be in the overflow area)
        minimizedTitle: 'BaiZe Notes minimized to system tray',
        minimizedBody:
            'The app is still running in the background. Right-click the tray icon (possibly in the overflow area) and choose "Quit" to close it completely.'
    },
    editor: {
        ariaLabel: 'Baize Notes editor'
    },
    // 2026-11-20 (user request): confirmation when unsaved changes exist on close/quit
    closeConfirm: {
        title: 'Unsaved changes',
        message: 'The current file has unsaved changes. Save before closing?',
        detail: "Save & close keeps your changes; Don't save discards them; Cancel returns to editing.",
        save: 'Save & close',
        discard: "Don't save",
        cancel: 'Cancel',
        // P3 F-09: when minimizeToTray is on, "close" actually hides to the system tray
        trayMessage: 'The current file has unsaved changes. Save before hiding to the system tray?',
        trayDetail:
            "Save & hide keeps your changes and hides the window to the system tray (the app keeps running in the background); Don't save discards them; Cancel returns to editing.",
        traySave: 'Save & hide'
    },
    dialog: {
        errorTitle: 'Error!',
        infoTitle: 'Info',
        warningTitle: 'Warning',
        confirmTitle: 'Confirm',
        confirm: 'Confirm',
        cancel: 'Cancel',
        saveAsTitle: 'Save as',
        saveAsSuccessTitle: 'Saved successfully',
        saveAsSuccessMessage: 'File saved to: {path}',
        saveAsFailedTitle: 'Save as failed',
        saveAsFailedMessage: 'Save as failed: {error}',
        largeFileTitle: 'Large file',
        largeFileMessage: 'The file is {size} MB. Opening it may affect performance. Continue?',
        largeFileContinue: 'Open anyway',
        exportTitle: 'Export as {name}',
        exportSuccess: 'Exported successfully: {path}',
        exportFailed: 'Failed to export file: {error}',
        saveImportFileTitle: 'Save imported file'
    },
    status: {
        operationFailed: 'Operation failed: {message}',
        autoSaveFailed: 'Auto-save failed: {message}',
        saveFailed: 'Failed to save file: {message}',
        fileCreatedUtf8: 'File created (utf-8)',
        fileOpened: 'File opened ({encoding})',
        openFileFailed: 'Failed to open file: {message}',
        dirtySkipReload: 'The current file has unsaved changes; reloading from disk was skipped',
        reloadedFromDisk: 'Reloaded from disk ({encoding})',
        reloadFromDiskFailed: 'Failed to reload from disk: {message}',
        reopenedWithEncoding: 'File reopened with {encoding} encoding',
        convertedEncoding: 'Converted to {encoding} encoding and saved',
        noActiveFileUnsaved: 'No active file; the content has not been saved yet',
        noActiveFileSave: 'No active file to save',
        menuActionFailed: 'Menu action failed: {message}',
        // File menu recent files/folders: the target is no longer in the current recent list
        recentTargetMissing: 'The recent item no longer exists.',
        // System settings supplement batch A: startup restore of last file/folder
        startupRestoreFileMissing:
            'The last opened file no longer exists (it may have been moved or deleted), so it was not restored: {path}',
        startupRestoreFolderMissing:
            'The last opened folder no longer exists (it may have been moved or deleted), so it was not restored: {path}',
        // P2-6: the startup restore folder failed the AS-2 workspace root check
        // (home directory / system directory / drive root etc.)
        startupRestoreFolderInvalid:
            'The last opened folder failed the safety check ({reason}), so it was not restored: {path}',
        startupRestoreFailed: 'Failed to restore the last opened content at startup: {message}',
        // System settings supplement batch C: auto backup result status bar messages
        autoBackupSuccess: 'Auto backup created: {name} ({count} files)',
        autoBackupFailed: 'Auto backup failed: {message}'
    },
    file: {
        saveFailed: 'Failed to save file: {message}',
        noActiveFileForSaveAs: 'No active file to save as',
        unsupportedFormat: 'Unsupported file format: {ext}',
        directoryListFailed: 'Failed to read the directory!',
        alreadyExists: '{path} already exists',
        openDirectoryDialogFailed: 'Failed to open directory dialog: {error}',
        noActiveFileReopen: 'No active file to reopen',
        noActiveFileConvert: 'No active file to convert the encoding of',
        readLargeFileFailed: 'Failed to read large file: {message}',
        readLargeFileFailedPrefix: 'Failed to read large file',
        readError: {
            enoent: 'File does not exist or has been moved',
            eacces: 'No read permission',
            eperm: 'No read permission',
            eisdir: 'The target path is a directory, not a file',
            ebusy: 'The file is in use by another program',
            emfile: 'Too many files are open at the same time'
        },
        readErrorWithDetail: '{reason} ({message})',
        noExportContent: 'There is no content to export',
        unsupportedExportFormat: 'Exporting to {format} is not supported yet',
        excelImportUnsupported:
            'Importing .xls/.xlsx directly is not supported. Export the sheet as CSV first.',
        htmlToMarkdownFailed: 'Failed to convert HTML to Markdown: {error}',
        importUnsupportedFormat:
            'This file format is not supported yet.\r\nSupported formats: *.txt, *.log, *.ini, *.json, *.yaml, *.yml, *.csv, *.xml, *.html, *.htm, *.mhtml, *.doc, *.docx.\r\nExport *.xls/*.xlsx as CSV before importing.',
        importFailed: 'Failed to import file: {error}',
        importDefaultFileName: 'Imported file.md',
        createImagesDirFailed: '{path} does not exist; failed to create directory: {error}',
        imageFormatUnsupported:
            'Failed to parse the image format. Only *.png, *.jpg, *.jpeg, *.bmp, *.gif and *.ico are supported.',
        saveImageFailed: 'Failed to save image: {error}',
        noFileOpen: 'No file is open. Please open a file first.',
        fileAlreadyExists: 'File already exists: {name}',
        openFileFirst: 'Please open a file first!',
        pasteTargetNotDirectory: 'The target is not a directory!',
        noCopyCutSource: 'No source file has been copied or cut!',
        sameSourceAndTarget: 'The source and target paths are the same!',
        fileOrFolderAlreadyExists: 'The file/folder already exists!\r\n{path}',
        deleteFailed: 'Delete failed: {message}',
        copyFailed: 'Copy failed: {message}'
    },
    filters: {
        markdown: 'Markdown files',
        word: 'Word documents',
        text: 'Text files',
        html: 'HTML files',
        json: 'JSON files',
        pdf: 'PDF files',
        xml: 'XML files',
        yaml: 'YAML files'
    },
    security: {
        openExeTitle: 'Security confirmation',
        openExeMessage: 'About to open an executable',
        openExeDetail:
            'This program is not in a trusted system directory:\n{path}\n\nContinue only if you trust its source.',
        openExeConfirm: 'Open anyway'
    },
    update: {
        title: 'Check for updates',
        notConfiguredMessage: 'No update source configured',
        notConfiguredDetail:
            'No update server URL is configured.\nOption 1 (recommended): set resources/config/update.json to { "provider": "generic", "url": "https://your-update-server/path" }; see resources/config/update.json.example for reference.\nOption 2: replace the example.com placeholder in publish.url of electron-builder.yml with the real update server URL, then rebuild.',
        upToDateMessage: 'You are up to date',
        upToDateDetail: 'Version v{version} is the latest version.',
        availableMessage: 'New version v{version} available',
        availableDetail: 'The new version has been downloaded. Restart and install it now?',
        restartNow: 'Restart and install',
        later: 'Later',
        failedMessage: 'Failed to check for updates',
        downloadFailed: 'Failed to download the new version. Check your network and try again.',
        // Update robustness: download wait timeout (10 minutes) and pre-install save failure
        downloadTimeout:
            'Timed out while downloading the new version. Check your network and try again.',
        saveBeforeInstallFailedMessage:
            'Failed to save unsaved changes, so the update installation was cancelled',
        saveBeforeInstallFailedDetail:
            'Resolve the save failure first (for example, "Save as" to a new file), then install the downloaded update again via Help → Check for updates.'
    },
    plantuml: {
        missingOutContainer: 'PlantUML render page is missing the #out container',
        missingSvg: 'PlantUML did not generate an SVG',
        invalidResult: 'PlantUML local rendering returned an invalid result',
        renderFailed: 'PlantUML local rendering failed',
        resourceNotFound: 'resources/plantuml offline render resources were not found',
        windowInitTimeout: 'PlantUML render window initialization timed out ({ms}ms)',
        pageNotReady: 'PlantUML render page is not ready (window.plantumlRender is not exposed)',
        pageLoadFailed: 'PlantUML render page failed to load: {description} ({code})',
        processGone: 'PlantUML render process exited unexpectedly: {reason}',
        renderTimeout: 'PlantUML local rendering timed out ({ms}ms)',
        renderException: 'PlantUML local rendering error: {message}',
        emptySource: 'PlantUML source is empty',
        invalidSourceParam: 'Invalid PlantUML source parameter (a string is expected)'
    }
}
