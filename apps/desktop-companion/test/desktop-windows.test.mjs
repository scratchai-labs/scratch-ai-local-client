import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

async function loadDesktopWindowsModule() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "desktop-windows-test-"));
  const outfile = path.join(tempDir, "desktop-windows.mjs");

  try {
    await build({
      entryPoints: [fileURLToPath(new URL("../src/main/desktop-windows.ts", import.meta.url))],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      logLevel: "silent"
    });
    return await import(`${pathToFileURL(outfile).href}?cache=${Date.now()}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const { createDesktopWindowFactory } = await loadDesktopWindowsModule();

function createFactoryProbe({ platform = "darwin", onRendererLoadFailure = () => {} } = {}) {
  const windows = [];
  const builtTemplates = [];
  const popupWindows = [];
  const copiedTexts = [];

  class BrowserWindowProbe {
    constructor(options) {
      this.options = options;
      this.loadedFiles = [];
      this.shown = 0;
      this.windowHandlers = new Map();
      this.onceHandlers = new Map();
      this.webContents = {
        handlers: new Map(),
        on: (event, handler) => this.webContents.handlers.set(event, handler)
      };
      windows.push(this);
    }

    loadFile(file) {
      this.loadedFiles.push(file);
    }
    show() {
      this.shown += 1;
    }
    on(event, handler) {
      this.windowHandlers.set(event, handler);
    }
    once(event, handler) {
      this.onceHandlers.set(event, handler);
    }
  }

  const factory = createDesktopWindowFactory(
    {
      BrowserWindow: BrowserWindowProbe,
      Menu: {
        buildFromTemplate(template) {
          builtTemplates.push(template);
          return {
            popup({ window }) {
              popupWindows.push(window);
            }
          };
        }
      },
      clipboard: {
        writeText(text) {
          copiedTexts.push(text);
        }
      }
    },
    {
      rendererDirectory: "/app/dist",
      iconPath: "/app/dist/assets/app-icon.png",
      platform,
      onRendererLoadFailure
    }
  );

  return { factory, windows, builtTemplates, popupWindows, copiedTexts };
}

function createMainWindow(factory, overrides = {}) {
  return factory.createMainWindow({
    startHidden: false,
    shouldHideOnClose: () => false,
    onHideRequested() {},
    ...overrides
  });
}

const editFlags = {
  canUndo: true,
  canRedo: false,
  canCut: true,
  canCopy: true,
  canPaste: false,
  canDelete: false,
  canSelectAll: true,
  canEditRichly: false
};

test("desktop window factory creates the main window with secure preferences and loads the renderer", () => {
  const { factory, windows } = createFactoryProbe();
  const window = createMainWindow(factory, { startHidden: true });

  assert.equal(windows.length, 1);
  assert.equal(window, windows[0]);
  assert.deepEqual(window.options, {
    width: 720,
    height: 920,
    minWidth: 560,
    minHeight: 760,
    title: "Scratch AI 教练",
    alwaysOnTop: false,
    autoHideMenuBar: true,
    backgroundColor: "#f7fbff",
    icon: "/app/dist/assets/app-icon.png",
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: "/app/dist/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  assert.deepEqual(window.loadedFiles, ["/app/dist/index.html"]);
  assert.equal(window.webContents.handlers.has("context-menu"), true);
  assert.equal(window.webContents.handlers.has("did-fail-load"), true);
  assert.equal(window.windowHandlers.has("close"), true);
});

test("desktop windows install native context menus for editing, selection, and links", () => {
  const { factory, builtTemplates, popupWindows, copiedTexts } = createFactoryProbe();
  const window = createMainWindow(factory);
  const openContextMenu = window.webContents.handlers.get("context-menu");

  openContextMenu({}, { isEditable: true, editFlags, selectionText: "", linkURL: "" });
  assert.deepEqual(
    builtTemplates[0].map(({ label, role, type, enabled }) => ({ label, role, type, enabled })),
    [
      { label: "撤销", role: "undo", type: undefined, enabled: true },
      { label: "重做", role: "redo", type: undefined, enabled: false },
      { label: undefined, role: undefined, type: "separator", enabled: undefined },
      { label: "剪切", role: "cut", type: undefined, enabled: true },
      { label: "复制", role: "copy", type: undefined, enabled: true },
      { label: "粘贴", role: "paste", type: undefined, enabled: false },
      { label: undefined, role: undefined, type: "separator", enabled: undefined },
      { label: "全选", role: "selectAll", type: undefined, enabled: true }
    ]
  );

  openContextMenu({}, {
    isEditable: false,
    editFlags,
    selectionText: "选中的文字",
    linkURL: "https://scratch.mit.edu/projects/1"
  });
  assert.deepEqual(
    builtTemplates[1].map(({ label, role, type }) => ({ label, role, type })),
    [
      { label: "复制", role: "copy", type: undefined },
      { label: undefined, role: undefined, type: "separator" },
      { label: "复制链接地址", role: undefined, type: undefined }
    ]
  );
  builtTemplates[1][2].click();
  assert.deepEqual(copiedTexts, ["https://scratch.mit.edu/projects/1"]);

  openContextMenu({}, { isEditable: false, editFlags, selectionText: " ", linkURL: " " });
  assert.equal(builtTemplates.length, 2);
  assert.deepEqual(popupWindows, [window, window]);
});

test("desktop window factory creates a parented settings window and owns ready/closed behavior", () => {
  const { factory, windows } = createFactoryProbe({ platform: "win32" });
  const parent = { id: "main-window" };
  let closed = 0;
  const settingsWindow = factory.createSettingsWindow({
    parent,
    onClosed() {
      closed += 1;
    }
  });

  assert.equal(settingsWindow, windows[0]);
  assert.deepEqual(settingsWindow.options, {
    width: 480,
    height: 640,
    minWidth: 420,
    minHeight: 540,
    title: "DeepSeek 设置",
    alwaysOnTop: false,
    autoHideMenuBar: true,
    backgroundColor: "#f7fbff",
    icon: "/app/dist/assets/app-icon.png",
    show: false,
    parent,
    webPreferences: {
      preload: "/app/dist/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  assert.deepEqual(settingsWindow.loadedFiles, ["/app/dist/settings.html"]);
  assert.equal(settingsWindow.webContents.handlers.has("context-menu"), true);

  settingsWindow.onceHandlers.get("ready-to-show")();
  assert.equal(settingsWindow.shown, 1);
  settingsWindow.windowHandlers.get("closed")();
  assert.equal(closed, 1);
});

test("main window only intercepts close on Windows when tray hiding is allowed", () => {
  const rendererFailures = [];
  const windowsFactory = createFactoryProbe({
    platform: "win32",
    onRendererLoadFailure: (...failure) => rendererFailures.push(failure)
  }).factory;
  let hidden = 0;
  let prevented = 0;
  const closeEvent = { preventDefault: () => { prevented += 1; } };
  const windowsTrayWindow = createMainWindow(windowsFactory, {
    shouldHideOnClose: () => true,
    onHideRequested: () => { hidden += 1; }
  });
  windowsTrayWindow.windowHandlers.get("close")(closeEvent);
  assert.deepEqual({ prevented, hidden }, { prevented: 1, hidden: 1 });

  const quittingWindow = createMainWindow(windowsFactory);
  quittingWindow.windowHandlers.get("close")(closeEvent);
  const macWindow = createMainWindow(createFactoryProbe({ platform: "darwin" }).factory, {
    shouldHideOnClose: () => true,
    onHideRequested: () => { hidden += 1; }
  });
  macWindow.windowHandlers.get("close")(closeEvent);
  assert.deepEqual({ prevented, hidden }, { prevented: 1, hidden: 1 });

  windowsTrayWindow.webContents.handlers.get("did-fail-load")({}, -105, "NAME_NOT_RESOLVED");
  assert.deepEqual(rendererFailures, [[-105, "NAME_NOT_RESOLVED"]]);
});

test("desktop window factory shows and hides the main window with taskbar state kept in sync", () => {
  const { factory } = createFactoryProbe({ platform: "win32" });
  const calls = [];
  const window = {
    show: () => calls.push("show"),
    hide: () => calls.push("hide"),
    focus: () => calls.push("focus"),
    setSkipTaskbar: (value) => calls.push(["skipTaskbar", value])
  };

  factory.showMainWindow(window);
  factory.hideMainWindow(window);
  factory.showMainWindow(null);
  factory.hideMainWindow(null);

  assert.deepEqual(calls, [
    "show",
    ["skipTaskbar", false],
    "focus",
    "hide",
    ["skipTaskbar", true]
  ]);
});
