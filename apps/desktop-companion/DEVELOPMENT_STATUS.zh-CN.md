# Scratch AI 教练桌面工具开发交接文档

最后更新：2026-05-07

这份文档给下一位继续维护 `apps/desktop-companion` 里这套 Windows / macOS 桌面工具的人看。

## 1. 当前结论

当前主线已经明确收敛为 **本地基础版**：

- 只保留 Windows + macOS 版本
- 产品定位统一为更通用的 `Scratch AI 教练桌面工具`
- 只做本机 `Scratch Desktop` 连接与 AI 辅助提示
- 只看学生当前作品，不再走教师参考作品 / 远程 `sb3` / 课堂流
- DeepSeek 配置入口收敛为独立设置窗口里的 `API Key + 模型选择 + 提示触发方式`
- 默认交互为“自动刷新”，手动点击只作为可选切换

也就是说，当前桌面工具的主交付是：

1. 打开软件后自动识别 Scratch。
2. 没识别到时允许手动选择路径。
3. 通过桌面工具启动 Scratch 并建立连接。
4. 实时显示当前角色，并把 `当前角色程序 / 推荐积木` 渲染成接近 Scratch 原版的只读积木。
5. 基于当前作品生成 AI 下一步提示。

## 2. 这轮收敛完成了什么

### 产品收敛

- 移除了 `教师 sb3 地址` 输入和参考作品导入链路
- 移除了“跟老师做 / 自己先做”模式切换
- AI 提示现在只消费当前学生作品上下文
- 产品命名与定位统一为更通用的 `Scratch AI 教练桌面工具`
- `AI 下一步提示` 默认改为自动刷新，设置里可切回手动点击模式
- 主界面改为更像桌面工具的布局，不再是网页式教学流程页

### 原版积木渲染

- `当前角色程序 / 推荐积木` 已从手写彩色卡片切换到官方 `scratch-blocks` 只读渲染
- 新增 `projectData -> Blockly XML -> ScratchBlocks workspace` 这条显示链路
- 新增状态字段 `currentTargetScriptXmlList`
- 原有 `currentTargetPrograms` 文本链路保留，继续给 AI、兼容层和排障使用
- `scratch-blocks` 图标资源已统一切到本地 `media` 目录，不再依赖默认外链
- 推荐积木现在收敛到一份官方 opcode 白名单；如果 AI 返回未支持或编造的 opcode，会先自动映射到安全、可渲染的官方积木
- 只读积木缩放已继续下调，当前固定比例为 `0.64`
- 最初切换到官方 `scratch-blocks` 只读渲染的核心提交为 `f725ffe`，整体变更量为 `18 files changed, 1528 insertions(+), 291 deletions(-)`

### 这轮显示收尾

- 修复了 `当绿旗被点击`、`重复执行` 等图标资源断裂问题
- 修复了 `将颜色特效增加 25` 一类推荐积木缺字段、缺输入导致的空壳渲染
- 为一批常用运动、外观、声音、控制、侦测、运算、变量/列表、画笔积木补齐默认 XML 模板
- 已完成一轮 `93` 个白名单 opcode 的 Electron 真渲染 sweep，结果为 `0 fallback`

### 界面与配置

- 主窗口只保留：
  - Scratch 连接状态
  - 已选 Scratch 路径
  - 当前角色
  - 同步时间
  - 当前角色程序
  - 推荐积木
  - AI 当前提示
  - 关键操作按钮
- `DeepSeek 设置` 页现在只保留本地 `API Key`、`Flash / Pro 模型选择`，以及 `自动刷新 / 手动点击` 提示方式
- 主窗口与设置窗口都保留右键菜单支持

### 测试与验证

- 桌面端单测已覆盖本地版新文案和新状态流
- `verify-desktop-companion-ui.mjs` 已同步为本地版界面结构
- macOS 源码版 UI 冒烟已确认能读取 mock state
- 真实联调时不要带 `DESKTOP_COMPANION_MOCK_STATE_FILE`、`DESKTOP_COMPANION_AUTOMATION_ACTIONS`、`DESKTOP_COMPANION_AUTOMATION_SCRATCH_PATH`；这些只给自动化和纯界面演示用，带上后主窗口会显示 mock 路径，且路径选择不会写回真实会话

### GitHub Actions 产物

- `CI` workflow 只负责 `build + test`，不会上传可下载产物
- `Desktop Release Artifacts` workflow 会在 `windows-2022` 和 `macos-latest` 上出包，并把 `installers/**` 上传为 Actions artifact
- 当前 artifact 名称分别是 `scratch-desktop-companion-windows` 和 `scratch-desktop-companion-macos`
- 这两个 artifact 默认保留 `7` 天
- 当前仓库还没有把安装包自动发布到 GitHub Releases；如果 Release 页面没有资产，是当前预期口径

## 3. 当前已完成能力

截至 2026-05-07，已完成：

- Electron 桌面工具主链路
- Windows + macOS 平台口径
- 本地 bridge server
- Scratch 可执行文件路径保存
- `.lnk` 桌面快捷方式解析
- 常见安装目录自动探测
- `Scratch.app` / `Scratch Desktop.app` 自动探测
- 受控启动 Scratch Desktop
- CDP `Runtime.evaluate` 注入桥接脚本
- 首次连接失败后的自动重试注入
- 托盘驻留
- 运行日志
- 单元测试
- Electron UI 自动化
- 打包后 `win-unpacked` UI 自动化
- 打包后 macOS `.app` UI 冒烟
- 打包版真实端到端 E2E
- 本地 `.sb3` 读取验证
- 便携版 `portable.exe` 打包
- NSIS 安装包 `ScratchDesktopCompanion-setup.exe` 打包
- macOS `.app` / `.zip` / `.dmg` 内测包打包
- 推荐积木 opcode 白名单与坏 opcode 自动降级

## 4. 当前界面和状态口径

### 界面主显示

当前主窗口重点显示：

- `已选 Scratch`
- `当前角色`
- `当前角色程序`
- `推荐积木`
- `AI 下一步提示`

补充：

- `当前角色程序` 现在会继续展开 `重复执行 / 一直重复 / 如果` 这类控制积木里的嵌套子堆栈，不再只读取顶层 `next` 链。
- 主窗口优先显示官方积木 SVG，文本序列现在退居为内部兼容链路。
- 当前积木缩放比初版更紧凑，主窗口里更适合并排展示“当前角色程序 / 推荐积木”。
- `AI 下一步提示` 默认会在连接成功后和后续积木变化时自动刷新；切到手动模式后，仍可继续使用按钮触发。
- 最新截图：[current-ui-desktop-companion-scratch-blocks.png](../../docs/assets/screenshots/current-ui-desktop-companion-scratch-blocks.png)

### 当前常见状态文案

- `请先选择 Scratch 软件`
- `请从伴随程序打开已选 Scratch`
- `已连接到 Scratch Desktop`

### 内部状态

底层状态仍保留这些字段：

- `currentTargetId`
- `currentTargetName`
- `currentTargetIsStage`
- `currentTargetPrograms`
- `currentTargetScriptXmlList`
- `toolboxCategories`
- `loadedExtensions`
- `usedExtensions`
- `programAreaModules`
- `aiHintTriggerMode`

注意：

- 模块和扩展现在是兼容保留字段，不再是 UI 主目标
- UI 当前优先消费 `currentTargetScriptXmlList`
- 上层 AI 当前优先直接消费 `currentTargetName + currentTargetPrograms`

## 5. 当前关键实现文件

最重要的几个文件：

- `src/main/platform-adapter.ts`
  - 平台适配、路径选择、默认目录、自动探测
- `src/main/session-manager.ts`
  - 启动、重试注入、bridge payload 收敛、状态更新、AI 触发、XML 链路接线
- `src/main/coach-service.ts`
  - 当前作品上下文整理、DeepSeek 请求与 fallback 提示
- `src/main/scratch-executable-finder.ts`
  - Windows 路径探测、快捷方式解析、候选去重
- `src/main/bridge-script.ts`
  - 注入到 Scratch renderer 的只读脚本
- `src/common/scratch-block-xml.ts`
  - 把 `projectData` 和推荐积木转换成 Blockly XML
- `src/renderer/renderer-view.ts`
  - 把状态渲染成“角色 + 原版积木 + AI 提示”视图
- `src/renderer/scratch-workspace-renderer.ts`
  - 创建 `scratch-blocks` 只读 workspace，加载 XML 并按内容自适应尺寸
- `src/renderer/renderer.ts`
  - 绑定主窗口 DOM 与 preload API
- `src/renderer/settings-renderer.ts`
  - 绑定独立设置窗口 DOM 与 preload API
- `build.mjs`
  - 构建时复制 `scratch-blocks/media` 到桌面端产物目录

## 6. 当前测试覆盖

### 单元测试

- `packages/shared`
- `apps/desktop-companion`
- `apps/desktop-companion/test/scratch-block-xml.test.mjs` 已覆盖嵌套控制积木、推荐积木默认输入 XML 和一批常用官方 opcode 模板
- `apps/desktop-companion/test/coach-service.test.mjs` 已覆盖推荐积木白名单提示词约束与坏 opcode 自动降级
- `apps/desktop-companion/test/scratch-workspace-config.test.mjs` 已覆盖本地 media 路径和只读缩放比例

### UI 自动化

`tools/verification/scripts/verify-desktop-companion-ui.mjs` 当前会验证：

- 窗口可打开
- 标题为 `Scratch AI 教练`
- `已选 Scratch` 正常显示
- `当前角色` 正常显示
- `当前角色程序` 正常显示
- 页面存在 `.scratch-workspace-host`，且能生成 Scratch SVG
- `选择 Scratch 软件`
- `打开已选 Scratch`
- `重新连接`
- `DeepSeek 设置` 独立窗口

### 推荐积木真渲染抽检

这轮额外做过一轮 Electron 真渲染 sweep：

- 使用白名单内 `93` 个常用官方 opcode 构造只读脚本 XML
- 在桌面端源码版窗口里统一挂载并实际渲染
- 结果为 `93` 个宿主全部成功出图，`0 fallback`

### 真实 Scratch 联调

`tools/verification/scripts/verify-scratch-bridge.mjs` 当前已支持：

- 空白项目
- `cat-motion`
- 本地 `.sb3` 文件加载
- 扩展加载 / 使用场景

### 打包版真实 E2E

`tools/verification/scripts/verify-desktop-companion-real-e2e.mjs` 当前已验证：

- 打包版 Companion 启动
- 自动读取已配置 Scratch 路径
- Companion 受控启动 Scratch
- 连接建立
- 真实 `.sb3` 加载
- `当前角色` 更新
- `当前角色程序` 更新
- `重新连接` 后状态恢复

## 7. 当前常用命令

桌面工具目录：

```powershell
cd apps\desktop-companion
npm run icons:generate
npm run build
npm test
npm run dev
npm run test:desktop-ui
npm run test:windows-ui
npm run package:win:single
npm run package:win:installer
npm run package:mac:app
npm run package:mac:zip
npm run package:mac:dmg
```

仓库根目录：

```powershell
node tools/verification\scripts\verify-scratch-local.mjs --exe="C:\Users\Administrator\AppData\Local\Programs\Scratch 3\Scratch 3.exe" --launch-debug --test-cdp-eval --kill-on-exit --timeout-ms=12000 --expression="window.location.href"
node tools/verification\scripts\verify-scratch-bridge.mjs --exe="C:\Users\Administrator\AppData\Local\Programs\Scratch 3\Scratch 3.exe" --kill-on-exit --timeout-ms=20000 --payload-timeout-ms=30000 --injection-attempts=5 --injection-settle-ms=6000
node tools/verification\scripts\verify-desktop-companion-ui.mjs
node tools/verification\scripts\verify-desktop-companion-real-e2e.mjs
```

## 8. 已知注意事项

- `verify-deepseek-live-seq.mjs` 这类依赖真实线上模型的脚本仍需要可用的 DeepSeek Key
- 真实 Scratch 联调深度目前仍以 Windows 为主
- macOS 现在更接近“开发可用 + UI 冒烟可用 + 内测包可出”
- 当前主路线仍然是“受控启动 Scratch + CDP 注入”，不是“用户手工打开 Scratch 后再附着”
- `apps/desktop-companion` 是 npm workspace 子包，Electron 安装在仓库根目录；源码启动请走 `npm start` / `npm run dev`，不要手工执行裸命令 `electron dist/main.js`
- 如果本机 PATH 里混入了全局旧版 Electron，直接敲 `electron dist/main.js` 可能会报 `Unexpected token {` 或 `node:fs/promises` 相关错误；当前脚本已固定走仓库本地 Electron
- 当前这台开发机上的 `npm` 在 `Node.js v22.16.0` 下会打印兼容性 warning，但不影响 `npm run build`、`npm test`、`npm start` 成功；排障时不要把它误判成主故障
- 推荐积木链路当前主要风险已收敛到“白名单外的新 opcode”；扩推荐范围时，优先同步 `src/common/scratch-block-xml.ts` 里的白名单与默认模板
- 如果真实作品里出现新的动态菜单块、扩展块或特殊 mutation，而只读渲染不完整，优先检查 `src/common/scratch-block-xml.ts` 和 `src/renderer/scratch-workspace-renderer.ts`
