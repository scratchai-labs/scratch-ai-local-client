# Releasing

## Current Release Policy

The repository currently has two GitHub Actions workflows related to distributable output:

- `CI`
  - runs `build + test`
  - does not upload downloadable artifacts
- `Desktop Release Artifacts`
  - packages builds on `windows-2022` and `macos-latest`
  - uploads `installers/**` as GitHub Actions artifacts
  - keeps short-lived Actions artifacts for `main` pushes so every relevant commit can be checked
  - creates a GitHub Release and uploads Windows / macOS installers when a `v*` tag is pushed, or when the workflow is run manually with `release_version`

## GitHub Release Publishing

Use a version tag for normal releases:

```bash
git tag v0.1.0
git push origin v0.1.0
```

You can also run `Desktop Release Artifacts` manually from GitHub Actions and fill `release_version`, for example `v0.1.0`.

Formal releases attach only 4 no-key downloadable files built on the Windows and macOS runners, so users can download them from GitHub Releases. The version must look like `v0.1.0` or `v0.1.0-beta.1`.

When publishing the same version again, the workflow first deletes the existing Release assets for that tag and then uploads the new 4 files. This prevents old artifacts, checksum files, or historical `with-key` builds from remaining in the download list.

The `Source code (zip)` / `Source code (tar.gz)` entries shown by GitHub are generated automatically from the tag. They are not Release assets uploaded by this project.

## Actions Artifact Names

- Windows: `scratch-desktop-companion-windows`
- macOS: `scratch-desktop-companion-macos`

Actions artifacts currently retain for `7` days by default. GitHub Release assets are not limited by that retention period.

## Current Packaging Matrix

Windows:

- `ScratchDesktopCompanion-portable.exe`
- `ScratchDesktopCompanion-setup.exe`

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

- No `with-key` build is published or retained
- `with-key` packaging entrypoints are disabled, and the release workflow verifies that no historical `with-key` asset remains before uploading
- Formal Release assets contain only the 4 installer/portable files listed above; `SHA256SUMS.txt`, `RELEASE-NOTES.md`, and unpacked directories are not uploaded
- macOS signing and notarization are not automated yet
- `installers/` is an output collection directory and is not committed to git
