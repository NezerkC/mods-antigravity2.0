import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { CdpPortResolver } from '../../framework/core/CdpPortResolver.js';

test('CdpPortResolver - parses port from log string', () => {
  const sampleLog = `
[0101/120000.123:INFO:CONSOLE] Ready.
DevTools listening on ws://127.0.0.1:58219/devtools/browser/abc-123
[0101/120001.456:INFO] Initialized.
  `;
  const port = CdpPortResolver.parsePortFromLog(sampleLog);
  assert.equal(port, 58219);
});

test('CdpPortResolver - returns fallback when no match is found', () => {
  const emptyLog = 'Random log text with no devtools listener.';
  const port = CdpPortResolver.parsePortFromLog(emptyLog, 9999);
  assert.equal(port, 9999);
});

test('CdpPortResolver - discovers port from custom log directory with newest file (fallback)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-test-'));
  try {
    const olderFile = path.join(tempDir, 'older.log');
    const newerFile = path.join(tempDir, 'newer.log');

    fs.writeFileSync(olderFile, 'ws://127.0.0.1:11111/devtools/browser/');
    // Ensure mtime difference
    const now = Date.now();
    fs.utimesSync(olderFile, (now - 10000) / 1000, (now - 10000) / 1000);

    fs.writeFileSync(newerFile, 'ws://127.0.0.1:22222/devtools/browser/');
    fs.utimesSync(newerFile, now / 1000, now / 1000);

    // Disable default candidate probes to test log fallback specifically
    const resolver = new CdpPortResolver({ logDir: tempDir, defaultPort: 49999, candidatePorts: [] });
    const port = await resolver.resolvePort();
    assert.equal(port, 22222);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CdpPortResolver - probePort returns false for inactive port', async () => {
  const resolver = new CdpPortResolver({ probeTimeoutMs: 50 });
  const isActive = await resolver.probePort(59998);
  assert.equal(isActive, false);
});

test('CdpPortResolver - probePort validates live CDP HTTP /json/version endpoint', async () => {
  // Spawn a transient mock HTTP server simulating Electron CDP
  const server = http.createServer((req, res) => {
    if (req.url === '/json/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        Browser: 'Chrome/152.0.7977.130',
        'User-Agent': 'Antigravity/2.25.0',
        webSocketDebuggerUrl: 'ws://127.0.0.1:54321/devtools/browser/mock-id'
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;

  try {
    const resolver = new CdpPortResolver({ probeTimeoutMs: 100 });
    const isLive = await resolver.probePort(serverPort);
    assert.equal(isLive, true);

    // Test resolvePort with candidate ports prioritizing mock server
    const probeResolver = new CdpPortResolver({ defaultPort: serverPort, probeTimeoutMs: 100 });
    const resolved = await probeResolver.resolvePort();
    assert.equal(resolved, serverPort);
  } finally {
    server.close();
  }
});

test('CdpPortResolver - respects ANTIGRAVITY_CDP_PORT environment variable', async () => {
  const prevEnv = process.env.ANTIGRAVITY_CDP_PORT;
  process.env.ANTIGRAVITY_CDP_PORT = '61234';
  try {
    const resolver = new CdpPortResolver();
    const port = await resolver.resolvePort();
    assert.equal(port, 61234);
  } finally {
    if (prevEnv !== undefined) {
      process.env.ANTIGRAVITY_CDP_PORT = prevEnv;
    } else {
      delete process.env.ANTIGRAVITY_CDP_PORT;
    }
  }
});
