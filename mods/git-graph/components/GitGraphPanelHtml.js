import { renderGitGraphSvg } from './GitGraphSvg.js';

/**
 * Generates HTML for the auxiliary pane tab trigger button.
 * @returns {string}
 */
export function renderGitGraphTabButton() {
  return `
    <div class="antigravity-git-tab-wrapper">
      <button class="antigravity-git-tab-btn" id="antigravity-git-tab-trigger" title="Git & GitHub Graph">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="6" y1="3" x2="6" y2="15"></line>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="6" cy="6" r="3"></circle>
          <path d="M6 9a9 9 0 0 1 9 9"></path>
          <circle cx="18" cy="18" r="3"></circle>
        </svg>
        <span class="antigravity-git-tab-label">Git Graph</span>
      </button>
    </div>
  `.trim();
}

/**
 * Generates HTML for the full Git & GitHub DAG visualizer panel.
 * @param {Object} context
 * @param {Array<Object>} [context.commits=[]]
 * @param {Object} [context.status={}]
 * @param {Object} [context.github={}]
 * @param {string} [context.activeRepo='']
 * @returns {string}
 */
export function renderGitGraphPanelHtml(context = {}) {
  const commits = Array.isArray(context.commits) ? context.commits : [];
  const status = context.status || { branch: 'main', isClean: true, ahead: 0, behind: 0 };
  const github = context.github || { isGitHub: false };
  const repoName = context.activeRepo || (github.fullName || 'workspace');

  const svgGraph = renderGitGraphSvg(commits, { rowHeight: 44, laneWidth: 18, startX: 16 });

  // Generate commit list rows
  const commitRowsHtml = commits.map((c, idx) => {
    const isSelected = idx === 0;
    const author = c.author || { name: 'Unknown', avatarUrl: '' };
    const refsHtml = (c.refs || []).map(ref => {
      const isHead = ref.includes('HEAD');
      const isTag = ref.includes('tag:');
      const cls = isHead ? 'git-ref-head' : isTag ? 'git-ref-tag' : 'git-ref-branch';
      return `<span class="git-ref-badge ${cls}">${escapeHtml(ref)}</span>`;
    }).join('');

    return `
      <div class="git-commit-row ${isSelected ? 'selected' : ''}" data-hash="${c.hash}" data-index="${idx}" tabindex="0">
        <div class="git-commit-col-info">
          <div class="git-commit-top-row">
            ${refsHtml}
            <span class="git-commit-hash">${c.shortHash}</span>
            <span class="git-commit-time">${c.relativeDate || ''}</span>
          </div>
          <div class="git-commit-subject" title="${escapeHtml(c.subject)}">${escapeHtml(c.subject)}</div>
          <div class="git-commit-author-row">
            <img class="git-author-avatar" src="${author.avatarUrl}" alt="${escapeHtml(author.name)}" loading="lazy"/>
            <span class="git-author-name">${escapeHtml(author.name)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const headCommit = commits[0] || null;

  return `
    <div class="antigravity-git-panel" id="antigravity-git-panel-root">
      <!-- Header Bar -->
      <div class="git-panel-header">
        <div class="git-panel-title-wrap">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="git-header-icon">
            <line x1="6" y1="3" x2="6" y2="15"></line>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M6 9a9 9 0 0 1 9 9"></path>
            <circle cx="18" cy="18" r="3"></circle>
          </svg>
          <span class="git-repo-badge" title="Active Repository">${escapeHtml(repoName)}</span>
          <span class="git-branch-badge">${escapeHtml(status.branch)}${status.isClean ? '' : '*'}</span>
        </div>
        <div class="git-header-actions">
          ${status.ahead > 0 ? `<span class="git-sync-badge ahead" title="Ahead of upstream">↑${status.ahead}</span>` : ''}
          ${status.behind > 0 ? `<span class="git-sync-badge behind" title="Behind upstream">↓${status.behind}</span>` : ''}
          ${github.isGitHub ? `<a href="${github.webUrl}" target="_blank" rel="noopener" class="git-github-link" title="Open on GitHub">GitHub ↗</a>` : ''}
          <button class="git-refresh-btn" id="antigravity-git-refresh-btn" title="Refresh Git status">⟳</button>
        </div>
      </div>

      <!-- Graph & Commit Tree Viewport -->
      <div class="git-graph-container">
        <div class="git-svg-column">
          ${svgGraph}
        </div>
        <div class="git-commits-column">
          ${commitRowsHtml}
        </div>
      </div>

      <!-- Bottom Selected Commit Inspector -->
      <div class="git-commit-inspector" id="antigravity-git-inspector">
        ${headCommit ? renderInspectorCard(headCommit, github) : '<div class="git-inspector-empty">No commit selected</div>'}
      </div>
    </div>
  `.trim();
}

/**
 * Generates inspector card for selected commit.
 * @param {Object} commit
 * @param {Object} [github={}]
 * @returns {string}
 */
export function renderInspectorCard(commit, github = {}) {
  const author = commit.author || { name: 'Unknown', email: '', avatarUrl: '' };
  const commitUrl = github.isGitHub && github.getCommitUrl ? github.getCommitUrl(commit.hash) : '';

  return `
    <div class="git-inspector-header">
      <div class="git-inspector-author">
        <img class="git-inspector-avatar" src="${author.avatarUrl}" alt="${escapeHtml(author.name)}"/>
        <div class="git-inspector-author-col">
          <span class="git-inspector-author-name">${escapeHtml(author.name)}</span>
          <span class="git-inspector-author-email">&lt;${escapeHtml(author.email)}&gt;</span>
        </div>
      </div>
      <div class="git-inspector-hash-wrap">
        <span class="git-inspector-hash" title="${commit.hash}">${commit.shortHash || commit.hash.slice(0, 7)}</span>
        ${commitUrl ? `<a href="${commitUrl}" target="_blank" rel="noopener" class="git-inspector-gh-link">View Commit ↗</a>` : ''}
      </div>
    </div>
    <div class="git-inspector-subject">${escapeHtml(commit.subject)}</div>
  `.trim();
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
