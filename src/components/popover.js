import { renderGaugeSvg } from './gauge.js';

const FONT_SANS = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/**
 * Builds the HTML and inline styles for the rich context breakdown popover.
 * Uses Antigravity's default native system font stacks and tabular numbers.
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
      user-select: none;
      backdrop-filter: blur(12px);
    ">
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 9px; margin-bottom: 11px;">
        <div style="display: flex; align-items: center; gap: 9px;">
          ${renderGaugeSvg(pctNum, 32)}
          <div>
            <div style="font-size: 12.5px; font-weight: 600; color: #fafafa;">Tacómetro de Contexto</div>
            <div style="font-size: 11px; color: #a1a1aa; font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums;">
              ~${m.estTokens.toLocaleString()} / 1.000.000 tokens
            </div>
          </div>
        </div>
        <div>
          <span style="font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 9999px; background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}44; font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums;">
            ${m.pct}%
          </span>
        </div>
      </div>

      <!-- Breakdown Bars -->
      <div style="margin-bottom: 10px;">
        <div style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; margin-bottom: 7px;">
          Desglose de Memoria
        </div>
        ${renderRow('👤', 'Mensajes Usuario', user, '#38bdf8')}
        ${renderRow('🤖', 'Respuestas Modelo', model, '#34d399')}
        ${renderRow('🧠', 'Razonamiento (CoT)', thinking, '#a78bfa')}
        ${renderRow('🛠️', 'Herramientas & Terminal', tools, '#fbbf24')}
        ${renderRow('🔌', 'Servidores MCP', mcp, '#f472b6')}
      </div>

      <!-- Footer Info -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 7px; font-size: 10px; color: #71717a;">
        <span>${m.steps || 0} turnos analizados</span>
        <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums;">${m.sizeKb || 0} KB</span>
      </div>
    </div>
  `.trim();
}
