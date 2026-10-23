import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Discovers and extracts the active Chrome DevTools Protocol (CDP) debugging
 * port from Antigravity Electron logs.
 */
export class CdpPortResolver {
  /**
   * @param {Object} [options]
   * @param {string} [options.logDir] Custom path to Antigravity logs directory.
   * @param {number} [options.defaultPort] Fallback port if auto-discovery fails.
   */
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity', 'logs');
    this.defaultPort = options.defaultPort ?? 53908;
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
   * Resolves the active port by inspecting the most recent log file.
   * @returns {number} Discovered port or default fallback.
   */
  resolvePort() {
    try {
      if (!fs.existsSync(this.logDir)) {
        return this.defaultPort;
      }

      const logFiles = fs.readdirSync(this.logDir)
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const fullPath = path.join(this.logDir, f);
          return { name: f, fullPath, time: fs.statSync(fullPath).mtimeMs };
        })
        .sort((a, b) => b.time - a.time);

      if (!logFiles.length) {
        return this.defaultPort;
      }

      const newestLog = fs.readFileSync(logFiles[0].fullPath, 'utf-8');
      return CdpPortResolver.parsePortFromLog(newestLog, this.defaultPort);
    } catch {
      return this.defaultPort;
    }
  }
}
