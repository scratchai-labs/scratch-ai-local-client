import { EventEmitter } from "node:events";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

function buildScratchLaunchArgs(debugPort: number) {
  return [`--remote-debugging-port=${debugPort}`];
}

async function getAvailablePort() {
  const server = createServer();

  return await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate a remote debugging port."));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

export class ScratchLauncher {
  async launch(scratchExecutablePath: string) {
    await access(scratchExecutablePath);

    const debugPort = await getAvailablePort();
    const processEvents = new EventEmitter();
    const child = spawn(scratchExecutablePath, buildScratchLaunchArgs(debugPort), {
      cwd: path.dirname(scratchExecutablePath),
      stdio: "ignore",
      windowsHide: false
    });

    const pid = await new Promise<number>((resolve, reject) => {
      child.once("spawn", () => {
        if (!child.pid) {
          reject(new Error("Scratch process started without a pid."));
          return;
        }

        resolve(child.pid);
      });
      child.once("error", reject);
    });

    child.once("exit", (code, signal) => {
      processEvents.emit("exit", code, signal);
    });

    return {
      pid,
      debugPort,
      scratchExecutablePath,
      onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void) {
        processEvents.on("exit", listener);
        return () => {
          processEvents.off("exit", listener);
        };
      }
    };
  }
}
