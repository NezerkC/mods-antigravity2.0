// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

/**
 * Renders the compact top menubar trigger button for the Pit Wall analytics modal.
 * @param {Object} [pitWall={}]
 * @returns {string}
 */
export function renderPitWallMenubarButton(pitWall = {}) {
  const streak = Number(pitWall?.currentStreak || 0);
  const cost = pitWall?.displayTotalCost || '$0';
  const titleText = streak > 0
    ? `Pit Wall Analytics (${streak}-day streak · ${cost} API eq.)`
    : 'Pit Wall Telemetry & Cost Analytics';

  return `
    <button
      type="button"
      class="antigravity-pit-wall-btn"
      id="antigravity-pit-wall-trigger"
      title="${titleText}"
    >
      <svg class="pit-wall-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 3v18h18"></path>
        <rect x="7" y="10" width="3" height="7" rx="1"></rect>
        <rect x="12" y="6" width="3" height="11" rx="1"></rect>
        <rect x="17" y="13" width="3" height="4" rx="1"></rect>
      </svg>
      <span class="pit-wall-btn-label">Pit Wall</span>
    </button>
  `.trim();
}

/**
 * Renders the complete Pit Wall analytics dashboard modal HTML.
 * Strictly self-contained so it can be serialized into the Electron renderer via .toString().
 * @param {Object} [pitWall={}]
 * @returns {string}
 */
export function renderPitWallModalHtml(pitWall = {}) {
  const esc = (val) => String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');
  const fmtUsdExact = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const data = pitWall && typeof pitWall === 'object' ? pitWall : {};
  const streak = Number(data.currentStreak || 0);
  const bestStreak = Number(data.bestStreak || 0);
  const totalHours = Number(data.totalHours || 0).toFixed(1);
  const activeDays = Number(data.activeDaysCount || 0);
  const firstDate = esc(data.firstSessionDate || 'today');
  const avgHours = Number(data.avgHoursPerDay || 0).toFixed(1);
  const stretchHours = Number(data.currentStretchHours || 0).toFixed(1);
  const stretchSub = esc(data.currentStretchSub || 'no recent activity');
  const isStretchActive = Boolean(data.isStretchActive);
  const displayCost = esc(data.displayTotalCost || '$0');
  const displayTokens = esc(data.displayTotalTokens || '0');
  const displayWritten = esc(data.displayWrittenTokens || '0');
  const totalSessions = Number(data.totalSessions || 0);

  const uncachedTok = Number(data.uncachedInputTokens ?? (Number(data.totalTokens || 0) - Number(data.cacheReadTokens || 0) - Number(data.writtenTokens || 0)));
  const cacheTok = Number(data.cacheReadTokens || 0);
  const writtenTok = Number(data.writtenTokens || 0);

  const tipStretch = {
    title: 'Current Stretch',
    rows: [
      { label: 'Active time', val: `${data.exactCurrentStretchDurationLabel || `${stretchHours}h`} (${stretchHours} h)`, accent: true },
      { label: 'Status', val: isStretchActive ? 'Active session' : 'Idle' },
      { label: 'Timeline', val: data.currentStretchSub || 'no recent activity' }
    ]
  };

  const tipTotalHours = {
    title: 'Hours Worked (All Time)',
    rows: [
      { label: 'Total active time', val: `${data.exactTotalDurationLabel || `${totalHours}h`} (${totalHours} h)`, accent: true },
      { label: 'Active calendar days', val: `${activeDays} days` },
      { label: 'Daily average', val: `${avgHours} h / day` },
      { label: 'First session', val: data.firstSessionDate || 'today' }
    ]
  };

  const tipCost = {
    title: 'Cost at API Prices',
    rows: [
      { label: 'Total equivalent', val: data.exactDisplayTotalCost || displayCost, accent: true },
      { label: 'Cache read pricing', val: '10% of input rate (90% discount)' },
      { label: 'Plan benefit', val: 'Included with plan' }
    ]
  };

  const tipTokens = {
    title: 'Tokens Processed',
    rows: [
      { label: 'Total tokens', val: fmtInt(data.totalTokens), accent: true },
      { label: 'Uncached input', val: fmtInt(uncachedTok) },
      { label: 'Cache reads (10% rate)', val: fmtInt(cacheTok) },
      { label: 'Written by models', val: fmtInt(writtenTok) }
    ]
  };

  const tipStreak = {
    title: 'Day Streak',
    rows: [
      { label: 'Current streak', val: `${streak} day${streak === 1 ? '' : 's'}`, accent: true },
      { label: 'Best record', val: `${bestStreak} days` },
      { label: 'Total active days', val: `${activeDays} days` }
    ]
  };

  const tipSessions = {
    title: 'Sessions',
    rows: [
      { label: 'All-time sessions', val: fmtInt(totalSessions), accent: true },
      { label: 'Scope', val: 'All projects & workspaces' },
      { label: 'Aggregation', val: 'Full historical audit' }
    ]
  };

  const last60Days = Array.isArray(data.last60Days) && data.last60Days.length > 0
    ? data.last60Days
    : Array.from({ length: 60 }, (_, i) => ({
        date: `d-${i}`,
        label: i === 0 ? '60d ago' : (i === 59 ? 'Today' : ''),
        hours: 0,
        mainCostUsd: 0,
        bgCostUsd: 0,
        totalCostUsd: 0
      }));

  const maxHoursVal = Math.max(10, ...last60Days.map(d => Number(d.hours || 0)));
  const yHoursCeiling = Math.ceil(maxHoursVal / 5) * 5;
  const yHoursMid = Math.round(yHoursCeiling / 2);

  const hourBarsHtml = last60Days.map(d => {
    const h = Number(d.hours || 0);
    const pct = Math.min(100, Math.round((h / Math.max(1, yHoursCeiling)) * 100));
    const barHeight = h > 0 ? Math.max(3, pct) : 0;
    const durLabel = d.durationLabel || `${h.toFixed(1)}h`;
    const tip = {
      title: d.fullDate || d.date,
      rows: [
        { label: 'Active time', val: `${durLabel} (${h.toFixed(2)} h)`, accent: true },
        { label: 'Sessions active', val: fmtInt(d.sessions || 0) },
        { label: 'API cost equivalent', val: fmtUsdExact(d.totalCostUsd || 0) },
        { label: 'Tokens processed', val: fmtInt(d.tokens || 0) }
      ]
    };
    return `<div class="pit-wall-bar-col" tabindex="0" data-pw-tip="${esc(JSON.stringify(tip))}">
      <div class="pit-wall-bar-hours" style="height: ${barHeight}%;"></div>
    </div>`;
  }).join('');

  const tickIndices = [0, 14, 29, 44, last60Days.length - 1];
  const dateTicksHtml = tickIndices
    .filter(idx => idx >= 0 && idx < last60Days.length)
    .map(idx => `<span>${esc(last60Days[idx].label || last60Days[idx].date)}</span>`)
    .join('');

  const maxCostDayVal = Math.max(50, ...last60Days.map(d => Number(d.totalCostUsd || 0)));
  const costStep = maxCostDayVal <= 100 ? 25 : (maxCostDayVal <= 500 ? 100 : Math.ceil(maxCostDayVal / 500) * 100);
  const yCostCeiling = Math.ceil(maxCostDayVal / costStep) * costStep;
  const yCostTicks = [
    `$${yCostCeiling}`,
    `$${Math.round(yCostCeiling * 0.75)}`,
    `$${Math.round(yCostCeiling * 0.5)}`,
    `$${Math.round(yCostCeiling * 0.25)}`,
    '$0'
  ];

  const costBarsHtml = last60Days.map(d => {
    const mainUsd = Number(d.mainCostUsd || 0);
    const bgUsd = Number(d.bgCostUsd || 0);
    const totUsd = Number(d.totalCostUsd !== undefined ? d.totalCostUsd : (mainUsd + bgUsd));
    const totalPct = Math.min(100, (totUsd / Math.max(1, yCostCeiling)) * 100);
    const mainPct = totUsd > 0 ? (mainUsd / totUsd) * totalPct : 0;
    const bgPct = totUsd > 0 ? (bgUsd / totUsd) * totalPct : 0;
    const mainSharePct = totUsd > 0 ? ((mainUsd / totUsd) * 100).toFixed(1) : '0.0';
    const bgSharePct = totUsd > 0 ? ((bgUsd / totUsd) * 100).toFixed(1) : '0.0';
    const tip = {
      title: d.fullDate || d.date,
      rows: [
        { label: 'Total API cost', val: fmtUsdExact(totUsd), accent: true },
        { label: 'Main thread', val: `${fmtUsdExact(mainUsd)} (${mainSharePct}%)` },
        { label: 'Background agents', val: `${fmtUsdExact(bgUsd)} (${bgSharePct}%)` },
        { label: 'Tokens processed', val: fmtInt(d.tokens || 0) }
      ]
    };
    return `<div class="pit-wall-bar-col" tabindex="0" data-pw-tip="${esc(JSON.stringify(tip))}">
      <div class="pit-wall-bar-stack" style="height: ${totUsd > 0 ? Math.max(3, Math.round(totalPct)) : 0}%;">
        ${bgUsd > 0 ? `<div class="pit-wall-bar-bg" style="height: ${Math.round((bgPct / Math.max(0.01, totalPct)) * 100)}%;"></div>` : ''}
        <div class="pit-wall-bar-main" style="height: ${Math.round((mainPct / Math.max(0.01, totalPct)) * 100)}%;"></div>
      </div>
    </div>`;
  }).join('');

  const weeks = Array.isArray(data.consistencyWeeks) ? data.consistencyWeeks : [];
  const levelColors = [
    'rgba(255, 255, 255, 0.05)',
    '#172554',
    '#1d4ed8',
    '#3b82f6',
    '#60a5fa'
  ];
  const monthHeadersHtml = weeks.map(w => `<div class="pit-wall-heatmap-month">${esc(w.monthLabel || '')}</div>`).join('');
  const heatmapColsHtml = weeks.map(w => {
    const cells = (w.days || []).map(cell => {
      const isFuture = Boolean(cell.isFuture);
      const bg = isFuture ? 'transparent' : (levelColors[cell.level] || levelColors[0]);
      const border = isFuture ? '1px solid transparent' : '1px solid rgba(255,255,255,0.04)';
      if (isFuture) {
        return `<div class="pit-wall-heat-cell" style="background: ${bg}; border: ${border};"></div>`;
      }
      const cellHrs = Number(cell.hours || 0);
      const durLabel = cell.durationLabel || `${cellHrs.toFixed(1)}h`;
      const tip = {
        title: cell.fullDate || cell.date,
        rows: [
          { label: 'Active time', val: `${durLabel} (${cellHrs.toFixed(2)} h)`, accent: true },
          { label: 'Sessions active', val: fmtInt(cell.sessions || 0) },
          { label: 'API cost equivalent', val: fmtUsdExact(cell.totalCostUsd || 0) },
          { label: 'Tokens processed', val: fmtInt(cell.tokens || 0) }
        ]
      };
      return `<div class="pit-wall-heat-cell" style="background: ${bg}; border: ${border};" tabindex="0" data-pw-tip="${esc(JSON.stringify(tip))}"></div>`;
    }).join('');
    return `<div class="pit-wall-heatmap-col">${cells}</div>`;
  }).join('');

  const costByModel = Array.isArray(data.costByModel) ? data.costByModel : [];
  const modelRowsHtml = costByModel.length > 0
    ? costByModel.map(m => {
        const barColor = m.isTop ? '#60a5fa' : '#71717a';
        const pct = Math.max(2, Math.min(100, Number(m.pctOfMax || 0)));
        const costVal = Number(m.exactCostUsd !== undefined ? m.exactCostUsd : (m.costUsd || 0));
        const pctOfTot = m.pctOfTotal !== undefined
          ? m.pctOfTotal
          : (data.totalCostUsd > 0 ? Number(((costVal / data.totalCostUsd) * 100).toFixed(1)) : 0);
        const tip = {
          title: m.name,
          rows: [
            { label: 'API cost equivalent', val: `${fmtUsdExact(costVal)} (${pctOfTot}%)`, accent: true },
            { label: 'Total tokens', val: fmtInt(m.tokens || 0) },
            { label: 'Uncached input', val: fmtInt(m.uncachedInput || 0) },
            { label: 'Cache reads (10%)', val: fmtInt(m.cacheRead || 0) },
            { label: 'Output written', val: fmtInt(m.output || 0) },
            { label: 'Rates (/1M tokens)', val: `$${m.inputPerM ?? 0} in / $${m.cacheReadPerM ?? 0} cache / $${m.outputPerM ?? 0} out` }
          ]
        };
        return `<div class="pit-wall-model-row" tabindex="0" data-pw-tip="${esc(JSON.stringify(tip))}">
          <span class="pit-wall-model-name">${esc(m.name)}</span>
          <div class="pit-wall-model-bar-track">
            <div class="pit-wall-model-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
          </div>
          <span class="pit-wall-model-cost">${esc(m.exactDisplayCost || m.displayCost || '$0')}</span>
        </div>`;
      }).join('')
    : '<div class="pit-wall-empty-note">No model usage recorded yet.</div>';

  return `
    <div class="pit-wall-modal-shell">
      <div class="pit-wall-header">
        <div class="pit-wall-header-text">
          <h2 class="pit-wall-title">Pit Wall</h2>
          <p class="pit-wall-subtitle">
            ${streak}-day streak. ${totalHours} hours of work across ${activeDays} days since ${firstDate}, worth ${displayCost} at API prices.
          </p>
        </div>
        <button type="button" class="pit-wall-close-btn" id="antigravity-pit-wall-close" title="Close Pit Wall"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>

      <div class="pit-wall-kpi-grid">
        <div class="pit-wall-kpi-card" tabindex="0" data-pw-tip="${esc(JSON.stringify(tipStretch))}">
          <div class="pit-wall-kpi-label">Current stretch</div>
          <div class="pit-wall-kpi-value">${stretchHours} h</div>
          <div class="pit-wall-kpi-sub">${stretchSub}</div>
        </div>
        <div class="pit-wall-kpi-card" tabindex="0" data-pw-tip="${esc(JSON.stringify(tipTotalHours))}">
          <div class="pit-wall-kpi-label">Hours worked, all time</div>
          <div class="pit-wall-kpi-value">${totalHours}</div>
          <div class="pit-wall-kpi-sub">${avgHours} h on an average day</div>
        </div>
        <div class="pit-wall-kpi-card" tabindex="0" data-pw-tip="${esc(JSON.stringify(tipCost))}">
          <div class="pit-wall-kpi-label">Cost at API prices</div>
          <div class="pit-wall-kpi-value">${displayCost}</div>
          <div class="pit-wall-kpi-sub">what the plan saved you</div>
        </div>
        <div class="pit-wall-kpi-card" tabindex="0" data-pw-tip="${esc(JSON.stringify(tipTokens))}">
          <div class="pit-wall-kpi-label">Tokens processed</div>
          <div class="pit-wall-kpi-value">${displayTokens}</div>
          <div class="pit-wall-kpi-sub">${displayWritten} written by models</div>
        </div>
        <div class="pit-wall-kpi-card" tabindex="0" data-pw-tip="${esc(JSON.stringify(tipStreak))}">
          <div class="pit-wall-kpi-label">Day streak</div>
          <div class="pit-wall-kpi-value">${streak}</div>
          <div class="pit-wall-kpi-sub">best run ${bestStreak} days</div>
        </div>
        <div class="pit-wall-kpi-card" tabindex="0" data-pw-tip="${esc(JSON.stringify(tipSessions))}">
          <div class="pit-wall-kpi-label">Sessions</div>
          <div class="pit-wall-kpi-value">${totalSessions}</div>
          <div class="pit-wall-kpi-sub">across every project</div>
        </div>
      </div>

      <div class="pit-wall-analytics-grid">
        <div class="pit-wall-panel">
          <div class="pit-wall-panel-title">Hours worked per day</div>
          <div class="pit-wall-panel-sub">Last 60 days. Active time: any stretch with no gap over 20 minutes, agents included, parallel sessions counted once.</div>
          <div class="pit-wall-chart-frame">
            <div class="pit-wall-y-axis">
              <span>${yHoursCeiling} h</span>
              <span>${yHoursMid} h</span>
              <span>0 h</span>
            </div>
            <div class="pit-wall-chart-area">
              <div class="pit-wall-grid-lines">
                <div class="pit-wall-grid-line"></div>
                <div class="pit-wall-grid-line"></div>
                <div class="pit-wall-grid-line"></div>
              </div>
              <div class="pit-wall-bars-row">${hourBarsHtml}</div>
              <div class="pit-wall-x-axis">${dateTicksHtml}</div>
            </div>
          </div>
        </div>

        <div class="pit-wall-panel">
          <div class="pit-wall-panel-title">Consistency</div>
          <div class="pit-wall-panel-sub">Last 20 weeks. Brighter blue means more hours.</div>
          <div class="pit-wall-heatmap-wrap">
            <div class="pit-wall-heatmap-months-row">
              <div class="pit-wall-heatmap-day-spacer"></div>
              <div class="pit-wall-heatmap-months-grid">${monthHeadersHtml}</div>
            </div>
            <div class="pit-wall-heatmap-body">
              <div class="pit-wall-heatmap-days">
                <span>Mon</span>
                <span></span>
                <span>Wed</span>
                <span></span>
                <span>Fri</span>
                <span></span>
                <span></span>
              </div>
              <div class="pit-wall-heatmap-cols">${heatmapColsHtml}</div>
            </div>
          </div>
        </div>

        <div class="pit-wall-panel">
          <div class="pit-wall-panel-title">Cost per day at API prices</div>
          <div class="pit-wall-panel-sub">Last 60 days, USD. The darker part is background agents.</div>
          <div class="pit-wall-chart-frame">
            <div class="pit-wall-y-axis pit-wall-y-axis-cost">
              ${yCostTicks.map(t => `<span>${esc(t)}</span>`).join('')}
            </div>
            <div class="pit-wall-chart-area">
              <div class="pit-wall-grid-lines">
                <div class="pit-wall-grid-line"></div>
                <div class="pit-wall-grid-line"></div>
                <div class="pit-wall-grid-line"></div>
                <div class="pit-wall-grid-line"></div>
                <div class="pit-wall-grid-line"></div>
              </div>
              <div class="pit-wall-bars-row">${costBarsHtml}</div>
              <div class="pit-wall-x-axis">${dateTicksHtml}</div>
            </div>
          </div>
        </div>

        <div class="pit-wall-panel">
          <div class="pit-wall-panel-title">Cost by model</div>
          <div class="pit-wall-panel-sub">All time, USD, at each model's list price.</div>
          <div class="pit-wall-models-list">${modelRowsHtml}</div>
        </div>
      </div>

      <div id="antigravity-pit-wall-tooltip" class="pit-wall-tooltip" role="tooltip" popover="manual" aria-hidden="true"></div>
    </div>
  `.trim();
}
