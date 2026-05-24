# Scratch AI 教练

`Scratch AI 教练` 是一个面向 `Scratch Desktop` 的开源桌面伴随工具。它不会改动 Scratch 官方源码，而是通过受控启动、只读桥接和原版积木渲染，帮助学生在本机创作时看清“当前角色程序”，并获得 AI 生成的下一步提示。

当前仓库是拆分后的 **独立本地客户端仓**，只维护“桌面端直连 DeepSeek / 本地 fallback”的版本。
跨仓库文档、总体架构和路线图已迁到 [`scratch-ai-docs`](https://github.com/scratchai-labs/scratch-ai-docs) 统一维护。

## 为什么做这个项目

Scratch 帮很多人第一次真正喜欢上电脑、理解程序和创作。Scratch 本身也是开源项目，所以这个工具也希望按长期可维护的开源仓库方式运营，让更多老师、学生和开发者可以直接使用、反馈、贡献和继续演进。

## 当前支持范围

- 当前主线只维护 **桌面端本地基础版**
- 支持 **Windows** 和 **macOS**
- 当前主流程是“由伴随程序启动 Scratch Desktop，再建立只读连接”
- 当前不提供服务器端代码；跨仓库规划见 `scratch-ai-docs`
- 当前默认面向中文用户，但开源核心文档已提供英文版本

## 当前能力

- 自动识别常见 Scratch 安装路径，必要时允许手动选择
- 受控启动 `Scratch Desktop` 并建立连接
- 读取当前角色、项目数据和脚本结构
- 使用 `scratch-blocks` 以 Scratch 原版风格只读渲染“当前角色程序”和“推荐积木”
- 生成 AI 下一步提示，并对推荐积木做 opcode 白名单约束
- 在无线上 Key 或上游失败时回退到本地提示逻辑

## 下载与发布

当前仓库还没有自动同步 GitHub Releases，正式下载入口以 **GitHub Actions artifacts** 为准：

- Windows artifact：`scratch-desktop-companion-windows`
  - 包含 `portable .exe`
  - 包含 `installer .exe`
- macOS artifact：`scratch-desktop-companion-macos`
  - 包含 `.zip`
  - 包含 `.dmg`

更多产物命名、workflow 和分发口径见 [`docs/releasing.zh-CN.md`](docs/releasing.zh-CN.md)。

## 本地开发

```bash
git clone git@github.com:scratchai-labs/scratch-ai-local-client.git
cd scratch-ai-local-client
npm ci
npm run test
```

常用命令：

```bash
npm run build
npm run test
npm run package:win:bundle
npm run package:mac:zip
npm run package:mac:dmg
```

桌面端本地联调：

```bash
cd apps/desktop-companion
npm run dev
```

## 文档导航

- 仓库结构：[`docs/project-structure.zh-CN.md`](docs/project-structure.zh-CN.md)
- 发布与出包：[`docs/releasing.zh-CN.md`](docs/releasing.zh-CN.md)
- 跨仓库文档与规划：[`scratch-ai-docs`](https://github.com/scratchai-labs/scratch-ai-docs)
- 工程文档索引：[`docs/README.zh-CN.md`](docs/README.zh-CN.md)
- 桌面端说明：[`apps/desktop-companion/README.md`](apps/desktop-companion/README.md)
- 验证工具说明：[`tools/verification/README.zh-CN.md`](tools/verification/README.zh-CN.md)

## 参与贡献

欢迎通过 issue、PR、文档修订和教学场景反馈参与项目。

- 提交代码前请阅读 [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)
- 社区互动请遵守 [`CODE_OF_CONDUCT.zh-CN.md`](CODE_OF_CONDUCT.zh-CN.md)
- 安全问题请不要公开提 issue，见 [`SECURITY.zh-CN.md`](SECURITY.zh-CN.md)
- 使用问题和讨论入口见 [`SUPPORT.zh-CN.md`](SUPPORT.zh-CN.md)

## 未来方向

跨仓库层面的总体规划已经转到 [`scratch-ai-docs`](https://github.com/scratchai-labs/scratch-ai-docs) 统一维护。
当前仓只聚焦本地版桌面端的开发、验证和发行链路。

## 许可证

本项目采用 [`AGPL-3.0`](LICENSE) 许可证。
