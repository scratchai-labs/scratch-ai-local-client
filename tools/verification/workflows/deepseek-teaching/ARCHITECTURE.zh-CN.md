# DeepSeek 教学工作流架构

## 输入

- `brief.json`
- 工作流模型参数
- `prompts/` 下的阶段模板

## 阶段

1. `plan`
   先生成项目规划
2. `role`
   再按角色拆分脚本包
3. `hint`
   生成学生提示
4. `debug`
   生成课堂排错包

## 入口

- `tools/verification/scripts/run-deepseek-teaching-workflow.mjs`

## 输出

默认写入：

- `tools/verification/generated/DeepSeek-Scratch-教学工作流-<timestamp>/`

目录里会包含：

- `00-brief.json`
- `01-plan.json`
- `02-role-*.json`
- `03-student-hints.json`
- `04-debug-pack.json`
- `SUMMARY.md`
