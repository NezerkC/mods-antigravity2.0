import { SlotManager } from './SlotManager.js';
import { StyleIsolator } from '../sdk/StyleIsolator.js';
import { renderPopoverHtml, renderSvgIcon } from '../../mods/context-tachometer/components/PopoverHtml.js';
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

        const renderSvgIcon = ${renderSvgIcon.toString()};
        window.__renderSvgIcon = renderSvgIcon;
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

        window.__bindGitPanelEvents = function(hostEl) {
          if (!hostEl) return;

          // Commit row click and file expansion
          hostEl.querySelectorAll('.git-commit-row').forEach(row => {
            row.addEventListener('click', (ev) => {
              hostEl.querySelectorAll('.git-commit-row.selected').forEach(r => r.classList.remove('selected'));
              row.classList.add('selected');

              const item = row.closest('.git-commit-item');
              const isPillClick = ev.target.closest('.git-pill-files') || ev.target.closest('.git-commit-chevron');

              if (item && isPillClick) {
                ev.stopPropagation();
                const filesContainer = item.querySelector('.git-commit-files-container');
                const chevron = item.querySelector('.git-commit-chevron');
                if (filesContainer) {
                  const isNowOpen = filesContainer.style.display !== 'none';
                  filesContainer.style.display = isNowOpen ? 'none' : 'flex';
                  item.classList.toggle('is-expanded', !isNowOpen);
                  if (chevron && chevron.classList.contains('has-files')) {
                    chevron.textContent = isNowOpen ? '▸' : '▾';
                  }
                }
              }

              const hash = row.getAttribute('data-hash');
              const inspector = hostEl.querySelector('#antigravity-git-inspector');
              if (inspector && hash) {
                const authorName = row.getAttribute('data-author') || 'Unknown';
                const authorEmail = row.getAttribute('data-email') || '';
                const avatarUrl = row.getAttribute('data-avatar') || '';
                const commitUrl = row.getAttribute('data-commit-url') || '';
                const shortHash = row.getAttribute('data-short-hash') || hash.slice(0, 7);
                const subject = row.getAttribute('data-subject') || '';
                const relativeDate = row.getAttribute('data-date') || '';
                const filesCount = parseInt(row.getAttribute('data-files-count') || '0', 10);

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
                const initials = (authorName || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                const linkHtml = commitUrl
                  ? '<a href="' + esc(commitUrl) + '" target="_blank" rel="noopener" class="git-inspector-btn-gh" title="Ver commit en GitHub">GitHub ↗</a>'
                  : '';

                inspector.innerHTML = '<div class="git-inspector-card">' +
                  '<div class="git-inspector-top">' +
                  '<div class="git-inspector-author-group">' +
                  '<div class="git-avatar-frame">' +
                  '<div class="git-inspector-avatar-fallback">' + esc(initials) + '</div>' +
                  (avatarUrl ? '<img class="git-inspector-avatar" src="' + avatarUrl + '" alt="' + safeAuthor + '" onerror="this.remove()"/>' : '') +
                  '</div>' +
                  '<div class="git-inspector-author-text">' +
                  '<div class="git-inspector-name-row">' +
                  '<span class="git-inspector-author-name">' + safeAuthor + '</span>' +
                  (relativeDate ? '<span class="git-inspector-date">' + esc(relativeDate) + '</span>' : '') +
                  '</div>' +
                  (safeEmail ? '<span class="git-inspector-author-email">' + safeEmail + '</span>' : '') +
                  '</div></div>' +
                  '<div class="git-inspector-meta-group">' +
                  '<span class="git-inspector-hash-pill" title="Hash: ' + esc(hash) + '">' + safeShortHash + '</span>' +
                  linkHtml +
                  '<button class="git-inspector-btn-close" id="antigravity-git-inspector-close-btn" title="Cerrar inspector">✕</button>' +
                  '</div></div>' +
                  '<div class="git-inspector-subject-line">' + safeSubject + '</div>' +
                  (filesCount > 0 ? '<div class="git-inspector-footer-stats"><span class="git-inspector-files-badge">📄 ' + filesCount + ' archivo' + (filesCount > 1 ? 's' : '') + ' modificado' + (filesCount > 1 ? 's' : '') + '</span></div>' : '') +
                  '</div>';
                inspector.style.display = 'block';

                const inspClose = inspector.querySelector('#antigravity-git-inspector-close-btn');
                if (inspClose) {
                  inspClose.onclick = (eClose) => {
                    eClose.stopPropagation();
                    inspector.style.display = 'none';
                  };
                }
              }
            });
          });

          // Expand/Collapse all files toggle button
          const toggleAllBtn = hostEl.querySelector('#antigravity-git-toggle-all-btn');
          if (toggleAllBtn) {
            let allExpanded = false;
            toggleAllBtn.onclick = (e) => {
              e.stopPropagation();
              allExpanded = !allExpanded;
              hostEl.querySelectorAll('.git-commit-item').forEach(item => {
                const filesContainer = item.querySelector('.git-commit-files-container');
                const chevron = item.querySelector('.git-commit-chevron');
                if (filesContainer) {
                  filesContainer.style.display = allExpanded ? 'flex' : 'none';
                  item.classList.toggle('is-expanded', allExpanded);
                  if (chevron && chevron.classList.contains('has-files')) {
                    chevron.textContent = allExpanded ? '▾' : '▸';
                  }
                }
              });
            };
          }

          // Branch filter pills (Todas / Locales / GitHub)
          hostEl.querySelectorAll('.git-filter-pill').forEach(pill => {
            pill.onclick = (e) => {
              e.stopPropagation();
              hostEl.querySelectorAll('.git-filter-pill.active').forEach(p => p.classList.remove('active'));
              pill.classList.add('active');

              const filterType = pill.getAttribute('data-branch-filter') || 'all';
              hostEl.querySelectorAll('.git-commit-item').forEach(item => {
                const type = item.getAttribute('data-commit-type');
                if (filterType === 'all') {
                  item.style.display = '';
                } else if (filterType === 'local') {
                  item.style.display = type === 'local' ? '' : 'none';
                } else if (filterType === 'remote') {
                  item.style.display = type === 'remote' ? '' : 'none';
                }
              });
            };
          });

          // Branches Drawer dropdown toggle
          const drawerBtn = hostEl.querySelector('#antigravity-git-branches-drawer-btn');
          const drawer = hostEl.querySelector('#antigravity-git-branches-drawer');
          if (drawerBtn && drawer) {
            drawerBtn.onclick = (e) => {
              e.stopPropagation();
              const isHidden = drawer.style.display === 'none';
              drawer.style.display = isHidden ? 'block' : 'none';
              const caret = drawerBtn.querySelector('.git-drawer-caret');
              if (caret) caret.textContent = isHidden ? '▴' : '▾';
            };
          }

          const ciTrigger = hostEl.querySelector('#antigravity-git-ci-rollup-trigger');
          const ciAccordion = hostEl.querySelector('#antigravity-git-ci-accordion');
          if (ciTrigger && ciAccordion) {
            ciTrigger.onclick = (e) => {
              e.stopPropagation();
              const isHidden = ciAccordion.style.display === 'none';
              ciAccordion.style.display = isHidden ? 'block' : 'none';
              const caret = ciTrigger.querySelector('.git-ci-caret');
              if (caret) caret.textContent = isHidden ? '▴' : '▾';
            };
          }

          const refreshBtn = hostEl.querySelector('#antigravity-git-refresh-btn');
          if (refreshBtn) {
            refreshBtn.onclick = async (e) => {
              if (e) e.stopPropagation();
              refreshBtn.style.transform = 'rotate(360deg)';
              refreshBtn.style.transition = 'transform 0.5s ease';
              setTimeout(() => { refreshBtn.style.transform = ''; }, 500);

              try {
                const res = await fetch('http://127.0.0.1:53912/vcs/overview');
                if (res.ok) {
                  const data = await res.json();
                  if (window.__antigravityUpdateVcsData) {
                    window.__antigravityUpdateVcsData(data);
                    return;
                  }
                }
              } catch {}

              if (window.__antigravityMountAll) {
                window.__antigravityMountAll();
              }
            };
          }

          const closeBtn = hostEl.querySelector('#antigravity-git-close-btn');
          if (closeBtn) {
            closeBtn.onclick = (e) => {
              e.stopPropagation();
              window.__toggleGitGraphPanel();
            };
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
            window.__bindGitPanelEvents(hostEl);
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

        window.__scrapeNativeModelQuota = function() {
          try {
            if (!document.body) return null;
            const bodyText = document.body.innerText || '';
            const labels = [
              'Five Hour Limit Remaining',
              'Weekly Limit Remaining',
              'Gemini 4 Argon Weekly Limit'
            ];
            const hasAny = labels.some(l => bodyText.includes(l));
            if (!hasAny) return null;

            const scraped = { updatedAt: Date.now(), items: {} };
            const allElements = document.body.querySelectorAll('div, span, p, li, section');
            for (const label of labels) {
              for (const el of allElements) {
                if (el.children.length === 0 && el.textContent && el.textContent.includes(label)) {
                  const container = el.parentElement?.parentElement || el.parentElement || el;
                  const text = container.textContent || '';
                  const pctMatch = text.match(/\\b(\\d{1,3})%/);
                  const resetMatch = text.match(/(?:resets?\\s+in|reset:?|in)\\s*([0-9dhms\\s]+)/i);
                  if (pctMatch) {
                    scraped.items[label] = {
                      remainingPct: parseInt(pctMatch[1], 10),
                      resetText: resetMatch ? resetMatch[1].trim() : null
                    };
                    break;
                  }
                }
              }
            }
            if (Object.keys(scraped.items).length > 0) {
              localStorage.setItem('__antigravity_native_quota_cache', JSON.stringify(scraped));
              return scraped;
            }
          } catch (e) {}
          return null;
        };

        window.__updateAntigravityTelemetry = function(fallbackMetric) {
          const all = window.__antigravityAllMetrics || {};
          const latest = fallbackMetric || window.__antigravityLatestMetric;

          document.querySelectorAll('.antigravity-tachometer-badge').forEach(badge => {
            const activeId = window.__resolveCascadeId(badge);

            const m = (activeId && all[activeId]) ? all[activeId] : (latest || window.__antigravityLatestMetric);
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

            if (window.__renderTachometerPopoverHtml) {
              const renderedPopover = window.__renderTachometerPopoverHtml(m);
              const tpl = badge.querySelector('.antigravity-popover-template') ||
                badge.parentElement?.querySelector('.antigravity-popover-template');
              if (tpl) {
                tpl.innerHTML = renderedPopover;
              }

              // Update live popover content if currently open on screen
              const portal = document.getElementById('antigravity-tachometer-popover-portal');
              if (portal && portal.classList.contains('open')) {
                portal.innerHTML = renderedPopover;
              }
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

          // Refresh active Git panel host if currently open
          const activeGitHost = document.getElementById('antigravity-git-panel-host');
          const gitTemplate = document.getElementById('antigravity-git-panel-template');
          if (activeGitHost && activeGitHost.style.display !== 'none' && gitTemplate) {
            activeGitHost.innerHTML = gitTemplate.innerHTML;
            if (window.__bindGitPanelEvents) {
              window.__bindGitPanelEvents(activeGitHost);
            }
          }

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
          if (typeof window.__scrapeNativeModelQuota === 'function') {
            window.__scrapeNativeModelQuota();
          }
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
