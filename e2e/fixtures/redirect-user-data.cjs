/* eslint-disable @typescript-eslint/no-require-imports -- Electron `-r` 预加载夹具运行于 CommonJS 主进程环境，必须使用 require('electron') */
/**
 * E2E 主进程预加载夹具（仅测试使用，不进入产品产物）。
 *
 * 注入方式：Playwright `_electron.launch({ args: ['-r', 本文件, MAIN_ENTRY] })`。
 * Electron 会在执行应用主脚本之前加载本文件，此时调用 `app.setPath('userData', ...)`
 * 把 Electron userData（fileState.json / 渲染层裸 JSON 配置 / 缓存 / 单实例锁）重定向到
 * 临时目录，用例结束后整体删除。
 *
 * 注意：这里**不重定向 home**。实测在 ready 之前 `app.setPath('home', ...)` 会导致约
 * 40%~60% 的启动出现 preload 未注入（window.api undefined），属 Electron 内部路径服务
 * 时序问题；因此 home 配置目录（~/.baizenotes/config）由用例侧 ConfigSandbox
 * 做备份/清空/恢复（见 e2e/helpers/electron-profile.ts）。
 */
const { app } = require('electron')
const fs = require('node:fs')

const userData = process.env.BAIZE_E2E_USER_DATA

if (typeof userData === 'string' && userData.length > 0) {
    fs.mkdirSync(userData, { recursive: true })
    app.setPath('userData', userData)
}
