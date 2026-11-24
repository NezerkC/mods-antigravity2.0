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
import { SlotManager } from '../../framework/core/SlotManager.js';
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
            if (sel.startsWith('.')) {
              const classes = sel.slice(1).split('.');
              return classes.every(c => node.classList.contains(c));
            }
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

  it('mods/model-slots/styles.css enforces non-clipping menubar group and compact responsive rules', () => {
    const cssPath = path.resolve(process.cwd(), 'mods/model-slots/styles.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('#antigravity-model-slots-group'), 'Must style #antigravity-model-slots-group');
    assert.ok(css.includes('.antigravity-model-slots-group'), 'Must style .antigravity-model-slots-group');
    assert.ok(css.includes('flex-shrink: 0'), 'Must set flex-shrink: 0 to prevent clipping');
    assert.ok(css.includes('white-space: nowrap'), 'Must set white-space: nowrap');
    assert.ok(css.includes('#antigravity-model-slot-planner'), 'Must include #antigravity-model-slot-planner selector');
    assert.ok(css.includes('#antigravity-model-slot-builder'), 'Must include #antigravity-model-slot-builder selector');
    assert.ok(css.includes('padding: 2px 6px'), 'Must include compact padding rule for constrained spaces');
    assert.ok(css.includes('font-size: 11px'), 'Must include compact font-size rule for constrained spaces');
  });
});

describe('ModelSlotsMod - Native Model Selector Synchronization', () => {
  it('ModLoader injection payload exposes __syncNativeModelSelector and reverse sync helpers', () => {
    const loader = new ModLoader();
    const script = loader.buildInjectionPayload({});

    assert.doesNotThrow(() => new Function(script));
    assert.ok(script.includes('__syncNativeModelSelector'), 'Payload must define __syncNativeModelSelector');
    assert.ok(script.includes('__resolveNativeModelTarget'), 'Payload must define __resolveNativeModelTarget');
    assert.ok(script.includes('__resolveModelIdFromNativeText'), 'Payload must define __resolveModelIdFromNativeText');
    assert.ok(script.includes('__observeNativeModelSelector'), 'Payload must define __observeNativeModelSelector');
    assert.ok(script.includes('__syncPlannerFromNativeSelector'), 'Payload must define __syncPlannerFromNativeSelector');
  });

  it('__syncNativeModelSelector resolves all 7 families, short-circuits matching text, and drives native menu/submenu clicks', async () => {
    const loader = new ModLoader();
    const script = loader.buildInjectionPayload({});

    function createNativeMockEl(tag, attrs = {}, parent = null) {
      const listeners = {};
      const el = {
        tagName: tag.toUpperCase(),
        nodeType: 1,
        attributes: { ...attrs },
        children: [],
        parentElement: parent,
        style: {},
        textContent: '',
        dispatchedEvents: [],
        clickCount: 0,
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
            if (sel === 'button[data-testid="model-selector-trigger"]') {
              return node.tagName === 'BUTTON' && node.getAttribute('data-testid') === 'model-selector-trigger';
            }
            if (sel === '[role="menuitem"]') return node.getAttribute('role') === 'menuitem';
            if (sel === '[data-testid="model-selector-item"]') return node.getAttribute('data-testid') === 'model-selector-item';
            if (sel.startsWith('.antigravity-model-slot-btn[data-slot-role="')) {
              const role = sel.match(/data-slot-role="([^"]+)"/)?.[1];
              return node.classList.contains('antigravity-model-slot-btn') && node.getAttribute('data-slot-role') === role;
            }
            if (sel.startsWith('.')) {
              const classes = sel.slice(1).split('.');
              return classes.every(c => node.classList.contains(c));
            }
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
        addEventListener(evt, fn) {
          listeners[evt] = listeners[evt] || [];
          listeners[evt].push(fn);
        },
        dispatchEvent(evt) {
          this.dispatchedEvents.push(evt.type || String(evt));
          (listeners[evt.type] || []).forEach(fn => fn(evt));
          return true;
        },
        click() {
          this.clickCount++;
          if (typeof this.onclick === 'function') this.onclick();
        }
      };
      return el;
    }

    const head = createNativeMockEl('head');
    const body = createNativeMockEl('body');
    const docEl = createNativeMockEl('html');
    docEl.appendChild(head);
    docEl.appendChild(body);

    // Planner and Builder buttons in menubar
    const plannerBtn = createNativeMockEl('button', { class: 'antigravity-model-slot-btn', 'data-slot-role': 'planner' }, body);
    const plannerDot = createNativeMockEl('span', { class: 'model-slot-dot' }, plannerBtn);
    const plannerVal = createNativeMockEl('span', { class: 'model-slot-value' }, plannerBtn);
    plannerBtn.appendChild(plannerDot);
    plannerBtn.appendChild(plannerVal);
    body.appendChild(plannerBtn);

    const builderBtn = createNativeMockEl('button', { class: 'antigravity-model-slot-btn', 'data-slot-role': 'builder' }, body);
    const builderDot = createNativeMockEl('span', { class: 'model-slot-dot' }, builderBtn);
    const builderVal = createNativeMockEl('span', { class: 'model-slot-value' }, builderBtn);
    builderBtn.appendChild(builderDot);
    builderBtn.appendChild(builderVal);
    body.appendChild(builderBtn);

    // Two native triggers (active one is the last)
    const oldTrigger = createNativeMockEl('button', { 'data-testid': 'model-selector-trigger' }, body);
    oldTrigger.textContent = 'Gemini 4 Argon (High)';
    body.appendChild(oldTrigger);

    const activeTrigger = createNativeMockEl('button', { 'data-testid': 'model-selector-trigger' }, body);
    activeTrigger.textContent = 'Gemini 4 Argon (High)';
    body.appendChild(activeTrigger);

    const menuContainer = createNativeMockEl('div', { class: 'native-menu' }, body);
    body.appendChild(menuContainer);

    const observerRecords = [];
    class MockMutationObserver {
      constructor(cb) {
        this.cb = cb;
      }
      observe(target, opts) {
        observerRecords.push({ instance: this, target, opts });
      }
      disconnect() {}
      trigger() {
        this.cb([]);
      }
    }

    class MockMouseEvent {
      constructor(type, opts = {}) {
        this.type = type;
        this.bubbles = Boolean(opts.bubbles);
      }
    }

    const scheduledTimers = [];
    const clearedTimers = [];
    let nextTimerId = 1;
    const mockSetTimeout = (fn, ms) => {
      const id = nextTimerId++;
      scheduledTimers.push({ id, fn, ms });
      return id;
    };
    const mockClearTimeout = (id) => {
      clearedTimers.push(id);
    };

    const store = new Map();
    const documentMock = {
      head,
      body,
      documentElement: docEl,
      activeElement: body,
      getElementById(id) { return docEl.querySelector(`#${id}`); },
      querySelector(sel) { return docEl.querySelector(sel); },
      querySelectorAll(sel) { return docEl.querySelectorAll(sel); },
      createElement(tag) { return createNativeMockEl(tag); },
      addEventListener() {}
    };
    const windowMock = {
      location: { pathname: '/', search: '' },
      innerWidth: 1280,
      document: documentMock,
      ResizeObserver: class { observe() {} disconnect() {} },
      MutationObserver: MockMutationObserver,
      MouseEvent: MockMouseEvent
    };
    windowMock.window = windowMock;

    const sandbox = vm.createContext({
      window: windowMock,
      document: documentMock,
      MouseEvent: MockMouseEvent,
      localStorage: {
        getItem(k) { return store.has(k) ? store.get(k) : null; },
        setItem(k, v) { store.set(k, String(v)); },
        removeItem(k) { store.delete(k); }
      },
      fetch: () => Promise.resolve({ ok: true, json: async () => ({}) }),
      ResizeObserver: windowMock.ResizeObserver,
      MutationObserver: MockMutationObserver,
      setTimeout: mockSetTimeout,
      clearTimeout: mockClearTimeout,
      setInterval: () => 0,
      clearInterval: () => {}
    });

    vm.runInContext(script, sandbox);

    // 1. Validate mapping table for all 7 families
    assert.deepEqual({ ...windowMock.__resolveNativeModelTarget('gemini-pro-orchestrator-g1-pro') }, { base: 'Orchestrator', effort: null });
    assert.deepEqual({ ...windowMock.__resolveNativeModelTarget('gemini-4-argon-medium') }, { base: 'Gemini 4 Argon', effort: 'Medium' });
    assert.deepEqual({ ...windowMock.__resolveNativeModelTarget('gemini-4-hydrogen-xhigh') }, { base: 'Gemini 4 Hydrogen', effort: 'XHigh' });
    assert.deepEqual({ ...windowMock.__resolveNativeModelTarget('gemini-3.8-flash-low') }, { base: 'Gemini 3.8 Flash', effort: 'Low' });
    assert.deepEqual({ ...windowMock.__resolveNativeModelTarget('claude-opus-5-5-high') }, { base: 'Claude Opus 5.5', effort: 'High' });
    assert.deepEqual({ ...windowMock.__resolveNativeModelTarget('claude-sonnet-5-5-medium') }, { base: 'Claude Sonnet 5.5', effort: 'Medium' });
    assert.deepEqual({ ...windowMock.__resolveNativeModelTarget('gpt-oss-120b-medium') }, { base: 'GPT-OSS 120B', effort: null });

    // 2. Short-circuit when trigger already shows matching base + effort
    assert.equal(windowMock.__syncNativeModelSelector('gemini-4-argon-high'), true);
    assert.equal(activeTrigger.clickCount, 0, 'Must not click trigger when already matching');

    // Must NOT short-circuit High when trigger shows XHigh
    activeTrigger.textContent = 'Gemini 4 Hydrogen (XHigh)';
    scheduledTimers.length = 0;
    windowMock.__syncNativeModelSelector('gemini-4-hydrogen-high');
    assert.equal(activeTrigger.clickCount, 1, 'High must not falsely match XHigh');
    // Flush settle/timers
    while (scheduledTimers.length > 0) {
      const t = scheduledTimers.shift();
      if (!clearedTimers.includes(t.id)) t.fn();
    }

    // 3. Direct click for single-effort model (Orchestrator)
    activeTrigger.textContent = 'Gemini 4 Argon (High)';
    activeTrigger.clickCount = 0;
    oldTrigger.clickCount = 0;
    menuContainer.children = [];
    const orchItem = createNativeMockEl('div', { role: 'menuitem', 'data-model-label': 'Orchestrator (Argon)' }, menuContainer);
    orchItem.textContent = 'Orchestrator (Argon)';
    orchItem.onclick = () => { activeTrigger.textContent = 'Orchestrator (Argon)'; };
    menuContainer.appendChild(orchItem);

    windowMock.__syncNativeModelSelector('gemini-pro-orchestrator-g1-pro');
    assert.equal(activeTrigger.clickCount, 1, 'Must click the last (active) trigger');
    assert.equal(oldTrigger.clickCount, 0, 'Must not click inactive trigger');

    // Run menu-open timeout
    while (scheduledTimers.length > 0) {
      const t = scheduledTimers.shift();
      if (!clearedTimers.includes(t.id)) t.fn();
    }
    assert.equal(orchItem.clickCount, 1, 'Orchestrator row must be clicked directly');
    assert.equal(activeTrigger.textContent, 'Orchestrator (Argon)');

    // 4. Multi-effort flow via __selectModelForSlot('planner', ...)
    menuContainer.children = [];
    const hydroRow = createNativeMockEl('div', { role: 'menuitem' }, menuContainer);
    hydroRow.textContent = 'Gemini 4 Hydrogen';
    const highOpt = createNativeMockEl('div', { role: 'menuitem' }, menuContainer);
    highOpt.textContent = 'High';
    const xhighOpt = createNativeMockEl('div', { role: 'menuitem' }, menuContainer);
    xhighOpt.textContent = 'XHigh';
    xhighOpt.onclick = () => { activeTrigger.textContent = 'Gemini 4 Hydrogen (XHigh)'; };
    menuContainer.appendChild(hydroRow);
    menuContainer.appendChild(highOpt);
    menuContainer.appendChild(xhighOpt);

    activeTrigger.clickCount = 0;
    windowMock.__selectModelForSlot('planner', 'gemini-4-hydrogen-xhigh');
    assert.equal(activeTrigger.clickCount, 1, 'Selecting planner slot must trigger native selector sync');

    // Run step 1 (open menu -> hover/click base row)
    const step1 = scheduledTimers.shift();
    step1.fn();
    assert.ok(hydroRow.dispatchedEvents.includes('mouseenter'), 'Must dispatch mouseenter on base row');
    assert.equal(hydroRow.clickCount, 1, 'Must click base row to open effort submenu');

    // Run step 2 (click XHigh effort item)
    const step2 = scheduledTimers.shift();
    step2.fn();
    assert.equal(xhighOpt.clickCount, 1, 'Must click XHigh effort submenu option');
    assert.equal(highOpt.clickCount, 0, 'Must not click High option');
    assert.equal(activeTrigger.textContent, 'Gemini 4 Hydrogen (XHigh)');

    // Flush settle timer so __nativeModelSyncInProgress clears
    while (scheduledTimers.length > 0) {
      const t = scheduledTimers.shift();
      if (!clearedTimers.includes(t.id)) t.fn();
    }

    // 5. Selecting builder slot must NOT touch native trigger
    const prevTriggerClicks = activeTrigger.clickCount;
    windowMock.__selectModelForSlot('builder', 'claude-sonnet-5-5-low');
    assert.equal(activeTrigger.clickCount, prevTriggerClicks, 'Builder slot must not command native selector');

    // 6. Reverse observation: native UI text mutation updates PLANNER menubar button
    const triggerObserverRec = observerRecords.find(r => r.target === activeTrigger);
    assert.ok(triggerObserverRec, 'MutationObserver must observe native trigger');
    assert.equal(triggerObserverRec.opts.characterData, true, 'Observer must watch characterData');
    assert.equal(triggerObserverRec.opts.childList, true, 'Observer must watch childList');
    assert.equal(triggerObserverRec.opts.subtree, true, 'Observer must watch subtree');

    activeTrigger.textContent = 'Claude Opus 5.5 (Medium)';
    triggerObserverRec.instance.trigger();

    assert.equal(plannerBtn.getAttribute('data-model-id'), 'claude-opus-5-5-medium');
    assert.equal(plannerVal.textContent, 'Opus 5.5 Med');
    const persisted = JSON.parse(store.get('__antigravity_model_slots'));
    assert.equal(persisted.planner, 'claude-opus-5-5-medium');
  });
});

describe('ModelSlotsMod & ModLoader - Single-Toggle & Observer Stabilization', () => {
  function createStabilizationMockEnv(initialContext = {}) {
    const loader = new ModLoader();
    const script = loader.buildInjectionPayload(initialContext);

    function createEl(tag, attrs = {}, parent = null) {
      const listeners = {};
      const el = {
        tagName: tag.toUpperCase(),
        nodeType: 1,
        attributes: { ...attrs },
        children: [],
        parentElement: parent,
        style: {},
        _textContent: '',
        _innerHTML: '',
        _listeners: listeners,
        offsetWidth: 500,
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
        getBoundingClientRect() {
          return { top: 0, left: 100, right: 200, bottom: 28, width: 100, height: 28 };
        },
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
              const roleAttrMatch = s.match(/^\[([a-zA-Z0-9_-]+)="([^"]+)"\]$/);
              if (roleAttrMatch && cur.getAttribute(roleAttrMatch[1]) === roleAttrMatch[2]) return cur;
              const attrMatch = s.match(/^\[([^\]]+)\]$/);
              if (attrMatch && cur.hasAttribute(attrMatch[1])) return cur;
              if (s.startsWith('#') && cur.getAttribute('id') === s.slice(1)) return cur;
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
            if (sel === 'button[data-testid="model-selector-trigger"]') {
              return node.tagName === 'BUTTON' && node.getAttribute('data-testid') === 'model-selector-trigger';
            }
            if (sel === 'g[filter]') return node.tagName === 'G' && node.hasAttribute('filter');
            if (sel === 'polygon') return node.tagName === 'POLYGON';
            if (sel.startsWith('.antigravity-model-slot-btn[data-slot-role="')) {
              const role = sel.match(/data-slot-role="([^"]+)"/)?.[1];
              return node.classList.contains('antigravity-model-slot-btn') && node.getAttribute('data-slot-role') === role;
            }
            if (sel.startsWith('.')) {
              const classes = sel.slice(1).split('.');
              return classes.every(c => node.classList.contains(c));
            }
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
        addEventListener(evt, fn, useCapture = false) {
          listeners[evt] = listeners[evt] || [];
          listeners[evt].push({ fn, useCapture: Boolean(useCapture) });
        }
      };
      Object.defineProperty(el, 'id', {
        configurable: true,
        get() { return this.getAttribute('id') || ''; },
        set(val) { this.setAttribute('id', val); }
      });
      Object.defineProperty(el, 'className', {
        configurable: true,
        get() { return this.getAttribute('class') || ''; },
        set(val) { this.setAttribute('class', val); }
      });
      Object.defineProperty(el, 'textContent', {
        configurable: true,
        get() { return this._textContent; },
        set(val) { this._textContent = String(val); }
      });
      Object.defineProperty(el, 'innerHTML', {
        configurable: true,
        get() { return this._innerHTML; },
        set(val) {
          this._innerHTML = val;
          this.children = [];
          if (val && val.includes('antigravity-subagent-model-pill')) {
            const pill = createEl('span', { id: 'antigravity-subagent-model-pill', class: 'antigravity-subagent-model-pill' }, el);
            const dot = createEl('span', { class: 'subagent-model-dot' }, pill);
            const label = createEl('span', { class: 'subagent-model-label' }, pill);
            const modelIdMatch = val.match(/data-model-id="([^"]+)"/);
            if (modelIdMatch) pill.setAttribute('data-model-id', modelIdMatch[1]);
            const titleMatch = val.match(/title="([^"]+)"/);
            if (titleMatch) pill.setAttribute('title', titleMatch[1]);
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

    const head = createEl('head');
    const body = createEl('body');
    const docEl = createEl('html');
    docEl.appendChild(head);
    docEl.appendChild(body);

    const docListeners = {};
    const store = new Map();
    const observerInstances = [];
    const scheduledTimeouts = [];

    class MockMutationObserver {
      constructor(cb) {
        this.cb = cb;
        this.observeCalls = [];
        this.disconnectCalls = 0;
        observerInstances.push(this);
      }
      observe(target, opts) {
        this.observeCalls.push({ target, opts });
      }
      disconnect() {
        this.disconnectCalls++;
      }
      trigger() {
        this.cb([]);
      }
    }

    const documentMock = {
      head,
      body,
      documentElement: docEl,
      activeElement: body,
      getElementById(id) { return docEl.querySelector(`#${id}`); },
      querySelector(sel) { return docEl.querySelector(sel); },
      querySelectorAll(sel) { return docEl.querySelectorAll(sel); },
      createElement(tag) { return createEl(tag); },
      addEventListener(evt, fn, useCapture = false) {
        docListeners[evt] = docListeners[evt] || [];
        docListeners[evt].push({ fn, useCapture: Boolean(useCapture) });
      },
      removeEventListener(evt, fn, useCapture = false) {
        if (!docListeners[evt]) return;
        const captureFlag = Boolean(useCapture);
        docListeners[evt] = docListeners[evt].filter(
          entry => !(entry.fn === fn && entry.useCapture === captureFlag)
        );
      }
    };

    const windowMock = {
      location: { pathname: '/', search: '' },
      innerWidth: 1280,
      document: documentMock,
      ResizeObserver: class { observe() {} disconnect() {} },
      MutationObserver: MockMutationObserver
    };
    windowMock.window = windowMock;

    function dispatchClick(targetEl) {
      let stopped = false;
      const event = {
        type: 'click',
        target: targetEl,
        currentTarget: targetEl,
        defaultPrevented: false,
        stopPropagation() { stopped = true; },
        preventDefault() { this.defaultPrevented = true; }
      };
      // Capture phase on document
      for (const entry of (docListeners.click || []).filter(l => l.useCapture)) {
        entry.fn(event);
      }
      if (!stopped) {
        // Target phase on target element
        for (const entry of (targetEl._listeners.click || [])) {
          entry.fn(event);
        }
        // Bubble phase on document
        for (const entry of (docListeners.click || []).filter(l => !l.useCapture)) {
          entry.fn(event);
        }
      }
      return event;
    }

    function dispatchKeydown(key) {
      const event = {
        type: 'keydown',
        key,
        target: body,
        stopPropagation() {},
        preventDefault() {}
      };
      for (const entry of (docListeners.keydown || [])) {
        entry.fn(event);
      }
    }

    const sandbox = vm.createContext({
      window: windowMock,
      document: documentMock,
      localStorage: {
        getItem(k) { return store.has(k) ? store.get(k) : null; },
        setItem(k, v) { store.set(k, String(v)); },
        removeItem(k) { store.delete(k); }
      },
      fetch: () => Promise.resolve({ ok: true, json: async () => ({}) }),
      ResizeObserver: windowMock.ResizeObserver,
      MutationObserver: MockMutationObserver,
      setTimeout: (fn, ms) => {
        const entry = { id: scheduledTimeouts.length + 1, fn, ms };
        scheduledTimeouts.push(entry);
        return entry.id;
      },
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {}
    });

    return {
      script,
      createEl,
      body,
      docListeners,
      documentMock,
      windowMock,
      sandbox,
      observerInstances,
      scheduledTimeouts,
      dispatchClick,
      dispatchKeydown
    };
  }

  it('clicking .antigravity-model-slot-btn toggles dropdown portal once without double-firing', () => {
    const env = createStabilizationMockEnv({
      modelSlots: {
        planner: 'gemini-4-argon-high',
        builder: 'gemini-4-hydrogen-high'
      }
    });

    const plannerBtn = env.createEl('button', {
      id: 'antigravity-model-slot-planner',
      class: 'antigravity-model-slot-btn',
      'data-slot-role': 'planner',
      'data-model-id': 'gemini-4-argon-high'
    }, env.body);
    const plannerDot = env.createEl('span', { class: 'model-slot-dot' }, plannerBtn);
    const plannerVal = env.createEl('span', { class: 'model-slot-value' }, plannerBtn);
    plannerVal.textContent = 'Argon High';
    plannerBtn.appendChild(plannerDot);
    plannerBtn.appendChild(plannerVal);
    env.body.appendChild(plannerBtn);

    vm.runInContext(env.script, env.sandbox);

    assert.equal(
      (plannerBtn._listeners.click || []).length,
      0,
      'Must not bind duplicate direct click listener on .antigravity-model-slot-btn'
    );

    const portal = env.documentMock.getElementById('antigravity-model-slot-dropdown-portal');
    assert.equal(portal, null, 'Portal does not need to exist open before first click');

    // Click inside nested child span once -> opens portal
    env.dispatchClick(plannerVal);
    const openedPortal = env.documentMock.getElementById('antigravity-model-slot-dropdown-portal');
    assert.ok(openedPortal, 'Portal must be created on first click');
    assert.equal(openedPortal.classList.contains('open'), true, 'Single click must open portal');
    assert.equal(plannerBtn.classList.contains('open'), true, 'Single click must mark button open');

    // Click same button a second time -> closes portal cleanly
    env.dispatchClick(plannerBtn);
    assert.equal(openedPortal.classList.contains('open'), false, 'Second click must close portal');
    assert.equal(plannerBtn.classList.contains('open'), false, 'Second click must clear button open state');

    // Click again to reopen, then verify Escape closes it
    env.dispatchClick(plannerBtn);
    assert.equal(openedPortal.classList.contains('open'), true, 'Third click must reopen portal');
    env.dispatchKeydown('Escape');
    assert.equal(openedPortal.classList.contains('open'), false, 'Escape must close portal');

    // Click again to reopen, then verify outside click closes it
    env.dispatchClick(plannerBtn);
    assert.equal(openedPortal.classList.contains('open'), true, 'Fourth click must reopen portal');
    env.dispatchClick(env.body);
    assert.equal(openedPortal.classList.contains('open'), false, 'Outside click must close portal');
  });

  it('__syncSubagentModelBadges is idempotent and __observeNativeModelSelector avoids redundant reconnects', () => {
    const env = createStabilizationMockEnv({
      modelSlots: {
        planner: 'gemini-4-argon-high',
        builder: 'gemini-4-hydrogen-high',
        sessions: {
          'conv-stable-1': { planner: 'gemini-4-argon-high', builder: 'claude-opus-5-5-high' }
        }
      }
    });

    const convContainer = env.createEl('div', { 'data-conversation-id': 'conv-stable-1' }, env.body);
    const badge = env.createEl('div', { title: 'Subagent' }, convContainer);
    const selfSpan = env.createEl('span', {}, badge);
    selfSpan.textContent = 'self';
    badge.appendChild(selfSpan);
    convContainer.appendChild(badge);
    env.body.appendChild(convContainer);

    const nativeRow = env.createEl('div', { class: 'flex items-center' }, env.body);
    const nativeTrigger = env.createEl('button', { 'data-testid': 'model-selector-trigger' }, nativeRow);
    nativeTrigger.textContent = 'Gemini 4 Argon (High)';
    const headerSlot = env.createEl('div', { id: 'antigravity-slot-header-actions' }, nativeRow);
    nativeRow.appendChild(nativeTrigger);
    nativeRow.appendChild(headerSlot);
    env.body.appendChild(nativeRow);

    // Ephemeral menu trigger inside [role="menu"] without header slot
    const ephemeralMenu = env.createEl('div', { role: 'menu' }, env.body);
    const ephemeralTrigger = env.createEl('button', { 'data-testid': 'model-selector-trigger' }, ephemeralMenu);
    ephemeralMenu.appendChild(ephemeralTrigger);
    env.body.appendChild(ephemeralMenu);

    vm.runInContext(env.script, env.sandbox);

    const pill = badge.querySelector('.antigravity-subagent-model-pill');
    assert.ok(pill, 'Pill must be mounted on initial sync');
    const label = pill.querySelector('.subagent-model-label');
    const dot = pill.querySelector('.subagent-model-dot');

    let setAttrCount = 0;
    let removeAttrCount = 0;
    let labelWriteCount = 0;
    let pillStyleWrites = 0;
    let dotStyleWrites = 0;

    const origSetAttr = pill.setAttribute.bind(pill);
    pill.setAttribute = (k, v) => { setAttrCount++; return origSetAttr(k, v); };
    const origRemoveAttr = pill.removeAttribute.bind(pill);
    pill.removeAttribute = (k) => { removeAttrCount++; return origRemoveAttr(k); };

    let currentLabelText = label.textContent;
    Object.defineProperty(label, 'textContent', {
      get() { return currentLabelText; },
      set(v) { labelWriteCount++; currentLabelText = String(v); }
    });

    pill.style = new Proxy(pill.style, {
      set(target, prop, val) { pillStyleWrites++; target[prop] = val; return true; }
    });
    dot.style = new Proxy(dot.style, {
      set(target, prop, val) { dotStyleWrites++; target[prop] = val; return true; }
    });

    // Repeated calls with unchanged session model must not mutate DOM
    env.windowMock.__syncSubagentModelBadges();
    env.windowMock.__syncSubagentModelBadges();
    env.windowMock.__syncSubagentModelBadges();

    assert.equal(setAttrCount, 0, 'Must not call pill.setAttribute when model is unchanged');
    assert.equal(removeAttrCount, 0, 'Must not call pill.removeAttribute when model is unchanged');
    assert.equal(labelWriteCount, 0, 'Must not rewrite label.textContent when model is unchanged');
    assert.equal(pillStyleWrites, 0, 'Must not rewrite pill.style when model is unchanged');
    assert.equal(dotStyleWrites, 0, 'Must not rewrite dot.style when model is unchanged');

    // __observeNativeModelSelector must not disconnect and re-observe unchanged triggers
    const nativeObserver = env.observerInstances.find(obs =>
      obs.observeCalls.some(c => c.target === nativeTrigger)
    );
    assert.ok(nativeObserver, 'Native trigger observer must exist');
    const initialObserveCalls = nativeObserver.observeCalls.length;
    const initialDisconnects = nativeObserver.disconnectCalls;

    env.windowMock.__observeNativeModelSelector();
    env.windowMock.__observeNativeModelSelector();

    assert.equal(nativeObserver.observeCalls.length, initialObserveCalls, 'Must not re-observe unchanged triggers');
    assert.equal(nativeObserver.disconnectCalls, initialDisconnects, 'Must not disconnect unchanged triggers');

    // Main mod observer must ignore ephemeral [role="menu"] trigger and not re-run mountAllMods
    const modObserver = env.observerInstances.find(obs =>
      obs.observeCalls.some(c => c.target === env.body)
    );
    assert.ok(modObserver, 'Mod body observer must exist');

    let mountCount = 0;
    const origMount = env.windowMock.__antigravityMountAll;
    let updateTelemetryCalls = 0;
    const origUpdateTelemetry = env.windowMock.__updateAntigravityTelemetry;
    env.windowMock.__updateAntigravityTelemetry = (...args) => {
      updateTelemetryCalls++;
      return origUpdateTelemetry(...args);
    };

    modObserver.trigger();
    while (env.scheduledTimeouts.length > 0) {
      const t = env.scheduledTimeouts.shift();
      t.fn();
    }

    assert.equal(
      updateTelemetryCalls,
      0,
      'Opening ephemeral [role="menu"] trigger must not trigger mountAllMods / telemetry overwrite'
    );
  });

  it('tachometer telemetry is not overwritten by stale initial snapshot after live updates', () => {
    const staleSnapshot = {
      estTokens: 0,
      pct: '0.0',
      displayTokens: '0',
      steps: 0
    };
    const env = createStabilizationMockEnv({
      telemetry: staleSnapshot,
      allMetrics: {}
    });

    const convEl = env.createEl('div', { 'data-cascade-id': 'conv-live-1' }, env.body);
    const tachBadge = env.createEl('div', {
      id: 'antigravity-tachometer-badge',
      class: 'antigravity-tachometer-badge',
      title: 'Context: 0 tokens (0.0%)'
    }, convEl);
    const tokenSpan = env.createEl('span', { class: 'tachometer-tokens' }, tachBadge);
    tokenSpan.textContent = '0';
    const pctSpan = env.createEl('span', { class: 'tachometer-pct' }, tachBadge);
    pctSpan.textContent = '(0.0%)';
    const needleG = env.createEl('g', { filter: 'url(#glow)' }, tachBadge);
    const needlePoly = env.createEl('polygon', { fill: '#22c55e' }, needleG);
    needleG.appendChild(needlePoly);
    tachBadge.appendChild(tokenSpan);
    tachBadge.appendChild(pctSpan);
    tachBadge.appendChild(needleG);
    convEl.appendChild(tachBadge);
    env.body.appendChild(convEl);

    vm.runInContext(env.script, env.sandbox);

    assert.equal(tokenSpan.textContent, '0');
    assert.equal(pctSpan.textContent, '(0.0%)');
    assert.equal(env.windowMock.__antigravityLiveTelemetryReceived, false);

    // Simulate live telemetry push from ModDaemon.refreshTelemetry
    const liveMetric = {
      estTokens: 64200,
      pct: '6.4',
      displayTokens: '64.2k',
      steps: 18
    };
    env.windowMock.__antigravityAllMetrics = { 'conv-live-1': liveMetric };
    env.windowMock.__antigravityLatestMetric = liveMetric;
    env.windowMock.__updateAntigravityTelemetry();

    assert.equal(env.windowMock.__antigravityLiveTelemetryReceived, true, 'Live update must mark live telemetry flag');
    assert.equal(tokenSpan.textContent, '64.2k');
    assert.equal(pctSpan.textContent, '(6.4%)');

    // Re-mounting mods or calling __updateAntigravityTelemetry with initial snapshot must NOT overwrite live metrics
    env.windowMock.__antigravityMountAll();
    env.windowMock.__updateAntigravityTelemetry(staleSnapshot, true);

    assert.equal(tokenSpan.textContent, '64.2k', 'Live token count must not revert to stale snapshot');
    assert.equal(pctSpan.textContent, '(6.4%)', 'Live percentage must not revert to stale snapshot');
  });

  it('re-executing ModLoader injection script replaces global handlers without duplicates and keeps toggle working', () => {
    const env = createStabilizationMockEnv({
      modelSlots: {
        planner: 'gemini-4-argon-high',
        builder: 'gemini-4-hydrogen-high'
      }
    });

    const plannerBtn = env.createEl('button', {
      id: 'antigravity-model-slot-planner',
      class: 'antigravity-model-slot-btn',
      'data-slot-role': 'planner',
      'data-model-id': 'gemini-4-argon-high'
    }, env.body);
    const plannerDot = env.createEl('span', { class: 'model-slot-dot' }, plannerBtn);
    const plannerVal = env.createEl('span', { class: 'model-slot-value' }, plannerBtn);
    plannerVal.textContent = 'Argon High';
    plannerBtn.appendChild(plannerDot);
    plannerBtn.appendChild(plannerVal);
    env.body.appendChild(plannerBtn);

    // First injection
    vm.runInContext(env.script, env.sandbox);
    const firstClickHandler = env.windowMock.__antigravityDocClickHandler;
    const firstKeydownHandler = env.windowMock.__antigravityDocKeydownHandler;
    const firstFocusinHandler = env.windowMock.__antigravityDocFocusinHandler;

    assert.equal(typeof firstClickHandler, 'function');
    assert.equal(typeof firstKeydownHandler, 'function');
    assert.equal(typeof firstFocusinHandler, 'function');
    assert.equal(env.windowMock.__antigravityGlobalEventsBound, true);
    assert.equal((env.docListeners.click || []).length, 1);
    assert.equal((env.docListeners.keydown || []).length, 1);
    assert.equal((env.docListeners.focusin || []).length, 1);

    // Re-inject updated payload into the same open window context (hot-reload)
    const loader2 = new ModLoader();
    const script2 = loader2.buildInjectionPayload({
      modelSlots: {
        planner: 'claude-opus-5-5-high',
        builder: 'gemini-4-hydrogen-high'
      }
    });
    vm.runInContext(script2, env.sandbox);

    assert.notEqual(env.windowMock.__antigravityDocClickHandler, firstClickHandler, 'Click handler must be refreshed');
    assert.notEqual(env.windowMock.__antigravityDocKeydownHandler, firstKeydownHandler, 'Keydown handler must be refreshed');
    assert.notEqual(env.windowMock.__antigravityDocFocusinHandler, firstFocusinHandler, 'Focusin handler must be refreshed');
    assert.equal((env.docListeners.click || []).length, 1, 'Re-injection must not duplicate document click listeners');
    assert.equal((env.docListeners.keydown || []).length, 1, 'Re-injection must not duplicate document keydown listeners');
    assert.equal((env.docListeners.focusin || []).length, 1, 'Re-injection must not duplicate document focusin listeners');

    // Verify single-click opens and second-click closes after re-injection
    env.dispatchClick(plannerVal);
    const portal = env.documentMock.getElementById('antigravity-model-slot-dropdown-portal');
    assert.ok(portal, 'Portal must exist after click');
    assert.equal(portal.classList.contains('open'), true, 'Single click after hot-reload must open portal');
    assert.equal(plannerBtn.classList.contains('open'), true);

    env.dispatchClick(plannerBtn);
    assert.equal(portal.classList.contains('open'), false, 'Second click after hot-reload must close portal');
    assert.equal(plannerBtn.classList.contains('open'), false);
  });

  it('mods/model-slots/styles.css uses stationary hover transitions and no-drag rules', () => {
    const cssPath = path.resolve(process.cwd(), 'mods/model-slots/styles.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    const btnBlockMatch = css.match(/\.antigravity-model-slot-btn\s*\{[\s\S]*?\}/);
    assert.ok(btnBlockMatch, 'Must define .antigravity-model-slot-btn rule');
    const btnBlock = btnBlockMatch[0];

    assert.equal(/transition\s*:\s*all\b/.test(btnBlock), false, '.antigravity-model-slot-btn must not use transition: all');
    assert.ok(
      btnBlock.includes('transition: background-color 0.12s ease, border-color 0.12s ease !important;'),
      '.antigravity-model-slot-btn must transition only background-color and border-color'
    );
    assert.ok(btnBlock.includes('transform: none !important;'), '.antigravity-model-slot-btn must enforce transform: none');
    assert.ok(btnBlock.includes('-webkit-app-region: no-drag !important;'), '.antigravity-model-slot-btn must enforce -webkit-app-region: no-drag');
    assert.ok(btnBlock.includes('app-region: no-drag !important;'), '.antigravity-model-slot-btn must enforce app-region: no-drag');

    const hoverBlockMatch = css.match(/\.antigravity-model-slot-btn:hover\s*\{[\s\S]*?\}/);
    assert.ok(hoverBlockMatch, 'Must define .antigravity-model-slot-btn:hover rule');
    const hoverBlock = hoverBlockMatch[0];
    assert.ok(hoverBlock.includes('transform: none !important;'), '.antigravity-model-slot-btn:hover must enforce transform: none');
    assert.ok(hoverBlock.includes('-webkit-app-region: no-drag !important;'), '.antigravity-model-slot-btn:hover must enforce -webkit-app-region: no-drag');
    assert.ok(hoverBlock.includes('app-region: no-drag !important;'), '.antigravity-model-slot-btn:hover must enforce app-region: no-drag');
  });

  it('SlotManager.generateMountSnippet for menubar-actions/model-slots is idempotent and preserves <button> node reference across re-mounts', () => {
    const html = renderModelSlotsMenubarHtml(DEFAULT_MODEL_SLOTS);
    const snippet = SlotManager.generateMountSnippet('menubar-actions', 'model-slots', html);
    const expectedSig = SlotManager.computeHtmlSignature(html);

    let modInnerHtmlWrites = 0;
    let dataVersionWrites = 0;

    function createMockDomNode(tag, attrs = {}, parent = null) {
      const listeners = {};
      const style = {
        setProperty(k, v) { this[k] = v; }
      };
      const node = {
        tagName: tag.toUpperCase(),
        nodeType: 1,
        attributes: { ...attrs },
        children: [],
        parentElement: parent,
        style,
        classList: {
          _set: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
          add(c) { this._set.add(c); node.attributes.class = Array.from(this._set).join(' '); },
          remove(c) { this._set.delete(c); node.attributes.class = Array.from(this._set).join(' '); },
          contains(c) { return this._set.has(c); }
        },
        _innerHTML: '',
        setAttribute(k, v) {
          if (this.attributes.id === 'antigravity-mod-model-slots' && k === 'data-version') {
            dataVersionWrites++;
          }
          this.attributes[k] = String(v);
          if (k === 'class') {
            this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
          }
        },
        getAttribute(k) {
          return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
        },
        hasAttribute(k) {
          return Object.prototype.hasOwnProperty.call(this.attributes, k);
        },
        appendChild(child) {
          child.parentElement = this;
          this.children.push(child);
          return child;
        },
        remove() {
          if (this.parentElement) {
            this.parentElement.children = this.parentElement.children.filter(c => c !== this);
            this.parentElement = null;
          }
        },
        querySelectorAll(selector) {
          const results = [];
          const matchSingle = (el, sel) => {
            if (sel === '.shrink-0 > .bg-sidebar') {
              return el.classList.contains('bg-sidebar') && el.parentElement && el.parentElement.classList.contains('shrink-0');
            }
            if (sel.startsWith('#')) {
              return el.getAttribute('id') === sel.slice(1);
            }
            if (sel.startsWith('.')) {
              return sel.slice(1).split('.').every(c => el.classList.contains(c));
            }
            if (sel === 'button') {
              return el.tagName === 'BUTTON';
            }
            return false;
          };
          const walk = (cur) => {
            for (const child of cur.children) {
              if (matchSingle(child, selector)) results.push(child);
              walk(child);
            }
          };
          walk(this);
          return results;
        },
        querySelector(selector) {
          return this.querySelectorAll(selector)[0] || null;
        },
        addEventListener(evt, fn) {
          listeners[evt] = listeners[evt] || [];
          listeners[evt].push(fn);
        }
      };

      Object.defineProperty(node, 'id', {
        get() { return this.getAttribute('id') || ''; },
        set(val) { this.setAttribute('id', val); }
      });
      Object.defineProperty(node, 'className', {
        get() { return this.getAttribute('class') || ''; },
        set(val) { this.setAttribute('class', val); }
      });
      Object.defineProperty(node, 'firstElementChild', {
        get() { return this.children[0] || null; }
      });
      Object.defineProperty(node, 'innerHTML', {
        get() { return this._innerHTML; },
        set(val) {
          if (this.getAttribute('id') === 'antigravity-mod-model-slots') {
            modInnerHtmlWrites++;
          }
          this._innerHTML = String(val);
          this.children = [];
          if (this._innerHTML.includes('antigravity-model-slot-planner')) {
            const group = createMockDomNode('div', { class: 'antigravity-model-slots-group' }, this);
            const plannerBtn = createMockDomNode('button', {
              id: 'antigravity-model-slot-planner',
              class: 'antigravity-model-slot-btn',
              'data-slot-role': 'planner'
            }, group);
            const builderBtn = createMockDomNode('button', {
              id: 'antigravity-model-slot-builder',
              class: 'antigravity-model-slot-btn',
              'data-slot-role': 'builder'
            }, group);
            group.appendChild(plannerBtn);
            group.appendChild(builderBtn);
            this.children.push(group);
          }
        }
      });
      return node;
    }

    const docEl = createMockDomNode('html');
    const body = createMockDomNode('body', {}, docEl);
    const shrinkWrapper = createMockDomNode('div', { class: 'shrink-0' }, body);
    const sidebar = createMockDomNode('div', { class: 'bg-sidebar' }, shrinkWrapper);
    shrinkWrapper.appendChild(sidebar);
    body.appendChild(shrinkWrapper);
    docEl.appendChild(body);

    const documentMock = {
      body,
      documentElement: docEl,
      createElement(tag) { return createMockDomNode(tag); },
      querySelector(sel) { return docEl.querySelector(sel); },
      querySelectorAll(sel) { return docEl.querySelectorAll(sel); }
    };

    const sandbox = vm.createContext({
      document: documentMock,
      Array
    });

    // First mount: creates slot container, modNode, and populates innerHTML once
    vm.runInContext(snippet, sandbox);

    const slotContainer = sidebar.querySelector('#antigravity-slot-menubar-actions');
    assert.ok(slotContainer, 'Slot container must be created inside .shrink-0 > .bg-sidebar');
    const modNode = slotContainer.querySelector('#antigravity-mod-model-slots');
    assert.ok(modNode, 'Mod node must be created inside slot container');
    assert.equal(modNode.getAttribute('data-version'), '2');
    assert.equal(modNode.getAttribute('data-sig'), expectedSig);
    assert.equal(modInnerHtmlWrites, 1, 'First mount (existing containers + anchors pass) must set innerHTML exactly once');
    assert.equal(dataVersionWrites, 1, 'First mount must set data-version exactly once');

    const plannerBtnFirst = modNode.querySelector('#antigravity-model-slot-planner');
    const builderBtnFirst = modNode.querySelector('#antigravity-model-slot-builder');
    assert.ok(plannerBtnFirst, 'Planner <button> must exist after first mount');
    assert.ok(builderBtnFirst, 'Builder <button> must exist after first mount');

    // Second mount (re-mount with identical HTML): must NOT touch innerHTML or recreate buttons
    vm.runInContext(snippet, sandbox);

    assert.equal(modInnerHtmlWrites, 1, 'Re-mounting identical HTML must NOT overwrite modNode.innerHTML');
    assert.equal(dataVersionWrites, 1, 'Re-mounting must NOT rewrite data-version attribute');

    const plannerBtnSecond = modNode.querySelector('#antigravity-model-slot-planner');
    const builderBtnSecond = modNode.querySelector('#antigravity-model-slot-builder');
    assert.strictEqual(plannerBtnSecond, plannerBtnFirst, 'Planner <button> DOM node reference must be preserved across re-mounts');
    assert.strictEqual(builderBtnSecond, builderBtnFirst, 'Builder <button> DOM node reference must be preserved across re-mounts');
  });

  it('ModLoader __antigravityModObserver guards mountAllMods with __antigravityIsMountingMods and ignores internal mod mutations', () => {
    const env = createStabilizationMockEnv({
      modelSlots: {
        planner: 'gemini-4-argon-high',
        builder: 'gemini-4-hydrogen-high'
      }
    });

    const shrinkWrapper = env.createEl('div', { class: 'shrink-0' }, env.body);
    const sidebar = env.createEl('div', { class: 'bg-sidebar' }, shrinkWrapper);
    const menubarSlot = env.createEl('div', {
      id: 'antigravity-slot-menubar-actions',
      class: 'antigravity-slot-container antigravity-slot-menubar-actions'
    }, sidebar);
    const modelSlotsModNode = env.createEl('div', {
      id: 'antigravity-mod-model-slots',
      class: 'antigravity-mod-model-slots'
    }, menubarSlot);
    const innerSpan = env.createEl('span', { class: 'model-slot-value' }, modelSlotsModNode);
    modelSlotsModNode.appendChild(innerSpan);
    menubarSlot.appendChild(modelSlotsModNode);
    sidebar.appendChild(menubarSlot);
    shrinkWrapper.appendChild(sidebar);
    env.body.appendChild(shrinkWrapper);

    // Execute injection payload
    vm.runInContext(env.script, env.sandbox);

    assert.equal(env.windowMock.__antigravityIsMountingMods, false, '__antigravityIsMountingMods must reset to false after mountAllMods finishes');

    const modObserver = env.observerInstances.find(obs =>
      obs.observeCalls.some(c => c.target === env.body)
    );
    assert.ok(modObserver, 'Mod body observer must exist');

    // Mutation strictly inside #antigravity-mod-model-slots must be ignored without scheduling debounce
    const initialTimeouts = env.scheduledTimeouts.length;
    modObserver.cb([{ target: innerSpan }]);
    assert.equal(env.scheduledTimeouts.length, initialTimeouts, 'Internal mod mutation must not schedule mount check');

    // Mutation while __antigravityIsMountingMods is true must be ignored
    env.windowMock.__antigravityIsMountingMods = true;
    modObserver.cb([{ target: env.body }]);
    assert.equal(env.scheduledTimeouts.length, initialTimeouts, 'Mutation while mounting must not schedule mount check');
    env.windowMock.__antigravityIsMountingMods = false;
  });
});
