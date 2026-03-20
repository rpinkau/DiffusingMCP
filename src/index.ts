import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as http from "http";
import { GenArgs } from "./types.js";

const DAEMON_PORT = parseInt(process.env.DIFFUSING_CAPSULE_PORT || "5556");

/**
 * MCP Entry Point - Spawned per-session by the MCP client.
 * Thin proxy: receives MCP tool calls via stdio, forwards them
 * as HTTP requests to the PM2-managed daemon on port 5556.
 * Does NOT start its own HTTP server or Python backend.
 */
class McpProxy {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: "diffusing-capsule", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "generate_image",
          description: "Generiere ein Bild lokal mit Stable Diffusion / Flux",
          inputSchema: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "Beschreibung des Bildes" },
              model: { type: "string", description: "Modell-Name (z.B. Flux.1 Schnell*, SDXL, Tiny-SD)", default: "Tiny-SD" },
              negative_prompt: { type: "string", description: "Was nicht im Bild sein soll", default: "" },
              width: { type: "number", default: 1024 },
              height: { type: "number", default: 1024 },
              steps: { type: "number", default: 4 },
              seed: { type: "number", description: "Optionaler Seed" }
            },
            required: ["prompt", "model"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== "generate_image") {
        throw new Error("Tool not found");
      }

      const args = request.params.arguments as unknown as GenArgs;
      if (!args.model) args.model = "Tiny-SD";
      if (!args.width) args.width = 1024;
      if (!args.height) args.height = 1024;
      if (!args.steps) args.steps = 4;

      console.error(`[MCP Proxy] Forwarding generation request to daemon...`);

      try {
        const result = await this.forwardToDaemon(args);
        console.error(`[MCP Proxy] Daemon returned: ${result.status}`);

        if (result.status === "error") {
          return {
            content: [{ type: "text", text: `Fehler: ${result.message}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Bild erfolgreich generiert.\nPfad: ${result.path}\nModell: ${args.model}\nSeed: ${result.seed}`,
            },
            ...(result.base64 ? [{
              type: "image" as const,
              data: result.base64,
              mimeType: "image/png" as const,
            }] : []),
          ],
        };
      } catch (error: any) {
        console.error(`[MCP Proxy] Error: ${error.message}`);
        return {
          content: [{ type: "text", text: `Fehler: ${error.message || String(error)}` }],
          isError: true,
        };
      }
    });
  }

  private forwardToDaemon(args: GenArgs): Promise<any> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(args);

      const req = http.request({
        hostname: '127.0.0.1',
        port: DAEMON_PORT,
        path: '/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Daemon returned invalid JSON: ${data.substring(0, 100)}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Daemon nicht erreichbar auf Port ${DAEMON_PORT}: ${err.message}. Ist der Daemon gestartet? (pm2 status)`));
      });

      // Long timeout for model loading / generation
      req.setTimeout(600_000, () => {
        req.destroy();
        reject(new Error("Daemon-Anfrage Timeout (10 Minuten)"));
      });

      req.write(body);
      req.end();
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[MCP Proxy] Ready. Forwarding tool calls to daemon.");
  }
}

const proxy = new McpProxy();
proxy.run().catch(console.error);
