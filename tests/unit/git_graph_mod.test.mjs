import test from 'node:test';
import assert from 'node:assert/strict';
import { GitGraphMod } from '../../mods/git-graph/index.js';
import { renderGitGraphSvg } from '../../mods/git-graph/components/GitGraphSvg.js';
import { renderGitGraphPanelHtml, renderInspectorCard } from '../../mods/git-graph/components/GitGraphPanelHtml.js';

test('GitGraphMod - loads correct manifest metadata', () => {
  const mod = new GitGraphMod();
  assert.equal(mod.manifest.id, 'git-graph');
  assert.equal(mod.manifest.slot, 'aux-pane-tab');
  assert.equal(mod.manifest.version, '2.0.0');
  assert.equal(mod.manifest.priority, 60);
});

test('GitGraphMod - renders auxiliary pane tab button and panel template markup', () => {
  const mod = new GitGraphMod();
  const rendered = mod.render({
    commits: [
      {
        hash: 'a1b2c3d4e5f6',
        shortHash: 'a1b2c3d',
        lane: 0,
        routes: [{ fromLane: 0, toLane: 0, type: 'straight' }],
        author: { name: 'Victor', email: 'victor@example.com', avatarUrl: 'https://avatar/1' },
        subject: 'feat(core): initial git graph',
        relativeDate: '5m ago',
        refs: ['HEAD -> main']
      }
    ],
    status: { branch: 'main', isClean: true, ahead: 1, behind: 0 },
    github: { isGitHub: true, fullName: 'NezerkC/mods-antigravity2.0', webUrl: 'https://github.com/NezerkC/mods-antigravity2.0' }
  });

  assert.ok(rendered);
  assert.ok(rendered.html.includes('id="antigravity-git-tab-trigger"'));
  assert.ok(rendered.html.includes('id="antigravity-git-panel-template"'));
  assert.ok(rendered.html.includes('NezerkC/mods-antigravity2.0'));
  assert.ok(rendered.html.includes('a1b2c3d'));
  assert.ok(rendered.css.includes('.antigravity-git-tab-btn'));
});

test('renderGitGraphSvg - produces valid SVG with routes and commit nodes', () => {
  const commits = [
    {
      hash: 'c2',
      lane: 0,
      routes: [{ fromLane: 0, toLane: 0, type: 'straight' }],
      refs: ['HEAD']
    },
    {
      hash: 'c1',
      lane: 0,
      routes: [],
      refs: []
    }
  ];

  const svg = renderGitGraphSvg(commits, { rowHeight: 44, laneWidth: 20 });
  assert.ok(svg.includes('<svg class="git-graph-svg"'));
  assert.ok(svg.includes('<line x1="20"'));
  assert.ok(svg.includes('<circle cx="20"'));
  assert.ok(svg.includes('data-hash="c2"'));
});

test('renderInspectorCard - formats author avatar, hash and GitHub link', () => {
  const commit = {
    hash: 'deadbeef12345678',
    shortHash: 'deadbee',
    author: { name: 'Dev', email: 'dev@test.com', avatarUrl: 'https://gravatar/dev' },
    subject: 'test: commit inspector card'
  };
  const github = {
    isGitHub: true,
    getCommitUrl: (h) => `https://github.com/test/repo/commit/${h}`
  };

  const cardHtml = renderInspectorCard(commit, github);
  assert.ok(cardHtml.includes('deadbee'));
  assert.ok(cardHtml.includes('Dev'));
  assert.ok(cardHtml.includes('dev@test.com'));
  assert.ok(cardHtml.includes('https://github.com/test/repo/commit/deadbeef12345678'));
});

test('GitGraphPanelHtml - escapes malicious XSS payloads in commit rows and inspector', () => {
  const commit = {
    hash: 'xss1234567890',
    shortHash: 'xss1234',
    author: { name: '<script>evil()</script>', email: 'bad@evil.com"><script>alert(1)</script>', avatarUrl: '' },
    subject: '<img src=x onerror=hack()>'
  };

  const cardHtml = renderInspectorCard(commit);
  assert.ok(!cardHtml.includes('<script>evil()</script>'));
  assert.ok(cardHtml.includes('&lt;script&gt;evil()&lt;/script&gt;'));
  assert.ok(!cardHtml.includes('<img src=x onerror=hack()>'));
  assert.ok(cardHtml.includes('&lt;img src=x onerror=hack()&gt;'));
});

test('GitGraphPanelHtml - includes data-commit-url and data-email attributes on commit rows', () => {
  const panelHtml = renderGitGraphPanelHtml({
    commits: [
      {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        author: { name: 'Alice', email: 'alice@test.com', avatarUrl: 'https://avatar/alice' },
        subject: 'feat: add git graph',
        relativeDate: '1h ago',
        refs: []
      }
    ],
    github: {
      isGitHub: true,
      getCommitUrl: (h) => `https://github.com/org/repo/commit/${h}`
    }
  });

  assert.ok(panelHtml.includes('data-commit-url="https://github.com/org/repo/commit/abc123456789"'));
  assert.ok(panelHtml.includes('data-email="alice@test.com"'));
  assert.ok(panelHtml.includes('data-author="Alice"'));
});

test('GitGraphPanelHtml - embeds PR and CI/CD card markup in panel template', () => {
  const panelHtml = renderGitGraphPanelHtml({
    commits: [],
    pullRequest: {
      number: 77,
      title: 'feat: add vcs panel',
      headRef: 'feat/vcs',
      baseRef: 'main',
      url: 'https://github.com/org/repo/pull/77',
      state: 'OPEN',
      author: 'Tester',
      checks: [],
      checksSummary: { total: 0, success: 0, failure: 0, pending: 0, status: 'PENDING' }
    }
  });

  assert.ok(panelHtml.includes('#77'));
  assert.ok(panelHtml.includes('feat: add vcs panel'));
  assert.ok(panelHtml.includes('antigravity-git-pr-card'));
});

test('GitGraphMod - uses initialContext and includes PR card styles', () => {
  const mod = new GitGraphMod({
    initialContext: {
      status: { branch: 'feat/test-initial', isClean: true },
      commits: []
    }
  });
  const rendered = mod.render();
  assert.ok(rendered.html.includes('feat/test-initial'));
  assert.ok(rendered.css.includes('.git-pr-card'));
});



test('GitGraphPanelHtml - renders branch filter pills and branches drawer', () => {
  const panelHtml = renderGitGraphPanelHtml({
    commits: [{ hash: 'c1', shortHash: 'c1', subject: 'initial', refs: [] }],
    branches: {
      local: [{ name: 'main', isCurrent: true, hash: 'c1' }],
      remote: [{ name: 'origin/main', shortName: 'main', hash: 'c1' }]
    }
  });

  assert.ok(panelHtml.includes('antigravity-git-branches-bar'));
  assert.ok(panelHtml.includes('data-branch-filter="local"'));
  assert.ok(panelHtml.includes('data-branch-filter="remote"'));
  assert.ok(panelHtml.includes('Locales (1)'));
  assert.ok(panelHtml.includes('GitHub (1)'));
  assert.ok(panelHtml.includes('antigravity-git-branches-drawer'));
  assert.ok(panelHtml.includes('is-active-branch'));
  assert.ok(panelHtml.includes('is-remote-branch'));
});

test('GitGraphPanelHtml - renders commits collapsed by default with toggle all button', () => {
  const panelHtml = renderGitGraphPanelHtml({
    commits: [
      {
        hash: 'c1',
        shortHash: 'c1',
        subject: 'c1',
        refs: [],
        files: [{ status: 'M', path: 'index.js', fileName: 'index.js', dir: '', ext: 'JS' }]
      }
    ]
  });

  assert.ok(panelHtml.includes('id="antigravity-git-toggle-all-btn"'));
  assert.ok(panelHtml.includes('style="display: none;"'));
  assert.ok(panelHtml.includes('git-commit-chevron'));
});

test('GitGraphPanelHtml & styles - removes redundant .git-pill-files document count pills', () => {
  const mod = new GitGraphMod();
  const rendered = mod.render({
    commits: [
      {
        hash: 'c1234567',
        shortHash: 'c123456',
        pushed: false,
        subject: 'feat(vcs): unified accordion row',
        refs: ['HEAD -> feat/vcs'],
        files: [
          { status: 'M', path: 'a.js', fileName: 'a.js', dir: '', ext: 'JS' },
          { status: 'A', path: 'b.js', fileName: 'b.js', dir: '', ext: 'JS' }
        ]
      }
    ]
  });

  assert.ok(!rendered.html.includes('git-pill-files'), 'Document count pills must not be rendered in commit rows');
  assert.ok(!rendered.css.includes('.git-pill-files'), 'Unused .git-pill-files CSS rule must be removed');
});

test('renderGitGraphSvg - renders inline --< * * * * >-- inspection capsule and unpushed ring', () => {
  const commits = [
    {
      hash: 'head1',
      lane: 0,
      pushed: true,
      expanded: true,
      refs: ['HEAD -> main'],
      routes: [{ fromLane: 0, toLane: 0, type: 'straight' }],
      files: [
        { status: 'A', path: 'added.js' },
        { status: 'M', path: 'mod.js' },
        { status: 'D', path: 'del.js' }
      ]
    },
    {
      hash: 'unpushed2',
      lane: 1,
      pushed: false,
      expanded: false,
      refs: [],
      routes: [],
      files: []
    }
  ];

  const svg = renderGitGraphSvg(commits, { rowHeight: 26, fileRowHeight: 22, laneWidth: 14, startX: 14 });
  assert.ok(svg.includes('class="git-capsule-open"'));
  assert.ok(svg.includes('class="git-capsule-spine"'));
  assert.ok(svg.includes('class="git-file-node"'));
  assert.ok(svg.includes('class="git-capsule-close"'));
  assert.ok(svg.includes('#22c55e'));
  assert.ok(svg.includes('#f59e0b'));
  assert.ok(svg.includes('#ef4444'));
  assert.ok(svg.includes('class="git-node-unpushed-ring"'));
});

test('GitGraphPanelHtml - embeds hydrated VCS JSON state, branch sync badges, selective push, and PR drawer', () => {
  const panelHtml = renderGitGraphPanelHtml({
    status: { branch: 'feat/mods-vcs', isClean: false, ahead: 2, behind: 1 },
    github: { isGitHub: true, fullName: 'NezerkC/mods', webUrl: 'https://github.com/NezerkC/mods' },
    branches: {
      local: [
        { name: 'main', isCurrent: false, isTrunk: true, cluster: 'trunk', ahead: 0, behind: 1, hash: '1111111' },
        { name: 'feat/mods-vcs', isCurrent: true, cluster: 'vcs', ahead: 2, behind: 0, dirtyFiles: 3, hash: '2222222' },
        { name: 'fix/old-bug', isCurrent: false, cluster: 'fixes', isMerged: true, hash: '3333333' }
      ],
      remote: [{ name: 'origin/main', shortName: 'main', hash: '1111111' }]
    },
    commits: [
      {
        hash: '2222222abcdef',
        shortHash: '2222222',
        pushed: false,
        subject: 'feat(vcs): pending local commit',
        refs: ['HEAD -> feat/mods-vcs'],
        files: [{ status: 'M', path: 'x.js', fileName: 'x.js', dir: '', ext: 'JS' }]
      }
    ]
  });

  // Embedded JSON state script tag for client hydration
  const stateMatch = panelHtml.match(/<script type="application\/json" id="antigravity-git-vcs-state">([\s\S]*?)<\/script>/);
  assert.ok(stateMatch, 'Panel HTML must embed #antigravity-git-vcs-state JSON script');
  const parsed = JSON.parse(stateMatch[1]);
  assert.equal(parsed.commits.length, 1);
  assert.equal(parsed.commits[0].hash, '2222222abcdef');

  // Branch clusters and pending badges
  assert.ok(panelHtml.includes('git-branch-cluster-header'));
  assert.ok(panelHtml.includes('↑2'));
  assert.ok(panelHtml.includes('↓1'));
  assert.ok(panelHtml.includes('●3'));
  assert.ok(panelHtml.includes('badge-merged'));

  // Selective commit push & PR drawer
  assert.ok(panelHtml.includes('data-vcs-action="push-commit"'));
  assert.ok(panelHtml.includes('id="antigravity-git-pr-drawer"'));
  assert.ok(panelHtml.includes('id="antigravity-git-svg-column"'));
});

test('GitGraphPanelHtml - renders sync badges and unpushed/unpulled indicators', () => {
  const panelHtml = renderGitGraphPanelHtml({
    status: { branch: 'feat/sync-test', ahead: 2, behind: 1, isClean: false },
    commits: [
      {
        hash: 'c_ahead',
        shortHash: 'cahead',
        subject: 'local ahead commit',
        refs: ['HEAD -> feat/sync-test'],
        syncStatus: 'ahead',
        isUnpushed: true,
        files: []
      },
      {
        hash: 'c_behind',
        shortHash: 'cbehind',
        subject: 'remote behind commit',
        refs: ['origin/feat/sync-test'],
        syncStatus: 'behind',
        isUnpulled: true,
        files: []
      }
    ]
  });

  assert.ok(panelHtml.includes('git-sync-badge'));
  assert.ok(panelHtml.includes('⇡2'));
  assert.ok(panelHtml.includes('⇣1'));
  assert.ok(panelHtml.includes('git-pill-unpushed'));
  assert.ok(panelHtml.includes('git-pill-unpulled'));

  const aheadCommit = {
    hash: 'c_ahead',
    shortHash: 'cahead',
    author: { name: 'Dev', email: 'dev@test.com' },
    subject: 'local ahead commit',
    syncStatus: 'ahead',
    isUnpushed: true
  };
  const cardHtml = renderInspectorCard(aheadCommit);
  assert.ok(cardHtml.includes('git-inspector-sync-badge'));
  assert.ok(cardHtml.includes('is-unpushed'));
});
