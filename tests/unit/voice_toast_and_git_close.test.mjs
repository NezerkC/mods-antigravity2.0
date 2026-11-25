import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModLoader } from '../../framework/core/ModLoader.js';
import { StyleIsolator } from '../../framework/sdk/StyleIsolator.js';
import {
  VOICE_HUD_BOX_ROLES,
  renderVoiceHudBoxHtml,
  annotateVoiceHudBoxes
} from '../../mods/voice-assistant/components/VoiceHudBoxHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

test('Voice Assistant Styles - defines centered Top HUD box-in-box CSS across views', () => {
  const stylesPath = path.join(rootDir, 'mods/voice-assistant/styles.css');
  assert.ok(fs.existsSync(stylesPath), 'styles.css must exist');

  const css = fs.readFileSync(stylesPath, 'utf-8');

  // Core viewport-centered HUD anchor rules
  assert.ok(css.includes('.antigravity-voice-toast-docked'), 'Must define .antigravity-voice-toast-docked');
  assert.ok(css.includes('position: fixed'), 'Must use position: fixed');
  assert.ok(css.includes('inset-inline: 0'), 'Must center horizontally via logical inset-inline: 0');
  assert.ok(css.includes('margin-inline: auto'), 'Must center horizontally via margin-inline: auto');
  assert.ok(css.includes('--agy-voice-hud-top'), 'Must parameterize top HUD offset cleanly');
  assert.ok(css.includes('body:has([data-testid="title-menu-bar"])'), 'Must adapt cleanly below 35px menubar');
  assert.ok(css.includes('z-index: 9998'), 'Must specify z-index: 9998');

  // Boxes-inside-boxes architectural selectors
  for (const role of ['viewport-anchor', 'frame', 'surface', 'header', 'toolbar', 'controls-well', 'actions', 'drawer', 'tray', 'alert']) {
    assert.ok(css.includes(`[data-voice-hud-box="${role}"]`), `Must style [data-voice-hud-box="${role}"]`);
  }

  // Downward popup flip for mic warnings, errors, quick composer, and elevated speed slider portal
  assert.ok(css.includes('[data-testid="voice-mic-warning"]'), 'Must style mic warning popup below Top HUD');
  assert.ok(css.includes('[data-testid="voice-dock-composer"]'), 'Must style dock composer drawer below Top HUD');
  assert.ok(css.includes('top: calc(100% + 8px)'), 'Must flip mic/composer popups downward');
  assert.ok(css.includes('[data-testid="voice-speed-panel"]'), 'Must elevate portaled voice speed slider popup');
  assert.ok(css.includes('z-index: 10020'), 'Must place dictation speed popup above docked HUD');

  // Smooth transitions and minimized pill rules
  assert.ok(css.includes('transition: width 0.2s ease, height 0.2s ease, opacity 0.2s ease, border-radius 0.2s ease'),
    'Must include smooth transition rules for minimized states');
  assert.ok(css.includes('.is-minimized'), 'Must target .is-minimized');
  assert.ok(css.includes('[data-minimized="true"]'), 'Must target [data-minimized="true"]');

  // StyleIsolator must preserve global body-prefixed HUD rules without mod scoping prefix
  const scopedCss = StyleIsolator.scopeCss(css, 'voice-assistant');
  assert.ok(
    scopedCss.includes('body .antigravity-voice-toast-docked'),
    'Global body-prefixed Top HUD rules must bypass mod container scoping'
  );
  assert.ok(
    !scopedCss.includes('#antigravity-mod-voice-assistant body .antigravity-voice-toast-docked'),
    'StyleIsolator must not prepend mod container id before body selectors'
  );
});

test('ModLoader - defines window.__dockNativeVoiceToast and invokes it in UI sync cycles', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  assert.ok(script.includes('window.__dockNativeVoiceToast = function(rootDoc)'),
    'Must expose window.__dockNativeVoiceToast helper');
  assert.ok(script.includes('window.__dockNativeVoiceToast(document)'),
    'Must invoke window.__dockNativeVoiceToast(document) in UI sync cycles');
});

test('ModLoader - window.__dockNativeVoiceToast docks active voice bar and preserves event listeners', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  function makeClassList(initial = []) {
    const classes = new Set(initial);
    return {
      add(...cls) { cls.forEach(c => classes.add(c)); },
      remove(...cls) { cls.forEach(c => classes.delete(c)); },
      toggle(cls, force) {
        if (force === undefined) {
          if (classes.has(cls)) classes.delete(cls);
          else classes.add(cls);
        } else if (force) {
          classes.add(cls);
        } else {
          classes.delete(cls);
        }
      },
      contains(cls) { return classes.has(cls); }
    };
  }

  function makeElement(tag, attrs = {}) {
    const attributes = { ...attrs };
    const listeners = {};
    const el = {
      tagName: tag.toUpperCase(),
      id: attrs.id || '',
      className: attrs.className || '',
      classList: makeClassList(attrs.className ? attrs.className.split(' ') : []),
      parentElement: null,
      children: [],
      textContent: attrs.textContent || '',
      style: {},
      getAttribute(k) { return attributes[k] ?? null; },
      setAttribute(k, v) { attributes[k] = String(v); },
      removeAttribute(k) { delete attributes[k]; },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attributes, k); },
      appendChild(child) {
        child.parentElement = el;
        el.children.push(child);
        return child;
      },
      addEventListener(type, fn) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      dispatchEvent(event) {
        const fns = listeners[event.type] || [];
        fns.forEach(fn => fn(event));
        return true;
      },
      matches(sel) {
        if (sel.includes('[role="dialog"]') && attributes.role === 'dialog') return true;
        return false;
      },
      closest(sel) {
        let curr = el;
        while (curr) {
          if (sel === '#antigravity-git-panel-host' && curr.id === 'antigravity-git-panel-host') return curr;
          curr = curr.parentElement;
        }
        return null;
      },
      querySelector(sel) {
        const matches = el.querySelectorAll(sel);
        return matches.length > 0 ? matches[0] : null;
      },
      querySelectorAll(sel) {
        const selList = sel.split(',').map(s => s.trim().toLowerCase());
        const found = [];
        function walk(node) {
          for (const c of node.children) {
            let matched = false;
            for (const s of selList) {
              if (s === 'button' && c.tagName === 'BUTTON') { matched = true; break; }
              if (s === 'textarea' && c.tagName === 'TEXTAREA') { matched = true; break; }
              if (s.includes('.collapse-btn') && c.classList.contains('collapse-btn')) { matched = true; break; }
              if (s.includes('collapse') && (c.getAttribute('aria-label') || '').toLowerCase().includes('collapse')) { matched = true; break; }
              if (s.includes('mic') && ((c.getAttribute('aria-label') || '').toLowerCase().includes('mic') || (c.getAttribute('data-testid') || '').toLowerCase().includes('mic'))) { matched = true; break; }
              if (s.includes('mute') && ((c.getAttribute('aria-label') || '').toLowerCase().includes('mute') || (c.getAttribute('data-testid') || '').toLowerCase().includes('mute'))) { matched = true; break; }
              if (s.includes('audio') && ((c.getAttribute('aria-label') || '').toLowerCase().includes('audio') || (c.getAttribute('data-testid') || '').toLowerCase().includes('audio'))) { matched = true; break; }
              if (s.includes('.antigravity-voice-toast-docked') && c.classList.contains('antigravity-voice-toast-docked')) { matched = true; break; }
            }
            if (matched) found.push(c);
            walk(c);
          }
        }
        walk(el);
        return found;
      }
    };
    return el;
  }

  // Build simulated DOM hierarchy
  const mockDocument = {
    hidden: false,
    head: makeElement('head'),
    body: makeElement('body'),
    createElement(tag) { return makeElement(tag); },
    getElementById(id) {
      if (id === 'antigravity-mods-styles') return makeElement('style');
      return null;
    },
    addEventListener() {},
    querySelectorAll(sel) {
      if (sel === 'button') {
        return mockDocument.body.querySelectorAll('button');
      }
      return mockDocument.body.querySelectorAll(sel);
    },
    querySelector(sel) {
      const all = mockDocument.querySelectorAll(sel);
      return all.length > 0 ? all[0] : null;
    }
  };

  const composerContainer = makeElement('div', { className: 'composer-container' });
  const voiceCallBar = makeElement('div', { className: 'native-voice-call-bar' });
  const textarea = makeElement('textarea');

  let endClicked = false;
  const endBtn = makeElement('button', { textContent: 'End', className: 'end-call-btn' });
  endBtn.addEventListener('click', () => { endClicked = true; });

  let micClicked = false;
  const micBtn = makeElement('button', { 'aria-label': 'Mute microphone', 'data-testid': 'voice-mic-btn' });
  micBtn.addEventListener('click', () => { micClicked = true; });

  let collapseClicked = false;
  const collapseBtn = makeElement('button', { 'aria-label': 'Collapse call bar', className: 'collapse-btn' });
  collapseBtn.addEventListener('click', () => { collapseClicked = true; });

  voiceCallBar.appendChild(micBtn);
  voiceCallBar.appendChild(collapseBtn);
  voiceCallBar.appendChild(endBtn);

  composerContainer.appendChild(voiceCallBar);
  composerContainer.appendChild(textarea);
  mockDocument.body.appendChild(composerContainer);

  const mockWindow = {
    location: { pathname: '/', search: '' },
    addEventListener() {}
  };
  const mockLocalStorage = { getItem() { return null; }, setItem() {} };

  class MockResizeObserver { observe() {} disconnect() {} }
  class MockMutationObserver { observe() {} disconnect() {} }

  const runner = new Function(
    'window',
    'document',
    'localStorage',
    'ResizeObserver',
    'MutationObserver',
    script
  );
  runner(mockWindow, mockDocument, mockLocalStorage, MockResizeObserver, MockMutationObserver);

  assert.equal(typeof mockWindow.__dockNativeVoiceToast, 'function',
    '__dockNativeVoiceToast must be defined on window');

  // Execute docking on simulated DOM
  const dockedBar = mockWindow.__dockNativeVoiceToast(mockDocument);
  assert.ok(dockedBar, 'Must detect and return the active voice call bar');
  assert.equal(dockedBar, voiceCallBar, 'Target bar must be the voiceCallBar');
  assert.ok(voiceCallBar.classList.contains('antigravity-voice-toast-docked'),
    'Voice call bar must receive .antigravity-voice-toast-docked');
  assert.equal(voiceCallBar.getAttribute('data-antigravity-voice-docked'), 'true');

  // Verify chat composer textarea was NOT modified or docked
  assert.equal(composerContainer.classList.contains('antigravity-voice-toast-docked'), false);
  assert.equal(textarea.classList.contains('antigravity-voice-toast-docked'), false);

  // Verify native click listeners are preserved without being stripped or nodes cloned
  endBtn.dispatchEvent({ type: 'click' });
  assert.equal(endClicked, true, 'End button click listener must fire intact');

  micBtn.dispatchEvent({ type: 'click' });
  assert.equal(micClicked, true, 'Mic button click listener must fire intact');

  collapseBtn.dispatchEvent({ type: 'click' });
  assert.equal(collapseClicked, true, 'Collapse button click listener must fire intact');

  // Test minimization sync
  collapseBtn.setAttribute('aria-expanded', 'false');
  mockWindow.__dockNativeVoiceToast(mockDocument);
  assert.ok(voiceCallBar.classList.contains('is-minimized'), 'Must apply .is-minimized when collapsed');
  assert.equal(voiceCallBar.getAttribute('data-minimized'), 'true');

  collapseBtn.setAttribute('aria-expanded', 'true');
  mockWindow.__dockNativeVoiceToast(mockDocument);
  assert.equal(voiceCallBar.classList.contains('is-minimized'), false);
  assert.equal(voiceCallBar.getAttribute('data-minimized'), null);
});

test('ModLoader - window.__dockNativeVoiceToast excludes git panel and non-voice dialogs', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});

  function makeClassList() {
    const s = new Set();
    return {
      add: (c) => s.add(c),
      remove: (c) => s.delete(c),
      contains: (c) => s.has(c)
    };
  }

  const gitPanelHost = {
    id: 'antigravity-git-panel-host',
    classList: makeClassList(),
    getAttribute() { return null; },
    children: []
  };

  const gitCloseBtn = {
    tagName: 'BUTTON',
    textContent: 'End',
    parentElement: gitPanelHost,
    classList: makeClassList(),
    getAttribute() { return null; },
    children: []
  };
  gitPanelHost.children.push(gitCloseBtn);

  const mockDoc = {
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement(tag) { return { classList: makeClassList(), setAttribute() {}, style: {} }; },
    getElementById(id) { return null; },
    addEventListener() {},
    querySelectorAll(sel) {
      if (sel === 'button') return [gitCloseBtn];
      return [];
    },
    querySelector() { return null; }
  };

  const mockWin = {
    location: { pathname: '/' },
    addEventListener() {}
  };
  const runner = new Function('window', 'document', 'localStorage', 'ResizeObserver', 'MutationObserver', script);
  runner(mockWin, mockDoc, { getItem() { return null; } }, class { observe() {} }, class { observe() {} });

  const result = mockWin.__dockNativeVoiceToast(mockDoc);
  assert.equal(result, null, 'Must ignore End button inside #antigravity-git-panel-host');
});

test('VoiceHudBoxHtml - renders semantic HTML5 boxes-inside-boxes with XSS escaping', () => {
  const html = renderVoiceHudBoxHtml({
    label: 'Voice <script>xss</script>',
    statusText: 'Mic "Warn"',
    timerText: '01:24',
    micMuted: true,
    agentMuted: false,
    speed: 1.5,
    collapsed: false,
    micWarning: 'No mic <img onerror=1> detected'
  });

  for (const role of Object.values(VOICE_HUD_BOX_ROLES)) {
    assert.ok(html.includes(`data-voice-hud-box="${role}"`), `HTML must include ${role} box`);
  }

  assert.ok(html.includes('<aside'), 'Must wrap outer anchor in <aside>');
  assert.ok(html.includes('<section'), 'Must use <section> for nested frames/drawer');
  assert.ok(html.includes('<article'), 'Must use <article> for elevated HUD card');
  assert.ok(html.includes('<header'), 'Must use <header> for primary control row');
  assert.ok(html.includes('role="toolbar"'), 'Must configure role="toolbar" on control group');
  assert.ok(html.includes('focusgroup="toolbar wrap"'), 'Must configure focusgroup="toolbar wrap" on toolbar');
  assert.ok(html.includes('data-testid="voice-speed-slider"'), 'Must preserve dictation speed range slider');
  assert.ok(html.includes('data-testid="voice-mic-warning"'), 'Must include mic warning box in tray');

  // Toggle buttons keep aria-pressed, one-shot End action never gets aria-pressed
  assert.ok(html.includes('data-testid="voice-mute-button"'), 'Must include mic toggle');
  assert.ok(!/<button[^>]*data-testid="voice-call-end"[^>]*aria-pressed=/.test(html),
    'One-shot End button must not declare aria-pressed');

  // Strict XSS escaping
  assert.ok(!html.includes('<script>xss</script>'));
  assert.ok(!html.includes('<img onerror=1>'));
  assert.ok(html.includes('&lt;script&gt;xss&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img onerror=1&gt;'));
});

function createAttrDomDocument() {
  function makeNode(tagName, attrs = {}) {
    const classes = new Set((attrs.className || '').split(/\s+/).filter(Boolean));
    const attrMap = new Map(Object.entries(attrs).filter(([k]) => !['className', 'textContent', 'rect'].includes(k)));
    const listeners = new Map();
    const styleProps = new Map();
    let _text = attrs.textContent || '';
    let _rect = attrs.rect || { top: 0, bottom: 40, left: 0, right: 320, width: 320, height: 40 };

    const styleObj = {
      setProperty(k, v) { styleProps.set(k, String(v)); },
      getPropertyValue(k) { return styleProps.get(k) || ''; }
    };

    const node = {
      tagName: tagName.toUpperCase(),
      get id() { return attrMap.get('id') || ''; },
      set id(v) { attrMap.set('id', String(v)); },
      parentElement: null,
      children: [],
      style: styleObj,
      classList: {
        add: (...items) => items.forEach((i) => classes.add(i)),
        remove: (...items) => items.forEach((i) => classes.delete(i)),
        contains: (item) => classes.has(item)
      },
      get textContent() { return _text; },
      set textContent(v) { _text = String(v); },
      setRect(r) { _rect = r; },
      getBoundingClientRect() { return _rect; },
      getAttribute(k) { return attrMap.has(k) ? String(attrMap.get(k)) : null; },
      setAttribute(k, v) { attrMap.set(k, String(v)); },
      removeAttribute(k) { attrMap.delete(k); },
      appendChild(child) {
        child.parentElement = node;
        node.children.push(child);
        return child;
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(ev) {
        for (const fn of (listeners.get(ev.type) || [])) fn(ev);
      },
      matches(singleSel) {
        const s = singleSel.trim();
        if (!s) return false;
        if (s === 'button') return node.tagName === 'BUTTON';
        if (s === 'textarea') return node.tagName === 'TEXTAREA';
        if (s.startsWith('#')) return node.id === s.slice(1);
        if (s.startsWith('.')) return classes.has(s.slice(1));
        const exactAttr = s.match(/^\[([a-zA-Z0-9_-]+)="([^"]*)"\]$/);
        if (exactAttr) return (node.getAttribute(exactAttr[1]) || '') === exactAttr[2];
        const incAttr = s.match(/^\[([a-zA-Z0-9_-]+)\*="([^"]*)"(?:\s+i)?\]$/);
        if (incAttr) return (node.getAttribute(incAttr[1]) || '').toLowerCase().includes(incAttr[2].toLowerCase());
        const btnAttr = s.match(/^button\[([a-zA-Z0-9_-]+)\*="([^"]*)"(?:\s+i)?\]$/i);
        if (btnAttr) return node.tagName === 'BUTTON' && (node.getAttribute(btnAttr[1]) || '').toLowerCase().includes(btnAttr[2].toLowerCase());
        if (s === '[data-popover-popup]') return node.getAttribute('data-popover-popup') !== null;
        return false;
      },
      closest(sel) {
        let curr = node;
        const parts = sel.split(',').map((x) => x.trim());
        while (curr) {
          if (parts.some((p) => curr.matches(p))) return curr;
          curr = curr.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const parts = sel.split(',').map((x) => x.trim());
        const out = [];
        function walk(cur) {
          for (const ch of cur.children) {
            if (parts.some((p) => ch.matches(p))) out.push(ch);
            walk(ch);
          }
        }
        walk(node);
        return out;
      },
      querySelector(sel) {
        return node.querySelectorAll(sel)[0] || null;
      }
    };
    return node;
  }

  const head = makeNode('head');
  const body = makeNode('body');
  const doc = {
    hidden: false,
    head,
    body,
    createElement(tag, attrs) { return makeNode(tag, attrs); },
    makeNode,
    getElementById(id) {
      if (id === 'antigravity-mods-styles') return makeNode('style', { id });
      return null;
    },
    addEventListener() {},
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
    querySelector(sel) { return body.querySelector(sel); }
  };
  return doc;
}

test('ModLoader - docks v2.31.0 live-docked teleprompter with mic warning, speed popover, and menubar clearance', async () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});
  const doc = createAttrDomDocument();

  // Simulate 35px Antigravity top menubar
  const menuBar = doc.makeNode('div', {
    'data-testid': 'title-menu-bar',
    rect: { top: 0, bottom: 35, left: 0, right: 1200, width: 1200, height: 35 }
  });
  doc.body.appendChild(menuBar);

  const composerParent = doc.makeNode('div', { className: 'composer-wrapper' });
  const slot = doc.makeNode('div', {
    'data-testid': 'voice-teleprompter-slot',
    rect: { top: 39, bottom: 84, left: 420, right: 820, width: 400, height: 45 }
  });
  const frame = doc.makeNode('div');
  const micWarning = doc.makeNode('div', { 'data-testid': 'voice-mic-warning', textContent: 'No mic audio detected' });
  const liveDocked = doc.makeNode('section', { 'data-testid': 'live-docked' });
  const controls = doc.makeNode('div', { 'data-testid': 'voice-call-controls' });

  let speedOpened = false;
  const speedBtn = doc.makeNode('button', { 'data-testid': 'voice-call-speed', 'aria-label': 'Voice speed, 1x' });
  speedBtn.addEventListener('click', () => {
    speedOpened = true;
    const positioner = doc.makeNode('div', { rect: { top: -120, bottom: 10, left: 500, right: 740, width: 240, height: 130 } });
    const popup = doc.makeNode('div', { 'data-popover-popup': '' });
    const panel = doc.makeNode('div', { 'data-testid': 'voice-speed-panel' });
    popup.appendChild(panel);
    positioner.appendChild(popup);
    doc.body.appendChild(positioner);
  });

  const muteBtn = doc.makeNode('button', { 'data-testid': 'voice-mute-button', 'aria-label': 'Mute mic' });
  const collapseBtn = doc.makeNode('button', { 'data-testid': 'voice-call-collapse', 'aria-expanded': 'true' });
  const endBtn = doc.makeNode('button', { 'data-testid': 'voice-call-end', 'aria-label': 'End Voice mode', textContent: 'End' });

  controls.appendChild(muteBtn);
  controls.appendChild(speedBtn);
  controls.appendChild(collapseBtn);
  controls.appendChild(endBtn);

  const replies = doc.makeNode('div', { 'data-testid': 'live-docked-replies' });
  liveDocked.appendChild(controls);
  liveDocked.appendChild(replies);

  frame.appendChild(micWarning);
  frame.appendChild(liveDocked);
  slot.appendChild(frame);
  composerParent.appendChild(slot);
  composerParent.appendChild(doc.makeNode('textarea'));
  doc.body.appendChild(composerParent);

  const win = { location: { pathname: '/' }, addEventListener() {} };
  const runner = new Function('window', 'document', 'localStorage', 'ResizeObserver', 'MutationObserver', script);
  runner(win, doc, { getItem() { return null; } }, class { observe() {} }, class { observe() {} });

  const docked = win.__dockNativeVoiceToast(doc);
  assert.equal(docked, slot, 'Must dock outer voice-teleprompter-slot to keep mic warning grouped with live-docked');
  assert.equal(slot.getAttribute('data-voice-hud-variant'), 'teleprompter');
  assert.equal(slot.getAttribute('data-voice-hud-box'), 'viewport-anchor');
  assert.equal(liveDocked.getAttribute('data-voice-hud-box'), 'surface');
  assert.equal(controls.getAttribute('data-voice-hud-box'), 'header');
  assert.equal(micWarning.getAttribute('data-voice-hud-box'), 'alert');
  assert.equal(micWarning.getAttribute('data-voice-hud-placement'), 'below');
  assert.equal(replies.getAttribute('data-voice-hud-box'), 'drawer');
  assert.equal(slot.style.getPropertyValue('--agy-voice-hud-top'), '39px',
    'Must dynamically reserve menubar bottom clearance');

  // Verify standalone annotator agrees on hierarchy
  annotateVoiceHudBoxes(slot);
  assert.equal(slot.getAttribute('data-voice-hud-box'), 'viewport-anchor');

  // Trigger speed popover and wait for downward reposition guard
  speedBtn.dispatchEvent({ type: 'click' });
  assert.equal(speedOpened, true);
  await new Promise((r) => setTimeout(r, 40));

  const speedPanel = doc.querySelector('[data-testid="voice-speed-panel"]');
  const positionerEl = speedPanel.parentElement.parentElement;
  assert.equal(positionerEl.style.top, '92px', 'Must shift top-clipped speed slider portal safely below HUD');
  assert.equal(positionerEl.style.zIndex, '10020', 'Must keep speed panel above docked HUD z-index');
});

test('ModLoader - docks v2.31.0 global floating voice-dock in Chats History & Customizations despite internal textarea', () => {
  const loader = new ModLoader();
  const script = loader.buildInjectionPayload({});
  const doc = createAttrDomDocument();

  const voiceDock = doc.makeNode('div', { 'data-testid': 'voice-dock', role: 'region' });
  const micWarning = doc.makeNode('div', { 'data-testid': 'voice-mic-warning' });
  const dockComposer = doc.makeNode('div', { 'data-testid': 'voice-dock-composer' });
  dockComposer.appendChild(doc.makeNode('textarea', { 'data-testid': 'voice-dock-input' }));

  const row = doc.makeNode('div', { className: 'flex items-center gap-1.5' });
  const muteBtn = doc.makeNode('button', { 'data-testid': 'voice-dock-mute', 'aria-label': 'Mute mic' });
  let endFired = false;
  const endBtn = doc.makeNode('button', {
    'data-testid': 'voice-dock-end',
    'aria-label': 'End Voice mode',
    textContent: ''
  });
  endBtn.addEventListener('click', () => { endFired = true; });

  row.appendChild(muteBtn);
  row.appendChild(endBtn);
  voiceDock.appendChild(micWarning);
  voiceDock.appendChild(dockComposer);
  voiceDock.appendChild(row);
  doc.body.appendChild(voiceDock);

  const win = { location: { pathname: '/customizations' }, addEventListener() {} };
  const runner = new Function('window', 'document', 'localStorage', 'ResizeObserver', 'MutationObserver', script);
  runner(win, doc, { getItem() { return null; } }, class { observe() {} }, class { observe() {} });

  const docked = win.__dockNativeVoiceToast(doc);
  assert.equal(docked, voiceDock, 'Must dock global floating voice-dock even with internal quick-composer textarea');
  assert.equal(voiceDock.getAttribute('data-voice-hud-variant'), 'dock');
  assert.equal(voiceDock.getAttribute('data-voice-hud-box'), 'viewport-anchor');
  assert.equal(micWarning.getAttribute('data-voice-hud-box'), 'alert');
  assert.equal(dockComposer.getAttribute('data-voice-hud-box'), 'drawer');
  assert.equal(voiceDock.style.getPropertyValue('--agy-voice-hud-top'), '4px');

  endBtn.dispatchEvent({ type: 'click' });
  assert.equal(endFired, true, 'Must preserve icon-only voice-dock-end listener');
});
