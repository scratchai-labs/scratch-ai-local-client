import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ProjectUrlLoader } from "../dist/project-url-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
const sb3FixturePath = path.join(
  workspaceRoot,
  "tools/verification",
  "fixtures",
  "projects",
  "cat-and-a-mouse",
  "source",
  "Cat and a Mouse.sb3"
);
const projectJsonFixturePath = path.join(
  workspaceRoot,
  "tools/verification",
  "fixtures",
  "projects",
  "cat-and-a-mouse",
  "extracted",
  "project.json"
);

test("ProjectUrlLoader can load a direct sb3 URL", async () => {
  const sb3Buffer = await readFile(sb3FixturePath);
  const fixtureUrl =
    "https://raw.githubusercontent.com/tesths/scratchai/refs/heads/main/tools/verification/fixtures/projects/cat-and-a-mouse/source/Cat%20and%20a%20Mouse.sb3";

  const loader = new ProjectUrlLoader(async (url) => {
    assert.equal(url, fixtureUrl);
    return new Response(sb3Buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream"
      }
    });
  });

  const loadedProject = await loader.load(fixtureUrl);

  assert.equal(loadedProject.sourceLabel, fixtureUrl);
  assert.equal(loadedProject.currentTargetName, "cheese");
  assert.equal(loadedProject.snapshot.currentTarget, "cheese");
  assert.equal(loadedProject.currentTargetPrograms.length > 0, true);
  assert.equal(loadedProject.programAreaModules.length > 0, true);
  assert.deepEqual(loadedProject.usedExtensions, []);
});

test("ProjectUrlLoader can turn a Scratch project page URL into project JSON", async () => {
  const projectJson = await readFile(projectJsonFixturePath, "utf8");
  const projectPageUrl = "https://scratch.mit.edu/projects/123456789/";
  const requestedUrls = [];

  const loader = new ProjectUrlLoader(async (url) => {
    requestedUrls.push(url);

    if (url === "https://api.scratch.mit.edu/projects/123456789") {
      return new Response(
        JSON.stringify({
          id: 123456789,
          title: "Cat and a Mouse",
          project_token: "demo-token"
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (url === "https://projects.scratch.mit.edu/123456789?token=demo-token") {
      return new Response(projectJson, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream"
        }
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  });

  const loadedProject = await loader.load(projectPageUrl);

  assert.deepEqual(requestedUrls, [
    "https://api.scratch.mit.edu/projects/123456789",
    "https://projects.scratch.mit.edu/123456789?token=demo-token"
  ]);
  assert.equal(loadedProject.sourceLabel, `Cat and a Mouse (${projectPageUrl})`);
  assert.equal(loadedProject.snapshot.projectId, "123456789");
  assert.equal(loadedProject.currentTargetName, "cheese");
  assert.equal(loadedProject.currentTargetPrograms.length > 0, true);
});
