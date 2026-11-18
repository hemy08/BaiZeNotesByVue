# 自动更新源配置说明（resources/config/update.json）

> 对应发现：ARC-16 / FUN-10 / CMP-21 ｜ 实现：`src/main/utils/auto-updater.ts`
> 说明：JSON 文件不支持注释，故字段说明集中写在本文件中；示例见同目录 `update.json.example`。
>
> **默认更新源（2026-11-18，遗留清单 #8）**：`electron-builder.yml` 的 `publish` 与
> `dev-app-update.yml` 已指向本仓库 GitHub Releases 静态目录
> `https://github.com/hemy08/BaiZeNotesByVue/releases/latest/download`——发布时将
> `latest.yml` 与安装包作为 Release 资产上传即可启用检查更新；如需自建服务器，用
> `resources/config/update.json` 覆盖即可（无需重新打包）。

## 1. 用途与优先级

应用"帮助 → 检查更新"会按以下优先级解析更新源：

| 优先级  | 配置文件                                | 位置                                                                                             | 说明                                               |
| ------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1（高） | `resources/config/update.json`          | 打包后：`<安装目录>/resources/config/update.json`；开发：`<项目根>/resources/config/update.json` | 运行时配置，修改后无需重新打包（重新检查即可生效） |
| 2（低） | `app-update.yml` / `dev-app-update.yml` | 打包时由 electron-builder 按 `publish` 配置生成；开发模式读项目根 `dev-app-update.yml`           | 构建期回退源                                       |

- 两处均未配置，或 URL 仍为 `example.com` 占位地址时，"检查更新"会如实提示 **"未配置更新源"**，不会发起虚假请求（CMP-21）。
- `resources/config/update.json` 默认**不随包发布**（仓库只提供 `update.json.example`）；需要时按下文步骤创建。
- `electron-builder.yml` 的 `publish` 配置保持现状（构建期回退源），无需为使用 `update.json` 而修改。

## 2. 字段说明

| 字段       | 类型   | 必填 | 说明                                                                                                                     |
| ---------- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| `provider` | string | 是   | 更新服务器类型，**当前仅支持 `generic`**（自建静态文件服务器 / 任意直链目录）；其他值会被忽略并回退到 `app-update.yml`   |
| `url`      | string | 是   | 更新目录地址，必须是合法的 `http(s)://` URL；目录下需包含 `latest.yml` 与安装包文件（electron-builder 发布产物同名结构） |

## 3. 配置步骤

1. 复制同目录的 `update.json.example` 为 `update.json`：

    ```powershell
    Copy-Item resources/config/update.json.example resources/config/update.json
    ```

2. 编辑 `update.json`，把 `url` 换成真实更新目录，例如：

    ```json
    {
        "provider": "generic",
        "url": "https://updates.your-domain.com/baize-notes/"
    }
    ```

3. 打包发布：`resources/config` 目录会经 electron-builder 的 `extraResources`
   复制到安装包 `<安装目录>/resources/config/`，安装后即可被主进程读取。

## 4. 注意事项

- 更新目录需放置 electron-builder 生成的 `latest.yml` 与对应安装包（`build:win:all` 等命令产物），否则检查更新会失败并提示网络/服务器错误。
- 默认发行包使用 GitHub Releases 静态目录；上传 Release 资产时务必包含 `latest.yml`（electron-builder 自动生成）。
- 占位域名 `example.com` 会被视为"未配置"，便于自定义发行包保持诚实提示。
- 修改 `update.json` 后无需重新打包，重新执行"检查更新"即可读取最新配置。
- 开发模式联调：`src/main/utils/auto-updater.ts` 已设置 `forceDevUpdateConfig = true`，
  配置真实地址后即可在 `npm run dev` 下验证检查/下载流程。
