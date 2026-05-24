# Fixtures 索引

这个目录存放 `tools/verification` 使用的固定测试夹具，按用途分为两类：

- `projects/`
  - 真实的 Scratch 项目输入样本，保留原始 `.sb3`，用于加载、解析和教学摘要生成测试。
- `cat-and-mouse-flow-sample/`
  - 基于真实项目整理出的工作流输出样例，用来固定 `brief / plan / role pack / hints / debug pack` 的结构。
- `desktop-companion-mock-state.json`
  - 桌面工具 UI 自动化测试使用的模拟状态。

当前已入库的真实项目样本：

- `projects/cat-and-a-mouse/`
  - 来自桌面文件 `Cat and a Mouse.sb3`。
  - 内部分为 `source/`、`extracted/`、`analysis/` 三层。
  - 对应的流程输出样例见 `cat-and-mouse-flow-sample/`。
