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
      subagents: [],
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
