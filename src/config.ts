import * as path from 'path';

/**
 * Central configuration for the Diffusing MCP Capsule.
 * Prioritizes environment variables.
 */
export class Config {
  /**
   * Root directory of the Diffusing project.
   * REQUIRED: Must be set via DIFFUSING_PROJECT_ROOT environment variable.
   */
  static get projectRoot(): string {
    const root = process.env.DIFFUSING_PROJECT_ROOT || 'C:\\GIT\\Diffusing';
    const resolved = path.resolve(root);
    console.error(`[Config] Project Root: ${resolved}`);
    return resolved;
  }

  static get backendPort(): number {
    return parseInt(process.env.DIFFUSING_BACKEND_PORT || '5555');
  }

  static get capsulePort(): number {
    return parseInt(process.env.DIFFUSING_CAPSULE_PORT || '5556');
  }

  static get idleTimeout(): number {
      return parseInt(process.env.DIFFUSING_IDLE_TIMEOUT || String(15 * 60 * 1000));
  }

  static get backendScript(): string {
    return path.join(this.projectRoot, 'toProjectBackend', 'image_listener.py');
  }

  static get outputPath(): string {
    return path.join(this.projectRoot, 'output');
  }

  static get requirementsPath(): string {
    return path.join(this.projectRoot, 'requirements.txt');
  }
}
