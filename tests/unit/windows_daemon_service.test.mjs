import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WindowsDaemonService } from '../../framework/services/WindowsDaemonService.js';

test('WindowsDaemonService - generates valid CMD and VBScript content', () => {
  const service = new WindowsDaemonService({ nodePath: 'C:\\node\\node.exe' });
  const cmd = service.generateCmdContent('C:\\scripts\\daemon.js');
  const vbs = service.generateVbsContent('C:\\config\\run_daemon.cmd');

  assert.ok(cmd.includes('@echo off'));
  assert.ok(cmd.includes('C:\\node\\node.exe'));
  assert.ok(cmd.includes('C:\\scripts\\daemon.js'));
  assert.ok(cmd.includes('daemon.log'));
  assert.ok(cmd.includes('>>'));

  assert.ok(vbs.includes('Set WshShell = CreateObject("WScript.Shell")'));
  assert.ok(vbs.includes('C:\\config\\run_daemon.cmd'));
  assert.ok(vbs.includes(', 0, False'));
});

test('WindowsDaemonService - installs and uninstalls launcher in target directory', () => {
  const tmpDir = path.join(os.tmpdir(), `test-startup-${Date.now()}`);
  const tmpConfig = path.join(os.tmpdir(), `test-config-install-${Date.now()}`);
  const service = new WindowsDaemonService({ startupDir: tmpDir, configDir: tmpConfig });

  assert.equal(service.isInstalled(), false);

  service.install('C:\\fake\\daemon.js');
  assert.equal(service.isInstalled(), true);
  assert.ok(fs.existsSync(service.getLauncherPath()));
  assert.ok(fs.existsSync(service.getCmdPath()));
  assert.ok(fs.existsSync(service.getTrayPath()));

  const uninstalled = service.uninstall();
  assert.equal(uninstalled, true);
  assert.equal(service.isInstalled(), false);
  assert.equal(fs.existsSync(service.getTrayPath()), false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(tmpConfig, { recursive: true, force: true });
});

test('WindowsDaemonService - generates valid PowerShell Tray runner and VBS launcher', () => {
  const service = new WindowsDaemonService({ nodePath: 'C:\\node\\node.exe' });
  const trayScript = service.generateTrayContent('C:\\scripts\\daemon.js');
  const vbsPs1 = service.generateVbsContent('C:\\config\\tray_runner.ps1');

  assert.ok(trayScript.includes('System.Windows.Forms.NotifyIcon'));
  assert.ok(trayScript.includes('System.Drawing'));
  assert.ok(trayScript.includes('Antigravity Mod Daemon'));
  assert.ok(trayScript.includes('Start-Daemon'));
  assert.ok(trayScript.includes('Stop-Daemon'));
  assert.ok(trayScript.includes('Restart-Daemon'));
  assert.ok(trayScript.includes('Sync-UI'));
  assert.ok(trayScript.includes('ApplicationContext'));
  assert.ok(trayScript.includes('mod-daemon.ico'));
  assert.ok(trayScript.includes('daemon.ico'));
  assert.ok(trayScript.includes('Drawing2D.SmoothingMode'));

  assert.ok(vbsPs1.includes('powershell.exe -NoExit -WindowStyle Hidden -ExecutionPolicy Bypass -NoProfile -File'));
  assert.ok(vbsPs1.includes('C:\\config\\tray_runner.ps1'));
});

test('WindowsDaemonService - tracks PID and Tray PID file lifecycle (save, read, clear)', () => {
  const tmpDir = path.join(os.tmpdir(), `test-config-${Date.now()}`);
  const service = new WindowsDaemonService({ configDir: tmpDir });

  assert.equal(service.readPid(), null);
  assert.equal(service.readTrayPid(), null);

  service.savePid(12345);
  service.saveTrayPid(67890);
  assert.equal(service.readPid(), 12345);
  assert.equal(service.readTrayPid(), 67890);

  service.clearPid();
  service.clearTrayPid();
  assert.equal(service.readPid(), null);
  assert.equal(service.readTrayPid(), null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('WindowsDaemonService - isProcessRunning accurately detects running process', () => {
  const service = new WindowsDaemonService();
  // Current process PID is guaranteed running
  assert.equal(service.isProcessRunning(process.pid), true);
  // Invalid PID should return false
  assert.equal(service.isProcessRunning(999999999), false);
});

