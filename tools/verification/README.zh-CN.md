# Verification 说明

`tools/verification` 是当前主线的跨平台验证工具包，主要服务 Windows / macOS 的 `Scratch AI 教练桌面工具`，统一放真机验证、UI 自动化、教学工作流和固定 fixtures。

## 目录结构

- `scripts/`
  真机验证、UI 自动化、从 `.sb3` 生成教学草稿、批量回归入口
- `tests/`
  verification 自己的自动化测试
- `fixtures/`
  固定测试输入和样例项目
- `workflows/deepseek-teaching/`
  教学工作流、提示词模板和工作流文档

## 常用命令

从仓库根目录执行：

```powershell
node tools/verification\scripts\verify-scratch-local.mjs --exe="C:\Path\To\Scratch 3.exe" --launch-debug --test-cdp-eval --kill-on-exit
node tools/verification\scripts\verify-scratch-bridge.mjs --exe="C:\Path\To\Scratch 3.exe" --kill-on-exit
node tools/verification\scripts\verify-scratch-bridge.mjs --exe="C:\Path\To\Scratch 3.exe" --scenario=cat-motion --kill-on-exit
node tools/verification\scripts\verify-desktop-companion-ui.mjs
node tools/verification\scripts\verify-desktop-companion-real-e2e.mjs
node tools/verification\scripts\generate-teaching-brief-from-sb3.mjs --sb3="C:\Path\To\Project.sb3"
node tools/verification\scripts\run-deepseek-teaching-workflow.mjs
npm run test:recommendation-render-contract
npm run verify:deepseek-strict
npm run verify:render-completeness-50
node tools/verification/scripts/verify-multi-goal-deepseek-coaching.mjs --packaged=false --goal-suite=variable-visibility --follow-steps=1
```

macOS 对应入口：

```bash
node tools/verification/scripts/verify-scratch-local.mjs --exe="/Applications/Scratch 3.app/Contents/MacOS/Scratch 3" --launch-debug --test-cdp-eval --kill-on-exit
node tools/verification/scripts/verify-scratch-bridge.mjs --exe="/Applications/Scratch 3.app/Contents/MacOS/Scratch 3" --kill-on-exit
node tools/verification/scripts/verify-desktop-companion-ui.mjs
node tools/verification/scripts/verify-desktop-companion-real-e2e.mjs --project-file="/absolute/path/to/project.sb3"
npm run test:recommendation-render-contract
npm run verify:deepseek-strict
npm run verify:render-completeness-50
```

## 自动化覆盖

当前已覆盖：

- verification 自己的自动化测试
- 桌面端源码版 UI 自动化
- 打包版 UI 冒烟
- Scratch 本机 CDP 连通性验证
- Scratch bridge 基线和动态场景验证
- 本地 `.sb3` 读取与教学草稿生成
- 打包版真实端到端 E2E
- DeepSeek Beta Strict 工具兼容性、扁平节点编译与 XML 生成探针
- 推荐积木真实 Electron / scratch-blocks 渲染合同：94 个单积木、71 个结构化 root、4908 个合法关系 pair、params 协议变体、5 个组合输入槽变体、变量名可见性和 terminal 非法连接
- 第二组 10 个变量型真实目标，可逐项比较 XML 变量字段次数与 Blockly 可见文字次数，发现空圆形即判失败
- 50 个不同本课目标的推荐积木真实渲染守门，覆盖变量、列表、广播、声音、画笔、侦测、运算、控制和游戏交互；缺 XML、缺 SVG、进入 fallback/degraded 或变量文字不可见会返回失败码，目标语义 weak 默认只记录到报告

## 推荐积木专项验证

- `npm run test:recommendation-render-contract` 不需要 DeepSeek Key，CI 在 Ubuntu 上通过 `xvfb-run` 执行；该脚本会逐项枚举推荐 opcode、合法结构关系、params 协议变体和组合输入槽（例如 `重复执行` 次数填变量、算式或 reporter），任何 XML 缺块、fallback、degraded 或非 shadow 积木缺失都会失败。
- `npm run verify:render-completeness-50` 会真实打开 Companion + Scratch，逐个输入 50 个目标并读取推荐区 DOM；默认使用源码版 Companion，产物写入 `multi-goal-deepseek-screenshots/`。如果要把目标相关性 weak 也作为失败，请追加 `-- --fail-on-weak=true` 或直接运行脚本参数。
- `npm run verify:deepseek-strict` 需要桌面设置中已保存的 Key，只用于人工验证当前 Flash/Pro 模型的 Beta Strict 兼容性。
- Strict 探针失败时，先检查工具参数或当前模型兼容性；客户端运行时会拒绝非法 DeepSeek 结果并使用本地结构化提示。

## 产物与清理

下面这些目录都属于可再生产物，不进入 git：

- `generated/`
- `artifacts/`
- `tmp-*`
- `last-*.json`

统一清理入口：

```bash
npm run clean
```

## 教学工作流

教学工作流说明见：

- [README](workflows/deepseek-teaching/README.zh-CN.md)
- [ARCHITECTURE](workflows/deepseek-teaching/ARCHITECTURE.zh-CN.md)

默认样例 brief 位于：

- `fixtures/deepseek-workflow-brief.example.json`
