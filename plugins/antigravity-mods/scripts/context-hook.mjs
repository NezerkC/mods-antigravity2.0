import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Native PreInvocation / PostInvocation lifecycle hook for Antigravity.
 * Replaces deprecated ephemeralMessage with systemMessage.metadata.user_markdown.
 */

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const ACTIVE_AGENTS_FILE = path.join(os.homedir(), '.gemini', 'config', 'mods', 'active_agents.json');

function calculateContext(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  let targetPath = transcriptPath;
  if (transcriptPath.endsWith('transcript_full.jsonl')) {
    const compact = path.join(path.dirname(transcriptPath), 'transcript.jsonl');
    if (fs.existsSync(compact)) targetPath = compact;
  }

  try {
    const stat = fs.statSync(targetPath);
    const content = fs.readFileSync(targetPath, 'utf-8');
    const lines = content.split('\n');

    let totalChars = 0;
    let steps = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      steps++;
      try {
        const data = JSON.parse(line);
        if (data.type === 'CHECKPOINT') {
          totalChars = line.length;
        } else {
          totalChars += line.length;
        }
      } catch {
        totalChars += line.length;
      }
    }

    const tokens = Math.round(totalChars / 3.8);
    const pct = ((tokens / 1_000_000) * 100).toFixed(1);

    return {
      tokens,
      steps,
      sizeKb: (stat.size / 1024).toFixed(1),
      percentage: pct
    };
  } catch {
    return null;
  }
}

function getLastUserPrompt(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const data = JSON.parse(line);
        if (data.type === 'USER_INPUT' || data.source === 'USER_EXPLICIT') {
          const raw = data.content || '';
          if (typeof raw === 'string') {
            const clean = raw.replace(/<[^>]+>/g, '').trim();
            if (clean) return clean;
          }
        }
      } catch {}
    }
  } catch {}
  return '';
}

function classifyPlanVsBuild(transcriptPath, prompt) {
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const lines = content.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (data.type === 'USER_INPUT' || data.source === 'USER_EXPLICIT') break;
          for (const tc of data.tool_calls || []) {
            if (tc.name === 'edit_file' || tc.name === 'write_file') return 'BUILD';
            if (tc.name === 'run_command') {
              const cmd = tc.args?.CommandLine || '';
              if (/\b(npm\s+(test|run\s+build|build)|git\s+commit|node\s+build|tsc)\b/i.test(cmd)) return 'BUILD';
            }
          }
        } catch {}
      }
    } catch {}
  }

  if (!prompt) return 'PLAN';

  const planRe = /\b(diseñ|plan|arquitect|estructur|diagram|rfc|adr|evalu|compar|como\s+(hacer|estructurar|abordar|organizar)|analiz|estrateg|roadmap|criterio|decision|flujo|explic|por\s*qu[eé]|evaluaci[oó]n|diagn[oó]stic)/i;
  const buildRe = /\b(implement|escrib|crea|agreg|corrig|arregl|fix|refactor|test|prueb|npm|git\s+commit|ejecut|corr|instal|modific|edit|program|actualiz|agrega|elimina|borra)/i;

  const hasPlan = planRe.test(prompt);
  const hasBuild = buildRe.test(prompt);

  if (hasBuild && !hasPlan) return 'BUILD';
  if (hasPlan && !hasBuild) return 'PLAN';

  const pLower = prompt.toLowerCase();
  if (['cómo', 'como', 'por qué', 'porque', 'explica', 'cuál', 'cual', 'analiza', 'revisa'].some(w => pLower.startsWith(w))) return 'PLAN';
  if (['haz', 'crea', 'agrega', 'modifica', 'corrige', 'ejecuta', 'implementa'].some(w => pLower.startsWith(w))) return 'BUILD';

  return hasBuild ? 'BUILD' : 'PLAN';
}

function getActiveAgent(conversationId) {
  if (!conversationId || !fs.existsSync(ACTIVE_AGENTS_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_AGENTS_FILE, 'utf-8'));
    const agent = data[conversationId];
    if (agent && agent.id !== 'default' && agent.name !== 'Sin Agente') return agent;
  } catch {}
  return null;
}

function updateAgentEffectiveMode(conversationId, mode) {
  if (!conversationId) return;
  try {
    let data = {};
    if (fs.existsSync(ACTIVE_AGENTS_FILE)) {
      data = JSON.parse(fs.readFileSync(ACTIVE_AGENTS_FILE, 'utf-8'));
    }
    if (data[conversationId]) {
      data[conversationId].effectiveMode = mode;
      fs.writeFileSync(ACTIVE_AGENTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch {}
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  let payload = {};
  try {
    if (raw.trim()) payload = JSON.parse(raw);
  } catch {}

  const isPost = process.argv.includes('--post');
  if (isPost) {
    process.stdout.write('{}');
    return;
  }

  const conversationId = payload.conversationId || '';
  const transcriptPath = payload.transcriptPath || '';
  const prompt = getLastUserPrompt(transcriptPath);
  const info = calculateContext(transcriptPath);

  const injectSteps = [];

  const agent = getActiveAgent(conversationId);
  const agentId = agent?.id || 'auto';

  let mode = 'PLAN';
  if (agentId === 'auto') {
    mode = classifyPlanVsBuild(transcriptPath, prompt);
    updateAgentEffectiveMode(conversationId, mode);
  } else {
    mode = ['lead-architect', 'product-manager', 'context-distiller'].includes(agentId) ? 'PLAN' : 'BUILD';
    updateAgentEffectiveMode(conversationId, mode);
  }

  // Model system prompt instruction (LLM visibility)
  const systemPromptDirectives = mode === 'PLAN'
    ? '[CLASSIFIED MODE: PLANNER (LEAD ARCHITECT)]\nStatus: Active in Architectural Planning Mode.\nDirectives: Focus strictly on system design, hexagonal boundaries, contracts, and trade-offs before mutation.'
    : '[CLASSIFIED MODE: BUILDER (SDD ORCHESTRATOR)]\nStatus: Active in Spec-Driven Implementation Mode.\nDirectives: Execute changes following Spec-Driven Development (Red-Green-Refactor) with atomic commits.';

  // User visible markdown banner (without polluting model tokens)
  const tokensText = info ? `~${info.tokens.toLocaleString()} tokens (${info.percentage}% de 1M) | ${info.steps} pasos` : 'Telemetría lista';
  const userMarkdownBanner = `> 📊 **[Antigravity Mods Hub]** Modo: **${mode}** | ${tokensText} · [Abrir Dashboard](sidecar://antigravity-mods/dashboard/)`;

  injectSteps.push({
    systemMessage: {
      systemMessage: systemPromptDirectives,
      metadata: {
        user_markdown: userMarkdownBanner
      }
    }
  });

  const output = { injectSteps };
  process.stdout.write(JSON.stringify(output));
}

main().catch(() => {
  process.stdout.write('{}');
});
