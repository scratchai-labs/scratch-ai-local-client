# Releasing

## Current Release Policy

The repository currently has two GitHub Actions workflows related to distributable output:

- `CI`
  - runs `build + test`
  - does not upload downloadable artifacts
- `Desktop Release Artifacts`
  - packages builds on `windows-2022` and `macos-latest`
  - uploads `installers/**` as GitHub Actions artifacts

## Artifact Names

- Windows: `scratch-desktop-companion-windows`
- macOS: `scratch-desktop-companion-macos`

Artifacts currently retain for `7` days by default.

## Current Packaging Matrix

Windows:

- `ScratchDesktopCompanion-portable.exe`
- `ScratchDesktopCompanion-setup.exe`
- `ScratchDesktopCompanion-win-unpacked/`

macOS:

- `ScratchDesktopCompanion-mac.zip`
- `ScratchDesktopCompanion-mac.dmg`
- a local `.app` bundle can still be generated for development and smoke checks

## Local Commands

From the repo root:

```bash
npm run package:win:bundle
npm run package:mac:zip
npm run package:mac:dmg
```

From the desktop app workspace:

```bash
cd apps/desktop-companion
npm run package:win:bundle
npm run package:mac:app
npm run package:mac:zip
npm run package:mac:dmg
```

## Current Boundaries

- GitHub Releases are not published automatically yet
- macOS signing and notarization are not automated yet
- `installers/` is an output collection directory and is not committed to git
