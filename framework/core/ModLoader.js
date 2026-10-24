import { SlotManager } from './SlotManager.js';
import { StyleIsolator } from '../sdk/StyleIsolator.js';
import { renderPopoverHtml } from '../../mods/context-tachometer/components/PopoverHtml.js';
import { renderModsManagerPanelHtml } from '../../mods/mods-manager/components/ModsManagerHtml.js';

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
        window.__applyAgentToBadge = function(badge, agent) {
          if (!badge || !agent) return;
          const name = agent.name || 'Sin Agente';
          const color = agent.color || '#94a3b8';
          badge.setAttribute('title', 'Modo Activo: ' + name);
          badge.style.borderColor = color + '66';
          badge.style.boxShadow = '0 0 8px ' + color + '33';

          const label = badge.querySelector('.antigravity-active-agent-name');
          if (label) label.textContent = name;

          const dot = badge.querySelector('.antigravity-active-agent-dot');
          if (dot) {
            dot.style.background = color;
            dot.style.boxShadow = '0 0 6px ' + color;
          }

          const iconWrap = badge.querySelector('.antigravity-active-agent-icon');
          if (iconWrap && agent.id) {
            const item = document.querySelector('.antigravity-agent-item[data-agent-id="' + agent.id + '"]');
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

          const cascade = badge.closest('[data-cascade-id]');
          const cascadeId = cascade ? cascade.getAttribute('data-cascade-id') : null;

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

            // Determine active agent for THIS chat
            let activeId = 'default';
            let activeName = 'Sin Agente';
            try {
              const map = JSON.parse(localStorage.getItem('__antigravity_selected_agents_map') || '{}');
              if (cascadeId && map[cascadeId]) {
                activeId = map[cascadeId].id;
                activeName = map[cascadeId].name;
              }
            } catch (err) {}

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
          const currentBadge = portal ? portal.__currentBadge : null;
          const cascadeId = (portal && portal.__currentCascadeId) ||
            (currentBadge && currentBadge.closest('[data-cascade-id]')?.getAttribute('data-cascade-id')) ||
            null;

          const agentData = {
            id: agentId,
            name: agentName,
            color: agentColor,
            filePath: agentFilePath || ''
          };

          // Find target badge scoped to this chat
          let targetBadge = currentBadge;
          if (cascadeId) {
            const container = document.querySelector('[data-cascade-id="' + cascadeId + '"]');
            if (container) {
              targetBadge = container.querySelector('.antigravity-agent-badge') || currentBadge;
            }
          }

          if (targetBadge) {
            window.__applyAgentToBadge(targetBadge, agentData);
            targetBadge.classList.remove('open');
          } else {
            // Fallback for standalone badge
            document.querySelectorAll('.antigravity-agent-badge').forEach(b => {
              window.__applyAgentToBadge(b, agentData);
              b.classList.remove('open');
            });
          }

          // Save scoped per-chat state in localStorage
          try {
            const map = JSON.parse(localStorage.getItem('__antigravity_selected_agents_map') || '{}');
            if (cascadeId) {
              map[cascadeId] = agentData;
              localStorage.setItem('__antigravity_selected_agents_map', JSON.stringify(map));
            }
            // Keep legacy single-entry fallback
            localStorage.setItem('__antigravity_selected_agent', JSON.stringify(agentData));
          } catch (e) {}

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

            // Update live popover content if currently open on screen
            const portal = document.getElementById('antigravity-tachometer-popover-portal');
            if (portal && portal.classList.contains('open') && window.__renderTachometerPopoverHtml) {
              portal.innerHTML = window.__renderTachometerPopoverHtml(m);
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
          });
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
          if (agentTemplate) {
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
          try {
            const mapRaw = localStorage.getItem('__antigravity_selected_agents_map');
            const map = mapRaw ? JSON.parse(mapRaw) : {};
            const fallbackRaw = localStorage.getItem('__antigravity_selected_agent');
            const fallbackAgent = fallbackRaw ? JSON.parse(fallbackRaw) : null;

            document.querySelectorAll('.antigravity-agent-badge').forEach(badge => {
              const cascade = badge.closest('[data-cascade-id]');
              const cId = cascade ? cascade.getAttribute('data-cascade-id') : null;
              const agentToApply = (cId && map[cId]) ? map[cId] : (fallbackAgent || null);
              if (agentToApply && agentToApply.name) {
                window.__applyAgentToBadge(badge, agentToApply);
              }
            });
          } catch (e) {}

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
          }
        });

        window.__antigravityModObserver.observe(document.body, { childList: true, subtree: true });
      })();
    `;
  }
}
