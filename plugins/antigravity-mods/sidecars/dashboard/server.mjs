import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Server for Antigravity Mods & Telemetry Sidecar Dashboard.
 * Serves native AUX_PANE UI with live context tachometer, agent selector,
 * VCS git-graph and voice status.
 */

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const ACTIVE_AGENTS_FILE = path.join(os.homedir(), '.gemini', 'config', 'mods', 'active_agents.json');

function resolveLatestTranscript() {
  if (!fs.existsSync(BRAIN_DIR)) return null;
  try {
    const dirs = fs.readdirSync(BRAIN_DIR)
      .filter(d => /^[0-9a-fA-F-]{36}$/.test(d))
      .map(d => {
        const fullDir = path.join(BRAIN_DIR, d, '.system_generated', 'logs');
        const compact = path.join(fullDir, 'transcript.jsonl');
        const full = path.join(fullDir, 'transcript_full.jsonl');
        let mtime = 0;
        let chosen = null;
        if (fs.existsSync(compact)) {
          mtime = fs.statSync(compact).mtimeMs;
          chosen = compact;
        } else if (fs.existsSync(full)) {
          mtime = fs.statSync(full).mtimeMs;
          chosen = full;
        }
        return { id: d, chosen, mtime };
      })
      .filter(item => item.chosen)
      .sort((a, b) => b.mtime - a.mtime);

    return dirs.length > 0 ? dirs[0] : null;
  } catch {
    return null;
  }
}

function parseTranscript(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return {
      tokens: 0,
      steps: 0,
      percentage: '0.0',
      sizeKb: 0,
      breakdown: { user: 0, model: 0, thinking: 0, tools: 0 }
    };
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

    for (const line of lines) {
      if (!line.trim()) continue;
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

        if (obj.thinking) thinkingChars += obj.thinking.length;
        if (obj.tool_calls) toolsChars += JSON.stringify(obj.tool_calls).length;
        if (obj.type === 'USER_INPUT') userChars += (obj.content?.length || 0);
        if (obj.type === 'PLANNER_RESPONSE') modelChars += (obj.content?.length || 0);
      } catch {
        totalChars += line.length;
      }
    }

    const tokens = Math.round(totalChars / 3.8);
    const pct = Math.min(100, (tokens / 1_000_000) * 100).toFixed(1);

    return {
      tokens,
      steps,
      percentage: pct,
      sizeKb: Math.round(stat.size / 1024),
      breakdown: {
        user: Math.round(userChars / 3.8),
        model: Math.round(modelChars / 3.8),
        thinking: Math.round(thinkingChars / 3.8),
        tools: Math.round(toolsChars / 3.8)
      }
    };
  } catch {
    return { tokens: 0, steps: 0, percentage: '0.0', sizeKb: 0, breakdown: {} };
  }
}

function readActiveAgents() {
  try {
    if (fs.existsSync(ACTIVE_AGENTS_FILE)) {
      return JSON.parse(fs.readFileSync(ACTIVE_AGENTS_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function renderHtml(telemetry, activeAgents) {
  const activeChat = Object.keys(activeAgents)[0] || 'Sesión actual';
  const agentInfo = activeAgents[activeChat] || { name: 'Auto Classifier', effectiveMode: 'PLAN' };

  return `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity Mods Hub</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    :root {
      --bg: #090d16;
      --card: #131b2e;
      --border: rgba(255, 255, 255, 0.1);
      --accent: #38bdf8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body class="p-4 space-y-4 text-xs">
  <header class="flex items-center justify-between pb-3 border-b border-[var(--border)]">
    <div>
      <h1 class="text-sm font-bold tracking-tight text-white flex items-center gap-2">
        <span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
        Antigravity Mods & Telemetría
      </h1>
      <p class="text-[11px] text-[var(--text-muted)]">Sidecar Nativo AUX_PANE</p>
    </div>
    <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800">
      v2.1.0
    </span>
  </header>

  <!-- Tacómetro Card -->
  <section class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 space-y-3">
    <div class="flex items-center justify-between">
      <span class="font-semibold text-white flex items-center gap-1.5">
        ⚡ Tacómetro de Contexto
      </span>
      <span class="font-mono text-emerald-400 font-bold">${telemetry.percentage}% de 1M</span>
    </div>
    
    <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
      <div class="bg-gradient-to-r from-emerald-500 via-yellow-500 to-rose-500 h-2 transition-all duration-500"
           style="width: ${telemetry.percentage}%"></div>
    </div>

    <div class="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
      <div class="bg-slate-950/60 p-2 rounded border border-slate-800/80">
        <span class="text-[var(--text-muted)] block text-[10px]">Tokens Estimados</span>
        <span class="text-white font-bold">${telemetry.tokens.toLocaleString()}</span>
      </div>
      <div class="bg-slate-950/60 p-2 rounded border border-slate-800/80">
        <span class="text-[var(--text-muted)] block text-[10px]">Pasos / Tamaño</span>
        <span class="text-white font-bold">${telemetry.steps} pasos (${telemetry.sizeKb} KB)</span>
      </div>
    </div>

    <div class="pt-1">
      <span class="text-[10px] text-[var(--text-muted)] block mb-1">Distribución de Tokens</span>
      <div class="flex h-1.5 rounded-full overflow-hidden bg-slate-900">
        <div style="width: ${(telemetry.breakdown.user / (telemetry.tokens || 1)) * 100}%" class="bg-sky-400" title="Usuario"></div>
        <div style="width: ${(telemetry.breakdown.model / (telemetry.tokens || 1)) * 100}%" class="bg-purple-400" title="Modelo"></div>
        <div style="width: ${(telemetry.breakdown.thinking / (telemetry.tokens || 1)) * 100}%" class="bg-amber-400" title="Pensamiento"></div>
        <div style="width: ${(telemetry.breakdown.tools / (telemetry.tokens || 1)) * 100}%" class="bg-emerald-400" title="Herramientas"></div>
      </div>
      <div class="flex justify-between text-[9px] text-[var(--text-muted)] mt-1 font-mono">
        <span>User</span>
        <span>Model</span>
        <span>Think</span>
        <span>Tools</span>
      </div>
    </div>
  </section>

  <!-- Agente y Modo de Operación Card -->
  <section class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 space-y-2">
    <div class="flex items-center justify-between">
      <span class="font-semibold text-white">🎯 Agente y Modo Activo</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${agentInfo.effectiveMode === 'BUILD' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-indigo-950 text-indigo-300 border border-indigo-800'}">
        MODO ${agentInfo.effectiveMode || 'PLAN'}
      </span>
    </div>
    <div class="p-2 rounded bg-slate-950/60 border border-slate-800/80">
      <p class="text-[11px] font-medium text-white">${agentInfo.name || 'Auto Classifier'}</p>
      <p class="text-[10px] text-[var(--text-muted)] mt-0.5">
        ${agentInfo.effectiveMode === 'BUILD' ? 'Ejecución Spec-Driven TDD (SDD Orchestrator)' : 'Diseño y Arquitectura de Sistemas (Lead Architect)'}
      </p>
    </div>
  </section>

  <!-- Voice Hub & Puente de Control -->
  <section class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 space-y-2">
    <div class="flex items-center justify-between">
      <span class="font-semibold text-white">🎙️ Voice & Interceptors</span>
      <span class="text-[10px] text-emerald-400 font-mono">● Listo</span>
    </div>
    <p class="text-[11px] text-[var(--text-muted)]">
      Punto de enlace nativo enlazado con <code class="text-sky-300">HandyTranscribeBridge</code> y <code class="text-sky-300">hooks.json</code>.
    </p>
  </section>

  <footer class="pt-2 text-center text-[10px] text-[var(--text-muted)]">
    Actualizado automáticamente vía Antigravity Lifecycle Hooks
  </footer>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
    return;
  }

  if (url.pathname === '/api/telemetry') {
    const latest = resolveLatestTranscript();
    const data = latest ? parseTranscript(latest.chosen) : { tokens: 0, steps: 0, percentage: '0.0' };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', conversationId: latest?.id || null, telemetry: data }));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const latest = resolveLatestTranscript();
    const telemetry = latest ? parseTranscript(latest.chosen) : { tokens: 0, steps: 0, percentage: '0.0', sizeKb: 0, breakdown: { user: 0, model: 0, thinking: 0, tools: 0 } };
    const agents = readActiveAgents();
    const html = renderHtml(telemetry, agents);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = Number(process.env.PORT || 8790);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[antigravity-mods] Sidecar Dashboard corriendo en http://127.0.0.1:${PORT}`);
});
