# Scratch AI Coach 主工程架构说明

本文只描述当前主线里真正维护的工程：

- `apps/desktop-companion`
- `packages/shared`
- `tools/verification`

## 1. 工作区边界

当前仓库已经整理成独立的 npm workspace，只保留本地客户端主线。

主线目标只有两个：

1. 持续维护 Windows + macOS 的 `Scratch AI 教练桌面工具`
2. 保持一套可在新电脑直接 clone、安装、测试和本机出包的验证型工作区

当前产品形态固定为 **本地基础版**，不再继续推进“服务器版 + 单机版并存”路线。

服务器端和联机桌面端已经拆分到独立仓库，不再放入这个工作区。

## 2. 组件职责

### `apps/desktop-companion`

Electron 桌面工具，源码拆成三层：

- `src/main`
  主进程、Scratch 受控启动、CDP 注入、AI 请求、状态存储
- `src/renderer`
  主窗口、设置窗口、preload 和静态页面
- `src/common`
  主进程与渲染层共享类型和轻量契约

当前能力：

- 探测 Windows 与 macOS 常见 Scratch 安装位置
- 受控启动 Scratch Desktop 并附带 `--remote-debugging-port`
- 向 Scratch renderer 注入只读桥接脚本
- 读取当前角色、项目数据、脚本序列、模块摘要
- 把 `当前角色程序 / 推荐积木` 渲染成 Scratch 原版只读积木
- 推荐积木链路会先做官方 opcode 白名单归一化，AI 给出未支持或编造的 opcode 时会自动降级到安全、可渲染的官方积木
- 直接调用 DeepSeek 生成“下一步提示”

### `packages/shared`

共享领域包，负责：

- 定义桌面端使用的状态 schema
- 把 Scratch 项目 JSON 转成稳定的项目快照
- 汇总当前角色脚本、模块和扩展使用情况

### `tools/verification`

跨平台验证工具包，负责：

- `scripts/`
  真机验证、UI 自动化、打包后回归、从 `.sb3` 生成教学草稿
- `tests/`
  verification 自己的自动化测试
- `fixtures/`
  样例项目和固定测试输入
- `workflows/deepseek-teaching/`
  教学工作流与提示词模板

## 3. 主数据流

当前最重要的主链路全部发生在桌面端内部：

1. Electron 主进程启动 `SessionManager`
2. `SessionManager` 启动本地 bridge server
3. 自动探测 Scratch 可执行文件，必要时允许用户手动选择
4. 桌面工具受控启动 Scratch Desktop
5. 通过 `http://127.0.0.1:<port>/json/list` 找到真实编辑页
6. 通过 CDP 注入只读桥接脚本
7. 桥接脚本回传 `projectData`、当前角色和模块信息
8. `SessionManager` 结合 `@scratch-ai/shared` 生成项目快照和角色脚本文本摘要
9. `SessionManager` 额外把 `projectData` 转成 `currentTargetScriptXmlList`
10. `StateStore` 更新状态，渲染层先生成 workspace 宿主节点
11. `renderScratchWorkspaces(...)` 使用 `scratch-blocks` 把 XML 加载成只读 SVG
12. 用户请求 AI 提示时，桌面端直接调用 DeepSeek 或本地 fallback
13. `CoachService` 严格解析 DeepSeek 返回的 `summary + recommendation.root`，过滤不可用 opcode，并保留 `recommendedBlocks` 扁平兼容输出

关键约束：

- 不修改 Scratch 官方源码
- 运行时只读注入是当前唯一主路线
- 当前不支持“附着到用户手工启动的 Scratch”

## 4. 原版积木渲染链路

当前 1:1 积木显示不是靠样式模拟，而是靠两层转换：

1. `projectData -> Blockly XML`
2. `Blockly XML -> scratch-blocks readOnly workspace`

对应实现位置：

- `apps/desktop-companion/src/common/scratch-block-xml.ts`
  - 负责顶层脚本排序、`next`、`SUBSTACK / SUBSTACK2`、shadow input、变量/列表/广播字段，以及推荐积木白名单和默认模板
- `apps/desktop-companion/src/renderer/scratch-workspace-renderer.ts`
  - 负责初始化 `ScratchBlocks.inject(...)`、`clearWorkspaceAndLoadFromXml(...)`、尺寸自适应和只读动态菜单兜底
  - 当前只读 workspace 统一使用本地 `scratch-blocks/media`，缩放比例也已下调得更紧凑
- `apps/desktop-companion/build.mjs`
  - 负责复制 `scratch-blocks/media`

## 5. 当前风险点

- 真机验证脚本虽然已跨平台收口，但仍有部分现场运维流程只写了 Windows 口径
- macOS 正式签名、公证和发版还没有自动化
- CI 负责双平台正式产物；本地只承诺当前平台可出包
- `tools/verification/artifacts/` 不再进 git，需要通过文档和 CI artifact 回看验证结果
- 推荐积木白名单外的新 opcode，先扩 `src/common/scratch-block-xml.ts` 的默认模板，再决定是否放行到 AI 输出
- 新出现的扩展块、动态菜单块或特殊 mutation，可能还需要在只读渲染层补兜底定义
