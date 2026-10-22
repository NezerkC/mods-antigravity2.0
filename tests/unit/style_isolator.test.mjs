import test from 'node:test';
import assert from 'node:assert/strict';
import { StyleIsolator } from '../../src/sdk/StyleIsolator.js';

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
