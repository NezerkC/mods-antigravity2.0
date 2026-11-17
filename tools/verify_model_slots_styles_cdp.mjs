// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDefaultHost } from '../framework/core/ModDaemon.js';
import { CdpPortResolver } from '../framework/core/CdpPortResolver.js';
import { CdpWebSocketClient } from '../framework/core/CdpWebSocketClient.js';

async function run() {
  const cdpPort = 52742;
  process.env.ANTIGRAVITY_CDP_PORT = String(cdpPort);

  console.log(`1. Dispatching host payload with latest compiled mods to port ${cdpPort}...`);
  const resolver = new CdpPortResolver({ defaultPort: cdpPort });
  const host = createDefaultHost({ portResolver: resolver });
  await host.dispatch();
  console.log('   ModHost dispatched successfully.');

  console.log(`2. Connecting to CDP on port ${cdpPort} for inspection & screenshot...`);
  const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching targets`);
  const targets = await res.json();
  const pageTarget = targets.find(t =>
    t.type === 'page' &&
    typeof t.webSocketDebuggerUrl === 'string' &&
    (t.title?.includes('Antigravity') || t.url?.includes('127.0.0.1:52744'))
  );

  if (!pageTarget) {
    throw new Error('Antigravity page target not found in CDP target list');
  }

  console.log(`3. Connecting to WebSocket: ${pageTarget.title}...`);
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let seqId = 1;
  const pending = new Map();

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = seqId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || 'CDP Error'));
          } else {
            resolve(msg.result);
          }
        }
      } catch (err) {
        console.error('Error parsing CDP message:', err);
      }
    };
  });

  console.log('4. Triggering click on #antigravity-model-slot-builder and verifying computed styles...');
  const verifyScript = `
    (() => {
      const btn = document.querySelector('#antigravity-model-slot-builder');
      if (!btn) return { error: '#antigravity-model-slot-builder not found in DOM' };

      const portal = document.querySelector('#antigravity-model-slot-dropdown-portal');
      if (!portal) return { error: '#antigravity-model-slot-dropdown-portal not found in DOM' };

      // Ensure open
      if (!portal.classList.contains('open')) {
        btn.click();
      }

      const portalStyles = window.getComputedStyle(portal);
      const portalBg = portalStyles.backgroundColor;
      const portalBgImg = portalStyles.backgroundImage;
      const portalOpacity = portalStyles.opacity;
      const portalZIndex = portalStyles.zIndex;

      // Find first model row with submenu
      const rows = Array.from(portal.querySelectorAll('.model-slot-row'));
      const rowWithSubmenu = rows.find(r => r.querySelector('.model-slot-submenu'));
      if (!rowWithSubmenu) return { error: 'No .model-slot-row with .model-slot-submenu found' };

      // Ensure clean initial state (remove any leftover .open class from prior evaluations)
      rows.forEach(r => r.classList.remove('open'));

      const submenu = rowWithSubmenu.querySelector('.model-slot-submenu');
      const submenuInitialDisplay = window.getComputedStyle(submenu).display;
      const submenuInitialMarginLeft = window.getComputedStyle(submenu).marginLeft;
      const submenuInitialLeft = window.getComputedStyle(submenu).left;

      // Simulate hover/open on row
      rowWithSubmenu.classList.add('open');
      const submenuOpenDisplay = window.getComputedStyle(submenu).display;

      // Check Hydrogen submenu specifically
      const hydrogenRow = rows.find(r => (r.getAttribute('data-base-model') || '').includes('Hydrogen'));
      let hydrogenSubmenuDisplay = null;
      let hydrogenEffortsCount = 0;
      if (hydrogenRow) {
        const hSub = hydrogenRow.querySelector('.model-slot-submenu');
        if (hSub) {
          hydrogenRow.classList.add('open');
          hydrogenSubmenuDisplay = window.getComputedStyle(hSub).display;
          hydrogenEffortsCount = hSub.querySelectorAll('.model-effort-option').length;
        }
      }

      return {
        success: true,
        portal: {
          isOpen: portal.classList.contains('open'),
          backgroundColor: portalBg,
          backgroundImage: portalBgImg,
          opacity: portalOpacity,
          zIndex: portalZIndex,
          isTransparent: portalBg === 'rgba(0, 0, 0, 0)' || portalBg === 'transparent'
        },
        submenu: {
          initialDisplay: submenuInitialDisplay,
          initialMarginLeft: submenuInitialMarginLeft,
          initialLeft: submenuInitialLeft,
          openDisplay: submenuOpenDisplay
        },
        hydrogen: {
          found: Boolean(hydrogenRow),
          submenuDisplayWhenOpen: hydrogenSubmenuDisplay,
          effortsCount: hydrogenEffortsCount
        }
      };
    })()
  `;

  const evalRes = await sendCommand('Runtime.evaluate', {
    expression: verifyScript,
    returnByValue: true,
    awaitPromise: true
  });

  const verificationResult = evalRes?.result?.value || evalRes;
  console.log('   Computed Style Verification Result:');
  console.log(JSON.stringify(verificationResult, null, 2));

  if (verificationResult.error) {
    throw new Error(verificationResult.error);
  }

  // Strict Assertions
  if (!verificationResult.portal.isOpen) {
    throw new Error('Portal failed to open upon clicking #antigravity-model-slot-builder');
  }
  if (verificationResult.portal.isTransparent) {
    throw new Error(`Portal background is transparent: ${verificationResult.portal.backgroundColor}`);
  }
  if (verificationResult.submenu.initialDisplay !== 'none') {
    throw new Error(`Submenu initial display should be 'none', got: ${verificationResult.submenu.initialDisplay}`);
  }
  if (verificationResult.submenu.openDisplay !== 'block') {
    throw new Error(`Submenu display on open should be 'block', got: ${verificationResult.submenu.openDisplay}`);
  }
  if (verificationResult.submenu.initialMarginLeft !== '0px') {
    throw new Error(`Submenu margin-left should be '0px' (no 6px gap), got: ${verificationResult.submenu.initialMarginLeft}`);
  }

  console.log('5. Capturing screenshot via Page.captureScreenshot...');
  const screenshotRes = await sendCommand('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true
  });

  if (!screenshotRes?.data) {
    throw new Error('No screenshot data returned from CDP');
  }

  const screenshotBuffer = Buffer.from(screenshotRes.data, 'base64');
  const tempPath = path.join(os.tmpdir(), 'slots_fixed.png');
  fs.writeFileSync(tempPath, screenshotBuffer);
  console.log(`   Saved screenshot to temp: ${tempPath} (${screenshotBuffer.length} bytes)`);

  const callerArtifactsDir = 'C:\\Users\\lolpl\\.gemini\\antigravity\\brain\\09e203de-7048-4f6c-83f8-e4dfbfe796e1';
  const artifactPath = path.join(callerArtifactsDir, 'slots_fixed.png');
  fs.copyFileSync(tempPath, artifactPath);
  console.log(`   Copied screenshot to caller artifact dir: ${artifactPath}`);

  ws.close();
  console.log('✅ LIVE CDP VERIFICATION & SCREENSHOT COMPLETED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('❌ CDP Verification failed:', err);
  process.exit(1);
});
