# Project Structure

This repository is an npm workspace monorepo. The maintained mainline is intentionally limited to three active units.

## Top-Level Directories

- `apps/desktop-companion`
  - the Electron desktop app
  - handles Scratch launching, bridging, AI calls, and the main UI
- `packages/shared`
  - shared schemas, project snapshots, and Scratch parsing logic
- `tools/verification`
  - verification scripts, workflow fixtures, regression tests, and teaching helpers
- `docs`
  - open source entry docs and engineering notes
- `installers`
  - local and CI output collection directory, not committed to git

## Product Boundary

- the maintained product is the local desktop edition of `Scratch AI Coach`
- there is no server code in the mainline today
- the future server edition is planned separately rather than mixed into the current branch

## Where to Read Next

- first visit: [`../README.en.md`](../README.en.md)
- contribution workflow: [`../CONTRIBUTING.en.md`](../CONTRIBUTING.en.md)
- module responsibilities: [`./architecture.zh-CN.md`](./architecture.zh-CN.md)
- maintenance rules: [`./maintenance.zh-CN.md`](./maintenance.zh-CN.md)
