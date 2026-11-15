/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本为 CommonJS 构建脚本（package.json 无 type:module，由 node 直接运行），保持 require 写法 */
const fs = require('fs')
const path = require('path')
const packageJson = require('../package.json')

const ROOT = path.join(__dirname, '..')

/**
 * ET-14：优先读取「实际安装版本」（node_modules/<pkg>/package.json），
 * 而不是 package.json 里的 semver 范围字符串，避免 About 对话框/README 漂移。
 * 兼容若干包通过 exports 限制 package.json 子路径（require('<pkg>/package.json') 会失败）的情况，逐级兜底。
 */
function readInstalledVersion(pkgName) {
    // 1) 常规 require 子路径（多数包可用）
    try {
        const pkg = require(`${pkgName}/package.json`)
        if (pkg && pkg.version) return pkg.version
    } catch {
        // ignore：部分包 exports 未暴露 package.json
    }
    // 2) 直接从 node_modules 根目录读取（npm 会提升直接依赖）
    try {
        const manifestPath = path.join(ROOT, 'node_modules', pkgName, 'package.json')
        const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (pkg && pkg.version) return pkg.version
    } catch {
        // ignore
    }
    // 3) 兜底：node_modules 未安装时使用 package.json 声明范围（仅去符号，不保证是实际安装版本）
    const declared = packageJson.dependencies?.[pkgName] || packageJson.devDependencies?.[pkgName]
    return String(declared || '').replace(/[\^~>=<\s]/g, '')
}

// CMP-22 说明：
// 2. chromeVersion 构建时不可得（Electron npm 包不含 Chromium 版本映射），不再写入 version.json，
//    由主进程运行时从 process.versions.chrome 兜底填充（见 src/main/utils/utils.ts 'app:get-version' 处理器）
// 3. nodeVersion 不再取构建机 process.versions.node（会误导为 Electron 内置 Node 版本），
//    同样由主进程运行时从 process.versions.node（Electron 内置 Node）兜底填充
// 消费方 utils.ts 对缺失键（undefined）同样走运行时兜底，因此移除上述两键不破坏 JSON 消费
const versionConfig = {
    appVersion: packageJson.version,
    electronVersion: readInstalledVersion('electron'),
    vueVersion: readInstalledVersion('vue'),
    viteVersion: readInstalledVersion('vite'),
    typescriptVersion: readInstalledVersion('typescript'),
    monacoEditorVersion: readInstalledVersion('monaco-editor'),
    markdownItVersion: readInstalledVersion('markdown-it')
}

const configDir = path.join(ROOT, 'resources', 'config')
const versionFilePath = path.join(configDir, 'version.json')

if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
}

fs.writeFileSync(versionFilePath, JSON.stringify(versionConfig, null, 2), 'utf-8')
console.log(`Version config generated at: ${versionFilePath}`)
console.log(JSON.stringify(versionConfig, null, 2))
