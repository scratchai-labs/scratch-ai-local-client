import { nativeImage } from "electron";

import { getIconAssetPath } from "./icon-assets";

function createFallbackTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="6" y="6" width="52" height="52" rx="16" fill="#16332d" />
      <path d="M18 19h28v5H18zm0 11h22v5H18zm0 11h30v5H18z" fill="#f7f0e1" />
      <circle cx="47" cy="36" r="8" fill="#0b8e69" />
    </svg>
  `.trim();

  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

export function createTrayIcon() {
  const trayIcon = nativeImage.createFromPath(getIconAssetPath("tray-icon.png"));
  if (trayIcon.isEmpty()) {
    return createFallbackTrayIcon();
  }

  return trayIcon;
}
