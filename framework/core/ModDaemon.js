import { ModHost } from './ModHost.js';
import { CdpPortResolver } from './CdpPortResolver.js';
import { CdpWebSocketClient } from './CdpWebSocketClient.js';
import { ContextTachometerMod } from '../../mods/context-tachometer/index.js';
import { AgentSelectorMod } from '../../mods/agent-selector/index.js';
import { ModsManagerMod } from '../../mods/mods-manager/index.js';
import { GitGraphMod } from '../../mods/git-graph/index.js';

/**
 * Creates a ModHost instance pre-configured with default first-party mods.
 * @param {Object} [options]
 * @returns {ModHost}
 */
export function createDefaultHost(options = {}) {
  const host = new ModHost(options);
  host.registerMod(new ContextTachometerMod());
  host.registerMod(new AgentSelectorMod());
  host.registerMod(new ModsManagerMod());
  host.registerMod(new GitGraphMod());
  return host;
}

/**
 * Autonomous background daemon watcher that monitors Antigravity Electron lifecycle
 * via CDP and ensures UI mods remain persistently injected across application restarts,
 * window reloads, and navigation events.
 */
export class ModDaemon {
  /**
   * @param {Object} [options]
   * @param {ModHost} [options.modHost] Pre-configured host instance.
   * @param {CdpPortResolver} [options.portResolver] Custom port resolver.
   * @param {number} [options.pollIntervalMs=2500] Polling cadence in ms.
   * @param {Function} [options.cdpClientFactory] Factory function returning a CDP client instance.
   * @param {Object} [options.logger] Logging interface ({ log, error, warn }).
   */
  constructor(options = {}) {
    this.portResolver = options.portResolver || new CdpPortResolver();
    this.modHost = options.modHost || createDefaultHost({ portResolver: this.portResolver });
    this.pollIntervalMs = options.pollIntervalMs ?? 2500;
    this.cdpClientFactory = options.cdpClientFactory || (port => new CdpWebSocketClient({ port }));
    this.logger = options.logger || { log: () => {}, error: () => {}, warn: () => {} };

    this.isRunning = false;
    this.timer = null;
    this.connectedPort = null;
    this.lastInjectedAt = null;
    this.isInjecting = false;
  }

  /**
   * Checks whether mod containers are actively mounted in the Electron DOM,
   * or whether the daemon persistence has been paused by the user stealth switch.
   * @param {CdpWebSocketClient} client
   * @returns {Promise<'injected' | 'missing' | 'paused'>}
   */
  async checkInjected(client) {
    try {
      const res = await client.evaluate(`
        (() => {
          const daemonEnabled = localStorage.getItem('__antigravity_daemon_enabled') !== 'false';
          if (!daemonEnabled) {
            return 'paused';
          }
          const hasScript = typeof window.__toggleTachometerPopover === 'function';
          let hasBadge = Boolean(document.querySelector('.antigravity-tachometer-badge'));
          if (hasScript && !hasBadge && typeof window.__antigravityMountAll === 'function') {
            window.__antigravityMountAll();
            hasBadge = Boolean(document.querySelector('.antigravity-tachometer-badge'));
          }
          return (hasScript && hasBadge) ? 'injected' : 'missing';
        })()
      `);
      if (res?.value === 'paused') return 'paused';
      if (res?.value === 'injected' || res?.value === true) return 'injected';
      return 'missing';
    } catch {
      return 'missing';
    }
  }

  /**
   * Single polling tick to verify CDP availability and inject mods if missing.
   * @returns {Promise<{ status: string, port?: number|null, error?: string }>}
   */
  async tick() {
    if (this.isInjecting) {
      return { status: 'busy' };
    }
    this.isInjecting = true;

    try {
      const port = await this.portResolver.resolvePort();
      const isAlive = await this.portResolver.probePort(port);

      if (!isAlive) {
        if (this.connectedPort !== null) {
          this.logger.log(`[ModDaemon] Antigravity disconnected on port ${this.connectedPort}. Waiting for reconnect...`);
          this.connectedPort = null;
        }
        return { status: 'disconnected', port: null };
      }

      this.connectedPort = port;
      const client = this.cdpClientFactory(port);
      const injectState = await this.checkInjected(client);

      if (injectState === 'paused') {
        return { status: 'paused', port };
      }

      if (injectState !== 'injected') {
        this.logger.log(`[ModDaemon] Antigravity detected on port ${port}. Injecting mods...`);
        await this.modHost.dispatch();
        this.lastInjectedAt = Date.now();
        this.logger.log(`[ModDaemon] Successfully injected mods at ${new Date(this.lastInjectedAt).toLocaleTimeString()}`);
        return { status: 'injected', port };
      }

      return { status: 'active', port };
    } catch (err) {
      this.logger.error(`[ModDaemon] Error during poll tick: ${err.message}`);
      return { status: 'error', error: err.message };
    } finally {
      this.isInjecting = false;
    }
  }

  /**
   * Starts the background monitoring loop.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.log(`[ModDaemon] Starting daemon watcher (cadence: ${this.pollIntervalMs}ms)...`);

    // Execute first tick immediately
    this.tick().catch(err => {
      this.logger.error(`[ModDaemon] Initial tick failed: ${err.message}`);
    });

    this.timer = setInterval(() => {
      this.tick().catch(err => {
        this.logger.error(`[ModDaemon] Interval tick failed: ${err.message}`);
      });
    }, this.pollIntervalMs);
  }

  /**
   * Stops the background monitoring loop cleanly.
   */
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.log('[ModDaemon] Stopped daemon watcher.');
  }

  /**
   * Returns current operational status of the daemon.
   * @returns {{ isRunning: boolean, connectedPort: number|null, lastInjectedAt: number|null, pollIntervalMs: number }}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      connectedPort: this.connectedPort,
      lastInjectedAt: this.lastInjectedAt,
      pollIntervalMs: this.pollIntervalMs
    };
  }
}
