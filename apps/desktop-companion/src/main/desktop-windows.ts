import path from "node:path";

import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Clipboard,
  ContextMenuParams,
  MenuItemConstructorOptions
} from "electron";

type BrowserWindowConstructor = new (options: BrowserWindowConstructorOptions) => BrowserWindow;

type MenuAdapter = {
  buildFromTemplate(template: MenuItemConstructorOptions[]): {
    popup(options: { window: BrowserWindow }): void;
  };
};

type ClipboardAdapter = Pick<Clipboard, "writeText">;

export type DesktopWindowFactoryDependencies = {
  BrowserWindow: BrowserWindowConstructor;
  Menu: MenuAdapter;
  clipboard: ClipboardAdapter;
};

export type DesktopWindowFactoryOptions = {
  rendererDirectory: string;
  iconPath: string;
  platform: NodeJS.Platform;
  onRendererLoadFailure(errorCode: number, errorDescription: string): void;
};

type MainWindowOptions = {
  startHidden: boolean;
  shouldHideOnClose(): boolean;
  onHideRequested(): void;
};

type SettingsWindowOptions = {
  parent: BrowserWindow | null;
  onClosed(): void;
};

const WINDOW_BACKGROUND_COLOR = "#f7fbff";

export function createDesktopWindowFactory(
  dependencies: DesktopWindowFactoryDependencies,
  options: DesktopWindowFactoryOptions
) {
  const { BrowserWindow, Menu, clipboard } = dependencies;
  const preloadPath = path.join(options.rendererDirectory, "preload.cjs");

  function buildContextMenuTemplate(params: ContextMenuParams): MenuItemConstructorOptions[] {
    if (params.isEditable) {
      return [
        { label: "撤销", role: "undo", enabled: params.editFlags.canUndo },
        { label: "重做", role: "redo", enabled: params.editFlags.canRedo },
        { type: "separator" },
        { label: "剪切", role: "cut", enabled: params.editFlags.canCut },
        { label: "复制", role: "copy", enabled: params.editFlags.canCopy },
        { label: "粘贴", role: "paste", enabled: params.editFlags.canPaste },
        { type: "separator" },
        { label: "全选", role: "selectAll", enabled: params.editFlags.canSelectAll }
      ];
    }

    const template: MenuItemConstructorOptions[] = [];
    const hasSelection = params.selectionText.trim().length > 0;
    const hasLink = params.linkURL.trim().length > 0;

    if (hasSelection) {
      template.push({ label: "复制", role: "copy", enabled: params.editFlags.canCopy });
    }

    if (hasLink) {
      if (template.length > 0) {
        template.push({ type: "separator" });
      }
      template.push({
        label: "复制链接地址",
        click: () => {
          clipboard.writeText(params.linkURL);
        }
      });
    }

    return template;
  }

  function installContextMenu(window: BrowserWindow) {
    window.webContents.on("context-menu", (_event, params) => {
      const template = buildContextMenuTemplate(params);
      if (template.length === 0) {
        return;
      }
      Menu.buildFromTemplate(template).popup({ window });
    });
  }

  return {
    showMainWindow(window: BrowserWindow | null) {
      if (!window) {
        return;
      }
      window.show();
      window.setSkipTaskbar(false);
      window.focus();
    },

    hideMainWindow(window: BrowserWindow | null) {
      if (!window) {
        return;
      }
      window.hide();
      window.setSkipTaskbar(true);
    },

    createMainWindow({ startHidden, shouldHideOnClose, onHideRequested }: MainWindowOptions) {
      const window = new BrowserWindow({
        width: 720,
        height: 920,
        minWidth: 560,
        minHeight: 760,
        title: "Scratch AI 教练",
        alwaysOnTop: false,
        autoHideMenuBar: true,
        backgroundColor: WINDOW_BACKGROUND_COLOR,
        icon: options.iconPath,
        show: !startHidden,
        skipTaskbar: startHidden,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false
        }
      });

      installContextMenu(window);
      void window.loadFile(path.join(options.rendererDirectory, "index.html"));
      window.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        options.onRendererLoadFailure(errorCode, errorDescription);
      });
      window.on("close", (event) => {
        if (options.platform !== "win32" || !shouldHideOnClose()) {
          return;
        }
        event.preventDefault();
        onHideRequested();
      });

      return window;
    },

    createSettingsWindow({ parent, onClosed }: SettingsWindowOptions) {
      const window = new BrowserWindow({
        width: 480,
        height: 640,
        minWidth: 420,
        minHeight: 540,
        title: "DeepSeek 设置",
        alwaysOnTop: false,
        autoHideMenuBar: true,
        backgroundColor: WINDOW_BACKGROUND_COLOR,
        icon: options.iconPath,
        show: false,
        parent: parent ?? undefined,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false
        }
      });

      installContextMenu(window);
      void window.loadFile(path.join(options.rendererDirectory, "settings.html"));
      window.on("closed", onClosed);
      window.once("ready-to-show", () => {
        window.show();
      });

      return window;
    }
  };
}
