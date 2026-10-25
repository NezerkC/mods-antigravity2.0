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
   * Formats token count into a compact human-readable string.
   * @param {number} tokens
   * @returns {string}
   */
  formatTokens(tokens) {
    if (tokens >= 1_000_000) {
      return (tokens / 1_000_000).toFixed(2) + 'M';
    }
    if (tokens >= 10_000) {
      return (tokens / 1_000).toFixed(1) + 'k';
    }
    return tokens.toLocaleString();
  }

  /**
   * Sanitizes a raw model name extracted from transcript logs, stripping
   * system prompt instructions or trailing punctuation.
   * @param {string} [rawName='']
   * @returns {string}
   */
  sanitizeModelName(rawName = '') {
    return String(rawName || '')
      .replace(/\\n/g, ' ')
      .split(/\r?\n/)[0]
      .replace(/\.\s*No need to comment[\s\S]*$/i, '')
      .replace(/\.\s*If reporting what model[\s\S]*$/i, '')
      .replace(/[`'"]/g, '')
      .replace(/\.\s*$/, '')
      .trim();
  }

  /**
   * Classifies a model name into its quota family and returns its quota limits.
   * @param {string} modelName
   * @returns {{ family: 'argon' | 'claude' | 'gemini', hasDualLimit: boolean, rollingCeiling: number, weeklyCeiling: number }}
   */
  classifyModelFamily(modelName = '') {
    if (/argon/i.test(modelName)) {
      return {
        family: 'argon',
        hasDualLimit: false,
        rollingCeiling: 0,
        weeklyCeiling: 500_000
      };
    }
    if (/claude|gpt/i.test(modelName)) {
      return {
        family: 'claude',
        hasDualLimit: true,
        rollingCeiling: 150_000,
        weeklyCeiling: 1_000_000
      };
    }
    return {
      family: 'gemini',
      hasDualLimit: true,
      rollingCeiling: 300_000,
      weeklyCeiling: 1_500_000
    };
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
      compactions: [],
      chatModels: [],
      modelQuota: {
        hasDualLimit: true,
        modelName: 'Gemini 3.8 Flash',
        rollingLabel: 'Cuota 5h Restante',
        rollingRemaining: 100,
        rollingUsed: 0,
        rollingReset: '5h',
        weeklyLabel: 'Cuota Semanal Restante',
        weeklyRemaining: 100,
        weeklyUsed: 0,
        weeklyReset: '7d',
        singleLabel: 'Cuota Disponible',
        usagePct: 100
      },
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
      const stepEntries = [];
      const compactions = [];
      let detectedModel = '';
      const modelLedger = new Map();

      for (const line of lines) {
        if (!line.trim()) continue;
        raw.steps++;

        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          totalRawChars += line.length;
          continue;
        }

        if (obj.type === 'CHECKPOINT') {
          const preCompactTokens = Math.round(totalRawChars / this.charsPerToken);
          const postCompactTokens = Math.round(line.length / this.charsPerToken);
          compactions.push({
            step: obj.step_index ?? raw.steps,
            fromTokens: preCompactTokens,
            toTokens: postCompactTokens,
            displayFrom: this.formatTokens(preCompactTokens),
            displayTo: this.formatTokens(postCompactTokens),
            timestamp: obj.created_at || null
          });
          totalRawChars = line.length;
          raw.userChars = 0;
          raw.modelChars = 0;
          raw.thinkingChars = 0;
          raw.toolsChars = 0;
          raw.mcpChars = 0;
          raw.otherChars = 0;
        } else {
          totalRawChars += line.length;
        }

        if (
          (obj.type === 'USER_INPUT' || obj.source === 'USER_EXPLICIT') &&
          typeof obj.content === 'string' &&
          obj.content.includes('<USER_SETTINGS_CHANGE>')
        ) {
          const sectionMatch = obj.content.match(/<USER_SETTINGS_CHANGE>([\s\S]*?)<\/USER_SETTINGS_CHANGE>/i);
          const settingsBlock = sectionMatch ? sectionMatch[1] : obj.content;
          const match = settingsBlock.match(/Model Selection[`'"]?\s+from\s+.*?\s+to\s+([^\n<]+)/i);
          if (match && match[1]) {
            detectedModel = this.sanitizeModelName(match[1]);
          }
        }

        if (obj.model) {
          detectedModel = this.sanitizeModelName(obj.model);
        }

        const activeModel = this.sanitizeModelName(detectedModel) || 'Gemini 3.8 Flash';
        const len = (str) => (typeof str === 'string' ? str.length : 0);
        const contentLen = len(obj.content);
        const thinkingLen = len(obj.thinking);
        const toolCallsLen = obj.tool_calls ? JSON.stringify(obj.tool_calls).length : 0;

        let stepBillingTokens = 0;
        if (obj.type === 'PLANNER_RESPONSE' && (obj.input_tokens !== undefined || obj.output_tokens !== undefined)) {
          if (obj.cache_read_tokens !== undefined) {
            stepBillingTokens = Math.max(
              obj.output_tokens || 0,
              Math.round((contentLen + thinkingLen + toolCallsLen) / this.charsPerToken)
            );
          } else {
            stepBillingTokens = (obj.input_tokens || 0) + (obj.output_tokens || 0);
          }
        } else if (obj.type === 'USER_INPUT' || obj.type === 'PLANNER_RESPONSE') {
          stepBillingTokens = Math.round((contentLen + thinkingLen) / this.charsPerToken);
        }

        const stepContextTokens = Math.round(line.length / this.charsPerToken);

        if (!modelLedger.has(activeModel)) {
          modelLedger.set(activeModel, {
            tokens: 0,
            contextTokens: 0
          });
        }
        const ledgerEntry = modelLedger.get(activeModel);
        ledgerEntry.tokens += stepBillingTokens;
        ledgerEntry.contextTokens += stepContextTokens;

        if (obj.created_at) {
          const t = new Date(obj.created_at).getTime();
          if (!isNaN(t)) {
            stepEntries.push({
              timestamp: t,
              tokens: stepBillingTokens,
              model: activeModel
            });
          }
        }

        if (obj.thinking) {
          raw.thinkingChars += thinkingLen;
        }

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

      const displayTokens = this.formatTokens(estTokens);

      const chatModels = [];
      for (const [modelName, data] of modelLedger.entries()) {
        const { family, hasDualLimit, rollingCeiling, weeklyCeiling } = this.classifyModelFamily(modelName);
        const chatRollingPct = hasDualLimit && rollingCeiling > 0
          ? Math.min(100, Math.round((data.tokens / rollingCeiling) * 100))
          : 0;
        const chatWeeklyPct = weeklyCeiling > 0
          ? Math.min(100, Math.round((data.tokens / weeklyCeiling) * 100))
          : 0;

        chatModels.push({
          modelName,
          family,
          hasDualLimit,
          tokens: data.tokens,
          contextTokens: data.contextTokens,
          displayTokens: this.formatTokens(data.tokens),
          chatRollingPct,
          chatWeeklyPct
        });
      }

      const modelQuota = this.resolveModelQuota(detectedModel, stepEntries, chatModels);

      return {
        estTokens,
        pct,
        displayTokens,
        sizeKb: Math.round(totalBytes / 1024),
        steps: raw.steps,
        compactions,
        detectedModel: detectedModel || 'Gemini 3.8 Flash',
        stepEntries,
        chatModels,
        modelQuota,
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
   * Resolves model quota metrics based on the model tier and conversation activity.
   * @param {string} [detectedModel]
   * @param {Array<Object>} [stepEntries]
   * @param {Array<Object>} [chatModels]
   * @returns {Object}
   */
  resolveModelQuota(detectedModel = '', stepEntries = [], chatModels = []) {
    const activeModel = this.sanitizeModelName(detectedModel) || 'Gemini 3.8 Flash';
    const { family, hasDualLimit, rollingCeiling, weeklyCeiling } = this.classifyModelFamily(activeModel);
    const now = Date.now();
    const fiveHoursMs = 5 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    let rollingTokens = 0;
    let weeklyTokens = 0;
    let earliestRollingTimestamp = null;
    let earliestWeeklyTimestamp = null;

    for (const step of stepEntries) {
      if (!step.timestamp) continue;
      if (step.model) {
        const stepFamily = this.classifyModelFamily(step.model).family;
        if (stepFamily !== family) continue;
      }
      const age = now - step.timestamp;
      if (age >= 0 && age <= sevenDaysMs) {
        weeklyTokens += step.tokens;
        if (!earliestWeeklyTimestamp || step.timestamp < earliestWeeklyTimestamp) {
          earliestWeeklyTimestamp = step.timestamp;
        }
        if (age <= fiveHoursMs) {
          rollingTokens += step.tokens;
          if (!earliestRollingTimestamp || step.timestamp < earliestRollingTimestamp) {
            earliestRollingTimestamp = step.timestamp;
          }
        }
      }
    }

    const activeChatModel = chatModels.find(m => m.modelName === activeModel)
      || chatModels.find(m => m.family === family);
    if (weeklyTokens === 0 && activeChatModel && activeChatModel.tokens > 0) {
      weeklyTokens = activeChatModel.tokens;
      rollingTokens = activeChatModel.tokens;
    }

    const rollingUsedPct = hasDualLimit && rollingCeiling > 0
      ? Math.min(100, Math.round((rollingTokens / rollingCeiling) * 100))
      : 0;
    const weeklyUsedPct = weeklyCeiling > 0
      ? Math.min(100, Math.round((weeklyTokens / weeklyCeiling) * 100))
      : 0;

    const rollingRemainingPct = Math.max(0, 100 - rollingUsedPct);
    const weeklyRemainingPct = Math.max(0, 100 - weeklyUsedPct);

    let resetStr = '5h';
    if (earliestRollingTimestamp) {
      const remainingMs = Math.max(0, (earliestRollingTimestamp + fiveHoursMs) - now);
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      const mins = Math.max(hours === 0 ? 1 : 0, Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000)));
      resetStr = `${hours}h ${mins}m`;
    }

    let weeklyResetStr = '7d';
    if (earliestWeeklyTimestamp) {
      const remainingMs = Math.max(0, (earliestWeeklyTimestamp + sevenDaysMs) - now);
      const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
      const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      if (days === 0 && hours === 0) {
        const mins = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
        weeklyResetStr = `${mins}m`;
      } else {
        weeklyResetStr = `${days}d ${hours}h`;
      }
    }

    const currentModelChatWeeklyPct = activeChatModel
      ? activeChatModel.chatWeeklyPct
      : weeklyUsedPct;
    const currentModelChatRollingPct = activeChatModel
      ? activeChatModel.chatRollingPct
      : rollingUsedPct;

    if (family === 'argon') {
      return {
        hasDualLimit: false,
        family,
        modelName: activeModel,
        singleLabel: 'Cuota Semanal Restante',
        remainingPct: weeklyRemainingPct,
        usedPct: weeklyUsedPct,
        chatUsedPct: currentModelChatWeeklyPct,
        resetStr: weeklyResetStr,
        weeklyRemaining: weeklyRemainingPct,
        weeklyUsed: weeklyUsedPct,
        weeklyReset: weeklyResetStr,
        usagePct: weeklyRemainingPct
      };
    }

    return {
      hasDualLimit: true,
      family,
      modelName: activeModel,
      rollingLabel: 'Cuota 5h Restante',
      rollingRemaining: rollingRemainingPct,
      rollingUsed: rollingUsedPct,
      rollingReset: resetStr,
      chatRollingPct: currentModelChatRollingPct,
      weeklyLabel: 'Cuota Semanal Restante',
      weeklyRemaining: weeklyRemainingPct,
      weeklyUsed: weeklyUsedPct,
      weeklyReset: weeklyResetStr,
      chatWeeklyPct: currentModelChatWeeklyPct,
      usagePct: rollingRemainingPct
    };
  }

  /**
   * Retrieves telemetry metrics for all active conversations in the brain,
   * aggregating global account quota usage across all chats.
   * @returns {Record<string, Object>}
   */
  getAllMetrics() {
    const metrics = {};
    try {
      if (!fs.existsSync(this.brainDir)) return metrics;

      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      const dirs = fs.readdirSync(this.brainDir)
        .filter(d => /^[0-9a-fA-F-]{36}$/.test(d))
        .map(d => {
          const dirPath = path.join(this.brainDir, d);
          const fullPath = path.join(dirPath, '.system_generated', 'logs', 'transcript_full.jsonl');
          const compactPath = path.join(dirPath, '.system_generated', 'logs', 'transcript.jsonl');
          let mtime = 0;
          let targetPath = '';
          try {
            if (fs.existsSync(compactPath)) {
              mtime = fs.statSync(compactPath).mtimeMs;
              targetPath = compactPath;
            } else if (fs.existsSync(fullPath)) {
              mtime = fs.statSync(fullPath).mtimeMs;
              targetPath = fullPath;
            }
          } catch {}
          return { id: d, mtime, targetPath };
        })
        .filter(item => item.targetPath)
        .sort((a, b) => b.mtime - a.mtime);

      const activeDirs = dirs.filter((item, idx) => idx < 25 || (now - item.mtime) <= sevenDaysMs);

      const globalStepEntries = [];
      for (const item of activeDirs) {
        const snapshot = this.parseTranscriptFile(item.targetPath);
        metrics[item.id] = snapshot;
        if (Array.isArray(snapshot.stepEntries)) {
          globalStepEntries.push(...snapshot.stepEntries);
        }
      }

      // Re-resolve account-wide quota using global steps across active chats in brain
      for (const id of Object.keys(metrics)) {
        const snap = metrics[id];
        snap.modelQuota = this.resolveModelQuota(
          snap.detectedModel,
          globalStepEntries,
          snap.chatModels
        );
        delete snap.stepEntries;
      }
    } catch {
      // Gracefully prevent background hook crashes
    }
    return metrics;
  }
}
