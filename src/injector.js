import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAllMetrics } from './metrics.js';
import { renderGaugeSvg } from './components/gauge.js';
import { renderPopoverHtml } from './components/popover.js';

export async function injectContextUI() {
  const allMetrics = getAllMetrics();

  // Find CDP debugging port from Antigravity Electron logs
  const logDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity', 'logs');
  if (!fs.existsSync(logDir)) return;

  const logFiles = fs.readdirSync(logDir)
    .filter(f => f.endsWith('.log'))
    .map(f => ({ name: f, time: fs.statSync(path.join(logDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  let cdpPort = 53908;
  if (logFiles.length) {
    const content = fs.readFileSync(path.join(logDir, logFiles[0].name), 'utf-8');
    const match = content.match(/ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser/);
    if (match) cdpPort = Number(match[1]);
  }

  try {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
    const pages = await res.json();
    const page = pages.find(p => p.type === 'page');
    if (!page) return;

    const ws = new WebSocket(page.webSocketDebuggerUrl);

    ws.onopen = () => {
      const clientPayload = JSON.stringify(allMetrics);

      const code = `
        (() => {
          // 1. Clear ALL previous sync intervals
          if (window.__multiContextTrackerLoop) {
            clearInterval(window.__multiContextTrackerLoop);
            window.__multiContextTrackerLoop = null;
          }
          if (window.__contextTrackerLoop) {
            clearInterval(window.__contextTrackerLoop);
            window.__contextTrackerLoop = null;
          }
          if (window.__antigravityGaugeLoop) {
            clearInterval(window.__antigravityGaugeLoop);
            window.__antigravityGaugeLoop = null;
          }

          // 2. Register updated metrics
          window.__antigravityAllMetrics = ${clientPayload};

          // 3. Inject CSS Styles for Context Tachometer with Pin Expansion
          let styleEl = document.getElementById('antigravity-context-styles');
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'antigravity-context-styles';
            document.head.appendChild(styleEl);
          }

          styleEl.textContent = \`
            .antigravity-context-badge {
              display: inline-flex;
              align-items: center;
              height: 24px;
              border-radius: 9999px;
              user-select: none;
              background-color: rgba(255, 255, 255, 0.08);
              border: 1px solid rgba(255, 255, 255, 0.12);
              cursor: pointer;
              flex-shrink: 0;
              margin-left: 6px;
              white-space: nowrap;
              transition: background-color 0.15s ease, border-color 0.15s ease, padding 0.15s ease;
            }
            .antigravity-context-badge:hover {
              background-color: rgba(255, 255, 255, 0.14);
              border-color: rgba(255, 255, 255, 0.25);
            }
            /* Compact Mode (Icon Only): Active in split panels when unpinned */
            .antigravity-context-badge.compact:not(.pinned) {
              padding: 0 4px !important;
              gap: 0 !important;
            }
            .antigravity-context-badge.compact:not(.pinned) .badge-label-group {
              display: none !important;
            }
            /* Expanded Mode: Normal wide mode OR when Pinned by user */
            .antigravity-context-badge:not(.compact),
            .antigravity-context-badge.pinned {
              padding: 0 8px 0 6px !important;
              gap: 6px !important;
            }
            .antigravity-context-badge:not(.compact) .badge-label-group,
            .antigravity-context-badge.pinned .badge-label-group {
              display: inline-flex !important;
              align-items: center;
              gap: 3px;
            }
            /* Visual feedback for pinned state */
            .antigravity-context-badge.pinned {
              background-color: rgba(255, 255, 255, 0.16) !important;
              border-color: rgba(56, 189, 248, 0.5) !important;
              box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
            }
          \`;

          // 4. Helper for SVG Gauge (Analog Speedometer)
          function getGaugeSvg(pct, size) {
            const clamped = Math.min(Math.max(pct, 0), 100);
            const angle = -120 + (clamped / 100) * 240;

            let needleColor = '#22c55e';
            if (clamped >= 85) needleColor = '#ef4444';
            else if (clamped >= 60) needleColor = '#f97316';
            else if (clamped >= 25) needleColor = '#eab308';

            return \`
              <svg viewBox="0 0 100 100" width="\${size}" height="\${size}" style="vertical-align: middle; flex-shrink: 0; overflow: visible; pointer-events: none;">
                <defs>
                  <linearGradient id="antigravityGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#22c55e" />
                    <stop offset="35%" stop-color="#eab308" />
                    <stop offset="70%" stop-color="#f97316" />
                    <stop offset="100%" stop-color="#ef4444" />
                  </linearGradient>
                </defs>
                <path d="M 18.82 68 A 36 36 0 1 1 81.18 68" fill="none" stroke="rgba(255, 255, 255, 0.15)" stroke-width="10" stroke-linecap="round" />
                <path d="M 18.82 68 A 36 36 0 1 1 81.18 68" fill="none" stroke="url(#antigravityGaugeGrad)" stroke-width="10" stroke-linecap="round" />
                <g style="transform-origin: 50px 50px; transform: rotate(\${angle.toFixed(1)}deg); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);">
                  <polygon points="46.5,50 50,14 53.5,50" fill="\${needleColor}" />
                </g>
                <circle cx="50" cy="50" r="10" fill="#18181b" stroke="#ffffff" stroke-width="2" />
                <circle cx="50" cy="50" r="3.5" fill="#ffffff" />
              </svg>
            \`.trim();
          }

          // 5. Global popover state & elements
          let isHoveringBadge = false;
          let isHoveringPopover = false;
          let activePinnedBadge = null;
          let hideTimer = null;

          function unpinAll() {
            activePinnedBadge = null;
            document.querySelectorAll('.antigravity-context-badge.pinned').forEach(b => {
              b.classList.remove('pinned');
            });
            scheduleHide(0);
          }

          let popover = document.getElementById('antigravity-context-popover');
          if (!popover) {
            popover = document.createElement('div');
            popover.id = 'antigravity-context-popover';
            popover.style.position = 'fixed';
            popover.style.zIndex = '999999';
            popover.style.display = 'none';
            popover.style.opacity = '0';
            popover.style.transform = 'translateY(6px)';
            popover.style.transition = 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
            popover.style.pointerEvents = 'auto';
            document.body.appendChild(popover);

            popover.addEventListener('mouseenter', () => {
              isHoveringPopover = true;
              if (hideTimer) clearTimeout(hideTimer);
            });

            popover.addEventListener('mouseleave', () => {
              isHoveringPopover = false;
              scheduleHide();
            });

            document.addEventListener('click', (e) => {
              if (activePinnedBadge && !popover.contains(e.target) && !e.target.closest('.antigravity-context-badge')) {
                unpinAll();
              }
            });

            document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                unpinAll();
              }
            });
          }

          function scheduleHide(delay = 220) {
            if (activePinnedBadge) return;
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
              if (!isHoveringBadge && !isHoveringPopover && !activePinnedBadge) {
                popover.style.opacity = '0';
                popover.style.transform = 'translateY(6px)';
                setTimeout(() => {
                  if (!isHoveringBadge && !isHoveringPopover && !activePinnedBadge) {
                    popover.style.display = 'none';
                  }
                }, 200);
              }
            }, delay);
          }

          function showPopover(badgeEl, m) {
            if (hideTimer) clearTimeout(hideTimer);

            const b = m.breakdown || {};
            const user = b.user || { tokens: 0, pct: 0 };
            const model = b.model || { tokens: 0, pct: 0 };
            const thinking = b.thinking || { tokens: 0, pct: 0 };
            const tools = b.tools || { tokens: 0, pct: 0 };
            const mcp = b.mcp || { tokens: 0, pct: 0 };

            let statusColor = '#22c55e';
            const pctNum = m.pctNumber || parseFloat(m.pct) || 0;
            if (pctNum >= 85) statusColor = '#ef4444';
            else if (pctNum >= 60) statusColor = '#f97316';
            else if (pctNum >= 25) statusColor = '#eab308';

            const isPinned = activePinnedBadge === badgeEl;

            const row = (icon, label, data, barColor) => \`
              <div style="margin-bottom: 7px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; color: #d4d4d8;">
                  <span style="display: flex; align-items: center; gap: 5px;">
                    <span>\${icon}</span>
                    <span style="font-weight: 500;">\${label}</span>
                  </span>
                  <span style="font-family: monospace; color: #a1a1aa; font-size: 10.5px;">
                    \${data.tokens.toLocaleString()} tok <span style="color: \${barColor}; font-weight: 600;">(\${data.pct}%)</span>
                  </span>
                </div>
                <div style="height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px; overflow: hidden;">
                  <div style="width: \${Math.min(data.pct, 100)}%; height: 100%; background: \${barColor}; border-radius: 9999px;"></div>
                </div>
              </div>
            \`;

            popover.innerHTML = \`
              <div style="
                width: 295px;
                padding: 13px 14px;
                background: #18181b;
                color: #f4f4f5;
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 12px;
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                user-select: none;
              ">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 9px; margin-bottom: 11px;">
                  <div style="display: flex; align-items: center; gap: 9px;">
                    \${getGaugeSvg(pctNum, 32)}
                    <div>
                      <div style="font-size: 12.5px; font-weight: 600; color: #fafafa;">Tacómetro de Contexto</div>
                      <div style="font-size: 11px; color: #a1a1aa; font-family: monospace;">~\${m.estTokens.toLocaleString()} / 1.000.000 tokens</div>
                    </div>
                  </div>
                  <span style="font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 9999px; background: \${statusColor}22; color: \${statusColor}; border: 1px solid \${statusColor}44;">
                    \${m.pct}%
                  </span>
                </div>
                <div style="margin-bottom: 10px;">
                  <div style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; margin-bottom: 7px;">
                    Desglose de Memoria
                  </div>
                  \${row('👤', 'Mensajes Usuario', user, '#38bdf8')}
                  \${row('🤖', 'Respuestas Modelo', model, '#34d399')}
                  \${row('🧠', 'Razonamiento (CoT)', thinking, '#a78bfa')}
                  \${row('🛠️', 'Herramientas & Terminal', tools, '#fbbf24')}
                  \${row('🔌', 'Servidores MCP', mcp, '#f472b6')}
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 7px; font-size: 10px; color: #71717a;">
                  <span>\${m.steps || 0} turnos analizados</span>
                  <span style="display: flex; align-items: center; gap: 4px;">
                    <span>\${m.sizeKb || 0} KB</span>
                    \${isPinned ? '<span style="color: #38bdf8; font-weight: 600;">(Fijado)</span>' : ''}
                  </span>
                </div>
              </div>
            \`;

            const rect = badgeEl.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            if (spaceBelow < 280 && spaceAbove > 240) {
              popover.style.top = 'auto';
              popover.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
              popover.style.transform = 'translateY(6px)';
            } else {
              popover.style.bottom = 'auto';
              popover.style.top = (rect.bottom + 8) + 'px';
              popover.style.transform = 'translateY(-6px)';
            }

            const left = Math.max(10, Math.min(window.innerWidth - 315, rect.left - 40));
            popover.style.left = left + 'px';
            popover.style.display = 'block';

            requestAnimationFrame(() => {
              popover.style.opacity = '1';
              popover.style.transform = 'translateY(0)';
            });
          }

          // 6. ResizeObserver for responsive compact mode in split panels
          if (!window.__antigravityResizeObserver) {
            window.__antigravityResizeObserver = new ResizeObserver((entries) => {
              for (const entry of entries) {
                const row = entry.target;
                const badge = row.querySelector('.antigravity-context-badge');
                if (badge) {
                  if (entry.contentRect.width < 265) {
                    badge.classList.add('compact');
                  } else {
                    badge.classList.remove('compact');
                  }
                }
              }
            });
          }

          // 7. Sync badges across all visible panels
          function syncAll() {
            const metricsMap = window.__antigravityAllMetrics || {};
            const triggers = Array.from(document.querySelectorAll('button[data-testid="model-selector-trigger"]'))
              .filter(btn => btn.offsetParent !== null);

            for (const trigger of triggers) {
              let el = trigger;
              let convId = null;
              while (el && el !== document.body) {
                for (const attr of el.getAttributeNames ? el.getAttributeNames() : []) {
                  const val = el.getAttribute(attr);
                  if (val && /[0-9a-fA-F-]{36}/.test(val)) {
                    convId = val;
                    break;
                  }
                }
                if (convId) break;
                el = el.parentElement;
              }

              const m = metricsMap[convId] || {
                estTokens: 0,
                pct: '0.0',
                pctNumber: 0,
                displayTokens: '0',
                sizeKb: 0,
                steps: 0,
                breakdown: { user: { tokens: 0, pct: 0 }, model: { tokens: 0, pct: 0 }, thinking: { tokens: 0, pct: 0 }, tools: { tokens: 0, pct: 0 }, mcp: { tokens: 0, pct: 0 } }
              };

              const parentRow = trigger.parentElement;
              if (!parentRow) continue;

              parentRow.style.display = 'flex';
              parentRow.style.alignItems = 'center';
              parentRow.style.flexWrap = 'nowrap';

              // Observe row for responsive auto-collapse
              window.__antigravityResizeObserver.observe(parentRow);

              // Remove existing older version badges
              let badge = parentRow.querySelector('.antigravity-context-badge');
              if (badge && badge.__v !== 7) {
                badge.remove();
                badge = null;
              }

              if (!badge) {
                badge = document.createElement('div');
                badge.__v = 7;
                badge.className = 'antigravity-context-badge';

                if (parentRow.offsetWidth < 265) {
                  badge.classList.add('compact');
                }

                badge.addEventListener('mouseenter', () => {
                  isHoveringBadge = true;
                  showPopover(badge, badge.__currentMetric || m);
                });

                badge.addEventListener('mouseleave', () => {
                  isHoveringBadge = false;
                  scheduleHide();
                });

                badge.addEventListener('click', (e) => {
                  e.stopPropagation();
                  if (activePinnedBadge === badge) {
                    unpinAll();
                  } else {
                    unpinAll();
                    activePinnedBadge = badge;
                    badge.classList.add('pinned');
                    showPopover(badge, badge.__currentMetric || m);
                  }
                });

                if (trigger.nextSibling) {
                  parentRow.insertBefore(badge, trigger.nextSibling);
                } else {
                  parentRow.appendChild(badge);
                }
              }

              badge.__currentMetric = m;
              const pctNum = m.pctNumber || parseFloat(m.pct) || 0;

              if (badge.__lastTokens !== m.estTokens) {
                badge.__lastTokens = m.estTokens;

                let statusColor = '#22c55e';
                if (pctNum >= 85) statusColor = '#ef4444';
                else if (pctNum >= 60) statusColor = '#f97316';
                else if (pctNum >= 25) statusColor = '#eab308';

                badge.title = 'Contexto: ' + m.estTokens.toLocaleString() + ' tokens (' + m.pct + '%) de 1M - Clic para fijar';

                badge.innerHTML = \`
                  \${getGaugeSvg(pctNum, 17)}
                  <span class="badge-label-group">
                    <span style="font-weight: 600; color: \${statusColor}; font-family: monospace; pointer-events: none;">\${m.displayTokens}</span>
                    <span style="opacity: 0.45; font-size: 10px; pointer-events: none;">/1M</span>
                    <span style="background: \${statusColor}22; color: \${statusColor}; padding: 0 4px; border-radius: 9999px; font-size: 9.5px; font-weight: 600; margin-left: 2px; pointer-events: none;">\${m.pct}%</span>
                  </span>
                \`;
              }
            }
          }

          syncAll();
          window.__antigravityGaugeLoop = setInterval(syncAll, 1200);
          return "Context Tachometer v7 with Pinned-Expansion initialized!";
        })()
      `;

      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: code }
      }));
    };

    ws.onmessage = () => {
      ws.close();
    };
  } catch (err) {
    // Fail silently
  }
}
