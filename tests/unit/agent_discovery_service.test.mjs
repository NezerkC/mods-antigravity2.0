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
