import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from './config.js';
import { Log } from './utils.js';

/**
 * Handles automatic installation of Python dependencies and venv management.
 * Ensures the Capsule is self-sufficient.
 */
export class Setup {
  static async ensureDependencies(): Promise<void> {
    const appData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    const venvPath = path.join(appData, 'DiffusingData', 'venv_diffusing');
    const pythonPath = process.platform === 'win32' 
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');

    if (!fs.existsSync(pythonPath)) {
      Log.info(`[Setup] Venv missing or incomplete at ${venvPath}. Starting auto-setup...`);
      await this.runInstall(venvPath, pythonPath);
    } else {
      Log.info(`[Setup] Python venv found. Ensuring requirements are met...`);
      // Always try to install requirements to be safe, but it's fast if already installed
      await this.installRequirements(pythonPath);
    }
  }

  private static async runInstall(venvPath: string, pythonPath: string): Promise<void> {
    try {
      if (!fs.existsSync(venvPath)) {
        Log.info(`[Setup] Creating virtual environment...`);
        // Ensure parent dir exists
        fs.mkdirSync(path.dirname(venvPath), { recursive: true });
        await this.runCommand(`python -m venv "${venvPath}"`);
      }

      Log.info(`[Setup] Upgrading pip...`);
      await this.runCommand(`"${pythonPath}" -m pip install --upgrade pip`);

      await this.installRequirements(pythonPath);
      
      Log.info(`[Setup] Verifying CUDA support...`);
      try {
        const cudaCheck = await this.runCommand(`"${pythonPath}" -c "import torch; print(torch.cuda.is_available())"`);
        if (cudaCheck.trim() === 'True') {
          Log.info(`[Setup] ✅ CUDA is available.`);
        } else {
          Log.info(`[Setup] ⚠️ CUDA is NOT available. Backend will run on CPU.`);
        }
      } catch {
        Log.warn(`[Setup] Could not verify CUDA. Torch might not be installed yet or failed to load.`);
      }
    } catch (e: any) {
      Log.error(`[Setup] Installation failed: ${e.message || String(e)}`);
      throw e;
    }
  }

  private static async installRequirements(pythonPath: string): Promise<void> {
    const reqPath = Config.requirementsPath;
    if (fs.existsSync(reqPath)) {
      Log.info(`[Setup] Installing dependencies from ${reqPath}...`);
      // Note: This might take a while on first run
      await this.runCommand(`"${pythonPath}" -m pip install -r "${reqPath}"`);
      Log.info(`[Setup] Dependencies installed successfully.`);
    } else {
      Log.warn(`[Setup] ⚠️ requirements.txt NOT found at ${reqPath}. Skipping dependency installation.`);
    }
  }

  private static runCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      cp.exec(command, (error, stdout, stderr) => {
        if (error) {
          Log.error(`[Setup Error] ${stderr}`);
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }
}
