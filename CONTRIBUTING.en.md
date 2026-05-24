# Contributing

Thanks for your interest in `Scratch AI Coach`.

This repository currently focuses on one clear goal: maintaining an open source companion app for `Scratch Desktop`, while organizing the repo for long-term public collaboration. Please align with the following rules before opening a pull request.

## Before You Start

- Read [`README.en.md`](README.en.md)
- Review the repo layout in [`docs/project-structure.en.md`](docs/project-structure.en.md)
- Check packaging and artifact policy in [`docs/releasing.en.md`](docs/releasing.en.md)
- Open an issue first for large changes, new features, or roadmap shifts

## Environment

- Node.js `22`
- npm workspaces
- Windows or macOS for development

Bootstrap:

```bash
npm ci
npm run test
```

## Good Contribution Targets

- Documentation improvements
- Bug fixes with reproduction steps, platform details, and logs
- Regression tests for packaging, workflows, and read-only rendering
- Feature proposals grounded in real classroom scenarios and success criteria

## Before You Submit

- Prefer test-first changes whenever practical
- Update docs when commands, layout, or release behavior changes
- Run the tests that match your change scope; when unsure, run `npm run test`
- Do not commit `installers/` artifacts, temporary screenshots, or local debug output

## Commit Messages

The repository currently prefers concise Chinese commit logs with a simple type prefix:

- `feat:` new feature
- `fix:` bug fix
- `improve:` documentation, structure, or engineering cleanup

Suggested format:

```text
improve: organize the open source repository baseline
Problem: README and governance files were incomplete
Approach: add README, license, contributing docs, and issue templates
```

## Pull Request Expectations

- explain the motivation
- explain the impact scope
- list the verification commands you ran
- include screenshots or navigation notes when UI/docs entrypoints changed
- clearly separate “implemented now” from “future roadmap” when touching strategy docs

## Changes We Usually Do Not Want in One Shot

- adding a new runtime, backend language, or heavy infrastructure without discussion
- combining product refactors, doc rewrites, and release overhauls in one PR
- changing Windows/macOS packaging flows without verification
- merging the future server edition into the current mainline prematurely

## Conduct and Security

- Follow [`CODE_OF_CONDUCT.en.md`](CODE_OF_CONDUCT.en.md)
- Report vulnerabilities through the private path described in [`SECURITY.en.md`](SECURITY.en.md)
- Use [`SUPPORT.en.md`](SUPPORT.en.md) for usage questions and general discussion
