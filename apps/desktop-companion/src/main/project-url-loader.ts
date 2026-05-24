import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

import {
  getUsedExtensionsFromProject,
  projectJsonToSnapshot,
  summarizeProgramAreaModulesFromProject
} from "@scratch-ai/shared";

import type { ProgramAreaModule, ProjectSnapshot } from "../common/types";

const require = createRequire(import.meta.url);
const yauzl = require("yauzl");

interface ScratchProjectMetadata {
  id?: number | string;
  title?: string;
  project_token?: string;
}

export interface LoadedProjectFromUrl {
  snapshot: ProjectSnapshot;
  currentTargetName?: string;
  currentTargetIsStage: boolean;
  currentTargetPrograms: string[];
  programAreaModules: ProgramAreaModule[];
  usedExtensions: string[];
  loadedExtensions: string[];
  sourceLabel: string;
}

function normalizeUrl(input: string) {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) {
    throw new Error("请先输入 sb3 网页地址。");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error("输入的地址不是合法的网页 URL。");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("目前只支持 http 或 https 的网页地址。");
  }

  return {
    raw: trimmed,
    url: parsedUrl
  };
}

function isVisibleBlock(block: unknown) {
  return Boolean(
    block &&
      typeof block === "object" &&
      typeof (block as { opcode?: string }).opcode === "string" &&
      (block as { shadow?: boolean }).shadow !== true
  );
}

function countVisibleBlocks(target: unknown) {
  if (!target || typeof target !== "object") {
    return 0;
  }

  return Object.values((target as { blocks?: Record<string, unknown> }).blocks ?? {}).filter(isVisibleBlock).length;
}

function countTopLevelScripts(target: unknown) {
  if (!target || typeof target !== "object") {
    return 0;
  }

  return Object.values((target as { blocks?: Record<string, unknown> }).blocks ?? {}).filter(
    (block) =>
      isVisibleBlock(block) &&
      Boolean((block as { topLevel?: boolean }).topLevel)
  ).length;
}

function pickSuggestedCurrentTargetName(project: unknown) {
  if (!project || typeof project !== "object") {
    return undefined;
  }

  const targets = Array.isArray((project as { targets?: unknown[] }).targets)
    ? [...((project as { targets?: unknown[] }).targets as unknown[])]
    : [];

  const candidates = targets
    .filter((target) => target && typeof target === "object")
    .map((target) => ({
      name: typeof (target as { name?: unknown }).name === "string" ? String((target as { name?: string }).name) : "",
      isStage: Boolean((target as { isStage?: boolean }).isStage),
      blockCount: countVisibleBlocks(target),
      scriptCount: countTopLevelScripts(target)
    }))
    .filter((target) => target.name);

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((left, right) => {
    if (left.isStage !== right.isStage) {
      return left.isStage ? 1 : -1;
    }
    if (left.blockCount !== right.blockCount) {
      return right.blockCount - left.blockCount;
    }
    if (left.scriptCount !== right.scriptCount) {
      return right.scriptCount - left.scriptCount;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });

  return candidates[0]?.name || undefined;
}

function deriveCurrentTargetPrograms(snapshot: ProjectSnapshot) {
  const currentTargetSprite = snapshot.sprites.find((sprite) => sprite.name === snapshot.currentTarget);
  if (!currentTargetSprite) {
    return [];
  }

  return currentTargetSprite.scripts
    .map((script) => script.blockSequence.join(" -> ").trim())
    .filter(Boolean);
}

function isScratchProjectPage(url: URL) {
  return url.hostname === "scratch.mit.edu" && /^\/projects\/\d+(?:\/|$)/.test(url.pathname);
}

function isScratchProjectMetadataUrl(url: URL) {
  return url.hostname === "api.scratch.mit.edu" && /^\/projects\/\d+(?:\/|$)/.test(url.pathname);
}

function isScratchProjectJsonUrl(url: URL) {
  return url.hostname === "projects.scratch.mit.edu" && /^\/\d+(?:\/|$)/.test(url.pathname);
}

function getScratchProjectId(url: URL) {
  const match = url.pathname.match(/\/projects\/(\d+)/) ?? url.pathname.match(/^\/(\d+)/);
  return match?.[1] ?? null;
}

function isZipBuffer(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

function tryParseProjectJsonFromText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const looksLikeJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksLikeJson) {
    return null;
  }

  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { targets?: unknown[] }).targets)) {
    return null;
  }

  return parsed;
}

function extractProjectJsonFromSb3Buffer(buffer: Buffer) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError: Error | null, zipFile: any) => {
      if (openError) {
        reject(openError);
        return;
      }

      if (!zipFile) {
        reject(new Error("无法读取 sb3 压缩包。"));
        return;
      }

      let resolved = false;
      const rejectOnce = (error: unknown) => {
        if (resolved) {
          return;
        }
        resolved = true;
        reject(error);
      };

      zipFile.readEntry();
      zipFile.on("entry", (entry: { fileName?: string }) => {
        if (entry.fileName !== "project.json") {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError: Error | null, stream: NodeJS.ReadableStream & {
          setEncoding?: (encoding: BufferEncoding) => void;
          on: (event: string, listener: (...args: any[]) => void) => void;
        }) => {
          if (streamError) {
            rejectOnce(streamError);
            return;
          }

          let jsonText = "";
          stream.setEncoding?.("utf8");
          stream.on("data", (chunk: string) => {
            jsonText += chunk;
          });
          stream.on("end", () => {
            if (resolved) {
              return;
            }

            resolved = true;
            zipFile.close();
            resolve(JSON.parse(jsonText));
          });
          stream.on("error", rejectOnce);
        });
      });

      zipFile.on("end", () => {
        if (!resolved) {
          rejectOnce(new Error("这个 sb3 文件里没有找到 project.json。"));
        }
      });
      zipFile.on("error", rejectOnce);
    });
  });
}

async function parseProjectResponse(
  response: Response,
  sourceDescription: string
) {
  if (!response.ok) {
    throw new Error(`读取作品失败：${response.status} ${sourceDescription}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("读取到的作品内容是空的。");
  }

  if (isZipBuffer(buffer)) {
    return await extractProjectJsonFromSb3Buffer(buffer);
  }

  const parsedFromText = tryParseProjectJsonFromText(buffer.toString("utf8"));
  if (parsedFromText) {
    return parsedFromText;
  }

  throw new Error("这个网页地址既不是可读取的 Scratch 项目 JSON，也不是可解包的 sb3 文件。");
}

async function fetchScratchProjectJson(
  projectId: string,
  fetchImpl: typeof fetch
) {
  const metadataResponse = await fetchImpl(`https://api.scratch.mit.edu/projects/${projectId}`);
  if (!metadataResponse.ok) {
    throw new Error(`读取 Scratch 项目元数据失败：${metadataResponse.status}`);
  }

  const metadata = (await metadataResponse.json()) as ScratchProjectMetadata;
  const projectToken = typeof metadata.project_token === "string" ? metadata.project_token.trim() : "";
  if (!projectToken) {
    throw new Error("Scratch 项目缺少 project_token，暂时无法读取作品内容。");
  }

  const projectResponse = await fetchImpl(
    `https://projects.scratch.mit.edu/${projectId}?token=${encodeURIComponent(projectToken)}`
  );
  const project = await parseProjectResponse(projectResponse, `Scratch 项目 ${projectId}`);

  return {
    metadata,
    project
  };
}

function buildLoadedProjectResult(
  project: Record<string, unknown>,
  sourceLabel: string,
  options: {
    projectId?: string;
    currentTargetName?: string;
  } = {}
): LoadedProjectFromUrl {
  const preferredTargetName = options.currentTargetName || pickSuggestedCurrentTargetName(project);
  const usedExtensions = getUsedExtensionsFromProject(project);
  const snapshot = projectJsonToSnapshot(project, {
    projectId: options.projectId,
    currentTargetName: preferredTargetName,
    loadedExtensions: usedExtensions,
    updatedAt: new Date().toISOString()
  }) as ProjectSnapshot;
  const currentTargetName = snapshot.currentTarget;
  const currentTargetSprite = snapshot.sprites.find((sprite) => sprite.name === currentTargetName) ?? null;
  const programAreaModules = summarizeProgramAreaModulesFromProject(project, {
    id: snapshot.currentTargetId,
    name: currentTargetName
  });

  return {
    snapshot,
    currentTargetName,
    currentTargetIsStage: currentTargetSprite?.isStage ?? false,
    currentTargetPrograms: deriveCurrentTargetPrograms(snapshot),
    programAreaModules,
    usedExtensions,
    loadedExtensions: usedExtensions,
    sourceLabel
  };
}

export class ProjectUrlLoader {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async load(projectUrl: string): Promise<LoadedProjectFromUrl> {
    const normalized = normalizeUrl(projectUrl);

    if (isScratchProjectPage(normalized.url) || isScratchProjectMetadataUrl(normalized.url)) {
      const projectId = getScratchProjectId(normalized.url);
      if (!projectId) {
        throw new Error("无法从 Scratch 项目地址里识别作品编号。");
      }

      const { metadata, project } = await fetchScratchProjectJson(projectId, this.fetchImpl);
      const sourceLabel =
        typeof metadata.title === "string" && metadata.title.trim()
          ? `${metadata.title.trim()} (${normalized.raw})`
          : normalized.raw;

      return buildLoadedProjectResult(project, sourceLabel, {
        projectId,
        currentTargetName: pickSuggestedCurrentTargetName(project)
      });
    }

    if (isScratchProjectJsonUrl(normalized.url)) {
      const projectId = getScratchProjectId(normalized.url);
      const response = await this.fetchImpl(normalized.raw);
      const project = await parseProjectResponse(response, normalized.raw);
      return buildLoadedProjectResult(project, normalized.raw, {
        projectId: projectId ?? undefined
      });
    }

    const response = await this.fetchImpl(normalized.raw);
    const project = await parseProjectResponse(response, normalized.raw);
    return buildLoadedProjectResult(project, normalized.raw);
  }
}
