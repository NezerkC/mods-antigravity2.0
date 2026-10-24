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

  before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    server = new AgentSyncServer({ port: 53913, configPath });
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
});
