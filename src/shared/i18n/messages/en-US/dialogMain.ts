/**
 * dialogMain namespace (en)
 * Titles, buttons, labels, placeholders, hints and dynamic messages of the
 * main-process HTML dialogs (src/main/dialogs/**).
 */
export default {
    common: {
        alreadyExists: {
            title: 'Error!',
            message: 'Something went wrong',
            detail: 'A dialog of the same kind is already open. Please close it first!'
        }
    },
    // Feedback 2026-11-27: minimize / maximize / restore buttons in the top-right of non-modal tool windows (BaseDialog)
    toolWindow: {
        minimize: 'Minimize',
        maximize: 'Maximize',
        restore: 'Restore'
    },
    // Feedback 2026-11-27: plugin tools panel top bar title (PluginTools)
    pluginTools: {
        title: 'Plugin Tools'
    },
    confirmDelete: {
        title: 'Confirm',
        message: 'Are you sure you want to delete [{path}]?',
        yes: 'Yes',
        no: 'No'
    },
    createFileFolder: {
        windowTitle: 'New',
        title: 'New',
        nameLabel: 'Name:',
        namePlaceholder: 'Enter a name',
        fileSuffixHint: 'Default file extension: .md',
        nameRequired: 'Name cannot be empty',
        createFailed: 'Failed to create "{name}": {error}'
    },
    rename: {
        windowTitle: 'Rename',
        title: 'Rename',
        newNameLabel: 'New name:',
        newNamePlaceholder: 'Enter a new name',
        nameRequired: 'New name cannot be empty',
        renameFailed: 'Failed to rename "{path}": {error}'
    },
    shortcutKeys: {
        windowTitle: 'Keyboard Shortcuts - BaiZe Notes',
        title: 'Keyboard Shortcuts',
        intro: 'Shortcuts available in the current version; some of them work when the editor is focused.',
        close: 'Close',
        groups: {
            file: 'File',
            edit: 'Edit',
            format: 'Markdown Format',
            view: 'View'
        },
        items: {
            newFile: 'New file / folder',
            openFolder: 'Open folder',
            save: 'Save current file',
            reload: 'Reload from disk',
            relaunch: 'Restart application',
            exit: 'Quit application',
            undo: 'Undo',
            redo: 'Redo',
            cut: 'Cut',
            copy: 'Copy',
            paste: 'Paste',
            pasteImage: 'Paste image from clipboard',
            find: 'Find',
            replace: 'Replace',
            goLine: 'Go to line',
            headings: 'Heading 1 - 6',
            bold: 'Bold',
            italic: 'Italic',
            underline: 'Underline',
            strikethrough: 'Strikethrough',
            keyboard: 'Keyboard key style',
            link: 'Insert link',
            editMode: 'Editor only',
            previewMode: 'Preview only',
            editPreviewMode: 'Editor + preview',
            devTools: 'Developer tools'
        }
    },
    helpContactUs: {
        windowTitle: 'Contact us',
        title: 'Contact us',
        authorDesc: 'BaiZe Notes developer',
        emailLabel: 'Email',
        issueLabel: 'Feedback',
        issueAction: 'Submit an issue or suggestion',
        footer: 'Thank you for using BaiZe Notes'
    },
    updateLog: {
        windowTitle: 'Update log - BaiZe Notes',
        title: 'Update log - BaiZe Notes',
        heading: 'Update log',
        updateDate: 'Updated: November 15, 2026 · Version 1.3.0',
        updateSummary:
            'This release delivers security hardening, i18n, local preview rendering and architecture consolidation: 105 of 127 audit items fully fixed, 22 partially fixed, with all quality gates green',
        highlightsTitle: '1.3.0 Major Updates',
        highlights: {
            h1: 'Security hardening: P0 attack chain closed (DOMPurify sanitization + IPC sender/path validation + navigation guard + CSP)',
            h2: 'Internationalization: full zh-CN / en-US support with instant switching (12 namespaces)',
            h3: 'Preview performance: single-hop local rendering (IPC 4→0) + inline code highlight ~124× faster + KaTeX cache',
            h4: 'Local image preview fixed: relative images/ paths now render correctly',
            h5: 'Architecture: single IPC channel source (123→86), one-time registration, listener ledger, single config source',
            h6: 'Quality gates: typecheck 0 errors, ESLint 0/0, audit 0 vulnerabilities, 2243 test cases passing',
            h7: 'Package size: installer 233MB → 109.8MB (-53%); 10,403 lines of dead code removed'
        },
        groups: {
            coreFramework: 'Core framework',
            electronEcosystem: 'Electron ecosystem',
            editorRendering: 'Editor & rendering',
            dataTools: 'Data & utility libraries',
            devTools: 'Development tools'
        },
        table: {
            dependency: 'Dependency',
            oldVersion: 'Old version',
            newVersion: 'New version',
            type: 'Type'
        },
        typeLabels: {
            major: 'Major',
            minor: 'Minor',
            patch: 'Patch',
            keep: 'Kept',
            added: 'Added',
            removed: 'Removed'
        },
        codeFixesTitle: 'Code adaptations',
        codeFixes: {
            materialRender:
                'mkdocs-material: admonition/tabbed set rebuilt as native markdown-it block plugins',
            editorOptions:
                'preview-markdown-it.ts: highlightAuto disabled (auto:false) with highlight guard',
            hemyEditorRender:
                'preview-local-render.ts: local image file:// URL conversion (toFileUrl + encodeURI)',
            tsconfigWeb: 'tsconfig.*: noImplicitAny enabled with 46 implicit any diagnostics fixed',
            vitest: 'tsconfig.test.json: test directory included in typecheck (235 diagnostics fixed)',
            encryptDecrypt:
                'DOMPurify config: file: protocol added to URI allowlist (local image src no longer stripped)',
            useConfigStore: 'CSP: img-src allows file: for local relative images',
            preloadTypes:
                'IPC channels: 123→86 unified as baize:<domain>:<name> with dead channels removed',
            quickLinkXss:
                'Security: TOC/NaviTab/Mermaid preview v-html removed or sanitized (XSS hardening)',
            cleanup: '10,403 dead-code lines removed; main bundle -44%; @ts-ignore cleared'
        },
        verifyTitle: 'Verification results',
        verify: {
            typescriptNode: 'TypeScript (main+preload): 0 errors',
            typescriptWeb: 'TypeScript (renderer): 0 errors',
            eslint: 'ESLint: 0 errors / 0 warnings',
            unitTests: 'Unit tests: 133 files / 2243 cases passed',
            audit: 'Dependency audit: 0 vulnerabilities (all & prod)',
            build: 'Packaging: installer 109.8MB (-53%)'
        },
        footer: 'BaiZe Notes v1.3.0 · Built with Electron 43 + Vue 3.5 + TypeScript 6.0'
    },
    releaseNotes: {
        windowTitle: 'Release v{version} - BaiZe Notes',
        notFound: 'No release notes found for version {version}',
        releaseDate: 'Release date: {date}',
        footer: 'BaiZe Notes v{version} · {date}',
        featuresTitle: 'New features',
        fixesTitle: 'Bug fixes',
        improvementsTitle: 'Improvements',
        techStackTitle: 'Tech stack',
        v155: {
            title: '1.5.5 Visual Upgrade',
            highlights: {
                h1: '4 UI styles × 3 densities: Paper / Glass / Workbench / Hybrid, switchable in Settings → Appearance',
                h2: '18 semantic color tokens across 28 themes, all derived from the active theme with automatic fallback for dark, high-saturation and eye-care themes',
                h3: '6 core components upgraded together: menu bar, non-modal tool windows, dialogs, command palette, status bar & empty states, table editor',
                h4: 'Keyboard-accessible menu bar (arrows / Enter / Esc) and paper-style writing mode'
            },
            features: {
                f1: 'New Appearance options: UI style, UI density and reduce transparency',
                f2: 'Keyboard navigation and visible focus for the menu bar; command palette and tool windows are now fully keyboard-operable',
                f3: 'Unified radius / shadow / border / motion rules across all four styles (DESIGN / MOTION / COMPONENTS docs)',
                f4: 'Paper-style writing mode: 1.75 line height, quote bars, rounded code blocks; Monaco editor themes stay independent'
            },
            improvements: {
                i1: 'Cleaned up 161 hardcoded colors (−17.9%); colors now flow through --ui-* tokens',
                i2: 'Verified with 37 real Electron screenshots (4 styles × 3 densities), 0 diff across two consecutive runs',
                i3: 'Contrast scan passes for 28 themes × 4 styles (body text ≥ 4.5:1)',
                i4: 'Converged menu bar height, width scale and z-index handling'
            },
            fixes: {
                x1: 'Fixed tool-window Esc semantics: closes the topmost window only when focus is inside it',
                x2: 'Fixed hierarchy and sizing inconsistencies in the menu bar and writing mode'
            }
        },
        v152: {
            title: '1.5.2 Capture and Daily Entry',
            highlights: {
                h1: 'E6 daily note / quick inbox: template variables, directory conventions, exclusive create without overwrite',
                h2: 'E1 clipboard clip + E2 PDF annotations and excerpts: source metadata, text-layer annotations, excerpt insertion',
                h3: 'E3 image OCR (MVP): local clipboard screenshot recognition, insert/copy, first-use English language pack download',
                h4: 'HTML/PDF usage guides; first/second-layer capabilities: print, self-contained HTML, layouts, EPUB, slides, file associations'
            },
            features: {
                f1: 'Daily note / quick inbox entries in Tools menu and command palette; optional features default off',
                f2: 'Clip to new note / insert into current note; PDF highlights, annotation list, notes and excerpts',
                f3: 'Image OCR: recognize and insert or copy; recognition runs locally in worker/wasm and never uploads images',
                f4: 'File → Print/Print Preview; export self-contained HTML/EPUB/slides; View → Layout Configurations; open associated files by double-click'
            },
            improvements: {
                i1: 'HTML/PDF usage guides with navigation, covering all features, configuration matrix and interactions',
                i2: 'Full-width preview with on-demand scrollbar; fixed empty unindented === tabs and right sidebar gap',
                i3: '108 IPC channels / 18 groups; preload whitelist send 74 + receive 28; all size budgets pass',
                i4: 'Workspace layouts: built-in writing/research/project plus custom profile save/apply/delete'
            },
            fixes: {
                x1: 'Removed the fixed preview right gutter and the duplicate 40px gap between scrollbar and right sidebar',
                x2: 'Fixed empty tab panels and content falling outside tabs for unindented === blocks'
            }
        },
        v151: {
            title: '1.5.1 Local Knowledge Base Foundation',
            highlights: {
                h1: 'A5 document properties + main-process workspace index: title/tags/Wiki links/excerpt/attachments',
                h2: 'B1 wiki links and backlinks: Ctrl/Cmd+Click, ambiguity picker, missing-page creation',
                h3: 'B4/B5: link checks and rename updates; attachment audit, Recycle Bin cleanup, attachment rename',
                h4: 'E10 wiki link hover; B2 full-text search continues to use on-demand A2 search'
            },
            features: {
                f1: 'Document properties panel with front matter editing and body/BOM/CRLF preservation',
                f2: 'Tag index, link checks, backlinks, wiki link click/create',
                f3: 'Attachment manager: orphan audit, batch move to Recycle Bin, transactional rename',
                f4: 'Wiki link hover: title/path/excerpt/backlink count'
            },
            improvements: {
                i1: 'Workspace index cached in main process with 5s TTL and explicit refresh',
                i2: 'Rename link updates preserve source encoding and BOM (GBK/UTF-16 safe)',
                i3: 'A2 search adds elapsedMs metric and slow-search logging',
                i4: '103 IPC channels / 17 groups; preload whitelist send 69 + receive 28'
            },
            fixes: {
                x1: 'Front matter saves no longer damage body, BOM, or CRLF',
                x2: 'Index/attachment operations enforce workspace, path, and symlink boundaries'
            }
        },
        v150: {
            title: '1.5.0 Scroll Sync and Security Engineering',
            highlights: {
                h1: 'Editor-to-preview scroll sync follows input and scrolling',
                h2: 'Native dialogs replaced: close confirm, messages, alerts and unified buttons',
                h3: 'On-demand first screen and preview: i18n split, KaTeX/hljs lazy loading',
                h4: 'Security and engineering depth: app:// + 8 Fuses + full gates'
            },
            features: {
                f1: 'Editor-to-preview scroll sync (heading/paragraph/list/table anchors)',
                f2: 'In-app unsaved-changes close dialog (save and close / discard / cancel)',
                f3: 'In-app message confirmation service replacing 6 native prompts',
                f4: 'alert/prompt moved in-app; unified dialog button styles'
            },
            improvements: {
                i1: 'First-screen JS 487.5→321.9 KiB; dictionaries load per language',
                i2: 'Word import/export moved to workers; main-thread blocking greatly reduced',
                i3: 'Large-document staged degradation; KaTeX CSS / hljs on demand',
                i4: 'asar trimming + lazy loading of startup dependencies'
            },
            fixes: {
                x1: 'Cursor/new line no longer hidden by the status bar when the page is full',
                x2: 'Fixed empty theme list on first open and other first-open issues'
            }
        },
        v139: {
            title: '1.3.9 Structural Governance and Engineering Optimization',
            highlights: {
                h1: 'Electron locales 55→2, installer significantly slimmer',
                h2: 'Broader E2E coverage and better startup stability',
                h3: 'Bilingual dictionary gaps closed and BaseDialog accessibility'
            },
            features: {
                f1: 'Unsaved-changes confirmation on close/exit (save and close / discard / cancel)',
                f2: 'Auto-save off by default; existing configs migrated',
                f3: 'HTML viewer navigation and path switching fixed'
            },
            improvements: {
                i1: 'Setup 109.98 MiB / portable 99.83 MiB (locales 55→2)',
                i2: 'Startup performance baseline (dev/packaged preview-ready)',
                i3: 'CI bundle budget; E2E startup restore/settings persistence/packaged launch',
                i4: 'Bilingual dictionary gaps closed; hardcoded strings removed'
            },
            fixes: {
                x1: 'HTML viewer top navigation no longer disappears after navigation; path updates',
                x2: 'Intermittent missing preload in E2E traced to an upstream Electron race'
            }
        },
        v135: {
            title: '1.3.5 Jyshare Common Tools Plugins',
            highlights: {
                h1: 'Integrated 18 offline tools from the Jyshare tool site',
                h2: 'Five categories: codec / convert / text / format / misc',
                h3: 'Zero third-party dependencies, fully offline'
            },
            features: {
                f1: 'Codec: Base64 / URL / HTML entities / Unicode / image to Base64',
                f2: 'Convert: color / unit / RMB uppercase / timestamp / base',
                f3: 'Text: traditional-simplified / pinyin / word count / text diff',
                f4: 'Format & parse: JSON tool / XML formatter / regex tester',
                f5: 'Misc: random generator / calculator'
            },
            improvements: {
                i1: 'Plugin tools 19 → 37, all lazy-loaded on demand',
                i2: '154 new unit test cases'
            },
            fixes: {
                x1: 'Fixed the CMYK-to-RGB calculation flaw of the original site',
                x2: 'Fixed the JSON unescape flaw of the original site'
            }
        },
        v130: {
            title: '1.3.0 Comprehensive Governance',
            highlights: {
                h1: 'P0 security attack-chain closure: preview sanitization + IPC validation + path guard',
                h2: 'Internationalization (i18n): full Chinese-English coverage',
                h3: 'Single-hop local preview rendering with major performance gains',
                h4: 'All quality gates green: type checks / ESLint / audit with 0 issues'
            },
            features: {
                f1: 'Added IPC authorization and Path Guard path protection',
                f2: 'Added CSP and navigation boundary security hardening',
                f3: 'Added the i18n dictionary (12 bilingual namespaces)'
            },
            improvements: {
                i1: 'Preview rendering IPC hops 4→0; inline code highlighting ~124× faster',
                i2: 'Directory tree fs.watch incremental rescan (single-file changes 94.8% faster)',
                i3: 'Installer size 233MB→~110MB',
                i4: 'IPC channels unified 123→86 with consistent naming; 10,403 dead lines removed'
            },
            fixes: {
                x1: 'Fixed inverted auto-save toggle and ineffective interval',
                x2: 'Fixed missing file encoding detection causing GBK overwrite corruption'
            }
        },
        v122: {
            title: 'Major Electron 43 upgrade',
            highlights: {
                h1: 'Electron 38 → 43, jumping five major versions',
                h2: 'Upgraded 40+ dependencies to the latest versions',
                h3: 'Fixed 78 TypeScript type errors',
                h4: 'Fixed 3 XSS security risks'
            },
            features: {
                f1: 'Added the "Update log" dialog with dependency upgrade details',
                f2: 'Added Monaco Editor and markdown-it versions to the About page',
                f3: 'Release notes submenu to browse notes for each version'
            },
            improvements: {
                i1: 'markdown-it 14 → 15: adapted to highlight option API changes',
                i2: 'monaco-editor 0.55 → 0.56: adapted to hover type changes',
                i3: 'vue-tsc 2 → 3: disabled noUnusedLocals',
                i4: 'vitest 3 → 4: fixed Node.js 24 compatibility',
                i5: 'electron-store 8 → 11, electron-builder 24 → 26'
            },
            fixes: {
                x1: 'Fixed empty electron/chrome versions in generate-version-config.js when running under Node.js',
                x2: 'Fixed XSS security risks in ShowQuickLinkSettingDialog.ts',
                x3: 'Fixed crypto API type safety issues in encrypt_decrypt.ts',
                x4: 'Fixed handleClose lifecycle bug in MermaidEditDialog.vue'
            }
        },
        v121: {
            title: 'Full codebase scan and optimization',
            highlights: {
                h1: 'Ran a full code scan and optimization with Deepseek',
                h2: 'Fixed multiple bugs and defects',
                h3: 'Overall code quality improved'
            },
            improvements: {
                i1: 'Full codebase scan and optimization',
                i2: 'Fixed compile-time and runtime defects'
            }
        },
        v120: {
            title: 'Icon and theme improvements',
            highlights: {
                h1: 'App icons fully updated',
                h2: 'Added four new themes',
                h3: 'Theme changes apply immediately after selection'
            },
            features: {
                f1: 'Added four theme styles',
                f2: 'Redesigned app icons'
            },
            improvements: {
                i1: 'Theme changes take effect immediately without restart',
                i2: 'Removed unused files and cleaned up the project'
            }
        },
        v115: {
            title: 'Major dialog architecture update',
            highlights: {
                h1: 'Converted some dialogs from JSDOM to Vue',
                h2: 'Project architecture changes',
                h3: 'IPC communication improvements'
            },
            features: {
                f1: 'Migrated dialog components from JSDOM to Vue components',
                f2: 'Refactored message handling logic'
            },
            improvements: {
                i1: 'Improved the IPC communication mechanism',
                i2: 'Updated dialog components',
                i3: 'Overall project architecture changes'
            }
        },
        v113: {
            title: 'Process and file fixes',
            highlights: {
                h1: 'Fixed lingering processes',
                h2: 'Fixed files not loading the latest content when reopened',
                h3: 'Fixed file content not updating after reloading from disk'
            },
            fixes: {
                x1: 'Fixed lingering processes after the app closes',
                x2: 'Fixed files not loading the latest content when reopened',
                x3: 'Fixed file content not updating after reloading from disk'
            }
        },
        v112: {
            title: 'Project cleanup and UI style updates',
            highlights: {
                h1: 'Cleaned up the project and removed redundant files and functions',
                h2: 'Updated theme UI style standards',
                h3: 'Added modal/non-modal window control'
            },
            improvements: {
                i1: 'Removed redundant files and functions',
                i2: 'Standardized theme UI styles',
                i3: 'Modal/non-modal window control'
            }
        },
        v111: {
            title: 'Theme settings and file memory',
            highlights: {
                h1: 'App theme and editor theme can now be configured separately',
                h2: 'Added file and directory memory',
                h3: 'Editor area adapts to theme changes'
            },
            features: {
                f1: 'Separate app theme and editor theme settings',
                f2: 'Automatically reopen the last file and directory on launch'
            },
            improvements: {
                i1: 'Editor area adapts to theme changes'
            }
        },
        v110: {
            title: 'File import and export',
            highlights: {
                h1: 'Added the basic framework for file import and export',
                h2: 'Fixed compile and packaging errors'
            },
            features: {
                f1: 'Basic framework for file import and export'
            },
            fixes: {
                x1: 'Fixed compile and packaging errors'
            }
        },
        v102: {
            title: 'Icon and text adjustments',
            highlights: {
                h1: 'Adjusted text icon sizes',
                h2: 'UI detail refinements'
            },
            improvements: {
                i1: 'Adjusted text icon sizes'
            }
        },
        v101: {
            title: 'Icon design and quick links',
            highlights: {
                h1: 'Added icon design',
                h2: 'Installer can specify a custom install directory',
                h3: 'Added support for custom quick links'
            },
            features: {
                f1: 'App icon design',
                f2: 'Installer supports a custom install directory',
                f3: 'Custom quick links'
            }
        },
        v100: {
            title: 'Initial release',
            highlights: {
                h1: 'The first version of BaiZe Notes',
                h2: 'A Markdown note-taking app built with Electron + Vue + TypeScript'
            },
            features: {
                f1: 'Markdown editing and preview',
                f2: 'File manager',
                f3: 'Theme system',
                f4: 'Plugin system'
            }
        }
    }
}
