import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TelemetryService } from '../../framework/services/TelemetryService.js';

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
