// Generated automatically by build.js - Antigravity 2.0 Context Tachometer Mod
import fs from 'fs';
import path from 'path';
import os from 'os';




/**
 * Calculates detailed context metrics for all active conversations in the brain.
 * Computes exact breakdown: user prompts, model responses, thinking (CoT),
 * local tools execution, and MCP tool interactions.
 */
function getAllMetrics() {
  const metrics = {};
  try {
    const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    if (!fs.existsSync(brainDir)) return metrics;

    const dirs = fs.readdirSync(brainDir).filter(d => /^[0-9a-fA-F-]{36}$/.test(d));

    for (const convId of dirs) {
      const fullPath = path.join(brainDir, convId, '.system_generated', 'logs', 'transcript_full.jsonl');
      const compactPath = path.join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');

      let targetPath = '';
      if (fs.existsSync(fullPath)) targetPath = fullPath;
      else if (fs.existsSync(compactPath)) targetPath = compactPath;

      if (!targetPath) {
        metrics[convId] = getEmptyMetric();
        continue;
      }

      metrics[convId] = parseTranscript(targetPath);
    }
  } catch (err) {
    // Fail silently to prevent crashing background hooks
  }
  return metrics;
}

function getEmptyMetric() {
  return {
    estTokens: 0,
    pct: '0.0',
    displayTokens: '0',
    sizeKb: 0,
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

function parseTranscript(filePath) {
  try {
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

    let lastToolName = '';

    for (const line of lines) {
      if (!line.trim()) continue;
      raw.totalChars += line.length;
      raw.steps++;

      try {
        const item = JSON.parse(line);
        const len = (item.content || '').length;

        if (item.type === 'USER_INPUT') {
          raw.userChars += len;
        } else if (item.type === 'PLANNER_RESPONSE') {
          raw.modelChars += len;
          raw.thinkingChars += (item.thinking || '').length;
          if (item.tool_calls && Array.isArray(item.tool_calls) && item.tool_calls.length) {
            lastToolName = item.tool_calls[0].name || '';
          }
        } else if (item.type === 'GENERIC') {
          if (lastToolName.startsWith('mcp_') || lastToolName === 'call_mcp_tool') {
            raw.mcpChars += len;
          } else {
            raw.toolsChars += len;
          }
        } else {
          raw.otherChars += len;
        }
      } catch (parseErr) {
        raw.otherChars += line.length;
      }
    }

    const estTokens = Math.max(1, Math.round(raw.totalChars / 3.8));
    const pctVal = Math.min(100, Math.max(0, (estTokens / 1_000_000) * 100));
    const pct = pctVal.toFixed(1);
    const displayTokens = estTokens >= 1000 ? (estTokens / 1000).toFixed(1) + 'k' : String(estTokens);

    const calcCategory = (chars) => {
      const tokens = Math.round(chars / 3.8);
      const categoryPct = estTokens > 0 ? Math.round((tokens / estTokens) * 100) : 0;
      return { tokens, pct: categoryPct };
    };

    return {
      estTokens,
      pct,
      pctNumber: pctVal,
      displayTokens,
      sizeKb: Math.round(totalBytes / 1024),
      steps: raw.steps,
      breakdown: {
        user: calcCategory(raw.userChars),
        model: calcCategory(raw.modelChars),
        thinking: calcCategory(raw.thinkingChars),
        tools: calcCategory(raw.toolsChars),
        mcp: calcCategory(raw.mcpChars),
        other: calcCategory(raw.otherChars)
      }
    };
  } catch (err) {
    return getEmptyMetric();
  }
}








async function injectContextUI() {
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

          // 3. Helper for SVG Gauge (Analog Speedometer matching reference)
          function getGaugeSvg(pct, size) {
            const clamped = Math.min(Math.max(pct, 0), 100);
            const angle = -120 + (clamped / 100) * 240;
            const dashLength = 150.8;
            const circumference = 226.19;
            return \`
              <svg viewBox="0 0 100 100" width="\${size}" height="\${size}" style="vertical-align: middle; flex-shrink: 0; overflow: visible;">
                <defs>
                  <linearGradient id="antigravityGaugeGrad" x1="0%" y1="100%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#22c55e" />
                    <stop offset="35%" stop-color="#eab308" />
                    <stop offset="70%" stop-color="#f97316" />
                    <stop offset="100%" stop-color="#ef4444" />
                  </linearGradient>
                </defs>
                <!-- Background Arc -->
                <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255, 255, 255, 0.15)" stroke-width="10" stroke-dasharray="\${dashLength} \${circumference}" stroke-linecap="round" transform="rotate(150 50 50)" />
                <!-- Rainbow Arc -->
                <circle cx="50" cy="50" r="36" fill="none" stroke="url(#antigravityGaugeGrad)" stroke-width="10" stroke-dasharray="\${dashLength} \${circumference}" stroke-linecap="round" transform="rotate(150 50 50)" />
                <!-- Needle -->
                <g style="transform-origin: 50px 50px; transform: rotate(\${angle.toFixed(1)}deg); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);">
                  <polygon points="46.5,50 50,14 53.5,50" fill="#ef4444" />
                </g>
                <!-- Center Hub -->
                <circle cx="50" cy="50" r="10" fill="#18181b" stroke="#ffffff" stroke-width="2" />
                <circle cx="50" cy="50" r="3.5" fill="#ffffff" />
              </svg>
            \`.trim();
          }

          // 4. Global popover element in document.body
          let popover = document.getElementById('antigravity-context-popover');
          if (!popover) {
            popover = document.createElement('div');
            popover.id = 'antigravity-context-popover';
            popover.style.position = 'fixed';
            popover.style.zIndex = '999999';
            popover.style.display = 'none';
            popover.style.opacity = '0';
            popover.style.transform = 'translateY(-4px)';
            popover.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
            popover.style.pointerEvents = 'auto';
            document.body.appendChild(popover);

            let hideTimer = null;
            popover.addEventListener('mouseenter', () => {
              if (hideTimer) clearTimeout(hideTimer);
            });
            popover.addEventListener('mouseleave', () => {
              hideTimer = setTimeout(() => {
                popover.style.opacity = '0';
                popover.style.transform = 'translateY(-4px)';
                setTimeout(() => { popover.style.display = 'none'; }, 180);
              }, 120);
            });
            window.__antigravityPopoverHide = () => {
              popover.style.opacity = '0';
              popover.style.transform = 'translateY(-4px)';
              setTimeout(() => { popover.style.display = 'none'; }, 180);
            };
          }

          function showPopover(badgeEl, m) {
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
                      <div style="font-size: 12.5px; font-weight: 600; color: #fafafa;">Ventana de Contexto</div>
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
                  <span>\${m.sizeKb || 0} KB memoria</span>
                </div>
              </div>
            \`;

            const rect = badgeEl.getBoundingClientRect();
            popover.style.left = Math.max(10, Math.min(window.innerWidth - 310, rect.left - 100)) + 'px';
            popover.style.top = (rect.bottom + 8) + 'px';
            popover.style.display = 'block';

            requestAnimationFrame(() => {
              popover.style.opacity = '1';
              popover.style.transform = 'translateY(0)';
            });
          }

          // 5. Sync badges across all visible panels
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

              // Remove existing older version badges
              let badge = parentRow.querySelector('.antigravity-context-badge');
              if (badge && badge.__v !== 3) {
                badge.remove();
                badge = null;
              }

              if (!badge) {
                badge = document.createElement('div');
                badge.__v = 3;
                badge.className = 'antigravity-context-badge';
                badge.style.display = 'inline-flex';
                badge.style.alignItems = 'center';
                badge.style.height = '24px';
                badge.style.gap = '6px';
                badge.style.borderRadius = '9999px';
                badge.style.padding = '0 8px 0 6px';
                badge.style.fontSize = '11px';
                badge.style.userSelect = 'none';
                badge.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                badge.style.color = '#a1a1aa';
                badge.style.border = '1px solid rgba(255, 255, 255, 0.12)';
                badge.style.cursor = 'pointer';
                badge.style.flexShrink = '0';
                badge.style.marginLeft = '8px';
                badge.style.whiteSpace = 'nowrap';
                badge.style.transition = 'background-color 0.15s ease, border-color 0.15s ease';

                let leaveTimeout = null;
                badge.addEventListener('mouseenter', () => {
                  badge.style.backgroundColor = 'rgba(255, 255, 255, 0.14)';
                  badge.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                  if (leaveTimeout) clearTimeout(leaveTimeout);
                  showPopover(badge, badge.__currentMetric || m);
                });

                badge.addEventListener('mouseleave', () => {
                  badge.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  badge.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                  leaveTimeout = setTimeout(() => {
                    if (window.__antigravityPopoverHide) window.__antigravityPopoverHide();
                  }, 120);
                });

                badge.addEventListener('click', (e) => {
                  e.stopPropagation();
                  showPopover(badge, badge.__currentMetric || m);
                });

                if (trigger.nextSibling) {
                  parentRow.insertBefore(badge, trigger.nextSibling);
                } else {
                  parentRow.appendChild(badge);
                }
              }

              badge.__currentMetric = m;
              const pctNum = m.pctNumber || parseFloat(m.pct) || 0;

              badge.innerHTML = \`
                \${getGaugeSvg(pctNum, 17)}
                <span style="font-weight: 600; color: #38bdf8; font-family: monospace;">\${m.displayTokens}</span>
                <span style="opacity: 0.45; font-size: 10px;">/1M</span>
                <span style="background: rgba(56, 189, 248, 0.16); color: #38bdf8; padding: 0 4px; border-radius: 9999px; font-size: 9.5px; font-weight: 600; margin-left: 2px;">\${m.pct}%</span>
              \`;
            }
          }

          syncAll();
          window.__antigravityGaugeLoop = setInterval(syncAll, 1200);
          return "Gauge and breakdown popover v3 initialized!";
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


injectContextUI();
