export function renderSvgIcon(name, size = 12, color = 'currentColor') {
  switch (name) {
    case 'zap':
      return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="${color}" fill-opacity="0.2"/></svg>`;
    case 'clock':
      return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    case 'calendar':
      return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    case 'bot':
      return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16" stroke-linecap="round"/><line x1="16" y1="16" x2="16" y2="16" stroke-linecap="round"/></svg>`;
    case 'scissors':
      return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`;
    case 'chevron-right':
      return `<svg class="tach-details-chevron" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>`;
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

  const escapeHtml = (val) => String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const getSubagentStatusColor = (status) => {
    if (status === 'running') return '#38bdf8';
    if (status === 'killed') return '#71717a';
    return '#22c55e';
  };

  const totalSubagentsCount = Array.isArray(m.subagents) && m.subagents.length > 0
    ? m.subagents.length
    : chatModels.reduce((sum, cm) => sum + (Array.isArray(cm.subagents) ? cm.subagents.length : 0), 0);

  const resolveLocalVisualMeta = (rawName) => {
    const cleaned = cleanModelName(rawName) || 'Gemini 3.8 Flash';
    const lower = cleaned.toLowerCase();
    let color = '#94a3b8';
    let poolId = 'gemini_unified';
    let poolLabel = 'Gemini Unificado';

    if (/argon|g1-pro/i.test(lower)) {
      color = '#38bdf8';
      poolId = 'argon_weekly';
      poolLabel = 'Argon Semanal';
    } else if (/opus/i.test(lower)) {
      color = '#c084fc';
      poolId = 'third_party';
      poolLabel = 'Claude / GPT-OSS';
    } else if (/sonnet|claude/i.test(lower)) {
      color = '#a78bfa';
      poolId = 'third_party';
      poolLabel = 'Claude / GPT-OSS';
    } else if (/gpt-oss|gpt|120b/i.test(lower)) {
      color = '#f472b6';
      poolId = 'third_party';
      poolLabel = 'Claude / GPT-OSS';
    } else if (/neon/i.test(lower)) {
      color = '#a3e635';
    } else if (/hydrogen/i.test(lower)) {
      color = '#34d399';
    } else if (/flash|gemini/i.test(lower)) {
      color = '#fbbf24';
    }

    let shortName = cleaned;
    if (/orchestrator/i.test(lower)) {
      shortName = lower.includes('neon') ? 'Orch. Neon' : 'Orchestrator';
    } else {
      shortName = cleaned
        .replace(/^Gemini\s+4\s+/i, '')
        .replace(/^Gemini\s+([\d.]+)\s+Flash/i, 'Flash $1')
        .replace(/^Claude\s+/i, '')
        .replace(/\(([^)]+)\)/g, (_, eff) => {
          const e = eff.trim();
          return /^medium$/i.test(e) ? 'Med' : e;
        })
        .replace(/\s+/g, ' ')
        .trim();
      if (/^GPT-OSS/i.test(shortName)) {
        shortName = 'GPT-OSS 120B';
      }
    }

    return { color, shortName, poolId, poolLabel };
  };

  let chatModelsLedgerHtml = '';
  if (chatModels.length > 0) {
    const modelRowsHtml = chatModels.map((cm) => {
      const meta = resolveLocalVisualMeta(cm.modelName);
      const dotColor = cm.color || meta.color;
      const displayName = escapeHtml(cm.shortName || cleanModelName(cm.modelName) || 'Gemini');
      const fullName = escapeHtml(cleanModelName(cm.modelName) || displayName);
      const safeName = escapeHtml(cleanModelName(cm.modelName) || 'Gemini');
      const safePool = escapeHtml(cm.poolLabel || meta.poolLabel);
      const quotaShareText = cm.hasDualLimit
        ? `5h:${cm.chatRollingPct}% · 7d:${cm.chatWeeklyPct}%`
        : `7d:${cm.chatWeeklyPct}%`;
      const modelSubs = Array.isArray(cm.subagents) ? cm.subagents : [];

      if (modelSubs.length === 0) {
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 10px; padding: 3px 0; border-top: 1px dashed rgba(255, 255, 255, 0.06); color: #d4d4d8; white-space: nowrap;">
            <span style="display: flex; align-items: center; gap: 5px; font-weight: 500; color: #e4e4e7; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fullName} · ${safePool}">
              <span style="width: 6px; height: 6px; border-radius: 9999px; background: ${dotColor}; box-shadow: 0 0 5px ${dotColor}88; flex-shrink: 0;"></span>
              <span style="overflow: hidden; text-overflow: ellipsis;">${displayName}</span>
            </span>
            <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 9.5px; flex-shrink: 0;">
              ${cm.displayTokens} <span style="color: ${dotColor}; font-weight: 600;">(${quotaShareText})</span>
            </span>
          </div>
        `;
      }

      const subagentItemsHtml = modelSubs.map((sub) => {
        const subRole = escapeHtml(sub.role || sub.typeName || 'Subagent');
        const modeLabel = sub.isInherited ? 'inherit' : escapeHtml(sub.requestedModel || 'explicit');
        const subDotColor = getSubagentStatusColor(sub.status);
        const subTokensText = escapeHtml(sub.displayTokens || formatCompactTokens(sub.tokens));
        const indentPrefix = (Number(sub.depth) || 0) > 0 ? '↳ ' : '';

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 5px; font-size: 9.5px; padding: 1.5px 2px; color: #d4d4d8; white-space: nowrap;">
            <span style="display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden;">
              <span style="width: 5px; height: 5px; border-radius: 9999px; background: ${subDotColor}; flex-shrink: 0;"></span>
              <span style="overflow: hidden; text-overflow: ellipsis; color: #e4e4e7;">${indentPrefix}${subRole}</span>
            </span>
            <span style="display: flex; align-items: center; gap: 4px; flex-shrink: 0; font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; font-size: 9px; color: #a1a1aa;">
              <span style="padding: 0 4px; border-radius: 4px; background: rgba(255, 255, 255, 0.06); color: #94a3b8; font-size: 8.5px;">${modeLabel}</span>
              <span>${subTokensText}</span>
            </span>
          </div>
        `;
      }).join('');

      return `
        <details class="tach-model-details" data-model-key="${safeName}">
          <summary class="tach-model-summary">
            <span style="display: flex; align-items: center; gap: 4px; font-weight: 500; color: #e4e4e7; min-width: 0; overflow: hidden;" title="${fullName} · ${safePool}">
              ${icon('chevron-right', 11, 'currentColor')}
              <span style="width: 6px; height: 6px; border-radius: 9999px; background: ${dotColor}; box-shadow: 0 0 5px ${dotColor}88; flex-shrink: 0;"></span>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 112px;">${displayName}</span>
              <span style="padding: 0 5px; border-radius: 9999px; background: rgba(56, 189, 248, 0.14); color: #38bdf8; font-size: 8.5px; font-weight: 600; flex-shrink: 0;">${modelSubs.length} sub</span>
            </span>
            <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 9.5px; flex-shrink: 0;">
              ${cm.displayTokens} <span style="color: ${dotColor}; font-weight: 600;">(${quotaShareText})</span>
            </span>
          </summary>
          <div class="tach-subagent-list">
            ${subagentItemsHtml}
          </div>
        </details>
      `;
    }).join('');

    const totalSubBadgeHtml = totalSubagentsCount > 0
      ? `<span class="tach-subagent-total-pill" style="font-size: 8.5px; text-transform: none; letter-spacing: 0; padding: 1px 6px; border-radius: 9999px; background: rgba(56, 189, 248, 0.14); color: #38bdf8; font-weight: 600;">${totalSubagentsCount} subagente${totalSubagentsCount === 1 ? '' : 's'}</span>`
      : '';

    chatModelsLedgerHtml = `
      <div style="margin-top: 7px; padding-top: 5px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; font-weight: 600; margin-bottom: 3px;">
          <span>Consumo por Modelo en este Chat</span>
          ${totalSubBadgeHtml}
        </div>
        ${modelRowsHtml}
      </div>
    `;
  }

  // Claude-style 10x10 Waffle Grid + 3 Quota Pools
  const buildLocalWaffleCells = () => {
    if (Array.isArray(m.waffleCells) && m.waffleCells.length === 100) {
      return m.waffleCells;
    }
    const limit = 1_000_000;
    const est = Number(m.estTokens) || ((user.tokens || 0) + (model.tokens || 0) + (thinking.tokens || 0) + (tools.tokens || 0) + (mcp.tokens || 0));
    const cats = [
      { key: 'user', label: 'Prompts', color: '#38bdf8', tokens: user.tokens || 0 },
      { key: 'model', label: 'Replies', color: '#a855f7', tokens: model.tokens || 0 },
      { key: 'thinking', label: 'Thinking', color: '#ec4899', tokens: thinking.tokens || 0 },
      { key: 'tools', label: 'Tools', color: '#f59e0b', tokens: tools.tokens || 0 },
      { key: 'mcp', label: 'MCP', color: '#10b981', tokens: mcp.tokens || 0 }
    ];
    const known = cats.reduce((s, c) => s + c.tokens, 0);
    if (est > known) {
      cats.push({ key: 'other', label: 'Context', color: '#64748b', tokens: est - known });
    }
    let used = est > 0 ? Math.min(100, Math.round(est / 10_000)) : 0;
    if (est > 0 && used === 0) used = 1;
    const counts = cats.map(c => {
      const exact = est > 0 ? (c.tokens / est) * used : 0;
      return { ...c, exact, cells: Math.floor(exact) };
    });
    let alloc = counts.reduce((s, c) => s + c.cells, 0);
    const rem = counts.filter(c => c.tokens > 0).sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
    let idx = 0;
    while (alloc < used && rem.length > 0) {
      rem[idx % rem.length].cells++;
      alloc++;
      idx++;
    }
    const cells = [];
    for (const c of counts) {
      const pct = est > 0 ? Number(((c.tokens / limit) * 100).toFixed(1)) : 0;
      for (let i = 0; i < c.cells && cells.length < 100; i++) {
        cells.push({ key: c.key, label: c.label, color: c.color, tokens: c.tokens, pct });
      }
    }
    const freeTokens = Math.max(0, limit - est);
    const freePct = Number(((freeTokens / limit) * 100).toFixed(1));
    while (cells.length < 100) {
      cells.push({ key: 'free', label: 'Libre', color: 'rgba(255, 255, 255, 0.08)', tokens: freeTokens, pct: freePct });
    }
    return cells;
  };

  const buildLocalPoolsSummary = () => {
    if (Array.isArray(m.poolsSummary) && m.poolsSummary.length === 3) {
      return m.poolsSummary;
    }
    const poolMap = {
      gemini_unified: { id: 'gemini_unified', label: 'Gemini Unificado', accent: '#a3e635', tokens: 0, pct: 0 },
      argon_weekly: { id: 'argon_weekly', label: 'Argon Semanal', accent: '#38bdf8', tokens: 0, pct: 0 },
      third_party: { id: 'third_party', label: 'Claude / GPT-OSS', accent: '#c084fc', tokens: 0, pct: 0 }
    };
    const total = chatModels.reduce((s, cm) => s + (cm.tokens || 0), 0);
    for (const cm of chatModels) {
      const meta = resolveLocalVisualMeta(cm.modelName);
      const pid = cm.poolId || meta.poolId;
      const target = poolMap[pid] || poolMap.gemini_unified;
      target.tokens += (cm.tokens || 0);
    }
    return Object.values(poolMap).map(p => ({
      ...p,
      displayTokens: formatCompactTokens(p.tokens),
      pct: total > 0 ? Math.round((p.tokens / total) * 100) : 0
    }));
  };

  const waffleCells = buildLocalWaffleCells();
  const poolsSummary = buildLocalPoolsSummary();

  const waffleCellsHtml = waffleCells.map((cell) => {
    const cColor = cell.color || 'rgba(255, 255, 255, 0.08)';
    const cTitle = `${cell.label || 'Block'} · ${formatCompactTokens(cell.tokens || 0)} (${cell.pct ?? 0}%)`;
    return `<div class="antigravity-waffle-cell" style="width: 7px; height: 7px; border-radius: 1.5px; background: ${cColor};" title="${cTitle}"></div>`;
  }).join('');

  const poolsRowsHtml = poolsSummary.map((pool) => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; font-size: 9.5px; padding: 2px 5px; background: rgba(255, 255, 255, 0.025); border-radius: 5px; white-space: nowrap;">
      <span style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; color: #d4d4d8;">
        <span style="width: 5px; height: 5px; border-radius: 9999px; background: ${pool.accent}; flex-shrink: 0;"></span>
        <span style="overflow: hidden; text-overflow: ellipsis;">${pool.label}</span>
      </span>
      <span style="font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 9px; flex-shrink: 0;">
        <strong style="color: #e4e4e7;">${pool.displayTokens}</strong> <span style="color: ${pool.accent};">(${pool.pct}%)</span>
      </span>
    </div>
  `).join('');

  const waffleSectionHtml = `
    <div class="antigravity-waffle-card" style="margin-bottom: 10px; padding: 8px 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; font-weight: 600;">
          Claude Context Grid (100 Bloques)
        </span>
        <span style="font-size: 9px; font-family: ${FONT_MONO}; color: #a1a1aa;">
          ${m.pct}% / 1M
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 9px;">
        <div class="antigravity-waffle-grid" style="display: grid; grid-template-columns: repeat(10, 7px); gap: 1.5px; flex-shrink: 0;">
          ${waffleCellsHtml}
        </div>
        <div class="antigravity-pools-summary" style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
          ${poolsRowsHtml}
        </div>
      </div>
    </div>
  `;

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

      ${waffleSectionHtml}

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
