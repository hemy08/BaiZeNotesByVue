/**
 * status namespace (en)
 *
 * Status bar labels, ready hint and templated file size / cursor position.
 */
export default {
    filePathLabel: 'File path:',
    defaultFilePath: 'BaiZeNotes',
    ready: 'Ready',
    bytesZero: '0 bytes',
    bytes: '{value} bytes',
    cursorLabel: 'Ln',
    cursorPosition: 'Ln {line}, Col {column}',
    writingStats: {
        summary: '{cjk} chars · {words} words · {chars} characters · ~{minutes} min',
        selection: 'Selection: {chars} chars · {words} words',
        goal: 'Today {written}/{goal} · {percent}%',
        goalAchieved: 'Daily goal reached · {written} chars'
    }
}
