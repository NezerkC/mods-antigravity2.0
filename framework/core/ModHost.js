import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ModLoader } from './ModLoader.js';
import { SlotManager } from './SlotManager.js';
import { TelemetryService } from '../services/TelemetryService.js';
import { AgentSyncServer } from '../services/AgentSyncServer.js';
import { GitService } from '../services/GitService.js';
import { VcsOrchestrator } from '../services/VcsOrchestrator.js';
import { CdpPortResolver } from './CdpPortResolver.js';
import { CdpWebSocketClient } from './CdpWebSocketClient.js';

/**
 * Central orchestrator host for Antigravity Mod Framework.
 * Coordinates telemetry extraction, mod lifecycle, and CDP DOM dispatching.
 */
export class ModHost {
  /**
   * @param {Object} [options]
   * @param {SlotManager} [options.slotManager]
   * @param {ModLoader} [options.modLoader]
   * @param {TelemetryService} [options.telemetryService]
   * @param {AgentSyncServer} [options.syncServer]
   * @param {GitService} [options.gitService]
   * @param {VcsOrchestrator} [options.vcsOrchestrator]
   * @param {CdpPortResolver} [options.portResolver]
   */
  constructor(options = {}) {
    this.slotManager = options.slotManager || new SlotManager();
    this.modLoader = options.modLoader || new ModLoader({ slotManager: this.slotManager });
    this.telemetryService = options.telemetryService || new TelemetryService();
    this.syncServer = options.syncServer || new AgentSyncServer();
    this.gitService = options.gitService || new GitService();
    this.vcsOrchestrator = options.vcsOrchestrator || new VcsOrchestrator({ gitService: this.gitService });
    this.portResolver = options.portResolver || new CdpPortResolver();
  }

  /**
   * Registers an active UI mod with the host.
   * @param {import('../sdk/AntigravityMod.js').AntigravityMod} mod
   */
  registerMod(mod) {
    this.modLoader.register(mod);
  }

  /**
   * Compiles the combined DOM injection payload for all registered mods.
   * @param {Object} context
   * @returns {string}
   */
  compilePayload(context = {}) {
    return this.modLoader.buildInjectionPayload(context);
  }

  /**
   * Resolves the active Git repository root directory.
   * Checks CDP renderer tab URLs, transcript metadata, cwd, and known project paths.
   * @param {CdpWebSocketClient} [cdpClient]
   * @param {string} [explicitTranscriptPath]
   * @returns {Promise<string>}
   */
  async resolveRepoPath(cdpClient, explicitTranscriptPath) {
    // 1. Try resolving via live CDP renderer active tab, editor resource, or query parameter
    if (cdpClient) {
      try {
        const res = await cdpClient.evaluate(`
          (() => {
            // 1. Check active editor tab or resource in VS Code / Antigravity DOM
            const activeTab = document.querySelector('.tab.active, [aria-selected="true"].tab, .tab-label[aria-selected="true"]');
            if (activeTab) {
              const resource = activeTab.getAttribute('data-resource-name') ||
                               activeTab.getAttribute('title') ||
                               activeTab.getAttribute('aria-label');
              if (resource) return resource;
            }
            // 2. Query editor tab query parameter
            const search = window.location.search || '';
            const match = search.match(/tab=file__file%3A%2F%2F%2F([^&]+)/i);
            if (match && match[1]) {
              return decodeURIComponent(match[1]);
            }
            // 3. Document title fallback
            if (document.title) {
              return document.title;
            }
            return null;
          })()
        `);
        if (res && res.value && typeof res.value === 'string') {
          // Normalize clean path candidate
          let candidate = res.value.trim();
          if (candidate.startsWith('file:///')) {
            candidate = decodeURIComponent(candidate.replace('file:///', ''));
          }
          if (candidate.includes(' — ')) {
            const parts = candidate.split(' — ');
            candidate = parts[parts.length - 1].trim();
          } else if (candidate.includes(' - ')) {
            const parts = candidate.split(' - ');
            candidate = parts[0].trim();
          }

          let currentDir = fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
            ? candidate
            : path.dirname(candidate);

          while (currentDir && currentDir !== path.dirname(currentDir)) {
            if (fs.existsSync(path.join(currentDir, '.git'))) {
              if (this.syncServer) this.syncServer.repoPath = currentDir;
              if (this.vcsOrchestrator) this.vcsOrchestrator.repoPath = currentDir;
              return currentDir;
            }
            currentDir = path.dirname(currentDir);
          }
        }
      } catch {}
    }

    // 2. Try resolving via explicit transcript path
    if (explicitTranscriptPath && fs.existsSync(explicitTranscriptPath)) {
      try {
        const sample = fs.readFileSync(explicitTranscriptPath, 'utf-8').slice(0, 10000);
        const match = sample.match(/Command Working Directory:\s*([^\r\n]+)/i) ||
                      sample.match(/Active Workspaces:\s*\n-\s*([^\r\n]+)/i);
        if (match && match[1] && fs.existsSync(match[1].trim())) {
          return match[1].trim();
        }
      } catch {}
    }

    // 3. Check process.cwd() or parent directory with .git
    let cwd = process.cwd();
    while (cwd && cwd !== path.dirname(cwd)) {
      if (fs.existsSync(path.join(cwd, '.git'))) {
        return cwd;
      }
      cwd = path.dirname(cwd);
    }

    // 4. Default project directory
    const defaultWorkspace = path.join(os.homedir(), 'Documents', 'antigravity', 'joyful-chandrasekhar');
    if (fs.existsSync(path.join(defaultWorkspace, '.git'))) {
      return defaultWorkspace;
    }

    return process.cwd();
  }

  /**
   * Executes the full host lifecycle: extracts telemetry, compiles registered
   * mods, resolves CDP port, and dispatches the payload to the Electron renderer.
   * @returns {Promise<any>}
   */
  async dispatch() {
    // Ensure agent sync bridge server is active
    try {
      await this.syncServer.start();
    } catch {}

    const allMetrics = this.telemetryService.getAllMetrics();

    // Check if a specific transcript was passed via CLI argument (--transcript <path>)
    let primaryMetric = null;
    let explicitPath = null;
    const transcriptArgIdx = process.argv.indexOf('--transcript');
    if (transcriptArgIdx !== -1 && process.argv[transcriptArgIdx + 1]) {
      explicitPath = process.argv[transcriptArgIdx + 1];
      const uuidMatch = explicitPath.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
      const convId = uuidMatch ? uuidMatch[0] : null;
      if (convId && allMetrics[convId]) {
        primaryMetric = allMetrics[convId];
      } else {
        let targetTranscriptPath = explicitPath;
        if (explicitPath.endsWith('transcript_full.jsonl')) {
          const compactCandidate = path.join(path.dirname(explicitPath), 'transcript.jsonl');
          if (fs.existsSync(compactCandidate)) {
            targetTranscriptPath = compactCandidate;
          }
        }
        const parsed = this.telemetryService.parseTranscriptFile(targetTranscriptPath);
        parsed.modelQuota = this.telemetryService.resolveModelQuota(
          parsed.detectedModel,
          parsed.stepEntries,
          parsed.chatModels
        );
        delete parsed.stepEntries;
        primaryMetric = parsed;
        if (convId) {
          allMetrics[convId] = primaryMetric;
        }
      }
    }

    if (!primaryMetric) {
      const convIds = Object.keys(allMetrics);
      if (convIds.length > 0) {
        primaryMetric = allMetrics[convIds[0]];
      } else {
        primaryMetric = this.telemetryService.getEmptySnapshot();
      }
    }

    const port = await this.portResolver.resolvePort();
    const cdpClient = new CdpWebSocketClient({ port });

    const repoPath = await this.resolveRepoPath(cdpClient, explicitPath);

    let vcsOverview = {};
    try {
      vcsOverview = this.vcsOrchestrator.getRepositoryOverview({ repoPath });
    } catch (err) {
      try {
        const gitLog = this.gitService.getGitLog({ repoPath, limit: 40 });
        const gitStatus = this.gitService.getGitStatus({ repoPath });
        const github = this.gitService.getGitHubMetadata({ repoPath });
        const branches = this.gitService.getBranches({ repoPath });
        vcsOverview = {
          commits: gitLog,
          gitLog,
          status: gitStatus,
          branches,
          github,
          activeRepo: github.fullName || path.basename(repoPath)
        };
      } catch {}
    }

    const activeAgents = this.syncServer.readActiveAgents();

    const hostContext = {
      telemetry: primaryMetric,
      allMetrics,
      activeAgents,
      ...vcsOverview,
      timestamp: Date.now()
    };

    const payload = this.compilePayload(hostContext);
    const evalRes = await cdpClient.evaluate(payload);

    // Sync selected agents from renderer localStorage to disk while preserving server effectiveMode
    try {
      const mapRes = await cdpClient.evaluate("localStorage.getItem('__antigravity_selected_agents_map')");
      if (mapRes && mapRes.value) {
        const parsed = JSON.parse(mapRes.value);
        if (parsed && typeof parsed === 'object') {
          const current = this.syncServer.readActiveAgents();
          const merged = { ...current };
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof v === 'object') {
              const existing = current[k] || {};
              merged[k] = {
                ...existing,
                ...v,
                effectiveMode: (existing.id === v.id && existing.effectiveMode)
                  ? existing.effectiveMode
                  : (v.effectiveMode || (v.id === 'auto' ? 'PLAN' : undefined))
              };
            }
          }
          this.syncServer.writeActiveAgents(merged);
        }
      }
    } catch {}

    return evalRes;
  }
}
