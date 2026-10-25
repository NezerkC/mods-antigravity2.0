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
   * @param {number} [options.limit=50]
   * @returns {Object}
   */
  getRepositoryOverview(options = {}) {
    const limit = options.limit ?? 50;

    const status = this.gitService.getGitStatus({ repoPath: this.repoPath });
    if (!status || !status.isRepo) {
      return {
        isRepo: false,
        status: status || { branch: '', isClean: true, changedFiles: [], ahead: 0, behind: 0 },
        github: { isGitHub: false },
        pullRequest: null,
        recentRuns: [],
        commits: []
      };
    }

    const githubMeta = this.gitService.getGitHubMetadata({ repoPath: this.repoPath });
    const commits = this.gitService.getGitLog({ repoPath: this.repoPath, limit });

    let pullRequest = null;
    let recentRuns = [];

    if (githubMeta && githubMeta.isGitHub) {
      pullRequest = this.githubCliService.getActivePullRequest(status.branch);
      recentRuns = this.githubCliService.getRecentRuns({ branch: status.branch, limit: 5 });
    }

    return {
      isRepo: true,
      repoPath: this.repoPath,
      activeRepo: githubMeta.fullName || 'workspace',
      status,
      github: githubMeta,
      pullRequest,
      recentRuns,
      commits
    };
  }
}
