# Scratch AI Coach

`Scratch AI Coach` is an open source companion app for `Scratch Desktop`. It does not modify the upstream Scratch source code. Instead, it launches Scratch in a controlled way, injects a read-only bridge, renders real Scratch-style blocks, and generates next-step hints from the learner's current project.

This repository is the split-out **standalone local client** repo.
Cross-repo docs, architecture notes, and planning now live in [`scratch-ai-docs`](https://github.com/scratchai-labs/scratch-ai-docs/blob/main/README.en.md).

## Why This Project Exists

Scratch helped many people fall in love with computers for the first time. Since Scratch itself is open source, this project is being organized as a long-term open source repository too, so teachers, learners, and contributors can use it, review it, and evolve it in public.

## Current Scope

- The maintained product line is the **local desktop edition**
- Supported platforms: **Windows** and **macOS**
- The current workflow is “launch Scratch Desktop from the companion app, then attach a read-only bridge”
- No server code is included in this repository; cross-repo planning lives in `scratch-ai-docs`
- Chinese is the primary product language today, while the core open source docs are bilingual

## What It Does Today

- Detects common Scratch installation paths, with manual fallback selection
- Launches `Scratch Desktop` in a controlled session and connects to it
- Reads the current target, project data, and script structure
- Renders the current scripts and recommended blocks with real `scratch-blocks`
- Generates AI next-step hints with an opcode allowlist for block safety
- Falls back to local hints when no online API key is configured

## Downloads and Release Flow

The official download entrypoint is **GitHub Releases**. The export rule is fixed to 4 no-key packages:

- Windows portable: `ScratchDesktopCompanion-portable.exe`
- Windows installer: `ScratchDesktopCompanion-setup.exe`
- macOS portable: `ScratchDesktopCompanion-mac.zip`
- macOS installer package: `ScratchDesktopCompanion-mac.dmg`

The `main` branch still keeps short-lived GitHub Actions artifacts so each commit's packaging output can be checked. Formal Releases do not upload extra checksum files, release-note files, unpacked directories, or any `with-key` build.

See [`docs/releasing.en.md`](docs/releasing.en.md) for workflow names, artifact naming, and packaging details.

## Local Development

```bash
git clone git@github.com:scratchai-labs/scratch-ai-local-client.git
cd scratch-ai-local-client
npm ci
npm run test
```

Common commands:

```bash
npm run build
npm run test
npm run package:win:bundle
npm run package:mac:zip
npm run package:mac:dmg
```

Run the desktop app locally:

```bash
cd apps/desktop-companion
npm run dev
```

## Documentation

- Project structure: [`docs/project-structure.en.md`](docs/project-structure.en.md)
- Releasing: [`docs/releasing.en.md`](docs/releasing.en.md)
- Cross-repo docs and planning: [`scratch-ai-docs`](https://github.com/scratchai-labs/scratch-ai-docs/blob/main/README.en.md)
- Development workflow: [`scratch-ai-docs/docs/development-workflow.zh-CN.md`](https://github.com/scratchai-labs/scratch-ai-docs/blob/main/docs/development-workflow.zh-CN.md)
- Documentation guide: [`scratch-ai-docs/docs/documentation-guide.zh-CN.md`](https://github.com/scratchai-labs/scratch-ai-docs/blob/main/docs/documentation-guide.zh-CN.md)
- Engineering docs index: [`docs/README.zh-CN.md`](docs/README.zh-CN.md)
- Desktop app docs: [`apps/desktop-companion/README.md`](apps/desktop-companion/README.md)
- Verification tooling docs: [`tools/verification/README.zh-CN.md`](tools/verification/README.zh-CN.md)

## Contributing

Contributions are welcome through issues, pull requests, docs improvements, and classroom feedback.

- Read [`CONTRIBUTING.en.md`](CONTRIBUTING.en.md) before submitting code
- Follow [`CODE_OF_CONDUCT.en.md`](CODE_OF_CONDUCT.en.md) in community spaces
- Do not report security issues publicly; see [`SECURITY.en.md`](SECURITY.en.md)
- Support and discussion guidance lives in [`SUPPORT.en.md`](SUPPORT.en.md)

## Future Direction

Cross-repo planning now lives in [`scratch-ai-docs`](https://github.com/scratchai-labs/scratch-ai-docs/blob/main/README.en.md).
This repository stays focused on the standalone desktop client, its packaging flow, and verification tooling.

## License

This project is licensed under [`AGPL-3.0`](LICENSE).
