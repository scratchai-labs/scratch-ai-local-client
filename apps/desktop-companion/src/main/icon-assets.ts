import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getIconAssetPath(fileName: string) {
  return path.join(__dirname, "assets", fileName);
}
