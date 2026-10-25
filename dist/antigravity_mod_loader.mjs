// Antigravity Mod Framework Runtime Host (Bundle)
import http from 'node:http';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ======================== Core & SDK ========================



/**
 * Discovers and validates the active Chrome DevTools Protocol (CDP) debugging port
 * for Antigravity Electron via active HTTP probing, CLI/environment flags, and log tail fallback.
 */
class CdpPortResolver {
  /**
   * @param {Object} [options]
   * @param {string} [options.logDir] Custom path to Antigravity logs directory.
   * @param {number} [options.defaultPort] Fallback port if auto-discovery fails.
   * @param {number[]} [options.candidatePorts] Candidate ports to probe.
   * @param {number} [options.probeTimeoutMs] Timeout for active HTTP probes in ms.
   * @param {string} [options.host] Host address (default 127.0.0.1).
   */
  constructor(options = {}) {
    this.host = options.host || '127.0.0.1';
    this.logDir = options.logDir || path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity', 'logs');
    this.defaultPort = options.defaultPort ?? 53908;
    this.candidatePorts = options.candidatePorts || [56547, 53908, 9222, 9229, 53909, 53910];
    this.probeTimeoutMs = options.probeTimeoutMs ?? 150;
  }

  /**
   * Actively probes an HTTP port to verify if it is an active CDP endpoint.
   * @param {number} port
   * @param {number} [timeoutMs]
   * @returns {Promise<boolean>}
   */
  async probePort(port, timeoutMs = this.probeTimeoutMs) {
    if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
      return false;
    }

    try {
      const url = `http://${this.host}:${port}/json/version`;
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return false;

      const data = await res.json();
      return typeof data === 'object' && data !== null && typeof data.webSocketDebuggerUrl === 'string';
    } catch {
      return false;
    }
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
   * Synchronously attempts to resolve the port by inspecting the newest log files.
   * Reads only the tail (last 64 KB) of each log to prevent memory bloat on large files.
   * @returns {number|null} Discovered port or null if not found.
   */
  resolvePortFromLogs() {
    try {
      if (!fs.existsSync(this.logDir)) {
        return null;
      }

      const logFiles = fs.readdirSync(this.logDir)
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const fullPath = path.join(this.logDir, f);
          const stat = fs.statSync(fullPath);
          return { name: f, fullPath, time: stat.mtimeMs, size: stat.size };
        })
        .sort((a, b) => b.time - a.time);

      if (!logFiles.length) {
        return null;
      }

      // Check the newest logs (up to 3 most recent)
      for (const file of logFiles.slice(0, 3)) {
        try {
          const maxReadBytes = 64 * 1024; // Read at most 64KB tail
          let content = '';
          if (file.size <= maxReadBytes) {
            content = fs.readFileSync(file.fullPath, 'utf-8');
          } else {
            const buffer = Buffer.alloc(maxReadBytes);
            const fd = fs.openSync(file.fullPath, 'r');
            fs.readSync(fd, buffer, 0, maxReadBytes, file.size - maxReadBytes);
            fs.closeSync(fd);
            content = buffer.toString('utf-8');
          }

          const port = CdpPortResolver.parsePortFromLog(content, null);
          if (port) return port;
        } catch {}
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Resolves the active CDP port using a tiered cascading strategy:
   * 1. CLI parameter (--cdp-port <port>)
   * 2. Environment variable (ANTIGRAVITY_CDP_PORT)
   * 3. Active HTTP probe on defaultPort & candidate ports
   * 4. Passive log tail inspection
   * 5. Fallback to defaultPort
   * @returns {Promise<number>}
   */
  async resolvePort() {
    // 1. Check CLI argument (--cdp-port <port>)
    if (typeof process !== 'undefined' && Array.isArray(process.argv)) {
      const idx = process.argv.indexOf('--cdp-port');
      if (idx !== -1 && process.argv[idx + 1]) {
        const cliPort = Number(process.argv[idx + 1]);
        if (Number.isSafeInteger(cliPort) && cliPort > 0) {
          return cliPort;
        }
      }
    }

    // 2. Check Environment Variable
    if (typeof process !== 'undefined' && process.env?.ANTIGRAVITY_CDP_PORT) {
      const envPort = Number(process.env.ANTIGRAVITY_CDP_PORT);
      if (Number.isSafeInteger(envPort) && envPort > 0) {
        return envPort;
      }
    }

    // 3. Active HTTP probe on default port
    if (await this.probePort(this.defaultPort)) {
      return this.defaultPort;
    }

    // 4. Active HTTP probe across candidate ports
    for (const port of this.candidatePorts) {
      if (port !== this.defaultPort && (await this.probePort(port))) {
        return port;
      }
    }

    // 5. Fallback: Passive log tail inspection
    const logPort = this.resolvePortFromLogs();
    if (logPort) {
      return logPort;
    }

    // 6. Final default fallback
    return this.defaultPort;
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
        returnByValue: true,
        awaitPromise: true
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
 * collision-free injection payloads for registered mods across all active chat panels.
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
      ['menubar-actions', {
        selector: '.shrink-0 > .bg-sidebar',
        strategy: 'append'
      }],
      ['status-bar', {
        selector: 'footer, [data-testid="status-bar"]',
        strategy: 'append'
      }],
      ['floating-dock', {
        selector: 'body',
        strategy: 'append'
      }],
      ['aux-pane-tab', {
        selector: 'button[data-testid="aux-pane-new-tab-button"]',
        strategy: 'before'
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
   * Generates browser-executable JavaScript to mount a mod within a target slot
   * across ALL conversation tabs and split panels matching the selector.
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
        let anchors = Array.from(document.querySelectorAll('${slot.selector}'));
        if (!anchors.length && '${slotId}' === 'aux-pane-tab') {
          const auxBar = document.querySelector('[data-active-tab-id]') ||
                         document.querySelector('.shrink-0.flex.items-center.gap-0\\\\.5.border-b') ||
                         document.querySelector('div[class*="shrink-0"][class*="border-b"]');
          if (auxBar) {
            anchors = [auxBar.querySelector('.overflow-x-auto') || auxBar];
          }
        }

        // Clean up any misplaced legacy slot containers that were injected directly inside non-flex wrappers
        document.querySelectorAll('#${containerId}').forEach(el => {
          if (el.parentElement && !el.parentElement.className.includes('flex')) {
            el.remove();
          }
        });

        // If containers already exist in the DOM, ensure mod nodes are refreshed immediately
        document.querySelectorAll('#${containerId}').forEach(container => {
          let modNode = container.querySelector('#${modWrapperId}');
          if (!modNode) {
            modNode = document.createElement('div');
            modNode.id = '${modWrapperId}';
            modNode.className = '${modWrapperId}';
            modNode.style.display = 'inline-flex';
            modNode.style.alignItems = 'center';
            modNode.style.height = '28px';
            container.appendChild(modNode);
          }
          modNode.setAttribute('data-version', '2');
          if (!modNode.firstElementChild || '${modId}' !== 'agent-selector') {
            modNode.innerHTML = ${JSON.stringify(htmlContent)};
          }
        });

        if (!anchors.length) return;

        for (const anchor of anchors) {
          let parent;
          let targetItem = anchor;

          if ('${slot.strategy}' === 'append' || '${slot.strategy}' === 'prepend') {
            parent = anchor;
          } else {
            parent = anchor.parentElement;
            if (!parent) continue;

            const candidateFlex = anchor.parentElement ? (
              anchor.parentElement.closest('.flex.items-center.gap-1') || 
              anchor.parentElement.closest('.flex.items-center') || 
              anchor.parentElement.closest('.flex')
            ) : null;

            if (candidateFlex && candidateFlex.contains(anchor)) {
              let curr = anchor;
              while (curr.parentElement && curr.parentElement !== candidateFlex) {
                curr = curr.parentElement;
              }
              if (curr.parentElement === candidateFlex) {
                parent = candidateFlex;
                targetItem = curr;
              }
            }
          }

          let container = parent.querySelector('#${containerId}');
          if (!container) {
            container = document.createElement('div');
            container.id = '${containerId}';
            container.className = 'antigravity-slot-container ${containerId}';
            container.style.display = 'inline-flex';
            container.style.alignItems = 'center';
            container.style.gap = '6px';
            container.style.height = '100%';
            container.style.setProperty('app-region', 'no-drag');

            if ('${slot.strategy}' === 'after') {
              if (targetItem.nextSibling) {
                parent.insertBefore(container, targetItem.nextSibling);
              } else {
                parent.appendChild(container);
              }
            } else if ('${slot.strategy}' === 'before') {
              parent.insertBefore(container, targetItem);
            } else if ('${slot.strategy}' === 'prepend') {
              parent.prepend(container);
            } else {
              parent.appendChild(container);
            }
          } else {
            // Ensure slot container remains directly in parent flex row, right after targetItem
            if ('${slot.strategy}' === 'after' && (container.parentElement !== parent || container.previousElementSibling !== targetItem)) {
              if (targetItem.nextSibling) {
                parent.insertBefore(container, targetItem.nextSibling);
              } else {
                parent.appendChild(container);
              }
            } else if (('${slot.strategy}' === 'append' || '${slot.strategy}' === 'prepend') && container.parentElement !== parent) {
              parent.appendChild(container);
            }
          }

          let modNode = container.querySelector('#${modWrapperId}');
          if (!modNode) {
            modNode = document.createElement('div');
            modNode.id = '${modWrapperId}';
            modNode.className = '${modWrapperId}';
            modNode.style.display = 'inline-flex';
            modNode.style.alignItems = 'center';
            modNode.style.height = '28px';
            container.appendChild(modNode);
          }
          modNode.setAttribute('data-version', '2');
          if (!modNode.firstElementChild || '${modId}' !== 'agent-selector') {
            modNode.innerHTML = ${JSON.stringify(htmlContent)};
          }
        }
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

    // Strip comments to ensure clean selector tokenization
    const commentFreeCss = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // Tokenize at-rules (like @keyframes, @media) by tracking balanced braces
    const atRuleBlocks = [];
    let text = commentFreeCss;
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
        .map(sel => {
          if (
            sel.includes('-portal') ||
            sel.includes('antigravity-agent-dropdown') ||
            sel.includes('antigravity-mods-manager-portal') ||
            sel.includes('antigravity-git') ||
            sel.includes('git-') ||
            sel.startsWith('.mod-') ||
            sel.startsWith('.mods-manager-') ||
            sel.startsWith('.agent-') ||
            sel.startsWith('.antigravity-agent-item') ||
            sel.startsWith('body') ||
            sel.startsWith(':root')
          ) {
            return sel;
          }
          return `${cleanScope} ${sel}`;
        })
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
   * Cleans up legacy duplicate elements and auto-mounts across ALL open chat panels.
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

        // 0. Permanently terminate any legacy unmanaged loops
        if (window.__multiContextTrackerLoop) clearInterval(window.__multiContextTrackerLoop);
        if (window.__contextTrackerLoop) clearInterval(window.__contextTrackerLoop);
        if (window.__antigravityGaugeLoop) clearInterval(window.__antigravityGaugeLoop);
        window.__multiContextTrackerLoop = null;
        window.__contextTrackerLoop = null;
        window.__antigravityGaugeLoop = null;

        // 1. Inject or update shared mod stylesheet
        let styleTag = document.getElementById('antigravity-mods-styles');
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'antigravity-mods-styles';
          document.head.appendChild(styleTag);
        }
        styleTag.textContent = ${JSON.stringify(cssBundle)};

        // 2. Global Agent Selector & Tachometer Portal Handlers
        window.__resolveCascadeId = function(badge) {
          const cascadeEl = badge ? badge.closest('[data-cascade-id]') : null;
          const cascadeId = cascadeEl ? cascadeEl.getAttribute('data-cascade-id') : null;
          if (cascadeId) return cascadeId;
          const urlPath = window.location.pathname || '';
          const pathParts = urlPath.split('/c/');
          const urlPathId = (pathParts.length > 1 && pathParts[1]) ? pathParts[1].split('/')[0].split('?')[0] : null;
          if (urlPathId) return urlPathId;
          const searchMatch = (window.location.search || '').match(/[?&](?:focused|conversationId)=([0-9a-fA-F-]+)/);
          return searchMatch ? searchMatch[1] : null;
        };

        window.__classifyPromptMode = function(prompt) {
          if (!prompt || typeof prompt !== 'string') return 'PLAN';
          const text = prompt.trim();
          if (!text) return 'PLAN';
          const planRe = /\\b(diseñ|plan|arquitect|estructur|diagram|rfc|adr|evalu|compar|como\\s+(hacer|estructurar|abordar|organizar)|analiz|estrateg|roadmap|criterio|decision|flujo|explic|por\\s*qu[eé]|evaluaci[oó]n|diagn[oó]stic)/i;
          const buildRe = /\\b(implement|escrib|crea|agreg|corrig|arregl|fix|refactor|test|prueb|npm|git\\s+commit|ejecut|corr|instal|modific|edit|program|actualiz|agrega|elimina|borra)/i;
          const hasPlan = planRe.test(text);
          const hasBuild = buildRe.test(text);
          if (hasBuild && !hasPlan) return 'BUILD';
          if (hasPlan && !hasBuild) return 'PLAN';
          const lower = text.toLowerCase();
          if (/^(cómo|como|por qué|porque|explica|cuál|cual|analiza|revisa)\\b/.test(lower)) return 'PLAN';
          if (/^(haz|crea|agrega|modifica|corrige|ejecuta|implementa)\\b/.test(lower)) return 'BUILD';
          return 'PLAN';
        };

        window.__resolveAgentForCascade = function(cascadeId) {
          const defaultAgent = { id: 'default', name: 'Sin Agente', color: 'hsl(215, 16%, 65%)', filePath: '' };
          try {
            const mapRaw = localStorage.getItem('__antigravity_selected_agents_map');
            const map = mapRaw ? JSON.parse(mapRaw) : {};
            const fallbackRaw = localStorage.getItem('__antigravity_selected_agent');
            const fallbackAgent = fallbackRaw ? JSON.parse(fallbackRaw) : null;
            const serverMap = window.__antigravityActiveAgents || {};

            let resolved = null;
            if (cascadeId && map[cascadeId]) {
              resolved = { ...map[cascadeId] };
              if (
                resolved.id === 'auto' &&
                serverMap[cascadeId] &&
                serverMap[cascadeId].id === 'auto' &&
                serverMap[cascadeId].effectiveMode
              ) {
                resolved.effectiveMode = serverMap[cascadeId].effectiveMode;
              }
            } else if (cascadeId && serverMap[cascadeId]) {
              resolved = { ...serverMap[cascadeId] };
            } else if (fallbackAgent && fallbackAgent.id) {
              resolved = { ...fallbackAgent };
            }
            return resolved || defaultAgent;
          } catch (e) {
            return defaultAgent;
          }
        };

        window.__applyAgentToBadge = function(badge, agent) {
          if (!badge || !agent) return;
          const name = agent.name || 'Sin Agente';
          const color = agent.color || '#94a3b8';
          const label = badge.querySelector('.antigravity-active-agent-name');
          const dot = badge.querySelector('.antigravity-active-agent-dot');

          badge.setAttribute('data-agent-id', agent.id || 'default');

          if (agent.id === 'auto') {
            const effMode = (agent.effectiveMode || 'PLAN').toUpperCase() === 'BUILD' ? 'BUILD' : 'PLAN';
            badge.classList.add('mode-auto');
            badge.classList.toggle('auto-state-build', effMode === 'BUILD');
            badge.classList.toggle('auto-state-plan', effMode !== 'BUILD');
            badge.setAttribute('data-effective-mode', effMode);
            badge.setAttribute('title', 'Modo Automático: Contexto en ' + effMode);
            badge.style.borderColor = '';
            badge.style.boxShadow = '';
            if (label) {
              if (!label.querySelector('.auto-oscillate-track')) {
                label.innerHTML = '<span class="auto-oscillate-track"><span class="auto-oscillate-step plan">Plan</span><span class="auto-oscillate-step build">Build</span></span>';
              }
            }
            if (dot) {
              dot.style.background = '';
              dot.style.boxShadow = '';
            }
          } else {
            badge.classList.remove('mode-auto', 'auto-state-build', 'auto-state-plan');
            badge.removeAttribute('data-effective-mode');
            badge.setAttribute('title', 'Modo Activo: ' + name);
            badge.style.borderColor = color + '66';
            badge.style.boxShadow = '0 0 8px ' + color + '33';
            if (label) label.textContent = name;
            if (dot) {
              dot.style.background = color;
              dot.style.boxShadow = '0 0 6px ' + color;
            }
          }

          const iconWrap = badge.querySelector('.antigravity-active-agent-icon');
          if (iconWrap && agent.id) {
            const portal = document.getElementById('antigravity-agent-dropdown-portal');
            const item = (portal ? portal.querySelector('.antigravity-agent-item[data-agent-id="' + agent.id + '"]') : null) ||
              document.querySelector('.antigravity-agent-item[data-agent-id="' + agent.id + '"]');
            if (item) {
              const svg = item.querySelector('svg');
              if (svg) {
                iconWrap.innerHTML = svg.outerHTML;
                const innerSvg = iconWrap.querySelector('svg');
                if (innerSvg) {
                  innerSvg.setAttribute('width', '14');
                  innerSvg.setAttribute('height', '14');
                }
              }
            }
          }
        };

        window.__toggleAgentDropdown = function(e, badgeEl) {
          if (e) {
            e.stopPropagation();
            e.preventDefault();
          }
          const badge = badgeEl || (e ? e.currentTarget : document.querySelector('.antigravity-agent-badge'));
          if (!badge) return;

          let portal = document.getElementById('antigravity-agent-dropdown-portal');
          if (!portal) {
            portal = document.createElement('div');
            portal.id = 'antigravity-agent-dropdown-portal';
            portal.className = 'antigravity-agent-dropdown-portal';
            document.body.appendChild(portal);
          }

          const template = document.querySelector('.antigravity-agent-dropdown-template');
          if (template) {
            portal.innerHTML = template.innerHTML;
          }

          const cascadeId = window.__resolveCascadeId(badge);

          const isCurrentOpen = portal.classList.contains('open') && portal.__currentBadge === badge;

          // Close other popovers if open
          const tachPortal = document.getElementById('antigravity-tachometer-popover-portal');
          if (tachPortal) {
            tachPortal.classList.remove('open');
            tachPortal.__currentBadge = null;
          }
          document.querySelectorAll('.antigravity-tachometer-badge.open').forEach(b => b.classList.remove('open'));

          const mPortal = document.getElementById('antigravity-mods-manager-portal');
          if (mPortal) {
            mPortal.classList.remove('open');
            mPortal.__currentBtn = null;
          }
          document.querySelectorAll('.antigravity-mods-manager-btn.open').forEach(b => b.classList.remove('open'));

          document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));
          portal.classList.remove('open');
          portal.__currentBadge = null;
          portal.__currentCascadeId = null;

          if (!isCurrentOpen) {
            badge.classList.add('open');
            portal.__currentBadge = badge;
            portal.__currentCascadeId = cascadeId;

            // Determine active agent for THIS chat consistently with badge state
            const resolvedAgent = window.__resolveAgentForCascade(cascadeId);
            const activeId = resolvedAgent.id || 'default';
            const activeName = resolvedAgent.name || 'Sin Agente';

            // Update item highlights inside portal
            portal.querySelectorAll('.antigravity-agent-item').forEach(el => {
              const isMatch = el.getAttribute('data-agent-id') === activeId;
              el.classList.toggle('selected', isMatch);
              const pinBtn = el.querySelector('.agent-pin-btn');
              if (pinBtn) {
                pinBtn.classList.toggle('active', isMatch);
                pinBtn.setAttribute('title', isMatch ? 'Agente activo (Fijado)' : 'Fijar este agente');
                const pinIcon = pinBtn.querySelector('.agent-pin-icon');
                if (pinIcon) {
                  pinIcon.setAttribute('fill', isMatch ? 'currentColor' : 'none');
                }
              }
            });

            const footerText = portal.querySelector('.agent-footer-text');
            if (footerText) {
              footerText.textContent = 'Modo ' + activeName + ' activo en este chat';
            }

            const rect = badge.getBoundingClientRect();
            const portalHeight = 390;
            const portalWidth = 380;

            if (rect.bottom + portalHeight > window.innerHeight && rect.top > portalHeight) {
              portal.style.top = 'auto';
              portal.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
            } else {
              portal.style.bottom = 'auto';
              portal.style.top = (rect.bottom + 8) + 'px';
            }

            const clampedLeft = Math.max(10, Math.min(window.innerWidth - portalWidth - 10, rect.left));
            portal.style.left = clampedLeft + 'px';
            portal.classList.add('open');

            const closeBtn = portal.querySelector('#antigravity-agent-close');
            if (closeBtn) {
              closeBtn.onclick = () => {
                portal.classList.remove('open');
                portal.__currentBadge = null;
                portal.__currentCascadeId = null;
                badge.classList.remove('open');
              };
            }
          }
        };

        window.__selectAntigravityAgent = function(agentId, agentName, agentColor, agentFilePath) {
          const portal = document.getElementById('antigravity-agent-dropdown-portal');
          const currentBadge = (portal && portal.__currentBadge && portal.__currentBadge.isConnected)
            ? portal.__currentBadge
            : document.querySelector('.antigravity-agent-badge');
          const cascadeId = (portal && portal.__currentCascadeId) ||
            window.__resolveCascadeId(currentBadge) ||
            null;

          const isPlanRole = ['auto', 'lead-architect', 'product-manager', 'context-distiller', 'sdd-explore', 'sdd-spec'].includes(agentId);
          const agentData = {
            id: agentId,
            name: agentName,
            color: agentColor,
            filePath: agentFilePath || '',
            effectiveMode: isPlanRole ? 'PLAN' : 'BUILD'
          };

          // Keep in-memory active agents map synchronized immediately
          window.__antigravityActiveAgents = window.__antigravityActiveAgents || {};
          if (cascadeId) {
            window.__antigravityActiveAgents[cascadeId] = agentData;
          }

          // Save scoped per-chat state in localStorage before updating badges
          try {
            const map = JSON.parse(localStorage.getItem('__antigravity_selected_agents_map') || '{}');
            if (cascadeId) {
              map[cascadeId] = agentData;
              localStorage.setItem('__antigravity_selected_agents_map', JSON.stringify(map));
            }
            // Keep legacy single-entry fallback
            localStorage.setItem('__antigravity_selected_agent', JSON.stringify(agentData));
          } catch (e) {}

          // Update live badge(s) in the chat box directly (avoid matching sidebar items)
          let updatedAny = false;
          document.querySelectorAll('.antigravity-agent-badge').forEach(b => {
            const bCascadeId = window.__resolveCascadeId(b);
            if (!cascadeId || !bCascadeId || bCascadeId === cascadeId || b === currentBadge) {
              window.__applyAgentToBadge(b, agentData);
              b.classList.remove('open');
              updatedAny = true;
            }
          });
          if (!updatedAny && currentBadge) {
            window.__applyAgentToBadge(currentBadge, agentData);
            currentBadge.classList.remove('open');
          }

          // Non-blocking sync to local bridge server (active_agents.json)
          try {
            if (cascadeId) {
              fetch('http://127.0.0.1:53912/active-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  cascadeId: cascadeId,
                  agent: agentData
                })
              }).catch(function() {});
            }
          } catch (e) {}

          // Update portal UI state
          if (portal) {
            portal.classList.remove('open');
            portal.__currentBadge = null;
            portal.__currentCascadeId = null;

            const footerText = portal.querySelector('.agent-footer-text');
            if (footerText) {
              footerText.textContent = 'Modo ' + agentName + ' activo en este chat';
            }

            portal.querySelectorAll('.antigravity-agent-item').forEach(el => {
              const isMatch = el.getAttribute('data-agent-id') === agentId;
              el.classList.toggle('selected', isMatch);
              const check = el.querySelector('.agent-check');
              if (check) check.textContent = isMatch ? '✓' : '';
              const pinBtn = el.querySelector('.agent-pin-btn');
              if (pinBtn) {
                pinBtn.classList.toggle('active', isMatch);
                pinBtn.setAttribute('title', isMatch ? 'Agente activo (Fijado)' : 'Fijar este agente');
                const pinIcon = pinBtn.querySelector('.agent-pin-icon');
                if (pinIcon) {
                  pinIcon.setAttribute('fill', isMatch ? 'currentColor' : 'none');
                }
              }
            });
          }
        };

        window.__switchAgentTab = function(tabId) {
          document.querySelectorAll('.agent-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
          });
          document.querySelectorAll('.agent-tab-content').forEach(panel => {
            panel.classList.toggle('active', panel.getAttribute('data-tab-content') === tabId);
          });
        };

        window.__toggleAgentCatalog = function() {
          const drawer = document.getElementById('antigravity-agent-catalog-drawer');
          const btn = document.getElementById('antigravity-agent-catalog-toggle');
          if (!drawer) return;
          const isCollapsed = drawer.classList.contains('collapsed');
          drawer.classList.toggle('collapsed', !isCollapsed);
          if (btn) {
            const textSpan = btn.querySelector('.catalog-toggle-text');
            if (textSpan) {
              textSpan.textContent = isCollapsed ? '▴ Ocultar Especialistas' : '▾ Ver Especialistas (Micro & Nano)';
            }
          }
        };

        window.__renderTachometerPopoverHtml = ${renderPopoverHtml.toString()};
        window.__renderModsManagerPanelHtml = ${renderModsManagerPanelHtml.toString()};

        window.__applyModsVisibility = function() {
          const tachEnabled = localStorage.getItem('__antigravity_mod_enabled_context-tachometer') !== 'false';
          const agentEnabled = localStorage.getItem('__antigravity_mod_enabled_agent-selector') !== 'false';

          document.querySelectorAll('.antigravity-tachometer-badge').forEach(b => {
            b.style.display = tachEnabled ? 'inline-flex' : 'none';
          });
          document.querySelectorAll('.antigravity-agent-badge').forEach(b => {
            b.style.display = agentEnabled ? 'inline-flex' : 'none';
          });
          const gitGraphEnabled = localStorage.getItem('__antigravity_mod_enabled_git-graph') !== 'false';
          document.querySelectorAll('#antigravity-git-tab-trigger, .antigravity-git-tab-trigger').forEach(b => {
            b.style.display = gitGraphEnabled ? 'inline-flex' : 'none';
          });
        };

        window.__toggleModsManagerPanel = function(e, btnEl) {
          if (e) {
            e.stopPropagation();
            e.preventDefault();
          }
          const btn = btnEl || (e ? e.currentTarget : document.querySelector('.antigravity-mods-manager-btn'));
          if (!btn) return;

          // Close other popovers
          const aPortal = document.getElementById('antigravity-agent-dropdown-portal');
          if (aPortal) {
            aPortal.classList.remove('open');
            aPortal.__currentBadge = null;
          }
          document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));

          const tachPortal = document.getElementById('antigravity-tachometer-popover-portal');
          if (tachPortal) {
            tachPortal.classList.remove('open');
            tachPortal.__currentBadge = null;
          }
          document.querySelectorAll('.antigravity-tachometer-badge.open').forEach(b => b.classList.remove('open'));

          let portal = document.getElementById('antigravity-mods-manager-portal');
          if (!portal) {
            portal = document.createElement('div');
            portal.id = 'antigravity-mods-manager-portal';
            portal.className = 'antigravity-mods-manager-portal';
            document.body.appendChild(portal);
          }

          const isCurrentOpen = portal.classList.contains('open') && portal.__currentBtn === btn;

          document.querySelectorAll('.antigravity-mods-manager-btn.open').forEach(b => b.classList.remove('open'));
          portal.classList.remove('open');
          portal.__currentBtn = null;

          if (!isCurrentOpen) {
            btn.classList.add('open');
            portal.__currentBtn = btn;

            if (window.__renderModsManagerPanelHtml) {
              portal.innerHTML = window.__renderModsManagerPanelHtml();
            }

            // Sync switches with current localStorage state
            const tachEnabled = localStorage.getItem('__antigravity_mod_enabled_context-tachometer') !== 'false';
            const agentEnabled = localStorage.getItem('__antigravity_mod_enabled_agent-selector') !== 'false';
            const daemonEnabled = localStorage.getItem('__antigravity_daemon_enabled') !== 'false';

            const tachInput = portal.querySelector('#mod-toggle-context-tachometer');
            if (tachInput) {
              tachInput.checked = tachEnabled;
              tachInput.onchange = (ev) => {
                localStorage.setItem('__antigravity_mod_enabled_context-tachometer', ev.target.checked);
                window.__applyModsVisibility();
              };
            }

            const agentInput = portal.querySelector('#mod-toggle-agent-selector');
            if (agentInput) {
              agentInput.checked = agentEnabled;
              agentInput.onchange = (ev) => {
                localStorage.setItem('__antigravity_mod_enabled_agent-selector', ev.target.checked);
                window.__applyModsVisibility();
              };
            }

            const gitGraphEnabled = localStorage.getItem('__antigravity_mod_enabled_git-graph') !== 'false';
            const gitGraphInput = portal.querySelector('#mod-toggle-git-graph');
            if (gitGraphInput) {
              gitGraphInput.checked = gitGraphEnabled;
              gitGraphInput.onchange = (ev) => {
                localStorage.setItem('__antigravity_mod_enabled_git-graph', ev.target.checked);
                window.__applyModsVisibility();
              };
            }

            const daemonInput = portal.querySelector('#mod-toggle-daemon');
            const daemonPill = portal.querySelector('#daemon-status-pill');
            if (daemonInput) {
              daemonInput.checked = daemonEnabled;
              if (daemonPill) {
                daemonPill.textContent = daemonEnabled ? 'Activo' : 'En Pausa';
                daemonPill.className = 'mod-status-pill ' + (daemonEnabled ? 'active' : 'paused');
              }
              daemonInput.onchange = (ev) => {
                const isChecked = ev.target.checked;
                localStorage.setItem('__antigravity_daemon_enabled', isChecked);
                if (daemonPill) {
                  daemonPill.textContent = isChecked ? 'Activo' : 'En Pausa';
                  daemonPill.className = 'mod-status-pill ' + (isChecked ? 'active' : 'paused');
                }
              };
            }

            const closeBtn = portal.querySelector('#antigravity-mods-manager-close');
            if (closeBtn) {
              closeBtn.onclick = () => {
                portal.classList.remove('open');
                portal.__currentBtn = null;
                btn.classList.remove('open');
              };
            }

            // Position below the button
            const rect = btn.getBoundingClientRect();
            portal.style.top = (rect.bottom + 6) + 'px';
            const portalWidth = 380;
            const clampedLeft = Math.max(10, Math.min(window.innerWidth - portalWidth - 10, rect.left));
            portal.style.left = clampedLeft + 'px';
            portal.classList.add('open');
          }
        };

        window.__toggleGitGraphPanel = function(e, btnEl) {
          if (e) {
            e.stopPropagation();
            e.preventDefault();
          }
          const btn = btnEl || (e ? e.currentTarget : document.querySelector('#antigravity-git-tab-trigger'));
          if (!btn) return;

          const isCurrentActive = btn.classList.contains('active');
          btn.classList.toggle('active', !isCurrentActive);

          const trigger = btn || document.querySelector('#antigravity-git-tab-trigger');
          let auxContainer = trigger ? (trigger.closest('.h-full.w-full.flex.flex-col') || trigger.closest('.flex.flex-col')) : null;
          if (!auxContainer) {
            auxContainer = document.querySelector('[data-testid="aux-pane-new-tab-button"]')?.closest('.flex.flex-col');
          }
          let auxBody = auxContainer ? auxContainer.querySelector('.flex-grow.overflow-hidden') : null;

          let hostEl = document.getElementById('antigravity-git-panel-host');
          if (!hostEl) {
            hostEl = document.createElement('div');
            hostEl.id = 'antigravity-git-panel-host';
            if (auxBody) {
              auxBody.style.position = 'relative';
              auxBody.appendChild(hostEl);
            } else {
              document.body.appendChild(hostEl);
            }
          }

          if (auxBody && hostEl.parentElement !== auxBody) {
            auxBody.style.position = 'relative';
            auxBody.appendChild(hostEl);
          }

          if (hostEl.parentElement === auxBody) {
            hostEl.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; display:' + (isCurrentActive ? 'none' : 'flex') + '; flex-direction:column; overflow:hidden; z-index:50; background:#0f111a;';
          } else {
            hostEl.style.cssText = 'position:fixed; right:0; top:40px; bottom:24px; width:420px; display:' + (isCurrentActive ? 'none' : 'flex') + '; flex-direction:column; overflow:hidden; z-index:99999; background:#0f111a; box-shadow:-12px 0 30px rgba(0,0,0,0.7); border-left:1px solid #1e2438;';
          }

          if (isCurrentActive) {
            // panel closed
          } else {
            const template = document.getElementById('antigravity-git-panel-template');
            if (template) {
              hostEl.innerHTML = template.innerHTML;
            }
            hostEl.style.display = 'flex';

            hostEl.querySelectorAll('.git-commit-row').forEach(row => {
              row.addEventListener('click', () => {
                hostEl.querySelectorAll('.git-commit-row.selected').forEach(r => r.classList.remove('selected'));
                row.classList.add('selected');

                const item = row.closest('.git-commit-item');
                if (item) {
                  const filesContainer = item.querySelector('.git-commit-files-container');
                  if (filesContainer) {
                    const isNowOpen = filesContainer.style.display !== 'none';
                    filesContainer.style.display = isNowOpen ? 'none' : 'block';
                    item.classList.toggle('is-expanded', !isNowOpen);
                  }
                }

                const hash = row.getAttribute('data-hash');
                const inspector = hostEl.querySelector('#antigravity-git-inspector');
                if (inspector && hash) {
                  const authorName = row.getAttribute('data-author') || (row.querySelector('.git-author-name')?.textContent) || 'Unknown';
                  const authorEmail = row.getAttribute('data-email') || '';
                  const avatarUrl = row.getAttribute('data-avatar') || (row.querySelector('.git-author-avatar')?.getAttribute('src')) || '';
                  const commitUrl = row.getAttribute('data-commit-url') || '';
                  const shortHash = row.getAttribute('data-short-hash') || hash.slice(0, 7);
                  const subject = row.getAttribute('data-subject') || (row.querySelector('.git-commit-subject')?.textContent) || '';

                  function esc(str) {
                    return String(str || '')
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');
                  }

                  const safeAuthor = esc(authorName);
                  const safeEmail = authorEmail ? ('&lt;' + esc(authorEmail) + '&gt;') : '';
                  const safeSubject = esc(subject);
                  const safeShortHash = esc(shortHash);
                  const linkHtml = commitUrl
                    ? '<a href="' + esc(commitUrl) + '" target="_blank" rel="noopener" class="git-inspector-gh-link">View Commit ↗</a>'
                    : '';

                  inspector.innerHTML = '<div class="git-inspector-header">' +
                    '<div class="git-inspector-author">' +
                    '<img class="git-inspector-avatar" src="' + avatarUrl + '" alt="' + safeAuthor + '"/>' +
                    '<div class="git-inspector-author-col">' +
                    '<span class="git-inspector-author-name">' + safeAuthor + '</span>' +
                    (safeEmail ? '<span class="git-inspector-author-email">' + safeEmail + '</span>' : '') +
                    '</div></div>' +
                    '<div class="git-inspector-hash-wrap">' +
                    '<span class="git-inspector-hash" title="' + esc(hash) + '">' + safeShortHash + '</span>' +
                    linkHtml +
                    '</div></div>' +
                    '<div class="git-inspector-subject">' + safeSubject + '</div>';
                }
              });
            });

            const refreshBtn = hostEl.querySelector('#antigravity-git-refresh-btn');
            if (refreshBtn) {
              refreshBtn.onclick = () => {
                if (window.__antigravityMountAll) {
                  window.__antigravityMountAll();
                }
              };
            }

            const closeBtn = hostEl.querySelector('#antigravity-git-close-btn');
            if (closeBtn) {
              closeBtn.onclick = (e) => {
                e.stopPropagation();
                window.__toggleGitPanel();
              };
            }
          }
        };

        window.__toggleTachometerPopover = function(e, badgeEl) {
          if (e) {
            e.stopPropagation();
            e.preventDefault();
          }
          const badge = badgeEl || (e ? e.currentTarget : document.querySelector('.antigravity-tachometer-badge'));
          if (!badge) return;

          // Close Agent dropdown if open
          const agentPortal = document.getElementById('antigravity-agent-dropdown-portal');
          if (agentPortal) {
            agentPortal.classList.remove('open');
            agentPortal.__currentBadge = null;
          }
          document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));

          // Close Mods Manager if open
          const mPortal = document.getElementById('antigravity-mods-manager-portal');
          if (mPortal) {
            mPortal.classList.remove('open');
            mPortal.__currentBtn = null;
          }
          document.querySelectorAll('.antigravity-mods-manager-btn.open').forEach(b => b.classList.remove('open'));


          let portal = document.getElementById('antigravity-tachometer-popover-portal');
          if (!portal) {
            portal = document.createElement('div');
            portal.id = 'antigravity-tachometer-popover-portal';
            portal.className = 'antigravity-tachometer-popover-portal';
            document.body.appendChild(portal);
          }

          const isCurrentOpen = portal.classList.contains('open') && portal.__currentBadge === badge;

          document.querySelectorAll('.antigravity-tachometer-badge.open').forEach(b => b.classList.remove('open'));
          portal.classList.remove('open');
          portal.__currentBadge = null;

          if (!isCurrentOpen) {
            badge.classList.add('open');
            portal.__currentBadge = badge;

            // Resolve active conversation metric for this badge
            const cascadeEl = badge.closest('[data-cascade-id]');
            const cascadeId = cascadeEl ? cascadeEl.getAttribute('data-cascade-id') : null;
            const urlPath = window.location.pathname || '';
            const pathParts = urlPath.split('/c/');
            const urlPathId = (pathParts.length > 1 && pathParts[1]) ? pathParts[1].split('/')[0].split('?')[0] : null;
            const searchMatch = (window.location.search || '').match(/[?&](?:focused|conversationId)=([0-9a-fA-F-]+)/);
            const activeId = cascadeId || urlPathId || (searchMatch ? searchMatch[1] : null);

            const all = window.__antigravityAllMetrics || {};
            const m = (activeId && all[activeId]) ? all[activeId] : window.__antigravityLatestMetric;

            if (m && window.__renderTachometerPopoverHtml) {
              portal.innerHTML = window.__renderTachometerPopoverHtml(m);
            }

            const rect = badge.getBoundingClientRect();
            const portalHeight = 295;
            const portalWidth = 310;

            if (rect.bottom + portalHeight > window.innerHeight && rect.top > portalHeight) {
              portal.style.top = 'auto';
              portal.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
            } else {
              portal.style.bottom = 'auto';
              portal.style.top = (rect.bottom + 8) + 'px';
            }

            const clampedLeft = Math.max(10, Math.min(window.innerWidth - portalWidth - 10, rect.left - 20));
            portal.style.left = clampedLeft + 'px';
            portal.classList.add('open');
          }
        };

        window.__showTachometerPopover = function(badge) {
          window.__toggleTachometerPopover(null, badge);
        };

        window.__hideTachometerPopover = function() {
          const portal = document.getElementById('antigravity-tachometer-popover-portal');
          if (portal) {
            portal.classList.remove('open');
            portal.__currentBadge = null;
          }
          document.querySelectorAll('.antigravity-tachometer-badge.open').forEach(b => b.classList.remove('open'));
        };

        // Store all per-conversation metrics, active agents, and current primary snapshot
        window.__antigravityAllMetrics = ${JSON.stringify(context.allMetrics || {})};
        window.__antigravityLatestMetric = ${JSON.stringify(context.telemetry || {})};
        window.__antigravityActiveAgents = Object.assign(
          window.__antigravityActiveAgents || {},
          ${JSON.stringify(context.activeAgents || {})}
        );

        window.__syncAgentBadges = function() {
          document.querySelectorAll('.antigravity-agent-badge').forEach(badge => {
            const cId = window.__resolveCascadeId(badge);
            const agentToApply = window.__resolveAgentForCascade(cId);
            if (agentToApply && agentToApply.name) {
              const currentAgentId = badge.getAttribute('data-agent-id');
              const currentEffMode = badge.getAttribute('data-effective-mode');
              const nextEffMode = agentToApply.id === 'auto'
                ? ((agentToApply.effectiveMode || 'PLAN').toUpperCase() === 'BUILD' ? 'BUILD' : 'PLAN')
                : null;
              if (currentAgentId !== agentToApply.id || currentEffMode !== nextEffMode || badge.__lastCascadeId !== cId) {
                badge.__lastCascadeId = cId;
                window.__applyAgentToBadge(badge, agentToApply);
              }
            }
          });
        };

        window.__updateAntigravityTelemetry = function(fallbackMetric) {
          const all = window.__antigravityAllMetrics || {};
          const latest = fallbackMetric || window.__antigravityLatestMetric;

          document.querySelectorAll('.antigravity-tachometer-badge').forEach(badge => {
            const activeId = window.__resolveCascadeId(badge);

            const m = (activeId && all[activeId]) ? all[activeId] : latest;
            if (!m) return;

            const pctNum = parseFloat(m.pct) || 0;
            let statusColor = '#22c55e';
            if (pctNum >= 85) statusColor = '#ef4444';
            else if (pctNum >= 60) statusColor = '#f97316';
            else if (pctNum >= 25) statusColor = '#eab308';

            badge.setAttribute('title', 'Context: ' + m.displayTokens + ' tokens (' + m.pct + '%)');
            const tokenSpan = badge.querySelector('.tachometer-tokens');
            if (tokenSpan) tokenSpan.textContent = m.displayTokens;
            const pctSpan = badge.querySelector('.tachometer-pct');
            if (pctSpan) pctSpan.textContent = '(' + m.pct + '%)';
            const needle = badge.querySelector('g[filter]');
            if (needle) {
              const angle = -120 + (Math.min(pctNum, 100) / 100) * 240;
              needle.style.transform = 'rotate(' + angle.toFixed(1) + 'deg)';
              const poly = needle.querySelector('polygon');
              if (poly) poly.setAttribute('fill', statusColor);
            }

            // Update live popover content if currently open on screen
            const portal = document.getElementById('antigravity-tachometer-popover-portal');
            if (portal && portal.classList.contains('open') && window.__renderTachometerPopoverHtml) {
              portal.innerHTML = window.__renderTachometerPopoverHtml(m);
            }
          });

          if (typeof window.__syncAgentBadges === 'function') {
            window.__syncAgentBadges();
          }
        };

        window.__handleAutoPromptContextUpdate = function(promptText, sourceEl) {
          if (!promptText || !promptText.trim()) return;
          const badge = (sourceEl && sourceEl.closest('[data-cascade-id]')?.querySelector('.antigravity-agent-badge')) ||
            document.querySelector('.antigravity-agent-badge');
          if (!badge) return;
          const cId = window.__resolveCascadeId(badge);
          const currentAgent = window.__resolveAgentForCascade(cId);
          if (!currentAgent || currentAgent.id !== 'auto') return;

          const nextMode = window.__classifyPromptMode(promptText);
          currentAgent.effectiveMode = nextMode;
          window.__antigravityActiveAgents = window.__antigravityActiveAgents || {};
          if (cId) {
            window.__antigravityActiveAgents[cId] = currentAgent;
          }
          try {
            const map = JSON.parse(localStorage.getItem('__antigravity_selected_agents_map') || '{}');
            if (cId) {
              map[cId] = currentAgent;
              localStorage.setItem('__antigravity_selected_agents_map', JSON.stringify(map));
            }
            localStorage.setItem('__antigravity_selected_agent', JSON.stringify(currentAgent));
          } catch (e) {}
          window.__applyAgentToBadge(badge, currentAgent);
        };

        if (!window.__antigravityGlobalEventsBound) {
          window.__antigravityGlobalEventsBound = true;
          document.addEventListener('click', (e) => {
            const sendBtn = e.target.closest('button[data-testid="send-button"]');
            if (sendBtn) {
              const container = sendBtn.closest('[data-cascade-id]') || document;
              const editor = container.querySelector('[contenteditable="true"], textarea');
              const text = editor ? (editor.value || editor.textContent || '') : '';
              if (text && window.__handleAutoPromptContextUpdate) {
                window.__handleAutoPromptContextUpdate(text, sendBtn);
              }
            }

            const isAgentBadge = e.target.closest('.antigravity-agent-badge');
            const isAgentPortal = e.target.closest('#antigravity-agent-dropdown-portal');
            if (!isAgentBadge && !isAgentPortal) {
              const aPortal = document.getElementById('antigravity-agent-dropdown-portal');
              if (aPortal) aPortal.classList.remove('open');
              document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));
            }

            const isTachBadge = e.target.closest('.antigravity-tachometer-badge');
            const isTachPortal = e.target.closest('#antigravity-tachometer-popover-portal');
            if (!isTachBadge && !isTachPortal) {
              const tachPortal = document.getElementById('antigravity-tachometer-popover-portal');
              if (tachPortal) {
                tachPortal.classList.remove('open');
                tachPortal.__currentBadge = null;
              }
              document.querySelectorAll('.antigravity-tachometer-badge.open').forEach(b => b.classList.remove('open'));
            }

            const isModsBtn = e.target.closest('.antigravity-mods-manager-btn');
            const isModsPortal = e.target.closest('#antigravity-mods-manager-portal');
            if (!isModsBtn && !isModsPortal) {
              const mPortal = document.getElementById('antigravity-mods-manager-portal');
              if (mPortal) {
                mPortal.classList.remove('open');
                mPortal.__currentBtn = null;
              }
              document.querySelectorAll('.antigravity-mods-manager-btn.open').forEach(b => b.classList.remove('open'));
            }
          }, true);

          document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              const editor = e.target.closest('[contenteditable="true"], textarea');
              if (editor) {
                const text = editor.value || editor.textContent || '';
                if (text && window.__handleAutoPromptContextUpdate) {
                  window.__handleAutoPromptContextUpdate(text, editor);
                }
              }
            }
            if (e.key === 'Escape') {
              const aPortal = document.getElementById('antigravity-agent-dropdown-portal');
              if (aPortal) {
                aPortal.classList.remove('open');
                aPortal.__currentBadge = null;
              }
              document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));

              const tachPortal = document.getElementById('antigravity-tachometer-popover-portal');
              if (tachPortal) {
                tachPortal.classList.remove('open');
                tachPortal.__currentBadge = null;
              }
              document.querySelectorAll('.antigravity-tachometer-badge.open').forEach(b => b.classList.remove('open'));

              const mPortal = document.getElementById('antigravity-mods-manager-portal');
              if (mPortal) {
                mPortal.classList.remove('open');
                mPortal.__currentBtn = null;
              }
              document.querySelectorAll('.antigravity-mods-manager-btn.open').forEach(b => b.classList.remove('open'));
            }
          }, true);
        }

        // 3. Mount individual mods into target slots across all conversations
        function mountAllMods() {
          // Permanently remove legacy duplicate unmanaged badges & misplaced slot containers
          document.querySelectorAll('.antigravity-context-badge').forEach(el => el.remove());
          document.querySelectorAll('.min-w-0 > #antigravity-slot-header-actions, .no-focus-agent-input > #antigravity-slot-header-actions').forEach(el => el.remove());

          ${mountSnippets.join('\n')}

          // 3.1 Initialize Floating Portals in document.body
          let agentPortal = document.getElementById('antigravity-agent-dropdown-portal');
          if (!agentPortal) {
            agentPortal = document.createElement('div');
            agentPortal.id = 'antigravity-agent-dropdown-portal';
            agentPortal.className = 'antigravity-agent-dropdown-portal';
            document.body.appendChild(agentPortal);
          }
          const agentTemplate = document.querySelector('.antigravity-agent-dropdown-template');
          if (agentTemplate && !agentPortal.classList.contains('open')) {
            agentPortal.innerHTML = agentTemplate.innerHTML;
            agentPortal.setAttribute('data-v', '2');
          }

          let tachPortal = document.getElementById('antigravity-tachometer-popover-portal');
          if (!tachPortal) {
            tachPortal = document.createElement('div');
            tachPortal.id = 'antigravity-tachometer-popover-portal';
            tachPortal.className = 'antigravity-tachometer-popover-portal';
            document.body.appendChild(tachPortal);
          }
          const tachTemplate = document.querySelector('.antigravity-popover-template');
          if (tachTemplate && (!tachPortal.firstElementChild || tachPortal.getAttribute('data-v') !== '2')) {
            tachPortal.innerHTML = tachTemplate.innerHTML;
            tachPortal.setAttribute('data-v', '2');
          }

          // Bind Agent Selector click handlers
          document.querySelectorAll('.antigravity-agent-badge').forEach(badge => {
            if (badge.__agentClickBound) return;
            badge.__agentClickBound = true;
            badge.addEventListener('click', (e) => {
              window.__toggleAgentDropdown(e, badge);
            });
          });

          // Bind Tachometer click handler (pure click confirmation, zero hover activation)
          document.querySelectorAll('.antigravity-tachometer-badge').forEach(badge => {
            if (badge.__tachClickBound) return;
            badge.__tachClickBound = true;
            badge.addEventListener('click', (e) => {
              window.__toggleTachometerPopover(e, badge);
            });
          });

          // Bind Mods Manager click handler
          // Bind Git Graph Tab trigger
          document.querySelectorAll('#antigravity-git-tab-trigger').forEach(btn => {
            if (btn.__gitClickBound) return;
            btn.__gitClickBound = true;
            btn.addEventListener('click', (e) => {
              window.__toggleGitGraphPanel(e, btn);
            });
          });

          document.querySelectorAll('.antigravity-mods-manager-btn').forEach(btn => {
            if (btn.__modsClickBound) return;
            btn.__modsClickBound = true;
            btn.addEventListener('click', (e) => {
              window.__toggleModsManagerPanel(e, btn);
            });
          });

          // Restore saved mod visibility states
          window.__applyModsVisibility();

          // Restore saved agent selection across mounted badges (scoped per chat)
          document.querySelectorAll('.antigravity-agent-badge').forEach(badge => {
            const cId = window.__resolveCascadeId(badge);
            const agentToApply = window.__resolveAgentForCascade(cId);
            if (agentToApply && agentToApply.name) {
              badge.__lastCascadeId = cId;
              window.__applyAgentToBadge(badge, agentToApply);
            }
          });

          // Apply current telemetry
          window.__updateAntigravityTelemetry(${JSON.stringify(context.telemetry || {})});

          // Observe all slot containers for responsive auto-collapse
          document.querySelectorAll('.antigravity-slot-container').forEach(slot => {
            if (window.__antigravityResizeObserver) {
              window.__antigravityResizeObserver.observe(slot);
              if (slot.parentElement) {
                window.__antigravityResizeObserver.observe(slot.parentElement);
              }
            }
            const footer = slot.closest('[class*="input-footer"]') || slot.closest('.flex.items-center.justify-between') || slot.parentElement || slot;
            const isNarrow = (footer && footer.offsetWidth < 440) || window.innerWidth < 960;
            const tach = slot.querySelector('.antigravity-tachometer-badge');
            if (tach) tach.classList.toggle('compact', isNarrow);
            const agent = slot.querySelector('.antigravity-agent-badge');
            if (agent) agent.classList.toggle('compact', isNarrow);
          });
        }

        // Initialize ResizeObserver for responsive auto-collapse
        if (window.__antigravityResizeObserver) {
          window.__antigravityResizeObserver.disconnect();
          window.__antigravityResizeObserver = null;
        }

        window.__antigravityResizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const container = entry.target;
            const footer = container.closest('[class*="input-footer"]') || container.closest('.flex.items-center.justify-between') || container.parentElement || container;
            const isNarrow = (footer && footer.offsetWidth < 440) || window.innerWidth < 960;

            const tach = container.querySelector('.antigravity-tachometer-badge') || (container.parentElement ? container.parentElement.querySelector('.antigravity-tachometer-badge') : null);
            if (tach) {
              tach.classList.toggle('compact', isNarrow);
            }

            const agent = container.querySelector('.antigravity-agent-badge') || (container.parentElement ? container.parentElement.querySelector('.antigravity-agent-badge') : null);
            if (agent) {
              agent.classList.toggle('compact', isNarrow);
            }
          }
        });

        window.__antigravityMountAll = mountAllMods;
        mountAllMods();

        // 4. Observe DOM mutations with smart slot check to avoid DOM thrashing
        if (window.__antigravityModObserver) {
          window.__antigravityModObserver.disconnect();
          window.__antigravityModObserver = null;
        }

        let mountDebounce = null;
        window.__antigravityModObserver = new MutationObserver(() => {
          const triggers = document.querySelectorAll('button[data-testid="model-selector-trigger"]');
          let missingSlot = false;
          for (const btn of triggers) {
            const parent = btn.parentElement;
            if (!parent) continue;
            const row = parent.closest('.flex.items-center') || parent;
            if (!row.querySelector('#antigravity-slot-header-actions, .antigravity-slot-header-actions')) {
              missingSlot = true;
              break;
            }
          }

          if (missingSlot) {
            if (mountDebounce) clearTimeout(mountDebounce);
            mountDebounce = setTimeout(mountAllMods, 80);
          } else if (typeof window.__syncAgentBadges === 'function') {
            window.__syncAgentBadges();
          }
        });

        window.__antigravityModObserver.observe(document.body, { childList: true, subtree: true });
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

      let totalRawChars = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        raw.steps++;
        totalRawChars += line.length;

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
        const toolCallsLen = obj.tool_calls ? JSON.stringify(obj.tool_calls).length : 0;

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

      // Total characters reflects real serialized message envelope sent to context window
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

      const dirs = fs.readdirSync(this.brainDir)
        .filter(d => /^[0-9a-fA-F-]{36}$/.test(d))
        .map(d => {
          const dirPath = path.join(this.brainDir, d);
          const fullPath = path.join(dirPath, '.system_generated', 'logs', 'transcript_full.jsonl');
          const compactPath = path.join(dirPath, '.system_generated', 'logs', 'transcript.jsonl');
          let mtime = 0;
          let targetPath = '';
          try {
            if (fs.existsSync(fullPath)) {
              mtime = fs.statSync(fullPath).mtimeMs;
              targetPath = fullPath;
            } else if (fs.existsSync(compactPath)) {
              mtime = fs.statSync(compactPath).mtimeMs;
              targetPath = compactPath;
            }
          } catch {}
          return { id: d, mtime, targetPath };
        })
        .filter(item => item.targetPath)
        .sort((a, b) => b.mtime - a.mtime); // Sort newest/active conversations first!

      for (const item of dirs) {
        metrics[item.id] = this.parseTranscriptFile(item.targetPath);
      }
    } catch {
      // Gracefully prevent background hook crashes
    }
    return metrics;
  }
}






/**
 * Lightweight local HTTP bridge server for synchronizing active agent selections
 * from the Electron renderer directly to disk (~/.gemini/config/mods/active_agents.json).
 */
class AgentSyncServer {
  /**
   * @param {Object} [options]
   * @param {number} [options.port] Port to listen on (default 53912)
   * @param {string} [options.host] Host address (default 127.0.0.1)
   * @param {string} [options.configPath] Path to active_agents.json
   */
  constructor(options = {}) {
    this.port = options.port ?? 53912;
    this.host = options.host || '127.0.0.1';
    this.configPath = options.configPath || path.join(os.homedir(), '.gemini', 'config', 'mods', 'active_agents.json');
    this.server = null;
  }

  /**
   * Reads active agents map from disk.
   * @returns {Object}
   */
  readActiveAgents() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {}
    return {};
  }

  /**
   * Saves active agents map to disk atomically.
   * @param {Object} data
   */
  writeActiveAgents(data) {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.configPath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.configPath);
    } catch (err) {
      // Fallback direct write
      try {
        fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
    }
  }

  /**
   * Updates an agent entry for a specific conversation cascadeId.
   * @param {string} cascadeId
   * @param {Object} agent
   */
  updateAgentForCascade(cascadeId, agent) {
    if (!cascadeId) return;
    const current = this.readActiveAgents();
    current[cascadeId] = agent;
    this.writeActiveAgents(current);
  }

  /**
   * Starts the HTTP bridge server if not already running.
   * @returns {Promise<boolean>}
   */
  async start() {
    if (this.server) return true;

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (req.method === 'POST' && req.url === '/active-agent') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body);
              if (payload.cascadeId && payload.agent) {
                this.updateAgentForCascade(payload.cascadeId, payload.agent);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, cascadeId: payload.cascadeId }));
                return;
              }
            } catch {}
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid payload' }));
          });
          return;
        }

        if (req.method === 'GET' && req.url === '/active-agents') {
          const data = this.readActiveAgents();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Port already in use by another instance or daemon, which is fine
          this.server = null;
          resolve(false);
        } else {
          resolve(false);
        }
      });

      this.server.listen(this.port, this.host, () => {
        resolve(true);
      });
    });
  }

  /**
   * Stops the server if running.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }
}





/**
 * Service responsible for discovering and parsing agent markdown files (*.agent.md, agent.md, Agente *.md, SKILL.md)
 * across workspace directories and global Antigravity/Gemini configuration vaults.
 */
class AgentDiscoveryService {
  /**
   * @param {Object} [options]
   * @param {string[]} [options.searchRoots]
   */
  constructor(options = {}) {
    const homedir = os.homedir();
    this.searchRoots = options.searchRoots || [
      process.cwd(),
      path.join(homedir, '.gemini', 'antigravity', 'scratch', 'architecture-vault'),
      path.join(homedir, '.gemini', 'config', 'skills'),
      path.join(homedir, '.gemini', 'antigravity', 'agents')
    ];
  }

  /**
   * Scans configured paths and returns all discovered agents.
   * @returns {Array<Object>} List of structured agent descriptor objects.
   */
  discoverAgents() {
    const discovered = new Map();

    for (const root of this.searchRoots) {
      if (!fs.existsSync(root)) continue;
      this._scanDirectory(root, discovered, 0, 4);
    }

    return Array.from(discovered.values());
  }

  /**
   * Recursively scans a directory for agent markdown files.
   * @private
   */
  _scanDirectory(dir, map, depth, maxDepth) {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and .git
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          this._scanDirectory(fullPath, map, depth + 1, maxDepth);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          if (this._isAgentFile(entry.name, fullPath)) {
            const agent = this.parseAgentFile(fullPath);
            if (agent && agent.id && !map.has(agent.id)) {
              map.set(agent.id, agent);
            }
          }
        }
      }
    } catch {
      // Gracefully continue on permission or filesystem errors
    }
  }

  /**
   * Determines if a markdown file represents an agent definition.
   * @private
   */
  _isAgentFile(filename, fullPath) {
    const lower = filename.toLowerCase();
    if (lower === 'agent.md' || lower.endsWith('.agent.md') || lower.startsWith('agente ') || lower.startsWith('agente_')) {
      return true;
    }
    if (lower === 'skill.md' && fullPath.includes('skills')) {
      return true;
    }
    return false;
  }

  /**
   * Parses frontmatter or markdown content from an agent file.
   * @param {string} filePath
   * @returns {Object|null}
   */
  parseAgentFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const filename = path.basename(filePath, '.md');

      let name = '';
      let role = '';
      let category = 'Specialist';
      let suite = 'Workspace';
      let icon = '🤖';

      // Detect suite by location
      if (filePath.includes('architecture-vault') || filePath.includes('Bóveda') || filename.toLowerCase().startsWith('agente')) {
        suite = 'Bóveda';
        icon = '🏛️';
      } else if (filePath.toLowerCase().includes('sdd') || filename.toLowerCase().includes('sdd')) {
        suite = 'Gentleman SDD';
        icon = '⚡';
      } else if (filePath.includes('skills')) {
        suite = 'Skills';
        icon = '🛠️';
      }

      // 1. Try parsing YAML frontmatter
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        const fmLines = fmMatch[1].split('\n');
        for (const line of fmLines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          let val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

          if (key === 'name') name = val;
          else if (key === 'description' || key === 'role') role = val;
          else if (key === 'category' || key === 'dominio') category = val;
          else if (key === 'icon') icon = val;
        }
      }

      // Clean up common prefix wrappers in names and roles
      if (name) {
        name = name
          .replace(/^(SKILL(\s+AAS)?:\s*|🤖\s*Agente\s*(Especialista)?:\s*|Agente\s*)/i, '')
          .replace(/\s*\([^)]*Flujos[^)]*\)/i, '')
          .trim();
      }
      if (role) {
        role = role.replace(/^(description:\s*|role:\s*)/i, '').replace(/^["']|["']$/g, '').trim();
      }

      // 2. If name not in frontmatter, extract from first heading
      if (!name) {
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match) {
          name = h1Match[1].replace(/^(Agente|Agent|SKILL:)\s*/i, '').trim();
        } else {
          name = filename.replace(/^Agente\s*/i, '').replace(/[-_]/g, ' ');
        }
      }

      // 3. If role not in frontmatter, extract from subtitle or first non-empty paragraph
      if (!role) {
        const lines = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').split('\n');
        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('![')) {
            role = trimmed.slice(0, 80);
            break;
          }
        }
        if (!role) role = `${name} Specialist`;
      }

      // Generate a clean slug id
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || filename.toLowerCase();

      return {
        id,
        name,
        role,
        category,
        suite,
        icon,
        filePath
      };
    } catch {
      return null;
    }
  }
}






/**
 * Service providing high-performance Git operations, DAG topology graph calculation,
 * collaborator avatar resolution, and GitHub metadata for Antigravity UI mods.
 */
class GitService {
  /**
   * Computes Gravatar identicon URL based on author email.
   * @param {string} [email='']
   * @returns {string}
   */
  computeAvatarUrl(email = '') {
    const clean = String(email).trim().toLowerCase();
    const hash = crypto.createHash('md5').update(clean).digest('hex');
    return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=64`;
  }

  /**
   * Parses a Git remote URL to extract GitHub owner and repository metadata.
   * @param {string} remoteUrl
   * @returns {Object}
   */
  parseGitHubRemote(remoteUrl) {
    if (!remoteUrl || typeof remoteUrl !== 'string') {
      return { isGitHub: false };
    }

    const trimmed = remoteUrl.trim();
    // Match HTTPS: https://github.com/:owner/:repo(.git)?
    // Match SSH: git@github.com::owner/:repo(.git)?
    const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);

    const match = httpsMatch || sshMatch;
    if (!match) {
      return { isGitHub: false };
    }

    const owner = match[1];
    const repo = match[2];
    const webUrl = `https://github.com/${owner}/${repo}`;

    return {
      isGitHub: true,
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      webUrl,
      getCommitUrl: (hash) => `${webUrl}/commit/${hash}`,
      getBranchUrl: (branch) => `${webUrl}/tree/${branch}`,
      getPrUrl: (prNumber) => `${webUrl}/pull/${prNumber}`
    };
  }

  /**
   * Reads GitHub metadata from the local repository's `origin` remote.
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @returns {Object}
   */
  getGitHubMetadata(options = {}) {
    const repoPath = options.repoPath || process.cwd();
    try {
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      return this.parseGitHubRemote(remoteUrl);
    } catch {
      return { isGitHub: false };
    }
  }

  /**
   * Computes topological lanes and Bezier branch route connections for commits.
   * Uses an iterative lane allocation algorithm.
   * @param {Array<Object>} commits
   * @returns {Array<Object>}
   */
  computeTopology(commits) {
    if (!Array.isArray(commits) || commits.length === 0) {
      return [];
    }

    /** @type {Array<string | null>} active lanes containing expected commit hashes */
    const activeLanes = [];
    const enriched = [];

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const { hash, parents = [] } = commit;

      // 1. Find or allocate lane for this commit
      let laneIndex = activeLanes.indexOf(hash);
      if (laneIndex === -1) {
        // Allocate in the first empty slot or append
        laneIndex = activeLanes.indexOf(null);
        if (laneIndex === -1) {
          laneIndex = activeLanes.length;
          activeLanes.push(hash);
        } else {
          activeLanes[laneIndex] = hash;
        }
      }

      const routes = [];

      if (parents.length === 0) {
        // Root commit: free up lane
        activeLanes[laneIndex] = null;
      } else {
        // First parent continues on this lane
        const primaryParent = parents[0];
        activeLanes[laneIndex] = primaryParent;
        routes.push({ fromLane: laneIndex, toLane: laneIndex, type: 'straight' });

        // Additional parents (merges)
        for (let p = 1; p < parents.length; p++) {
          const mergeParent = parents[p];
          let parentLane = activeLanes.indexOf(mergeParent);
          if (parentLane === -1) {
            parentLane = activeLanes.indexOf(null);
            if (parentLane === -1) {
              parentLane = activeLanes.length;
              activeLanes.push(mergeParent);
            } else {
              activeLanes[parentLane] = mergeParent;
            }
          }
          routes.push({ fromLane: laneIndex, toLane: parentLane, type: 'merge' });
        }
      }

      // Clean trailing nulls
      while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
        activeLanes.pop();
      }

      enriched.push({
        ...commit,
        lane: laneIndex,
        routes
      });
    }

    return enriched;
  }

  /**
   * Retrieves Git commit history and topological DAG graph.
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @param {number} [options.limit=50]
   * @returns {Array<Object>}
   */
  getGitLog(options = {}) {
    const repoPath = options.repoPath || process.cwd();
    const limit = options.limit ?? 50;

    try {
      const format = 'COMMIT:%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D';
      const rawLog = execSync(`git log --format="${format}" --name-status -n ${limit}`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });

      const rawCommits = [];
      let currentCommit = null;

      const lines = rawLog.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('COMMIT:')) {
          const parts = trimmed.slice(7).split('\0');
          const hash = parts[0] || '';
          const parents = parts[1] ? parts[1].split(' ').filter(Boolean) : [];
          const authorName = parts[2] || 'Unknown';
          const authorEmail = parts[3] || '';
          const timestamp = parseInt(parts[4], 10) || Math.floor(Date.now() / 1000);
          const subject = parts[5] || '';
          const refNamesStr = parts[6] || '';
          const refs = refNamesStr
            ? refNamesStr.split(',').map(r => r.trim()).filter(Boolean)
            : [];

          currentCommit = {
            hash,
            shortHash: hash.slice(0, 7),
            parents,
            author: {
              name: authorName,
              email: authorEmail,
              avatarUrl: this.computeAvatarUrl(authorEmail)
            },
            date: timestamp,
            relativeDate: this._formatRelativeTime(timestamp),
            subject,
            refs,
            files: []
          };
          rawCommits.push(currentCommit);
        } else if (currentCommit) {
          const parts = trimmed.split('\t');
          if (parts.length >= 2) {
            const status = parts[0].trim();
            const filePath = parts[1].trim();
            const fileName = path.basename(filePath);
            const normDir = path.dirname(filePath).replace(/\//g, '\\');
            const ext = path.extname(fileName).replace('.', '').toUpperCase() || 'FILE';
            currentCommit.files.push({
              status,
              path: filePath,
              fileName,
              dir: normDir === '.' ? '' : normDir,
              ext
            });
          }
        }
      }

      return this.computeTopology(rawCommits);
    } catch (err) {
      return [];
    }
  }

  /**
   * Retrieves working tree and branch status.
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @returns {Object}
   */
  getGitStatus(options = {}) {
    const repoPath = options.repoPath || process.cwd();

    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();

      const porcelain = execSync('git status --porcelain', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });

      const changedFiles = porcelain
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const code = line.slice(0, 2).trim();
          const file = line.slice(2).trim();
          return { code, file };
        });

      let ahead = 0;
      let behind = 0;
      try {
        const revCounts = execSync('git rev-list --left-right --count HEAD...@{u}', {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        const parts = revCounts.split(/\s+/);
        if (parts.length >= 2) {
          ahead = parseInt(parts[0], 10) || 0;
          behind = parseInt(parts[1], 10) || 0;
        }
      } catch {
        // No upstream tracked
      }

      return {
        isRepo: true,
        branch,
        isClean: changedFiles.length === 0,
        changedFiles,
        ahead,
        behind
      };
    } catch {
      return {
        isRepo: false,
        branch: '',
        isClean: true,
        changedFiles: [],
        ahead: 0,
        behind: 0
      };
    }
  }

  /**
   * Watches a git repository for head and ref changes and invokes callback.
   * @param {Object} options
   * @param {string} options.repoPath
   * @param {Function} options.onChange
   * @returns {Function} cleanup unsubscribe function
   */
  watchRepository(options = {}) {
    const repoPath = options.repoPath || process.cwd();
    const onChange = options.onChange || (() => {});
    const gitDir = path.join(repoPath, '.git');

    if (!fs.existsSync(gitDir)) {
      return () => {};
    }

    const watchers = [];
    let debounceTimer = null;
    const notify = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChange();
      }, 250);
    };

    try {
      const headPath = path.join(gitDir, 'HEAD');
      if (fs.existsSync(headPath)) {
        watchers.push(fs.watch(headPath, notify));
      }

      const refsDir = path.join(gitDir, 'refs');
      if (fs.existsSync(refsDir)) {
        watchers.push(fs.watch(refsDir, { recursive: true }, notify));
      }
    } catch {
      // Silently ignore watching errors on non-supported environments
    }

    return () => {
      clearTimeout(debounceTimer);
      for (const w of watchers) {
        try {
          w.close();
        } catch {}
      }
    };
  }

  /**
   * Helper formatting relative timestamp.
   * @private
   */
  _formatRelativeTime(unixTimestamp) {
    const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000 - unixTimestamp));
    if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
    const minutes = Math.floor(elapsedSeconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
   * @param {AgentSyncServer} [options.syncServer]
   * @param {GitService} [options.gitService]
   * @param {CdpPortResolver} [options.portResolver]
   */
  constructor(options = {}) {
    this.slotManager = options.slotManager || new SlotManager();
    this.modLoader = options.modLoader || new ModLoader({ slotManager: this.slotManager });
    this.telemetryService = options.telemetryService || new TelemetryService();
    this.syncServer = options.syncServer || new AgentSyncServer();
    this.gitService = options.gitService || new GitService();
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
   * Resolves the active Git repository root directory.
   * Checks CDP renderer tab URLs, transcript metadata, cwd, and known project paths.
   * @param {CdpWebSocketClient} [cdpClient]
   * @param {string} [explicitTranscriptPath]
   * @returns {Promise<string>}
   */
  async resolveRepoPath(cdpClient, explicitTranscriptPath) {
    // 1. Try resolving via live CDP renderer tab query parameter or open file
    if (cdpClient) {
      try {
        const res = await cdpClient.evaluate(`
          (() => {
            const search = window.location.search || '';
            const match = search.match(/tab=file__file%3A%2F%2F%2F([^&]+)/i);
            if (match && match[1]) {
              return decodeURIComponent(match[1]);
            }
            return null;
          })()
        `);
        if (res && res.value) {
          let currentDir = path.dirname(res.value);
          while (currentDir && currentDir !== path.dirname(currentDir)) {
            if (fs.existsSync(path.join(currentDir, '.git'))) {
              return currentDir;
            }
            currentDir = path.dirname(currentDir);
          }
        }
      } catch {}
    }

    // 2. Try resolving via explicit transcript path
    if (explicitTranscriptPath && fs.existsSync(explicitTranscriptPath)) {
      try {
        const sample = fs.readFileSync(explicitTranscriptPath, 'utf-8').slice(0, 10000);
        const match = sample.match(/Command Working Directory:\s*([^\r\n]+)/i) ||
                      sample.match(/Active Workspaces:\s*\n-\s*([^\r\n]+)/i);
        if (match && match[1] && fs.existsSync(match[1].trim())) {
          return match[1].trim();
        }
      } catch {}
    }

    // 3. Check process.cwd() or parent directory with .git
    let cwd = process.cwd();
    while (cwd && cwd !== path.dirname(cwd)) {
      if (fs.existsSync(path.join(cwd, '.git'))) {
        return cwd;
      }
      cwd = path.dirname(cwd);
    }

    // 4. Default project directory
    const defaultWorkspace = path.join(os.homedir(), 'Documents', 'antigravity', 'joyful-chandrasekhar');
    if (fs.existsSync(path.join(defaultWorkspace, '.git'))) {
      return defaultWorkspace;
    }

    return process.cwd();
  }

  /**
   * Executes the full host lifecycle: extracts telemetry, compiles registered
   * mods, resolves CDP port, and dispatches the payload to the Electron renderer.
   * @returns {Promise<any>}
   */
  async dispatch() {
    // Ensure agent sync bridge server is active
    try {
      await this.syncServer.start();
    } catch {}

    const allMetrics = this.telemetryService.getAllMetrics();

    // Check if a specific transcript was passed via CLI argument (--transcript <path>)
    let primaryMetric = null;
    let explicitPath = null;
    const transcriptArgIdx = process.argv.indexOf('--transcript');
    if (transcriptArgIdx !== -1 && process.argv[transcriptArgIdx + 1]) {
      explicitPath = process.argv[transcriptArgIdx + 1];
      primaryMetric = this.telemetryService.parseTranscriptFile(explicitPath);
    }

    if (!primaryMetric) {
      const convIds = Object.keys(allMetrics);
      if (convIds.length > 0) {
        primaryMetric = allMetrics[convIds[0]];
      } else {
        primaryMetric = this.telemetryService.getEmptySnapshot();
      }
    }

    const port = await this.portResolver.resolvePort();
    const cdpClient = new CdpWebSocketClient({ port });

    const repoPath = await this.resolveRepoPath(cdpClient, explicitPath);

    let gitLog = [];
    let gitStatus = { branch: '', isClean: true, ahead: 0, behind: 0 };
    let github = { isGitHub: false };
    try {
      gitLog = this.gitService.getGitLog({ repoPath, limit: 40 });
      gitStatus = this.gitService.getGitStatus({ repoPath });
      github = this.gitService.getGitHubMetadata({ repoPath });
    } catch (err) {}

    const activeAgents = this.syncServer.readActiveAgents();

    const hostContext = {
      telemetry: primaryMetric,
      allMetrics,
      activeAgents,
      gitLog,
      gitStatus,
      github,
      commits: gitLog,
      status: gitStatus,
      activeRepo: github.fullName || path.basename(repoPath),
      timestamp: Date.now()
    };

    const payload = this.compilePayload(hostContext);
    const evalRes = await cdpClient.evaluate(payload);

    // Sync selected agents from renderer localStorage to disk while preserving server effectiveMode
    try {
      const mapRes = await cdpClient.evaluate("localStorage.getItem('__antigravity_selected_agents_map')");
      if (mapRes && mapRes.value) {
        const parsed = JSON.parse(mapRes.value);
        if (parsed && typeof parsed === 'object') {
          const current = this.syncServer.readActiveAgents();
          const merged = { ...current };
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof v === 'object') {
              const existing = current[k] || {};
              merged[k] = {
                ...existing,
                ...v,
                effectiveMode: (existing.id === v.id && existing.effectiveMode)
                  ? existing.effectiveMode
                  : (v.effectiveMode || (v.id === 'auto' ? 'PLAN' : undefined))
              };
            }
          }
          this.syncServer.writeActiveAgents(merged);
        }
      }
    } catch {}

    return evalRes;
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


/**
 * Builds the HTML for the rich context breakdown popover.
 */
function renderPopoverHtml(metric) {
  const FONT_SANS = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

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

    this.cachedCss = ".antigravity-tachometer-badge {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  height: 28px;\r\n  box-sizing: border-box;\r\n  padding: 0 8px 0 6px;\r\n  background: rgba(255, 255, 255, 0.05);\r\n  border: 1px solid rgba(255, 255, 255, 0.12);\r\n  border-radius: 9999px;\r\n  cursor: pointer;\r\n  user-select: none;\r\n  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;\r\n  font-size: 11px;\r\n  line-height: 28px;\r\n  color: #e4e4e7;\r\n  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);\r\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);\r\n  position: relative;\r\n  flex-shrink: 0;\r\n}\r\n\r\n.antigravity-tachometer-badge:hover {\r\n  background: rgba(255, 255, 255, 0.1);\r\n  border-color: rgba(255, 255, 255, 0.25);\r\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);\r\n}\r\n\r\n.antigravity-tachometer-badge:active {\r\n  background: rgba(255, 255, 255, 0.14);\r\n}\r\n\r\n/* Responsive compact mode (Speedometer SVG only, hides labels, exact 28x28 circle) */\r\n.antigravity-tachometer-badge.compact:not(.open):not(.pinned) {\r\n  width: 28px !important;\r\n  height: 28px !important;\r\n  min-width: 28px !important;\r\n  padding: 0 !important;\r\n  gap: 0 !important;\r\n  justify-content: center !important;\r\n  border-radius: 9999px !important;\r\n  box-sizing: border-box !important;\r\n}\r\n\r\n.antigravity-tachometer-badge.compact:not(.open):not(.pinned) .tachometer-tokens,\r\n.antigravity-tachometer-badge.compact:not(.open):not(.pinned) .tachometer-pct {\r\n  display: none !important;\r\n}\r\n\r\n.antigravity-tachometer-badge.open {\r\n  background: rgba(255, 255, 255, 0.12) !important;\r\n  border-color: rgba(255, 255, 255, 0.3) !important;\r\n}\r\n\r\n/* Responsive shrinking for narrow screen resolutions */\r\n@media (max-width: 960px) {\r\n  .antigravity-tachometer-badge:not(.open):not(.pinned) {\r\n    width: 28px !important;\r\n    height: 28px !important;\r\n    min-width: 28px !important;\r\n    padding: 0 !important;\r\n    gap: 0 !important;\r\n    justify-content: center !important;\r\n    border-radius: 9999px !important;\r\n    box-sizing: border-box !important;\r\n  }\r\n  .antigravity-tachometer-badge:not(.open):not(.pinned) .tachometer-tokens,\r\n  .antigravity-tachometer-badge:not(.open):not(.pinned) .tachometer-pct {\r\n    display: none !important;\r\n  }\r\n}\r\n\r\n/* Interactive Tachometer Popover Portal (Fixed to Viewport) */\r\n.antigravity-tachometer-popover-portal {\r\n  position: fixed !important;\r\n  z-index: 999999 !important;\r\n  display: none;\r\n  animation: popoverFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);\r\n  filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.75));\r\n}\r\n\r\n.antigravity-tachometer-popover-portal.open {\r\n  display: block !important;\r\n}\r\n\r\n.antigravity-popover-container {\r\n  display: none !important;\r\n}\r\n\r\n@keyframes popoverFadeIn {\r\n  from {\r\n    opacity: 0;\r\n    transform: translateY(-4px) scale(0.98);\r\n  }\r\n  to {\r\n    opacity: 1;\r\n    transform: translateY(0) scale(1);\r\n  }\r\n}\r\n";
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
      <div id="antigravity-tachometer-badge" class="antigravity-tachometer-badge" title="Context: ${telemetry.displayTokens} tokens (${telemetry.pct}%)" tabindex="0">
        ${gaugeSvg}
        <span class="tachometer-tokens" style="font-weight: 500; letter-spacing: -0.01em; pointer-events: none;">${telemetry.displayTokens}</span>
        <span class="tachometer-pct" style="color: #a1a1aa; font-size: 10px; pointer-events: none;">(${telemetry.pct}%)</span>
        <template class="antigravity-popover-template">
          ${popoverHtml}
        </template>
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
 * Lucide-based pure SVG vectors for Antigravity agents.
 * Strict 24x24 viewBox, stroke-width=2, stroke-linecap=round, stroke-linejoin=round.
 */

const AGENT_SVG_PATHS = {
  // --- Modo Default (Sin Agente) & Cúspide (Orquestadores) ---
  'default': `<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>`,
  'auto': `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m12 8 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>`,
  'lead-architect': `<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>`,
  'sdd-orchestrator': `<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>`,

  // --- Micro-Orquestadores (Dominio) ---
  'product-manager': `<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>`,
  'scrum-master': `<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>`,
  'code-reviewer': `<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>`,
  'security-engineer': `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>`,
  'devops-cloud': `<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>`,
  'ui-ux-pro': `<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>`,
  'rpa-windows': `<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>`,

  // --- Nano-Agentes (Operativos) ---
  'sdd-explore': `<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/>`,
  'sdd-spec': `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>`,
  'sdd-apply': `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
  'sdd-verify': `<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`,
  'gga-review': `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>`,

  // Fallback / Custom markdown agents
  'default-custom': `<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>`
};

/**
 * Renders an inline SVG element for the given agent id.
 * @param {string} agentId
 * @param {number} size - width/height in px
 * @param {number} strokeWidth - stroke width
 * @param {string} extraClass - optional css class
 * @returns {string} SVG markup string
 */
function renderAgentSvg(agentId, size = 16, strokeWidth = 2, extraClass = '') {
  const pathContent = AGENT_SVG_PATHS[agentId] || AGENT_SVG_PATHS['default-custom'];
  const className = `lucide-agent-icon ${extraClass}`.trim();
  return `
    <svg 
      class="${className}" 
      viewBox="0 0 24 24" 
      width="${size}" 
      height="${size}" 
      fill="none" 
      stroke="currentColor" 
      stroke-width="${strokeWidth}" 
      stroke-linecap="round" 
      stroke-linejoin="round"
      style="display: inline-block; vertical-align: middle; flex-shrink: 0;"
    >
      ${pathContent}
    </svg>
  `.trim();
}


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
  'hsl(199, 89%, 60%)', // Sky / Cyan (Lead Architect - Planner)
  'hsl(271, 91%, 65%)', // Purple (Product Manager)
  'hsl(330, 81%, 60%)', // Rose / Pink (Scrum Master)
  'hsl(158, 64%, 52%)', // Emerald / Mint (Code Reviewer)
  'hsl(12, 88%, 59%)',  // Coral / Red (Security Engineer)
  'hsl(38, 92%, 50%)',  // Amber / Gold (DevOps & Cloud)
  'hsl(175, 75%, 45%)', // Teal (UI/UX Pro Max)
  'hsl(250, 85%, 65%)', // Indigo / Violet (Windows RPA)
  'hsl(215, 90%, 60%)', // Electric Blue (SDD Orchestrator - Builder)
  'hsl(45, 93%, 58%)',  // Sun Yellow (SDD Explore)
  'hsl(290, 80%, 65%)', // Orchid (SDD Spec)
  'hsl(24, 95%, 55%)',  // Blaze Orange (SDD Apply TDD)
  'hsl(142, 70%, 45%)', // Bright Green (SDD Verify)
  'hsl(340, 85%, 65%)'  // Crimson (Gentleman Guardian GGA)
];

const DEFAULT_AGENT = {
  id: 'default',
  name: 'Sin Agente (Default)',
  level: 'default',
  levelLabel: 'DEFAULT',
  levelDesc: 'Asistente Antigravity Estándar',
  role: 'Modo general sin rol especializado',
  category: 'Standard',
  suite: 'Standard',
  iconName: 'default'
};

const AUTO_AGENT = {
  id: 'auto',
  name: 'Auto (Plan / Build)',
  level: 'auto',
  levelLabel: 'AUTO',
  levelDesc: 'Clasificador Heurístico según Prompt',
  role: 'Enrutador dinámico entre Plan y Build con reglas de permisos',
  category: 'Smart Router',
  suite: 'Antigravity Core',
  iconName: 'auto'
};

const AGENT_REGISTRY = [
  // =========================================================================
  // 1. CÚSPIDE (GOBERNANZA GLOBAL & DIRECCIÓN DE OBRA)
  // =========================================================================
  {
    id: 'lead-architect',
    name: 'Lead Architect',
    level: 'cuspide',
    levelLabel: 'PLANNER',
    levelDesc: 'Estratega (Plano Maestro)',
    role: 'Multi-Agent Orchestrator & Hexagonal Design',
    category: 'Vault Architecture',
    suite: 'Bóveda',
    iconName: 'layers'
  },
  {
    id: 'sdd-orchestrator',
    name: 'SDD Orchestrator',
    level: 'cuspide',
    levelLabel: 'BUILDER',
    levelDesc: 'Director de Obra (Flujo Táctico)',
    role: 'Spec-Driven Router & Flow Controller',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'compass'
  },

  // =========================================================================
  // 2. MICRO-ORQUESTADORES (LÍDERES DE DOMINIO & COORDINACIÓN)
  // =========================================================================
  {
    id: 'product-manager',
    name: 'Product Manager',
    level: 'micro',
    levelLabel: 'DISCOVERY',
    levelDesc: 'Requerimientos & PRD',
    role: 'Business Discovery & PRD Formulation',
    category: 'Discovery',
    suite: 'Bóveda',
    iconName: 'clipboard-list'
  },
  {
    id: 'scrum-master',
    name: 'Scrum Master',
    level: 'micro',
    levelLabel: 'DELIVERY',
    levelDesc: 'Epics & Backlog Sprints',
    role: 'Epics, User Stories & Backlog Refinement',
    category: 'Delivery',
    suite: 'Bóveda',
    iconName: 'timer'
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    level: 'micro',
    levelLabel: 'QUALITY',
    levelDesc: 'Invariantes & PR Gates',
    role: 'Clean Architecture Invariants & PR Gates',
    category: 'Quality',
    suite: 'Bóveda',
    iconName: 'git-pull-request'
  },
  {
    id: 'security-engineer',
    name: 'Security Engineer',
    level: 'micro',
    levelLabel: 'SECURITY',
    levelDesc: 'OWASP & Hardening Zero Trust',
    role: 'OWASP Top 10, Zero Trust & Hardening',
    category: 'Quality',
    suite: 'Bóveda',
    iconName: 'shield-check'
  },
  {
    id: 'devops-cloud',
    name: 'DevOps & Cloud',
    level: 'micro',
    levelLabel: 'INFRA',
    levelDesc: 'CI/CD, Docker & GitOps',
    role: 'Deterministic CI/CD, Docker & GitOps',
    category: 'Delivery',
    suite: 'Bóveda',
    iconName: 'server'
  },
  {
    id: 'ui-ux-pro',
    name: 'UI/UX Pro Max',
    level: 'micro',
    levelLabel: 'FRONTEND',
    levelDesc: 'Design Tokens & A11y',
    role: 'Design Tokens, A11y & Visual Systems',
    category: 'Frontend',
    suite: 'Bóveda',
    iconName: 'palette'
  },
  {
    id: 'rpa-windows',
    name: 'Windows RPA',
    level: 'micro',
    levelLabel: 'AUTOMATION',
    levelDesc: 'PowerShell & Desktop Tasks',
    role: 'PowerShell Automation & Desktop Tasks',
    category: 'Automation',
    suite: 'Bóveda',
    iconName: 'terminal'
  },

  // =========================================================================
  // 3. NANO-AGENTES (OPERATIVOS & EJECUCIÓN ATÓMICA SDD)
  // =========================================================================
  {
    id: 'sdd-explore',
    name: 'SDD Explore',
    level: 'nano',
    levelLabel: 'EXPLORE',
    levelDesc: 'Investigación de Código',
    role: 'Codebase Investigator & Pattern Discovery',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'search'
  },
  {
    id: 'sdd-spec',
    name: 'SDD Spec',
    level: 'nano',
    levelLabel: 'SPEC',
    levelDesc: 'Escenarios BDD Formales',
    role: 'Formal Specifications & BDD Scenarios',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'file-text'
  },
  {
    id: 'sdd-apply',
    name: 'SDD Apply (TDD)',
    level: 'nano',
    levelLabel: 'APPLY',
    levelDesc: 'Implementador Red-Green-Refactor',
    role: 'Strict Red-Green-Refactor Code Implementer',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'zap'
  },
  {
    id: 'sdd-verify',
    name: 'SDD Verify',
    level: 'nano',
    levelLabel: 'VERIFY',
    levelDesc: 'Gate de Pruebas & Compliance',
    role: 'Scenario Compliance & Test Verification Gate',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'check-circle'
  },
  {
    id: 'gga-review',
    name: 'Guardian Angel (GGA)',
    level: 'nano',
    levelLabel: 'GUARD',
    levelDesc: 'Pre-Commit & Cultura',
    role: 'Git Pre-Commit Standards & Code Culture Guard',
    category: 'Gentleman SDD',
    suite: 'Gentleman',
    iconName: 'shield-alert'
  }
];

/**
 * Returns a unique color for a given agent.
 * @param {string} agentId
 * @returns {string} HSL color string
 */
function getAgentColor(agentId) {
  if (agentId === 'default') {
    return 'hsl(215, 16%, 65%)';
  }
  if (agentId === 'auto') {
    return 'hsl(265, 89%, 66%)';
  }
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

/**
 * Renders an inline pushpin SVG icon.
 * @param {boolean} isActive
 * @param {number} [size=15]
 * @returns {string}
 */
function renderPinSvg(isActive, size = 15) {
  return `
    <svg class="agent-pin-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${isActive ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="17" x2="12" y2="22"></line>
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
    </svg>
  `.trim();
}

/**
 * Renders the hierarchical dropdown card markup using Progressive Disclosure
 * where EVERY text block is enclosed in an explicit card component for clear visual boundaries.
 * 
 * @param {string} activeAgentId
 * @param {Array} dynamicAgents
 * @returns {string} HTML markup
 */
function renderAgentDropdownHtml(activeAgentId = 'default', dynamicAgents = []) {
  const mergedMap = new Map();
  for (const a of AGENT_REGISTRY) {
    let filePath = a.filePath || '';
    if (!filePath && Array.isArray(dynamicAgents)) {
      const match = dynamicAgents.find(d => 
        d.id === a.id || 
        d.id.includes(a.id.replace(/-/g, '_')) ||
        (d.name && d.name.toLowerCase().includes(a.name.toLowerCase())) ||
        (d.filePath && d.filePath.toLowerCase().includes(a.id.replace(/-/g, '_')))
      );
      if (match) filePath = match.filePath;
    }
    mergedMap.set(a.id, { ...a, filePath });
  }
  if (Array.isArray(dynamicAgents)) {
    for (const a of dynamicAgents) {
      if (a && a.id && !mergedMap.has(a.id)) {
        mergedMap.set(a.id, {
          ...a,
          level: 'custom',
          levelLabel: 'CUSTOM',
          levelDesc: 'Especialista Markdown',
          iconName: 'default-custom'
        });
      }
    }
  }

  const allAgents = Array.from(mergedMap.values());
  const cuspideAgents = allAgents.filter(a => a.level === 'cuspide');
  const microAgents = allAgents.filter(a => a.level === 'micro');
  const nanoAgents = allAgents.filter(a => a.level === 'nano');
  const customAgents = allAgents.filter(a => a.level === 'custom');

  // Render Auto (Plan / Build) Smart Router card
  const isAutoSelected = activeAgentId === 'auto';
  const autoColor = getAgentColor('auto');
  const autoCardHtml = `
    <div 
      class="antigravity-agent-item agent-card primary-hero-card auto-mode-card ${isAutoSelected ? 'selected' : ''}" 
      data-agent-id="auto"
      data-agent-name="Auto (Plan/Build)"
      data-agent-color="${autoColor}"
      data-agent-file=""
      style="--agent-theme-color: ${autoColor};"
      onclick="window.__selectAntigravityAgent('auto', 'Auto (Plan/Build)', '${autoColor}', '')"
      title="Enrutador Inteligente: Clasifica entre PLAN y BUILD según tu prompt con guardián de permisos"
    >
      <div class="agent-card-info">
        <div class="agent-icon-box" style="color: ${autoColor}; background: ${autoColor}1a; border-color: ${autoColor}44;">
          ${renderAgentSvg('auto', 16, 2)}
        </div>
        <div class="agent-text-wrap">
          <div class="agent-title-row">
            <span class="agent-title">Auto (Plan / Build)</span>
            <span class="agent-tag" style="background: ${autoColor}26; color: ${autoColor}; border-color: ${autoColor}55;">AUTO</span>
          </div>
          <div class="agent-subtitle">Clasificador heurístico + permisos</div>
        </div>
      </div>
      <button 
        type="button" 
        class="agent-pin-btn ${isAutoSelected ? 'active' : ''}" 
        title="${isAutoSelected ? 'Agente activo (Fijado)' : 'Fijar modo Auto'}"
        aria-label="Fijar modo Auto"
      >
        ${renderPinSvg(isAutoSelected, 15)}
      </button>
    </div>
  `.trim();

  // Render Default (Vanilla) card
  const isDefaultSelected = activeAgentId === 'default';
  const defaultColor = getAgentColor('default');
  const defaultCardHtml = `
    <div 
      class="antigravity-agent-item agent-card primary-hero-card default-mode-card ${isDefaultSelected ? 'selected' : ''}" 
      data-agent-id="default"
      data-agent-name="Sin Agente"
      data-agent-color="${defaultColor}"
      data-agent-file=""
      style="--agent-theme-color: ${defaultColor};"
      onclick="window.__selectAntigravityAgent('default', 'Sin Agente', '${defaultColor}', '')"
      title="Asistente Antigravity Estándar sin rol especializado"
    >
      <div class="agent-card-info">
        <div class="agent-icon-box" style="color: ${defaultColor}; background: ${defaultColor}1a; border-color: ${defaultColor}33;">
          ${renderAgentSvg('default', 16, 2)}
        </div>
        <div class="agent-text-wrap">
          <div class="agent-title-row">
            <span class="agent-title">Sin Agente</span>
            <span class="agent-tag" style="background: ${defaultColor}20; color: ${defaultColor}; border-color: ${defaultColor}44;">DEFAULT</span>
          </div>
          <div class="agent-subtitle">Modo estándar general</div>
        </div>
      </div>
      <button 
        type="button" 
        class="agent-pin-btn ${isDefaultSelected ? 'active' : ''}" 
        title="${isDefaultSelected ? 'Agente activo (Fijado)' : 'Fijar este modo'}"
        aria-label="Fijar modo Sin Agente"
      >
        ${renderPinSvg(isDefaultSelected, 15)}
      </button>
    </div>
  `.trim();

  // Render a Cúspide Hero card (Planner or Builder)
  const renderCuspideCard = (agent) => {
    const isSelected = agent.id === activeAgentId;
    const color = getAgentColor(agent.id);
    const safeName = escapeHtml(agent.name || '');
    const safeRole = escapeHtml(agent.role || '');
    const safeDesc = escapeHtml(agent.levelDesc || '');
    const safeLabel = escapeHtml((agent.levelLabel || '').trim());
    const safeFile = escapeHtml(agent.filePath || '');
    const jsName = (agent.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const svgIcon = renderAgentSvg(agent.id, 16, 2, 'cuspide-svg-icon');

    return `
      <div 
        class="antigravity-agent-item agent-card primary-hero-card cuspide-card ${isSelected ? 'selected' : ''}" 
        data-agent-id="${agent.id}"
        data-agent-name="${safeName}"
        data-agent-color="${color}"
        data-agent-file="${safeFile}"
        style="--agent-theme-color: ${color};"
        onclick="window.__selectAntigravityAgent(this.getAttribute('data-agent-id'), this.getAttribute('data-agent-name'), this.getAttribute('data-agent-color'), this.getAttribute('data-agent-file'))"
        title="${safeName} - ${safeRole}"
      >
        <div class="agent-card-info">
          <div class="agent-icon-box" style="color: ${color}; background: ${color}1a; border-color: ${color}44;">
            ${svgIcon}
          </div>
          <div class="agent-text-wrap">
            <div class="agent-title-row">
              <span class="agent-title">${safeName}</span>
              <span class="agent-tag" style="background: ${color}26; color: ${color}; border-color: ${color}55;">
                ${safeLabel}
              </span>
            </div>
            <div class="agent-subtitle">${safeDesc}</div>
          </div>
        </div>
        <button 
          type="button" 
          class="agent-pin-btn ${isSelected ? 'active' : ''}" 
          title="${isSelected ? 'Agente activo (Fijado)' : 'Fijar este agente'}"
          aria-label="Fijar agente ${safeName}"
        >
          ${renderPinSvg(isSelected, 15)}
        </button>
      </div>
    `.trim();
  };

  // Render compact grid item for Micro or Nano
  const renderCompactItem = (agent) => {
    const isSelected = agent.id === activeAgentId;
    const color = getAgentColor(agent.id);
    const safeName = escapeHtml(agent.name || '');
    const safeRole = escapeHtml(agent.role || '');
    const safeDesc = escapeHtml(agent.levelDesc || agent.role || '');
    const safeFile = escapeHtml(agent.filePath || '');
    const jsName = (agent.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const svgIcon = renderAgentSvg(agent.id, 14, 2, 'compact-svg-icon');

    return `
      <div 
        class="antigravity-agent-item agent-card compact-agent-card ${isSelected ? 'selected' : ''}" 
        data-agent-id="${agent.id}"
        data-agent-name="${safeName}"
        data-agent-color="${color}"
        data-agent-file="${safeFile}"
        style="--agent-theme-color: ${color};"
        onclick="window.__selectAntigravityAgent(this.getAttribute('data-agent-id'), this.getAttribute('data-agent-name'), this.getAttribute('data-agent-color'), this.getAttribute('data-agent-file'))"
        title="${safeName} - ${safeRole}"
      >
        <div class="compact-icon-box" style="color: ${color}; background: ${color}18; border-color: ${color}33;">
          ${svgIcon}
        </div>
        <div class="compact-details">
          <div class="compact-name-row">
            <span class="compact-name">${safeName}</span>
          </div>
          <div class="compact-sub">${safeDesc}</div>
        </div>
        <button 
          type="button" 
          class="agent-pin-btn compact-pin-btn ${isSelected ? 'active' : ''}" 
          title="${isSelected ? 'Agente activo (Fijado)' : 'Fijar este agente'}"
          aria-label="Fijar agente ${safeName}"
        >
          ${renderPinSvg(isSelected, 12)}
        </button>
      </div>
    `.trim();
  };

  return `
    <div class="antigravity-agent-dropdown">
      <!-- 1. HEADER CARD (Harmonized with Mods Manager) -->
      <div class="agent-card agent-header-card">
        <div class="agent-title-wrap">
          <div class="agent-header-icon">
            ${renderAgentSvg('lead-architect', 16, 2)}
          </div>
          <div class="agent-title-col">
            <div class="agent-title-row">
              <h3 class="agent-main-title">Selector de Agentes</h3>
              <span class="agent-header-badge">Control Tower</span>
            </div>
            <div class="agent-subtitle">Especialistas de Architecture Vault y SDD</div>
          </div>
        </div>
        <button class="agent-close-btn" id="antigravity-agent-close" title="Cerrar">✕</button>
      </div>

      <!-- 2. SECCIÓN PRINCIPAL: 3 CARDS DIRECTAS CON PIN -->
      <div class="agent-primary-section agent-cards-list">
        ${defaultCardHtml}
        ${autoCardHtml}
        ${cuspideAgents.map(renderCuspideCard).join('\n')}
      </div>

      <!-- 3. TOGGLE ACORDEÓN CARD BUTTON -->
      <div class="agent-card agent-toggle-card">
        <button 
          type="button" 
          class="agent-catalog-toggle-btn" 
          id="antigravity-agent-catalog-toggle"
          onclick="window.__toggleAgentCatalog()"
        >
          <span class="catalog-toggle-text">▾ Ver Especialistas (Micro & Nano)</span>
          <span class="catalog-toggle-count">${microAgents.length + nanoAgents.length}</span>
        </button>
      </div>

      <!-- 4. DRAWER CONTAINER CARD (COLAPSADO POR DEFECTO) -->
      <div class="agent-catalog-drawer collapsed" id="antigravity-agent-catalog-drawer">
        <div class="agent-card agent-drawer-card">
          <!-- SEGMENTED LEVEL TABS -->
          <div class="agent-level-tabs">
            <button 
              type="button"
              class="agent-tab-btn active" 
              data-tab="micro" 
              onclick="window.__switchAgentTab('micro')"
            >
              <span class="tab-icon">${renderAgentSvg('product-manager', 12, 2)}</span>
              <span>Micro (${microAgents.length})</span>
            </button>
            <button 
              type="button"
              class="agent-tab-btn" 
              data-tab="nano" 
              onclick="window.__switchAgentTab('nano')"
            >
              <span class="tab-icon">${renderAgentSvg('sdd-apply', 12, 2)}</span>
              <span>Nano (${nanoAgents.length})</span>
            </button>
            ${customAgents.length > 0 ? `
              <button 
                type="button"
                class="agent-tab-btn" 
                data-tab="custom" 
                onclick="window.__switchAgentTab('custom')"
              >
                <span class="tab-icon">${renderAgentSvg('default-custom', 12, 2)}</span>
                <span>Custom (${customAgents.length})</span>
              </button>
            ` : ''}
          </div>

          <!-- TAB CONTENT PANELS -->
          <div class="agent-tab-content active" data-tab-content="micro">
            <div class="compact-grid">
              ${microAgents.map(renderCompactItem).join('\n')}
            </div>
          </div>

          <div class="agent-tab-content" data-tab-content="nano">
            <div class="compact-grid">
              ${nanoAgents.map(renderCompactItem).join('\n')}
            </div>
          </div>

          ${customAgents.length > 0 ? `
            <div class="agent-tab-content" data-tab-content="custom">
              <div class="compact-grid">
                ${customAgents.map(renderCompactItem).join('\n')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- 5. FOOTER CARD -->
      <div class="agent-card agent-footer-card">
        <div class="agent-footer-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div class="agent-footer-text">
          Modo seleccionado activo en tiempo real
        </div>
      </div>
    </div>
  `.trim();
}


function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}












class AgentSelectorMod extends AntigravityMod {
  constructor(options = {}) {
    super({
      id: 'agent-selector',
      name: 'Agent Role Selector',
      version: '2.0.0',
      slot: 'header-actions',
      priority: 45
    });

    this.discoveryService = options.discoveryService || new AgentDiscoveryService();
    this.cachedCss = "/* =========================================================================\r\n   ANTIGRAVITY AGENT SELECTOR MOD - STYLES\r\n   Card Architecture: Every text section enclosed in card components\r\n   ========================================================================= */\r\n\r\n.antigravity-agent-badge {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  height: 28px;\r\n  box-sizing: border-box;\r\n  padding: 0 10px 0 7px;\r\n  background: rgba(255, 255, 255, 0.05);\r\n  border: 1px solid rgba(255, 255, 255, 0.12);\r\n  border-radius: 9999px;\r\n  cursor: pointer;\r\n  user-select: none;\r\n  font-family: system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;\r\n  font-size: 11px;\r\n  line-height: 28px;\r\n  color: #f4f4f5;\r\n  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);\r\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);\r\n  position: relative;\r\n  flex-shrink: 0;\r\n}\r\n\r\n.agent-badge-dot {\r\n  width: 6px;\r\n  height: 6px;\r\n  border-radius: 9999px;\r\n  flex-shrink: 0;\r\n  transition: all 0.3s ease;\r\n}\r\n\r\n.antigravity-agent-badge:hover {\r\n  background: rgba(255, 255, 255, 0.1);\r\n  border-color: rgba(255, 255, 255, 0.25);\r\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);\r\n}\r\n\r\n.antigravity-agent-badge:active {\r\n  background: rgba(255, 255, 255, 0.14);\r\n}\r\n\r\n.antigravity-agent-badge.open {\r\n  background: rgba(255, 255, 255, 0.12) !important;\r\n  border-color: rgba(255, 255, 255, 0.3) !important;\r\n}\r\n\r\n.agent-label {\r\n  font-weight: 500;\r\n  letter-spacing: -0.01em;\r\n  color: #e4e4e7;\r\n  white-space: nowrap;\r\n}\r\n\r\n.agent-caret {\r\n  font-size: 8px;\r\n  color: #a1a1aa;\r\n  margin-left: 1px;\r\n  transition: transform 0.2s ease;\r\n}\r\n\r\n.antigravity-agent-badge.open .agent-caret {\r\n  transform: rotate(180deg);\r\n}\r\n\r\n/* Responsive compact mode */\r\n.antigravity-agent-badge.compact {\r\n  height: 28px !important;\r\n  box-sizing: border-box !important;\r\n  padding: 0 7px !important;\r\n  gap: 5px !important;\r\n  border-radius: 9999px !important;\r\n  justify-content: center !important;\r\n}\r\n.antigravity-agent-badge.compact .agent-label,\r\n.antigravity-agent-badge.compact .agent-caret {\r\n  display: none !important;\r\n}\r\n\r\n@media (max-width: 960px) {\r\n  .agent-label,\r\n  .agent-caret {\r\n    display: none !important;\r\n  }\r\n  .antigravity-agent-badge {\r\n    height: 28px !important;\r\n    box-sizing: border-box !important;\r\n    padding: 0 7px !important;\r\n    gap: 5px !important;\r\n    border-radius: 9999px !important;\r\n    justify-content: center !important;\r\n  }\r\n}\r\n\r\n/* =========================================================================\r\n   OSCILLATING AUTO BADGE (CONTEXT-DRIVEN PLAN / BUILD FLIPPER)\r\n   Transitions automatically only when context changes between PLAN and BUILD\r\n   ========================================================================= */\r\n.antigravity-agent-badge.mode-auto {\r\n  border-color: rgba(168, 85, 247, 0.45);\r\n  box-shadow: 0 0 10px rgba(168, 85, 247, 0.25);\r\n  transition: border-color 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.45s cubic-bezier(0.16, 1, 0.3, 1);\r\n}\r\n\r\n.antigravity-agent-badge.mode-auto .agent-badge-dot {\r\n  background: #a855f7 !important;\r\n  box-shadow: 0 0 8px #a855f7 !important;\r\n  transition: background 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.45s cubic-bezier(0.16, 1, 0.3, 1);\r\n}\r\n\r\n.antigravity-agent-badge.mode-auto.auto-state-build {\r\n  border-color: rgba(245, 158, 11, 0.45);\r\n  box-shadow: 0 0 10px rgba(245, 158, 11, 0.25);\r\n}\r\n\r\n.antigravity-agent-badge.mode-auto.auto-state-build .agent-badge-dot {\r\n  background: #f59e0b !important;\r\n  box-shadow: 0 0 8px #f59e0b !important;\r\n}\r\n\r\n.auto-oscillate-track {\r\n  display: inline-flex;\r\n  flex-direction: column;\r\n  height: 28px;\r\n  line-height: 28px;\r\n  overflow: hidden;\r\n  vertical-align: top;\r\n}\r\n\r\n.auto-oscillate-step {\r\n  height: 28px;\r\n  line-height: 28px;\r\n  display: block;\r\n  font-weight: 600;\r\n  letter-spacing: -0.01em;\r\n  white-space: nowrap;\r\n  transform: translateY(0);\r\n  transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);\r\n}\r\n\r\n.antigravity-agent-badge.mode-auto.auto-state-build .auto-oscillate-step {\r\n  transform: translateY(-28px);\r\n}\r\n\r\n.auto-oscillate-step.plan {\r\n  color: #c084fc;\r\n}\r\n\r\n.auto-oscillate-step.build {\r\n  color: #fbbf24;\r\n}\r\n\r\n/* =========================================================================\r\n   DROPDOWN PORTAL (FIXED TO VIEWPORT)\r\n   Card Architecture: Harmonized with Mods Manager design language\r\n   ========================================================================= */\r\n.antigravity-agent-dropdown-portal {\r\n  position: fixed !important;\r\n  z-index: 999999 !important;\r\n  display: none;\r\n  width: 380px !important;\r\n  animation: agentFadeIn 0.16s cubic-bezier(0, 0, 0.2, 1) forwards;\r\n  filter: drop-shadow(0 24px 60px rgba(0, 0, 0, 0.85));\r\n}\r\n\r\n.antigravity-agent-dropdown-portal.open {\r\n  display: block !important;\r\n}\r\n\r\n.antigravity-agent-dropdown-wrapper {\r\n  display: none !important;\r\n}\r\n\r\n.antigravity-agent-dropdown {\r\n  width: 380px !important;\r\n  background: #161822 !important;\r\n  background: linear-gradient(180deg, #1a1d2d 0%, #13141d 100%) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.12) !important;\r\n  border-radius: 14px !important;\r\n  box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.06) !important;\r\n  padding: 14px !important;\r\n  color: #c0caf5 !important;\r\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 8px !important;\r\n  pointer-events: auto !important;\r\n  box-sizing: border-box !important;\r\n}\r\n\r\n/* =========================================================================\r\n   CARD COMPONENT SYSTEM\r\n   ========================================================================= */\r\n.agent-card {\r\n  box-sizing: border-box !important;\r\n  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n}\r\n\r\n/* 1. HEADER CARD */\r\n.agent-header-card {\r\n  background: rgba(255, 255, 255, 0.04) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 10px !important;\r\n  padding: 10px 12px !important;\r\n  margin-bottom: 2px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n}\r\n\r\n.agent-title-wrap {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 10px !important;\r\n}\r\n\r\n.agent-header-icon {\r\n  width: 32px !important;\r\n  height: 32px !important;\r\n  border-radius: 8px !important;\r\n  background: rgba(122, 162, 247, 0.15) !important;\r\n  color: #7aa2f7 !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  border: 1px solid rgba(122, 162, 247, 0.25) !important;\r\n  flex-shrink: 0 !important;\r\n}\r\n\r\n.agent-title-col {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 2px !important;\r\n}\r\n\r\n.agent-title-row {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n}\r\n\r\n.agent-main-title {\r\n  font-size: 13.5px !important;\r\n  font-weight: 700 !important;\r\n  color: #ffffff !important;\r\n  letter-spacing: -0.2px !important;\r\n  margin: 0 !important;\r\n}\r\n\r\n.agent-header-badge {\r\n  font-size: 9.5px !important;\r\n  font-weight: 700 !important;\r\n  text-transform: uppercase !important;\r\n  padding: 1px 6px !important;\r\n  border-radius: 9999px !important;\r\n  background: rgba(122, 162, 247, 0.18) !important;\r\n  color: #7aa2f7 !important;\r\n  border: 1px solid rgba(122, 162, 247, 0.3) !important;\r\n  letter-spacing: 0.3px !important;\r\n}\r\n\r\n.agent-subtitle {\r\n  font-size: 11px !important;\r\n  color: rgba(255, 255, 255, 0.5) !important;\r\n}\r\n\r\n.agent-close-btn {\r\n  background: transparent !important;\r\n  border: 1px solid transparent !important;\r\n  color: rgba(255, 255, 255, 0.5) !important;\r\n  cursor: pointer !important;\r\n  width: 24px !important;\r\n  height: 24px !important;\r\n  border-radius: 6px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  font-size: 12px !important;\r\n  transition: all 0.15s ease !important;\r\n}\r\n\r\n.agent-close-btn:hover {\r\n  color: #ffffff !important;\r\n  background: rgba(255, 255, 255, 0.1) !important;\r\n  border-color: rgba(255, 255, 255, 0.16) !important;\r\n}\r\n\r\n/* 2. PRIMARY SECTION: CARDS DIRECTAS CON PIN */\r\n.agent-primary-section,\r\n.agent-cards-list {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 8px !important;\r\n}\r\n\r\n.agent-card.primary-hero-card {\r\n  background: rgba(255, 255, 255, 0.035) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 10px !important;\r\n  padding: 11px 13px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  gap: 12px !important;\r\n  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  box-sizing: border-box !important;\r\n  cursor: pointer !important;\r\n  user-select: none !important;\r\n}\r\n\r\n.agent-card.primary-hero-card:hover {\r\n  background: rgba(255, 255, 255, 0.065) !important;\r\n  border-color: rgba(122, 162, 247, 0.35) !important;\r\n  transform: translateY(-1px) !important;\r\n  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35) !important;\r\n}\r\n\r\n.agent-card.primary-hero-card.selected {\r\n  background: rgba(255, 255, 255, 0.08) !important;\r\n  border-color: var(--agent-theme-color, #7aa2f7) !important;\r\n  box-shadow: 0 0 16px color-mix(in srgb, var(--agent-theme-color, #7aa2f7) 30%, transparent) !important;\r\n}\r\n\r\n.agent-card-info {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 10px !important;\r\n  flex: 1 !important;\r\n  min-width: 0 !important;\r\n}\r\n\r\n.agent-icon-box {\r\n  width: 32px !important;\r\n  height: 32px !important;\r\n  border-radius: 8px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  flex-shrink: 0 !important;\r\n  border: 1px solid transparent !important;\r\n}\r\n\r\n.agent-text-wrap {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 2px !important;\r\n  min-width: 0 !important;\r\n}\r\n\r\n.agent-title {\r\n  font-size: 13px !important;\r\n  font-weight: 600 !important;\r\n  color: #ffffff !important;\r\n  white-space: nowrap !important;\r\n}\r\n\r\n.agent-tag {\r\n  font-size: 9px !important;\r\n  font-weight: 700 !important;\r\n  letter-spacing: 0.04em !important;\r\n  padding: 1px 6px !important;\r\n  border-radius: 4px !important;\r\n  border: 1px solid transparent !important;\r\n}\r\n\r\n/* =========================================================================\r\n   PIN TOGGLE BUTTON COMPONENT\r\n   ========================================================================= */\r\n.agent-pin-btn {\r\n  width: 32px !important;\r\n  height: 32px !important;\r\n  border-radius: 8px !important;\r\n  background: rgba(255, 255, 255, 0.04) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  color: rgba(255, 255, 255, 0.35) !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  flex-shrink: 0 !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n.agent-pin-btn:hover {\r\n  background: rgba(255, 255, 255, 0.1) !important;\r\n  border-color: rgba(255, 255, 255, 0.2) !important;\r\n  color: #ffffff !important;\r\n  transform: scale(1.06) !important;\r\n}\r\n\r\n.agent-pin-btn.active {\r\n  background: rgba(122, 162, 247, 0.2) !important;\r\n  border-color: rgba(122, 162, 247, 0.6) !important;\r\n  color: #7aa2f7 !important;\r\n  box-shadow: 0 0 12px rgba(122, 162, 247, 0.35) !important;\r\n  transform: scale(1.02) !important;\r\n}\r\n\r\n.agent-pin-btn.active svg {\r\n  fill: currentColor !important;\r\n}\r\n\r\n.antigravity-agent-item.selected .agent-pin-btn.active {\r\n  background: color-mix(in srgb, var(--agent-theme-color, #7aa2f7) 22%, transparent) !important;\r\n  border-color: color-mix(in srgb, var(--agent-theme-color, #7aa2f7) 70%, transparent) !important;\r\n  color: var(--agent-theme-color, #7aa2f7) !important;\r\n  box-shadow: 0 0 14px color-mix(in srgb, var(--agent-theme-color, #7aa2f7) 45%, transparent) !important;\r\n}\r\n\r\n/* 3. TOGGLE ACORDEÓN CARD */\r\n.agent-toggle-card {\r\n  padding: 0 !important;\r\n  background: transparent !important;\r\n  border: none !important;\r\n}\r\n\r\n.agent-catalog-toggle-btn {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  width: 100% !important;\r\n  padding: 9px 12px !important;\r\n  background: rgba(255, 255, 255, 0.035) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 9px !important;\r\n  color: rgba(255, 255, 255, 0.7) !important;\r\n  font-size: 11.5px !important;\r\n  font-weight: 500 !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.15s ease !important;\r\n  user-select: none !important;\r\n  box-sizing: border-box !important;\r\n}\r\n\r\n.agent-catalog-toggle-btn:hover {\r\n  background: rgba(255, 255, 255, 0.07) !important;\r\n  border-color: rgba(122, 162, 247, 0.3) !important;\r\n  color: #ffffff !important;\r\n}\r\n\r\n.catalog-toggle-count {\r\n  font-size: 9.5px !important;\r\n  font-weight: 700 !important;\r\n  padding: 2px 7px !important;\r\n  border-radius: 9999px !important;\r\n  background: rgba(255, 255, 255, 0.08) !important;\r\n  color: #a1a1aa !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n}\r\n\r\n/* 4. DRAWER CONTAINER CARD */\r\n.agent-catalog-drawer {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n}\r\n\r\n.agent-catalog-drawer.collapsed {\r\n  display: none !important;\r\n}\r\n\r\n.agent-drawer-card {\r\n  padding: 10px !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 8px !important;\r\n  background: rgba(0, 0, 0, 0.35) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 10px !important;\r\n}\r\n\r\n/* LEVEL TABS DENTRO DEL DRAWER */\r\n.agent-level-tabs {\r\n  display: flex !important;\r\n  gap: 4px !important;\r\n  padding: 3px !important;\r\n  background: rgba(0, 0, 0, 0.4) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.06) !important;\r\n  border-radius: 7px !important;\r\n}\r\n\r\n.agent-tab-btn {\r\n  flex: 1 !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  gap: 6px !important;\r\n  height: 26px !important;\r\n  border: none !important;\r\n  background: transparent !important;\r\n  color: rgba(255, 255, 255, 0.5) !important;\r\n  font-size: 11px !important;\r\n  font-weight: 500 !important;\r\n  border-radius: 5px !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.15s ease !important;\r\n  user-select: none !important;\r\n}\r\n\r\n.agent-tab-btn:hover {\r\n  color: #e4e4e7 !important;\r\n  background: rgba(255, 255, 255, 0.04) !important;\r\n}\r\n\r\n.agent-tab-btn.active {\r\n  background: rgba(255, 255, 255, 0.1) !important;\r\n  color: #ffffff !important;\r\n  font-weight: 600 !important;\r\n}\r\n\r\n.tab-icon {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n}\r\n\r\n/* TAB PANELS */\r\n.agent-tab-content {\r\n  display: none !important;\r\n  max-height: 220px !important;\r\n  overflow-y: auto !important;\r\n  padding-right: 2px !important;\r\n}\r\n\r\n.agent-tab-content.active {\r\n  display: block !important;\r\n}\r\n\r\n.agent-tab-content::-webkit-scrollbar {\r\n  width: 4px !important;\r\n}\r\n\r\n.agent-tab-content::-webkit-scrollbar-thumb {\r\n  background: rgba(255, 255, 255, 0.15) !important;\r\n  border-radius: 4px !important;\r\n}\r\n\r\n/* COMPACT GRID */\r\n.compact-grid {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 6px !important;\r\n}\r\n\r\n.compact-agent-card {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  gap: 10px !important;\r\n  padding: 8px 10px !important;\r\n  border-radius: 8px !important;\r\n  background: rgba(255, 255, 255, 0.025) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.06) !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.15s ease !important;\r\n  box-sizing: border-box !important;\r\n}\r\n\r\n.compact-agent-card:hover {\r\n  background: rgba(255, 255, 255, 0.06) !important;\r\n  border-color: rgba(122, 162, 247, 0.3) !important;\r\n  transform: translateY(-0.5px) !important;\r\n}\r\n\r\n.compact-agent-card.selected {\r\n  background: rgba(255, 255, 255, 0.08) !important;\r\n  border-color: var(--agent-theme-color, #7aa2f7) !important;\r\n  box-shadow: 0 0 10px color-mix(in srgb, var(--agent-theme-color, #7aa2f7) 25%, transparent) !important;\r\n}\r\n\r\n.compact-icon-box {\r\n  width: 26px !important;\r\n  height: 26px !important;\r\n  border-radius: 6px !important;\r\n  border: 1px solid transparent !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  flex-shrink: 0 !important;\r\n}\r\n\r\n.compact-details {\r\n  flex: 1 !important;\r\n  min-width: 0 !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 1px !important;\r\n}\r\n\r\n.compact-name-row {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n}\r\n\r\n.compact-name {\r\n  font-size: 11.5px !important;\r\n  font-weight: 600 !important;\r\n  color: #f1f5f9 !important;\r\n  white-space: nowrap !important;\r\n  overflow: hidden !important;\r\n  text-overflow: ellipsis !important;\r\n}\r\n\r\n.compact-sub {\r\n  font-size: 10px !important;\r\n  color: rgba(255, 255, 255, 0.45) !important;\r\n  white-space: nowrap !important;\r\n  overflow: hidden !important;\r\n  text-overflow: ellipsis !important;\r\n}\r\n\r\n.compact-pin-btn {\r\n  width: 26px !important;\r\n  height: 26px !important;\r\n  border-radius: 6px !important;\r\n}\r\n\r\n/* 5. FOOTER CARD */\r\n.agent-footer-card {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n  padding: 8px 12px !important;\r\n  background: rgba(255, 255, 255, 0.02) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.06) !important;\r\n  border-radius: 8px !important;\r\n}\r\n\r\n.agent-footer-icon {\r\n  color: #7aa2f7 !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  flex-shrink: 0 !important;\r\n}\r\n\r\n.agent-footer-text {\r\n  font-size: 11px !important;\r\n  color: rgba(255, 255, 255, 0.55) !important;\r\n  white-space: nowrap !important;\r\n}\r\n\r\n@keyframes agentFadeIn {\r\n  from {\r\n    opacity: 0;\r\n    transform: translateY(-6px) scale(0.98);\r\n  }\r\n  to {\r\n    opacity: 1;\r\n    transform: translateY(0) scale(1);\r\n  }\r\n}\r\n";
  }

  /**
   * Renders the agent badge with the dynamic Lucide icon and interactive selection dropdown.
   * @param {Object} context
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    const initialAgentId = 'default';
    const initialAgentName = 'Sin Agente';
    const initialColor = getAgentColor(initialAgentId);
    const iconSvg = `<span id="antigravity-active-agent-icon" class="antigravity-active-agent-icon" style="display: inline-flex; align-items: center; pointer-events: none;">${renderAgentSvg(initialAgentId, 14)}</span>`;
    const discoveredAgents = context.dynamicAgents || this.discoveryService.discoverAgents();
    const dropdownHtml = renderAgentDropdownHtml(initialAgentId, discoveredAgents);

    const html = `
      <div 
        id="antigravity-agent-badge" 
        class="antigravity-agent-badge" 
        title="Modo Activo: ${initialAgentName}" 
        style="border-color: ${initialColor}55; box-shadow: 0 0 8px ${initialColor}22;"
        tabindex="0"
      >
        <span 
          id="antigravity-active-agent-dot" 
          class="agent-badge-dot antigravity-active-agent-dot" 
          style="background: ${initialColor}; box-shadow: 0 0 6px ${initialColor}; pointer-events: none;"
        ></span>
        ${iconSvg}
        <span id="antigravity-active-agent-name" class="agent-label antigravity-active-agent-name" style="pointer-events: none;">${initialAgentName}</span>
        <span class="agent-caret" style="pointer-events: none;">▼</span>
        <template class="antigravity-agent-dropdown-template">
          ${dropdownHtml}
        </template>
      </div>
    `.trim();

    return {
      html,
      css: this.cachedCss
    };
  }
}


// ===================== Mods Manager Mod =====================
/**
 * Generates HTML markup for the top menubar "Mods" button.
 * @returns {string}
 */
function renderModsManagerButton() {
  return `
    <button class="antigravity-mods-manager-btn" id="antigravity-mods-manager-trigger" title="Gestión de Mods y Persistencia">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
      </svg>
      <span>Mods</span>
    </button>
  `.trim();
}

/**
 * Generates HTML markup for the floating Mods Management portal panel.
 * Card Architecture: Every text block enclosed in card components.
 * @returns {string}
 */
function renderModsManagerPanelHtml() {
  return `
    <!-- Header Card -->
    <div class="mods-manager-header mods-manager-header-card">
      <div class="mods-manager-title-wrap">
        <div class="mods-manager-header-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        </div>
        <div class="mods-manager-title-col">
          <div class="mods-manager-title-row">
            <h3 class="mods-manager-title">Antigravity Mods</h3>
            <span class="mods-manager-badge">v2.0</span>
          </div>
          <div class="mods-manager-subtitle">Gestor y Persistencia de Módulos UI</div>
        </div>
      </div>
      <button class="mods-manager-close-btn" id="antigravity-mods-manager-close" title="Cerrar">✕</button>
    </div>

    <!-- Mod Cards List -->
    <div class="mods-manager-cards-list">
      <!-- Mod Card: Context Tachometer -->
      <div class="mod-card">
        <div class="mod-info">
          <div class="mod-icon-box tach-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="mod-text">
            <div class="mod-title">Tacómetro de Contexto</div>
            <div class="mod-desc">Visualizador de tokens, pasos y tamaño de ventana en el chatbox.</div>
          </div>
        </div>
        <label class="mod-switch">
          <input type="checkbox" id="mod-toggle-context-tachometer" data-mod="context-tachometer" checked>
          <span class="mod-slider"></span>
        </label>
      </div>

      <!-- Mod Card: Agent Selector -->
      <div class="mod-card">
        <div class="mod-info">
          <div class="mod-icon-box agent-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="mod-text">
            <div class="mod-title">Selector de Agentes</div>
            <div class="mod-desc">Especialistas de Architecture Vault y SDD Suite en un clic.</div>
          </div>
        </div>
        <label class="mod-switch">
          <input type="checkbox" id="mod-toggle-agent-selector" data-mod="agent-selector" checked>
          <span class="mod-slider"></span>
        </label>
      </div>

      <!-- Mod Card: Git Graph -->
      <div class="mod-card">
        <div class="mod-info">
          <div class="mod-icon-box git-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="18" r="3"></circle>
              <circle cx="6" cy="6" r="3"></circle>
              <path d="M18 15V9a9 9 0 0 0-9-9"></path>
              <path d="M6 9v12"></path>
            </svg>
          </div>
          <div class="mod-text">
            <div class="mod-title">Git Graph Visualizer</div>
            <div class="mod-desc">Visualizador de ramas, commits e historial de git en el panel auxiliar.</div>
          </div>
        </div>
        <label class="mod-switch">
          <input type="checkbox" id="mod-toggle-git-graph" data-mod="git-graph" checked>
          <span class="mod-slider"></span>
        </label>
      </div>

      <!-- Mod Card: Background Persistence (Daemon Kill-Switch) -->
      <div class="mod-card daemon-card">
        <div class="mod-info">
          <div class="mod-icon-box daemon-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div class="mod-text">
            <div class="mod-title">
              <span>Auto-Inyección en Background</span>
              <span class="mod-status-pill active" id="daemon-status-pill">Activo</span>
            </div>
            <div class="mod-desc">Persistencia continua vía CDP. Apágalo para suspender toda inyección.</div>
          </div>
        </div>
        <label class="mod-switch">
          <input type="checkbox" id="mod-toggle-daemon" data-action="toggle-daemon" checked>
          <span class="mod-slider"></span>
        </label>
      </div>
    </div>

    <!-- Footer Status Card -->
    <div class="mods-manager-footer-card">
      <div class="mods-manager-footer-icon">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <div class="mods-manager-footer-text">
        Host CDP Conectado • Sincronización en tiempo real
      </div>
    </div>
  `.trim();
}










/**
 * First-party Mod providing a top menubar control center to enable/disable
 * individual mods and toggle background daemon auto-injection persistence.
 */
class ModsManagerMod extends AntigravityMod {
  constructor() {
    super({
      id: 'mods-manager',
      name: 'Mods Manager & Persistence Control',
      version: '2.0.0',
      slot: 'menubar-actions',
      priority: 100
    });

    this.cachedCss = "/* =========================================================================\r\n   ANTIGRAVITY MODS MANAGER MOD - STYLES\r\n   Card Architecture: Every text section enclosed in card components\r\n   ========================================================================= */\r\n\r\n/* Mods Manager Menu Button in Top Menubar */\r\n.antigravity-mods-manager-btn {\r\n  height: 28px !important;\r\n  padding: 0 10px !important;\r\n  font-size: 13px !important;\r\n  font-weight: 500 !important;\r\n  color: rgba(255, 255, 255, 0.72) !important;\r\n  background: transparent !important;\r\n  border: 1px solid transparent !important;\r\n  border-radius: 6px !important;\r\n  cursor: pointer !important;\r\n  display: inline-flex !important;\r\n  align-items: center !important;\r\n  gap: 6px !important;\r\n  transition: all 0.15s ease !important;\r\n  app-region: no-drag !important;\r\n  user-select: none !important;\r\n}\r\n\r\n.antigravity-mods-manager-btn:hover {\r\n  background: rgba(255, 255, 255, 0.08) !important;\r\n  color: #ffffff !important;\r\n}\r\n\r\n.antigravity-mods-manager-btn.open {\r\n  background: rgba(255, 255, 255, 0.14) !important;\r\n  color: #ffffff !important;\r\n  border-color: rgba(255, 255, 255, 0.2) !important;\r\n}\r\n\r\n.antigravity-mods-manager-btn svg {\r\n  width: 14px;\r\n  height: 14px;\r\n  opacity: 0.85;\r\n}\r\n\r\n/* Floating Portal Panel for Mods Manager */\r\n.antigravity-mods-manager-portal {\r\n  position: fixed !important;\r\n  z-index: 1000000 !important;\r\n  width: 380px !important;\r\n  background: #161822 !important;\r\n  background: linear-gradient(180deg, #1a1d2d 0%, #13141d 100%) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.12) !important;\r\n  border-radius: 14px !important;\r\n  box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.06) !important;\r\n  padding: 14px !important;\r\n  color: #c0caf5 !important;\r\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif !important;\r\n  display: none;\r\n  box-sizing: border-box !important;\r\n  animation: modManagerPopIn 0.16s cubic-bezier(0, 0, 0.2, 1) forwards;\r\n}\r\n\r\n.antigravity-mods-manager-portal.open {\r\n  display: block !important;\r\n}\r\n\r\n@keyframes modManagerPopIn {\r\n  from {\r\n    opacity: 0;\r\n    transform: translateY(-6px) scale(0.98);\r\n  }\r\n  to {\r\n    opacity: 1;\r\n    transform: translateY(0) scale(1);\r\n  }\r\n}\r\n\r\n/* Header Card Component */\r\n.mods-manager-header,\r\n.mods-manager-header-card {\r\n  background: rgba(255, 255, 255, 0.04) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 10px !important;\r\n  padding: 10px 12px !important;\r\n  margin-bottom: 12px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n}\r\n\r\n.mods-manager-title-wrap {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 10px !important;\r\n}\r\n\r\n.mods-manager-header-icon {\r\n  width: 32px !important;\r\n  height: 32px !important;\r\n  border-radius: 8px !important;\r\n  background: rgba(122, 162, 247, 0.15) !important;\r\n  color: #7aa2f7 !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  border: 1px solid rgba(122, 162, 247, 0.25) !important;\r\n  flex-shrink: 0 !important;\r\n}\r\n\r\n.mods-manager-title-col {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 2px !important;\r\n}\r\n\r\n.mods-manager-title-row {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n}\r\n\r\n.mods-manager-title {\r\n  font-size: 13.5px !important;\r\n  font-weight: 700 !important;\r\n  color: #ffffff !important;\r\n  letter-spacing: -0.2px !important;\r\n  margin: 0 !important;\r\n}\r\n\r\n.mods-manager-badge {\r\n  font-size: 9.5px !important;\r\n  font-weight: 700 !important;\r\n  text-transform: uppercase !important;\r\n  padding: 1px 6px !important;\r\n  border-radius: 9999px !important;\r\n  background: rgba(122, 162, 247, 0.18) !important;\r\n  color: #7aa2f7 !important;\r\n  border: 1px solid rgba(122, 162, 247, 0.3) !important;\r\n  letter-spacing: 0.3px !important;\r\n}\r\n\r\n.mods-manager-subtitle {\r\n  font-size: 11px !important;\r\n  color: rgba(255, 255, 255, 0.5) !important;\r\n}\r\n\r\n.mods-manager-close-btn {\r\n  background: transparent !important;\r\n  border: 1px solid transparent !important;\r\n  color: rgba(255, 255, 255, 0.5) !important;\r\n  cursor: pointer !important;\r\n  width: 24px !important;\r\n  height: 24px !important;\r\n  border-radius: 6px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  font-size: 12px !important;\r\n  transition: all 0.15s ease !important;\r\n}\r\n\r\n.mods-manager-close-btn:hover {\r\n  color: #ffffff !important;\r\n  background: rgba(255, 255, 255, 0.1) !important;\r\n  border-color: rgba(255, 255, 255, 0.16) !important;\r\n}\r\n\r\n/* Mod Cards List */\r\n.mods-manager-cards-list {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 8px !important;\r\n}\r\n\r\n/* Mod Card Item */\r\n.mod-card {\r\n  background: rgba(255, 255, 255, 0.035) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 10px !important;\r\n  padding: 11px 13px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  gap: 12px !important;\r\n  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  box-sizing: border-box !important;\r\n}\r\n\r\n.mod-card:hover {\r\n  background: rgba(255, 255, 255, 0.065) !important;\r\n  border-color: rgba(122, 162, 247, 0.35) !important;\r\n  transform: translateY(-1px) !important;\r\n  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35) !important;\r\n}\r\n\r\n.mod-card.daemon-card {\r\n  background: rgba(122, 162, 247, 0.05) !important;\r\n  border-color: rgba(122, 162, 247, 0.22) !important;\r\n}\r\n\r\n.mod-card.daemon-card:hover {\r\n  background: rgba(122, 162, 247, 0.09) !important;\r\n  border-color: rgba(122, 162, 247, 0.45) !important;\r\n  box-shadow: 0 4px 18px rgba(122, 162, 247, 0.15) !important;\r\n}\r\n\r\n.mod-info {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 10px !important;\r\n  flex: 1 !important;\r\n  min-width: 0 !important;\r\n}\r\n\r\n.mod-icon-box {\r\n  width: 34px !important;\r\n  height: 34px !important;\r\n  border-radius: 8px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  flex-shrink: 0 !important;\r\n  background: rgba(255, 255, 255, 0.06) !important;\r\n  color: #7aa2f7 !important;\r\n}\r\n\r\n.mod-icon-box.tach-icon {\r\n  background: rgba(56, 189, 248, 0.12) !important;\r\n  color: #38bdf8 !important;\r\n  border: 1px solid rgba(56, 189, 248, 0.25) !important;\r\n}\r\n\r\n.mod-icon-box.agent-icon {\r\n  background: rgba(168, 85, 247, 0.12) !important;\r\n  color: #c084fc !important;\r\n  border: 1px solid rgba(168, 85, 247, 0.25) !important;\r\n}\r\n\r\n.mod-icon-box.daemon-icon {\r\n  background: rgba(74, 222, 128, 0.12) !important;\r\n  color: #4ade80 !important;\r\n  border: 1px solid rgba(74, 222, 128, 0.25) !important;\r\n}\r\n\r\n.mod-text {\r\n  flex: 1 !important;\r\n  min-width: 0 !important;\r\n}\r\n\r\n.mod-title {\r\n  font-size: 13px !important;\r\n  font-weight: 600 !important;\r\n  color: #ffffff !important;\r\n  margin-bottom: 2px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 6px !important;\r\n}\r\n\r\n.mod-desc {\r\n  font-size: 11px !important;\r\n  color: rgba(255, 255, 255, 0.6) !important;\r\n  line-height: 1.35 !important;\r\n}\r\n\r\n/* Status Pill */\r\n.mod-status-pill {\r\n  font-size: 9.5px !important;\r\n  font-weight: 700 !important;\r\n  padding: 1px 6px !important;\r\n  border-radius: 9999px !important;\r\n  display: inline-flex !important;\r\n  align-items: center !important;\r\n  gap: 3px !important;\r\n  line-height: 14px !important;\r\n  letter-spacing: 0.2px !important;\r\n}\r\n\r\n.mod-status-pill.active {\r\n  background: rgba(74, 222, 128, 0.15) !important;\r\n  color: #4ade80 !important;\r\n  border: 1px solid rgba(74, 222, 128, 0.3) !important;\r\n}\r\n\r\n.mod-status-pill.paused {\r\n  background: rgba(248, 113, 113, 0.15) !important;\r\n  color: #f87171 !important;\r\n  border: 1px solid rgba(248, 113, 113, 0.3) !important;\r\n}\r\n\r\n/* Modern Toggle Switch */\r\n.mod-switch {\r\n  position: relative !important;\r\n  display: inline-block !important;\r\n  width: 38px !important;\r\n  height: 20px !important;\r\n  flex-shrink: 0 !important;\r\n  cursor: pointer !important;\r\n}\r\n\r\n.mod-switch input {\r\n  opacity: 0 !important;\r\n  width: 0 !important;\r\n  height: 0 !important;\r\n  position: absolute !important;\r\n  margin: 0 !important;\r\n  pointer-events: none !important;\r\n  display: none !important;\r\n}\r\n\r\n.mod-slider {\r\n  position: absolute !important;\r\n  top: 0 !important;\r\n  left: 0 !important;\r\n  right: 0 !important;\r\n  bottom: 0 !important;\r\n  background-color: rgba(255, 255, 255, 0.16) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.2) !important;\r\n  border-radius: 9999px !important;\r\n  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n}\r\n\r\n.mod-slider:before {\r\n  position: absolute !important;\r\n  content: \"\" !important;\r\n  height: 14px !important;\r\n  width: 14px !important;\r\n  left: 2px !important;\r\n  bottom: 2px !important;\r\n  background-color: #ffffff !important;\r\n  border-radius: 50% !important;\r\n  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4) !important;\r\n}\r\n\r\n.mod-switch input:checked + .mod-slider {\r\n  background-color: #7aa2f7 !important;\r\n  border-color: #7aa2f7 !important;\r\n}\r\n\r\n.mod-switch input:checked + .mod-slider:before {\r\n  transform: translateX(18px) !important;\r\n}\r\n\r\n/* Footer Status Card */\r\n.mods-manager-footer-card {\r\n  background: rgba(0, 0, 0, 0.25) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.06) !important;\r\n  border-radius: 8px !important;\r\n  padding: 8px 10px !important;\r\n  margin-top: 10px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n  box-sizing: border-box !important;\r\n}\r\n\r\n.mods-manager-footer-icon {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  color: #4ade80 !important;\r\n  flex-shrink: 0 !important;\r\n}\r\n\r\n.mods-manager-footer-text {\r\n  font-size: 11px !important;\r\n  color: rgba(255, 255, 255, 0.5) !important;\r\n  font-weight: 500 !important;\r\n  letter-spacing: -0.1px !important;\r\n}\r\n";
  }

  /**
   * Renders the top menubar button and styles for the Mods Manager.
   * @param {Object} [context]
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    return {
      html: renderModsManagerButton(),
      css: this.cachedCss
    };
  }
}


// ===================== Git Graph Mod =====================
/**
 * Generates dynamic SVG topology graph paths and nodes for Git branches and commits
 * matching the compact VS Code Git Graph aesthetic.
 */

const LANE_COLORS = [
  '#38bdf8', // Sky Blue (Feature / Current branch)
  '#f97316', // Orange (main / remote)
  '#a855f7', // Purple
  '#22c55e', // Emerald
  '#ec4899', // Pink
  '#06b6d4'  // Cyan
];

/**
 * Returns color associated with a lane index.
 * @param {number} lane
 * @returns {string}
 */
function getLaneColor(lane = 0) {
  return LANE_COLORS[Math.abs(lane) % LANE_COLORS.length];
}

/**
 * Renders topological SVG curves, lines, and nodes for an array of commits.
 * @param {Array<Object>} commits
 * @param {Object} [options]
 * @param {number} [options.rowHeight=26] Base header row height
 * @param {number} [options.fileRowHeight=22] Height per expanded file row
 * @param {number} [options.laneWidth=14] Width per branch lane
 * @param {number} [options.startX=14] Left margin for lane 0
 * @param {number} [options.startY=13] Y-center of first row
 * @returns {string} SVG markup string
 */
function renderGitGraphSvg(commits = [], options = {}) {
  if (!Array.isArray(commits) || commits.length === 0) {
    return '';
  }

  const rowHeight = options.rowHeight ?? 26;
  const fileRowHeight = options.fileRowHeight ?? 22;
  const laneWidth = options.laneWidth ?? 14;
  const startX = options.startX ?? (options.laneWidth ? options.laneWidth : 14);
  const startY = options.startY ?? 13;

  let maxLane = 0;
  for (const c of commits) {
    if (typeof c.lane === 'number' && c.lane > maxLane) {
      maxLane = c.lane;
    }
  }

  const svgWidth = Math.max(32, startX + (maxLane + 1) * laneWidth + 8);

  // Compute Y-center coordinates for each commit taking expanded files into account
  const commitCoords = [];
  let currentY = 0;

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const isExpanded = !!commit.expanded;
    const fileCount = Array.isArray(commit.files) ? commit.files.length : 0;
    const extraHeight = isExpanded ? fileCount * fileRowHeight : 0;

    const cy = currentY + startY;
    commitCoords.push({
      cy,
      lane: commit.lane ?? 0,
      totalHeight: rowHeight + extraHeight
    });

    currentY += rowHeight + extraHeight;
  }

  const svgHeight = Math.max(currentY, commits.length * rowHeight);

  let pathsMarkup = '';
  let nodesMarkup = '';

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const coord = commitCoords[i];
    const lane = coord.lane;
    const cx = startX + lane * laneWidth;
    const cy = coord.cy;
    const color = getLaneColor(lane);

    // Draw connecting routes down to next commit rows
    if (Array.isArray(commit.routes)) {
      for (const route of commit.routes) {
        const nextIdx = i + 1;
        if (nextIdx >= commits.length) continue;

        const nextCoord = commitCoords[nextIdx];
        const fromX = startX + route.fromLane * laneWidth;
        const fromY = cy;
        const toX = startX + route.toLane * laneWidth;
        const toY = nextCoord.cy;
        const routeColor = getLaneColor(Math.min(route.fromLane, route.toLane));

        if (route.fromLane === route.toLane) {
          // Straight vertical trunk line
          pathsMarkup += `
            <line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="${routeColor}" stroke-width="2" stroke-linecap="round"/>
          `;
        } else {
          // Curved Bezier branch or merge
          const deltaY = toY - fromY;
          const cpY1 = fromY + deltaY * 0.45;
          const cpY2 = toY - deltaY * 0.45;
          pathsMarkup += `
            <path d="M ${fromX} ${fromY} C ${fromX} ${cpY1}, ${toX} ${cpY2}, ${toX} ${toY}" fill="none" stroke="${routeColor}" stroke-width="2" stroke-linecap="round"/>
          `;
        }
      }
    }

    // Node Circle
    const isHead = (Array.isArray(commit.refs) && commit.refs.some(r => r.includes('HEAD'))) || i === 0;
    if (isHead) {
      // Glowing halo ring around current/HEAD commit
      nodesMarkup += `
        <circle cx="${cx}" cy="${cy}" r="6.5" fill="none" stroke="${color}" stroke-width="1.8" class="git-node-halo"/>
        <circle cx="${cx}" cy="${cy}" r="3" fill="${color}" class="git-node-head" data-hash="${commit.hash}"/>
      `;
    } else {
      nodesMarkup += `
        <circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}" stroke="#181a1f" stroke-width="1.5" class="git-node" data-hash="${commit.hash}"/>
      `;
    }
  }

  return `
    <svg class="git-graph-svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="min-width: ${svgWidth}px; height: ${svgHeight}px;" xmlns="http://www.w3.org/2000/svg">
      <g class="git-graph-routes">
        ${pathsMarkup}
      </g>
      <g class="git-graph-nodes">
        ${nodesMarkup}
      </g>
    </svg>
  `.trim();
}



/**
 * Generates HTML for the auxiliary pane tab trigger button.
 * @returns {string}
 */
function renderGitGraphTabButton() {
  return `
    <div class="antigravity-git-tab-wrapper">
      <button class="antigravity-git-tab-btn" id="antigravity-git-tab-trigger" title="Git &amp; GitHub Graph">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="6" y1="3" x2="6" y2="15"></line>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="6" cy="6" r="3"></circle>
          <path d="M6 9a9 9 0 0 1 9 9"></path>
          <circle cx="18" cy="18" r="3"></circle>
        </svg>
        <span class="antigravity-git-tab-label">Git Graph</span>
      </button>
    </div>
  `.trim();
}

/**
 * Generates HTML for the compact VS Code-style Git Graph visualizer panel.
 * @param {Object} context
 * @param {Array<Object>} [context.commits=[]]
 * @param {Object} [context.status={}]
 * @param {Object} [context.github={}]
 * @param {string} [context.activeRepo='']
 * @returns {string}
 */
function renderGitGraphPanelHtml(context = {}) {
  const commits = Array.isArray(context.commits) ? context.commits : [];
  const status = context.status || { branch: 'main', isClean: true, ahead: 0, behind: 0 };
  const github = context.github || { isGitHub: false };
  const repoName = context.activeRepo || (github.fullName || 'workspace');

  // By default expand the second commit if it has files (matching user screenshot), or none
  commits.forEach((c, idx) => {
    if (c.expanded === undefined) {
      c.expanded = idx === 1 && Array.isArray(c.files) && c.files.length > 0;
    }
  });

  const svgGraph = renderGitGraphSvg(commits, { rowHeight: 26, fileRowHeight: 22, laneWidth: 14, startX: 14 });

  // Generate commit list items
  const commitRowsHtml = commits.map((c, idx) => {
    const isSelected = idx === 0;
    const isExpanded = !!c.expanded;
    const files = Array.isArray(c.files) ? c.files : [];

    // Ref Badges (branch pills)
    const refsHtml = (c.refs || []).map(ref => {
      const isHead = ref.includes('HEAD');
      const isOrigin = ref.includes('origin/');
      const isTag = ref.includes('tag:');
      const cleanRef = ref.replace('HEAD -> ', '').replace('tag: ', '');

      if (isOrigin) {
        return `<span class="git-pill-branch git-pill-origin" title="${escapeGitHtml(ref)}"><span class="git-icon-cloud">☁</span>${escapeGitHtml(cleanRef)}</span>`;
      }
      return `<span class="git-pill-branch ${isHead ? 'git-pill-head' : 'git-pill-local'}" title="${escapeGitHtml(ref)}"><span class="git-icon-dot">⦿</span>${escapeGitHtml(cleanRef)}</span>`;
    }).join('');

    // Inline file diff list
    const filesListHtml = files.map(f => {
      const extCls = getExtClass(f.ext);
      const statusCls = f.status === 'A' ? 'status-added' : f.status === 'D' ? 'status-deleted' : 'status-modified';
      return `
        <div class="git-file-row">
          <span class="git-file-ext ${extCls}">${escapeGitHtml(f.ext)}</span>
          <span class="git-file-name" title="${escapeGitHtml(f.path)}">${escapeGitHtml(f.fileName)}</span>
          <span class="git-file-dir">${escapeGitHtml(f.dir)}</span>
          <span class="git-file-status ${statusCls}">${escapeGitHtml(f.status)}</span>
        </div>
      `;
    }).join('');

const commitUrl = github.isGitHub && github.getCommitUrl ? github.getCommitUrl(c.hash) : '';
    const author = c.author || { name: 'Unknown', email: '', avatarUrl: '' };

    return `
      <div class="git-commit-item ${isExpanded ? 'is-expanded' : ''}" data-hash="${c.hash}" data-index="${idx}">
        <div class="git-commit-row ${isSelected ? 'selected' : ''}" 
             data-hash="${c.hash}" 
             data-index="${idx}" 
             data-short-hash="${c.shortHash}" 
             data-commit-url="${commitUrl}" 
             data-email="${escapeGitHtml(author.email)}" 
             data-author="${escapeGitHtml(author.name)}" 
             data-subject="${escapeGitHtml(c.subject)}" 
             tabindex="0">
          <div class="git-commit-main">
            <span class="git-commit-subject" title="${escapeGitHtml(c.subject)}">${escapeGitHtml(c.subject)}</span>
            <div class="git-commit-badges">
              ${refsHtml}
              ${files.length > 0 ? `<span class="git-pill-files" title="${files.length} changed files">📄${files.length}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="git-commit-files-container" style="display: ${isExpanded ? 'block' : 'none'};">
          ${filesListHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="antigravity-git-panel" id="antigravity-git-panel-root">
      <!-- VS Code Style Minimal Header -->
      <div class="git-panel-header">
        <div class="git-panel-title-wrap">
          <span class="git-header-caret">⌄</span>
          <span class="git-header-title">Graph</span>
          <span class="git-header-repo" title="Active Repository">${escapeGitHtml(repoName)}</span>
          <span class="git-branch-pill">${escapeGitHtml(status.branch)}${status.isClean ? '' : '*'}</span>
        </div>
        <div class="git-header-actions">
          <span class="git-pill-auto">Auto</span>
          <button class="git-tool-btn" id="antigravity-git-refresh-btn" title="Refresh Git status">↻</button>
          <button class="git-tool-btn git-tool-close" id="antigravity-git-close-btn" title="Close Git Graph">✕</button>
        </div>
      </div>

      <!-- Graph & Commits Viewport -->
      <div class="git-graph-container">
        <div class="git-svg-column">
          ${svgGraph}
        </div>
        <div class="git-commits-column">
          ${commitRowsHtml}
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * Generates inspector card for selected commit.
 * @param {Object} commit
 * @param {Object} [github={}]
 * @returns {string}
 */
function renderInspectorCard(commit, github = {}) {
  const author = commit.author || { name: 'Unknown', email: '', avatarUrl: '' };
  const commitUrl = github.isGitHub && github.getCommitUrl ? github.getCommitUrl(commit.hash) : '';

  return `
    <div class="git-inspector-header">
      <div class="git-inspector-author">
        <img class="git-inspector-avatar" src="${author.avatarUrl}" alt="${escapeGitHtml(author.name)}"/>
        <div class="git-inspector-author-col">
          <span class="git-inspector-author-name">${escapeGitHtml(author.name)}</span>
          ${author.email ? `<span class="git-inspector-author-email">&lt;${escapeGitHtml(author.email)}&gt;</span>` : ''}
        </div>
      </div>
      <div class="git-inspector-hash-wrap">
        <span class="git-inspector-hash" title="${escapeGitHtml(commit.hash)}">${escapeGitHtml(commit.shortHash || commit.hash.slice(0, 7))}</span>
        ${commitUrl ? `<a href="${commitUrl}" target="_blank" rel="noopener" class="git-inspector-gh-link">View Commit ↗</a>` : ''}
      </div>
    </div>
    <div class="git-inspector-subject">${escapeGitHtml(commit.subject)}</div>
  `.trim();
}

function getExtClass(ext = '') {
  const e = String(ext).toUpperCase();
  if (e === 'JS' || e === 'MJS' || e === 'CJS') return 'ext-js';
  if (e === 'TS' || e === 'TSX') return 'ext-ts';
  if (e === 'JSON') return 'ext-json';
  if (e === 'CSS' || e === 'SCSS') return 'ext-css';
  if (e === 'MD') return 'ext-md';
  if (e === 'HTML') return 'ext-html';
  return 'ext-default';
}

function escapeGitHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}










/**
 * Mod providing live topological Git branch & commit visualization in the Auxiliary Pane.
 */
class GitGraphMod extends AntigravityMod {
  constructor() {
    super({
      id: 'git-graph',
      name: 'Git & GitHub Topological Graph',
      version: '2.0.0',
      slot: 'aux-pane-tab',
      priority: 60
    });

    this.cachedCss = "/* =========================================================================\n   ANTIGRAVITY GIT & GITHUB GRAPH MOD - VS CODE STYLE\n   Ultra-compact, lightweight DAG commit tree & inline file diff visualizer\n   ========================================================================= */\n\n/* Tab Button in Auxiliary Pane Header */\n.antigravity-git-tab-wrapper {\n  display: inline-flex;\n  align-items: center;\n}\n\n.antigravity-git-tab-btn {\n  height: 28px !important;\n  padding: 0 8px !important;\n  font-size: 12px !important;\n  font-weight: 500 !important;\n  color: #94a3b8 !important;\n  background: transparent !important;\n  border: 1px solid transparent !important;\n  border-radius: 6px !important;\n  cursor: pointer !important;\n  display: inline-flex !important;\n  align-items: center !important;\n  gap: 6px !important;\n  transition: all 0.15s ease !important;\n  user-select: none !important;\n}\n\n.antigravity-git-tab-btn:hover {\n  background: rgba(255, 255, 255, 0.06) !important;\n  color: #f8fafc !important;\n}\n\n.antigravity-git-tab-btn.active {\n  background: #1e2438 !important;\n  color: #38bdf8 !important;\n  border-color: rgba(56, 189, 248, 0.25) !important;\n}\n\n/* Full Auxiliary Panel Body */\n.antigravity-git-panel {\n  display: flex !important;\n  flex-direction: column !important;\n  width: 100% !important;\n  height: 100% !important;\n  background: #181a1f !important;\n  color: #e2e8f0 !important;\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, monospace, sans-serif !important;\n  overflow: hidden !important;\n  box-sizing: border-box !important;\n}\n\n/* VS Code Minimal Header Bar */\n.git-panel-header {\n  height: 32px !important;\n  min-height: 32px !important;\n  display: flex !important;\n  align-items: center !important;\n  justify-content: space-between !important;\n  padding: 0 10px !important;\n  background: #1e222b !important;\n  border-bottom: 1px solid rgba(255, 255, 255, 0.07) !important;\n  user-select: none !important;\n}\n\n.git-panel-title-wrap {\n  display: flex !important;\n  align-items: center !important;\n  gap: 6px !important;\n  overflow: hidden !important;\n}\n\n.git-header-caret {\n  font-size: 12px !important;\n  color: #94a3b8 !important;\n}\n\n.git-header-title {\n  font-size: 12px !important;\n  font-weight: 600 !important;\n  color: #f1f5f9 !important;\n}\n\n.git-header-repo {\n  font-size: 11px !important;\n  color: #64748b !important;\n  max-width: 140px !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n}\n\n.git-branch-pill {\n  font-size: 10px !important;\n  font-weight: 600 !important;\n  padding: 1px 6px !important;\n  border-radius: 4px !important;\n  background: rgba(56, 189, 248, 0.15) !important;\n  color: #38bdf8 !important;\n  border: 1px solid rgba(56, 189, 248, 0.3) !important;\n  font-family: monospace !important;\n}\n\n.git-header-actions {\n  display: flex !important;\n  align-items: center !important;\n  gap: 6px !important;\n}\n\n.git-pill-auto {\n  font-size: 10px !important;\n  color: #94a3b8 !important;\n  background: rgba(255, 255, 255, 0.05) !important;\n  padding: 1px 5px !important;\n  border-radius: 3px !important;\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\n}\n\n.git-tool-btn {\n  background: transparent !important;\n  border: none !important;\n  color: #94a3b8 !important;\n  font-size: 12px !important;\n  cursor: pointer !important;\n  padding: 2px 4px !important;\n  border-radius: 4px !important;\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n}\n\n.git-tool-btn:hover {\n  background: rgba(255, 255, 255, 0.1) !important;\n  color: #f1f5f9 !important;\n}\n\n.git-tool-close:hover {\n  background: rgba(239, 68, 68, 0.2) !important;\n  color: #ef4444 !important;\n}\n\n/* Graph & Commits Viewport */\n.git-graph-container {\n  display: flex !important;\n  flex: 1 1 0% !important;\n  overflow-y: auto !important;\n  overflow-x: hidden !important;\n  position: relative !important;\n  scrollbar-width: thin !important;\n  scrollbar-color: rgba(255, 255, 255, 0.15) transparent !important;\n}\n\n.git-graph-container::-webkit-scrollbar {\n  width: 6px !important;\n}\n\n.git-graph-container::-webkit-scrollbar-thumb {\n  background: rgba(255, 255, 255, 0.15) !important;\n  border-radius: 3px !important;\n}\n\n.git-svg-column {\n  flex-shrink: 0 !important;\n  position: relative !important;\n}\n\n.git-graph-svg {\n  display: block !important;\n}\n\n.git-commits-column {\n  flex: 1 1 0% !important;\n  min-width: 0 !important;\n  display: flex !important;\n  flex-direction: column !important;\n}\n\n/* Individual Commit Item */\n.git-commit-item {\n  display: flex !important;\n  flex-direction: column !important;\n  width: 100% !important;\n}\n\n.git-commit-row {\n  height: 26px !important;\n  min-height: 26px !important;\n  display: flex !important;\n  align-items: center !important;\n  padding: 0 8px 0 4px !important;\n  cursor: pointer !important;\n  border-radius: 0 !important;\n  transition: background 0.1s ease !important;\n  user-select: none !important;\n  overflow: hidden !important;\n}\n\n.git-commit-row:hover {\n  background: rgba(255, 255, 255, 0.04) !important;\n}\n\n.git-commit-row.selected {\n  background: rgba(56, 189, 248, 0.12) !important;\n}\n\n.git-commit-main {\n  display: flex !important;\n  align-items: center !important;\n  justify-content: space-between !important;\n  width: 100% !important;\n  min-width: 0 !important;\n  gap: 8px !important;\n}\n\n.git-commit-subject {\n  font-size: 12px !important;\n  color: #e2e8f0 !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n  flex: 1 1 0% !important;\n}\n\n.git-commit-badges {\n  display: inline-flex !important;\n  align-items: center !important;\n  gap: 4px !important;\n  flex-shrink: 0 !important;\n}\n\n/* Branch & Ref Badges (VS Code Pill Style) */\n.git-pill-branch {\n  font-size: 10px !important;\n  font-weight: 500 !important;\n  padding: 1px 6px !important;\n  border-radius: 10px !important;\n  display: inline-flex !important;\n  align-items: center !important;\n  gap: 3px !important;\n  white-space: nowrap !important;\n  font-family: monospace !important;\n}\n\n.git-pill-local {\n  background: rgba(56, 189, 248, 0.15) !important;\n  color: #38bdf8 !important;\n  border: 1px solid rgba(56, 189, 248, 0.35) !important;\n}\n\n.git-pill-head {\n  background: rgba(56, 189, 248, 0.22) !important;\n  color: #7dd3fc !important;\n  border: 1px solid rgba(56, 189, 248, 0.5) !important;\n  box-shadow: 0 0 6px rgba(56, 189, 248, 0.25) !important;\n}\n\n.git-pill-origin {\n  background: rgba(249, 115, 22, 0.15) !important;\n  color: #fb923c !important;\n  border: 1px solid rgba(249, 115, 22, 0.35) !important;\n}\n\n.git-pill-files {\n  font-size: 9px !important;\n  color: #64748b !important;\n  background: rgba(255, 255, 255, 0.05) !important;\n  padding: 1px 4px !important;\n  border-radius: 3px !important;\n}\n\n.git-icon-cloud {\n  font-size: 10px !important;\n}\n\n.git-icon-dot {\n  font-size: 9px !important;\n}\n\n/* Expandable Inline File Diff List */\n.git-commit-files-container {\n  display: flex !important;\n  flex-direction: column !important;\n  background: rgba(0, 0, 0, 0.25) !important;\n  border-left: 2px solid rgba(56, 189, 248, 0.3) !important;\n  margin-left: 14px !important;\n  padding: 2px 0 !important;\n}\n\n.git-file-row {\n  height: 22px !important;\n  min-height: 22px !important;\n  display: flex !important;\n  align-items: center !important;\n  padding: 0 10px 0 8px !important;\n  font-size: 11px !important;\n  gap: 8px !important;\n  overflow: hidden !important;\n}\n\n.git-file-row:hover {\n  background: rgba(255, 255, 255, 0.04) !important;\n}\n\n.git-file-ext {\n  font-size: 9px !important;\n  font-weight: 700 !important;\n  padding: 1px 4px !important;\n  border-radius: 3px !important;\n  font-family: monospace !important;\n  letter-spacing: -0.02em !important;\n}\n\n.ext-js {\n  background: rgba(234, 179, 8, 0.18) !important;\n  color: #facc15 !important;\n  border: 1px solid rgba(234, 179, 8, 0.35) !important;\n}\n\n.ext-ts {\n  background: rgba(59, 130, 246, 0.18) !important;\n  color: #60a5fa !important;\n  border: 1px solid rgba(59, 130, 246, 0.35) !important;\n}\n\n.ext-json {\n  background: rgba(34, 197, 94, 0.18) !important;\n  color: #4ade80 !important;\n  border: 1px solid rgba(34, 197, 94, 0.35) !important;\n}\n\n.ext-css {\n  background: rgba(6, 182, 212, 0.18) !important;\n  color: #22d3ee !important;\n  border: 1px solid rgba(6, 182, 212, 0.35) !important;\n}\n\n.ext-md {\n  background: rgba(168, 85, 247, 0.18) !important;\n  color: #c084fc !important;\n  border: 1px solid rgba(168, 85, 247, 0.35) !important;\n}\n\n.ext-default {\n  background: rgba(148, 163, 184, 0.18) !important;\n  color: #cbd5e1 !important;\n  border: 1px solid rgba(148, 163, 184, 0.3) !important;\n}\n\n.git-file-name {\n  color: #e2e8f0 !important;\n  font-weight: 500 !important;\n  white-space: nowrap !important;\n}\n\n.git-file-dir {\n  color: #64748b !important;\n  font-family: monospace !important;\n  font-size: 10px !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n  flex: 1 1 0% !important;\n}\n\n.git-file-status {\n  font-size: 10px !important;\n  font-weight: 700 !important;\n  font-family: monospace !important;\n}\n\n.status-modified {\n  color: #eab308 !important;\n}\n\n.status-added {\n  color: #22c55e !important;\n}\n\n.status-deleted {\n  color: #ef4444 !important;\n}\n";
  }

  /**
   * Renders the auxiliary pane tab button and panel template markup.
   * @param {Object} [context]
   * @returns {{ html: string, css: string }}
   */
  render(context = {}) {
    const tabButtonHtml = renderGitGraphTabButton();
    const panelHtml = renderGitGraphPanelHtml(context);

    const html = `
      ${tabButtonHtml}
      <template id="antigravity-git-panel-template">
        ${panelHtml}
      </template>
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
    host.registerMod(new ModsManagerMod());
    host.registerMod(new GitGraphMod());
    await host.dispatch();
  } catch (err) {
    // Fail silently in background hook context
  }
}

main();
