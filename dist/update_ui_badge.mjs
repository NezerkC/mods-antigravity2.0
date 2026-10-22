// Antigravity Mod Framework Runtime Host (Bundle)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ======================== Core & SDK ========================



/**
 * Discovers and extracts the active Chrome DevTools Protocol (CDP) debugging
 * port from Antigravity Electron logs.
 */
class CdpPortResolver {
  /**
   * @param {Object} [options]
   * @param {string} [options.logDir] Custom path to Antigravity logs directory.
   * @param {number} [options.defaultPort] Fallback port if auto-discovery fails.
   */
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity', 'logs');
    this.defaultPort = options.defaultPort ?? 53908;
  }

  /**
   * Parses the CDP WebSocket port from a raw log string.
   * @param {string} content Log file contents.
   * @param {number|null} [fallback=null] Fallback value if no pattern matches.
   * @returns {number|null}
   */
  static parsePortFromLog(content, fallback = null) {
    if (typeof content !== 'string') return fallback;
    const match = content.match(/ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser/);
    if (match && match[1]) {
      const port = Number(match[1]);
      return Number.isSafeInteger(port) && port > 0 ? port : fallback;
    }
    return fallback;
  }

  /**
   * Resolves the active port by inspecting the most recent log file.
   * @returns {number} Discovered port or default fallback.
   */
  resolvePort() {
    try {
      if (!fs.existsSync(this.logDir)) {
        return this.defaultPort;
      }

      const logFiles = fs.readdirSync(this.logDir)
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const fullPath = path.join(this.logDir, f);
          return { name: f, fullPath, time: fs.statSync(fullPath).mtimeMs };
        })
        .sort((a, b) => b.time - a.time);

      if (!logFiles.length) {
        return this.defaultPort;
      }

      const newestLog = fs.readFileSync(logFiles[0].fullPath, 'utf-8');
      return CdpPortResolver.parsePortFromLog(newestLog, this.defaultPort);
    } catch {
      return this.defaultPort;
    }
  }
}


/**
 * Client for interacting with the Electron Chrome DevTools Protocol (CDP) WebSocket bridge.
 */
class CdpWebSocketClient {
  /**
   * @param {Object} [options]
   * @param {number} [options.port=53908] CDP HTTP/WebSocket port.
   * @param {string} [options.host='127.0.0.1'] Hostname.
   * @param {number} [options.timeoutMs=4000] Socket connection timeout.
   */
  constructor(options = {}) {
    this.port = options.port ?? 53908;
    this.host = options.host || '127.0.0.1';
    this.timeoutMs = options.timeoutMs ?? 4000;
    this.sequenceId = 1;
  }

  /**
   * Builds the CDP JSON target listing endpoint.
   * @returns {string}
   */
  getTargetListUrl() {
    return `http://${this.host}:${this.port}/json`;
  }

  /**
   * Finds the primary browser page target among the reported CDP targets.
   * @param {Array<{ type: string, webSocketDebuggerUrl?: string }>} targets
   * @returns {{ type: string, webSocketDebuggerUrl?: string } | undefined}
   */
  static findPageTarget(targets) {
    if (!Array.isArray(targets)) return undefined;
    return targets.find(t => t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string');
  }

  /**
   * Creates a JSON-RPC 2.0 command payload for Runtime.evaluate.
   * @param {string} expression JavaScript expression to evaluate.
   * @param {number} [id] Optional message ID.
   * @returns {Object}
   */
  createEvaluatePayload(expression, id) {
    return {
      id: id ?? this.sequenceId++,
      method: 'Runtime.evaluate',
      params: {
        expression,
        returnByValue: true
      }
    };
  }

  /**
   * Dispatches a JavaScript expression to be evaluated inside the Electron page context.
   * @param {string} expression
   * @returns {Promise<any>}
   */
  async evaluate(expression) {
    const listUrl = this.getTargetListUrl();
    const res = await fetch(listUrl, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) {
      throw new Error(`Failed to query CDP targets: HTTP ${res.status}`);
    }

    const targets = await res.json();
    const page = CdpWebSocketClient.findPageTarget(targets);
    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error('No active Electron page target found via CDP.');
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`CDP evaluation timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      ws.onopen = () => {
        const payload = this.createEvaluatePayload(expression);
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (event) => {
        clearTimeout(timer);
        try {
          const data = JSON.parse(event.data);
          ws.close();
          if (data.error) {
            reject(new Error(data.error.message || 'CDP execution error'));
          } else {
            resolve(data.result?.result || data.result);
          }
        } catch (err) {
          ws.close();
          reject(err);
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        ws.close();
        reject(err);
      };
    });
  }
}


/**
 * Manages target UI slots in the Antigravity 2.0 DOM and generates
 * collision-free injection payloads for registered mods.
 */
class SlotManager {
  constructor() {
    /** @type {Map<string, { selector: string, strategy: 'before'|'after'|'append'|'prepend' }>} */
    this.slots = new Map([
      ['header-actions', {
        selector: 'button[data-testid="model-selector-trigger"]',
        strategy: 'after'
      }],
      ['header-right', {
        selector: 'header, [role="banner"]',
        strategy: 'append'
      }],
      ['status-bar', {
        selector: 'footer, [data-testid="status-bar"]',
        strategy: 'append'
      }],
      ['floating-dock', {
        selector: 'body',
        strategy: 'append'
      }]
    ]);
  }

  /**
   * Registers a new slot or overrides an existing slot target.
   * @param {string} slotId
   * @param {{ selector: string, strategy: 'before'|'after'|'append'|'prepend' }} definition
   */
  registerSlot(slotId, definition) {
    if (!definition || !definition.selector) {
      throw new Error(`Invalid slot definition for "${slotId}". Selector is required.`);
    }
    this.slots.set(slotId, {
      selector: definition.selector,
      strategy: definition.strategy || 'append'
    });
  }

  /**
   * Retrieves definition for a given slot.
   * @param {string} slotId
   */
  getSlot(slotId) {
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Slot "${slotId}" is not registered in SlotManager.`);
    }
    return slot;
  }

  /**
   * Gets deterministic DOM element ID for a slot container.
   * @param {string} slotId
   * @returns {string}
   */
  getContainerId(slotId) {
    return `antigravity-slot-${slotId}`;
  }

  /**
   * Generates browser-executable JavaScript to mount a mod within a target slot.
   * @param {Object} params
   * @param {string} params.slotId
   * @param {string} params.modId
   * @param {string} params.htmlContent
   * @returns {string}
   */
  generateMountCode({ slotId, modId, htmlContent }) {
    const slot = this.getSlot(slotId);
    const containerId = this.getContainerId(slotId);
    const modWrapperId = `antigravity-mod-${modId}`;

    return `
      (() => {
        const anchor = document.querySelector('${slot.selector}');
        if (!anchor) return;

        let container = document.getElementById('${containerId}');
        if (!container) {
          container = document.createElement('div');
          container.id = '${containerId}';
          container.style.display = 'inline-flex';
          container.style.alignItems = 'center';
          container.style.gap = '8px';

          if ('${slot.strategy}' === 'after') {
            anchor.insertAdjacentElement('afterend', container);
          } else if ('${slot.strategy}' === 'before') {
            anchor.insertAdjacentElement('beforebegin', container);
          } else if ('${slot.strategy}' === 'prepend') {
            anchor.prepend(container);
          } else {
            anchor.appendChild(container);
          }
        }

        let modNode = document.getElementById('${modWrapperId}');
        if (!modNode) {
          modNode = document.createElement('div');
          modNode.id = '${modWrapperId}';
          container.appendChild(modNode);
        }
        modNode.innerHTML = ${JSON.stringify(htmlContent)};
      })();
    `;
  }
}


/**
 * Scopes and isolates raw CSS rules to prevent injected mod styles
 * from conflicting with Antigravity host UI.
 */
class StyleIsolator {
  /**
   * Scopes CSS rules by prefixing non-at-rule selectors with a root container selector.
   * @param {string} css Raw CSS stylesheet string.
   * @param {string} scopeSelector Root container selector (e.g. #antigravity-mod-myid).
   * @returns {string} Scoped CSS string.
   */
  static scopeCss(css, scopeSelector) {
    if (!css || typeof css !== 'string') return '';
    const cleanScope = scopeSelector.trim();
    if (!cleanScope) return css;

    // Tokenize at-rules (like @keyframes, @media) by tracking balanced braces
    const atRuleBlocks = [];
    let text = css;
    let strippedCss = '';

    while (text.length > 0) {
      const atIndex = text.indexOf('@');
      if (atIndex === -1) {
        strippedCss += text;
        break;
      }

      strippedCss += text.slice(0, atIndex);
      text = text.slice(atIndex);

      let depth = 0;
      let endIndex = -1;

      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }

      if (endIndex !== -1) {
        const fullAtRule = text.slice(0, endIndex + 1);
        atRuleBlocks.push(fullAtRule.trim());
        text = text.slice(endIndex + 1);
      } else {
        strippedCss += text;
        break;
      }
    }

    // Now scope standard selector rules: selector { ... }
    const scopedStandardRules = strippedCss.replace(/([^{}]+)\{([^{}]+)\}/g, (match, selectorGroup, declarations) => {
      const trimmedGroup = selectorGroup.trim();
      if (!trimmedGroup) return match;

      const scopedSelectors = trimmedGroup
        .split(',')
        .map(sel => sel.trim())
        .filter(Boolean)
        .map(sel => `${cleanScope} ${sel}`)
        .join(', ');

      return `${scopedSelectors} {${declarations}}`;
    }).trim();

    // Recombine preserved at-rules and scoped standard rules
    const combined = [];
    if (atRuleBlocks.length) {
      combined.push(atRuleBlocks.join('\n\n'));
    }
    if (scopedStandardRules) {
      combined.push(scopedStandardRules);
    }

    return combined.join('\n\n');
  }
}


/**
 * Base class for all Antigravity desktop UI mods.
 * Enforces metadata manifest and standard lifecycle contracts.
 */
class AntigravityMod {
  /**
   * @param {Object} manifest
   * @param {string} manifest.id Unique alphanumeric identifier for the mod.
   * @param {string} manifest.name Human readable display name.
   * @param {string} manifest.version Semantic versioning string (e.g. 1.0.0).
   * @param {'header-actions'|'header-right'|'status-bar'|'floating-dock'} manifest.slot Target UI anchor.
   * @param {number} [manifest.priority=10] Ordering weight within the slot.
   */
  constructor(manifest) {
    if (
      !manifest ||
      typeof manifest.id !== 'string' ||
      typeof manifest.name !== 'string' ||
      typeof manifest.version !== 'string' ||
      typeof manifest.slot !== 'string'
    ) {
      throw new Error("Mod manifest requires 'id', 'name', 'version', and 'slot'");
    }

    this.manifest = Object.freeze({
      priority: 10,
      ...manifest
    });
  }

  /**
   * Optional initialization lifecycle hook.
   * Called once when the mod is registered into the host runtime.
   * @param {Object} [context]
   */
  async onInit(context) {}

  /**
   * Primary render method.
   * MUST return an object containing the rendered HTML template and optional scoped CSS.
   * @param {Object} context Host context with telemetry and active conversation information.
   * @returns {{ html: string, css?: string, script?: string }}
   */
  render(context) {
    throw new Error(`Method 'render(context)' must be implemented by mod [${this.manifest.id}]`);
  }

  /**
   * Optional update lifecycle hook.
   * Invoked on subsequent turns or when new telemetry is emitted without full remount.
   * @param {Object} context
   */
  onUpdate(context) {}

  /**
   * Optional cleanup lifecycle hook.
   * Called when the mod is disabled or unmounted.
   */
  onDestroy() {}
}




/**
 * Discovers, registers, and compiles UI mods into coordinated injection scripts.
 */
class ModLoader {
  /**
   * @param {Object} [options]
   * @param {SlotManager} [options.slotManager]
   */
  constructor(options = {}) {
    this.slotManager = options.slotManager || new SlotManager();
    /** @type {Map<string, import('../sdk/AntigravityMod.js').AntigravityMod>} */
    this.mods = new Map();
  }

  /**
   * Registers a mod into the loader.
   * @param {import('../sdk/AntigravityMod.js').AntigravityMod} mod
   */
  register(mod) {
    if (!mod || !mod.manifest || !mod.manifest.id) {
      throw new Error('Cannot register mod: missing or invalid manifest.');
    }

    if (this.mods.has(mod.manifest.id)) {
      throw new Error(`Mod with ID "${mod.manifest.id}" is already registered.`);
    }

    this.mods.set(mod.manifest.id, mod);
  }

  /**
   * Returns registered mods sorted by priority (descending).
   * @returns {Array<import('../sdk/AntigravityMod.js').AntigravityMod>}
   */
  getRegisteredMods() {
    return Array.from(this.mods.values()).sort((a, b) => {
      const pA = a.manifest.priority ?? 10;
      const pB = b.manifest.priority ?? 10;
      return pB - pA;
    });
  }

  /**
   * Compiles registered mods and their rendered templates into an executable CDP payload.
   * @param {Object} context Host context passed to mod render methods.
   * @returns {string} Executable JavaScript.
   */
  buildInjectionPayload(context = {}) {
    const mods = this.getRegisteredMods();
    const mountSnippets = [];
    const combinedStyles = [];

    for (const mod of mods) {
      const modId = mod.manifest.id;
      const slotId = mod.manifest.slot;
      const wrapperId = `#antigravity-mod-${modId}`;

      const rendered = mod.render(context);
      const html = rendered && rendered.html ? rendered.html : '';
      const rawCss = rendered && rendered.css ? rendered.css : '';

      if (rawCss) {
        const scopedCss = StyleIsolator.scopeCss(rawCss, wrapperId);
        combinedStyles.push(scopedCss);
      }

      const mountCode = this.slotManager.generateMountCode({
        slotId,
        modId,
        htmlContent: html
      });
      mountSnippets.push(mountCode);
    }

    const cssBundle = combinedStyles.join('\n\n');

    return `
      (() => {
        window.__antigravityMods = window.__antigravityMods || {};

        // 1. Inject or update shared mod stylesheet
        let styleTag = document.getElementById('antigravity-mods-styles');
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'antigravity-mods-styles';
          document.head.appendChild(styleTag);
        }
        styleTag.textContent = ${JSON.stringify(cssBundle)};

        // 2. Mount individual mods into target slots
        ${mountSnippets.join('\n')}
      })();
    `;
  }
}





/**
 * Service responsible for calculating detailed context window telemetry and
 * token usage metrics from Antigravity conversation transcripts.
 */
class TelemetryService {
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
   * Default empty telemetry snapshot.
   */
  getEmptySnapshot() {
    return {
      estTokens: 0,
      pct: '0.0',
      displayTokens: '0',
      sizeKb: 0,
      steps: 0,
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

      for (const line of lines) {
        if (!line.trim()) continue;
        raw.steps++;

        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }

        const len = (str) => (typeof str === 'string' ? str.length : 0);

        if (obj.thinking) {
          raw.thinkingChars += len(obj.thinking);
        }

        const contentLen = len(obj.content);

        if (obj.tool_calls && Array.isArray(obj.tool_calls)) {
          const isMcp = obj.tool_calls.some(tc =>
            tc.name && (tc.name.startsWith('mcp_') || tc.name === 'call_mcp_tool')
          );
          if (isMcp) raw.mcpChars += contentLen;
          else raw.toolsChars += contentLen;
        } else if (obj.type === 'USER_INPUT') {
          raw.userChars += contentLen;
        } else if (obj.type === 'PLANNER_RESPONSE') {
          raw.modelChars += contentLen;
        } else if (obj.type === 'GENERIC') {
          raw.toolsChars += contentLen;
        } else {
          raw.otherChars += contentLen;
        }
      }

      raw.totalChars =
        raw.userChars +
        raw.modelChars +
        raw.thinkingChars +
        raw.toolsChars +
        raw.mcpChars +
        raw.otherChars;

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

      let displayTokens = estTokens.toLocaleString();
      if (estTokens >= 1_000_000) {
        displayTokens = (estTokens / 1_000_000).toFixed(2) + 'M';
      } else if (estTokens >= 10_000) {
        displayTokens = (estTokens / 1_000).toFixed(1) + 'k';
      }

      return {
        estTokens,
        pct,
        displayTokens,
        sizeKb: Math.round(totalBytes / 1024),
        steps: raw.steps,
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
   * Retrieves telemetry metrics for all active conversations in the brain.
   * @returns {Record<string, Object>}
   */
  getAllMetrics() {
    const metrics = {};
    try {
      if (!fs.existsSync(this.brainDir)) return metrics;

      const dirs = fs.readdirSync(this.brainDir).filter(d => /^[0-9a-fA-F-]{36}$/.test(d));

      for (const convId of dirs) {
        const fullPath = path.join(this.brainDir, convId, '.system_generated', 'logs', 'transcript_full.jsonl');
        const compactPath = path.join(this.brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');

        let targetPath = '';
        if (fs.existsSync(fullPath)) targetPath = fullPath;
        else if (fs.existsSync(compactPath)) targetPath = compactPath;

        if (!targetPath) {
          metrics[convId] = this.getEmptySnapshot();
          continue;
        }

        metrics[convId] = this.parseTranscriptFile(targetPath);
      }
    } catch {
      // Gracefully prevent background hook crashes
    }
    return metrics;
  }
}







/**
 * Central orchestrator host for Antigravity Mod Framework.
 * Coordinates telemetry extraction, mod lifecycle, and CDP DOM dispatching.
 */
class ModHost {
  /**
   * @param {Object} [options]
   * @param {SlotManager} [options.slotManager]
   * @param {ModLoader} [options.modLoader]
   * @param {TelemetryService} [options.telemetryService]
   * @param {CdpPortResolver} [options.portResolver]
   */
  constructor(options = {}) {
    this.slotManager = options.slotManager || new SlotManager();
    this.modLoader = options.modLoader || new ModLoader({ slotManager: this.slotManager });
    this.telemetryService = options.telemetryService || new TelemetryService();
    this.portResolver = options.portResolver || new CdpPortResolver();
  }

  /**
   * Registers an active UI mod with the host.
   * @param {import('../sdk/AntigravityMod.js').AntigravityMod} mod
   */
  registerMod(mod) {
    this.modLoader.register(mod);
  }

  /**
   * Compiles the combined DOM injection payload for all registered mods.
   * @param {Object} context
   * @returns {string}
   */
  compilePayload(context = {}) {
    return this.modLoader.buildInjectionPayload(context);
  }

  /**
   * Executes the full host lifecycle: extracts telemetry, compiles registered
   * mods, resolves CDP port, and dispatches the payload to the Electron renderer.
   * @returns {Promise<any>}
   */
  async dispatch() {
    const allMetrics = this.telemetryService.getAllMetrics();

    // Determine current/latest conversation metrics
    const convIds = Object.keys(allMetrics);
    let primaryMetric = this.telemetryService.getEmptySnapshot();
    if (convIds.length > 0) {
      primaryMetric = allMetrics[convIds[0]];
    }

    const hostContext = {
      telemetry: primaryMetric,
      allMetrics,
      timestamp: Date.now()
    };

    const payload = this.compilePayload(hostContext);
    const port = this.portResolver.resolvePort();
    const cdpClient = new CdpWebSocketClient({ port });

    return await cdpClient.evaluate(payload);
  }
}


// ==================== Context Tachometer Mod ====================
/**
 * Generates an analog speedometer/tachometer SVG based on the reference design.
 * Features an unrotated 240° arc path with a linear gradient:
 * - Green (0% - Empty / Desocupado) on the left
 * - Yellow (40% - Moderate) at top center
 * - Orange (70% - High)
 * - Red (100% - Full / Lleno) on the right
 */
function renderGaugeSvg(pct = 0, size = 18) {
  const numericPct = typeof pct === 'string' ? parseFloat(pct) || 0 : (pct || 0);
  const clampedPct = Math.min(Math.max(numericPct, 0), 100);
  const angle = -120 + (clampedPct / 100) * 240;

  let needleColor = '#22c55e'; // Green when low
  if (clampedPct >= 85) needleColor = '#ef4444';      // Red when critical
  else if (clampedPct >= 60) needleColor = '#f97316'; // Orange when high
  else if (clampedPct >= 25) needleColor = '#eab308'; // Yellow when moderate

  return `
    <svg viewBox="0 0 100 100" width="${size}" height="${size}" style="vertical-align: middle; flex-shrink: 0; overflow: visible;">
      <defs>
        <linearGradient id="antigravityGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#22c55e" />
          <stop offset="35%" stop-color="#eab308" />
          <stop offset="70%" stop-color="#f97316" />
          <stop offset="100%" stop-color="#ef4444" />
        </linearGradient>
        <filter id="gaugeShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3" />
        </filter>
      </defs>
      
      <!-- Background Track (Dark muted) -->
      <path
        d="M 18.82 68 A 36 36 0 1 1 81.18 68"
        fill="none"
        stroke="rgba(255, 255, 255, 0.15)"
        stroke-width="10"
        stroke-linecap="round"
      />

      <!-- Color Gradient Gauge Track (Green at left/start -> Red at right/end) -->
      <path
        d="M 18.82 68 A 36 36 0 1 1 81.18 68"
        fill="none"
        stroke="url(#antigravityGaugeGrad)"
        stroke-width="10"
        stroke-linecap="round"
      />

      <!-- Needle pointing to current context -->
      <g style="transform-origin: 50px 50px; transform: rotate(${angle.toFixed(1)}deg); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);" filter="url(#gaugeShadow)">
        <polygon points="46.5,50 50,14 53.5,50" fill="${needleColor}" />
      </g>

      <!-- Center Hub Pivot -->
      <circle cx="50" cy="50" r="10" fill="#18181b" stroke="#ffffff" stroke-width="2" />
      <circle cx="50" cy="50" r="3.5" fill="#ffffff" />
    </svg>
  `.trim();
}


const FONT_SANS = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/**
 * Builds the HTML for the rich context breakdown popover.
 */
function renderPopoverHtml(metric) {
  const m = metric || {
    estTokens: 0,
    pct: '0.0',
    pctNumber: 0,
    displayTokens: '0',
    sizeKb: 0,
    steps: 0,
    breakdown: {
      user: { tokens: 0, pct: 0 },
      model: { tokens: 0, pct: 0 },
      thinking: { tokens: 0, pct: 0 },
      tools: { tokens: 0, pct: 0 },
      mcp: { tokens: 0, pct: 0 }
    }
  };

  const b = m.breakdown || {};
  const user = b.user || { tokens: 0, pct: 0 };
  const model = b.model || { tokens: 0, pct: 0 };
  const thinking = b.thinking || { tokens: 0, pct: 0 };
  const tools = b.tools || { tokens: 0, pct: 0 };
  const mcp = b.mcp || { tokens: 0, pct: 0 };

  let statusColor = '#22c55e';
  const pctNum = m.pctNumber || parseFloat(m.pct) || 0;

  if (pctNum >= 85) {
    statusColor = '#ef4444';
  } else if (pctNum >= 60) {
    statusColor = '#f97316';
  } else if (pctNum >= 25) {
    statusColor = '#eab308';
  }

  const renderRow = (icon, label, data, barColor) => `
    <div style="margin-bottom: 7px;">
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; color: #d4d4d8;">
        <span style="display: flex; align-items: center; gap: 5px;">
          <span>${icon}</span>
          <span style="font-weight: 500;">${label}</span>
        </span>
        <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 10.5px;">
          ${data.tokens.toLocaleString()} tok <span style="color: ${barColor}; font-weight: 600;">(${data.pct}%)</span>
        </span>
      </div>
      <div style="height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px; overflow: hidden;">
        <div style="width: ${Math.min(data.pct, 100)}%; height: 100%; background: ${barColor}; border-radius: 9999px;"></div>
      </div>
    </div>
  `;

  return `
    <div class="antigravity-popover-content" style="
      width: 295px;
      padding: 13px 14px;
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 12px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);
      font-family: ${FONT_SANS};
      font-size: 12px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      pointer-events: auto;
    ">
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.09);">
        <div style="display: flex; align-items: center; gap: 7px;">
          <span style="font-size: 14px;">⚡</span>
          <span style="font-weight: 600; font-size: 12.5px; letter-spacing: -0.01em; color: #ffffff;">Context Telemetry</span>
        </div>
        <span style="font-size: 10.5px; padding: 2px 7px; border-radius: 9999px; background: rgba(255, 255, 255, 0.08); color: #a1a1aa; font-family: ${FONT_MONO};">
          1M Limit
        </span>
      </div>

      <!-- Main Gauge Stat Card -->
      <div style="display: flex; align-items: center; gap: 14px; padding: 10px 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 9px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: center;">
          <!-- Inline 42px Mini Gauge -->
          <svg viewBox="0 0 100 100" width="42" height="42" style="overflow: visible;">
            <path d="M 18.82 68 A 36 36 0 1 1 81.18 68" fill="none" stroke="rgba(255, 255, 255, 0.15)" stroke-width="10" stroke-linecap="round" />
            <path d="M 18.82 68 A 36 36 0 1 1 81.18 68" fill="none" stroke="url(#antigravityGaugeGrad)" stroke-width="10" stroke-linecap="round" />
            <g style="transform-origin: 50px 50px; transform: rotate(${(-120 + (Math.min(pctNum, 100) / 100) * 240).toFixed(1)}deg);">
              <polygon points="46.5,50 50,14 53.5,50" fill="${statusColor}" />
            </g>
            <circle cx="50" cy="50" r="10" fill="#18181b" stroke="#ffffff" stroke-width="2" />
            <circle cx="50" cy="50" r="3.5" fill="#ffffff" />
          </svg>
        </div>
        <div style="flex: 1;">
          <div style="font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; font-weight: 600; margin-bottom: 1px;">Estimated Usage</div>
          <div style="display: flex; align-items: baseline; gap: 5px;">
            <span style="font-size: 17px; font-weight: 700; color: #ffffff; font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums;">
              ${m.displayTokens}
            </span>
            <span style="font-size: 11px; font-weight: 600; color: ${statusColor};">
              (${m.pct}%)
            </span>
          </div>
        </div>
      </div>

      <!-- Category Breakdown Rows -->
      <div style="margin-bottom: 12px;">
        <div style="font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; font-weight: 600; margin-bottom: 8px;">Breakdown by Source</div>
        ${renderRow('👤', 'User Prompts', user, '#38bdf8')}
        ${renderRow('🤖', 'Assistant Replies', model, '#a855f7')}
        ${renderRow('🧠', 'Thinking (CoT)', thinking, '#ec4899')}
        ${renderRow('⚙️', 'Local Tools', tools, '#f59e0b')}
        ${renderRow('🌐', 'MCP Protocol', mcp, '#10b981')}
      </div>

      <!-- Footer Info -->
      <div style="padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.07); display: flex; justify-content: space-between; font-size: 10.5px; color: #71717a; font-family: ${FONT_MONO};">
        <span>Turns: <strong style="color: #a1a1aa;">${m.steps}</strong></span>
        <span>Storage: <strong style="color: #a1a1aa;">${m.sizeKb} KB</strong></span>
      </div>
    </div>
  `.trim();
}











class ContextTachometerMod extends AntigravityMod {
  constructor() {
    super({
      id: 'context-tachometer',
      name: 'Context Window Tachometer',
      version: '2.0.0',
      slot: 'header-actions',
      priority: 50
    });

    this.cachedCss = ".antigravity-tachometer-badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 7px;\n  padding: 3px 9px 3px 6px;\n  background: rgba(255, 255, 255, 0.05);\n  border: 1px solid rgba(255, 255, 255, 0.12);\n  border-radius: 9999px;\n  cursor: pointer;\n  user-select: none;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;\n  font-size: 11px;\n  line-height: 1;\n  color: #e4e4e7;\n  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);\n  position: relative;\n}\n\n.antigravity-tachometer-badge:hover {\n  background: rgba(255, 255, 255, 0.1);\n  border-color: rgba(255, 255, 255, 0.25);\n  transform: translateY(-0.5px);\n  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);\n}\n\n.antigravity-tachometer-badge:active {\n  transform: translateY(0.5px);\n}\n\n.antigravity-popover-container {\n  position: absolute;\n  top: calc(100% + 8px);\n  left: 0;\n  z-index: 99999;\n  display: none;\n  animation: popoverFadeIn 0.15s ease-out;\n}\n\n.antigravity-tachometer-badge:hover .antigravity-popover-container,\n.antigravity-popover-container:hover {\n  display: block;\n}\n\n@keyframes popoverFadeIn {\n  from {\n    opacity: 0;\n    transform: translateY(-4px) scale(0.98);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0) scale(1);\n  }\n}\n";
  }

  /**
   * Renders the analog speedometer badge with context percentage and interactive popover.
   * @param {Object} context
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    const telemetry = context.telemetry || {
      estTokens: 0,
      pct: '0.0',
      displayTokens: '0',
      sizeKb: 0,
      steps: 0,
      breakdown: {
        user: { tokens: 0, pct: 0 },
        model: { tokens: 0, pct: 0 },
        thinking: { tokens: 0, pct: 0 },
        tools: { tokens: 0, pct: 0 },
        mcp: { tokens: 0, pct: 0 },
        other: { tokens: 0, pct: 0 }
      }
    };

    const pctNum = parseFloat(telemetry.pct) || 0;
    const gaugeSvg = renderGaugeSvg(pctNum, 17);
    const popoverHtml = renderPopoverHtml(telemetry);

    const html = `
      <div id="antigravity-tachometer-badge" class="antigravity-tachometer-badge" title="Context: ${telemetry.displayTokens} tokens (${telemetry.pct}%)">
        ${gaugeSvg}
        <span style="font-weight: 500; letter-spacing: -0.01em;">${telemetry.displayTokens}</span>
        <span style="color: #a1a1aa; font-size: 10px;">(${telemetry.pct}%)</span>
        <div class="antigravity-popover-container">
          ${popoverHtml}
        </div>
      </div>
    `.trim();

    return {
      html,
      css: this.cachedCss
    };
  }
}


// ===================== Agent Selector Mod =====================
/**
 * Vector SVG representation of the Fedora Hat and Sunglasses icon.
 * Matches the classic spy / agent silhouette.
 */
function renderAgentIconSvg(size = 16) {
  return `
    <svg class="antigravity-agent-icon" viewBox="0 0 100 100" width="${size}" height="${size}" fill="currentColor" style="vertical-align: middle; flex-shrink: 0; overflow: visible;">
      <!-- Fedora Hat Crown with classic crease -->
      <path d="M 33 40 C 29 23, 40 13, 50 18 C 60 13, 71 23, 67 40 Z" />
      
      <!-- Hat Ribbon Band -->
      <path d="M 31 38 C 44 35, 56 35, 69 38 L 71 43 C 57 40, 43 40, 29 43 Z" opacity="0.8" />
      
      <!-- Wide Curved Brim -->
      <path d="M 12 47 C 32 38, 68 38, 88 47 C 68 43, 32 43, 12 47 Z" />
      
      <!-- Sunglasses Frame -->
      <path d="M 24 57 C 24 53, 46 53, 47 57 L 46 69 C 45 77, 26 77, 25 69 Z" />
      <path d="M 53 57 C 54 53, 76 53, 76 57 L 75 69 C 74 77, 55 77, 54 69 Z" />
      
      <!-- Sunglasses Bridge -->
      <path d="M 46 57 Q 50 54 54 57" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none" />
      
      <!-- Lens Gloss Highlights -->
      <path d="M 28 58 Q 38 56 42 61" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6" />
      <path d="M 57 58 Q 67 56 71 61" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6" />
    </svg>
  `.trim();
}


const PALETTE = [
  'hsl(199, 89%, 60%)', // Sky / Cyan
  'hsl(271, 91%, 65%)', // Purple
  'hsl(330, 81%, 60%)', // Rose / Pink
  'hsl(158, 64%, 52%)', // Emerald / Mint
  'hsl(38, 92%, 50%)',  // Amber / Gold
  'hsl(12, 88%, 59%)',  // Coral / Red
  'hsl(250, 85%, 65%)', // Indigo / Violet
  'hsl(175, 75%, 45%)'  // Teal
];

const AGENT_REGISTRY = [
  {
    id: 'lead-architect',
    name: 'Lead Architect',
    role: 'Multi-Agent Orchestrator & Hexagonal Design',
    category: 'Architecture',
    icon: '🏛️'
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    role: 'Business Discovery & PRD Formulation',
    category: 'Discovery',
    icon: '📋'
  },
  {
    id: 'scrum-master',
    name: 'Scrum Master',
    role: 'Epics, User Stories & Backlog Refinement',
    category: 'Delivery',
    icon: '⏱️'
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    role: 'Clean Architecture Invariants & PR Gates',
    category: 'Quality',
    icon: '🔍'
  },
  {
    id: 'security-engineer',
    name: 'Security Engineer',
    role: 'OWASP Top 10, Zero Trust & Hardening',
    category: 'Quality',
    icon: '🛡️'
  },
  {
    id: 'devops-cloud',
    name: 'DevOps & Cloud',
    role: 'Deterministic CI/CD, Docker & GitOps',
    category: 'Delivery',
    icon: '🚀'
  },
  {
    id: 'ui-ux-pro',
    name: 'UI/UX Pro Max',
    role: 'Design Tokens, A11y & Visual Systems',
    category: 'Frontend',
    icon: '🎨'
  },
  {
    id: 'rpa-windows',
    name: 'Windows RPA',
    role: 'PowerShell Automation & Desktop Tasks',
    category: 'Automation',
    icon: '🤖'
  }
];

/**
 * Returns a unique color for a given agent.
 * @param {string} agentId
 * @returns {string} HSL color string
 */
function getAgentColor(agentId) {
  const index = AGENT_REGISTRY.findIndex(a => a.id === agentId);
  if (index !== -1 && index < PALETTE.length) {
    return PALETTE[index];
  }
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash << 5) - hash + agentId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash * 67) % 360;
  return `hsl(${hue}, 85%, 62%)`;
}

function renderAgentDropdownHtml(activeAgentId = 'lead-architect') {
  const itemsHtml = AGENT_REGISTRY.map(agent => {
    const isSelected = agent.id === activeAgentId;
    const color = getAgentColor(agent.id);

    return `
      <div 
        class="antigravity-agent-item ${isSelected ? 'selected' : ''}" 
        data-agent-id="${agent.id}"
        data-agent-name="${agent.name}"
        data-agent-color="${color}"
        data-agent-icon="${agent.icon}"
        onclick="window.__selectAntigravityAgent('${agent.id}', '${agent.name}', '${color}')"
      >
        <span class="agent-color-dot" style="background: ${color}; box-shadow: 0 0 8px ${color}66;"></span>
        <span class="agent-item-icon">${agent.icon}</span>
        <div class="agent-item-details">
          <div class="agent-item-name-row">
            <span class="agent-item-name">${agent.name}</span>
            <span class="agent-item-category" style="color: ${color};">${agent.category}</span>
          </div>
          <div class="agent-item-role">${agent.role}</div>
        </div>
        <span class="agent-check" style="color: ${color};">${isSelected ? '✓' : ''}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="antigravity-agent-dropdown">
      <div class="agent-dropdown-header">
        <div class="agent-dropdown-title">
          <span>🕶️</span>
          <span>Active Architecture Specialist</span>
        </div>
        <span class="agent-dropdown-count">${AGENT_REGISTRY.length} Available</span>
      </div>
      <div class="agent-list-scroll">
        ${itemsHtml}
      </div>
    </div>
  `.trim();
}











class AgentSelectorMod extends AntigravityMod {
  constructor() {
    super({
      id: 'agent-selector',
      name: 'Agent Role Selector',
      version: '1.0.0',
      slot: 'header-actions',
      priority: 45
    });

    this.cachedCss = ".antigravity-agent-badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  padding: 4px 10px 4px 7px;\n  background: rgba(255, 255, 255, 0.05);\n  border: 1px solid rgba(255, 255, 255, 0.12);\n  border-radius: 9999px;\n  cursor: pointer;\n  user-select: none;\n  font-family: system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;\n  font-size: 11px;\n  line-height: 1;\n  color: #f4f4f5;\n  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);\n  position: relative;\n}\n\n.agent-badge-dot {\n  width: 6px;\n  height: 6px;\n  border-radius: 9999px;\n  flex-shrink: 0;\n  transition: all 0.3s ease;\n}\n\n.agent-color-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 9999px;\n  flex-shrink: 0;\n}\n\n.antigravity-agent-badge:hover {\n  background: rgba(255, 255, 255, 0.1);\n  border-color: rgba(255, 255, 255, 0.25);\n  transform: translateY(-0.5px);\n  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);\n}\n\n.antigravity-agent-badge:active {\n  transform: translateY(0.5px);\n}\n\n.agent-label {\n  font-weight: 500;\n  letter-spacing: -0.01em;\n  color: #e4e4e7;\n  white-space: nowrap;\n}\n\n.agent-caret {\n  font-size: 8px;\n  color: #a1a1aa;\n  margin-left: 1px;\n  transition: transform 0.2s ease;\n}\n\n.antigravity-agent-badge:hover .agent-caret {\n  transform: rotate(180deg);\n}\n\n/* Responsive shrinking for narrow resolutions */\n@media (max-width: 960px) {\n  .agent-label {\n    display: none;\n  }\n  .agent-caret {\n    display: none;\n  }\n  .antigravity-agent-badge {\n    padding: 4px 6px;\n  }\n}\n\n/* Interactive Dropdown Popover */\n.antigravity-agent-dropdown-wrapper {\n  position: absolute;\n  top: calc(100% + 8px);\n  left: 0;\n  z-index: 99999;\n  display: none;\n  animation: agentFadeIn 0.15s ease-out;\n}\n\n.antigravity-agent-badge:hover .antigravity-agent-dropdown-wrapper,\n.antigravity-agent-badge:focus-within .antigravity-agent-dropdown-wrapper,\n.antigravity-agent-dropdown-wrapper:hover {\n  display: block;\n}\n\n.antigravity-agent-dropdown {\n  width: 320px;\n  max-height: 420px;\n  background: #18181b;\n  color: #f4f4f5;\n  border: 1px solid rgba(255, 255, 255, 0.16);\n  border-radius: 12px;\n  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.4);\n  backdrop-filter: blur(20px);\n  -webkit-backdrop-filter: blur(20px);\n  padding: 10px;\n  display: flex;\n  flex-direction: column;\n  pointer-events: auto;\n}\n\n.agent-dropdown-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 6px 8px 10px 8px;\n  border-bottom: 1px solid rgba(255, 255, 255, 0.08);\n  margin-bottom: 6px;\n}\n\n.agent-dropdown-title {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-weight: 600;\n  font-size: 12px;\n  color: #ffffff;\n}\n\n.agent-dropdown-count {\n  font-size: 10px;\n  padding: 2px 6px;\n  border-radius: 9999px;\n  background: rgba(255, 255, 255, 0.08);\n  color: #a1a1aa;\n}\n\n.agent-list-scroll {\n  overflow-y: auto;\n  max-height: 330px;\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  padding-right: 2px;\n}\n\n.agent-list-scroll::-webkit-scrollbar {\n  width: 4px;\n}\n\n.agent-list-scroll::-webkit-scrollbar-thumb {\n  background: rgba(255, 255, 255, 0.15);\n  border-radius: 4px;\n}\n\n.antigravity-agent-item {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 10px;\n  border-radius: 8px;\n  cursor: pointer;\n  transition: all 0.12s ease;\n  border: 1px solid transparent;\n}\n\n.antigravity-agent-item:hover {\n  background: rgba(255, 255, 255, 0.07);\n  border-color: rgba(255, 255, 255, 0.1);\n  transform: translateX(1px);\n}\n\n.antigravity-agent-item.selected {\n  background: rgba(56, 189, 248, 0.12);\n  border-color: rgba(56, 189, 248, 0.3);\n}\n\n.agent-item-icon {\n  font-size: 16px;\n  flex-shrink: 0;\n}\n\n.agent-item-details {\n  flex: 1;\n  min-width: 0;\n}\n\n.agent-item-name-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 2px;\n}\n\n.agent-item-name {\n  font-size: 12px;\n  font-weight: 600;\n  color: #ffffff;\n}\n\n.agent-item-category {\n  font-size: 9.5px;\n  text-transform: uppercase;\n  color: #71717a;\n  letter-spacing: 0.03em;\n}\n\n.agent-item-role {\n  font-size: 10.5px;\n  color: #a1a1aa;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.agent-check {\n  font-size: 12px;\n  font-weight: bold;\n  color: #38bdf8;\n  width: 14px;\n  text-align: right;\n  flex-shrink: 0;\n}\n\n@keyframes agentFadeIn {\n  from {\n    opacity: 0;\n    transform: translateY(-4px) scale(0.98);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0) scale(1);\n  }\n}\n";
  }

  /**
   * Renders the agent badge with the fedora/sunglasses icon and interactive selection dropdown.
   * @param {Object} context
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    const iconSvg = renderAgentIconSvg(16);
    const initialAgentId = 'lead-architect';
    const initialAgentName = 'Lead Architect';
    const initialColor = getAgentColor(initialAgentId);
    const dropdownHtml = renderAgentDropdownHtml(initialAgentId);

    const html = `
      <div 
        id="antigravity-agent-badge" 
        class="antigravity-agent-badge" 
        title="Active Specialist: ${initialAgentName}" 
        style="border-color: ${initialColor}55; box-shadow: 0 0 8px ${initialColor}22;"
        tabindex="0"
      >
        <span 
          id="antigravity-active-agent-dot" 
          class="agent-badge-dot" 
          style="background: ${initialColor}; box-shadow: 0 0 6px ${initialColor};"
        ></span>
        ${iconSvg}
        <span id="antigravity-active-agent-name" class="agent-label">${initialAgentName}</span>
        <span class="agent-caret">▼</span>
        <div class="antigravity-agent-dropdown-wrapper">
          ${dropdownHtml}
        </div>
        <script>
          if (!window.__selectAntigravityAgent) {
            window.__selectAntigravityAgent = function(agentId, agentName, agentColor) {
              const label = document.getElementById('antigravity-active-agent-name');
              const badge = document.getElementById('antigravity-agent-badge');
              const dot = document.getElementById('antigravity-active-agent-dot');

              if (label) label.textContent = agentName;
              if (badge) {
                badge.setAttribute('title', 'Active Specialist: ' + agentName);
                if (agentColor) {
                  badge.style.borderColor = agentColor + '66';
                  badge.style.boxShadow = '0 0 8px ' + agentColor + '33';
                }
              }
              if (dot && agentColor) {
                dot.style.background = agentColor;
                dot.style.boxShadow = '0 0 6px ' + agentColor;
              }

              try {
                localStorage.setItem('__antigravity_selected_agent', JSON.stringify({ 
                  id: agentId, 
                  name: agentName,
                  color: agentColor 
                }));
              } catch (e) {}

              // Update active tick marks and selections in list
              const items = document.querySelectorAll('.antigravity-agent-item');
              items.forEach(el => {
                const isMatch = el.getAttribute('data-agent-id') === agentId;
                el.classList.toggle('selected', isMatch);
                const check = el.querySelector('.agent-check');
                if (check) check.textContent = isMatch ? '✓' : '';
              });
            };

            // Restore saved preference if exists
            try {
              const saved = localStorage.getItem('__antigravity_selected_agent');
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.name) {
                  window.__selectAntigravityAgent(parsed.id, parsed.name, parsed.color);
                }
              }
            } catch (e) {}
          }
        </script>
      </div>
    `.trim();

    return {
      html,
      css: this.cachedCss
    };
  }
}


// ======================= Entrypoint Execution =======================
async function main() {
  try {
    const host = new ModHost();
    host.registerMod(new ContextTachometerMod());
    host.registerMod(new AgentSelectorMod());
    await host.dispatch();
  } catch (err) {
    // Fail silently in background hook context
  }
}

main();
