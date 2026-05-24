# Scratch AI 教练桌面工具部署 SOP

相关文档：

- [根工作区总览](../README.md)
- [验证与回归说明](README.zh-CN.md)
- [Scratch AI 教练桌面工具说明](../apps/desktop-companion/README.md)
- [开发接力文档](../apps/desktop-companion/DEVELOPMENT_STATUS.zh-CN.md)

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
   - `AI 下一步提示`
6. 需要更完整 AI 结果时，再到 `DeepSeek 设置` 里填写 API Key。

截至 2026-05-06，以上主流程已在本地真实 Windows / macOS 环境验证通过。

## 2. 已验证交付物

当前优先使用：

- `../installers/ScratchDesktopCompanion-setup.exe`
- `../installers/ScratchDesktopCompanion-portable.exe`
- `../installers/SHA256SUMS.txt`
- `../installers/RELEASE-NOTES.md`
- `../apps/desktop-companion/release-single/win-unpacked/ScratchDesktopCompanion.exe`
- `../apps/desktop-companion/release-single/ScratchDesktopCompanion-portable.exe`

## 3. 单机安装步骤

### 3.1 `win-unpacked`

1. 将 `win-unpacked` 目录复制到目标机器，例如：

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

1. 从仓库根目录取用 `../installers/ScratchDesktopCompanion-setup.exe`，或先将它复制到目标机器。
2. 双击安装包，按向导安装到固定目录，例如 `C:\ScratchDesktopCompanion\`。
3. 安装完成后立即打开程序，确认系统托盘中出现伴随程序图标。
4. 后续验收流程与 `win-unpacked` 一致。

## 4. 验收步骤

### 4.1 启动验收

1. 重启电脑并登录 Windows。
2. 确认托盘中出现伴随程序。
3. 打开主窗口，确认是否自动识别到 Scratch 路径。
4. 如果没有识别到，执行一次 `选择 Scratch 软件`。
5. 点击 `打开已选 Scratch`。
6. 观察状态是否变成 `已连接到 Scratch Desktop`。

### 4.2 角色与程序验收

1. 打开空白项目，确认窗口已连接。
2. 查看 `当前角色` 是否与 Scratch 当前编辑角色一致。
3. 查看 `当前角色程序` 是否能列出脚本序列。
4. 查看 `已选 Scratch` 是否仍然指向当前机器实际使用的可执行文件。
5. 切换到另一个角色，确认伴随程序窗口会刷新。
6. 打开一个本地 `.sb3` 项目，再检查 `当前角色` 和 `当前角色程序`。
7. 点击 `重新连接`，确认状态能恢复。
8. 点击 `生成下一步提示`，确认能返回 AI 建议或基础提示。

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

## 6. 日志与现场回传

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
- 最后 30 到 50 行日志
