# 安全策略（Security Policy）

白泽笔记（BaiZeNotes）桌面应用基于 Electron + Vue 3 构建，安全边界覆盖主进程、preload 桥、
渲染进程与打包/发布链路。本文件说明**支持的安全版本**、**漏洞报告渠道**、**响应时限**与
**报告范围**，供安全研究者、用户与维护者共同遵守。

> **维护者待办（必须替换）**：下方报告邮箱 `security@example.com` 为**占位地址**，仓库维护者
> 需在正式发布前替换为真实可用的安全邮箱，并确认 GitHub 仓库已开启「私密漏洞报告」
> （Settings → Code security → Private vulnerability reporting）。在替换完成前，请优先使用
> GitHub Security Advisories 渠道（无需邮箱即可私密提交）。

## 一、支持的版本

仅最新发布版本（含对应发布分支上的最新补丁版本）接收安全修复；更早版本请先升级再报告。

| 版本                | 支持状态    | 说明                                     |
| ------------------- | ----------- | ---------------------------------------- |
| 1.4.x（当前发布线） | ✅ 支持     | 接收安全修复与安全公告                   |
| 1.3.x 及更早        | ❌ 不再支持 | 建议升级到最新版本；不受理旧版本安全报告 |

> 版本号口径以 `package.json` 的 `version` 与 GitHub Releases 最新 tag 为准。

## 二、漏洞报告渠道

**请勿通过公开 Issue、Pull Request、讨论区或社交媒体披露未修复的安全漏洞。**

推荐按优先级使用以下渠道：

1. **GitHub 私密漏洞报告（首选）**：在仓库页面选择
   `Security` → `Advisories` → `Report a vulnerability`，仅维护者可见。
2. **安全邮箱（维护者替换后启用）**：`security@example.com`（占位地址，见文件顶部待办）。
   邮件标题建议使用 `[SECURITY] BaiZeNotes: <一句话摘要>`。

报告时建议附上（有则提供，没有不影响受理）：

- 受影响的版本 / 提交号（`git rev-parse HEAD`）与操作系统（Windows 10/11 等）；
- 漏洞类型与影响（如任意文件读取、XSS、IPC 越权、更新链路、供应链）；
- 复现步骤或最小 PoC（脚本、恶意笔记、IPC 载荷等），以及预期/实际行为；
- 是否需要用户交互、是否可持久化、是否已公开披露计划。

## 三、响应时限（尽力而为，非 SLA）

| 阶段                        | 目标时限                                             |
| --------------------------- | ---------------------------------------------------- |
| 确认收到报告                | 7 个工作日内                                         |
| 初始评估（严重度/范围）     | 14 个工作日内                                        |
| 高危/严重漏洞修复或缓解措施 | 30 个工作日内（复杂问题另行同步）                    |
| 中低危问题修复              | 按发布节奏排期，与报告者沟通                         |
| 修复版本发布后致谢          | 发布说明 / GitHub Security Advisory 中致谢（可匿名） |

若 14 个工作日内未收到回复，可通过同一渠道再次提醒；本项目为个人维护的开源项目，
响应能力有限，但所有有效报告都会被评估与记录。

## 四、报告范围

**在范围内（In scope）**

- Electron 主进程安全边界：`webPreferences`（`contextIsolation`/`sandbox`/`nodeIntegration`）、
  导航与新窗口拦截、权限处理器、窗口/会话隔离；
- preload 桥与 IPC：通道白名单、发送方校验、payload 校验、Path Guard（越界读写/删除/定位）、
  `shell` 打开能力（外链/可执行文件/资源管理器）；
- 渲染层注入链：Markdown/HTML 预览 XSS 链（markdown-it → DOMPurify → v-html）、Mermaid/
  PlantUML/KaTeX、HTML 查看器 iframe sandbox、远程资源策略；
- 文件与数据安全：工作区受信根、最近打开/快速链接、配置写入、备份/日志落点中的敏感信息；
- 打包与更新链路：Electron Fuses、asar 完整性、更新源校验与产物发布流程（不含代码签名
  证书本身的采购/保管问题）；
- 仓库与 CI 安全：发布流水线权限、依赖审计门禁、密钥/令牌泄露（含历史提交）。

**不在范围内（Out of scope）**

- 需要本机管理员/物理接触权限才能利用的问题（如已提权的任意代码执行、直接修改安装目录
  二进制或 `app.asar`）；
- 仅由用户主动打开明显不可信的可执行文件、或将工作区指向自己敏感目录导致的自我风险
  （应用已提供确认框与禁止危险根）；
- 第三方服务/站点自身漏洞（如在线网页窗口打开的外部网站、GitHub Releases 平台、npm 镜像）；
- 社会工程、钓鱼、垃圾信息、UI 文案/错别字、无安全影响的性能或体验问题；
- 依赖库漏洞：欢迎报告，但请同时说明在白泽笔记中的可达路径与影响；上游修复后由维护者
  通过 Dependabot/升级批次跟进；
- 代码签名缺失、SmartScreen 提示等已知发布流程问题（已列入治理排期）。

## 五、安全基线摘要（供报告者参考）

应用当前已落地的关键缓解措施（详细证据见 `docs/reports/md/01-检查与扫描/` 与
`out/tool-results/scan-security.md`）：

- 所有窗口 `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false`；
- 主导航/新窗口全拦截，外链仅允许 http/https；
- preload 仅暴露受限 `ipcRenderer` 与最小 `window.api`，不暴露 `process.env`/`webFrame`/`webUtils`；
- IPC 统一发送方校验 + payload 校验；文件类通道有 Path Guard（受信根 + realpath 防符号链接）
  与文本扩展名白名单；
- 权限请求默认拒绝，仅主窗口本地受信页面按需放行最小权限；
- 生产 CSP 已移除 `'unsafe-eval'` 与 localhost 放行；
- 打包启用 Electron Fuses（`runAsNode: false`、`onlyLoadAppFromAsar`、asar 完整性校验）。

## 六、披露约定

- 在修复版本发布前，请勿公开漏洞细节或 PoC；
- 维护者会在修复发布后按报告者意愿在发布说明/Advisory 中致谢；
- 若漏洞已被第三方公开披露，请立即告知，维护者将优先评估缓解措施。
