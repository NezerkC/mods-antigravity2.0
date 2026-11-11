import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  stripBom,
  parseHookPayload,
  calculateContext,
  classifyPlanVsBuild,
  handlePreInvocation,
  handlePostInvocation,
  handleStop,
  runHook
} from '../../plugins/antigravity-mods/scripts/context-hook.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const PLUGIN_DIR = path.join(ROOT_DIR, 'plugins', 'antigravity-mods');
const HOOKS_JSON_PATH = path.join(PLUGIN_DIR, 'hooks.json');
const HOOK_SCRIPT_PATH = path.join(PLUGIN_DIR, 'scripts', 'context-hook.mjs');

function makeTempEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-mods-hook-'));
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const activeAgentsPath = path.join(dir, 'active_agents.json');
  const homeDir = path.join(dir, 'home');
  fs.mkdirSync(homeDir, { recursive: true });
  return { dir, transcriptPath, activeAgentsPath, homeDir };
}

function runHookCli(args, stdinText) {
  const stdout = execFileSync(process.execPath, [HOOK_SCRIPT_PATH, ...args], {
    cwd: PLUGIN_DIR,
    input: Buffer.from(stdinText, 'utf-8'),
    env: {
      ...process.env,
      ANTIGRAVITY_HOOK_SKIP_BADGE: '1'
    },
    encoding: 'utf-8'
  });
  return JSON.parse(stdout.trim());
}

test('hooks.json - configures PreInvocation, PostInvocation, and Stop with distinct flags', () => {
  assert.ok(fs.existsSync(HOOKS_JSON_PATH), 'hooks.json must exist');
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf-8'));
  const spec = hooks['antigravity-mods-hook'];

  assert.ok(spec, 'antigravity-mods-hook key must exist');
  assert.equal(spec.PreInvocation[0].type, 'command');
  assert.equal(spec.PreInvocation[0].command, 'node ./scripts/context-hook.mjs');

  assert.equal(spec.PostInvocation[0].type, 'command');
  assert.equal(spec.PostInvocation[0].command, 'node ./scripts/context-hook.mjs --post');

  assert.equal(spec.Stop[0].type, 'command');
  assert.equal(spec.Stop[0].command, 'node ./scripts/context-hook.mjs --stop');
});

test('UTF-8 BOM handling - strips BOM from stdin payload, transcript.jsonl, and active_agents.json', () => {
  const { dir, transcriptPath, activeAgentsPath, homeDir } = makeTempEnv();
  try {
    assert.equal(stripBom('\uFEFF{"a":1}'), '{"a":1}');
    assert.deepEqual(parseHookPayload('\uFEFF  {"conversationId":"conv-bom"} \r\n'), {
      conversationId: 'conv-bom'
    });
    assert.deepEqual(parseHookPayload('not-json'), {});

    const lines = [
      '\uFEFF' + JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'Implementar pruebas unitarias' }),
      JSON.stringify({ type: 'PLANNER_RESPONSE', content: 'Listo' })
    ];
    fs.writeFileSync(transcriptPath, lines.join('\n'), 'utf-8');

    const agentInstructionPath = path.join(dir, 'custom-agent.md');
    fs.writeFileSync(agentInstructionPath, '# Custom Build Directives', 'utf-8');

    fs.writeFileSync(
      activeAgentsPath,
      '\uFEFF' + JSON.stringify({
        'conv-bom': {
          id: 'auto',
          name: 'Auto (Plan/Build)',
          filePath: ''
        }
      }),
      'utf-8'
    );

    const out = handlePreInvocation(
      { conversationId: 'conv-bom', transcriptPath },
      { activeAgentsPath, homeDir, skipBadgeSpawn: true }
    );

    assert.equal(out.terminationBehavior, '');
    assert.ok(Array.isArray(out.injectSteps));
    assert.equal(out.injectSteps.length, 2);
    assert.ok(out.injectSteps[0].ephemeralMessage.includes('[CLASSIFIED MODE: BUILDER'));
    assert.ok(out.injectSteps[1].ephemeralMessage.includes('[CONTEXT MONITOR]:'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PreInvocation - never emits systemMessage.metadata and includes telemetry + dashboard link', () => {
  const { dir, transcriptPath, activeAgentsPath, homeDir } = makeTempEnv();
  try {
    const checkpointLine = JSON.stringify({ type: 'CHECKPOINT', summary: 'compact' });
    const userLine = JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'Analiza la arquitectura hexagonal' });
    fs.writeFileSync(
      transcriptPath,
      [JSON.stringify({ type: 'USER_INPUT', content: 'A'.repeat(4000) }), checkpointLine, userLine].join('\n'),
      'utf-8'
    );

    const ctx = calculateContext(transcriptPath);
    assert.ok(ctx);
    assert.equal(ctx.steps, 3);
    assert.ok(ctx.tokens < 100, 'CHECKPOINT must reset accumulated token character count');
    assert.equal(typeof ctx.sizeKb, 'number');
    assert.equal(typeof ctx.percentage, 'number');

    const out = handlePreInvocation(
      { conversationId: 'conv-none', transcriptPath, lastUserInput: 'Analiza la arquitectura hexagonal' },
      { activeAgentsPath, homeDir, skipBadgeSpawn: true }
    );

    assert.equal(out.terminationBehavior, '');
    assert.equal(out.injectSteps.length, 1);

    for (const step of out.injectSteps) {
      assert.equal(step.systemMessage, undefined, 'Must not emit systemMessage.metadata that panics proto_utils.go');
      assert.equal(typeof step.ephemeralMessage, 'string');
    }

    const monitor = out.injectSteps[0].ephemeralMessage;
    assert.match(monitor, /~\d[\d,]* tokens/);
    assert.match(monitor, /\d+(?:\.\d+)?% de 1M/);
    assert.match(monitor, /3 pasos/);
    assert.match(monitor, /\d+(?:\.\d+)? KB/);
    assert.ok(monitor.includes('[Abrir Dashboard](sidecar://antigravity-mods/dashboard/)'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PreInvocation - classifies PLAN vs BUILD dynamically and respects explicit specialists', () => {
  const { dir, transcriptPath, activeAgentsPath, homeDir } = makeTempEnv();
  try {
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({
        type: 'USER_INPUT',
        source: 'USER_EXPLICIT',
        content: 'Diseña el diagrama de módulos'
      }) + '\n',
      'utf-8'
    );
    assert.equal(classifyPlanVsBuild(transcriptPath, 'Diseña el diagrama de módulos'), 'PLAN');

    const specialistDoc = path.join(dir, 'specialist.md');
    fs.writeFileSync(specialistDoc, 'Follow clean architecture boundaries.', 'utf-8');

    fs.writeFileSync(
      activeAgentsPath,
      JSON.stringify({
        'conv-auto': { id: 'auto', name: 'Auto (Plan/Build)' },
        'conv-explicit': { id: 'lead-architect', name: 'Lead Architect', filePath: specialistDoc },
        'conv-noid': { modifiers: { caveman: false } }
      }),
      'utf-8'
    );

    const autoPlan = handlePreInvocation(
      { conversationId: 'conv-auto', transcriptPath, lastUserInput: 'Diseña el diagrama de módulos' },
      { activeAgentsPath, homeDir, skipBadgeSpawn: true }
    );
    assert.ok(autoPlan.injectSteps[0].ephemeralMessage.includes('[CLASSIFIED MODE: PLANNER (LEAD ARCHITECT)]'));

    // Adding an edit_file tool call in the current turn switches AUTO to BUILD
    fs.appendFileSync(
      transcriptPath,
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        tool_calls: [{ name: 'edit_file', args: { Path: 'a.js' } }]
      }) + '\n',
      'utf-8'
    );
    const autoBuild = handlePreInvocation(
      { conversationId: 'conv-auto', transcriptPath, lastUserInput: 'Diseña el diagrama de módulos' },
      { activeAgentsPath, homeDir, skipBadgeSpawn: true }
    );
    assert.ok(autoBuild.injectSteps[0].ephemeralMessage.includes('[CLASSIFIED MODE: BUILDER (SDD ORCHESTRATOR)]'));

    const persisted = JSON.parse(fs.readFileSync(activeAgentsPath, 'utf-8'));
    assert.equal(persisted['conv-auto'].effectiveMode, 'BUILD');

    const explicitOut = handlePreInvocation(
      { conversationId: 'conv-explicit', transcriptPath },
      { activeAgentsPath, homeDir, skipBadgeSpawn: true }
    );
    assert.ok(explicitOut.injectSteps[0].ephemeralMessage.includes('[ACTIVE SPECIALIST ROLE: Lead Architect]'));
    assert.ok(explicitOut.injectSteps[0].ephemeralMessage.includes('Follow clean architecture boundaries.'));

    // Entry without an agent id should not inject bogus specialist directives
    const noIdOut = handlePreInvocation(
      { conversationId: 'conv-noid', transcriptPath },
      { activeAgentsPath, homeDir, skipBadgeSpawn: true }
    );
    assert.equal(noIdOut.injectSteps.length, 1);
    assert.ok(noIdOut.injectSteps[0].ephemeralMessage.includes('[CONTEXT MONITOR]:'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PostInvocation and Stop - emit exact protojson contracts', () => {
  const postOut = handlePostInvocation({ conversationId: 'c1' }, { skipBadgeSpawn: true });
  assert.deepEqual(postOut, { injectSteps: [], terminationBehavior: '' });

  const stopOut = handleStop({ conversationId: 'c1', terminationReason: 'NO_TOOL_CALL' }, { skipBadgeSpawn: true });
  assert.deepEqual(stopOut, { decision: 'allow_stop' });
  assert.equal('injectSteps' in stopOut, false);
  assert.equal('terminationBehavior' in stopOut, false);

  assert.deepEqual(runHook(['--stop'], '{}', { skipBadgeSpawn: true }), { decision: 'allow_stop' });
  assert.deepEqual(runHook(['--post'], '{}', { skipBadgeSpawn: true }), {
    injectSteps: [],
    terminationBehavior: ''
  });
});

test('CLI subprocess - handles Windows UTF-8 BOM stdin and produces valid JSON for all 3 events', () => {
  const { dir, transcriptPath } = makeTempEnv();
  try {
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'Fix failing test' }) + '\n',
      'utf-8'
    );

    const preJson = runHookCli(
      [],
      '\uFEFF' + JSON.stringify({ conversationId: 'cli-test', transcriptPath, lastUserInput: 'Fix failing test' })
    );
    assert.equal(preJson.terminationBehavior, '');
    assert.equal(preJson.injectSteps.length, 1);
    assert.equal(typeof preJson.injectSteps[0].ephemeralMessage, 'string');
    assert.equal(preJson.injectSteps[0].systemMessage, undefined);

    const postJson = runHookCli(['--post'], '\uFEFF' + JSON.stringify({ conversationId: 'cli-test', transcriptPath }));
    assert.deepEqual(postJson, { injectSteps: [], terminationBehavior: '' });

    const stopJson = runHookCli(['--stop'], '\uFEFF' + JSON.stringify({ conversationId: 'cli-test', terminationReason: 'NO_TOOL_CALL' }));
    assert.deepEqual(stopJson, { decision: 'allow_stop' });

    // Malformed / empty stdin never crashes
    const emptyPre = runHookCli([], '');
    assert.deepEqual(emptyPre, { injectSteps: [], terminationBehavior: '' });
    const badStop = runHookCli(['--stop'], '{invalid');
    assert.deepEqual(badStop, { decision: 'allow_stop' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
