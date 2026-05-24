# Cat and Mouse Flow Sample

这个目录是一份“流程测试样本”，来源是外部提供的 `Cat and a Mouse.sb3`。

它的作用不是成为产品默认课程，而是验证当前教学工作流能否承载：

- `brief`
- `plan`
- `role packs`
- `student hints`
- `debug pack`

目录内容与真实工作流输出保持同一层级：

- `00-brief.json`
- `01-plan.json`
- `02-role-*.json`
- `03-student-hints.json`
- `04-debug-pack.json`
- `Source fixture in this repo`
- `../projects/cat-and-a-mouse/source/Cat and a Mouse.sb3`
- `../projects/cat-and-a-mouse/extracted/project.json`
- `../projects/cat-and-a-mouse/analysis/project-summary.json`

这份样本保留了项目中的真实角色名、变量名和广播名：

- 角色：`Mouse1`、`Cat 2`、`cheese`、`Message`、`Stage`
- 变量：`Score`、`Level`
- 广播：`Game Over`、`Win`、`Level Up`

如果后续换成别的 Scratch 项目，这个目录应该被视为可替换的 sample fixture，而不是固定模板。
