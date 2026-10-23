import test from 'node:test';
import assert from 'node:assert/strict';
import { ModHost } from '../../framework/core/ModHost.js';
import { AntigravityMod } from '../../framework/sdk/AntigravityMod.js';

class DummyModA extends AntigravityMod {
  constructor() {
    super({
      id: 'dummy-a',
      name: 'Dummy A',
      version: '1.0.0',
      slot: 'header-actions',
      priority: 10
    });
  }
  render() {
    return { html: '<button id="btn-a">A</button>', css: '#btn-a { color: red; }' };
  }
}

class DummyModB extends AntigravityMod {
  constructor() {
    super({
      id: 'dummy-b',
      name: 'Dummy B',
      version: '1.0.0',
      slot: 'header-right',
      priority: 20
    });
  }
  render() {
    return { html: '<span id="span-b">B</span>', css: '#span-b { font-weight: bold; }' };
  }
}

test('ModHost - initializes with mod loader and manages multiple mods', () => {
  const host = new ModHost();
  host.registerMod(new DummyModA());
  host.registerMod(new DummyModB());

  const script = host.compilePayload({});
  assert.ok(script.includes('dummy-a'));
  assert.ok(script.includes('dummy-b'));
  assert.ok(script.includes('#antigravity-mod-dummy-a #btn-a { color: red; }'));
  assert.ok(script.includes('#antigravity-mod-dummy-b #span-b { font-weight: bold; }'));
});
