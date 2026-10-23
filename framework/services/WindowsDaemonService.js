import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Service to manage Windows startup persistence and background lifecycle
 * for Antigravity Mod Daemon using a hidden VBScript launcher and batch runner.
 */
export class WindowsDaemonService {
  /**
   * @param {Object} [options]
   * @param {string} [options.startupDir] Override for Windows Startup directory.
   * @param {string} [options.configDir] Override for mod configuration/PID directory.
   * @param {string} [options.nodePath] Path to Node.js executable.
   */
  constructor(options = {}) {
    this.startupDir = options.startupDir || this.resolveStartupDir();
    this.configDir = options.configDir || path.join(os.homedir(), '.gemini', 'config', 'mods');
    this.nodePath = options.nodePath || process.execPath;
    this.launcherFileName = 'antigravity-mod-daemon.vbs';
    this.cmdFileName = 'run_daemon.cmd';
    this.pidFileName = 'daemon.pid';
  }

  /**
   * Resolves the current user's Windows Startup folder path.
   * @returns {string}
   */
  resolveStartupDir() {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  }

  /**
   * Returns absolute path to the VBS startup launcher in Startup folder.
   * @returns {string}
   */
  getLauncherPath() {
    return path.join(this.startupDir, this.launcherFileName);
  }

  /**
   * Returns absolute path to the CMD batch runner.
   * @returns {string}
   */
  getCmdPath() {
    return path.join(this.configDir, this.cmdFileName);
  }

  /**
   * Returns absolute path to the PID tracking file.
   * @returns {string}
   */
  getPidFilePath() {
    return path.join(this.configDir, this.pidFileName);
  }

  /**
   * Generates batch script content to run Node with log redirection.
   * @param {string} targetScript
   * @returns {string}
   */
  generateCmdContent(targetScript) {
    const resolvedScript = path.resolve(targetScript);
    const projectDir = path.dirname(path.dirname(resolvedScript));
    const logFilePath = path.join(this.configDir, 'daemon.log');

    return [
      '@echo off',
      `cd /d "${projectDir}"`,
      `"${this.nodePath}" "${resolvedScript}" >> "${logFilePath}" 2>&1`,
      ''
    ].join('\r\n');
  }

  /**
   * Generates VBScript content that executes the CMD runner with a hidden window.
   * @param {string} cmdPath
   * @returns {string}
   */
  generateVbsContent(cmdPath) {
    const resolvedCmd = path.resolve(cmdPath);
    return [
      'Set WshShell = CreateObject("WScript.Shell")',
      `WshShell.Run """${resolvedCmd}""", 0, False`,
      'Set WshShell = Nothing',
      ''
    ].join('\r\n');
  }

  /**
   * Installs the daemon runners into Windows Startup folder and config dir.
   * @param {string} targetScript Path to daemon runner script.
   * @returns {boolean}
   */
  install(targetScript) {
    if (!fs.existsSync(this.startupDir)) {
      fs.mkdirSync(this.startupDir, { recursive: true });
    }
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    const cmdPath = this.getCmdPath();
    const cmdContent = this.generateCmdContent(targetScript);
    fs.writeFileSync(cmdPath, cmdContent, 'utf-8');

    const vbsContent = this.generateVbsContent(cmdPath);
    fs.writeFileSync(this.getLauncherPath(), vbsContent, 'utf-8');
    return true;
  }

  /**
   * Removes both the launcher and runner from disk.
   * @returns {boolean}
   */
  uninstall() {
    let removed = false;
    const launcher = this.getLauncherPath();
    if (fs.existsSync(launcher)) {
      fs.unlinkSync(launcher);
      removed = true;
    }
    const cmdPath = this.getCmdPath();
    if (fs.existsSync(cmdPath)) {
      fs.unlinkSync(cmdPath);
      removed = true;
    }
    return removed;
  }

  /**
   * Checks whether the startup launcher is currently installed.
   * @returns {boolean}
   */
  isInstalled() {
    return fs.existsSync(this.getLauncherPath());
  }

  /**
   * Writes the active PID to disk for process tracking.
   * @param {number} pid
   */
  savePid(pid) {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.getPidFilePath(), String(pid), 'utf-8');
  }

  /**
   * Reads the recorded PID from disk.
   * @returns {number|null}
   */
  readPid() {
    const pidFile = this.getPidFilePath();
    if (!fs.existsSync(pidFile)) return null;
    try {
      const content = fs.readFileSync(pidFile, 'utf-8').trim();
      const pid = Number(content);
      return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }

  /**
   * Clears the recorded PID file.
   */
  clearPid() {
    const pidFile = this.getPidFilePath();
    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
      } catch {}
    }
  }

  /**
   * Checks whether the process associated with a PID is alive.
   * @param {number} pid
   * @returns {boolean}
   */
  isProcessRunning(pid) {
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Terminates the background daemon if currently running.
   * @returns {boolean}
   */
  stopRunningDaemon() {
    const pid = this.readPid();
    if (!pid) return false;

    if (this.isProcessRunning(pid)) {
      try {
        process.kill(pid);
        this.clearPid();
        return true;
      } catch {
        return false;
      }
    }

    this.clearPid();
    return false;
  }
}
