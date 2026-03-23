import * as net from 'net';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Config } from './config.js';
import { GenArgs, BackendMessage, GenResult, ImageInfo } from './types.js';
import { Log } from './utils.js';

const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB Limit

import { Setup } from './setup.js';

export class BackendManager {
  private pythonProcess: cp.ChildProcess | undefined;
  private currentModel: string | undefined;
  private idleTimer: NodeJS.Timeout | undefined;

  async generate(args: GenArgs, onMessage: (msg: BackendMessage) => void): Promise<GenResult> {
    Log.info(`generate starting. Model: ${args.model}`);
    this.resetIdleTimer();
    Log.info(`ensuring backend...`);
    await this.ensureBackend(args.model || 'Flux.1 Schnell*');
    Log.info(`backend ensured. connecting to port ${Config.backendPort}...`);

    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let buffer = "";
      let finished = false;

      const finishWith = (action: () => void) => {
        if (finished) return;
        finished = true;
        action();
      };

      client.on('data', (data) => {
        if (buffer.length + data.length > MAX_BUFFER_SIZE) {
            client.destroy();
            finishWith(() => reject(new Error("Backend buffer overflow (10MB limit)")));
            return;
        }
        buffer += data.toString();
        let boundary;
        while ((boundary = buffer.indexOf("\n")) !== -1) {
          const line = buffer.substring(0, boundary).trim();
          buffer = buffer.substring(boundary + 1);
          if (!line) continue;

          try {
            const result: BackendMessage = JSON.parse(line);
            if (result.status === "success" && result.path) {
              const resPath = path.resolve(result.path);
              if (!resPath.startsWith(path.resolve(Config.projectRoot))) {
                client.destroy();
                return finishWith(() => reject(new Error(`Security: Backend path out of root: ${result.path}`)));
              }
              const imgBase64 = fs.readFileSync(result.path, { encoding: 'base64' });
              client.destroy();
              
              const finalResult: GenResult = { ...result, base64: imgBase64 };
              if (!args.includeMetadata) {
                delete finalResult.seed;
                delete finalResult.path;
              }
              finishWith(() => resolve(finalResult));
            } else if (result.status === "error") {
              client.destroy();
              finishWith(() => reject(new Error(result.message || "Backend reported an error")));
            } else {
              if (result.status === 'info' && result.text) {
                Log.info(`[Backend] ${result.text}`);
              }

              // Sanitize message
              const sanitized = { ...result };
              if (!args.includeMetadata) {
                delete sanitized.seed;
                delete sanitized.path;
              }
              onMessage(sanitized);
            }
          } catch (e: any) {
            Log.error(`Parse error for line: ${line.substring(0, 50)}...`, e);
          }
        }
      });

      client.on('error', (err) => {
        client.destroy();
        finishWith(() => reject(new Error(`Backend connection failed: ${err.message}`)));
      });

      client.on('close', () => {
        finishWith(() => reject(new Error("Backend connection closed unexpectedly before completing generation.")));
      });

      client.connect(Config.backendPort, '127.0.0.1', () => {
        client.write(JSON.stringify(args) + "\n");
      });
    });
  }

  async scanOutput(): Promise<ImageInfo[]> {
    const outputPath = Config.outputPath;
    if (!fs.existsSync(outputPath)) return [];

    try {
        const files = await fs.promises.readdir(outputPath);
        const imageFiles = files.filter(f => {
            const low = f.toLowerCase();
            return low.endsWith('.png') || low.endsWith('.jpg') || low.endsWith('.jpeg') || low.endsWith('.webp');
        });
        
        const results: ImageInfo[] = [];

        for (const file of imageFiles) {
            try {
                const fullPath = path.join(outputPath, file);
                const stat = await fs.promises.stat(fullPath);
                
                // Try to find metadata in .md file
                const mdPath = fullPath.replace(/\.[^/.]+$/, ".md");
                let prompt = "existing";
                let seed: string | number = "Random";
                let model = "Unknown";

                if (fs.existsSync(mdPath)) {
                    const mdContent = fs.readFileSync(mdPath, 'utf8');
                    const promptMatch = mdContent.match(/- \*\*Prompt\*\*: (.*)/);
                    if (promptMatch) prompt = promptMatch[1].trim();

                    const seedMatch = mdContent.match(/- \*\*Seed\*\*: (.*)/) || mdContent.match(/"seed":\s*(\d+)/);
                    if (seedMatch) seed = seedMatch[1].trim().replace(/,/g, '');

                    const modelMatch = mdContent.match(/- \*\*Model\*\*: (.*)/);
                    if (modelMatch) model = modelMatch[1].trim();
                }

                results.push({
                    command: "addImage",
                    path: fullPath,
                    prompt: prompt,
                    seed: seed,
                    model: model,
                    date: stat.mtime.toLocaleString('en-US'),
                    timestamp: stat.mtimeMs
                });
            } catch (err) {
                Log.error(`Error processing file ${file}`, err);
            }
        }

        // Sort by timestamp descending
        results.sort((a, b) => b.timestamp - a.timestamp);
        return results;
    } catch (e) {
        Log.error("Error scanning output directory", e);
        return [];
    }
  }

  private async ensureBackend(model: string): Promise<void> {
    if (!this.pythonProcess || this.currentModel !== model) {
      if (this.pythonProcess) {
        Log.info(`Unloading model: ${this.currentModel}...`);
        this.pythonProcess.kill();
        await new Promise(r => setTimeout(r, 1000));
      }
      await this.killStrayBackend(Config.backendPort);
      await this.startBackend(model);
    }
  }

  private async killStrayBackend(port: number): Promise<void> {
      return new Promise((resolve) => {
          // Use PowerShell on Windows for better compatibility
          const cmd = process.platform === 'win32'
            ? `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`
            : `lsof -i :${port} -t`;

          cp.exec(cmd, (err, stdout) => {
              if (err || !stdout) return resolve();
              const pids = stdout.trim().split(/\s+/);
              for (const pidStr of pids) {
                  const pid = parseInt(pidStr);
                  if (!isNaN(pid) && pid > 0) {
                      Log.warn(`Killing process ${pid} on port ${port}`);
                      try {
                          process.kill(pid, 'SIGKILL');
                      } catch {
                          cp.exec(`taskkill /F /PID ${pid}`, () => {});
                      }
                  }
              }
              resolve();
          });
      });
  }

  private async startBackend(model: string): Promise<void> {
    // Ensure venv and dependencies are ready
    try {
        await Setup.ensureDependencies();
    } catch (e) {
        Log.error(`[Backend] Failed to ensure dependencies: ${e}`);
    }

    const appdata = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    const pythonPath = path.join(appdata, 'DiffusingData', 'venv_diffusing', 'Scripts', 'python.exe');
    
    const args = [
      '-u', Config.backendScript,
      '--device', 'cuda',
      '--model', this.resolveModelId(model),
      '--port', String(Config.backendPort),
      '--output', Config.outputPath
    ];

    this.pythonProcess = cp.spawn(pythonPath, args, {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    this.pythonProcess.stdout?.on('data', (data) => {
      Log.info(`[Backend Out] ${data.toString().trim()}`);
    });

    this.pythonProcess.stderr?.on('data', (data) => {
      Log.info(`[Backend Err] ${data.toString().trim()}`);
    });

    this.currentModel = model;
    this.pythonProcess.on('exit', () => {
      this.pythonProcess = undefined;
      this.currentModel = undefined;
    });

    await this.waitForPort(Config.backendPort);
  }

  private resolveModelId(modelName: string): string {
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

  private async waitForPort(port: number): Promise<void> {
    const timeout = 300 * 1000;
    const start = Date.now();
    Log.info(`Waiting for backend to be READY on port ${port}...`);
    while (Date.now() - start < timeout) {
      const status = await this.pingBackend(port);
      if (status === 'ready') {
        Log.info(`Backend is READY on port ${port}.`);
        return;
      }
      if (status === 'starting') {
        // Port is open but engine still loading — wait longer
        Log.info(`Backend is starting (engine loading)...`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error(`Backend startup timeout (${timeout/1000}s)`);
  }

  /** Sends a ping command. Returns 'ready', 'starting', or 'closed'. */
  private pingBackend(port: number): Promise<string> {
    return new Promise((resolve) => {
      const s = new net.Socket();
      let responded = false;

      const finish = (status: string) => {
        if (responded) return;
        responded = true;
        s.destroy();
        resolve(status);
      };

      s.setTimeout(3000);
      s.on('error', () => finish('closed'));
      s.on('timeout', () => finish('closed'));

      s.connect(port, '127.0.0.1', () => {
        s.write(JSON.stringify({ command: 'ping' }) + '\n');
      });

      let buffer = '';
      s.on('data', (data) => {
        buffer += data.toString();
        if (buffer.includes('\n')) {
          try {
            const msg = JSON.parse(buffer.split('\n')[0]);
            finish(msg.status || 'unknown');
          } catch {
            finish('unknown');
          }
        }
      });

      // Fallback timeout
      setTimeout(() => finish('closed'), 5000);
    });
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pythonProcess) {
        Log.warn("Idle shutdown to save VRAM.");
        this.pythonProcess.kill();
      }
    }, Config.idleTimeout);
  }

  public cleanup() {
    if (this.pythonProcess) {
      Log.warn("Graceful shutdown: Killing Python backend.");
      this.pythonProcess.kill();
      this.pythonProcess = undefined;
    }
  }
}
