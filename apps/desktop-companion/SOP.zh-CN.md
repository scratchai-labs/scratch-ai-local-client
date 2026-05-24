# Scratch AI 教练桌面工具部署 SOP

相关文档：

- [根工作区总览](../../README.md)
- [Scratch AI 教练桌面工具说明](README.md)
- [开发接力文档](DEVELOPMENT_STATUS.zh-CN.md)
- [验证与回归说明](../../tools/verification/README.zh-CN.md)

适用对象：

- 机房管理员
- 信息老师
- 需要批量部署 `Scratch AI 教练桌面工具` 的维护人员

适用范围：

- Windows 电脑
- 当前试验分支使用“桌面工具受控启动 Scratch”路线

说明：

- 项目现在已经支持 macOS 开发、源码版 UI 自动化和内测打包
- 这份 SOP 只覆盖 Windows 现场部署，不负责 macOS 的分发和验收

## 1. 当前目标

当前现场流程不是“学生直接双击 Scratch”，而是：

1. 先启动桌面工具。
2. 由桌面工具自动识别 Scratch 路径；如果之前已经选过，就继续使用上次保存的路径。
3. 如果没识别到，手动选择 `Scratch.exe` 或 `Scratch 3.exe`。
4. 从桌面工具里点击 `打开已选 Scratch`。
5. 连接成功后查看：
   - `已选 Scratch`
   - `当前角色`
   - `当前角色程序`
   - `推荐积木`
   - `AI 下一步提示`
6. 需要更完整 AI 结果时，再到 `DeepSeek 设置` 里填写 API Key。

截至 2026-05-06，以上主流程已在本地真实 Windows / macOS 环境验证通过。

## 2. 已验证交付物

当前优先使用：

- `../../installers/ScratchDesktopCompanion-setup.exe`
- `../../installers/ScratchDesktopCompanion-portable.exe`
- `../../installers/ScratchDesktopCompanion-win-unpacked/ScratchDesktopCompanion.exe`
- `../../installers/SHA256SUMS.txt`
- `../../installers/RELEASE-NOTES.md`

说明：

- 单机或小规模部署可以优先使用 `../../installers/ScratchDesktopCompanion-setup.exe`
- DeepSeek Key 现在统一由设置页在本机填写和保存，不再依赖带内置 Key 的安装包
- 发包前可以对照 `../../installers/SHA256SUMS.txt` 校验文件，并查看 `../../installers/RELEASE-NOTES.md` 确认本次交付说明
- `win-unpacked` 是当前最稳的交付形态，优先使用根目录 `../../installers/ScratchDesktopCompanion-win-unpacked/`
- `portable.exe` 可发现场，但启动速度通常慢于 `win-unpacked`

## 3. 单机安装步骤

### 3.1 `win-unpacked`

1. 从根目录取用 `../../installers/ScratchDesktopCompanion-win-unpacked/`，再将整个目录复制到目标机器，例如：

```text
C:\ScratchDesktopCompanion\
```

2. 双击 `ScratchDesktopCompanion.exe`。
3. 确认系统托盘中出现伴随程序图标。
4. 打开主窗口，确认是否已经自动识别到 Scratch 路径。
5. 如果没有识别到，点击 `选择 Scratch 软件`，手动选中真实 exe。
6. 点击 `打开已选 Scratch`。
7. 等待 3 到 10 秒，确认状态进入 `已连接到 Scratch Desktop`，并能在主窗口看到 `已选 Scratch` 路径。

### 3.2 `portable.exe`

1. 将 `ScratchDesktopCompanion-portable.exe` 复制到固定目录，例如：

```text
C:\ScratchDesktopCompanion\ScratchDesktopCompanion-portable.exe
```

2. 双击运行。
3. 后续流程与 `win-unpacked` 一致。

### 3.3 `setup.exe`

1. 从仓库根目录取用 `../../installers/ScratchDesktopCompanion-setup.exe`，或先将它复制到目标机器。
2. 双击安装包，按向导安装到固定目录，例如 `C:\ScratchDesktopCompanion\`。
3. 安装完成后立即打开程序，确认系统托盘中出现伴随程序图标。
4. 后续验收流程与 `win-unpacked` 一致。

## 4. 验收步骤

每批机器至少抽查 3 台。

### 4.1 启动验收

1. 重启电脑并登录 Windows。
2. 确认托盘中出现伴随程序。
3. 打开主窗口，确认是否自动识别到 Scratch 路径。
4. 如果没有识别到，执行一次 `选择 Scratch 软件`。
5. 点击 `打开已选 Scratch`。
6. 观察状态是否变成 `已连接到 Scratch Desktop`。

### 4.2 角色与程序验收

在 Scratch 中分别做下面动作：

1. 打开空白项目，确认窗口已连接。
2. 查看 `当前角色` 是否与 Scratch 当前编辑角色一致。
3. 查看 `当前角色程序` 是否以接近 Scratch 原版的彩色积木显示当前脚本，而不是只剩文本。
4. 查看 `已选 Scratch` 是否仍然指向当前机器实际使用的可执行文件。
5. 切换到另一个角色，确认伴随程序窗口会刷新。
6. 打开一个本地 `.sb3` 项目，再检查 `当前角色`、`当前角色程序` 和 `推荐积木`。
7. 如果脚本里有 `重复执行 / 一直重复 / 如果`，确认其内部嵌套积木能正常显示。
8. 点击 `重新连接`，确认状态能恢复。
9. 点击 `生成下一步提示`，确认能返回 AI 建议或基础提示，并显示推荐积木。

## 5. 日常使用说明

学生：

- 当前试验阶段不要自行双击打开 `Scratch Desktop`
- 先让伴随程序完成路径识别或路径选择
- 再从伴随程序里点击 `打开已选 Scratch`
- 需要提示时点击 `生成下一步提示`

老师：

- 需要看状态时，点击托盘图标打开伴随程序窗口
- 如果首次没有路径，先执行 `选择 Scratch 软件`
- 需要线上 AI 时，到 `DeepSeek 设置` 中填写本机 API Key
- 如果状态长时间不更新，点击 `重新连接`
- 关闭窗口不会退出程序，只会缩回托盘

## 6. 故障排查

### 现象 1：一直停在 `请先选择 Scratch 软件`

检查：

- `Scratch Desktop` 是否真的已经安装
- 是否选中了正确的 `Scratch.exe` / `Scratch 3.exe`
- 桌面快捷方式是否有效

处理：

- 重新点一次 `选择 Scratch 软件`
- 优先选择真实 exe，而不是来源不明的快捷方式

### 现象 2：一直停在 `请从伴随程序打开已选 Scratch`

说明：

- 当前还没有成功通过伴随程序启动 Scratch
- 当前主路线只支持“伴随程序受控启动 + CDP 注入”，不支持附着到用户手工双击打开的 Scratch

处理：

- 确认是从伴随程序点击 `打开已选 Scratch`
- 不要让用户先手工双击 Scratch
- 如果用户已经手工打开过 Scratch，先完全退出 Scratch，再回伴随程序重新点 `打开已选 Scratch`

### 现象 3：点了 `打开已选 Scratch` 但没有连上

检查：

- Scratch 是否已被启动
- `Scratch 3.exe --remote-debugging-port=<port>` 在本机是否能正常返回 `/json/list`
- 是否真的选中了 Scratch 本体，而不是错误快捷方式

处理：

- 先点击 `重新连接`
- 仍失败时收集日志并按第 7 节回传

## 7. 日志与现场回传

当前优先查看：

```text
C:\Users\<当前用户名>\AppData\Roaming\@scratch-ai\desktop-companion\desktop-companion.log
```

兼容旧版本时，也可以检查：

```text
C:\Users\<当前用户名>\AppData\Roaming\scratch-desktop-companion\desktop-companion.log
```

如果需要把现场问题回传给开发，至少带上：

- 你使用的是 `win-unpacked` 还是 `portable.exe`
- 当前窗口顶部状态文案
- `当前角色`
- `当前角色程序`
- `推荐积木` 截图
- 最后 30 到 50 行日志
