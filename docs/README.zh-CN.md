# 工程文档索引

`docs/` 现在主要承载两类内容：

- 面向开源协作的入口文档
- 面向维护者的工程说明

## 开源入口

- 项目总览：[`../README.zh-CN.md`](../README.zh-CN.md)
- English overview: [`../README.en.md`](../README.en.md)
- 贡献指南：[`../CONTRIBUTING.zh-CN.md`](../CONTRIBUTING.zh-CN.md)
- 发布说明：[`./releasing.zh-CN.md`](./releasing.zh-CN.md)
- 路线图：[`./roadmap.zh-CN.md`](./roadmap.zh-CN.md)
- 仓库结构：[`./project-structure.zh-CN.md`](./project-structure.zh-CN.md)

## 工程文档

- 架构说明：[`./architecture.zh-CN.md`](./architecture.zh-CN.md)
- 文档维护约定：[`./maintenance.zh-CN.md`](./maintenance.zh-CN.md)
- 桌面端说明：[`../apps/desktop-companion/README.md`](../apps/desktop-companion/README.md)
- 验证工具说明：[`../tools/verification/README.zh-CN.md`](../tools/verification/README.zh-CN.md)

## 目录约定

- `../installers/`
  - 本地与 CI 产物收口目录
  - 不纳入 git
- `./assets/screenshots/`
  - 文档截图目录
- `../tools/verification/generated/`
  - 可再生产物
- `../tools/verification/artifacts/`
  - 验证产物

## 清理入口

```bash
npm run clean:dry-run
npm run clean
```
