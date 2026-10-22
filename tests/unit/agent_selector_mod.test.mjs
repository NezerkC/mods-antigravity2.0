import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentSelectorMod } from '../../mods/agent-selector/index.js';
import { getAgentColor, AGENT_REGISTRY } from '../../mods/agent-selector/components/AgentDropdownHtml.js';

test('AgentSelectorMod - loads correct manifest metadata', () => {
  const mod = new AgentSelectorMod();
  assert.equal(mod.manifest.id, 'agent-selector');
  assert.equal(mod.manifest.slot, 'header-actions');
  assert.equal(mod.manifest.priority, 45);
});

test('AgentSelectorMod - renders badge with fedora sunglasses icon and agent dropdown', () => {
  const mod = new AgentSelectorMod();
  const rendered = mod.render({});

  assert.ok(rendered.html);
  assert.ok(rendered.css);
  assert.ok(rendered.html.includes('antigravity-agent-badge'));
  assert.ok(rendered.html.includes('antigravity-agent-dropdown'));
  assert.ok(rendered.html.includes('antigravity-agent-icon'));
  assert.ok(rendered.html.includes('Lead Architect'));
  assert.ok(rendered.html.includes('Scrum Master'));
});

test('AgentSelectorMod - assigns unique deterministic colors to each agent', () => {
  assert.equal(typeof getAgentColor, 'function');
  const colors = new Set();
  for (const agent of AGENT_REGISTRY) {
    const color = getAgentColor(agent.id);
    assert.ok(color.startsWith('hsl(') || color.startsWith('#'));
    colors.add(color);
  }
  // All 8 agents have distinct colors
  assert.equal(colors.size, AGENT_REGISTRY.length);
});

test('AgentSelectorMod - styles include responsive collapse rules for small resolutions', () => {
  const mod = new AgentSelectorMod();
  const rendered = mod.render({});

  assert.ok(rendered.css.includes('@media'));
  assert.ok(rendered.css.includes('display: none') || rendered.css.includes('display:none'));
});
