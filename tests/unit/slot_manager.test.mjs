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

function createMockElement(tagName, attrs = {}) {
  const attributes = new Map(Object.entries(attrs));
  const children = [];
  const el = {
    tagName: tagName.toUpperCase(),
    id: attrs.id || '',
    className: attrs.class || '',
    parentElement: null,
    children,
    _innerHTML: '',
    style: {
      setProperty() {}
    },
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(val) {
      this._innerHTML = String(val);
    },
    get firstElementChild() {
      return children[0] || null;
    },
    get nextSibling() {
      if (!this.parentElement) return null;
      const idx = this.parentElement.children.indexOf(this);
      return idx >= 0 && idx + 1 < this.parentElement.children.length
        ? this.parentElement.children[idx + 1]
        : null;
    },
    get nextElementSibling() {
      return this.nextSibling;
    },
    get previousElementSibling() {
      if (!this.parentElement) return null;
      const idx = this.parentElement.children.indexOf(this);
      return idx > 0 ? this.parentElement.children[idx - 1] : null;
    },
    setAttribute(k, v) {
      attributes.set(k, String(v));
      if (k === 'id') this.id = String(v);
      if (k === 'class') this.className = String(v);
    },
    getAttribute(k) {
      if (k === 'id' && this.id) return this.id;
      if (k === 'class' && this.className) return this.className;
      return attributes.get(k) ?? null;
    },
    hasAttribute(k) {
      return attributes.has(k) || (k === 'id' && Boolean(this.id)) || (k === 'class' && Boolean(this.className));
    },
    appendChild(child) {
      if (child.parentElement) {
        const prevIdx = child.parentElement.children.indexOf(child);
        if (prevIdx >= 0) child.parentElement.children.splice(prevIdx, 1);
      }
      child.parentElement = this;
      children.push(child);
      return child;
    },
    prepend(child) {
      if (child.parentElement) {
        const prevIdx = child.parentElement.children.indexOf(child);
        if (prevIdx >= 0) child.parentElement.children.splice(prevIdx, 1);
      }
      child.parentElement = this;
      children.unshift(child);
    },
    insertBefore(newNode, refNode) {
      if (!refNode) return this.appendChild(newNode);
      if (newNode.parentElement) {
        const prevIdx = newNode.parentElement.children.indexOf(newNode);
        if (prevIdx >= 0) newNode.parentElement.children.splice(prevIdx, 1);
      }
      const idx = children.indexOf(refNode);
      if (idx < 0) return this.appendChild(newNode);
      newNode.parentElement = this;
      children.splice(idx, 0, newNode);
      return newNode;
    },
    remove() {
      if (!this.parentElement) return;
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    },
    contains(node) {
      let cur = node;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    matches(singleSelector) {
      const sel = singleSelector.trim();
      if (sel === 'body') return this.tagName === 'BODY';
      if (sel.startsWith('#')) return this.id === sel.slice(1);
      if (sel.startsWith('.')) {
        const required = sel.slice(1).split('.').map((s) => s.replace(/\\/g, ''));
        const classes = String(this.className || '').split(/\s+/).filter(Boolean);
        return required.every((cls) => classes.includes(cls));
      }
      if (sel === '[data-active-tab-id]') return this.hasAttribute('data-active-tab-id');
      if (sel === '[data-side-panel-strip="true"]') return this.getAttribute('data-side-panel-strip') === 'true';
      const btnTestIdMatch = sel.match(/^button\[data-testid="([^"]+)"\]$/);
      if (btnTestIdMatch) {
        return this.tagName === 'BUTTON' && this.getAttribute('data-testid') === btnTestIdMatch[1];
      }
      const attrMatch = sel.match(/^\[([^=\]]+)="([^"]+)"\]$/);
      if (attrMatch) return this.getAttribute(attrMatch[1]) === attrMatch[2];
      if (sel === 'div[class*="shrink-0"][class*="border-b"]') {
        const cls = String(this.className || '');
        return this.tagName === 'DIV' && cls.includes('shrink-0') && cls.includes('border-b');
      }
      return false;
    },
    closest(selectorList) {
      const parts = selectorList.split(',').map((s) => s.trim());
      let cur = this;
      while (cur) {
        if (parts.some((p) => cur.matches(p))) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelectorAll(selectorList) {
      const parts = selectorList.split(',').map((s) => s.trim()).filter(Boolean);
      const out = [];
      const walk = (node) => {
        for (const child of node.children) {
          if (parts.some((p) => child.matches(p))) {
            out.push(child);
          }
          walk(child);
        }
      };
      walk(this);
      return out;
    },
    querySelector(selectorList) {
      return this.querySelectorAll(selectorList)[0] || null;
    }
  };
  return el;
}

function createMockDocument(root) {
  return {
    createElement(tag) {
      return createMockElement(tag);
    },
    querySelectorAll(selectorList) {
      return root.querySelectorAll(selectorList);
    },
    querySelector(selectorList) {
      return root.querySelector(selectorList);
    }
  };
}

test('SlotManager - mounts aux-pane-tab cleanly in live Antigravity DOM with side-panel-new-tab-button when aux-pane-new-tab-button is absent', () => {
  const root = createMockElement('div');
  const paneWrapper = createMockElement('div', { class: 'h-full w-full flex flex-col browser-hole-ancestor' });
  const auxBar = createMockElement('div', {
    class: 'agy-layout-vars shrink-0 flex items-center gap-0.5 border-b pl-1.5 pr-20',
    'data-side-panel-strip': 'true',
    'data-active-tab-id': 'subagent_convo__1'
  });
  const scrollStrip = createMockElement('div', {
    class: 'flex items-center overflow-x-auto select-none scrollbar-none min-w-0 gap-px py-1'
  });
  const newTabBtn = createMockElement('button', {
    'data-testid': 'side-panel-new-tab-button'
  });

  auxBar.appendChild(scrollStrip);
  auxBar.appendChild(newTabBtn);
  paneWrapper.appendChild(auxBar);
  root.appendChild(paneWrapper);

  const doc = createMockDocument(root);
  const manager = new SlotManager();
  const code = manager.generateMountCode({
    slotId: 'aux-pane-tab',
    modId: 'git-graph',
    htmlContent: '<button id="antigravity-git-tab-trigger">Git Graph</button>'
  });

  const runMount = new Function('document', code);
  runMount(doc);
  runMount(doc); // Verify idempotent re-mount

  assert.equal(auxBar.children.length, 3);
  assert.equal(auxBar.children[0], scrollStrip);
  assert.equal(auxBar.children[1].id, 'antigravity-slot-aux-pane-tab');
  assert.equal(auxBar.children[2], newTabBtn);
  assert.ok(auxBar.children[1].querySelector('#antigravity-mod-git-graph'));
});

test('SlotManager - mounts aux-pane-tab inside [data-active-tab-id] after .overflow-x-auto when both new-tab buttons are absent', () => {
  const root = createMockElement('div');
  const paneWrapper = createMockElement('div', { class: 'h-full w-full flex flex-col' });
  const auxBar = createMockElement('div', {
    class: 'agy-layout-vars shrink-0 flex items-center gap-0.5 border-b',
    'data-active-tab-id': 'tab-1'
  });
  const scrollStrip = createMockElement('div', { class: 'flex items-center overflow-x-auto' });

  auxBar.appendChild(scrollStrip);
  paneWrapper.appendChild(auxBar);
  root.appendChild(paneWrapper);

  const doc = createMockDocument(root);
  const manager = new SlotManager();
  const code = manager.generateMountCode({
    slotId: 'aux-pane-tab',
    modId: 'git-graph',
    htmlContent: '<button id="antigravity-git-tab-trigger">Git Graph</button>'
  });

  new Function('document', code)(doc);

  assert.equal(auxBar.children.length, 2);
  assert.equal(auxBar.children[0], scrollStrip);
  assert.equal(auxBar.children[1].id, 'antigravity-slot-aux-pane-tab');
});

test('SlotManager - appends aux-pane-tab inside [data-active-tab-id] when neither new-tab button nor .overflow-x-auto exists', () => {
  const root = createMockElement('div');
  const paneWrapper = createMockElement('div', { class: 'h-full w-full flex flex-col' });
  const auxBar = createMockElement('div', {
    'data-active-tab-id': 'tab-1'
  });

  paneWrapper.appendChild(auxBar);
  root.appendChild(paneWrapper);

  const doc = createMockDocument(root);
  const manager = new SlotManager();
  const code = manager.generateMountCode({
    slotId: 'aux-pane-tab',
    modId: 'git-graph',
    htmlContent: '<button id="antigravity-git-tab-trigger">Git Graph</button>'
  });

  const runMount = new Function('document', code);
  runMount(doc);
  runMount(doc); // Must stay mounted inside auxBar, not removed or hoisted outside

  assert.equal(paneWrapper.children.length, 1);
  assert.equal(auxBar.children.length, 1);
  assert.equal(auxBar.children[0].id, 'antigravity-slot-aux-pane-tab');
});

test('SlotManager - keeps append slots like floating-dock mounted on non-flex body across refreshes', () => {
  const root = createMockElement('html');
  const body = createMockElement('body');
  root.appendChild(body);

  const doc = createMockDocument(root);
  const manager = new SlotManager();
  const code = manager.generateMountCode({
    slotId: 'floating-dock',
    modId: 'voice-toast',
    htmlContent: '<div>Voice</div>'
  });

  const runMount = new Function('document', code);
  runMount(doc);
  runMount(doc);

  assert.equal(body.children.length, 1);
  assert.equal(body.children[0].id, 'antigravity-slot-floating-dock');
  assert.ok(body.children[0].querySelector('#antigravity-mod-voice-toast'));
});

test('SlotManager - preserves mounted modNode innerHTML when HTML signature is unchanged', () => {
  const root = createMockElement('html');
  const body = createMockElement('body');
  root.appendChild(body);

  const doc = createMockDocument(root);
  const manager = new SlotManager();
  const code = manager.generateMountCode({
    slotId: 'floating-dock',
    modId: 'mods-manager',
    htmlContent: '<button id="antigravity-mods-manager-trigger">Mods</button>'
  });

  const runMount = new Function('document', code);
  runMount(doc);

  const modNode = body.querySelector('#antigravity-mod-mods-manager');
  assert.ok(modNode);
  // Simulate existing child + bound listener state
  const childMarker = createMockElement('button', { id: 'antigravity-mods-manager-trigger' });
  modNode.children.push(childMarker);
  let innerHtmlWrites = 0;
  const origInner = modNode._innerHTML;
  Object.defineProperty(modNode, 'innerHTML', {
    get() { return origInner; },
    set() { innerHtmlWrites++; }
  });

  runMount(doc);
  assert.equal(innerHtmlWrites, 0, 'Should not overwrite innerHTML when modNode already has child and matching signature');
});
