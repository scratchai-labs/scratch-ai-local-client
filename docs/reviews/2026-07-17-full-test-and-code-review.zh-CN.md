# 2026-07-17 全量测试与架构设计 Code Review

## 1. 结论

- 自动化测试、组件测试、源码 UI 点击、当前 macOS 打包产物真实 Electron → Scratch 点击链路均通过。
- TDD 发现并修复 1 个真实交互缺陷：清除 DeepSeek Key 后，“清除 Key”按钮会被异步收尾逻辑错误重新启用。
- 未发现 P0 阻断问题；当前主要风险集中在大模块耦合、主进程行为测试不足、真实 UI 回归未进入默认 CI、验证合同资源消耗较高，以及可访问性反馈不足。
- 本轮没有调用真实 DeepSeek API，避免读取个人 Key、产生费用或污染真实配置；Windows 真实桌面点击受当前 macOS 主机限制，未执行。

## 2. 测试环境

- 日期：2026-07-17
- 系统：macOS 26.5.2 / arm64
- Node.js：v22.16.0
- npm：10.9.2
- Electron：41.3.0
- Scratch：`/Applications/Scratch 3.app/Contents/MacOS/Scratch 3`

## 3. 覆盖矩阵与结果

| 层级 | 命令/入口 | 覆盖内容 | 结果 |
| --- | --- | --- | --- |
| Unit / Protocol | `packages/shared` tests | Schema、推荐结构协议、项目摘要、扩展映射 | 14/14 通过 |
| Unit / Integration | `tools/verification` tests | 工作流、fixture、CI/release 配置、Electron/Scratch 路径、运行时探测 | 37/37 通过 |
| Unit / Component | `apps/desktop-companion` tests | CoachService、SessionManager、配置、IPC 契约、渲染、打包脚本 | 250/250 通过 |
| Workspace regression | `npm test` | 三个 workspace 全量回归 | 301/301 通过 |
| Coverage probe | Node test coverage | 行/分支/函数方向性覆盖 | shared 90.77% / 65.97% / 94.64%；verification 83.57% / 59.45% / 87.76%；desktop aggregate 60.62% / 70.06% / 50.44% |
| Scratch render contract | `npm run test:recommendation-render-contract` | 真实 Scratch Blocks Renderer 合同 | 5,103 个合同用例通过 |
| Source UI click | `verify-desktop-companion-ui.mjs` | 选择 Scratch、打开、重连、打开设置、真实 DOM 点击与截图 | 通过 |
| Packaged real E2E | `verify-desktop-companion-real-e2e.mjs` | 当前 macOS app、真实 Scratch、加载 `.sb3`、重连、设置保存 | 通过 |
| macOS packaging | `npm run desktop:package:mac:app` | 当前源码 arm64 app 构建 | 通过；未签名内测包 |

> desktop coverage 会把构建产物和部分脚本计入统计，因此只适合作为缺口探针，不应直接作为质量门禁。

## 4. TDD：RED → GREEN

### 行为

Given 已保存本机 DeepSeek Key，When 用户点击“清除 Key”且最新状态已变为未配置，Then “清除 Key”按钮必须继续禁用。

### RED

新增 `apps/desktop-companion/test/settings-renderer.test.mjs`，通过最小 fake DOM 与公开 renderer 交互复现：

```text
Expected: true
Actual:   false
```

根因位于 `apps/desktop-companion/src/renderer/settings-renderer.ts`：状态事件已将按钮禁用，但 `.finally()` 内的延迟回调又无条件设置 `disabled = false`。

### GREEN

renderer 记录最新合法状态，异步操作结束时按 `aiStatus` 与 `aiCustomKeyConfigured` 恢复按钮状态。新增测试通过，desktop 测试由 249 增至 250 项。

## 5. BDD / 真实 UI 点击证据

### 场景 A：源码 Mock UI

- Given Electron 使用隔离 mock state 启动。
- When 依次真实触发 `选择 Scratch 软件`、`打开已选 Scratch`、`重新连接`、`DeepSeek 设置`。
- Then 三个主操作按钮点击后立即禁用；状态详情分别更新为 automation action；设置窗口打开且模型为 `deepseek-v4-flash`。
- 结果：通过。

### 场景 B：当前打包 App + 真实 Scratch

- Given 当前源码重新打包为 macOS arm64 app，并使用 `/tmp` 隔离用户目录。
- When 点击“打开已选 Scratch”。
- Then 日志出现 `Scratch launched pid=` 与 `Bridge script injected via CDP`，主窗口进入“已连接到 Scratch Desktop”。
- When 通过真实 Scratch CDP 加载 `Cat and a Mouse.sb3`。
- Then 当前角色更新为 `Cat 2`，识别 5 个 target，并显示两段当前角色程序。
- When 点击“重新连接”。
- Then reinject 成功，项目状态仍保持。
- When 打开设置，将提示方式从 `auto` 改为 `manual` 并保存。
- Then UI 回显 `manual`，隔离配置文件持久化 `aiHintTriggerMode: manual`。
- 结果：通过。

## 6. Code Review Findings

### P0

无。

### P1-1 默认 CI 没有覆盖真实 UI / 打包 E2E

- 位置：`package.json:20-25`、`apps/desktop-companion/package.json:23-25`、`.github/workflows/ci.yml`
- 证据：默认 `npm test` 只运行 Node tests；CI 额外运行 Renderer 合同，但没有启动真实 Companion/Scratch 或 packaged E2E。
- 影响：窗口生命周期、preload、IPC、真实按钮、Scratch 启动/重连可能在单元测试全绿时回归。
- 建议：macOS runner 增加隔离的源码 UI smoke；发布前增加 packaged E2E。真实 Scratch 难以稳定安装时，至少把 mock Electron UI 纳入 CI。

### P1-2 核心业务模块过大，变化会跨职责扩散

- 位置：
  - `apps/desktop-companion/src/common/scratch-block-xml.ts`：2,149 行
  - `apps/desktop-companion/src/main/coach-service.ts`：1,734 行
  - `apps/desktop-companion/src/main/session-manager.ts`：1,128 行
  - `apps/desktop-companion/src/main/main.ts`：666 行
- 影响：协议、AI 调用、fallback、XML 编译、窗口/IPC/托盘与会话时序互相牵连；测试难以只穿过一个稳定接口。
- 建议：优先按已有真实 seam 拆分，而不是新增抽象层：
  1. `scratch-block-xml` → 输入值编译、opcode body、结构连接、变量声明。
  2. `coach-service` → DeepSeek client、结果归一化、fallback policy、orchestrator。
  3. `main.ts` → window/tray lifecycle、IPC router、bootstrap composition root。

### P1-3 主进程 IPC 测试主要验证源码字符串，不验证运行行为

- 位置：`apps/desktop-companion/test/main-ipc-handlers.test.mjs:5-11`
- 证据：读取 `main.ts` 后使用正则断言函数名与 channel 字符串。
- 影响：handler 参数、返回值、错误传播、窗口关闭后的行为即使失效，测试仍可能通过。
- 建议：抽出可注入依赖的 `registerDesktopCompanionIpc`，用 fake `ipcMain` 做行为测试；`main.ts` 只负责装配。

### P2-1 Renderer 合同测试资源消耗偏高

- 位置：`tools/verification/scripts/verify-recommendation-render-contract.mjs:290-306, 813-839`
- 证据：4,908 个关系 pair 按 40 个 host 批量真实渲染；本机约 16 分钟，Renderer RSS 观察到约 2–2.5 GB，pair 阶段长期无进度输出。
- 影响：CI 时间和内存压力高，失败时定位成本大。
- 建议：按 relation/opcode 分片、每批显式 dispose workspace、输出批次进度；PR 跑代表集，定时任务跑穷举集。

### P2-2 StateStore 暴露内部可变引用

- 位置：`apps/desktop-companion/src/main/state-store.ts:27-64`
- 证据：`getState()` 直接返回内部对象；`setState()` 接受并保存外部对象；`update()` 手工维护必填字段。
- 影响：调用方可无事件地修改状态；新增 schema 字段时容易漏入手工兜底清单。
- 建议：至少返回浅只读快照并复制输入；中期将 update 收敛为 schema 驱动的纯 reducer。

### P2-3 配置损坏与配置缺失被当成同一种情况

- 位置：`apps/desktop-companion/src/main/scratch-config-store.ts:178-190`
- 证据：读取或 JSON 解析的所有异常都返回空对象。
- 影响：配置损坏会静默退回默认状态，用户和维护者缺少诊断线索。
- 建议：只对 `ENOENT` 返回空配置；JSON 解析失败写脱敏日志，并提供“配置已损坏，已使用默认值”的可见提示。

### P2-4 验证脚本重复承担 CDP、选择器、断言和报告职责

- 位置：`tools/verification/scripts/verify-desktop-companion-ui.mjs`、`verify-desktop-companion-real-e2e.mjs`，以及多个 1,000–2,000 行专项脚本。
- 影响：选择器或等待策略修改需要同步多份脚本，容易漂移并产生偶发失败。
- 建议：提取 `cdp-client`、`companion-page-probe`、`scratch-page-probe`、`artifact-writer` 四个深模块；场景脚本只保留 Given/When/Then 编排。

### P2-5 动态反馈的可访问性不足

- 位置：`apps/desktop-companion/src/renderer/index.html:656, 662-666`、`apps/desktop-companion/src/renderer/settings.html:241, 257-258`
- 证据：错误、AI 状态、保存反馈没有 `aria-live` / `role=status|alert`；两页也没有显式 `:focus-visible` 设计。
- 影响：屏幕阅读器无法可靠获知状态变化；键盘用户焦点反馈依赖浏览器默认样式。
- 建议：成功/状态使用 `role="status" aria-live="polite"`，错误使用 `role="alert"`；增加高对比 `:focus-visible`。

### P2-6 设置页动作信息密度高，忙碌状态不够直观

- 位置：`apps/desktop-companion/src/renderer/settings.html:244-281`、`settings-renderer.ts:114-245`
- 证据：Key 的测试、保存、清除并排；异步期间按钮会禁用，但文案不变，也没有“测试中/保存中”。
- 影响：低龄用户或家长难判断当前动作是否已触发、是否完成。
- 建议：按“测试 → 保存 → 危险操作”分组；异步期间同步更新按钮文案与持久状态行。

### P2-7 本地桥接服务使用通配 CORS

- 位置：`apps/desktop-companion/src/main/bridge-server.ts:47-75`
- 证据：`Access-Control-Allow-Origin: *`，写入接口依赖随机 `x-monitor-token`。
- 影响：当前随机 token + 127.0.0.1 已形成主要保护，但通配来源扩大了 token 泄露后的利用面。
- 建议：确认 Scratch `file://` 请求的 Origin 行为后，将允许来源收紧到 `null`/受控来源；至少对非预期 Origin 记录并拒绝。

### P3

- `tools/verification` 多数脚本没有统一、安全的 `--help`，误加参数仍可能直接执行真实流程。
- 主界面“本课目标” placeholder 偏长；可缩短示例，把固定说明留在帮助文案。
- 真实 UI smoke 目前使用 DOM `button.click()`，能验证渲染/IPC，但不覆盖鼠标坐标、遮挡和系统级焦点问题；发布前仍建议人工走一次可见窗口点击。

## 7. 优点

- ADR 清晰固定了“单机直连、只读辅导、只发送结构化摘要、客户端校验推荐结构”等核心边界。
- 推荐积木协议拥有 schema、Strict 编译、XML 合同与真实 Renderer 穷举验证，防线完整。
- SessionManager / CoachingSession 已覆盖大量去重、自动刷新、空项目、Key 与目标持久化时序。
- UI 验证脚本使用隔离用户目录，真实 E2E 没有污染个人配置。
- 日志脱敏、随机 bridge token、context isolation、preload API 已形成基本安全边界。

## 8. 未执行项

- 真实 DeepSeek Strict / 50 目标在线验证：会读取本机已保存 Key、产生网络调用和费用，本轮未执行。
- Windows 原生安装包与真实点击：当前执行机为 macOS；本轮覆盖了 Windows 路径、打包配置与脚本单测，但不能替代 Windows 实机验收。
- macOS 签名、公证、DMG 安装：本轮构建为未签名 `dir` 内测包，只验证 app 可启动和真实 E2E。
