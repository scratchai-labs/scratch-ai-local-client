# Cat and a Mouse 测试夹具

这个目录把桌面上的 `Cat and a Mouse.sb3` 固定到仓库中，作为真实 Scratch 项目的测试输入。

## 目录分类

- `source/`
  - 原始提交文件，保留项目本体，供真实 `.sb3` 加载测试直接使用。
- `extracted/`
  - 从 `.sb3` 解包得到的 `project.json`，方便直接审查角色、变量、广播和脚本结构。
- `analysis/`
  - 人工整理的结构摘要，说明该项目适合覆盖哪些测试场景。

## 项目概况

- 角色：`Cat 2`、`Mouse1`、`cheese`、`Message`
- 舞台变量：`my variable`、`Score`、`Level`
- 广播：`Game Over`、`Win`、`Level Up`
- 扩展：未使用 Scratch 扩展

## 适合作为测试输入的原因

- 这是一个真实的多角色项目，不是空白模板，能覆盖角色切换、脚本解析和监视器读取。
- 同时包含变量、广播、自制积木和提示消息层，适合验证教学摘要和工作流输入。
- `Game Over / Win / Level Up` 三条广播链路清晰，便于做事件驱动类测试。

## 相关夹具

- `../../cat-and-mouse-flow-sample/`
  - 这是基于当前项目整理出的流程输出样例。
  - 它固定的是工作流产物，不包含原始 `.sb3`。

## 使用示例

从仓库根目录执行：

```powershell
node tools/verification/scripts/verify-scratch-bridge.mjs --load-project-file="tools/verification/fixtures/projects/cat-and-a-mouse/source/Cat and a Mouse.sb3"
node tools/verification/scripts/generate-teaching-brief-from-sb3.mjs --sb3="tools/verification/fixtures/projects/cat-and-a-mouse/source/Cat and a Mouse.sb3"
```
