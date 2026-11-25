// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

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
   * @param {string} [options.modelSlotsPath] Path to model_slots.json
   * @param {string} [options.modelCatalogPath] Path to model_catalog.json
   * @param {VcsOrchestrator} [options.vcsOrchestrator] Custom VCS orchestrator
   * @param {string} [options.repoPath] Path to git repository
   */
  constructor(options = {}) {
    this.port = options.port ?? 53912;
    this.host = options.host || '127.0.0.1';
    this.configPath = options.configPath || path.join(os.homedir(), '.gemini', 'config', 'mods', 'active_agents.json');
    this.brainDir = options.brainDir || path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    this.sessionRepos = new Map();
    this.modelSlotsPath = options.modelSlotsPath || path.join(os.homedir(), '.gemini', 'config', 'mods', 'model_slots.json');
    this.modelCatalogPath = options.modelCatalogPath || path.join(os.homedir(), '.gemini', 'config', 'mods', 'model_catalog.json');
    this.telemetryService = options.telemetryService || null;
    this.repoPath = options.repoPath || process.cwd();
    this.vcsOrchestrator = options.vcsOrchestrator || new VcsOrchestrator({ repoPath: this.repoPath });
    this.server = null;
  }

  /**
   * Normalizes a candidate file/directory path or file:// URI into a valid Git repository root.
   * @param {string} [candidate='']
   * @param {boolean} [requireGit=false]
   * @returns {string|null}
   */
  normalizeRepoCandidate(candidate = '', requireGit = false) {
    if (!candidate || typeof candidate !== 'string') return null;
    let clean = candidate.trim();
    if (!clean) return null;

    try {
      if (clean.startsWith('file://')) {
        clean = decodeURIComponent(clean.replace(/^file:\/\/\/?/, ''));
      } else if (clean.includes('%')) {
        clean = decodeURIComponent(clean);
      }
      if (/^\/([a-zA-Z]:)/.test(clean)) {
        clean = clean.slice(1);
      }
    } catch {}

    clean = path.normalize(clean);
    if (!fs.existsSync(clean)) return null;

    let startDir = clean;
    try {
      const stat = fs.statSync(clean);
      startDir = stat.isDirectory() ? clean : path.dirname(clean);
    } catch {
      return null;
    }

    let curr = startDir;
    while (curr && curr !== path.dirname(curr)) {
      if (fs.existsSync(path.join(curr, '.git'))) {
        return curr;
      }
      curr = path.dirname(curr);
    }
    if (curr && fs.existsSync(path.join(curr, '.git'))) {
      return curr;
    }

    return requireGit ? null : startDir;
  }

  /**
   * Resolves the Git repository root for a specific conversation cascadeId or explicit path.
   * @param {string} [cascadeId]
   * @param {string} [explicitRepoPath]
   * @returns {string}
   */
  resolveRepoForCascade(cascadeId, explicitRepoPath) {
    if (explicitRepoPath) {
      const normalized = this.normalizeRepoCandidate(explicitRepoPath, false);
      if (normalized) {
        this.repoPath = normalized;
        if (cascadeId) {
          this.sessionRepos.set(cascadeId, normalized);
        }
        return normalized;
      }
    }

    if (cascadeId && this.sessionRepos.has(cascadeId)) {
      const cached = this.sessionRepos.get(cascadeId);
      if (cached && fs.existsSync(cached)) {
        this.repoPath = cached;
        return cached;
      }
      this.sessionRepos.delete(cascadeId);
    }

    if (cascadeId && /^[0-9a-fA-F-]{36}$/.test(cascadeId)) {
      const logsDir = path.join(this.brainDir, cascadeId, '.system_generated', 'logs');
      const candidates = [
        path.join(logsDir, 'transcript.jsonl'),
        path.join(logsDir, 'transcript_full.jsonl')
      ];
      for (const transcriptPath of candidates) {
        if (!fs.existsSync(transcriptPath)) continue;
        try {
          const fd = fs.openSync(transcriptPath, 'r');
          const buf = Buffer.alloc(65536);
          const bytesRead = fs.readSync(fd, buf, 0, 65536, 0);
          fs.closeSync(fd);
          const sample = buf.toString('utf-8', 0, bytesRead);
          const isJsonl = sample.trimStart().startsWith('{');
          const cleanSample = isJsonl
            ? sample.replace(/\\\\/g, '/').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\"/g, '"')
            : sample.replace(/\\\\/g, '/').replace(/\\/g, '/');

          const cwdMatch = cleanSample.match(/Command Working Directory:\s*([^\r\n\\"]+)/i) ||
                           cleanSample.match(/Active Workspaces:\s*(?:\\n|\r?\n)-\s*([^\r\n\\"]+)/i);
          if (cwdMatch && cwdMatch[1]) {
            const resolved = this.normalizeRepoCandidate(cwdMatch[1].trim(), false);
            if (resolved) {
              this.sessionRepos.set(cascadeId, resolved);
              this.repoPath = resolved;
              return resolved;
            }
          }

          const pathRegex = /"Path"\s*:\s*"([^"]+)"/gi;
          let m;
          while ((m = pathRegex.exec(cleanSample)) !== null) {
            const p = m[1];
            if (!p || p.includes('.gemini/antigravity/builtin') || p.includes('.gemini/antigravity/brain')) {
              continue;
            }
            const resolved = this.normalizeRepoCandidate(p, true);
            if (resolved) {
              this.sessionRepos.set(cascadeId, resolved);
              this.repoPath = resolved;
              return resolved;
            }
          }
        } catch {}
      }
    }

    return this.repoPath;
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
   * Reads model slots from disk or returns default configuration.
   * @returns {Object}
   */
  readModelSlots() {
    const defaults = {
      planner: 'gemini-4-argon-high',
      builder: 'gemini-4-hydrogen-high',
      enabled: true,
      sessions: {}
    };
    try {
      if (fs.existsSync(this.modelSlotsPath)) {
        const raw = fs.readFileSync(this.modelSlotsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const sessions = (parsed.sessions && typeof parsed.sessions === 'object' && !Array.isArray(parsed.sessions))
            ? parsed.sessions
            : {};
          return { ...defaults, ...parsed, sessions };
        }
      }
    } catch {}
    return defaults;
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
   * Saves model slots configuration to disk atomically.
   * @param {Object} data
   */
  writeModelSlots(data) {
    try {
      const dir = path.dirname(this.modelSlotsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.modelSlotsPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.modelSlotsPath);
    } catch (err) {
      // Fallback direct write
      try {
        fs.writeFileSync(this.modelSlotsPath, JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
    }
  }

  /**
   * Updates model slots config with partial patch.
   * @param {Object} [patch]
   * @returns {Object}
   */
  updateModelSlots(patch = {}) {
    const current = this.readModelSlots();
    const nextSessions = (patch.sessions && typeof patch.sessions === 'object' && !Array.isArray(patch.sessions))
      ? { ...(current.sessions || {}), ...patch.sessions }
      : (current.sessions || {});
    const updated = {
      ...current,
      ...patch,
      sessions: nextSessions,
      updatedAt: Date.now()
    };
    this.writeModelSlots(updated);
    return updated;
  }

  /**
   * Reads discovered live model catalog from disk or returns an empty snapshot.
   * @returns {Object}
   */
  readModelCatalog() {
    const empty = {
      source: 'fallback',
      baseModels: [],
      modelCatalog: [],
      disabledModels: [],
      totalBaseModels: 0,
      totalModels: 0,
      updatedAt: 0
    };
    try {
      if (fs.existsSync(this.modelCatalogPath)) {
        const raw = fs.readFileSync(this.modelCatalogPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return {
            ...empty,
            ...parsed,
            baseModels: Array.isArray(parsed.baseModels) ? parsed.baseModels : [],
            modelCatalog: Array.isArray(parsed.modelCatalog) ? parsed.modelCatalog : [],
            disabledModels: Array.isArray(parsed.disabledModels) ? parsed.disabledModels : []
          };
        }
      }
    } catch {}
    return empty;
  }

  /**
   * Saves discovered model catalog to disk atomically.
   * @param {Object} data
   */
  writeModelCatalog(data) {
    try {
      const dir = path.dirname(this.modelCatalogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.modelCatalogPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.modelCatalogPath);
    } catch {
      try {
        fs.writeFileSync(this.modelCatalogPath, JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
    }
  }

  /**
   * Updates and persists the live discovered model catalog.
   * @param {Object} payload
   * @returns {Object|null}
   */
  updateModelCatalog(payload = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const baseModels = Array.isArray(payload.baseModels) ? payload.baseModels : [];
    const modelCatalog = Array.isArray(payload.modelCatalog) ? payload.modelCatalog : [];
    const disabledModels = Array.isArray(payload.disabledModels) ? payload.disabledModels : [];
    if (baseModels.length === 0 && modelCatalog.length === 0) return null;

    const updated = {
      source: typeof payload.source === 'string' && payload.source ? payload.source : 'native-react-context',
      baseModels,
      modelCatalog,
      disabledModels,
      totalBaseModels: baseModels.length,
      totalModels: modelCatalog.length,
      updatedAt: Date.now()
    };
    this.writeModelCatalog(updated);
    return updated;
  }

  /**
   * Reads saved model slots for a specific subagent sessionId, or all sessions map if omitted.
   * @param {string} [sessionId]
   * @returns {Object|null}
   */
  readSubagentSessionSlots(sessionId) {
    const current = this.readModelSlots();
    const sessions = (current.sessions && typeof current.sessions === 'object' && !Array.isArray(current.sessions))
      ? current.sessions
      : {};
    if (!sessionId) {
      return { ...sessions };
    }
    const entry = sessions[sessionId];
    return (entry && typeof entry === 'object' && !Array.isArray(entry)) ? { ...entry } : null;
  }

  /**
   * Updates and persists model slots for a specific subagent sessionId atomically.
   * @param {string} sessionId
   * @param {Object} [slots]
   * @returns {Object|null}
   */
  updateSubagentSessionSlots(sessionId, slots = {}) {
    if (!sessionId || typeof sessionId !== 'string') return null;
    const cleanId = sessionId.trim();
    if (!cleanId || !slots || typeof slots !== 'object' || Array.isArray(slots)) return null;

    const current = this.readModelSlots();
    const sessions = (current.sessions && typeof current.sessions === 'object' && !Array.isArray(current.sessions))
      ? { ...current.sessions }
      : {};
    const existing = (sessions[cleanId] && typeof sessions[cleanId] === 'object' && !Array.isArray(sessions[cleanId]))
      ? sessions[cleanId]
      : {};

    const nextSession = {
      ...existing,
      ...slots,
      planner: slots.planner || existing.planner || current.planner,
      builder: slots.builder || existing.builder || current.builder,
      updatedAt: Date.now()
    };

    sessions[cleanId] = nextSession;
    const updated = {
      ...current,
      sessions,
      updatedAt: Date.now()
    };
    this.writeModelSlots(updated);
    return nextSession;
  }

  /**
   * Updates an agent entry for a specific conversation cascadeId.
   * Preserves existing modifiers (like caveman and adhd) unless explicitly specified.
   * @param {string} cascadeId
   * @param {Object} agent
   */
  updateAgentForCascade(cascadeId, agent) {
    if (!cascadeId) return;
    const current = this.readActiveAgents();
    const existing = current[cascadeId] || {};
    const existingModifiers = existing.modifiers || {};
    const modifiers = agent.modifiers || existingModifiers;
    const caveman = (agent.caveman !== undefined)
      ? !!agent.caveman
      : ((modifiers.caveman !== undefined) ? !!modifiers.caveman : (existing.caveman ?? false));
    const adhd = (agent.adhd !== undefined)
      ? !!agent.adhd
      : ((modifiers.adhd !== undefined) ? !!modifiers.adhd : (existing.adhd ?? caveman));

    current[cascadeId] = {
      ...agent,
      modifiers: { ...existingModifiers, ...modifiers, caveman, adhd },
      caveman,
      adhd
    };
    this.writeActiveAgents(current);
  }

  /**
   * Updates modifier flags (such as caveman and adhd focus modes) for a specific cascadeId.
   * @param {string} cascadeId
   * @param {Object} modifiers
   */
  updateModifiersForCascade(cascadeId, modifiers = {}) {
    if (!cascadeId) return;
    const current = this.readActiveAgents();
    const existing = current[cascadeId] || {};
    const existingModifiers = existing.modifiers || {};
    const nextModifiers = { ...existingModifiers, ...modifiers };
    const caveman = (modifiers.caveman !== undefined)
      ? !!modifiers.caveman
      : (existing.caveman ?? false);
    const adhd = (modifiers.adhd !== undefined)
      ? !!modifiers.adhd
      : (modifiers.caveman !== undefined ? !!modifiers.caveman : (existing.adhd ?? caveman));

    current[cascadeId] = {
      ...existing,
      modifiers: { ...nextModifiers, caveman, adhd },
      caveman,
      adhd
    };
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
          let exceeded = false;
          req.on('data', chunk => {
            body += chunk;
            if (body.length > 65536) {
              exceeded = true;
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            if (exceeded || res.writableEnded) return;
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

        if (req.method === 'POST' && req.url === '/active-agent/modifier') {
          let body = '';
          let exceeded = false;
          req.on('data', chunk => {
            body += chunk;
            if (body.length > 65536) {
              exceeded = true;
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            if (exceeded || res.writableEnded) return;
            try {
              const payload = JSON.parse(body);
              if (payload.cascadeId && (payload.modifiers || payload.modifier)) {
                this.updateModifiersForCascade(payload.cascadeId, payload.modifiers || { [payload.modifier]: payload.value });
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

        if (req.method === 'GET' && req.url === '/model-catalog') {
          const data = this.readModelCatalog();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }

        if (req.method === 'GET' && (req.url === '/pit-wall' || req.url.startsWith('/pit-wall?'))) {
          const metrics = (this.telemetryService && typeof this.telemetryService.getPitWallMetrics === 'function')
            ? this.telemetryService.getPitWallMetrics()
            : null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', pitWall: metrics }));
          return;
        }

        if (req.method === 'POST' && req.url === '/model-catalog') {
          let body = '';
          let exceeded = false;
          req.on('data', chunk => {
            body += chunk;
            if (body.length > 131072) {
              exceeded = true;
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            if (exceeded || res.writableEnded) return;
            try {
              const payload = JSON.parse(body || '{}');
              const catalog = this.updateModelCatalog(payload);
              if (catalog) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, catalog }));
                return;
              }
            } catch {}
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid model catalog payload' }));
          });
          return;
        }

        if (req.method === 'GET' && req.url === '/model-slots') {
          const data = this.readModelSlots();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }

        if (req.method === 'POST' && req.url === '/model-slots') {
          let body = '';
          let exceeded = false;
          req.on('data', chunk => {
            body += chunk;
            if (body.length > 65536) {
              exceeded = true;
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            if (exceeded || res.writableEnded) return;
            try {
              const payload = JSON.parse(body || '{}');
              const slots = this.updateModelSlots(payload);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, slots }));
              return;
            } catch {}
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid payload' }));
          });
          return;
        }

        if (req.method === 'GET' && (req.url === '/subagent-model-slots' || req.url.startsWith('/subagent-model-slots?'))) {
          let sessionId = null;
          try {
            const urlObj = new URL(req.url, 'http://127.0.0.1');
            sessionId = urlObj.searchParams.get('sessionId');
          } catch {}

          if (sessionId) {
            const sessionSlots = this.readSubagentSessionSlots(sessionId);
            const globalSlots = this.readModelSlots();
            const payload = sessionSlots || {
              planner: globalSlots.planner,
              builder: globalSlots.builder,
              isDefault: true
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payload));
            return;
          }

          const allSessions = this.readSubagentSessionSlots();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(allSessions));
          return;
        }

        if (req.method === 'POST' && req.url === '/subagent-model-slots') {
          let body = '';
          let exceeded = false;
          req.on('data', chunk => {
            body += chunk;
            if (body.length > 65536) {
              exceeded = true;
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            if (exceeded || res.writableEnded) return;
            try {
              const payload = JSON.parse(body || '{}');
              if (
                payload &&
                typeof payload.sessionId === 'string' &&
                payload.sessionId.trim() &&
                payload.slots &&
                typeof payload.slots === 'object' &&
                !Array.isArray(payload.slots)
              ) {
                const cleanId = payload.sessionId.trim();
                const slots = this.updateSubagentSessionSlots(cleanId, payload.slots);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, sessionId: cleanId, slots }));
                return;
              }
            } catch {}
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid payload' }));
          });
          return;
        }

        if (req.method === 'GET' && (req.url === '/vcs/overview' || req.url.startsWith('/vcs/overview?'))) {
          try {
            let qRepo = null;
            let qCascade = null;
            try {
              const urlObj = new URL(req.url, 'http://127.0.0.1');
              qRepo = urlObj.searchParams.get('repoPath');
              qCascade = urlObj.searchParams.get('cascadeId');
            } catch {}

            const targetRepo = this.resolveRepoForCascade(qCascade, qRepo) || this.repoPath;
            const data = this.vcsOrchestrator.getRepositoryOverview({ repoPath: targetRepo });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.method === 'POST' && (req.url === '/vcs/fetch' || req.url.startsWith('/vcs/fetch?'))) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              let qRepo = null;
              let qCascade = null;
              try {
                const urlObj = new URL(req.url, 'http://127.0.0.1');
                qRepo = urlObj.searchParams.get('repoPath');
                qCascade = urlObj.searchParams.get('cascadeId');
              } catch {}
              if (body) {
                try {
                  const parsed = JSON.parse(body);
                  if (parsed.repoPath) qRepo = parsed.repoPath;
                  if (parsed.cascadeId) qCascade = parsed.cascadeId;
                } catch {}
              }
              const targetRepo = this.resolveRepoForCascade(qCascade, qRepo) || this.repoPath;
              if (this.vcsOrchestrator?.gitService && typeof this.vcsOrchestrator.gitService.fetch === 'function') {
                this.vcsOrchestrator.gitService.fetch({ repoPath: targetRepo });
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, repoPath: targetRepo }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        if (req.method === 'POST' && req.url === '/vcs/action') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const { action, branch, targetSha, cascadeId, repoPath } = payload;
              if (!action) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing action parameter' }));
                return;
              }

              const targetRepo = this.resolveRepoForCascade(cascadeId, repoPath) || this.repoPath;
              let result = {};
              if (action === 'checkout') {
                if (!branch) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Missing branch for checkout' }));
                  return;
                }
                execSync(`git checkout ${branch}`, { cwd: targetRepo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
                result = { success: true, action: 'checkout', branch, repoPath: targetRepo };
              } else if (action === 'pull') {
                const targetBranch = branch || 'main';
                execSync(`git pull origin ${targetBranch}`, { cwd: targetRepo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
                result = { success: true, action: 'pull', branch: targetBranch, repoPath: targetRepo };
              } else if (action === 'push') {
                const targetBranch = branch || 'main';
                const refspec = targetSha ? `${targetSha}:refs/heads/${targetBranch}` : targetBranch;
                execSync(`git push origin ${refspec}`, { cwd: targetRepo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
                result = { success: true, action: 'push', branch: targetBranch, refspec, repoPath: targetRepo };
              } else if (action === 'create-pr') {
                try {
                  const prOut = execSync(`gh pr create --fill`, { cwd: targetRepo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
                  result = { success: true, action: 'create-pr', output: prOut.trim(), repoPath: targetRepo };
                } catch (e) {
                  try {
                    const remoteUrl = execSync('git remote get-url origin', { cwd: targetRepo, encoding: 'utf-8', windowsHide: true }).trim();
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
        if (typeof this.server?.unref === 'function') {
          this.server.unref();
        }
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
