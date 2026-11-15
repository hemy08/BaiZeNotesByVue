#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本为 CommonJS 构建脚本（package.json 无 type:module，由 node 直接运行），保持 require 写法 */
/**
 * 构建目录完整性级别预检（Windows 专用，跨平台安全 no-op）
 *
 * 背景（2026-11-15 NSIS 打包故障根因）：
 *   某些受管/沙箱工作区会给工作区根目录设置 **Low 完整性级别**（Mandatory Label），
 *   子目录与新生成的文件默认继承 Low。从 Low 完整性目录启动的 electron-builder
 *   NSIS 卸载器生成器会以低完整性运行，无法写入 Medium 完整性的 %TEMP%，
 *   makensis 生成的生成器进程会以 exit code 2 失败，并弹出
 *   "NSIS Error: Error writing temporary file. Make sure your temp folder is valid."
 *
 * 处理：
 *   在 electron-builder 运行前，确保输出目录（dist/out）的完整性级别为 Medium
 *   （幂等；非 Windows 或权限不足时仅打印告警、不阻塞构建）。
 *
 * 用法：node build/prepare-build-dirs.js（由 package.json 的 build:* 脚本在 electron-builder 前调用）
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const OUTPUT_DIRS = ['dist', 'out']

/** 读取路径的完整性级别（Low/Medium/High 等），失败返回 null */
function getIntegrityLabel(targetPath) {
    try {
        const info = execFileSync('icacls', [targetPath], { encoding: 'utf8', windowsHide: true })
        const matched = info.match(
            /Mandatory Label\\(Low|Medium|High|System|Untrusted) Mandatory Level/i
        )
        return matched ? matched[1] : 'Medium' // 无显式标签 = 默认 Medium
    } catch {
        // icacls 不可用/无权限读取标签：返回 null 由调用方降级为告警
        return null
    }
}

function main() {
    if (process.platform !== 'win32') {
        return // 非 Windows 无此机制
    }

    let fixed = 0
    for (const dirName of OUTPUT_DIRS) {
        const dirPath = path.join(projectRoot, dirName)
        try {
            fs.mkdirSync(dirPath, { recursive: true })
        } catch (error) {
            console.warn(`[prepare-build-dirs] 无法创建 ${dirName}/：${error.message}`)
            continue
        }

        const label = getIntegrityLabel(dirPath)
        if (label == null) {
            console.warn(
                `[prepare-build-dirs] 无法读取 ${dirName}/ 的完整性级别，跳过（不阻塞构建）`
            )
            continue
        }
        if (label === 'Medium') {
            continue
        }

        try {
            execFileSync('icacls', [dirPath, '/setintegritylevel', 'Medium'], {
                encoding: 'utf8',
                windowsHide: true
            })
            console.log(
                `[prepare-build-dirs] ${dirName}/ 完整性级别 ${label} → Medium（修复 NSIS「Error writing temporary file」打包失败）`
            )
            fixed++
        } catch (error) {
            console.warn(
                `[prepare-build-dirs] 提升 ${dirName}/ 完整性级别失败（不阻塞构建）：${error.message}`
            )
        }
    }

    if (fixed === 0) {
        console.log('[prepare-build-dirs] 构建目录完整性级别正常（Medium）')
    }
}

main()
