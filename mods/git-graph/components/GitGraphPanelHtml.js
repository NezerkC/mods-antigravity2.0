import { renderGitGraphSvg } from './GitGraphSvg.js';
import { renderPrCiCardHtml } from './PrCiCardHtml.js';

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
 * @param {Object} [context.pullRequest=null]
 * @param {Object} [context.branches={ local: [], remote: [] }]
 * @param {string} [context.activeRepo='']
 * @returns {string}
 */
export function renderGitGraphPanelHtml(context = {}) {
  const commits = Array.isArray(context.commits) ? context.commits : [];
  const status = context.status || { branch: 'main', isClean: true, ahead: 0, behind: 0 };
  const github = context.github || { isGitHub: false };
  const pullRequest = context.pullRequest || null;
  const branches = context.branches || { local: [], remote: [] };
  const localBranches = Array.isArray(branches.local) ? branches.local : [];
  const remoteBranches = Array.isArray(branches.remote) ? branches.remote : [];
  const repoName = context.activeRepo || (github.fullName || 'workspace');

  // Commits are COLLAPSED by default
  commits.forEach((c) => {
    if (c.expanded === undefined) {
      c.expanded = false;
    }
  });

  const svgGraph = renderGitGraphSvg(commits, { rowHeight: 26, fileRowHeight: 22, laneWidth: 14, startX: 14 });
  const prCiHtml = renderPrCiCardHtml(pullRequest, status, github);

  // Generate branches drawer list items
  const localBranchesHtml = localBranches.map(b => {
    const isCurrent = b.isCurrent || b.name === status.branch;
    return `
      <div class="git-branch-drawer-row ${isCurrent ? 'is-active-branch' : ''}" data-branch="${escapeGitHtml(b.name)}" data-type="local">
        <span class="git-icon-dot">${isCurrent ? '●' : '○'}</span>
        <span class="git-branch-drawer-name">${escapeGitHtml(b.name)}</span>
        ${b.hash ? `<span class="git-branch-drawer-hash">${escapeGitHtml(b.hash)}</span>` : ''}
        ${isCurrent ? '<span class="git-branch-current-badge">HEAD</span>' : ''}
      </div>
    `;
  }).join('');

  const remoteBranchesHtml = remoteBranches.map(b => {
    return `
      <div class="git-branch-drawer-row is-remote-branch" data-branch="${escapeGitHtml(b.name)}" data-type="remote">
        <span class="git-icon-cloud">☁</span>
        <span class="git-branch-drawer-name">${escapeGitHtml(b.shortName || b.name)}</span>
        ${b.hash ? `<span class="git-branch-drawer-hash">${escapeGitHtml(b.hash)}</span>` : ''}
      </div>
    `;
  }).join('');

  // Generate commit list items
  const commitRowsHtml = commits.map((c, idx) => {
    const isSelected = idx === 0;
    const isExpanded = !!c.expanded;
    const files = Array.isArray(c.files) ? c.files : [];
    const hasOrigin = (c.refs || []).some(r => r.includes('origin/'));
    const commitType = hasOrigin ? 'remote' : 'local';

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
      <div class="git-commit-item ${isExpanded ? 'is-expanded' : ''}" data-hash="${c.hash}" data-index="${idx}" data-commit-type="${commitType}">
        <div class="git-commit-row ${isSelected ? 'selected' : ''}" 
             data-hash="${c.hash}" 
             data-index="${idx}" 
             data-short-hash="${c.shortHash}" 
             data-commit-url="${commitUrl}" 
             data-email="${escapeGitHtml(author.email)}" 
             data-author="${escapeGitHtml(author.name)}" 
             data-avatar="${escapeGitHtml(author.avatarUrl)}" 
             data-date="${escapeGitHtml(c.relativeDate || '')}" 
             data-subject="${escapeGitHtml(c.subject)}" 
             data-files-count="${files.length}" 
             tabindex="0">
          <div class="git-commit-main">
            <span class="git-commit-chevron ${files.length > 0 ? 'has-files' : ''}">${files.length > 0 ? (isExpanded ? '▾' : '▸') : '•'}</span>
            <span class="git-commit-subject" title="${escapeGitHtml(c.subject)}">${escapeGitHtml(c.subject)}</span>
            <div class="git-commit-badges">
              ${refsHtml}
              ${files.length > 0 ? `<button class="git-pill-files" title="Clic para expandir/colapsar ${files.length} archivos">📄${files.length}</button>` : ''}
            </div>
          </div>
        </div>
        <div class="git-commit-files-container" style="display: ${isExpanded ? 'flex' : 'none'};">
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
          <button class="git-tool-btn" id="antigravity-git-toggle-all-btn" title="Expandir/Colapsar todos los archivos">⇕</button>
          <button class="git-tool-btn" id="antigravity-git-refresh-btn" title="Refresh Git &amp; GitHub status">↻</button>
          <button class="git-tool-btn git-tool-close" id="antigravity-git-close-btn" title="Close Git Graph">✕</button>
        </div>
      </div>

      <!-- Pull Request & CI/CD Status Card -->
      ${prCiHtml}

      <!-- Branches Filter & Drawer Trigger -->
      <div class="git-branches-filter-bar" id="antigravity-git-branches-bar">
        <div class="git-branches-pills">
          <button class="git-filter-pill active" data-branch-filter="all" title="Ver todos los commits">
            Todas (${commits.length})
          </button>
          <button class="git-filter-pill" data-branch-filter="local" title="Ver solo ramas locales">
            <span class="git-icon-dot">⦿</span> Locales (${localBranches.length})
          </button>
          <button class="git-filter-pill" data-branch-filter="remote" title="Ver solo ramas remotas de GitHub">
            <span class="git-icon-cloud">☁</span> GitHub (${remoteBranches.length})
          </button>
        </div>
        <button class="git-branches-drawer-btn" id="antigravity-git-branches-drawer-btn" title="Desplegar lista de ramas">
          <span>Ramas</span>
          <span class="git-drawer-caret">▾</span>
        </button>
      </div>

      <!-- Collapsible Branches Drawer -->
      <div class="git-branches-drawer" id="antigravity-git-branches-drawer" style="display: none;">
        <div class="git-branches-section-title">Ramas Locales (${localBranches.length})</div>
        <div class="git-branches-list-wrap">
          ${localBranchesHtml || '<div class="git-branch-empty">No se detectaron ramas locales</div>'}
        </div>
        <div class="git-branches-section-title">Ramas Remotas / GitHub (${remoteBranches.length})</div>
        <div class="git-branches-list-wrap">
          ${remoteBranchesHtml || '<div class="git-branch-empty">No se detectaron ramas remotas</div>'}
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

      <!-- Redesigned High-Quality Commit Inspector Mount -->
      <div class="git-inspector-mount" id="antigravity-git-inspector" style="display: none;"></div>
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
  const initials = (author.name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const shortHash = commit.shortHash || (commit.hash ? commit.hash.slice(0, 7) : '');
  const filesCount = Array.isArray(commit.files) ? commit.files.length : 0;
  const relativeTime = commit.relativeDate || '';

  return `
    <div class="git-inspector-card">
      <div class="git-inspector-top">
        <div class="git-inspector-author-group">
          <div class="git-avatar-frame">
            ${author.avatarUrl ? `<img class="git-inspector-avatar" src="${author.avatarUrl}" alt="${escapeGitHtml(author.name)}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"/>` : ''}
            <div class="git-inspector-avatar-fallback" style="${author.avatarUrl ? 'display:none;' : 'display:flex;'}">${escapeGitHtml(initials)}</div>
          </div>
          <div class="git-inspector-author-text">
            <div class="git-inspector-name-row">
              <span class="git-inspector-author-name">${escapeGitHtml(author.name)}</span>
              ${relativeTime ? `<span class="git-inspector-date">${escapeGitHtml(relativeTime)}</span>` : ''}
            </div>
            ${author.email ? `<span class="git-inspector-author-email">&lt;${escapeGitHtml(author.email)}&gt;</span>` : ''}
          </div>
        </div>

        <div class="git-inspector-meta-group">
          <span class="git-inspector-hash-pill" title="Hash completo: ${escapeGitHtml(commit.hash)}">${escapeGitHtml(shortHash)}</span>
          ${commitUrl ? `<a href="${commitUrl}" target="_blank" rel="noopener" class="git-inspector-btn-gh" title="Ver commit en GitHub">GitHub ↗</a>` : ''}
          <button class="git-inspector-btn-close" id="antigravity-git-inspector-close-btn" title="Cerrar inspector">✕</button>
        </div>
      </div>

      <div class="git-inspector-subject-line">${escapeGitHtml(commit.subject)}</div>

      ${filesCount > 0 ? `
        <div class="git-inspector-footer-stats">
          <span class="git-inspector-files-badge">📄 ${filesCount} archivo${filesCount > 1 ? 's' : ''} modificado${filesCount > 1 ? 's' : ''}</span>
        </div>
      ` : ''}
    </div>
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
