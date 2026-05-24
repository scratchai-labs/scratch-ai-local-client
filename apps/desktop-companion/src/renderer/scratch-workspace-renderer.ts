import * as ScratchBlocks from "scratch-blocks";
import {
  createReadonlyWorkspaceOptions,
  resolveScratchWorkspaceFallbackText,
  READONLY_WORKSPACE_SCALE
} from "../common/scratch-workspace-config";

const activeWorkspaces = new Map<HTMLElement, ScratchBlocks.WorkspaceSvg>();
const scratchReadonlyTheme = ScratchBlocks.Theme.defineTheme("scratch-readonly", {
  blockStyles: {
    motion: {
      colourPrimary: "#4c97ff",
      colourSecondary: "#4280d7",
      colourTertiary: "#3373cc"
    },
    looks: {
      colourPrimary: "#9966ff",
      colourSecondary: "#855cd6",
      colourTertiary: "#774dcb"
    },
    sounds: {
      colourPrimary: "#cf63cf",
      colourSecondary: "#c94fc9",
      colourTertiary: "#bd42bd"
    },
    event: {
      colourPrimary: "#ffbf00",
      colourSecondary: "#e6ac00",
      colourTertiary: "#cc9900"
    },
    control: {
      colourPrimary: "#ffab19",
      colourSecondary: "#ec9c13",
      colourTertiary: "#cf8b17"
    },
    sensing: {
      colourPrimary: "#5cb1d6",
      colourSecondary: "#47a8d1",
      colourTertiary: "#2e8eb8"
    },
    operators: {
      colourPrimary: "#59c059",
      colourSecondary: "#46b946",
      colourTertiary: "#389438"
    },
    data: {
      colourPrimary: "#ff8c1a",
      colourSecondary: "#ff8000",
      colourTertiary: "#db6e00"
    },
    data_lists: {
      colourPrimary: "#ff661a",
      colourSecondary: "#ff5500",
      colourTertiary: "#e64d00"
    },
    more: {
      colourPrimary: "#ff6680",
      colourSecondary: "#ff4d6a",
      colourTertiary: "#ff3355"
    },
    pen: {
      colourPrimary: "#0fbd8c",
      colourSecondary: "#0da57a",
      colourTertiary: "#0b8e69"
    },
    textField: {
      colourPrimary: "#ffffff",
      colourSecondary: "#e9eef2",
      colourTertiary: "#d8dee9"
    }
  },
  componentStyles: {
    workspaceBackgroundColour: "#ffffff",
    toolboxBackgroundColour: "#ffffff",
    toolboxForegroundColour: "#575e75",
    flyoutBackgroundColour: "#f9f9f9",
    flyoutForegroundColour: "#575e75",
    flyoutOpacity: "1",
    scrollbarColour: "#cecdce",
    insertionMarkerColour: "#000000",
    insertionMarkerOpacity: "0.2",
    markerColour: "#4c97ff",
    cursorColour: "#4c97ff"
  }
});

let scratchBlocksInitialized = false;

function registerReadonlyDynamicMenuBlock(
  blockType: string,
  fieldName: string,
  extensions: string[]
) {
  ScratchBlocks.Blocks[blockType] = {
    init: function initDynamicMenuBlock(this: ScratchBlocks.Block) {
      this.jsonInit({
        message0: "%1",
        args0: [
          {
            type: "field_input",
            name: fieldName,
            text: ""
          }
        ],
        extensions
      });
    }
  };
}

function registerReadonlyStatementBlock(
  blockType: string,
  label: string,
  extensions: string[]
) {
  ScratchBlocks.Blocks[blockType] = {
    init: function initReadonlyStatementBlock(this: ScratchBlocks.Block) {
      this.jsonInit({
        message0: label,
        extensions
      });
    }
  };
}

function registerReadonlyValueBlock(
  blockType: string,
  message0: string,
  inputName: string,
  extensions: string[]
) {
  ScratchBlocks.Blocks[blockType] = {
    init: function initReadonlyValueBlock(this: ScratchBlocks.Block) {
      this.jsonInit({
        message0,
        args0: [
          {
            type: "input_value",
            name: inputName
          }
        ],
        extensions
      });
    }
  };
}

function ensureScratchBlocksInitialized() {
  if (scratchBlocksInitialized) {
    return;
  }

  ScratchBlocks.ScratchMsgs.setLocale("zh-cn");

  registerReadonlyDynamicMenuBlock("motion_pointtowards_menu", "TOWARDS", [
    "colours_motion",
    "output_string"
  ]);
  registerReadonlyDynamicMenuBlock("motion_goto_menu", "TO", ["colours_motion", "output_string"]);
  registerReadonlyDynamicMenuBlock("motion_glideto_menu", "TO", [
    "colours_motion",
    "output_string"
  ]);
  registerReadonlyDynamicMenuBlock("looks_costume", "COSTUME", ["colours_looks", "output_string"]);
  registerReadonlyDynamicMenuBlock("looks_backdrops", "BACKDROP", ["colours_looks", "output_string"]);
  registerReadonlyDynamicMenuBlock("sound_sounds_menu", "SOUND_MENU", [
    "colours_sounds",
    "output_string"
  ]);
  registerReadonlyDynamicMenuBlock("sensing_touchingobjectmenu", "TOUCHINGOBJECTMENU", [
    "colours_sensing",
    "output_string"
  ]);
  registerReadonlyDynamicMenuBlock("sensing_distancetomenu", "DISTANCETOMENU", [
    "colours_sensing",
    "output_string"
  ]);
  registerReadonlyDynamicMenuBlock("sensing_of_object_menu", "OBJECT", [
    "colours_sensing",
    "output_string"
  ]);
  registerReadonlyDynamicMenuBlock("control_create_clone_of_menu", "CLONE_OPTION", [
    "colours_control",
    "output_string"
  ]);
  registerReadonlyStatementBlock("pen_clear", "清空", ["colours_pen", "shape_statement"]);
  registerReadonlyStatementBlock("pen_penDown", "落笔", ["colours_pen", "shape_statement"]);
  registerReadonlyStatementBlock("pen_penUp", "抬笔", ["colours_pen", "shape_statement"]);
  registerReadonlyValueBlock("pen_setPenColorToColor", "将画笔颜色设为 %1", "COLOR", [
    "colours_pen",
    "shape_statement"
  ]);
  registerReadonlyValueBlock("pen_changePenSizeBy", "将画笔粗细增加 %1", "SIZE", [
    "colours_pen",
    "shape_statement"
  ]);

  ScratchBlocks.Blocks.event_whenbackdropswitchesto = {
    init: function initBackdropSwitchBlock(this: ScratchBlocks.Block) {
      this.jsonInit({
        message0: ScratchBlocks.ScratchMsgs.translate(
          "EVENT_WHENBACKDROPSWITCHESTO",
          "when backdrop switches to %1",
          "zh-cn"
        ),
        args0: [
          {
            type: "field_input",
            name: "BACKDROP",
            text: ""
          }
        ],
        extensions: ["colours_event", "shape_hat"]
      });
    }
  };

  scratchBlocksInitialized = true;
}

function disposeScratchWorkspaces() {
  for (const workspace of activeWorkspaces.values()) {
    workspace.dispose();
  }
  activeWorkspaces.clear();
}

function resizeWorkspaceHost(host: HTMLElement, workspace: ScratchBlocks.WorkspaceSvg) {
  const svgElement = host.querySelector("svg");
  const blockCanvas = workspace.getCanvas();
  if (!svgElement || !blockCanvas) {
    return;
  }

  const bbox = blockCanvas.getBBox();
  const layout = host.dataset.layout;
  const width = Math.max(
    Math.ceil((bbox.x + bbox.width) * READONLY_WORKSPACE_SCALE + 28),
    layout === "inline" ? 132 : 0
  );
  const height = Math.max(
    Math.ceil((bbox.y + bbox.height) * READONLY_WORKSPACE_SCALE + 26),
    layout === "inline" ? 56 : 88
  );

  host.style.setProperty("--scratch-workspace-width", `${width}px`);
  host.style.setProperty("--scratch-workspace-height", `${height}px`);
  host.style.height = `${height}px`;
  host.style.width = layout === "inline" ? `${width}px` : "100%";
  ScratchBlocks.svgResize(workspace);
}

function renderScratchWorkspace(host: HTMLElement) {
  const xmlText = host.dataset.xml?.trim();
  if (!xmlText) {
    return;
  }

  host.classList.remove("scratch-workspace-host-fallback");
  host.replaceChildren();

  const workspace = ScratchBlocks.inject(host, createReadonlyWorkspaceOptions({
    scratchTheme: ScratchBlocks.ScratchBlocksTheme.CLASSIC,
    theme: scratchReadonlyTheme
  }));

  const parsedXml = new DOMParser().parseFromString(xmlText, "text/xml").documentElement;
  ScratchBlocks.clearWorkspaceAndLoadFromXml(parsedXml, workspace);
  resizeWorkspaceHost(host, workspace);
  activeWorkspaces.set(host, workspace);

  window.requestAnimationFrame(() => {
    if (activeWorkspaces.get(host) !== workspace) {
      return;
    }
    resizeWorkspaceHost(host, workspace);
  });
}

export function renderScratchWorkspaces(documentRef: Document = document) {
  ensureScratchBlocksInitialized();
  disposeScratchWorkspaces();

  const hosts = Array.from(documentRef.querySelectorAll<HTMLElement>(".scratch-workspace-host"));
  for (const host of hosts) {
    try {
      renderScratchWorkspace(host);
    } catch (error) {
      console.error("Failed to render Scratch workspace host", error);
      host.classList.add("scratch-workspace-host-fallback");
      host.textContent = resolveScratchWorkspaceFallbackText(host.dataset.fallbackText);
    }
  }
}
