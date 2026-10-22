import test from 'node:test';
import assert from 'node:assert/strict';
import { SlotManager } from '../../src/core/SlotManager.js';

test('SlotManager - provides default slot definitions', () => {
  const manager = new SlotManager();
  const slot = manager.getSlot('header-actions');
  assert.ok(slot);
  assert.equal(slot.selector, 'button[data-testid="model-selector-trigger"]');
  assert.equal(slot.strategy, 'after');
});

test('SlotManager - registers custom slot', () => {
  const manager = new SlotManager();
  manager.registerSlot('custom-panel', {
    selector: '#custom-container',
    strategy: 'append'
  });

  const slot = manager.getSlot('custom-panel');
  assert.ok(slot);
  assert.equal(slot.selector, '#custom-container');
  assert.equal(slot.strategy, 'append');
});

test('SlotManager - throws error for unregistered slot', () => {
  const manager = new SlotManager();
  assert.throws(() => manager.getSlot('unknown-slot'), /Slot "unknown-slot" is not registered/);
});

test('SlotManager - generates slot container element id', () => {
  const manager = new SlotManager();
  assert.equal(manager.getContainerId('header-actions'), 'antigravity-slot-header-actions');
});

test('SlotManager - generates mounting snippet for slot and mod', () => {
  const manager = new SlotManager();
  const snippet = manager.generateMountCode({
    slotId: 'header-actions',
    modId: 'tachometer',
    htmlContent: '<div id="test-tachometer">Tachometer</div>'
  });

  assert.ok(snippet.includes('antigravity-slot-header-actions'));
  assert.ok(snippet.includes('antigravity-mod-tachometer'));
  assert.ok(snippet.includes('test-tachometer'));
});
