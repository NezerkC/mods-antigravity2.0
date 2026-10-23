import { SlotManager } from './SlotManager.js';
import { StyleIsolator } from '../sdk/StyleIsolator.js';

/**
 * Discovers, registers, and compiles UI mods into coordinated injection scripts.
 */
export class ModLoader {
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

        // 2. Global Agent Selector handlers
        window.__toggleAgentDropdown = function(e, badgeEl) {
          if (e) e.stopPropagation();
          const badge = badgeEl || (e ? e.currentTarget : document.getElementById('antigravity-agent-badge'));
          if (!badge) return;
          const isOpen = badge.classList.contains('open');
          document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));
          if (!isOpen) {
            badge.classList.add('open');
          }
        };

        window.__selectAntigravityAgent = function(agentId, agentName, agentColor) {
          document.querySelectorAll('#antigravity-active-agent-name').forEach(label => {
            label.textContent = agentName;
          });

          document.querySelectorAll('#antigravity-agent-badge').forEach(badge => {
            badge.setAttribute('title', 'Active Specialist: ' + agentName);
            badge.classList.remove('open');
            if (agentColor) {
              badge.style.borderColor = agentColor + '66';
              badge.style.boxShadow = '0 0 8px ' + agentColor + '33';
            }
          });

          document.querySelectorAll('#antigravity-active-agent-dot').forEach(dot => {
            if (agentColor) {
              dot.style.background = agentColor;
              dot.style.boxShadow = '0 0 6px ' + agentColor;
            }
          });

          try {
            localStorage.setItem('__antigravity_selected_agent', JSON.stringify({ 
              id: agentId, 
              name: agentName,
              color: agentColor 
            }));
          } catch (e) {}

          document.querySelectorAll('.antigravity-agent-item').forEach(el => {
            const isMatch = el.getAttribute('data-agent-id') === agentId;
            el.classList.toggle('selected', isMatch);
            const check = el.querySelector('.agent-check');
            if (check) check.textContent = isMatch ? '✓' : '';
          });
        };

        if (!window.__agentGlobalClickBound) {
          window.__agentGlobalClickBound = true;
          document.addEventListener('click', (e) => {
            if (!e.target.closest('.antigravity-agent-badge')) {
              document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));
            }
          });
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));
            }
          });
        }

        // 3. Mount individual mods into target slots across all conversations
        function mountAllMods() {
          // Permanently remove legacy duplicate unmanaged badges
          document.querySelectorAll('.antigravity-context-badge').forEach(el => el.remove());

          ${mountSnippets.join('\n')}

          // Restore saved agent selection across all mounted badges
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

        mountAllMods();

        // 4. Observe DOM mutations to auto-mount into new or switched chat panels
        if (window.__antigravityModObserver) {
          window.__antigravityModObserver.disconnect();
          window.__antigravityModObserver = null;
        }

        let mountRaf = null;
        window.__antigravityModObserver = new MutationObserver(() => {
          if (mountRaf) cancelAnimationFrame(mountRaf);
          mountRaf = requestAnimationFrame(mountAllMods);
        });

        window.__antigravityModObserver.observe(document.body, { childList: true, subtree: true });
      })();
    `;
  }
}
