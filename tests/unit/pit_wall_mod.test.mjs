import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

import { TelemetryService } from '../../framework/services/TelemetryService.js';
import { ModLoader } from '../../framework/core/ModLoader.js';
import { PitWallMod } from '../../mods/pit-wall/index.js';
import { renderPitWallMenubarButton, renderPitWallModalHtml } from '../../mods/pit-wall/components/PitWallHtml.js';
import { renderModsManagerPanelHtml } from '../../mods/mods-manager/components/ModsManagerHtml.js';

function writeTranscriptLines(brainDir, convId, lines) {
  const logsDir = path.join(brainDir, convId, '.system_generated', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const filePath = path.join(logsDir, 'transcript.jsonl');
  fs.writeFileSync(filePath, lines.map(l => JSON.stringify(l)).join('\n'), 'utf-8');
  return filePath;
}

test('PitWall - TelemetryService.getPitWallMetrics computes merged 20-min stretches, parallel union, streaks, and API costs', () => {
  const tempBrainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitwall-brain-'));
  try {
    const now = Date.now();
    const yesterdayBase = now - 24 * 60 * 60 * 1000;
    const iso = (ms) => new Date(ms).toISOString();

    // Session 1 (yesterday): 10:00 and +15m (900s), plus an isolated jump +60m later
    writeTranscriptLines(tempBrainDir, '00000001-aaaa-bbbb-cccc-000000000001', [
      {
        type: 'USER_INPUT',
        created_at: iso(yesterdayBase - 60 * 60 * 1000),
        model: 'gemini-3.8-flash-high',
        content: 'Analyze module A'
      },
      {
        type: 'PLANNER_RESPONSE',
        created_at: iso(yesterdayBase - 45 * 60 * 1000),
        model: 'gemini-3.8-flash-high',
        content: 'A'.repeat(3800),
        thinking: 'B'.repeat(1900)
      }
    ]);

    // Session 2 (yesterday): overlaps Session 1 and extends +10m beyond (+25m total union)
    writeTranscriptLines(tempBrainDir, '00000002-aaaa-bbbb-cccc-000000000002', [
      {
        type: 'USER_INPUT',
        created_at: iso(yesterdayBase - 55 * 60 * 1000),
        model: 'gemini-4-argon-high',
        content: 'Parallel work on module B'
      },
      {
        type: 'PLANNER_RESPONSE',
        created_at: iso(yesterdayBase - 35 * 60 * 1000),
        model: 'gemini-4-argon-high',
        content: 'C'.repeat(7600)
      }
    ]);

    // Session 3 (today, active within last 20m): includes both main thread & subagent background work
    writeTranscriptLines(tempBrainDir, '00000003-aaaa-bbbb-cccc-000000000003', [
      {
        type: 'USER_INPUT',
        created_at: iso(now - 10 * 60 * 1000),
        model: 'gemini-4-argon-high',
        content: 'Run main planner task'
      },
      {
        type: 'PLANNER_RESPONSE',
        created_at: iso(now - 5 * 60 * 1000),
        model: 'gemini-4-argon-high',
        content: 'D'.repeat(38000),
        thinking: 'E'.repeat(19000)
      },
      {
        type: 'GENERIC',
        tool_calls: [{ name: 'invoke_subagent' }],
        created_at: iso(now - 2 * 60 * 1000),
        model: 'claude-opus-5-5-high',
        content: 'F'.repeat(38000),
        thinking: 'G'.repeat(19000)
      }
    ]);

    const service = new TelemetryService({ brainDir: tempBrainDir });
    const metrics = service.getPitWallMetrics({ forceRefresh: true });

    assert.equal(metrics.totalSessions, 3);
    assert.ok(metrics.currentStreak >= 2, `Expected >=2 day streak, got ${metrics.currentStreak}`);
    assert.ok(metrics.bestStreak >= metrics.currentStreak);
    assert.equal(metrics.isStretchActive, true);
    assert.ok(metrics.totalHours > 0);
    assert.ok(metrics.totalCostUsd > 0);
    assert.ok(metrics.totalTokens > 0);
    assert.ok(metrics.writtenTokens > 0);
    assert.equal(metrics.last60Days.length, 60);
    assert.equal(metrics.consistencyWeeks.length, 20);
    assert.ok(Array.isArray(metrics.costByModel) && metrics.costByModel.length >= 2);
    // Cost by model sorted descending
    for (let i = 1; i < metrics.costByModel.length; i++) {
      assert.ok(metrics.costByModel[i - 1].costUsd >= metrics.costByModel[i].costUsd);
    }

    const todayBucket = metrics.last60Days[metrics.last60Days.length - 1];
    assert.ok(todayBucket.mainCostUsd > 0, 'Today mainCostUsd should be > 0');
    assert.ok(todayBucket.bgCostUsd > 0, 'Today bgCostUsd (subagent) should be > 0');
    assert.ok(todayBucket.totalCostUsd >= todayBucket.mainCostUsd + todayBucket.bgCostUsd - 0.05);
  } finally {
    fs.rmSync(tempBrainDir, { recursive: true, force: true });
  }
});

test('PitWallMod - manifest, menubar trigger, dashboard HTML structure, and Mods Manager toggle', () => {
  const mod = new PitWallMod();
  assert.equal(mod.manifest.id, 'pit-wall');
  assert.equal(mod.manifest.slot, 'menubar-actions');
  assert.equal(mod.manifest.priority, 85);

  const sampleMetrics = {
    currentStreak: 12,
    bestStreak: 15,
    totalHours: 218.7,
    activeDaysCount: 51,
    firstSessionDate: '2 June 2026',
    avgHoursPerDay: 4.3,
    currentStretchHours: 4.7,
    currentStretchSub: 'active, since 10/10 17:21',
    isStretchActive: true,
    totalCostUsd: 13021,
    displayTotalCost: '$13,021',
    totalTokens: 15000000,
    displayTotalTokens: '15M',
    writtenTokens: 2520000,
    displayWrittenTokens: '2.5M',
    totalSessions: 84,
    last60Days: [],
    consistencyWeeks: [],
    costByModel: [
      { name: 'Gemini 4 Argon (High)', costUsd: 4699, displayCost: '$4,699', color: '#8b5cf6' }
    ]
  };

  const rendered = mod.render({ pitWall: sampleMetrics });
  assert.ok(rendered.html.includes('id="antigravity-pit-wall-trigger"'));
  assert.ok(rendered.html.includes('antigravity-pit-wall-btn'));
  assert.ok(rendered.html.includes('Pit Wall'));
  assert.ok(rendered.css.includes('.antigravity-pit-wall-portal'));

  const btnHtml = renderPitWallMenubarButton(sampleMetrics);
  assert.ok(btnHtml.includes('12-day streak'));
  assert.ok(btnHtml.includes('$13,021'));

  const modalHtml = renderPitWallModalHtml(sampleMetrics);
  for (const requiredText of [
    'Pit Wall',
    '12-day streak. 218.7 hours of work across 51 days since 2 June 2026, worth $13,021 at API prices.',
    'Current stretch',
    'Hours worked, all time',
    'Cost at API prices',
    'Tokens processed',
    'Day streak',
    'Sessions',
    'Hours worked per day',
    'Consistency',
    'Cost per day at API prices',
    'Cost by model',
    'id="antigravity-pit-wall-close"'
  ]) {
    assert.ok(modalHtml.includes(requiredText), `Missing expected text: ${requiredText}`);
  }

  // Zero emojis invariant
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(btnHtml), false, 'Menubar button must use pure SVG without emojis');
  assert.equal(emojiRegex.test(modalHtml), false, 'Modal HTML must use pure SVG without emojis');

  const modsHtml = renderModsManagerPanelHtml();
  assert.ok(modsHtml.includes('id="mod-toggle-pit-wall"'));
  assert.ok(modsHtml.includes('Pit Wall Analytics'));
});

test('ModLoader + PitWall - injection script opens modal once, keeps inside clicks open, and closes on close/outside/Escape', async () => {
  const loader = new ModLoader();
  const mod = new PitWallMod();
  loader.register(mod);

  const sampleMetrics = {
    currentStreak: 4,
    bestStreak: 7,
    totalHours: 14.2,
    activeDaysCount: 6,
    firstSessionDate: '10 November 2026',
    avgHoursPerDay: 2.4,
    currentStretchHours: 1.5,
    currentStretchSub: 'active, since 09:00',
    isStretchActive: true,
    totalCostUsd: 42,
    displayTotalCost: '$42',
    totalTokens: 1200000,
    displayTotalTokens: '1.2M',
    writtenTokens: 300000,
    displayWrittenTokens: '300.0K',
    totalSessions: 9,
    last60Days: [],
    consistencyWeeks: [],
    costByModel: [{ name: 'Gemini 3.8 Flash', costUsd: 42, displayCost: '$42', color: '#38bdf8' }]
  };

  const script = loader.buildInjectionPayload({ pitWall: sampleMetrics });
  assert.doesNotThrow(() => new Function(script), 'Generated ModLoader script must compile cleanly');
  assert.ok(script.includes('window.__togglePitWallModal'));
  assert.ok(script.includes('window.__renderPitWallModalHtml'));
  assert.ok(script.includes('__pitWallClickBound'));

  function createMockEl(tag, attrs = {}, parent = null) {
    const listeners = new Map();
    const el = {
      tagName: tag.toUpperCase(),
      nodeType: 1,
      attributes: { ...attrs },
      children: [],
      parentElement: parent,
      style: {
        setProperty(k, v) { this[k] = String(v); }
      },
      classList: {
        _set: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        contains(c) { return this._set.has(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this._set.has(c)) { this._set.delete(c); return false; }
            this._set.add(c); return true;
          }
          if (force) { this._set.add(c); return true; }
          this._set.delete(c); return false;
        }
      },
      textContent: '',
      _innerHTML: '',
      setAttribute(k, v) {
        this.attributes[k] = String(v);
        if (k === 'class') this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
      },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
      removeAttribute(k) { delete this.attributes[k]; },
      appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
      remove() {
        if (this.parentElement) {
          this.parentElement.children = this.parentElement.children.filter(c => c !== this);
          this.parentElement = null;
        }
      },
      contains(child) {
        let cur = child;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      closest(selector) {
        const selectors = selector.split(',').map(s => s.trim());
        let cur = this;
        while (cur) {
          for (const s of selectors) {
            if (s.startsWith('#') && cur.getAttribute('id') === s.slice(1)) return cur;
            if (s.startsWith('.') && cur.classList.contains(s.slice(1))) return cur;
            if (s.startsWith('[') && s.endsWith(']')) {
              const attrName = s.slice(1, -1);
              if (cur.hasAttribute(attrName)) return cur;
            }
          }
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(selector) {
        const results = [];
        const selectors = selector.split(',').map(s => s.trim());
        const matchSingle = (node, sel) => {
          if (sel.startsWith('#')) return node.getAttribute('id') === sel.slice(1);
          if (sel.startsWith('.')) {
            const parts = sel.slice(1).split('.');
            return parts.every(c => node.classList.contains(c));
          }
          if (sel.startsWith('[') && sel.endsWith(']')) {
            return node.hasAttribute(sel.slice(1, -1));
          }
          return false;
        };
        const walk = (node) => {
          for (const child of node.children) {
            if (selectors.some(sel => matchSingle(child, sel))) results.push(child);
            walk(child);
          }
        };
        walk(this);
        return results;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      getBoundingClientRect() {
        return { top: 120, left: 240, width: 24, height: 60, bottom: 180, right: 264 };
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(ev) {
        for (const fn of (listeners.get(ev.type) || [])) fn(ev);
      }
    };
    Object.defineProperty(el, 'id', {
      get() { return this.getAttribute('id') || ''; },
      set(v) { this.setAttribute('id', v); }
    });
    Object.defineProperty(el, 'className', {
      get() { return this.getAttribute('class') || ''; },
      set(v) { this.setAttribute('class', v); }
    });
    Object.defineProperty(el, 'innerHTML', {
      get() { return this._innerHTML; },
      set(val) {
        this._innerHTML = String(val || '');
        this.children = [];
        if (this._innerHTML.includes('id="antigravity-pit-wall-close"')) {
          const shell = createMockEl('div', { class: 'pit-wall-modal-shell' }, this);
          const closeBtn = createMockEl('button', { id: 'antigravity-pit-wall-close', class: 'pit-wall-close-btn' }, shell);
          shell.appendChild(closeBtn);
          this.children.push(shell);
        }
        if (this._innerHTML.includes('id="antigravity-pit-wall-tooltip"')) {
          const tip = createMockEl('div', { id: 'antigravity-pit-wall-tooltip', class: 'pit-wall-tooltip' }, this);
          this.children.push(tip);
        }
        if (this._innerHTML.includes('data-pw-tip=')) {
          const bar = createMockEl('div', {
            class: 'pit-wall-bar-col',
            'data-pw-tip': JSON.stringify({
              title: 'Thu, 19 Nov 2026',
              rows: [
                { label: 'Active time', val: '3h 30m (3.50 h)', accent: true },
                { label: 'API cost equivalent', val: '$14.84' }
              ]
            })
          }, this);
          this.children.push(bar);
        }
      }
    });
    return el;
  }

  const docListeners = new Map();
  const head = createMockEl('head');
  const body = createMockEl('body');
  const docEl = createMockEl('html');
  docEl.appendChild(head);
  docEl.appendChild(body);

  const menubarGroup = createMockEl('div', { class: 'shrink-0' }, body);
  const bgSidebar = createMockEl('div', { class: 'bg-sidebar' }, menubarGroup);
  menubarGroup.appendChild(bgSidebar);
  const triggerBtn = createMockEl('button', { id: 'antigravity-pit-wall-trigger', class: 'antigravity-pit-wall-btn' }, bgSidebar);
  bgSidebar.appendChild(triggerBtn);
  const outsideNode = createMockEl('div', { class: 'workspace-area' }, body);
  body.appendChild(menubarGroup);
  body.appendChild(outsideNode);

  const documentMock = {
    head,
    body,
    documentElement: docEl,
    activeElement: body,
    getElementById(id) { return docEl.querySelector(`#${id}`); },
    querySelector(sel) { return docEl.querySelector(sel); },
    querySelectorAll(sel) { return docEl.querySelectorAll(sel); },
    createElement(tag) { return createMockEl(tag); },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      if (!docListeners.has(type)) return;
      docListeners.set(type, docListeners.get(type).filter(f => f !== fn));
    }
  };

  const store = new Map();
  const windowMock = {
    location: { pathname: '/', search: '' },
    innerWidth: 1280,
    innerHeight: 800,
    document: documentMock,
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} }
  };
  windowMock.window = windowMock;

  const sandbox = vm.createContext({
    window: windowMock,
    document: documentMock,
    localStorage: {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); }
    },
    fetch: null,
    ResizeObserver: windowMock.ResizeObserver,
    MutationObserver: windowMock.MutationObserver,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {}
  });

  vm.runInContext(script, sandbox);

  const clickElement = (target) => {
    let stopped = false;
    const ev = {
      type: 'click',
      target,
      currentTarget: target,
      stopPropagation() { stopped = true; },
      preventDefault() {}
    };
    for (const fn of (docListeners.get('click') || [])) fn(ev);
    if (!stopped) target.dispatchEvent(ev);
  };

  // 1. Click trigger opens portal once (no double-toggle)
  clickElement(triggerBtn);
  const portal = documentMock.getElementById('antigravity-pit-wall-portal');
  assert.ok(portal, 'Portal must be created');
  assert.equal(portal.classList.contains('open'), true, 'Portal must stay open after first click');
  assert.equal(triggerBtn.classList.contains('open'), true);
  assert.ok(portal.innerHTML.includes('$42'));

  // 2. Click inside portal shell keeps it open
  const innerShell = portal.querySelector('.pit-wall-modal-shell');
  clickElement(innerShell);
  assert.equal(portal.classList.contains('open'), true, 'Click inside modal must keep portal open');

  // 3. Click close button closes portal
  const closeBtn = portal.querySelector('#antigravity-pit-wall-close');
  assert.ok(closeBtn);
  closeBtn.onclick({ stopPropagation() {}, preventDefault() {} });
  assert.equal(portal.classList.contains('open'), false, 'Close button must close portal');
  assert.equal(triggerBtn.classList.contains('open'), false);

  // 4. Open again, then outside click closes portal
  clickElement(triggerBtn);
  assert.equal(portal.classList.contains('open'), true);
  clickElement(outsideNode);
  assert.equal(portal.classList.contains('open'), false, 'Outside click must close portal');

  // 5. Open again, then Escape key closes portal
  clickElement(triggerBtn);
  assert.equal(portal.classList.contains('open'), true);
  for (const fn of (docListeners.get('keydown') || [])) {
    fn({ key: 'Escape', shiftKey: false, isComposing: false, target: body });
  }
  assert.equal(portal.classList.contains('open'), false, 'Escape key must close portal');

  // 6. Open again, hover data-pw-tip element shows tooltip, mouseleave / Escape hides it
  clickElement(triggerBtn);
  assert.equal(portal.classList.contains('open'), true);
  const barEl = portal.querySelector('.pit-wall-bar-col');
  const tipEl = portal.querySelector('#antigravity-pit-wall-tooltip');
  assert.ok(barEl, 'Chart bar with data-pw-tip must exist in portal');
  assert.ok(tipEl, 'Tooltip element must exist in portal');

  portal.dispatchEvent({ type: 'mouseover', target: barEl, relatedTarget: null });
  assert.equal(tipEl.classList.contains('visible'), true, 'Tooltip must become visible on mouseover');
  assert.equal(tipEl.getAttribute('aria-hidden'), 'false');
  assert.ok(tipEl.innerHTML.includes('Thu, 19 Nov 2026'), 'Tooltip must render date title');
  assert.ok(tipEl.innerHTML.includes('$14.84'), 'Tooltip must render exact cost');

  portal.dispatchEvent({ type: 'mouseleave', target: portal, relatedTarget: null });
  assert.equal(tipEl.classList.contains('visible'), false, 'Tooltip must hide on mouseleave');
  assert.equal(tipEl.getAttribute('aria-hidden'), 'true');

  portal.dispatchEvent({ type: 'mouseover', target: barEl, relatedTarget: null });
  assert.equal(tipEl.classList.contains('visible'), true);

  for (const fn of (docListeners.get('keydown') || [])) {
    fn({ key: 'Escape', shiftKey: false, isComposing: false, target: body });
  }
  assert.equal(tipEl.classList.contains('visible'), false, 'Tooltip must hide on Escape');
});

test('PitWall - model slug normalization and 10% cache pricing', () => {
  const service = new TelemetryService();

  const cases = [
    { input: 'gemini-4-argon-high', baseName: 'Gemini 4 Argon', inputPerM: 15, cacheReadPerM: 1.5, outputPerM: 75 },
    { input: 'gemini-4-neon-xhigh', baseName: 'Gemini 4 Neon', inputPerM: 10, cacheReadPerM: 1.0, outputPerM: 40 },
    { input: 'gemini-4-hydrogen-tiered-high', baseName: 'Gemini 4 Hydrogen', inputPerM: 3, cacheReadPerM: 0.3, outputPerM: 15 },
    { input: 'gemini-pro-orchestrator-g1-pro', baseName: 'Orchestrator (Argon)', inputPerM: 10, cacheReadPerM: 1.0, outputPerM: 40 },
    { input: 'gemini-pro-orchestrator-neon', baseName: 'Orchestrator (Neon)', inputPerM: 10, cacheReadPerM: 1.0, outputPerM: 40 },
    { input: 'gemini-flash-worker-agy', baseName: 'Gemini 3.8 Flash', inputPerM: 1.25, cacheReadPerM: 0.125, outputPerM: 5 },
    { input: 'claude-opus-5-5-high', baseName: 'Claude Opus 5.5', inputPerM: 15, cacheReadPerM: 1.5, outputPerM: 75 },
    { input: 'claude-sonnet-5-5-low', baseName: 'Claude Sonnet 5.5', inputPerM: 3, cacheReadPerM: 0.3, outputPerM: 15 },
    { input: 'gpt-oss-120b-medium', baseName: 'GPT-OSS 120B', inputPerM: 2, cacheReadPerM: 0.2, outputPerM: 8 },
  ];

  for (const c of cases) {
    const pricing = service.resolveModelPricing(c.input);
    assert.equal(pricing.baseName, c.baseName, `Failed baseName for ${c.input}`);
    assert.equal(pricing.inputPerM, c.inputPerM, `Failed inputPerM for ${c.input}`);
    assert.equal(pricing.cacheReadPerM, c.cacheReadPerM, `Failed cacheReadPerM for ${c.input}`);
    assert.equal(pricing.outputPerM, c.outputPerM, `Failed outputPerM for ${c.input}`);
    assert.equal(pricing.cacheReadPerM, Number((pricing.inputPerM * 0.1).toFixed(4)), `10% cache read pricing invariant failed for ${c.input}`);
  }
});

test('PitWall - exact real token accounting, cache reads at 10%, no double-counting with thinking, non-LLM steps ignored when exact telemetry present, and initial model backfilled from USER_SETTINGS_CHANGE', () => {
  const tempBrainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitwall-accounting-'));
  try {
    const now = Date.now();
    const iso = (ms) => new Date(ms).toISOString();

    writeTranscriptLines(tempBrainDir, '11111111-2222-3333-4444-555555555555', [
      {
        type: 'USER_INPUT',
        created_at: iso(now - 10000),
        content: 'Hello initial question'
      },
      {
        type: 'PLANNER_RESPONSE',
        created_at: iso(now - 8000),
        content: 'Initial answer from Neon',
        thinking: 'Heavy thinking string'.repeat(200),
        input_tokens: 1000,
        cache_read_tokens: 10000,
        output_tokens: 600
      },
      {
        type: 'USER_INPUT',
        created_at: iso(now - 6000),
        content: '<USER_SETTINGS_CHANGE>Model Selection from "Gemini 4 Neon" to "Claude Opus 5.5"</USER_SETTINGS_CHANGE>'
      },
      {
        type: 'PLANNER_RESPONSE',
        created_at: iso(now - 4000),
        content: 'Response from Opus',
        model: 'Claude Opus 5.5',
        input_tokens: 2000,
        cache_read_tokens: 0,
        output_tokens: 1100
      },
      {
        type: 'GENERIC',
        created_at: iso(now - 2000),
        content: 'Tool execution log output'.repeat(500)
      }
    ]);

    const service = new TelemetryService({ brainDir: tempBrainDir });
    const metrics = service.getPitWallMetrics({ bypassCache: true });

    assert.equal(metrics.totalTokens, 14700);
    assert.equal(metrics.writtenTokens, 1700);
    assert.equal(metrics.uncachedInputTokens, 3000);
    assert.equal(metrics.cacheReadTokens, 10000);
    assert.equal(metrics.exactTotalCostUsd, 0.16);

    const neonEntry = metrics.costByModel.find(m => m.name === 'Gemini 4 Neon');
    assert.ok(neonEntry, 'Gemini 4 Neon must be attributed via backfill');
    assert.equal(neonEntry.tokens, 11600);
    assert.equal(neonEntry.output, 600);
    assert.equal(neonEntry.cacheRead, 10000);
    assert.equal(neonEntry.uncachedInput, 1000);
    assert.equal(neonEntry.exactCostUsd, 0.04);

    const opusEntry = metrics.costByModel.find(m => m.name === 'Claude Opus 5.5');
    assert.ok(opusEntry, 'Claude Opus 5.5 must be attributed');
    assert.equal(opusEntry.tokens, 3100);
    assert.equal(opusEntry.output, 1100);
    assert.equal(opusEntry.exactCostUsd, 0.11);
  } finally {
    fs.rmSync(tempBrainDir, { recursive: true, force: true });
  }
});

test('PitWall - TelemetryService processes more than 250 sessions without cap', () => {
  const tempBrainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitwall-sessions-'));
  try {
    const now = Date.now();
    const count = 260;
    for (let i = 0; i < count; i++) {
      const hex = String(i).padStart(8, '0') + '-0000-0000-0000-000000000000';
      writeTranscriptLines(tempBrainDir, hex, [
        {
          type: 'USER_INPUT',
          created_at: new Date(now - i * 60000).toISOString(),
          content: 'Session prompt ' + i
        }
      ]);
    }

    const service = new TelemetryService({ brainDir: tempBrainDir });
    const metrics = service.getPitWallMetrics({ bypassCache: true });
    assert.equal(metrics.totalSessions, 260, 'All 260 sessions must be aggregated without 250 slice limit');
  } finally {
    fs.rmSync(tempBrainDir, { recursive: true, force: true });
  }
});

test('PitWall - renderPitWallModalHtml emits data-pw-tip with exact values, tooltip container, truthful subtitle, zero emojis', () => {
  const sample = {
    currentStreak: 5,
    bestStreak: 10,
    totalHours: 12.34,
    exactTotalHours: 12.3456,
    exactTotalDurationLabel: '12h 21m',
    activeDaysCount: 4,
    firstSessionDate: '1 November 2026',
    avgHoursPerDay: 3.1,
    currentStretchHours: 1.2,
    exactCurrentStretchDurationLabel: '1h 12m',
    currentStretchSub: 'active, since 10:00',
    isStretchActive: true,
    totalCostUsd: 1234,
    exactTotalCostUsd: 1234.56,
    displayTotalCost: '$1,235',
    exactDisplayTotalCost: '$1,234.56',
    totalTokens: 1234567,
    uncachedInputTokens: 1000000,
    cacheReadTokens: 200000,
    writtenTokens: 34567,
    displayTotalTokens: '1.2M',
    displayWrittenTokens: '34.6k',
    totalSessions: 42,
    last60Days: [
      {
        date: '2026-11-19',
        label: 'Nov 19',
        fullDate: 'Thu, 19 Nov 2026',
        hours: 3.5,
        durationLabel: '3h 30m',
        sessions: 3,
        tokens: 50000,
        mainCostUsd: 12.34,
        bgCostUsd: 2.50,
        totalCostUsd: 14.84
      }
    ],
    consistencyWeeks: [
      {
        monthLabel: 'Nov',
        days: [
          {
            date: '2026-11-19',
            fullDate: 'Thu, 19 Nov 2026',
            hours: 3.5,
            durationLabel: '3h 30m',
            sessions: 3,
            tokens: 50000,
            totalCostUsd: 14.84,
            level: 3,
            isFuture: false
          }
        ]
      }
    ],
    costByModel: [
      {
        name: 'Gemini 4 Argon',
        costUsd: 1000,
        exactCostUsd: 1000.50,
        displayCost: '$1,001',
        exactDisplayCost: '$1,000.50',
        pctOfTotal: 81.0,
        pctOfMax: 100,
        tokens: 800000,
        uncachedInput: 600000,
        cacheRead: 150000,
        output: 50000,
        inputPerM: 15,
        cacheReadPerM: 1.5,
        outputPerM: 75,
        isTop: true
      }
    ]
  };

  const html = renderPitWallModalHtml(sample);

  assert.ok(html.includes('Last 20 weeks. Brighter blue means more hours.'), 'Must have truthful consistency subtitle');
  assert.ok(html.includes('id="antigravity-pit-wall-tooltip"'), 'Must render #antigravity-pit-wall-tooltip');
  assert.ok(html.includes('popover="manual"'), 'Tooltip must use popover="manual"');
  assert.ok(html.includes('$1,234.56'), 'Must include exact 2-decimal USD');
  assert.ok(html.includes('1,234,567'), 'Must format exact total tokens');
  assert.ok(html.includes('data-pw-tip='), 'Must emit data-pw-tip attributes');

  assert.ok(!html.includes('class="pit-wall-bar-col" title='), 'Must remove native title on bar-col');
  assert.ok(!html.includes('class="pit-wall-heat-cell" title='), 'Must remove native title on heat-cell');
  assert.ok(!html.includes('class="pit-wall-model-name" title='), 'Must remove native title on model-name');

  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(html), false, 'Modal HTML must not contain emojis');
});
