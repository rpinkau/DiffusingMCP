import { HttpServer } from "./http.js";
import { BackendManager } from "./core.js";
import { Config } from "./config.js";
import { Log } from "./utils.js";

/**
 * Daemon Entry Point - Run by PM2.
 * Manages the Python backend and exposes the HTTP API on port 5556.
 * Does NOT use MCP stdio (PM2 owns stdin/stdout).
 */
class Daemon {
  private backend: BackendManager;
  private httpServer: HttpServer;

  constructor() {
    this.backend = new BackendManager();
    this.httpServer = new HttpServer(this.backend);
  }

  run() {
    this.httpServer.listen(Config.capsulePort);
    Log.info(`Daemon started. HTTP API on http://127.0.0.1:${Config.capsulePort}`);

    // Graceful shutdown
    const shutdown = () => {
      Log.info("Daemon shutting down...");
      this.backend.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

const daemon = new Daemon();
daemon.run();
