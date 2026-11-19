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
 * 结构优化第 5 批 5.3（L3）：并入原 build/build-win.ps1 的「NSIS 临时目录重定向」能力。
 *   某些受限/沙箱宿主即使修正了完整性级别，仍无法使用系统默认 %TEMP%；
 *   原 PowerShell 脚本的等价能力现由本脚本的 --exec 子命令承接（先预检目录，再以工作区内
 *   out/tmp/build-temp 作为 TEMP/TMP/TMPDIR 执行构建命令），因而删除 build-win.ps1。
 *
 * 用法：
 *   node build/prepare-build-dirs.js                     仅预检（package.json 的 build:* 脚本在 electron-builder 前调用）
 *   node build/prepare-build-dirs.js --exec "<命令>"     预检 + 以工作区临时目录执行构建命令
 *     例：node build/prepare-build-dirs.js --exec "npm run build:win:nsis"
 *         （等价于已删除的 build-win.ps1 -Target nsis；portable/all 同理）
 */
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const OUTPUT_DIRS = ['dist', 'out']
/** NSIS/makensis 临时目录：放在工作区内，规避受限宿主的系统 %TEMP% 不可写问题 */
const BUILD_TEMP_DIR = path.join(projectRoot, 'out', 'tmp', 'build-temp')

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

/** 创建构建临时目录并返回路径（跨平台可用；失败时回退系统 TEMP） */
function prepareBuildTemp() {
    try {
        fs.mkdirSync(BUILD_TEMP_DIR, { recursive: true })
        return BUILD_TEMP_DIR
    } catch (error) {
        console.warn(
            `[prepare-build-dirs] 无法创建 out/tmp/build-temp（回退系统 TEMP）：${error.message}`
        )
        return null
    }
}

/** 完整性级别预检（仅 Windows 生效） */
function prepareIntegrityLevels() {
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

/** --exec：以工作区临时目录为 TEMP/TMP/TMPDIR 执行给定命令 */
function execWithBuildTemp(command) {
    const tempDir = prepareBuildTemp()
    if (!tempDir) {
        // 创建失败仍执行命令（使用系统 TEMP，保持与原 PowerShell 脚本不同的降级行为：
        // 原脚本在创建失败时直接失败，这里选择继续并告警，避免阻断普通构建）
        console.warn('[prepare-build-dirs] 构建临时目录不可用，继续使用系统 TEMP 执行')
    }
    const env = { ...process.env }
    if (tempDir) {
        env.TEMP = tempDir
        env.TMP = tempDir
        env.TMPDIR = tempDir
    }
    console.log(`[prepare-build-dirs] 执行：${command}`)
    console.log(`[prepare-build-dirs] TEMP=${env.TEMP ?? process.env.TEMP}`)
    const result = spawnSync(command, {
        cwd: projectRoot,
        env,
        stdio: 'inherit',
        shell: true,
        windowsHide: true
    })
    if (result.error) {
        console.error(`[prepare-build-dirs] 命令启动失败：${result.error.message}`)
        process.exit(1)
    }
    process.exit(result.status ?? 1)
}

function main() {
    const args = process.argv.slice(2)
    prepareIntegrityLevels()

    const execIndex = args.indexOf('--exec')
    if (execIndex === -1) {
        return
    }
    const command = args
        .slice(execIndex + 1)
        .join(' ')
        .trim()
    if (!command) {
        console.error(
            '[prepare-build-dirs] --exec 缺少命令；例：node build/prepare-build-dirs.js --exec "npm run build:win:nsis"'
        )
        process.exit(1)
    }
    execWithBuildTemp(command)
}

main()
