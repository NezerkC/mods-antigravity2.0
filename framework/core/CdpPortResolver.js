import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Discovers and validates the active Chrome DevTools Protocol (CDP) debugging port
 * for Antigravity Electron via active HTTP probing, CLI/environment flags, and log tail fallback.
 */
export class CdpPortResolver {
  /**
   * @param {Object} [options]
   * @param {string} [options.logDir] Custom path to Antigravity logs directory.
   * @param {string} [options.devToolsActivePortPath] Custom path to Electron DevToolsActivePort file.
   * @param {number} [options.defaultPort] Fallback port if auto-discovery fails.
   * @param {number[]} [options.candidatePorts] Candidate ports to probe.
   * @param {number} [options.probeTimeoutMs] Timeout for active HTTP probes in ms.
   * @param {string} [options.host] Host address (default 127.0.0.1).
   */
  constructor(options = {}) {
    this.host = options.host || '127.0.0.1';
    this.logDir = options.logDir || path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity', 'logs');
    this.devToolsActivePortPath = options.devToolsActivePortPath || path.join(path.dirname(this.logDir), 'DevToolsActivePort');
    this.defaultPort = options.defaultPort ?? 53908;
    this.candidatePorts = options.candidatePorts || [56547, 53908, 9222, 9229, 53909, 53910];
    this.probeTimeoutMs = options.probeTimeoutMs ?? 150;
  }

  /**
   * Actively probes an HTTP port to verify if it is an active CDP endpoint.
   * @param {number} port
   * @param {number} [timeoutMs]
   * @returns {Promise<boolean>}
   */
  async probePort(port, timeoutMs = this.probeTimeoutMs) {
    if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
      return false;
    }

    const now = Date.now();
    if (this._probeCache && this._probeCache.port === port && (now - this._probeCache.timestamp < 1000)) {
      return this._probeCache.result;
    }

    try {
      const url = `http://${this.host}:${port}/json/version`;
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        this._probeCache = { port, result: false, timestamp: now };
        return false;
      }

      const data = await res.json();
      const result = typeof data === 'object' && data !== null && typeof data.webSocketDebuggerUrl === 'string';
      this._probeCache = { port, result, timestamp: now };
      return result;
    } catch {
      this._probeCache = { port, result: false, timestamp: now };
      return false;
    }
  }

  /**
   * Parses the CDP WebSocket port from a raw log string.
   * @param {string} content Log file contents.
   * @param {number|null} [fallback=null] Fallback value if no pattern matches.
   * @returns {number|null}
   */
  static parsePortFromLog(content, fallback = null) {
    if (typeof content !== 'string') return fallback;
    const match = content.match(/ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser/);
    if (match && match[1]) {
      const port = Number(match[1]);
      return Number.isSafeInteger(port) && port > 0 ? port : fallback;
    }
    return fallback;
  }

  /**
   * Synchronously attempts to resolve the port by inspecting the newest log files.
   * Reads only the tail (last 64 KB) of each log to prevent memory bloat on large files.
   * @returns {number|null} Discovered port or null if not found.
   */
  resolvePortFromLogs() {
    try {
      if (!fs.existsSync(this.logDir)) {
        return null;
      }

      const logFiles = fs.readdirSync(this.logDir)
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const fullPath = path.join(this.logDir, f);
          const stat = fs.statSync(fullPath);
          return { name: f, fullPath, time: stat.mtimeMs, size: stat.size };
        })
        .sort((a, b) => b.time - a.time);

      if (!logFiles.length) {
        return null;
      }

      // Check the newest logs (up to 3 most recent)
      for (const file of logFiles.slice(0, 3)) {
        try {
          const maxReadBytes = 64 * 1024; // Read at most 64KB tail
          let content = '';
          if (file.size <= maxReadBytes) {
            content = fs.readFileSync(file.fullPath, 'utf-8');
          } else {
            const buffer = Buffer.alloc(maxReadBytes);
            const fd = fs.openSync(file.fullPath, 'r');
            fs.readSync(fd, buffer, 0, maxReadBytes, file.size - maxReadBytes);
            fs.closeSync(fd);
            content = buffer.toString('utf-8');
          }

          const port = CdpPortResolver.parsePortFromLog(content, null);
          if (port) return port;
        } catch {}
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Synchronously reads Electron's DevToolsActivePort file (line 1 = active port)
   * and parses it as a valid TCP port (1..65535).
   * @returns {number|null} Discovered port or null if missing/invalid.
   */
  resolvePortFromDevToolsActivePort() {
    try {
      if (!this.devToolsActivePortPath || !fs.existsSync(this.devToolsActivePortPath)) {
        return null;
      }

      const raw = fs.readFileSync(this.devToolsActivePortPath, 'utf-8');
      const firstLine = raw.split(/\r?\n/)[0]?.replace(/^\uFEFF/, '').trim();
      if (!firstLine || !/^\d+$/.test(firstLine)) {
        return null;
      }

      const port = Number(firstLine);
      return Number.isSafeInteger(port) && port >= 1 && port <= 65535 ? port : null;
    } catch {
      return null;
    }
  }

  /**
   * Resolves the active CDP port using a tiered cascading strategy:
   * 1. CLI parameter (--cdp-port <port>)
   * 2. Environment variable (ANTIGRAVITY_CDP_PORT)
   * 3. Electron DevToolsActivePort file (verified via active HTTP probe)
   * 4. Active HTTP probe on defaultPort & candidate ports
   * 5. Passive log tail inspection
   * 6. Fallback to defaultPort
   * @returns {Promise<number>}
   */
  async resolvePort() {
    // 1. Check CLI argument (--cdp-port <port>)
    if (typeof process !== 'undefined' && Array.isArray(process.argv)) {
      const idx = process.argv.indexOf('--cdp-port');
      if (idx !== -1 && process.argv[idx + 1]) {
        const cliPort = Number(process.argv[idx + 1]);
        if (Number.isSafeInteger(cliPort) && cliPort > 0) {
          return cliPort;
        }
      }
    }

    // 2. Check Environment Variable
    if (typeof process !== 'undefined' && process.env?.ANTIGRAVITY_CDP_PORT) {
      const envPort = Number(process.env.ANTIGRAVITY_CDP_PORT);
      if (Number.isSafeInteger(envPort) && envPort > 0) {
        return envPort;
      }
    }

    // 3. Electron DevToolsActivePort discovery (verified via active HTTP probe)
    const activePort = this.resolvePortFromDevToolsActivePort();
    if (activePort && (await this.probePort(activePort))) {
      return activePort;
    }

    // 4. Active HTTP probe on default port
    if (await this.probePort(this.defaultPort)) {
      return this.defaultPort;
    }

    // 5. Active HTTP probe across candidate ports
    for (const port of this.candidatePorts) {
      if (port !== this.defaultPort && (await this.probePort(port))) {
        return port;
      }
    }

    // 6. Fallback: Passive log tail inspection
    const logPort = this.resolvePortFromLogs();
    if (logPort) {
      return logPort;
    }

    // 7. Final default fallback
    return this.defaultPort;
  }
}
