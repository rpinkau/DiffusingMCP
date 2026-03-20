import * as net from 'net';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Correctly point to the new backend location in the parent directory's "toProjectBackend" folder
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'toProjectBackend');
const BACKEND_SCRIPT = path.join(BACKEND_DIR, 'image_listener.py');

export interface GenArgs {
  prompt: string;
  model: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
}

export class BackendManager {
  private pythonProcess: cp.ChildProcess | undefined;
  private currentModel: string | undefined;
  private idleTimer: NodeJS.Timeout | undefined;
  private readonly IDLE_TIMEOUT = 15 * 60 * 1000; // 15 Minutes

  constructor() {}

  async generate(args: GenArgs, onMessage: (msg: any) => void): Promise<any> {
    this.resetIdleTimer();
    
    // Ensure backend is running with the correct model
    await this.ensureBackend(args.model);

    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let buffer = "";

      client.on('data', (data) => {
        buffer += data.toString();
        let boundary;
        while ((boundary = buffer.indexOf("\n")) !== -1) {
          const line = buffer.substring(0, boundary).trim();
          buffer = buffer.substring(boundary + 1);
          if (!line) continue;

          try {
            const result = JSON.parse(line);
            if (result.status === "success") {
              // Read the generated file and convert to base64
              const imgBase64 = fs.readFileSync(result.path, { encoding: 'base64' });
              resolve({ ...result, base64: imgBase64 });
              client.destroy();
            } else {
              onMessage(result);
            }
          } catch (e) {
            console.error("[BackendManager] JSON parse error", e);
          }
        }
      });

      client.on('error', (err) => {
        reject(new Error(`Verbindung zum Backend fehlgeschlagen: ${err.message}`));
      });

      client.connect(5555, '127.0.0.1', () => {
        client.write(JSON.stringify(args) + "\n");
      });
    });
  }

  private async ensureBackend(model: string): Promise<void> {
    // If model changed or backend is down, restart it
    if (!this.pythonProcess || this.currentModel !== model) {
      if (this.pythonProcess) {
        console.error(`[BackendManager] Model changed from ${this.currentModel} to ${model}. Restarting...`);
        this.pythonProcess.kill();
        await new Promise(r => setTimeout(r, 1000));
      }
      await this.startBackend(model);
    }
  }

  private async startBackend(model: string): Promise<void> {
    console.error(`[BackendManager] Starting Python Backend for model: ${model}`);
    
    // Resolve paths (assuming standard windows locations as per user metadata)
    const appdata = process.env.LOCALAPPDATA || "";
    const pythonPath = path.join(appdata, 'DiffusingData', 'venv_diffusing', 'Scripts', 'python.exe');
    const outputPath = path.join(PROJECT_ROOT, 'output');

    const args = [
      '-u', BACKEND_SCRIPT,
      '--device', 'cuda',
      '--model', this.resolveModelId(model),
      '--port', '5555',
      '--output', outputPath
    ];

    this.pythonProcess = cp.spawn(pythonPath, args, {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    this.currentModel = model;

    this.pythonProcess.stderr?.on('data', (data) => {
        const str = data.toString();
        if (str.includes("ready")) {
            // Signal readiness could be handled here if needed
        }
    });

    this.pythonProcess.on('exit', () => {
      console.error("[BackendManager] Python process exited.");
      this.pythonProcess = undefined;
      this.currentModel = undefined;
    });

    // Wait for the port to be ready
    await this.waitForPort(5555);
  }

  private resolveModelId(modelName: string): string {
      // Map friendly names to HF IDs
      const map: Record<string, string> = {
          "Tiny-SD": "segmind/tiny-sd",
          "SD 1.5": "runwayml/stable-diffusion-v1-5",
          "SDXL-Lightning": "ByteDance/SDXL-Lightning",
          "SDXL": "stabilityai/stable-diffusion-xl-base-1.0",
          "Flux.1 Schnell*": "black-forest-labs/FLUX.1-schnell",
          "SD 3.5 Medium*": "stabilityai/stable-diffusion-3.5-medium"
      };
      return map[modelName] || modelName;
  }

  private waitForPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        if (attempts > 300) {
          clearInterval(timer);
          reject(new Error("Timeout waiting for backend port 5555"));
        }
        const client = new net.Socket();
        client.on('error', () => {});
        client.connect(port, '127.0.0.1', () => {
          client.destroy();
          clearInterval(timer);
          resolve();
        });
      }, 1000);
    });
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      console.error("[BackendManager] Idle timeout reached. Shutting down backend to free memory.");
      if (this.pythonProcess) {
        this.pythonProcess.kill();
        this.pythonProcess = undefined;
        this.currentModel = undefined;
      }
    }, this.IDLE_TIMEOUT);
  }
}
