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

test('AgentSelectorMod - renders badge with dynamic Lucide icon and agent dropdown', () => {
  const mod = new AgentSelectorMod();
  const rendered = mod.render({});

  assert.ok(rendered.html);
  assert.ok(rendered.css);
  assert.ok(rendered.html.includes('antigravity-agent-badge'));
  assert.ok(rendered.html.includes('antigravity-agent-dropdown'));
  assert.ok(rendered.html.includes('antigravity-active-agent-icon'));
  assert.ok(rendered.html.includes('Sin Agente'));
  assert.ok(rendered.html.includes('Lead Architect'));
  assert.ok(rendered.html.includes('SDD Apply (TDD)'));
  assert.ok(rendered.html.includes('SDD Verify'));
});

test('AgentSelectorMod - assigns unique deterministic colors to each agent in registry', () => {
  assert.equal(typeof getAgentColor, 'function');
  const colors = new Set();
  for (const agent of AGENT_REGISTRY) {
    const color = getAgentColor(agent.id);
    assert.ok(color.startsWith('hsl(') || color.startsWith('#'));
    colors.add(color);
  }
  // All agents have distinct colors
  assert.equal(colors.size, AGENT_REGISTRY.length);
});

test('AgentSelectorMod - registry includes both Architecture Vault and SDD Suite specialists', () => {
  const ids = AGENT_REGISTRY.map(a => a.id);
  // Vault agents
  assert.ok(ids.includes('lead-architect'));
  assert.ok(ids.includes('product-manager'));
  assert.ok(ids.includes('security-engineer'));
  // SDD suite agents
  assert.ok(ids.includes('sdd-orchestrator'));
  assert.ok(ids.includes('sdd-apply'));
  assert.ok(ids.includes('sdd-verify'));
  assert.ok(ids.includes('gga-review'));
});

test('AgentSelectorMod - styles include responsive collapse rules for small resolutions', () => {
  const mod = new AgentSelectorMod();
  const rendered = mod.render({});

  assert.ok(rendered.css.includes('@media'));
  assert.ok(rendered.css.includes('display: none') || rendered.css.includes('display:none'));
});

test('AgentSelectorMod - categorizes agents into Cúspide (Planner & Builder), Micro, and Nano levels', () => {
  const cuspide = AGENT_REGISTRY.filter(a => a.level === 'cuspide');
  const micro = AGENT_REGISTRY.filter(a => a.level === 'micro');
  const nano = AGENT_REGISTRY.filter(a => a.level === 'nano');

  assert.equal(cuspide.length, 2);
  assert.equal(micro.length, 7);
  assert.equal(nano.length, 5);

  const planner = cuspide.find(a => a.id === 'lead-architect');
  assert.ok(planner);
  assert.equal(planner.levelLabel, 'PLANNER');

  const builder = cuspide.find(a => a.id === 'sdd-orchestrator');
  assert.ok(builder);
  assert.equal(builder.levelLabel, 'BUILDER');
});

test('AgentSelectorMod - renders Lucide SVG icons and progressive disclosure layout without emojis', () => {
  const mod = new AgentSelectorMod();
  const rendered = mod.render({});

  assert.ok(rendered.html.includes('lucide-agent-icon'));
  assert.ok(rendered.html.includes('default-mode-card'));
  assert.ok(rendered.html.includes('Sin Agente'));
  assert.ok(rendered.html.includes('Lead Architect'));
  assert.ok(rendered.html.includes('SDD Orchestrator'));
  assert.ok(rendered.html.includes('PLANNER'));
  assert.ok(rendered.html.includes('BUILDER'));
  assert.ok(rendered.html.includes('agent-catalog-toggle-btn'));
  assert.ok(rendered.html.includes('agent-catalog-drawer collapsed'));
  assert.ok(rendered.html.includes('data-tab="micro"'));
  assert.ok(rendered.html.includes('data-tab="nano"'));
});

test('AgentSelectorMod - renders harmonized card architecture with pin buttons and close trigger', () => {
  const mod = new AgentSelectorMod();
  const rendered = mod.render({});

  assert.ok(rendered.html.includes('agent-pin-btn'));
  assert.ok(rendered.html.includes('agent-pin-icon'));
  assert.ok(rendered.html.includes('agent-close-btn'));
  assert.ok(rendered.html.includes('id="antigravity-agent-close"'));
  assert.ok(rendered.html.includes('agent-header-card'));
  assert.ok(rendered.html.includes('agent-footer-card'));
  assert.ok(rendered.css.includes('.agent-pin-btn'));
  assert.ok(rendered.css.includes('.agent-pin-btn.active'));
  assert.ok(rendered.css.includes('width: 380px'));
});
