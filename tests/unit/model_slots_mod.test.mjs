// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';

import {
  BASE_MODELS,
  MODEL_CATALOG,
  DEFAULT_MODEL_SLOTS,
  getModelById,
  renderModelSlotsMenubarHtml,
  renderModelSlotDropdownHtml,
  renderSubagentModelPill
} from '../../mods/model-slots/components/ModelSlotsHtml.js';
import { ModelSlotsMod } from '../../mods/model-slots/index.js';
import { AgentSyncServer } from '../../framework/services/AgentSyncServer.js';
import { createDefaultHost } from '../../framework/core/ModDaemon.js';
import { ModLoader } from '../../framework/core/ModLoader.js';
import { StyleIsolator } from '../../framework/sdk/StyleIsolator.js';

describe('ModelSlotsMod - Catalog Symmetry & Completeness', () => {
  it('BASE_MODELS defines 7 base models with grouped effort levels', () => {
    assert.ok(Array.isArray(BASE_MODELS));
    assert.equal(BASE_MODELS.length, 7, 'Expected 7 base models');

    const expectedNames = [
      'Gemini 4 Argon',
      'Gemini 4 Hydrogen',
      'Gemini 3.8 Flash',
      'Claude Opus 5.5',
      'Claude Sonnet 5.5',
      'GPT-OSS 120B',
      'Orchestrator (Argon)'
    ];

    const names = BASE_MODELS.map(m => m.name);
    assert.deepEqual(names, expectedNames);

    let totalEfforts = 0;
    for (const bm of BASE_MODELS) {
      assert.ok(typeof bm.name === 'string' && bm.name.length > 0);
      assert.ok(typeof bm.family === 'string' && bm.family.length > 0);
      assert.ok(typeof bm.color === 'string' && (bm.color.startsWith('#') || bm.color.startsWith('rgb')));
      assert.ok(Array.isArray(bm.efforts) && bm.efforts.length > 0);

      for (const eff of bm.efforts) {
        assert.ok(typeof eff.id === 'string' && eff.id.length > 0);
        assert.ok(typeof eff.label === 'string' && eff.label.length > 0);
        assert.ok(typeof eff.shortName === 'string' && eff.shortName.length > 0);
        totalEfforts++;
      }
    }

    assert.equal(totalEfforts, 18, 'Expected 18 total effort levels matching MODEL_CATALOG');

    // Hydrogen must support 4 effort levels: Low, Medium, High, XHigh
    const hydrogen = BASE_MODELS.find(m => m.name === 'Gemini 4 Hydrogen');
    assert.ok(hydrogen);
    assert.deepEqual(hydrogen.efforts.map(e => e.label), ['Low', 'Medium', 'High', 'XHigh']);
    assert.deepEqual(hydrogen.efforts.map(e => e.id), [
      'gemini-4-hydrogen-low',
      'gemini-4-hydrogen-medium',
      'gemini-4-hydrogen-high',
      'gemini-4-hydrogen-xhigh'
    ]);
  });

  it('MODEL_CATALOG defines symmetrical properties for all model options', () => {
    assert.ok(Array.isArray(MODEL_CATALOG));
    assert.ok(MODEL_CATALOG.length >= 18, `Expected at least 18 models, found ${MODEL_CATALOG.length}`);

    const ids = new Set();
    for (const m of MODEL_CATALOG) {
      assert.ok(typeof m.id === 'string' && m.id.length > 0, `Model must have non-empty id`);
      assert.ok(typeof m.name === 'string' && m.name.length > 0, `Model ${m.id} must have non-empty name`);
      assert.ok(typeof m.shortName === 'string' && m.shortName.length > 0, `Model ${m.id} must have non-empty shortName`);
      assert.ok(typeof m.family === 'string' && m.family.length > 0, `Model ${m.id} must have non-empty family`);
      assert.ok(typeof m.color === 'string' && (m.color.startsWith('#') || m.color.startsWith('rgb')), `Model ${m.id} must have valid color`);
      assert.ok(!ids.has(m.id), `Duplicate model id detected: ${m.id}`);
      ids.add(m.id);
    }
  });

  it('MODEL_CATALOG contains the required foundational families', () => {
    const ids = MODEL_CATALOG.map(m => m.id);
    assert.ok(ids.includes('gemini-4-argon-high'), 'Missing gemini-4-argon-high');
    assert.ok(ids.includes('gemini-4-hydrogen-high'), 'Missing gemini-4-hydrogen-high');
    assert.ok(ids.includes('gemini-3.8-flash-high'), 'Missing gemini-3.8-flash-high');
    assert.ok(ids.includes('claude-opus-5-5-high'), 'Missing claude-opus-5-5-high');
    assert.ok(ids.includes('claude-sonnet-5-5-high'), 'Missing claude-sonnet-5-5-high');
    assert.ok(ids.includes('gpt-oss-120b-medium'), 'Missing gpt-oss-120b-medium');
    assert.ok(ids.includes('gemini-pro-orchestrator-g1-pro'), 'Missing gemini-pro-orchestrator-g1-pro');
  });

  it('getModelById returns matching model or fallback for unknown id', () => {
    const argon = getModelById('gemini-4-argon-high');
    assert.equal(argon.id, 'gemini-4-argon-high');
    assert.equal(argon.family, 'Argon');

    const hydrogenXHigh = getModelById('gemini-4-hydrogen-xhigh');
    assert.equal(hydrogenXHigh.id, 'gemini-4-hydrogen-xhigh');
    assert.equal(hydrogenXHigh.shortName, 'Hydrogen XHigh');

    const fallback = getModelById('unknown-nonexistent-model');
    assert.ok(fallback);
    assert.equal(fallback.id, MODEL_CATALOG[0].id);
  });

  it('renders symmetrical dropdown catalog options for both planner and builder roles', () => {
    const plannerDropdown = renderModelSlotDropdownHtml('planner', 'gemini-4-argon-high', BASE_MODELS);
    const builderDropdown = renderModelSlotDropdownHtml('builder', 'gemini-4-hydrogen-high', BASE_MODELS);

    assert.ok(plannerDropdown.includes('Select Planner Model'));
    assert.ok(builderDropdown.includes('Select Builder Model'));

    for (const m of MODEL_CATALOG) {
      assert.ok(
        plannerDropdown.includes(`data-model-id="${m.id}"`),
        `Planner dropdown missing option for ${m.id}`
      );
      assert.ok(
        plannerDropdown.includes(`data-slot-role="planner"`),
        `Planner dropdown option missing role attribute for ${m.id}`
      );
      assert.ok(
        builderDropdown.includes(`data-model-id="${m.id}"`),
        `Builder dropdown missing option for ${m.id}`
      );
      assert.ok(
        builderDropdown.includes(`data-slot-role="builder"`),
        `Builder dropdown option missing role attribute for ${m.id}`
      );
    }
  });
});

describe('ModelSlotsMod - Menubar & Hierarchical Dropdown HTML Rendering', () => {
  it('renderModelSlotsMenubarHtml renders dual slot buttons with correct attributes and labels', () => {
    const html = renderModelSlotsMenubarHtml(DEFAULT_MODEL_SLOTS);

    assert.ok(html.includes('antigravity-model-slots-group'));
    assert.ok(html.includes('id="antigravity-model-slot-planner"'));
    assert.ok(html.includes('id="antigravity-model-slot-builder"'));
    assert.ok(html.includes('data-slot-role="planner"'));
    assert.ok(html.includes('data-slot-role="builder"'));
    assert.ok(html.includes(`data-model-id="${DEFAULT_MODEL_SLOTS.planner}"`));
    assert.ok(html.includes(`data-model-id="${DEFAULT_MODEL_SLOTS.builder}"`));
    assert.ok(html.includes('Plan:'));
    assert.ok(html.includes('Build:'));
    assert.ok(html.includes('model-slot-dot'));
    assert.ok(html.includes('model-slot-role'));
    assert.ok(html.includes('model-slot-value'));
    assert.ok(html.includes('model-slot-caret'));
  });

  it('renderModelSlotDropdownHtml renders 7 base model rows with flyouts, effort options, and chevrons', () => {
    const dropdown = renderModelSlotDropdownHtml('builder', 'gemini-4-hydrogen-high', BASE_MODELS);

    // Verify 7 base model rows (exclude row child classes like model-slot-row-left)
    const rowMatches = (dropdown.match(/class="model-slot-row(?:\s+[^"]*)?"/g) || []).filter(c => !c.includes('model-slot-row-'));
    assert.equal(rowMatches.length, 7, 'Expected 7 .model-slot-row elements');

    // Verify chevrons
    const chevronMatches = dropdown.match(/&#8250;/g);
    assert.equal(chevronMatches.length, 7, 'Expected 7 chevron indicators');

    // Verify flyout submenus
    const submenuMatches = dropdown.match(/class="model-slot-submenu"/g);
    assert.equal(submenuMatches.length, 7, 'Expected 7 .model-slot-submenu containers');

    // Verify active row highlight and active badge
    assert.ok(dropdown.includes('class="model-slot-row active"'), 'Expected active class on selected model row');
    assert.ok(dropdown.includes('<span class="model-slot-active-badge">High</span>'), 'Expected active effort badge High');

    // Verify active effort option has active class and checkmark
    assert.match(
      dropdown,
      /class="model-effort-option\s+active"[^>]*data-model-id="gemini-4-hydrogen-high"[\s\S]*?<span class="model-effort-check">✓<\/span>/,
      'Active effort option must have active class and checkmark'
    );

    // Inactive effort options must not have checkmark
    assert.match(
      dropdown,
      /class="model-effort-option"[^>]*data-model-id="gemini-4-hydrogen-low"[\s\S]*?<span class="model-effort-check"><\/span>/,
      'Inactive effort option must not have checkmark'
    );

    // Single-effort model (Orchestrator) has data-model-id on row
    assert.match(
      dropdown,
      /data-model-id="gemini-pro-orchestrator-g1-pro"[^>]*data-base-model="Orchestrator \(Argon\)"/,
      'Single-effort model row must include data-model-id for direct click selection'
    );
  });

  it('renderModelSlotDropdownHtml contains strict zero emojis', () => {
    const plannerDropdown = renderModelSlotDropdownHtml('planner', 'gemini-4-argon-high', BASE_MODELS);
    const builderDropdown = renderModelSlotDropdownHtml('builder', 'gemini-4-hydrogen-xhigh', BASE_MODELS);

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

    // Verify no emojis (excluding the allowed typographic checkmark character ✓)
    assert.equal(emojiRegex.test(plannerDropdown.replace(/✓/g, '')), false, 'Planner dropdown must not contain emojis');
    assert.equal(emojiRegex.test(builderDropdown.replace(/✓/g, '')), false, 'Builder dropdown must not contain emojis');
  });

  it('renderSubagentModelPill renders clean HTML badge without any emojis', () => {
    const pillHtml = renderSubagentModelPill('gemini-4-hydrogen-high', MODEL_CATALOG);

    assert.ok(pillHtml.includes('id="antigravity-subagent-model-pill"'));
    assert.ok(pillHtml.includes('class="antigravity-subagent-model-pill"'));
    assert.ok(pillHtml.includes('data-model-id="gemini-4-hydrogen-high"'));
    assert.ok(pillHtml.includes('title="Subagent Builder Model: Gemini 4 Hydrogen (High)"'));
    assert.ok(pillHtml.includes('class="subagent-model-dot"'));
    assert.ok(pillHtml.includes('class="subagent-model-label"'));
    assert.ok(pillHtml.includes('Hydrogen High'));

    // Verify strict NO EMOJIS constraint
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    assert.equal(emojiRegex.test(pillHtml), false, 'Pill HTML must not contain any emoji characters');

    // Test with Hydrogen XHigh
    const xhighPill = renderSubagentModelPill('gemini-4-hydrogen-xhigh', MODEL_CATALOG);
    assert.ok(xhighPill.includes('data-model-id="gemini-4-hydrogen-xhigh"'));
    assert.ok(xhighPill.includes('Hydrogen XHigh'));
    assert.equal(emojiRegex.test(xhighPill), false, 'Hydrogen XHigh pill must not contain any emoji characters');
  });
});

describe('ModelSlotsMod - Manifest & Component Lifecycle', () => {
  it('loads correct manifest metadata', () => {
    const mod = new ModelSlotsMod();
    assert.equal(mod.manifest.id, 'model-slots');
    assert.equal(mod.manifest.slot, 'menubar-actions');
    assert.equal(mod.manifest.priority, 90);
  });

  it('render() outputs valid html and css', () => {
    const mod = new ModelSlotsMod();
    const rendered = mod.render({});

    assert.ok(rendered.html, 'Rendered object must contain html');
    assert.ok(rendered.css, 'Rendered object must contain css');
    assert.ok(rendered.html.includes('antigravity-model-slots-group'));
    assert.ok(rendered.html.includes('antigravity-model-slot-btn'));
    assert.ok(rendered.css.includes('.antigravity-model-slots-group') || rendered.css.includes('.antigravity-model-slot-btn'));
  });
});

describe('AgentSyncServer - Model Slots State & HTTP Endpoints', () => {
  const tmpDir = path.join(os.tmpdir(), `model-slots-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const modelSlotsPath = path.join(tmpDir, 'model_slots.json');
  const testPort = 53925;
  let server;

  before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    server = new AgentSyncServer({
      port: testPort,
      modelSlotsPath
    });
    await server.start();
  });

  after(async () => {
    if (server) await server.stop();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('readModelSlots returns default configuration when file does not exist', () => {
    const slots = server.readModelSlots();
    assert.equal(slots.planner, 'gemini-4-argon-high');
    assert.equal(slots.builder, 'gemini-4-hydrogen-high');
    assert.equal(slots.enabled, true);
  });

  it('writeModelSlots writes slots atomically to disk', () => {
    server.writeModelSlots({
      planner: 'claude-opus-5-5-high',
      builder: 'claude-sonnet-5-5-high',
      enabled: true
    });

    assert.ok(fs.existsSync(modelSlotsPath));
    const saved = JSON.parse(fs.readFileSync(modelSlotsPath, 'utf-8'));
    assert.equal(saved.planner, 'claude-opus-5-5-high');
    assert.equal(saved.builder, 'claude-sonnet-5-5-high');
  });

  it('updateModelSlots merges patches and persists', () => {
    server.updateModelSlots({ builder: 'gemini-4-hydrogen-xhigh' });
    const current = server.readModelSlots();
    assert.equal(current.planner, 'claude-opus-5-5-high');
    assert.equal(current.builder, 'gemini-4-hydrogen-xhigh');
    assert.ok(current.updatedAt);
  });

  it('handles HTTP GET /model-slots', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/model-slots`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.planner, 'claude-opus-5-5-high');
    assert.equal(data.builder, 'gemini-4-hydrogen-xhigh');
  });

  it('handles HTTP POST /model-slots', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/model-slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planner: 'gemini-3.8-flash-high',
        builder: 'gpt-oss-120b-medium',
        enabled: true
      })
    });

    assert.equal(res.status, 200);
    const resData = await res.json();
    assert.equal(resData.success, true);
    assert.equal(resData.slots.planner, 'gemini-3.8-flash-high');
    assert.equal(resData.slots.builder, 'gpt-oss-120b-medium');

    const onDisk = server.readModelSlots();
    assert.equal(onDisk.planner, 'gemini-3.8-flash-high');
    assert.equal(onDisk.builder, 'gpt-oss-120b-medium');
  });

  it('readSubagentSessionSlots returns null for unknown session and {} when empty', () => {
    assert.equal(server.readSubagentSessionSlots('unknown-session'), null);
    assert.deepEqual(server.readSubagentSessionSlots(), {});
  });

  it('updateSubagentSessionSlots persists per-session slots atomically and preserves global slots', () => {
    const savedA = server.updateSubagentSessionSlots('session-alpha', {
      builder: 'claude-opus-5-5-high'
    });
    assert.equal(savedA.builder, 'claude-opus-5-5-high');
    assert.equal(savedA.planner, 'gemini-3.8-flash-high');
    assert.ok(savedA.updatedAt);

    const savedB = server.updateSubagentSessionSlots('session-beta', {
      planner: 'gemini-4-argon-low',
      builder: 'gemini-4-hydrogen-low'
    });
    assert.equal(savedB.planner, 'gemini-4-argon-low');
    assert.equal(savedB.builder, 'gemini-4-hydrogen-low');

    // Global update must preserve sessions dictionary
    server.updateModelSlots({ builder: 'claude-sonnet-5-5-medium' });
    const allSessions = server.readSubagentSessionSlots();
    assert.equal(allSessions['session-alpha'].builder, 'claude-opus-5-5-high');
    assert.equal(allSessions['session-beta'].builder, 'gemini-4-hydrogen-low');
  });

  it('handles HTTP GET /subagent-model-slots for single session and all sessions map', async () => {
    const singleRes = await fetch(`http://127.0.0.1:${testPort}/subagent-model-slots?sessionId=session-alpha`);
    assert.equal(singleRes.status, 200);
    const singleData = await singleRes.json();
    assert.equal(singleData.builder, 'claude-opus-5-5-high');

    const unknownRes = await fetch(`http://127.0.0.1:${testPort}/subagent-model-slots?sessionId=does-not-exist`);
    assert.equal(unknownRes.status, 200);
    const unknownData = await unknownRes.json();
    assert.equal(unknownData.isDefault, true);
    assert.equal(unknownData.builder, 'claude-sonnet-5-5-medium');

    const allRes = await fetch(`http://127.0.0.1:${testPort}/subagent-model-slots`);
    assert.equal(allRes.status, 200);
    const allData = await allRes.json();
    assert.equal(allData['session-alpha'].builder, 'claude-opus-5-5-high');
    assert.equal(allData['session-beta'].builder, 'gemini-4-hydrogen-low');
  });

  it('handles HTTP POST /subagent-model-slots and validates payload', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/subagent-model-slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-gamma',
        slots: {
          planner: 'gemini-4-argon-high',
          builder: 'gpt-oss-120b-medium'
        }
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.sessionId, 'session-gamma');
    assert.equal(data.slots.builder, 'gpt-oss-120b-medium');

    const persisted = server.readSubagentSessionSlots('session-gamma');
    assert.equal(persisted.builder, 'gpt-oss-120b-medium');

    const badRes = await fetch(`http://127.0.0.1:${testPort}/subagent-model-slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: '', slots: null })
    });
    assert.equal(badRes.status, 400);
  });
});

describe('ModDaemon & ModLoader - Integration', () => {
  it('createDefaultHost registers model-slots mod', () => {
    const host = createDefaultHost();
    const registeredIds = host.getMods().map(m => m.manifest.id);
    assert.ok(
      registeredIds.includes('model-slots'),
      `createDefaultHost must include 'model-slots', found: ${registeredIds.join(', ')}`
    );
  });

  it('ModLoader builds injection payload with model slots helpers and toggles', () => {
    const loader = new ModLoader();
    const script = loader.buildInjectionPayload({});

    assert.doesNotThrow(() => new Function(script), 'Generated client injection payload must be valid JS');
    assert.ok(
      script.includes('__BASE_MODELS'),
      'Script must expose __BASE_MODELS'
    );
    assert.ok(
      script.includes('__toggleModelSlotDropdown'),
      'Script must contain __toggleModelSlotDropdown'
    );
    assert.ok(
      script.includes('__selectModelForSlot'),
      'Script must contain __selectModelForSlot'
    );
    assert.ok(
      script.includes('model-effort-option'),
      'Script must bind click handlers for .model-effort-option'
    );
    assert.ok(
      script.includes('submenu-left'),
      'Script must include submenu-left edge detection'
    );
    assert.ok(
      script.includes('__syncSubagentModelBadges'),
      'Script must contain __syncSubagentModelBadges'
    );
    assert.ok(
      script.includes('__renderSubagentModelPill'),
      'Script must contain __renderSubagentModelPill'
    );
    assert.ok(
      script.includes('__resolveSubagentSessionId'),
      'Script must contain __resolveSubagentSessionId'
    );
    assert.ok(
      script.includes('__getSavedSubagentSessionSlots'),
      'Script must contain __getSavedSubagentSessionSlots'
    );
    assert.ok(
      script.includes('__saveSubagentSessionSlots'),
      'Script must contain __saveSubagentSessionSlots'
    );
    assert.ok(
      script.includes('__antigravity_subagent_model_slots_map'),
      'Script must use __antigravity_subagent_model_slots_map storage key'
    );
    assert.ok(
      script.includes('mod-toggle-model-slots'),
      'Script must contain mod-toggle-model-slots toggle wiring'
    );
  });

  it('ModLoader runtime isolates and syncs per-session subagent badges and menubar Builder slot', () => {
    const loader = new ModLoader();
    const script = loader.buildInjectionPayload({
      modelSlots: {
        planner: 'gemini-4-argon-high',
        builder: 'gemini-4-hydrogen-high',
        sessions: {
          'conv-session-1': { planner: 'gemini-4-argon-high', builder: 'claude-opus-5-5-high' }
        }
      }
    });

    function createMockEl(tag, attrs = {}, parent = null) {
      const el = {
        tagName: tag.toUpperCase(),
        nodeType: 1,
        attributes: { ...attrs },
        children: [],
        parentElement: parent,
        style: {},
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
          if (k === 'class') {
            this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
          }
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
        after(node) {
          if (!this.parentElement) return;
          const idx = this.parentElement.children.indexOf(this);
          node.parentElement = this.parentElement;
          this.parentElement.children.splice(idx + 1, 0, node);
        },
        contains(target) {
          if (target === this) return true;
          return this.children.some(c => c.contains(target));
        },
        closest(selector) {
          const selectors = selector.split(',').map(s => s.trim());
          let cur = this;
          while (cur) {
            for (const s of selectors) {
              const attrMatch = s.match(/^\[([^\]]+)\]$/);
              if (attrMatch && cur.hasAttribute(attrMatch[1])) return cur;
              if (s.startsWith('.') && cur.classList.contains(s.slice(1))) return cur;
            }
            cur = cur.parentElement;
          }
          return null;
        },
        querySelectorAll(selector) {
          const results = [];
          const selectors = selector.split(',').map(s => s.trim());
          const matchSingle = (node, sel) => {
            if (sel === 'span') return node.tagName === 'SPAN';
            if (sel === 'div[title="Subagent"]') return node.tagName === 'DIV' && node.getAttribute('title') === 'Subagent';
            if (sel.startsWith('.antigravity-model-slot-btn[data-slot-role="')) {
              const role = sel.match(/data-slot-role="([^"]+)"/)?.[1];
              return node.classList.contains('antigravity-model-slot-btn') && node.getAttribute('data-slot-role') === role;
            }
            if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
            if (sel.startsWith('#')) return node.getAttribute('id') === sel.slice(1);
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
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
        addEventListener() {}
      };
      Object.defineProperty(el, 'innerHTML', {
        get() { return this._innerHTML; },
        set(val) {
          this._innerHTML = val;
          this.children = [];
          if (val && val.includes('antigravity-subagent-model-pill')) {
            const pill = createMockEl('span', { id: 'antigravity-subagent-model-pill', class: 'antigravity-subagent-model-pill' }, el);
            const dot = createMockEl('span', { class: 'subagent-model-dot' }, pill);
            const label = createMockEl('span', { class: 'subagent-model-label' }, pill);
            const modelIdMatch = val.match(/data-model-id="([^"]+)"/);
            if (modelIdMatch) pill.setAttribute('data-model-id', modelIdMatch[1]);
            const labelMatch = val.match(/<span class="subagent-model-label">([^<]*)<\/span>/);
            if (labelMatch) label.textContent = labelMatch[1];
            pill.appendChild(dot);
            pill.appendChild(label);
            el.children.push(pill);
          }
        }
      });
      Object.defineProperty(el, 'firstElementChild', {
        get() { return this.children[0] || null; }
      });
      return el;
    }

    const head = createMockEl('head');
    const body = createMockEl('body');
    const docEl = createMockEl('html');
    docEl.appendChild(head);
    docEl.appendChild(body);

    // Menubar Builder button
    const builderBtn = createMockEl('button', { class: 'antigravity-model-slot-btn', 'data-slot-role': 'builder' }, body);
    const builderDot = createMockEl('span', { class: 'model-slot-dot' }, builderBtn);
    const builderVal = createMockEl('span', { class: 'model-slot-value' }, builderBtn);
    builderBtn.appendChild(builderDot);
    builderBtn.appendChild(builderVal);
    body.appendChild(builderBtn);

    // Container 1 with explicit data-conversation-id
    const container1 = createMockEl('div', { 'data-conversation-id': 'conv-session-1' }, body);
    const badge1 = createMockEl('div', { title: 'Subagent' }, container1);
    const span1 = createMockEl('span', {}, badge1);
    span1.textContent = 'self';
    badge1.appendChild(span1);
    container1.appendChild(badge1);
    body.appendChild(container1);

    // Container 2 with data-cascade-id
    const container2 = createMockEl('div', { 'data-cascade-id': 'cascade-session-2' }, body);
    const badge2 = createMockEl('div', { title: 'Subagent' }, container2);
    const span2 = createMockEl('span', {}, badge2);
    span2.textContent = 'self';
    badge2.appendChild(span2);
    container2.appendChild(badge2);
    body.appendChild(container2);

    // Container 3 with NO id attribute (should receive stable generated data-subagent-session-id)
    const badge3 = createMockEl('div', { title: 'Subagent' }, body);
    const span3 = createMockEl('span', {}, badge3);
    span3.textContent = 'self';
    badge3.appendChild(span3);
    body.appendChild(badge3);

    const store = new Map();
    const fetchCalls = [];
    const documentMock = {
      head,
      body,
      documentElement: docEl,
      activeElement: badge1,
      getElementById(id) { return docEl.querySelector(`#${id}`); },
      querySelector(sel) { return docEl.querySelector(sel); },
      querySelectorAll(sel) { return docEl.querySelectorAll(sel); },
      createElement(tag) { return createMockEl(tag); },
      addEventListener() {}
    };
    const windowMock = {
      location: { pathname: '/', search: '' },
      innerWidth: 1280,
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
      fetch(url, opts) {
        fetchCalls.push({ url, opts });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      },
      ResizeObserver: windowMock.ResizeObserver,
      MutationObserver: windowMock.MutationObserver,
      setTimeout,
      clearTimeout,
      setInterval: () => 0,
      clearInterval: () => {}
    });

    vm.runInContext(script, sandbox);

    // 1. Session ID resolution checks
    assert.equal(windowMock.__resolveSubagentSessionId(badge1), 'conv-session-1');
    assert.equal(windowMock.__resolveSubagentSessionId(badge2), 'cascade-session-2');
    const generatedId1 = windowMock.__resolveSubagentSessionId(badge3);
    const generatedId2 = windowMock.__resolveSubagentSessionId(badge3);
    assert.ok(generatedId1 && generatedId1.startsWith('subagent-'));
    assert.equal(generatedId1, generatedId2, 'Generated session id must remain stable across calls');
    assert.equal(badge3.getAttribute('data-subagent-session-id'), generatedId1);

    // URL fallback check when element has no container id
    windowMock.location.pathname = '/c/url-path-session';
    const bareEl = createMockEl('div', {});
    assert.equal(windowMock.__resolveSubagentSessionId(bareEl), 'url-path-session');
    windowMock.location.pathname = '/';
    windowMock.location.search = '?conversationId=query-session-99';
    assert.equal(windowMock.__resolveSubagentSessionId(bareEl), 'query-session-99');
    windowMock.location.search = '';

    // 2. Sync badges: badge1 uses server-hydrated Opus 5.5 High, badge2/badge3 initialize with global Hydrogen High
    windowMock.__syncSubagentModelBadges();

    const pill1 = badge1.querySelector('.antigravity-subagent-model-pill');
    const pill2 = badge2.querySelector('.antigravity-subagent-model-pill');
    assert.ok(pill1, 'badge1 must render pill');
    assert.ok(pill2, 'badge2 must render pill');
    assert.equal(pill1.getAttribute('data-session-id'), 'conv-session-1');
    assert.equal(pill1.getAttribute('data-model-id'), 'claude-opus-5-5-high');
    assert.equal(pill1.querySelector('.subagent-model-label').textContent, 'Opus 5.5 High');

    assert.equal(pill2.getAttribute('data-session-id'), 'cascade-session-2');
    assert.equal(pill2.getAttribute('data-model-id'), 'gemini-4-hydrogen-high');
    assert.equal(pill2.querySelector('.subagent-model-label').textContent, 'Hydrogen High');

    // 3. Menubar Builder button must reflect active/focused badge1 (Opus 5.5 High)
    windowMock.__syncModelSlotsUI();
    assert.equal(builderBtn.getAttribute('data-model-id'), 'claude-opus-5-5-high');
    assert.equal(builderVal.textContent, 'Opus 5.5 High');

    // 4. Switching focus to badge2 updates menubar Builder button symmetrically
    documentMock.activeElement = badge2;
    windowMock.__syncModelSlotsUI();
    assert.equal(builderBtn.getAttribute('data-model-id'), 'gemini-4-hydrogen-high');
    assert.equal(builderVal.textContent, 'Hydrogen High');

    // 5. Selecting a model via __selectModelForSlot while badge2 is focused persists to badge2 only
    windowMock.__selectModelForSlot('builder', 'gpt-oss-120b-medium');
    assert.equal(pill2.getAttribute('data-model-id'), 'gpt-oss-120b-medium');
    assert.equal(pill2.querySelector('.subagent-model-label').textContent, 'GPT-OSS 120B');
    assert.equal(pill1.getAttribute('data-model-id'), 'claude-opus-5-5-high', 'badge1 must stay isolated from badge2 change');

    const savedMap = JSON.parse(store.get('__antigravity_subagent_model_slots_map'));
    assert.equal(savedMap['cascade-session-2'].builder, 'gpt-oss-120b-medium');
    assert.equal(windowMock.__getSavedSubagentSessionSlots('conv-session-1').builder, 'claude-opus-5-5-high');
    assert.ok(
      fetchCalls.some(c => c.url === 'http://127.0.0.1:53912/subagent-model-slots' && c.opts.method === 'POST'),
      'Must dispatch POST to /subagent-model-slots'
    );
  });
});

describe('ModelSlotsMod - Style Isolation & Un-scoped Selectors', () => {
  it('StyleIsolator preserves un-scoped portal and subagent classes without root prefix', () => {
    const rawCss = `
      .antigravity-model-slot-btn { display: inline-flex; }
      .antigravity-model-slots-group { display: inline-flex; }
      .model-slot-row { display: flex; }
      .model-slot-submenu { position: absolute; }
      .model-effort-option { display: flex; }
      .antigravity-subagent-model-pill { display: inline-flex; }
      .antigravity-model-slot-dropdown-portal { position: fixed; }
    `;

    const scoped = StyleIsolator.scopeCss(rawCss, '#antigravity-mod-model-slots');

    // Scoped buttons/containers must have the scope prefix
    assert.ok(
      scoped.includes('#antigravity-mod-model-slots .antigravity-model-slot-btn'),
      'Button selector should be prefixed with root scope'
    );
    assert.ok(
      scoped.includes('#antigravity-mod-model-slots .antigravity-model-slots-group'),
      'Group selector should be prefixed with root scope'
    );

    // Un-scoped portal and floating classes must NOT have the scope prefix
    assert.ok(
      !scoped.includes('#antigravity-mod-model-slots .model-slot-row'),
      '.model-slot-row must not be prefixed'
    );
    assert.ok(
      !scoped.includes('#antigravity-mod-model-slots .model-slot-submenu'),
      '.model-slot-submenu must not be prefixed'
    );
    assert.ok(
      !scoped.includes('#antigravity-mod-model-slots .model-effort-option'),
      '.model-effort-option must not be prefixed'
    );
    assert.ok(
      !scoped.includes('#antigravity-mod-model-slots .antigravity-subagent-model-pill'),
      '.antigravity-subagent-model-pill must not be prefixed'
    );
    assert.ok(
      !scoped.includes('#antigravity-mod-model-slots .antigravity-model-slot-dropdown-portal'),
      '.antigravity-model-slot-dropdown-portal must not be prefixed'
    );

    // Raw selectors must still exist in output
    assert.ok(scoped.includes('.model-slot-row {'), '.model-slot-row rule must be present');
    assert.ok(scoped.includes('.model-slot-submenu {'), '.model-slot-submenu rule must be present');
    assert.ok(scoped.includes('.model-effort-option {'), '.model-effort-option rule must be present');
    assert.ok(scoped.includes('.antigravity-subagent-model-pill {'), '.antigravity-subagent-model-pill rule must be present');
    assert.ok(scoped.includes('.antigravity-model-slot-dropdown-portal {'), '.antigravity-model-slot-dropdown-portal rule must be present');
  });
});
