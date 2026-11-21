/**
 * 渲染层「浏览器原生反馈」回归门禁（alert/prompt 应用内化批次）。
 *
 * 背景：`src/renderer/src` 曾存在 23 处浏览器原生 `alert()` 与 1 处 `window.prompt()`，
 * 已全部替换为应用内反馈（MessageDialog / Monaco 原生跳行输入）。本用例静态扫描
 * 渲染层源码（`.ts` / `.vue`，注释先剔除），防止后续改动重新引入原生阻塞式弹窗。
 *
 * 口径说明：
 * - 只扫 `src/renderer/src/**`（主进程/预加载/测试不在本门禁范围）；
 * - 先剔除块注释与行注释再匹配，避免注释中的历史说明（如「原 alert(...) 已移除」）误报；
 * - 匹配 `alert(` 与 `window.prompt(` 调用；模板 `role="alert"` / 字符串中的示例不命中。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const RENDERER_SRC = join(ROOT, 'src/renderer/src')

/** 递归收集渲染层源码文件（.ts / .vue） */
function listRendererSourceFiles(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            listRendererSourceFiles(fullPath, files)
        } else if (/\.(ts|vue)$/.test(entry.name)) {
            files.push(fullPath)
        }
    }
    return files
}

/** 剔除注释，避免注释中的历史/示例代码触发误报 */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** 返回命中的原生反馈调用描述（空数组表示通过） */
function findNativeFeedbackCalls(source: string): string[] {
    const code = stripComments(source)
    const violations: string[] = []
    if (/\balert\s*\(/.test(code)) {
        violations.push('alert()')
    }
    if (/window\.prompt\s*\(/.test(code)) {
        violations.push('window.prompt()')
    }
    return violations
}

describe('渲染层禁止浏览器原生 alert()/window.prompt()', () => {
    it('扫描器自检：能识别违例、跳过注释与静态属性', () => {
        expect(findNativeFeedbackCalls("alert('x')")).toEqual(['alert()'])
        expect(findNativeFeedbackCalls("window.alert('x')")).toEqual(['alert()'])
        expect(findNativeFeedbackCalls("window.prompt('x')")).toEqual(['window.prompt()'])
        expect(findNativeFeedbackCalls("// alert('x')\nconst ok = 1")).toEqual([])
        expect(findNativeFeedbackCalls("/* window.prompt('x') */\nconst ok = 1")).toEqual([])
        expect(findNativeFeedbackCalls('<div role="alert">提示</div>')).toEqual([])
    })

    it('渲染层源码不存在原生 alert()/window.prompt() 调用', () => {
        const violations: string[] = []
        for (const file of listRendererSourceFiles(RENDERER_SRC)) {
            const source = readFileSync(file, 'utf-8')
            for (const call of findNativeFeedbackCalls(source)) {
                violations.push(`${relative(ROOT, file)}: ${call}`)
            }
        }
        expect(violations).toEqual([])
    })
})
