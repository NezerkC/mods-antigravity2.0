import { renderGaugeSvg } from './gauge.js';

/**
 * Builds the HTML and inline styles for the rich context breakdown popover.
 */
export function renderPopoverHtml(metric) {
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
  let statusText = 'Normal';
  const pctNum = m.pctNumber || parseFloat(m.pct) || 0;

  if (pctNum >= 85) {
    statusColor = '#ef4444';
    statusText = 'Crítico';
  } else if (pctNum >= 60) {
    statusColor = '#f97316';
    statusText = 'Elevado';
  } else if (pctNum >= 25) {
    statusColor = '#eab308';
    statusText = 'Moderado';
  }

  const renderRow = (icon, label, data, barColor) => `
    <div style="margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; color: #d4d4d8;">
        <span style="display: flex; align-items: center; gap: 5px;">
          <span>${icon}</span>
          <span style="font-weight: 500;">${label}</span>
        </span>
        <span style="font-family: monospace; color: #a1a1aa;">
          ${data.tokens.toLocaleString()} tok <span style="color: ${barColor}; font-weight: 600;">(${data.pct}%)</span>
        </span>
      </div>
      <div style="height: 5px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px; overflow: hidden;">
        <div style="width: ${Math.min(data.pct, 100)}%; height: 100%; background: ${barColor}; border-radius: 9999px; transition: width 0.3s ease;"></div>
      </div>
    </div>
  `;

  return `
    <div class="antigravity-popover-content" style="
      width: 290px;
      padding: 14px;
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      user-select: none;
      backdrop-filter: blur(12px);
    ">
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 10px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${renderGaugeSvg(pctNum, 36)}
          <div>
            <div style="font-size: 13px; font-weight: 600; color: #fafafa; display: flex; align-items: center; gap: 6px;">
              Ventana de Contexto
            </div>
            <div style="font-size: 11px; color: #a1a1aa; font-family: monospace;">
              ~${m.estTokens.toLocaleString()} / 1.000.000 tokens
            </div>
          </div>
        </div>
        <div style="text-align: right;">
          <span style="
            display: inline-block;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 9999px;
            background: ${statusColor}22;
            color: ${statusColor};
            border: 1px solid ${statusColor}44;
          ">
            ${m.pct}%
          </span>
        </div>
      </div>

      <!-- Breakdown Bars -->
      <div style="margin-bottom: 12px;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; margin-bottom: 8px;">
          Distribución de Contexto
        </div>
        ${renderRow('👤', 'Mensajes Usuario', user, '#38bdf8')}
        ${renderRow('🤖', 'Respuestas Modelo', model, '#34d399')}
        ${renderRow('🧠', 'Razonamiento (CoT)', thinking, '#a78bfa')}
        ${renderRow('🛠️', 'Herramientas & Terminal', tools, '#fbbf24')}
        ${renderRow('🔌', 'Servidores MCP', mcp, '#f472b6')}
      </div>

      <!-- Footer Info -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px; font-size: 10px; color: #71717a;">
        <span>${m.steps} turnos analizados</span>
        <span>${m.sizeKb} KB memoria</span>
      </div>
    </div>
  `.trim();
}
