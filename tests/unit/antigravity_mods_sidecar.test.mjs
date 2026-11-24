import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  createDashboardApp,
  resolvePort,
  parseTranscript,
  getVcsStatus,
  renderDashboardHtml
} from '../../plugins/antigravity-mods/sidecars/dashboard/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const PLUGIN_DIR = path.join(ROOT_DIR, 'plugins', 'antigravity-mods');
const SIDECAR_DIR = path.join(PLUGIN_DIR, 'sidecars', 'dashboard');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

describe('antigravity-mods plugin & sidecar schema compliance', () => {
  it('plugin.json contains only allowed top-level Antigravity manifest keys', () => {
    const pluginJsonPath = path.join(PLUGIN_DIR, 'plugin.json');
    assert.ok(fs.existsSync(pluginJsonPath), 'plugin.json must exist');

    const manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
    const allowedKeys = new Set([
      'name',
      'displayName',
      'version',
      'description',
      'logo',
      'suggestedPrompts',
      'author',
      'homepage',
      'repository',
      'disabled'
    ]);

    for (const key of Object.keys(manifest)) {
      assert.ok(
        allowedKeys.has(key),
        `Unexpected top-level key "${key}" in plugin.json`
      );
    }

    assert.equal(manifest.name, 'antigravity-mods');
    assert.ok(typeof manifest.displayName === 'string' && manifest.displayName.length > 0);
    assert.ok(typeof manifest.description === 'string' && manifest.description.length > 0);
    assert.ok(Array.isArray(manifest.suggestedPrompts) && manifest.suggestedPrompts.length === 3);
  });

  it('sidecar.json conforms to Antigravity sidecar AUX_PANE schema', () => {
    const sidecarJsonPath = path.join(SIDECAR_DIR, 'sidecar.json');
    assert.ok(fs.existsSync(sidecarJsonPath), 'sidecar.json must exist');

    const sidecar = JSON.parse(fs.readFileSync(sidecarJsonPath, 'utf-8'));
    assert.equal(sidecar.command, 'node');
    assert.deepEqual(sidecar.args, ['server.mjs']);
    assert.equal(sidecar.restart_policy, 'always');
    assert.equal(sidecar.has_web_ui, true);
    assert.ok(sidecar.ui_config && Array.isArray(sidecar.ui_config.views));
    assert.equal(sidecar.ui_config.views.length, 1);
    assert.equal(sidecar.ui_config.views[0].path, '/');
    assert.equal(sidecar.ui_config.views[0].entrypoint, 'SIDECAR_UI_ENTRYPOINT_AUX_PANE');
  });
});

describe('resolvePort', () => {
  it('prioritizes ANTIGRAVITY_SIDECAR_WEB_PORT over PORT and default 8790', () => {
    assert.equal(resolvePort({ ANTIGRAVITY_SIDECAR_WEB_PORT: '61234', PORT: '9999' }), 61234);
    assert.equal(resolvePort({ PORT: '9999' }), 9999);
    assert.equal(resolvePort({}), 8790);
    assert.equal(resolvePort({ ANTIGRAVITY_SIDECAR_WEB_PORT: 'invalid' }), 8790);
    assert.equal(resolvePort({ ANTIGRAVITY_SIDECAR_WEB_PORT: '70000' }), 8790);
  });
});

describe('createDashboardApp HTTP endpoints', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-mods-sidecar-'));
  const brainDir = path.join(tmpDir, 'brain');
  const activeAgentsFile = path.join(tmpDir, 'mods', 'active_agents.json');
  const convOld = '11111111-1111-4111-8111-111111111111';
  const convNew = '22222222-2222-4222-8222-222222222222';

  let app;
  let baseUrl;
  let voiceOnline = true;
  let lastDispatched = null;

  before(async () => {
    const oldLogs = path.join(brainDir, convOld, '.system_generated', 'logs');
    const newLogs = path.join(brainDir, convNew, '.system_generated', 'logs');
    fs.mkdirSync(oldLogs, { recursive: true });
    fs.mkdirSync(newLogs, { recursive: true });

    const oldTranscript = path.join(oldLogs, 'transcript.jsonl');
    const newTranscript = path.join(newLogs, 'transcript.jsonl');

    fs.writeFileSync(
      oldTranscript,
      [
        JSON.stringify({ type: 'USER_INPUT', content: 'Old prompt message' }),
        JSON.stringify({ type: 'PLANNER_RESPONSE', content: 'Old answer', thinking: 'Old think' })
      ].join('\n'),
      'utf-8'
    );

    fs.writeFileSync(
      newTranscript,
      [
        JSON.stringify({ type: 'USER_INPUT', content: 'Before checkpoint should reset' }),
        JSON.stringify({ type: 'CHECKPOINT', step_index: 1 }),
        JSON.stringify({ type: 'USER_INPUT', content: 'Inspect sidecar telemetry', model: 'Claude Sonnet 4.6' }),
        JSON.stringify({
          type: 'PLANNER_RESPONSE',
          content: 'Running diagnostics now.',
          thinking: 'Checking endpoints and ports.',
          tool_calls: [{ name: 'run_command', args: { cmd: 'npm test' } }]
        })
      ].join('\n'),
      'utf-8'
    );

    const nowSec = Date.now() / 1000;
    fs.utimesSync(oldTranscript, nowSec - 100, nowSec - 100);
    fs.utimesSync(newTranscript, nowSec, nowSec);

    app = createDashboardApp({
      brainDir,
      activeAgentsFile,
      repoPath: ROOT_DIR,
      voiceHubUrl: 'http://127.0.0.1:8765',
      fetchImpl: async (targetUrl, opts = {}) => {
        if (String(targetUrl).endsWith('/health')) {
          if (!voiceOnline) throw new Error('ECONNREFUSED');
          return new globalThis.Response(
            JSON.stringify({ status: 'ok', sttStatus: { available: true, missing: [] } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (String(targetUrl).endsWith('/voice/dispatch')) {
          if (!voiceOnline) throw new Error('ECONNREFUSED');
          lastDispatched = JSON.parse(opts.body);
          return new globalThis.Response(
            JSON.stringify({ success: true, echoed: lastDispatched.transcript }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(`Unexpected fetch URL: ${targetUrl}`);
      },
      vcsProvider: async () => ({
        isRepo: true,
        repoPath: ROOT_DIR,
        branch: 'feat/native-sidecar',
        upstream: 'origin/feat/native-sidecar',
        ahead: 1,
        behind: 0,
        isClean: false,
        dirtyCount: 2,
        changedFiles: [{ code: 'M', file: 'server.mjs' }],
        branches: [{ name: 'feat/native-sidecar', current: true }],
        commits: [
          {
            hash: 'abc1234567',
            shortHash: 'abc1234',
            author: 'Vitoko',
            relativeDate: '2 minutes ago',
            subject: 'fix(sidecar): bind assigned web port',
            parents: ['def5678'],
            refs: ['HEAD -> feat/native-sidecar'],
            lane: 0
          }
        ]
      })
    });

    await new Promise((resolve) => {
      app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = app.server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (app) await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /health returns ok status JSON', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'antigravity-mods-dashboard');
    assert.equal(typeof data.time, 'number');
  });

  it('GET /api/telemetry returns latest transcript and supports cascadeId selection', async () => {
    const latestRes = await fetch(`${baseUrl}/api/telemetry`);
    assert.equal(latestRes.status, 200);
    const latestData = await latestRes.json();
    assert.equal(latestData.status, 'ok');
    assert.equal(latestData.cascadeId, convNew);
    assert.equal(latestData.telemetry.steps, 4);
    assert.equal(latestData.telemetry.model, 'Claude Sonnet 4.6');
    assert.ok(latestData.telemetry.tokens > 0);
    assert.ok(latestData.telemetry.breakdown.thinking > 0);
    assert.ok(latestData.telemetry.breakdown.tools > 0);

    const specificRes = await fetch(`${baseUrl}/api/telemetry?cascadeId=${convOld}`);
    assert.equal(specificRes.status, 200);
    const specificData = await specificRes.json();
    assert.equal(specificData.cascadeId, convOld);
    assert.equal(specificData.telemetry.steps, 2);
  });

  it('GET /api/agents and POST /api/agents persist PLAN/BUILD/AUTO modes and caveman modifier', async () => {
    const initialRes = await fetch(`${baseUrl}/api/agents?cascadeId=${convNew}`);
    assert.equal(initialRes.status, 200);
    const initial = await initialRes.json();
    assert.equal(initial.cascadeId, convNew);
    assert.ok(Array.isArray(initial.catalog) && initial.catalog.length >= 5);

    const buildRes = await fetch(`${baseUrl}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cascadeId: convNew,
        agentId: 'sdd-orchestrator',
        mode: 'BUILD',
        caveman: true
      })
    });
    assert.equal(buildRes.status, 200);
    const buildData = await buildRes.json();
    assert.equal(buildData.success, true);
    assert.equal(buildData.agent.id, 'sdd-orchestrator');
    assert.equal(buildData.agent.effectiveMode, 'BUILD');
    assert.equal(buildData.agent.caveman, true);
    assert.equal(buildData.agent.modifiers.caveman, true);

    const autoRes = await fetch(`${baseUrl}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cascadeId: convNew,
        mode: 'AUTO',
        caveman: false
      })
    });
    assert.equal(autoRes.status, 200);
    const autoData = await autoRes.json();
    assert.equal(autoData.agent.id, 'auto');
    assert.equal(autoData.agent.mode, 'AUTO');
    assert.equal(autoData.agent.caveman, false);

    const persisted = JSON.parse(fs.readFileSync(activeAgentsFile, 'utf-8'));
    assert.equal(persisted[convNew].id, 'auto');
    assert.equal(persisted[convNew].modifiers.caveman, false);
  });

  it('GET /api/vcs returns repository status and commits', async () => {
    const res = await fetch(`${baseUrl}/api/vcs`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.isRepo, true);
    assert.equal(data.branch, 'feat/native-sidecar');
    assert.equal(data.commits.length, 1);
  });

  it('GET /api/voice and POST /api/voice/dispatch proxy Voice Hub and handle offline state', async () => {
    voiceOnline = true;
    const onlineRes = await fetch(`${baseUrl}/api/voice`);
    assert.equal(onlineRes.status, 200);
    const onlineData = await onlineRes.json();
    assert.equal(onlineData.online, true);

    const dispatchRes = await fetch(`${baseUrl}/api/voice/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: 'open dashboard', targetCascadeId: convNew })
    });
    assert.equal(dispatchRes.status, 200);
    const dispatchData = await dispatchRes.json();
    assert.equal(dispatchData.success, true);
    assert.equal(lastDispatched.transcript, 'open dashboard');

    voiceOnline = false;
    const offlineStatusRes = await fetch(`${baseUrl}/api/voice`);
    assert.equal(offlineStatusRes.status, 200);
    const offlineStatus = await offlineStatusRes.json();
    assert.equal(offlineStatus.online, false);

    const offlineDispatchRes = await fetch(`${baseUrl}/api/voice/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: 'test offline' })
    });
    assert.equal(offlineDispatchRes.status, 503);
  });

  it('GET / renders CSP-compliant Antigravity dashboard HTML with tachometer, agents, git graph, and voice hub', async () => {
    const res = await fetch(`${baseUrl}/?conversationId=${convNew}`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));

    const html = await res.text();
    assert.ok(
      html.includes('https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js'),
      'Must use Antigravity CSP-allowed Tailwind CDN'
    );
    assert.ok(!html.includes('cdn.tailwindcss.com'), 'Must NOT use blocked cdn.tailwindcss.com');

    for (const cssVar of ['--background', '--card', '--border', '--foreground', '--muted-foreground']) {
      assert.ok(html.includes(cssVar), `Dashboard HTML must reference ${cssVar}`);
    }

    assert.ok(html.includes('id="tachometer-svg"'));
    assert.ok(html.includes('id="agent-select"'));
    assert.ok(html.includes('id="vcs-graph-list"'));
    assert.ok(html.includes('id="voice-status-badge"'));
    assert.ok(html.includes('feat/native-sidecar'));
  });
});

describe('UI token enforcement and XSS safety', () => {
  it('enforces ANTIGRAVITY_SIDECAR_UI_TOKEN on POST requests when configured', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-mods-token-'));
    const tokenApp = createDashboardApp({
      brainDir: tmpDir,
      activeAgentsFile: path.join(tmpDir, 'active_agents.json'),
      uiToken: 'secret-token-123',
      vcsProvider: async () => ({ isRepo: false, commits: [] }),
      fetchImpl: async () => {
        throw new Error('offline');
      }
    });

    await new Promise(resolve => tokenApp.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${tokenApp.server.address().port}`;

    try {
      const unauth = await fetch(`${url}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cascadeId: 'conv-1', mode: 'BUILD' })
      });
      assert.equal(unauth.status, 401);

      const auth = await fetch(`${url}/api/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sidecar-Token': 'secret-token-123'
        },
        body: JSON.stringify({ cascadeId: 'conv-1', mode: 'BUILD' })
      });
      assert.equal(auth.status, 200);
    } finally {
      await tokenApp.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('escapes HTML payloads in renderDashboardHtml and reads real git repo status cleanly', async () => {
    const html = renderDashboardHtml({
      cascadeId: '<script>alert(1)</script>',
      activeAgents: {
        '<script>alert(1)</script>': {
          id: 'auto',
          name: '<img src=x onerror=alert(1)>',
          effectiveMode: 'PLAN'
        }
      },
      vcs: {
        isRepo: true,
        branch: 'feat/<xss>',
        dirtyCount: 0,
        commits: [
          {
            hash: '12345678',
            shortHash: '1234567',
            author: '<b>bad</b>',
            relativeDate: 'now',
            subject: '<script>evil()</script>',
            refs: ['<svg onload=alert(1)>'],
            lane: 0
          }
        ]
      }
    });

    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    assert.ok(!html.includes('<script>evil()</script>'));
    assert.ok(html.includes('&lt;script&gt;evil()&lt;/script&gt;'));

    const realVcs = await getVcsStatus(ROOT_DIR);
    assert.equal(realVcs.isRepo, true);
    assert.ok(realVcs.branch.length > 0);
    assert.ok(Array.isArray(realVcs.commits) && realVcs.commits.length > 0);
  });

  it('parseTranscript handles empty or missing path safely', () => {
    const snap = parseTranscript(null);
    assert.equal(snap.tokens, 0);
    assert.equal(snap.percentage, '0.0');
  });
});

describe('Direct execution binds ANTIGRAVITY_SIDECAR_WEB_PORT', () => {
  it('spawns server.mjs on assigned ANTIGRAVITY_SIDECAR_WEB_PORT and serves /health', async () => {
    const assignedPort = await getFreePort();
    const serverPath = path.join(SIDECAR_DIR, 'server.mjs');

    const child = spawn(process.execPath, [serverPath], {
      cwd: SIDECAR_DIR,
      env: {
        ...process.env,
        ANTIGRAVITY_SIDECAR_WEB_PORT: String(assignedPort),
        PORT: '8790'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      let ready = false;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`http://127.0.0.1:${assignedPort}/health`);
          if (res.ok) {
            const data = await res.json();
            assert.equal(data.status, 'ok');
            assert.equal(data.port, assignedPort);
            ready = true;
            break;
          }
        } catch {
          await new Promise(r => setTimeout(r, 80));
        }
      }
      assert.ok(ready, `Sidecar process did not listen on ANTIGRAVITY_SIDECAR_WEB_PORT=${assignedPort}`);
    } finally {
      child.kill();
    }
  });
});
