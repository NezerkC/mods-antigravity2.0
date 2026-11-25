import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentDiscoveryService } from '../../framework/services/AgentDiscoveryService.js';

test('AgentDiscoveryService - parses frontmatter and markdown headers from agent files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-discovery-'));
  const testAgentPath = path.join(tmpDir, 'custom.agent.md');

  fs.writeFileSync(testAgentPath, `---
name: Neural Architect
role: Deep Neural Synapse Designer
category: AI Engineering
icon: 🧠
---

# Neural Architect

Specialist for conscious feedback loops and neural fission cycles.
  `);

  const service = new AgentDiscoveryService({ searchRoots: [tmpDir] });
  const agents = service.discoverAgents();

  assert.equal(agents.length, 1);
  assert.equal(agents[0].id, 'neural-architect');
  assert.equal(agents[0].name, 'Neural Architect');
  assert.equal(agents[0].role, 'Deep Neural Synapse Designer');
  assert.equal(agents[0].category, 'AI Engineering');
  assert.equal(agents[0].icon, '🧠');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('AgentDiscoveryService - excludes heavy directories and uses TTL cache', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-discovery-cache-'));
  try {
    const validFile = path.join(tmpDir, 'valid.agent.md');
    fs.writeFileSync(validFile, '---\nname: Valid Agent\nrole: Core Role\n---\n');

    for (const ignoredDir of ['scratch', 'tests', 'apps', '__pycache__', '.playwright-mcp']) {
      const p = path.join(tmpDir, ignoredDir);
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, 'ignored.agent.md'), `---\nname: Ignored ${ignoredDir}\n---\n`);
    }

    const service = new AgentDiscoveryService({ searchRoots: [tmpDir], cacheTtlMs: 5000 });
    const first = service.discoverAgents({ now: 1000 });
    assert.equal(first.length, 1);
    assert.equal(first[0].id, 'valid-agent');

    // Write another valid file and confirm TTL cache serves cached snapshot within TTL
    fs.writeFileSync(path.join(tmpDir, 'late.agent.md'), '---\nname: Late Agent\nrole: Dynamic\n---\n');
    const cached = service.discoverAgents({ now: 2000 });
    assert.equal(cached.length, 1);

    // After TTL expires, fresh scan discovers the new agent
    const refreshed = service.discoverAgents({ now: 7000 });
    assert.equal(refreshed.length, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AgentDiscoveryService - discovers agent files without frontmatter using markdown headers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-discovery-h1-'));
  const testAgentPath = path.join(tmpDir, 'Agente Quantum.md');

  fs.writeFileSync(testAgentPath, `# Agente Quantum

Expert in quantum entanglement logic and high dimensional states.
  `);

  const service = new AgentDiscoveryService({ searchRoots: [tmpDir] });
  const agents = service.discoverAgents();

  assert.equal(agents.length, 1);
  assert.equal(agents[0].id, 'quantum');
  assert.equal(agents[0].name, 'Quantum');
  assert.ok(agents[0].role.includes('quantum entanglement'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('AgentDiscoveryService - excludes heavy directories and uses TTL cache', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-discovery-cache-'));
  try {
    const validFile = path.join(tmpDir, 'valid.agent.md');
    fs.writeFileSync(validFile, '---\nname: Valid Agent\nrole: Core Role\n---\n');

    for (const ignoredDir of ['scratch', 'tests', 'apps', '__pycache__', '.playwright-mcp']) {
      const p = path.join(tmpDir, ignoredDir);
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, 'ignored.agent.md'), `---\nname: Ignored ${ignoredDir}\n---\n`);
    }

    const service = new AgentDiscoveryService({ searchRoots: [tmpDir], cacheTtlMs: 5000 });
    const first = service.discoverAgents({ now: 1000 });
    assert.equal(first.length, 1);
    assert.equal(first[0].id, 'valid-agent');

    // Write another valid file and confirm TTL cache serves cached snapshot within TTL
    fs.writeFileSync(path.join(tmpDir, 'late.agent.md'), '---\nname: Late Agent\nrole: Dynamic\n---\n');
    const cached = service.discoverAgents({ now: 2000 });
    assert.equal(cached.length, 1);

    // After TTL expires, fresh scan discovers the new agent
    const refreshed = service.discoverAgents({ now: 7000 });
    assert.equal(refreshed.length, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
