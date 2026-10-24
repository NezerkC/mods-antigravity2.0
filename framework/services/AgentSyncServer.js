import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Lightweight local HTTP bridge server for synchronizing active agent selections
 * from the Electron renderer directly to disk (~/.gemini/config/mods/active_agents.json).
 */
export class AgentSyncServer {
  /**
   * @param {Object} [options]
   * @param {number} [options.port] Port to listen on (default 53912)
   * @param {string} [options.host] Host address (default 127.0.0.1)
   * @param {string} [options.configPath] Path to active_agents.json
   */
  constructor(options = {}) {
    this.port = options.port ?? 53912;
    this.host = options.host || '127.0.0.1';
    this.configPath = options.configPath || path.join(os.homedir(), '.gemini', 'config', 'mods', 'active_agents.json');
    this.server = null;
  }

  /**
   * Reads active agents map from disk.
   * @returns {Object}
   */
  readActiveAgents() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {}
    return {};
  }

  /**
   * Saves active agents map to disk atomically.
   * @param {Object} data
   */
  writeActiveAgents(data) {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.configPath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.configPath);
    } catch (err) {
      // Fallback direct write
      try {
        fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
    }
  }

  /**
   * Updates an agent entry for a specific conversation cascadeId.
   * @param {string} cascadeId
   * @param {Object} agent
   */
  updateAgentForCascade(cascadeId, agent) {
    if (!cascadeId) return;
    const current = this.readActiveAgents();
    current[cascadeId] = agent;
    this.writeActiveAgents(current);
  }

  /**
   * Starts the HTTP bridge server if not already running.
   * @returns {Promise<boolean>}
   */
  async start() {
    if (this.server) return true;

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (req.method === 'POST' && req.url === '/active-agent') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body);
              if (payload.cascadeId && payload.agent) {
                this.updateAgentForCascade(payload.cascadeId, payload.agent);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, cascadeId: payload.cascadeId }));
                return;
              }
            } catch {}
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid payload' }));
          });
          return;
        }

        if (req.method === 'GET' && req.url === '/active-agents') {
          const data = this.readActiveAgents();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Port already in use by another instance or daemon, which is fine
          this.server = null;
          resolve(false);
        } else {
          resolve(false);
        }
      });

      this.server.listen(this.port, this.host, () => {
        resolve(true);
      });
    });
  }

  /**
   * Stops the server if running.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }
}
