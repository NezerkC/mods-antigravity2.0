import { GitService } from './GitService.js';
import { GitHubCliService } from './GitHubCliService.js';

/**
 * Orchestrator combining local Git repository data and remote GitHub CLI metadata
 * into a single unified payload for the Antigravity VCS mod and HTTP bridge.
 */
export class VcsOrchestrator {
  /**
   * @param {Object} [options]
   * @param {GitService} [options.gitService]
   * @param {GitHubCliService} [options.githubCliService]
   * @param {string} [options.repoPath]
   */
  constructor(options = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.gitService = options.gitService || new GitService();
    this.githubCliService = options.githubCliService || new GitHubCliService({ repoPath: this.repoPath });
  }

  /**
   * Produces unified repository status, commit DAG, active PR, and CI/CD runs.
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @param {number} [options.limit=50]
   * @returns {Object}
   */
  getRepositoryOverview(options = {}) {
    const limit = options.limit ?? 50;
    const repoPath = options.repoPath || this.repoPath;

    const status = this.gitService.getGitStatus({ repoPath });
    if (!status || !status.isRepo) {
      return {
        isRepo: false,
        status: status || { branch: '', isClean: true, changedFiles: [], ahead: 0, behind: 0 },
        github: { isGitHub: false },
        pullRequest: null,
        recentRuns: [],
        commits: [],
        branches: { local: [], remote: [] }
      };
    }

    const githubMeta = this.gitService.getGitHubMetadata({ repoPath });
    const commits = this.gitService.getGitLog({ repoPath, limit });
    const branches = this.gitService.getBranches({ repoPath });

    let pullRequest = null;
    let recentRuns = [];

    if (githubMeta && githubMeta.isGitHub) {
      const ghService = (repoPath === this.repoPath) ? this.githubCliService : new GitHubCliService({ repoPath });
      pullRequest = ghService.getActivePullRequest(status.branch);
      recentRuns = ghService.getRecentRuns({ branch: status.branch, limit: 5 });
    }

    return {
      isRepo: true,
      repoPath,
      activeRepo: githubMeta.fullName || 'workspace',
      status,
      github: githubMeta,
      branches,
      pullRequest,
      recentRuns,
      commits
    };
  }
}
