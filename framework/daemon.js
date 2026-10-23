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
    windowsService.stopRunningDaemon();
    return;
  }

  if (args.includes('--stop')) {
    console.log('⚡ Stopping background Mod Daemon...');
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

    console.log('📊 Antigravity Mod Daemon Status:');
    console.log(`   - Windows Startup Persistence: ${installed ? 'Installed (Active)' : 'Not installed'}`);
    console.log(`   - Launcher Path: ${windowsService.getLauncherPath()}`);
    console.log(`   - Background Process: ${running ? `Running (PID: ${pid})` : 'Inactive'}`);
    return;
  }

  if (args.includes('--start')) {
    const currentPid = windowsService.readPid();
    if (windowsService.isProcessRunning(currentPid)) {
      console.log(`ℹ Daemon already running in background (PID: ${currentPid}).`);
      return;
    }

    // Ensure VBS launcher is installed
    windowsService.install(__filename);

    console.log('🚀 Spawning Antigravity Mod Daemon in background...');
    const vbsPath = windowsService.getLauncherPath();
    spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' }).unref();

    // Give it a brief moment to initialize and save PID
    await new Promise(r => setTimeout(r, 800));

    const newPid = windowsService.readPid();
    if (windowsService.isProcessRunning(newPid)) {
      console.log(`✅ Daemon started detached in background with PID: ${newPid}`);
    } else {
      console.log('✅ Daemon background startup command dispatched.');
    }
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
