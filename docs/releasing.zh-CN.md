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

正式 Release 只附带 4 个无 Key 可下载文件，用户可在 GitHub Releases 页面直接下载。版本号必须类似 `v0.1.0` 或 `v0.1.0-beta.1`。

重复发布同一个版本时，workflow 会先清空该 tag 已有的 Release assets，再上传新的 4 个文件，避免旧产物、校验文件或历史 `with-key` 产物继续挂在下载区。

GitHub 页面自动显示的 `Source code (zip)` / `Source code (tar.gz)` 是 tag 自动生成的源码入口，不是本项目上传的 Release asset。

## Actions artifact 名称

- Windows：`scratch-desktop-companion-windows`
- macOS：`scratch-desktop-companion-macos`

Actions artifact 默认保留 `7` 天；正式 GitHub Release asset 不受该保留天数限制。

## 当前产物矩阵

Windows：

- `ScratchDesktopCompanion-portable.exe`
- `ScratchDesktopCompanion-setup.exe`

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

- 不发布、也不保留任何 `with-key` 预置 Key 版本
- `with-key` 打包入口已禁用；发布链路会在上传前校验不得残留历史 `with-key` asset
- 正式 Release asset 只上传上述 4 个安装/便携文件，不额外上传 `SHA256SUMS.txt`、`RELEASE-NOTES.md` 或未打包目录
- 当前不会自动做 macOS 签名、公证或 notarization 发布流程
- `installers/` 是产物收口目录，不纳入 git
