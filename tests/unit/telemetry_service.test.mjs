import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TelemetryService, formatResetTime, resolveNativeQuotaForModel } from '../../framework/services/TelemetryService.js';
import { renderPopoverHtml } from '../../mods/context-tachometer/components/PopoverHtml.js';

test('TelemetryService - calculates empty metric snapshot', () => {
  const service = new TelemetryService();
  const empty = service.getEmptySnapshot();

  assert.equal(empty.estTokens, 0);
  assert.equal(empty.pct, '0.0');
  assert.equal(empty.displayTokens, '0');
  assert.equal(empty.breakdown.user.tokens, 0);
});

test('TelemetryService - parses JSONL lines and categorizes tokens correctly', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-test-'));
  const transcriptPath = path.join(tempDir, 'transcript.jsonl');

  try {
    const lines = [
      JSON.stringify({ type: 'USER_INPUT', content: 'Hello assistant! How are you doing today?' }),
      JSON.stringify({ type: 'PLANNER_RESPONSE', thinking: 'I should think carefully about greeting the user.', content: 'I am doing well, thank you!' }),
      JSON.stringify({ type: 'GENERIC', tool_calls: [{ name: 'run_command' }], content: 'Output of command' }),
      JSON.stringify({ type: 'GENERIC', tool_calls: [{ name: 'mcp_server_tool' }], content: 'MCP result data' })
    ].join('\n');

    fs.writeFileSync(transcriptPath, lines, 'utf-8');

    const service = new TelemetryService();
    const snapshot = service.parseTranscriptFile(transcriptPath);

    assert.ok(snapshot.estTokens > 0);
    assert.equal(snapshot.steps, 4);
    assert.ok(snapshot.breakdown.user.tokens > 0);
    assert.ok(snapshot.breakdown.model.tokens > 0);
    assert.ok(snapshot.breakdown.thinking.tokens > 0);
    assert.ok(snapshot.breakdown.tools.tokens > 0);
    assert.ok(snapshot.breakdown.mcp.tokens > 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('TelemetryService - resolveModelQuota handles Gemini/Claude dual-limit and Argon single-tier', () => {
  const service = new TelemetryService();

  // Gemini standard model (dual-limit: 5h + weekly)
  const geminiQuota = service.resolveModelQuota('Gemini 3.8 Flash (High)', [
    { timestamp: Date.now() - 1000, tokens: 30000, model: 'Gemini 3.8 Flash (High)' }
  ]);
  assert.equal(geminiQuota.hasDualLimit, true);
  assert.equal(geminiQuota.family, 'gemini');
  assert.equal(geminiQuota.modelName, 'Gemini 3.8 Flash (High)');
  assert.equal(geminiQuota.rollingUsed, 10);
  assert.equal(geminiQuota.rollingRemaining, 90);
  assert.equal(geminiQuota.weeklyUsed, 2);
  assert.equal(geminiQuota.weeklyRemaining, 98);

  // Claude model (dual-limit: 5h + weekly)
  const claudeQuota = service.resolveModelQuota('claude-3-7-sonnet', [
    { timestamp: Date.now() - 1000, tokens: 15000, model: 'claude-3-7-sonnet' }
  ]);
  assert.equal(claudeQuota.hasDualLimit, true);
  assert.equal(claudeQuota.family, 'claude');
  assert.equal(claudeQuota.modelName, 'claude-3-7-sonnet');
  assert.equal(claudeQuota.rollingUsed, 10);
  assert.equal(claudeQuota.rollingRemaining, 90);
  assert.equal(claudeQuota.weeklyUsed, 2);
  assert.equal(claudeQuota.weeklyRemaining, 98);

  // Gemini 4 Argon (single weekly limit only)
  const argonQuota = service.resolveModelQuota('Gemini 4 Argon (Medium)', [
    { timestamp: Date.now() - 1000, tokens: 50000, model: 'Gemini 4 Argon (Medium)' }
  ]);
  assert.equal(argonQuota.hasDualLimit, false);
  assert.equal(argonQuota.family, 'argon');
  assert.equal(argonQuota.modelName, 'Gemini 4 Argon (Medium)');
  assert.equal(argonQuota.weeklyUsed, 10);
  assert.equal(argonQuota.weeklyRemaining, 90);
});

test('TelemetryService - tracks multi-model state machine per chat and calculates chat quota share', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-multimodel-'));
  const transcriptPath = path.join(tempDir, 'transcript.jsonl');
  const nowIso = new Date().toISOString();

  try {
    const lines = [
      JSON.stringify({
        type: 'USER_INPUT',
        created_at: nowIso,
        content: '<USER_REQUEST>Hi</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 3.8 Flash (High).\n</USER_SETTINGS_CHANGE>'
      }),
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        created_at: nowIso,
        input_tokens: 28000,
        output_tokens: 2000,
        content: 'First response using Flash'
      }),
      JSON.stringify({
        type: 'USER_INPUT',
        created_at: nowIso,
        content: '<USER_REQUEST>Switch to Argon</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from Gemini 3.8 Flash (High) to Gemini 4 Argon (Medium).\n</USER_SETTINGS_CHANGE>'
      }),
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        created_at: nowIso,
        input_tokens: 45000,
        output_tokens: 5000,
        content: 'Second response using Argon'
      })
    ].join('\n');

    fs.writeFileSync(transcriptPath, lines, 'utf-8');

    const service = new TelemetryService();
    const snapshot = service.parseTranscriptFile(transcriptPath);

    assert.equal(snapshot.chatModels.length, 2);
    const flashEntry = snapshot.chatModels.find(m => m.modelName === 'Gemini 3.8 Flash (High)');
    const argonEntry = snapshot.chatModels.find(m => m.modelName === 'Gemini 4 Argon (Medium)');

    assert.ok(flashEntry);
    assert.ok(argonEntry);
    assert.equal(flashEntry.hasDualLimit, true);
    assert.ok(flashEntry.tokens >= 30000);
    assert.equal(flashEntry.chatRollingPct, 10);

    assert.equal(argonEntry.hasDualLimit, false);
    assert.ok(argonEntry.tokens >= 50000);
    assert.equal(argonEntry.chatWeeklyPct, 10);

    // Active model at end of chat is Gemini 4 Argon (Medium)
    assert.equal(snapshot.modelQuota.hasDualLimit, false);
    assert.equal(snapshot.modelQuota.modelName, 'Gemini 4 Argon (Medium)');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('TelemetryService - strips system prompt instructions from Model Selection and ignores GENERIC tool outputs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-sanitize-'));
  const transcriptPath = path.join(tempDir, 'transcript.jsonl');
  const nowIso = new Date().toISOString();

  try {
    const lines = [
      JSON.stringify({
        type: 'USER_INPUT',
        created_at: nowIso,
        content: '<USER_REQUEST>Hi</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 4 Argon (Medium). No need to comment on this change if the user doesn\'t ask about it. If reporting what model you are, please use a human readable name instead of the exact string.\n</USER_SETTINGS_CHANGE>'
      }),
      JSON.stringify({
        type: 'GENERIC',
        created_at: nowIso,
        content: 'File read containing <USER_SETTINGS_CHANGE>Model Selection from X to FakeModel.\\n</USER_SETTINGS_CHANGE>'
      }),
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        created_at: nowIso,
        input_tokens: 18000,
        cache_read_tokens: 15000,
        output_tokens: 1200,
        content: 'Clean response'
      })
    ].join('\n');

    fs.writeFileSync(transcriptPath, lines, 'utf-8');

    const service = new TelemetryService();
    const snapshot = service.parseTranscriptFile(transcriptPath);

    assert.equal(snapshot.detectedModel, 'Gemini 4 Argon (Medium)');
    assert.equal(snapshot.modelQuota.modelName, 'Gemini 4 Argon (Medium)');
    assert.equal(snapshot.chatModels.length, 1);
    assert.equal(snapshot.chatModels[0].modelName, 'Gemini 4 Argon (Medium)');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('TelemetryService - records CHECKPOINT compactions, resets active context window, and preserves cumulative billing quota', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-checkpoint-'));
  const transcriptPath = path.join(tempDir, 'transcript.jsonl');
  const nowIso = new Date().toISOString();

  try {
    const preCheckpointPrompt = 'A'.repeat(38000); // ~10,000 tokens
    const checkpointSummary = 'Summary of previous turns';
    const postCheckpointReply = 'B'.repeat(380);

    const lines = [
      JSON.stringify({
        type: 'USER_INPUT',
        created_at: nowIso,
        content: `<USER_REQUEST>${preCheckpointPrompt}</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting \`Model Selection\` from None to Gemini 3.8 Flash (High).\n</USER_SETTINGS_CHANGE>`
      }),
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        created_at: nowIso,
        input_tokens: 12000,
        output_tokens: 3000,
        content: 'Initial heavy response before compaction'
      }),
      JSON.stringify({
        type: 'CHECKPOINT',
        step_index: 25,
        created_at: nowIso,
        content: checkpointSummary
      }),
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        created_at: nowIso,
        input_tokens: 1000,
        output_tokens: 500,
        content: postCheckpointReply
      })
    ].join('\n');

    fs.writeFileSync(transcriptPath, lines, 'utf-8');

    const service = new TelemetryService();
    const snapshot = service.parseTranscriptFile(transcriptPath);

    assert.equal(snapshot.steps, 4);
    assert.equal(snapshot.compactions.length, 1);
    const compaction = snapshot.compactions[0];
    assert.equal(compaction.step, 25);
    assert.ok(compaction.fromTokens > 10000);
    assert.ok(compaction.toTokens < 100);
    assert.ok(compaction.displayFrom);
    assert.ok(compaction.displayTo);

    // Active context window (estTokens) reflects only CHECKPOINT onward
    assert.ok(snapshot.estTokens < 500);
    assert.equal(snapshot.breakdown.user.tokens, 0);

    // Cumulative billing quota across the checkpoint is preserved
    const flashModel = snapshot.chatModels.find(m => m.modelName === 'Gemini 3.8 Flash (High)');
    assert.ok(flashModel);
    assert.ok(flashModel.tokens >= 16500);

    // Popover HTML renders compaction history section with SVG vector icons
    const html = renderPopoverHtml(snapshot);
    assert.ok(html.includes('Historial de Compactación (/compact)'));
    assert.ok(html.includes('Turno #25'));
    assert.ok(html.includes('<svg'));
    assert.ok(html.includes(compaction.displayFrom));
    assert.ok(html.includes(compaction.displayTo));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('TelemetryService - formatResetTime calculates human-readable countdowns correctly', () => {
  const now = 1700000000000;
  assert.equal(formatResetTime(now + 165600000, now), '1d 22h');
  assert.equal(formatResetTime(now + 15480000, now), '4h 18m');
  assert.equal(formatResetTime(now + 2700000, now), '45m');
  assert.equal(formatResetTime(now - 5000, now), '<1m');
  assert.equal(formatResetTime(null, now), '7d');
});

test('TelemetryService - resolveNativeQuotaForModel maps RPC groups to accurate model quotas', () => {
  const mockGroups = [
    {
      displayName: 'Gemini Models',
      buckets: [
        {
          bucketId: 'gemini-weekly',
          displayName: 'Weekly Limit Remaining',
          window: 'weekly',
          remainingFraction: 0.4916,
          resetTime: '2026-10-31T01:56:26Z'
        },
        {
          bucketId: 'gemini-5h',
          displayName: 'Five Hour Limit Remaining',
          window: '5h',
          remainingFraction: 0.924,
          resetTime: '2026-10-29T07:49:28Z'
        }
      ]
    },
    {
      displayName: 'Claude and GPT models',
      buckets: [
        {
          bucketId: '3p-weekly',
          displayName: 'Weekly Limit Remaining',
          window: 'weekly',
          remainingFraction: 1,
          resetTime: '2026-11-04T20:16:17Z'
        },
        {
          bucketId: '3p-5h',
          displayName: 'Five Hour Limit Remaining',
          window: '5h',
          remainingFraction: 1,
          resetTime: '2026-10-29T08:30:38Z'
        }
      ]
    },
    {
      displayName: 'Gemini 4 Argon',
      buckets: [
        {
          bucketId: 'gemini-argon-wtu-weekly',
          displayName: 'Gemini 4 Argon Weekly Limit',
          window: 'weekly',
          remainingFraction: 0.208,
          resetTime: '2026-10-31T05:10:34Z'
        }
      ]
    }
  ];

  // Test Gemini Flash
  const flashQuota = resolveNativeQuotaForModel(mockGroups, 'Gemini 3.8 Flash (High)');
  assert.ok(flashQuota);
  assert.equal(flashQuota.hasDualLimit, true);
  assert.equal(flashQuota.weeklyRemaining, 49);
  assert.equal(flashQuota.weeklyUsed, 51);
  assert.equal(flashQuota.rollingRemaining, 92);
  assert.equal(flashQuota.rollingUsed, 8);
  assert.ok(flashQuota.weeklyReset);

  // Test Gemini 4 Argon
  const argonQuota = resolveNativeQuotaForModel(mockGroups, 'Gemini 4 Argon (Medium)');
  assert.ok(argonQuota);
  assert.equal(argonQuota.hasDualLimit, false);
  assert.equal(argonQuota.weeklyRemaining, 21);
  assert.equal(argonQuota.weeklyUsed, 79);
  assert.equal(argonQuota.singleLabel, 'Cuota Semanal Restante');

  // Test Claude Sonnet
  const claudeQuota = resolveNativeQuotaForModel(mockGroups, 'Claude Sonnet 5.5 (Medium)');
  assert.ok(claudeQuota);
  assert.equal(claudeQuota.hasDualLimit, true);
  assert.equal(claudeQuota.weeklyRemaining, 100);
  assert.equal(claudeQuota.weeklyUsed, 0);

  // Integration with resolveModelQuota
  const service = new TelemetryService();
  const serviceQuota = service.resolveModelQuota('Gemini 3.8 Flash (High)', [], [], mockGroups);
  assert.ok(serviceQuota);
  assert.equal(serviceQuota.weeklyRemaining, 49);
  assert.equal(serviceQuota.isNative, true);

  // HTML rendering test
  const html = renderPopoverHtml({ modelQuota: serviceQuota, displayTokens: '10.5k', pct: '1.0' });
  assert.ok(html.includes('Cuota Semanal Restante'));
  assert.ok(html.includes('49%'));
  assert.ok(html.includes('Cuota 5h Restante'));
  assert.ok(html.includes('92%'));
});

