import test from 'node:test';
import assert from 'node:assert/strict';
import { AntigravityMod } from '../../src/sdk/AntigravityMod.js';

test('AntigravityMod - enforces required manifest properties', () => {
  assert.throws(() => {
    new AntigravityMod({});
  }, /Mod manifest requires 'id', 'name', 'version', and 'slot'/);

  assert.throws(() => {
    new AntigravityMod({ id: 'test', name: 'Test' });
  }, /Mod manifest requires 'id', 'name', 'version', and 'slot'/);
});

test('AntigravityMod - instantiates with valid manifest', () => {
  const mod = new AntigravityMod({
    id: 'sample-mod',
    name: 'Sample Mod',
    version: '1.0.0',
    slot: 'header-actions'
  });

  assert.equal(mod.manifest.id, 'sample-mod');
  assert.equal(mod.manifest.slot, 'header-actions');
  assert.equal(typeof mod.onInit, 'function');
  assert.equal(typeof mod.onUpdate, 'function');
  assert.equal(typeof mod.onDestroy, 'function');
});

test('AntigravityMod - default render throws if not implemented by subclass', () => {
  const mod = new AntigravityMod({
    id: 'sample-mod',
    name: 'Sample Mod',
    version: '1.0.0',
    slot: 'header-actions'
  });

  assert.throws(() => {
    mod.render({});
  }, /Method 'render\(context\)' must be implemented/);
});
