# DeepSeek 教学工作流说明

这个目录存放把 Scratch 项目整理成教学材料的工作流和提示词模板。

## 入口

从仓库根目录执行：

```powershell
node tools/verification\scripts\generate-teaching-brief-from-sb3.mjs --sb3="C:\path\to\project.sb3"
node tools/verification\scripts\run-deepseek-teaching-workflow.mjs
node tools/verification\scripts\run-deepseek-teaching-workflow.mjs --brief="C:\path\to\my-brief.json"
```

## 目录说明

- `config.mjs`
  工作流参数和默认输出目录
- `core.mjs`
  模板渲染与结构校验
- `stages.mjs`
  规划、分角色、提示和排错阶段组装
- `workflow.mjs`
  整体执行入口
- `prompts/`
  各阶段 system/user 提示词

默认样例 brief 在：

- `../../fixtures/deepseek-workflow-brief.example.json`

默认输出目录在仓库根下：

- `tools/verification/generated/DeepSeek-Scratch-教学工作流-<timestamp>/`
