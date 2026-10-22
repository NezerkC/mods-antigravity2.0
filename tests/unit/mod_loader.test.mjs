import test from 'node:test';
import assert from 'node:assert/strict';
import { ModLoader } from '../../src/core/ModLoader.js';
import { AntigravityMod } from '../../src/sdk/AntigravityMod.js';

class MockMod extends AntigravityMod {
  constructor(manifest, renderOutput) {
    super(manifest);
    this.renderOutput = renderOutput || { html: `<div id="${manifest.id}">Content</div>` };
  }
  render(context) {
    return this.renderOutput;
  }
}

test('ModLoader - registers mods and respects priority order', () => {
  const loader = new ModLoader();
  const modLow = new MockMod({
    id: 'mod-low',
    name: 'Low Priority',
    version: '1.0.0',
    slot: 'header-actions',
    priority: 5
  });

  const modHigh = new MockMod({
    id: 'mod-high',
    name: 'High Priority',
    version: '1.0.0',
    slot: 'header-actions',
    priority: 100
  });

  loader.register(modLow);
  loader.register(modHigh);

  const mods = loader.getRegisteredMods();
  assert.equal(mods.length, 2);
  assert.equal(mods[0].manifest.id, 'mod-high');
  assert.equal(mods[1].manifest.id, 'mod-low');
});

test('ModLoader - prevents duplicate mod id registration', () => {
  const loader = new ModLoader();
  const modA = new MockMod({
    id: 'duplicate-id',
    name: 'Mod A',
    version: '1.0.0',
    slot: 'header-actions'
  });
  const modB = new MockMod({
    id: 'duplicate-id',
    name: 'Mod B',
    version: '1.1.0',
    slot: 'header-right'
  });

  loader.register(modA);
  assert.throws(() => loader.register(modB), /Mod with ID "duplicate-id" is already registered/);
});

test('ModLoader - generates consolidated injection script for registered mods', () => {
  const loader = new ModLoader();
  loader.register(new MockMod(
    {
      id: 'clock-mod',
      name: 'Clock',
      version: '1.0.0',
      slot: 'header-right'
    },
    {
      html: '<span>12:00</span>',
      css: '.time { color: green; }'
    }
  ));

  const script = loader.buildInjectionPayload({});
  assert.ok(script.includes('window.__antigravityMods'));
  assert.ok(script.includes('clock-mod'));
  assert.ok(script.includes('<span>12:00</span>'));
  assert.ok(script.includes('#antigravity-mod-clock-mod .time { color: green; }'));
});
