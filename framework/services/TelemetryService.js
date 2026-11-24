// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

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
    this.parseCache = new Map();
    this.pitWallCache = { ts: 0, data: null };
    this.pitWallFileCache = new Map();
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
   * Validates whether a candidate model string is a realistic model identifier or junk.
   * @param {string} [rawName='']
   * @returns {boolean}
   */
  isValidModelName(rawName = '') {
    if (!rawName || typeof rawName !== 'string') return false;
    const trimmed = rawName.trim();
    if (!trimmed || trimmed.length > 48) return false;
    const lower = trimmed.toLowerCase();
    if (['none', 'null', 'undefined', 'unknown', 'default', 'fakemodel'].includes(lower)) return false;
    if (/fakemodel|[\\{};=<>]/i.test(trimmed)) return false;
    return true;
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
   * Unwraps potentially JSON-encoded tool call arguments from transcript logs.
   * @param {any} rawVal
   * @returns {any}
   */
  unwrapToolArg(rawVal) {
    if (rawVal === undefined || rawVal === null) return '';
    if (typeof rawVal !== 'string') return rawVal;
    const trimmed = rawVal.trim();
    if (!trimmed) return '';
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed.replace(/^["']|["']$/g, '').trim();
      }
    }
    return trimmed;
  }

  /**
   * Resolves the effective model name used by a subagent given its requested Model
   * argument ('inherit', 'flash', 'flash_lite', 'pro', or explicit name) and parent model.
   * @param {any} rawModelArg
   * @param {string} [parentActiveModel='']
   * @returns {{ modelName: string, requestedModel: string, isInherited: boolean }}
   */
  resolveSubagentModel(rawModelArg, parentActiveModel = '') {
    const unwrapped = this.unwrapToolArg(rawModelArg);
    const requested = typeof unwrapped === 'string' ? unwrapped.trim() : '';
    const lower = (requested || 'inherit').toLowerCase();
    const fallbackParent = this.sanitizeModelName(parentActiveModel) || 'Gemini 3.8 Flash';

    if (!requested || lower === 'inherit') {
      return {
        modelName: fallbackParent,
        requestedModel: 'inherit',
        isInherited: true
      };
    }
    if (lower === 'flash') {
      return {
        modelName: 'Gemini 3.8 Flash',
        requestedModel: 'flash',
        isInherited: false
      };
    }
    if (lower === 'flash_lite' || lower === 'flash-lite') {
      return {
        modelName: 'Gemini 3.8 Flash-Lite',
        requestedModel: 'flash_lite',
        isInherited: false
      };
    }
    if (lower === 'pro') {
      return {
        modelName: 'Gemini 3.8 Pro',
        requestedModel: 'pro',
        isInherited: false
      };
    }

    return {
      modelName: this.sanitizeModelName(requested) || fallbackParent,
      requestedModel: requested,
      isInherited: false
    };
  }

  /**
   * Infers conversation ID, conversation directory, and brain root from a transcript path.
   * @param {string} filePath
   * @returns {{ convId: string|null, convDir: string|null, brainRoot: string|null }}
   */
  inferConversationPaths(filePath) {
    try {
      const logsDir = path.dirname(filePath);
      const sysGenDir = path.dirname(logsDir);
      const convDir = path.dirname(sysGenDir);
      const convName = path.basename(convDir);
      if (
        path.basename(sysGenDir) === '.system_generated' &&
        /^[0-9a-fA-F-]{36}$/.test(convName)
      ) {
        return {
          convId: convName,
          convDir,
          brainRoot: path.dirname(convDir)
        };
      }
    } catch {}
    return { convId: null, convDir: null, brainRoot: null };
  }

  /**
   * Resolves the transcript file path for a given conversation ID inside brainRoot.
   * @param {string} convId
   * @param {string} [brainRoot]
   * @returns {string|null}
   */
  resolveConversationTranscriptPath(convId, brainRoot = this.brainDir) {
    if (!convId || !brainRoot) return null;
    const baseLogs = path.join(brainRoot, convId, '.system_generated', 'logs');
    const compactPath = path.join(baseLogs, 'transcript.jsonl');
    if (fs.existsSync(compactPath)) return compactPath;
    const fullPath = path.join(baseLogs, 'transcript_full.jsonl');
    if (fs.existsSync(fullPath)) return fullPath;
    return null;
  }

  /**
   * Resolves display palette, short name, and quota pool classification for a model name.
   * @param {string} [modelName='']
   * @returns {{ color: string, shortName: string, poolId: 'gemini_unified'|'argon_weekly'|'third_party', poolLabel: string }}
   */
  resolveModelVisualMeta(modelName = '') {
    const cleaned = this.sanitizeModelName(modelName) || 'Gemini 3.8 Flash';
    const lower = cleaned.toLowerCase();

    let color = '#94a3b8';
    let poolId = 'gemini_unified';
    let poolLabel = 'Gemini Unificado';

    if (/argon|g1-pro/i.test(lower)) {
      color = '#38bdf8';
      poolId = 'argon_weekly';
      poolLabel = 'Argon Semanal';
    } else if (/opus/i.test(lower)) {
      color = '#c084fc';
      poolId = 'third_party';
      poolLabel = 'Claude / GPT-OSS';
    } else if (/sonnet|claude/i.test(lower)) {
      color = '#a78bfa';
      poolId = 'third_party';
      poolLabel = 'Claude / GPT-OSS';
    } else if (/gpt-oss|gpt|120b/i.test(lower)) {
      color = '#f472b6';
      poolId = 'third_party';
      poolLabel = 'Claude / GPT-OSS';
    } else if (/neon/i.test(lower)) {
      color = '#a3e635';
    } else if (/hydrogen/i.test(lower)) {
      color = '#34d399';
    } else if (/flash|gemini/i.test(lower)) {
      color = '#fbbf24';
    }

    let shortName = cleaned;
    if (/orchestrator/i.test(lower)) {
      shortName = lower.includes('neon') ? 'Orch. Neon' : 'Orchestrator';
    } else {
      shortName = cleaned
        .replace(/^Gemini\s+4\s+/i, '')
        .replace(/^Gemini\s+([\d.]+)\s+Flash/i, 'Flash $1')
        .replace(/^Claude\s+/i, '')
        .replace(/\(([^)]+)\)/g, (_, eff) => {
          const e = eff.trim();
          return /^medium$/i.test(e) ? 'Med' : e;
        })
        .replace(/\s+/g, ' ')
        .trim();
      if (/^GPT-OSS/i.test(shortName)) {
        shortName = 'GPT-OSS 120B';
      }
    }

    return { color, shortName, poolId, poolLabel };
  }

  /**
   * Builds a 100-cell Claude-style waffle grid representing session context usage vs tokenLimit.
   * @param {number} estTokens
   * @param {Object} breakdown
   * @returns {Array<{ index: number, key: string, label: string, color: string, tokens: number, pct: number }>}
   */
  buildWaffleCells(estTokens = 0, breakdown = {}) {
    const limit = Math.max(1, this.tokenLimit || 1_000_000);
    const cellSize = limit / 100;
    const bd = breakdown || {};

    const categories = [
      { key: 'user', label: 'Prompts', color: '#38bdf8', tokens: bd.user?.tokens || 0 },
      { key: 'model', label: 'Replies', color: '#a855f7', tokens: bd.model?.tokens || 0 },
      { key: 'thinking', label: 'Thinking', color: '#ec4899', tokens: bd.thinking?.tokens || 0 },
      { key: 'tools', label: 'Tools', color: '#f59e0b', tokens: bd.tools?.tokens || 0 },
      { key: 'mcp', label: 'MCP', color: '#10b981', tokens: bd.mcp?.tokens || 0 },
      { key: 'other', label: 'Context', color: '#64748b', tokens: bd.other?.tokens || 0 }
    ];

    const knownSum = categories.reduce((acc, c) => acc + c.tokens, 0);
    if (estTokens > knownSum) {
      categories[5].tokens += (estTokens - knownSum);
    }

    let usedCells = estTokens > 0 ? Math.min(100, Math.round(estTokens / cellSize)) : 0;
    if (estTokens > 0 && usedCells === 0) usedCells = 1;

    const counts = categories.map(c => {
      const share = estTokens > 0 ? (c.tokens / estTokens) * usedCells : 0;
      return { ...c, exact: share, cells: Math.floor(share) };
    });

    let allocated = counts.reduce((acc, c) => acc + c.cells, 0);
    const remainders = [...counts]
      .filter(c => c.tokens > 0)
      .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));

    let idx = 0;
    while (allocated < usedCells && remainders.length > 0) {
      remainders[idx % remainders.length].cells++;
      allocated++;
      idx++;
    }

    const cells = [];
    for (const c of counts) {
      const pct = estTokens > 0 ? Number(((c.tokens / limit) * 100).toFixed(1)) : 0;
      for (let i = 0; i < c.cells && cells.length < 100; i++) {
        cells.push({
          index: cells.length,
          key: c.key,
          label: c.label,
          color: c.color,
          tokens: c.tokens,
          pct
        });
      }
    }

    const freeTokens = Math.max(0, limit - estTokens);
    const freePct = Number(((freeTokens / limit) * 100).toFixed(1));
    while (cells.length < 100) {
      cells.push({
        index: cells.length,
        key: 'free',
        label: 'Libre',
        color: 'rgba(255, 255, 255, 0.08)',
        tokens: freeTokens,
        pct: freePct
      });
    }

    return cells;
  }

  /**
   * Aggregates chatModels entries into the 3 Antigravity quota pools.
   * @param {Array<Object>} chatModels
   * @returns {Array<Object>}
   */
  buildPoolsSummary(chatModels = []) {
    const pools = {
      gemini_unified: { id: 'gemini_unified', label: 'Gemini Unificado', accent: '#a3e635', tokens: 0, displayTokens: '0', pct: 0, models: [] },
      argon_weekly: { id: 'argon_weekly', label: 'Argon Semanal', accent: '#38bdf8', tokens: 0, displayTokens: '0', pct: 0, models: [] },
      third_party: { id: 'third_party', label: 'Claude / GPT-OSS', accent: '#c084fc', tokens: 0, displayTokens: '0', pct: 0, models: [] }
    };

    const list = Array.isArray(chatModels) ? chatModels : [];
    const total = list.reduce((acc, m) => acc + (m.tokens || 0), 0);

    for (const m of list) {
      const meta = (m.poolId && m.color && m.shortName)
        ? m
        : this.resolveModelVisualMeta(m.modelName);
      const pool = pools[meta.poolId] || pools.gemini_unified;
      const t = m.tokens || 0;
      pool.tokens += t;
      pool.models.push({
        modelName: m.modelName,
        shortName: m.shortName || meta.shortName,
        color: m.color || meta.color,
        tokens: t,
        displayTokens: m.displayTokens || this.formatTokens(t),
        pct: total > 0 ? Math.round((t / total) * 100) : 0
      });
    }

    return Object.values(pools).map(p => ({
      ...p,
      displayTokens: this.formatTokens(p.tokens),
      pct: total > 0 ? Math.round((p.tokens / total) * 100) : 0
    }));
  }

  /**
   * Extracts { fromModel, toModel } from a <USER_SETTINGS_CHANGE> block when present.
   * Supports both `<USER_SETTINGS_CHANGE>Model Selection from "A" to "B"</USER_SETTINGS_CHANGE>`
   * and `The user changed setting \`Model Selection\` from A to B.` formats, including dotted versions.
   * @param {string} content
   * @returns {{ fromModel: string|null, toModel: string|null }}
   */
  extractModelSelectionChange(content) {
    if (typeof content !== 'string' || !content.includes('<USER_SETTINGS_CHANGE>')) {
      return { fromModel: null, toModel: null };
    }
    const sectionMatch = content.match(/<USER_SETTINGS_CHANGE>([\s\S]*?)<\/USER_SETTINGS_CHANGE>/i);
    const settingsBlock = sectionMatch ? sectionMatch[1] : content;
    const match = settingsBlock.match(
      /(?:The user changed setting\s+)?[`'"]?Model Selection[`'"]?\s+from\s+(?:"([^"]+)"|'([^']+)'|`([^`]+)`|(.+?))\s+to\s+(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\n<]+?)(?:\.(?=\s|$)|\s*$))/i
    );
    if (!match) {
      return { fromModel: null, toModel: null };
    }
    const rawFrom = (match[1] || match[2] || match[3] || match[4] || '').trim();
    const rawTo = (match[5] || match[6] || match[7] || match[8] || '').trim();
    const sanitizedFrom = rawFrom ? this.sanitizeModelName(rawFrom) : '';
    const sanitizedTo = rawTo ? this.sanitizeModelName(rawTo) : '';
    return {
      fromModel: this.isValidModelName(sanitizedFrom) ? sanitizedFrom : null,
      toModel: this.isValidModelName(sanitizedTo) ? sanitizedTo : null
    };
  }

  /**
   * Default empty telemetry snapshot.
   */
  getEmptySnapshot() {
    const emptyBreakdown = {
      user: { tokens: 0, pct: 0 },
      model: { tokens: 0, pct: 0 },
      thinking: { tokens: 0, pct: 0 },
      tools: { tokens: 0, pct: 0 },
      mcp: { tokens: 0, pct: 0 },
      other: { tokens: 0, pct: 0 }
    };
    return {
      estTokens: 0,
      pct: '0.0',
      displayTokens: '0',
      sizeKb: 0,
      steps: 0,
      compactions: [],
      chatModels: [],
      subagents: [],
      waffleCells: this.buildWaffleCells(0, emptyBreakdown),
      poolsSummary: this.buildPoolsSummary([]),
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
      breakdown: emptyBreakdown
    };
  }

  /**
   * Parses a single transcript file without resolving external child subagent files,
   * caching raw results keyed by file path and inherited fallback model.
   * @param {string} filePath
   * @param {string} [inheritedModel='']
   * @returns {Object|null}
   */
  _parseSingleTranscript(filePath, inheritedModel = '') {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    const cleanInherited = this.sanitizeModelName(inheritedModel);
    const stat = fs.statSync(filePath);
    const totalBytes = stat.size;
    const mtimeMs = stat.mtimeMs;

    const { convDir } = this.inferConversationPaths(filePath);
    const subagentsMetaDir = convDir ? path.join(convDir, '.system_generated', 'subagents') : null;
    let subagentsDirSig = '';
    if (subagentsMetaDir && fs.existsSync(subagentsMetaDir)) {
      try {
        const metaFiles = fs.readdirSync(subagentsMetaDir).filter(f => f.endsWith('.json'));
        let maxSubMtime = 0;
        for (const mf of metaFiles) {
          const mst = fs.statSync(path.join(subagentsMetaDir, mf)).mtimeMs;
          if (mst > maxSubMtime) maxSubMtime = mst;
        }
        subagentsDirSig = `${metaFiles.length}:${maxSubMtime}`;
      } catch {}
    }

    const cacheKey = `${filePath}::${cleanInherited}`;
    const cached = this.parseCache.get(cacheKey);
    if (
      cached &&
      cached.mtimeMs === mtimeMs &&
      cached.size === totalBytes &&
      cached.subagentsDirSig === subagentsDirSig
    ) {
      return cached.rawResult;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

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
    let detectedModel = cleanInherited || '';
    const modelLedger = new Map();
    let directBillingTokens = 0;

    const pendingSubagentCalls = [];
    const spawnedSubagentsMap = new Map();
    const repliedSenders = new Set();
    const killedSubagentIds = new Set();
    let hasPlannerResponse = false;
    let lastPlannerHasTools = false;

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

      if (obj.type === 'PLANNER_RESPONSE') {
        hasPlannerResponse = true;
        lastPlannerHasTools = Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0;
      }

      if (Array.isArray(obj.tool_calls)) {
        for (const tc of obj.tool_calls) {
          if (!tc || !tc.name) continue;
          const args = tc.args || tc.arguments || {};
          if (tc.name === 'invoke_subagent') {
            const batchSubagents = this.unwrapToolArg(args.Subagents);
            if (Array.isArray(batchSubagents)) {
              for (const subItem of batchSubagents) {
                if (!subItem || typeof subItem !== 'object') continue;
                pendingSubagentCalls.push({
                  rawModel: subItem.Model,
                  role: String(this.unwrapToolArg(subItem.Role) || '').trim(),
                  typeName: String(this.unwrapToolArg(subItem.TypeName) || 'subagent').trim(),
                  parentModel: activeModel,
                  stepIndex: obj.step_index ?? raw.steps,
                  timestamp: obj.created_at || null
                });
              }
            } else {
              pendingSubagentCalls.push({
                rawModel: args.Model,
                role: String(this.unwrapToolArg(args.Role) || '').trim(),
                typeName: String(this.unwrapToolArg(args.TypeName) || 'subagent').trim(),
                parentModel: activeModel,
                stepIndex: obj.step_index ?? raw.steps,
                timestamp: obj.created_at || null
              });
            }
          } else if (tc.name === 'manage_subagents') {
            const action = String(this.unwrapToolArg(args.Action) || '').toLowerCase();
            if (action === 'kill_all') {
              for (const existingId of spawnedSubagentsMap.keys()) {
                killedSubagentIds.add(existingId);
              }
            } else if (action === 'kill') {
              const ids = this.unwrapToolArg(args.ConversationIds);
              if (Array.isArray(ids)) {
                for (const id of ids) {
                  if (typeof id === 'string') killedSubagentIds.add(id.trim());
                }
              }
            }
          }
        }
      }

      if (
        obj.type === 'GENERIC' &&
        typeof obj.content === 'string' &&
        obj.content.includes('Created the following subagent:')
      ) {
        const idMatch = obj.content.match(/Created the following subagent:[\s\S]*?"conversationId"\s*:\s*"([0-9a-fA-F-]{36})"/);
        if (idMatch && idMatch[1]) {
          const childId = idMatch[1];
          const pending = pendingSubagentCalls.shift() || {
            rawModel: 'inherit',
            role: '',
            typeName: 'subagent',
            parentModel: activeModel,
            stepIndex: obj.step_index ?? raw.steps,
            timestamp: obj.created_at || null
          };
          spawnedSubagentsMap.set(childId, {
            conversationId: childId,
            rawModel: pending.rawModel,
            role: pending.role,
            typeName: pending.typeName || 'subagent',
            parentModel: pending.parentModel || activeModel,
            spawnStepIndex: pending.stepIndex,
            timestamp: pending.timestamp || obj.created_at || null,
            state: 'SUBAGENT_STATE_ALIVE'
          });
        }
      }

      if (typeof obj.content === 'string' && obj.content.includes('sender=')) {
        const senderMatches = obj.content.matchAll(/\bsender=([0-9a-fA-F-]{36})\b/g);
        for (const sm of senderMatches) {
          if (sm[1]) repliedSenders.add(sm[1]);
        }
      }

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

      directBillingTokens += stepBillingTokens;
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

    if (subagentsMetaDir && fs.existsSync(subagentsMetaDir)) {
      try {
        const metaFiles = fs.readdirSync(subagentsMetaDir)
          .filter(f => f.endsWith('.json'))
          .sort();
        for (const mf of metaFiles) {
          try {
            const metaObj = JSON.parse(fs.readFileSync(path.join(subagentsMetaDir, mf), 'utf-8'));
            const cid = metaObj.conversationId || path.basename(mf, '.json');
            if (!cid) continue;
            const existing = spawnedSubagentsMap.get(cid);
            const metaRole = metaObj.subagentDescriptor?.role || '';
            const metaType = metaObj.subagentDescriptor?.typeName || '';
            if (existing) {
              if (metaRole && !existing.role) existing.role = metaRole;
              if (metaType && (!existing.typeName || existing.typeName === 'subagent')) {
                existing.typeName = metaType;
              }
              if (metaObj.state) existing.state = metaObj.state;
              if (metaObj.spawnStepIndex !== undefined) existing.spawnStepIndex = metaObj.spawnStepIndex;
            } else {
              spawnedSubagentsMap.set(cid, {
                conversationId: cid,
                rawModel: 'inherit',
                role: metaRole,
                typeName: metaType || 'subagent',
                parentModel: this.sanitizeModelName(detectedModel) || 'Gemini 3.8 Flash',
                spawnStepIndex: metaObj.spawnStepIndex ?? 0,
                timestamp: null,
                state: metaObj.state || 'SUBAGENT_STATE_ALIVE'
              });
            }
          } catch {}
        }
      } catch {}
    }

    for (const killedId of killedSubagentIds) {
      const entry = spawnedSubagentsMap.get(killedId);
      if (entry) entry.state = 'SUBAGENT_STATE_KILLED';
    }

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

    const rawModelEntries = Array.from(modelLedger.entries()).map(([modelName, data]) => ({
      modelName,
      tokens: data.tokens,
      contextTokens: data.contextTokens
    }));

    const rawResult = {
      estTokens,
      pct,
      displayTokens: this.formatTokens(estTokens),
      sizeKb: Math.round(totalBytes / 1024),
      steps: raw.steps,
      compactions,
      detectedModel: this.sanitizeModelName(detectedModel) || 'Gemini 3.8 Flash',
      directBillingTokens,
      stepEntries,
      rawModelEntries,
      spawnedSubagents: Array.from(spawnedSubagentsMap.values()),
      repliedSenders: Array.from(repliedSenders),
      hasPlannerResponse,
      lastPlannerHasTools,
      breakdown: {
        user: { tokens: userTokens, pct: catPct(userTokens) },
        model: { tokens: modelTokens, pct: catPct(modelTokens) },
        thinking: { tokens: thinkingTokens, pct: catPct(thinkingTokens) },
        tools: { tokens: toolsTokens, pct: catPct(toolsTokens) },
        mcp: { tokens: mcpTokens, pct: catPct(mcpTokens) },
        other: { tokens: otherTokens, pct: catPct(otherTokens) }
      }
    };

    this.parseCache.set(cacheKey, {
      mtimeMs,
      size: totalBytes,
      subagentsDirSig,
      rawResult
    });

    return rawResult;
  }

  /**
   * Recursively resolves the subagent execution tree for a parsed parent transcript.
   * @param {Object} parentRaw
   * @param {string} brainRoot
   * @param {Set<string>} visitedIds
   * @param {number} [depth=0]
   * @returns {Array<Object>}
   */
  _collectSubagentTree(parentRaw, brainRoot, visitedIds, depth = 0) {
    if (!parentRaw || !Array.isArray(parentRaw.spawnedSubagents) || depth > 6) {
      return [];
    }

    const repliedSet = new Set(parentRaw.repliedSenders || []);
    const collected = [];

    for (const spawn of parentRaw.spawnedSubagents) {
      const cid = spawn.conversationId;
      if (!cid || visitedIds.has(cid)) continue;
      visitedIds.add(cid);

      const resolved = this.resolveSubagentModel(spawn.rawModel, spawn.parentModel);
      const childPath = brainRoot ? this.resolveConversationTranscriptPath(cid, brainRoot) : null;
      const childRaw = childPath ? this._parseSingleTranscript(childPath, resolved.modelName) : null;

      const effectiveModel = childRaw && childRaw.detectedModel
        ? childRaw.detectedModel
        : resolved.modelName;
      const childTokens = childRaw ? childRaw.directBillingTokens : 0;
      const childSteps = childRaw ? childRaw.steps : 0;

      let status = 'running';
      if (spawn.state === 'SUBAGENT_STATE_KILLED') {
        status = 'killed';
      } else if (
        repliedSet.has(cid) ||
        (childRaw && childRaw.hasPlannerResponse && !childRaw.lastPlannerHasTools)
      ) {
        status = 'done';
      }

      collected.push({
        conversationId: cid,
        role: spawn.role || spawn.typeName || 'Subagent',
        typeName: spawn.typeName || 'subagent',
        modelName: effectiveModel,
        requestedModel: resolved.requestedModel,
        isInherited: resolved.isInherited,
        tokens: childTokens,
        displayTokens: this.formatTokens(childTokens),
        steps: childSteps,
        status,
        spawnStepIndex: spawn.spawnStepIndex ?? 0,
        depth,
        stepEntries: childRaw ? childRaw.stepEntries : []
      });

      if (childRaw && Array.isArray(childRaw.spawnedSubagents) && childRaw.spawnedSubagents.length > 0) {
        const nested = this._collectSubagentTree(childRaw, brainRoot, visitedIds, depth + 1);
        collected.push(...nested);
      }
    }

    return collected;
  }

  /**
   * Parses a specific transcript JSONL file and resolves any spawned subagents
   * along with their effective models and per-model consumption breakdown.
   * @param {string} filePath
   * @param {Object} [options]
   * @param {string} [options.inheritedModel]
   * @param {string} [options.brainDir]
   * @returns {Object}
   */
  parseTranscriptFile(filePath, options = {}) {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return this.getEmptySnapshot();
      }

      const { convId, brainRoot: inferredBrainRoot } = this.inferConversationPaths(filePath);
      const effectiveBrainRoot = options.brainDir || inferredBrainRoot || this.brainDir;
      const rawParsed = this._parseSingleTranscript(filePath, options.inheritedModel || '');
      if (!rawParsed) {
        return this.getEmptySnapshot();
      }

      const visitedIds = new Set();
      if (convId) visitedIds.add(convId);

      const subagentNodes = this._collectSubagentTree(rawParsed, effectiveBrainRoot, visitedIds, 0);

      const combinedLedger = new Map();
      for (const entry of rawParsed.rawModelEntries) {
        combinedLedger.set(entry.modelName, {
          directTokens: entry.tokens,
          subagentTokens: 0,
          tokens: entry.tokens,
          contextTokens: entry.contextTokens,
          subagents: []
        });
      }

      const combinedStepEntries = [...rawParsed.stepEntries];
      const subagents = [];

      for (const node of subagentNodes) {
        const { stepEntries: childSteps, ...publicSubagent } = node;
        subagents.push(publicSubagent);

        if (Array.isArray(childSteps) && childSteps.length > 0) {
          combinedStepEntries.push(...childSteps);
        }

        if (!combinedLedger.has(publicSubagent.modelName)) {
          combinedLedger.set(publicSubagent.modelName, {
            directTokens: 0,
            subagentTokens: 0,
            tokens: 0,
            contextTokens: 0,
            subagents: []
          });
        }
        const target = combinedLedger.get(publicSubagent.modelName);
        target.subagentTokens += publicSubagent.tokens;
        target.tokens += publicSubagent.tokens;
        target.subagents.push(publicSubagent);
      }

      const chatModels = [];
      for (const [modelName, data] of combinedLedger.entries()) {
        const { family, hasDualLimit, rollingCeiling, weeklyCeiling } = this.classifyModelFamily(modelName);
        const visualMeta = this.resolveModelVisualMeta(modelName);
        const chatRollingPct = hasDualLimit && rollingCeiling > 0
          ? Math.min(100, Math.round((data.tokens / rollingCeiling) * 100))
          : 0;
        const chatWeeklyPct = weeklyCeiling > 0
          ? Math.min(100, Math.round((data.tokens / weeklyCeiling) * 100))
          : 0;

        chatModels.push({
          modelName,
          shortName: visualMeta.shortName,
          color: visualMeta.color,
          poolId: visualMeta.poolId,
          poolLabel: visualMeta.poolLabel,
          family,
          hasDualLimit,
          directTokens: data.directTokens,
          subagentTokens: data.subagentTokens,
          tokens: data.tokens,
          contextTokens: data.contextTokens,
          displayTokens: this.formatTokens(data.tokens),
          chatRollingPct,
          chatWeeklyPct,
          subagentCount: data.subagents.length,
          subagents: data.subagents
        });
      }

      const modelQuota = this.resolveModelQuota(rawParsed.detectedModel, combinedStepEntries, chatModels);

      return JSON.parse(JSON.stringify({
        estTokens: rawParsed.estTokens,
        pct: rawParsed.pct,
        displayTokens: rawParsed.displayTokens,
        sizeKb: rawParsed.sizeKb,
        steps: rawParsed.steps,
        compactions: rawParsed.compactions,
        detectedModel: rawParsed.detectedModel,
        directStepEntries: rawParsed.stepEntries,
        stepEntries: combinedStepEntries,
        chatModels,
        waffleCells: this.buildWaffleCells(rawParsed.estTokens, rawParsed.breakdown),
        poolsSummary: this.buildPoolsSummary(chatModels),
        subagents,
        modelQuota,
        breakdown: rawParsed.breakdown
      }));
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
  resolveModelQuota(detectedModel = '', stepEntries = [], chatModels = [], nativeQuotaGroups = null) {
    const activeModel = this.sanitizeModelName(detectedModel) || 'Gemini 3.8 Flash';
    const now = Date.now();

    if (Array.isArray(nativeQuotaGroups) && nativeQuotaGroups.length > 0) {
      const nativeQuota = resolveNativeQuotaForModel(nativeQuotaGroups, activeModel, now);
      if (nativeQuota) {
        const activeChatModel = chatModels.find(m => m.modelName === activeModel)
          || chatModels.find(m => m.family === nativeQuota.family);
        nativeQuota.chatWeeklyPct = activeChatModel ? activeChatModel.chatWeeklyPct : 0;
        nativeQuota.chatRollingPct = activeChatModel ? activeChatModel.chatRollingPct : 0;
        nativeQuota.chatUsedPct = activeChatModel ? activeChatModel.chatWeeklyPct : 0;
        return nativeQuota;
      }
    }

    const { family, hasDualLimit, rollingCeiling, weeklyCeiling } = this.classifyModelFamily(activeModel);
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
      const inheritedModelByConv = new Map();

      // First pass: discover parent -> subagent model inheritance across active conversations
      for (const item of activeDirs) {
        const raw = this._parseSingleTranscript(item.targetPath, inheritedModelByConv.get(item.id) || '');
        if (!raw || !Array.isArray(raw.spawnedSubagents)) continue;
        for (const spawn of raw.spawnedSubagents) {
          if (!spawn.conversationId) continue;
          const resolved = this.resolveSubagentModel(spawn.rawModel, spawn.parentModel || raw.detectedModel);
          if (!inheritedModelByConv.has(spawn.conversationId)) {
            inheritedModelByConv.set(spawn.conversationId, resolved.modelName);
          }
        }
      }

      // Propagate multi-level inheritance (e.g. coordinator -> worker subagents)
      for (const item of activeDirs) {
        const inherited = inheritedModelByConv.get(item.id);
        if (!inherited) continue;
        const raw = this._parseSingleTranscript(item.targetPath, inherited);
        if (!raw || !Array.isArray(raw.spawnedSubagents)) continue;
        for (const spawn of raw.spawnedSubagents) {
          if (!spawn.conversationId) continue;
          const resolved = this.resolveSubagentModel(spawn.rawModel, spawn.parentModel || raw.detectedModel);
          inheritedModelByConv.set(spawn.conversationId, resolved.modelName);
        }
      }

      const countedConvIds = new Set();
      const globalStepEntries = [];

      for (const item of activeDirs) {
        const snapshot = this.parseTranscriptFile(item.targetPath, {
          inheritedModel: inheritedModelByConv.get(item.id) || '',
          brainDir: this.brainDir
        });
        metrics[item.id] = snapshot;

        if (!countedConvIds.has(item.id)) {
          countedConvIds.add(item.id);
          if (Array.isArray(snapshot.directStepEntries)) {
            globalStepEntries.push(...snapshot.directStepEntries);
          }
        }

        if (Array.isArray(snapshot.subagents)) {
          for (const sub of snapshot.subagents) {
            if (!sub.conversationId || countedConvIds.has(sub.conversationId)) continue;
            countedConvIds.add(sub.conversationId);
            const subPath = this.resolveConversationTranscriptPath(sub.conversationId, this.brainDir);
            const subRaw = subPath ? this._parseSingleTranscript(subPath, sub.modelName) : null;
            if (subRaw && Array.isArray(subRaw.stepEntries)) {
              globalStepEntries.push(...subRaw.stepEntries);
            }
          }
        }
      }

      // Re-resolve account-wide quota using deduplicated global steps across active chats & subagents
      for (const id of Object.keys(metrics)) {
        const snap = metrics[id];
        snap.modelQuota = this.resolveModelQuota(
          snap.detectedModel,
          globalStepEntries,
          snap.chatModels
        );
        delete snap.stepEntries;
        delete snap.directStepEntries;
      }
    } catch {
      // Gracefully prevent background hook crashes
    }
    return metrics;
  }

  /**
   * Resolves list API pricing ($ per 1M input/output tokens) and canonical base name for Pit Wall analytics.
   * @param {string} [modelName='']
   * @returns {{ baseName: string, compactName: string, packId: string, packLabel: string, packColor: string, inputPerM: number, cacheReadPerM: number, outputPerM: number }}
   */
  resolveModelPricing(modelName = '') {
    const cleaned = this.sanitizeModelName(modelName) || 'Gemini 3.8 Flash';
    const lower = cleaned.toLowerCase();

    let baseName = '';
    let compactName = '';
    let packId = 'other';
    let packLabel = 'Otros';
    let packColor = '#94a3b8';
    let inputPerM = 1.25;
    let outputPerM = 5;

    if (/orchestrator/i.test(lower)) {
      packId = 'orchestrators';
      packLabel = 'Orquestadores';
      packColor = '#38bdf8';
      inputPerM = 10;
      outputPerM = 40;
      if (/neon/i.test(lower)) {
        baseName = 'Orchestrator (Neon)';
        compactName = 'Neon';
      } else {
        baseName = 'Orchestrator (Argon)';
        compactName = 'Argon';
      }
    } else if (/opus/i.test(lower)) {
      baseName = 'Claude Opus 5.5';
      compactName = 'Opus 5.5';
      packId = 'claude';
      packLabel = 'Claude';
      packColor = '#c084fc';
      inputPerM = 15;
      outputPerM = 75;
    } else if (/sonnet/i.test(lower)) {
      baseName = 'Claude Sonnet 5.5';
      compactName = 'Sonnet 5.5';
      packId = 'claude';
      packLabel = 'Claude';
      packColor = '#c084fc';
      inputPerM = 3;
      outputPerM = 15;
    } else if (/argon/i.test(lower)) {
      baseName = 'Gemini 4 Argon';
      compactName = '4 Argon';
      packId = 'gemini';
      packLabel = 'Gemini';
      packColor = '#a3e635';
      inputPerM = 15;
      outputPerM = 75;
    } else if (/neon/i.test(lower)) {
      baseName = 'Gemini 4 Neon';
      compactName = '4 Neon';
      packId = 'gemini';
      packLabel = 'Gemini';
      packColor = '#a3e635';
      inputPerM = 10;
      outputPerM = 40;
    } else if (/hydrogen/i.test(lower)) {
      baseName = 'Gemini 4 Hydrogen';
      compactName = '4 Hydrogen';
      packId = 'gemini';
      packLabel = 'Gemini';
      packColor = '#a3e635';
      inputPerM = 3;
      outputPerM = 15;
    } else if (/gpt-oss|120b/i.test(lower)) {
      baseName = 'GPT-OSS 120B';
      compactName = 'GPT-OSS 120B';
      packId = 'openai-oss';
      packLabel = 'OpenAI OSS';
      packColor = '#f472b6';
      inputPerM = 2;
      outputPerM = 8;
    } else if (/flash/i.test(lower)) {
      baseName = 'Gemini 3.8 Flash';
      compactName = '3.8 Flash';
      packId = 'gemini';
      packLabel = 'Gemini';
      packColor = '#a3e635';
      inputPerM = 1.25;
      outputPerM = 5;
    } else {
      baseName = cleaned
        .replace(/\s*\((?:Low|Medium|Med|High|XHigh|Minimal|Max|Standard)\)\s*$/i, '')
        .trim() || cleaned;
      compactName = baseName;
      packId = 'other';
      packLabel = 'Otros';
      packColor = '#94a3b8';
      inputPerM = 1.25;
      outputPerM = 5;
    }

    const cacheReadPerM = Number((inputPerM * 0.1).toFixed(4));
    return { baseName, compactName, packId, packLabel, packColor, inputPerM, cacheReadPerM, outputPerM };
  }

  /**
   * Aggregates all-time Pit Wall metrics (stretches, hours worked, day streaks, consistency heatmap,
   * and API price cost estimates across every conversation in brainDir).
   * @param {Object} [options={}]
   * @param {boolean} [options.bypassCache=false]
   * @param {number} [options.now=Date.now()]
   * @returns {Object}
   */
  getPitWallMetrics(options = {}) {
    const now = options.now ?? Date.now();
    if (!options.bypassCache && this.pitWallCache.data && (now - this.pitWallCache.ts) < 15_000) {
      return this.pitWallCache.data;
    }

    const pad2 = (n) => String(n).padStart(2, '0');
    const toLocalDateKey = (ms) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    };
    const monthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthsLong = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const daysShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const formatShortDate = (ms) => {
      const d = new Date(ms);
      return `${monthsShort[d.getMonth()]} ${d.getDate()}`;
    };
    const formatLongDate = (ms) => {
      const d = new Date(ms);
      return `${d.getDate()} de ${monthsLong[d.getMonth()]} de ${d.getFullYear()}`;
    };
    const formatFullDate = (ms) => {
      const d = new Date(ms);
      return `${daysShort[d.getDay()]}, ${d.getDate()} ${monthsShort[d.getMonth()]} ${d.getFullYear()}`;
    };
    const formatDuration = (hours) => {
      const totalMins = Math.max(0, Math.round((Number(hours) || 0) * 60));
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      if (h > 0 && m > 0) return `${h}h ${m}m`;
      if (h > 0) return `${h}h`;
      return `${m}m`;
    };
    const formatStretchStart = (ms) => {
      const d = new Date(ms);
      return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    };
    const formatBigTokens = (n) => {
      const num = Number(n) || 0;
      if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
      if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
      if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
      return String(Math.round(num));
    };
    const formatUsd = (val) => `$${Math.round(val || 0).toLocaleString('en-US')}`;
    const formatExactUsd = (val) => '$' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const allTimestamps = [];
    const dailyCostMap = new Map();
    const dailyHoursMap = new Map();
    const daySessionsMap = new Map();
    const modelStatsMap = new Map();
    let totalTokens = 0;
    let writtenTokens = 0;
    let totalUncachedInputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCostUsd = 0;
    let totalSessions = 0;

    try {
      if (fs.existsSync(this.brainDir)) {
        const dirs = fs.readdirSync(this.brainDir)
          .filter(d => /^[0-9a-fA-F-]{8,}$/.test(d))
          .map(d => {
            const logsDir = path.join(this.brainDir, d, '.system_generated', 'logs');
            const compactPath = path.join(logsDir, 'transcript.jsonl');
            const fullPath = path.join(logsDir, 'transcript_full.jsonl');
            let targetPath = '';
            let mtimeMs = 0;
            let size = 0;
            try {
              if (fs.existsSync(compactPath)) {
                const st = fs.statSync(compactPath);
                targetPath = compactPath;
                mtimeMs = st.mtimeMs;
                size = st.size;
              } else if (fs.existsSync(fullPath)) {
                const st = fs.statSync(fullPath);
                targetPath = fullPath;
                mtimeMs = st.mtimeMs;
                size = st.size;
              }
            } catch {}
            return { id: d, targetPath, mtimeMs, size };
          })
          .filter(item => item.targetPath && item.size > 0)
          .sort((a, b) => b.mtimeMs - a.mtimeMs);

        totalSessions = dirs.length;

        for (const item of dirs) {
          let summary;
          const cached = this.pitWallFileCache.get(item.targetPath);
          if (cached && cached.mtimeMs === item.mtimeMs && cached.size === item.size) {
            summary = cached.summary;
          } else {
            summary = this._parseTranscriptForPitWall(item.targetPath, toLocalDateKey);
            this.pitWallFileCache.set(item.targetPath, { mtimeMs: item.mtimeMs, size: item.size, summary });
          }

          if (!summary) continue;
          totalTokens += summary.totalTokens || 0;
          writtenTokens += summary.writtenTokens || 0;
          totalUncachedInputTokens += summary.totalUncachedInputTokens || 0;
          totalCacheReadTokens += summary.totalCacheReadTokens || 0;
          totalCostUsd += summary.totalCostUsd || 0;

          for (const ts of summary.timestamps) {
            allTimestamps.push(ts);
          }

          const sessionDays = summary.sessionDays || Object.keys(summary.dailyStats || summary.dailyCosts || {});
          for (const dayKey of sessionDays) {
            daySessionsMap.set(dayKey, (daySessionsMap.get(dayKey) || 0) + 1);
          }

          const statsToIterate = summary.dailyStats || summary.dailyCosts || {};
          for (const [dayKey, dStat] of Object.entries(statsToIterate)) {
            if (!dailyCostMap.has(dayKey)) {
              dailyCostMap.set(dayKey, {
                mainCostUsd: 0,
                bgCostUsd: 0,
                totalCostUsd: 0,
                tokens: 0,
                uncachedInput: 0,
                cacheRead: 0,
                output: 0
              });
            }
            const dc = dailyCostMap.get(dayKey);
            dc.mainCostUsd += dStat.mainCostUsd || 0;
            dc.bgCostUsd += dStat.bgCostUsd || 0;
            dc.totalCostUsd += (dStat.mainCostUsd || 0) + (dStat.bgCostUsd || 0);
            dc.tokens += dStat.tokens || 0;
            dc.uncachedInput += dStat.uncachedInput || 0;
            dc.cacheRead += dStat.cacheRead || 0;
            dc.output += dStat.output || 0;
          }

          if (summary.modelStats) {
            for (const [mName, mStat] of Object.entries(summary.modelStats)) {
              if (!modelStatsMap.has(mName)) {
                modelStatsMap.set(mName, {
                  costUsd: 0,
                  tokens: 0,
                  uncachedInput: 0,
                  cacheRead: 0,
                  output: 0,
                  packId: mStat.packId,
                  packLabel: mStat.packLabel,
                  packColor: mStat.packColor,
                  compactName: mStat.compactName,
                  inputPerM: mStat.inputPerM,
                  cacheReadPerM: mStat.cacheReadPerM,
                  outputPerM: mStat.outputPerM
                });
              }
              const ms = modelStatsMap.get(mName);
              ms.costUsd += mStat.costUsd || 0;
              ms.tokens += mStat.tokens || 0;
              ms.uncachedInput += mStat.uncachedInput || 0;
              ms.cacheRead += mStat.cacheRead || 0;
              ms.output += mStat.output || 0;
            }
          } else if (summary.modelCosts) {
            for (const [mName, mCost] of Object.entries(summary.modelCosts)) {
              if (!modelStatsMap.has(mName)) {
                const pricing = this.resolveModelPricing(mName);
                modelStatsMap.set(mName, {
                  costUsd: 0,
                  tokens: 0,
                  uncachedInput: 0,
                  cacheRead: 0,
                  output: 0,
                  packId: pricing.packId,
                  packLabel: pricing.packLabel,
                  packColor: pricing.packColor,
                  compactName: pricing.compactName,
                  inputPerM: pricing.inputPerM,
                  cacheReadPerM: pricing.cacheReadPerM,
                  outputPerM: pricing.outputPerM
                });
              }
              modelStatsMap.get(mName).costUsd += mCost;
            }
          }
        }
      }
    } catch {
      // Keep graceful empty metrics
    }

    // Merge global timestamps across sessions into contiguous stretches (gap <= 20 minutes)
    const GAP_MS = 20 * 60 * 1000;
    const MIN_EVENT_MS = 2.5 * 60 * 1000;
    allTimestamps.sort((a, b) => a - b);

    const intervals = [];
    if (allTimestamps.length > 0) {
      let curStart = allTimestamps[0];
      let curEnd = allTimestamps[0];
      for (let i = 1; i < allTimestamps.length; i++) {
        const ts = allTimestamps[i];
        if (ts - curEnd <= GAP_MS) {
          curEnd = ts;
        } else {
          intervals.push({ start: curStart, end: Math.max(curEnd, curStart + MIN_EVENT_MS) });
          curStart = ts;
          curEnd = ts;
        }
      }
      intervals.push({ start: curStart, end: Math.max(curEnd, curStart + MIN_EVENT_MS) });
    }

    let totalDurationMs = 0;
    for (const iv of intervals) {
      const dur = Math.max(MIN_EVENT_MS, iv.end - iv.start);
      totalDurationMs += dur;

      // Distribute interval duration across local calendar days it touches
      let cursor = iv.start;
      const effectiveEnd = iv.start + dur;
      while (cursor < effectiveEnd) {
        const d = new Date(cursor);
        const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const sliceEnd = Math.min(effectiveEnd, nextMidnight);
        const dayKey = toLocalDateKey(cursor);
        dailyHoursMap.set(dayKey, (dailyHoursMap.get(dayKey) || 0) + ((sliceEnd - cursor) / 3_600_000));
        cursor = sliceEnd;
      }
    }

    const totalHours = Number((totalDurationMs / 3_600_000).toFixed(1));
    const lastInterval = intervals.length > 0 ? intervals[intervals.length - 1] : null;
    const currentStretchHours = lastInterval
      ? Number(((lastInterval.end - lastInterval.start) / 3_600_000).toFixed(1))
      : 0;
    const isStretchActive = lastInterval ? (now - lastInterval.end) <= GAP_MS : false;
    const currentStretchSub = lastInterval
      ? `${isStretchActive ? 'activo, desde' : 'último bloque'} ${formatStretchStart(lastInterval.start)}`
      : 'sin actividad reciente';

    const activeDayKeys = Array.from(new Set([
      ...Array.from(dailyHoursMap.keys()),
      ...Array.from(dailyCostMap.keys())
    ])).sort();

    const activeDaysCount = activeDayKeys.length;
    const avgHoursPerDay = activeDaysCount > 0 ? Number((totalHours / activeDaysCount).toFixed(1)) : 0;
    const firstSessionDate = allTimestamps.length > 0 ? formatLongDate(allTimestamps[0]) : formatLongDate(now);

    // Day streaks (best run & current streak up to today/yesterday)
    const activeSet = new Set(activeDayKeys);
    let bestStreak = 0;
    let runStreak = 0;
    if (activeDayKeys.length > 0) {
      let prevDayMs = null;
      for (const dk of activeDayKeys) {
        const [yy, mm, dd] = dk.split('-').map(Number);
        const dayMs = new Date(yy, mm - 1, dd).getTime();
        if (prevDayMs !== null && Math.round((dayMs - prevDayMs) / 86_400_000) === 1) {
          runStreak++;
        } else {
          runStreak = 1;
        }
        if (runStreak > bestStreak) bestStreak = runStreak;
        prevDayMs = dayMs;
      }
    }

    let currentStreak = 0;
    const todayDate = new Date(now);
    let checkDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    if (!activeSet.has(toLocalDateKey(checkDate.getTime()))) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (activeSet.has(toLocalDateKey(checkDate.getTime()))) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Last 60 days series
    const last60Days = [];
    const todayStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    for (let i = 59; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const ms = d.getTime();
      const key = toLocalDateKey(ms);
      const hrs = Number((dailyHoursMap.get(key) || 0).toFixed(4));
      const costObj = dailyCostMap.get(key) || {
        mainCostUsd: 0,
        bgCostUsd: 0,
        totalCostUsd: 0,
        tokens: 0,
        uncachedInput: 0,
        cacheRead: 0,
        output: 0
      };
      last60Days.push({
        date: key,
        label: formatShortDate(ms),
        fullDate: formatFullDate(ms),
        hours: hrs,
        durationLabel: formatDuration(hrs),
        sessions: daySessionsMap.get(key) || 0,
        tokens: costObj.tokens || 0,
        uncachedInput: costObj.uncachedInput || 0,
        cacheRead: costObj.cacheRead || 0,
        output: costObj.output || 0,
        mainCostUsd: Number(costObj.mainCostUsd.toFixed(2)),
        bgCostUsd: Number(costObj.bgCostUsd.toFixed(2)),
        totalCostUsd: Number(costObj.totalCostUsd.toFixed(2))
      });
    }

    // Consistency heatmap grid (last 20 weeks, Monday..Sunday)
    const numWeeks = 20;
    const todayDowMon0 = (todayStart.getDay() + 6) % 7; // Mon=0 .. Sun=6
    const currentWeekMon = new Date(todayStart);
    currentWeekMon.setDate(currentWeekMon.getDate() - todayDowMon0);
    const firstWeekMon = new Date(currentWeekMon);
    firstWeekMon.setDate(firstWeekMon.getDate() - ((numWeeks - 1) * 7));

    const consistencyWeeks = [];
    let lastMonthSeen = -1;
    for (let w = 0; w < numWeeks; w++) {
      const weekMon = new Date(firstWeekMon);
      weekMon.setDate(weekMon.getDate() + w * 7);
      const mIdx = weekMon.getMonth();
      const monthLabel = mIdx !== lastMonthSeen ? monthsShort[mIdx] : '';
      lastMonthSeen = mIdx;

      const days = [];
      for (let dow = 0; dow < 7; dow++) {
        const cellDate = new Date(weekMon);
        cellDate.setDate(cellDate.getDate() + dow);
        const ms = cellDate.getTime();
        const isFuture = ms > todayStart.getTime();
        const key = toLocalDateKey(ms);
        const hrsRaw = isFuture ? 0 : (dailyHoursMap.get(key) || 0);
        const hours = isFuture ? 0 : Number(hrsRaw.toFixed(2));
        const costObj = isFuture ? null : dailyCostMap.get(key);
        let level = 0;
        if (!isFuture && hours > 0) {
          if (hours > 6) level = 4;
          else if (hours > 3) level = 3;
          else if (hours > 1) level = 2;
          else level = 1;
        }
        days.push({
          date: key,
          fullDate: formatFullDate(ms),
          hours,
          durationLabel: formatDuration(hrsRaw),
          sessions: isFuture ? 0 : (daySessionsMap.get(key) || 0),
          tokens: costObj ? (costObj.tokens || 0) : 0,
          totalCostUsd: costObj ? Number(costObj.totalCostUsd.toFixed(2)) : 0,
          level,
          isFuture
        });
      }
      consistencyWeeks.push({ monthLabel, days });
    }

    // Cost by model sorted descending (up to 10 models with spend > 0)
    const sortedModels = Array.from(modelStatsMap.entries())
      .map(([name, entry]) => ({ name, ...entry }))
      .filter(e => e.costUsd > 0)
      .sort((a, b) => b.costUsd - a.costUsd);

    const modelsToUse = sortedModels.length > 0
      ? sortedModels
      : Array.from(modelStatsMap.entries()).map(([name, entry]) => ({ name, ...entry })).sort((a, b) => b.costUsd - a.costUsd);

    const maxModelCost = modelsToUse.length > 0 ? Math.max(0.0001, modelsToUse[0].costUsd) : 1;
    const costByModel = modelsToUse.slice(0, 10).map((entry, idx) => {
      const pricing = this.resolveModelPricing(entry.name);
      return {
        name: entry.name,
        compactName: entry.compactName || pricing.compactName,
        packId: entry.packId || pricing.packId,
        packLabel: entry.packLabel || pricing.packLabel,
        packColor: entry.packColor || pricing.packColor,
        costUsd: Math.round(entry.costUsd),
        exactCostUsd: Number(entry.costUsd.toFixed(2)),
        displayCost: entry.costUsd > 0 && entry.costUsd < 10 ? formatExactUsd(entry.costUsd) : formatUsd(entry.costUsd),
        exactDisplayCost: formatExactUsd(entry.costUsd),
        pctOfTotal: Number(((entry.costUsd / Math.max(0.0001, totalCostUsd)) * 100).toFixed(1)),
        pctOfMax: Math.max(2, Math.round((entry.costUsd / maxModelCost) * 100)),
        tokens: entry.tokens || 0,
        uncachedInput: entry.uncachedInput || 0,
        cacheRead: entry.cacheRead || 0,
        output: entry.output || 0,
        inputPerM: entry.inputPerM ?? pricing.inputPerM,
        cacheReadPerM: entry.cacheReadPerM ?? pricing.cacheReadPerM,
        outputPerM: entry.outputPerM ?? pricing.outputPerM,
        isTop: idx === 0
      };
    });

    // Group models by 4 Planner packages (costByModelPacks)
    const packsMap = new Map();
    for (const m of costByModel) {
      const pId = m.packId || 'other';
      if (!packsMap.has(pId)) {
        packsMap.set(pId, {
          packId: pId,
          packLabel: m.packLabel || 'Otros',
          packColor: m.packColor || '#94a3b8',
          costUsd: 0,
          exactCostUsd: 0,
          tokens: 0,
          uncachedInput: 0,
          cacheRead: 0,
          output: 0,
          modelCount: 0,
          models: []
        });
      }
      const p = packsMap.get(pId);
      p.costUsd += m.costUsd || 0;
      p.exactCostUsd = Number((p.exactCostUsd + (m.exactCostUsd || 0)).toFixed(2));
      p.tokens += m.tokens || 0;
      p.uncachedInput += m.uncachedInput || 0;
      p.cacheRead += m.cacheRead || 0;
      p.output += m.output || 0;
      p.modelCount++;
      p.models.push(m);
    }

    const sortedPacks = Array.from(packsMap.values()).sort((a, b) => b.exactCostUsd - a.exactCostUsd);
    const maxPackCost = sortedPacks.length > 0 ? Math.max(0.0001, sortedPacks[0].exactCostUsd) : 1;
    const costByModelPacks = sortedPacks.map(p => {
      p.models.sort((a, b) => (b.exactCostUsd || 0) - (a.exactCostUsd || 0));
      return {
        ...p,
        displayCost: p.exactCostUsd > 0 && p.exactCostUsd < 10 ? formatExactUsd(p.exactCostUsd) : formatUsd(p.exactCostUsd),
        exactDisplayCost: formatExactUsd(p.exactCostUsd),
        pctOfTotal: Number(((p.exactCostUsd / Math.max(0.0001, totalCostUsd)) * 100).toFixed(1)),
        pctOfMax: Math.max(2, Math.round((p.exactCostUsd / maxPackCost) * 100))
      };
    });

    const result = {
      currentStreak,
      bestStreak,
      totalHours,
      exactTotalHours: Number((totalDurationMs / 3_600_000).toFixed(4)),
      exactTotalDurationLabel: formatDuration(totalDurationMs / 3_600_000),
      activeDaysCount,
      firstSessionDate,
      avgHoursPerDay,
      currentStretchHours,
      exactCurrentStretchDurationLabel: formatDuration(lastInterval ? (lastInterval.end - lastInterval.start) / 3_600_000 : 0),
      currentStretchSub,
      isStretchActive,
      totalCostUsd: Math.round(totalCostUsd),
      exactTotalCostUsd: Number(totalCostUsd.toFixed(2)),
      displayTotalCost: formatUsd(totalCostUsd),
      exactDisplayTotalCost: formatExactUsd(totalCostUsd),
      totalTokens,
      uncachedInputTokens: totalUncachedInputTokens,
      cacheReadTokens: totalCacheReadTokens,
      displayTotalTokens: formatBigTokens(totalTokens),
      writtenTokens,
      displayWrittenTokens: formatBigTokens(writtenTokens),
      totalSessions,
      last60Days,
      consistencyWeeks,
      costByModel,
      costByModelPacks,
      updatedAt: now
    };

    this.pitWallCache = { ts: now, data: result };
    return result;
  }

  /**
   * Parses a single transcript into compact Pit Wall timeline & cost aggregates for caching.
   * @private
   */
  _parseTranscriptForPitWall(filePath, toLocalDateKey) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const parsedLines = [];

      let hasExactTokenTelemetry = false;
      let firstFromModel = '';
      let firstObjModel = '';

      // Pass 1: Parse JSON and detect exact telemetry capability and initial model
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        parsedLines.push({ obj, rawLine });

        if (obj.input_tokens !== undefined || obj.output_tokens !== undefined) {
          hasExactTokenTelemetry = true;
        }

        if (!firstFromModel) {
          const { fromModel } = this.extractModelSelectionChange(obj.content);
          if (fromModel) {
            firstFromModel = fromModel;
          }
        }

        if (!firstObjModel && typeof obj.model === 'string' && obj.model.trim()) {
          const sanitized = this.sanitizeModelName(obj.model);
          if (this.isValidModelName(sanitized)) {
            firstObjModel = sanitized;
          }
        }
      }

      const initialModel = (firstFromModel && this.isValidModelName(firstFromModel))
        ? firstFromModel
        : ((firstObjModel && this.isValidModelName(firstObjModel)) ? firstObjModel : 'Gemini 3.8 Flash');

      // Pass 2: Aggregate timestamps, tokens, and pricing with model state tracking
      const timestamps = [];
      const sessionDays = new Set();
      const dailyCosts = {};
      const dailyStats = {};
      const modelCosts = {};
      const modelStats = {};
      let totalUncachedInputTokens = 0;
      let totalCacheReadTokens = 0;
      let totalTokens = 0;
      let writtenTokens = 0;
      let totalCostUsd = 0;
      let detectedModel = initialModel;
      let subagentWindowSteps = 0;

      for (const { obj, rawLine } of parsedLines) {
        const { toModel } = this.extractModelSelectionChange(obj.content);
        if (toModel) {
          detectedModel = toModel;
        }

        if (typeof obj.model === 'string' && obj.model.trim()) {
          const sanitized = this.sanitizeModelName(obj.model);
          if (this.isValidModelName(sanitized)) {
            detectedModel = sanitized;
          }
        }

        const activeModel = (this.isValidModelName(detectedModel) ? this.sanitizeModelName(detectedModel) : '') || 'Gemini 3.8 Flash';
        const pricing = this.resolveModelPricing(activeModel);

        let tsMs = obj.created_at ? Date.parse(obj.created_at) : NaN;
        if (!Number.isFinite(tsMs)) {
          tsMs = 0;
        } else {
          timestamps.push(tsMs);
        }

        let uncachedInputTok = 0;
        let cacheReadTok = 0;
        let outputTok = 0;

        if (obj.input_tokens !== undefined || obj.output_tokens !== undefined) {
          uncachedInputTok = Number(obj.input_tokens) || 0;
          cacheReadTok = Number(obj.cache_read_tokens) || 0;
          outputTok = Number(obj.output_tokens) || 0;
        } else if (!hasExactTokenTelemetry) {
          const thinkingLen = typeof obj.thinking === 'string' ? obj.thinking.length : 0;
          const contentLen = typeof obj.content === 'string' ? obj.content.length : 0;
          const toolCallsLen = obj.tool_calls ? JSON.stringify(obj.tool_calls).length : 0;
          const approx = Math.round(Math.max(rawLine.length, contentLen + thinkingLen + toolCallsLen) / this.charsPerToken);
          if (obj.type === 'PLANNER_RESPONSE') {
            outputTok = approx;
          } else {
            uncachedInputTok = approx;
          }
        } else {
          uncachedInputTok = 0;
          cacheReadTok = 0;
          outputTok = 0;
        }

        const stepTokens = uncachedInputTok + cacheReadTok + outputTok;
        const stepCost = ((uncachedInputTok / 1e6) * pricing.inputPerM) +
          ((cacheReadTok / 1e6) * pricing.cacheReadPerM) +
          ((outputTok / 1e6) * pricing.outputPerM);

        totalUncachedInputTokens += uncachedInputTok;
        totalCacheReadTokens += cacheReadTok;
        totalTokens += stepTokens;
        writtenTokens += outputTok;
        totalCostUsd += stepCost;

        let isBackground = subagentWindowSteps > 0;
        if (Array.isArray(obj.tool_calls) && obj.tool_calls.some(tc => tc.name === 'invoke_subagent' || tc.name === 'swarm')) {
          isBackground = true;
          subagentWindowSteps = 2;
        } else if (subagentWindowSteps > 0) {
          subagentWindowSteps--;
        }

        if (tsMs > 0) {
          const dayKey = toLocalDateKey(tsMs);
          sessionDays.add(dayKey);

          if (!dailyStats[dayKey]) {
            dailyStats[dayKey] = {
              mainCostUsd: 0,
              bgCostUsd: 0,
              totalCostUsd: 0,
              tokens: 0,
              uncachedInput: 0,
              cacheRead: 0,
              output: 0
            };
          }
          const ds = dailyStats[dayKey];
          if (isBackground) {
            ds.bgCostUsd += stepCost;
          } else {
            ds.mainCostUsd += stepCost;
          }
          ds.totalCostUsd = ds.mainCostUsd + ds.bgCostUsd;
          ds.tokens += stepTokens;
          ds.uncachedInput += uncachedInputTok;
          ds.cacheRead += cacheReadTok;
          ds.output += outputTok;

          if (!dailyCosts[dayKey]) {
            dailyCosts[dayKey] = { mainCostUsd: 0, bgCostUsd: 0 };
          }
          if (isBackground) {
            dailyCosts[dayKey].bgCostUsd += stepCost;
          } else {
            dailyCosts[dayKey].mainCostUsd += stepCost;
          }
        }

        if (!modelStats[pricing.baseName]) {
          modelStats[pricing.baseName] = {
            costUsd: 0,
            tokens: 0,
            uncachedInput: 0,
            cacheRead: 0,
            output: 0,
            packId: pricing.packId,
            packLabel: pricing.packLabel,
            packColor: pricing.packColor,
            compactName: pricing.compactName,
            inputPerM: pricing.inputPerM,
            cacheReadPerM: pricing.cacheReadPerM,
            outputPerM: pricing.outputPerM
          };
        }
        const ms = modelStats[pricing.baseName];
        ms.costUsd += stepCost;
        ms.tokens += stepTokens;
        ms.uncachedInput += uncachedInputTok;
        ms.cacheRead += cacheReadTok;
        ms.output += outputTok;

        modelCosts[pricing.baseName] = (modelCosts[pricing.baseName] || 0) + stepCost;
      }

      return {
        timestamps,
        sessionDays: Array.from(sessionDays),
        dailyCosts,
        dailyStats,
        modelCosts,
        modelStats,
        totalUncachedInputTokens,
        totalCacheReadTokens,
        totalTokens,
        writtenTokens,
        totalCostUsd
      };
    } catch {
      return null;
    }
  }
}

/**
 * Formats an ISO reset timestamp or remaining milliseconds into a human-readable countdown string.
 * @param {string|number|Date} [resetTimeIso]
 * @param {number} [now=Date.now()]
 * @returns {string}
 */
export function formatResetTime(resetTimeIso, now = Date.now()) {
  if (!resetTimeIso) return '7d';
  const resetMs = typeof resetTimeIso === 'number'
    ? resetTimeIso
    : new Date(resetTimeIso).getTime();
  if (isNaN(resetMs)) return '7d';

  const diffMs = resetMs - now;
  if (diffMs <= 0) return '<1m';

  const totalMins = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (mins > 0) {
    return `${mins}m`;
  }
  return '<1m';
}

/**
 * Resolves accurate native quota metrics for a target model from RetrieveUserQuotaSummary groups.
 * @param {Array<Object>} groups
 * @param {string} [activeModelName='']
 * @param {number} [now=Date.now()]
 * @returns {Object|null}
 */
export function resolveNativeQuotaForModel(groups, activeModelName = '', now = Date.now()) {
  if (!Array.isArray(groups) || groups.length === 0) return null;

  const getResetTime = (time, fallback) => {
    if (!time) return fallback;
    if (typeof formatResetTime === 'function') return formatResetTime(time, now);
    if (typeof window !== 'undefined' && typeof window.__formatResetTime === 'function') {
      return window.__formatResetTime(time, now);
    }
    return fallback;
  };

  const modelLower = (activeModelName || '').toLowerCase();
  const isArgon = /argon/i.test(modelLower);
  const isClaudeOrGpt = /claude|gpt|opus|sonnet/i.test(modelLower);

  let targetGroup = null;
  if (isArgon) {
    targetGroup = groups.find(g => /argon/i.test(g.displayName || '') || /argon/i.test(g.description || ''));
  } else if (isClaudeOrGpt) {
    targetGroup = groups.find(g => /claude|gpt/i.test(g.displayName || '') || /claude|gpt/i.test(g.description || ''));
  } else {
    targetGroup = groups.find(g => /gemini/i.test(g.displayName || '') && !/argon/i.test(g.displayName || ''));
  }

  if (!targetGroup && groups.length > 0) {
    targetGroup = groups[0];
  }
  if (!targetGroup || !Array.isArray(targetGroup.buckets)) return null;

  const buckets = targetGroup.buckets;
  const weeklyBucket = buckets.find(b => b.window === 'weekly' || /weekly/i.test(b.displayName || '') || /weekly/i.test(b.bucketId || ''));
  const rollingBucket = buckets.find(b => b.window === '5h' || /5h|five hour/i.test(b.displayName || '') || /5h/i.test(b.bucketId || ''));

  if (isArgon) {
    const weeklyFraction = (weeklyBucket && typeof weeklyBucket.remainingFraction === 'number')
      ? weeklyBucket.remainingFraction
      : 1;
    const weeklyRemaining = Math.max(0, Math.min(100, Math.round(weeklyFraction * 100)));
    const weeklyUsed = Math.max(0, 100 - weeklyRemaining);
    const weeklyReset = getResetTime(weeklyBucket?.resetTime, '7d');

    return {
      hasDualLimit: false,
      family: 'argon',
      modelName: activeModelName || 'Gemini 4 Argon',
      singleLabel: 'Cuota Semanal Restante',
      remainingPct: weeklyRemaining,
      usedPct: weeklyUsed,
      weeklyRemaining,
      weeklyUsed,
      weeklyReset,
      resetStr: weeklyReset,
      usagePct: weeklyRemaining,
      isNative: true
    };
  }

  const weeklyFraction = (weeklyBucket && typeof weeklyBucket.remainingFraction === 'number')
    ? weeklyBucket.remainingFraction
    : 1;
  const rollingFraction = (rollingBucket && typeof rollingBucket.remainingFraction === 'number')
    ? rollingBucket.remainingFraction
    : 1;

  const weeklyRemaining = Math.max(0, Math.min(100, Math.round(weeklyFraction * 100)));
  const weeklyUsed = Math.max(0, 100 - weeklyRemaining);
  const weeklyReset = getResetTime(weeklyBucket?.resetTime, '7d');

  const rollingRemaining = Math.max(0, Math.min(100, Math.round(rollingFraction * 100)));
  const rollingUsed = Math.max(0, 100 - rollingRemaining);
  const rollingReset = getResetTime(rollingBucket?.resetTime, '5h');

  return {
    hasDualLimit: true,
    family: isClaudeOrGpt ? 'claude' : 'gemini',
    modelName: activeModelName || (isClaudeOrGpt ? 'Claude' : 'Gemini'),
    rollingLabel: 'Cuota 5h Restante',
    rollingRemaining,
    rollingUsed,
    rollingReset,
    weeklyLabel: 'Cuota Semanal Restante',
    weeklyRemaining,
    weeklyUsed,
    weeklyReset,
    usagePct: rollingRemaining,
    isNative: true
  };
}
