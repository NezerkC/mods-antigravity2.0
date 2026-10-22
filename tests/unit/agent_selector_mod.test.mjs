import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentSelectorMod } from '../../mods/agent-selector/index.js';

test('AgentSelectorMod - loads correct manifest metadata', () => {
  const mod = new AgentSelectorMod();
  assert.equal(mod.manifest.id, 'agent-selector');
  assert.equal(mod.manifest.slot, 'header-actions');
  assert.equal(mod.manifest.priority, 45); // Adjacent to tachometer (priority 50)
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

test('AgentSelectorMod - styles include responsive collapse rules for small resolutions', () => {
  const mod = new AgentSelectorMod();
  const rendered = mod.render({});

  assert.ok(rendered.css.includes('@media'));
  assert.ok(rendered.css.includes('display: none') || rendered.css.includes('display:none'));
});
