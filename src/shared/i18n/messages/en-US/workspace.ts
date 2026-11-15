/**
 * workspace namespace (en)
 *
 * Shell texts for welcome screen, side navigation tooltips,
 * resource manager context menu and window control buttons.
 */
export default {
    appTitle: 'BaiZeNotes - Markdown Editor Powered By Election + Vue',
    window: {
        minimize: 'Minimize',
        maximize: 'Maximize'
    },
    navi: {
        fileManager: 'File Explorer',
        outline: 'Outline'
    },
    welcome: {
        title: 'BaiZeNotes',
        openFile: 'Open File',
        openFolder: 'Open Folder',
        recentFolders: 'Recent Folders'
    },
    resourceContext: {
        new: 'New',
        markdownFile: 'Markdown File',
        importWord: 'Import from Word',
        importHtml: 'Import from HTML',
        copyFile: 'File/Folder',
        copyName: 'File/Folder Name',
        copyRealPath: 'Absolute Folder Path',
        copyRelativePath: 'Relative to Current File',
        copyImageLink: 'Copy as Local Image Link',
        copyFileLink: 'Copy as Local File Link',
        revealInFolder: 'Reveal in Folder',
        exportToFile: 'Export to File',
        exportSourceFailedTitle: 'Export cancelled',
        exportSourceFailedMessage:
            'Could not open "{name}"; the export was cancelled to avoid exporting the wrong content.',
        openInExplorer: 'Open in Explorer',
        reloadFromDisk: 'Reload from Disk'
    },
    createFileFolder: {
        failedTitle: 'Creation failed',
        failedMessage: 'Failed to create "{name}": {error}'
    },
    config: {
        saveFailedTitle: 'Failed to save settings',
        saveFailedMessage:
            'Failed to write the "{name}" settings to disk: {error}. The change may not survive a restart.',
        writeReturnedFalse: 'the write API reported failure',
        names: {
            theme: 'theme',
            editor: 'editor',
            system: 'system',
            'quick-links': 'quick links'
        }
    }
}
