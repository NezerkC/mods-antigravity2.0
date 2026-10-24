import { ModLoader } from './ModLoader.js';
import { SlotManager } from './SlotManager.js';
import { TelemetryService } from '../services/TelemetryService.js';
import { AgentSyncServer } from '../services/AgentSyncServer.js';
import { GitService } from '../services/GitService.js';
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
   * @param {CdpPortResolver} [options.portResolver]
   */
  constructor(options = {}) {
    this.slotManager = options.slotManager || new SlotManager();
    this.modLoader = options.modLoader || new ModLoader({ slotManager: this.slotManager });
    this.telemetryService = options.telemetryService || new TelemetryService();
    this.syncServer = options.syncServer || new AgentSyncServer();
    this.gitService = options.gitService || new GitService();
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
    const transcriptArgIdx = process.argv.indexOf('--transcript');
    if (transcriptArgIdx !== -1 && process.argv[transcriptArgIdx + 1]) {
      const explicitPath = process.argv[transcriptArgIdx + 1];
      primaryMetric = this.telemetryService.parseTranscriptFile(explicitPath);
    }

    if (!primaryMetric) {
      const convIds = Object.keys(allMetrics);
      if (convIds.length > 0) {
        primaryMetric = allMetrics[convIds[0]];
      } else {
        primaryMetric = this.telemetryService.getEmptySnapshot();
      }
    }

    let gitLog = [];
    let gitStatus = { branch: '', isClean: true, ahead: 0, behind: 0 };
    let github = { isGitHub: false };
    try {
      gitLog = this.gitService.getGitLog({ limit: 40 });
      gitStatus = this.gitService.getGitStatus();
      github = this.gitService.getGitHubMetadata();
    } catch (err) {}

    const hostContext = {
      telemetry: primaryMetric,
      allMetrics,
      gitLog,
      gitStatus,
      github,
      commits: gitLog,
      status: gitStatus,
      timestamp: Date.now()
    };

    const payload = this.compilePayload(hostContext);
    const port = await this.portResolver.resolvePort();
    const cdpClient = new CdpWebSocketClient({ port });

    const evalRes = await cdpClient.evaluate(payload);

    // Sync selected agents from renderer localStorage to disk
    try {
      const mapRes = await cdpClient.evaluate("localStorage.getItem('__antigravity_selected_agents_map')");
      if (mapRes && mapRes.value) {
        const parsed = JSON.parse(mapRes.value);
        if (parsed && typeof parsed === 'object') {
          const current = this.syncServer.readActiveAgents();
          const merged = { ...current, ...parsed };
          this.syncServer.writeActiveAgents(merged);
        }
      }
    } catch {}

    return evalRes;
  }
}
