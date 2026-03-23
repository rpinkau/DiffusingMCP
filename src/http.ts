import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { Config } from './config.js';
import { BackendManager } from './core.js';
import { GenArgs, BackendMessage, GenArgsSchema } from './types.js';
import { EventEmitter } from 'events';
import { Log } from './utils.js';

const RATE_LIMIT_WINDOW = 10000; // 10s
const MAX_REQUESTS = 5;
const rateLimits = new Map<string, { count: number; start: number }>();

/**
 * Minimal HTTP server for VS Code extension communication.
 * Supports SSE for progress streaming.
 */
export class HttpServer {
  private events = new EventEmitter();

  constructor(private backend: BackendManager) {}

  listen(port: number) {
    const server = http.createServer(async (req, res) => {
      // Security Headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');

      // CORS - Restrict to localhost:3000 as requested
      const origin = req.headers.origin;
      if (origin === 'http://localhost:3000' || !origin) {
        res.setHeader('Access-Control-Allow-Origin', origin || 'http://localhost:3000');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Rate Limiting
      const ip = req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const limit = rateLimits.get(ip);
      if (limit) {
        if (now - limit.start < RATE_LIMIT_WINDOW) {
          if (limit.count >= MAX_REQUESTS) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', message: 'Too many requests. Please wait.' }));
            return;
          }
          limit.count++;
        } else {
          rateLimits.set(ip, { count: 1, start: now });
        }
      } else {
        rateLimits.set(ip, { count: 1, start: now });
      }

      // SSE Endpoint for progress and logs
      if (req.url === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        
        const messageListener = (data: any) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        const logListener = (logEntry: any) => {
          res.write(`data: ${JSON.stringify({ status: 'log', ...logEntry })}\n\n`);
        };

        this.events.on('message', messageListener);
        Log.onLog(logListener);

        req.on('close', () => {
          this.events.removeListener('message', messageListener);
          Log.offLog(logListener);
        });
        return;
      }

      // Generate Endpoint
      if (req.url === '/generate' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks).toString();
            const rawArgs = JSON.parse(body);
            
            // Input Validation with Zod
            const validation = GenArgsSchema.safeParse(rawArgs);
            if (!validation.success) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                status: 'error', 
                message: 'Invalid arguments', 
                details: validation.error.format() 
              }));
              return;
            }

            const args = validation.data;
            const result = await this.backend.generate(args, (msg) => {
              this.events.emit('message', msg);
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error: any) {
            Log.error('HTTP Generate Error', error);
            res.writeHead(500);
            // Sanitize error message (no stack trace)
            res.end(JSON.stringify({ status: 'error', message: 'Internal Server Error' }));
          }
        });
        return;
      }

      // Scan Output Endpoint
      if (req.url === '/api/scan-output' && req.method === 'GET') {
        try {
          const images = await this.backend.scanOutput();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', images }));
        } catch (error: any) {
          Log.error('HTTP Scan Output Error', error);
          res.writeHead(500);
          res.end(JSON.stringify({ status: 'error', message: 'Internal Server Error' }));
        }
        return;
      }

      // Static Image Serving
      if (req.url?.startsWith('/images/') && req.method === 'GET') {
        const filename = req.url.slice(8);
        const fullPath = path.join(Config.outputPath, filename);
        
        // Security check: ensure path is within output directory
        if (!path.resolve(fullPath).startsWith(path.resolve(Config.outputPath))) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        if (fs.existsSync(fullPath)) {
          const ext = path.extname(fullPath).toLowerCase();
          const mime: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp'
          };
          res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
          fs.createReadStream(fullPath).pipe(res);
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(port, '127.0.0.1', () => {
        Log.info(`HTTP Server listening on http://127.0.0.1:${port}`);
    });
  }
}
