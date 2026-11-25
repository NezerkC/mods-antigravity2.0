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

test('AgentSelectorMod - avoids layout-animating transition:all on pill and scopes @media collapse to .compact', () => {
  const mod = new AgentSelectorMod();
  const rendered = mod.render();

  const badgeRule = rendered.css.match(/\.antigravity-agent-badge\s*\{([^}]+)\}/);
  assert.ok(badgeRule, 'CSS must define .antigravity-agent-badge');
  assert.ok(!badgeRule[1].includes('transition: all'), 'Agent pill must use paint-only transitions instead of transition: all');

  const dotRule = rendered.css.match(/\.agent-badge-dot\s*\{([^}]+)\}/);
  assert.ok(dotRule, 'CSS must define .agent-badge-dot');
  assert.ok(!dotRule[1].includes('transition: all'), 'Agent dot must avoid transition: all');

  const mediaMatch = rendered.css.match(/@media\s*\(max-width:\s*960px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(mediaMatch, 'CSS must include @media (max-width: 960px) block');
  assert.ok(
    mediaMatch[1].includes('.antigravity-agent-badge.compact .agent-label'),
    '@media collapse rules must be scoped to .antigravity-agent-badge.compact so Normal override is respected'
  );
});
