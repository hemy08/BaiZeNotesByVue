/**
 * 版本发布说明数据（结构优化第 2 批 2.1：随 ReleaseNotesDialog 从主进程迁移到渲染层）
 *
 * 数据来源：原 `src/main/dialogs/ShowReleaseNotesDialog.ts` 的 releaseNotes 常量，
 * 迁移时逐项保持版本号/日期/词条键分组不变，保证中文界面文案零变化。
 *
 * 说明：
 * - 仅数据 + 类型，不含 Vue 依赖；用户可见文案仍经共享词典 `dialogMain.releaseNotes.*`
 *   翻译（渲染层 `t()` 与主进程 `tMain()` 共用 src/shared/i18n，中英双语一致）；
 * - `key` 是词典分组前缀（complete key = `dialogMain.releaseNotes.<key>.<suffix>`），
 *   `highlights.h1` 等后缀与词典结构一一对应；
 * - 新增版本时同步：本文件、menu-help 的版本子菜单、menu-config 的版本发布子菜单、
 *   以及 dialogMain 词典（zh-CN / en-US）。
 */

/** 单个版本的发布说明条目 */
export interface ReleaseNoteEntry {
    /** 版本号（不含 v 前缀，与菜单版本号一致） */
    version: string
    /** 发布日期（展示用字符串） */
    date: string
    /** 词条键分组（完整键 = dialogMain.releaseNotes.<key>.<suffix>） */
    key: string
    /** 重大更新词条后缀（★ 列表） */
    highlightKeys: string[]
    /** 新功能词条后缀（可选） */
    featureKeys?: string[]
    /** 问题修复词条后缀（可选） */
    fixKeys?: string[]
    /** 优化改进词条后缀（可选） */
    improvementKeys?: string[]
    /** 技术栈版本行（可选，值为纯数据不翻译） */
    techStack?: { name: string; value: string }[]
}

/** 全部版本的发布说明（顺序即帮助菜单版本子菜单顺序，最新在前） */
export const RELEASE_NOTES: ReleaseNoteEntry[] = [
    {
        version: '1.5.5',
        date: '2026-11-27',
        key: 'v155',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3', 'highlights.h4'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3', 'features.f4'],
        improvementKeys: [
            'improvements.i1',
            'improvements.i2',
            'improvements.i3',
            'improvements.i4'
        ],
        fixKeys: ['fixes.x1', 'fixes.x2'],
        techStack: [
            { name: 'Electron', value: '43.8.12' },
            { name: 'Vue', value: '3.5.46' },
            { name: 'Vite', value: '8.3.8' },
            { name: 'TypeScript', value: '6.0.3' },
            { name: 'Monaco Editor', value: '0.57.0' },
            { name: 'markdown-it', value: '15.0.3' }
        ]
    },
    {
        version: '1.5.2',
        date: '2026-11-22',
        key: 'v152',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3', 'highlights.h4'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3', 'features.f4'],
        improvementKeys: [
            'improvements.i1',
            'improvements.i2',
            'improvements.i3',
            'improvements.i4'
        ],
        fixKeys: ['fixes.x1', 'fixes.x2'],
        techStack: [
            { name: 'Electron', value: '43.8.12' },
            { name: 'Vue', value: '3.5.46' },
            { name: 'Vite', value: '8.3.8' },
            { name: 'TypeScript', value: '6.0.3' },
            { name: 'Monaco Editor', value: '0.57.0' },
            { name: 'markdown-it', value: '15.0.3' }
        ]
    },
    {
        version: '1.5.1',
        date: '2026-11-22',
        key: 'v151',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3', 'highlights.h4'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3', 'features.f4'],
        improvementKeys: [
            'improvements.i1',
            'improvements.i2',
            'improvements.i3',
            'improvements.i4'
        ],
        fixKeys: ['fixes.x1', 'fixes.x2'],
        techStack: [
            { name: 'Electron', value: '43.8.12' },
            { name: 'Vue', value: '3.5.46' },
            { name: 'Vite', value: '8.3.8' },
            { name: 'TypeScript', value: '6.0.3' },
            { name: 'Monaco Editor', value: '0.57.0' },
            { name: 'markdown-it', value: '15.0.3' }
        ]
    },
    {
        version: '1.5.0',
        date: '2026-11-21',
        key: 'v150',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3', 'highlights.h4'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3', 'features.f4'],
        improvementKeys: [
            'improvements.i1',
            'improvements.i2',
            'improvements.i3',
            'improvements.i4'
        ],
        fixKeys: ['fixes.x1', 'fixes.x2'],
        techStack: [
            { name: 'Electron', value: '43.8.12' },
            { name: 'Vue', value: '3.5.46' },
            { name: 'Vite', value: '8.3.8' },
            { name: 'TypeScript', value: '6.0.3' },
            { name: 'Monaco Editor', value: '0.57.0' },
            { name: 'markdown-it', value: '15.0.3' }
        ]
    },
    {
        version: '1.3.9',
        date: '2026-11-20',
        key: 'v139',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3'],
        improvementKeys: [
            'improvements.i1',
            'improvements.i2',
            'improvements.i3',
            'improvements.i4'
        ],
        fixKeys: ['fixes.x1', 'fixes.x2']
    },
    {
        version: '1.3.5',
        date: '2026-11-15',
        key: 'v135',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3', 'features.f4', 'features.f5'],
        improvementKeys: ['improvements.i1', 'improvements.i2'],
        fixKeys: ['fixes.x1', 'fixes.x2'],
        techStack: [
            { name: 'Electron', value: '43.8.10' },
            { name: 'Vue', value: '3.5.45' },
            { name: 'Vite', value: '8.3.8' },
            { name: 'TypeScript', value: '6.0.3' },
            { name: 'Monaco Editor', value: '0.57.0' },
            { name: 'markdown-it', value: '15.0.3' }
        ]
    },
    {
        version: '1.3.0',
        date: '2026-11-15',
        key: 'v130',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3', 'highlights.h4'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3'],
        improvementKeys: [
            'improvements.i1',
            'improvements.i2',
            'improvements.i3',
            'improvements.i4'
        ],
        fixKeys: ['fixes.x1', 'fixes.x2'],
        techStack: [
            { name: 'Electron', value: '43.8.10' },
            { name: 'Vue', value: '3.5.45' },
            { name: 'Vite', value: '8.3.8' },
            { name: 'TypeScript', value: '6.0.3' },
            { name: 'Monaco Editor', value: '0.57.0' },
            { name: 'markdown-it', value: '15.0.3' }
        ]
    },
    {
        version: '1.2.2',
        date: '2026-08-22',
        key: 'v122',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3', 'highlights.h4'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3'],
        improvementKeys: [
            'improvements.i1',
            'improvements.i2',
            'improvements.i3',
            'improvements.i4',
            'improvements.i5'
        ],
        fixKeys: ['fixes.x1', 'fixes.x2', 'fixes.x3', 'fixes.x4'],
        techStack: [
            { name: 'Electron', value: '43.4.1' },
            { name: 'Vue', value: '3.5.41' },
            { name: 'Vite', value: '8.2.2' },
            { name: 'TypeScript', value: '6.0.2' },
            { name: 'Monaco Editor', value: '0.56.0' },
            { name: 'markdown-it', value: '15.0.0' }
        ]
    },
    {
        version: '1.2.1',
        date: '2026-08-16',
        key: 'v121',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        improvementKeys: ['improvements.i1', 'improvements.i2']
    },
    {
        version: '1.2.0',
        date: '2026-05-10',
        key: 'v120',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2'],
        improvementKeys: ['improvements.i1', 'improvements.i2']
    },
    {
        version: '1.1.5',
        date: '2026-05-06',
        key: 'v115',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2'],
        improvementKeys: ['improvements.i1', 'improvements.i2', 'improvements.i3']
    },
    {
        version: '1.1.3',
        date: '2026-05-02',
        key: 'v113',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        fixKeys: ['fixes.x1', 'fixes.x2', 'fixes.x3']
    },
    {
        version: '1.1.2',
        date: '2026-04-26',
        key: 'v112',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        improvementKeys: ['improvements.i1', 'improvements.i2', 'improvements.i3']
    },
    {
        version: '1.1.1',
        date: '2026-04-05',
        key: 'v111',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2'],
        improvementKeys: ['improvements.i1']
    },
    {
        version: '1.1.0',
        date: '2026-03-30',
        key: 'v110',
        highlightKeys: ['highlights.h1', 'highlights.h2'],
        featureKeys: ['features.f1'],
        fixKeys: ['fixes.x1']
    },
    {
        version: '1.0.2',
        date: '2026-03-15',
        key: 'v102',
        highlightKeys: ['highlights.h1', 'highlights.h2'],
        improvementKeys: ['improvements.i1']
    },
    {
        version: '1.0.1',
        date: '2026-03-08',
        key: 'v101',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3']
    },
    {
        version: '1.0.0',
        date: '2025-09-13',
        key: 'v100',
        highlightKeys: ['highlights.h1', 'highlights.h2'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3', 'features.f4']
    }
]

/** 按版本号查找发布说明（未找到返回 undefined，对话框按 notFound 词条降级展示） */
export function findReleaseNote(version: string): ReleaseNoteEntry | undefined {
    return RELEASE_NOTES.find((entry) => entry.version === version)
}
