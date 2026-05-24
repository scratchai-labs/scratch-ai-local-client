import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const REQUIRED_OPEN_SOURCE_FILES = [
  "../../../LICENSE",
  "../../../README.zh-CN.md",
  "../../../README.en.md",
  "../../../CONTRIBUTING.zh-CN.md",
  "../../../CONTRIBUTING.en.md",
  "../../../CODE_OF_CONDUCT.zh-CN.md",
  "../../../CODE_OF_CONDUCT.en.md",
  "../../../SECURITY.zh-CN.md",
  "../../../SECURITY.en.md",
  "../../../SUPPORT.zh-CN.md",
  "../../../SUPPORT.en.md",
  "../../../docs/roadmap.zh-CN.md",
  "../../../docs/roadmap.en.md",
  "../../../docs/releasing.zh-CN.md",
  "../../../docs/releasing.en.md",
  "../../../docs/project-structure.zh-CN.md",
  "../../../docs/project-structure.en.md",
  "../../../.github/ISSUE_TEMPLATE/bug_report.yml",
  "../../../.github/ISSUE_TEMPLATE/feature_request.yml",
  "../../../.github/ISSUE_TEMPLATE/config.yml",
  "../../../.github/PULL_REQUEST_TEMPLATE.md"
];

test("open source baseline files exist for contributors and maintainers", async () => {
  await Promise.all(
    REQUIRED_OPEN_SOURCE_FILES.map((relativePath) =>
      access(new URL(relativePath, import.meta.url))
    )
  );
});

test("workspace metadata and README entrypoints advertise the AGPL open source baseline", async () => {
  const [packageJson, rootReadme] = await Promise.all([
    readFile(new URL("../../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../../README.md", import.meta.url), "utf8")
  ]);

  const workspacePackage = JSON.parse(packageJson);
  assert.equal(workspacePackage.license, "AGPL-3.0");

  assert.match(rootReadme, /README\.zh-CN\.md/);
  assert.match(rootReadme, /README\.en\.md/);
  assert.match(rootReadme, /AGPL-3\.0/i);
});
