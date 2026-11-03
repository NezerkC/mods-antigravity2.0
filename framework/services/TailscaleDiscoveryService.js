import { execSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * Normalizes device properties extracted from Tailscale JSON representation.
 * @typedef {Object} TailscaleDevice
 * @property {string} id
 * @property {string} name
 * @property {string} dnsName
 * @property {string} os
 * @property {string} ipv4
 * @property {string} ipv6
 * @property {boolean} online
 * @property {boolean} isSelf
 * @property {string} lastSeen
 */

/**
 * Service that interfaces with the local Tailscale CLI / daemon to discover
 * network topology, devices, and mesh IPs (100.x.y.z) in real time.
 */
export class TailscaleDiscoveryService {
  /**
   * @param {Object} [options]
   * @param {Function} [options.execFn] Custom executor function for mocking CLI calls
   * @param {string} [options.cliPath] Explicit path to the tailscale binary
   */
  constructor(options = {}) {
    this.cliPath = options.cliPath || this.resolveTailscaleCli();
    this.execFn = options.execFn || ((cmd) => execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000
    }));
  }

  /**
   * Detects the location of the Tailscale executable across common OS paths.
   * @returns {string}
   */
  resolveTailscaleCli() {
    const defaultPaths = [
      'C:\\Program Files\\Tailscale\\tailscale.exe',
      'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
      '/usr/local/bin/tailscale',
      '/usr/bin/tailscale'
    ];

    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        return `"${p}"`;
      }
    }

    return 'tailscale';
  }

  /**
   * Executes tailscale status in JSON mode.
   * @returns {Object|null} Parsed JSON status or null if unavailable.
   */
  getRawStatus() {
    try {
      const output = this.execFn(`${this.cliPath} status --json`);
      if (!output || typeof output !== 'string') return null;
      return JSON.parse(output.trim());
    } catch {
      return null;
    }
  }

  /**
   * Checks the health and connectivity of the local Tailscale node.
   * @returns {{ isInstalled: boolean, isRunning: boolean, selfName: string, selfIpv4: string }}
   */
  checkStatus() {
    const raw = this.getRawStatus();
    if (!raw || typeof raw !== 'object') {
      return {
        isInstalled: false,
        isRunning: false,
        selfName: '',
        selfIpv4: ''
      };
    }

    const selfIpv4 = Array.isArray(raw.Self?.TailscaleIPs)
      ? raw.Self.TailscaleIPs.find(ip => !ip.includes(':')) || ''
      : '';

    return {
      isInstalled: true,
      isRunning: raw.BackendState === 'Running',
      selfName: raw.Self?.HostName || '',
      selfIpv4
    };
  }

  /**
   * Transforms raw Tailscale status into a uniform list of local and peer devices.
   * @returns {TailscaleDevice[]}
   */
  getDevices() {
    const raw = this.getRawStatus();
    if (!raw || typeof raw !== 'object') {
      return [];
    }

    const devices = [];

    // Parse Self device (Current machine)
    if (raw.Self) {
      const selfIps = Array.isArray(raw.Self.TailscaleIPs) ? raw.Self.TailscaleIPs : [];
      devices.push({
        id: String(raw.Self.ID || raw.Self.NodeID || 'self'),
        name: raw.Self.HostName || 'localhost',
        dnsName: raw.Self.DNSName || '',
        os: raw.Self.OS || '',
        ipv4: selfIps.find(ip => !ip.includes(':')) || '',
        ipv6: selfIps.find(ip => ip.includes(':')) || '',
        online: Boolean(raw.Self.Online),
        isSelf: true,
        lastSeen: ''
      });
    }

    // Parse Peer devices
    if (raw.Peer && typeof raw.Peer === 'object') {
      for (const peer of Object.values(raw.Peer)) {
        if (!peer || typeof peer !== 'object') continue;
        const peerIps = Array.isArray(peer.TailscaleIPs) ? peer.TailscaleIPs : [];
        devices.push({
          id: String(peer.ID || peer.NodeID || ''),
          name: peer.HostName || '',
          dnsName: peer.DNSName || '',
          os: peer.OS || '',
          ipv4: peerIps.find(ip => !ip.includes(':')) || '',
          ipv6: peerIps.find(ip => ip.includes(':')) || '',
          online: Boolean(peer.Online),
          isSelf: false,
          lastSeen: peer.LastSeen || ''
        });
      }
    }

    return devices;
  }

  /**
   * Returns only remote peers that are currently reachable and online.
   * @returns {TailscaleDevice[]}
   */
  getOnlinePeers() {
    return this.getDevices().filter(d => !d.isSelf && d.online && d.ipv4);
  }

  /**
   * Finds a device by case-insensitive name or hostname match.
   * @param {string} name
   * @returns {TailscaleDevice|null}
   */
  findDeviceByName(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    return this.getDevices().find(d => d.name.toLowerCase() === lower) || null;
  }
}
