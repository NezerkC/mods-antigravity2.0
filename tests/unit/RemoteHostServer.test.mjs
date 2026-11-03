import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RemoteHostServer } from '../../framework/services/RemoteHostServer.js';

test('RemoteHostServer - health endpoint returns valid node metadata', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-host-test-'));
  const server = new RemoteHostServer({
    host: '127.0.0.1',
    port: 0, // dynamic port for tests
    brainDir: tmpDir,
    nodeName: 'test-node'
  });

  const address = await server.start();
  const res = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.nodeName, 'test-node');
  assert.equal(typeof data.uptimeSeconds, 'number');

  await server.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('RemoteHostServer - lists conversations discovered in brain directory', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-host-test-'));
  const convId = 'conv-test-1234';
  const convDir = path.join(tmpDir, convId, '.system_generated', 'logs');
  fs.mkdirSync(convDir, { recursive: true });

  const transcriptPath = path.join(convDir, 'transcript.jsonl');
  const sampleLog = JSON.stringify({
    step_index: 0,
    type: 'USER_INPUT',
    content: 'Hola mundo desde laptop',
    created_at: '2026-10-28T22:00:00Z'
  }) + '\n';
  fs.writeFileSync(transcriptPath, sampleLog, 'utf8');

  const server = new RemoteHostServer({
    host: '127.0.0.1',
    port: 0,
    brainDir: tmpDir,
    nodeName: 'test-node'
  });

  const address = await server.start();
  const res = await fetch(`http://127.0.0.1:${address.port}/api/v1/conversations`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 1);
  assert.equal(data[0].id, convId);
  assert.equal(data[0].title, 'Hola mundo desde laptop');

  await server.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('RemoteHostServer - streams transcript via Server-Sent Events', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-host-test-'));
  const convId = 'conv-stream-5678';
  const convDir = path.join(tmpDir, convId, '.system_generated', 'logs');
  fs.mkdirSync(convDir, { recursive: true });

  const transcriptPath = path.join(convDir, 'transcript.jsonl');
  const line1 = JSON.stringify({ step: 1, text: 'primera linea' });
  fs.writeFileSync(transcriptPath, line1 + '\n', 'utf8');

  const server = new RemoteHostServer({
    host: '127.0.0.1',
    port: 0,
    brainDir: tmpDir
  });

  const address = await server.start();
  const controller = new AbortController();
  const res = await fetch(`http://127.0.0.1:${address.port}/api/v1/conversations/${convId}/stream`, {
    signal: controller.signal
  });

  assert.equal(res.status, 200);
  assert.ok(res.headers.get('content-type')?.includes('text/event-stream'));

  // Read first chunk
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const chunkStr = new TextDecoder().decode(value);
  assert.ok(chunkStr.includes('primera linea'));

  controller.abort();
  await server.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
