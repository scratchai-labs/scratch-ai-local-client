# 主工程文档维护约定

这份文档只约束当前主线文档：

- `README.md`
- `README.zh-CN.md`
- `README.en.md`
- `CONTRIBUTING*.md`
- `CODE_OF_CONDUCT*.md`
- `SECURITY*.md`
- `SUPPORT*.md`
- `docs/*.md`
- `apps/desktop-companion/*.md`
- `tools/verification/*.md`
- `tools/verification/workflows/deepseek-teaching/*.md`

## 1. 文档层级

默认按下面顺序维护：

1. 根 `README.md`
2. `README.zh-CN.md` / `README.en.md`
3. `CONTRIBUTING*` / `CODE_OF_CONDUCT*` / `SECURITY*` / `SUPPORT*`
4. `docs/README.zh-CN.md`
5. `docs/project-structure*` / `docs/releasing*` / `docs/roadmap*`
6. `docs/architecture.zh-CN.md`
7. `docs/maintenance.zh-CN.md`
8. `apps/desktop-companion` 下的 README / 状态文档 / SOP
9. `tools/verification` 下的验证说明与工作流文档

## 2. 每份文档负责什么

### `README.md`

负责：

- 作为 GitHub 首页的双语入口
- 项目定位
- 当前支持范围
- 开源核心文档导航

这些变化后必须更新：

- 项目定位变化
- 语言入口变化
- 许可证或贡献入口变化

### `README.zh-CN.md` / `README.en.md`

负责：

- 中文 / 英文项目总览
- 下载与发布入口
- 对外文档导航

这些变化后必须更新：

- 产品定位变化
- 发布口径变化
- 对外贡献入口变化

### `CONTRIBUTING*` / `CODE_OF_CONDUCT*` / `SECURITY*` / `SUPPORT*`

负责：

- 开源协作规则
- 社区行为边界
- 安全披露路径
- 提问与支持入口

这些变化后必须更新：

- Issue / PR 流程变化
- 安全联系路径变化
- 支持入口变化

### `docs/README.zh-CN.md`

负责：

- 工程文档导航
- 目录收口
- 清理入口

这些变化后必须更新：

- 文档路径变化
- 清理脚本覆盖范围变化
- 安装包或截图收口位置变化

### `docs/architecture.zh-CN.md`

负责：

- 组件职责
- 主数据流
- 当前风险点

这些变化后必须更新：

- `desktop-companion` 内部分层变化
- `packages/shared` 职责变化
- `tools/verification` 目录或定位变化
- AI 调用链路变化

### `apps/desktop-companion/*.md`

负责：

- 桌面端开发、打包、部署、交接和现场排查

这些变化后必须更新：

- 真机验证入口变化
- 打包命令变化
- `src/main` / `src/renderer` / `src/common` 结构变化

### `tools/verification/*.md`

负责：

- 真机验证怎么跑
- 教学工作流怎么跑
- fixtures 和可再生产物怎么管理

这些变化后必须更新：

- `scripts/` 入口变化
- `workflows/deepseek-teaching/` 路径变化
- 临时目录、产物目录或 fixtures 位置变化

## 3. 维护检查清单

改完代码后，至少检查下面几项：

- 根 README 与中英文 README 的入口都可用
- 文档里的路径与真实目录一致
- 文档里的 artifact 名称、workflow 名称与当前配置一致
- 验证脚本示例是否已经带上 `tools/verification/scripts/`
- 文档是否还提到 `apps/server`、`Windows-Test` 这类已退出主线的路径
- `npm run clean:dry-run` 的描述是否和脚本输出一致
