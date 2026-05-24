# 发布与出包

## 当前发布口径

当前仓库有两条和交付物相关的 GitHub Actions workflow：

- `CI`
  - 负责 `build + test`
  - 不上传可下载产物
- `Desktop Release Artifacts`
  - 在 `windows-2022` 和 `macos-latest` runner 上出包
  - 把 `installers/**` 上传为 GitHub Actions artifacts

## 当前 artifact 名称

- Windows：`scratch-desktop-companion-windows`
- macOS：`scratch-desktop-companion-macos`

默认保留 `7` 天。

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

- 当前不会自动发布到 GitHub Releases
- 当前不会自动做 macOS 签名、公证或 notarization 发布流程
- `installers/` 是产物收口目录，不纳入 git
