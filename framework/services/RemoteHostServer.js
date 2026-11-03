import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Lightweight HTTP/SSE server that runs on the host PC (PC de escritorio)
 * to securely expose conversation transcripts and metadata across Tailscale.
 */
export class RemoteHostServer {
  /**
   * @param {Object} [options]
   * @param {string} [options.host] IP address to bind (defaults to 127.0.0.1, or Tailscale 100.x)
   * @param {number} [options.port] Port to listen on (default 53911, 0 for dynamic)
   * @param {string} [options.brainDir] Root path to Antigravity brain conversation directory
   * @param {string} [options.nodeName] Display hostname or alias
   */
  constructor(options = {}) {
    this.host = options.host || '127.0.0.1';
    this.port = options.port ?? 53911;
    this.brainDir = options.brainDir || this.resolveBrainDir();
    this.nodeName = options.nodeName || os.hostname();
    this.server = null;
    this.activeSseConnections = new Set();
  }

  /**
   * Resolves the default Antigravity conversation brain directory.
   * @returns {string}
   */
  resolveBrainDir() {
    // 1. Standard global path
    const homedir = os.homedir();
    const candidatePaths = [
      path.join(homedir, '.gemini', 'antigravity', 'brain'),
      path.join(homedir, 'AppData', 'Roaming', 'Antigravity', 'brain')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }

    return candidatePaths[0];
  }

  /**
   * Starts the HTTP server.
   * @returns {Promise<{ host: string, port: number }>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        const addr = this.server.address();
        const resolvedPort = typeof addr === 'object' && addr ? addr.port : this.port;
        resolve({ host: this.host, port: resolvedPort });
      });
    });
  }

  /**
   * Stops the server and closes all active streaming sockets.
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      for (const sseRes of this.activeSseConnections) {
        try {
          sseRes.end();
        } catch {}
      }
      this.activeSseConnections.clear();

      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Finds the path to the transcript.jsonl file for a conversation ID.
   * @param {string} convId
   * @returns {string|null}
   */
  getTranscriptPath(convId) {
    if (!convId || typeof convId !== 'string') return null;

    const possiblePaths = [
      path.join(this.brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl'),
      path.join(this.brainDir, convId, 'transcript.jsonl')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }

    return null;
  }

  /**
   * Scans brain directory and returns list of conversations with titles and metadata.
   * @returns {Array<{ id: string, title: string, updatedAt: string, sizeBytes: number }>}
   */
  getConversations() {
    if (!fs.existsSync(this.brainDir)) {
      return [];
    }

    const conversations = [];

    try {
      const entries = fs.readdirSync(this.brainDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const convId = entry.name;
        const transcriptPath = this.getTranscriptPath(convId);

        if (transcriptPath) {
          try {
            const stat = fs.statSync(transcriptPath);
            let title = convId;

            // Extract initial message as title
            const fd = fs.openSync(transcriptPath, 'r');
            const buf = Buffer.alloc(Math.min(stat.size, 8192));
            fs.readSync(fd, buf, 0, buf.length, 0);
            fs.closeSync(fd);

            const snippet = buf.toString('utf-8');
            const lines = snippet.split('\n');

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed);
                if (parsed.type === 'USER_INPUT' && parsed.content) {
                  title = typeof parsed.content === 'string'
                    ? parsed.content.slice(0, 120).trim()
                    : title;
                  break;
                }
              } catch {}
            }

            conversations.push({
              id: convId,
              title,
              updatedAt: new Date(stat.mtimeMs).toISOString(),
              sizeBytes: stat.size
            });
          } catch {}
        }
      }
    } catch {}

    // Sort by most recently updated
    return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Dispatches incoming HTTP requests to handlers.
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  handleRequest(req, res) {
    // Add CORS headers for LAN/Tailscale consumption
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // 1. Health endpoint
    if (pathname === '/api/v1/health') {
      const healthData = {
        status: 'ok',
        nodeName: this.nodeName,
        tailscaleIp: this.host,
        uptimeSeconds: Math.floor(process.uptime()),
        activeConversationsCount: this.getConversations().length
      };

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(healthData, null, 2));
      return;
    }

    // 2. Conversations list
    if (pathname === '/api/v1/conversations') {
      const list = this.getConversations();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(list, null, 2));
      return;
    }

    // 3. Conversations stream (SSE)
    const streamMatch = pathname.match(/^\/api\/v1\/conversations\/([^/]+)\/stream$/);
    if (streamMatch) {
      const convId = streamMatch[1];
      const transcriptPath = this.getTranscriptPath(convId);

      if (!transcriptPath) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation transcript not found' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      this.activeSseConnections.add(res);

      // Send initial content
      try {
        const fullContent = fs.readFileSync(transcriptPath, 'utf-8');
        const lines = fullContent.split('\n').filter(l => l.trim().length > 0);
        for (const line of lines) {
          res.write(`data: ${line}\n\n`);
        }
      } catch {}

      // Watch for appended updates
      let lastSize = fs.statSync(transcriptPath).size;
      const interval = setInterval(() => {
        try {
          if (!fs.existsSync(transcriptPath)) return;
          const currStat = fs.statSync(transcriptPath);
          if (currStat.size > lastSize) {
            const fd = fs.openSync(transcriptPath, 'r');
            const bytesToRead = currStat.size - lastSize;
            const buffer = Buffer.alloc(bytesToRead);
            fs.readSync(fd, buffer, 0, bytesToRead, lastSize);
            fs.closeSync(fd);
            lastSize = currStat.size;

            const newLines = buffer.toString('utf-8').split('\n').filter(l => l.trim().length > 0);
            for (const nl of newLines) {
              res.write(`data: ${nl}\n\n`);
            }
          }
        } catch {}
      }, 500);

      req.on('close', () => {
        clearInterval(interval);
        this.activeSseConnections.delete(res);
      });

      return;
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found' }));
  }
}
