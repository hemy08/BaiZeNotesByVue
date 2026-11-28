# 鐧芥辰绗旇 - LLM Wiki 闆嗘垚瀹炴柦璁″垝锛堝畬鏁寸増锛?
> 鏇存柊浜?2026-11-28锝滈€傜敤鐗堟湰鍩虹嚎锛歷1.5.6锛堝紑鍙戜腑锛夛綔鏂囨。绫诲瀷锛氬疄鏂借鍒?
## 1. 鑳屾櫙涓庣洰鏍?
**LLM Wiki 妯″紡**锛圞arpathy 2026 骞?4 鏈堟彁鍑猴級鏄竴绉嶇煡璇嗙鐞嗘柊鑼冨紡锛氭妸鍘熷璧勬枡瀛樻斁浜?`raw/` 鐩綍骞朵笉鍙彉 鈫?LLM 鎸佺画灏嗚祫鏂欌€滅紪璇戔€濇垚鍙浜虹被涓?AI 鍏卞悓娑堣垂鐨勭粨鏋勫寲鐭ヨ瘑搴擄紙`wiki/` + `schema.md` + `CLAUDE.md`锛夈€傚叾鏍稿績浠峰€兼槸**鈥滅紪璇戞€佺煡璇嗏€?*鑰岄潪鈥滃師濮嬭祫鏂欌€濈殑鏁ｄ贡鍫嗙Н銆?
**鐧芥辰绗旇褰撳墠瀹氫綅**锛?- Typora 鐨勫啓浣滄墜鎰?+ Obsidian 鐨勭煡璇嗙綉缁?+ 涓枃鍐呭鐢熶骇 + 鏈湴浼樺厛 AI/闅愮銆?- 宸叉湁 B1锛圵iki 鍙岄摼/鍙嶉摼锛夈€丅2锛堟爣绛?閮ㄥ垎鍏ㄦ枃绱㈠紩锛夈€丅3锛堝叧绯诲浘璋憋級銆丅5锛堥檮浠剁鐞嗭級銆丏1~D8锛堢紪杈戝櫒鑳藉姏琛ュ叏锛夌瓑鍩虹鑳藉姏銆?- IPC 閫氶亾 108 涓?/ 18 缁勩€乸reload 鐧藉悕鍗?send/invoke 74 + on/once 28 + `window.api` 6銆佸伐浣滃尯绱㈠紩缂撳瓨 TTL 5s銆乣FILE.GET_WORKSPACE_INDEX` 涓哄綋鍓嶇煡璇嗗簱鍩哄骇銆?
**闆嗘垚鐩爣**锛?- 涓嶅鍒?LLM Wiki 妗岄潰搴旂敤鐨勫叏閮?UI锛堝浘璋?鑱婂ぉ/瀹￠槄锛夛紝鑰屾槸鍋氬畠鐨?*缂栬緫銆佸闃呫€佹绱€佺鐞嗗伐浣滃彴**銆?- 鐢?Markdown 鏂囦欢 + MCP 瀵规帴锛屾瘮鎶?LLM Wiki 鏁翠釜濉炶繘鐧芥辰鏇村悎鐞嗐€?- 0~3 涓湀瀹屾垚 L1锛堝伐浣滃尯妯℃澘 + `raw/` 鍙 + 鍙 MCP Server锛? L2锛圡CP 鍙鎺ュ彛锛夛紝鍚庣画鎸?AI MVP/B3/E5 鐙珛鎺ㄨ繘銆?
```

### 3.7 配置项与模式切换逻辑（补充）

#### 3.7.1 配置项位置

- **配置文件**：`system-setting.json`（由主进程 `config-manager` 管理）
- **新增字段**：
  ```typescript
  workspaceMode: 'traditional' | 'llm-wiki'  // 默认 'traditional'
  ```
- **配置校验**（`src/main/config/config-schema.ts`）：
  ```typescript
  export const ALLOWED_CONFIG_NAMES: ReadonlySet<string> = new Set([
      // ... 现有字段
      'workspaceMode'  // 新增
  ])

  export function validateConfigData(configName: string, data: unknown): ConfigValidationResult {
      if (configName === 'workspaceMode') {
          if (typeof data === 'string' && ['traditional', 'llm-wiki'].includes(data)) {
              return { ok: true, value: data }
          }
          return { ok: false, code: 'INVALID_VALUE' }
      }
  }
  ```
- **默认值**（`src/main/config/system-setting.ts`）：
  ```typescript
  export const SYSTEM_SETTING_FALLBACK = {
      // ... 现有字段
      workspaceMode: 'traditional'  // 默认为传统模式
  }
  ```

#### 3.7.2 UI 位置：设置页「功能设置」选项卡

**涉及文件**：
- `src/renderer/src/components/dialogs/complex/system-setting/FeaturesPanel.vue`
- `src/shared/i18n/messages/zh-CN/dialogRenderer.ts`
- `src/shared/i18n/messages/en-US/dialogRenderer.ts`

**改动点**：
1. **新增下拉框**（`FeaturesPanel.vue`）：
   ```vue
   <div class="form-item">
       <label>{{ t('dialogRenderer.systemSetting.features.workspaceMode') }}</label>
       <select v-model="settings.workspaceMode" @change="handleUpdate">
           <option value="traditional">传统模式（普通 Markdown 编辑）</option>
           <option value="llm-wiki">LLM Wiki 模式（raw/wiki 目录化）</option>
       </select>
   </div>
   ```

2. **i18n 键**（`zh-CN/dialogRenderer.ts` 与 `en-US/dialogRenderer.ts`）：
   ```typescript
   // zh-CN/dialogRenderer.ts
   systemSetting: {
       features: {
           workspaceMode: '工作区模式'
       }
   }

   // en-US/dialogRenderer.ts
   systemSetting: {
       features: {
           workspaceMode: 'Workspace Mode'
       }
   }
   ```

#### 3.7.3 模式切换流程

**切换流程**：

1. **用户在下拉框选择模式**：
   - 从 `traditional` → `llm-wiki`
   - `handleUpdate` 触发 `config:write('system', { workspaceMode })`

2. **弹出确认对话框**（`BaseDialog`）：
   - 标题：「切换工作区模式」
   - 内容：「切换到 LLM Wiki 模式会创建 `raw/` 与 `wiki/` 目录，并开启只读模式。是否继续？」
   - 按钮：「取消」、「确认初始化」

3. **用户点击「确认初始化」**：
   - 执行 `baize:file:initialize-llm-wiki` 命令
   - 创建 `raw/` 与 `wiki/` 目录
   - 生成 `schema.md` 模板
   - 返回成功提示

4. **初始化成功后**：
   - 通知主进程更新 `workspaceMode` 为 `llm-wiki`
   - 索引服务自动忽略 `raw/` 目录
   - `raw/` 目录写入守卫生效

**回退逻辑**：
- 用户可随时切回 `traditional` 模式
- `raw/` 与 `wiki/` 目录可保留作为资料归档
- 切换后自动触发索引重建（`invalidateWorkspaceIndexCache()`）

#### 3.7.4 完整实现逻辑（伪代码）

**设置页完整逻辑**（`FeaturesPanel.vue`）：
```typescript
const settings = computed(() => useConfigStore().system)

function handleUpdate(newMode: 'traditional' | 'llm-wiki') {
    if (newMode === 'llm-wiki' && settings.value.workspaceMode === 'traditional') {
        // 弹出确认对话框
        showConfirmDialog().then((confirmed) => {
            if (confirmed) {
                // 执行初始化命令
                invoke('initialize-llm-wiki').then(() => {
                    Notify.success('LLM Wiki 初始化成功')
                    useConfigStore().system.workspaceMode = 'llm-wiki'
                })
            }
        })
    } else {
        // 直接保存
        useConfigStore().system.workspaceMode = newMode
    }
}
```

**验收标准**：
- 切换到 `llm-wiki` 模式时，必须先弹出对话框，用户点击「确认」后才会执行初始化
- 初始化成功后，工作区根下出现 `raw/` 与 `wiki/` 目录，索引服务忽略 `raw/` 目录
- 可随时切回 `traditional` 模式，`raw/` 与 `wiki/` 目录保留作为资料归档

---


## 2. 闃舵鍒掑垎涓庢€昏

| 闃舵 | 浠诲姟鏁?| 棰勮宸ユ湡 | 浼樺厛绾?| 浜у嚭 |
|------|--------|---------|--------|------|
| L0 鐩存帴鎵撳紑 | 0 | 0 | 鏃?| 鏃犻渶鏀瑰姩 |
| L1 宸ヤ綔鍖烘ā鏉?+ `raw/` 鍙 | 9 | 1~2 鍛?| P0 | 宸ヤ綔鍖烘ā鏉裤€乣raw/` 鍙 |
| L2 MCP 妗?| 5 | 1 鍛?| P0 | 4 涓彧璇?MCP 宸ュ叿 |
| L3 鍐呯疆 AI 宸ヤ綔娴?| 5 | 2~3 鍛?| P1 | AI ingest + diff 瀹℃壒 |
| L4 鍥捐氨涓庡祵鍏?| 3 | 3~4 鍛?| P1 | 鍥捐氨 UI銆佸祵鍏?UI |
| 杈呭姪浠诲姟 | 4 | 骞惰 | P0 | 鏂囨。銆佺被鍨嬫鏌ャ€佸崟娴?|

---

## 3. 闃舵涓€锛歀1 宸ヤ綔鍖烘ā鏉?+ `raw/` 鍙锛圥0锛?~2 鍛級

### 3.1 浠诲姟 T1.1锛氬垱寤?LLM Wiki 鍒濆鍖栧懡浠?
**娑夊強鏂囦欢**锛?- `src/shared/ipc-channels.ts`
- `src/main/ipc/file-editor-ipc.ts`
- `src/renderer/src/components/MenuBar/menu-actions.ts`
- `src/renderer/src/components/search/command-registry.ts`
- `src/shared/i18n/messages/zh-CN/menu.ts`
- `src/shared/i18n/messages/en-US/menu.ts`

**鍙樻洿鍐呭**锛?
1. **鏂板 IPC 閫氶亾甯搁噺**锛坄src/shared/ipc-channels.ts`锛夛細
   ```typescript
   FILE: {
     // ... 鐜版湁閫氶亾
     INITIALIZE_LLM_WIKI: 'baize:file:initialize-llm-wiki'
   }
   ```

2. **鏂板 handler**锛坄src/main/ipc/file-editor-ipc.ts`锛夛細
   - 鍦?`registerFileEditorIpc` 涓敞鍐?`INITIALIZE_LLM_WIKI`
   - 瀹炵幇閫昏緫锛氬湪 `appState.rootPath` 涓嬪垱寤?`raw/` 涓?`wiki/` 鐩綍锛岀敓鎴?`schema.md` 妯℃澘

3. **鑿滃崟鍔ㄤ綔鎷︽埅**锛坄src/renderer/src/components/MenuBar/menu-actions.ts`锛夛細
   - 鎷︽埅 `baize:file:initialize-llm-wiki` 鍔ㄤ綔
   - 璋冪敤 handler锛屾垚鍔熷悗寮瑰嚭鎴愬姛鎻愮ず

4. **鍛戒护闈㈡澘娉ㄥ唽**锛坄src/renderer/src/components/search/command-registry.ts`锛夛細
   - 鏂板鍛戒护 `id: 'initialize-llm-wiki'`銆乣menuAction: 'baize:file:initialize-llm-wiki'`銆乣keywords: ['llm', 'wiki', 'raw', '鍒濆鍖?]`

5. **i18n 閿ˉ鍏?*锛坄zh-CN/menu.ts` 涓?`en-US/menu.ts`锛夛細
   - 鏂板 `initializeLlmWiki` 閿?   - 涓枃锛歚鍒濆鍖?LLM Wiki`锛涜嫳鏂囷細`Initialize LLM Wiki`

---

### 3.2 浠诲姟 T1.2锛氱储寮曟湇鍔″拷鐣?`raw/` 鐩綍

**娑夊強鏂囦欢**锛?- `src/main/utils/workspace-index.ts`
- `src/main/utils/workspace-search.ts`

**鍙樻洿鍐呭**锛?
1. **鎵╁睍蹇界暐鐩綍瑙勫垯**锛坄workspace-index.ts`锛夛細
   ```typescript
   export const WORKSPACE_INDEX_IGNORED_DIRS: ReadonlySet<string> = new Set([
     'node_modules', '.git', '.svn', '.hg', '.bzr', '.idea', '.vscode',
     'raw'  // 鏂板
   ])
   ```

2. **鎵╁睍蹇界暐鐩綍瑙勫垯**锛坄workspace-search.ts`锛夛細
   ```typescript
   export const WORKSPACE_SEARCH_IGNORED_DIRS: ReadonlySet<string> = new Set([
     'node_modules', '.git', '.svn', '.hg', '.bzr', '.idea', '.vscode',
     'raw'  // 鏂板
   ])
   ```

**楠屾敹鏍囧噯**锛氭墽琛?`FILE.GET_WORKSPACE_INDEX` 涓庡叏宸ヤ綔鍖烘悳绱㈠悗锛岀粨鏋滀笉鍖呭惈 `raw/` 涓嬬殑鏂囦欢銆?
---

### 3.3 浠诲姟 T1.3锛氭柊澧?`assertWorkspaceWritable` 鍐欏叆瀹堝崼

**娑夊強鏂囦欢**锛?- `src/main/utils/security.ts`

**鍙樻洿鍐呭**锛?- 鏂板鍑芥暟 `assertWorkspaceWritable(rootPath: string): void`
- 鍦ㄦ墍鏈夋枃浠跺啓鍏ヨ矾寰勫墠缃皟鐢紙鍖呮嫭 `file-operations.ts`銆乣attachment-manager.ts`銆乣wiki-link-rename.ts` 绛夛級
- 鑻ユ娴嬪埌 `raw` 瀛愮洰褰曪紝鎶?`PathAccessDeniedError`

**鍓嶇疆渚濊禆**锛歍1.1 瀹屾垚鍚庯紝鎵嶈兘鍦ㄥ啓鐩樿矾寰勪腑璋冪敤姝ゅ嚱鏁般€?
**楠屾敹鏍囧噯**锛氬湪鍐欏叆浠讳綍鏂囦欢鍓嶈皟鐢紝鑻?`raw/` 瀛樺湪锛屽簲鎶涢敊骞舵彁绀衡€渞aw 鐩綍鍙鈥濄€?
---

### 3.4 浠诲姟 T1.4锛氳缃〉鈥滃伐浣滃尯妯″紡鈥濋€夐」

**娑夊強鏂囦欢**锛?- `src/renderer/src/components/dialogs/complex/system-setting/FeaturesPanel.vue`
- `src/main/config/config-schema.ts`

**鍙樻洿鍐呭**锛?
1. **鏂板閰嶇疆瀛楁**锛坄src/main/config/config-schema.ts`锛夛細
   ```typescript
   export const ALLOWED_CONFIG_NAMES: ReadonlySet<string> = new Set([
     // ... 鐜版湁
     'workspaceMode'  // 鏂板
   ])

   export function validateConfigData(configName: string, data: unknown): ConfigValidationResult {
     // 楠岃瘉 workspaceMode 鏄惁涓?'traditional' | 'llm-wiki'
   }
   ```

2. **UI 瀹炵幇**锛坄FeaturesPanel.vue`锛夛細
   - 鍦ㄢ€滃姛鑳借缃€濋〉绛炬柊澧?`workspaceMode` 涓嬫媺妗?   - 閫夐」锛歚traditional`锛堥粯璁わ級銆乣llm-wiki`
   - 鍦?`handleUpdate` 涓洃鍚彉鍖?
---

### 3.5 浠诲姟 T1.5锛氭ā寮忓垏鎹㈢‘璁ゅ璇濇

**娑夊強鏂囦欢**锛?- `src/renderer/src/components/dialogs/complex/system-setting/FeaturesPanel.vue`
- `src/renderer/src/components/dialogs/BaseDialog.vue`锛堝彲閫夊鐢級

**鍙樻洿鍐呭**锛?- 鍦?`FeaturesPanel.vue` 涓洃鍚?`workspaceMode` 鍙樺寲
- 鑻ヤ粠 `traditional` 鈫?`llm-wiki`锛屽脊鍑?`BaseDialog` 纭瀵硅瘽妗?- 瀵硅瘽妗嗗唴瀹癸細鈥滃垏鎹㈠埌 LLM Wiki 妯″紡浼氬垱寤?`raw/` 涓?`wiki/` 鐩綍锛屽苟寮€鍚彧璇绘ā寮忋€傛槸鍚︾户缁紵鈥?- 鎸夐挳锛氣€滃彇娑堚€濄€佲€滅‘璁ゅ垵濮嬪寲鈥?
**楠屾敹鏍囧噯**锛氬垏鎹㈠埌 `llm-wiki` 妯″紡鏃讹紝蹇呴』鍏堝脊鍑哄璇濇锛岀敤鎴风偣鍑烩€滅‘璁も€濆悗鎵嶄細鎵ц鍒濆鍖栥€?
---

### 3.6 浠诲姟 T1.6锛氭枃妗ｆ洿鏂?
**娑夊強鏂囦欢**锛?- `docs/wiki/02-璁捐涓庢灦鏋?LLM-Wiki-Integration-Design.md`
- `docs/wiki/README.md`

**鍙樻洿鍐呭**锛?- 鍦ㄢ€滆儗鏅笌鐩爣鈥濈珷鑺傚鍔犫€滃垵濮嬪寲鏃舵満鈥濊鏄?- 鍦ㄢ€滄枃妗ｇ淮鎶ょ害瀹氣€濅腑璇存槑鏂板鏂囨。璺緞
- 鏇存柊鏂囨。璁℃暟涓庨摼鎺ユ鏌?
---

## 4. 闃舵浜岋細L2 MCP 妗ワ紙P0锛? 鍛級

### 4.1 浠诲姟 T2.1锛氭柊澧?MCP IPC 閫氶亾甯搁噺

**娑夊強鏂囦欢**锛?- `src/shared/ipc-channels.ts`

**鍙樻洿鍐呭**锛?```typescript
MCP: {
  SEARCH_NOTES: 'baize:mcp:search-notes',
  READ_NOTE: 'baize:mcp:read-note',
  LIST_TAGS: 'baize:mcp:list-tags',
  GET_BACKLINKS: 'baize:mcp:get-backlinks'
}
```

---

### 4.2 浠诲姟 T2.2锛氬疄鐜?MCP 鍙 handlers

**娑夊強鏂囦欢**锛?- `src/main/ipc/mcp-ipc.ts`锛堟柊寤猴級

**鍙樻洿鍐呭**锛?- 瀹炵幇 `searchNotes` handler锛氳皟鐢?`searchWorkspace`锛岃繃婊?`layer: 'wiki'`
- 瀹炵幇 `readNote` handler锛氫粠绱㈠紩蹇収涓繑鍥?file
- 瀹炵幇 `listTags` handler锛氳繑鍥?tags
- 瀹炵幇 `getBacklinks` handler锛氳皟鐢?`useWorkspaceIndex().findBacklinks()`

**楠屾敹鏍囧噯**锛歁CP 閫氶亾杩斿洖缁撴瀯绗﹀悎 `WorkspaceIndexSnapshot` 涓?`WorkspaceIndexBacklink` 绫诲瀷銆?
---

### 4.3 浠诲姟 T2.3锛氭敞鍐?MCP IPC

**娑夊強鏂囦欢**锛?- `src/main/ipc/registry.ts`

**鍙樻洿鍐呭**锛?```typescript
import { registerMcpIpc } from './mcp-ipc'
// 鍦?registerAll 涓皟鐢?registerMcpIpc(mainWindow, 'global-mcp-ipc')
```

---

### 4.4 浠诲姟 T2.4锛氫富杩涚▼ MCP Server 鍒濆鍖?
**娑夊強鏂囦欢**锛?- `src/main/utils/mcp.ts`锛堟柊寤猴級

**鍙樻洿鍐呭**锛?- 浣跨敤 `@modelcontextprotocol/sdk` 鎴栬交閲忕骇 HTTP wrapper
- 瀹炵幇 MCP Server锛屾毚闇?4 涓?tool
- 缁?`contextBridge` 鏆撮湶 `baizeMcp` 缁欐覆鏌撳眰涓庡閮?Agent

**楠屾敹鏍囧噯**锛氬閮?Agent 璋冪敤 `baizeMcp.search_notes` 鑳借繑鍥炵粨鏋溿€?
---

### 4.5 浠诲姟 T2.5锛歁CP 閫氶亾瀹夊叏鏍￠獙

**娑夊強鏂囦欢**锛?- `src/main/utils/ipc-security.ts`

**鍙樻洿鍐呭**锛?- 鍦?`withSenderCheck` 涓鍔?MCP 鍩熺殑 scope 妫€鏌?- 纭繚鍙湁涓荤獥鍙ｅ彲璋冪敤

**楠屾敹鏍囧噯**锛氭覆鏌撳眰锛堥潪涓荤獥鍙ｏ級璋冪敤 MCP 閫氶亾搴旇繑鍥?`UNTRUSTED_SENDER_RESULT`銆?
---

## 5. 闃舵涓夛細L3 鍐呯疆 AI 宸ヤ綔娴侊紙P1锛?~3 鍛級

### 5.1 浠诲姟 T3.1锛氭柊澧?AI ingest 閫氶亾

**娑夊強鏂囦欢**锛?- `src/shared/ipc-channels.ts`

**鍙樻洿鍐呭**锛?```typescript
AI: {
  // ... 鐜版湁閫氶亾
  INGEST: 'baize:ai:ingest'
}
```

---

### 5.2 浠诲姟 T3.2锛氬疄鐜?AI ingest handler

**娑夊強鏂囦欢**锛?- `src/main/ipc/ai-ipc.ts`锛堟柊寤猴級

**鍙樻洿鍐呭**锛?- 璋冪敤 AI Provider锛堟湰鍦?Ollama/LM Studio + BYOK锛?- 鎵弿 `raw/`锛屾彁鍙?front matter/鏍囩/鎽樿
- 鐢熸垚 `wiki/` 椤甸潰
- 璋冪敤 `baize:file:initialize-llm-wiki` 鍐欏叆

**鍓嶇疆渚濊禆**锛欰I MVP 鍩虹嚎宸插疄鐜帮紝Provider 鍙敤銆?
**楠屾敹鏍囧噯**锛欰I ingest 鍛戒护鎴愬姛鍚庯紝`wiki/` 鐩綍涓嬬敓鎴?Markdown 椤甸潰銆?
---

### 5.3 浠诲姟 T3.3锛欰I ingest diff 瀹℃壒 UI

**娑夊強鏂囦欢**锛?- `src/renderer/src/components/Markdown/llm-ingest-diff.vue`锛堟柊寤猴級

**鍙樻洿鍐呭**锛?- 灞曠ず AI 鐢熸垚鍐呭鐨?diff
- 鎻愪緵鈥滅‘璁も€濄€佲€滃洖婊氣€濇寜閽?
**楠屾敹鏍囧噯**锛氱敤鎴风偣鍑荤‘璁ゅ悗锛孉I 鍐呭鍐欏叆 `wiki/`锛涘洖婊氭椂鎭㈠鏃х増鏈€?
---

### 5.4 浠诲姟 T3.4锛氬懡浠ら潰鏉挎敞鍐?
**娑夊強鏂囦欢**锛?- `src/renderer/src/components/search/command-registry.ts`

**鍙樻洿鍐呭**锛?```typescript
{
  id: 'llm-ingest',
  labelKey: 'menu.file.ingest',
  categoryKey: 'editorUi.commandPalette.category.file',
  menuAction: 'baize:ai:ingest',
  keywords: ['ingest', 'ai', '缂栬瘧']
}
```

---

### 5.5 浠诲姟 T3.5锛歩18n 閿ˉ鍏?
**娑夊強鏂囦欢**锛?- `src/shared/i18n/messages/zh-CN/menu.ts`
- `src/shared/i18n/messages/en-US/menu.ts`

**鍙樻洿鍐呭**锛?```typescript
// zh-CN/menu.ts
ingest: 'AI 缂栬瘧'

// en-US/menu.ts
ingest: 'AI Compile'
```

---

## 6. 闃舵鍥涳細B3 鍥捐氨涓?E4 宓屽叆锛圥1锛?~4 鍛級

### 6.1 浠诲姟 T4.1锛氬浘璋?UI 瀹炵幇

**娑夊強鏂囦欢**锛?- `src/renderer/src/components/Graph/GraphDialog.vue`锛堟柊寤猴級
- `src/main/utils/graph.ts`锛堟柊寤猴紝濡傞渶锛?
**鍙樻洿鍐呭**锛?- 璋冪敤 B3 鍏崇郴鍥捐氨鏁版嵁
- 灞曠ず鑺傜偣/杈?- 鐐瑰嚮鑺傜偣鍙烦杞枃浠?
**鍓嶇疆渚濊禆**锛欱3 鍏崇郴鍥捐氨鏁版嵁宸插疄鐜般€?
**楠屾敹鏍囧噯**锛氱偣鍑昏妭鐐瑰彲璺宠浆鏂囦欢锛岀偣鍑昏竟鏄剧ず鍏崇郴銆?
---

### 6.2 浠诲姟 T4.2锛氬祵鍏?UI 瀹炵幇

**娑夊強鏂囦欢**锛?- `src/renderer/src/components/Markdown/embed/EmbedDialog.vue`锛堟柊寤猴級

**鍙樻洿鍐呭**锛?- 鏀寔鍦?`wiki/` 涓祵鍏?`raw/` 璧勬枡閾炬帴

**楠屾敹鏍囧噯**锛氬祵鍏ユ鑳芥樉绀?`raw/` 涓殑鏂囦欢棰勮銆?
---

### 6.3 浠诲姟 T4.3锛氭枃妗ｆ洿鏂?
**娑夊強鏂囦欢**锛?- `docs/wiki/02-璁捐涓庢灦鏋?LLM-Wiki-Integration-Design.md`

**鍙樻洿鍐呭**锛?- 鍦ㄢ€滀笅涓€姝ヨ鍔ㄢ€濅腑璁板綍 B3/E5 杩涘害

---

## 7. 杈呭姪浠诲姟锛堣疮绌挎墍鏈夐樁娈碉級

### 7.1 浠诲姟 T0.1锛氭枃妗ｅ彛寰勬牎楠?
**娑夊強鏂囦欢**锛?- `docs/reports/README.md`
- `docs/wiki/README.md`

**鍙樻洿鍐呭**锛?- 鏇存柊鏂囨。璁℃暟涓?34 椤碉紙1 棣栭〉 + 33 鎶ュ憡锛?
**楠屾敹鏍囧噯**锛歚npm run docs:check` 閫氳繃銆?
---

### 7.2 浠诲姟 T0.2锛氶摼鎺ユ鏌?
**娑夊強鏂囦欢**锛?- `docs/wiki/README.md`
- `docs/wiki/02-璁捐涓庢灦鏋?LLM-Wiki-Integration-Design.md`

**鍙樻洿鍐呭**锛?- 琛ラ綈鎵€鏈夌浉瀵归摼鎺?
**楠屾敹鏍囧噯**锛歚npm run docs:check` 閫氳繃銆?
---

### 7.3 浠诲姟 T0.3锛氱被鍨嬫鏌ヤ笌鍗曟祴

**娑夊強鏂囦欢**锛?- 鎵€鏈夋柊澧?淇敼鐨勬枃浠?
**鍙樻洿鍐呭**锛?- 纭繚鏂板绫诲瀷銆乭andler銆佸伐鍏峰嚱鏁版湁瀵瑰簲娴嬭瘯

**楠屾敹鏍囧噯**锛歚npm run typecheck` 閫氳繃锛屾柊澧炲崟娴嬮€氳繃銆?
---

## 8. 瀹炴柦杩囩▼锛堟寜闃舵锛?
### 闃舵涓€锛歀1 宸ヤ綔鍖烘ā鏉?+ `raw/` 鍙锛?~2 鍛級

1. **T1.1**锛? 澶╋級锛氬垱寤?`INITIALIZE_LLM_WIKI` 閫氶亾甯搁噺銆乭andler銆佽彍鍗曞姩浣溿€佸懡浠ら潰鏉挎敞鍐屻€乮18n 閿€?2. **T1.2**锛?.5 澶╋級锛氫慨鏀圭储寮曚笌鎼滅储鏈嶅姟锛屽拷鐣?`raw/` 鐩綍銆?3. **T1.3**锛? 澶╋級锛氭柊澧?`assertWorkspaceWritable` 鍐欏叆瀹堝崼锛屽湪鎵€鏈夊啓鐩樿矾寰勫墠缃皟鐢ㄣ€?4. **T1.4**锛? 澶╋級锛氬湪 `config-schema.ts` 涓柊澧?`workspaceMode` 瀛楁锛屽湪璁剧疆椤垫坊鍔犱笅鎷夋銆?5. **T1.5**锛?.5 澶╋級锛氬湪璁剧疆椤靛垏鎹㈡椂寮瑰嚭纭瀵硅瘽妗嗐€?6. **T1.6**锛?.5 澶╋級锛氭洿鏂版枃妗ｏ紝琛ュ厖 i18n 涓庢祴璇曘€?
### 闃舵浜岋細L2 MCP 妗ワ紙1 鍛級

1. **T2.1**锛?.5 澶╋級锛氭柊澧?MCP 閫氶亾甯搁噺銆?2. **T2.2**锛? 澶╋級锛氬疄鐜?4 涓?MCP 鍙 handlers銆?3. **T2.3**锛?.5 澶╋級锛氭敞鍐?MCP IPC銆?4. **T2.4**锛? 澶╋級锛氬疄鐜?MCP Server 涓?`contextBridge` 鏆撮湶銆?5. **T2.5**锛? 澶╋級锛氬鍔?MCP 鍩熺殑 scope 妫€鏌ャ€?
### 闃舵涓夛細L3 鍐呯疆 AI 宸ヤ綔娴侊紙2~3 鍛級

1. **T3.1**锛?.5 澶╋級锛氭柊澧?`AI.INGEST` 閫氶亾甯搁噺銆?2. **T3.2**锛? 澶╋級锛氬疄鐜?AI ingest handler锛岃皟鐢?AI Provider锛岀敓鎴?`wiki/` 椤甸潰銆?3. **T3.3**锛? 澶╋級锛氬疄鐜?AI ingest diff 瀹℃壒 UI銆?4. **T3.4**锛?.5 澶╋級锛氬懡浠ら潰鏉挎敞鍐屻€?5. **T3.5**锛?.5 澶╋級锛氳ˉ鍏?i18n 閿€?
### 闃舵鍥涳細B3 鍥捐氨涓?E4 宓屽叆锛?~4 鍛級

1. **T4.1**锛? 澶╋級锛氬疄鐜板浘璋?UI銆?2. **T4.2**锛? 澶╋級锛氬疄鐜板祵鍏?UI銆?3. **T4.3**锛? 澶╋級锛氭洿鏂版枃妗ｃ€?
---

## 9. 椋庨櫓涓庝緷璧?
| 椋庨櫓 | 褰卞搷 | 缂撹В鎺柦 |
|------|------|---------|
| `raw/` 鍙瀵艰嚧鐢ㄦ埛鍥版儜 | 楂?| 鍒濆鍖栨枃妗ｈ鏄庯紱璁剧疆椤垫彁绀?|
| MCP Server 璋冭瘯鎴愭湰楂?| 涓?| 鎻愪緵 PoC锛屽閮?Agent 楠岃瘉 |
| AI ingest 鎬ц兘闂 | 涓?| 鍏堝仛灏忚妯?`raw/` 娴嬭瘯锛岃缃壒閲忛槇鍊?|
| 鍥捐氨 UI 涓嶅濂斤紝閲嶅閫犺疆瀛?| 涓?| 鍥捐氨涓庣煡璇嗗簱鏌ヨ瀵硅瘽妗嗗垎绂伙紝鍥捐氨鎸?B3 鐙珛鎺ㄨ繘 |

---

## 10. 闄勫綍

### 10.1 鍙傝€冩枃妗?
- 銆奓LM Wiki 闆嗘垚璁捐鏂规銆嬶紙鍚屼竴鐩綍涓嬶級
- 銆婁笟鐣屽鏍囦笌鏀硅繘寤鸿鎶ュ憡銆?- 銆奙arkdown 缂栬緫鍣ㄨ兘鍔涜ˉ鍏ㄩ€夐」鎶ュ憡銆?- 銆夿2 鍏ㄦ枃绱㈠紩椋庨櫓涓庡疄鏂芥柟妗堛€?- 銆奙onaco 涓?WYSIWYG 鍙岀紪杈戝櫒鎶€鏈瘎浼版姤鍛娿€?
### 10.2 鍓嶇疆鍩虹嚎

| 鍩虹嚎椤?| 鐗堟湰/鍩虹嚎 | 璇存槑 |
|--------|----------|------|
| 鐧芥辰绗旇鐗堟湰 | v1.5.6 | 寮€鍙戜腑 |
| IPC 閫氶亾 | 108 涓?/ 18 缁?| 鐧藉悕鍗?send 74 + on/once 28 + `window.api` 6 |
| preload 鐧藉悕鍗?| 74+28+6 | 宸ヤ綔鍖虹储寮曠紦瀛?TTL 5s |
| 娴嬭瘯瑕嗙洊鐜?| 84.79% statements / 77.99% branches | 371 娴嬭瘯鏂囦欢 / 6,857 鐢ㄤ緥 |
| 鏂囨。璁℃暟 | 33 绡?md / 34 椤?HTML | 01 绫?13 / 02 绫?9 / 03 绫?11 |

### 10.3 鑱旂郴鏂瑰紡

- **缁存姢鑰?*锛歨emy08
- **鏈€鍚庢牳瀵?*锛?026-11-28
- **鏂囨。绫诲瀷**锛氬疄鏂借鍒掞紙瀹屾暣鐗堬級

---

## 11. 鍙樻洿娓呭崟姹囨€?
| 闃舵 | 鏂囦欢鏁伴噺 | 涓昏鏀瑰姩 |
|------|---------|---------|
| L1 | 7 | 鏂板 IPC 閫氶亾銆乭andler銆佽彍鍗曞姩浣溿€佸懡浠ら潰鏉裤€乮18n 閿€佺储寮曟湇鍔°€佸畨鍏ㄥ畧鍗€佽缃〉 UI |
| L2 | 3 | 鏂板 MCP IPC 閫氶亾銆乭andler銆丮CP Server |
| L3 | 3 | 鏂板 AI ingest 閫氶亾銆乭andler銆乨iff 瀹℃壒 UI |
| L4 | 2 | 鏂板鍥捐氨 UI銆佸祵鍏?UI |
| 杈呭姪 | 4 | 鏂囨。鍙ｅ緞鏍￠獙銆侀摼鎺ユ鏌ャ€佺被鍨嬫鏌ャ€佸崟娴?|

---

**缁存姢鑰?*锛歨emy08锝?*鏈€鍚庢牳瀵?*锛?026-11-28锝?*鏂囨。绫诲瀷**锛氬疄鏂借鍒掞紙瀹屾暣鐗堬級
