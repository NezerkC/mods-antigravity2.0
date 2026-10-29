import { execSync } from 'node:child_process';

/**
 * Service for interacting with GitHub CLI (`gh`) in native JSON mode,
 * extracting Pull Requests, commit check status rollups, and CI/CD workflow runs.
 */
export class GitHubCliService {
  /**
   * @param {Object} [options]
   * @param {Function} [options.execFn] Custom executor function for testing / mocking
   * @param {string} [options.repoPath] Working repository directory
   */
  constructor(options = {}) {
    this.execFn = options.execFn || ((cmd, opts) => execSync(cmd, {
      cwd: opts?.cwd || this.repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }));
    this.repoPath = options.repoPath || process.cwd();
  }

  /**
   * Checks whether GitHub CLI is installed and user is authenticated.
   * @returns {{ isInstalled: boolean, isAuthenticated: boolean, account: string, scopes: string[] }}
   */
  checkAuth() {
    try {
      const output = this.execFn('gh auth status', { cwd: this.repoPath });
      const str = String(output || '');

      const isAuthed = str.includes('Logged in to github.com') || str.includes('✓');
      let account = '';
      const accountMatch = str.match(/account\s+([A-Za-z0-9_-]+)/i);
      if (accountMatch) {
        account = accountMatch[1];
      }

      const scopes = [];
      const scopesMatch = str.match(/Token scopes:\s*([^\r\n]+)/i);
      if (scopesMatch) {
        const rawTokens = scopesMatch[1].replace(/['"]/g, '').split(',');
        for (const s of rawTokens) {
          const trimmed = s.trim();
          if (trimmed) scopes.push(trimmed);
        }
      }

      return {
        isInstalled: true,
        isAuthenticated: isAuthed,
        account,
        scopes
      };
    } catch (err) {
      // Check if command not found
      return {
        isInstalled: false,
        isAuthenticated: false,
        account: '',
        scopes: []
      };
    }
  }

  /**
   * Retrieves active Pull Request for a given branch name.
   * @param {string} branch
   * @returns {Object | null}
   */
  getActivePullRequest(branch) {
    if (!branch) return null;

    try {
      const fields = 'number,title,headRefName,baseRefName,url,state,author,statusCheckRollup';
      const cmd = `gh pr list --head "${branch}" --limit 1 --json ${fields}`;
      const raw = this.execFn(cmd, { cwd: this.repoPath });
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return null;
      }

      const pr = parsed[0];
      const rawChecks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
      const checks = rawChecks.map(c => ({
        name: c.name || '',
        workflowName: c.workflowName || '',
        status: (c.status || '').toUpperCase(),
        conclusion: c.conclusion ? c.conclusion.toUpperCase() : null,
        detailsUrl: c.detailsUrl || ''
      }));

      // Summarize checks
      let successCount = 0;
      let failureCount = 0;
      let pendingCount = 0;

      for (const check of checks) {
        if (check.conclusion === 'SUCCESS') {
          successCount++;
        } else if (check.conclusion === 'FAILURE' || check.conclusion === 'TIMED_OUT' || check.conclusion === 'STARTUP_FAILURE') {
          failureCount++;
        } else {
          pendingCount++;
        }
      }

      let summaryStatus = 'SUCCESS';
      if (failureCount > 0) {
        summaryStatus = 'FAILURE';
      } else if (pendingCount > 0 || checks.length === 0) {
        summaryStatus = 'PENDING';
      }

      return {
        number: pr.number,
        title: pr.title,
        headRef: pr.headRefName,
        baseRef: pr.baseRefName,
        url: pr.url,
        state: pr.state,
        author: pr.author?.login || 'Unknown',
        checks,
        checksSummary: {
          total: checks.length,
          success: successCount,
          failure: failureCount,
          pending: pendingCount,
          status: summaryStatus
        }
      };
    } catch {
      return null;
    }
  }

  /**
   * Retrieves recent CI/CD workflow runs.
   * @param {Object} [options]
   * @param {number} [options.limit=5]
   * @param {string} [options.branch]
   * @returns {Array<Object>}
   */
  getRecentRuns(options = {}) {
    const limit = options.limit ?? 5;
    const branchFlag = options.branch ? `--branch "${options.branch}"` : '';

    try {
      const fields = 'name,workflowName,headSha,status,conclusion,url';
      const cmd = `gh run list ${branchFlag} --limit ${limit} --json ${fields}`.trim();
      const raw = this.execFn(cmd, { cwd: this.repoPath });
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) return [];

      return parsed.map(r => ({
        name: r.name || '',
        workflowName: r.workflowName || r.name || '',
        headSha: r.headSha || '',
        shortSha: (r.headSha || '').slice(0, 7),
        status: (r.status || '').toUpperCase(),
        conclusion: r.conclusion ? r.conclusion.toUpperCase() : null,
        url: r.url || ''
      }));
    } catch {
      return [];
    }
  }
}
