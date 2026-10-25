import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentSyncServer } from '../../framework/services/AgentSyncServer.js';

describe('AgentSyncServer', () => {
  const tmpDir = path.join(os.tmpdir(), `agent-sync-test-${Date.now()}`);
  const configPath = path.join(tmpDir, 'active_agents.json');
  let server;

  const mockVcs = {
    getRepositoryOverview: () => ({
      isRepo: true,
      status: { branch: 'feat/test', ahead: 2, behind: 0 },
      pullRequest: { number: 42, title: 'feat: mock pr' },
      commits: [{ hash: '123', subject: 'initial' }]
    }),
    gitService: {
      fetch: () => true
    }
  };

  before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    server = new AgentSyncServer({
      port: 53913,
      configPath,
      vcsOrchestrator: mockVcs
    });
    await server.start();
  });

  after(async () => {
    if (server) await server.stop();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('reads empty agents when file does not exist', () => {
    const agents = server.readActiveAgents();
    assert.deepEqual(agents, {});
  });

  it('updates agent for a specific cascadeId and writes to disk', () => {
    server.updateAgentForCascade('cascade-123', {
      id: 'lead-architect',
      name: 'Lead Architect',
      color: '#38bdf8',
      filePath: '/path/to/architect.md'
    });

    const onDisk = server.readActiveAgents();
    assert.equal(onDisk['cascade-123'].id, 'lead-architect');
    assert.equal(onDisk['cascade-123'].name, 'Lead Architect');
  });

  it('handles HTTP POST /active-agent and GET /active-agents', async () => {
    const postRes = await fetch('http://127.0.0.1:53913/active-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cascadeId: 'cascade-456',
        agent: {
          id: 'code-reviewer',
          name: 'Code Reviewer',
          color: '#34d399',
          filePath: '/path/to/reviewer.md'
        }
      })
    });
    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.success, true);
    assert.equal(postData.cascadeId, 'cascade-456');

    const getRes = await fetch('http://127.0.0.1:53913/active-agents');
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData['cascade-123'].id, 'lead-architect');
    assert.equal(getData['cascade-456'].id, 'code-reviewer');
  });

  it('handles HTTP GET /vcs/overview and POST /vcs/fetch', async () => {
    const overviewRes = await fetch('http://127.0.0.1:53913/vcs/overview');
    assert.equal(overviewRes.status, 200);
    const overviewData = await overviewRes.json();
    assert.equal(overviewData.isRepo, true);
    assert.equal(overviewData.status.branch, 'feat/test');
    assert.equal(overviewData.pullRequest.number, 42);

    const fetchRes = await fetch('http://127.0.0.1:53913/vcs/fetch', { method: 'POST' });
    assert.equal(fetchRes.status, 200);
    const fetchData = await fetchRes.json();
    assert.equal(fetchData.success, true);
  });
});
