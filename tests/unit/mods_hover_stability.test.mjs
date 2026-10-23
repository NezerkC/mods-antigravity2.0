import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextTachometerMod } from '../../mods/context-tachometer/index.js';
import { AgentSelectorMod } from '../../mods/agent-selector/index.js';

test('ContextTachometerMod - hover styles are stationary without translateY jitter', () => {
  const mod = new ContextTachometerMod();
  const rendered = mod.render();

  const hoverMatch = rendered.css.match(/\.antigravity-tachometer-badge:hover\s*\{([^}]+)\}/);
  assert.ok(hoverMatch, 'CSS must define .antigravity-tachometer-badge:hover');
  assert.ok(!hoverMatch[1].includes('translateY'), 'Badge hover block must not contain translateY');
  assert.ok(hoverMatch[1].includes('box-shadow'), 'Badge hover must maintain stationary shadow feedback');
});

test('AgentSelectorMod - hover styles are stationary and caret rotates only on open', () => {
  const mod = new AgentSelectorMod();
  const rendered = mod.render();

  const hoverMatch = rendered.css.match(/\.antigravity-agent-badge:hover\s*\{([^}]+)\}/);
  assert.ok(hoverMatch, 'CSS must define .antigravity-agent-badge:hover');
  assert.ok(!hoverMatch[1].includes('translateY'), 'Agent badge hover block must not contain translateY');
  assert.ok(!rendered.css.includes('.antigravity-agent-badge:hover .agent-caret'), 'Caret must not rotate on hover');
  assert.ok(rendered.css.includes('.antigravity-agent-badge.open .agent-caret'), 'Caret must rotate on open state');
});
