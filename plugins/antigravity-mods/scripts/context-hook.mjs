#!/usr/bin/env node
/**
 * Antigravity Native Lifecycle Hook & Telemetry Engine
 * Plugin: antigravity-mods
 * Runtime: Node.js (ESM) - Zero External Dependencies
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HOME_DIR = os.homedir();
const DEFAULT_ACTIVE_AGENTS_PATH = path.join(DEFAULT_HOME_DIR, '.gemini', 'config', 'mods', 'active_agents.json');
const DASHBOARD_LINK = '[Abrir Dashboard](sidecar://antigravity-mods/dashboard/)';
const PLAN_ROLES = new Set(['lead-architect', 'product-manager', 'context-distiller']);

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

/**
 * Calculate estimated tokens and context metrics from the conversation transcript.
 */
export function calculateContext(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

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
    return null;
  }

  let steps = 0;
  let totalChars = 0;

  try {
    const content = stripBom(fs.readFileSync(targetPath, 'utf-8'));
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = stripBom(lines[i]).trim();
      if (!line) continue;
      steps++;

      if (line.includes('"CHECKPOINT"')) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'CHECKPOINT') {
            totalChars = line.length;
            continue;
          }
        } catch {}
      }
      totalChars += line.length;
    }
  } catch {
    totalChars = totalBytes;
  }

  const estTokens = Math.floor(totalChars / 3.8);
  const limit1M = 1_000_000;
  const pct = (estTokens / limit1M) * 100;

  return {
    tokens: estTokens,
    steps,
    sizeKb: Math.round((totalBytes / 1024) * 10) / 10,
    percentage: Math.round(pct * 100) / 100
  };
}

/**
 * Extract the latest user prompt (prefers native payload.lastUserInput).
 */
export function getLastUserPrompt(transcriptPath, payload) {
  if (payload?.lastUserInput && typeof payload.lastUserInput === 'string') {
    const clean = payload.lastUserInput.replace(/<[^>]+>/g, '').trim();
    if (clean) return clean;
  }

  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';

  try {
    const content = stripBom(fs.readFileSync(transcriptPath, 'utf-8'));
    const lines = content.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = stripBom(lines[i]).trim();
      if (!line) continue;
      if (line.includes('"USER_INPUT"') || line.includes('"USER_EXPLICIT"')) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'USER_INPUT' || data.source === 'USER_EXPLICIT') {
            const raw = data.content || '';
            const clean = typeof raw === 'string' ? raw.replace(/<[^>]+>/g, '').trim() : '';
            if (clean) return clean;
          }
        } catch {}
      }
    }
  } catch {}
  return '';
}

/**
 * Dynamic heuristic classifier for PLAN vs BUILD mode.
 */
export function classifyPlanVsBuild(transcriptPath, prompt) {
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    const editingTools = new Set(['edit_file', 'write_file']);
    const buildCmdPattern = /\b(?:npm\s+(?:test|run\s+build|build)|git\s+commit|node\s+build|tsc|cargo\s+build)\b/i;

    try {
      const content = stripBom(fs.readFileSync(transcriptPath, 'utf-8'));
      const lines = content.split('\n');
      let hasEdited = false;

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = stripBom(lines[i]).trim();
        if (!line) continue;

        if (line.includes('"USER_INPUT"') || line.includes('"USER_EXPLICIT"')) {
          break;
        }

        if (line.includes('tool_calls') || line.includes('toolCall')) {
          try {
            const data = JSON.parse(line);
            const toolCalls = data.tool_calls || data.toolCalls || [];
            for (const tc of toolCalls) {
              const name = tc.name || '';
              if (editingTools.has(name)) {
                hasEdited = true;
                break;
              }
              if (name === 'run_command') {
                const cmd = tc.args?.CommandLine || tc.args?.command || '';
                if (buildCmdPattern.test(cmd)) {
                  hasEdited = true;
                  break;
                }
              }
            }
            if (hasEdited) break;
          } catch {}
        }
      }

      if (hasEdited) return 'BUILD';
    } catch {}
  }

  if (!prompt) return 'PLAN';

  const planPattern = /\b(?:diseñ|plan|arquitect|estructur|diagram|rfc|adr|evalu|compar|como\s+(?:hacer|estructurar|abordar|organizar)|analiz|estrateg|roadmap|criterio|decision|flujo|explic|por\s*qu[eé]|evaluaci[oó]n|diagn[oó]stic)/i;
  const buildPattern = /\b(?:implement|escrib|crea|agreg|corrig|arregl|fix|refactor|test|prueb|npm|git\s+commit|ejecut|corr|instal|modific|edit|program|actualiz|agrega|elimina|borra)/i;

  const hasPlan = planPattern.test(prompt);
  const hasBuild = buildPattern.test(prompt);

  if (hasBuild && !hasPlan) return 'BUILD';
  if (hasPlan && !hasBuild) return 'PLAN';

  const pLower = prompt.toLowerCase();
  const planStarters = ['cómo', 'como', 'por qué', 'porque', 'explica', 'cuál', 'cual', 'analiza', 'revisa'];
  if (planStarters.some(w => pLower.startsWith(w))) return 'PLAN';

  const buildStarters = ['haz', 'crea', 'agrega', 'modifica', 'corrige', 'ejecuta', 'implementa'];
  if (buildStarters.some(w => pLower.startsWith(w))) return 'BUILD';

  return hasBuild ? 'BUILD' : 'PLAN';
}

export function getActiveAgent(conversationId, activeAgentsPath = DEFAULT_ACTIVE_AGENTS_PATH) {
  if (!conversationId || !activeAgentsPath || !fs.existsSync(activeAgentsPath)) return null;
  try {
    const data = JSON.parse(stripBom(fs.readFileSync(activeAgentsPath, 'utf-8')));
    const agent = data[conversationId];
    if (agent && agent.id && agent.id !== 'default' && agent.name !== 'Sin Agente') {
      return agent;
    }
  } catch {}
  return null;
}

export function updateAgentEffectiveMode(conversationId, effectiveMode, activeAgentsPath = DEFAULT_ACTIVE_AGENTS_PATH) {
  if (!conversationId || !activeAgentsPath) return;
  try {
    let data = {};
    if (fs.existsSync(activeAgentsPath)) {
      data = JSON.parse(stripBom(fs.readFileSync(activeAgentsPath, 'utf-8')));
    }
    if (data[conversationId]) {
      data[conversationId].effectiveMode = effectiveMode;
      fs.writeFileSync(activeAgentsPath, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch {}
}

export function loadAgentInstructions(agent, homeDir = DEFAULT_HOME_DIR) {
  if (!agent) return null;

  if (agent.filePath && fs.existsSync(agent.filePath)) {
    try {
      return fs.readFileSync(agent.filePath, 'utf-8').trim();
    } catch {}
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
        try {
          return fs.readFileSync(cand, 'utf-8').trim();
        } catch {}
      }
    }
  }

  return null;
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

function buildSpecialistDirective(agent, effectiveMode, instructions) {
  const agentId = agent.id || '';

  if (agentId === 'auto') {
    if (effectiveMode === 'PLAN') {
      return (
        '[CLASSIFIED MODE: PLANNER (LEAD ARCHITECT)]\n' +
        '[PERMISSIONS POLICY: REQUEST REVIEW / SAFE PLANNING]\n' +
        'Status: Active in Architectural Planning Mode.\n\n' +
        'PERMISSIONS & CONSTRAINTS:\n' +
        '1. Focus strictly on system design, hexagonal boundaries, contracts, and trade-offs.\n' +
        '2. Do NOT execute destructive mutations (file deletes, permanent overwrites, blind commits) without explicit confirmation.\n' +
        '3. When code changes are needed, formulate the plan and ask the user to proceed before entering implementation.\n\n' +
        '--- SPECIALIST DIRECTIVES ---\n' +
        (instructions || 'Operate as Lead Architect.') + '\n' +
        '--- END SPECIALIST DIRECTIVES ---'
      );
    }

    return (
      '[CLASSIFIED MODE: BUILDER (SDD ORCHESTRATOR)]\n' +
      '[PERMISSIONS POLICY: TURBO BUILD / TDD EXECUTION]\n' +
      'Status: Active in Spec-Driven Implementation Mode.\n\n' +
      'PERMISSIONS & CONSTRAINTS:\n' +
      '1. Execute changes following Spec-Driven Development (Red-Green-Refactor).\n' +
      '2. You are authorized to write code, edit files, and execute verification commands (npm test).\n' +
      '3. Ensure all tests pass with zero broken commits and atomic changes.\n\n' +
      '--- SPECIALIST DIRECTIVES ---\n' +
      (instructions || 'Operate as SDD Orchestrator.') + '\n' +
      '--- END SPECIALIST DIRECTIVES ---'
    );
  }

  if (!instructions) return null;

  const permPolicy = effectiveMode === 'PLAN' ? 'REQUEST REVIEW' : 'TURBO BUILD';
  return (
    `[ACTIVE SPECIALIST ROLE: ${agent.name || 'Specialist'}]\n` +
    `[PERMISSIONS POLICY: ${permPolicy}]\n` +
    `Operating under the direct authority of ${agent.name || 'Specialist'}.\n\n` +
    '--- SPECIALIST DIRECTIVES ---\n' +
    instructions + '\n' +
    '--- END SPECIALIST DIRECTIVES ---'
  );
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
  const activeAgentsPath = options.activeAgentsPath || DEFAULT_ACTIVE_AGENTS_PATH;
  const conversationId = payload?.conversationId || '';
  const transcriptPath = payload?.transcriptPath || '';

  const info = calculateContext(transcriptPath);
  const lastPrompt = getLastUserPrompt(transcriptPath, payload);
  const output = {
    injectSteps: [],
    terminationBehavior: ''
  };

  const agent = getActiveAgent(conversationId, activeAgentsPath);
  if (agent) {
    const agentId = agent.id || '';
    let effectiveMode;
    let targetAgentForInstructions = agent;

    if (agentId === 'auto') {
      effectiveMode = classifyPlanVsBuild(transcriptPath, lastPrompt);
      targetAgentForInstructions = effectiveMode === 'PLAN'
        ? {
            id: 'lead-architect',
            name: 'Lead Architect',
            filePath: path.join(homeDir, '.gemini', 'antigravity', 'scratch', 'architecture-vault', 'Agente Orquestador.md')
          }
        : {
            id: 'sdd-orchestrator',
            name: 'SDD Orchestrator',
            filePath: path.join(homeDir, '.gemini', 'config', 'skills', 'sdd-orchestrator', 'SKILL.md')
          };
    } else {
      effectiveMode = PLAN_ROLES.has(agentId) ? 'PLAN' : 'BUILD';
    }

    updateAgentEffectiveMode(conversationId, effectiveMode, activeAgentsPath);
    const instructions = loadAgentInstructions(targetAgentForInstructions, homeDir);
    const specialistBlock = buildSpecialistDirective(agent, effectiveMode, instructions);
    if (specialistBlock) {
      output.injectSteps.push({
        ephemeralMessage: specialistBlock
      });
    }
  }

  if (info) {
    const formattedTokens = info.tokens.toLocaleString('en-US');
    const notice = `[CONTEXT MONITOR]: ~${formattedTokens} tokens usados (${info.percentage}% de 1M) | ${info.steps} pasos | ${info.sizeKb} KB · ${DASHBOARD_LINK}`;
    output.injectSteps.push({
      ephemeralMessage: notice
    });
  }

  updateUiBadge(transcriptPath, options);
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
