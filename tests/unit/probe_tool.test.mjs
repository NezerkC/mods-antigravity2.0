import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDom, inspectCdp, evaluateCode, inspectProcesses } from '../../tools/probe.js';

test('ProbeTool - inspectDom dispatches query and returns evaluated structure', async () => {
  const mockResolver = {
    resolvePort: async () => 53908
  };

  let dispatchedExpression = '';
  const mockCdpClient = {
    evaluate: async (expr) => {
      dispatchedExpression = expr;
      return {
        value: {
          found: true,
          selector: '.test-el',
          tag: 'div',
          appRegion: 'no-drag',
          rect: { x: 10, y: 20, width: 100, height: 30 },
          parents: [],
          children: []
        }
      };
    }
  };

  const res = await inspectDom('.test-el', {
    portResolver: mockResolver,
    cdpClient: mockCdpClient
  });

  assert.equal(res.found, true);
  assert.equal(res.selector, '.test-el');
  assert.equal(res.appRegion, 'no-drag');
  assert.ok(dispatchedExpression.includes('.test-el'));
});

test('ProbeTool - inspectCdp discovers port and reports connectivity status', async () => {
  const mockResolver = {
    resolvePort: async () => 53908,
    probePort: async (port) => port === 53908
  };

  const res = await inspectCdp({
    portResolver: mockResolver
  });

  assert.equal(res.port, 53908);
  assert.equal(res.isAlive, true);
});

test('ProbeTool - evaluateCode dispatches expression directly via CDP', async () => {
  const mockResolver = {
    resolvePort: async () => 53908
  };

  const mockCdpClient = {
    evaluate: async (code) => ({ value: 'test-result' })
  };

  const res = await evaluateCode('document.title', {
    portResolver: mockResolver,
    cdpClient: mockCdpClient
  });

  assert.equal(res.value, 'test-result');
});

test('ProbeTool - inspectProcesses returns an array of tracked processes', () => {
  const procs = inspectProcesses();
  assert.ok(Array.isArray(procs));
  // If running, every entry has a commandLine string
  for (const p of procs) {
    assert.ok(typeof p.commandLine === 'string');
  }
});
