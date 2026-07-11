# 发布与出包

## 当前发布口径

当前仓库有两条和交付物相关的 GitHub Actions workflow：

- `CI`
  - 负责 `build + test`
  - 不上传可下载产物
- `Desktop Release Artifacts`
  - 在 `windows-2022` 和 `macos-latest` runner 上出包
  - 把 `installers/**` 上传为 GitHub Actions artifacts
  - `main` 分支提交会继续产出短期 Actions artifact，方便检查每次提交的 Windows / macOS 包
  - 创建 `v*` tag，或手动触发 workflow 并填写 `release_version`，会自动创建 GitHub Release 并上传 Windows / macOS 安装包

## GitHub Release 发布方式

推荐正式发布使用版本 tag：

```bash
git tag v0.1.0
git push origin v0.1.0
```

也可以在 GitHub Actions 页面手动运行 `Desktop Release Artifacts`，填写 `release_version`，例如 `v0.1.0`。

正式 Release 会附带从 Windows / macOS runner 打出的产物，用户可在 GitHub Releases 页面直接下载。版本号必须类似 `v0.1.0` 或 `v0.1.0-beta.1`。

## Actions artifact 名称

- Windows：`scratch-desktop-companion-windows`
- macOS：`scratch-desktop-companion-macos`

Actions artifact 默认保留 `7` 天；正式 GitHub Release asset 不受该保留天数限制。

## 当前产物矩阵

Windows：

- `ScratchDesktopCompanion-portable.exe`
- `ScratchDesktopCompanion-setup.exe`
- `ScratchDesktopCompanion-win-unpacked/`

macOS：

- `ScratchDesktopCompanion-mac.zip`
- `ScratchDesktopCompanion-mac.dmg`
- 本地开发仍可额外生成 `.app` 目录形态用于联调

## 本地命令

仓库根目录：

```bash
npm run package:win:bundle
npm run package:mac:zip
npm run package:mac:dmg
```

桌面端目录：

```bash
cd apps/desktop-companion
npm run package:win:bundle
npm run package:mac:app
npm run package:mac:zip
npm run package:mac:dmg
```

## 当前边界

- 当前不会自动做 macOS 签名、公证或 notarization 发布流程
- `installers/` 是产物收口目录，不纳入 git
