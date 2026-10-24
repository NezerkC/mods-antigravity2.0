import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { GitService } from '../../framework/services/GitService.js';

test('GitService - computeAvatarUrl generates deterministic Gravatar identicon URL', () => {
  const service = new GitService();
  const url = service.computeAvatarUrl('victor@example.com');
  assert.ok(url.startsWith('https://www.gravatar.com/avatar/'));
  assert.ok(url.includes('?d=identicon'));

  // Should be lowercase trimmed hash
  const urlUpper = service.computeAvatarUrl('  VICTOR@EXAMPLE.COM  ');
  assert.equal(url, urlUpper);
});

test('GitService - parseGitHubRemote parses HTTPS and SSH GitHub remote URLs', () => {
  const service = new GitService();

  const httpsRemote = service.parseGitHubRemote('https://github.com/NezerkC/mods-antigravity2.0.git');
  assert.ok(httpsRemote);
  assert.equal(httpsRemote.isGitHub, true);
  assert.equal(httpsRemote.owner, 'NezerkC');
  assert.equal(httpsRemote.repo, 'mods-antigravity2.0');
  assert.equal(httpsRemote.fullName, 'NezerkC/mods-antigravity2.0');
  assert.equal(httpsRemote.webUrl, 'https://github.com/NezerkC/mods-antigravity2.0');
  assert.equal(httpsRemote.getCommitUrl('a4f9e2b'), 'https://github.com/NezerkC/mods-antigravity2.0/commit/a4f9e2b');

  const sshRemote = service.parseGitHubRemote('git@github.com:facebook/react.git');
  assert.ok(sshRemote);
  assert.equal(sshRemote.owner, 'facebook');
  assert.equal(sshRemote.repo, 'react');
  assert.equal(sshRemote.fullName, 'facebook/react');

  const nonGitHub = service.parseGitHubRemote('https://gitlab.com/user/project.git');
  assert.equal(nonGitHub.isGitHub, false);
});

test('GitService - computeTopology assigns sequential lanes and routes', () => {
  const service = new GitService();

  // Simulated commit chain: c3 (HEAD) -> c2 (branch) -> c1 (root)
  const rawCommits = [
    { hash: 'c3', parents: ['c2'], subject: 'commit 3' },
    { hash: 'c2', parents: ['c1'], subject: 'commit 2' },
    { hash: 'c1', parents: [], subject: 'root commit' }
  ];

  const enriched = service.computeTopology(rawCommits);
  assert.equal(enriched.length, 3);
  assert.equal(enriched[0].lane, 0);
  assert.equal(enriched[1].lane, 0);
  assert.equal(enriched[2].lane, 0);
});

test('GitService - computeTopology handles branch forks and merges', () => {
  const service = new GitService();

  // Fork and merge graph:
  // c4 (merge of c3 and c2)
  // c3 (branch feat, parent c1)
  // c2 (main branch, parent c1)
  // c1 (root)
  const rawCommits = [
    { hash: 'c4', parents: ['c3', 'c2'], subject: 'merge commit' },
    { hash: 'c3', parents: ['c1'], subject: 'feat commit' },
    { hash: 'c2', parents: ['c1'], subject: 'main commit' },
    { hash: 'c1', parents: [], subject: 'root' }
  ];

  const enriched = service.computeTopology(rawCommits);
  assert.equal(enriched.length, 4);
  assert.equal(typeof enriched[0].lane, 'number');
  assert.ok(Array.isArray(enriched[0].routes));
});

test('GitService - getGitLog reads live repository commits', () => {
  const service = new GitService();
  const repoPath = process.cwd();

  const log = service.getGitLog({ repoPath, limit: 5 });
  assert.ok(Array.isArray(log));
  assert.ok(log.length > 0);

  const head = log[0];
  assert.ok(head.hash);
  assert.ok(head.shortHash);
  assert.ok(head.author);
  assert.ok(head.author.name);
  assert.ok(head.author.avatarUrl);
  assert.ok(head.subject);
  assert.ok(typeof head.lane === 'number');
});

test('GitService - getGitStatus reads current repository status', () => {
  const service = new GitService();
  const repoPath = process.cwd();

  const status = service.getGitStatus({ repoPath });
  assert.ok(status.isRepo);
  assert.ok(status.branch);
  assert.ok(typeof status.isClean === 'boolean');
  assert.ok(Array.isArray(status.changedFiles));
});
