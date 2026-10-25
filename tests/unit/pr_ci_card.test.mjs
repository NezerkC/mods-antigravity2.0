import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPrCiCardHtml } from '../../mods/git-graph/components/PrCiCardHtml.js';

test('renderPrCiCardHtml - renders active PR header with passing CI/CD badge and checks', () => {
  const pr = {
    number: 19,
    title: 'feat(vcs): implement git and github ci suite',
    headRef: 'feat/vcs-suite',
    baseRef: 'main',
    url: 'https://github.com/NezerkC/mods/pull/19',
    state: 'OPEN',
    author: 'NezerkC',
    checks: [
      {
        name: 'Run Unit Tests (20.x)',
        workflowName: 'Continuous Integration',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        detailsUrl: 'https://github.com/NezerkC/mods/actions/runs/1/job/1'
      },
      {
        name: 'Lint & Format',
        workflowName: 'Continuous Integration',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        detailsUrl: 'https://github.com/NezerkC/mods/actions/runs/1/job/2'
      }
    ],
    checksSummary: {
      total: 2,
      success: 2,
      failure: 0,
      pending: 0,
      status: 'SUCCESS'
    }
  };

  const html = renderPrCiCardHtml(pr, { branch: 'feat/vcs-suite', isClean: true });

  assert.ok(html.includes('#19'));
  assert.ok(html.includes('feat(vcs): implement git and github ci suite'));
  assert.ok(html.includes('ci-status-success'));
  assert.ok(html.includes('✔ CI Passing (2/2)'));
  assert.ok(html.includes('Run Unit Tests (20.x)'));
});

test('renderPrCiCardHtml - escapes malicious XSS payloads in PR title and checks', () => {
  const xssPr = {
    number: 99,
    title: '<script>alert("xss")</script>',
    headRef: 'fix/<img src=x onerror=alert(1)>',
    baseRef: 'main',
    url: 'https://github.com/NezerkC/mods/pull/99',
    state: 'OPEN',
    author: '<script>alert(1)</script>',
    checks: [
      {
        name: '<b onmouseover=alert(1)>Check</b>',
        workflowName: 'CI',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        detailsUrl: '#'
      }
    ],
    checksSummary: { total: 1, success: 1, failure: 0, pending: 0, status: 'SUCCESS' }
  };

  const html = renderPrCiCardHtml(xssPr);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
});

test('renderPrCiCardHtml - renders clean fallback when no active PR exists', () => {
  const html = renderPrCiCardHtml(null, { branch: 'feat/my-branch', ahead: 2, behind: 0 });
  assert.ok(html.includes('git-pr-none'));
  assert.ok(html.includes('Sin PR activo en esta rama'));
  assert.ok(html.includes('2 ahead'));
});
