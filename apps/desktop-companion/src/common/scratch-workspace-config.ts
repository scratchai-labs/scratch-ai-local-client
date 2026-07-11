export const SCRATCH_WORKSPACE_MEDIA_PATH = "./assets/scratch-blocks-media/";
export const READONLY_WORKSPACE_SCALE = 0.64;
const DEFAULT_WORKSPACE_FALLBACK_TEXT = "Scratch 积木正在刷新，请稍等一下。";

interface ReadonlyWorkspaceOptionsArgs {
  scratchTheme: unknown;
  theme: unknown;
}

export function createReadonlyWorkspaceOptions({
  scratchTheme,
  theme
}: ReadonlyWorkspaceOptionsArgs) {
  return {
    readOnly: true,
    scrollbars: false,
    trashcan: false,
    move: {
      drag: false,
      scrollbars: false,
      wheel: false
    },
    zoom: {
      controls: false,
      wheel: false,
      pinch: false,
      startScale: READONLY_WORKSPACE_SCALE,
      maxScale: READONLY_WORKSPACE_SCALE,
      minScale: READONLY_WORKSPACE_SCALE
    },
    media: SCRATCH_WORKSPACE_MEDIA_PATH,
    scratchTheme,
    theme
  };
}

export function resolveScratchWorkspaceFallbackText(value?: string | null) {
  return DEFAULT_WORKSPACE_FALLBACK_TEXT;
}
