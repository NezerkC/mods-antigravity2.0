import test from 'node:test';
import assert from 'node:assert/strict';
import { StyleIsolator } from '../../framework/sdk/StyleIsolator.js';

test('StyleIsolator - scopes simple class selectors under root container', () => {
  const css = '.badge { background: #000; color: #fff; }';
  const scoped = StyleIsolator.scopeCss(css, '#antigravity-mod-test');
  assert.equal(scoped.trim(), '#antigravity-mod-test .badge { background: #000; color: #fff; }');
});

test('StyleIsolator - scopes multiple comma-separated selectors', () => {
  const css = 'h1, h2, .subheading { font-size: 14px; }';
  const scoped = StyleIsolator.scopeCss(css, '#mod-wrap');
  assert.equal(scoped.trim(), '#mod-wrap h1, #mod-wrap h2, #mod-wrap .subheading { font-size: 14px; }');
});

test('StyleIsolator - handles pseudo-classes cleanly', () => {
  const css = 'button:hover { opacity: 0.8; }';
  const scoped = StyleIsolator.scopeCss(css, '#scope');
  assert.equal(scoped.trim(), '#scope button:hover { opacity: 0.8; }');
});

test('StyleIsolator - preserves keyframes animation blocks', () => {
  const css = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.spinner { animation: spin 1s infinite; }
  `;
  const scoped = StyleIsolator.scopeCss(css, '#scope');
  assert.ok(scoped.includes('@keyframes spin'));
  assert.ok(scoped.includes('0% { transform: rotate(0deg); }'));
  assert.ok(scoped.includes('#scope .spinner { animation: spin 1s infinite; }'));
});

test('StyleIsolator - preserves portal and mod component selectors without root prefix', () => {
  const css = `
    .antigravity-mods-manager-portal { display: block; }
    .mod-card { background: #111; }
    .mods-manager-header { display: flex; }
    .mod-switch input:checked + .mod-slider { background: #7aa2f7; }
  `;
  const scoped = StyleIsolator.scopeCss(css, '#antigravity-mod-mods-manager');
  assert.ok(scoped.includes('.antigravity-mods-manager-portal { display: block; }'));
  assert.ok(scoped.includes('.mod-card { background: #111; }'));
  assert.ok(scoped.includes('.mods-manager-header { display: flex; }'));
  assert.ok(scoped.includes('.mod-switch input:checked + .mod-slider { background: #7aa2f7; }'));
  assert.ok(!scoped.includes('#antigravity-mod-mods-manager .mod-card'));
});

test('StyleIsolator - recursively scopes rules inside @media blocks and allows [data-mod-portal]', () => {
  const css = `
    [data-mod-portal="custom"] .panel { color: #fff; }
    @media (max-width: 640px) {
      .badge, .chip:hover { font-size: 11px; }
      [data-mod-portal] { width: 100%; }
    }
    @keyframes pulse {
      0% { opacity: 0.5; }
      100% { opacity: 1; }
    }
  `;
  const scoped = StyleIsolator.scopeCss(css, '#antigravity-mod-demo');
  assert.ok(scoped.includes('@media (max-width: 640px)'), 'Must keep @media wrapper');
  assert.ok(scoped.includes('#antigravity-mod-demo .badge, #antigravity-mod-demo .chip:hover'), 'Must scope inner @media selectors recursively');
  assert.ok(scoped.includes('[data-mod-portal] { width: 100%; }'), 'Must preserve generic [data-mod-portal] selector');
  assert.ok(!scoped.includes('#antigravity-mod-demo [data-mod-portal="custom"]'));
  assert.ok(scoped.includes('0% { opacity: 0.5; }'), 'Must preserve @keyframes keyframes un-prefixed');
});

