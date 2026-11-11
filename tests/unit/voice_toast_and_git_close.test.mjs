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
