const DEFAULT_OPTIONS = Object.freeze({
  mode: "full",
  batchSize: 40,
  progressEvery: 5,
  recycleEvery: 10,
  smokeLimit: 32,
  shardIndex: 0,
  shardCount: 1,
  help: false
});

function parsePositiveInteger(value, optionName, { allowZero = false } = {}) {
  const parsed = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${optionName} 必须是${allowZero ? "非负" : "正"}整数，实际为 ${value}`);
  }
  return parsed;
}

export function buildElectronContractLaunchArgs({
  platform = process.platform,
  launcherPath,
  args = []
}) {
  const sandboxArgs = platform === "linux" ? ["--no-sandbox"] : [];
  return [...sandboxArgs, launcherPath, "--electron-contract-child", ...args];
}

export function createContractBrowserWindowOptions(preloadPath) {
  return {
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      preload: preloadPath
    }
  };
}

export function parseRenderContractOptions(args) {
  const options = { ...DEFAULT_OPTIONS };

  for (const arg of args) {
    if (arg === "--electron-contract-child") continue;
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const [key, ...rest] = arg.split("=");
    const value = rest.join("=");
    if (!value) {
      throw new Error(`${key} 需要使用 --name=value 形式传值`);
    }
    switch (key) {
      case "--mode":
        if (value !== "full" && value !== "smoke") {
          throw new Error(`--mode 仅支持 full 或 smoke，实际为 ${value}`);
        }
        options.mode = value;
        break;
      case "--batch-size":
        options.batchSize = parsePositiveInteger(value, key);
        break;
      case "--progress-every":
        options.progressEvery = parsePositiveInteger(value, key);
        break;
      case "--recycle-every":
        options.recycleEvery = parsePositiveInteger(value, key);
        break;
      case "--smoke-limit":
        options.smokeLimit = parsePositiveInteger(value, key);
        break;
      case "--shard-index":
        options.shardIndex = parsePositiveInteger(value, key, { allowZero: true });
        break;
      case "--shard-count":
        options.shardCount = parsePositiveInteger(value, key);
        break;
      default:
        throw new Error(`未知参数：${key}`);
    }
  }

  if (options.shardIndex >= options.shardCount) {
    throw new Error(`--shard-index 必须小于 --shard-count，实际为 ${options.shardIndex}/${options.shardCount}`);
  }

  return options;
}

function sampleEvenly(cases, limit) {
  if (cases.length <= limit) return [...cases];
  if (limit === 1) return [cases[0]];
  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round(index * (cases.length - 1) / (limit - 1));
    return cases[sourceIndex];
  });
}

export function selectCasesForRun(cases, options) {
  const selected = options.mode === "smoke"
    ? sampleEvenly(cases, options.smokeLimit)
    : [...cases];
  if (options.shardCount === 1) return selected;
  return selected.filter((_item, index) => index % options.shardCount === options.shardIndex);
}

export function formatRenderProgress({
  suite,
  completed,
  total,
  elapsedMs,
  rendererMemoryKb
}) {
  const percent = total === 0 ? 100 : completed / total * 100;
  const memory = Number.isFinite(rendererMemoryKb)
    ? ` renderer-memory=${(rendererMemoryKb / 1024).toFixed(1)}MB`
    : "";
  return `[render-contract] ${suite} ${completed}/${total} (${percent.toFixed(1)}%) elapsed=${(elapsedMs / 1000).toFixed(1)}s${memory}`;
}

export function getRenderContractHelp() {
  return `推荐积木真实 Renderer 合同\n\n` +
    `默认运行完整穷举：node verify-recommendation-render-contract.mjs\n` +
    `快速冒烟：node verify-recommendation-render-contract.mjs --mode=smoke\n\n` +
    `选项：\n` +
    `  --mode=full|smoke       默认 full；smoke 对每组用例做均匀采样\n` +
    `  --batch-size=N          每批真实渲染 host 数，默认 40\n` +
    `  --smoke-limit=N         smoke 每组最多用例数，默认 32\n` +
    `  --shard-index=N         从 0 开始的分片编号，默认 0\n` +
    `  --shard-count=N         分片总数，默认 1\n` +
    `  --progress-every=N      每 N 批输出一次进度，默认 5\n` +
    `  --recycle-every=N       每 N 批重建 Renderer，默认 10\n`;
}
