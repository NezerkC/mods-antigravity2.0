import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Service responsible for calculating detailed context window telemetry and
 * token usage metrics from Antigravity conversation transcripts.
 */
export class TelemetryService {
  /**
   * @param {Object} [options]
   * @param {string} [options.brainDir] Base brain storage directory.
   * @param {number} [options.tokenLimit=1000000] Context window ceiling.
   * @param {number} [options.charsPerToken=3.8] Approximation constant.
   */
  constructor(options = {}) {
    this.brainDir = options.brainDir || path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    this.tokenLimit = options.tokenLimit ?? 1_000_000;
    this.charsPerToken = options.charsPerToken ?? 3.8;
  }

  /**
   * Default empty telemetry snapshot.
   */
  getEmptySnapshot() {
    return {
      estTokens: 0,
      pct: '0.0',
      displayTokens: '0',
      sizeKb: 0,
      steps: 0,
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

  /**
   * Parses a specific transcript JSONL file.
   * @param {string} filePath
   * @returns {Object}
   */
  parseTranscriptFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return this.getEmptySnapshot();
      }

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

      let totalRawChars = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        raw.steps++;
        totalRawChars += line.length;

        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }

        const len = (str) => (typeof str === 'string' ? str.length : 0);

        if (obj.thinking) {
          raw.thinkingChars += len(obj.thinking);
        }

        const contentLen = len(obj.content);
        const toolCallsLen = obj.tool_calls ? JSON.stringify(obj.tool_calls).length : 0;

        if (obj.tool_calls && Array.isArray(obj.tool_calls)) {
          const isMcp = obj.tool_calls.some(tc =>
            tc.name && (tc.name.startsWith('mcp_') || tc.name === 'call_mcp_tool')
          );
          if (isMcp) raw.mcpChars += contentLen + toolCallsLen;
          else raw.toolsChars += contentLen + toolCallsLen;
        } else if (obj.type === 'USER_INPUT') {
          raw.userChars += contentLen;
        } else if (obj.type === 'PLANNER_RESPONSE') {
          raw.modelChars += contentLen;
        } else if (obj.type === 'GENERIC') {
          raw.toolsChars += contentLen + toolCallsLen;
        } else {
          raw.otherChars += contentLen;
        }
      }

      // Total characters reflects real serialized message envelope sent to context window
      raw.totalChars = totalRawChars;

      const estTokens = Math.round(raw.totalChars / this.charsPerToken);
      const pctVal = (estTokens / this.tokenLimit) * 100;
      const pct = pctVal < 0.01 && estTokens > 0 ? '<0.01' : pctVal.toFixed(pctVal < 1 ? 2 : 1);

      const toTokens = (chars) => Math.round(chars / this.charsPerToken);
      const catPct = (t) => (estTokens > 0 ? Math.round((t / estTokens) * 100) : 0);

      const userTokens = toTokens(raw.userChars);
      const modelTokens = toTokens(raw.modelChars);
      const thinkingTokens = toTokens(raw.thinkingChars);
      const toolsTokens = toTokens(raw.toolsChars);
      const mcpTokens = toTokens(raw.mcpChars);
      const otherTokens = toTokens(raw.otherChars);

      let displayTokens = estTokens.toLocaleString();
      if (estTokens >= 1_000_000) {
        displayTokens = (estTokens / 1_000_000).toFixed(2) + 'M';
      } else if (estTokens >= 10_000) {
        displayTokens = (estTokens / 1_000).toFixed(1) + 'k';
      }

      return {
        estTokens,
        pct,
        displayTokens,
        sizeKb: Math.round(totalBytes / 1024),
        steps: raw.steps,
        breakdown: {
          user: { tokens: userTokens, pct: catPct(userTokens) },
          model: { tokens: modelTokens, pct: catPct(modelTokens) },
          thinking: { tokens: thinkingTokens, pct: catPct(thinkingTokens) },
          tools: { tokens: toolsTokens, pct: catPct(toolsTokens) },
          mcp: { tokens: mcpTokens, pct: catPct(mcpTokens) },
          other: { tokens: otherTokens, pct: catPct(otherTokens) }
        }
      };
    } catch {
      return this.getEmptySnapshot();
    }
  }

  /**
   * Retrieves telemetry metrics for all active conversations in the brain.
   * @returns {Record<string, Object>}
   */
  getAllMetrics() {
    const metrics = {};
    try {
      if (!fs.existsSync(this.brainDir)) return metrics;

      const dirs = fs.readdirSync(this.brainDir)
        .filter(d => /^[0-9a-fA-F-]{36}$/.test(d))
        .map(d => {
          const dirPath = path.join(this.brainDir, d);
          const fullPath = path.join(dirPath, '.system_generated', 'logs', 'transcript_full.jsonl');
          const compactPath = path.join(dirPath, '.system_generated', 'logs', 'transcript.jsonl');
          let mtime = 0;
          let targetPath = '';
          try {
            if (fs.existsSync(fullPath)) {
              mtime = fs.statSync(fullPath).mtimeMs;
              targetPath = fullPath;
            } else if (fs.existsSync(compactPath)) {
              mtime = fs.statSync(compactPath).mtimeMs;
              targetPath = compactPath;
            }
          } catch {}
          return { id: d, mtime, targetPath };
        })
        .filter(item => item.targetPath)
        .sort((a, b) => b.mtime - a.mtime); // Sort newest/active conversations first!

      for (const item of dirs) {
        metrics[item.id] = this.parseTranscriptFile(item.targetPath);
      }
    } catch {
      // Gracefully prevent background hook crashes
    }
    return metrics;
  }
}
