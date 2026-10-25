/**
 * Generates HTML for the Pull Request and CI/CD status card.
 * @param {Object | null} pr Active Pull Request or null
 * @param {Object} [status={}] Local Git repository status
 * @param {Object} [github={}] GitHub remote metadata
 * @returns {string}
 */
export function renderPrCiCardHtml(pr, status = {}, github = {}) {
  if (!pr) {
    const ahead = status.ahead || 0;
    const behind = status.behind || 0;
    const branchName = status.branch || 'main';
    const syncText = ahead > 0 && behind > 0
      ? `${ahead} ahead, ${behind} behind`
      : ahead > 0
        ? `${ahead} ahead`
        : behind > 0
          ? `${behind} behind`
          : 'Sincronizado';

    return `
      <div class="git-pr-card git-pr-none">
        <div class="git-pr-none-left">
          <span class="git-pr-icon">ᛦ</span>
          <span class="git-pr-none-text">Sin PR activo en esta rama (${escapeGitHtml(branchName)})</span>
        </div>
        <div class="git-pr-none-right">
          <span class="git-pr-sync-badge" title="Commits respecto al upstream">${escapeGitHtml(syncText)}</span>
          ${github.webUrl ? `<a href="${github.webUrl}/pull/new/${encodeURIComponent(branchName)}" target="_blank" rel="noopener" class="git-pr-create-link">+ Crear PR</a>` : ''}
        </div>
      </div>
    `.trim();
  }

  const summary = pr.checksSummary || { total: 0, success: 0, failure: 0, pending: 0, status: 'PENDING' };
  const statusCls = summary.status === 'SUCCESS'
    ? 'ci-status-success'
    : summary.status === 'FAILURE'
      ? 'ci-status-failure'
      : 'ci-status-pending';

  const statusLabel = summary.status === 'SUCCESS'
    ? `✔ CI Passing (${summary.success}/${summary.total})`
    : summary.status === 'FAILURE'
      ? `✖ CI Failed (${summary.failure}/${summary.total})`
      : `⏳ CI In Progress (${summary.success}/${summary.total})`;

  const checksListHtml = (pr.checks || []).map(c => {
    const isSuccess = c.conclusion === 'SUCCESS';
    const isFail = c.conclusion === 'FAILURE' || c.conclusion === 'TIMED_OUT';
    const icon = isSuccess ? '✔' : isFail ? '✖' : '⏳';
    const checkCls = isSuccess ? 'check-success' : isFail ? 'check-fail' : 'check-pending';

    return `
      <div class="git-ci-check-item ${checkCls}">
        <span class="git-ci-check-icon">${icon}</span>
        <div class="git-ci-check-info">
          <span class="git-ci-check-name" title="${escapeGitHtml(c.name)}">${escapeGitHtml(c.name)}</span>
          ${c.workflowName ? `<span class="git-ci-check-wf">${escapeGitHtml(c.workflowName)}</span>` : ''}
        </div>
        ${c.detailsUrl ? `<a href="${c.detailsUrl}" target="_blank" rel="noopener" class="git-ci-check-link">Logs ↗</a>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="git-pr-card has-pr" id="antigravity-git-pr-card">
      <div class="git-pr-card-main">
        <div class="git-pr-header-col">
          <div class="git-pr-badge-row">
            <span class="git-pr-state-badge state-${String(pr.state).toLowerCase()}">${escapeGitHtml(pr.state)}</span>
            <a href="${pr.url}" target="_blank" rel="noopener" class="git-pr-num-link" title="Open Pull Request on GitHub">
              #${pr.number}
            </a>
            <span class="git-pr-branch-flow">${escapeGitHtml(pr.headRef)} → ${escapeGitHtml(pr.baseRef)}</span>
          </div>
          <div class="git-pr-title" title="${escapeGitHtml(pr.title)}">${escapeGitHtml(pr.title)}</div>
        </div>

        <div class="git-pr-ci-badge-wrap">
          <button class="git-ci-rollup-btn ${statusCls}" id="antigravity-git-ci-rollup-trigger" title="Ver checks de CI/CD">
            <span>${statusLabel}</span>
            <span class="git-ci-caret">▾</span>
          </button>
        </div>
      </div>

      <!-- Expandable CI Checks Accordion -->
      <div class="git-ci-checks-accordion" id="antigravity-git-ci-accordion" style="display: none;">
        <div class="git-ci-checks-header">
          <span>Workflows &amp; Branch Checks</span>
          <span class="git-ci-checks-count">${summary.success}/${summary.total} Completados</span>
        </div>
        <div class="git-ci-checks-list">
          ${checksListHtml || '<div class="git-ci-empty">No hay checks reportados</div>'}
        </div>
      </div>
    </div>
  `.trim();
}

function escapeGitHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
