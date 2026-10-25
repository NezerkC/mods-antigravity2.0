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


