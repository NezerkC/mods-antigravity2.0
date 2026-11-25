import { AGENT_REGISTRY, AUTO_AGENT, DEFAULT_AGENT, getAgentColor } from '../../agent-selector/components/AgentDropdownHtml.js';

/**
 * Mode constants for voice-driven agent routing.
 */
export const VOICE_MODES = Object.freeze({
  PLAN: 'PLAN',
  BUILD: 'BUILD',
  DEBUG: 'DEBUG',
  RESEARCH: 'RESEARCH'
});

/**
 * Default agent mappings for each primary voice mode.
 */
const MODE_DEFAULT_AGENT_ID = Object.freeze({
  PLAN: 'lead-architect',
  BUILD: 'sdd-orchestrator',
  DEBUG: 'sdd-verify',
  RESEARCH: 'sdd-explore'
});

/**
 * Explicit agent mention patterns in Spanish and English voice transcripts.
 */
const EXPLICIT_AGENT_MATCHERS = [
  { id: 'auto', pattern: /\b(modo\s+auto(?:m[aá]tico)?|auto\s+mode|smart\s+router|enrutador\s+autom[aá]tico)\b/i, mode: 'PLAN' },
  { id: 'lead-architect', pattern: /\b(lead\s+architect|arquitecto\s+principal|arquitecto\s+l[ií]der|plano\s+maestro)\b/i, mode: 'PLAN' },
  { id: 'sdd-orchestrator', pattern: /\b(sdd\s+orchestrator|orquestador\s+sdd|director\s+de\s+obra)\b/i, mode: 'BUILD' },
  { id: 'product-manager', pattern: /\b(product\s+manager|gerente\s+de\s+producto|\bprd\b|discovery\s+de\s+producto)\b/i, mode: 'PLAN' },
  { id: 'scrum-master', pattern: /\b(scrum\s+master|historias\s+de\s+usuario|user\s+stories|refinamiento\s+de\s+backlog)\b/i, mode: 'PLAN' },
  { id: 'code-reviewer', pattern: /\b(code\s+reviewer|revisor\s+de\s+c[oó]digo|revisi[oó]n\s+de\s+pr|pull\s+request\s+review|pr\s+gate|revis(?:a|ar)\s+las\s+invariantes)\b/i, mode: 'DEBUG' },
  { id: 'security-engineer', pattern: /\b(security\s+engineer|ingeniero\s+de\s+seguridad|auditor[ií]a\s+owasp|vulnerabilidades?\s+owasp|zero\s+trust)\b/i, mode: 'DEBUG' },
  { id: 'devops-cloud', pattern: /\b(devops|ci\/cd|pipeline\s+de\s+despliegue|gitops|dockerfile|kubernetes)\b/i, mode: 'BUILD' },
  { id: 'ui-ux-pro', pattern: /\b(ui\/ux|ui\s+ux|design\s+tokens|sistema\s+de\s+dise[nñ]o\s+visual|accesibilidad\s+a11y)\b/i, mode: 'BUILD' },
  { id: 'rpa-windows', pattern: /\b(windows\s+rpa|rpa\s+windows|automatizaci[oó]n\s+powershell)\b/i, mode: 'BUILD' },
  { id: 'sdd-explore', pattern: /\b(sdd\s+explore|explorador\s+sdd|modo\s+exploraci[oó]n)\b/i, mode: 'RESEARCH' },
  { id: 'sdd-spec', pattern: /\b(sdd\s+spec|especificaci[oó]n\s+bdd|escenarios\s+gherkin|dado\s+cuando\s+entonces)\b/i, mode: 'PLAN' },
  { id: 'sdd-apply', pattern: /\b(sdd\s+apply|red[\s-]+green[\s-]+refactor|aplicar\s+tdd)\b/i, mode: 'BUILD' },
  { id: 'sdd-verify', pattern: /\b(sdd\s+verify|verificador\s+sdd|gate\s+de\s+pruebas)\b/i, mode: 'DEBUG' },
  { id: 'gga-review', pattern: /\b(guardian\s+angel|\bgga\b|gateman|guardi[aá]n\s+de\s+c[oó]digo|pre[\s-]?commit\s+guard)\b/i, mode: 'DEBUG' }
];

/**
 * Keyword patterns for the 4 core voice modes.
 */
const MODE_PATTERNS = {
  DEBUG: [
    /\b(debug(?:gear|uear)?|depur(?:a|ar|aci[oó]n)|corrig(?:e|ir)|arregl(?:a|ar|o)|fix(?:ea|ear)?|bug|errores|error|falla(?:ndo|s)?|fallo(?:s)?|rompi[oó]|roto|excepci[oó]n|stack\s*trace|crash|no\s+funciona|problema\s+con|revis(?:a|ar)\s+(?:el\s+error|las\s+invariantes|el\s+c[oó]digo|el\s+pr)|pr\s+gate|audit(?:a|ar|or[ií]a)|vulnerabilidad(?:es)?|diagnostic(?:a|ar)|diagn[oó]stico\s+de\s+error)\b/i
  ],
  RESEARCH: [
    /\b(investig(?:a|ar|aci[oó]n)|explor(?:a|ar|aci[oó]n)|busc(?:a|ar)|encontr(?:a|ar)|localiz(?:a|ar)|d[oó]nde\s+est[aá]|c[oó]mo\s+funciona|explic(?:a|ar|ame)|expl[ií]came|entiend(?:e|o)|entender|analiz(?:a|ar)\s+el\s+contexto|qu[eé]\s+hace|por\s+qu[eé]\s+pasa|list(?:a|ar)\s+los\s+archivos|lee(?:r)?\s+el\s+archivo|research|explore|investigate|search\s+for)\b/i
  ],
  PLAN: [
    /\b(dise[nñ](?:a|ar|o)|plan(?:ifica|ificar|ificaci[oó]n|ear)?|arquitect(?:ura|o)|estructur(?:a|ar)|diagram(?:a|ar)|rfc|adr|estrategia|roadmap|hoja\s+de\s+ruta|criterio(?:s)?|decisi[oó]n|flujo|propuesta|especific(?:a|ar|aci[oó]n)|escenario(?:s)?\s+bdd|antes\s+de\s+programar|c[oó]mo\s+(?:hacer|estructurar|abordar|organizar|dise[nñ]ar)|evalu(?:a|ar|aci[oó]n)|compar(?:a|ar))\b/i
  ],
  BUILD: [
    /\b(implement(?:a|ar|aci[oó]n)|escrib(?:e|ir)|cre(?:a|ar)|agreg(?:a|ar)|a[nñ]ad(?:e|ir)|refactor(?:iza|izar|ing)?|program(?:a|ar)|actualiz(?:a|ar)|instal(?:a|ar)|ejecut(?:a|ar)|corr(?:e|er)\s+los\s+tests|construy(?:e|ir)|build|modific(?:a|ar)|edit(?:a|ar)|desarroll(?:a|ar)|codific(?:a|ar)|tdd|test\s+unitario)\b/i
  ]
};

/**
 * Gateman & architectural guardrail detection rules.
 */
const GATEMAN_RULES = [
  {
    id: 'explicit-gateman-guard',
    level: 'strict',
    recommendedAgent: 'gga-review',
    pattern: /\b(gateman|guardian\s+angel|\bgga\b|guardi[aá]n|barrera\s+de\s+permisos|control\s+de\s+permisos|pre[\s-]?commit\s+gate|modo\s+estricto|guardrail(?:s)?)\b/i
  },
  {
    id: 'clean-architecture-invariants',
    level: 'elevated',
    recommendedAgent: 'code-reviewer',
    pattern: /\b(clean\s+architecture|arquitectura\s+limpia|arquitectura\s+hexagonal|hexagonal|invariantes?\s+de\s+arquitectura|puertos\s+y\s+adaptadores|ports\s+and\s+adapters|screaming\s+architecture|separaci[oó]n\s+de\s+capas|regla\s+de\s+dependencia|contrato(?:s)?\s+cdd|pr\s+gate)\b/i
  },
  {
    id: 'security-zero-trust',
    level: 'strict',
    recommendedAgent: 'security-engineer',
    pattern: /\b(owasp|zero\s+trust|vulnerabilidad(?:es)?|inyecci[oó]n\s+sql|xss|csrf|hardening|sanitiz(?:a|ar|aci[oó]n)|credenciales|secretos|tokens?\s+expuestos?|auditor[ií]a\s+de\s+seguridad)\b/i
  },
  {
    id: 'destructive-operation-guard',
    level: 'strict',
    recommendedAgent: 'gga-review',
    pattern: /\b(rm\s+-rf|drop\s+table|truncate\s+table|reset\s+--hard|push\s+--force|force\s+push|borr(?:a|ar)\s+la\s+base\s+de\s+datos|elimin(?:a|ar)\s+producci[oó]n|destructiv[oa])\b/i
  },
  {
    id: 'tdd-verification-gate',
    level: 'elevated',
    recommendedAgent: 'sdd-verify',
    pattern: /\b(red[\s-]+green[\s-]+refactor|cobertura\s+al\s+100|100%\s+pass|gate\s+de\s+calidad|verificaci[oó]n\s+estricta)\b/i
  }
];

/**
 * Patterns to extract global voice routing hints (target project, chat, or workspace).
 */
const GLOBAL_ROUTING_PATTERNS = [
  // Prefix patterns: "En el proyecto X, haz Y" or "En el chat X implementa Y"
  {
    position: 'prefix',
    regex: /^(?:oye\s+|hola\s+|por\s+favor\s+)?(?:en\s+el\s+|para\s+el\s+|del\s+|al\s+|dentro\s+del\s+|sobre\s+el\s+|en\s+la\s+|in\s+(?:the\s+)?|on\s+(?:the\s+)?)(proyecto|chat|conversaci[oó]n|workspace|repositorio|repo|hilo|ventana)\s+(?:de\s+|llamad[oa]\s+)?["'“”]?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)["'“”]?(?:\s*[,.:;-]\s*|\s+(?=(?:dise[nñ]|plan|implement|crea|agreg|corrig|arregl|revis|analiz|investig|explor|busc|ejecut|modific|actualiz|construy|debug|depur|audit|explic|por\s+favor|necesito|quiero|haz|vamos|activa|cambia)\b))/i
  },
  // Suffix or mid-sentence patterns: "... en el proyecto X" or "... en el chat Y"
  {
    position: 'inline',
    regex: /\b(?:en\s+el\s+|para\s+el\s+|hacia\s+el\s+|en\s+la\s+|in\s+(?:the\s+)?)(proyecto|chat|conversaci[oó]n|workspace|repositorio|repo|hilo)\s+(?:de\s+|llamad[oa]\s+)?["'“”]?([a-zA-Z0-9_-]+)["'“”]?/i
  }
];

/**
 * Service that conditions agent selection, operational mode (PLAN, BUILD, DEBUG, RESEARCH),
 * Gateman architectural guardrails, and multi-chat routing from spoken user transcripts
 * or `<talker_agent_context>` blocks.
 */
export class VoicePromptConditioner {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.defaultCascadeId='default']
   * @param {Array<Object>|Object} [options.cascades]
   */
  constructor(options = {}) {
    this.defaultCascadeId = options.defaultCascadeId || 'default';
    this.cascades = options.cascades || null;
  }

  /**
   * Extracts the latest spoken user utterance from either a `<talker_agent_context>` block
   * or a raw voice transcript string/object.
   *
   * @param {string|Object} input
   * @returns {string} Clean spoken user prompt, or empty string if none found.
   */
  static extractSpokenText(input) {
    if (!input) return '';

    if (typeof input === 'object') {
      const candidate = input.transcript ?? input.text ?? input.prompt ?? input.content ?? '';
      return VoicePromptConditioner.extractSpokenText(String(candidate));
    }

    if (typeof input !== 'string') return '';

    const raw = input.trim();
    if (!raw) return '';

    // 1. Check for <talker_agent_context>...</talker_agent_context> blocks
    const contextBlocks = [...raw.matchAll(/<talker_agent_context>([\s\S]*?)<\/talker_agent_context>/gi)];
    if (contextBlocks.length > 0) {
      const combinedContext = contextBlocks.map(m => m[1]).join('\n');
      const userLine = VoicePromptConditioner._extractLatestUserLine(combinedContext);
      return userLine;
    }

    // 2. Check if raw string contains structured `user: "..."` lines without enclosing tags
    if (/^\s*(?:talker_agent|user)\s*:/im.test(raw)) {
      const userLine = VoicePromptConditioner._extractLatestUserLine(raw);
      if (userLine) return userLine;
      // If only talker_agent lines exist without user lines, return empty string
      if (/^\s*talker_agent\s*:/im.test(raw) && !/^\s*user\s*:/im.test(raw)) {
        return '';
      }
    }

    // 3. Raw transcript string
    return raw.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  }

  /**
   * Alias for `extractSpokenText`.
   * @param {string|Object} input
   * @returns {string}
   */
  static extractSpokenPrompt(input) {
    return VoicePromptConditioner.extractSpokenText(input);
  }

  /**
   * Extracts the last `user: "..."` utterance from a dialogue block.
   * @private
   * @param {string} blockText
   * @returns {string}
   */
  static _extractLatestUserLine(blockText) {
    const lines = String(blockText || '').split(/\r?\n/);
    let latestUserText = '';

    for (const line of lines) {
      const match = line.match(/^\s*user\s*:\s*(.+)$/i);
      if (match && match[1]) {
        let extracted = match[1].trim();
        // Strip outer quotes ("...", '...', “...”)
        if (
          (extracted.startsWith('"') && extracted.endsWith('"')) ||
          (extracted.startsWith("'") && extracted.endsWith("'")) ||
          (extracted.startsWith('“') && extracted.endsWith('”'))
        ) {
          extracted = extracted.slice(1, -1);
        }
        extracted = extracted.replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
        if (extracted) {
          latestUserText = extracted;
        }
      }
    }

    return latestUserText;
  }

  /**
   * Detects if the user named a target project, chat, or workspace in their voice command.
   *
   * @param {string} spokenText
   * @returns {{
   *   hasGlobalHint: boolean,
   *   targetType: 'project'|'chat'|'workspace'|null,
   *   targetName: string|null,
   *   cleanedPrompt: string
   * }}
   */
  static extractRoutingHint(spokenText) {
    const text = String(spokenText || '').trim();
    if (!text) {
      return {
        hasGlobalHint: false,
        targetType: null,
        targetName: null,
        cleanedPrompt: ''
      };
    }

    for (const rule of GLOBAL_ROUTING_PATTERNS) {
      const match = text.match(rule.regex);
      if (match) {
        const rawKind = (match[1] || '').toLowerCase();
        const rawTarget = (match[2] || '').trim().replace(/[.,;:!?]+$/, '');

        // Avoid matching generic stop words as project/chat names
        if (!rawTarget || /^(actual|este|esta|activo|activa|mismo|misma|aqui|aquí|ahora)$/i.test(rawTarget)) {
          continue;
        }

        let targetType = 'project';
        if (/^(chat|conversaci[oó]n|hilo|ventana)$/i.test(rawKind)) {
          targetType = 'chat';
        } else if (/^(workspace|repositorio|repo)$/i.test(rawKind)) {
          targetType = 'workspace';
        }

        const cleanedPrompt = text.replace(match[0], ' ').replace(/\s{2,}/g, ' ').trim();

        return {
          hasGlobalHint: true,
          targetType,
          targetName: rawTarget,
          cleanedPrompt: cleanedPrompt || text
        };
      }
    }

    return {
      hasGlobalHint: false,
      targetType: null,
      targetName: null,
      cleanedPrompt: text
    };
  }

  /**
   * Resolves the target `cascadeId` from voice routing hints, available cascades, or active DOM state.
   *
   * @param {string} spokenText
   * @param {Object} [options={}]
   * @param {Array<Object>|Object} [options.cascades] Known cascades list or map
   * @param {string} [options.activeCascadeId] Current active cascade ID fallback
   * @param {Object} [options.win] Optional browser window object
   * @returns {{
   *   cascadeId: string,
   *   targetHint: string|null,
   *   targetType: 'project'|'chat'|'workspace'|null,
   *   matched: boolean,
   *   isGlobalRoute: boolean,
   *   source: 'voice-hint'|'active-fallback'|'default'
   * }}
   */
  static resolveTargetCascade(spokenText, options = {}) {
    const hint = VoicePromptConditioner.extractRoutingHint(spokenText);
    const win = options.win || (typeof window !== 'undefined' ? window : null);

    // Determine fallback active cascade ID
    let fallbackCascadeId = options.activeCascadeId || null;
    if (!fallbackCascadeId && win) {
      if (typeof win.__resolveCascadeId === 'function') {
        const activeBadge = win.document?.querySelector?.('.antigravity-agent-badge') || null;
        fallbackCascadeId = win.__resolveCascadeId(activeBadge);
      }
      if (!fallbackCascadeId && win.document?.querySelector) {
        const cascadeEl = win.document.querySelector('[data-cascade-id]');
        if (cascadeEl) {
          fallbackCascadeId = cascadeEl.getAttribute('data-cascade-id');
        }
      }
    }
    const effectiveFallback = fallbackCascadeId || options.defaultCascadeId || 'default';

    if (!hint.hasGlobalHint || !hint.targetName) {
      return {
        cascadeId: effectiveFallback,
        targetHint: null,
        targetType: null,
        matched: false,
        isGlobalRoute: false,
        source: fallbackCascadeId ? 'active-fallback' : 'default'
      };
    }

    const normalizedTarget = VoicePromptConditioner._normalizeSlug(hint.targetName);
    const candidates = VoicePromptConditioner._collectCascadeCandidates(options.cascades, win);

    for (const candidate of candidates) {
      const idSlug = VoicePromptConditioner._normalizeSlug(candidate.id);
      const nameSlug = VoicePromptConditioner._normalizeSlug(candidate.name);
      const projectSlug = VoicePromptConditioner._normalizeSlug(candidate.project);
      const titleSlug = VoicePromptConditioner._normalizeSlug(candidate.title);

      if (
        (idSlug && (idSlug === normalizedTarget || idSlug.includes(normalizedTarget))) ||
        (nameSlug && (nameSlug === normalizedTarget || nameSlug.includes(normalizedTarget))) ||
        (projectSlug && (projectSlug === normalizedTarget || projectSlug.includes(normalizedTarget))) ||
        (titleSlug && (titleSlug === normalizedTarget || titleSlug.includes(normalizedTarget)))
      ) {
        return {
          cascadeId: candidate.id,
          targetHint: hint.targetName,
          targetType: hint.targetType,
          matched: true,
          isGlobalRoute: true,
          source: 'voice-hint'
        };
      }
    }

    return {
      cascadeId: effectiveFallback,
      targetHint: hint.targetName,
      targetType: hint.targetType,
      matched: false,
      isGlobalRoute: true,
      source: 'active-fallback'
    };
  }

  /**
   * Collects candidate cascade descriptors from options, window globals, and DOM nodes.
   * @private
   */
  static _collectCascadeCandidates(cascadesOption, win) {
    const list = [];

    const pushCandidate = (id, meta = {}) => {
      if (!id || typeof id !== 'string') return;
      list.push({
        id,
        name: meta.name || meta.label || '',
        title: meta.title || '',
        project: meta.project || meta.workspace || ''
      });
    };

    if (Array.isArray(cascadesOption)) {
      for (const item of cascadesOption) {
        if (typeof item === 'string') {
          pushCandidate(item, { name: item });
        } else if (item && typeof item === 'object') {
          pushCandidate(item.cascadeId || item.id, item);
        }
      }
    } else if (cascadesOption && typeof cascadesOption === 'object') {
      for (const [id, meta] of Object.entries(cascadesOption)) {
        pushCandidate(id, typeof meta === 'object' && meta ? meta : { name: String(meta) });
      }
    }

    if (win) {
      if (Array.isArray(win.__antigravityCascades)) {
        for (const item of win.__antigravityCascades) {
          if (item && (item.cascadeId || item.id)) {
            pushCandidate(item.cascadeId || item.id, item);
          }
        }
      } else if (win.__antigravityCascades && typeof win.__antigravityCascades === 'object') {
        for (const [id, meta] of Object.entries(win.__antigravityCascades)) {
          pushCandidate(id, typeof meta === 'object' && meta ? meta : { name: String(meta) });
        }
      }

      if (win.document && typeof win.document.querySelectorAll === 'function') {
        const nodes = win.document.querySelectorAll('[data-cascade-id]');
        if (nodes && typeof nodes.forEach === 'function') {
          nodes.forEach(node => {
            const cId = node.getAttribute?.('data-cascade-id');
            if (cId) {
              pushCandidate(cId, {
                name: node.getAttribute?.('data-chat-name') || node.getAttribute?.('data-project-name') || '',
                title: node.getAttribute?.('data-chat-title') || node.getAttribute?.('title') || '',
                project: node.getAttribute?.('data-project') || node.getAttribute?.('data-workspace') || ''
              });
            }
          });
        }
      }
    }

    return list;
  }

  /**
   * Normalizes a string for fuzzy project/chat identifier matching.
   * @private
   */
  static _normalizeSlug(value = '') {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Classifies a spoken prompt into a target mode (`PLAN`, `BUILD`, `DEBUG`, `RESEARCH`),
   * resolves the best-fit Agent from `AGENT_REGISTRY`, and evaluates Gateman guardrails.
   *
   * @param {string} spokenText
   * @returns {{
   *   mode: 'PLAN'|'BUILD'|'DEBUG'|'RESEARCH',
   *   effectiveMode: 'PLAN'|'BUILD',
   *   agent: { id: string, name: string, color: string, levelLabel: string, effectiveMode: 'PLAN'|'BUILD', filePath: string },
   *   gateman: {
   *     triggered: boolean,
   *     level: 'normal'|'elevated'|'strict',
   *     guardrails: string[],
   *     requiresApproval: boolean,
   *     recommendedGateAgent: string|null
   *   },
   *   cavemanFocus: boolean|null
   * }}
   */
  static classifyIntent(spokenText) {
    const raw = String(spokenText || '').trim();
    const routingHint = VoicePromptConditioner.extractRoutingHint(raw);
    const text = routingHint.cleanedPrompt || raw;

    // 1. Evaluate Gateman / architectural guardrail triggers
    const gateman = VoicePromptConditioner.evaluateGateman(raw);

    // 2. Detect Caveman / Focus modifier hints if spoken
    let cavemanFocus = null;
    if (/\b(modo\s+focus|modo\s+caveman|respuestas?\s+cortas?|sin\s+explicaciones\s+largas)\b/i.test(raw)) {
      cavemanFocus = true;
    } else if (/\b(modo\s+explicativo|explicaci[oó]n\s+detallada|paso\s+a\s+paso\s+detallado)\b/i.test(raw)) {
      cavemanFocus = false;
    }

    if (!text) {
      const defaultAgent = VoicePromptConditioner._buildAgentDescriptor('lead-architect', 'PLAN');
      return {
        mode: VOICE_MODES.PLAN,
        effectiveMode: 'PLAN',
        agent: defaultAgent,
        gateman,
        cavemanFocus
      };
    }

    // 3. Check if the user explicitly named an agent role
    let explicitAgentId = null;
    let explicitMode = null;
    for (const matcher of EXPLICIT_AGENT_MATCHERS) {
      if (matcher.pattern.test(raw)) {
        explicitAgentId = matcher.id;
        explicitMode = matcher.mode;
        break;
      }
    }

    // 4. Score the 4 primary modes (PLAN, BUILD, DEBUG, RESEARCH)
    const scores = {
      PLAN: 0,
      BUILD: 0,
      DEBUG: 0,
      RESEARCH: 0
    };

    for (const [modeKey, regexList] of Object.entries(MODE_PATTERNS)) {
      for (const regex of regexList) {
        const matches = text.match(new RegExp(regex.source, 'gi'));
        if (matches) {
          scores[modeKey] += matches.length;
        }
      }
    }

    // Leading imperative verb boost
    const lower = text.toLowerCase();
    if (/^(corrige|arregla|depura|fix|debug|audita|revisa\s+el\s+error|soluciona)\b/i.test(lower)) {
      scores.DEBUG += 2;
    } else if (/^(investiga|explora|busca|explica|expl[ií]came|analiza\s+el\s+contexto|d[oó]nde|c[oó]mo\s+funciona|por\s+qu[eé])\b/i.test(lower)) {
      scores.RESEARCH += 2;
    } else if (/^(dise[nñ]a|planifica|estructura|arquitectura|prop[oó]n|elabora\s+un\s+plan|c[oó]mo\s+estructurar)\b/i.test(lower)) {
      scores.PLAN += 2;
    } else if (/^(implementa|crea|escribe|agrega|a[nñ]ade|refactoriza|programa|actualiza|instala|ejecuta|construye|modifica|edita|haz)\b/i.test(lower)) {
      scores.BUILD += 2;
    }

    // Determine winning mode
    let resolvedMode = explicitMode || VOICE_MODES.PLAN;
    const maxScore = Math.max(scores.DEBUG, scores.BUILD, scores.RESEARCH, scores.PLAN);

    if (maxScore > 0) {
      // Priority tie-breaking: DEBUG > BUILD > RESEARCH > PLAN when action verbs are specific
      if (scores.DEBUG === maxScore) {
        resolvedMode = VOICE_MODES.DEBUG;
      } else if (scores.BUILD === maxScore && scores.PLAN < scores.BUILD) {
        resolvedMode = VOICE_MODES.BUILD;
      } else if (scores.RESEARCH === maxScore && scores.PLAN < scores.RESEARCH) {
        resolvedMode = VOICE_MODES.RESEARCH;
      } else {
        resolvedMode = VOICE_MODES.PLAN;
      }
    }

    const effectiveMode = (resolvedMode === VOICE_MODES.BUILD || resolvedMode === VOICE_MODES.DEBUG)
      ? 'BUILD'
      : 'PLAN';

    // 5. Select target agent ID
    let targetAgentId = explicitAgentId;
    if (!targetAgentId) {
      if (gateman.triggered && gateman.level === 'strict' && scores.BUILD === 0 && scores.PLAN === 0) {
        targetAgentId = gateman.recommendedGateAgent || MODE_DEFAULT_AGENT_ID[resolvedMode];
      } else if (resolvedMode === VOICE_MODES.BUILD && /\b(tdd|red[\s-]+green|test\s+unitario)\b/i.test(text)) {
        targetAgentId = 'sdd-apply';
      } else if (resolvedMode === VOICE_MODES.DEBUG && /\b(pr|pull\s+request|invariantes|clean\s+architecture|arquitectura\s+limpia|code\s+review)\b/i.test(text)) {
        targetAgentId = 'code-reviewer';
      } else if (resolvedMode === VOICE_MODES.DEBUG && /\b(seguridad|owasp|vulnerabilidad|zero\s+trust)\b/i.test(text)) {
        targetAgentId = 'security-engineer';
      } else {
        targetAgentId = MODE_DEFAULT_AGENT_ID[resolvedMode] || 'lead-architect';
      }
    }

    const agent = VoicePromptConditioner._buildAgentDescriptor(targetAgentId, effectiveMode);

    return {
      mode: resolvedMode,
      effectiveMode,
      agent,
      gateman,
      cavemanFocus
    };
  }

  /**
   * Alias for `classifyIntent`.
   * @param {string} spokenText
   */
  static classifyVoiceIntent(spokenText) {
    return VoicePromptConditioner.classifyIntent(spokenText);
  }

  /**
   * Evaluates Gateman and architectural guardrail triggers on the spoken prompt.
   *
   * @param {string} text
   * @returns {{
   *   triggered: boolean,
   *   level: 'normal'|'elevated'|'strict',
   *   guardrails: string[],
   *   requiresApproval: boolean,
   *   recommendedGateAgent: string|null
   * }}
   */
  static evaluateGateman(text) {
    const raw = String(text || '').trim();
    if (!raw) {
      return {
        triggered: false,
        level: 'normal',
        guardrails: [],
        requiresApproval: false,
        recommendedGateAgent: null
      };
    }

    const guardrails = [];
    let highestLevel = 'normal';
    let recommendedGateAgent = null;

    for (const rule of GATEMAN_RULES) {
      if (rule.pattern.test(raw)) {
        guardrails.push(rule.id);
        if (rule.level === 'strict') {
          highestLevel = 'strict';
          recommendedGateAgent = rule.recommendedAgent;
        } else if (rule.level === 'elevated' && highestLevel !== 'strict') {
          highestLevel = 'elevated';
          recommendedGateAgent = recommendedGateAgent || rule.recommendedAgent;
        }
      }
    }

    const triggered = guardrails.length > 0;
    return {
      triggered,
      level: highestLevel,
      guardrails,
      requiresApproval: highestLevel === 'strict',
      recommendedGateAgent
    };
  }

  /**
   * Builds a normalized agent descriptor matching `AgentSelectorMod` expectations.
   * @private
   */
  static _buildAgentDescriptor(agentId, effectiveMode = 'PLAN') {
    if (agentId === 'auto') {
      return {
        id: AUTO_AGENT.id,
        name: 'Auto (Plan/Build)',
        color: getAgentColor('auto'),
        levelLabel: AUTO_AGENT.levelLabel,
        effectiveMode,
        filePath: ''
      };
    }
    if (agentId === 'default') {
      return {
        id: DEFAULT_AGENT.id,
        name: 'Sin Agente',
        color: getAgentColor('default'),
        levelLabel: DEFAULT_AGENT.levelLabel,
        effectiveMode,
        filePath: ''
      };
    }

    const found = AGENT_REGISTRY.find(a => a.id === agentId) || AGENT_REGISTRY[0];
    return {
      id: found.id,
      name: found.name,
      color: getAgentColor(found.id),
      levelLabel: found.levelLabel,
      effectiveMode,
      filePath: found.filePath || ''
    };
  }

  /**
   * Full conditioning pipeline from raw voice transcript or `<talker_agent_context>` block.
   *
   * @param {string|Object} transcriptOrContext
   * @param {Object} [options={}]
   * @returns {Object} Conditioning result
   */
  condition(transcriptOrContext, options = {}) {
    return VoicePromptConditioner.condition(transcriptOrContext, {
      defaultCascadeId: this.defaultCascadeId,
      cascades: options.cascades || this.cascades,
      ...options
    });
  }

  /**
   * Static full conditioning pipeline.
   *
   * @param {string|Object} transcriptOrContext
   * @param {Object} [options={}]
   * @returns {Object} Conditioning result
   */
  static condition(transcriptOrContext, options = {}) {
    const spokenText = VoicePromptConditioner.extractSpokenText(transcriptOrContext);
    if (!spokenText) {
      return {
        conditioned: false,
        reason: 'empty_prompt',
        spokenText: '',
        cleanedPrompt: '',
        mode: VOICE_MODES.PLAN,
        effectiveMode: 'PLAN',
        agent: VoicePromptConditioner._buildAgentDescriptor('default', 'PLAN'),
        gateman: VoicePromptConditioner.evaluateGateman(''),
        gatemanTriggered: false,
        routing: {
          cascadeId: options.activeCascadeId || options.defaultCascadeId || 'default',
          targetHint: null,
          targetType: null,
          matched: false,
          isGlobalRoute: false,
          source: 'default'
        },
        cascadeId: options.activeCascadeId || options.defaultCascadeId || 'default',
        cavemanFocus: null
      };
    }

    const routingHint = VoicePromptConditioner.extractRoutingHint(spokenText);
    const routing = VoicePromptConditioner.resolveTargetCascade(spokenText, options);
    const classification = VoicePromptConditioner.classifyIntent(spokenText);

    return {
      conditioned: true,
      spokenText,
      cleanedPrompt: routingHint.cleanedPrompt,
      mode: classification.mode,
      effectiveMode: classification.effectiveMode,
      agent: classification.agent,
      gateman: classification.gateman,
      gatemanTriggered: classification.gateman.triggered,
      routing,
      cascadeId: routing.cascadeId,
      cavemanFocus: classification.cavemanFocus
    };
  }

  /**
   * Instance helper to attach `__conditionAgentFromVoice` to a browser/DOM window.
   *
   * @param {Object} win
   * @param {Object} [options={}]
   * @returns {Function|null} The attached `__conditionAgentFromVoice` function.
   */
  attachToWindow(win, options = {}) {
    return VoicePromptConditioner.attachToWindow(win, {
      defaultCascadeId: this.defaultCascadeId,
      cascades: options.cascades || this.cascades,
      ...options
    });
  }

  /**
   * Attaches `win.__conditionAgentFromVoice(transcriptOrContext, callOptions)` to the given window.
   * Automatically updates `__antigravity_selected_agents_map` in `localStorage`, updates the active
   * cascade's agent badge in the DOM, and dispatches the `'antigravity:voice-conditioned'` CustomEvent.
   *
   * @param {Object} win
   * @param {Object} [options={}]
   * @returns {Function|null}
   */
  static attachToWindow(win, options = {}) {
    if (!win || typeof win !== 'object') {
      return null;
    }

    const conditionFn = function __conditionAgentFromVoice(transcriptOrContext, callOptions = {}) {
      const mergedOptions = {
        ...options,
        ...callOptions,
        win
      };

      const result = VoicePromptConditioner.condition(transcriptOrContext, mergedOptions);
      if (!result.conditioned) {
        return result;
      }

      const cascadeId = result.cascadeId || 'default';
      const agentPayload = {
        id: result.agent.id,
        name: result.agent.name,
        color: result.agent.color,
        filePath: result.agent.filePath || '',
        effectiveMode: result.effectiveMode,
        mode: result.mode,
        conditionedBy: 'voice',
        gateman: result.gateman
      };

      // 1. Update in-memory active agents map on window
      win.__antigravityActiveAgents = win.__antigravityActiveAgents || {};
      win.__antigravityActiveAgents[cascadeId] = agentPayload;

      // 2. Persist in localStorage (__antigravity_selected_agents_map & __antigravity_selected_agent)
      const storage = win.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
        try {
          const rawMap = storage.getItem('__antigravity_selected_agents_map');
          const map = rawMap ? JSON.parse(rawMap) : {};
          map[cascadeId] = agentPayload;
          storage.setItem('__antigravity_selected_agents_map', JSON.stringify(map));
          storage.setItem('__antigravity_selected_agent', JSON.stringify(agentPayload));
        } catch {
          // Ignore storage quota or serialization errors
        }
      }

      // 3. Update Caveman / Focus mode if explicitly requested by voice
      if (typeof result.cavemanFocus === 'boolean' && typeof win.__toggleCavemanMode === 'function') {
        try {
          win.__toggleCavemanMode(result.cavemanFocus);
        } catch {
          // Ignore DOM errors
        }
      }

      // 4. Update matching agent badge(s) in DOM
      const doc = win.document;
      if (doc && typeof doc.querySelectorAll === 'function') {
        const badges = Array.from(doc.querySelectorAll('.antigravity-agent-badge, #antigravity-agent-badge'));
        let updatedAny = false;

        for (const badge of badges) {
          const badgeCascadeEl = typeof badge.closest === 'function' ? badge.closest('[data-cascade-id]') : null;
          const badgeCascadeId = (badgeCascadeEl && typeof badgeCascadeEl.getAttribute === 'function')
            ? badgeCascadeEl.getAttribute('data-cascade-id')
            : (typeof win.__resolveCascadeId === 'function' ? win.__resolveCascadeId(badge) : null);

          if (!badgeCascadeId || badgeCascadeId === cascadeId || badges.length === 1) {
            VoicePromptConditioner._applyBadgeDomUpdate(win, badge, agentPayload, result);
            updatedAny = true;
          }
        }

        if (!updatedAny && badges.length > 0) {
          VoicePromptConditioner._applyBadgeDomUpdate(win, badges[0], agentPayload, result);
        }
      }

      // 5. Dispatch CustomEvent 'antigravity:voice-conditioned'
      VoicePromptConditioner._dispatchVoiceEvent(win, result);

      return result;
    };

    win.__conditionAgentFromVoice = conditionFn;
    return conditionFn;
  }

  /**
   * Updates an `.antigravity-agent-badge` element with the conditioned agent and mode state.
   * @private
   */
  static _applyBadgeDomUpdate(win, badge, agentPayload, result) {
    if (!badge) return;

    if (typeof win.__applyAgentToBadge === 'function') {
      win.__applyAgentToBadge(badge, agentPayload);
    } else {
      if (typeof badge.setAttribute === 'function') {
        badge.setAttribute('data-agent-id', agentPayload.id);
        badge.setAttribute('data-effective-mode', result.effectiveMode);
        badge.setAttribute('title', `Modo Activo: ${agentPayload.name} (${result.mode})`);
      }
      if (badge.style) {
        badge.style.borderColor = `${agentPayload.color}66`;
        badge.style.boxShadow = `0 0 8px ${agentPayload.color}33`;
      }
      if (typeof badge.querySelector === 'function') {
        const label = badge.querySelector('.antigravity-active-agent-name, #antigravity-active-agent-name');
        if (label) {
          label.textContent = agentPayload.name;
        }
        const dot = badge.querySelector('.antigravity-active-agent-dot, #antigravity-active-agent-dot');
        if (dot && dot.style) {
          dot.style.background = agentPayload.color;
          dot.style.boxShadow = `0 0 6px ${agentPayload.color}`;
        }
      }
    }

    if (typeof badge.setAttribute === 'function') {
      badge.setAttribute('data-voice-mode', result.mode);
      badge.setAttribute('data-gateman-active', result.gatemanTriggered ? 'true' : 'false');
    }
  }

  /**
   * Dispatches `antigravity:voice-conditioned` on the target window/document.
   * @private
   */
  static _dispatchVoiceEvent(win, detail) {
    const eventName = 'antigravity:voice-conditioned';
    let evt = null;

    try {
      const CustomEventCtor = win.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
      if (typeof CustomEventCtor === 'function') {
        evt = new CustomEventCtor(eventName, {
          detail,
          bubbles: true,
          cancelable: false
        });
      }
    } catch {
      evt = null;
    }

    if (!evt) {
      evt = {
        type: eventName,
        detail,
        bubbles: true,
        cancelable: false
      };
    }

    if (typeof win.dispatchEvent === 'function') {
      win.dispatchEvent(evt);
    } else if (win.document && typeof win.document.dispatchEvent === 'function') {
      win.document.dispatchEvent(evt);
    }
  }
}
