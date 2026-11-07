import fs from 'node:fs';
import path from 'node:path';
import { VoicePromptConditioner } from '../../../mods/voice-assistant/services/VoicePromptConditioner.js';
import { LanguageServerRpcClient } from '../mcp/server.mjs';

/**
 * Normalizes technical developer terminology from raw spoken transcripts.
 *
 * @param {string} text Raw speech transcript
 * @returns {string} Text with normalized developer vocabulary
 */
export function normalizeTechnicalVocabulary(text) {
  if (!text || typeof text !== 'string') return '';

  let normalized = text;
  const replacements = [
    { pattern: /\b(postgress?|posgres(?:t)?|postgre)\b/gi, replacement: 'PostgreSQL' },
    { pattern: /\b(hexagon)\b/gi, replacement: 'Hexagonal' },
    { pattern: /\b(sod|zodd)\b/gi, replacement: 'Zod' },
    { pattern: /\b(git\s+(?:graf|grab))\b/gi, replacement: 'Git Graph' },
    { pattern: /\b(work\s+tree|work\s+tri)\b/gi, replacement: 'worktree' },
    { pattern: /\b(docker\s*fail|doker\s*fail)\b/gi, replacement: 'Dockerfile' },
    { pattern: /\b(doker)\b/gi, replacement: 'Docker' },
    { pattern: /\b(cubernetes|kuber(?:netes)?)\b/gi, replacement: 'Kubernetes' },
    { pattern: /\b(ti\s*di\s*di|te\s*de\s*de)\b/gi, replacement: 'TDD' },
    { pattern: /\b(bi\s*di\s*di|be\s*de\s*de)\b/gi, replacement: 'BDD' },
    { pattern: /\b(pi\s*ar\s*gate|pr\s*geit)\b/gi, replacement: 'PR gate' },
    { pattern: /\b(tailwind\s*c?s?s?|teilwind)\b/gi, replacement: 'Tailwind' },
    { pattern: /\b(prox\s*mox)\b/gi, replacement: 'Proxmox' },
    { pattern: /\b(q\s*drant|cudrant)\b/gi, replacement: 'Qdrant' }
  ];

  for (const { pattern, replacement } of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

/**
 * Resolves standard file paths for Handy STT native dependencies.
 *
 * @param {Object} [customPaths={}]
 * @returns {{ transcribeDll: string, canaryModel: string, sileroVad: string }}
 */
export function getHandyResourcePaths(customPaths = {}) {
  const localAppData = customPaths.localAppData || process.env.LOCALAPPDATA || '';
  const appData = customPaths.appData || process.env.APPDATA || '';

  return {
    transcribeDll:
      customPaths.transcribeDll || (localAppData ? path.join(localAppData, 'Handy', 'transcribe.dll') : ''),
    canaryModel:
      customPaths.canaryModel ||
      (appData ? path.join(appData, 'com.pais.handy', 'models', 'canary-180m-flash-Q8_0.gguf') : ''),
    sileroVad:
      customPaths.sileroVad ||
      (localAppData ? path.join(localAppData, 'Handy', 'resources', 'models', 'silero_vad_v4.onnx') : '')
  };
}

/**
 * Inspects whether Handy STT resources are present on the host filesystem.
 *
 * @param {Object} [customPaths={}]
 * @param {Object} [fsModule=fs] File system module (allows injection for testing)
 * @returns {{
 *   available: boolean,
 *   paths: { transcribeDll: string, canaryModel: string, sileroVad: string },
 *   status: { transcribeDll: boolean, canaryModel: boolean, sileroVad: boolean },
 *   missing: string[]
 * }}
 */
export function discoverHandyResources(customPaths = {}, fsModule = fs) {
  const paths = getHandyResourcePaths(customPaths);
  const status = {
    transcribeDll: Boolean(paths.transcribeDll && fsModule.existsSync(paths.transcribeDll)),
    canaryModel: Boolean(paths.canaryModel && fsModule.existsSync(paths.canaryModel)),
    sileroVad: Boolean(paths.sileroVad && fsModule.existsSync(paths.sileroVad))
  };

  const missing = [];
  if (!status.transcribeDll) missing.push('transcribe.dll');
  if (!status.canaryModel) missing.push('canary-180m-flash-Q8_0.gguf');
  if (!status.sileroVad) missing.push('silero_vad_v4.onnx');

  return {
    available: missing.length === 0,
    paths,
    status,
    missing
  };
}

/**
 * Hexagonal adapter bridging local STT transcripts to Antigravity global control.
 */
export class HandyTranscribeBridge {
  /**
   * @param {Object} [options={}]
   * @param {LanguageServerRpcClient} [options.rpcClient]
   * @param {boolean} [options.dryMode=false] When true or muted, actions are simulated without RPC dispatch
   * @param {Object} [options.resourcePaths]
   * @param {Object} [options.fsModule]
   * @param {Array<Object>} [options.cascades]
   */
  constructor(options = {}) {
    this.rpcClient = options.rpcClient || new LanguageServerRpcClient(options);
    this.dryMode = options.dryMode ?? false;
    this.fsModule = options.fsModule || fs;
    this.resourcePaths = options.resourcePaths || {};
    this.cascades = options.cascades || null;
    this.actionHistory = [];
  }

  /**
   * Checks local STT engine availability.
   * @returns {ReturnType<typeof discoverHandyResources>}
   */
  checkResources() {
    return discoverHandyResources(this.resourcePaths, this.fsModule);
  }

  /**
   * Evaluates if a normalized transcript matches a global app action.
   *
   * @param {string} text
   * @returns {{ isAction: boolean, type: 'cancel'|'terminal'|null }}
   */
  detectGlobalAction(text) {
    if (!text) return { isAction: false, type: null };

    if (
      /\b(det[eé]n\s+(?:la\s+)?ejecuci[oó]n|cancela(?:\s+la)?\s+invocaci[oó]n|para(?:\s+la)?\s+ejecuci[oó]n|stop\s+execution|cancel\s+invocation|deten\s+todo)\b/i.test(
        text
      )
    ) {
      return { isAction: true, type: 'cancel' };
    }

    if (
      /\b(abre\s+(?:una\s+)?terminal|crea\s+(?:una\s+)?terminal|nueva\s+terminal|open\s+terminal|create\s+terminal)\b/i.test(
        text
      )
    ) {
      return { isAction: true, type: 'terminal' };
    }

    return { isAction: false, type: null };
  }

  /**
   * Dispatches a spoken transcript to the appropriate conversation or global RPC.
   *
   * @param {string|Object} input Raw transcript string or object
   * @param {Object} [callOptions={}]
   * @param {string} [callOptions.activeCascadeId] Active conversation fallback
   * @param {boolean} [callOptions.dryMode] Override instance dryMode
   * @param {Array<Object>} [callOptions.cascades] Known cascades list
   * @param {string} [callOptions.cwd] Working directory for terminals
   * @returns {Promise<Object>} Execution or simulation result
   */
  async dispatchTranscript(input, callOptions = {}) {
    const rawText = VoicePromptConditioner.extractSpokenText(input);
    if (!rawText) {
      return {
        handled: false,
        reason: 'empty_transcript',
        text: ''
      };
    }

    const normalizedText = normalizeTechnicalVocabulary(rawText);
    const dryRun = callOptions.dryMode ?? this.dryMode;
    const activeCascadeId = callOptions.activeCascadeId || 'active-conversation';
    const cascades = callOptions.cascades || this.cascades;

    // 1. Check for global system action triggers (cancel, terminal)
    const actionCheck = this.detectGlobalAction(normalizedText);
    if (actionCheck.isAction) {
      if (actionCheck.type === 'cancel') {
        const payload = { cascadeId: activeCascadeId };
        const entry = {
          action: 'cancel_conversation',
          executed: !dryRun,
          dryRun,
          targetCascadeId: activeCascadeId,
          timestamp: new Date().toISOString()
        };

        if (!dryRun) {
          entry.result = await this.rpcClient.cancelConversation(payload);
        }

        this.actionHistory.unshift(entry);
        return { handled: true, ...entry };
      }

      if (actionCheck.type === 'terminal') {
        const cwd = callOptions.cwd || '';
        const entry = {
          action: 'create_terminal',
          executed: !dryRun,
          dryRun,
          cwd,
          timestamp: new Date().toISOString()
        };

        if (!dryRun) {
          entry.result = await this.rpcClient.createTerminal({ cwd });
        }

        this.actionHistory.unshift(entry);
        return { handled: true, ...entry };
      }
    }

    // 2. Condition prompt and resolve cross-chat routing
    const condition = VoicePromptConditioner.condition(normalizedText, {
      activeCascadeId,
      cascades
    });

    const isCrossChat =
      condition.routing.isGlobalRoute ||
      (condition.routing.targetHint && condition.routing.cascadeId !== activeCascadeId);

    if (isCrossChat) {
      const targetCascadeId = condition.cascadeId;
      const promptToSend = condition.cleanedPrompt || normalizedText;
      const entry = {
        action: 'cross_chat_dispatch',
        executed: !dryRun,
        dryRun,
        targetCascadeId,
        targetHint: condition.routing.targetHint,
        targetType: condition.routing.targetType,
        prompt: promptToSend,
        condition,
        timestamp: new Date().toISOString()
      };

      if (!dryRun) {
        entry.result = await this.rpcClient.sendConversationMessage({
          cascadeId: targetCascadeId,
          text: promptToSend
        });
      }

      this.actionHistory.unshift(entry);
      return { handled: true, ...entry };
    }

    // 3. Same-chat or general dispatch
    const defaultCascadeId = condition.cascadeId || activeCascadeId;
    const entry = {
      action: 'active_chat_dispatch',
      executed: !dryRun,
      dryRun,
      targetCascadeId: defaultCascadeId,
      prompt: condition.cleanedPrompt || normalizedText,
      condition,
      timestamp: new Date().toISOString()
    };

    if (!dryRun && callOptions.forwardToActive) {
      entry.result = await this.rpcClient.sendConversationMessage({
        cascadeId: defaultCascadeId,
        text: entry.prompt
      });
    }

    this.actionHistory.unshift(entry);
    return { handled: true, ...entry };
  }
}
