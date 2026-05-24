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
```

macOS 对应入口：

```bash
node tools/verification/scripts/verify-scratch-local.mjs --exe="/Applications/Scratch 3.app/Contents/MacOS/Scratch 3" --launch-debug --test-cdp-eval --kill-on-exit
node tools/verification/scripts/verify-scratch-bridge.mjs --exe="/Applications/Scratch 3.app/Contents/MacOS/Scratch 3" --kill-on-exit
node tools/verification/scripts/verify-desktop-companion-ui.mjs
node tools/verification/scripts/verify-desktop-companion-real-e2e.mjs --project-file="/absolute/path/to/project.sb3"
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
