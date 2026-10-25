import test from 'node:test';
import assert from 'node:assert/strict';
import { VcsOrchestrator } from '../../framework/services/VcsOrchestrator.js';

test('VcsOrchestrator - aggregates local Git and remote GitHub metadata into unified overview', () => {
  const mockGitService = {
    getGitStatus: () => ({
      isRepo: true,
      branch: 'feat/vcs-suite',
      isClean: false,
      changedFiles: [{ code: 'M', file: 'styles.css' }],
      ahead: 1,
      behind: 0
    }),
    getGitLog: () => [
      {
        hash: '2bffa5577bf852291e8bbec6a4975a806245e41a',
        shortHash: '2bffa55',
        subject: 'feat(mods): vcs implementation',
        author: { name: 'Victor', email: 'v@example.com', avatarUrl: 'https://gravatar.com/...' },
        date: 1783900000,
        relativeDate: '10m ago',
        refs: ['HEAD -> feat/vcs-suite'],
        lane: 0,
        routes: [],
        files: [{ status: 'M', path: 'styles.css', fileName: 'styles.css', dir: '', ext: 'CSS' }]
      }
    ],
    getGitHubMetadata: () => ({
      isGitHub: true,
      owner: 'NezerkC',
      repo: 'mods-antigravity2.0',
      fullName: 'NezerkC/mods-antigravity2.0',
      webUrl: 'https://github.com/NezerkC/mods-antigravity2.0'
    })
  };

  const mockGhService = {
    checkAuth: () => ({
      isInstalled: true,
      isAuthenticated: true,
      account: 'NezerkC',
      scopes: ['repo', 'workflow']
    }),
    getActivePullRequest: (branch) => {
      assert.equal(branch, 'feat/vcs-suite');
      return {
        number: 19,
        title: 'feat(vcs): pull request and ci cd suite',
        headRef: 'feat/vcs-suite',
        baseRef: 'main',
        url: 'https://github.com/NezerkC/mods/pull/19',
        state: 'OPEN',
        author: 'NezerkC',
        checks: [
          { name: 'Unit Tests', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: '...' }
        ],
        checksSummary: { total: 1, success: 1, failure: 0, pending: 0, status: 'SUCCESS' }
      };
    },
    getRecentRuns: () => [
      { workflowName: 'Continuous Integration', status: 'COMPLETED', conclusion: 'SUCCESS' }
    ]
  };

  const orchestrator = new VcsOrchestrator({
    gitService: mockGitService,
    githubCliService: mockGhService
  });

  const overview = orchestrator.getRepositoryOverview();

  assert.equal(overview.isRepo, true);
  assert.equal(overview.status.branch, 'feat/vcs-suite');
  assert.equal(overview.status.ahead, 1);
  assert.equal(overview.github.isGitHub, true);
  assert.ok(overview.pullRequest);
  assert.equal(overview.pullRequest.number, 19);
  assert.equal(overview.pullRequest.checksSummary.status, 'SUCCESS');
  assert.equal(overview.commits.length, 1);
  assert.equal(overview.recentRuns.length, 1);
});

test('VcsOrchestrator - handles non-git directory gracefully', () => {
  const mockGitService = {
    getGitStatus: () => ({ isRepo: false, branch: '', isClean: true, changedFiles: [], ahead: 0, behind: 0 }),
    getGitLog: () => [],
    getGitHubMetadata: () => ({ isGitHub: false })
  };

  const mockGhService = {
    checkAuth: () => ({ isInstalled: false, isAuthenticated: false, account: '', scopes: [] }),
    getActivePullRequest: () => null,
    getRecentRuns: () => []
  };

  const orchestrator = new VcsOrchestrator({
    gitService: mockGitService,
    githubCliService: mockGhService
  });

  const overview = orchestrator.getRepositoryOverview();
  assert.equal(overview.isRepo, false);
  assert.equal(overview.commits.length, 0);
  assert.equal(overview.pullRequest, null);
});
