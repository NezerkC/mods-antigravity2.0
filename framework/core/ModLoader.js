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

        // 2. Global Agent Selector & Tachometer Portal Handlers
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

          if (!portal.firstElementChild) {
            const template = document.querySelector('.antigravity-agent-dropdown-template');
            if (template) {
              portal.innerHTML = template.innerHTML;
            }
          }

          const isCurrentOpen = portal.classList.contains('open') && portal.__currentBadge === badge;

          document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));
          portal.classList.remove('open');
          portal.__currentBadge = null;

          if (!isCurrentOpen) {
            badge.classList.add('open');
            portal.__currentBadge = badge;

            const rect = badge.getBoundingClientRect();
            const portalHeight = 390;
            const portalWidth = 320;

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
          }
        };

        window.__selectAntigravityAgent = function(agentId, agentName, agentColor) {
          document.querySelectorAll('.antigravity-active-agent-name, #antigravity-active-agent-name').forEach(label => {
            label.textContent = agentName;
          });

          document.querySelectorAll('.antigravity-agent-badge, #antigravity-agent-badge').forEach(badge => {
            badge.setAttribute('title', 'Active Specialist: ' + agentName);
            badge.classList.remove('open');
            if (agentColor) {
              badge.style.borderColor = agentColor + '66';
              badge.style.boxShadow = '0 0 8px ' + agentColor + '33';
            }
          });

          document.querySelectorAll('.antigravity-active-agent-dot, #antigravity-active-agent-dot').forEach(dot => {
            if (agentColor) {
              dot.style.background = agentColor;
              dot.style.boxShadow = '0 0 6px ' + agentColor;
            }
          });

          const portal = document.getElementById('antigravity-agent-dropdown-portal');
          if (portal) {
            portal.classList.remove('open');
            portal.__currentBadge = null;
          }

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

        window.__showTachometerPopover = function(badge) {
          let portal = document.getElementById('antigravity-tachometer-popover-portal');
          if (!portal) {
            portal = document.createElement('div');
            portal.id = 'antigravity-tachometer-popover-portal';
            portal.className = 'antigravity-tachometer-popover-portal';
            document.body.appendChild(portal);
          }

          if (!portal.firstElementChild) {
            const template = document.querySelector('.antigravity-popover-template');
            if (template) {
              portal.innerHTML = template.innerHTML;
            }
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

          const clampedLeft = Math.max(10, Math.min(window.innerWidth - portalWidth - 10, rect.left - 40));
          portal.style.left = clampedLeft + 'px';
          portal.classList.add('open');
        };

        window.__hideTachometerPopover = function() {
          const portal = document.getElementById('antigravity-tachometer-popover-portal');
          if (portal && !portal.__isPinned && !portal.__isHovered) {
            portal.classList.remove('open');
          }
        };

        // Store all per-conversation metrics and current primary snapshot
        window.__antigravityAllMetrics = ${JSON.stringify(context.allMetrics || {})};
        window.__antigravityLatestMetric = ${JSON.stringify(context.telemetry || {})};

        window.__updateAntigravityTelemetry = function(fallbackMetric) {
          const all = window.__antigravityAllMetrics || {};
          const latest = fallbackMetric || window.__antigravityLatestMetric;

          document.querySelectorAll('.antigravity-tachometer-badge').forEach(badge => {
            const cascadeEl = badge.closest('[data-cascade-id]');
            const cascadeId = cascadeEl ? cascadeEl.getAttribute('data-cascade-id') : null;
            const urlPath = window.location.pathname || '';
            const pathParts = urlPath.split('/c/');
            const urlPathId = (pathParts.length > 1 && pathParts[1]) ? pathParts[1].split('/')[0].split('?')[0] : null;
            const searchMatch = (window.location.search || '').match(/[?&](?:focused|conversationId)=([0-9a-fA-F-]+)/);
            const activeId = cascadeId || urlPathId || (searchMatch ? searchMatch[1] : null);

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
          });
        };

        if (!window.__antigravityGlobalEventsBound) {
          window.__antigravityGlobalEventsBound = true;
          document.addEventListener('click', (e) => {
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
              if (tachPortal && !tachPortal.__isPinned) {
                tachPortal.classList.remove('open');
              }
            }
          }, true);

          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              const aPortal = document.getElementById('antigravity-agent-dropdown-portal');
              if (aPortal) aPortal.classList.remove('open');
              document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));

              const tachPortal = document.getElementById('antigravity-tachometer-popover-portal');
              if (tachPortal) {
                tachPortal.classList.remove('open');
                tachPortal.__isPinned = false;
              }
              document.querySelectorAll('.antigravity-tachometer-badge.pinned').forEach(b => b.classList.remove('pinned'));
            }
          });
        }

        // 3. Mount individual mods into target slots across all conversations
        function mountAllMods() {
          // Permanently remove legacy duplicate unmanaged badges
          document.querySelectorAll('.antigravity-context-badge').forEach(el => el.remove());

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
          if (agentTemplate && (!agentPortal.firstElementChild || agentPortal.getAttribute('data-v') !== '2')) {
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

          // Bind Tachometer hover & click handlers
          document.querySelectorAll('.antigravity-tachometer-badge').forEach(badge => {
            if (badge.__tachEventsBound) return;
            badge.__tachEventsBound = true;
            let leaveTimer = null;

            badge.addEventListener('mouseenter', () => {
              if (leaveTimer) clearTimeout(leaveTimer);
              window.__showTachometerPopover(badge);
            });

            badge.addEventListener('mouseleave', () => {
              leaveTimer = setTimeout(() => {
                window.__hideTachometerPopover();
              }, 150);
            });

            badge.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              const portal = document.getElementById('antigravity-tachometer-popover-portal');
              if (!portal) return;
              portal.__isPinned = !portal.__isPinned;
              badge.classList.toggle('pinned', portal.__isPinned);
              if (portal.__isPinned) {
                window.__showTachometerPopover(badge);
              } else {
                portal.classList.remove('open');
              }
            });
          });

          // Bind Tachometer portal hover protection
          const tPortal = document.getElementById('antigravity-tachometer-popover-portal');
          if (tPortal && !tPortal.__portalHoverBound) {
            tPortal.__portalHoverBound = true;
            tPortal.addEventListener('mouseenter', () => {
              tPortal.__isHovered = true;
            });
            tPortal.addEventListener('mouseleave', () => {
              tPortal.__isHovered = false;
              window.__hideTachometerPopover();
            });
          }

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

          // Apply current telemetry
          window.__updateAntigravityTelemetry(${JSON.stringify(context.telemetry || {})});
        }

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
            if (btn.parentElement && !btn.parentElement.querySelector('#antigravity-slot-header-actions')) {
              missingSlot = true;
              break;
            }
          }

          if (missingSlot) {
            if (mountDebounce) clearTimeout(mountDebounce);
            mountDebounce = setTimeout(mountAllMods, 80);
          }
        });

        window.__antigravityModObserver.observe(document.body, { childList: true, subtree: true });
      })();
    `;
  }
}
