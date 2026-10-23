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
    this.trayFileName = 'tray_runner.ps1';
    this.pidFileName = 'daemon.pid';
    this.trayPidFileName = 'tray.pid';
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
   * Returns absolute path to the PowerShell System Tray runner.
   * @returns {string}
   */
  getTrayPath() {
    return path.join(this.configDir, this.trayFileName);
  }

  /**
   * Returns absolute path to the PID tracking file.
   * @returns {string}
   */
  getPidFilePath() {
    return path.join(this.configDir, this.pidFileName);
  }

  /**
   * Returns absolute path to the Tray PID tracking file.
   * @returns {string}
   */
  getTrayPidFilePath() {
    return path.join(this.configDir, this.trayPidFileName);
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
   * Generates PowerShell Tray Runner script with WinForms NotifyIcon and lifecycle control.
   * @param {string} targetScript
   * @returns {string}
   */
  generateTrayContent(targetScript) {
    const resolvedScript = path.resolve(targetScript);
    const projectDir = path.dirname(path.dirname(resolvedScript));
    const logFilePath = path.join(this.configDir, 'daemon.log');
    const pidFilePath = this.getPidFilePath();
    const trayPidFilePath = this.getTrayPidFilePath();

    return [
      '# Antigravity Mod Daemon - Windows System Tray Runner',
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '',
      `$ProjectDir = '${projectDir.replace(/'/g, "''")}'`,
      `$NodePath = '${this.nodePath.replace(/'/g, "''")}'`,
      `$DaemonScript = '${resolvedScript.replace(/'/g, "''")}'`,
      `$ConfigDir = '${this.configDir.replace(/'/g, "''")}'`,
      `$LogPath = '${logFilePath.replace(/'/g, "''")}'`,
      `$PidFile = '${pidFilePath.replace(/'/g, "''")}'`,
      `$TrayPidFile = '${trayPidFilePath.replace(/'/g, "''")}'`,
      '',
      'try {',
      '  [System.IO.File]::WriteAllText($TrayPidFile, $PID.ToString())',
      '} catch {}',
      '',
      '$appIcon = $null',
      '$antigravityExe = "$env:LOCALAPPDATA\\Programs\\antigravity\\Antigravity.exe"',
      'if (Test-Path $antigravityExe) {',
      '  try {',
      '    $appIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($antigravityExe)',
      '  } catch {}',
      '}',
      'if (-not $appIcon) {',
      '  $appIcon = [System.Drawing.SystemIcons]::Application',
      '}',
      '',
      'function Is-Running([int]$targetPid) {',
      '  if ($targetPid -le 0) { return $false }',
      '  $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue',
      '  return ($null -ne $proc -and -not $proc.HasExited)',
      '}',
      '',
      'function Get-DaemonPid() {',
      '  if (Test-Path $PidFile) {',
      '    try {',
      '      $txt = (Get-Content $PidFile -Raw).Trim()',
      '      [int]$parsed = 0',
      '      if ([int]::TryParse($txt, [ref]$parsed)) { return $parsed }',
      '    } catch {}',
      '  }',
      '  return 0',
      '}',
      '',
      'function Start-Daemon() {',
      '  $p = Get-DaemonPid',
      '  if (Is-Running $p) { return }',
      '  $psi = New-Object System.Diagnostics.ProcessStartInfo',
      '  $psi.FileName = $NodePath',
      '  $psi.Arguments = "`"$DaemonScript`""',
      '  $psi.WorkingDirectory = $ProjectDir',
      '  $psi.RedirectStandardOutput = $false',
      '  $psi.RedirectStandardError = $false',
      '  $psi.UseShellExecute = $false',
      '  $psi.CreateNoWindow = $true',
      '  $proc = [System.Diagnostics.Process]::Start($psi)',
      '  if ($proc) {',
      '    try { [System.IO.File]::WriteAllText($PidFile, $proc.Id.ToString()) } catch {}',
      '  }',
      '}',
      '',
      'function Stop-Daemon() {',
      '  $p = Get-DaemonPid',
      '  if ($p -gt 0) {',
      '    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue',
      '    if ($proc) { try { $proc.Kill() } catch {} }',
      '  }',
      '  if (Test-Path $PidFile) {',
      '    try { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue } catch {}',
      '  }',
      '}',
      '',
      'function Restart-Daemon() {',
      '  Stop-Daemon',
      '  Start-Sleep -Milliseconds 600',
      '  Start-Daemon',
      '}',
      '',
      'Start-Daemon',
      '',
      '$notify = New-Object System.Windows.Forms.NotifyIcon',
      '$notify.Icon = $appIcon',
      '$notify.Text = "Antigravity Mod Daemon"',
      '$notify.Visible = $true',
      '',
      '$menu = New-Object System.Windows.Forms.ContextMenuStrip',
      '',
      '$titleItem = $menu.Items.Add("Antigravity Mod Daemon 2.0")',
      '$titleItem.Enabled = $false',
      '$titleItem.Font = New-Object System.Drawing.Font($titleItem.Font, [System.Drawing.FontStyle]::Bold)',
      '',
      '$statusItem = $menu.Items.Add("Estado: Verificando...")',
      '$statusItem.Enabled = $false',
      '',
      '$menu.Items.Add("-") | Out-Null',
      '',
      '$toggleItem = $menu.Items.Add("Detener Daemon")',
      '$toggleItem.Add_Click({',
      '  $p = Get-DaemonPid',
      '  if (Is-Running $p) { Stop-Daemon } else { Start-Daemon }',
      '  Sync-UI',
      '})',
      '',
      '$restartItem = $menu.Items.Add("Reiniciar Daemon")',
      '$restartItem.Add_Click({',
      '  Restart-Daemon',
      '  Sync-UI',
      '})',
      '',
      '$logItem = $menu.Items.Add("Ver Logs...")',
      '$logItem.Add_Click({',
      '  if (Test-Path $LogPath) { Start-Process "notepad.exe" $LogPath }',
      '})',
      '',
      '$menu.Items.Add("-") | Out-Null',
      '',
      '$appContext = New-Object System.Windows.Forms.ApplicationContext',
      '',
      '$exitItem = $menu.Items.Add("Salir (Cerrar Daemon y Bandeja)")',
      '$exitItem.Add_Click({',
      '  Stop-Daemon',
      '  $pollTimer.Stop()',
      '  $notify.Visible = $false',
      '  $notify.Dispose()',
      '  if (Test-Path $TrayPidFile) { try { Remove-Item $TrayPidFile -Force -ErrorAction SilentlyContinue } catch {} }',
      '  $appContext.ExitThread()',
      '  [System.Windows.Forms.Application]::Exit()',
      '  Stop-Process -Id $PID -Force',
      '})',
      '',
      '$notify.ContextMenuStrip = $menu',
      '',
      '$notify.Add_DoubleClick({',
      '  if (Test-Path $LogPath) { Start-Process "notepad.exe" $LogPath }',
      '})',
      '',
      'function Sync-UI() {',
      '  $p = Get-DaemonPid',
      '  $active = Is-Running $p',
      '  if ($active) {',
      '    $statusItem.Text = "● Estado: Activo (PID: " + $p + ")"',
      '    $toggleItem.Text = "Detener Daemon"',
      '    $notify.Text = "Antigravity Mod Daemon (Activo: " + $p + ")"',
      '  } else {',
      '    $statusItem.Text = "○ Estado: Inactivo"',
      '    $toggleItem.Text = "Iniciar Daemon"',
      '    $notify.Text = "Antigravity Mod Daemon (Inactivo)"',
      '  }',
      '}',
      '',
      'Sync-UI',
      '',
      'try {',
      '  $notify.ShowBalloonTip(2000, "Antigravity Mod Daemon", "Daemon activo en la bandeja del sistema.", [System.Windows.Forms.ToolTipIcon]::Info)',
      '} catch {}',
      '',
      '$pollTimer = New-Object System.Windows.Forms.Timer',
      '$pollTimer.Interval = 2500',
      '$pollTimer.Add_Tick({ Sync-UI })',
      '$pollTimer.Start()',
      '',
      '[System.AppDomain]::CurrentDomain.Add_ProcessExit({',
      '  if ($notify) {',
      '    $notify.Visible = $false',
      '    $notify.Dispose()',
      '  }',
      '  if (Test-Path $TrayPidFile) { try { Remove-Item $TrayPidFile -Force -ErrorAction SilentlyContinue } catch {} }',
      '})',
      '',
      '[System.Windows.Forms.Application]::Run($appContext)',
      ''
    ].join('\r\n');
  }

  /**
   * Generates VBScript content that executes the CMD or PowerShell tray runner with a hidden window.
   * @param {string} targetScript
   * @returns {string}
   */
  generateVbsContent(targetScript) {
    const resolvedTarget = path.resolve(targetScript);
    if (resolvedTarget.toLowerCase().endsWith('.ps1')) {
      return [
        'Set WshShell = CreateObject("WScript.Shell")',
        `WshShell.Run "powershell.exe -NoExit -WindowStyle Hidden -ExecutionPolicy Bypass -NoProfile -File " & Chr(34) & "${resolvedTarget}" & Chr(34), 0, False`,
        'Set WshShell = Nothing',
        ''
      ].join('\r\n');
    }

    return [
      'Set WshShell = CreateObject("WScript.Shell")',
      `WshShell.Run """${resolvedTarget}""", 0, False`,
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

    const trayPath = this.getTrayPath();
    const trayContent = this.generateTrayContent(targetScript);
    fs.writeFileSync(trayPath, trayContent, 'utf-8');

    const vbsContent = this.generateVbsContent(trayPath);
    fs.writeFileSync(this.getLauncherPath(), vbsContent, 'utf-8');
    return true;
  }

  /**
   * Removes launcher, batch runner, and tray runner from disk.
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
    const trayPath = this.getTrayPath();
    if (fs.existsSync(trayPath)) {
      fs.unlinkSync(trayPath);
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
   * Writes the active Tray PID to disk.
   * @param {number} pid
   */
  saveTrayPid(pid) {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.getTrayPidFilePath(), String(pid), 'utf-8');
  }

  /**
   * Reads the recorded Tray PID from disk.
   * @returns {number|null}
   */
  readTrayPid() {
    const pidFile = this.getTrayPidFilePath();
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
   * Clears the recorded Tray PID file.
   */
  clearTrayPid() {
    const pidFile = this.getTrayPidFilePath();
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

  /**
   * Terminates the system tray runner process if running.
   * @returns {boolean}
   */
  stopRunningTray() {
    const pid = this.readTrayPid();
    if (!pid) return false;

    if (this.isProcessRunning(pid)) {
      try {
        process.kill(pid);
        this.clearTrayPid();
        return true;
      } catch {
        return false;
      }
    }

    this.clearTrayPid();
    return false;
  }
}

