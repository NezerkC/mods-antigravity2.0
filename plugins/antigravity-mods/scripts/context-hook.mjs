#!/usr/bin/env node
/**
 * Antigravity Native Lifecycle Hook & Telemetry Engine (SSOT)
 * Plugin: antigravity-mods
 * Runtime: Node.js (ESM) - Zero External Dependencies
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HOME_DIR = os.homedir();
const DASHBOARD_LINK = '[Abrir Dashboard](sidecar://antigravity-mods/dashboard/)';
const PLAN_ROLES = new Set(['lead-architect', 'product-manager', 'context-distiller']);

export const MAX_SPECIALIST_CHARS = 1200;
export const MAX_FULL_INJECT_CHARS = 2000;
export const MAX_HEARTBEAT_CHARS = 300;
export const FULL_INJECT_REFRESH_TURNS = 8;

const EDITING_TOOLS = new Set(['edit_file', 'write_file']);
const BUILD_CMD_PATTERN = /\b(?:npm\s+(?:run\s+)?(?:test|build)|git\s+commit|node\s+build|tsc|cargo\s+build|go\s+build)\b/i;

const EXPLICIT_PLAN_PHRASE = /\b(?:plan\s+de\s+implementaci[oó]n|implementation\s+plan|arquitectur[a-záéíóú]*|diseñ(?:o|a|ar|emos)?|comparativ[ao]s?|explic[a-záéíóú]*|analiz[a-záéíóú]*|diagn[oó]stic[a-záéíóú]*|revis(?:a|e|ar|i[oó]n|emos))\b/i;
const PLAN_PATTERN = /\b(?:diseñ|plan|arquitect|estructur|diagram|rfc|adr|evalu|compar|como\s+(?:hacer|estructurar|abordar|organizar)|analiz|estrateg|roadmap|criterio|decision|flujo|explic|por\s*qu[eé]|evaluaci[oó]n|diagn[oó]stic)/i;
const BUILD_PATTERN = /\b(?:implement|escrib|crea|agreg|corrig|arregl|fix|refactor|test|prueb|npm|git\s+commit|ejecut|corr|instal|modific|edit|program|actualiz|agrega|elimina|borra)/i;

const MODEL_DISPLAY_NAMES = {
  'gemini-4-neon-xhigh': 'Gemini 4 Neon (XHigh)',
  'gemini-4-neon-high': 'Gemini 4 Neon (High)',
  'gemini-4-neon-medium': 'Gemini 4 Neon (Medium)',
  'gemini-4-neon-low': 'Gemini 4 Neon (Low)',
  'gemini-4-carbon-high': 'Gemini 4 Carbon (High)',
  'gemini-4-carbon-medium': 'Gemini 4 Carbon (Medium)',
  'gemini-4-carbon-low': 'Gemini 4 Carbon (Low)',
  'gemini-4-argon-high': 'Gemini 4 Argon (High)',
  'gemini-4-argon-medium': 'Gemini 4 Argon (Medium)',
  'gemini-4-argon-low': 'Gemini 4 Argon (Low)',
  'gemini-4-hydrogen-xhigh': 'Gemini 4 Hydrogen (XHigh)',
  'gemini-4-hydrogen-high': 'Gemini 4 Hydrogen (High)',
  'gemini-4-hydrogen-medium': 'Gemini 4 Hydrogen (Medium)',
  'gemini-4-hydrogen-low': 'Gemini 4 Hydrogen (Low)',
  'gemini-3.8-flash-high': 'Gemini 3.8 Flash (High)',
  'gemini-3.8-flash-medium': 'Gemini 3.8 Flash (Medium)',
  'gemini-3.8-flash-low': 'Gemini 3.8 Flash (Low)',
  'claude-opus-5-5-high': 'Claude Opus 5.5 (High)',
  'claude-opus-5-5-medium': 'Claude Opus 5.5 (Medium)',
  'claude-opus-5-5-low': 'Claude Opus 5.5 (Low)',
  'claude-sonnet-5-5-high': 'Claude Sonnet 5.5 (High)',
  'claude-sonnet-5-5-medium': 'Claude Sonnet 5.5 (Medium)',
  'claude-sonnet-5-5-low': 'Claude Sonnet 5.5 (Low)',
  'gpt-oss-120b-medium': 'GPT-OSS 120B (Medium)',
  'gemini-pro-orchestrator-neon': 'Orchestrator (Neon)',
  'gemini-pro-orchestrator-g1-pro': 'Orchestrator (Argon)',
  'gemini-pro-orchestrator': 'Orchestrator (Carbon)',
  'gemini-pro-orchestrator-argon': 'Orchestrator (Argon)'
};

function getDefaultActiveAgentsPath(homeDir = DEFAULT_HOME_DIR) {
  if (process.env.ANTIGRAVITY_ACTIVE_AGENTS_PATH) {
    return process.env.ANTIGRAVITY_ACTIVE_AGENTS_PATH;
  }
  return path.join(homeDir, '.gemini', 'config', 'mods', 'active_agents.json');
}

function resolveCatalogPath(options = {}, homeDir = DEFAULT_HOME_DIR) {
  if (options.modelCatalogPath) return options.modelCatalogPath;
  if (process.env.ANTIGRAVITY_MODEL_CATALOG_PATH) {
    return process.env.ANTIGRAVITY_MODEL_CATALOG_PATH;
  }
  return path.join(homeDir, '.gemini', 'config', 'mods', 'model_catalog.json');
}

function resolveSlotsPath(options = {}, homeDir = DEFAULT_HOME_DIR) {
  if (options.modelSlotsPath) return options.modelSlotsPath;
  if (process.env.ANTIGRAVITY_MODEL_SLOTS_PATH) {
    return process.env.ANTIGRAVITY_MODEL_SLOTS_PATH;
  }
  return path.join(homeDir, '.gemini', 'config', 'mods', 'model_slots.json');
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16);
}

/**
 * Strip a leading UTF-8 BOM if present (common on Windows cmd/PowerShell pipes).
 */
export function stripBom(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/^\uFEFF/, '');
}

/**
 * Parse hook JSON payload from stdin string safely.
 */
export function parseHookPayload(raw) {
  const cleaned = stripBom(raw).trim();
  if (!cleaned) return {};
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readJsonFileSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(stripBom(fs.readFileSync(filePath, 'utf-8')));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonFileSafe(filePath, data) {
  if (!filePath) return;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) return;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

/**
 * Single-pass transcript inspector: reads transcript.jsonl at most ONCE to compute
 * token telemetry, latest user prompt, turn index, current-turn edit activity,
 * and whether the session is a child swarm worker.
 */
export function inspectTranscript(transcriptPath, payload = null) {
  const cleanPayloadPrompt = (payload?.lastUserInput && typeof payload.lastUserInput === 'string')
    ? payload.lastUserInput.replace(/<[^>]+>/g, '').trim()
    : '';

  const emptyResult = {
    context: null,
    lastUserPrompt: cleanPayloadPrompt,
    userTurnCount: 0,
    hasEditedInCurrentTurn: false,
    isChildWorker: false
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return emptyResult;
  }

  let targetPath = transcriptPath;
  if (transcriptPath.endsWith('transcript_full.jsonl')) {
    const compactCandidate = path.join(path.dirname(transcriptPath), 'transcript.jsonl');
    if (fs.existsSync(compactCandidate)) {
      targetPath = compactCandidate;
    }
  }

  let totalBytes = 0;
  try {
    totalBytes = fs.statSync(targetPath).size;
  } catch {
    return emptyResult;
  }

  let steps = 0;
  let totalChars = 0;
  let userTurnCount = 0;
  let sawAnyUserInput = false;
  let hasEditedInCurrentTurn = false;
  let lastUserPromptFromTranscript = '';
  let isChildWorker = false;
  let sawUserExplicitRequest = false;

  try {
    const content = stripBom(fs.readFileSync(targetPath, 'utf-8'));
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = stripBom(lines[i]).trim();
      if (!line) continue;
      steps++;

      const isEarlyLine = steps <= 15;
      const mayBeCheckpoint = line.includes('"CHECKPOINT"');
      const mayBeUserInput = line.includes('"USER_INPUT"') || line.includes('"USER_EXPLICIT"');
      const mayHaveTools = sawAnyUserInput && !hasEditedInCurrentTurn &&
        (line.includes('tool_calls') || line.includes('toolCall'));

      let data = null;
      if (isEarlyLine || mayBeCheckpoint || mayBeUserInput || mayHaveTools) {
        try {
          data = JSON.parse(line);
        } catch {
          data = null;
        }
      }

      if (data && data.type === 'CHECKPOINT') {
        totalChars = line.length;
      } else {
        totalChars += line.length;
      }

      if (!data || typeof data !== 'object') continue;

      if (isEarlyLine && !isChildWorker) {
        const stepType = String(data.type || '');
        const source = String(data.source || '');
        const text = typeof data.content === 'string' ? data.content : '';
        if ((stepType === 'SYSTEM_MESSAGE' || stepType === 'USER_INPUT') && text) {
          if (text.includes('<swarm_worker>') || text.includes('[ROLE: BUILDER WORKER]')) {
            isChildWorker = true;
          }
          if (source === 'USER_EXPLICIT' && stepType === 'USER_INPUT' && text.includes('<USER_REQUEST>')) {
            sawUserExplicitRequest = true;
          }
          if (text.includes('[Message]') && text.includes('sender=') && !sawUserExplicitRequest) {
            isChildWorker = true;
          }
        }
      }

      if (data.type === 'USER_INPUT' || data.source === 'USER_EXPLICIT') {
        userTurnCount++;
        sawAnyUserInput = true;
        hasEditedInCurrentTurn = false;
        const raw = data.content || '';
        const clean = typeof raw === 'string' ? raw.replace(/<[^>]+>/g, '').trim() : '';
        if (clean) {
          lastUserPromptFromTranscript = clean;
        }
        continue;
      }

      if (mayHaveTools) {
        const toolCalls = data.tool_calls || data.toolCalls || [];
        for (const tc of toolCalls) {
          const name = tc?.name || '';
          if (EDITING_TOOLS.has(name)) {
            hasEditedInCurrentTurn = true;
            break;
          }
          if (name === 'run_command') {
            const cmd = tc?.args?.CommandLine || tc?.args?.command || '';
            if (BUILD_CMD_PATTERN.test(cmd)) {
              hasEditedInCurrentTurn = true;
              break;
            }
          }
        }
      }
    }
  } catch {
    totalChars = totalBytes;
  }

  const estTokens = Math.floor(totalChars / 3.8);
  const limit1M = 1_000_000;
  const pct = (estTokens / limit1M) * 100;

  return {
    context: {
      tokens: estTokens,
      steps,
      sizeKb: Math.round((totalBytes / 1024) * 10) / 10,
      percentage: Math.round(pct * 100) / 100
    },
    lastUserPrompt: cleanPayloadPrompt || lastUserPromptFromTranscript,
    userTurnCount,
    hasEditedInCurrentTurn,
    isChildWorker
  };
}

/**
 * Calculate estimated tokens and context metrics from the conversation transcript.
 */
export function calculateContext(transcriptPath) {
  return inspectTranscript(transcriptPath).context;
}

/**
 * Extract the latest user prompt (prefers native payload.lastUserInput).
 */
export function getLastUserPrompt(transcriptPath, payload) {
  if (payload?.lastUserInput && typeof payload.lastUserInput === 'string') {
    const clean = payload.lastUserInput.replace(/<[^>]+>/g, '').trim();
    if (clean) return clean;
  }
  return inspectTranscript(transcriptPath, payload).lastUserPrompt;
}

/**
 * Detect whether the transcript belongs to a spawned child builder worker session.
 */
export function isChildWorkerSession(transcriptPath) {
  return inspectTranscript(transcriptPath).isChildWorker;
}

/**
 * Dynamic heuristic classifier for PLAN vs BUILD mode.
 * Strict intent precedence:
 * 1. Current-turn file mutation (strictly after latest USER_INPUT) -> BUILD
 * 2. Explicit planning phrases -> PLAN
 * 3. Tie-breaker (both PLAN and BUILD signals) -> fail-safe PLAN
 */
export function classifyPlanVsBuild(transcriptPath, prompt, precomputedInspection = null) {
  const hasEdited = precomputedInspection
    ? Boolean(precomputedInspection.hasEditedInCurrentTurn)
    : inspectTranscript(transcriptPath).hasEditedInCurrentTurn;

  if (hasEdited) return 'BUILD';
  if (!prompt || typeof prompt !== 'string') return 'PLAN';

  if (EXPLICIT_PLAN_PHRASE.test(prompt)) return 'PLAN';

  const hasPlan = PLAN_PATTERN.test(prompt);
  const hasBuild = BUILD_PATTERN.test(prompt);

  if (hasBuild && !hasPlan) return 'BUILD';
  if (hasPlan && !hasBuild) return 'PLAN';
  if (hasPlan && hasBuild) return 'PLAN';

  const pLower = prompt.trim().toLowerCase();
  const planStarters = ['cómo', 'como', 'por qué', 'porque', 'explica', 'cuál', 'cual', 'analiza', 'revisa'];
  if (planStarters.some(w => pLower.startsWith(w))) return 'PLAN';

  const buildStarters = ['haz', 'crea', 'agrega', 'modifica', 'corrige', 'ejecuta', 'implementa'];
  if (buildStarters.some(w => pLower.startsWith(w))) return 'BUILD';

  return 'PLAN';
}

export function isSddExplicitlyRequested(prompt, agent) {
  if (agent?.sddEnabled === true || agent?.modifiers?.sdd === true) return true;
  return typeof prompt === 'string' && /\/sdd-[a-z0-9_-]+/i.test(prompt);
}

export function getActiveAgent(conversationId, activeAgentsPath = getDefaultActiveAgentsPath(), preloadedData = null) {
  if (!conversationId) return null;
  const data = preloadedData || readJsonFileSafe(activeAgentsPath);
  if (!data) return null;
  const agent = data[conversationId];
  if (agent && agent.id && agent.id !== 'default' && agent.name !== 'Sin Agente') {
    return agent;
  }
  return null;
}

export function updateAgentEffectiveMode(conversationId, effectiveMode, activeAgentsPath = getDefaultActiveAgentsPath()) {
  if (!conversationId || !activeAgentsPath) return;
  const data = readJsonFileSafe(activeAgentsPath) || {};
  if (data[conversationId]) {
    data[conversationId].effectiveMode = effectiveMode;
    writeJsonFileSafe(activeAgentsPath, data);
  }
}

export function loadDynamicModelNames(options = {}, homeDir = DEFAULT_HOME_DIR) {
  const catalogPath = resolveCatalogPath(options, homeDir);
  const data = readJsonFileSafe(catalogPath);
  if (!data) return {};

  const names = {};
  for (const item of data.modelCatalog || []) {
    if (item && typeof item === 'object' && item.id && item.name) {
      names[String(item.id)] = String(item.name);
    }
  }
  for (const bm of data.baseModels || []) {
    if (!bm || typeof bm !== 'object') continue;
    const baseName = bm.name || '';
    for (const eff of bm.efforts || []) {
      if (eff && typeof eff === 'object' && eff.id && !(eff.id in names)) {
        const label = String(eff.label || '');
        names[String(eff.id)] = label.toLowerCase() === 'standard'
          ? baseName
          : `${baseName} (${label})`;
      }
    }
  }
  return names;
}

export function getModelDisplayName(modelId, dynamicNames = null) {
  if (!modelId) return 'Unknown';
  if (dynamicNames && modelId in dynamicNames) {
    return dynamicNames[modelId];
  }
  return MODEL_DISPLAY_NAMES[modelId] || modelId;
}

export function formatShortModelName(modelId) {
  if (!modelId) return 'Unknown';
  const cleaned = String(modelId)
    .replace(/^gemini-(?:4|3\.8|pro)-/i, '')
    .replace(/^claude-/i, '')
    .replace(/-5-5-/i, '-')
    .replace(/-medium$/i, '-Med')
    .replace(/-high$/i, '-High')
    .replace(/-xhigh$/i, '-XHigh')
    .replace(/-low$/i, '-Low');
  return cleaned
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

export function resolveValidBuilderModel(builderId, options = {}, homeDir = DEFAULT_HOME_DIR) {
  const fallbackId = 'gemini-3.8-flash-medium';
  const candidate = String(builderId || '').trim();
  if (!candidate) return fallbackId;

  const catalogPath = resolveCatalogPath(options, homeDir);
  const data = readJsonFileSafe(catalogPath);
  if (data && Array.isArray(data.disabledModels)) {
    for (const disabled of data.disabledModels) {
      if (disabled && String(disabled.id || '').trim() === candidate) {
        return fallbackId;
      }
    }
  }
  return candidate;
}

export function getModelSlots(options = {}, homeDir = DEFAULT_HOME_DIR) {
  const defaultPlanner = 'gemini-4-argon-high';
  const defaultBuilder = 'gemini-4-hydrogen-high';

  if (options.modelSlots && typeof options.modelSlots === 'object') {
    const raw = options.modelSlots;
    return {
      planner: String(raw.planner || defaultPlanner),
      builder: resolveValidBuilderModel(raw.builder || defaultBuilder, options, homeDir),
      enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true
    };
  }

  const slotsPath = resolveSlotsPath(options, homeDir);
  const data = readJsonFileSafe(slotsPath);
  if (!data) {
    return {
      planner: defaultPlanner,
      builder: resolveValidBuilderModel(defaultBuilder, options, homeDir),
      enabled: false
    };
  }

  return {
    planner: data.planner ? String(data.planner) : defaultPlanner,
    builder: resolveValidBuilderModel(data.builder ? String(data.builder) : defaultBuilder, options, homeDir),
    enabled: data.enabled !== undefined ? Boolean(data.enabled) : true
  };
}

export function buildModelSlotsDirective(slots, effectiveMode = 'PLAN', options = {}, homeDir = DEFAULT_HOME_DIR) {
  const dynamicNames = loadDynamicModelNames(options, homeDir);
  const plannerId = slots?.planner || 'gemini-4-argon-high';
  const builderId = slots?.builder || 'gemini-4-hydrogen-high';
  const plannerName = getModelDisplayName(plannerId, dynamicNames);
  const builderName = getModelDisplayName(builderId, dynamicNames);

  return (
    '[DUAL-SLOT MODEL GOVERNANCE]\n' +
    `Planner: ${plannerName} (${plannerId}) | Builder: ${builderName} (${builderId}) | Phase: ${effectiveMode}\n` +
    'Rules: 1) Planner owns architecture & task decomposition. ' +
    `2) NEVER call invoke_subagent (blocked). Delegate via swarm(action="add", name="builder", model="${builderId}", workspace="inherit", brief="...") (reuse via post_message; parallel via tasks=[...]). ` +
    '3) Keep briefs self-contained and review before concluding.'
  );
}

export function buildWorkerDirective() {
  return (
    '[ROLE: BUILDER WORKER]\n' +
    'Execute assigned implementation/analysis tasks directly in this session. ' +
    'Do NOT delegate further unless explicitly instructed. Keep completion reports concise.'
  );
}

/**
 * Strip YAML frontmatter, Mermaid fences, and long Markdown tables, then cap
 * specialist instructions and attach an on-demand file reference pointer.
 */
export function sanitizeSpecialistInstructions(rawText, filePath = '', maxChars = MAX_SPECIALIST_CHARS) {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = stripBom(rawText);
  // Strip YAML frontmatter
  text = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  // Strip Mermaid code fences
  text = text.replace(/```mermaid[\s\S]*?```/gi, '');
  // Strip long markdown tables (4+ consecutive lines starting with |)
  text = text.replace(/(?:^[ \t]*\|.*\|[ \t]*(?:\r?\n|$)){4,}/gm, '\n');
  // Collapse excessive whitespace
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  const pointer = filePath ? `Full reference (read on demand only): ${filePath}` : '';
  const separator = pointer && text ? '\n' : '';
  const combined = `${text}${separator}${pointer}`;

  if (combined.length <= maxChars) {
    return combined;
  }

  if (pointer && pointer.length >= maxChars) {
    return pointer.slice(0, maxChars);
  }

  const ellipsis = '...';
  const bodyBudget = maxChars - pointer.length - (pointer ? 1 : 0) - ellipsis.length;
  if (bodyBudget <= 0) {
    return pointer.slice(0, maxChars);
  }

  let truncated = text.slice(0, bodyBudget);
  const lastBreak = Math.max(truncated.lastIndexOf('\n'), truncated.lastIndexOf(' '));
  if (lastBreak > bodyBudget * 0.6) {
    truncated = truncated.slice(0, lastBreak);
  }
  truncated = truncated.trimEnd() + ellipsis;
  return pointer ? `${truncated}\n${pointer}` : truncated;
}

export function resolveAgentInstructionFile(agent, homeDir = DEFAULT_HOME_DIR) {
  if (!agent) return null;

  if (agent.filePath && fs.existsSync(agent.filePath)) {
    return agent.filePath;
  }

  const agentId = (agent.id || '').toLowerCase();
  if (!agentId) return null;

  const candidates = [
    path.join(homeDir, '.gemini', 'antigravity', 'scratch', 'architecture-vault', 'Agente Orquestador.md'),
    path.join(homeDir, '.gemini', 'config', 'skills', 'lead-architect', 'SKILL.md'),
    path.join(homeDir, '.gemini', 'config', 'skills', 'sdd-orchestrator', 'SKILL.md'),
    path.join(homeDir, '.gemini', 'antigravity', 'scratch', 'architecture-vault', '.agents', 'skills', 'sdd-orchestrator', 'SKILL.md'),
    path.join(homeDir, '.gemini', 'config', 'skills', agentId, 'SKILL.md')
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      const candLower = cand.toLowerCase();
      if (candLower.includes(agentId) || (agentId === 'lead-architect' && candLower.includes('orquestador'))) {
        return cand;
      }
    }
  }

  return null;
}

export function loadAgentInstructions(agent, homeDir = DEFAULT_HOME_DIR, maxChars = MAX_SPECIALIST_CHARS) {
  const resolvedPath = resolveAgentInstructionFile(agent, homeDir);
  if (!resolvedPath) return null;

  try {
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    return sanitizeSpecialistInstructions(raw, resolvedPath, maxChars);
  } catch {
    return null;
  }
}

function updateUiBadge(transcriptPath = '', options = {}) {
  if (options.skipBadgeSpawn || process.env.ANTIGRAVITY_HOOK_SKIP_BADGE === '1') {
    return;
  }

  const homeDir = options.homeDir || DEFAULT_HOME_DIR;
  try {
    const candidates = [
      path.join(homeDir, '.gemini', 'config', 'mods', 'antigravity_mod_loader.mjs'),
      path.join(homeDir, '.gemini', 'config', 'mods', 'update_ui_badge.mjs'),
      path.resolve(__dirname, '../../..', 'dist', 'antigravity_mod_loader.mjs')
    ];

    let targetScript = null;
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        targetScript = cand;
        break;
      }
    }

    if (targetScript) {
      const args = [targetScript];
      if (transcriptPath) {
        args.push('--transcript', transcriptPath);
      }
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    }
  } catch {}
}

function buildSpecialistDirective(agent, effectiveMode, instructions, maxTotalChars = MAX_SPECIALIST_CHARS) {
  const agentId = agent.id || '';
  let header = '';
  let body = instructions || '';

  if (agentId === 'auto') {
    if (effectiveMode === 'PLAN') {
      header =
        '[CLASSIFIED MODE: PLANNER (LEAD ARCHITECT)]\n' +
        '[PERMISSIONS POLICY: REQUEST REVIEW / SAFE PLANNING]\n' +
        'Focus on architecture, boundaries, contracts, and trade-offs. Confirm before destructive mutations.';
      if (!body) body = 'Operate as Lead Architect.';
    } else {
      header =
        '[CLASSIFIED MODE: BUILDER (SDD ORCHESTRATOR)]\n' +
        '[PERMISSIONS POLICY: TURBO BUILD / TDD EXECUTION]\n' +
        'Authorized to edit files and run verification tests (npm test). Keep commits atomic and green.';
      if (!body) body = 'Execute changes with TDD discipline and clean verification.';
    }
  } else {
    if (!body) return null;
    const permPolicy = effectiveMode === 'PLAN' ? 'REQUEST REVIEW' : 'TURBO BUILD';
    header =
      `[ACTIVE SPECIALIST ROLE: ${agent.name || 'Specialist'}]\n` +
      `[PERMISSIONS POLICY: ${permPolicy}]`;
  }

  const wrapper = `${header}\n--- DIRECTIVES ---\n${body}`;
  if (wrapper.length <= maxTotalChars) return wrapper;

  const remaining = maxTotalChars - header.length - '\n--- DIRECTIVES ---\n'.length;
  if (remaining <= 20) return header.slice(0, maxTotalChars);
  return `${header}\n--- DIRECTIVES ---\n${sanitizeSpecialistInstructions(body, '', remaining)}`;
}

export function buildCavemanDirective() {
  return (
    '[MODIFIER: CAVEMAN FOCUS MODE]\n' +
    'Terse, high-signal replies (~75% shorter, 100% accurate). Drop filler, pleasantries, and articles. ' +
    'Keep code, paths, errors, commands, and commit messages 100% intact.'
  );
}

export function buildAdhdDirective() {
  return (
    '[MODIFIER: I-HAVE-ADHD OUTPUT SHAPING]\n' +
    'Lead with concrete action (zero preamble/recap). Number bounded steps; restate current step; ' +
    'cap lists to 5 items. Matter-of-fact errors. End with one <2min next step.'
  );
}

export function isCavemanEnabled(payload, activeAgentsPath = getDefaultActiveAgentsPath(), preloadedData = null) {
  if (payload?.caveman !== undefined) return Boolean(payload.caveman);
  if (payload?.modifiers?.caveman !== undefined) return Boolean(payload.modifiers.caveman);
  const conversationId = typeof payload === 'string' ? payload : (payload?.conversationId || '');
  if (!conversationId) return false;
  const data = preloadedData || readJsonFileSafe(activeAgentsPath);
  const entry = data?.[conversationId];
  if (!entry) return false;
  return Boolean(entry.caveman ?? entry.modifiers?.caveman);
}

export function isAdhdEnabled(payload, activeAgentsPath = getDefaultActiveAgentsPath(), preloadedData = null) {
  if (payload?.adhd !== undefined) return Boolean(payload.adhd);
  if (payload?.modifiers?.adhd !== undefined) return Boolean(payload.modifiers.adhd);
  const conversationId = typeof payload === 'string' ? payload : (payload?.conversationId || '');
  if (!conversationId) return isCavemanEnabled(payload, activeAgentsPath, preloadedData);
  const data = preloadedData || readJsonFileSafe(activeAgentsPath);
  const entry = data?.[conversationId];
  if (entry) {
    if (entry.adhd !== undefined) return Boolean(entry.adhd);
    if (entry.modifiers?.adhd !== undefined) return Boolean(entry.modifiers.adhd);
  }
  return isCavemanEnabled(payload, activeAgentsPath, preloadedData);
}

function buildHeartbeatMessage({ effectiveMode, slots, isChildWorker, caveman, adhd, info }) {
  const parts = [];
  if (effectiveMode) parts.push(`Mode=${effectiveMode}`);
  if (slots?.enabled) {
    if (isChildWorker) {
      parts.push('Role=Worker');
    } else {
      parts.push(`Dual=${formatShortModelName(slots.planner)}/${formatShortModelName(slots.builder)}`);
    }
  }
  const mods = [];
  if (caveman) mods.push('Caveman');
  if (adhd) mods.push('ADHD');
  if (mods.length > 0) parts.push(`Modifiers=${mods.join(',')}`);

  if (info) {
    const compactTokens = info.tokens >= 1000
      ? `~${Math.round(info.tokens / 1000)}k`
      : `~${info.tokens}`;
    const pct = Math.round(info.percentage * 10) / 10;
    parts.push(`Context=${compactTokens} (${pct}%)`);
  }

  const prefix = `[MODS]: ${parts.join(' | ')}`;
  const full = `${prefix} · ${DASHBOARD_LINK}`;
  if (full.length <= MAX_HEARTBEAT_CHARS) return full;

  const budget = MAX_HEARTBEAT_CHARS - DASHBOARD_LINK.length - 4;
  return `${prefix.slice(0, Math.max(0, budget))} · ${DASHBOARD_LINK}`;
}

function enforceTotalBudget(injectSteps, maxChars = MAX_FULL_INJECT_CHARS) {
  const totalLen = () => injectSteps.reduce((sum, s) => sum + (s.ephemeralMessage?.length || 0), 0);
  if (totalLen() <= maxChars) return;

  // Trim longest step (typically specialist directive) first while preserving structure
  let safety = 0;
  while (totalLen() > maxChars && safety < 10) {
    safety++;
    let excess = totalLen() - maxChars;
    let longestIdx = -1;
    let longestLen = 0;
    for (let i = 0; i < injectSteps.length; i++) {
      const len = injectSteps[i].ephemeralMessage?.length || 0;
      if (len > longestLen) {
        longestLen = len;
        longestIdx = i;
      }
    }
    if (longestIdx < 0 || longestLen <= 40) break;
    const targetLen = Math.max(40, longestLen - excess);
    injectSteps[longestIdx].ephemeralMessage =
      injectSteps[longestIdx].ephemeralMessage.slice(0, targetLen - 3).trimEnd() + '...';
  }
}

/**
 * Handle PreInvocation hook payload and return protojson-compliant output.
 *
 * Uses `ephemeralMessage` rather than `systemMessage.metadata` because
 * Antigravity's Go `utils.ScrubInternalFields` (`proto_utils.go:33-34`) calls
 * `Value.Message()` on map values of `SystemMessage.metadata` (`map<string, string>`),
 * which panics with `type mismatch: cannot convert string to message` whenever
 * `metadata` is non-empty.
 */
export function handlePreInvocation(payload, options = {}) {
  const homeDir = options.homeDir || DEFAULT_HOME_DIR;
  const activeAgentsPath = options.activeAgentsPath || getDefaultActiveAgentsPath(homeDir);
  const conversationId = payload?.conversationId || '';
  const transcriptPath = payload?.transcriptPath || '';

  const output = {
    injectSteps: [],
    terminationBehavior: ''
  };

  if (!conversationId && !transcriptPath && !payload?.lastUserInput) {
    return output;
  }

  const inspection = inspectTranscript(transcriptPath, payload);
  const info = inspection.context;
  const lastPrompt = inspection.lastUserPrompt;

  const activeAgentsData = readJsonFileSafe(activeAgentsPath) || {};
  const agent = getActiveAgent(conversationId, activeAgentsPath, activeAgentsData);
  const slots = getModelSlots(options, homeDir);
  const caveman = isCavemanEnabled(payload, activeAgentsPath, activeAgentsData);
  const adhd = isAdhdEnabled(payload, activeAgentsPath, activeAgentsData);

  let effectiveMode = null;
  let sddActive = false;

  if (agent) {
    const agentId = agent.id || '';
    if (agentId === 'auto') {
      effectiveMode = classifyPlanVsBuild(transcriptPath, lastPrompt, inspection);
      sddActive = effectiveMode === 'BUILD' && isSddExplicitlyRequested(lastPrompt, agent);
    } else {
      effectiveMode = PLAN_ROLES.has(agentId) ? 'PLAN' : 'BUILD';
      sddActive = agentId === 'sdd-orchestrator';
    }
  } else if (slots.enabled && !inspection.isChildWorker) {
    effectiveMode = classifyPlanVsBuild(transcriptPath, lastPrompt, inspection);
  }

  // Delta injection state check (mid-turn vs steady user turn vs state-change/refresh)
  const userTurnKey = `${inspection.userTurnCount}:${shortHash(lastPrompt)}`;
  const stateHash = shortHash(JSON.stringify({
    agentId: agent?.id || '',
    agentFile: agent?.filePath || '',
    effectiveMode: effectiveMode || '',
    caveman,
    adhd,
    slotsEnabled: Boolean(slots.enabled),
    planner: slots.enabled ? slots.planner : '',
    builder: slots.enabled ? slots.builder : '',
    isChildWorker: inspection.isChildWorker,
    sddActive
  }));

  const existingEntry = conversationId ? activeAgentsData[conversationId] : null;
  const prevHookState = existingEntry?.hookState || null;

  const persistState = (nextHookState, nextMode) => {
    if (!conversationId || !activeAgentsPath) return;
    if (!activeAgentsData[conversationId]) {
      activeAgentsData[conversationId] = {};
    }
    if (agent && nextMode) {
      activeAgentsData[conversationId].effectiveMode = nextMode;
    }
    activeAgentsData[conversationId].hookState = nextHookState;
    writeJsonFileSafe(activeAgentsPath, activeAgentsData);
  };

  // Case A: Mid-turn tool step (same user turn & unchanged state) -> 0 injected bytes
  if (
    prevHookState &&
    prevHookState.lastUserTurnKey === userTurnKey &&
    prevHookState.lastStateHash === stateHash
  ) {
    return output;
  }

  const isSameState = Boolean(prevHookState && prevHookState.lastStateHash === stateHash);
  const nextTurnsSinceFull = isSameState ? (Number(prevHookState.turnsSinceFullInject) || 0) + 1 : 0;

  // Case B: New user turn, unchanged state, within refresh window -> compact 1-line heartbeat
  if (isSameState && nextTurnsSinceFull < FULL_INJECT_REFRESH_TURNS) {
    persistState(
      {
        lastUserTurnKey: userTurnKey,
        lastStateHash: stateHash,
        turnsSinceFullInject: nextTurnsSinceFull
      },
      effectiveMode
    );
    const hasAnyContextOrControl = Boolean(info || agent || slots.enabled || caveman || adhd);
    if (hasAnyContextOrControl) {
      output.injectSteps.push({
        ephemeralMessage: buildHeartbeatMessage({
          effectiveMode: effectiveMode || 'PLAN',
          slots,
          isChildWorker: inspection.isChildWorker,
          caveman,
          adhd,
          info
        })
      });
    }
    return output;
  }

  // Case C: Full capped injection (new session, state change, or periodic refresh)
  const fixedStepsBeforeSpecialist = [];
  const fixedStepsAfterSpecialist = [];

  if (slots.enabled) {
    fixedStepsBeforeSpecialist.push({
      ephemeralMessage: inspection.isChildWorker
        ? buildWorkerDirective()
        : buildModelSlotsDirective(slots, effectiveMode || 'PLAN', options, homeDir)
    });
  }

  if (caveman) {
    fixedStepsAfterSpecialist.push({
      ephemeralMessage: buildCavemanDirective()
    });
  }

  if (adhd) {
    fixedStepsAfterSpecialist.push({
      ephemeralMessage: buildAdhdDirective()
    });
  }

  if (info) {
    const formattedTokens = info.tokens.toLocaleString('en-US');
    const notice = `[CONTEXT MONITOR]: ~${formattedTokens} tokens usados (${info.percentage}% de 1M) | ${info.steps} pasos | ${info.sizeKb} KB · ${DASHBOARD_LINK}`;
    fixedStepsAfterSpecialist.push({
      ephemeralMessage: notice
    });
  }

  const fixedChars = [...fixedStepsBeforeSpecialist, ...fixedStepsAfterSpecialist]
    .reduce((sum, step) => sum + step.ephemeralMessage.length, 0);

  let specialistStep = null;
  if (agent) {
    const specialistBudget = Math.min(
      MAX_SPECIALIST_CHARS,
      Math.max(180, MAX_FULL_INJECT_CHARS - fixedChars - 16)
    );
    let instructions = null;

    if (agent.id === 'auto') {
      if (effectiveMode === 'PLAN') {
        const planTarget = {
          id: 'lead-architect',
          name: 'Lead Architect',
          filePath: path.join(homeDir, '.gemini', 'antigravity', 'scratch', 'architecture-vault', 'Agente Orquestador.md')
        };
        instructions = loadAgentInstructions(planTarget, homeDir, Math.max(120, specialistBudget - 200));
      } else if (sddActive) {
        const buildTarget = {
          id: 'sdd-orchestrator',
          name: 'SDD Orchestrator',
          filePath: path.join(homeDir, '.gemini', 'config', 'skills', 'sdd-orchestrator', 'SKILL.md')
        };
        instructions = loadAgentInstructions(buildTarget, homeDir, Math.max(120, specialistBudget - 200));
      }
    } else {
      instructions = loadAgentInstructions(agent, homeDir, Math.max(120, specialistBudget - 120));
    }

    const specialistBlock = buildSpecialistDirective(agent, effectiveMode, instructions, specialistBudget);
    if (specialistBlock) {
      specialistStep = { ephemeralMessage: specialistBlock };
    }
  }

  output.injectSteps.push(...fixedStepsBeforeSpecialist);
  if (specialistStep) output.injectSteps.push(specialistStep);
  output.injectSteps.push(...fixedStepsAfterSpecialist);

  enforceTotalBudget(output.injectSteps, MAX_FULL_INJECT_CHARS);

  persistState(
    {
      lastUserTurnKey: userTurnKey,
      lastStateHash: stateHash,
      turnsSinceFullInject: 0
    },
    effectiveMode
  );

  // Phase 4: Badge spawning is debounced out of PreInvocation (runs only in PostInvocation / Stop)
  return output;
}

/**
 * Handle PostInvocation hook payload and return protojson-compliant output.
 */
export function handlePostInvocation(payload, options = {}) {
  updateUiBadge(payload?.transcriptPath || '', options);
  return {
    injectSteps: [],
    terminationBehavior: ''
  };
}

/**
 * Handle Stop hook payload and return protojson-compliant StopHookOutput.
 */
export function handleStop(payload, options = {}) {
  updateUiBadge(payload?.transcriptPath || '', options);
  return {
    decision: 'allow_stop'
  };
}

/**
 * Dispatch hook execution based on CLI arguments and stdin text.
 */
export function runHook(argv = [], rawStdin = '', options = {}) {
  const isPost = argv.includes('--post');
  const isStop = argv.includes('--stop');
  const payload = parseHookPayload(rawStdin);

  if (isStop) {
    return handleStop(payload, options);
  }
  if (isPost) {
    return handlePostInvocation(payload, options);
  }
  return handlePreInvocation(payload, options);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const argv = process.argv.slice(2);
  let rawStdin = '';
  try {
    rawStdin = await readStdin();
  } catch {
    rawStdin = '';
  }

  const output = runHook(argv, rawStdin);
  process.stdout.write(JSON.stringify(output) + '\n');
}

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename);
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  main().catch(() => {
    const isStop = process.argv.slice(2).includes('--stop');
    const fallback = isStop
      ? { decision: 'allow_stop' }
      : { injectSteps: [], terminationBehavior: '' };
    process.stdout.write(JSON.stringify(fallback) + '\n');
  });
}
