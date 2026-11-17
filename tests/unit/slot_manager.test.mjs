import test from 'node:test';
import assert from 'node:assert/strict';
import { SlotManager } from '../../framework/core/SlotManager.js';

test('SlotManager - provides default slot definitions', () => {
  const manager = new SlotManager();
  const slot = manager.getSlot('header-actions');
  assert.ok(slot);
  assert.equal(slot.selector, 'button[data-testid="model-selector-trigger"]');
  assert.equal(slot.strategy, 'after');

  const menubarSlot = manager.getSlot('menubar-actions');
  assert.ok(menubarSlot);
  assert.equal(menubarSlot.strategy, 'append');

  const auxPaneSlot = manager.getSlot('aux-pane-tab');
  assert.ok(auxPaneSlot);
  assert.equal(auxPaneSlot.selector, 'button[data-testid="aux-pane-new-tab-button"]');
  assert.equal(auxPaneSlot.strategy, 'before');

  const chatInputSlot = manager.getSlot('chat-input-actions');
  assert.ok(chatInputSlot);
  assert.equal(chatInputSlot.selector, 'button[aria-label="Record voice memo"]');
  assert.equal(chatInputSlot.strategy, 'before');
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
  assert.equal(manager.getContainerId('aux-pane-tab'), 'antigravity-slot-aux-pane-tab');
  assert.equal(manager.getContainerId('chat-input-actions'), 'antigravity-slot-chat-input-actions');
});

test('SlotManager - generates mounting snippet for slot and mod targeting all matching conversation anchors', () => {
  const manager = new SlotManager();
  const snippet = manager.generateMountCode({
    slotId: 'header-actions',
    modId: 'tachometer',
    htmlContent: '<div id="test-tachometer">Tachometer</div>'
  });

  assert.ok(snippet.includes('document.querySelectorAll'));
  assert.ok(snippet.includes('antigravity-slot-header-actions'));
  assert.ok(snippet.includes('antigravity-mod-tachometer'));
});

test('SlotManager - sets flex minWidth/maxWidth guards and avoids innerHTML churn on unchanged remounts', () => {
  const manager = new SlotManager();
  const sig1 = SlotManager.computeHtmlSignature('<span>27.6k</span>');
  const sig2 = SlotManager.computeHtmlSignature('<span>28.0k</span>');
  assert.notEqual(sig1, sig2);
  assert.equal(sig1, SlotManager.computeHtmlSignature('<span>27.6k</span>'));

  let innerHtmlSets = 0;
  let existingModNode = null;
  const makeNode = () => {
    let html = '';
    const attrs = {};
    const el = {
      id: '',
      className: '',
      style: { setProperty() {} },
      children: [],
      firstElementChild: null,
      parentElement: null,
      get innerHTML() { return html; },
      set innerHTML(v) {
        innerHtmlSets++;
        html = v;
        el.firstElementChild = { tagName: 'DIV' };
      },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] ?? null; },
      appendChild(child) {
        child.parentElement = el;
        el.children.push(child);
        return child;
      },
      insertBefore(child) {
        return el.appendChild(child);
      },
      querySelector(sel) {
        if (sel === '#antigravity-mod-context-tachometer') return existingModNode;
        if (sel === '#antigravity-slot-header-actions') return slotEl;
        return null;
      }
    };
    return el;
  };

  let slotCreated = false;
  const flexParent = {
    className: 'flex items-center gap-1 min-w-0',
    contains() { return true; },
    closest(sel) { return sel === '.flex.items-center.gap-1' ? flexParent : null; },
    appendChild(child) {
      slotCreated = true;
      child.parentElement = flexParent;
      return child;
    },
    insertBefore(child) {
      slotCreated = true;
      child.parentElement = flexParent;
      return child;
    },
    querySelector(sel) {
      return (slotCreated && sel === '#antigravity-slot-header-actions') ? slotEl : null;
    }
  };
  const slotEl = makeNode();
  slotEl.id = 'antigravity-slot-header-actions';
  slotEl.parentElement = flexParent;
  const modNode = makeNode();
  existingModNode = null;

  const anchor = {
    parentElement: flexParent,
    nextSibling: null
  };

  slotEl.querySelector = (sel) => (sel === '#antigravity-mod-context-tachometer' ? existingModNode : null);
  slotEl.appendChild = (child) => {
    existingModNode = child;
    child.parentElement = slotEl;
    return child;
  };

  const mockDoc = {
    createElement() { return slotCreated ? modNode : slotEl; },
    querySelectorAll(sel) {
      if (sel === 'button[data-testid="model-selector-trigger"]') return [anchor];
      if (sel === '#antigravity-slot-header-actions') return slotCreated ? [slotEl] : [];
      return [];
    },
    querySelector() { return null; }
  };

  const snippet = manager.generateMountCode({
    slotId: 'header-actions',
    modId: 'context-tachometer',
    htmlContent: '<div class="antigravity-tachometer-badge">0k</div>'
  });
  const runner = new Function('document', snippet);

  runner(mockDoc);
  assert.equal(slotEl.style.minWidth, '0');
  assert.equal(slotEl.style.maxWidth, '100%');
  assert.equal(innerHtmlSets, 1);

  // Simulate live telemetry mutation before second mountAllMods run
  slotEl.previousElementSibling = anchor;
  runner(mockDoc);
  assert.equal(innerHtmlSets, 1, 'Live-state mod innerHTML must not be wiped on subsequent mounts');
});
