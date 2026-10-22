import test from 'node:test';
import assert from 'node:assert/strict';
import { CdpWebSocketClient } from '../../src/core/CdpWebSocketClient.js';

test('CdpWebSocketClient - generates structured Runtime.evaluate command payload', () => {
  const client = new CdpWebSocketClient({ port: 12345 });
  const payload = client.createEvaluatePayload('console.log("hello");', 1);

  assert.equal(payload.id, 1);
  assert.equal(payload.method, 'Runtime.evaluate');
  assert.equal(payload.params.expression, 'console.log("hello");');
  assert.equal(payload.params.returnByValue, true);
});

test('CdpWebSocketClient - builds valid debugger target url', () => {
  const client = new CdpWebSocketClient({ port: 54321 });
  const url = client.getTargetListUrl();
  assert.equal(url, 'http://127.0.0.1:54321/json');
});

test('CdpWebSocketClient - filters valid page target from target list', () => {
  const targets = [
    { type: 'node', webSocketDebuggerUrl: 'ws://node' },
    { type: 'page', title: 'Antigravity IDE', webSocketDebuggerUrl: 'ws://127.0.0.1:54321/devtools/page/1' },
    { type: 'service_worker', webSocketDebuggerUrl: 'ws://sw' }
  ];

  const page = CdpWebSocketClient.findPageTarget(targets);
  assert.ok(page);
  assert.equal(page.webSocketDebuggerUrl, 'ws://127.0.0.1:54321/devtools/page/1');
});
