#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BackendManager } from "./core.js";
import { HttpServer } from "./http.js";
import { z } from "zod";

/**
 * The MCP Capsule - Single Point of Contact for Diffusing.
 * Manages the Python backend and exposes both MCP (stdio) and HTTP interfaces.
 */
class McpCapsule {
  private server: Server;
  private backend: BackendManager;
  private httpServer: HttpServer;

  constructor() {
    this.server = new Server(
      { name: "diffusing-capsule", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    
    this.backend = new BackendManager();
    this.httpServer = new HttpServer(this.backend);
    
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

      const args = request.params.arguments as any;
      console.error(`[Capsule] Generation request for model: ${args.model}`);

      try {
        const result = await this.backend.generate(args, (msg) => {
          // Send progress to MCP logs (stderr)
          if (msg.status === "progress" || msg.status === "loading") {
            console.error(`[Progress] ${msg.text || (msg.value ? (msg.value * 100).toFixed(0) + "%" : "working...")}`);
          }
        });

        return {
          content: [
            {
              type: "text",
              text: `Bild erfolgreich generiert.\nPfad: ${result.path}\nModell: ${args.model}\nSeed: ${result.seed}`,
            },
            {
              type: "image",
              data: result.base64,
              mimeType: "image/png",
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Fehler: ${error.message || String(error)}` }],
          isError: true,
        };
      }
    });
  }

  async run() {
    // Start HTTP Server for VS Code (Port 5556)
    this.httpServer.listen(5556);
    
    // Start MCP Server (stdio)
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[Capsule] MCP Server (stdio) and HTTP Server (:5556) started.");
  }
}

const capsule = new McpCapsule();
capsule.run().catch(console.error);
