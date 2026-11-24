// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

import { SlotManager } from './SlotManager.js';
import { StyleIsolator } from '../sdk/StyleIsolator.js';
import { renderPopoverHtml, renderSvgIcon } from '../../mods/context-tachometer/components/PopoverHtml.js';
import { renderModsManagerPanelHtml } from '../../mods/mods-manager/components/ModsManagerHtml.js';
import { getLaneColor, renderGitGraphSvg } from '../../mods/git-graph/components/GitGraphSvg.js';
import { renderPrCiCardHtml } from '../../mods/git-graph/components/PrCiCardHtml.js';
import { renderGitGraphPanelHtml, escapeGitHtml, getExtClass } from '../../mods/git-graph/components/GitGraphPanelHtml.js';
import { renderReticleSvg } from '../../mods/agent-selector/components/AgentIcons.js';
import { formatResetTime, resolveNativeQuotaForModel } from '../services/TelemetryService.js';
import { BASE_MODELS, MODEL_CATALOG, DEFAULT_MODEL_SLOTS, getModelById, renderModelSlotDropdownHtml, renderSubagentModelPill } from '../../mods/model-slots/components/ModelSlotsHtml.js';

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

      if (html && html.trim()) {
        const mountCode = this.slotManager.generateMountCode({
          slotId,
          modId,
          htmlContent: html
        });
        mountSnippets.push(mountCode);
      }
    }

    const cssBundle = combinedStyles.join('\n\n');

    return `
      (() => {
        window.__antigravityMods = window.__antigravityMods || {};
        if (${JSON.stringify(context.repoPath || '')}) {
          window.__antigravityActiveRepoPath = ${JSON.stringify(context.repoPath || '')};
        }

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

        // Native Voice Mode unlock & Developer flags (Antigravity 2.29.0+)
        try {
          if (typeof window !== 'undefined') {
            window.jetski = window.jetski || {};
            window.jetski.developer = window.jetski.developer || {};
            window.jetski.developer.customFlagOverrides = window.jetski.developer.customFlagOverrides || {};
            window.jetski.developer.customFlagOverrides['enable-voice-relay'] = true;
            window.jetski.developer.voiceEngineAddr = '127.0.0.1:8765';
          }
          if (typeof globalThis !== 'undefined') {
            globalThis.jetski = globalThis.jetski || (typeof window !== 'undefined' ? window.jetski : {});
            globalThis.jetski.developer = globalThis.jetski.developer || {};
            globalThis.jetski.developer.customFlagOverrides = globalThis.jetski.developer.customFlagOverrides || {};
            globalThis.jetski.developer.customFlagOverrides['enable-voice-relay'] = true;
            globalThis.jetski.developer.voiceEngineAddr = '127.0.0.1:8765';
          }
        } catch (e) {}

        if (!window.__antigravityVoiceHealthIntercepted && typeof window.fetch === 'function') {
          window.__antigravityVoiceHealthIntercepted = true;
          const originalFetch = window.fetch;
          window.fetch = async function(...args) {
            const url = (args[0] && typeof args[0] === 'string')
              ? args[0]
              : (args[0] && args[0].url ? args[0].url : String(args[0] || ''));
            if (typeof url === 'string' && url.includes('/voice/health')) {
              return new Response(JSON.stringify({ status: 'ok', healthy: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return originalFetch.apply(this, args);
          };
        }

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

        window.__normalizeFileUriToPath = function(uri) {
          if (!uri || typeof uri !== 'string') return '';
          let clean = uri.trim();
          try {
            if (clean.indexOf('file://') === 0) {
              clean = decodeURIComponent(clean.replace(/^file:\\/\\/\\/?/, ''));
            } else if (clean.indexOf('%') !== -1) {
              clean = decodeURIComponent(clean);
            }
            if (/^\\/([a-zA-Z]:)/.test(clean)) {
              clean = clean.slice(1);
            }
          } catch (e) {}
          return clean;
        };

        window.__resolveRepoForCascade = async function(cascadeId) {
          const targetId = cascadeId || (window.__resolveCascadeId ? window.__resolveCascadeId() : null);
          window.__antigravityCascadeRepos = window.__antigravityCascadeRepos || {};
          if (targetId && window.__antigravityCascadeRepos[targetId]) {
            return window.__antigravityCascadeRepos[targetId];
          }
          try {
            if (window.__APP_CONFIG__?.csrfToken) {
              const res = await fetch('/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Connect-Protocol-Version': '1',
                  'x-codeium-csrf-token': window.__APP_CONFIG__.csrfToken
                },
                body: '{}'
              });
              if (res.ok) {
                const data = await res.json();
                const summaries = (data && data.trajectorySummaries) || {};
                Object.keys(summaries).forEach(function(id) {
                  const summary = summaries[id];
                  const ws = (summary && summary.workspaces && summary.workspaces[0]) ||
                             (summary && summary.trajectoryMetadata && summary.trajectoryMetadata.workspaces && summary.trajectoryMetadata.workspaces[0]);
                  const rawUri = (ws && (ws.gitRootAbsoluteUri || ws.workspaceFolderAbsoluteUri)) ||
                                 (summary && summary.trajectoryMetadata && summary.trajectoryMetadata.workspaceUris && summary.trajectoryMetadata.workspaceUris[0]);
                  if (rawUri) {
                    const cleanPath = window.__normalizeFileUriToPath ? window.__normalizeFileUriToPath(rawUri) : rawUri;
                    if (cleanPath) {
                      window.__antigravityCascadeRepos[id] = cleanPath;
                    }
                  }
                });
              }
            }
          } catch (e) {}
          return (targetId && window.__antigravityCascadeRepos[targetId]) || '';
        };

        window.__antigravityFetchSessionVcsOverview = async function() {
          try {
            const cascadeId = window.__resolveCascadeId ? window.__resolveCascadeId() : '';
            const resolved = await window.__resolveRepoForCascade(cascadeId);
            const repoPath = resolved || (window.__antigravityVcsData && window.__antigravityVcsData.repoPath) || window.__antigravityActiveRepoPath || '';
            const url = 'http://127.0.0.1:53912/vcs/overview?cascadeId=' + encodeURIComponent(cascadeId || '') +
              (repoPath ? '&repoPath=' + encodeURIComponent(repoPath) : '');
            const res = await fetch(url);
            if (res.ok) {
              const liveData = await res.json();
              if (liveData && typeof window.__antigravityUpdateVcsData === 'function') {
                window.__antigravityUpdateVcsData(liveData);
              }
              return liveData;
            }
          } catch (e) {}
          return null;
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

            // Sync Caveman toggle state for this cascade
            if (window.__resolveCavemanForCascade) {
              const isCaveman = window.__resolveCavemanForCascade(cascadeId);
              const cavemanToggle = portal.querySelector('#antigravity-caveman-toggle');
              const cavemanPill = portal.querySelector('#antigravity-caveman-pill');
              if (cavemanToggle) cavemanToggle.checked = isCaveman;
              if (cavemanPill) {
                cavemanPill.textContent = isCaveman ? 'FOCUS' : 'EXPLICATIVO';
                cavemanPill.classList.toggle('active', isCaveman);
              }
            }

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

        window.__resolveCavemanForCascade = function(cascadeId) {
          if (window.__antigravityCavemanModes && cascadeId && window.__antigravityCavemanModes[cascadeId] !== undefined) {
            return !!window.__antigravityCavemanModes[cascadeId];
          }
          try {
            const map = JSON.parse(localStorage.getItem('__antigravity_caveman_map') || '{}');
            if (cascadeId && map[cascadeId] !== undefined) {
              return !!map[cascadeId];
            }
            return localStorage.getItem('__antigravity_caveman_mode') === 'true';
          } catch (e) {}
          return false;
        };

        window.__toggleCavemanMode = function(explicitValue, targetEl) {
          const portal = document.getElementById('antigravity-agent-dropdown-portal');
          const currentBadge = (targetEl && targetEl.closest('.antigravity-agent-selector-group')?.querySelector('.antigravity-agent-badge')) ||
            (portal && portal.__currentBadge && portal.__currentBadge.isConnected ? portal.__currentBadge : null) ||
            document.querySelector('.antigravity-agent-badge');
          const cascadeId = (portal && portal.__currentCascadeId) ||
            window.__resolveCascadeId(currentBadge) ||
            null;

          const currentVal = window.__resolveCavemanForCascade(cascadeId);
          const nextVal = (typeof explicitValue === 'boolean') ? explicitValue : !currentVal;

          window.__antigravityCavemanModes = window.__antigravityCavemanModes || {};
          if (cascadeId) {
            window.__antigravityCavemanModes[cascadeId] = nextVal;
          }

          try {
            localStorage.setItem('__antigravity_caveman_mode', nextVal ? 'true' : 'false');
            const map = JSON.parse(localStorage.getItem('__antigravity_caveman_map') || '{}');
            if (cascadeId) {
              map[cascadeId] = nextVal;
              localStorage.setItem('__antigravity_caveman_map', JSON.stringify(map));
            }
          } catch (e) {}

          // Update portal UI elements if open
          if (portal) {
            const toggle = portal.querySelector('#antigravity-caveman-toggle');
            if (toggle) toggle.checked = nextVal;
            const pill = portal.querySelector('#antigravity-caveman-pill');
            if (pill) {
              pill.textContent = nextVal ? 'FOCUS' : 'EXPLICATIVO';
              pill.classList.toggle('active', nextVal);
            }
          }

          // Update exterior reticle triggers across panels
          const reticleSvg = window.__renderReticleSvg ? window.__renderReticleSvg(nextVal, 14) : '';
          const focusTitle = 'Modo Focus (Caveman + ADHD): Concentracion activa y accion inmediata (~70% ahorro de tokens) - Clic para alternar a Explicativo';
          const explicativoTitle = 'Modo Explicativo: Dispersion estandar (detallado y pedagogico) - Clic para alternar a Focus (Caveman + ADHD)';

          document.querySelectorAll('.antigravity-caveman-reticle-trigger').forEach(triggerEl => {
            const parent = triggerEl.parentElement;
            const group = parent ? parent.closest('.antigravity-agent-selector-group') : null;
            const b = group ? group.querySelector('.antigravity-agent-badge') : null;
            const bCascadeId = b ? window.__resolveCascadeId(b) : null;
            if (!cascadeId || !bCascadeId || bCascadeId === cascadeId) {
              triggerEl.classList.toggle('is-focus', nextVal);
              triggerEl.setAttribute('title', nextVal ? focusTitle : explicativoTitle);
              const box = triggerEl.querySelector('.caveman-reticle-box');
              if (box && reticleSvg) {
                box.innerHTML = reticleSvg;
                box.setAttribute('data-focus-state', String(nextVal));
              }
            }
          });

          // Non-blocking sync to local bridge server (active_agents.json)
          try {
            if (cascadeId) {
              fetch('http://127.0.0.1:53912/active-agent/modifier', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  cascadeId: cascadeId,
                  modifiers: { caveman: nextVal, adhd: nextVal }
                })
              }).catch(function() {});
            }
          } catch (e) {}
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
        window.__formatResetTime = ${formatResetTime.toString()};
        window.__resolveNativeQuotaForModel = ${resolveNativeQuotaForModel.toString()};
        window.__renderTachometerPopoverHtml = ${renderPopoverHtml.toString()};
        window.__renderModsManagerPanelHtml = ${renderModsManagerPanelHtml.toString()};
        const renderReticleSvg = ${renderReticleSvg.toString()};
        window.__renderReticleSvg = renderReticleSvg;

        const syncReticleTrigger = (reticleBtn, cascadeId) => {
          if (!reticleBtn) return;
          const isFocus = window.__resolveCavemanForCascade ? window.__resolveCavemanForCascade(cascadeId) : false;
          const focusTitle = 'Modo Focus (Caveman + ADHD): Concentracion activa y accion inmediata (~70% ahorro de tokens) - Clic para alternar a Explicativo';
          const explicativoTitle = 'Modo Explicativo: Dispersion estandar (detallado y pedagogico) - Clic para alternar a Focus (Caveman + ADHD)';
          const nextTitle = isFocus ? focusTitle : explicativoTitle;
          if (reticleBtn.classList.contains('is-focus') !== isFocus) {
            reticleBtn.classList.toggle('is-focus', isFocus);
          }
          if (reticleBtn.getAttribute('title') !== nextTitle) {
            reticleBtn.setAttribute('title', nextTitle);
          }
          const box = reticleBtn.querySelector('.caveman-reticle-box');
          const focusKey = isFocus ? '1' : '0';
          if (box && window.__renderReticleSvg && (!box.firstElementChild || box.getAttribute('data-focus') !== focusKey)) {
            box.innerHTML = window.__renderReticleSvg(isFocus, 14);
            box.setAttribute('data-focus', focusKey);
          }
        };

        const resolveChatboxFooter = (node) => {
          if (!node) return null;
          return node.closest?.('[class*="input-footer"]') ||
            node.closest?.('.flex.items-center.justify-between') ||
            node.parentElement ||
            node;
        };

        const applyCompactToChatboxScope = (scopeEl, explicitWidth) => {
          if (document.hidden || window.innerWidth <= 0 || !scopeEl) return;
          const compactSetting = localStorage.getItem('__antigravity_compact_chatbox_mods');
          const footer = resolveChatboxFooter(scopeEl);
          const rawWidth = typeof explicitWidth === 'number'
            ? explicitWidth
            : (footer ? (footer.offsetWidth || footer.getBoundingClientRect?.().width || 0) : 0);
          const width = rawWidth > 0 ? rawWidth : 0;
          if (compactSetting !== 'true' && compactSetting !== 'false' && width <= 0) return;

          const tach = scopeEl.classList?.contains('antigravity-tachometer-badge')
            ? scopeEl
            : (scopeEl.querySelector?.('.antigravity-tachometer-badge') || scopeEl.parentElement?.querySelector?.('.antigravity-tachometer-badge') || null);
          const agent = scopeEl.classList?.contains('antigravity-agent-badge')
            ? scopeEl
            : (scopeEl.querySelector?.('.antigravity-agent-badge') || scopeEl.parentElement?.querySelector?.('.antigravity-agent-badge') || null);

          const isCurrentlyCompact = Boolean(
            tach?.classList?.contains('compact') ||
            agent?.classList?.contains('compact') ||
            scopeEl.querySelector?.('.antigravity-tachometer-badge.compact')
          );
          const threshold = isCurrentlyCompact ? 590 : 540;
          const isNarrow = (width > 0 && width < threshold) || window.innerWidth < 800;
          const shouldCompact = compactSetting === 'true' ? true : (compactSetting === 'false' ? false : isNarrow);

          const slot = scopeEl.classList?.contains('antigravity-slot-container')
            ? scopeEl
            : (scopeEl.querySelector?.('.antigravity-slot-container') || null);
          if (slot) {
            slot.__lastTachCompact = shouldCompact;
            slot.__lastAgentCompact = shouldCompact;
          }
          if (tach && tach.classList.contains('compact') !== shouldCompact) {
            tach.classList.toggle('compact', shouldCompact);
          }
          if (agent && agent.classList.contains('compact') !== shouldCompact) {
            agent.classList.toggle('compact', shouldCompact);
          }
        };

        window.__BASE_MODELS = ${JSON.stringify(BASE_MODELS)};
        window.__MODEL_CATALOG = ${JSON.stringify(MODEL_CATALOG)};
        window.__DEFAULT_MODEL_SLOTS = ${JSON.stringify(DEFAULT_MODEL_SLOTS)};
        window.__antigravitySubagentSessionSlots = Object.assign(
          window.__antigravitySubagentSessionSlots || {},
          ${JSON.stringify((context.modelSlots && context.modelSlots.sessions) ? context.modelSlots.sessions : {})}
        );
        window.__getModelById = function(modelId, catalog) { const list = catalog || window.__MODEL_CATALOG || []; return list.find(m => m.id === modelId) || list[0]; };
        window.getModelById = window.__getModelById;
        window.__renderModelSlotDropdownHtml = ${renderModelSlotDropdownHtml.toString()};
        window.__renderSubagentModelPill = ${renderSubagentModelPill.toString()};

        window.__getSavedModelSlots = function() {
          try {
            const raw = localStorage.getItem('__antigravity_model_slots');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                return { ...window.__DEFAULT_MODEL_SLOTS, ...parsed };
              }
            }
          } catch (e) {}
          return { ...window.__DEFAULT_MODEL_SLOTS };
        };

        window.__resolveSubagentSessionId = function(el) {
          if (el && typeof el.closest === 'function') {
            const convEl = el.closest('[data-conversation-id]');
            const convId = convEl ? convEl.getAttribute('data-conversation-id') : null;
            if (convId) return convId;

            const cascadeEl = el.closest('[data-cascade-id]');
            const cascadeId = cascadeEl ? cascadeEl.getAttribute('data-cascade-id') : null;
            if (cascadeId) return cascadeId;

            const existingEl = el.closest('[data-subagent-session-id]');
            const existingId = existingEl ? existingEl.getAttribute('data-subagent-session-id') : null;
            if (existingId) return existingId;
          } else if (el && typeof el.getAttribute === 'function') {
            const directConv = el.getAttribute('data-conversation-id');
            if (directConv) return directConv;
            const directCascade = el.getAttribute('data-cascade-id');
            if (directCascade) return directCascade;
            const directSession = el.getAttribute('data-subagent-session-id');
            if (directSession) return directSession;
          }

          const urlPath = (typeof window !== 'undefined' && window.location && window.location.pathname)
            ? window.location.pathname
            : '';
          const pathParts = urlPath.split('/c/');
          const urlPathId = (pathParts.length > 1 && pathParts[1]) ? pathParts[1].split('/')[0].split('?')[0] : null;
          if (urlPathId) return urlPathId;

          const urlSearch = (typeof window !== 'undefined' && window.location && window.location.search)
            ? window.location.search
            : '';
          const searchMatch = urlSearch.match(/[?&](?:conversationId|focused)=([0-9a-zA-Z_-]+)/);
          if (searchMatch && searchMatch[1]) return searchMatch[1];

          if (!el) return null;

          const generatedId = 'subagent-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
          if (typeof el.setAttribute === 'function') {
            const target = (typeof el.closest === 'function' && el.closest('[data-subagent-container], .subagent-container')) || el;
            target.setAttribute('data-subagent-session-id', generatedId);
          }
          return generatedId;
        };

        window.__hasSavedSubagentSessionSlots = function(sessionId) {
          if (!sessionId) return false;
          try {
            const rawMap = localStorage.getItem('__antigravity_subagent_model_slots_map');
            if (rawMap) {
              const map = JSON.parse(rawMap);
              if (map && typeof map === 'object' && map[sessionId] && typeof map[sessionId] === 'object') {
                return true;
              }
            }
          } catch (e) {}
          const serverSessions = window.__antigravitySubagentSessionSlots;
          return Boolean(
            serverSessions &&
            typeof serverSessions === 'object' &&
            serverSessions[sessionId] &&
            typeof serverSessions[sessionId] === 'object'
          );
        };

        window.__getSavedSubagentSessionSlots = function(sessionId) {
          const globalSlots = (typeof window.__getSavedModelSlots === 'function')
            ? window.__getSavedModelSlots()
            : { ...(window.__DEFAULT_MODEL_SLOTS || { planner: 'gemini-4-argon-high', builder: 'gemini-4-hydrogen-high' }) };
          if (!sessionId) {
            return { ...globalSlots };
          }
          try {
            const rawMap = localStorage.getItem('__antigravity_subagent_model_slots_map');
            if (rawMap) {
              const map = JSON.parse(rawMap);
              if (map && typeof map === 'object' && map[sessionId] && typeof map[sessionId] === 'object') {
                return { ...globalSlots, ...map[sessionId] };
              }
            }
          } catch (e) {}
          try {
            const serverSessions = window.__antigravitySubagentSessionSlots;
            if (serverSessions && typeof serverSessions === 'object' && serverSessions[sessionId] && typeof serverSessions[sessionId] === 'object') {
              return { ...globalSlots, ...serverSessions[sessionId] };
            }
          } catch (e) {}
          return { ...globalSlots };
        };

        window.__saveSubagentSessionSlots = function(sessionId, slots) {
          if (!sessionId || !slots || typeof slots !== 'object') return null;
          const globalSlots = (typeof window.__getSavedModelSlots === 'function')
            ? window.__getSavedModelSlots()
            : { ...(window.__DEFAULT_MODEL_SLOTS || { planner: 'gemini-4-argon-high', builder: 'gemini-4-hydrogen-high' }) };

          let map = {};
          try {
            const rawMap = localStorage.getItem('__antigravity_subagent_model_slots_map');
            if (rawMap) {
              const parsed = JSON.parse(rawMap);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                map = parsed;
              }
            }
          } catch (e) {}

          const existing = (map[sessionId] && typeof map[sessionId] === 'object')
            ? map[sessionId]
            : ((window.__antigravitySubagentSessionSlots && window.__antigravitySubagentSessionSlots[sessionId]) || {});

          const nextSession = {
            ...existing,
            ...slots,
            planner: slots.planner || existing.planner || globalSlots.planner,
            builder: slots.builder || existing.builder || globalSlots.builder,
            updatedAt: Date.now()
          };

          map[sessionId] = nextSession;
          window.__antigravitySubagentSessionSlots = window.__antigravitySubagentSessionSlots || {};
          window.__antigravitySubagentSessionSlots[sessionId] = nextSession;

          try {
            localStorage.setItem('__antigravity_subagent_model_slots_map', JSON.stringify(map));
          } catch (e) {}

          try {
            if (typeof fetch === 'function') {
              fetch('http://127.0.0.1:53912/subagent-model-slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: sessionId,
                  slots: nextSession
                })
              }).catch(function() {});
            }
          } catch (e) {}

          return nextSession;
        };

        window.__isElementVisible = function(el) {
          if (!el) return false;
          let cur = el;
          while (cur && cur.nodeType === 1) {
            if (cur.hasAttribute && cur.hasAttribute('hidden')) return false;
            if (cur.style && (cur.style.display === 'none' || cur.style.visibility === 'hidden')) return false;
            if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
              try {
                const cs = window.getComputedStyle(cur);
                if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
              } catch (e) {}
            }
            cur = cur.parentElement;
          }
          return true;
        };

        window.__getSubagentBadges = function() {
          let candidates = [];
          try {
            candidates = Array.from(document.querySelectorAll('div[title="Subagent"], .text-secondary-foreground:has(> span)'));
          } catch (e) {
            candidates = Array.from(document.querySelectorAll('div[title="Subagent"], .text-secondary-foreground'));
          }
          return candidates.filter(badge =>
            Array.from(badge.querySelectorAll('span')).some(s => s.textContent.trim() === 'self')
          );
        };

        window.__findActiveSubagentSession = function() {
          const badges = window.__getSubagentBadges ? window.__getSubagentBadges() : [];
          const visibleBadges = badges.filter(b => window.__isElementVisible(b));
          const activeEl = (typeof document !== 'undefined') ? document.activeElement : null;

          if (visibleBadges.length > 0) {
            if (activeEl && activeEl !== document.body && activeEl !== document.documentElement) {
              for (const badge of visibleBadges) {
                const container = (badge.closest && badge.closest('[data-conversation-id], [data-cascade-id], [data-subagent-session-id], [data-subagent-container]')) || badge.parentElement;
                if (container && (container === activeEl || (typeof container.contains === 'function' && container.contains(activeEl)))) {
                  return { badge, sessionId: window.__resolveSubagentSessionId(badge) };
                }
              }
            }
            const selectedBadge = visibleBadges[visibleBadges.length - 1];
            return { badge: selectedBadge, sessionId: window.__resolveSubagentSessionId(selectedBadge) };
          }

          if (activeEl && activeEl !== document.body && activeEl !== document.documentElement && typeof activeEl.closest === 'function') {
            const focusedSub = activeEl.closest('[data-subagent-session-id], [data-subagent-container]');
            if (focusedSub && window.__isElementVisible(focusedSub)) {
              return { badge: focusedSub, sessionId: window.__resolveSubagentSessionId(focusedSub) };
            }
          }

          return null;
        };

        window.__getActiveMenubarSlotModels = function() {
          const globalSlots = window.__getSavedModelSlots();
          const activeSubagent = (typeof window.__findActiveSubagentSession === 'function')
            ? window.__findActiveSubagentSession()
            : null;
          if (activeSubagent && activeSubagent.sessionId && typeof window.__getSavedSubagentSessionSlots === 'function') {
            const sessionSlots = window.__getSavedSubagentSessionSlots(activeSubagent.sessionId);
            return {
              ...globalSlots,
              builder: sessionSlots.builder || globalSlots.builder,
              activeSessionId: activeSubagent.sessionId
            };
          }
          return { ...globalSlots, activeSessionId: null };
        };

        window.__updateMenubarSlotButtons = function(slots) {
          const effectiveSlots = slots || window.__getActiveMenubarSlotModels();
          ['planner', 'builder'].forEach(role => {
            const modelId = effectiveSlots[role];
            const model = window.__getModelById ? window.__getModelById(modelId) : null;
            if (!model) return;
            document.querySelectorAll('.antigravity-model-slot-btn[data-slot-role="' + role + '"]').forEach(btn => {
              const expectedSessionId = (role === 'builder' && effectiveSlots.activeSessionId)
                ? effectiveSlots.activeSessionId
                : '';
              const expectedTitle = (role === 'planner' ? 'Planner Model: ' : 'Builder Model: ') + model.name;
              const expectedVal = model.shortName || model.name;
              const valEl = btn.querySelector('.model-slot-value');
              const dotEl = btn.querySelector('.model-slot-dot');

              const isUnchanged = (
                (btn.getAttribute('data-model-id') || '') === model.id &&
                (btn.getAttribute('data-session-id') || '') === expectedSessionId &&
                (btn.getAttribute('title') || '') === expectedTitle &&
                (!valEl || valEl.textContent === expectedVal)
              );
              if (isUnchanged) return;

              btn.setAttribute('data-model-id', model.id);
              if (expectedSessionId) {
                btn.setAttribute('data-session-id', expectedSessionId);
              } else if (btn.hasAttribute('data-session-id')) {
                btn.removeAttribute('data-session-id');
              }
              btn.setAttribute('title', expectedTitle);
              if (valEl && valEl.textContent !== expectedVal) {
                valEl.textContent = expectedVal;
              }
              if (dotEl) {
                dotEl.style.background = model.color;
                dotEl.style.boxShadow = '0 0 6px ' + model.color;
              }
            });
          });
        };

        window.__syncSubagentModelBadges = function() {
          const badges = window.__getSubagentBadges ? window.__getSubagentBadges() : [];

          badges.forEach(badge => {
            const selfSpan = Array.from(badge.querySelectorAll('span')).find(s => s.textContent.trim() === 'self');
            if (!selfSpan) return;

            const sessionId = window.__resolveSubagentSessionId(badge);
            const hasSaved = window.__hasSavedSubagentSessionSlots ? window.__hasSavedSubagentSessionSlots(sessionId) : false;
            const sessionSlots = window.__getSavedSubagentSessionSlots(sessionId);

            if (sessionId && !hasSaved && typeof window.__saveSubagentSessionSlots === 'function') {
              window.__saveSubagentSessionSlots(sessionId, {
                planner: sessionSlots.planner,
                builder: sessionSlots.builder
              });
            }

            const builderModelId = sessionSlots.builder || 'gemini-4-hydrogen-high';
            const model = (typeof window.__getModelById === 'function')
              ? window.__getModelById(builderModelId)
              : { id: builderModelId, name: builderModelId, shortName: builderModelId, color: '#34d399' };

            let pill = badge.querySelector('#antigravity-subagent-model-pill');
            if (!pill) {
              pill = badge.querySelector('.antigravity-subagent-model-pill');
            }

            if (pill) {
              const expectedSessionId = sessionId || '';
              const currentModelId = pill.getAttribute('data-model-id') || '';
              const currentSessionId = pill.getAttribute('data-session-id') || '';
              const expectedTitle = 'Subagent Builder Model: ' + model.name;
              const currentTitle = pill.getAttribute('title') || '';
              const label = pill.querySelector('.subagent-model-label');
              const isUnchanged = (
                currentModelId === model.id &&
                currentSessionId === expectedSessionId &&
                currentTitle === expectedTitle &&
                (!label || label.textContent === model.shortName)
              );
              if (!isUnchanged) {
                pill.setAttribute('data-model-id', model.id);
                if (sessionId) {
                  pill.setAttribute('data-session-id', sessionId);
                } else if (pill.hasAttribute('data-session-id')) {
                  pill.removeAttribute('data-session-id');
                }
                pill.setAttribute('title', expectedTitle);
                pill.style.borderColor = model.color + '55';
                pill.style.background = model.color + '18';
                pill.style.color = model.color;
                const dot = pill.querySelector('.subagent-model-dot');
                if (dot) {
                  dot.style.background = model.color;
                  dot.style.boxShadow = '0 0 5px ' + model.color;
                }
                if (label) {
                  label.textContent = model.shortName;
                }
              }
            } else if (typeof window.__renderSubagentModelPill === 'function') {
              const temp = document.createElement('div');
              temp.innerHTML = window.__renderSubagentModelPill(builderModelId, window.__MODEL_CATALOG);
              const newPill = temp.firstElementChild;
              if (newPill) {
                if (sessionId) {
                  newPill.setAttribute('data-session-id', sessionId);
                }
                selfSpan.after(newPill);
              }
            }
          });

          if (typeof window.__updateMenubarSlotButtons === 'function') {
            window.__updateMenubarSlotButtons(window.__getActiveMenubarSlotModels());
          }
        };

        window.__syncModelSlotsUI = function() {
          if (typeof window.__updateMenubarSlotButtons === 'function') {
            window.__updateMenubarSlotButtons(window.__getActiveMenubarSlotModels());
          }
          if (typeof window.__syncSubagentModelBadges === 'function') {
            window.__syncSubagentModelBadges();
          }
        };

        window.__resolveNativeModelTarget = function(modelId) {
          if (!modelId || typeof modelId !== 'string') return null;
          const resolved = (typeof window.__getModelById === 'function')
            ? window.__getModelById(modelId)
            : null;
          const effectiveId = (resolved && resolved.id === modelId) ? resolved.id : modelId;

          if (effectiveId === 'gemini-pro-orchestrator-g1-pro') {
            return { base: 'Orchestrator', effort: null };
          }
          if (effectiveId.startsWith('gpt-oss-120b-')) {
            return { base: 'GPT-OSS 120B', effort: null };
          }

          const basePrefixes = [
            { prefix: 'gemini-4-argon-', base: 'Gemini 4 Argon' },
            { prefix: 'gemini-4-hydrogen-', base: 'Gemini 4 Hydrogen' },
            { prefix: 'gemini-3.8-flash-', base: 'Gemini 3.8 Flash' },
            { prefix: 'claude-opus-5-5-', base: 'Claude Opus 5.5' },
            { prefix: 'claude-sonnet-5-5-', base: 'Claude Sonnet 5.5' }
          ];

          const effortLabels = {
            low: 'Low',
            medium: 'Medium',
            high: 'High',
            xhigh: 'XHigh'
          };

          for (const entry of basePrefixes) {
            if (effectiveId.startsWith(entry.prefix)) {
              const rawEffort = effectiveId.slice(entry.prefix.length).toLowerCase();
              return {
                base: entry.base,
                effort: effortLabels[rawEffort] || null
              };
            }
          }
          return null;
        };

        window.__resolveModelIdFromNativeText = function(rawText) {
          if (!rawText || typeof rawText !== 'string') return null;
          const text = rawText.trim().toLowerCase();
          if (!text) return null;

          if (text.includes('orchestrator')) return 'gemini-pro-orchestrator-g1-pro';
          if (text.includes('gpt-oss') || text.includes('120b')) return 'gpt-oss-120b-medium';

          let basePrefix = null;
          if (text.includes('argon')) basePrefix = 'gemini-4-argon-';
          else if (text.includes('hydrogen')) basePrefix = 'gemini-4-hydrogen-';
          else if (text.includes('3.8') && text.includes('flash')) basePrefix = 'gemini-3.8-flash-';
          else if (text.includes('opus')) basePrefix = 'claude-opus-5-5-';
          else if (text.includes('sonnet')) basePrefix = 'claude-sonnet-5-5-';

          if (!basePrefix) return null;

          let effort = null;
          if (/(?:^|[^a-z])xhigh(?:$|[^a-z])/i.test(text)) effort = 'xhigh';
          else if (/(?:^|[^a-z])high(?:$|[^a-z])/i.test(text)) effort = 'high';
          else if (/(?:^|[^a-z])(?:medium|med)(?:$|[^a-z])/i.test(text)) effort = 'medium';
          else if (/(?:^|[^a-z])low(?:$|[^a-z])/i.test(text)) effort = 'low';

          if (!effort) {
            const saved = (typeof window.__getSavedModelSlots === 'function') ? window.__getSavedModelSlots() : null;
            if (saved && saved.planner && saved.planner.startsWith(basePrefix)) {
              effort = saved.planner.slice(basePrefix.length);
            } else {
              effort = 'high';
            }
          }

          const candidateId = basePrefix + effort;
          const catalog = window.__MODEL_CATALOG || [];
          const found = catalog.find(m => m.id === candidateId);
          return found ? found.id : null;
        };

        window.__nativeModelSyncTimers = window.__nativeModelSyncTimers || [];
        window.__nativeModelSyncInProgress = false;
        window.__nativeModelSyncToken = window.__nativeModelSyncToken || 0;

        window.__syncNativeModelSelector = function(modelId) {
          if (!modelId) return false;
          const resolved = (typeof window.__getModelById === 'function')
            ? window.__getModelById(modelId)
            : null;
          const targetId = (resolved && resolved.id === modelId) ? resolved.id : modelId;
          const target = window.__resolveNativeModelTarget ? window.__resolveNativeModelTarget(targetId) : null;
          if (!target) return false;

          const triggers = Array.from(document.querySelectorAll('button[data-testid="model-selector-trigger"]'));
          const activeTrigger = triggers[triggers.length - 1] || triggers[0] || document.querySelector('button[data-testid="model-selector-trigger"]');
          if (!activeTrigger) return false;

          const matchesEffortText = (text, effort) => {
            if (!effort) return true;
            const escaped = effort.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&').replace(/[{}]/g, '\\\\$&');
            return new RegExp('(?:^|[^a-zA-Z])' + escaped + '(?:$|[^a-zA-Z])', 'i').test(text);
          };

          const currentText = (activeTrigger.textContent || '').trim();
          const hasBase = currentText.toLowerCase().includes(target.base.toLowerCase());
          const hasEffort = target.effort ? matchesEffortText(currentText, target.effort) : true;
          if (hasBase && hasEffort) {
            return true;
          }

          if (Array.isArray(window.__nativeModelSyncTimers)) {
            while (window.__nativeModelSyncTimers.length > 0) {
              clearTimeout(window.__nativeModelSyncTimers.pop());
            }
          }
          const token = ++window.__nativeModelSyncToken;
          window.__nativeModelSyncInProgress = true;

          const finishSync = () => {
            if (window.__nativeModelSyncToken === token) {
              const settleTimer = setTimeout(() => {
                if (window.__nativeModelSyncToken === token) {
                  window.__nativeModelSyncInProgress = false;
                }
              }, 120);
              window.__nativeModelSyncTimers.push(settleTimer);
            }
          };

          if (typeof activeTrigger.click === 'function') {
            activeTrigger.click();
          }

          const t1 = setTimeout(() => {
            if (window.__nativeModelSyncToken !== token) return;
            const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [data-testid="model-selector-item"]'));
            const baseRow = menuItems.find(el => {
              const text = (el.textContent || '').trim().toLowerCase();
              const label = (el.getAttribute && (el.getAttribute('data-model-label') || '')).trim().toLowerCase();
              const needle = target.base.toLowerCase();
              return text.includes(needle) || label.includes(needle);
            });

            if (!baseRow) {
              window.__nativeModelSyncInProgress = false;
              return;
            }

            if (!target.effort) {
              if (typeof baseRow.click === 'function') {
                baseRow.click();
              }
              finishSync();
              return;
            }

            try {
              if (typeof baseRow.dispatchEvent === 'function' && typeof MouseEvent === 'function') {
                baseRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
              }
            } catch (e) {}
            if (typeof baseRow.click === 'function') {
              baseRow.click();
            }

            const t2 = setTimeout(() => {
              if (window.__nativeModelSyncToken !== token) return;
              const subItems = Array.from(document.querySelectorAll('[role="menuitem"], [data-testid="model-selector-item"]'));
              const effortNeedle = target.effort.toLowerCase();
              const candidates = subItems.filter(el => el !== baseRow);
              const effortItem = candidates.find(el => (el.textContent || '').trim().toLowerCase() === effortNeedle)
                || candidates.find(el => matchesEffortText((el.textContent || '').trim(), target.effort))
                || subItems.find(el => (el.textContent || '').trim().toLowerCase() === effortNeedle)
                || subItems.find(el => matchesEffortText((el.textContent || '').trim(), target.effort));

              if (effortItem && typeof effortItem.click === 'function') {
                effortItem.click();
              }
              finishSync();
            }, 100);
            window.__nativeModelSyncTimers.push(t2);
          }, 80);
          window.__nativeModelSyncTimers.push(t1);
          return true;
        };

        window.__syncPlannerFromNativeSelector = function() {
          if (window.__nativeModelSyncInProgress) return false;
          const triggers = Array.from(document.querySelectorAll('button[data-testid="model-selector-trigger"]'));
          const activeTrigger = triggers[triggers.length - 1] || triggers[0] || document.querySelector('button[data-testid="model-selector-trigger"]');
          if (!activeTrigger) return false;

          const detectedId = window.__resolveModelIdFromNativeText
            ? window.__resolveModelIdFromNativeText(activeTrigger.textContent || '')
            : null;
          if (!detectedId) return false;

          const current = (typeof window.__getSavedModelSlots === 'function')
            ? window.__getSavedModelSlots()
            : { ...(window.__DEFAULT_MODEL_SLOTS || { planner: 'gemini-4-argon-high', builder: 'gemini-4-hydrogen-high' }) };

          const plannerBtns = Array.from(document.querySelectorAll('.antigravity-model-slot-btn[data-slot-role="planner"]'));
          const btnAlreadySynced = plannerBtns.length > 0 && plannerBtns.every(btn => btn.getAttribute('data-model-id') === detectedId);
          if (current.planner === detectedId && btnAlreadySynced) {
            return false;
          }

          current.planner = detectedId;
          current.updatedAt = Date.now();
          try {
            localStorage.setItem('__antigravity_model_slots', JSON.stringify(current));
          } catch (e) {}

          if (typeof window.__updateMenubarSlotButtons === 'function') {
            window.__updateMenubarSlotButtons(
              typeof window.__getActiveMenubarSlotModels === 'function'
                ? window.__getActiveMenubarSlotModels()
                : current
            );
          }

          try {
            if (typeof fetch === 'function') {
              fetch('http://127.0.0.1:53912/model-slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  planner: current.planner,
                  builder: current.builder,
                  enabled: current.enabled !== false
                })
              }).catch(function() {});
            }
          } catch (e) {}

          return true;
        };

        window.__observedNativeTriggerSet = new WeakSet();
        window.__observedNativeTriggersCount = 0;

        window.__observeNativeModelSelector = function() {
          if (typeof MutationObserver !== 'function') return;
          const triggers = Array.from(document.querySelectorAll('button[data-testid="model-selector-trigger"]'));
          if (!triggers.length) {
            const single = document.querySelector('button[data-testid="model-selector-trigger"]');
            if (single) triggers.push(single);
          }
          if (!triggers.length) return;

          if (
            window.__antigravityNativeModelObserver &&
            window.__observedNativeTriggerSet &&
            window.__observedNativeTriggersCount === triggers.length &&
            triggers.every(trigger => window.__observedNativeTriggerSet.has(trigger))
          ) {
            return;
          }

          if (window.__antigravityNativeModelObserver) {
            window.__antigravityNativeModelObserver.disconnect();
          }
          window.__antigravityNativeModelObserver = new MutationObserver(() => {
            if (typeof window.__syncPlannerFromNativeSelector === 'function') {
              window.__syncPlannerFromNativeSelector();
            }
          });
          const nextSet = new WeakSet();
          triggers.forEach(trigger => {
            nextSet.add(trigger);
            window.__antigravityNativeModelObserver.observe(trigger, {
              childList: true,
              subtree: true,
              characterData: true
            });
          });
          window.__observedNativeTriggerSet = nextSet;
          window.__observedNativeTriggersCount = triggers.length;
        };

        window.__selectModelForSlot = function(role, modelId) {
          if (!role || !modelId) return;
          const current = window.__getSavedModelSlots();
          current[role] = modelId;
          current.updatedAt = Date.now();
          try {
            localStorage.setItem('__antigravity_model_slots', JSON.stringify(current));
          } catch (e) {}

          const activeSubagent = (typeof window.__findActiveSubagentSession === 'function')
            ? window.__findActiveSubagentSession()
            : null;
          if (activeSubagent && activeSubagent.sessionId && typeof window.__saveSubagentSessionSlots === 'function') {
            window.__saveSubagentSessionSlots(activeSubagent.sessionId, { [role]: modelId });
          }

          if (typeof window.__updateMenubarSlotButtons === 'function') {
            window.__updateMenubarSlotButtons(window.__getActiveMenubarSlotModels());
          }
          document.querySelectorAll('.antigravity-model-slot-btn[data-slot-role="' + role + '"]').forEach(btn => {
            btn.classList.remove('open');
          });

          const portal = document.getElementById('antigravity-model-slot-dropdown-portal');
          if (portal) {
            portal.classList.remove('open');
            portal.__currentBtn = null;
          }

          if (typeof window.__syncSubagentModelBadges === 'function') {
            window.__syncSubagentModelBadges();
          }

          if (role === 'planner' && typeof window.__syncNativeModelSelector === 'function') {
            window.__syncNativeModelSelector(modelId);
          }

          try {
            if (typeof fetch === 'function') {
              fetch('http://127.0.0.1:53912/model-slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  planner: current.planner,
                  builder: current.builder,
                  enabled: current.enabled !== false
                })
              }).catch(function() {});
            }
          } catch (e) {}
        };

        window.__toggleModelSlotDropdown = function(e, btnEl, role) {
          if (e) {
            e.stopPropagation();
            e.preventDefault();
          }
          const btn = btnEl || (e ? e.currentTarget : null);
          if (!btn) return;
          const slotRole = role || btn.getAttribute('data-slot-role') || 'planner';

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

          const mPortal = document.getElementById('antigravity-mods-manager-portal');
          if (mPortal) {
            mPortal.classList.remove('open');
            mPortal.__currentBtn = null;
          }
          document.querySelectorAll('.antigravity-mods-manager-btn.open').forEach(b => b.classList.remove('open'));

          let portal = document.getElementById('antigravity-model-slot-dropdown-portal');
          if (!portal) {
            portal = document.createElement('div');
            portal.id = 'antigravity-model-slot-dropdown-portal';
            portal.className = 'antigravity-model-slot-dropdown-portal';
            document.body.appendChild(portal);
          }

          const isCurrentOpen = portal.classList.contains('open') && portal.__currentBtn === btn;

          document.querySelectorAll('.antigravity-model-slot-btn.open').forEach(b => b.classList.remove('open'));
          portal.classList.remove('open');
          portal.__currentBtn = null;

          if (!isCurrentOpen) {
            btn.classList.add('open');
            portal.__currentBtn = btn;

            const savedSlots = (typeof window.__getActiveMenubarSlotModels === 'function')
              ? window.__getActiveMenubarSlotModels()
              : window.__getSavedModelSlots();
            const currentSelectedId = savedSlots[slotRole] || btn.getAttribute('data-model-id');

            if (window.__renderModelSlotDropdownHtml) {
              portal.innerHTML = window.__renderModelSlotDropdownHtml(slotRole, currentSelectedId, window.__BASE_MODELS || window.__MODEL_CATALOG);
            }

            portal.querySelectorAll('.model-effort-option, .model-slot-option').forEach(opt => {
              opt.onclick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                const mId = opt.getAttribute('data-model-id');
                const sRole = opt.getAttribute('data-slot-role') || slotRole;
                window.__selectModelForSlot(sRole, mId);
              };
            });

            portal.querySelectorAll('.model-slot-row').forEach(row => {
              row.onclick = (ev) => {
                if (ev.target.closest('.model-effort-option, .model-slot-option')) return;
                const singleEffortId = row.getAttribute('data-model-id');
                if (singleEffortId) {
                  ev.stopPropagation();
                  ev.preventDefault();
                  const sRole = row.getAttribute('data-slot-role') || slotRole;
                  window.__selectModelForSlot(sRole, singleEffortId);
                  return;
                }
                const isOpen = row.classList.contains('open');
                portal.querySelectorAll('.model-slot-row.open').forEach(r => r.classList.remove('open'));
                if (!isOpen) {
                  row.classList.add('open');
                }
              };
            });

            const rect = btn.getBoundingClientRect();
            portal.style.top = (rect.bottom + 6) + 'px';
            const portalWidth = 250;
            const clampedLeft = Math.max(10, Math.min(window.innerWidth - portalWidth - 10, rect.left));
            portal.style.left = clampedLeft + 'px';
            portal.classList.add('open');

            if (rect.left + 380 > window.innerWidth) {
              portal.querySelectorAll('.model-slot-submenu').forEach(sub => {
                sub.classList.add('submenu-left');
              });
            }
          }
        };

        window.__applyChatboxModsCompact = function() {
          if (document.hidden || window.innerWidth <= 0) return;
          const chatboxSlots = document.querySelectorAll('#antigravity-slot-header-actions, .antigravity-slot-header-actions');
          if (chatboxSlots.length) {
            chatboxSlots.forEach(slot => applyCompactToChatboxScope(slot));
            return;
          }
          document.querySelectorAll('.antigravity-tachometer-badge').forEach(el => applyCompactToChatboxScope(el));
          document.querySelectorAll('.antigravity-agent-badge').forEach(el => applyCompactToChatboxScope(el));
        };

        window.__dockNativeVoiceToast = function(rootDoc) {
          const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
          if (!doc) return null;

          const EXCLUDED_IDS = [
            'antigravity-git-panel-host',
            'antigravity-agent-dropdown-portal',
            'antigravity-tachometer-popover-portal',
            'antigravity-mods-manager-portal'
          ];

          const isExcludedContainer = (el) => {
            if (!el) return true;
            for (const exId of EXCLUDED_IDS) {
              if (el.id === exId) return true;
              if (el.closest && el.closest('#' + exId)) return true;
            }
            if (el.matches && el.matches('[role="dialog"]:not([data-testid*="voice"]):not([class*="voice"])')) return true;
            return false;
          };

          const getAttr = (el, name) => (el && typeof el.getAttribute === 'function' ? (el.getAttribute(name) || '') : '');
          const setAttrIfMissing = (el, name, value) => {
            if (el && typeof el.setAttribute === 'function' && !getAttr(el, name)) {
              el.setAttribute(name, value);
            }
          };

          const hasAudioControls = (el) => {
            if (!el || typeof el.querySelector !== 'function') return false;
            return Boolean(el.querySelector(
              'button[aria-label*="mic" i], button[aria-label*="mute" i], button[aria-label*="audio" i], ' +
              'button[aria-label*="speaker" i], button[aria-label*="speed" i], [data-testid*="mic"], ' +
              '[data-testid*="mute"], [data-testid*="audio"], [data-testid="voice-call-speed"], ' +
              '[data-testid="voice-speed-button"], [data-voice-control], button[title*="Mute" i], button[title*="Audio" i]'
            ));
          };

          const resolveVoiceVariant = (el) => {
            const tid = getAttr(el, 'data-testid').toLowerCase();
            if (tid === 'voice-teleprompter-slot' || (el.querySelector && el.querySelector('[data-testid="live-docked"]'))) {
              return 'teleprompter';
            }
            if (tid === 'voice-dock') return 'dock';
            if (tid === 'voice-pill') return 'pill';
            return 'generic';
          };

          const candidateButtons = Array.from(doc.querySelectorAll('button'));
          let targetBar = null;

          for (const btn of candidateButtons) {
            if (isExcludedContainer(btn)) continue;

            const text = (btn.textContent || '').trim().toLowerCase();
            const label = getAttr(btn, 'aria-label').toLowerCase();
            const testid = getAttr(btn, 'data-testid').toLowerCase();

            const isEndBtn =
              text === 'end' || text === 'end call' || text === 'terminar' || text === 'finalizar' ||
              label.includes('end call') || label === 'end' || label.includes('end voice') || label.includes('end live') ||
              label.includes('terminar llamada') || label.includes('finalizar llamada') ||
              testid.includes('voice-end') || testid.includes('call-end') ||
              testid === 'voice-dock-end' || testid === 'voice-call-end' || testid === 'voice-end-button';

            if (!isEndBtn) continue;

            let curr = btn.parentElement;
            let bestMatch = null;

            while (curr && curr !== doc.body && curr !== doc.documentElement) {
              if (isExcludedContainer(curr)) break;

              const currTestId = getAttr(curr, 'data-testid').toLowerCase();
              const isNativeVoiceShell =
                currTestId === 'voice-teleprompter-slot' ||
                currTestId === 'voice-dock' ||
                currTestId === 'live-docked' ||
                currTestId === 'voice-pill';

              if (!isNativeVoiceShell && curr.querySelector && curr.querySelector('textarea, [contenteditable="true"], .antigravity-slot-chat-input-actions')) {
                break;
              }

              if (hasAudioControls(curr)) {
                bestMatch = curr;
              }

              // Stop climbing once we capture the complete outer Voice HUD wrapper (which keeps mic warnings & drawers grouped).
              if (currTestId === 'voice-teleprompter-slot' || currTestId === 'voice-dock') {
                break;
              }

              curr = curr.parentElement;
            }

            if (bestMatch) {
              targetBar = bestMatch;
              break;
            }
          }

          if (!targetBar) {
            const directBar = doc.querySelector && doc.querySelector(
              '[data-testid="voice-teleprompter-slot"], [data-testid="voice-dock"], ' +
              '.antigravity-voice-toast, [data-testid*="voice-call-bar"], [data-testid*="voice-toast"], [data-voice-call-bar]'
            );
            if (directBar && !isExcludedContainer(directBar)) {
              targetBar = directBar;
            }
          }

          if (!targetBar) return null;

          if (!targetBar.classList.contains('antigravity-voice-toast-docked')) {
            targetBar.classList.add('antigravity-voice-toast-docked');
            targetBar.setAttribute('data-antigravity-voice-docked', 'true');
          }

          // Annotate semantic HTML5 boxes-inside-boxes attributes cleanly without detaching React nodes.
          const variant = resolveVoiceVariant(targetBar);
          targetBar.setAttribute('data-voice-hud-box', 'viewport-anchor');
          targetBar.setAttribute('data-voice-hud-variant', variant);
          setAttrIfMissing(targetBar, 'role', 'region');
          setAttrIfMissing(targetBar, 'aria-label', 'Voice mode HUD');

          if (targetBar.querySelector) {
            const surfaceEl = targetBar.querySelector('[data-testid="live-docked"]');
            if (surfaceEl && surfaceEl !== targetBar) {
              surfaceEl.setAttribute('data-voice-hud-box', 'surface');
            }
            const controlsEl = targetBar.querySelector('[data-testid="voice-call-controls"]');
            if (controlsEl) {
              controlsEl.setAttribute('data-voice-hud-box', 'header');
            }
            const drawerEl = targetBar.querySelector('[data-testid="live-docked-replies"], [data-testid="voice-dock-composer"]');
            if (drawerEl) {
              drawerEl.setAttribute('data-voice-hud-box', 'drawer');
              drawerEl.setAttribute('data-voice-hud-placement', 'below');
            }
          }

          if (targetBar.querySelectorAll) {
            const alertEls = targetBar.querySelectorAll('[data-testid="voice-mic-warning"], [data-testid="voice-mic-switched"], [data-testid="voice-error-tip"]');
            for (const alertEl of alertEls) {
              if (alertEl && alertEl.setAttribute) {
                alertEl.setAttribute('data-voice-hud-box', 'alert');
                alertEl.setAttribute('data-voice-hud-placement', 'below');
              }
            }
          }

          // Compute live Top HUD vertical clearance below the 35px menubar if present.
          const menuBar = doc.querySelector && doc.querySelector('[data-testid="title-menu-bar"]');
          let hudTopPx = 4;
          if (menuBar && typeof menuBar.getBoundingClientRect === 'function') {
            const mbRect = menuBar.getBoundingClientRect();
            if (mbRect && mbRect.height > 0 && mbRect.bottom > 0 && mbRect.bottom < 80) {
              hudTopPx = Math.round(mbRect.bottom + 4);
            }
          }
          if (targetBar.style && typeof targetBar.style.setProperty === 'function') {
            targetBar.style.setProperty('--agy-voice-hud-top', hudTopPx + 'px');
          }

          const collapseBtn = targetBar.querySelector && targetBar.querySelector(
            'button[aria-label*="collapse" i], button[aria-label*="minim" i], .collapse-btn, ' +
            '[data-testid*="collapse"], [data-testid*="minim"], [data-mod-action="collapse-voice"]'
          );
          let isMinimized = false;
          if (collapseBtn) {
            const expanded = collapseBtn.getAttribute('aria-expanded');
            if (expanded === 'false') {
              isMinimized = true;
            } else if (expanded === 'true') {
              isMinimized = false;
            } else {
              isMinimized = collapseBtn.classList.contains('collapsed') || targetBar.classList.contains('minimized');
            }
          } else {
            isMinimized = targetBar.classList.contains('minimized');
          }

          if (isMinimized) {
            targetBar.classList.add('is-minimized');
            targetBar.setAttribute('data-minimized', 'true');
          } else {
            targetBar.classList.remove('is-minimized');
            targetBar.removeAttribute('data-minimized');
          }

          if (collapseBtn && !collapseBtn.__collapseSyncBound) {
            collapseBtn.__collapseSyncBound = true;
            collapseBtn.addEventListener('click', () => {
              setTimeout(() => {
                if (typeof window.__dockNativeVoiceToast === 'function') {
                  window.__dockNativeVoiceToast(doc);
                }
              }, 40);
            });
          }

          // Keep portaled speed slider & mic switcher popovers onscreen below Top HUD if BaseUI opens them upward.
          if (targetBar.querySelectorAll && typeof targetBar.getBoundingClientRect === 'function') {
            const popoverTriggers = targetBar.querySelectorAll(
              '[data-testid="voice-call-speed"], [data-testid="voice-speed-button"], [data-testid="voice-mic-warning-switch"]'
            );
            for (const triggerEl of popoverTriggers) {
              if (!triggerEl || triggerEl.__agyHudPopoverBound || typeof triggerEl.addEventListener !== 'function') continue;
              triggerEl.__agyHudPopoverBound = true;
              triggerEl.addEventListener('click', () => {
                setTimeout(() => {
                  const popEl = doc.querySelector && (
                    doc.querySelector('[data-testid="voice-speed-panel"]') ||
                    doc.querySelector('[data-popover-popup]')
                  );
                  const popupBox = popEl && popEl.closest ? (popEl.closest('[data-popover-popup]') || popEl) : popEl;
                  const positioner = popupBox && popupBox.parentElement ? popupBox.parentElement : popupBox;
                  if (positioner && typeof positioner.getBoundingClientRect === 'function' && positioner.style) {
                    const barRect = targetBar.getBoundingClientRect();
                    const posRect = positioner.getBoundingClientRect();
                    if (posRect && barRect && posRect.top < Math.max(4, barRect.bottom + 4)) {
                      positioner.style.top = Math.round(barRect.bottom + 8) + 'px';
                      positioner.style.bottom = 'auto';
                      positioner.style.zIndex = '10020';
                    }
                  }
                }, 24);
              });
            }
          }

          return targetBar;
        };

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
          if (!gitGraphEnabled && typeof window.__closeGitGraphPanel === 'function') {
            window.__closeGitGraphPanel();
          }
          const modelSlotsEnabled = localStorage.getItem('__antigravity_mod_enabled_model-slots') !== 'false';
          document.querySelectorAll('.antigravity-model-slots-group').forEach(b => {
            b.style.display = modelSlotsEnabled ? 'inline-flex' : 'none';
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

            const compactChatboxEnabled = localStorage.getItem('__antigravity_compact_chatbox_mods') === 'true';
            const compactChatboxInput = portal.querySelector('#mod-toggle-compact-chatbox');
            const compactChatboxPill = portal.querySelector('#compact-chatbox-status-pill');
            if (compactChatboxInput) {
              compactChatboxInput.checked = compactChatboxEnabled;
              if (compactChatboxPill) {
                compactChatboxPill.textContent = compactChatboxEnabled ? 'Minimizado' : 'Normal';
                compactChatboxPill.className = 'mod-status-pill ' + (compactChatboxEnabled ? 'compact' : '');
              }
              compactChatboxInput.onchange = (ev) => {
                const isChecked = ev.target.checked;
                localStorage.setItem('__antigravity_compact_chatbox_mods', isChecked ? 'true' : 'false');
                if (compactChatboxPill) {
                  compactChatboxPill.textContent = isChecked ? 'Minimizado' : 'Normal';
                  compactChatboxPill.className = 'mod-status-pill ' + (isChecked ? 'compact' : '');
                }
                if (typeof window.__applyChatboxModsCompact === 'function') {
                  window.__applyChatboxModsCompact();
                }
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

            const modelSlotsEnabled = localStorage.getItem('__antigravity_mod_enabled_model-slots') !== 'false';
            const modelSlotsInput = portal.querySelector('#mod-toggle-model-slots');
            if (modelSlotsInput) {
              modelSlotsInput.checked = modelSlotsEnabled;
              modelSlotsInput.onchange = (ev) => {
                localStorage.setItem('__antigravity_mod_enabled_model-slots', ev.target.checked);
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


        const getLaneColor = ${getLaneColor.toString()};
        const renderGitGraphSvg = ${renderGitGraphSvg.toString()};
        const escapeGitHtml = ${escapeGitHtml.toString()};
        const getExtClass = ${getExtClass.toString()};
        const renderPrCiCardHtml = ${renderPrCiCardHtml.toString()};
        const renderGitGraphPanelHtml = ${renderGitGraphPanelHtml.toString()};
        window.__antigravityRenderGitSvg = renderGitGraphSvg;
        window.__antigravityRenderGitPanel = renderGitGraphPanelHtml;

        window.__antigravityProjectFilteredCommits = function(commits, filterType) {
          if (!Array.isArray(commits)) return [];
          if (!filterType || filterType === 'all') return commits;

          const filtered = commits.filter(function(c) {
            const hasOrigin = Array.isArray(c.refs) && c.refs.some(function(r) { return r.indexOf('origin/') !== -1; });
            const isLocal = c.pushed === false || c.syncStatus === 'ahead' || !!c.isUnpushed;
            const cType = isLocal ? 'local' : (hasOrigin ? 'remote' : 'local');
            return cType === filterType;
          });

          const visibleSet = {};
          for (let i = 0; i < filtered.length; i++) {
            if (filtered[i] && filtered[i].hash) visibleSet[filtered[i].hash] = true;
          }

          let activeLanes = [];
          const projected = [];

          for (let i = 0; i < filtered.length; i++) {
            const commit = filtered[i];
            const hash = commit.hash;
            const isTrunk = !!commit.isTrunk;
            let cLane = activeLanes.indexOf(hash);

            if (cLane === -1) {
              if (isTrunk) {
                if (activeLanes.length === 0) {
                  activeLanes.push(hash);
                } else if (activeLanes[0] === null) {
                  activeLanes[0] = hash;
                } else {
                  const prev0 = activeLanes[0];
                  let freeIdx = -1;
                  for (let k = 1; k < activeLanes.length; k++) {
                    if (activeLanes[k] === null) { freeIdx = k; break; }
                  }
                  if (freeIdx !== -1) activeLanes[freeIdx] = prev0;
                  else activeLanes.push(prev0);
                  activeLanes[0] = hash;
                }
                cLane = 0;
              } else {
                if (activeLanes.length === 0) activeLanes.push(null);
                let freeIdx = -1;
                for (let k = 1; k < activeLanes.length; k++) {
                  if (activeLanes[k] === null) { freeIdx = k; break; }
                }
                if (freeIdx !== -1) {
                  cLane = freeIdx;
                  activeLanes[cLane] = hash;
                } else {
                  cLane = activeLanes.length;
                  activeLanes.push(hash);
                }
              }
            }

            const preLanes = activeLanes.slice();
            const routes = [];
            const visibleParents = (Array.isArray(commit.parents) ? commit.parents : []).filter(function(p) {
              return !!visibleSet[p];
            });
            const nextLanes = preLanes.slice();

            for (let l = 0; l < preLanes.length; l++) {
              if (preLanes[l] !== null && l !== cLane && preLanes[l] !== hash) {
                routes.push({ fromLane: l, toLane: l, type: 'straight', colorLane: l });
              }
            }

            for (let l = 0; l < nextLanes.length; l++) {
              if (nextLanes[l] === hash && l !== cLane) {
                routes.push({ fromLane: l, toLane: cLane, type: 'merge-in', colorLane: l });
                nextLanes[l] = null;
              }
            }

            if (visibleParents.length === 0) {
              nextLanes[cLane] = null;
            } else {
              const p0 = visibleParents[0];
              const existingP0 = nextLanes.indexOf(p0);
              if (existingP0 !== -1 && existingP0 !== cLane) {
                routes.push({ fromLane: cLane, toLane: existingP0, type: 'branch-join', colorLane: cLane });
                nextLanes[cLane] = null;
              } else {
                nextLanes[cLane] = p0;
                routes.push({ fromLane: cLane, toLane: cLane, type: 'straight', colorLane: cLane });
              }
              for (let pIdx = 1; pIdx < visibleParents.length; pIdx++) {
                const pHash = visibleParents[pIdx];
                let pLane = nextLanes.indexOf(pHash);
                if (pLane === -1) {
                  let freeSlot = -1;
                  for (let k = 1; k < nextLanes.length; k++) {
                    if (nextLanes[k] === null) { freeSlot = k; break; }
                  }
                  if (freeSlot !== -1) {
                    pLane = freeSlot;
                    nextLanes[pLane] = pHash;
                  } else {
                    pLane = nextLanes.length;
                    nextLanes.push(pHash);
                  }
                }
                routes.push({ fromLane: cLane, toLane: pLane, type: 'merge-branch', colorLane: pLane });
              }
            }

            while (nextLanes.length > 1 && nextLanes[nextLanes.length - 1] === null) {
              nextLanes.pop();
            }
            activeLanes = nextLanes;

            projected.push(Object.assign({}, commit, {
              lane: cLane,
              routes: routes
            }));
          }

          return projected;
        };

        window.__antigravityRefreshGitSvg = function(hostEl) {
          if (!hostEl || !window.__antigravityVcsData || !Array.isArray(window.__antigravityVcsData.commits)) return;
          const activePill = hostEl.querySelector('.git-filter-pill.active');
          const filterType = activePill ? (activePill.getAttribute('data-branch-filter') || 'all') : 'all';
          const projected = window.__antigravityProjectFilteredCommits(window.__antigravityVcsData.commits, filterType);
          const svgCol = hostEl.querySelector('#antigravity-git-svg-column') || hostEl.querySelector('.git-svg-column');
          if (svgCol && typeof window.__antigravityRenderGitSvg === 'function') {
            svgCol.innerHTML = window.__antigravityRenderGitSvg(projected, {
              rowHeight: 26,
              fileRowHeight: 22,
              laneWidth: 14,
              startX: 14
            });
          }
        };

        const isStubVcsData = function(d) {
          if (!d || typeof d !== 'object') return true;
          const hasBranch = !!(d.status && d.status.branch);
          const hasCommits = Array.isArray(d.commits) && d.commits.length > 0;
          const hasGh = !!(d.github && d.github.isGitHub);
          const hasLocalBranches = !!(d.branches && Array.isArray(d.branches.local) && d.branches.local.length > 0);
          const hasRemoteBranches = !!(d.branches && Array.isArray(d.branches.remote) && d.branches.remote.length > 0);
          return !hasBranch && !hasCommits && !hasGh && !hasLocalBranches && !hasRemoteBranches;
        };

        const computeVcsDataSignature = function(d) {
          if (!d || typeof d !== 'object') return 'empty';
          const gh = d.github || {};
          const st = d.status || {};
          const pr = d.pullRequest || {};
          const br = d.branches || {};
          const commits = Array.isArray(d.commits) ? d.commits : [];
          const commitSig = commits.map(function(c) {
            return (c.hash || '') + ':' + (c.pushed === false ? '0' : '1') + ':' + (c.syncStatus || '') + ':' + (c.expanded ? '1' : '0');
          }).join(',');
          const checks = pr.checksSummary || {};
          return [
            d.activeRepo || '',
            st.branch || '',
            st.ahead || 0,
            st.behind || 0,
            st.isClean ? '1' : '0',
            gh.isGitHub ? '1' : '0',
            gh.fullName || '',
            pr.number || '',
            checks.status || '',
            Array.isArray(br.local) ? br.local.length : 0,
            Array.isArray(br.remote) ? br.remote.length : 0,
            commitSig
          ].join('|');
        };

        const getVcsOverviewUrl = function() {
          const rp = (window.__antigravityVcsData && window.__antigravityVcsData.repoPath) || window.__antigravityActiveRepoPath || '';
          return rp
            ? ('http://127.0.0.1:53912/vcs/overview?repoPath=' + encodeURIComponent(rp))
            : 'http://127.0.0.1:53912/vcs/overview';
        };

        const applyGitFilterSelection = function(hostEl, filterType) {
          if (!hostEl) return;
          const targetFilter = filterType || window.__antigravityGitFilter || 'all';
          window.__antigravityGitFilter = targetFilter;
          if (typeof hostEl.querySelectorAll === 'function') {
            hostEl.querySelectorAll('.git-filter-pill').forEach(function(p) {
              const pType = (typeof p.getAttribute === 'function' ? p.getAttribute('data-branch-filter') : null) || 'all';
              if (p.classList) {
                p.classList.toggle('active', pType === targetFilter);
              }
            });
            hostEl.querySelectorAll('.git-commit-item').forEach(function(item) {
              const type = typeof item.getAttribute === 'function' ? item.getAttribute('data-commit-type') : null;
              if (targetFilter === 'all') {
                item.style.display = '';
              } else if (targetFilter === 'local') {
                item.style.display = type === 'local' ? '' : 'none';
              } else if (targetFilter === 'remote') {
                item.style.display = type === 'remote' ? '' : 'none';
              }
            });
          }
          if (typeof window.__antigravityRefreshGitSvg === 'function') {
            window.__antigravityRefreshGitSvg(hostEl);
          }
        };

        window.__antigravityUpdateVcsData = function(data) {
          if (!data || typeof data !== 'object') return;
          if (isStubVcsData(data) && !isStubVcsData(window.__antigravityVcsData)) return;

          const prevMap = {};
          if (window.__antigravityVcsData && Array.isArray(window.__antigravityVcsData.commits)) {
            window.__antigravityVcsData.commits.forEach(function(c) {
              if (c && c.hash) prevMap[c.hash] = !!c.expanded;
            });
          }
          if (Array.isArray(data.commits)) {
            data.commits.forEach(function(c) {
              if (c && c.hash && prevMap[c.hash] !== undefined) {
                c.expanded = prevMap[c.hash];
              } else if (c && c.expanded === undefined) {
                c.expanded = false;
              }
            });
          }
          if (!data.repoPath && window.__antigravityActiveRepoPath) {
            data.repoPath = window.__antigravityActiveRepoPath;
          }
          window.__antigravityVcsData = data;
          const nextSig = computeVcsDataSignature(data);
          window.__antigravityVcsSig = nextSig;

          if (typeof window.__antigravityRenderGitPanel === 'function') {
            const html = window.__antigravityRenderGitPanel(data);
            const tpl = document.getElementById('antigravity-git-panel-template');
            const prevTplSig = (tpl && typeof tpl.getAttribute === 'function') ? tpl.getAttribute('data-vcs-sig') : null;
            if (tpl && prevTplSig !== nextSig) {
              tpl.innerHTML = html;
              if (typeof tpl.setAttribute === 'function') tpl.setAttribute('data-vcs-sig', nextSig);
            }
            const hostEl = document.getElementById('antigravity-git-panel-host');
            const isHostOpen = !!(hostEl && hostEl.style && hostEl.style.display !== 'none' && (typeof hostEl.getAttribute !== 'function' || hostEl.getAttribute('data-open') !== 'false'));
            if (isHostOpen) {
              const curHostSig = typeof hostEl.getAttribute === 'function' ? hostEl.getAttribute('data-vcs-sig') : null;
              const hasContent = hostEl.children ? hostEl.children.length > 0 : !!hostEl.innerHTML;
              if (curHostSig === nextSig && hasContent) {
                return;
              }
              const activePill = typeof hostEl.querySelector === 'function' ? hostEl.querySelector('.git-filter-pill.active') : null;
              const savedFilter = activePill && typeof activePill.getAttribute === 'function'
                ? (activePill.getAttribute('data-branch-filter') || window.__antigravityGitFilter || 'all')
                : (window.__antigravityGitFilter || 'all');
              const branchesDrawerEl = typeof hostEl.querySelector === 'function' ? hostEl.querySelector('#antigravity-git-branches-drawer') : null;
              const branchesDrawerOpen = !!(branchesDrawerEl && branchesDrawerEl.style && branchesDrawerEl.style.display !== 'none');
              const prDrawerEl = typeof hostEl.querySelector === 'function' ? hostEl.querySelector('#antigravity-git-pr-drawer') : null;
              const prDrawerOpen = !!(prDrawerEl && prDrawerEl.style && prDrawerEl.style.display !== 'none');
              const ciAccordionEl = typeof hostEl.querySelector === 'function' ? hostEl.querySelector('#antigravity-git-ci-accordion') : null;
              const ciAccordionOpen = !!(ciAccordionEl && ciAccordionEl.style && ciAccordionEl.style.display !== 'none');
              const graphContainerEl = typeof hostEl.querySelector === 'function' ? hostEl.querySelector('.git-graph-container') : null;
              const savedScrollTop = graphContainerEl ? (graphContainerEl.scrollTop || 0) : 0;

              hostEl.__skipInitialStateParse = true;
              hostEl.innerHTML = html;
              if (typeof hostEl.setAttribute === 'function') hostEl.setAttribute('data-vcs-sig', nextSig);
              window.__bindGitPanelEvents(hostEl);
              applyGitFilterSelection(hostEl, savedFilter);

              if (branchesDrawerOpen && typeof hostEl.querySelector === 'function') {
                const newDrawer = hostEl.querySelector('#antigravity-git-branches-drawer');
                if (newDrawer) newDrawer.style.display = 'block';
                const caret = hostEl.querySelector('#antigravity-git-branches-drawer-btn .git-drawer-caret');
                if (caret) caret.textContent = '▴';
              }
              if (prDrawerOpen && typeof hostEl.querySelector === 'function') {
                const newPrDrawer = hostEl.querySelector('#antigravity-git-pr-drawer');
                if (newPrDrawer) newPrDrawer.style.display = 'block';
              }
              if (ciAccordionOpen && typeof hostEl.querySelector === 'function') {
                const newCiAcc = hostEl.querySelector('#antigravity-git-ci-accordion');
                if (newCiAcc) newCiAcc.style.display = 'block';
                const caret = hostEl.querySelector('#antigravity-git-ci-rollup-trigger .git-ci-caret');
                if (caret) caret.textContent = '▴';
              }
              if (savedScrollTop > 0 && typeof hostEl.querySelector === 'function') {
                const newGraphContainer = hostEl.querySelector('.git-graph-container');
                if (newGraphContainer) newGraphContainer.scrollTop = savedScrollTop;
              }
            }
          }
        };

        window.__antigravityShowGitToast = function(hostEl, msg, isError) {
          if (!hostEl) return;
          const toast = hostEl.querySelector('#antigravity-git-vcs-toast');
          if (!toast) return;
          toast.textContent = msg;
          toast.classList.toggle('is-error', !!isError);
          toast.style.display = 'block';
          clearTimeout(toast.__timer);
          toast.__timer = setTimeout(function() {
            toast.style.display = 'none';
          }, isError ? 5000 : 2800);
        };

        window.__antigravityRunVcsAction = async function(hostEl, payload) {
          if (!payload || !payload.action) return;
          const labelMap = {
            checkout: 'Cambiando a rama ' + (payload.branch || '') + '...',
            pull: 'Sincronizando (git pull) ' + (payload.branch || '') + '...',
            push: payload.targetSha ? ('Subiendo commits hasta ' + String(payload.targetSha).slice(0, 7) + '...') : ('Subiendo rama ' + (payload.branch || '') + '...'),
            'create-pr': 'Preparando Pull Request para ' + (payload.branch || '') + '...'
          };
          window.__antigravityShowGitToast(hostEl, labelMap[payload.action] || ('Ejecutando ' + payload.action + '...'), false);

          const cascadeId = (window.__resolveCascadeId ? window.__resolveCascadeId() : '') || '';
          const repoPath = (window.__antigravityVcsData && window.__antigravityVcsData.repoPath) || '';
          const actionPayload = Object.assign({}, payload, {
            cascadeId: cascadeId,
            repoPath: repoPath
          });

          try {
            if (payload.action === 'create-pr' && payload.branch) {
              await fetch('http://127.0.0.1:53912/vcs/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'push',
                  branch: payload.branch,
                  cascadeId: cascadeId,
                  repoPath: repoPath
                })
              }).catch(function() {});
            }

            const res = await fetch('http://127.0.0.1:53912/vcs/action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(actionPayload)
            });
            const result = await res.json();

            if (!res.ok || (result && result.error && !result.fallbackUrl)) {
              window.__antigravityShowGitToast(hostEl, 'Error: ' + ((result && result.error) || res.statusText), true);
              return;
            }

            if (result && result.fallbackUrl) {
              window.open(result.fallbackUrl, '_blank');
            } else if (result && result.output && result.output.indexOf('http') === 0) {
              window.open(result.output, '_blank');
            }

            let freshData = null;
            if (typeof window.__antigravityFetchSessionVcsOverview === 'function') {
              freshData = await window.__antigravityFetchSessionVcsOverview();
            } else {
              const ovRes = await fetch(getVcsOverviewUrl());
              if (ovRes.ok) {
                freshData = await ovRes.json();
                window.__antigravityUpdateVcsData(freshData);
              }
            }
            if (freshData) {
              const newHost = document.getElementById('antigravity-git-panel-host') || hostEl;
              window.__antigravityShowGitToast(newHost, 'Accion completada: ' + payload.action, false);
            }
          } catch (err) {
            window.__antigravityShowGitToast(hostEl, 'Servidor VCS local no disponible (daemon inactivo)', true);
          }
        };

        window.__bindGitPanelEvents = function(hostEl) {
          if (!hostEl) return;

          // Hydrate window.__antigravityVcsData from embedded JSON script tag on initial mount
          if (!hostEl.__skipInitialStateParse) {
            const stateScript = hostEl.querySelector('#antigravity-git-vcs-state');
            if (stateScript && stateScript.textContent) {
              try {
                const parsedState = JSON.parse(stateScript.textContent);
                if (!(isStubVcsData(parsedState) && !isStubVcsData(window.__antigravityVcsData))) {
                  window.__antigravityVcsData = parsedState;
                }
              } catch (e) {}
            }
          }
          hostEl.__skipInitialStateParse = false;

          function bindVcsActionButtons(root) {
            root.querySelectorAll('[data-vcs-action]').forEach(function(actionBtn) {
              actionBtn.onclick = function(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                const rawAction = actionBtn.getAttribute('data-vcs-action');
                const currentBranch = (window.__antigravityVcsData && window.__antigravityVcsData.status && window.__antigravityVcsData.status.branch) || 'main';
                const branch = actionBtn.getAttribute('data-branch') || currentBranch;
                const targetHash = actionBtn.getAttribute('data-hash') || '';
                if (rawAction === 'push-commit' && targetHash) {
                  window.__antigravityRunVcsAction(hostEl, { action: 'push', branch: branch, targetSha: targetHash });
                } else if (rawAction) {
                  window.__antigravityRunVcsAction(hostEl, { action: rawAction, branch: branch });
                }
              };
            });
          }

          bindVcsActionButtons(hostEl);

          // Unified commit row click: select inspector + toggle inline file accordion + re-render --< * * * * >-- SVG capsule
          hostEl.querySelectorAll('.git-commit-row').forEach(function(row) {
            row.addEventListener('click', function(ev) {
              if (ev.target && ev.target.closest && ev.target.closest('[data-vcs-action]')) {
                return;
              }

              hostEl.querySelectorAll('.git-commit-row.selected').forEach(function(r) { r.classList.remove('selected'); });
              row.classList.add('selected');

              const hash = row.getAttribute('data-hash');
              const item = row.closest('.git-commit-item');

              if (item) {
                const filesContainer = item.querySelector('.git-commit-files-container');
                const chevron = item.querySelector('.git-commit-chevron');
                if (filesContainer && chevron && chevron.classList.contains('has-files')) {
                  const isNowOpen = item.classList.contains('is-expanded') || filesContainer.style.display === 'flex';
                  const nextExpanded = !isNowOpen;
                  filesContainer.style.display = nextExpanded ? 'flex' : 'none';
                  item.classList.toggle('is-expanded', nextExpanded);
                  chevron.textContent = nextExpanded ? '▾' : '▸';

                  if (window.__antigravityVcsData && Array.isArray(window.__antigravityVcsData.commits)) {
                    const targetCommit = window.__antigravityVcsData.commits.find(function(x) { return x.hash === hash; });
                    if (targetCommit) {
                      targetCommit.expanded = nextExpanded;
                    }
                  }
                  window.__antigravityRefreshGitSvg(hostEl);
                }
              }

              const inspector = hostEl.querySelector('#antigravity-git-inspector');
              if (inspector && hash) {
                const authorName = row.getAttribute('data-author') || 'Unknown';
                const authorEmail = row.getAttribute('data-email') || '';
                const avatarUrl = row.getAttribute('data-avatar') || '';
                const commitUrl = row.getAttribute('data-commit-url') || '';
                const shortHash = row.getAttribute('data-short-hash') || hash.slice(0, 7);
                const subject = row.getAttribute('data-subject') || '';
                const relativeDate = row.getAttribute('data-date') || '';
                const isUnpushed = row.getAttribute('data-pushed') === 'false';
                const filesCount = parseInt(row.getAttribute('data-files-count') || '0', 10);

                const safeAuthor = escapeGitHtml(authorName);
                const safeEmail = authorEmail ? ('&lt;' + escapeGitHtml(authorEmail) + '&gt;') : '';
                const safeSubject = escapeGitHtml(subject);
                const safeShortHash = escapeGitHtml(shortHash);
                const initials = (authorName || 'U').split(' ').map(function(w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
                const linkHtml = commitUrl
                  ? '<a href="' + escapeGitHtml(commitUrl) + '" target="_blank" rel="noopener" class="git-inspector-btn-gh" title="Ver commit en GitHub">GitHub ↗</a>'
                  : '';
                const pushHtml = isUnpushed
                  ? '<button class="git-commit-push-btn" data-vcs-action="push-commit" data-hash="' + escapeGitHtml(hash) + '" title="Push hasta este commit">↑ Push hasta aquí</button>'
                  : '';

                inspector.innerHTML = '<div class="git-inspector-card">' +
                  '<div class="git-inspector-top">' +
                  '<div class="git-inspector-author-group">' +
                  '<div class="git-avatar-frame">' +
                  '<div class="git-inspector-avatar-fallback">' + escapeGitHtml(initials) + '</div>' +
                  (avatarUrl ? '<img class="git-inspector-avatar" src="' + escapeGitHtml(avatarUrl) + '" alt="' + safeAuthor + '" onerror="this.remove()"/>' : '') +
                  '</div>' +
                  '<div class="git-inspector-author-text">' +
                  '<div class="git-inspector-name-row">' +
                  '<span class="git-inspector-author-name">' + safeAuthor + '</span>' +
                  (relativeDate ? '<span class="git-inspector-date">' + escapeGitHtml(relativeDate) + '</span>' : '') +
                  '</div>' +
                  (safeEmail ? '<span class="git-inspector-author-email">' + safeEmail + '</span>' : '') +
                  '</div></div>' +
                  '<div class="git-inspector-meta-group">' +
                  '<span class="git-inspector-hash-pill" title="Hash: ' + escapeGitHtml(hash) + '">' + safeShortHash + '</span>' +
                  pushHtml +
                  linkHtml +
                  '<button class="git-inspector-btn-close" id="antigravity-git-inspector-close-btn" title="Cerrar inspector">✕</button>' +
                  '</div></div>' +
                  '<div class="git-inspector-subject-line">' + safeSubject + '</div>' +
                  (filesCount > 0 ? '<div class="git-inspector-footer-stats"><span class="git-inspector-files-badge">📄 ' + filesCount + ' archivo' + (filesCount > 1 ? 's' : '') + ' modificado' + (filesCount > 1 ? 's' : '') + '</span></div>' : '') +
                  '</div>';
                inspector.style.display = 'block';

                bindVcsActionButtons(inspector);

                const inspClose = inspector.querySelector('#antigravity-git-inspector-close-btn');
                if (inspClose) {
                  inspClose.onclick = function(eClose) {
                    eClose.stopPropagation();
                    inspector.style.display = 'none';
                  };
                }
              }
            });
          });

          // Expand/Collapse all files toggle button + reactive SVG re-render
          const toggleAllBtn = hostEl.querySelector('#antigravity-git-toggle-all-btn');
          if (toggleAllBtn) {
            let allExpanded = false;
            toggleAllBtn.onclick = function(e) {
              e.stopPropagation();
              allExpanded = !allExpanded;
              hostEl.querySelectorAll('.git-commit-item').forEach(function(item) {
                const filesContainer = item.querySelector('.git-commit-files-container');
                const chevron = item.querySelector('.git-commit-chevron');
                const hasFiles = chevron && chevron.classList.contains('has-files');
                if (filesContainer && hasFiles) {
                  filesContainer.style.display = allExpanded ? 'flex' : 'none';
                  item.classList.toggle('is-expanded', allExpanded);
                  chevron.textContent = allExpanded ? '▾' : '▸';
                }
              });
              if (window.__antigravityVcsData && Array.isArray(window.__antigravityVcsData.commits)) {
                window.__antigravityVcsData.commits.forEach(function(c) {
                  const hasFiles = Array.isArray(c.files) && c.files.length > 0;
                  c.expanded = hasFiles ? allExpanded : false;
                });
              }
              window.__antigravityRefreshGitSvg(hostEl);
            };
          }

          // Branch filter pills (Todas / Locales / GitHub) with synchronized SVG re-projection
          hostEl.querySelectorAll('.git-filter-pill').forEach(function(pill) {
            pill.onclick = function(e) {
              if (e) e.stopPropagation();
              const filterType = pill.getAttribute('data-branch-filter') || 'all';
              applyGitFilterSelection(hostEl, filterType);
            };
          });

          // Branches Drawer dropdown toggle & branch checkout rows
          const drawerBtn = hostEl.querySelector('#antigravity-git-branches-drawer-btn');
          const drawer = hostEl.querySelector('#antigravity-git-branches-drawer');
          if (drawerBtn && drawer) {
            drawerBtn.onclick = function(e) {
              e.stopPropagation();
              const isHidden = drawer.style.display === 'none';
              drawer.style.display = isHidden ? 'block' : 'none';
              const caret = drawerBtn.querySelector('.git-drawer-caret');
              if (caret) caret.textContent = isHidden ? '▴' : '▾';
            };
          }

          hostEl.querySelectorAll('.git-branch-drawer-row').forEach(function(branchRow) {
            branchRow.onclick = function(e) {
              if (e.target && e.target.closest && e.target.closest('[data-vcs-action]')) return;
              e.stopPropagation();
              if (branchRow.classList.contains('is-active-branch')) return;
              const targetBranch = branchRow.getAttribute('data-branch');
              if (targetBranch) {
                window.__antigravityRunVcsAction(hostEl, { action: 'checkout', branch: targetBranch });
              }
            };
          });

          // PR creation & pending commits drawer toggle
          const prDrawerTrigger = hostEl.querySelector('#antigravity-git-pr-drawer-trigger');
          const prDrawer = hostEl.querySelector('#antigravity-git-pr-drawer');
          if (prDrawerTrigger && prDrawer) {
            prDrawerTrigger.onclick = function(e) {
              e.stopPropagation();
              const isHidden = prDrawer.style.display === 'none';
              prDrawer.style.display = isHidden ? 'block' : 'none';
            };
          }

          const ciTrigger = hostEl.querySelector('#antigravity-git-ci-rollup-trigger');
          const ciAccordion = hostEl.querySelector('#antigravity-git-ci-accordion');
          if (ciTrigger && ciAccordion) {
            ciTrigger.onclick = function(e) {
              e.stopPropagation();
              const isHidden = ciAccordion.style.display === 'none';
              ciAccordion.style.display = isHidden ? 'block' : 'none';
              const caret = ciTrigger.querySelector('.git-ci-caret');
              if (caret) caret.textContent = isHidden ? '▴' : '▾';
            };
          }

          const refreshBtn = hostEl.querySelector('#antigravity-git-refresh-btn');
          if (refreshBtn) {
            refreshBtn.onclick = async function(e) {
              if (e) e.stopPropagation();
              refreshBtn.style.transform = 'rotate(360deg)';
              refreshBtn.style.transition = 'transform 0.5s ease';
              setTimeout(function() { refreshBtn.style.transform = ''; }, 500);

              if (typeof window.__antigravityFetchSessionVcsOverview === 'function') {
                const liveData = await window.__antigravityFetchSessionVcsOverview();
                if (liveData) return;
              } else {
                try {
                  const res = await fetch(getVcsOverviewUrl());
                  if (res.ok) {
                    const data = await res.json();
                    if (window.__antigravityUpdateVcsData) {
                      window.__antigravityUpdateVcsData(data);
                      return;
                    }
                  }
                } catch (err) {}
              }

              if (window.__antigravityMountAll) {
                window.__antigravityMountAll();
              }
            };
          }

          const closeBtn = hostEl.querySelector('#antigravity-git-close-btn');
          if (closeBtn) {
            closeBtn.onclick = function(e) {
              if (e) {
                e.stopPropagation();
                e.preventDefault();
              }
              if (typeof window.__closeGitGraphPanel === 'function') {
                window.__closeGitGraphPanel();
              } else if (typeof window.__toggleGitGraphPanel === 'function') {
                window.__toggleGitGraphPanel();
              }
            };
          }
        };

        window.__closeGitGraphPanel = function() {
          window.__antigravityGitPanelOpen = false;
          window.__antigravityVcsReqSeq = (window.__antigravityVcsReqSeq || 0) + 1;
          const hosts = typeof document.querySelectorAll === 'function'
            ? Array.from(document.querySelectorAll('#antigravity-git-panel-host'))
            : [];
          if (hosts.length === 0 && typeof document.getElementById === 'function') {
            const fallbackHost = document.getElementById('antigravity-git-panel-host');
            if (fallbackHost) hosts.push(fallbackHost);
          }
          hosts.forEach(function(host, idx) {
            if (idx > 0 && typeof host.remove === 'function') {
              host.remove();
              return;
            }
            if (host && host.style) host.style.display = 'none';
            if (host && typeof host.setAttribute === 'function') host.setAttribute('data-open', 'false');
          });
          if (typeof document.querySelectorAll === 'function') {
            document.querySelectorAll('#antigravity-git-tab-trigger, .antigravity-git-tab-btn').forEach(function(triggerBtn) {
              if (triggerBtn && triggerBtn.classList) triggerBtn.classList.remove('active');
            });
          }
        };

        window.__toggleGitGraphPanel = function(e, btnEl) {
          if (e) {
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof e.preventDefault === 'function') e.preventDefault();
          }
          const btn = btnEl || (e && e.currentTarget ? e.currentTarget : (typeof document.querySelector === 'function' ? document.querySelector('#antigravity-git-tab-trigger') : null));
          const hosts = typeof document.querySelectorAll === 'function'
            ? Array.from(document.querySelectorAll('#antigravity-git-panel-host'))
            : [];
          if (hosts.length === 0 && typeof document.getElementById === 'function') {
            const singleHost = document.getElementById('antigravity-git-panel-host');
            if (singleHost) hosts.push(singleHost);
          }
          const hostVisible = hosts.some(function(h) {
            return !!(h && h.style && h.style.display !== 'none' && (typeof h.getAttribute !== 'function' || h.getAttribute('data-open') !== 'false'));
          });
          const isCurrentActive = !!window.__antigravityGitPanelOpen || hostVisible || !!(btn && btn.classList && btn.classList.contains('active'));

          if (isCurrentActive) {
            window.__closeGitGraphPanel();
            return;
          }
          if (!btn) return;
          window.__antigravityGitPanelOpen = true;
          if (btn.classList) btn.classList.add('active');

          const trigger = btn || document.querySelector('#antigravity-git-tab-trigger');
          let auxContainer = trigger ? (trigger.closest('.h-full.w-full.flex.flex-col') || trigger.closest('.flex.flex-col')) : null;
          if (!auxContainer) {
            const newTabBtn = document.querySelector('[data-testid="aux-pane-new-tab-button"]');
            auxContainer = newTabBtn ? newTabBtn.closest('.flex.flex-col') : null;
          }
          const auxBody = auxContainer ? auxContainer.querySelector('.flex-grow.overflow-hidden') : null;

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
            hostEl.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; z-index:50; background:#0f111a;';
          } else {
            hostEl.style.cssText = 'position:fixed; right:0; top:40px; bottom:24px; width:420px; display:flex; flex-direction:column; overflow:hidden; z-index:99999; background:#0f111a; box-shadow:-12px 0 30px rgba(0,0,0,0.7); border-left:1px solid #1e2438;';
          }

          hostEl.style.display = 'flex';
          if (typeof hostEl.setAttribute === 'function') hostEl.setAttribute('data-open', 'true');

          if (!isStubVcsData(window.__antigravityVcsData) && typeof window.__antigravityRenderGitPanel === 'function') {
            const cachedSig = computeVcsDataSignature(window.__antigravityVcsData);
            const curHostSig = typeof hostEl.getAttribute === 'function' ? hostEl.getAttribute('data-vcs-sig') : null;
            const hasContent = hostEl.children ? hostEl.children.length > 0 : !!hostEl.innerHTML;
            if (curHostSig !== cachedSig || !hasContent) {
              hostEl.__skipInitialStateParse = true;
              hostEl.innerHTML = window.__antigravityRenderGitPanel(window.__antigravityVcsData);
              if (typeof hostEl.setAttribute === 'function') hostEl.setAttribute('data-vcs-sig', cachedSig);
              window.__bindGitPanelEvents(hostEl);
              applyGitFilterSelection(hostEl, window.__antigravityGitFilter || 'all');
            }
          } else {
            const template = document.getElementById('antigravity-git-panel-template');
            const hasContent = hostEl.children ? hostEl.children.length > 0 : !!hostEl.innerHTML;
            if (template && (!hasContent || isStubVcsData(window.__antigravityVcsData))) {
              hostEl.innerHTML = template.innerHTML;
              window.__bindGitPanelEvents(hostEl);
            }
          }

          const reqSeq = (window.__antigravityVcsReqSeq = (window.__antigravityVcsReqSeq || 0) + 1);
          const activeCascadeId = window.__resolveCascadeId ? window.__resolveCascadeId() : '';
          const hasCachedRepo = !!(activeCascadeId && window.__antigravityCascadeRepos && window.__antigravityCascadeRepos[activeCascadeId]);
          if (window.__APP_CONFIG__?.csrfToken && !hasCachedRepo && typeof window.__antigravityFetchSessionVcsOverview === 'function') {
            window.__antigravityFetchSessionVcsOverview().then(function(liveData) {
              if (!window.__antigravityGitPanelOpen || reqSeq !== window.__antigravityVcsReqSeq) return;
              if (liveData && window.__antigravityUpdateVcsData) {
                window.__antigravityUpdateVcsData(liveData);
              }
            }).catch(function() {});
          } else {
            const sessionRepo = (activeCascadeId && window.__antigravityCascadeRepos && window.__antigravityCascadeRepos[activeCascadeId]) || '';
            const baseUrl = getVcsOverviewUrl();
            const overviewUrl = sessionRepo && !baseUrl.includes('repoPath=')
              ? (baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'repoPath=' + encodeURIComponent(sessionRepo))
              : baseUrl;
            fetch(overviewUrl)
              .then(function(r) { return r && r.ok ? r.json() : null; })
              .then(function(liveData) {
                if (!window.__antigravityGitPanelOpen || reqSeq !== window.__antigravityVcsReqSeq) return;
                if (liveData && window.__antigravityUpdateVcsData) {
                  window.__antigravityUpdateVcsData(liveData);
                }
              })
              .catch(function() {});
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

            if (typeof window.__scrapeNativeModelQuota === 'function') {
              window.__scrapeNativeModelQuota();
            }

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

            const nativeGroups = window.__antigravityNativeQuotaSummary || (() => {
              try {
                const raw = localStorage.getItem('__antigravity_native_quota_summary');
                return raw ? JSON.parse(raw).groups : null;
              } catch (e) { return null; }
            })();

            if (nativeGroups && m && typeof window.__resolveNativeQuotaForModel === 'function') {
              const triggerBtn = document.querySelector('button[data-testid="model-selector-trigger"]');
              const activeModelName = (triggerBtn ? triggerBtn.innerText.trim() : '') || m.detectedModel || m.modelQuota?.modelName || 'Gemini 3.8 Flash';
              const nativeQuota = window.__resolveNativeQuotaForModel(nativeGroups, activeModelName);
              if (nativeQuota) {
                if (m.modelQuota) {
                  nativeQuota.chatWeeklyPct = m.modelQuota.chatWeeklyPct;
                  nativeQuota.chatRollingPct = m.modelQuota.chatRollingPct;
                  nativeQuota.chatUsedPct = m.modelQuota.chatUsedPct;
                }
                m.modelQuota = nativeQuota;
              }
            }

            if (m && window.__renderTachometerPopoverHtml) {
              portal.innerHTML = window.__renderTachometerPopoverHtml(m);
            }

            if (typeof window.__fetchNativeUserQuotaSummary === 'function') {
              window.__fetchNativeUserQuotaSummary();
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
        window.__antigravityLiveTelemetryReceived = false;
        window.__antigravityActiveAgents = Object.assign(
          window.__antigravityActiveAgents || {},
          ${JSON.stringify(context.activeAgents || {})}
        );

        window.__syncAgentBadges = function() {
          const currentCascadeId = window.__resolveCascadeId ? window.__resolveCascadeId() : null;
          if (currentCascadeId && currentCascadeId !== window.__lastGitCascadeId) {
            window.__lastGitCascadeId = currentCascadeId;
            if (typeof window.__antigravityFetchSessionVcsOverview === 'function') {
              window.__antigravityFetchSessionVcsOverview();
            }
          }

          document.querySelectorAll('.antigravity-agent-badge').forEach(badge => {
            const cId = window.__resolveCascadeId(badge);
            const agentToApply = window.__resolveAgentForCascade(cId);
            if (agentToApply && agentToApply.name) {
              const currentAgentId = badge.getAttribute('data-agent-id');
              const currentEffMode = badge.getAttribute('data-effective-mode');
              const nextEffMode = agentToApply.id === 'auto'
                ? ((agentToApply.effectiveMode || 'PLAN').toUpperCase() === 'BUILD' ? 'BUILD' : 'PLAN')
                : null;
              const labelEl = badge.querySelector('.antigravity-active-agent-name');
              const isLabelDesynced = labelEl && (
                (agentToApply.id === 'auto' && !labelEl.querySelector('.auto-oscillate-track')) ||
                (agentToApply.id !== 'auto' && labelEl.textContent !== agentToApply.name)
              );
              if (currentAgentId !== agentToApply.id || currentEffMode !== nextEffMode || badge.__lastCascadeId !== cId || isLabelDesynced) {
                badge.__lastCascadeId = cId;
                window.__applyAgentToBadge(badge, agentToApply);
              }
            }

            // Sync exterior reticle trigger in the same group
            const group = badge.closest('.antigravity-agent-selector-group');
            syncReticleTrigger(group ? group.querySelector('.antigravity-caveman-reticle-trigger') : null, cId);
          });
        };

        window.__fetchNativeUserQuotaSummary = async function() {
          try {
            const csrf = window.__APP_CONFIG__?.csrfToken;
            if (!csrf) return null;
            const res = await fetch('/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'x-codeium-csrf-token': csrf
              },
              body: '{}'
            });
            if (!res.ok) return null;
            const data = await res.json();
            const groups = data?.response?.groups || null;
            if (groups && Array.isArray(groups)) {
              window.__antigravityNativeQuotaSummary = groups;
              try {
                localStorage.setItem('__antigravity_native_quota_summary', JSON.stringify({
                  updatedAt: Date.now(),
                  groups
                }));
              } catch (e) {}
              if (typeof window.__updateAntigravityTelemetry === 'function') {
                window.__updateAntigravityTelemetry();
              }
              return groups;
            }
          } catch (e) {}
          return null;
        };

        window.__scrapeNativeModelQuota = function() {
          if (typeof window.__fetchNativeUserQuotaSummary === 'function') {
            window.__fetchNativeUserQuotaSummary();
          }
        };

        window.__updateAntigravityTelemetry = function(fallbackMetric, isInitialSnapshot) {
          if (isInitialSnapshot && window.__antigravityLiveTelemetryReceived) {
            return;
          }
          const all = window.__antigravityAllMetrics || {};
          const latest = fallbackMetric || window.__antigravityLatestMetric;

          if (!isInitialSnapshot) {
            const hasLiveMetrics = Boolean(
              Object.keys(all).length > 0 ||
              (latest && (Number(latest.estTokens) > 0 || Number(latest.steps) > 0 || parseFloat(latest.pct) > 0))
            );
            if (hasLiveMetrics) {
              window.__antigravityLiveTelemetryReceived = true;
              if (fallbackMetric) {
                window.__antigravityLatestMetric = fallbackMetric;
              }
            }
          }

          const nativeGroups = window.__antigravityNativeQuotaSummary || (() => {
            try {
              const raw = localStorage.getItem('__antigravity_native_quota_summary');
              return raw ? JSON.parse(raw).groups : null;
            } catch (e) { return null; }
          })();

          document.querySelectorAll('.antigravity-tachometer-badge').forEach(badge => {
            const activeId = window.__resolveCascadeId(badge);

            const m = (activeId && all[activeId]) ? all[activeId] : (latest || window.__antigravityLatestMetric);
            if (!m) return;

            if (nativeGroups && typeof window.__resolveNativeQuotaForModel === 'function') {
              const triggerBtn = document.querySelector('button[data-testid="model-selector-trigger"]');
              const activeModelName = (triggerBtn ? triggerBtn.innerText.trim() : '') || m.detectedModel || m.modelQuota?.modelName || 'Gemini 3.8 Flash';
              const nativeQuota = window.__resolveNativeQuotaForModel(nativeGroups, activeModelName);
              if (nativeQuota) {
                if (m.modelQuota) {
                  nativeQuota.chatWeeklyPct = m.modelQuota.chatWeeklyPct;
                  nativeQuota.chatRollingPct = m.modelQuota.chatRollingPct;
                  nativeQuota.chatUsedPct = m.modelQuota.chatUsedPct;
                }
                m.modelQuota = nativeQuota;
              }
            }

            const pctNum = parseFloat(m.pct) || 0;
            let statusColor = '#22c55e';
            if (pctNum >= 85) statusColor = '#ef4444';
            else if (pctNum >= 60) statusColor = '#f97316';
            else if (pctNum >= 25) statusColor = '#eab308';

            const nextTitle = 'Context: ' + m.displayTokens + ' tokens (' + m.pct + '%)';
            if (badge.getAttribute('title') !== nextTitle) {
              badge.setAttribute('title', nextTitle);
            }
            const tokenSpan = badge.querySelector('.tachometer-tokens');
            if (tokenSpan && tokenSpan.textContent !== m.displayTokens) {
              tokenSpan.textContent = m.displayTokens;
            }
            const pctSpan = badge.querySelector('.tachometer-pct');
            const nextPctText = '(' + m.pct + '%)';
            if (pctSpan && pctSpan.textContent !== nextPctText) {
              pctSpan.textContent = nextPctText;
            }
            const needle = badge.querySelector('g[filter]');
            if (needle) {
              const angle = -120 + (Math.min(pctNum, 100) / 100) * 240;
              const nextTransform = 'rotate(' + angle.toFixed(1) + 'deg)';
              if (needle.style.transform !== nextTransform) {
                needle.style.transform = nextTransform;
              }
              const poly = needle.querySelector('polygon');
              if (poly && poly.getAttribute('fill') !== statusColor) {
                poly.setAttribute('fill', statusColor);
              }
            }

            if (window.__renderTachometerPopoverHtml) {
              const renderedPopover = window.__renderTachometerPopoverHtml(m);
              const tpl = badge.querySelector('.antigravity-popover-template') ||
                badge.parentElement?.querySelector('.antigravity-popover-template');
              if (tpl && tpl.innerHTML !== renderedPopover) {
                tpl.innerHTML = renderedPopover;
              }

              // Update live popover content if currently open on screen, preserving expanded model disclosures
              const portal = document.getElementById('antigravity-tachometer-popover-portal');
              if (portal && portal.classList.contains('open') && portal.innerHTML !== renderedPopover) {
                const openKeys = new Set();
                const scrollByKey = new Map();
                portal.querySelectorAll('details.tach-model-details[open]').forEach(det => {
                  const key = det.getAttribute('data-model-key');
                  if (key) {
                    openKeys.add(key);
                    const listEl = det.querySelector('.tach-subagent-list');
                    if (listEl && listEl.scrollTop > 0) {
                      scrollByKey.set(key, listEl.scrollTop);
                    }
                  }
                });
                portal.innerHTML = renderedPopover;
                if (openKeys.size > 0) {
                  portal.querySelectorAll('details.tach-model-details').forEach(det => {
                    const key = det.getAttribute('data-model-key');
                    if (key && openKeys.has(key)) {
                      det.setAttribute('open', '');
                      const savedScroll = scrollByKey.get(key);
                      const listEl = det.querySelector('.tach-subagent-list');
                      if (listEl && savedScroll) {
                        listEl.scrollTop = savedScroll;
                      }
                    }
                  });
                }
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

        window.__conditionAgentFromVoice = window.__conditionAgentFromVoice || function(transcriptText, sourceEl) {
          if (!transcriptText || typeof transcriptText !== 'string' || !transcriptText.trim()) return null;
          const mode = typeof window.__classifyPromptMode === 'function'
            ? window.__classifyPromptMode(transcriptText)
            : 'PLAN';
          if (typeof window.__handleAutoPromptContextUpdate === 'function') {
            window.__handleAutoPromptContextUpdate(transcriptText, sourceEl);
          }
          return mode;
        };

        window.__scanVoiceTranscriptsForAgent = function() {
          document.querySelectorAll('[data-voice-transcript], [data-testid*="voice-transcript"], .voice-transcript, .antigravity-voice-transcript, [data-voice-turn]').forEach(el => {
            const transcriptText = (el.getAttribute('data-voice-transcript') || el.textContent || '').trim();
            if (transcriptText && el.__lastVoiceConditionedText !== transcriptText) {
              el.__lastVoiceConditionedText = transcriptText;
              if (typeof window.__conditionAgentFromVoice === 'function') {
                window.__conditionAgentFromVoice(transcriptText, el);
              } else if (typeof window.__classifyPromptMode === 'function' && typeof window.__handleAutoPromptContextUpdate === 'function') {
                window.__handleAutoPromptContextUpdate(transcriptText, el);
              }
            }
          });
        };

        if (window.__antigravityDocClickHandler && typeof document.removeEventListener === 'function') {
          document.removeEventListener('click', window.__antigravityDocClickHandler, true);
        }
        if (window.__antigravityDocKeydownHandler && typeof document.removeEventListener === 'function') {
          document.removeEventListener('keydown', window.__antigravityDocKeydownHandler, true);
        }
        if (window.__antigravityDocFocusinHandler && typeof document.removeEventListener === 'function') {
          document.removeEventListener('focusin', window.__antigravityDocFocusinHandler, true);
        }

        window.__antigravityDocClickHandler = (e) => {
          const clickTarget = (e && e.target && typeof e.target.closest === 'function')
            ? e.target
            : (e && e.target && e.target.parentElement && typeof e.target.parentElement.closest === 'function' ? e.target.parentElement : null);
          if (!clickTarget) return;

          const sendBtn = clickTarget.closest('button[data-testid="send-button"]');
          if (sendBtn) {
            const container = sendBtn.closest('[data-cascade-id]') || document;
            const editor = container.querySelector('[contenteditable="true"], textarea');
            const text = editor ? (editor.value || editor.textContent || '') : '';
            if (text && window.__handleAutoPromptContextUpdate) {
              window.__handleAutoPromptContextUpdate(text, sendBtn);
            }
          }

          const reticleBtn = clickTarget.closest('.antigravity-caveman-reticle-trigger');
          if (reticleBtn) {
            e.preventDefault();
            e.stopPropagation();
            window.__toggleCavemanMode(undefined, reticleBtn);
            return;
          }

          const isAgentBadge = clickTarget.closest('.antigravity-agent-badge');
          const isAgentPortal = clickTarget.closest('#antigravity-agent-dropdown-portal');
          if (!isAgentBadge && !isAgentPortal) {
            const aPortal = document.getElementById('antigravity-agent-dropdown-portal');
            if (aPortal) aPortal.classList.remove('open');
            document.querySelectorAll('.antigravity-agent-badge.open').forEach(b => b.classList.remove('open'));
          }

          const isTachBadge = clickTarget.closest('.antigravity-tachometer-badge');
          const isTachPortal = clickTarget.closest('#antigravity-tachometer-popover-portal');
          if (!isTachBadge && !isTachPortal) {
            const tachPortal = document.getElementById('antigravity-tachometer-popover-portal');
            if (tachPortal) {
              tachPortal.classList.remove('open');
              tachPortal.__currentBadge = null;
            }
            document.querySelectorAll('.antigravity-tachometer-badge.open').forEach(b => b.classList.remove('open'));
          }

          const isModsBtn = clickTarget.closest('.antigravity-mods-manager-btn');
          const isModsPortal = clickTarget.closest('#antigravity-mods-manager-portal');
          if (!isModsBtn && !isModsPortal) {
            const mPortal = document.getElementById('antigravity-mods-manager-portal');
            if (mPortal) {
              mPortal.classList.remove('open');
              mPortal.__currentBtn = null;
            }
            document.querySelectorAll('.antigravity-mods-manager-btn.open').forEach(b => b.classList.remove('open'));
          }

          const modelSlotBtn = clickTarget.closest('.antigravity-model-slot-btn');
          if (modelSlotBtn) {
            const role = modelSlotBtn.getAttribute('data-slot-role');
            window.__toggleModelSlotDropdown(e, modelSlotBtn, role);
            return;
          }

          const isModelSlotPortal = clickTarget.closest('#antigravity-model-slot-dropdown-portal');
          if (!modelSlotBtn && !isModelSlotPortal) {
            const msPortal = document.getElementById('antigravity-model-slot-dropdown-portal');
            if (msPortal) {
              msPortal.classList.remove('open');
              msPortal.__currentBtn = null;
            }
            document.querySelectorAll('.antigravity-model-slot-btn.open').forEach(b => b.classList.remove('open'));
          }
        };

        window.__antigravityDocKeydownHandler = (e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target && typeof e.target.closest === 'function') {
            const editor = e.target.closest('[contenteditable="true"], textarea');
            if (editor) {
              const text = editor.value || editor.textContent || '';
              if (text && window.__handleAutoPromptContextUpdate) {
                window.__handleAutoPromptContextUpdate(text, editor);
              }
            }
          }
          if (e.key === 'Escape') {
            if (window.__antigravityGitPanelOpen && typeof window.__closeGitGraphPanel === 'function') {
              window.__closeGitGraphPanel();
            }
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

            const msPortal = document.getElementById('antigravity-model-slot-dropdown-portal');
            if (msPortal) {
              msPortal.classList.remove('open');
              msPortal.__currentBtn = null;
            }
            document.querySelectorAll('.antigravity-model-slot-btn.open').forEach(b => b.classList.remove('open'));
          }
        };

        window.__antigravityDocFocusinHandler = () => {
          if (typeof window.__updateMenubarSlotButtons === 'function' && typeof window.__getActiveMenubarSlotModels === 'function') {
            window.__updateMenubarSlotButtons(window.__getActiveMenubarSlotModels());
          }
        };

        document.addEventListener('click', window.__antigravityDocClickHandler, true);
        document.addEventListener('keydown', window.__antigravityDocKeydownHandler, true);
        document.addEventListener('focusin', window.__antigravityDocFocusinHandler, true);
        window.__antigravityGlobalEventsBound = true;

        // 3. Mount individual mods into target slots across all conversations
        function mountAllMods() {
          if (window.__antigravityIsMountingMods) return;
          window.__antigravityIsMountingMods = true;
          if (window.__antigravityModObserver) {
            try { window.__antigravityModObserver.disconnect(); } catch (e) {}
          }
          try {
            // Preserve last known compact state before slot innerHTML updates
            document.querySelectorAll('.antigravity-slot-container').forEach(slot => {
              const prevTach = slot.querySelector('.antigravity-tachometer-badge');
              const prevAgent = slot.querySelector('.antigravity-agent-badge');
              if (prevTach) slot.__lastTachCompact = prevTach.classList.contains('compact');
              if (prevAgent) slot.__lastAgentCompact = prevAgent.classList.contains('compact');
            });

            // Permanently remove legacy duplicate unmanaged badges, speaker icon wrappers & misplaced non-flex slot containers
            document.querySelectorAll('.antigravity-context-badge').forEach(el => el.remove());
            document.querySelectorAll('.min-w-0:not(.flex) > #antigravity-slot-header-actions, .no-focus-agent-input > #antigravity-slot-header-actions').forEach(el => el.remove());
            document.querySelectorAll('#antigravity-voice-assistant-wrapper, .antigravity-voice-assistant-wrapper, #antigravity-voice-assistant-btn, #antigravity-mod-voice-assistant').forEach(el => el.remove());
            document.querySelectorAll('#antigravity-slot-chat-input-actions, .antigravity-slot-chat-input-actions').forEach(slot => {
              if (!slot.children || slot.children.length === 0) {
                slot.remove();
              }
            });

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
          if (agentTemplate && !agentPortal.classList.contains('open') && (!agentPortal.firstElementChild || agentPortal.getAttribute('data-v') !== '2')) {
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

          // Bind Git Graph Tab trigger and keep .active synced with panel visibility
          document.querySelectorAll('#antigravity-git-tab-trigger').forEach(btn => {
            if (btn.classList) {
              btn.classList.toggle('active', !!window.__antigravityGitPanelOpen);
            }
            if (btn.__gitClickBound) return;
            btn.__gitClickBound = true;
            btn.addEventListener('click', (e) => {
              window.__toggleGitGraphPanel(e, btn);
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

          // Preserve active Git panel host if currently open; never overwrite hydrated data with stub template
          const activeGitHost = document.getElementById('antigravity-git-panel-host');
          const gitTemplate = document.getElementById('antigravity-git-panel-template');
          const isGitHostVisible = !!(activeGitHost && activeGitHost.style && activeGitHost.style.display !== 'none' && (typeof activeGitHost.getAttribute !== 'function' || activeGitHost.getAttribute('data-open') !== 'false'));
          if (isGitHostVisible && window.__antigravityGitPanelOpen) {
            if (!isStubVcsData(window.__antigravityVcsData) && typeof window.__antigravityUpdateVcsData === 'function') {
              window.__antigravityUpdateVcsData(window.__antigravityVcsData);
            } else if (gitTemplate && (!activeGitHost.children || activeGitHost.children.length === 0)) {
              activeGitHost.__skipInitialStateParse = true;
              activeGitHost.innerHTML = gitTemplate.innerHTML;
              if (window.__bindGitPanelEvents) {
                window.__bindGitPanelEvents(activeGitHost);
              }
            }
          }

          // Restore saved agent selection and caveman focus across mounted badges
          document.querySelectorAll('.antigravity-agent-badge').forEach(badge => {
            const cId = window.__resolveCascadeId(badge);
            const agentToApply = window.__resolveAgentForCascade(cId);
            if (agentToApply && agentToApply.name) {
              badge.__lastCascadeId = cId;
              window.__applyAgentToBadge(badge, agentToApply);
            }
            // Sync exterior reticle trigger in the same group immediately upon mount
            const group = badge.closest('.antigravity-agent-selector-group');
            syncReticleTrigger(group ? group.querySelector('.antigravity-caveman-reticle-trigger') : null, cId);
          });

          // Apply current telemetry
          if (window.__antigravityLiveTelemetryReceived) {
            window.__updateAntigravityTelemetry();
          } else {
            window.__updateAntigravityTelemetry(${JSON.stringify(context.telemetry || {})}, true);
          }

          // Observe stable chatbox footer containers for responsive auto-collapse (guarded against RDP/minimize zero-dimension states & layout thrashing)
          document.querySelectorAll('.antigravity-slot-container').forEach(slot => {
            if (slot.id && slot.id !== 'antigravity-slot-header-actions') return;
            const footer = resolveChatboxFooter(slot);
            if (window.__antigravityResizeObserver && footer && footer !== slot && footer.__antigravityObservedBy !== window.__antigravityResizeObserver) {
              footer.__antigravityObservedBy = window.__antigravityResizeObserver;
              window.__antigravityResizeObserver.observe(footer);
            }
            const tach = slot.querySelector('.antigravity-tachometer-badge');
            const agent = slot.querySelector('.antigravity-agent-badge');
            const footerWidth = footer ? (footer.offsetWidth || footer.getBoundingClientRect?.().width || 0) : 0;
            if (document.hidden || window.innerWidth <= 0 || footerWidth <= 0) {
              if (tach && typeof slot.__lastTachCompact === 'boolean') {
                tach.classList.toggle('compact', slot.__lastTachCompact);
              }
              if (agent && typeof slot.__lastAgentCompact === 'boolean') {
                agent.classList.toggle('compact', slot.__lastAgentCompact);
              }
              return;
            }
            applyCompactToChatboxScope(slot, footerWidth);
          });

            if (typeof window.__dockNativeVoiceToast === 'function') {
              window.__dockNativeVoiceToast(document);
            }
            if (typeof window.__syncModelSlotsUI === 'function') {
              window.__syncModelSlotsUI();
            }
            if (typeof window.__syncSubagentModelBadges === 'function') {
              window.__syncSubagentModelBadges();
            }
            if (typeof window.__observeNativeModelSelector === 'function') {
              window.__observeNativeModelSelector();
            }
          } finally {
            window.__antigravityIsMountingMods = false;
            if (window.__antigravityModObserver && document.body) {
              try {
                window.__antigravityModObserver.observe(document.body, { childList: true, subtree: true });
              } catch (e) {}
            }
          }
        }

        // Initialize ResizeObserver for responsive auto-collapse (coalesced per animation frame)
        if (window.__antigravityResizeObserver) {
          window.__antigravityResizeObserver.disconnect();
          window.__antigravityResizeObserver = null;
        }

        const pendingResizeTargets = new Map();
        let resizeRafScheduled = false;

        const flushPendingResizeTargets = () => {
          resizeRafScheduled = false;
          if (document.hidden || window.innerWidth <= 0) {
            pendingResizeTargets.clear();
            return;
          }
          pendingResizeTargets.forEach((rawWidth, container) => {
            const width = rawWidth > 0 ? rawWidth : 0;
            if (width <= 0) return;
            applyCompactToChatboxScope(container, width);
          });
          pendingResizeTargets.clear();
        };

        window.__antigravityResizeObserver = new ResizeObserver((entries) => {
          if (document.hidden || window.innerWidth <= 0) return;
          for (const entry of entries) {
            const container = entry.target;
            const footer = resolveChatboxFooter(container);
            const rawWidth = (entry.contentRect && typeof entry.contentRect.width === 'number')
              ? entry.contentRect.width
              : (footer.getBoundingClientRect?.().width || footer.offsetWidth || 0);
            const width = rawWidth > 0 ? rawWidth : 0;
            if (width <= 0) continue;
            pendingResizeTargets.set(container, width);
          }
          if (!pendingResizeTargets.size || resizeRafScheduled) return;
          if (typeof requestAnimationFrame === 'function') {
            resizeRafScheduled = true;
            requestAnimationFrame(flushPendingResizeTargets);
          } else {
            flushPendingResizeTargets();
          }
        });

        window.__antigravityMountAll = mountAllMods;
        mountAllMods();
        if (typeof window.__fetchNativeUserQuotaSummary === 'function') {
          window.__fetchNativeUserQuotaSummary();
        }

        // 3.2 Recovery listener for Window Minimize & Remote Desktop (RDP) session reconnect
        if (!window.__antigravityRdpRecoveryBound) {
          window.__antigravityRdpRecoveryBound = true;
          const handleRdpAndVisibilityRecovery = () => {
            if (!document.hidden && window.innerWidth > 0) {
              if (typeof window.__antigravityMountAll === 'function') {
                window.__antigravityMountAll();
              } else {
                mountAllMods();
              }
              if (typeof window.__syncAgentBadges === 'function') {
                window.__syncAgentBadges();
              }
            }
          };
          let resizeSyncRaf = null;
          const handleWindowResizeSync = () => {
            if (document.hidden || window.innerWidth <= 0) return;
            const applyResize = () => {
              resizeSyncRaf = null;
              if (document.hidden || window.innerWidth <= 0) return;
              const hasTrigger = document.querySelector('button[data-testid="model-selector-trigger"]');
              const hasSlot = document.querySelector('#antigravity-slot-header-actions, .antigravity-slot-header-actions');
              if (hasTrigger && !hasSlot) {
                handleRdpAndVisibilityRecovery();
              } else if (typeof window.__applyChatboxModsCompact === 'function') {
                window.__applyChatboxModsCompact();
              }
            };
            if (typeof requestAnimationFrame === 'function') {
              if (resizeSyncRaf !== null) return;
              resizeSyncRaf = requestAnimationFrame(applyResize);
            } else {
              applyResize();
            }
          };
          if (typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', handleRdpAndVisibilityRecovery);
          }
          if (typeof window.addEventListener === 'function') {
            window.addEventListener('focus', handleRdpAndVisibilityRecovery);
            window.addEventListener('resize', handleWindowResizeSync);
          }
        }

        // 4. Observe DOM mutations with smart slot check & self-mutation exclusion to avoid DOM thrashing
        if (window.__antigravityModObserver) {
          window.__antigravityModObserver.disconnect();
          window.__antigravityModObserver = null;
        }

        const isOwnedModNode = (node) => {
          if (!node || node.nodeType !== 1) return false;
          return Boolean(
            node.classList?.contains('antigravity-slot-container') ||
            node.classList?.contains('antigravity-voice-dock') ||
            (typeof node.id === 'string' && node.id.startsWith('antigravity-')) ||
            node.closest?.('.antigravity-slot-container, .antigravity-voice-dock, [id^="antigravity-"]')
          );
        };

        const hasExternalDomChanges = (mutations) => {
          if (!Array.isArray(mutations) || !mutations.length) return true;
          for (const m of mutations) {
            if (m.removedNodes && m.removedNodes.length) {
              for (const removed of m.removedNodes) {
                if (removed?.nodeType === 1 && (
                  removed.classList?.contains('antigravity-slot-container') ||
                  removed.querySelector?.('.antigravity-slot-container')
                )) {
                  return true;
                }
              }
            }
            if (!isOwnedModNode(m.target)) {
              return true;
            }
          }
          return false;
        };

        let mountDebounce = null;
        window.__antigravityModObserver = new MutationObserver((mutations) => {
          if (window.__antigravityIsMountingMods) return;
          if (!hasExternalDomChanges(mutations)) return;
          if (mountDebounce) return;
          mountDebounce = setTimeout(() => {
            mountDebounce = null;
            if (window.__antigravityIsMountingMods) return;
            if (typeof window.__dockNativeVoiceToast === 'function') {
              window.__dockNativeVoiceToast(document);
            }
            if (typeof window.__scanVoiceTranscriptsForAgent === 'function') {
              window.__scanVoiceTranscriptsForAgent();
            }
            const triggers = document.querySelectorAll('button[data-testid="model-selector-trigger"]');
            let missingSlot = false;
            for (const btn of triggers) {
              const parent = btn.parentElement;
              if (!parent) continue;
              if (parent.closest && parent.closest('[role="dialog"], [role="menu"], .agy-overlay')) continue;
              const row = parent.closest('.flex.items-center') || parent;
              if (!row.querySelector('#antigravity-slot-header-actions, .antigravity-slot-header-actions')) {
                missingSlot = true;
                break;
              }
            }

            if (!missingSlot) {
              const auxBtn = document.querySelector('button[data-testid="aux-pane-new-tab-button"], button[data-testid="side-panel-new-tab-button"], .aux-pane-new-tab-button, [data-active-tab-id], [data-side-panel-strip="true"]');
              if (auxBtn && !document.querySelector('.antigravity-slot-aux-pane-tab, #antigravity-slot-aux-pane-tab')) {
                missingSlot = true;
              }
            }
            if (!missingSlot) {
              const sidebarSlot = document.querySelector('.shrink-0 > .bg-sidebar');
              if (sidebarSlot && !document.querySelector('.antigravity-slot-menubar-actions, #antigravity-slot-menubar-actions')) {
                missingSlot = true;
              }
            }

            if (missingSlot) {
              mountAllMods();
            } else {
              if (typeof window.__syncAgentBadges === 'function') {
                window.__syncAgentBadges();
              }
              if (typeof window.__syncSubagentModelBadges === 'function') {
                window.__syncSubagentModelBadges();
              }
              if (typeof window.__observeNativeModelSelector === 'function') {
                window.__observeNativeModelSelector();
              }
            }
          }, 150);
        });

        window.__antigravityModObserver.observe(document.body, { childList: true, subtree: true });
        return {
          success: true,
          selectedAgentsMap: localStorage.getItem('__antigravity_selected_agents_map'),
          modelSlots: localStorage.getItem('__antigravity_model_slots')
        };
      })();
    `;
  }
}
