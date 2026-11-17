// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

import http from 'node:http';
import { CdpWebSocketClient } from '../framework/core/CdpWebSocketClient.js';
import { CdpPortResolver } from '../framework/core/CdpPortResolver.js';

async function verify() {
  const port = 52742;
  const client = new CdpWebSocketClient({ port });

  console.log('1. Connecting to live Antigravity CDP client on port', port);

  // 2. Click #antigravity-model-slot-builder and inspect portal DOM
  const evalScript = `
    (() => {
      const btn = document.querySelector('#antigravity-model-slot-builder');
      if (!btn) return { error: '#antigravity-model-slot-builder not found in DOM' };

      // Click the builder slot button
      btn.click();

      const portal = document.querySelector('#antigravity-model-slot-dropdown-portal');
      if (!portal) return { error: '#antigravity-model-slot-dropdown-portal not found in DOM' };

      const isOpen = portal.classList.contains('open');

      // Get all base model rows
      const rows = Array.from(portal.querySelectorAll('.model-slot-row')).map(row => {
        const nameEl = row.querySelector('.model-slot-row-name');
        const badgeEl = row.querySelector('.model-slot-active-badge');
        const chevronEl = row.querySelector('.model-slot-chevron');
        const submenu = row.querySelector('.model-slot-submenu');
        const efforts = submenu ? Array.from(submenu.querySelectorAll('.model-effort-option')).map(opt => ({
          modelId: opt.getAttribute('data-model-id'),
          label: opt.querySelector('.model-effort-name')?.textContent?.trim() || '',
          isActive: opt.classList.contains('active'),
          check: opt.querySelector('.model-effort-check')?.textContent?.trim() || ''
        })) : [];

        return {
          baseModel: row.getAttribute('data-base-model') || nameEl?.textContent?.trim() || '',
          isActive: row.classList.contains('active'),
          activeBadge: badgeEl?.textContent?.trim() || null,
          hasChevron: Boolean(chevronEl),
          efforts
        };
      });

      // Strict emoji check across portal innerHTML
      const emojiRegex = /[\\u{1F300}-\\u{1F9FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}\\u{1F1E6}-\\u{1F1FF}\\u{1F600}-\\u{1F64F}\\u{1F680}-\\u{1F6FF}]/u;
      const htmlWithoutCheckmark = portal.innerHTML.replace(/✓/g, '');
      const hasEmojis = emojiRegex.test(htmlWithoutCheckmark);

      // Inspect Hydrogen submenu specifically
      const hydrogenRow = rows.find(r => r.baseModel === 'Gemini 4 Hydrogen');

      return {
        buttonFound: true,
        portalOpen: isOpen,
        totalBaseModels: rows.length,
        baseModelNames: rows.map(r => r.baseModel),
        hydrogenDetails: hydrogenRow,
        allRows: rows,
        hasEmojis,
        portalHtmlLength: portal.innerHTML.length
      };
    })()
  `;

  console.log('2. Evaluating click on #antigravity-model-slot-builder and reading hierarchy...');
  const rawResult = await client.evaluate(evalScript);
  const result = rawResult?.value || rawResult;
  console.log('3. Live CDP Verification Result:');
  console.log(JSON.stringify(result, null, 2));

  if (result.error) {
    throw new Error(result.error);
  }

  // Assertions
  if (!result.portalOpen) throw new Error('Portal is not open!');
  if (result.totalBaseModels !== 7) throw new Error(`Expected 7 base models, got ${result.totalBaseModels}`);
  if (!result.hydrogenDetails) throw new Error('Gemini 4 Hydrogen row not found!');
  const hydrogenEffortLabels = result.hydrogenDetails.efforts.map(e => e.label);
  console.log('   Hydrogen efforts:', hydrogenEffortLabels);
  const expectedLabels = ['Low', 'Medium', 'High', 'XHigh'];
  const labelsMatch = expectedLabels.every(l => hydrogenEffortLabels.includes(l));
  if (!labelsMatch) throw new Error(`Hydrogen efforts do not match expected [Low, Medium, High, XHigh]: ${hydrogenEffortLabels}`);
  if (result.hasEmojis) throw new Error('Portal contains emojis!');

  // 4. Test selecting an effort option and verifying menubar label update
  console.log('4. Testing interactive effort selection...');
  const selectScript = `
    (() => {
      const btn = document.querySelector('#antigravity-model-slot-builder');
      btn.click();
      const medOpt = document.querySelector('.model-effort-option[data-model-id="gemini-4-hydrogen-medium"]');
      if (!medOpt) return { error: 'Medium option not found' };
      medOpt.click();

      const updatedVal = document.querySelector('#antigravity-model-slot-builder .model-slot-value')?.textContent;
      const portalClosed = !document.querySelector('#antigravity-model-slot-dropdown-portal')?.classList.contains('open');

      // Re-select XHigh
      btn.click();
      const xhighOpt = document.querySelector('.model-effort-option[data-model-id="gemini-4-hydrogen-xhigh"]');
      if (xhighOpt) xhighOpt.click();

      const finalVal = document.querySelector('#antigravity-model-slot-builder .model-slot-value')?.textContent;

      return {
        updatedVal,
        portalClosedAfterSelect: portalClosed,
        finalVal
      };
    })()
  `;
  const selectRes = await client.evaluate(selectScript);
  const selectData = selectRes?.value || selectRes;
  console.log('   Selection result:', JSON.stringify(selectData));
  if (selectData.updatedVal !== 'Hydrogen Med') {
    throw new Error(`Expected updated menubar label 'Hydrogen Med', got '${selectData.updatedVal}'`);
  }

  console.log('✅ ALL LIVE CDP VERIFICATIONS PASSED!');
}

verify().catch(err => {
  console.error('❌ CDP Verification failed:', err);
  process.exit(1);
});
