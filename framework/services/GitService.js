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
  /**
   * Computes topological lanes and Bezier branch route connections for commits.
   * Guarantees:
   * 1. The trunk (main/master) is anchored to Lane 0.
   * 2. Continuous pass-through routes are emitted on EVERY row for all active lanes,
   *    ensuring the blue main line and feature branch lines never break into floating islands.
   * 3. Smooth Bezier curves connect branches to/from main.
   * 4. Each commit is marked with pushed: boolean (false if unpushed local commit).
   * @param {Array<Object>} commits
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @returns {Array<Object>}
   */
  computeTopology(commits, options = {}) {
    if (!Array.isArray(commits) || commits.length === 0) {
      return [];
    }

    const repoPath = options.repoPath || process.cwd();

    // Determine set of commit hashes on trunk (main/master/origin/main)
    const trunkHashes = new Set();
    const remoteHashes = new Set();
    const localHashes = new Set();
    try {
      const trunkLog = execSync('git rev-list --first-parent origin/main || git rev-list --first-parent main || git rev-list origin/main || git rev-list main', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      for (const h of trunkLog.split('\n')) {
        const tr = h.trim();
        if (tr) trunkHashes.add(tr);
      }
    } catch {
      // fallback: commit at the very end or with 'main' ref
    }

    try {
      const locLog = execSync('git rev-list --branches HEAD', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      for (const h of locLog.split('\n')) {
        const tr = h.trim();
        if (tr) localHashes.add(tr);
      }
    } catch {
      // fallback
    }

    try {
      const remLog = execSync('git rev-list --remotes', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      for (const h of remLog.split('\n')) {
        const tr = h.trim();
        if (tr) remoteHashes.add(tr);
      }
    } catch {
      // fallback
    }

    // Pass 1: Assign lanes deterministically
    // Lane 0 is strictly reserved for trunk commits (or current branch base if trunk is empty)
    const activeLanes = [];
    const commitLanes = new Array(commits.length);

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const { hash, parents = [] } = commit;
      const hasKnownTrunk = commits.some(c => trunkHashes.has(c.hash));
      const isTrunkCommit = hasKnownTrunk ? trunkHashes.has(hash) : (i === 0 || activeLanes[0] === hash);

      const matchingLanes = [];
      for (let k = 0; k < activeLanes.length; k++) {
        if (activeLanes[k] === hash) {
          matchingLanes.push(k);
        }
      }

      let cLane;
      if (isTrunkCommit) {
        cLane = 0;
        // Free other lanes that converged into trunk
        for (const m of matchingLanes) {
          if (m !== 0) activeLanes[m] = null;
        }
      } else if (matchingLanes.length > 0) {
        cLane = matchingLanes[0] === 0 ? (activeLanes.indexOf(null, 1) !== -1 ? activeLanes.indexOf(null, 1) : Math.max(1, activeLanes.length)) : matchingLanes[0];
        for (let m = 1; m < matchingLanes.length; m++) {
          activeLanes[matchingLanes[m]] = null;
        }
      } else {
        // Find first empty slot >= 1 (Lane 0 is reserved for trunk)
        let slot = -1;
        for (let k = 1; k < activeLanes.length; k++) {
          if (activeLanes[k] === null) {
            slot = k;
            break;
          }
        }
        if (slot === -1) {
          slot = Math.max(1, activeLanes.length);
        }
        cLane = slot;
      }

      commitLanes[i] = cLane;

      while (activeLanes.length <= cLane) {
        activeLanes.push(null);
      }

      // Update activeLanes with parents
      if (parents.length === 0) {
        activeLanes[cLane] = null;
      } else {
        const primaryParent = parents[0];
        activeLanes[cLane] = primaryParent;

        for (let p = 1; p < parents.length; p++) {
          const mergeParent = parents[p];
          let pLane = activeLanes.indexOf(mergeParent);
          if (pLane === -1) {
            pLane = activeLanes.indexOf(null, 1);
            if (pLane === -1) {
              pLane = Math.max(1, activeLanes.length);
            }
            activeLanes[pLane] = mergeParent;
          }
        }
      }

      while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
        activeLanes.pop();
      }
    }

    // Pass 2: Re-simulate and generate CONTINUOUS pass-through routes on every row
    activeLanes.length = 0;
    const enriched = [];

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const { hash, parents = [] } = commit;
      const cLane = commitLanes[i];

      while (activeLanes.length <= cLane) {
        activeLanes.push(null);
      }

      // Free converging lanes that met at this commit
      for (let k = 0; k < activeLanes.length; k++) {
        if (activeLanes[k] === hash && k !== cLane) {
          activeLanes[k] = null;
        }
      }

      // Identify newly branched fork lanes
      const newForkLanes = [];
      if (parents.length === 0) {
        activeLanes[cLane] = null;
      } else {
        activeLanes[cLane] = parents[0];
        for (let p = 1; p < parents.length; p++) {
          const mergeParent = parents[p];
          let pLane = activeLanes.indexOf(mergeParent);
          if (pLane === -1) {
            pLane = activeLanes.indexOf(null, 1);
            if (pLane === -1) {
              pLane = Math.max(1, activeLanes.length);
            }
            activeLanes[pLane] = mergeParent;
            newForkLanes.push(pLane);
          }
        }
      }

      while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
        activeLanes.pop();
      }

      const routes = [];
      const nextIdx = i + 1;

      if (nextIdx < commits.length) {
        const nextCommit = commits[nextIdx];
        const nextLane = commitLanes[nextIdx];

        // Ensure ALL active lanes have connecting routes to the next row (Pass-through!)
        for (let lane = 0; lane < activeLanes.length; lane++) {
          const waitingFor = activeLanes[lane];
          if (!waitingFor) continue;

          if (newForkLanes.includes(lane)) continue;

          if (waitingFor === nextCommit.hash) {
            if (lane === nextLane) {
              routes.push({
                fromLane: lane,
                toLane: nextLane,
                type: 'straight',
                colorLane: lane
              });
            } else {
              routes.push({
                fromLane: lane,
                toLane: nextLane,
                type: 'merge',
                colorLane: lane
              });
            }
          } else {
            // Unbroken pass-through vertical trunk or branch line
            routes.push({
              fromLane: lane,
              toLane: lane,
              type: 'straight',
              colorLane: lane
            });
          }
        }

        // Curved fork routes
        for (const fLane of newForkLanes) {
          routes.push({
            fromLane: cLane,
            toLane: fLane,
            type: 'fork',
            colorLane: fLane
          });
        }
      }

      let isPushed = remoteHashes.size === 0 ? true : remoteHashes.has(hash);
      let isPendingPull = false;
      let syncState = 'synced';

      if (remoteHashes.size > 0 && localHashes.size > 0) {
        const inLocal = localHashes.has(hash);
        const inRemote = remoteHashes.has(hash);
        if (inLocal && !inRemote) {
          syncState = 'local_pending_push';
          isPushed = false;
        } else if (!inLocal && inRemote) {
          syncState = 'remote_pending_pull';
          isPendingPull = true;
          isPushed = true;
        } else {
          syncState = 'synced';
          isPushed = true;
        }
      } else {
        syncState = isPushed ? 'synced' : 'local_pending_push';
      }

      enriched.push({
        ...commit,
        lane: cLane,
        pushed: isPushed,
        pendingPull: isPendingPull,
        syncState,
        isTrunk: trunkHashes.has(hash),
        routes
      });
    }

    return enriched;
  }

  /**
   * Retrieves enriched branch descriptors grouped by similarity cluster,
   * tracking ahead (push), behind (pull), isMerged, and dirty files.
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @returns {Object}
   */
  getBranches(options = {}) {
    const repoPath = options.repoPath || process.cwd();
    try {
      // 1. Get raw branch list with tracking status
      const raw = execSync('git branch -a --format="%(refname:short)%00%(objectname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:track)"', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });

      // 2. Get merged branches in main
      let mergedInMain = new Set();
      try {
        const mergedRaw = execSync('git branch --merged main', {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        mergedRaw.split('\n').forEach(b => {
          const name = b.replace(/^[*\s]+/, '').trim();
          if (name) mergedInMain.add(name);
        });
      } catch {
        // fallback
      }

      // 3. Count dirty files
      let dirtyFiles = 0;
      try {
        const statusRaw = execSync('git status --porcelain', {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        dirtyFiles = statusRaw.split('\n').filter(l => l.trim().length > 0).length;
      } catch {
        dirtyFiles = 0;
      }

      const local = [];
      const remote = [];
      const clusters = {};

      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split('\0');
        const ref = parts[0] || '';
        const hash = parts[1] || '';
        const headMarker = parts[2] || '';
        const upstream = parts[3] || null;
        const track = parts[4] || '';
        const isCurrent = headMarker === '*';

        if (ref.startsWith('origin/') || ref.startsWith('remotes/origin/')) {
          const cleanName = ref.replace(/^remotes\//, '');
          if (!cleanName.includes('HEAD')) {
            remote.push({
              name: cleanName,
              shortName: cleanName.replace(/^origin\//, ''),
              hash: hash ? hash.slice(0, 7) : ''
            });
          }
        } else {
          // Parse ahead / behind from track string (e.g. "[ahead 1, behind 2]" or "[ahead 3]")
          let ahead = 0;
          let behind = 0;
          const aheadMatch = track.match(/ahead\s+(\d+)/);
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
          const behindMatch = track.match(/behind\s+(\d+)/);
          if (behindMatch) behind = parseInt(behindMatch[1], 10);

          // Infer cluster by prefix (e.g. feat/mods-vcs -> 'vcs', feat/framework- -> 'framework')
          let cluster = 'features';
          if (ref === 'main' || ref === 'master') {
            cluster = 'trunk';
          } else if (ref.includes('vcs') || ref.includes('git-graph')) {
            cluster = 'vcs';
          } else if (ref.includes('framework') || ref.includes('daemon') || ref.includes('tray')) {
            cluster = 'framework';
          } else if (ref.includes('mods') || ref.includes('agent')) {
            cluster = 'ui-mods';
          } else if (ref.startsWith('fix/')) {
            cluster = 'fixes';
          } else if (ref.startsWith('chore/') || ref.startsWith('ci')) {
            cluster = 'ci-governance';
          } else if (ref.startsWith('docs/')) {
            cluster = 'docs';
          }

          const branchObj = {
            name: ref,
            isCurrent,
            isTrunk: ref === 'main' || ref === 'master',
            cluster,
            upstream,
            ahead,
            behind,
            isMerged: mergedInMain.has(ref),
            dirtyFiles: isCurrent ? dirtyFiles : 0,
            hash: hash ? hash.slice(0, 7) : ''
          };

          local.push(branchObj);

          if (!clusters[cluster]) {
            clusters[cluster] = [];
          }
          clusters[cluster].push(branchObj);
        }
      }

      return { local, remote, clusters, trunk: 'main' };
    } catch {
      return { local: [], remote: [], clusters: {}, trunk: 'main' };
    }
  }  getGitLog(options = {}) {
    const repoPath = options.repoPath || process.cwd();
    const limit = options.limit ?? 50;

    try {
      const format = 'COMMIT:%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D';
      const rawLog = execSync(`git log --all --topo-order --format="${format}" --name-status -n ${limit}`, {
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
   * Retrieves all local and remote branches categorized.
   * @param {Object} [options]
   * @param {string} [options.repoPath]
   * @returns {{ local: Array<{ name: string, isCurrent: boolean, hash: string }>, remote: Array<{ name: string, shortName: string, hash: string }> }}
   */

  fetch(options = {}) {
    const repoPath = options.repoPath || process.cwd();
    try {
      execSync('git fetch --all --prune', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'ignore', 'ignore']
      });
      return true;
    } catch {
      return false;
    }
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
