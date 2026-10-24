import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Service providing high-performance Git operations, DAG topology graph calculation,
 * collaborator avatar resolution, and GitHub metadata for Antigravity UI mods.
 */
export class GitService {
  /**
   * Computes Gravatar identicon URL based on author email.
   * @param {string} [email='']
   * @returns {string}
   */
  computeAvatarUrl(email = '') {
    const clean = String(email).trim().toLowerCase();
    const hash = crypto.createHash('md5').update(clean).digest('hex');
    return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=64`;
  }

  /**
   * Parses a Git remote URL to extract GitHub owner and repository metadata.
   * @param {string} remoteUrl
   * @returns {Object}
   */
  parseGitHubRemote(remoteUrl) {
    if (!remoteUrl || typeof remoteUrl !== 'string') {
      return { isGitHub: false };
    }

    const trimmed = remoteUrl.trim();
    // Match HTTPS: https://github.com/:owner/:repo(.git)?
    // Match SSH: git@github.com::owner/:repo(.git)?
    const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);

    const match = httpsMatch || sshMatch;
    if (!match) {
      return { isGitHub: false };
    }

    const owner = match[1];
    const repo = match[2];
    const webUrl = `https://github.com/${owner}/${repo}`;

    return {
      isGitHub: true,
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      webUrl,
      getCommitUrl: (hash) => `${webUrl}/commit/${hash}`,
      getBranchUrl: (branch) => `${webUrl}/tree/${branch}`,
      getPrUrl: (prNumber) => `${webUrl}/pull/${prNumber}`
    };
  }

  /**
   * Reads GitHub metadata from the local repository's `origin` remote.
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @returns {Object}
   */
  getGitHubMetadata(options = {}) {
    const repoPath = options.repoPath || process.cwd();
    try {
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      return this.parseGitHubRemote(remoteUrl);
    } catch {
      return { isGitHub: false };
    }
  }

  /**
   * Computes topological lanes and Bezier branch route connections for commits.
   * Uses an iterative lane allocation algorithm.
   * @param {Array<Object>} commits
   * @returns {Array<Object>}
   */
  computeTopology(commits) {
    if (!Array.isArray(commits) || commits.length === 0) {
      return [];
    }

    /** @type {Array<string | null>} active lanes containing expected commit hashes */
    const activeLanes = [];
    const enriched = [];

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const { hash, parents = [] } = commit;

      // 1. Find or allocate lane for this commit
      let laneIndex = activeLanes.indexOf(hash);
      if (laneIndex === -1) {
        // Allocate in the first empty slot or append
        laneIndex = activeLanes.indexOf(null);
        if (laneIndex === -1) {
          laneIndex = activeLanes.length;
          activeLanes.push(hash);
        } else {
          activeLanes[laneIndex] = hash;
        }
      }

      const routes = [];

      if (parents.length === 0) {
        // Root commit: free up lane
        activeLanes[laneIndex] = null;
      } else {
        // First parent continues on this lane
        const primaryParent = parents[0];
        activeLanes[laneIndex] = primaryParent;
        routes.push({ fromLane: laneIndex, toLane: laneIndex, type: 'straight' });

        // Additional parents (merges)
        for (let p = 1; p < parents.length; p++) {
          const mergeParent = parents[p];
          let parentLane = activeLanes.indexOf(mergeParent);
          if (parentLane === -1) {
            parentLane = activeLanes.indexOf(null);
            if (parentLane === -1) {
              parentLane = activeLanes.length;
              activeLanes.push(mergeParent);
            } else {
              activeLanes[parentLane] = mergeParent;
            }
          }
          routes.push({ fromLane: laneIndex, toLane: parentLane, type: 'merge' });
        }
      }

      // Clean trailing nulls
      while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
        activeLanes.pop();
      }

      enriched.push({
        ...commit,
        lane: laneIndex,
        routes
      });
    }

    return enriched;
  }

  /**
   * Retrieves Git commit history and topological DAG graph.
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @param {number} [options.limit=50]
   * @returns {Array<Object>}
   */
  getGitLog(options = {}) {
    const repoPath = options.repoPath || process.cwd();
    const limit = options.limit ?? 50;

    try {
      const format = 'COMMIT:%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D';
      const rawLog = execSync(`git log --format="${format}" --name-status -n ${limit}`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });

      const rawCommits = [];
      let currentCommit = null;

      const lines = rawLog.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('COMMIT:')) {
          const parts = trimmed.slice(7).split('\0');
          const hash = parts[0] || '';
          const parents = parts[1] ? parts[1].split(' ').filter(Boolean) : [];
          const authorName = parts[2] || 'Unknown';
          const authorEmail = parts[3] || '';
          const timestamp = parseInt(parts[4], 10) || Math.floor(Date.now() / 1000);
          const subject = parts[5] || '';
          const refNamesStr = parts[6] || '';
          const refs = refNamesStr
            ? refNamesStr.split(',').map(r => r.trim()).filter(Boolean)
            : [];

          currentCommit = {
            hash,
            shortHash: hash.slice(0, 7),
            parents,
            author: {
              name: authorName,
              email: authorEmail,
              avatarUrl: this.computeAvatarUrl(authorEmail)
            },
            date: timestamp,
            relativeDate: this._formatRelativeTime(timestamp),
            subject,
            refs,
            files: []
          };
          rawCommits.push(currentCommit);
        } else if (currentCommit) {
          const parts = trimmed.split('\t');
          if (parts.length >= 2) {
            const status = parts[0].trim();
            const filePath = parts[1].trim();
            const fileName = path.basename(filePath);
            const normDir = path.dirname(filePath).replace(/\//g, '\\');
            const ext = path.extname(fileName).replace('.', '').toUpperCase() || 'FILE';
            currentCommit.files.push({
              status,
              path: filePath,
              fileName,
              dir: normDir === '.' ? '' : normDir,
              ext
            });
          }
        }
      }

      return this.computeTopology(rawCommits);
    } catch (err) {
      return [];
    }
  }

  /**
   * Retrieves working tree and branch status.
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @returns {Object}
   */
  getGitStatus(options = {}) {
    const repoPath = options.repoPath || process.cwd();

    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();

      const porcelain = execSync('git status --porcelain', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });

      const changedFiles = porcelain
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const code = line.slice(0, 2).trim();
          const file = line.slice(2).trim();
          return { code, file };
        });

      let ahead = 0;
      let behind = 0;
      try {
        const revCounts = execSync('git rev-list --left-right --count HEAD...@{u}', {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        const parts = revCounts.split(/\s+/);
        if (parts.length >= 2) {
          ahead = parseInt(parts[0], 10) || 0;
          behind = parseInt(parts[1], 10) || 0;
        }
      } catch {
        // No upstream tracked
      }

      return {
        isRepo: true,
        branch,
        isClean: changedFiles.length === 0,
        changedFiles,
        ahead,
        behind
      };
    } catch {
      return {
        isRepo: false,
        branch: '',
        isClean: true,
        changedFiles: [],
        ahead: 0,
        behind: 0
      };
    }
  }

  /**
   * Watches a git repository for head and ref changes and invokes callback.
   * @param {Object} options
   * @param {string} options.repoPath
   * @param {Function} options.onChange
   * @returns {Function} cleanup unsubscribe function
   */
  watchRepository(options = {}) {
    const repoPath = options.repoPath || process.cwd();
    const onChange = options.onChange || (() => {});
    const gitDir = path.join(repoPath, '.git');

    if (!fs.existsSync(gitDir)) {
      return () => {};
    }

    const watchers = [];
    let debounceTimer = null;
    const notify = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChange();
      }, 250);
    };

    try {
      const headPath = path.join(gitDir, 'HEAD');
      if (fs.existsSync(headPath)) {
        watchers.push(fs.watch(headPath, notify));
      }

      const refsDir = path.join(gitDir, 'refs');
      if (fs.existsSync(refsDir)) {
        watchers.push(fs.watch(refsDir, { recursive: true }, notify));
      }
    } catch {
      // Silently ignore watching errors on non-supported environments
    }

    return () => {
      clearTimeout(debounceTimer);
      for (const w of watchers) {
        try {
          w.close();
        } catch {}
      }
    };
  }

  /**
   * Helper formatting relative timestamp.
   * @private
   */
  _formatRelativeTime(unixTimestamp) {
    const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000 - unixTimestamp));
    if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
    const minutes = Math.floor(elapsedSeconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
