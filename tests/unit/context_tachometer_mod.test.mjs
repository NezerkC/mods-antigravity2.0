import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextTachometerMod } from '../../mods/context-tachometer/index.js';

test('ContextTachometerMod - loads correct manifest metadata', () => {
  const mod = new ContextTachometerMod();
  assert.equal(mod.manifest.id, 'context-tachometer');
  assert.equal(mod.manifest.slot, 'header-actions');
  assert.equal(mod.manifest.priority, 50);
});

test('ContextTachometerMod - renders SVG gauge and popover markup with provided telemetry', () => {
  const mod = new ContextTachometerMod();
  const context = {
    telemetry: {
      estTokens: 42000,
      pct: '4.2',
      displayTokens: '42.0k',
      sizeKb: 150,
      steps: 80,
      breakdown: {
        user: { tokens: 5000, pct: 12 },
        model: { tokens: 10000, pct: 24 },
        thinking: { tokens: 15000, pct: 36 },
        tools: { tokens: 10000, pct: 24 },
        mcp: { tokens: 2000, pct: 5 },
        other: { tokens: 0, pct: 0 }
      }
    }
  };

  const rendered = mod.render(context);
  assert.ok(rendered.html);
  assert.ok(rendered.css);
  assert.ok(rendered.html.includes('antigravity-tachometer-badge'));
  assert.ok(rendered.html.includes('4.2%'));
  assert.ok(rendered.html.includes('42.0k'));
  assert.ok(rendered.html.includes('<svg'));
});

test('ContextTachometerMod - styles include responsive collapse and compact rules', () => {
  const mod = new ContextTachometerMod();
  const rendered = mod.render({});
  assert.ok(rendered.css.includes('.compact'));
  assert.ok(rendered.css.includes('@media'));
  assert.ok(rendered.css.includes('display: none') || rendered.css.includes('display:none'));
});
