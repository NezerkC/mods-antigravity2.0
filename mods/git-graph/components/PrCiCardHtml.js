import { escapeGitHtml } from './GitGraphPanelHtml.js';

/**
 * Generates HTML for the Pull Request and CI/CD status card,
 * including branch sync controls and pending commit selection for PR creation.
 * @param {Object | null} pr Active Pull Request or null
 * @param {Object} [status={}] Local Git repository status
 * @param {Object} [github={}] GitHub remote metadata
 * @param {Array<Object>} [commits=[]] Enriched commit history
 * @returns {string}
 */
export function renderPrCiCardHtml(pr, status = {}, github = {}, commits = []) {
  const ahead = status.ahead || 0;
  const behind = status.behind || 0;
  const branchName = status.branch || 'main';

  if (!pr) {
    const syncText = ahead > 0 && behind > 0
      ? `${ahead} ahead, ${behind} behind`
      : ahead > 0
        ? `${ahead} ahead`
        : behind > 0
          ? `${behind} behind`
          : 'Sincronizado';

    const pendingCommits = Array.isArray(commits)
      ? commits.filter(c => c && c.pushed === false).slice(0, 12)
      : [];

    const pendingListHtml = pendingCommits.length > 0
      ? pendingCommits.map(c => {
          const shortSha = c.shortHash || (c.hash ? String(c.hash).slice(0, 7) : '');
          return `
            <div class="git-pr-commit-row">
              <span class="git-pr-commit-sha">${escapeGitHtml(shortSha)}</span>
              <span class="git-pr-commit-msg" title="${escapeGitHtml(c.subject || '')}">${escapeGitHtml(c.subject || '')}</span>
              <button class="git-commit-push-btn" data-vcs-action="push-commit" data-hash="${escapeGitHtml(c.hash || '')}" data-branch="${escapeGitHtml(branchName)}" title="Subir commits hasta ${escapeGitHtml(shortSha)}">↑ Push hasta aquí</button>
            </div>
          `;
        }).join('')
      : '<div class="git-ci-empty">Todos los commits locales están sincronizados con el remoto.</div>';

    return `
      <div class="git-pr-card git-pr-none">
        <div class="git-pr-none-main">
          <div class="git-pr-none-left">
            <span class="git-pr-icon">ᛦ</span>
            <span class="git-pr-none-text">Sin PR activo en esta rama (${escapeGitHtml(branchName)})</span>
          </div>
          <div class="git-pr-none-right">
            <span class="git-pr-sync-badge" title="Commits respecto al upstream">${escapeGitHtml(syncText)}</span>
            ${behind > 0 ? `<button class="git-pr-action-btn btn-pull" data-vcs-action="pull" data-branch="${escapeGitHtml(branchName)}" title="Traer ${behind} commit(s) desde origin">↓${behind}</button>` : ''}
            ${ahead > 0 ? `<button class="git-pr-action-btn btn-push" data-vcs-action="push" data-branch="${escapeGitHtml(branchName)}" title="Subir ${ahead} commit(s) a origin">↑${ahead}</button>` : ''}
            <button class="git-pr-create-btn" id="antigravity-git-pr-drawer-trigger" title="Inspeccionar commits pendientes y crear Pull Request">+ Crear PR ▾</button>
          </div>
        </div>
        <div class="git-pr-commits-drawer" id="antigravity-git-pr-drawer" style="display: none;">
          <div class="git-ci-checks-header">
            <span>Commits locales pendientes (${pendingCommits.length})</span>
            <span>${escapeGitHtml(branchName)} → main</span>
          </div>
          <div class="git-pr-commits-list">
            ${pendingListHtml}
          </div>
          <div class="git-pr-drawer-footer">
            <button class="git-pr-submit-btn" data-vcs-action="create-pr" data-branch="${escapeGitHtml(branchName)}" title="Subir rama y crear Pull Request">Push &amp; Crear PR</button>
            ${github.webUrl ? `<a href="${escapeGitHtml(github.webUrl)}/pull/new/${encodeURIComponent(branchName)}" target="_blank" rel="noopener" class="git-pr-create-link">Abrir en GitHub ↗</a>` : ''}
          </div>
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
      ? `✖ CI Failed (${summary.failure} error)`
      : `⏳ CI Running (${summary.pending || 1})`;

  const checksListHtml = (pr.checks || []).map(c => {
    const isOk = c.conclusion === 'SUCCESS';
    const isFail = c.conclusion === 'FAILURE' || c.conclusion === 'TIMED_OUT' || c.conclusion === 'CANCELLED';
    const icon = isOk ? '✔' : isFail ? '✖' : '●';
    const itemCls = isOk ? 'check-success' : isFail ? 'check-fail' : 'check-pending';

    return `
      <div class="git-ci-check-item ${itemCls}">
        <span class="git-ci-check-icon">${icon}</span>
        <div class="git-ci-check-info">
          <span class="git-ci-check-name">${escapeGitHtml(c.name)}</span>
          ${c.workflowName ? `<span class="git-ci-check-wf">${escapeGitHtml(c.workflowName)}</span>` : ''}
        </div>
        ${c.detailsUrl ? `<a href="${escapeGitHtml(c.detailsUrl)}" target="_blank" rel="noopener" class="git-ci-check-link">Logs ↗</a>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="git-pr-card has-pr" id="antigravity-git-pr-card">
      <div class="git-pr-card-main">
        <div class="git-pr-header-col">
          <div class="git-pr-badge-row">
            <span class="git-pr-state-badge state-${escapeGitHtml(String(pr.state).toLowerCase())}">${escapeGitHtml(pr.state)}</span>
            <a href="${escapeGitHtml(pr.url)}" target="_blank" rel="noopener" class="git-pr-num-link" title="Open Pull Request on GitHub">
              #${pr.number}
            </a>
            <span class="git-pr-branch-flow">${escapeGitHtml(pr.headRef)} → ${escapeGitHtml(pr.baseRef)}</span>
          </div>
          <div class="git-pr-title" title="${escapeGitHtml(pr.title)}">${escapeGitHtml(pr.title)}</div>
        </div>

        <div class="git-pr-ci-badge-wrap">
          ${behind > 0 ? `<button class="git-pr-action-btn btn-pull" data-vcs-action="pull" data-branch="${escapeGitHtml(branchName)}" title="Pull ${behind} commit(s)">↓${behind}</button>` : ''}
          ${ahead > 0 ? `<button class="git-pr-action-btn btn-push" data-vcs-action="push" data-branch="${escapeGitHtml(branchName)}" title="Push ${ahead} commit(s)">↑${ahead}</button>` : ''}
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
