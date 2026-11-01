import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { VcsOrchestrator } from './VcsOrchestrator.js';

/**
 * Lightweight local HTTP bridge server for synchronizing active agent selections
 * from the Electron renderer directly to disk (~/.gemini/config/mods/active_agents.json)
 * and providing unified VCS (Git + GitHub PR/CI) telemetry.
 */
export class AgentSyncServer {
  /**
   * @param {Object} [options]
   * @param {number} [options.port] Port to listen on (default 53912)
   * @param {string} [options.host] Host address (default 127.0.0.1)
   * @param {string} [options.configPath] Path to active_agents.json
   * @param {VcsOrchestrator} [options.vcsOrchestrator] Custom VCS orchestrator
   * @param {string} [options.repoPath] Path to git repository
   */
  constructor(options = {}) {
    this.port = options.port ?? 53912;
    this.host = options.host || '127.0.0.1';
    this.configPath = options.configPath || path.join(os.homedir(), '.gemini', 'config', 'mods', 'active_agents.json');
    this.repoPath = options.repoPath || process.cwd();
    this.vcsOrchestrator = options.vcsOrchestrator || new VcsOrchestrator({ repoPath: this.repoPath });
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

        if (req.method === 'GET' && (req.url === '/vcs/overview' || req.url.startsWith('/vcs/overview?'))) {
          try {
            const data = this.vcsOrchestrator.getRepositoryOverview();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.method === 'POST' && req.url === '/vcs/fetch') {
          try {
            if (this.vcsOrchestrator?.gitService && typeof this.vcsOrchestrator.gitService.fetch === 'function') {
              this.vcsOrchestrator.gitService.fetch({ repoPath: this.repoPath });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.method === 'POST' && req.url === '/vcs/action') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const { action, branch, targetSha } = payload;
              if (!action) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing action parameter' }));
                return;
              }

              let result = {};
              if (action === 'checkout') {
                if (!branch) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Missing branch for checkout' }));
                  return;
                }
                execSync(`git checkout ${branch}`, { cwd: this.repoPath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
                result = { success: true, action: 'checkout', branch };
              } else if (action === 'pull') {
                const targetBranch = branch || 'main';
                execSync(`git pull origin ${targetBranch}`, { cwd: this.repoPath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
                result = { success: true, action: 'pull', branch: targetBranch };
              } else if (action === 'push') {
                const targetBranch = branch || 'main';
                const refspec = targetSha ? `${targetSha}:refs/heads/${targetBranch}` : targetBranch;
                execSync(`git push origin ${refspec}`, { cwd: this.repoPath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
                result = { success: true, action: 'push', branch: targetBranch, refspec };
              } else if (action === 'create-pr') {
                try {
                  const prOut = execSync(`gh pr create --fill`, { cwd: this.repoPath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
                  result = { success: true, action: 'create-pr', output: prOut.trim() };
                } catch (e) {
                  try {
                    const remoteUrl = execSync('git remote get-url origin', { cwd: this.repoPath, encoding: 'utf-8' }).trim();
                    const cleanRemote = remoteUrl.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
                    result = { success: false, fallbackUrl: `${cleanRemote}/compare`, error: e.message };
                  } catch {
                    result = { success: false, error: e.message };
                  }
                }
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Unsupported action: ${action}` }));
                return;
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
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
