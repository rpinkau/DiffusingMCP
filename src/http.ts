import * as http from 'http';
import { BackendManager, GenArgs } from './core.js';
import { EventEmitter } from 'events';

/**
 * Minimal HTTP server for VS Code extension communication.
 * Supports SSE for progress streaming.
 */
export class HttpServer {
  private events = new EventEmitter();

  constructor(private backend: BackendManager) {}

  listen(port: number) {
    const server = http.createServer(async (req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // SSE Endpoint for progress
      if (req.url === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        
        const listener = (data: any) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        this.events.on('message', listener);
        req.on('close', () => this.events.removeListener('message', listener));
        return;
      }

      // Generate Endpoint
      if (req.url === '/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const args: GenArgs = JSON.parse(body);
            const result = await this.backend.generate(args, (msg) => {
              this.events.emit('message', msg);
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error: any) {
            res.writeHead(500);
            res.end(JSON.stringify({ status: 'error', message: error.message }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(port, '127.0.0.1', () => {
        console.error(`[HttpServer] Listening on http://127.0.0.1:${port}`);
    });
  }
}
