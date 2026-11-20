# 渲染器插件工具、菜单与资源管理模块单元测试报告

> 📌 **当前状态标注（2026-11-20 实测）**：本文为 2026-11-14 渲染器工具/菜单/资源管理模块测试组（test-renderer-tools）的时点报告，正文 **8 个测试文件 / 193 个用例**等数字保留当时原貌。**后续演进**：当前项目测试基线为 **204 个测试文件 / 3,759 个用例全部通过**（当前唯一真源仍为 `plugin-tools-const.ts`，全部 38 个插件工具均已注册菜单入口）；文中 `menu_action` 字段已于 2026-11-15 统一改名为 `menuAction`（270 处 / 12 文件，字符串动作 id 不变），相关「疑似 Bug」的修复状态见 [全量扫描与审查报告](../reports/md/01-检查与扫描/全量扫描与审查报告.md)（历史）与 [报告总索引](../reports/README.md)（当前基线：204 文件 / 3,759 用例、91 IPC 通道 / 17 组、白名单 60 + 25）。

- 测试组：test-renderer-tools
- 时间：2026-11-14
- 运行方式：`cmd /c "npx vitest run tests/unit/<文件列表>"`
- 结果：**8 个测试文件全部通过，193/193 用例通过，0 失败**

## 一、新增测试文件与用例数

| 测试文件                               | 被测模块                                                            | 用例数  |
| -------------------------------------- | ------------------------------------------------------------------- | ------- |
| tests/unit/NetWork.test.ts             | src/renderer/src/components/PluginTools/NetWork/NetWork.ts          | 21      |
| tests/unit/Information.test.ts         | src/renderer/src/components/PluginTools/Informations/Information.ts | 39      |
| tests/unit/plugin_tools_const.test.ts  | src/renderer/src/components/PluginTools/plugin_tools_const.ts       | 7       |
| tests/unit/menu_consts.test.ts         | src/renderer/src/components/MenuBar/menu_consts.ts                  | 49      |
| tests/unit/menu_config.test.ts         | src/renderer/src/components/MenuBar/menu_config.ts                  | 16      |
| tests/unit/menu_actions.test.ts        | src/renderer/src/components/MenuBar/menu_actions.ts                 | 18      |
| tests/unit/resource-manager.test.ts    | src/renderer/src/components/ResourceManager/resource-manager.ts     | 23      |
| tests/unit/useWindowManagement.test.ts | src/renderer/src/composables/useWindowManagement.ts                 | 20      |
| **合计**                               |                                                                     | **193** |

## 二、覆盖模块

- NetWork：isValidIPV4 边界、IpToBinary/BinaryToIPArr/BinaryToIPString（含进制参数）、GetHostNumber、GetBitsWithMask（含非连续掩码"无效"）、GetMaskWithBits（含越界回退与 hex 输出）、GetMaskByIpNumber、IPV4 类全字段计算（/24、/8、/16）与显式掩码参数。
- Information：ASCIITable（128 条、dec/bin/hex 全量一致性、oct/关键条目抽样）、FormulaSymbolTable、HTMLSpecCharTable、PhysicalTable、SubnetMaskBitsTable（33 行、nums=2^(32-bit) 全量校验）、HTTPStatusCodeTable、NumericCaseTable、NormalFontTable、HTMLMimeTypeTable、GreeceLetterTable 的字段完整性、唯一性与关键条目抽样；CompressedArray 分块逻辑。
- plugin_tools_const：条目数（19）、id 唯一性、命名规范、分类数量、关键 id 抽样。
- menu_consts：9 个 URL 映射表结构与 id 唯一性、OnlineUrlMaps 合并计数（50）、12 个插件菜单映射表字段/唯一性/条目数、CHANNEL_PLUGIN_TOOL_SHOW。
- menu_config：menuMap 顶层 11 项菜单及顺序、全树 menu_action 唯一性（>50 个）、分隔符结构、文件/编辑/视图/编码/插入/插件/在线/GitHub/帮助各菜单的关键结构与快捷键抽样、顶层 accelerator 唯一性。
- menu_actions：14 种对话框动作、file:new 的成功/失败路径、插件动作走 EventBus、Mermaid/TextBlock/Writing/PlantUML 模板动作、未知动作 IPC 兜底。
- resource-manager：FileMgrSvgs 8 个图标结构、getFileMgrSvg 的 folder/collapse/扩展名/大小写/默认回退分支、handleContextMenu 的坐标与菜单结构、新建/导入/复制/剪切/粘贴/删除/查找/导出/重命名等 onClick 触发的 IPC 与剪贴板行为、folder 节点禁用项。
- useWindowManagement：初始状态、最小化/最大化/关闭、标题栏拖动（含 window-controls 忽略、非左键忽略、非最大化/最大化偏移计算、bounds 为空的容错）、mouseup 停止拖动、双击切换最大化、缩放（左右上下边缘、MIN_WIDTH/MIN_HEIGHT 截断、非左键/最大化忽略）、缩放结束与 cleanupWindowEvents。

## 三、遇到的难点及处理

1. **plugin_tools_const.ts 引入的 UUIDSGenerator.vue 模板编译失败**：该组件模板 `<input v-model="uuidNumber" ... value="1">` 被 Vue 编译器报错 `Unnecessary value binding used alongside v-model`，导致整个模块在 node 环境无法加载。处理：在测试中用 `vi.mock`（配合 `vi.hoisted`）把 19 个 .vue 组件全部 mock 为占位对象，仅验证 pluginTools 数据结构，不修改源码。
2. **vi.mock 工厂提升**：工厂函数中引用顶层变量会报 `Cannot access ... before initialization`，改用 `vi.hoisted` 定义共享 mock。
3. **useWindowManagement 内部未导出的拖动/缩放处理函数**：通过 stub 的 `document.addEventListener` 捕获注册的回调，再手动触发 mousemove/mouseup 事件驱动内部逻辑。
4. **menu_actions / resource-manager / useWindowManagement 的浏览器依赖**：用 `vi.stubGlobal` 提供 window.electron.ipcRenderer、document、navigator.clipboard，`vi.mock` 处理 @imengyu/vue3-context-menu、useConfigStore、event-bus；file:new 的 Promise 回调用微任务刷新后断言。
5. **数据表细节修正**：HTTPStatusCodeTable 中 '499' 条目只有数字没有文字（断言改为校验三位数字前缀 + 单独记录特例）；PluginConvertMaps 实为 6 条、PluginInfoNormal 实为 5 条（按源码注释行数初判有误，已按实际数据修正）。

## 四、发现的疑似 Bug（未修改源码）

1. **NetWork.GetHostNumber 公式与常规定义不符**：实现为 `2^(32-maskLen) - 1 - 2`，比常规可用主机数 `2^n - 2` 少 1（/24 返回 253 而非 254，/30 返回 1 而非 2）。
2. **NetWork.IPV4.WildcardMask 输出带前导零**：如 /24 返回 `'00.00.00.255'`，与其他字段（如 networkMask）格式不一致。
3. **NetWork.IPV4.FirstAddress 对 /32 崩溃**：`'0'.repeat(32 - maskLen - 1)` 在 maskLen=32 时 repeat(-1) 抛 RangeError。
4. **Information.ts 数据重复**：FormulaSymbolTable 中 `≡`、`π` 各出现两次（75 条记录仅 73 个唯一 id）；PhysicalTable 中 `F` 符号重复（力/法拉第常数）；NormalFontTable 中"华文楷体"重复；HTMLSpecCharTable 存在重复 id（`&#8220`、`&#8221`、`&#8674` 等）；HTTPStatusCodeTable 的 `'499'` 条目缺少文字部分。
5. **menu_config.ts 与 menu_actions.ts 的 menu_action 不一致**：设置菜单用 `baize:menu:setting:quick-link`/`baize:menu:setting:monaco-editor`，而 HandleMenuAction 期望 `quicklinks`/`editor`；插入菜单用 `baize:menu:insert:md-table`/`web-link`，HandleMenuAction 期望 `table`/`link`；帮助菜单用 `help:contact-us`，HandleMenuAction 期望 `help:contact`。这些菜单项点击后将落入 IPC 兜底分支（不排除主进程有意处理，属疑似）。
6. **UUIDSGenerator.vue 模板 `v-model` 与 `value` 同时绑定**，Vue 编译器直接报错，该组件在 node 测试环境下无法编译（测试中已 mock 绕开）。

## 五、最终 vitest 运行结果

```text
Test Files  8 passed (8)
Tests       193 passed (193)
```

- 通过数：193
- 失败数：0
