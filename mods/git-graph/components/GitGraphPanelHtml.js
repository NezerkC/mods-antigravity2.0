import { renderGitGraphSvg } from './GitGraphSvg.js';

/**
 * Generates HTML for the auxiliary pane tab trigger button.
 * @returns {string}
 */
export function renderGitGraphTabButton() {
  return `
    <div class="antigravity-git-tab-wrapper">
      <button class="antigravity-git-tab-btn" id="antigravity-git-tab-trigger" title="Git &amp; GitHub Graph">
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
 * Generates HTML for the compact VS Code-style Git Graph visualizer panel.
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

  // By default expand the second commit if it has files (matching user screenshot), or none
  commits.forEach((c, idx) => {
    if (c.expanded === undefined) {
      c.expanded = idx === 1 && Array.isArray(c.files) && c.files.length > 0;
    }
  });

  const svgGraph = renderGitGraphSvg(commits, { rowHeight: 26, fileRowHeight: 22, laneWidth: 14, startX: 14 });

  // Generate commit list items
  const commitRowsHtml = commits.map((c, idx) => {
    const isSelected = idx === 0;
    const isExpanded = !!c.expanded;
    const files = Array.isArray(c.files) ? c.files : [];

    // Ref Badges (branch pills)
    const refsHtml = (c.refs || []).map(ref => {
      const isHead = ref.includes('HEAD');
      const isOrigin = ref.includes('origin/');
      const isTag = ref.includes('tag:');
      const cleanRef = ref.replace('HEAD -> ', '').replace('tag: ', '');

      if (isOrigin) {
        return `<span class="git-pill-branch git-pill-origin" title="${escapeGitHtml(ref)}"><span class="git-icon-cloud">☁</span>${escapeGitHtml(cleanRef)}</span>`;
      }
      return `<span class="git-pill-branch ${isHead ? 'git-pill-head' : 'git-pill-local'}" title="${escapeGitHtml(ref)}"><span class="git-icon-dot">⦿</span>${escapeGitHtml(cleanRef)}</span>`;
    }).join('');

    // Inline file diff list
    const filesListHtml = files.map(f => {
      const extCls = getExtClass(f.ext);
      const statusCls = f.status === 'A' ? 'status-added' : f.status === 'D' ? 'status-deleted' : 'status-modified';
      return `
        <div class="git-file-row">
          <span class="git-file-ext ${extCls}">${escapeGitHtml(f.ext)}</span>
          <span class="git-file-name" title="${escapeGitHtml(f.path)}">${escapeGitHtml(f.fileName)}</span>
          <span class="git-file-dir">${escapeGitHtml(f.dir)}</span>
          <span class="git-file-status ${statusCls}">${escapeGitHtml(f.status)}</span>
        </div>
      `;
    }).join('');

const commitUrl = github.isGitHub && github.getCommitUrl ? github.getCommitUrl(c.hash) : '';
    const author = c.author || { name: 'Unknown', email: '', avatarUrl: '' };

    return `
      <div class="git-commit-item ${isExpanded ? 'is-expanded' : ''}" data-hash="${c.hash}" data-index="${idx}">
        <div class="git-commit-row ${isSelected ? 'selected' : ''}" 
             data-hash="${c.hash}" 
             data-index="${idx}" 
             data-short-hash="${c.shortHash}" 
             data-commit-url="${commitUrl}" 
             data-email="${escapeGitHtml(author.email)}" 
             data-author="${escapeGitHtml(author.name)}" 
             data-subject="${escapeGitHtml(c.subject)}" 
             tabindex="0">
          <div class="git-commit-main">
            <span class="git-commit-subject" title="${escapeGitHtml(c.subject)}">${escapeGitHtml(c.subject)}</span>
            <div class="git-commit-badges">
              ${refsHtml}
              ${files.length > 0 ? `<span class="git-pill-files" title="${files.length} changed files">📄${files.length}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="git-commit-files-container" style="display: ${isExpanded ? 'block' : 'none'};">
          ${filesListHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="antigravity-git-panel" id="antigravity-git-panel-root">
      <!-- VS Code Style Minimal Header -->
      <div class="git-panel-header">
        <div class="git-panel-title-wrap">
          <span class="git-header-caret">⌄</span>
          <span class="git-header-title">Graph</span>
          <span class="git-header-repo" title="Active Repository">${escapeGitHtml(repoName)}</span>
          <span class="git-branch-pill">${escapeGitHtml(status.branch)}${status.isClean ? '' : '*'}</span>
        </div>
        <div class="git-header-actions">
          <span class="git-pill-auto">Auto</span>
          <button class="git-tool-btn" id="antigravity-git-refresh-btn" title="Refresh Git status">↻</button>
          <button class="git-tool-btn git-tool-close" id="antigravity-git-close-btn" title="Close Git Graph">✕</button>
        </div>
      </div>

      <!-- Graph & Commits Viewport -->
      <div class="git-graph-container">
        <div class="git-svg-column">
          ${svgGraph}
        </div>
        <div class="git-commits-column">
          ${commitRowsHtml}
        </div>
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
        <img class="git-inspector-avatar" src="${author.avatarUrl}" alt="${escapeGitHtml(author.name)}"/>
        <div class="git-inspector-author-col">
          <span class="git-inspector-author-name">${escapeGitHtml(author.name)}</span>
          ${author.email ? `<span class="git-inspector-author-email">&lt;${escapeGitHtml(author.email)}&gt;</span>` : ''}
        </div>
      </div>
      <div class="git-inspector-hash-wrap">
        <span class="git-inspector-hash" title="${escapeGitHtml(commit.hash)}">${escapeGitHtml(commit.shortHash || commit.hash.slice(0, 7))}</span>
        ${commitUrl ? `<a href="${commitUrl}" target="_blank" rel="noopener" class="git-inspector-gh-link">View Commit ↗</a>` : ''}
      </div>
    </div>
    <div class="git-inspector-subject">${escapeGitHtml(commit.subject)}</div>
  `.trim();
}

function getExtClass(ext = '') {
  const e = String(ext).toUpperCase();
  if (e === 'JS' || e === 'MJS' || e === 'CJS') return 'ext-js';
  if (e === 'TS' || e === 'TSX') return 'ext-ts';
  if (e === 'JSON') return 'ext-json';
  if (e === 'CSS' || e === 'SCSS') return 'ext-css';
  if (e === 'MD') return 'ext-md';
  if (e === 'HTML') return 'ext-html';
  return 'ext-default';
}

export function escapeGitHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
