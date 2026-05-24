# 项目结构

当前仓库是拆分后的独立 npm workspace，只维护本地直连版桌面客户端相关工程。

## 顶层目录

- `apps/desktop-companion`
  - Electron 桌面端
  - 负责 Scratch 连接、桥接、AI 调用和主界面
- `packages/shared`
  - 共享 schema、项目快照和 Scratch 项目解析逻辑
- `tools/verification`
  - 验证脚本、workflow fixtures、回归测试与教学辅助工作流
- `docs`
  - 开源入口文档与工程说明
- `installers`
  - 本地和 CI 的产物收口目录，不纳入 git

## 当前产品边界

- 维护中的产品是 `Scratch AI 教练` 桌面端本地基础版
- 当前仓库不包含服务器端和联机桌面端代码
- 服务器端与联机桌面端已拆分到各自独立仓库

## 阅读建议

- 第一次访问仓库：先看 [`../README.zh-CN.md`](../README.zh-CN.md)
- 想参与协作：看 [`../CONTRIBUTING.zh-CN.md`](../CONTRIBUTING.zh-CN.md)
- 想理解模块职责：看 [`./architecture.zh-CN.md`](./architecture.zh-CN.md)
- 想看维护约定：看 [`./maintenance.zh-CN.md`](./maintenance.zh-CN.md)
