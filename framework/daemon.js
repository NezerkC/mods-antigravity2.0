#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { ModDaemon } from './core/ModDaemon.js';
import { WindowsDaemonService } from './services/WindowsDaemonService.js';

const __filename = fileURLToPath(import.meta.url);
const windowsService = new WindowsDaemonService();

process.on('uncaughtException', err => {
  console.error('[ModDaemon] Uncaught exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('[ModDaemon] Unhandled rejection:', err);
});

async function handleCli() {
  const args = process.argv.slice(2);

  if (args.includes('--install')) {
    console.log('⚡ Installing Antigravity Mod Daemon into Windows Startup...');
    windowsService.install(__filename);
    console.log(`✅ Startup launcher installed at: ${windowsService.getLauncherPath()}`);
    console.log('The daemon will now start automatically whenever Windows boots.');
    return;
  }

  if (args.includes('--uninstall')) {
    console.log('⚡ Uninstalling Antigravity Mod Daemon from Windows Startup...');
    const removed = windowsService.uninstall();
    if (removed) {
      console.log('✅ Startup launcher removed successfully.');
    } else {
      console.log('ℹ No startup launcher was found.');
    }
    windowsService.stopRunningTray();
    windowsService.stopRunningDaemon();
    return;
  }

  if (args.includes('--stop')) {
    console.log('⚡ Stopping background Mod Daemon and System Tray...');
    windowsService.stopRunningTray();
    const stopped = windowsService.stopRunningDaemon();
    if (stopped) {
      console.log('✅ Background daemon terminated.');
    } else {
      console.log('ℹ No active background daemon was running.');
    }
    return;
  }

  if (args.includes('--status')) {
    const installed = windowsService.isInstalled();
    const pid = windowsService.readPid();
    const running = windowsService.isProcessRunning(pid);
    const trayPid = windowsService.readTrayPid();
    const trayRunning = windowsService.isProcessRunning(trayPid);

    console.log('📊 Antigravity Mod Daemon Status:');
    console.log(`   - Windows Startup Persistence: ${installed ? 'Installed (Active)' : 'Not installed'}`);
    console.log(`   - Launcher Path: ${windowsService.getLauncherPath()}`);
    console.log(`   - Background Daemon: ${running ? `Running (PID: ${pid})` : 'Inactive'}`);
    console.log(`   - System Tray Icon: ${trayRunning ? `Running (PID: ${trayPid})` : 'Inactive'}`);
    return;
  }

  if (args.includes('--start')) {
    const currentPid = windowsService.readPid();
    const currentTrayPid = windowsService.readTrayPid();
    const isDaemonRunning = windowsService.isProcessRunning(currentPid);
    const isTrayRunning = windowsService.isProcessRunning(currentTrayPid);

    if (isDaemonRunning && isTrayRunning) {
      console.log(`ℹ Daemon and System Tray already running in background (PID: ${currentPid}, Tray: ${currentTrayPid}).`);
      return;
    }

    // Ensure VBS launcher and tray runner are installed
    windowsService.install(__filename);

    console.log('🚀 Spawning Antigravity Mod Daemon with System Tray in background...');
    const trayPath = windowsService.getTrayPath();
    const launchCmd = `Start-Process powershell.exe -ArgumentList '-WindowStyle Hidden -ExecutionPolicy Bypass -NoProfile -File "${trayPath}"'`;
    spawn('powershell.exe', ['-NoProfile', '-Command', launchCmd], { stdio: 'ignore' });

    // Give it a brief moment to initialize and save PIDs
    await new Promise(r => setTimeout(r, 1200));

    const newPid = windowsService.readPid();
    const newTrayPid = windowsService.readTrayPid();
    console.log(`✅ Daemon started with System Tray (Daemon PID: ${newPid || 'initializing'}, Tray PID: ${newTrayPid || 'active'}).`);
    return;
  }

  // Running mode (either foreground or invoked via --run / VBS)
  windowsService.savePid(process.pid);

  // Clean PID file on normal exit or SIGINT/SIGTERM only if this process owns it
  const cleanPidSafely = () => {
    if (windowsService.readPid() === process.pid) {
      windowsService.clearPid();
    }
  };

  process.on('SIGINT', () => {
    cleanPidSafely();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanPidSafely();
    process.exit(0);
  });
  process.on('exit', (code) => {
    console.log(`[ModDaemon] Process exiting with code: ${code}`);
    cleanPidSafely();
  });

  const intervalArgIdx = args.indexOf('--interval');
  let pollIntervalMs = 2500;
  if (intervalArgIdx !== -1 && args[intervalArgIdx + 1]) {
    const parsed = Number(args[intervalArgIdx + 1]);
    if (Number.isSafeInteger(parsed) && parsed > 500) {
      pollIntervalMs = parsed;
    }
  }

  const daemon = new ModDaemon({
    pollIntervalMs,
    logger: console
  });

  daemon.start();

  console.log(`[ModDaemon] Running active monitor (PID: ${process.pid}). Press Ctrl+C to terminate.`);
}

handleCli().catch(err => {
  console.error(`[ModDaemon] Fatal error: ${err.message}`);
  process.exit(1);
});
