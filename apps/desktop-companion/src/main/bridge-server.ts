import http from "node:http";
import { randomUUID } from "node:crypto";

interface ScratchBridgeServerOptions {
  onPayload: (payload: unknown) => void;
  onError: (message: string) => void;
}

export class ScratchBridgeServer {
  private readonly token = randomUUID();

  private onPayload: (payload: unknown) => void;

  private onError: (message: string) => void;

  private server?: http.Server;

  private port?: number;

  constructor(options: ScratchBridgeServerOptions) {
    this.onPayload = options.onPayload;
    this.onError = options.onError;
  }

  setHandlers(onPayload: (payload: unknown) => void, onError: (message: string) => void) {
    this.onPayload = onPayload;
    this.onError = onError;
  }

  getToken() {
    return this.token;
  }

  getBaseUrl() {
    if (!this.port) {
      throw new Error("Bridge server has not started yet.");
    }

    return `http://127.0.0.1:${this.port}`;
  }

  async start() {
    if (this.server) {
      return;
    }

    const server = http.createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "content-type, x-monitor-token");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method !== "POST" || request.url !== "/api/scratch-state") {
        response.writeHead(404);
        response.end();
        return;
      }

      if (request.headers["x-monitor-token"] !== this.token) {
        response.writeHead(401);
        response.end();
        return;
      }

      const chunks: Buffer[] = [];
      request.on("data", (chunk) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          const payload = JSON.parse(rawBody);
          this.onPayload(payload);
          response.writeHead(204);
          response.end();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown bridge payload error";
          this.onError(message);
          response.writeHead(400);
          response.end();
        }
      });
      request.on("error", (error) => {
        this.onError(error.message);
        response.writeHead(500);
        response.end();
      });
    });

    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to bind bridge server."));
          return;
        }

        this.port = address.port;
        resolve();
      });
      server.on("error", reject);
    });
  }

  async stop() {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = undefined;
    this.port = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}
