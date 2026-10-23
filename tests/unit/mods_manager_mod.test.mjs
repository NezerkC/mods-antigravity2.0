import test from 'node:test';
import assert from 'node:assert/strict';
import { ModsManagerMod } from '../../mods/mods-manager/index.js';
import { renderModsManagerButton, renderModsManagerPanelHtml } from '../../mods/mods-manager/components/ModsManagerHtml.js';

test('ModsManagerMod - loads correct manifest metadata', () => {
  const mod = new ModsManagerMod();
  assert.equal(mod.manifest.id, 'mods-manager');
  assert.equal(mod.manifest.slot, 'menubar-actions');
  assert.equal(mod.manifest.priority, 100);
});

test('ModsManagerMod - renders button with mods trigger attributes', () => {
  const mod = new ModsManagerMod();
  const rendered = mod.render({});

  assert.ok(rendered.html);
  assert.ok(rendered.css);
  assert.ok(rendered.html.includes('antigravity-mods-manager-btn'));
  assert.ok(rendered.html.includes('id="antigravity-mods-manager-trigger"'));
  assert.ok(rendered.html.includes('Mods'));
});

test('ModsManagerMod - panel renders cards for all mods and daemon switch', () => {
  const panelHtml = renderModsManagerPanelHtml();
  assert.ok(panelHtml.includes('Antigravity Mods'));
  assert.ok(panelHtml.includes('Tacómetro de Contexto'));
  assert.ok(panelHtml.includes('Selector de Agentes'));
  assert.ok(panelHtml.includes('Auto-Inyección en Background'));
  assert.ok(panelHtml.includes('id="mod-toggle-context-tachometer"'));
  assert.ok(panelHtml.includes('id="mod-toggle-agent-selector"'));
  assert.ok(panelHtml.includes('id="mod-toggle-daemon"'));
  assert.ok(panelHtml.includes('daemon-status-pill'));
});
