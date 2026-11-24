import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  MAX_SPECIALIST_CHARS,
  MAX_FULL_INJECT_CHARS,
  MAX_HEARTBEAT_CHARS,
  FULL_INJECT_REFRESH_TURNS,
  stripBom,
  parseHookPayload,
  inspectTranscript,
  calculateContext,
  classifyPlanVsBuild,
  isSddExplicitlyRequested,
  sanitizeSpecialistInstructions,
  loadAgentInstructions,
  getModelSlots,
  buildModelSlotsDirective,
  buildCavemanDirective,
  buildAdhdDirective,
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
  const modelSlotsPath = path.join(dir, 'model_slots.json');
  const modelCatalogPath = path.join(dir, 'model_catalog.json');
  const homeDir = path.join(dir, 'home');
  fs.mkdirSync(homeDir, { recursive: true });
  return { dir, transcriptPath, activeAgentsPath, modelSlotsPath, modelCatalogPath, homeDir };
}

function totalInjectedChars(hookOutput) {
  return (hookOutput?.injectSteps || []).reduce(
    (sum, step) => sum + (step?.ephemeralMessage?.length || 0),
    0
  );
}

function runHookCli(args, stdinText, extraEnv = {}) {
  const stdout = execFileSync(process.execPath, [HOOK_SCRIPT_PATH, ...args], {
    cwd: PLUGIN_DIR,
    input: Buffer.from(stdinText, 'utf-8'),
    env: {
      ...process.env,
      ANTIGRAVITY_HOOK_SKIP_BADGE: '1',
      ...extraEnv
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
  const { dir, transcriptPath, activeAgentsPath, modelSlotsPath, homeDir } = makeTempEnv();
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
      { activeAgentsPath, modelSlotsPath, homeDir, skipBadgeSpawn: true }
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

test('Phase 2 classifier regression suite - PLAN precedence, tie-breaking, and turn isolation', () => {
  const { dir, transcriptPath } = makeTempEnv();
  try {
    // 1. Explicit planning phrases must classify as PLAN even when containing build words
    assert.equal(classifyPlanVsBuild('', 'dame un plan de implementacion'), 'PLAN');
    assert.equal(classifyPlanVsBuild('', 'haz una comparativa de modelos'), 'PLAN');
    assert.equal(classifyPlanVsBuild('', 'create an implementation plan for the migration'), 'PLAN');
    assert.equal(classifyPlanVsBuild('', 'diseña la arquitectura e implementa luego'), 'PLAN');
    assert.equal(classifyPlanVsBuild('', 'analiza el diagnóstico del error y explica cómo arreglarlo'), 'PLAN');
    assert.equal(classifyPlanVsBuild('', 'revisa este archivo'), 'PLAN');

    // 2. Direct mutation commands classify as BUILD
    assert.equal(classifyPlanVsBuild('', 'edita context-hook.mjs y corre los tests'), 'BUILD');
    assert.equal(classifyPlanVsBuild('', 'implementa el endpoint de usuarios'), 'BUILD');
    assert.equal(classifyPlanVsBuild('', 'fix failing unit test'), 'BUILD');

    // 3. Earlier-turn edit_file MUST NOT bleed into a subsequent planning user turn
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'edita foo.js' }),
        JSON.stringify({ type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'edit_file', args: { Path: 'foo.js' } }] }),
        JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'dame un plan de implementacion' })
      ].join('\n') + '\n',
      'utf-8'
    );
    assert.equal(classifyPlanVsBuild(transcriptPath, 'dame un plan de implementacion'), 'PLAN');

    // 4. Current-turn edit_file strictly AFTER the latest USER_INPUT switches to BUILD
    fs.appendFileSync(
      transcriptPath,
      JSON.stringify({ type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'edit_file', args: { Path: 'bar.js' } }] }) + '\n',
      'utf-8'
    );
    assert.equal(classifyPlanVsBuild(transcriptPath, 'dame un plan de implementacion'), 'BUILD');

    // 5. SDD auto-load guard
    assert.equal(isSddExplicitlyRequested('edita context-hook.mjs', { id: 'auto' }), false);
    assert.equal(isSddExplicitlyRequested('/sdd-apply context-hook', { id: 'auto' }), true);
    assert.equal(isSddExplicitlyRequested('edita context-hook.mjs', { id: 'auto', sddEnabled: true }), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 1 & 2 - auto BUILD skips sdd-orchestrator/SKILL.md unless explicitly requested; Dual-Slot & ADHD ported', () => {
  const { dir, transcriptPath, activeAgentsPath, modelSlotsPath, modelCatalogPath, homeDir } = makeTempEnv();
  try {
    // Plant a huge 40 KB SDD skill file in temp homeDir
    const sddDir = path.join(homeDir, '.gemini', 'config', 'skills', 'sdd-orchestrator');
    fs.mkdirSync(sddDir, { recursive: true });
    fs.writeFileSync(
      path.join(sddDir, 'SKILL.md'),
      '---\nname: sdd-orchestrator\n---\nSDD_SENTINEL_MARKER\n' + 'X'.repeat(40000),
      'utf-8'
    );

    fs.writeFileSync(
      modelCatalogPath,
      JSON.stringify({
        modelCatalog: [
          { id: 'gemini-4-neon-high', name: 'Gemini 4 Neon (High)' },
          { id: 'gemini-4-hydrogen-medium', name: 'Gemini 4 Hydrogen (Medium)' }
        ],
        disabledModels: [{ id: 'disabled-model-x' }]
      }),
      'utf-8'
    );
    fs.writeFileSync(
      modelSlotsPath,
      JSON.stringify({
        planner: 'gemini-4-neon-high',
        builder: 'gemini-4-hydrogen-medium',
        enabled: true
      }),
      'utf-8'
    );

    const slots = getModelSlots({ modelSlotsPath, modelCatalogPath }, homeDir);
    assert.equal(slots.enabled, true);
    assert.equal(slots.planner, 'gemini-4-neon-high');
    assert.equal(slots.builder, 'gemini-4-hydrogen-medium');

    // Disabled builder model falls back to gemini-3.8-flash-medium
    const fallbackSlots = getModelSlots(
      { modelSlots: { planner: 'gemini-4-neon-high', builder: 'disabled-model-x', enabled: true }, modelCatalogPath },
      homeDir
    );
    assert.equal(fallbackSlots.builder, 'gemini-3.8-flash-medium');

    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'edita context-hook.mjs y corre los tests' }) + '\n',
      'utf-8'
    );
    fs.writeFileSync(
      activeAgentsPath,
      JSON.stringify({
        'conv-sdd-guard': {
          id: 'auto',
          name: 'Auto (Plan/Build)',
          modifiers: { caveman: true },
          caveman: true
        }
      }),
      'utf-8'
    );

    const out = handlePreInvocation(
      { conversationId: 'conv-sdd-guard', transcriptPath },
      { activeAgentsPath, modelSlotsPath, modelCatalogPath, homeDir, skipBadgeSpawn: true }
    );

    const joined = out.injectSteps.map(s => s.ephemeralMessage).join('\n');
    assert.ok(joined.includes('[DUAL-SLOT MODEL GOVERNANCE]'), 'Must include dual-slot governance');
    assert.ok(joined.includes('gemini-4-hydrogen-medium'), 'Must reference active builder slot');
    assert.ok(joined.includes('[CLASSIFIED MODE: BUILDER'), 'Must classify edit prompt as BUILDER');
    assert.ok(joined.includes('[MODIFIER: CAVEMAN FOCUS MODE]'), 'Must include caveman modifier');
    assert.ok(joined.includes('[MODIFIER: I-HAVE-ADHD OUTPUT SHAPING]'), 'Must include ADHD output shaping');
    assert.ok(joined.includes('[CONTEXT MONITOR]:'), 'Must include single context monitor');
    assert.equal(joined.includes('SDD_SENTINEL_MARKER'), false, 'Must NOT auto-load 40KB SDD SKILL.md in auto mode');
    assert.ok(totalInjectedChars(out) <= MAX_FULL_INJECT_CHARS, `Total chars ${totalInjectedChars(out)} must be <= ${MAX_FULL_INJECT_CHARS}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 1 - child swarm worker sessions receive compact BUILDER WORKER directive instead of Dual-Slot governance', () => {
  const { dir, transcriptPath, activeAgentsPath, modelSlotsPath, homeDir } = makeTempEnv();
  try {
    fs.writeFileSync(
      modelSlotsPath,
      JSON.stringify({ planner: 'gemini-4-neon-high', builder: 'gemini-4-hydrogen-medium', enabled: true }),
      'utf-8'
    );
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({
        type: 'SYSTEM_MESSAGE',
        content: '<swarm_worker> You are builder-1 assigned by coordinator.'
      }) + '\n',
      'utf-8'
    );

    const out = handlePreInvocation(
      { conversationId: 'conv-worker', transcriptPath },
      { activeAgentsPath, modelSlotsPath, homeDir, skipBadgeSpawn: true }
    );
    const joined = out.injectSteps.map(s => s.ephemeralMessage).join('\n');
    assert.ok(joined.includes('[ROLE: BUILDER WORKER]'));
    assert.equal(joined.includes('[DUAL-SLOT MODEL GOVERNANCE]'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 3 sanitizer - strips YAML frontmatter, Mermaid blocks, long tables, and enforces MAX_SPECIALIST_CHARS with pointer', () => {
  const raw = [
    '---',
    'name: giant-agent',
    'description: bloated frontmatter',
    '---',
    '# Core Rules',
    'Keep hexagonal boundaries clean.',
    '```mermaid',
    'flowchart TD',
    '  A --> B',
    '  B --> C',
    '```',
    '| Col1 | Col2 |',
    '|------|------|',
    '| r1   | v1   |',
    '| r2   | v2   |',
    '| r3   | v3   |',
    'Detailed paragraph. '.repeat(200)
  ].join('\n');

  const fakePath = 'C:\\vault\\Agente Orquestador.md';
  const cleaned = sanitizeSpecialistInstructions(raw, fakePath, MAX_SPECIALIST_CHARS);

  assert.ok(cleaned.length <= MAX_SPECIALIST_CHARS, `Sanitized length ${cleaned.length} must be <= ${MAX_SPECIALIST_CHARS}`);
  assert.equal(cleaned.includes('bloated frontmatter'), false, 'YAML frontmatter must be stripped');
  assert.equal(cleaned.includes('flowchart TD'), false, 'Mermaid diagram must be stripped');
  assert.equal(cleaned.includes('| r1   | v1   |'), false, 'Long Markdown table must be stripped');
  assert.ok(cleaned.includes(`Full reference (read on demand only): ${fakePath}`), 'Must keep on-demand file pointer');
});

test('Phase 3 fitness function - delta injection budgets: <=2000 state change, 0 mid-turn, <=300 steady turn, refresh at N=8', () => {
  const { dir, transcriptPath, activeAgentsPath, modelSlotsPath, homeDir } = makeTempEnv();
  try {
    // Huge 45 KB specialist file to stress-test hard cap
    const vaultDir = path.join(homeDir, '.gemini', 'antigravity', 'scratch', 'architecture-vault');
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.writeFileSync(
      path.join(vaultDir, 'Agente Orquestador.md'),
      '---\nrole: orchestrator\n---\n# Lead Architect\n```mermaid\ngraph TD\nA-->B\n```\n' + 'Rule detail line.\n'.repeat(3000),
      'utf-8'
    );

    fs.writeFileSync(
      modelSlotsPath,
      JSON.stringify({ planner: 'gemini-4-neon-high', builder: 'gemini-4-hydrogen-medium', enabled: true }),
      'utf-8'
    );
    fs.writeFileSync(
      activeAgentsPath,
      JSON.stringify({
        'conv-budget': {
          id: 'auto',
          name: 'Auto (Plan/Build)',
          modifiers: { caveman: true },
          caveman: true
        }
      }),
      'utf-8'
    );

    // Turn 1: new session (state-change full inject)
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'dame un plan de implementacion' }) + '\n',
      'utf-8'
    );
    const turn1 = handlePreInvocation(
      { conversationId: 'conv-budget', transcriptPath },
      { activeAgentsPath, modelSlotsPath, homeDir, skipBadgeSpawn: true }
    );
    const turn1Chars = totalInjectedChars(turn1);
    assert.ok(turn1Chars > 0 && turn1Chars <= MAX_FULL_INJECT_CHARS, `Turn 1 chars (${turn1Chars}) must be in (0, ${MAX_FULL_INJECT_CHARS}]`);
    assert.ok(turn1.injectSteps.some(s => s.ephemeralMessage.includes('[CLASSIFIED MODE: PLANNER')));

    // Turn 1, mid-turn tool step (read_file ran, same USER_INPUT, same PLAN mode) -> 0 bytes!
    fs.appendFileSync(
      transcriptPath,
      JSON.stringify({ type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'read_file', args: { Path: 'a.js' } }] }) + '\n',
      'utf-8'
    );
    const midTurn = handlePreInvocation(
      { conversationId: 'conv-budget', transcriptPath },
      { activeAgentsPath, modelSlotsPath, homeDir, skipBadgeSpawn: true }
    );
    assert.equal(midTurn.injectSteps.length, 0, 'Mid-turn tool step must inject 0 steps');
    assert.equal(totalInjectedChars(midTurn), 0, 'Mid-turn tool step must inject 0 chars');

    // Turns 2..8 (steady-state new user turns, unchanged state): turns 1..7 since full -> compact heartbeat <= 300 chars
    for (let t = 1; t < FULL_INJECT_REFRESH_TURNS; t++) {
      fs.appendFileSync(
        transcriptPath,
        JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: `analiza el paso ${t}` }) + '\n',
        'utf-8'
      );
      const steady = handlePreInvocation(
        { conversationId: 'conv-budget', transcriptPath },
        { activeAgentsPath, modelSlotsPath, homeDir, skipBadgeSpawn: true }
      );
      const steadyChars = totalInjectedChars(steady);
      assert.equal(steady.injectSteps.length, 1, `Steady turn ${t} should emit 1 compact heartbeat`);
      assert.ok(steadyChars > 0 && steadyChars <= MAX_HEARTBEAT_CHARS, `Steady turn ${t} chars (${steadyChars}) must be <= ${MAX_HEARTBEAT_CHARS}`);
      assert.ok(steady.injectSteps[0].ephemeralMessage.startsWith('[MODS]:'));
      assert.ok(steady.injectSteps[0].ephemeralMessage.includes('[Abrir Dashboard](sidecar://antigravity-mods/dashboard/)'));
    }

    // Refresh turn (turnsSinceFullInject === 8) -> full capped re-injection <= 2000 chars
    fs.appendFileSync(
      transcriptPath,
      JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'revisa el paso final' }) + '\n',
      'utf-8'
    );
    const refreshTurn = handlePreInvocation(
      { conversationId: 'conv-budget', transcriptPath },
      { activeAgentsPath, modelSlotsPath, homeDir, skipBadgeSpawn: true }
    );
    const refreshChars = totalInjectedChars(refreshTurn);
    assert.ok(refreshTurn.injectSteps.length > 1, 'Refresh turn must re-inject full directives');
    assert.ok(refreshChars <= MAX_FULL_INJECT_CHARS, `Refresh turn chars (${refreshChars}) must be <= ${MAX_FULL_INJECT_CHARS}`);

    // Mid-turn mode transition (edit_file triggers PLAN -> BUILD) -> full capped injection <= 2000 chars
    fs.appendFileSync(
      transcriptPath,
      JSON.stringify({ type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'edit_file', args: { Path: 'x.mjs' } }] }) + '\n',
      'utf-8'
    );
    const modeSwitch = handlePreInvocation(
      { conversationId: 'conv-budget', transcriptPath },
      { activeAgentsPath, modelSlotsPath, homeDir, skipBadgeSpawn: true }
    );
    const switchChars = totalInjectedChars(modeSwitch);
    assert.ok(switchChars > 0 && switchChars <= MAX_FULL_INJECT_CHARS, `Mode switch chars (${switchChars}) must be <= ${MAX_FULL_INJECT_CHARS}`);
    assert.ok(modeSwitch.injectSteps.some(s => s.ephemeralMessage.includes('[CLASSIFIED MODE: BUILDER')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 4 - single-pass transcript read and <30ms latency on >1MB transcript', () => {
  const { dir, transcriptPath, activeAgentsPath, modelSlotsPath, homeDir } = makeTempEnv();
  try {
    // Build >1.1 MB transcript
    const chunk = JSON.stringify({ type: 'TOOL_RESULT', content: 'A'.repeat(2000) });
    const lines = [JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'analiza la latencia' })];
    for (let i = 0; i < 600; i++) lines.push(chunk);
    fs.writeFileSync(transcriptPath, lines.join('\n') + '\n', 'utf-8');

    const sizeBytes = fs.statSync(transcriptPath).size;
    assert.ok(sizeBytes > 1_000_000, `Expected >1MB transcript, got ${sizeBytes} bytes`);

    // Spy on fs.readFileSync specifically for transcriptPath
    const origReadFileSync = fs.readFileSync;
    let transcriptReadCount = 0;
    fs.readFileSync = function patchedReadFileSync(target, ...rest) {
      if (typeof target === 'string' && path.resolve(target) === path.resolve(transcriptPath)) {
        transcriptReadCount++;
      }
      return origReadFileSync.call(fs, target, ...rest);
    };

    try {
      const start = performance.now();
      const out = handlePreInvocation(
        { conversationId: 'conv-perf', transcriptPath },
        { activeAgentsPath, modelSlotsPath, homeDir, skipBadgeSpawn: true }
      );
      const elapsedMs = performance.now() - start;

      assert.equal(transcriptReadCount, 1, `Transcript must be read at most ONCE, read ${transcriptReadCount} times`);
      assert.ok(out.injectSteps.length >= 1);
      assert.ok(elapsedMs < 100, `PreInvocation on >1MB transcript took ${elapsedMs.toFixed(1)}ms`);
    } finally {
      fs.readFileSync = origReadFileSync;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PreInvocation - never emits systemMessage.metadata and includes telemetry + dashboard link', () => {
  const { dir, transcriptPath, activeAgentsPath, modelSlotsPath, homeDir } = makeTempEnv();
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

    const out = handlePreInvocation(
      { conversationId: 'conv-none', transcriptPath, lastUserInput: 'Analiza la arquitectura hexagonal' },
      { activeAgentsPath, modelSlotsPath, homeDir, skipBadgeSpawn: true }
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
  const { dir, transcriptPath, activeAgentsPath, modelSlotsPath } = makeTempEnv();
  const isolatedEnv = {
    ANTIGRAVITY_ACTIVE_AGENTS_PATH: activeAgentsPath,
    ANTIGRAVITY_MODEL_SLOTS_PATH: modelSlotsPath
  };

  try {
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({ type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'Fix failing test' }) + '\n',
      'utf-8'
    );

    const preJson = runHookCli(
      [],
      '\uFEFF' + JSON.stringify({ conversationId: 'cli-test', transcriptPath, lastUserInput: 'Fix failing test' }),
      isolatedEnv
    );
    assert.equal(preJson.terminationBehavior, '');
    assert.equal(preJson.injectSteps.length, 1);
    assert.equal(typeof preJson.injectSteps[0].ephemeralMessage, 'string');
    assert.equal(preJson.injectSteps[0].systemMessage, undefined);

    // Second mid-turn call with same prompt & state returns 0 injected steps
    const midJson = runHookCli(
      [],
      '\uFEFF' + JSON.stringify({ conversationId: 'cli-test', transcriptPath, lastUserInput: 'Fix failing test' }),
      isolatedEnv
    );
    assert.deepEqual(midJson, { injectSteps: [], terminationBehavior: '' });

    const postJson = runHookCli(['--post'], '\uFEFF' + JSON.stringify({ conversationId: 'cli-test', transcriptPath }), isolatedEnv);
    assert.deepEqual(postJson, { injectSteps: [], terminationBehavior: '' });

    const stopJson = runHookCli(['--stop'], '\uFEFF' + JSON.stringify({ conversationId: 'cli-test', terminationReason: 'NO_TOOL_CALL' }), isolatedEnv);
    assert.deepEqual(stopJson, { decision: 'allow_stop' });

    // Malformed / empty stdin never crashes
    const emptyPre = runHookCli([], '', isolatedEnv);
    assert.deepEqual(emptyPre, { injectSteps: [], terminationBehavior: '' });
    const badStop = runHookCli(['--stop'], '{invalid', isolatedEnv);
    assert.deepEqual(badStop, { decision: 'allow_stop' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
