const CORE_PREFIXES = [
  "argument",
  "colour",
  "control",
  "data",
  "event",
  "looks",
  "math",
  "motion",
  "operator",
  "procedures",
  "sensing",
  "sound"
];

const MODULE_LABELS = {
  motion: "运动",
  looks: "外观",
  sound: "声音",
  event: "事件",
  control: "控制",
  sensing: "侦测",
  operator: "运算",
  data: "变量和列表",
  procedures: "自制积木",
  colour: "颜色",
  pen: "画笔",
  music: "音乐",
  translate: "翻译",
  videoSensing: "视频侦测",
  text2speech: "文字转语音",
  microbit: "micro:bit",
  wedo2: "WeDo 2.0",
  makeymakey: "Makey Makey",
  ev3: "EV3",
  boost: "BOOST",
  gdxfor: "Go Direct Force & Acceleration",
  mesh: "Mesh"
} as const;

export function buildDesktopInjectionScript(apiBaseUrl: string, token: string) {
  return `
(() => {
  if (window.__scratchDesktopCompanionBridgeInstalled) {
    if (typeof window.__scratchDesktopCompanionCaptureNow === "function") {
      window.__scratchDesktopCompanionCaptureNow("reinject");
    }
    return "scratch-desktop-companion:already-installed";
  }

  window.__scratchDesktopCompanionBridgeInstalled = true;

  const API_BASE_URL = ${JSON.stringify(apiBaseUrl)};
  const TOKEN = ${JSON.stringify(token)};
  const CORE_PREFIXES = new Set(${JSON.stringify(CORE_PREFIXES)});
  const MODULE_LABELS = ${JSON.stringify(MODULE_LABELS)};

  let vmCandidate = null;
  let listenersAttached = false;
  let scheduledTimer = 0;
  const REACT_NODE_PREFIXES = ["__reactFiber$", "__reactContainer$", "__reactInternalInstance$"];

  function uniqueStrings(values) {
    const result = [];
    const seen = new Set();
    for (const rawValue of values || []) {
      if (typeof rawValue !== "string") {
        continue;
      }
      const value = rawValue.trim();
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      result.push(value);
    }
    return result;
  }

  function getScratchPid() {
    try {
      if (typeof require === "function") {
        return require("node:process").pid;
      }
    } catch {}
    return undefined;
  }

  function normalizeExtensionId(prefix) {
    const normalized = String(prefix || "").replace(/[^\\w-]/g, "-");
    if (!normalized || CORE_PREFIXES.has(normalized)) {
      return null;
    }
    return normalized;
  }

  function getModuleIdForOpcode(opcode) {
    if (typeof opcode !== "string") {
      return null;
    }
    const separatorIndex = opcode.indexOf("_");
    if (separatorIndex <= 0) {
      return null;
    }
    const prefix = opcode.slice(0, separatorIndex);
    if (prefix === "argument") {
      return "procedures";
    }
    if (prefix === "math") {
      return "operator";
    }
    return CORE_PREFIXES.has(prefix) ? prefix : normalizeExtensionId(prefix);
  }

  function getExtensionIdForOpcode(opcode) {
    if (typeof opcode !== "string") {
      return null;
    }
    const separatorIndex = opcode.indexOf("_");
    if (separatorIndex <= 0) {
      return null;
    }
    return normalizeExtensionId(opcode.slice(0, separatorIndex));
  }

  function parseProjectData(rawProject) {
    if (!rawProject) {
      return null;
    }
    if (typeof rawProject === "string") {
      try {
        const parsed = JSON.parse(rawProject);
        return parsed && Array.isArray(parsed.targets) ? parsed : null;
      } catch {
        return null;
      }
    }
    if (typeof rawProject === "object" && Array.isArray(rawProject.targets)) {
      return rawProject;
    }
    return null;
  }

  function getUsedExtensions(projectData) {
    const used = new Set();
    for (const target of projectData.targets || []) {
      const blocks = target && target.blocks ? Object.values(target.blocks) : [];
      for (const block of blocks) {
        const extensionId = getExtensionIdForOpcode(block && block.opcode);
        if (extensionId) {
          used.add(extensionId);
        }
      }
    }
    if (Array.isArray(projectData.monitors)) {
      for (const monitor of projectData.monitors) {
        const extensionId = getExtensionIdForOpcode(monitor && monitor.opcode);
        if (extensionId) {
          used.add(extensionId);
        }
      }
    }
    return Array.from(used).sort();
  }

  function getLoadedExtensions(vm) {
    try {
      return Array.from(vm.extensionManager._loadedExtensions.keys()).sort();
    } catch {
      return [];
    }
  }

  function isVmLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      value.runtime &&
      Array.isArray(value.runtime.targets) &&
      typeof value.toJSON === "function"
    );
  }

  function findVmOnWindow() {
    const knownKeys = ["vm", "__scratchVm", "__vm"];
    for (const key of knownKeys) {
      const candidate = window[key];
      if (isVmLike(candidate)) {
        return candidate;
      }
    }

    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const candidate = window[key];
        if (isVmLike(candidate)) {
          return candidate;
        }
        if (candidate && typeof candidate === "object" && "vm" in candidate && isVmLike(candidate.vm)) {
          return candidate.vm;
        }
      } catch {}
    }
    return null;
  }

  function findVmInFiberNode(node) {
    const queue = [node];
    const visited = new Set();

    while (queue.length > 0 && visited.size < 400) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) {
        continue;
      }
      visited.add(current);

      const candidateProps = [current.memoizedProps, current.pendingProps, current.stateNode && current.stateNode.props];
      for (const props of candidateProps) {
        if (!props || typeof props !== "object") {
          continue;
        }
        if ("vm" in props && isVmLike(props.vm)) {
          return props.vm;
        }
        if (isVmLike(props)) {
          return props;
        }
      }

      for (const key of ["child", "sibling", "return"]) {
        const nextNode = current[key];
        if (nextNode && !visited.has(nextNode)) {
          queue.push(nextNode);
        }
      }
    }

    return null;
  }

  function findVmFromReactTree() {
    const candidates = document.querySelectorAll("#app, [class*='gui_page-wrapper'], [class*='gui_body-wrapper']");
    for (const element of candidates) {
      for (const key of Object.getOwnPropertyNames(element)) {
        if (!REACT_NODE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          continue;
        }
        const maybeVm = findVmInFiberNode(element[key]);
        if (maybeVm) {
          return maybeVm;
        }
      }
    }
    return null;
  }

  function findToolboxXmlInFiberNode(node) {
    const queue = [node];
    const visited = new Set();

    while (queue.length > 0 && visited.size < 500) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) {
        continue;
      }
      visited.add(current);

      const candidateProps = [current.memoizedProps, current.pendingProps, current.stateNode && current.stateNode.props];
      for (const props of candidateProps) {
        if (!props || typeof props !== "object") {
          continue;
        }
        if (typeof props.toolboxXML === "string" && props.toolboxXML.includes("<category")) {
          return props.toolboxXML;
        }
      }

      for (const key of ["child", "sibling", "return"]) {
        const nextNode = current[key];
        if (nextNode && !visited.has(nextNode)) {
          queue.push(nextNode);
        }
      }
    }

    return null;
  }

  function findToolboxXmlFromReactTree() {
    const candidates = document.querySelectorAll("#app, [class*='gui_page-wrapper'], [class*='gui_body-wrapper']");
    for (const element of candidates) {
      for (const key of Object.getOwnPropertyNames(element)) {
        if (!REACT_NODE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          continue;
        }
        const toolboxXml = findToolboxXmlInFiberNode(element[key]);
        if (toolboxXml) {
          return toolboxXml;
        }
      }
    }
    return null;
  }

  function getToolboxCategoriesFromXml(toolboxXml) {
    if (typeof toolboxXml !== "string" || !toolboxXml) {
      return [];
    }
    try {
      const documentNode = new DOMParser().parseFromString(toolboxXml, "text/xml");
      const categories = Array.from(documentNode.querySelectorAll("category")).map((category) =>
        category.getAttribute("name") || category.getAttribute("toolboxitemid") || ""
      );
      return uniqueStrings(categories);
    } catch {
      return [];
    }
  }

  function getToolboxCategoriesFromDom() {
    const textSelectors = [
      ".scratchCategoryItemBubble",
      ".scratchCategoryItemLabel",
      ".scratchCategoryMenuItemLabel",
      ".blocklyTreeLabel",
      ".blocklyFlyoutLabelText text",
      ".blocklyTreeRow text"
    ];
    const values = [];
    for (const selector of textSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = element.textContent;
        if (text) {
          values.push(text);
        }
      }
    }
    return uniqueStrings(values);
  }

  function getToolboxCategories() {
    const toolboxXml = findToolboxXmlFromReactTree();
    const xmlCategories = getToolboxCategoriesFromXml(toolboxXml);
    const domCategories = getToolboxCategoriesFromDom();
    if (xmlCategories.length > 0) {
      const hasUnresolvedBlocklyTokens = xmlCategories.some((category) => /^%\\{BKY_[A-Z0-9_]+\\}$/.test(category));
      if (hasUnresolvedBlocklyTokens && domCategories.length >= xmlCategories.length) {
        return domCategories;
      }
      return xmlCategories;
    }
    return domCategories;
  }

  function ensureVm() {
    if (vmCandidate && isVmLike(vmCandidate)) {
      return vmCandidate;
    }
    vmCandidate = findVmOnWindow() || findVmFromReactTree();
    return vmCandidate;
  }

  function getCurrentTargetMeta(vm) {
    const target = vm && vm.editingTarget ? vm.editingTarget : null;
    return {
      id: target && typeof target.id === "string" ? target.id : undefined,
      name:
        (target && target.sprite && typeof target.sprite.name === "string" && target.sprite.name) ||
        (target && typeof target.getName === "function" && target.getName()) ||
        undefined,
      isStage: target ? Boolean(target.isStage) : undefined
    };
  }

  function pickProjectTarget(projectData, currentTargetMeta) {
    const targets = Array.isArray(projectData && projectData.targets) ? projectData.targets : [];
    if (targets.length === 0) {
      return null;
    }
    if (currentTargetMeta && currentTargetMeta.id) {
      const byId = targets.find((target) => target && target.id === currentTargetMeta.id);
      if (byId) {
        return byId;
      }
    }
    if (currentTargetMeta && currentTargetMeta.name) {
      const byName = targets.find((target) => target && target.name === currentTargetMeta.name);
      if (byName) {
        return byName;
      }
    }
    return targets.find((target) => target && target.isStage === false) || targets[0] || null;
  }

  function getProgramAreaModules(projectData, currentTargetMeta) {
    const target = pickProjectTarget(projectData, currentTargetMeta);
    const blocks = target && target.blocks ? Object.values(target.blocks) : [];
    const counts = new Map();
    for (const block of blocks) {
      if (!block || block.shadow === true || typeof block.opcode !== "string") {
        continue;
      }
      const moduleId = getModuleIdForOpcode(block.opcode);
      if (!moduleId) {
        continue;
      }
      counts.set(moduleId, (counts.get(moduleId) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, blockCount]) => ({
        id,
        label: MODULE_LABELS[id] || id,
        blockCount
      }))
      .sort((left, right) => {
        if (right.blockCount !== left.blockCount) {
          return right.blockCount - left.blockCount;
        }
        return String(left.label).localeCompare(String(right.label), "zh-CN");
      });
  }

  function postSnapshot(source) {
    const toolboxCategories = getToolboxCategories();
    const vm = ensureVm();
    if (!vm && toolboxCategories.length === 0) {
      return;
    }
    if (vm) {
      installListeners(vm);
    }

    let rawProject = null;
    if (vm) {
      try {
        rawProject = vm.toJSON();
      } catch {}
    }

    const projectData = parseProjectData(rawProject);
    const currentTargetMeta = vm ? getCurrentTargetMeta(vm) : {};
    const programAreaModules = projectData ? getProgramAreaModules(projectData, currentTargetMeta) : [];

    fetch(API_BASE_URL + "/api/scratch-state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-monitor-token": TOKEN
      },
      body: JSON.stringify({
        bridgeVersion: "1",
        source,
        capturedAt: new Date().toISOString(),
        scratchPid: getScratchPid(),
        currentTargetId: currentTargetMeta.id,
        currentTargetName: currentTargetMeta.name,
        currentTargetIsStage: currentTargetMeta.isStage,
        toolboxCategories,
        loadedExtensions: vm ? getLoadedExtensions(vm) : [],
        usedExtensions: projectData ? getUsedExtensions(projectData) : [],
        programAreaModules,
        projectData
      })
    }).catch(() => {});
  }

  function scheduleSnapshot(source) {
    if (scheduledTimer) {
      window.clearTimeout(scheduledTimer);
    }
    scheduledTimer = window.setTimeout(() => postSnapshot(source), 500);
  }

  function installListeners(vm) {
    if (listenersAttached || typeof vm.on !== "function") {
      return;
    }
    listenersAttached = true;
    vm.on("PROJECT_CHANGED", () => scheduleSnapshot("project-changed"));
    vm.on("EXTENSION_ADDED", () => scheduleSnapshot("extension-added"));
  }

  window.__scratchDesktopCompanionCaptureNow = postSnapshot;

  window.addEventListener("keyup", () => scheduleSnapshot("keyup"), true);
  window.addEventListener("pointerup", () => scheduleSnapshot("pointerup"), true);
  window.setInterval(() => postSnapshot("heartbeat"), 4000);
  postSnapshot("bootstrap");

  return "scratch-desktop-companion:installed";
})();
`.trim();
}
