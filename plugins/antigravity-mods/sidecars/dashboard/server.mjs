import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

/**
 * Antigravity Mods & Telemetry Native Sidecar Server.
 * Binds exclusively on 127.0.0.1 using ANTIGRAVITY_SIDECAR_WEB_PORT (with PORT/8790 fallback).
 */

export const ALLOWED_MODES = new Set(['PLAN', 'BUILD', 'AUTO']);

export const AGENT_CATALOG = [
  { id: 'auto', name: 'Auto (Plan/Build)', color: 'hsl(265, 89%, 66%)', level: 'AUTO', role: 'Dynamic Plan/Build Router' },
  { id: 'default', name: 'Standard Assistant', color: 'hsl(215, 20%, 65%)', level: 'DEFAULT', role: 'General Antigravity Mode' },
  { id: 'lead-architect', name: 'Lead Architect', color: 'hsl(199, 89%, 60%)', level: 'PLANNER', role: 'Hexagonal & System Architecture' },
  { id: 'sdd-orchestrator', name: 'SDD Orchestrator', color: 'hsl(215, 90%, 60%)', level: 'BUILDER', role: 'Spec-Driven TDD Execution' },
  { id: 'product-manager', name: 'Product Manager', color: 'hsl(271, 91%, 65%)', level: 'DISCOVERY', role: 'Requirements & PRD' },
  { id: 'scrum-master', name: 'Scrum Master', color: 'hsl(330, 81%, 60%)', level: 'DELIVERY', role: 'Epics & Backlog Refinement' },
  { id: 'code-reviewer', name: 'Code Reviewer', color: 'hsl(158, 64%, 52%)', level: 'QUALITY', role: 'Clean Architecture & PR Gates' },
  { id: 'security-engineer', name: 'Security Engineer', color: 'hsl(12, 88%, 59%)', level: 'SECURITY', role: 'OWASP & Zero Trust Hardening' },
  { id: 'devops-cloud', name: 'DevOps & Cloud', color: 'hsl(38, 92%, 50%)', level: 'INFRA', role: 'CI/CD & Observability' }
];

const DEFAULT_TOKEN_LIMIT = 1_000_000;
const CHARS_PER_TOKEN = 3.8;
const MAX_BODY_BYTES = 64 * 1024;
const SAFE_CASCADE_ID_RE = /^[a-zA-Z0-9_-]{3,128}$/;
const SAFE_AGENT_KEY_RE = /^(?!.*\.\.)[a-zA-Z0-9_./-]{1,200}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Resolves the loopback HTTP port assigned by Antigravity sidecar runtime.
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env=process.env]
 * @returns {number}
 */
export function resolvePort(env = process.env) {
  const raw = env?.ANTIGRAVITY_SIDECAR_WEB_PORT || env?.PORT || '8790';
  const parsed = Number.parseInt(String(raw), 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed;
  }
  return 8790;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 10_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return tokens.toLocaleString('en-US');
}

function getTranscriptFileInDir(convDir) {
  const logsDir = path.join(convDir, '.system_generated', 'logs');
  const compact = path.join(logsDir, 'transcript.jsonl');
  const full = path.join(logsDir, 'transcript_full.jsonl');

  if (fs.existsSync(compact)) {
    return { chosen: compact, mtime: fs.statSync(compact).mtimeMs };
  }
  if (fs.existsSync(full)) {
    return { chosen: full, mtime: fs.statSync(full).mtimeMs };
  }
  return null;
}

/**
 * Resolves either the requested cascadeId transcript or the most recently modified transcript in brainDir.
 * @param {string} brainDir
 * @param {string|null} [cascadeId=null]
 * @returns {{ id: string, chosen: string, mtime: number } | null}
 */
export function resolveTranscript(brainDir, cascadeId = null) {
  if (!brainDir || !fs.existsSync(brainDir)) return null;

  if (cascadeId && SAFE_CASCADE_ID_RE.test(cascadeId)) {
    const requestedDir = path.join(brainDir, cascadeId);
    if (fs.existsSync(requestedDir)) {
      try {
        const hit = getTranscriptFileInDir(requestedDir);
        if (hit) {
          return { id: cascadeId, chosen: hit.chosen, mtime: hit.mtime };
        }
      } catch {
        // Fallback to latest transcript scan
      }
    }
  }

  try {
    const entries = fs.readdirSync(brainDir, { withFileTypes: true });
    const candidates = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/^[0-9a-fA-F-]{8,}$/.test(entry.name)) continue;
      const hit = getTranscriptFileInDir(path.join(brainDir, entry.name));
      if (hit) {
        candidates.push({ id: entry.name, chosen: hit.chosen, mtime: hit.mtime });
      }
    }

    candidates.sort((a, b) => b.mtime - a.mtime);
    return candidates.length > 0 ? candidates[0] : null;
  } catch {
    return null;
  }
}

/**
 * Parses a JSONL transcript into context telemetry metrics.
 * @param {string|null} targetPath
 * @returns {Object}
 */
export function parseTranscript(targetPath) {
  const empty = {
    tokens: 0,
    estTokens: 0,
    displayTokens: '0',
    steps: 0,
    percentage: '0.0',
    sizeKb: 0,
    model: 'Gemini 3.8 Flash',
    breakdown: { user: 0, model: 0, thinking: 0, tools: 0 }
  };

  if (!targetPath || !fs.existsSync(targetPath)) {
    return empty;
  }

  try {
    const stat = fs.statSync(targetPath);
    const content = fs.readFileSync(targetPath, 'utf-8');
    const lines = content.split('\n');

    let totalChars = 0;
    let steps = 0;
    let userChars = 0;
    let modelChars = 0;
    let thinkingChars = 0;
    let toolsChars = 0;
    let detectedModel = '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      steps++;

      try {
        const obj = JSON.parse(line);
        if (obj.type === 'CHECKPOINT') {
          totalChars = line.length;
          userChars = 0;
          modelChars = 0;
          thinkingChars = 0;
          toolsChars = 0;
        } else {
          totalChars += line.length;
        }

        if (typeof obj.model === 'string' && obj.model.trim()) {
          detectedModel = obj.model.trim();
        }
        if (typeof obj.thinking === 'string') thinkingChars += obj.thinking.length;
        if (obj.tool_calls) toolsChars += JSON.stringify(obj.tool_calls).length;
        if (obj.type === 'USER_INPUT' && typeof obj.content === 'string') userChars += obj.content.length;
        if (obj.type === 'PLANNER_RESPONSE' && typeof obj.content === 'string') modelChars += obj.content.length;
      } catch {
        totalChars += line.length;
      }
    }

    const tokens = Math.round(totalChars / CHARS_PER_TOKEN);
    const pct = Math.min(100, (tokens / DEFAULT_TOKEN_LIMIT) * 100).toFixed(1);

    return {
      tokens,
      estTokens: tokens,
      displayTokens: formatTokens(tokens),
      steps,
      percentage: pct,
      sizeKb: Math.round(stat.size / 1024),
      model: detectedModel || 'Gemini 3.8 Flash',
      breakdown: {
        user: Math.round(userChars / CHARS_PER_TOKEN),
        model: Math.round(modelChars / CHARS_PER_TOKEN),
        thinking: Math.round(thinkingChars / CHARS_PER_TOKEN),
        tools: Math.round(toolsChars / CHARS_PER_TOKEN)
      }
    };
  } catch {
    return empty;
  }
}

/**
 * Reads active agents map from disk.
 * @param {string} filePath
 * @returns {Record<string, Object>}
 */
export function readActiveAgents(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
  } catch {
    // Ignore malformed file and recover with empty object
  }
  return {};
}

/**
 * Atomically writes active agents map to disk.
 * @param {string} filePath
 * @param {Record<string, Object>} data
 */
export function writeActiveAgents(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const serialized = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    fs.writeFileSync(filePath, serialized, 'utf-8');
  }
}

function normalizeRepoPath(candidate, fallback) {
  if (!candidate || typeof candidate !== 'string') return fallback;
  let resolved = candidate.trim();
  if (resolved.startsWith('file://')) {
    try {
      resolved = fileURLToPath(resolved);
    } catch {
      resolved = decodeURIComponent(resolved.replace(/^file:\/\//i, '')).replace(/^\/([a-zA-Z]:)/, '$1');
    }
  }
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {}
  return fallback;
}

/**
 * Collects git status, branches, and recent commits safely via execFile.
 * @param {string} repoPath
 * @returns {Promise<Object>}
 */
export async function getVcsStatus(repoPath) {
  const empty = {
    isRepo: false,
    repoPath,
    branch: '',
    upstream: '',
    ahead: 0,
    behind: 0,
    isClean: true,
    dirtyCount: 0,
    changedFiles: [],
    branches: [],
    commits: []
  };

  if (!repoPath || !fs.existsSync(repoPath)) {
    return empty;
  }

  try {
    const execOpts = { cwd: repoPath, encoding: 'utf-8', timeout: 3000, windowsHide: true };
    const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain=v1', '--branch'], execOpts);
    const statusLines = statusOut.split(/\r?\n/).filter(Boolean);

    let branch = 'HEAD';
    let upstream = '';
    let ahead = 0;
    let behind = 0;
    const changedFiles = [];

    for (const line of statusLines) {
      if (line.startsWith('## ')) {
        const header = line.slice(3);
        const [branchPart, countsPart] = header.split(' [');
        const [localBranch, remoteBranch] = branchPart.split('...');
        branch = (localBranch || 'HEAD').replace(/^No commits yet on /, '').trim();
        upstream = (remoteBranch || '').trim();
        if (countsPart) {
          const aheadMatch = countsPart.match(/ahead (\d+)/);
          const behindMatch = countsPart.match(/behind (\d+)/);
          if (aheadMatch) ahead = Number.parseInt(aheadMatch[1], 10);
          if (behindMatch) behind = Number.parseInt(behindMatch[1], 10);
        }
      } else if (line.length >= 3) {
        changedFiles.push({
          code: line.slice(0, 2).trim() || 'M',
          file: line.slice(3).trim()
        });
      }
    }

    const { stdout: logOut } = await execFileAsync(
      'git',
      ['log', '-n', '12', '--pretty=format:%H%x1f%h%x1f%an%x1f%ar%x1f%s%x1f%P%x1f%D'],
      execOpts
    );

    const commits = logOut
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        const [hash, shortHash, author, relativeDate, subject, parentsRaw, refsRaw] = line.split('\x1f');
        const parents = (parentsRaw || '').split(' ').filter(Boolean);
        const refs = (refsRaw || '')
          .split(',')
          .map(r => r.trim())
          .filter(Boolean);
        return {
          hash,
          shortHash,
          author,
          relativeDate,
          subject,
          parents,
          refs,
          lane: parents.length > 1 ? 1 : (index > 0 && refs.some(r => r.includes('HEAD')) ? 0 : 0)
        };
      });

    // Assign lightweight topological lane indices based on parent continuity
    const activeLanes = [];
    for (const commit of commits) {
      let lane = activeLanes.indexOf(commit.hash);
      if (lane === -1) {
        lane = 0;
        activeLanes.unshift(commit.hash);
      }
      commit.lane = Math.min(lane, 3);
      activeLanes.splice(lane, 1, ...(commit.parents.length ? commit.parents : []));
      // Deduplicate active lanes while preserving order
      const seen = new Set();
      for (let i = activeLanes.length - 1; i >= 0; i--) {
        if (seen.has(activeLanes[i])) {
          activeLanes.splice(i, 1);
        } else {
          seen.add(activeLanes[i]);
        }
      }
    }

    let branches = [];
    try {
      const { stdout: branchOut } = await execFileAsync(
        'git',
        ['branch', '--format=%(refname:short)|%(HEAD)'],
        execOpts
      );
      branches = branchOut
        .split(/\r?\n/)
        .filter(Boolean)
        .map(row => {
          const [name, head] = row.split('|');
          return { name, current: head === '*' };
        });
    } catch {}

    return {
      isRepo: true,
      repoPath,
      branch,
      upstream,
      ahead,
      behind,
      isClean: changedFiles.length === 0,
      dirtyCount: changedFiles.length,
      changedFiles: changedFiles.slice(0, 20),
      branches,
      commits
    };
  } catch {
    return empty;
  }
}

function renderTachometerSvg(pctValue) {
  const numeric = Number.parseFloat(pctValue) || 0;
  const clamped = Math.min(Math.max(numeric, 0), 100);
  const angle = -120 + (clamped / 100) * 240;

  let needleColor = '#22c55e';
  if (clamped >= 85) needleColor = '#ef4444';
  else if (clamped >= 60) needleColor = '#f97316';
  else if (clamped >= 25) needleColor = '#eab308';

  return `<svg id="tachometer-svg" viewBox="0 0 120 98" width="112" height="92" aria-label="Context Tachometer Gauge">
    <defs>
      <linearGradient id="modsGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#22c55e" />
        <stop offset="38%" stop-color="#eab308" />
        <stop offset="72%" stop-color="#f97316" />
        <stop offset="100%" stop-color="#ef4444" />
      </linearGradient>
    </defs>
    <path d="M 22.6 74 A 42 42 0 1 1 97.4 74" fill="none" stroke="rgba(148,163,184,0.22)" stroke-width="10" stroke-linecap="round" />
    <path d="M 22.6 74 A 42 42 0 1 1 97.4 74" fill="none" stroke="url(#modsGaugeGrad)" stroke-width="10" stroke-linecap="round" />
    <g id="tachometer-needle" style="transform-origin: 60px 56px; transform: rotate(${angle.toFixed(1)}deg); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);">
      <polygon points="56.5,56 60,16 63.5,56" fill="${needleColor}" />
    </g>
    <circle cx="60" cy="56" r="8.5" fill="var(--card, #131b2e)" stroke="var(--foreground, #f8fafc)" stroke-width="2" />
    <circle cx="60" cy="56" r="3" fill="var(--foreground, #f8fafc)" />
    <text id="tachometer-svg-pct" x="60" y="88" text-anchor="middle" font-size="12" font-weight="700" font-family="ui-monospace, monospace" fill="var(--foreground, #f8fafc)">${escapeHtml(clamped.toFixed(1))}%</text>
  </svg>`;
}

function renderGitGraphRows(vcs) {
  if (!vcs?.isRepo) {
    return '<p class="text-[11px] text-[var(--muted-foreground)]">No git repository detected for active workspace.</p>';
  }
  const commits = Array.isArray(vcs.commits) ? vcs.commits : [];
  if (commits.length === 0) {
    return '<p class="text-[11px] text-[var(--muted-foreground)]">No commits found.</p>';
  }

  const laneColors = ['#38bdf8', '#a855f7', '#22c55e', '#f59e0b'];
  return commits
    .slice(0, 8)
    .map((c, idx) => {
      const lane = c.lane || 0;
      const color = laneColors[lane % laneColors.length];
      const cx = 10 + lane * 14;
      const refsHtml = (c.refs || [])
        .slice(0, 2)
        .map(ref => `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono border border-[var(--border)] bg-black/20">${escapeHtml(ref)}</span>`)
        .join(' ');
      return `<div class="flex items-center gap-2 py-1 border-b border-[var(--border)] last:border-b-0">
        <svg width="46" height="22" viewBox="0 0 46 22" class="shrink-0" aria-hidden="true">
          ${idx < commits.length - 1 ? `<line x1="${cx}" y1="11" x2="${cx}" y2="22" stroke="${color}" stroke-width="2" stroke-opacity="0.65" />` : ''}
          ${idx > 0 ? `<line x1="${cx}" y1="0" x2="${cx}" y2="11" stroke="${color}" stroke-width="2" stroke-opacity="0.65" />` : ''}
          <circle cx="${cx}" cy="11" r="4.2" fill="${color}" stroke="var(--card)" stroke-width="1.5" />
        </svg>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-mono text-[10px] text-sky-400">${escapeHtml(c.shortHash)}</span>
            ${refsHtml}
            <span class="truncate text-[11px] font-medium">${escapeHtml(c.subject)}</span>
          </div>
          <div class="text-[10px] text-[var(--muted-foreground)] truncate">${escapeHtml(c.author)} · ${escapeHtml(c.relativeDate)}</div>
        </div>
      </div>`;
    })
    .join('');
}

/**
 * Renders the unified Antigravity Mods & Telemetry Dashboard HTML.
 * Uses Antigravity's CSP-allowed Tailwind build and host CSS variables with standalone fallbacks.
 * @param {Object} state
 * @returns {string}
 */
export function renderDashboardHtml(state = {}) {
  const telemetry = state.telemetry || parseTranscript(null);
  const activeAgents = state.activeAgents || {};
  const cascadeId = state.cascadeId || Object.keys(activeAgents)[0] || 'default';
  const agentInfo = activeAgents[cascadeId] || {
    id: 'auto',
    name: 'Auto (Plan/Build)',
    effectiveMode: 'PLAN',
    caveman: false,
    modifiers: { caveman: false }
  };
  const vcs = state.vcs || { isRepo: false, branch: '', dirtyCount: 0, commits: [] };
  const voice = state.voice || { online: false, voiceHubUrl: 'http://127.0.0.1:8765' };

  const currentMode = (agentInfo.mode || agentInfo.effectiveMode || 'PLAN').toUpperCase();
  const cavemanEnabled = Boolean(agentInfo.caveman ?? agentInfo.modifiers?.caveman);
  const totalBreakdown = Math.max(1, telemetry.tokens || 0);
  const userPct = ((telemetry.breakdown?.user || 0) / totalBreakdown) * 100;
  const modelPct = ((telemetry.breakdown?.model || 0) / totalBreakdown) * 100;
  const thinkingPct = ((telemetry.breakdown?.thinking || 0) / totalBreakdown) * 100;
  const toolsPct = ((telemetry.breakdown?.tools || 0) / totalBreakdown) * 100;

  const agentOptions = AGENT_CATALOG.map(a => {
    const selected = a.id === agentInfo.id ? 'selected' : '';
    return `<option value="${escapeHtml(a.id)}" ${selected}>${escapeHtml(a.name)} [${escapeHtml(a.level)}]</option>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity Mods &amp; Telemetría</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    :root {
      --background: #090d16;
      --card: #131b2e;
      --border: rgba(255, 255, 255, 0.12);
      --foreground: #f8fafc;
      --muted-foreground: #94a3b8;
      --accent: #38bdf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 14px;
      background-color: var(--background);
      color: var(--foreground);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }
    .mods-card {
      background-color: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
    }
    .mods-btn {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      background: rgba(148, 163, 184, 0.08);
      color: var(--foreground);
      transition: all 0.15s ease;
    }
    .mods-btn:hover { border-color: var(--accent); }
    .mods-btn-active {
      background: rgba(56, 189, 248, 0.18);
      border-color: #38bdf8;
      color: #38bdf8;
    }
  </style>
</head>
<body class="space-y-3">
  <header class="flex items-center justify-between pb-2.5 border-b border-[var(--border)]">
    <div class="min-w-0">
      <h1 class="text-sm font-bold tracking-tight flex items-center gap-2">
        <span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
        <span>Antigravity Mods &amp; Telemetría</span>
      </h1>
      <p id="cascade-subtitle" class="text-[11px] text-[var(--muted-foreground)] font-mono truncate">
        Cascade: ${escapeHtml(cascadeId)}
      </p>
    </div>
    <div class="flex items-center gap-1.5">
      <button id="refresh-all-btn" type="button" class="mods-btn" title="Refrescar telemetría">↻ Sync</button>
      <span class="px-2 py-0.5 rounded text-[10px] font-mono border border-[var(--border)] text-[var(--muted-foreground)]">v2.1.0</span>
    </div>
  </header>

  <main class="grid grid-cols-1 gap-3">
    <!-- 1. Context Tachometer Card -->
    <section class="mods-card space-y-2.5" aria-label="Tacómetro de Contexto">
      <div class="flex items-center justify-between">
        <span class="font-semibold">Tacómetro de Contexto</span>
        <span id="telemetry-pct-badge" class="font-mono text-emerald-400 font-bold">${escapeHtml(telemetry.percentage)}% de 1M</span>
      </div>

      <div class="flex flex-col sm:flex-row items-center gap-3">
        <div id="tachometer-mount" class="shrink-0 flex items-center justify-center">
          ${renderTachometerSvg(telemetry.percentage)}
        </div>
        <div class="w-full grid grid-cols-2 gap-2 font-mono text-[11px]">
          <div class="p-2 rounded border border-[var(--border)] bg-black/20">
            <span class="text-[var(--muted-foreground)] block text-[10px]">Tokens Est.</span>
            <span id="telemetry-tokens" class="font-bold">${escapeHtml((telemetry.tokens || 0).toLocaleString('en-US'))}</span>
          </div>
          <div class="p-2 rounded border border-[var(--border)] bg-black/20">
            <span class="text-[var(--muted-foreground)] block text-[10px]">Pasos / Tamaño</span>
            <span id="telemetry-steps" class="font-bold">${escapeHtml(telemetry.steps)} (${escapeHtml(telemetry.sizeKb)} KB)</span>
          </div>
          <div class="col-span-2">
            <div class="flex justify-between text-[10px] text-[var(--muted-foreground)] mb-1">
              <span>Distribución (User / Model / Think / Tools)</span>
              <span id="telemetry-model">${escapeHtml(telemetry.model || 'Gemini 3.8 Flash')}</span>
            </div>
            <div class="flex h-2 rounded-full overflow-hidden bg-black/30 border border-[var(--border)]">
              <div id="bar-user" style="width: ${userPct.toFixed(1)}%" class="bg-sky-400" title="User"></div>
              <div id="bar-model" style="width: ${modelPct.toFixed(1)}%" class="bg-purple-400" title="Model"></div>
              <div id="bar-thinking" style="width: ${thinkingPct.toFixed(1)}%" class="bg-amber-400" title="Thinking"></div>
              <div id="bar-tools" style="width: ${toolsPct.toFixed(1)}%" class="bg-emerald-400" title="Tools"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. Agent Selector Card -->
    <section class="mods-card space-y-2.5" aria-label="Selector de Agente y Modo">
      <div class="flex items-center justify-between gap-2">
        <span class="font-semibold">Selector Jerárquico de Agentes</span>
        <span id="active-mode-pill" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-[var(--border)]">
          MODO ${escapeHtml(currentMode)}
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Modo de operación">
        <button type="button" data-mode="PLAN" class="mods-btn mode-btn ${currentMode === 'PLAN' ? 'mods-btn-active' : ''}">PLAN</button>
        <button type="button" data-mode="BUILD" class="mods-btn mode-btn ${currentMode === 'BUILD' ? 'mods-btn-active' : ''}">BUILD</button>
        <button type="button" data-mode="AUTO" class="mods-btn mode-btn ${currentMode === 'AUTO' ? 'mods-btn-active' : ''}">AUTO</button>
        <button id="caveman-toggle-btn" type="button" class="mods-btn ml-auto ${cavemanEnabled ? 'mods-btn-active' : ''}" aria-pressed="${cavemanEnabled ? 'true' : 'false'}">
          Caveman: ${cavemanEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div class="flex items-center gap-2">
        <select id="agent-select" class="w-full rounded px-2.5 py-1.5 text-[11px] bg-black/25 border border-[var(--border)] text-[var(--foreground)]">
          ${agentOptions}
        </select>
      </div>
      <p id="agent-status-msg" class="text-[10px] text-[var(--muted-foreground)]">
        Activo: ${escapeHtml(agentInfo.name || 'Auto (Plan/Build)')} · Effective: ${escapeHtml(agentInfo.effectiveMode || currentMode)}
      </p>
    </section>

    <!-- 3. Git Graph & VCS Card -->
    <section class="mods-card space-y-2" aria-label="Git Graph y Estado VCS">
      <div class="flex items-center justify-between gap-2">
        <span class="font-semibold">Git Graph &amp; VCS</span>
        <div class="flex items-center gap-1.5 font-mono text-[10px]">
          <span id="vcs-branch-badge" class="px-2 py-0.5 rounded border border-[var(--border)] text-sky-400">
            ${escapeHtml(vcs.isRepo ? vcs.branch : 'no-repo')}
          </span>
          <span id="vcs-dirty-badge" class="text-[var(--muted-foreground)]">
            ${vcs.isRepo ? `${vcs.dirtyCount} cambios` : ''}
          </span>
        </div>
      </div>
      <div id="vcs-graph-list" class="max-h-56 overflow-y-auto pr-1">
        ${renderGitGraphRows(vcs)}
      </div>
    </section>

    <!-- 4. Voice Hub Card -->
    <section class="mods-card space-y-2" aria-label="Voice Hub Status">
      <div class="flex items-center justify-between">
        <span class="font-semibold">Voice Hub (127.0.0.1:8765)</span>
        <span id="voice-status-badge" class="text-[10px] font-mono ${voice.online ? 'text-emerald-400' : 'text-amber-400'}">
          ${voice.online ? '● Online' : '○ Offline'}
        </span>
      </div>
      <form id="voice-dispatch-form" class="flex items-center gap-2">
        <input id="voice-command-input" type="text" placeholder="Enviar comando de voz al Voice Hub..."
          class="flex-1 rounded px-2.5 py-1.5 text-[11px] bg-black/25 border border-[var(--border)] text-[var(--foreground)]" />
        <button type="submit" class="mods-btn">Enviar</button>
      </form>
      <p id="voice-feedback" class="text-[10px] text-[var(--muted-foreground)]">
        Puente nativo listo para Voice Hub &amp; Lifecycle Hooks.
      </p>
    </section>
  </main>

  <script>
    (function() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token') || '';
      let activeCascadeId = params.get('conversationId') || params.get('cascadeId') || ${safeJsonForScript(cascadeId)};
      let activeRepoPath = '';
      let cavemanState = ${safeJsonForScript(cavemanEnabled)};

      function esc(val) {
        return String(val ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function apiFetch(path, options) {
        const opts = Object.assign({}, options || {});
        const headers = new Headers(opts.headers || {});
        if (opts.method && opts.method.toUpperCase() !== 'GET') {
          headers.set('Content-Type', 'application/json');
        }
        if (token) {
          headers.set('X-Sidecar-Token', token);
        }
        opts.headers = headers;
        return fetch(path, opts);
      }

      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'theme-change' && msg.payload && msg.payload.cssVariables) {
          for (const [k, v] of Object.entries(msg.payload.cssVariables)) {
            document.documentElement.style.setProperty(k, v);
          }
        } else if (msg.type === 'workspace-change' && msg.payload && Array.isArray(msg.payload.workspaceUris)) {
          const first = msg.payload.workspaceUris[0] || '';
          if (first) {
            activeRepoPath = first;
            refreshVcs();
          }
        }
      });

      function updateTachometer(t) {
        if (!t) return;
        const pct = Math.min(100, Math.max(0, parseFloat(t.percentage) || 0));
        const angle = -120 + (pct / 100) * 240;
        const needleColor = pct >= 85 ? '#ef4444' : (pct >= 60 ? '#f97316' : (pct >= 25 ? '#eab308' : '#22c55e'));
        const needle = document.getElementById('tachometer-needle');
        if (needle) {
          needle.style.transform = 'rotate(' + angle.toFixed(1) + 'deg)';
          const poly = needle.querySelector('polygon');
          if (poly) poly.setAttribute('fill', needleColor);
        }
        const svgPct = document.getElementById('tachometer-svg-pct');
        if (svgPct) svgPct.textContent = pct.toFixed(1) + '%';
        const pctBadge = document.getElementById('telemetry-pct-badge');
        if (pctBadge) pctBadge.textContent = (t.percentage || '0.0') + '% de 1M';
        const tokEl = document.getElementById('telemetry-tokens');
        if (tokEl) tokEl.textContent = Number(t.tokens || 0).toLocaleString('en-US');
        const stepsEl = document.getElementById('telemetry-steps');
        if (stepsEl) stepsEl.textContent = (t.steps || 0) + ' (' + (t.sizeKb || 0) + ' KB)';
        const modelEl = document.getElementById('telemetry-model');
        if (modelEl && t.model) modelEl.textContent = t.model;

        const denom = Math.max(1, t.tokens || 0);
        const bd = t.breakdown || {};
        const setW = (id, v) => {
          const el = document.getElementById(id);
          if (el) el.style.width = (((v || 0) / denom) * 100).toFixed(1) + '%';
        };
        setW('bar-user', bd.user);
        setW('bar-model', bd.model);
        setW('bar-thinking', bd.thinking);
        setW('bar-tools', bd.tools);
      }

      async function refreshTelemetry() {
        try {
          const q = activeCascadeId ? '?cascadeId=' + encodeURIComponent(activeCascadeId) : '';
          const res = await apiFetch('/api/telemetry' + q);
          if (!res.ok) return;
          const data = await res.json();
          if (data.cascadeId) {
            activeCascadeId = data.cascadeId;
            const sub = document.getElementById('cascade-subtitle');
            if (sub) sub.textContent = 'Cascade: ' + activeCascadeId;
          }
          updateTachometer(data.telemetry);
        } catch {}
      }

      async function postAgentUpdate(payload) {
        try {
          const body = Object.assign({ cascadeId: activeCascadeId }, payload);
          const res = await apiFetch('/api/agents', {
            method: 'POST',
            body: JSON.stringify(body)
          });
          if (!res.ok) return;
          const data = await res.json();
          const a = data.agent || {};
          cavemanState = Boolean(a.caveman ?? a.modifiers?.caveman);
          const modeLabel = String(a.mode || a.effectiveMode || 'PLAN').toUpperCase();
          const pill = document.getElementById('active-mode-pill');
          if (pill) pill.textContent = 'MODO ' + modeLabel;
          document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('mods-btn-active', btn.dataset.mode === modeLabel);
          });
          const caveBtn = document.getElementById('caveman-toggle-btn');
          if (caveBtn) {
            caveBtn.classList.toggle('mods-btn-active', cavemanState);
            caveBtn.setAttribute('aria-pressed', String(cavemanState));
            caveBtn.textContent = 'Caveman: ' + (cavemanState ? 'ON' : 'OFF');
          }
          const sel = document.getElementById('agent-select');
          if (sel && a.id) sel.value = a.id;
          const statusMsg = document.getElementById('agent-status-msg');
          if (statusMsg) {
            statusMsg.textContent = 'Activo: ' + (a.name || a.id || 'Auto') + ' · Effective: ' + (a.effectiveMode || modeLabel);
          }
        } catch {}
      }

      async function refreshVcs() {
        try {
          const q = activeRepoPath ? '?repoPath=' + encodeURIComponent(activeRepoPath) : '';
          const res = await apiFetch('/api/vcs' + q);
          if (!res.ok) return;
          const vcs = await res.json();
          const b = document.getElementById('vcs-branch-badge');
          if (b) b.textContent = vcs.isRepo ? (vcs.branch || 'HEAD') : 'no-repo';
          const d = document.getElementById('vcs-dirty-badge');
          if (d) d.textContent = vcs.isRepo ? ((vcs.dirtyCount || 0) + ' cambios') : '';
          const list = document.getElementById('vcs-graph-list');
          if (list) {
            if (!vcs.isRepo || !Array.isArray(vcs.commits) || vcs.commits.length === 0) {
              list.innerHTML = '<p class="text-[11px] text-[var(--muted-foreground)]">No commits found.</p>';
              return;
            }
            const colors = ['#38bdf8', '#a855f7', '#22c55e', '#f59e0b'];
            list.innerHTML = vcs.commits.slice(0, 8).map((c, idx) => {
              const lane = c.lane || 0;
              const col = colors[lane % colors.length];
              const cx = 10 + lane * 14;
              const refs = (c.refs || []).slice(0, 2).map(r => '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono border border-[var(--border)] bg-black/20">' + esc(r) + '</span>').join(' ');
              return '<div class="flex items-center gap-2 py-1 border-b border-[var(--border)] last:border-b-0">' +
                '<svg width="46" height="22" viewBox="0 0 46 22" class="shrink-0">' +
                (idx < vcs.commits.length - 1 ? '<line x1="' + cx + '" y1="11" x2="' + cx + '" y2="22" stroke="' + col + '" stroke-width="2" stroke-opacity="0.65" />' : '') +
                (idx > 0 ? '<line x1="' + cx + '" y1="0" x2="' + cx + '" y2="11" stroke="' + col + '" stroke-width="2" stroke-opacity="0.65" />' : '') +
                '<circle cx="' + cx + '" cy="11" r="4.2" fill="' + col + '" stroke="var(--card)" stroke-width="1.5" />' +
                '</svg>' +
                '<div class="min-w-0 flex-1">' +
                '<div class="flex items-center gap-1.5 flex-wrap">' +
                '<span class="font-mono text-[10px] text-sky-400">' + esc(c.shortHash) + '</span>' + refs +
                '<span class="truncate text-[11px] font-medium">' + esc(c.subject) + '</span></div>' +
                '<div class="text-[10px] text-[var(--muted-foreground)] truncate">' + esc(c.author) + ' · ' + esc(c.relativeDate) + '</div>' +
                '</div></div>';
            }).join('');
          }
        } catch {}
      }

      async function refreshVoice() {
        try {
          const res = await apiFetch('/api/voice');
          if (!res.ok) return;
          const data = await res.json();
          const badge = document.getElementById('voice-status-badge');
          if (badge) {
            badge.textContent = data.online ? '● Online' : '○ Offline';
            badge.className = 'text-[10px] font-mono ' + (data.online ? 'text-emerald-400' : 'text-amber-400');
          }
        } catch {}
      }

      document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => postAgentUpdate({ mode: btn.dataset.mode }));
      });
      const caveBtn = document.getElementById('caveman-toggle-btn');
      if (caveBtn) {
        caveBtn.addEventListener('click', () => postAgentUpdate({ caveman: !cavemanState }));
      }
      const agentSel = document.getElementById('agent-select');
      if (agentSel) {
        agentSel.addEventListener('change', () => postAgentUpdate({ agentId: agentSel.value }));
      }
      const refreshBtn = document.getElementById('refresh-all-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          refreshTelemetry();
          refreshVcs();
          refreshVoice();
        });
      }
      const voiceForm = document.getElementById('voice-dispatch-form');
      if (voiceForm) {
        voiceForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = document.getElementById('voice-command-input');
          const fb = document.getElementById('voice-feedback');
          const text = input ? input.value.trim() : '';
          if (!text) return;
          try {
            const res = await apiFetch('/api/voice/dispatch', {
              method: 'POST',
              body: JSON.stringify({ transcript: text, targetCascadeId: activeCascadeId })
            });
            const data = await res.json();
            if (fb) {
              fb.textContent = res.ok ? 'Comando enviado al Voice Hub.' : ('Voice Hub: ' + (data.error || res.status));
            }
            if (res.ok && input) input.value = '';
          } catch (err) {
            if (fb) fb.textContent = 'Error enviando comando: ' + err.message;
          }
        });
      }

      setInterval(() => {
        refreshTelemetry();
        refreshVoice();
      }, 5000);
    })();
  </script>
</body>
</html>`;
}

async function readJsonBody(req) {
  let body = '';
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('Payload too large');
      err.statusCode = 413;
      throw err;
    }
    body += chunk;
  }

  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (cause) {
    const err = new Error(`Invalid JSON body: ${cause.message}`);
    err.statusCode = 400;
    throw err;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function validateUiToken(req, url, expectedToken) {
  if (!expectedToken) return true;
  const provided = req.headers['x-sidecar-token'] || url.searchParams.get('token');
  return provided === expectedToken;
}

function buildUpdatedAgentEntry(existing = {}, payload = {}) {
  const requestedAgentId = payload.agentId || payload.agent?.id || payload.id;
  const catalogMatch = requestedAgentId
    ? AGENT_CATALOG.find(item => item.id === requestedAgentId)
    : null;

  const rawMode = payload.mode ?? payload.effectiveMode ?? payload.agent?.effectiveMode;
  const normalizedMode = typeof rawMode === 'string' && ALLOWED_MODES.has(rawMode.toUpperCase())
    ? rawMode.toUpperCase()
    : null;

  const existingModifiers = existing.modifiers && typeof existing.modifiers === 'object'
    ? existing.modifiers
    : {};
  const payloadModifiers = payload.modifiers && typeof payload.modifiers === 'object'
    ? payload.modifiers
    : {};

  let nextCaveman = Boolean(existing.caveman ?? existingModifiers.caveman ?? false);
  if (payload.caveman !== undefined) {
    nextCaveman = Boolean(payload.caveman);
  } else if (payloadModifiers.caveman !== undefined) {
    nextCaveman = Boolean(payloadModifiers.caveman);
  }

  const nextId = catalogMatch?.id || requestedAgentId || (normalizedMode === 'AUTO' ? 'auto' : (existing.id || 'auto'));
  const nextName = payload.name || payload.agent?.name || catalogMatch?.name || (nextId === 'auto' ? 'Auto (Plan/Build)' : (existing.name || nextId));
  const nextColor = payload.color || payload.agent?.color || catalogMatch?.color || existing.color || 'hsl(265, 89%, 66%)';
  const nextEffectiveMode = normalizedMode === 'AUTO'
    ? (existing.effectiveMode && existing.effectiveMode !== 'AUTO' ? existing.effectiveMode : 'PLAN')
    : (normalizedMode || existing.effectiveMode || (nextId === 'sdd-orchestrator' ? 'BUILD' : 'PLAN'));

  const entry = {
    ...existing,
    id: nextId,
    name: nextName,
    color: nextColor,
    filePath: payload.filePath ?? payload.agent?.filePath ?? existing.filePath ?? '',
    effectiveMode: nextEffectiveMode,
    modifiers: {
      ...existingModifiers,
      ...payloadModifiers,
      caveman: nextCaveman
    },
    caveman: nextCaveman
  };

  if (normalizedMode === 'AUTO' || (nextId === 'auto' && !normalizedMode)) {
    entry.mode = 'AUTO';
  } else {
    entry.mode = nextEffectiveMode;
  }

  return entry;
}

/**
 * Creates the Sidecar Dashboard HTTP application with injectable dependencies for unit testing.
 * @param {Object} [options={}]
 * @returns {{ handler: Function, server: http.Server, listen: Function, close: Function }}
 */
export function createDashboardApp(options = {}) {
  const brainDir = options.brainDir || path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  const activeAgentsFile = options.activeAgentsFile || path.join(os.homedir(), '.gemini', 'config', 'mods', 'active_agents.json');
  const defaultRepoPath = options.repoPath || process.cwd();
  const voiceHubUrl = (options.voiceHubUrl || 'http://127.0.0.1:8765').replace(/\/+$/, '');
  const uiToken = options.uiToken ?? (process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN || '');
  const port = options.port ?? resolvePort(process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const vcsProvider = options.vcsProvider || getVcsStatus;

  const probeVoiceHub = async () => {
    try {
      const response = await fetchImpl(`${voiceHubUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1500)
      });
      if (!response.ok) {
        return { online: false, voiceHubUrl, statusCode: response.status };
      }
      const health = await response.json();
      return { online: true, voiceHubUrl, health };
    } catch (err) {
      return { online: false, voiceHubUrl, error: err?.message || 'unreachable' };
    }
  };

  const handler = async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const method = (req.method || 'GET').toUpperCase();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sidecar-Token');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (method !== 'GET' && !validateUiToken(req, url, uiToken)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

    try {
      if (method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, {
          status: 'ok',
          service: 'antigravity-mods-dashboard',
          port,
          uptime: process.uptime(),
          time: Date.now()
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/telemetry') {
        const requestedCascade = url.searchParams.get('cascadeId') || url.searchParams.get('conversationId');
        const resolved = resolveTranscript(brainDir, requestedCascade);
        const telemetry = parseTranscript(resolved?.chosen || null);
        sendJson(res, 200, {
          status: 'ok',
          conversationId: resolved?.id || requestedCascade || null,
          cascadeId: resolved?.id || requestedCascade || null,
          telemetry
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/agents') {
        const agents = readActiveAgents(activeAgentsFile);
        const requestedCascade = url.searchParams.get('cascadeId') || url.searchParams.get('conversationId');
        const latest = resolveTranscript(brainDir, requestedCascade);
        const cascadeId = requestedCascade || latest?.id || Object.keys(agents)[0] || 'default';
        const activeAgent = agents[cascadeId] || {
          id: 'auto',
          name: 'Auto (Plan/Build)',
          effectiveMode: 'PLAN',
          modifiers: { caveman: false },
          caveman: false
        };
        sendJson(res, 200, {
          status: 'ok',
          cascadeId,
          activeAgent,
          agents,
          catalog: AGENT_CATALOG
        });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/agents') {
        const payload = await readJsonBody(req);
        const agents = readActiveAgents(activeAgentsFile);
        const latest = resolveTranscript(brainDir, null);
        const cascadeId = String(payload.cascadeId || payload.conversationId || latest?.id || Object.keys(agents)[0] || 'default');

        if (!SAFE_AGENT_KEY_RE.test(cascadeId) || FORBIDDEN_KEYS.has(cascadeId)) {
          sendJson(res, 400, { error: 'Invalid cascadeId' });
          return;
        }

        const updated = buildUpdatedAgentEntry(agents[cascadeId], payload);
        agents[cascadeId] = updated;
        writeActiveAgents(activeAgentsFile, agents);

        sendJson(res, 200, {
          status: 'ok',
          success: true,
          cascadeId,
          agent: updated,
          agents
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/vcs') {
        const requestedRepo = normalizeRepoPath(url.searchParams.get('repoPath'), defaultRepoPath);
        const vcs = await vcsProvider(requestedRepo);
        sendJson(res, 200, { status: 'ok', ...vcs });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/voice') {
        const voice = await probeVoiceHub();
        sendJson(res, 200, { status: 'ok', ...voice });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/voice/dispatch') {
        const payload = await readJsonBody(req);
        const transcript = String(payload.transcript ?? payload.text ?? payload.prompt ?? '').trim();
        if (!transcript) {
          sendJson(res, 400, { error: 'Missing transcript/text/prompt' });
          return;
        }

        try {
          const upstream = await fetchImpl(`${voiceHubUrl}/voice/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, transcript }),
            signal: AbortSignal.timeout(5000)
          });
          const rawText = await upstream.text();
          let data;
          try {
            data = JSON.parse(rawText);
          } catch {
            data = { raw: rawText };
          }
          sendJson(res, upstream.status, { status: upstream.ok ? 'ok' : 'error', online: true, ...data });
        } catch (err) {
          sendJson(res, 503, {
            status: 'error',
            online: false,
            error: 'Voice Hub offline',
            detail: err?.message || 'unreachable'
          });
        }
        return;
      }

      if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const requestedCascade = url.searchParams.get('conversationId') || url.searchParams.get('cascadeId');
        const resolved = resolveTranscript(brainDir, requestedCascade);
        const telemetry = parseTranscript(resolved?.chosen || null);
        const activeAgents = readActiveAgents(activeAgentsFile);
        const cascadeId = requestedCascade || resolved?.id || Object.keys(activeAgents)[0] || 'default';
        const requestedRepo = normalizeRepoPath(url.searchParams.get('repoPath'), defaultRepoPath);
        const [vcs, voice] = await Promise.all([
          vcsProvider(requestedRepo),
          probeVoiceHub()
        ]);

        const html = renderDashboardHtml({ telemetry, activeAgents, cascadeId, vcs, voice });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      sendJson(res, 404, { error: `Route not found: ${method} ${url.pathname}` });
    } catch (err) {
      const status = err?.statusCode || 500;
      sendJson(res, status, { error: err?.message || 'Internal Server Error' });
    }
  };

  const server = http.createServer(handler);

  return {
    handler,
    server,
    listen: (...args) => server.listen(...args),
    close: () => new Promise((resolve) => (server.listening ? server.close(() => resolve()) : resolve()))
  };
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  const currentFile = fileURLToPath(import.meta.url);
  const invokedFile = path.resolve(process.argv[1]);
  try {
    return fs.realpathSync(currentFile) === fs.realpathSync(invokedFile);
  } catch {
    return path.resolve(currentFile) === invokedFile;
  }
}

if (isDirectExecution()) {
  const port = resolvePort(process.env);
  const app = createDashboardApp({ port });

  app.server.on('error', (err) => {
    console.error(`[antigravity-mods] Sidecar failed to bind 127.0.0.1:${port}:`, err.message);
    process.exit(1);
  });

  app.listen(port, '127.0.0.1', () => {
    console.log(`[antigravity-mods] Sidecar Dashboard listening on http://127.0.0.1:${port}`);
  });
}
