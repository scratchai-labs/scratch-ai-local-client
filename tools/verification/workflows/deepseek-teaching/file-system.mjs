import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function writeText(filePath, value) {
  await fs.writeFile(filePath, value, "utf8");
}

export async function loadPromptTemplates(promptsDir) {
  const fileNames = [
    "01-plan.system.txt",
    "01-plan.user.txt",
    "02-role-script.system.txt",
    "02-role-script.user.txt",
    "03-student-hints.system.txt",
    "03-student-hints.user.txt",
    "04-debug.system.txt",
    "04-debug.user.txt"
  ];

  const entries = await Promise.all(
    fileNames.map(async (name) => [name, await fs.readFile(path.join(promptsDir, name), "utf8")])
  );

  return Object.fromEntries(entries);
}
