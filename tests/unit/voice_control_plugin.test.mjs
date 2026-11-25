import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LanguageServerRpcClient,
  RestrictedRpcError,
  RESTRICTED_RPCS,
  MCP_TOOLS
} from '../../plugins/antigravity-voice-control/mcp/server.mjs';

import {
  HandyTranscribeBridge,
  normalizeTechnicalVocabulary,
  discoverHandyResources,
  getHandyResourcePaths
} from '../../plugins/antigravity-voice-control/sidecars/HandyTranscribeBridge.mjs';

import {
  createVoiceHubApp,
  renderDashboardHtml
} from '../../plugins/antigravity-voice-control/sidecars/launch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const PLUGIN_DIR = path.join(ROOT_DIR, 'plugins/antigravity-voice-control');

// ---------------------------------------------------------------------------
// 1. Schema Invariants: plugin.json & sidecar.json
// ---------------------------------------------------------------------------

test('plugin.json - adheres strictly to allowed top-level schema keys and values', () => {
  const pluginJsonPath = path.join(PLUGIN_DIR, 'plugin.json');
  assert.ok(fs.existsSync(pluginJsonPath), 'plugin.json must exist');

  const raw = fs.readFileSync(pluginJsonPath, 'utf8');
  const manifest = JSON.parse(raw);

  const allowedKeys = new Set(['name', 'displayName', 'description', 'version', 'suggestedPrompts']);
  const actualKeys = Object.keys(manifest);

  for (const key of actualKeys) {
    assert.ok(
      allowedKeys.has(key),
      `Unknown top-level field "${key}" found in plugin.json. Only ${Array.from(allowedKeys).join(', ')} are permitted.`
    );
  }

  assert.equal(manifest.name, 'antigravity-voice-control');
  assert.equal(manifest.displayName, 'Antigravity Global Voice Control');
  assert.equal(manifest.version, '1.0.0');
  assert.ok(manifest.description.includes('Handy'), 'Description should reference Handy local STT');
  assert.ok(manifest.description.includes('Connect RPC'), 'Description should reference Connect RPC');

  assert.ok(Array.isArray(manifest.suggestedPrompts), 'suggestedPrompts must be an array');
  assert.equal(
    manifest.suggestedPrompts.length,
    3,
    'suggestedPrompts must contain exactly 3 prompts per Antigravity card layout guidelines'
  );
  for (const prompt of manifest.suggestedPrompts) {
    assert.ok(typeof prompt === 'string' && prompt.trim().length > 0);
  }
});

test('sidecar.json - conforms to Antigravity sidecar schema with AUX_PANE entrypoint', () => {
  const sidecarJsonPath = path.join(PLUGIN_DIR, 'sidecars/voice-hub/sidecar.json');
  assert.ok(fs.existsSync(sidecarJsonPath), 'sidecar.json must exist in sidecars/voice-hub/');

  const raw = fs.readFileSync(sidecarJsonPath, 'utf8');
  const sidecar = JSON.parse(raw);

  assert.equal(sidecar.command, 'node');
  assert.deepEqual(sidecar.args, ['../launch.mjs', 'voice-hub']);
  assert.equal(sidecar.restart_policy, 'always');
  assert.equal(sidecar.has_web_ui, true);

  assert.ok(sidecar.ui_config, 'ui_config must be defined');
  assert.ok(Array.isArray(sidecar.ui_config.views), 'ui_config.views must be an array');
  assert.equal(sidecar.ui_config.views.length, 1);

  const view = sidecar.ui_config.views[0];
  assert.equal(view.entrypoint, 'SIDECAR_UI_ENTRYPOINT_AUX_PANE');
  assert.equal(view.path, '/');
});

test('rules/AGENTS.md and skills/antigravity-control/SKILL.md - documentation invariants', () => {
  // 1. rules/AGENTS.md must NOT contain YAML frontmatter
  const rulesPath = path.join(PLUGIN_DIR, 'rules/AGENTS.md');
  assert.ok(fs.existsSync(rulesPath), 'rules/AGENTS.md must exist');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  assert.ok(
    !rulesContent.trim().startsWith('---'),
    'Plugin rules/AGENTS.md must be plain markdown without YAML frontmatter'
  );
  assert.ok(rulesContent.includes('GetAllCascadeTrajectories'));
  assert.ok(rulesContent.includes('SendUserCascadeMessage'));
  assert.ok(rulesContent.includes('SmartFocusConversation'));
  assert.ok(rulesContent.includes('CancelCascadeInvocation'));
  assert.ok(rulesContent.includes('CreateTerminal'));
  assert.ok(rulesContent.includes('JetboxWriteState'));
  assert.ok(rulesContent.includes('DeletePlugin'));
  assert.ok(rulesContent.includes('InstallCustomization'));

  // 2. skills/antigravity-control/SKILL.md must contain valid YAML frontmatter
  const skillPath = path.join(PLUGIN_DIR, 'skills/antigravity-control/SKILL.md');
  assert.ok(fs.existsSync(skillPath), 'SKILL.md must exist');
  const skillContent = fs.readFileSync(skillPath, 'utf8');
  assert.ok(skillContent.trim().startsWith('---'), 'SKILL.md must begin with YAML frontmatter');
  assert.ok(skillContent.includes('name: antigravity-control'));
  assert.ok(skillContent.includes('sidecar://antigravity-voice-control/voice-hub/'));
  assert.ok(skillContent.includes('hollow_vector'));
});

// ---------------------------------------------------------------------------
// 2. LanguageServerRpcClient: mocked fetch & restricted RPC protection
// ---------------------------------------------------------------------------

test('LanguageServerRpcClient - executes sanctioned RPC methods with CSRF header injection', async () => {
  const recordedCalls = [];
  const mockFetch = async (url, options) => {
    recordedCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, methodCalled: url.split('/').pop() })
    };
  };

  const client = new LanguageServerRpcClient({
    address: '127.0.0.1:9999',
    csrfToken: 'test-csrf-token-12345',
    fetch: mockFetch
  });

  // 1. listConversations
  const listRes = await client.listConversations({ workspaceUris: ['file:///workspace'] });
  assert.equal(listRes.methodCalled, 'GetAllCascadeTrajectories');
  const listCall = recordedCalls[recordedCalls.length - 1];
  assert.equal(
    listCall.url,
    'http://127.0.0.1:9999/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories'
  );
  assert.equal(listCall.options.headers['x-codeium-csrf-token'], 'test-csrf-token-12345');
  assert.equal(listCall.options.headers['Content-Type'], 'application/json');

  // 2. sendConversationMessage
  await client.sendConversationMessage({ cascadeId: 'cascade-abc-123', text: 'Run unit test suite' });
  const sendCall = recordedCalls[recordedCalls.length - 1];
  assert.equal(
    sendCall.url,
    'http://127.0.0.1:9999/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage'
  );
  const sendBody = JSON.parse(sendCall.options.body);
  assert.equal(sendBody.cascadeId, 'cascade-abc-123');
  assert.equal(sendBody.text, 'Run unit test suite');

  // 3. focusConversation
  await client.focusConversation({ cascadeId: 'cascade-abc-123' });
  const focusCall = recordedCalls[recordedCalls.length - 1];
  assert.equal(
    focusCall.url,
    'http://127.0.0.1:9999/exa.language_server_pb.LanguageServerService/SmartFocusConversation'
  );

  // 4. cancelConversation
  await client.cancelConversation({ cascadeId: 'cascade-abc-123' });
  const cancelCall = recordedCalls[recordedCalls.length - 1];
  assert.equal(
    cancelCall.url,
    'http://127.0.0.1:9999/exa.language_server_pb.LanguageServerService/CancelCascadeInvocation'
  );

  // 5. createTerminal
  await client.createTerminal({ cwd: '/test/cwd' });
  const termCall = recordedCalls[recordedCalls.length - 1];
  assert.equal(
    termCall.url,
    'http://127.0.0.1:9999/exa.language_server_pb.LanguageServerService/CreateTerminal'
  );
  assert.equal(JSON.parse(termCall.options.body).cwd, '/test/cwd');

  // 6. sendTerminalInput
  await client.sendTerminalInput({ terminalId: 'term-1', input: 'npm test\n' });
  const inputCall = recordedCalls[recordedCalls.length - 1];
  assert.equal(
    inputCall.url,
    'http://127.0.0.1:9999/exa.language_server_pb.LanguageServerService/SendTerminalInput'
  );
  assert.equal(JSON.parse(inputCall.options.body).input, 'npm test\n');

  // 7. listModels
  await client.listModels();
  const modelsCall = recordedCalls[recordedCalls.length - 1];
  assert.equal(
    modelsCall.url,
    'http://127.0.0.1:9999/exa.language_server_pb.LanguageServerService/GetAvailableModels'
  );
});

test('LanguageServerRpcClient - strictly rejects restricted mutation RPCs without making network calls', async () => {
  let networkCalled = false;
  const mockFetch = async () => {
    networkCalled = true;
    return { ok: true, text: async () => '{}' };
  };

  const client = new LanguageServerRpcClient({ fetch: mockFetch });

  for (const restrictedMethod of RESTRICTED_RPCS) {
    await assert.rejects(
      async () => {
        await client.callRpc(restrictedMethod, { foo: 'bar' });
      },
      (err) => {
        assert.ok(err instanceof RestrictedRpcError);
        assert.equal(err.method, restrictedMethod);
        assert.ok(err.message.includes('Restricted RPC call rejected'));
        return true;
      }
    );
  }

  assert.equal(networkCalled, false, 'Fetch must never be invoked for restricted RPCs');
});

// ---------------------------------------------------------------------------
// 3. HandyTranscribeBridge: technical normalization, app actions, cross-chat routing
// ---------------------------------------------------------------------------

test('normalizeTechnicalVocabulary - converts phonetic and spoken developer terms', () => {
  const input =
    'Conecta la base de datos postgress y revisa la arquitectura hexagon con sod y git graf en el nuevo work tree';
  const normalized = normalizeTechnicalVocabulary(input);

  assert.ok(normalized.includes('PostgreSQL'), 'Should normalize postgress to PostgreSQL');
  assert.ok(normalized.includes('Hexagonal'), 'Should normalize hexagon to Hexagonal');
  assert.ok(normalized.includes('Zod'), 'Should normalize sod to Zod');
  assert.ok(normalized.includes('Git Graph'), 'Should normalize git graf to Git Graph');
  assert.ok(normalized.includes('worktree'), 'Should normalize work tree to worktree');

  const dokerInput = 'Actualiza el doker y corre ti di di';
  const dokerNorm = normalizeTechnicalVocabulary(dokerInput);
  assert.ok(dokerNorm.includes('Docker'), 'Should normalize doker to Docker');
  assert.ok(dokerNorm.includes('TDD'), 'Should normalize ti di di to TDD');
});

test('discoverHandyResources - discovers Handy C library, Canary model, and Silero VAD', () => {
  const fakeFs = {
    existsSync: (filePath) => {
      if (filePath.includes('transcribe.dll')) return true;
      if (filePath.includes('canary-180m-flash-Q8_0.gguf')) return true;
      if (filePath.includes('silero_vad_v4.onnx')) return false; // simulated missing
      return false;
    }
  };

  const res = discoverHandyResources(
    {
      localAppData: 'C:/fake/localappdata',
      appData: 'C:/fake/appdata'
    },
    fakeFs
  );

  assert.equal(res.available, false);
  assert.equal(res.status.transcribeDll, true);
  assert.equal(res.status.canaryModel, true);
  assert.equal(res.status.sileroVad, false);
  assert.deepEqual(res.missing, ['silero_vad_v4.onnx']);

  // All present case
  const allFs = { existsSync: () => true };
  const allRes = discoverHandyResources({ localAppData: 'C:/fake', appData: 'C:/fake' }, allFs);
  assert.equal(allRes.available, true);
  assert.equal(allRes.missing.length, 0);
});

test('HandyTranscribeBridge - dispatches global app actions directly (cancel & terminal)', async () => {
  const rpcCalls = [];
  const mockFetch = async (url, options) => {
    rpcCalls.push({ method: url.split('/').pop(), body: JSON.parse(options.body) });
    return { ok: true, text: async () => JSON.stringify({ status: 'ok' }) };
  };

  const client = new LanguageServerRpcClient({ fetch: mockFetch });
  const bridge = new HandyTranscribeBridge({ rpcClient: client });

  // 1. Cancel action: "detén la ejecución"
  const cancelRes = await bridge.dispatchTranscript('Por favor detén la ejecución ahora', {
    activeCascadeId: 'current-cascade-777'
  });

  assert.equal(cancelRes.handled, true);
  assert.equal(cancelRes.action, 'cancel_conversation');
  assert.equal(cancelRes.executed, true);
  assert.equal(cancelRes.targetCascadeId, 'current-cascade-777');
  assert.equal(rpcCalls[0].method, 'CancelCascadeInvocation');
  assert.equal(rpcCalls[0].body.cascadeId, 'current-cascade-777');

  // 2. Terminal action: "abre terminal"
  const termRes = await bridge.dispatchTranscript('Abre terminal en el workspace', {
    cwd: 'C:/projects/my-repo'
  });

  assert.equal(termRes.handled, true);
  assert.equal(termRes.action, 'create_terminal');
  assert.equal(termRes.executed, true);
  assert.equal(rpcCalls[1].method, 'CreateTerminal');
  assert.equal(rpcCalls[1].body.cwd, 'C:/projects/my-repo');
});

test('HandyTranscribeBridge - routes cross-chat command without polluting active conversation', async () => {
  const rpcCalls = [];
  const mockFetch = async (url, options) => {
    rpcCalls.push({ method: url.split('/').pop(), body: JSON.parse(options.body) });
    return { ok: true, text: async () => JSON.stringify({ status: 'dispatched' }) };
  };

  const client = new LanguageServerRpcClient({ fetch: mockFetch });
  const bridge = new HandyTranscribeBridge({
    rpcClient: client,
    cascades: [
      { id: 'cascade-hollow-vector-999', name: 'hollow_vector' },
      { id: 'cascade-other-111', name: 'other_chat' }
    ]
  });

  // User speaks in current active chat (cascade-active-000) targeting another conversation:
  const transcript = 'En el chat hollow_vector corre los tests';
  const result = await bridge.dispatchTranscript(transcript, {
    activeCascadeId: 'cascade-active-000'
  });

  assert.equal(result.handled, true);
  assert.equal(result.action, 'cross_chat_dispatch');
  assert.equal(result.executed, true);
  assert.equal(result.targetCascadeId, 'cascade-hollow-vector-999');
  assert.equal(result.targetHint, 'hollow_vector');

  // Assert RPC call went directly to target conversation, NOT active chat:
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].method, 'SendUserCascadeMessage');
  assert.equal(rpcCalls[0].body.cascadeId, 'cascade-hollow-vector-999');
  assert.equal(rpcCalls[0].body.text, 'corre los tests');
});

test('HandyTranscribeBridge - respects dryMode and does not invoke network RPC', async () => {
  let networkFired = false;
  const mockFetch = async () => {
    networkFired = true;
    return { ok: true, text: async () => '{}' };
  };

  const client = new LanguageServerRpcClient({ fetch: mockFetch });
  const bridge = new HandyTranscribeBridge({
    rpcClient: client,
    dryMode: true,
    cascades: [{ id: 'cascade-hollow-vector-999', name: 'hollow_vector' }]
  });

  const res = await bridge.dispatchTranscript('En el chat hollow_vector corre los tests');

  assert.equal(res.handled, true);
  assert.equal(res.dryRun, true);
  assert.equal(res.executed, false);
  assert.equal(res.targetCascadeId, 'cascade-hollow-vector-999');
  assert.equal(networkFired, false, 'Network call must be suppressed in dry mode');
});

// ---------------------------------------------------------------------------
// 4. createVoiceHubApp: HTTP endpoints (GET /health, GET /, POST /voice/dispatch)
// ---------------------------------------------------------------------------

test('createVoiceHubApp - handles GET /health, GET /, and POST /voice/dispatch over HTTP', async () => {
  const rpcCalls = [];
  const mockFetch = async (url, options) => {
    rpcCalls.push({ method: url.split('/').pop(), body: JSON.parse(options.body) });
    return { ok: true, text: async () => JSON.stringify({ dispatched: true }) };
  };

  const client = new LanguageServerRpcClient({ fetch: mockFetch });
  const bridge = new HandyTranscribeBridge({
    rpcClient: client,
    cascades: [{ id: 'cascade-hv-555', name: 'hollow_vector' }]
  });

  const app = createVoiceHubApp({ bridge, rpcClient: client });

  // Bind to ephemeral port
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /health
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, 'ok');
    assert.ok(typeof healthJson.uptime === 'number');
    assert.ok(healthJson.sttStatus);

    // 2. GET / (Dashboard HTML)
    const dashboardRes = await fetch(`${baseUrl}/`);
    assert.equal(dashboardRes.status, 200);
    const htmlText = await dashboardRes.text();
    assert.ok(htmlText.includes('Antigravity Voice Hub'));
    assert.ok(htmlText.includes('Handy Local STT Engine'));

    // 3. POST /voice/dispatch (Cross-chat dispatch with technical normalization)
    const dispatchRes = await fetch(`${baseUrl}/voice/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: 'En el chat hollow_vector corre los tests con postgress'
      })
    });
    assert.equal(dispatchRes.status, 200);
    const dispatchJson = await dispatchRes.json();
    assert.equal(dispatchJson.success, true);
    assert.equal(dispatchJson.result.action, 'cross_chat_dispatch');
    assert.equal(dispatchJson.result.targetCascadeId, 'cascade-hv-555');
    assert.ok(dispatchJson.result.prompt.includes('PostgreSQL'));

    // Verify RPC invocation happened
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].method, 'SendUserCascadeMessage');
    assert.equal(rpcCalls[0].body.cascadeId, 'cascade-hv-555');
    assert.ok(rpcCalls[0].body.text.includes('PostgreSQL'));
  } finally {
    await new Promise((resolve) => app.close(resolve));
  }
});
