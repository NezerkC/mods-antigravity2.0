import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CdpPortResolver } from '../../src/core/CdpPortResolver.js';

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

test('CdpPortResolver - discovers port from custom log directory with newest file', () => {
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

    const resolver = new CdpPortResolver({ logDir: tempDir });
    const port = resolver.resolvePort();
    assert.equal(port, 22222);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
