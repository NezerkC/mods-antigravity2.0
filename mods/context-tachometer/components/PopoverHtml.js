export function renderSvgIcon(name, size = 12, color = 'currentColor') {
  switch (name) {
    case 'zap':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="${color}" fill-opacity="0.2"/></svg>`;
    case 'clock':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    case 'calendar':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    case 'bot':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16" stroke-linecap="round"/><line x1="16" y1="16" x2="16" y2="16" stroke-linecap="round"/></svg>`;
    case 'scissors':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`;
    default:
      return '';
  }
}

/**
 * Builds the HTML for the rich context breakdown popover.
 */
export function renderPopoverHtml(metric) {
  const icon = typeof renderSvgIcon === 'function'
    ? renderSvgIcon
    : (typeof window !== 'undefined' && typeof window.__renderSvgIcon === 'function' ? window.__renderSvgIcon : () => '');
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

  const cleanModelName = (raw) => String(raw || '')
    .replace(/\\n/g, ' ')
    .split(/\r?\n/)[0]
    .replace(/\.\s*No need to comment[\s\S]*$/i, '')
    .replace(/\.\s*If reporting what model[\s\S]*$/i, '')
    .replace(/[`'"]/g, '')
    .replace(/\.\s*$/, '')
    .trim();

  const formatCompactTokens = (t) => {
    const num = Number(t) || 0;
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k';
    return String(num);
  };

  const renderCompactSource = (label, data, dotColor) => `
    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; padding: 2px 5px; background: rgba(255, 255, 255, 0.025); border-radius: 5px; color: #d4d4d8; white-space: nowrap;">
      <span style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis;">
        <span style="width: 6px; height: 6px; border-radius: 9999px; background: ${dotColor}; flex-shrink: 0;"></span>
        <span style="font-weight: 500; color: #a1a1aa;">${label}</span>
      </span>
      <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #e4e4e7; font-size: 9.5px; margin-left: 4px;">
        ${formatCompactTokens(data.tokens)} <span style="color: ${dotColor}; font-weight: 600;">(${data.pct}%)</span>
      </span>
    </div>
  `;

  const quota = m.modelQuota || null;
  const chatModels = Array.isArray(m.chatModels) ? m.chatModels : [];
  const compactions = Array.isArray(m.compactions) ? m.compactions : [];

  let compactionsHtml = '';
  if (compactions.length > 0) {
    const recentCompactions = compactions.slice(-4);
    const compactionRowsHtml = recentCompactions.map((c) => `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 10px; padding: 3px 0; border-top: 1px dashed rgba(255, 255, 255, 0.06); color: #d4d4d8; white-space: nowrap;">
        <span style="display: flex; align-items: center; gap: 4px; font-weight: 500; color: #e4e4e7;">
          ${icon('scissors', 11, '#22c55e')} Turno #${c.step}
        </span>
        <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 9.5px; flex-shrink: 0;">
          ${c.displayFrom} → <strong style="color: #22c55e;">${c.displayTo}</strong>
        </span>
      </div>
    `).join('');

    compactionsHtml = `
      <div style="margin-bottom: 10px; padding: 8px 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px;">
        <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; font-weight: 600; margin-bottom: 3px;">
          Historial de Compactación (/compact)
        </div>
        ${compactionRowsHtml}
      </div>
    `;
  }

  const getRemainingColor = (remainingPct) => {
    if (remainingPct <= 15) return '#ef4444';
    if (remainingPct <= 40) return '#f97316';
    if (remainingPct <= 75) return '#eab308';
    return '#22c55e';
  };

  let chatModelsLedgerHtml = '';
  if (chatModels.length > 0) {
    const modelRowsHtml = chatModels.map((cm) => {
      const safeName = cleanModelName(cm.modelName) || 'Gemini';
      const quotaShareText = cm.hasDualLimit
        ? `5h:${cm.chatRollingPct}% · 7d:${cm.chatWeeklyPct}%`
        : `7d:${cm.chatWeeklyPct}%`;
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 10px; padding: 3px 0; border-top: 1px dashed rgba(255, 255, 255, 0.06); color: #d4d4d8; white-space: nowrap;">
          <span style="display: flex; align-items: center; gap: 4px; font-weight: 500; color: #e4e4e7; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeName}">
            ${icon('bot', 12, '#38bdf8')} ${safeName}
          </span>
          <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 9.5px; flex-shrink: 0;">
            ${cm.displayTokens} <span style="color: #38bdf8; font-weight: 600;">(${quotaShareText})</span>
          </span>
        </div>
      `;
    }).join('');

    chatModelsLedgerHtml = `
      <div style="margin-top: 7px; padding-top: 5px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
        <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; font-weight: 600; margin-bottom: 3px;">
          Consumo por Modelo en este Chat
        </div>
        ${modelRowsHtml}
      </div>
    `;
  }

  let modelQuotaHtml = '';
  if (quota) {
    const safeQuotaModel = cleanModelName(quota.modelName) || (quota.hasDualLimit ? 'Gemini' : 'Gemini 4 Argon');
    if (quota.hasDualLimit) {
      const rollingRem = quota.rollingRemaining !== undefined ? quota.rollingRemaining : Math.max(0, 100 - (quota.rollingUsed || 0));
      const weeklyRem = quota.weeklyRemaining !== undefined ? quota.weeklyRemaining : Math.max(0, 100 - (quota.weeklyUsed || 0));
      const rollingColor = getRemainingColor(rollingRem);
      const weeklyColor = getRemainingColor(weeklyRem);

      modelQuotaHtml = `
        <div style="margin-bottom: 10px; padding: 8px 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #a1a1aa; font-weight: 600; flex-shrink: 0;">
              Cuota de Cuenta
            </span>
            <span style="font-size: 9.5px; color: #e4e4e7; background: rgba(255, 255, 255, 0.07); padding: 1px 6px; border-radius: 9999px; max-width: 155px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeQuotaModel}">
              ${safeQuotaModel}
            </span>
          </div>
          <div style="margin-bottom: 5px;">
            <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 2px; color: #d4d4d8; white-space: nowrap;">
              <span style="display: flex; align-items: center; gap: 5px;">
                ${icon('clock', 12, '#a1a1aa')}
                <span style="font-weight: 500;">${quota.rollingLabel || 'Cuota 5h Restante'}</span>
              </span>
              <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 10px;">
                <strong style="color: ${rollingColor};">${rollingRem}%</strong> <span style="color: #71717a; font-size: 9px;">(reset: ${quota.rollingReset || '5h'})</span>
              </span>
            </div>
            <div style="height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px; overflow: hidden;">
              <div style="width: ${Math.min(rollingRem, 100)}%; height: 100%; background: ${rollingColor}; border-radius: 9999px;"></div>
            </div>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 2px; color: #d4d4d8; white-space: nowrap;">
              <span style="display: flex; align-items: center; gap: 5px;">
                ${icon('calendar', 12, '#a1a1aa')}
                <span style="font-weight: 500;">${quota.weeklyLabel || 'Cuota Semanal Restante'}</span>
              </span>
              <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 10px;">
                <strong style="color: ${weeklyColor};">${weeklyRem}%</strong> <span style="color: #71717a; font-size: 9px;">(reset: ${quota.weeklyReset || '7d'})</span>
              </span>
            </div>
            <div style="height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px; overflow: hidden;">
              <div style="width: ${Math.min(weeklyRem, 100)}%; height: 100%; background: ${weeklyColor}; border-radius: 9999px;"></div>
            </div>
          </div>
          ${chatModelsLedgerHtml}
        </div>
      `;
    } else {
      const singleRem = quota.weeklyRemaining !== undefined ? quota.weeklyRemaining : (quota.remainingPct !== undefined ? quota.remainingPct : (quota.usagePct || 0));
      const singleColor = getRemainingColor(singleRem);

      modelQuotaHtml = `
        <div style="margin-bottom: 10px; padding: 8px 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 5px;">
            <span style="font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #a1a1aa; font-weight: 600; flex-shrink: 0;">
              Cuota de Cuenta
            </span>
            <span style="font-size: 9.5px; color: #e4e4e7; background: rgba(255, 255, 255, 0.07); padding: 1px 6px; border-radius: 9999px; max-width: 155px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeQuotaModel}">
              ${safeQuotaModel}
            </span>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 2px; color: #d4d4d8; white-space: nowrap;">
              <span style="display: flex; align-items: center; gap: 5px;">
                ${icon('calendar', 12, '#a1a1aa')}
                <span style="font-weight: 500;">${quota.singleLabel || 'Cuota Semanal Restante'}</span>
              </span>
              <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 10px;">
                <strong style="color: ${singleColor};">${singleRem}%</strong> <span style="color: #71717a; font-size: 9px;">(reset: ${quota.weeklyReset || quota.resetStr || '7d'})</span>
              </span>
            </div>
            <div style="height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px; overflow: hidden;">
              <div style="width: ${Math.min(singleRem, 100)}%; height: 100%; background: ${singleColor}; border-radius: 9999px;"></div>
            </div>
          </div>
          ${chatModelsLedgerHtml}
        </div>
      `;
    }
  }

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
          ${icon('zap', 14, '#38bdf8')}
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

      ${modelQuotaHtml}

      ${compactionsHtml}

      <!-- Compact Category Breakdown -->
      <div style="margin-bottom: 10px;">
        <div style="font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; font-weight: 600; margin-bottom: 5px;">Breakdown by Source</div>
        <div style="display: flex; height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px; overflow: hidden; margin-bottom: 6px;">
          <div style="width: ${Math.min(user.pct, 100)}%; background: #38bdf8;"></div>
          <div style="width: ${Math.min(model.pct, 100)}%; background: #a855f7;"></div>
          <div style="width: ${Math.min(thinking.pct, 100)}%; background: #ec4899;"></div>
          <div style="width: ${Math.min(tools.pct, 100)}%; background: #f59e0b;"></div>
          <div style="width: ${Math.min(mcp.pct, 100)}%; background: #10b981;"></div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 6px;">
          ${renderCompactSource('Prompts', user, '#38bdf8')}
          ${renderCompactSource('Replies', model, '#a855f7')}
          ${renderCompactSource('Thinking', thinking, '#ec4899')}
          ${renderCompactSource('Tools', tools, '#f59e0b')}
          ${renderCompactSource('MCP', mcp, '#10b981')}
        </div>
      </div>

      <!-- Footer Info -->
      <div style="padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.07); display: flex; justify-content: space-between; font-size: 10.5px; color: #71717a; font-family: ${FONT_MONO};">
        <span>Turns: <strong style="color: #a1a1aa;">${m.steps}</strong></span>
        <span>Storage: <strong style="color: #a1a1aa;">${m.sizeKb} KB</strong></span>
      </div>
    </div>
  `.trim();
}
