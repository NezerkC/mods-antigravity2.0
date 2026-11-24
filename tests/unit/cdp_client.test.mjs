import test from 'node:test';
import assert from 'node:assert/strict';
import { CdpWebSocketClient } from '../../framework/core/CdpWebSocketClient.js';

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

test('CdpWebSocketClient - skips data:text/html splash target and picks real 127.0.0.1 app page', () => {
  const targets = [
    {
      type: 'page',
      title: 'data:text/html;charset=utf-8,<html>...</html>',
      url: 'data:text/html;charset=utf-8,%3C!DOCTYPE%20html%3E',
      webSocketDebuggerUrl: 'ws://127.0.0.1:61514/devtools/page/splash-0'
    },
    {
      type: 'page',
      title: 'Workspace - Antigravity',
      url: 'https://127.0.0.1:61523/c/daca9962-9159-419a-b608-73ece45804a1',
      webSocketDebuggerUrl: 'ws://127.0.0.1:61514/devtools/page/real-1'
    },
    {
      type: 'iframe',
      title: 'plugin://swarm--swarm_board',
      url: 'plugin://swarm--swarm_board-49671/',
      webSocketDebuggerUrl: 'ws://127.0.0.1:61514/devtools/page/iframe-2'
    },
    {
      type: 'page',
      title: 'data:text/html,<!doctype html>',
      url: 'data:text/html,<!doctype html>',
      webSocketDebuggerUrl: 'ws://127.0.0.1:61514/devtools/page/splash-3'
    }
  ];

  const page = CdpWebSocketClient.findPageTarget(targets);
  assert.ok(page);
  assert.equal(page.webSocketDebuggerUrl, 'ws://127.0.0.1:61514/devtools/page/real-1');
});

test('CdpWebSocketClient - skips devtools, about:blank, and chrome-extension pages and prefers vscode-file or http://127.0.0.1', () => {
  const targets = [
    { type: 'page', url: 'devtools://devtools/bundled/inspector.html', webSocketDebuggerUrl: 'ws://dt' },
    { type: 'page', url: 'about:blank', webSocketDebuggerUrl: 'ws://blank' },
    { type: 'page', url: 'chrome-extension://abc/bg.html', webSocketDebuggerUrl: 'ws://ext' },
    { type: 'page', url: 'https://docs.example.com', webSocketDebuggerUrl: 'ws://other' },
    { type: 'page', url: 'vscode-file://vscode-app/index.html', webSocketDebuggerUrl: 'ws://vscode' }
  ];

  const page = CdpWebSocketClient.findPageTarget(targets);
  assert.ok(page);
  assert.equal(page.webSocketDebuggerUrl, 'ws://vscode');
});

test('CdpWebSocketClient - falls back cleanly to non-data page target when no 127.0.0.1 or vscode-file target exists', () => {
  const targets = [
    { type: 'page', url: 'DATA:text/html,splash', webSocketDebuggerUrl: 'ws://splash' },
    { type: 'page', url: 'file:///C:/app/workbench.html', webSocketDebuggerUrl: 'ws://file-ui' }
  ];

  const page = CdpWebSocketClient.findPageTarget(targets);
  assert.ok(page);
  assert.equal(page.webSocketDebuggerUrl, 'ws://file-ui');
});

test('CdpWebSocketClient - returns undefined when only non-UI targets exist or targets list is invalid', () => {
  assert.equal(CdpWebSocketClient.findPageTarget(null), undefined);
  assert.equal(CdpWebSocketClient.findPageTarget([]), undefined);
  assert.equal(
    CdpWebSocketClient.findPageTarget([
      { type: 'page', url: 'data:text/html,splash', webSocketDebuggerUrl: 'ws://splash' },
      { type: 'page', url: 'devtools://devtools/bundled/inspector.html', webSocketDebuggerUrl: 'ws://dt' },
      { type: 'page', url: 'about:blank', webSocketDebuggerUrl: 'ws://blank' },
      { type: 'iframe', url: 'https://127.0.0.1:61523/c/123', webSocketDebuggerUrl: 'ws://iframe' }
    ]),
    undefined
  );
});
