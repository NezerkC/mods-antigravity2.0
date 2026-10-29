import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RemoteHostServer } from '../../framework/services/RemoteHostServer.js';
import { TailscaleDiscoveryService } from '../../framework/services/TailscaleDiscoveryService.js';

test('Functional E2E: Complete Remote Mesh Discovery and Conversation Stream Lifecycle', async () => {
  // 1. Setup isolated mock Antigravity brain directory
  const tmpBrainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-mesh-func-test-'));

  const convId1 = 'bb7529f3-9338-4580-9763-2adcd6cc445f';
  const convId2 = 'conv-2222-3333-4444-555555555555';

  const logDir1 = path.join(tmpBrainDir, convId1, '.system_generated', 'logs');
  const logDir2 = path.join(tmpBrainDir, convId2, '.system_generated', 'logs');
  fs.mkdirSync(logDir1, { recursive: true });
  fs.mkdirSync(logDir2, { recursive: true });

  const transcript1 = path.join(logDir1, 'transcript.jsonl');
  const transcript2 = path.join(logDir2, 'transcript.jsonl');

  const initialLineConv1 = JSON.stringify({
    step_index: 0,
    type: 'USER_INPUT',
    content: 'Diseñar arquitectura remota Parsec con Tailscale',
    created_at: '2026-10-28T21:00:00Z'
  });
  fs.writeFileSync(transcript1, initialLineConv1 + '\n', 'utf-8');

  const initialLineConv2 = JSON.stringify({
    step_index: 0,
    type: 'USER_INPUT',
    content: 'Crear un bot de trading de alta frecuencia',
    created_at: '2026-10-28T20:00:00Z'
  });
  fs.writeFileSync(transcript2, initialLineConv2 + '\n', 'utf-8');

  // 2. Discover local Tailscale node or fallback for local loopback test
  const discovery = new TailscaleDiscoveryService();
  const tsStatus = discovery.checkStatus();
  const testHost = '127.0.0.1'; // safe loopback for functional testing

  // 3. Start the RemoteHostServer in dynamic port
  const server = new RemoteHostServer({
    host: testHost,
    port: 0,
    brainDir: tmpBrainDir,
    nodeName: tsStatus.selfName || 'builchina'
  });

  const { port } = await server.start();
  const baseUrl = `http://${testHost}:${port}`;

  try {
    // 4. Test Health Endpoint
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('content-type'), 'application/json; charset=utf-8');

    const healthData = await healthRes.json();
    assert.equal(healthData.status, 'ok');
    assert.equal(healthData.nodeName, tsStatus.selfName || 'builchina');
    assert.equal(healthData.activeConversationsCount, 2);
    assert.ok(healthData.uptimeSeconds >= 0);

    // 5. Test Conversations List with metadata and sorting
    const convsRes = await fetch(`${baseUrl}/api/v1/conversations`);
    assert.equal(convsRes.status, 200);

    const convsData = await convsRes.json();
    assert.equal(convsData.length, 2);

    const foundConv1 = convsData.find(c => c.id === convId1);
    const foundConv2 = convsData.find(c => c.id === convId2);
    assert.ok(foundConv1, 'Conversation 1 must be present');
    assert.ok(foundConv2, 'Conversation 2 must be present');
    assert.equal(foundConv1.title, 'Diseñar arquitectura remota Parsec con Tailscale');
    assert.equal(foundConv2.title, 'Crear un bot de trading de alta frecuencia');
    assert.ok(foundConv1.sizeBytes > 0);

    // 6. Test CORS Preflight
    const optionsRes = await fetch(`${baseUrl}/api/v1/conversations`, { method: 'OPTIONS' });
    assert.equal(optionsRes.status, 204);
    assert.equal(optionsRes.headers.get('access-control-allow-origin'), '*');

    // 7. Test 404 for Unknown Routes
    const notFoundRes = await fetch(`${baseUrl}/api/v1/non-existent-endpoint`);
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.error, 'Route not found');

    // 8. Test 404 for Non-Existent Stream
    const missingStreamRes = await fetch(`${baseUrl}/api/v1/conversations/conv-missing/stream`);
    assert.equal(missingStreamRes.status, 404);

    // 9. Test Live SSE Stream with Concurrent File Append
    const abortController = new AbortController();
    const streamRes = await fetch(`${baseUrl}/api/v1/conversations/${convId1}/stream`, {
      signal: abortController.signal
    });

    assert.equal(streamRes.status, 200);
    assert.ok(streamRes.headers.get('content-type')?.includes('text/event-stream'));

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();

    // Read initial data chunk
    const firstRead = await reader.read();
    assert.equal(firstRead.done, false);
    const firstChunk = decoder.decode(firstRead.value);
    assert.ok(firstChunk.includes('Diseñar arquitectura remota Parsec con Tailscale'));

    // Append new line to transcript on disk (simulating agent response in desktop host)
    const appendLine = JSON.stringify({
      step_index: 1,
      type: 'PLANNER_RESPONSE',
      content: 'Arquitectura Parsec confirmada sobre Tailscale.',
      created_at: '2026-10-28T21:05:00Z'
    });
    fs.appendFileSync(transcript1, appendLine + '\n', 'utf-8');

    // Wait for the server interval watcher (500ms) to detect and push the new event
    let streamCapturedUpdate = false;
    const timeout = Date.now() + 2500;

    while (Date.now() < timeout && !streamCapturedUpdate) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value);
      if (chunkText.includes('Arquitectura Parsec confirmada sobre Tailscale.')) {
        streamCapturedUpdate = true;
        break;
      }
    }

    assert.equal(streamCapturedUpdate, true, 'SSE stream must receive appended transcript update in real-time');

    // Cleanly abort reader and disconnect SSE
    abortController.abort();
  } finally {
    // 10. Clean shutdown of host server and filesystem teardown
    await server.stop();
    fs.rmSync(tmpBrainDir, { recursive: true, force: true });
  }
});
