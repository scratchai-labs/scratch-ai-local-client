import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateBrief,
  validatePlan,
  validateRolePack,
  validateHintsPack,
  validateDebugPack
} from "../workflows/deepseek-teaching/core.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(currentDir, "..", "fixtures", "cat-and-mouse-flow-sample");

async function readJson(fileName) {
  const filePath = path.join(fixtureDir, fileName);
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

test("cat and mouse flow sample fixture passes workflow validators", async () => {
  const brief = await readJson("00-brief.json");
  const plan = await readJson("01-plan.json");
  const hints = await readJson("03-student-hints.json");
  const debugPack = await readJson("04-debug-pack.json");
  const roleFiles = [
    "02-role-Mouse1.json",
    "02-role-Cat 2.json",
    "02-role-cheese.json",
    "02-role-Message.json",
    "02-role-Stage.json"
  ];
  const rolePacks = await Promise.all(roleFiles.map((fileName) => readJson(fileName)));

  const briefValidation = validateBrief(brief);
  assert.equal(briefValidation.ok, true, briefValidation.errors.join("; "));

  const planValidation = validatePlan(plan, brief);
  assert.equal(planValidation.ok, true, planValidation.errors.join("; "));

  for (const role of brief.roles) {
    const pack = rolePacks.find((item) => item.name === role.name);
    assert.ok(pack, `missing role pack for ${role.name}`);
    const validation = validateRolePack(pack, role);
    assert.equal(validation.ok, true, `${role.name}: ${validation.errors.join("; ")}`);
  }

  const hintsValidation = validateHintsPack(hints, brief, plan);
  assert.equal(hintsValidation.ok, true, hintsValidation.errors.join("; "));

  const debugValidation = validateDebugPack(debugPack, brief);
  assert.equal(debugValidation.ok, true, debugValidation.errors.join("; "));
});

test("cat and mouse flow sample is marked as a sample-only workflow run", async () => {
  const brief = await readJson("00-brief.json");
  assert.ok(
    brief.constraints.includes("这个样本只用于跑流程，不当作产品默认课程模板"),
    "sample-only constraint is missing"
  );
});
