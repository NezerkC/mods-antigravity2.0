import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Calculates detailed context metrics for all active conversations in the brain.
 * Computes exact breakdown: user prompts, model responses, thinking (CoT),
 * local tools execution, and MCP tool interactions.
 */
export function getAllMetrics() {
  const metrics = {};
  try {
    const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    if (!fs.existsSync(brainDir)) return metrics;

    const dirs = fs.readdirSync(brainDir).filter(d => /^[0-9a-fA-F-]{36}$/.test(d));

    for (const convId of dirs) {
      const fullPath = path.join(brainDir, convId, '.system_generated', 'logs', 'transcript_full.jsonl');
      const compactPath = path.join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');

      let targetPath = '';
      if (fs.existsSync(fullPath)) targetPath = fullPath;
      else if (fs.existsSync(compactPath)) targetPath = compactPath;

      if (!targetPath) {
        metrics[convId] = getEmptyMetric();
        continue;
      }

      metrics[convId] = parseTranscript(targetPath);
    }
  } catch (err) {
    // Fail silently to prevent crashing background hooks
  }
  return metrics;
}

function getEmptyMetric() {
  return {
    estTokens: 0,
    pct: '0.0',
    displayTokens: '0',
    sizeKb: 0,
    breakdown: {
      user: { tokens: 0, pct: 0 },
      model: { tokens: 0, pct: 0 },
      thinking: { tokens: 0, pct: 0 },
      tools: { tokens: 0, pct: 0 },
      mcp: { tokens: 0, pct: 0 },
      other: { tokens: 0, pct: 0 }
    }
  };
}

export function parseTranscript(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalBytes = fs.statSync(filePath).size;

    const raw = {
      userChars: 0,
      modelChars: 0,
      thinkingChars: 0,
      toolsChars: 0,
      mcpChars: 0,
      otherChars: 0,
      totalChars: 0,
      steps: 0
    };

    let lastToolName = '';

    for (const line of lines) {
      if (!line.trim()) continue;
      raw.totalChars += line.length;
      raw.steps++;

      try {
        const item = JSON.parse(line);
        const len = (item.content || '').length;

        if (item.type === 'USER_INPUT') {
          raw.userChars += len;
        } else if (item.type === 'PLANNER_RESPONSE') {
          raw.modelChars += len;
          raw.thinkingChars += (item.thinking || '').length;
          if (item.tool_calls && Array.isArray(item.tool_calls) && item.tool_calls.length) {
            lastToolName = item.tool_calls[0].name || '';
          }
        } else if (item.type === 'GENERIC') {
          if (lastToolName.startsWith('mcp_') || lastToolName === 'call_mcp_tool') {
            raw.mcpChars += len;
          } else {
            raw.toolsChars += len;
          }
        } else {
          raw.otherChars += len;
        }
      } catch (parseErr) {
        raw.otherChars += line.length;
      }
    }

    const estTokens = Math.max(1, Math.round(raw.totalChars / 3.8));
    const pctVal = Math.min(100, Math.max(0, (estTokens / 1_000_000) * 100));
    const pct = pctVal.toFixed(1);
    const displayTokens = estTokens >= 1000 ? (estTokens / 1000).toFixed(1) + 'k' : String(estTokens);

    const calcCategory = (chars) => {
      const tokens = Math.round(chars / 3.8);
      const categoryPct = estTokens > 0 ? Math.round((tokens / estTokens) * 100) : 0;
      return { tokens, pct: categoryPct };
    };

    return {
      estTokens,
      pct,
      pctNumber: pctVal,
      displayTokens,
      sizeKb: Math.round(totalBytes / 1024),
      steps: raw.steps,
      breakdown: {
        user: calcCategory(raw.userChars),
        model: calcCategory(raw.modelChars),
        thinking: calcCategory(raw.thinkingChars),
        tools: calcCategory(raw.toolsChars),
        mcp: calcCategory(raw.mcpChars),
        other: calcCategory(raw.otherChars)
      }
    };
  } catch (err) {
    return getEmptyMetric();
  }
}
