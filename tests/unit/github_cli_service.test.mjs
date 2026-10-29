import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubCliService } from '../../framework/services/GitHubCliService.js';

test('GitHubCliService - detects missing gh CLI gracefully', () => {
  const service = new GitHubCliService({
    execFn: () => {
      const err = new Error('gh: command not found');
      err.code = 'ENOENT';
      throw err;
    }
  });

  const auth = service.checkAuth();
  assert.equal(auth.isInstalled, false);
  assert.equal(auth.isAuthenticated, false);
});

test('GitHubCliService - parses valid gh auth status output', () => {
  const mockOutput = `
github.com
  ✓ Logged in to github.com account NezerkC (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_mocktoken123
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
  `.trim();

  const service = new GitHubCliService({
    execFn: () => mockOutput
  });

  const auth = service.checkAuth();
  assert.equal(auth.isInstalled, true);
  assert.equal(auth.isAuthenticated, true);
  assert.equal(auth.account, 'NezerkC');
  assert.ok(auth.scopes.includes('repo'));
  assert.ok(auth.scopes.includes('workflow'));
});

test('GitHubCliService - retrieves and normalizes active Pull Request with CI checks', () => {
  const mockPrJson = JSON.stringify([
    {
      number: 18,
      title: 'feat(mods): add vcs graph suite',
      headRefName: 'feat/mods-vcs-suite',
      baseRefName: 'main',
      url: 'https://github.com/NezerkC/mods-antigravity2.0/pull/18',
      state: 'OPEN',
      author: { login: 'NezerkC' },
      statusCheckRollup: [
        {
          name: 'Unit Tests (20.x)',
          workflowName: 'Continuous Integration',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          detailsUrl: 'https://github.com/NezerkC/mods/actions/runs/1/job/1'
        },
        {
          name: 'Lint & Format',
          workflowName: 'Continuous Integration',
          status: 'IN_PROGRESS',
          conclusion: null,
          detailsUrl: 'https://github.com/NezerkC/mods/actions/runs/1/job/2'
        }
      ]
    }
  ]);

  const service = new GitHubCliService({
    execFn: (cmd) => {
      if (cmd.includes('pr list')) return mockPrJson;
      return '';
    }
  });

  const pr = service.getActivePullRequest('feat/mods-vcs-suite');
  assert.ok(pr);
  assert.equal(pr.number, 18);
  assert.equal(pr.title, 'feat(mods): add vcs graph suite');
  assert.equal(pr.headRef, 'feat/mods-vcs-suite');
  assert.equal(pr.baseRef, 'main');
  assert.equal(pr.state, 'OPEN');
  assert.equal(pr.author, 'NezerkC');
  assert.equal(pr.checks.length, 2);
  assert.equal(pr.checksSummary.total, 2);
  assert.equal(pr.checksSummary.success, 1);
  assert.equal(pr.checksSummary.pending, 1);
  assert.equal(pr.checksSummary.status, 'PENDING');
});

test('GitHubCliService - returns null when no PR exists for branch', () => {
  const service = new GitHubCliService({
    execFn: (cmd) => {
      if (cmd.includes('pr list')) return '[]';
      return '';
    }
  });

  const pr = service.getActivePullRequest('non-existent-branch');
  assert.equal(pr, null);
});

test('GitHubCliService - retrieves recent workflow runs for branch and repo', () => {
  const mockRunsJson = JSON.stringify([
    {
      name: 'Continuous Integration',
      workflowName: 'Continuous Integration',
      headSha: '2bffa55111111111111111111111111111111111',
      status: 'completed',
      conclusion: 'success',
      url: 'https://github.com/NezerkC/mods/actions/runs/100'
    },
    {
      name: 'Auto Progress Tracker',
      workflowName: 'Auto Progress Tracker',
      headSha: '2bffa55111111111111111111111111111111111',
      status: 'in_progress',
      conclusion: null,
      url: 'https://github.com/NezerkC/mods/actions/runs/101'
    }
  ]);

  const service = new GitHubCliService({
    execFn: (cmd) => {
      if (cmd.includes('run list')) return mockRunsJson;
      return '';
    }
  });

  const runs = service.getRecentRuns({ limit: 5 });
  assert.equal(runs.length, 2);
  assert.equal(runs[0].workflowName, 'Continuous Integration');
  assert.equal(runs[0].status, 'COMPLETED');
  assert.equal(runs[0].conclusion, 'SUCCESS');
  assert.equal(runs[1].status, 'IN_PROGRESS');
});
