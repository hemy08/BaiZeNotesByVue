export interface MonacoTheme {
    base: 'vs-dark' | 'vs';
    inherit: boolean;
    rules: {
        token: string;
        foreground?: string;
        background?: string;
        fontStyle?: string;
    }[];
    colors: Record<string, string>;
}
/**
 * @param rawTmThemeString - The contents read from a tmTheme file.
 * @returns A monaco compatible theme definition. See https://microsoft.github.io/monaco-editor/api/interfaces/monaco.editor.istandalonethemedata.html
 */
export declare function parseTmTheme(rawTmThemeString: string): MonacoTheme;
