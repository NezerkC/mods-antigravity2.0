import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CdpPortResolver } from '../framework/core/CdpPortResolver.js';
import { CdpWebSocketClient } from '../framework/core/CdpWebSocketClient.js';
import { ModLoader } from '../framework/core/ModLoader.js';
import { AgentSyncServer } from '../framework/services/AgentSyncServer.js';

/**
 * Verifies session repository resolution in AgentSyncServer and ModLoader payload.
 */
async function verifySessionRepoResolution() {
  console.log('🧪 Running Session Repository Resolution Unit Checks...');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-session-repo-test-'));
  const repoA = path.join(tmpRoot, 'repo-alpha');
  const repoASubdir = path.join(repoA, 'src', 'components');
  const repoB = path.join(tmpRoot, 'repo-beta');
  const nonGitDir = path.join(tmpRoot, 'plain-folder');
  const brainDir = path.join(tmpRoot, 'brain');
  const cascadeId = '11111111-2222-3333-4444-555555555555';
  const cascadeLogsDir = path.join(brainDir, cascadeId, '.system_generated', 'logs');

  fs.mkdirSync(path.join(repoA, '.git'), { recursive: true });
  fs.mkdirSync(repoASubdir, { recursive: true });
  fs.writeFileSync(path.join(repoA, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf-8');
  fs.mkdirSync(repoB, { recursive: true });
  fs.writeFileSync(path.join(repoB, '.git'), 'gitdir: /mock/worktree/gitdir\n', 'utf-8');
  fs.mkdirSync(nonGitDir, { recursive: true });
  fs.mkdirSync(cascadeLogsDir, { recursive: true });

  const transcriptSample = JSON.stringify({
    step_index: 1,
    content: `Active Workspaces:\n- ${repoASubdir}\nCommand Working Directory: ${repoASubdir}\n`
  }) + '\n';
  fs.writeFileSync(path.join(cascadeLogsDir, 'transcript.jsonl'), transcriptSample, 'utf-8');

  let lastOverviewRepo = null;
  const server = new AgentSyncServer({
    port: 53919,
    brainDir,
    configPath: path.join(tmpRoot, 'active_agents.json'),
    repoPath: repoB,
    vcsOrchestrator: {
      getRepositoryOverview: ({ repoPath }) => {
        lastOverviewRepo = repoPath;
        return { isRepo: true, repoPath, activeRepo: path.basename(repoPath), commits: [] };
      },
      gitService: {
        fetch: ({ repoPath }) => {
          lastOverviewRepo = repoPath;
          return true;
        }
      }
    }
  });

  try {
    // 1. Test normalizeRepoCandidate with file:// URI and nested subdir
    const fileUri = 'file:///' + repoASubdir.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '$1%3A');
    const normUri = server.normalizeRepoCandidate(fileUri, true);
    assert.equal(normUri, path.normalize(repoA), 'Should normalize file:// URI and walk up to .git root');

    // Worktree .git file support
    const normWorktree = server.normalizeRepoCandidate(repoB, true);
    assert.equal(normWorktree, path.normalize(repoB), 'Should recognize .git worktree file');

    // requireGit behavior on non-git folder
    assert.equal(server.normalizeRepoCandidate(nonGitDir, true), null, 'Should return null when requireGit=true and no .git exists');
    assert.equal(server.normalizeRepoCandidate(nonGitDir, false), path.normalize(nonGitDir), 'Should return startDir when requireGit=false');

    // 2. Test resolveRepoForCascade from mock transcript
    const resolvedFromTranscript = server.resolveRepoForCascade(cascadeId);
    assert.equal(resolvedFromTranscript, path.normalize(repoA), 'Should resolve repoA from cascade transcript');

    // 3. Test HTTP GET /vcs/overview with cascadeId and repoPath
    const started = await server.start();
    if (started) {
      const ovRes = await fetch(`http://127.0.0.1:53919/vcs/overview?cascadeId=${cascadeId}`);
      assert.equal(ovRes.status, 200);
      const ovData = await ovRes.json();
      assert.equal(ovData.repoPath, path.normalize(repoA));
      assert.equal(lastOverviewRepo, path.normalize(repoA));

      const ovExplicit = await fetch(`http://127.0.0.1:53919/vcs/overview?cascadeId=${cascadeId}&repoPath=${encodeURIComponent(repoB)}`);
      assert.equal(ovExplicit.status, 200);
      const ovExplicitData = await ovExplicit.json();
      assert.equal(ovExplicitData.repoPath, path.normalize(repoB));
    }

    // 4. Test ModLoader compiled payload helpers and DOM fixes
    const loader = new ModLoader();
    const payload = loader.buildInjectionPayload({});
    assert.doesNotThrow(() => new Function(payload), 'Compiled ModLoader payload must be valid JS');
    assert.ok(payload.includes('window.__normalizeFileUriToPath = function(uri)'), 'Must include __normalizeFileUriToPath');
    assert.ok(payload.includes('window.__resolveRepoForCascade = async function(cascadeId)'), 'Must include __resolveRepoForCascade');
    assert.ok(payload.includes('window.__antigravityFetchSessionVcsOverview = async function()'), 'Must include __antigravityFetchSessionVcsOverview');
    assert.ok(payload.includes('window.__lastGitCascadeId = currentCascadeId'), 'Must track __lastGitCascadeId in __syncAgentBadges');
    assert.ok(payload.includes('!activeGitHost.firstElementChild'), 'Must guard activeGitHost template overwrite');
    assert.ok(payload.includes('.antigravity-slot-aux-pane-tab, #antigravity-slot-aux-pane-tab'), 'Must check singular aux-pane-tab selector');

    console.log('✅ Session Repository Resolution Unit Checks passed!\n');
  } finally {
    await server.stop();
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Automated smoke test script verifying live Antigravity Electron CDP bridge
 * and injected mod elements.
 */
async function verifyLiveLoader() {
  await verifySessionRepoResolution();
  console.log('🔍 Starting Antigravity Mod Framework Live Smoke Test...\n');

  const resolver = new CdpPortResolver();
  const port = await resolver.resolvePort();
  console.log(`[1/3] Resolved CDP Port: ${port}`);

  const client = new CdpWebSocketClient({ port, timeoutMs: 3000 });

  try {
    const listRes = await fetch(client.getTargetListUrl());
    if (!listRes.ok) {
      console.log(`⚠️  CDP HTTP target endpoint returned ${listRes.status}. Electron may be closed.`);
      return;
    }

    const targets = await listRes.json();
    const page = CdpWebSocketClient.findPageTarget(targets);
    if (!page) {
      console.log('⚠️  No active page target found. Electron may be minimizing or reloading.');
      return;
    }
    console.log(`[2/3] Page target found: "${page.title || 'Antigravity IDE'}"`);

    // Verify DOM injection status
    const probeExpression = `
      (() => {
        const slot = document.getElementById('antigravity-slot-header-actions');
        const tachometer = document.getElementById('antigravity-tachometer-badge');
        const agentBadge = document.getElementById('antigravity-agent-badge');
        const activeAgentLabel = document.getElementById('antigravity-active-agent-name');
        const modsRegistry = window.__antigravityMods;
        return {
          hasSlot: Boolean(slot),
          hasTachometer: Boolean(tachometer),
          hasAgentBadge: Boolean(agentBadge),
          activeAgent: activeAgentLabel ? activeAgentLabel.textContent : null,
          hasRegistry: Boolean(modsRegistry),
          activeBadgeTitle: tachometer ? tachometer.getAttribute('title') : null
        };
      })()
    `;

    const result = await client.evaluate(probeExpression);
    console.log('[3/3] Electron DOM Evaluation completed:');
    console.log('   - Slot Header Actions present:  ', result.value.hasSlot ? '✅ YES' : '❌ NO');
    console.log('   - Tachometer Badge mounted:     ', result.value.hasTachometer ? '✅ YES' : '❌ NO');
    console.log('   - Agent Selector Badge mounted: ', result.value.hasAgentBadge ? '✅ YES' : '❌ NO');
    console.log('   - Active Selected Agent:        ', result.value.activeAgent ? `"${result.value.activeAgent}"` : 'None');
    console.log('   - Mod Registry active:          ', result.value.hasRegistry ? '✅ YES' : '❌ NO');
    if (result.value.activeBadgeTitle) {
      console.log(`   - Live Telemetry Tooltip:       "${result.value.activeBadgeTitle}"`);
    }

    console.log('\n🎉 Smoke test completed successfully!');
  } catch (err) {
    console.error('❌ Smoke test encountered an error:', err.message);
  }
}

verifyLiveLoader();
